package com.rickc137.portal

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.rickc137.portal.security.HardenedBridge
import org.json.JSONObject
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Native Android shell for Sovereign Portal C-137.
 *
 * Serves the portal bundle out of `assets/` through a [WebViewAssetLoader] on the
 * synthetic `https://appassets.androidplatform.net` origin (so no `file://` CORS
 * problems and no external network access is required), then exposes the hardened
 * JavaScript bridge to the page.
 *
 * Bridge surface:
 *  - `SovereignAndroidBridge` — blueprint §7.2 command dispatch (HMAC + nonce + 5s window)
 *  - `SovereignBridge`        — zero-trust allowlisted bridge ([HardenedBridge], ±3s window)
 */
class MainActivity : AppCompatActivity() {

    private val sharedSecretKey = "SOVEREIGN_SUPER_SECRET_HMAC_KEY_2026"
    private val processedNonces = mutableSetOf<String>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val webView = findViewById<WebView>(R.id.portal_webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        // Blueprint §7.2 bridge
        webView.addJavascriptInterface(SovereignAndroidBridge(), "SovereignAndroidBridge")

        // Zero-trust allowlisted bridge (HardenedBridge.kt)
        val hardenedBridge = HardenedBridge(this, sharedSecretKey.toByteArray(Charsets.UTF_8))
        webView.addJavascriptInterface(hardenedBridge, "SovereignBridge")

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    /**
     * Blueprint §7.2 command handler. Envelope shape:
     * `{ command, payload, timestamp, nonce, signature }`.
     */
    private inner class SovereignAndroidBridge {

        @JavascriptInterface
        fun executeCommand(envelopeJson: String): String {
            try {
                val json = JSONObject(envelopeJson)
                val command = json.getString("command")
                val payload = json.getJSONObject("payload").toString()
                val timestamp = json.getLong("timestamp")
                val nonce = json.getString("nonce")
                val signature = json.getString("signature")

                val now = System.currentTimeMillis()
                if (Math.abs(now - timestamp) > 5000) {
                    return """{"error":"REPLAY_EXPIRED","status":403}"""
                }

                synchronized(processedNonces) {
                    if (processedNonces.contains(nonce)) {
                        return """{"error":"REPLAY_NONCE_DUPLICATE","status":403}"""
                    }
                    processedNonces.add(nonce)
                }

                val rawPayload = "$command:$payload:$timestamp:$nonce"
                val expectedSig = hmacSha256(rawPayload, sharedSecretKey)
                if (!expectedSig.equals(signature, ignoreCase = true)) {
                    return """{"error":"INVALID_SIGNATURE","status":401}"""
                }

                return when (command) {
                    "DEVICE_HAPTIC" -> """{"status":"success","result":"HAPTIC_TRIGGERED"}"""
                    "STORAGE_WRITE_SECURE" -> """{"status":"success","result":"WRITTEN"}"""
                    "SYSTEM_INFO" -> """{"status":"success","result":"ANDROID_WEBVIEW_ASSET_LOADER"}"""
                    else -> """{"error":"UNKNOWN_COMMAND","status":404}"""
                }
            } catch (e: Exception) {
                return """{"error":"${e.message ?: "BRIDGE_EXCEPTION"}","status":500}"""
            }
        }
    }

    private fun hmacSha256(data: String, key: String): String {
        val sha256Hmac = Mac.getInstance("HmacSHA256")
        val secretKeySpec = SecretKeySpec(key.toByteArray(Charsets.UTF_8), "HmacSHA256")
        sha256Hmac.init(secretKeySpec)
        val hash = sha256Hmac.doFinal(data.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }
}
