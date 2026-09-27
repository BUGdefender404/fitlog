package com.qingshiji.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * 轻食记 安卓壳：把打包在 APK assets 里的网页以本地 https 形式喂给 WebView。
 * 无任何 JS 桥、无第三方 SDK；数据（IndexedDB/localStorage）只存在本应用私有目录。
 */
public class MainActivity extends Activity {

    // 仅拦截这个虚构域名，不会发起真实网络请求；外部 API（智谱/openfoodfacts）正常走网络
    private static final String HOST = "appassets.qingshiji.local";
    private static final String BASE_URL = "https://" + HOST + "/";
    private static final int REQ_CAMERA = 1001;
    private static final int REQ_FILE = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // 安全加固：禁文件/内容域访问，不注册任何 JS 接口
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false; // 应用内部页面
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true; // 外部链接一律交给系统浏览器
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
                return serveAsset(u.getPath());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // 支持 <input type="file">（拍照识别选图/拍营养成分表）
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    pendingFileCallback = null;
                    return false;
                }
                return true;
            }

            // 网页请求相机（扫条码 getUserMedia）→ 转成系统运行时权限
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                request.grant(request.getResources());
                            } else {
                                pendingWebPermission = request;
                                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                            }
                            return;
                        }
                    }
                    request.deny();
                });
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(BASE_URL);
        }
    }

    // ---------------- 本地资源服务 ----------------
    // MIME 一律不带 charset（老版 WebView 解析 "text/html; charset=utf-8" 会当纯文本显示源码），编码走单独参数
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("svg", "image/svg+xml");
        MIME.put("webp", "image/webp");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("txt", "text/plain");
    }

    private WebResourceResponse serveAsset(String rawPath) {
        String p = rawPath == null ? "/" : rawPath;
        try { p = URLDecoder.decode(p, "UTF-8"); } catch (Exception ignored) {}
        if (p.startsWith("/")) p = p.substring(1);
        if (p.isEmpty() || p.endsWith("/")) p = p + "index.html";
        if (p.contains("..") || p.startsWith("api/")) return notFound(); // 防穿越；无后端，让前端走本地存储模式
        byte[] data;
        try {
            data = readAsset(p);
        } catch (IOException e) {
            try { data = readAsset("index.html"); } catch (IOException e2) { return notFound(); } // SPA 回退
        }
        String ext = "";
        int dot = p.lastIndexOf('.');
        if (dot >= 0) ext = p.substring(dot + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        String encoding = mime.startsWith("text/") || mime.contains("json") ? "utf-8" : null;
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", encoding != null ? mime + "; charset=utf-8" : mime);
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(mime, encoding, 200, "OK", headers, new ByteArrayInputStream(data));
    }

    private byte[] readAsset(String path) throws IOException {
        InputStream in = getAssets().open(path);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                null, new ByteArrayInputStream(new byte[0]));
    }

    // ---------------- 权限 / 文件选择回调 ----------------
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_CAMERA && pendingWebPermission != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingWebPermission.grant(pendingWebPermission.getResources());
            } else {
                pendingWebPermission.deny();
                Toast.makeText(this, "未授权相机，无法拍照/扫码", Toast.LENGTH_SHORT).show();
            }
            pendingWebPermission = null;
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFileCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    // ---------------- 生命周期 ----------------
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
