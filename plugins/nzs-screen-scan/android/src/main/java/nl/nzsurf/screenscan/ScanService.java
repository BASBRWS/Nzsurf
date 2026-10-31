package nl.nzsurf.screenscan;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Kijkt mee met het scherm (MediaProjection) terwijl de gebruiker in een andere app scrolt.
 * Elke {@code intervalMs} een beeld; bewaard wordt alleen een beeld dat stilstaat (gelijk aan
 * het vorige) en duidelijk anders is dan het laatst bewaarde, dus één beeld per scrollpositie.
 */
public class ScanService extends Service {
    static final String CHANNEL = "nzs_scan";
    static final int NOTIF_ID = 4711;
    static final int MAX_FRAMES = 40;

    static final List<File> frames = new ArrayList<>();
    static volatile boolean running = false;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler handler;
    private int width, height, intervalMs;
    private int[] lastSig, savedSig;
    private File dir;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if ("stop".equals(intent.getAction())) { shutdown(); return START_NOT_STICKY; }

        startInForeground();
        int resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
        Intent data = intent.getParcelableExtra("data");
        intervalMs = intent.getIntExtra("intervalMs", 1200);
        int targetWidth = intent.getIntExtra("width", 720);

        dir = new File(getCacheDir(), "nzs-scan");
        if (dir.exists()) { File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete(); } else dir.mkdirs();
        synchronized (frames) { frames.clear(); }
        lastSig = null; savedSig = null;

        DisplayMetrics m = new DisplayMetrics();
        ((WindowManager) getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(m);
        float scale = Math.min(1f, targetWidth / (float) m.widthPixels);
        width = Math.max(1, Math.round(m.widthPixels * scale));
        height = Math.max(1, Math.round(m.heightPixels * scale));

        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = mpm.getMediaProjection(resultCode, data);
        if (projection == null) { shutdown(); return START_NOT_STICKY; }

        thread = new HandlerThread("nzs-scan"); thread.start();
        handler = new Handler(thread.getLooper());
        // Android 14+: eerst een callback registreren, dan pas het virtuele scherm maken.
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { handler.post(ScanService.this::releaseCapture); }
        }, handler);
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        display = projection.createVirtualDisplay("nzs-scan", width, height, m.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
        running = true;
        // Eerste beeld pas na het openen van de andere app.
        handler.postDelayed(this::tick, 1500);
        return START_NOT_STICKY;
    }

    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Meekijken", NotificationManager.IMPORTANCE_LOW));
        }
        Intent back = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (back != null) back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = back == null ? null : PendingIntent.getActivity(this, 1, back, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setContentTitle("NzSurf kijkt mee")
                .setContentText("Scroll door de verwachting. Tik hier om terug te gaan naar NzSurf.")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setOngoing(true);
        if (pi != null) b.setContentIntent(pi);
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIF_ID, n);
    }

    private void tick() {
        if (!running) return;
        try {
            Image img = reader.acquireLatestImage();
            if (img != null) {
                Bitmap bmp = toBitmap(img);
                img.close();
                int[] sig = signature(bmp);
                boolean still = lastSig != null && diff(sig, lastSig) < 3;
                boolean isNew = savedSig == null || diff(sig, savedSig) > 10;
                if (still && isNew && frames.size() < MAX_FRAMES) {
                    File f = new File(dir, "frame_" + System.currentTimeMillis() + ".jpg");
                    try (FileOutputStream out = new FileOutputStream(f)) { bmp.compress(Bitmap.CompressFormat.JPEG, 72, out); }
                    synchronized (frames) { frames.add(f); }
                    savedSig = sig;
                }
                lastSig = sig;
                bmp.recycle();
            }
        } catch (Exception ignored) { }
        if (running) handler.postDelayed(this::tick, intervalMs);
    }

    private Bitmap toBitmap(Image img) {
        Image.Plane p = img.getPlanes()[0];
        ByteBuffer buf = p.getBuffer();
        int pixelStride = p.getPixelStride(), rowStride = p.getRowStride();
        int padded = rowStride / pixelStride;
        Bitmap full = Bitmap.createBitmap(padded, height, Bitmap.Config.ARGB_8888);
        full.copyPixelsFromBuffer(buf);
        if (padded == width) return full;
        Bitmap crop = Bitmap.createBitmap(full, 0, 0, width, height);
        full.recycle();
        return crop;
    }

    /** Klein grijswaardenbeeld (24 × 48) als vingerafdruk. */
    private int[] signature(Bitmap b) {
        Bitmap s = Bitmap.createScaledBitmap(b, 24, 48, true);
        int[] px = new int[24 * 48];
        s.getPixels(px, 0, 24, 0, 0, 24, 48);
        s.recycle();
        for (int i = 0; i < px.length; i++) { int c = px[i]; px[i] = (((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255)) / 3; }
        return px;
    }

    /** Gemiddeld verschil per punt (0–255). */
    private int diff(int[] a, int[] b) {
        long d = 0; for (int i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
        return (int) (d / a.length);
    }

    private void releaseCapture() {
        running = false;
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        display = null; reader = null;
    }

    private void shutdown() {
        running = false;
        if (handler != null) handler.post(() -> {
            releaseCapture();
            try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
            projection = null;
            if (thread != null) thread.quitSafely();
        });
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() { running = false; super.onDestroy(); }
}
