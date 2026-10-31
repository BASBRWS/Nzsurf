package nl.nzsurf.screenscan;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Meekijken met een andere app: toestemming voor schermopname vragen, de andere app openen,
 * beelden verzamelen (ScanService) en ze bij stop teruggeven als JPEG (base64).
 */
@CapacitorPlugin(name = "ScreenScan")
public class ScreenScanPlugin extends Plugin {

    @PluginMethod
    public void isInstalled(PluginCall call) {
        String pkg = call.getString("packageName", "");
        JSObject r = new JSObject();
        r.put("installed", getContext().getPackageManager().getLaunchIntentForPackage(pkg) != null);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String pkg = call.getString("packageName", "");
        if (getContext().getPackageManager().getLaunchIntentForPackage(pkg) == null) {
            call.reject("App niet gevonden: " + pkg);
            return;
        }
        MediaProjectionManager mpm = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "onConsent");
    }

    @ActivityCallback
    private void onConsent(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Geen toestemming voor meekijken");
            return;
        }
        Context ctx = getContext();
        Intent svc = new Intent(ctx, ScanService.class);
        svc.putExtra("resultCode", result.getResultCode());
        svc.putExtra("data", result.getData());
        svc.putExtra("intervalMs", call.getInt("intervalMs", 1200));
        svc.putExtra("width", call.getInt("width", 720));
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc); else ctx.startService(svc);

        String pkg = call.getString("packageName", "");
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent open = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
            if (open != null) { open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(open); }
        }, 500);
        JSObject r = new JSObject();
        r.put("started", true);
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("running", ScanService.running);
        synchronized (ScanService.frames) { r.put("frames", ScanService.frames.size()); }
        call.resolve(r);
    }

    /** Stoppen; de laatste beelden van vlak vóór het stoppen (NzSurf zelf) vallen weg. */
    @PluginMethod
    public void stop(PluginCall call) {
        long dropAfter = System.currentTimeMillis() - call.getInt("dropLastMs", 2500);
        Context ctx = getContext();
        Intent svc = new Intent(ctx, ScanService.class);
        svc.setAction("stop");
        try { ctx.startService(svc); } catch (Exception ignored) { }

        List<File> list;
        synchronized (ScanService.frames) { list = new ArrayList<>(ScanService.frames); }
        JSArray out = new JSArray();
        for (File f : list) {
            if (f.lastModified() > dropAfter) continue;
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] b = new byte[(int) f.length()];
                int off = 0, n;
                while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
                JSObject o = new JSObject();
                o.put("at", f.lastModified());
                o.put("jpeg", Base64.encodeToString(b, Base64.NO_WRAP));
                out.put(o);
            } catch (Exception ignored) { }
        }
        JSObject r = new JSObject();
        r.put("frames", out);
        call.resolve(r);
    }
}
