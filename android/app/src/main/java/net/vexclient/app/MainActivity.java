package net.vexclient.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * VEX for Android: the VEX online phone app (friends, news, Collab, admin) in a full-screen app.
 * The VEX online address comes from the build (BuildConfig.VEX_URL) or is typed once on the setup screen.
 * Everything else lives on the player's own VEX online service.
 */
public class MainActivity extends Activity {
    private static final String SETUP = "file:///android_asset/setup.html";
    private WebView web;
    private SharedPreferences prefs;
    private volatile String current = "";

    private String server() {
        String saved = prefs.getString("url", "");
        return !saved.isEmpty() ? saved : BuildConfig.VEX_URL;
    }

    private static boolean validServer(String u) {
        return u != null && u.matches("https://[A-Za-z0-9.-]+(:\\d{1,5})?(/[A-Za-z0-9._/-]*)?");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("vex", MODE_PRIVATE);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(12, 12, 15));
        setContentView(web);

        // keep the page clear of the status bar, notch and gesture bar
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop(); r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " VEX-Android/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "VexAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) { current = url == null ? "" : url; }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String srv = server();
                if (u.toString().startsWith(SETUP) || (!srv.isEmpty() && u.toString().startsWith(srv))) return false;
                // anything else (Modrinth, GitHub, …) opens in the browser
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) view.loadUrl(SETUP + "#offline");
            }
        });

        if (!handleIntent(getIntent())) open(null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /** vex://connect?url=https://…&code=ABCD1234 */
    private boolean handleIntent(Intent i) {
        if (i == null || i.getData() == null || !"vex".equals(i.getData().getScheme())) return false;
        String url = i.getData().getQueryParameter("url"), code = i.getData().getQueryParameter("code");
        if (validServer(url)) prefs.edit().putString("url", url.replaceAll("/+$", "")).apply();
        open(code != null && code.matches("[A-Za-z0-9]{8}") ? code.toUpperCase() : null);
        return true;
    }

    private void open(String code) {
        String srv = server();
        if (srv.isEmpty()) web.loadUrl(SETUP);
        else web.loadUrl(srv + "/app" + (code != null ? "#code=" + code : ""));
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Called from the setup screen (and "Change server" in the app). */
    private class Bridge {
        @JavascriptInterface public void setServer(String url) {
            if (!current.startsWith(SETUP)) return; // only the built-in setup page may change the server
            String u = url == null ? "" : url.trim().replaceAll("/+$", "");
            if (!u.startsWith("http")) u = "https://" + u;
            if (!validServer(u)) return;
            final String v = u;
            prefs.edit().putString("url", v).apply();
            runOnUiThread(() -> web.loadUrl(v + "/app"));
        }
        @JavascriptInterface public String server() { return MainActivity.this.server(); }
        @JavascriptInterface public void changeServer() { runOnUiThread(() -> web.loadUrl(SETUP)); }
        @JavascriptInterface public void retry() { runOnUiThread(() -> open(null)); }
    }
}
