package nl.nzsurf.apkupdater;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Update in de app: de nieuwe APK downloaden naar de cache van NzSurf (niet naar Downloads,
 * dus geen stapel "nzsurf-latest (72).apk") en daarna het installatiescherm van Android
 * openen. Voortgang via het event "progress" ({ pct }).
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    /** Opent de instelling "Onbekende apps installeren" voor NzSurf. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("Geen url"); return; }
        new Thread(() -> {
            Context ctx = getContext();
            try {
                File dir = new File(ctx.getCacheDir(), "nzs-update");
                dir.mkdirs();
                File apk = new File(dir, "nzsurf-update.apk");
                if (apk.exists()) apk.delete();

                // GitHub stuurt door naar een downloadserver: redirects zelf volgen.
                HttpURLConnection con = null;
                String next = url;
                for (int hop = 0; hop < 6; hop++) {
                    con = (HttpURLConnection) new URL(next).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    con.setRequestProperty("User-Agent", "NzSurf-updater");
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400 && con.getHeaderField("Location") != null) {
                        next = new URL(new URL(next), con.getHeaderField("Location")).toString();
                        con.disconnect();
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = con.getContentLengthLong();
                long done = 0;
                int lastPct = -1;
                try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct && (pct % 5 == 0 || pct == 100)) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("pct", pct);
                            p.put("bytes", done);
                            notifyListeners("progress", p);
                        }
                    }
                }
                con.disconnect();
                if (total > 0 && done != total) throw new Exception("Download onvolledig (" + done + " van " + total + " bytes)");

                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".nzsupdate", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(install);

                JSObject r = new JSObject();
                r.put("bytes", done);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Bijwerken mislukt: " + e.getMessage());
            }
        }).start();
    }
}
