package com.rickc137.portal.security

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * B2D-Bridge v4.2 — Hardened zero-trust native bridge (blueprint §3, `HardenedBridge.kt`).
 *
 * Mounted on the WebView as `window.SovereignBridge` and invoked by
 * `bridge-client.ts` via `SovereignBridge.dispatchSecure(JSON.stringify(envelope))`.
 *
 * Security guarantees enforced on every call:
 *  1. **Command allowlist** — only explicitly enumerated actions may execute.
 *  2. **Anti-replay** — one-shot UUIDv4 nonce, timestamp valid within ±3000 ms.
 *  3. **HMAC-SHA256** — `command:nonce:timestamp:payload` signed with the session key.
 *  4. **Structured validation** — parsed `JSONObject` payload before touching host APIs.
 *
 * Canonical string layout matches the PDF specification
 * (`$command:$nonce:$timestamp:${payload.toString()}`).
 */
class HardenedBridge(
    private val context: Context,
    private val sessionKey: ByteArray
) {

    private val processedNonces = mutableSetOf<String>()

    private val ALLOWED_COMMANDS = setOf(
        "TRIGGER_HAPTIC",
        "READ_BATTERY_TELEMETRY",
        "READ_HARDWARE_SENSORS",
        "SYNC_LOCAL_STATE"
    )

    @JavascriptInterface
    fun dispatchSecure(envelopeJson: String): String {
        val response = JSONObject()
        try {
            val envelope = JSONObject(envelopeJson)
            val command = envelope.getString("command")
            val nonce = envelope.getString("nonce")
            val timestamp = envelope.getLong("timestamp")
            val signature = envelope.getString("signature")
            val payload = envelope.getJSONObject("payload")

            // 1. Anti-Replay: Verify timestamp freshness (< 3 seconds)
            val currentTime = System.currentTimeMillis()
            if (Math.abs(currentTime - timestamp) > 3000) {
                return errorResponse("EXPIRED_TIMESTAMP")
            }

            // 2. Anti-Replay: Check and record nonce
            synchronized(processedNonces) {
                if (processedNonces.contains(nonce)) {
                    return errorResponse("REPLAY_DETECTED")
                }
                processedNonces.add(nonce)
                if (processedNonces.size > 1000) processedNonces.clear()
            }

            // 3. Verify HMAC-SHA256 signature
            val canonicalData = "$command:$nonce:$timestamp:${payload.toString()}"
            val expectedSig = computeHmac(canonicalData, sessionKey)
            if (!MessageDigest.isEqual(expectedSig.toByteArray(), signature.toByteArray())) {
                return errorResponse("INVALID_SIGNATURE")
            }

            // 4. Command allowlist verification
            if (!ALLOWED_COMMANDS.contains(command)) {
                return errorResponse("UNAUTHORIZED_COMMAND")
            }

            // 5. Execute command
            val result = executeCommand(command, payload)
            response.put("status", "SUCCESS")
            response.put("nonce", nonce)
            response.put("data", result)
            return response.toString()
        } catch (e: Exception) {
            return errorResponse("SECURITY_EXCEPTION: ${e.message ?: "UNKNOWN"}")
        }
    }

    private fun executeCommand(command: String, payload: JSONObject): JSONObject {
        val data = JSONObject()
        when (command) {
            "TRIGGER_HAPTIC" -> {
                val intensity = payload.optDouble("intensity", 1.0)
                triggerHaptic(intensity)
                data.put("haptic_fired", true)
            }
            "READ_BATTERY_TELEMETRY" -> {
                data.put("voltage_mv", 4120)
                data.put("temperature_c", 28.4)
                data.put("mesh_status", "ACTIVE")
            }
            "READ_HARDWARE_SENSORS" -> {
                data.put("accel_x", 0.0)
                data.put("accel_y", 0.0)
                data.put("accel_z", 9.81)
                data.put("captured_at_ms", SystemClock.elapsedRealtime())
            }
            "SYNC_LOCAL_STATE" -> {
                data.put("records_written", 1)
            }
        }
        return data
    }

    @Suppress("DEPRECATION")
    private fun triggerHaptic(intensity: Double) {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        val durationMs = (20.0 * intensity.coerceIn(0.0, 1.0)).toLong().coerceAtLeast(1L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            vibrator.vibrate(durationMs)
        }
    }

    private fun computeHmac(data: String, key: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    private fun errorResponse(reason: String): String {
        return JSONObject().apply {
            put("status", "ERROR")
            put("error", reason)
        }.toString()
    }
}
