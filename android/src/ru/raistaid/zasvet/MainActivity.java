package ru.raistaid.zasvet;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/** Offline WebView host. The APK contains the current game/ directory verbatim. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private WebView webView;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 244, 235));
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
            View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247, 244, 235));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.addJavascriptInterface(new GameEvents(), "ZasvetHost");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isLocal(request.getUrl())) return errorResponse(403, "Forbidden");
                String path = request.getUrl().getPath().substring("/assets/".length());
                if (path.length() == 0) path = "index.html";
                for (String part : path.split("/")) {
                    if (part.equals("..") || part.equals(".") || part.indexOf('\\') >= 0) {
                        return errorResponse(403, "Forbidden");
                    }
                }
                try {
                    InputStream body = getAssets().open(path);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    headers.put("X-Content-Type-Options", "nosniff");
                    return new WebResourceResponse(mimeType(path), "UTF-8", 200, "OK", headers, body);
                } catch (IOException missing) {
                    return errorResponse(404, "Not Found");
                }
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (!isLocal(Uri.parse(url))) return;
                view.evaluateJavascript("(function(){if(window.__zasvetHost)return;window.__zasvetHost=true;" +
                    "window.addEventListener('message',function(event){" +
                    "if(event.source===window&&event.origin==='" + ORIGIN + "'&&event.data&&" +
                    "event.data.type==='VIBRATION_EVENT')ZasvetHost.postMessage(JSON.stringify(event.data));" +
                    "});})();", null);
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        webView.loadUrl(ORIGIN + "/assets/index.html");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) &&
            uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private static WebResourceResponse errorResponse(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, new HashMap<>(),
            new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    }

    public final class GameEvents {
        @JavascriptInterface public void postMessage(String message) {
            if (message == null || message.length() > 2048) return;
            try {
                if (!"VIBRATION_EVENT".equals(new JSONObject(message).optString("type"))) return;
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    vibrator.vibrate(VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE));
                }
            } catch (JSONException ignored) {
                // Only the game's known event type is accepted.
            }
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(function(){var app=document.getElementById('app');" +
            "if(app&&app.dataset.screen!=='start'){document.querySelector('[data-action=close]').click();return true;}" +
            "return false;})();", handled -> { if (!"true".equals(handled)) finish(); });
    }

    @Override protected void onPause() {
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) { webView.onResume(); webView.resumeTimers(); }
    }

    @Override protected void onDestroy() {
        webView.removeJavascriptInterface("ZasvetHost");
        webView.destroy();
        super.onDestroy();
    }
}
