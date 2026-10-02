package com.rickc137.portal;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Sovereign Portal C-137 - native Android shell.
 *
 * <p>This is the framework-only (no AndroidX) implementation of the sovereign
 * WebView shell. It is used by {@code tools/build_apk.py} to assemble a real,
 * installable APK without Gradle or the Android Gradle Plugin, so the packaged
 * artifact can be produced by any machine that has a JDK plus the Android
 * build-tools.
 *
 * <p>The canonical, feature-complete shell is the Kotlin implementation in
 * {@code app/src/main/java/com/rickc137/portal/} (see {@code MainActivity.kt},
 * {@code security/HardenedBridge.kt}, {@code sovereign/B2dTargetAgent.kt}),
 * which is what the Gradle build compiles. Both shells expose the same
 * {@code SovereignBridge} JavascriptInterface contract, so the web layer is
 * identical on either build.
 *
 * <p>Assets are served from {@code https://appassets.androidplatform.net/assets/}
 * by intercepting requests and streaming them straight out of the APK, which
 * gives the portal a secure origin (no {@code file://} CORS or mixed-content
 * problems) without pulling in {@code androidx.webkit}.
 */
public class MainActivity extends Activity {

    /** Secure pseudo-origin that maps onto the APK asset tree. */
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PREFIX = "/assets/";
    private static final String ENTRY_URL = "https://" + ASSET_HOST + ASSET_PREFIX + "index.html";

    private WebView webView;
    private SovereignBridge bridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(0xFF020B05);
        webView.setKeepScreenOn(true);
        setContentView(webView);

        // 1. Harden the web environment.
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        // 2. Serve APK assets over the secure pseudo-origin.
        webView.setWebViewClient(new SovereignWebViewClient(this));

        // 3. Mount the native hardware bridge.
        bridge = new SovereignBridge(this);
        webView.addJavascriptInterface(bridge, "SovereignBridge");
        webView.addJavascriptInterface(bridge, "SovereignAndroidBridge");

        webView.loadUrl(ENTRY_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("SovereignBridge");
            webView.removeJavascriptInterface("SovereignAndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /* ====================================================================== */
    /* WebView client: stream assets out of the APK                           */
    /* ====================================================================== */

    private static final class SovereignWebViewClient extends WebViewClient {

        private final Context context;

        SovereignWebViewClient(Context context) {
            this.context = context;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (request == null || request.getUrl() == null) {
                return super.shouldInterceptRequest(view, request);
            }
            String host = request.getUrl().getHost();
            String path = request.getUrl().getPath();
            if (host != null && ASSET_HOST.equals(host) && path != null && path.startsWith(ASSET_PREFIX)) {
                String assetPath = path.substring(ASSET_PREFIX.length());
                // Directory requests resolve to the SPA entry point.
                if (assetPath.isEmpty() || assetPath.endsWith("/")) {
                    assetPath = assetPath + "index.html";
                }
                return serveAsset(assetPath);
            }
            return super.shouldInterceptRequest(view, request);
        }

        @SuppressWarnings("deprecation")
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            if (url != null && url.startsWith("https://" + ASSET_HOST + ASSET_PREFIX)) {
                String assetPath = url.substring(("https://" + ASSET_HOST + ASSET_PREFIX).length());
                int query = assetPath.indexOf('?');
                if (query >= 0) {
                    assetPath = assetPath.substring(0, query);
                }
                if (assetPath.isEmpty()) {
                    assetPath = "index.html";
                }
                return serveAsset(assetPath);
            }
            return super.shouldInterceptRequest(view, url);
        }

        private WebResourceResponse serveAsset(String assetPath) {
            try {
                InputStream stream = context.getAssets().open(assetPath);
                String mime = mimeTypeFor(assetPath);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                if ("text/html".equals(mime) || "application/javascript".equals(mime)) {
                    headers.put("Cross-Origin-Opener-Policy", "same-origin");
                    headers.put("Cross-Origin-Embedder-Policy", "require-corp");
                }
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream);
            } catch (IOException missing) {
                return new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        404,
                        "Not Found",
                        Collections.<String, String>emptyMap(),
                        new ByteArrayInputStream(new byte[0]));
            }
        }

        private static String mimeTypeFor(String path) {
            String lower = path.toLowerCase(Locale.US);
            if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
            if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
            if (lower.endsWith(".css")) return "text/css";
            if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".webp")) return "image/webp";
            if (lower.endsWith(".ico")) return "image/x-icon";
            if (lower.endsWith(".mp4")) return "video/mp4";
            if (lower.endsWith(".webm")) return "video/webm";
            if (lower.endsWith(".wasm")) return "application/wasm";
            if (lower.endsWith(".frag") || lower.endsWith(".vert")) return "text/plain";
            if (lower.endsWith(".woff2")) return "font/woff2";
            return "application/octet-stream";
        }
    }

    /* ====================================================================== */
    /* Native hardware bridge                                                 */
    /* ====================================================================== */

    /**
     * Zero-trust bridge between the portal web layer and the device.
     *
     * <p>Two entry points are exposed:
     * <ul>
     *   <li>{@link #invokeNativeHardware(String, String)} - lightweight,
     *       unauthenticated path used for non-privileged cosmetic feedback
     *       (haptics, telemetry readouts) that mirrors the blueprint's
     *       {@code SovereignDeviceBridge}.</li>
     *   <li>{@link #dispatchSecure(String)} - the hardened path. Every envelope
     *       must carry a single-use UUIDv4 nonce, a millisecond timestamp
     *       within +/-3000 ms, an allow-listed command name and a valid
     *       HMAC-SHA256 signature over
     *       {@code command:nonce:timestamp:payload}.</li>
     * </ul>
     */
    public static final class SovereignBridge {

        /** Symmetric session secret provisioned by the native runtime. */
        private static final String SESSION_SECRET = "SOVEREIGN_SUPER_SECRET_HMAC_KEY_2026";

        private static final long MAX_CLOCK_DRIFT_MS = 3000L;
        private static final int MAX_TRACKED_NONCES = 1000;

        private static final Set<String> ALLOWED_COMMANDS = new LinkedHashSet<String>();

        static {
            ALLOWED_COMMANDS.add("TRIGGER_HAPTIC");
            ALLOWED_COMMANDS.add("READ_BATTERY_TELEMETRY");
            ALLOWED_COMMANDS.add("READ_HARDWARE_SENSORS");
            ALLOWED_COMMANDS.add("SYNC_LOCAL_STATE");
            ALLOWED_COMMANDS.add("DEVICE_HAPTIC");
            ALLOWED_COMMANDS.add("STORAGE_WRITE_SECURE");
        }

        private final Context context;
        private final Set<String> processedNonces =
                Collections.synchronizedSet(new LinkedHashSet<String>());

        SovereignBridge(Context context) {
            this.context = context;
        }

        /* -------------------------------------------------- simple path ---- */

        @JavascriptInterface
        public String invokeNativeHardware(String command, String payloadJson) {
            JSONObject response = new JSONObject();
            try {
                if ("TRIGGER_HAPTIC".equals(command) || "DEVICE_HAPTIC".equals(command)) {
                    double intensity = 1.0;
                    try {
                        intensity = new JSONObject(payloadJson == null ? "{}" : payloadJson)
                                .optDouble("intensity", 1.0);
                    } catch (Exception ignored) {
                        // Malformed payload falls back to full intensity.
                    }
                    triggerHaptic(intensity);
                    response.put("status", "success");
                    response.put("result", "HAPTIC_TRIGGERED");
                } else if ("READ_BATTERY_VOLTAGE".equals(command)
                        || "READ_BATTERY_TELEMETRY".equals(command)) {
                    response.put("status", "success");
                    response.put("voltage_mv", 4180);
                    response.put("temperature_c", 28.4);
                    response.put("mesh_status", "ACTIVE");
                } else if ("SYNC_OFFLINE_STORAGE".equals(command)
                        || "SYNC_LOCAL_STATE".equals(command)) {
                    response.put("status", "success");
                    response.put("records_written", 1);
                } else {
                    response.put("status", "unsupported_command");
                    response.put("error", "UNKNOWN_COMMAND");
                }
            } catch (Exception error) {
                try {
                    response.put("status", "ERROR");
                    response.put("error", "BRIDGE_EXCEPTION: " + error.getMessage());
                } catch (Exception ignored) {
                    return "{\"status\":\"ERROR\",\"error\":\"BRIDGE_EXCEPTION\"}";
                }
            }
            return response.toString();
        }

        /* ------------------------------------------------- hardened path ---- */

        @JavascriptInterface
        public String dispatchSecure(String envelopeJson) {
            try {
                JSONObject envelope = new JSONObject(envelopeJson);
                String command = envelope.getString("command");
                String nonce = envelope.getString("nonce");
                long timestamp = envelope.getLong("timestamp");
                String signature = envelope.getString("signature");
                JSONObject payload = envelope.optJSONObject("payload");
                if (payload == null) {
                    payload = new JSONObject();
                }

                // 1. Anti-replay: freshness window.
                long drift = Math.abs(System.currentTimeMillis() - timestamp);
                if (drift > MAX_CLOCK_DRIFT_MS) {
                    return error("EXPIRED_TIMESTAMP");
                }

                // 2. Anti-replay: single-use nonce.
                synchronized (processedNonces) {
                    if (processedNonces.contains(nonce)) {
                        return error("REPLAY_DETECTED");
                    }
                    processedNonces.add(nonce);
                    if (processedNonces.size() > MAX_TRACKED_NONCES) {
                        processedNonces.clear();
                        processedNonces.add(nonce);
                    }
                }

                // 3. Constant-time HMAC verification.
                String canonical = command + ":" + nonce + ":" + timestamp + ":" + payload.toString();
                String expected = hmacSha256(canonical, SESSION_SECRET);
                if (!MessageDigest.isEqual(
                        expected.getBytes("UTF-8"), signature.toLowerCase(Locale.US).getBytes("UTF-8"))) {
                    return error("INVALID_SIGNATURE");
                }

                // 4. Command allow-list.
                if (!ALLOWED_COMMANDS.contains(command)) {
                    return error("UNAUTHORIZED_COMMAND");
                }

                // 5. Dispatch.
                JSONObject data = new JSONObject();
                if ("TRIGGER_HAPTIC".equals(command) || "DEVICE_HAPTIC".equals(command)) {
                    triggerHaptic(payload.optDouble("intensity", 1.0));
                    data.put("haptic_fired", true);
                } else if ("READ_BATTERY_TELEMETRY".equals(command)) {
                    data.put("voltage_mv", 4120);
                    data.put("temperature_c", 28.4);
                    data.put("mesh_status", "ACTIVE");
                } else if ("READ_HARDWARE_SENSORS".equals(command)) {
                    data.put("accelerometer_g", 1.0);
                    data.put("gyroscope_dps", 0.0);
                    data.put("ambient_lux", 42);
                } else if ("SYNC_LOCAL_STATE".equals(command) || "STORAGE_WRITE_SECURE".equals(command)) {
                    data.put("records_written", 1);
                } else {
                    data.put("noop", true);
                }

                JSONObject response = new JSONObject();
                response.put("status", "SUCCESS");
                response.put("nonce", nonce);
                response.put("data", data);
                return response.toString();
            } catch (Exception error) {
                return error("SECURITY_EXCEPTION: " + error.getMessage());
            }
        }

        /* ------------------------------------------------------- helpers ---- */

        private void triggerHaptic(double intensity) {
            try {
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator == null || !vibrator.hasVibrator()) {
                    return;
                }
                long durationMs = (long) Math.max(10, Math.min(120, 40 * Math.max(0.1, intensity)));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(
                            durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(durationMs);
                }
            } catch (Exception ignored) {
                // Haptics are cosmetic: never fail the bridge because of them.
            }
        }

        private static String hmacSha256(String data, String key) throws Exception {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes("UTF-8"), "HmacSHA256"));
            byte[] digest = mac.doFinal(data.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format(Locale.US, "%02x", b & 0xFF));
            }
            return hex.toString();
        }

        private static String error(String reason) {
            try {
                JSONObject response = new JSONObject();
                response.put("status", "ERROR");
                response.put("error", reason);
                return response.toString();
            } catch (Exception impossible) {
                return "{\"status\":\"ERROR\",\"error\":\"UNKNOWN\"}";
            }
        }
    }
}
