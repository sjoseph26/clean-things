package gy.cleanthings.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/assets/index.html";
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private static final int LOCATION_PERMISSION_REQUEST = 4103;
    private WebView webView;
    private SessionVault sessionVault;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingGeolocationOrigin;
    private GeolocationPermissions.Callback pendingGeolocationCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(4, 74, 113));
        window.setNavigationBarColor(Color.WHITE);

        webView = new WebView(this);
        sessionVault = new SessionVault(this);
        webView.addJavascriptInterface(sessionVault, "CleanThingsNativeSession");
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setGeolocationDatabasePath(getFilesDir().getPath());
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                sessionVault.setTrustedDocument(isTrustedDocument(Uri.parse(url)));
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // The bridge must never coexist with a remote or alternate main document.
                if (request.isForMainFrame() && !isTrustedDocument(uri)) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
                }
                if (!APP_HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                String file = path != null && path.startsWith("/assets/") ? path.substring(8) : "";
                String mime = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "image/png";
                if (isAppOrigin(uri) && "GET".equals(request.getMethod()) && file.matches("(index\\.html|app\\.js|backend\\.js|core\\.js|config\\.js|session-store\\.js|pull-refresh\\.js|styles\\.css|logo\\.png)")) {
                    try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(file)); }
                    catch (IOException ignored) { /* return a local 404 below */ }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalUrl(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalUrl(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback) {
                if (!isAppOrigin(Uri.parse(origin))) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (pendingGeolocationCallback != null) {
                    pendingGeolocationCallback.invoke(pendingGeolocationOrigin, false, false);
                }
                pendingGeolocationOrigin = origin;
                pendingGeolocationCallback = callback;
                requestPermissions(
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                        LOCATION_PERMISSION_REQUEST);
            }

            @Override
            public void onGeolocationPermissionsHidePrompt() {
                pendingGeolocationOrigin = null;
                pendingGeolocationCallback = null;
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    pendingFileCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean openExternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (isTrustedDocument(uri)) return false;
        if (APP_HOST.equals(uri.getHost())) return true;
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme))) return true;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(this, "No compatible app is available for this action.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private boolean isAppOrigin(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private boolean isTrustedDocument(Uri uri) {
        return isAppOrigin(uri) && "/assets/index.html".equals(uri.getPath()) && uri.getQuery() == null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST || pendingGeolocationCallback == null) {
            return;
        }
        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }
        pendingGeolocationCallback.invoke(pendingGeolocationOrigin, granted, false);
        pendingGeolocationOrigin = null;
        pendingGeolocationCallback = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || pendingFileCallback == null) {
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            result = new Uri[]{data.getData()};
        }
        pendingFileCallback.onReceiveValue(result);
        pendingFileCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("Boolean(window.CleanThingsHandleBack && window.CleanThingsHandleBack())", result -> {
                if (!isFinishing() && !isDestroyed() && !"true".equals(result)) navigateBack();
            });
        } else {
            navigateBack();
        }
    }

    @SuppressWarnings("deprecation")
    private void navigateBack() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (sessionVault != null) sessionVault.setTrustedDocument(false);
        if (webView != null) {
            webView.removeJavascriptInterface("CleanThingsNativeSession");
            webView.destroy();
        }
        super.onDestroy();
    }
}
