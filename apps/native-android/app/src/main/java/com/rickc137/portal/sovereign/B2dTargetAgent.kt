package com.rickc137.portal.sovereign

import android.content.Context
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.annotation.RequiresApi
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.CRC32

/**
 * B2D-Bridge v4.2 — Android Target Agent (PART IV §5.2).
 *
 * A Kotlin micro-daemon that lets a standards-compliant browser orchestrator drive
 * phone hardware without shipping a bespoke APK. It implements the host side of the
 * B2D framing protocol and two physical transports:
 *
 *  - **AOA (Android Open Accessory)** via [UsbManager] bulk streams for bytecode
 *    channel injection and keepalive (channel `0x01`/`0x02`).
 *  - **OMAPI (Open Mobile API)** via `android.se.omapi.SEService` for ISO 7816-4
 *    APDU exchange with the eUICC ISD-R (channel `0x03`, SGP.22 LPA).
 *
 * Raw HID reports (channel `0x06`) are injected into `/dev/uinput` when the target
 * is privileged; otherwise the call fails closed and reports why.
 *
 * Wire framing (little-endian fields, big-endian magic word):
 * ```
 * +---------------------+-----------+----------+---------+---------------+-------------+---------+
 * | Magic (4B 0x4232)   | Chan (1B) | Flags(1B)| Seq(2B) | PayloadLen(4B)| CRC-32 (4B) | Payload |
 * +---------------------+-----------+----------+---------+---------------+-------------+---------+
 * ```
 */
class B2dTargetAgent(private val context: Context) {

    companion object {
        private const val TAG = "B2dTargetAgent"

        /** 2-byte protocol magic `0x4232` ("B2") placed in the low word of the 4-byte field. */
        const val MAGIC: Int = 0x4232

        const val CHANNEL_SYSTEM: Int = 0x01
        const val CHANNEL_BYTECODE: Int = 0x02
        const val CHANNEL_SMARTCARD: Int = 0x03
        const val CHANNEL_TELEPHONY: Int = 0x04
        const val CHANNEL_RF: Int = 0x05
        const val CHANNEL_HID: Int = 0x06
        const val CHANNEL_OPTICAL: Int = 0x07

        /** ISD-R AID used for SGP.22 Local Profile Assistant (LPA) access. */
        const val ISD_R_AID: String = "A0000005591010FFFFFFFF8900000100"

        /** ES10b GetProfilesInfo-style APDU probe (CLA 80 / INS CA / P1 00 / P2 00). */
        const val APDU_GET_PROFILES: String = "80CA00FF00"

        const val UINPUT_DEVICE: String = "/dev/uinput"
        const val HEADER_SIZE: Int = 16
        const val MAX_PAYLOAD: Int = 1 shl 16
        const val OMAPI_TIMEOUT_MS: Long = 5000L
    }

    private var accessoryHandle: ParcelFileDescriptor? = null

    // ------------------------------------------------------------------ framing

    /** Build a fully framed B2D packet ready for the wire. */
    fun frame(channel: Int, flags: Int, seq: Int, payload: ByteArray): ByteArray {
        require(payload.size <= MAX_PAYLOAD) { "payload exceeds MAX_PAYLOAD" }

        val crc = CRC32().apply { update(payload) }.value.toInt()

        val header = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.BIG_ENDIAN)
        header.putInt(MAGIC)
        header.put(channel.toByte())
        header.put(flags.toByte())
        header.putShort(seq.toShort())
        header.putInt(payload.size)
        header.putInt(crc)

        return header.array() + payload
    }

    /** Parse a framed B2D packet, validating the magic word and the CRC-32 trailer. */
    fun parseFrame(packet: ByteArray): JSONObject {
        require(packet.size >= HEADER_SIZE) { "packet shorter than B2D header" }
        val buf = ByteBuffer.wrap(packet).order(ByteOrder.BIG_ENDIAN)

        val magic = buf.int
        val channel = buf.get().toInt() and 0xFF
        val flags = buf.get().toInt() and 0xFF
        val seq = buf.short.toInt() and 0xFFFF
        val payloadLen = buf.int
        val crcExpected = buf.int

        require(magic == MAGIC) { "bad magic: 0x%08x".format(magic) }
        require(payloadLen >= 0 && HEADER_SIZE + payloadLen <= packet.size) { "bad payload length" }

        val payload = ByteArray(payloadLen)
        buf.get(payload)

        val crcActual = CRC32().apply { update(payload) }.value.toInt()
        require(crcActual == crcExpected) { "CRC-32 mismatch" }

        return JSONObject().apply {
            put("magic", magic)
            put("channel", channel)
            put("channel_name", channelName(channel))
            put("flags", flags)
            put("seq", seq)
            put("payload_len", payloadLen)
            put("crc32", "0x%08x".format(crcExpected))
            put("payload", payload.toString(Charsets.UTF_8))
        }
    }

    private fun channelName(channel: Int): String = when (channel) {
        CHANNEL_SYSTEM -> "SYSTEM_KEEPALIVE"
        CHANNEL_BYTECODE -> "MICRO_RUNTIME_BYTECODE"
        CHANNEL_SMARTCARD -> "ISO7816_APDU_EUICC"
        CHANNEL_TELEPHONY -> "RIL_AT_SMS"
        CHANNEL_RF -> "L2_MAC_RF_TELEMETRY"
        CHANNEL_HID -> "RAW_HID_INPUT"
        CHANNEL_OPTICAL -> "OPTICAL_STEGO"
        else -> "UNKNOWN"
    }

    // ---------------------------------------------------------------------- AOA

    /** Return the first attached Android Open Accessory, if any. */
    fun findAccessory(): UsbAccessory? {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return null
        return usbManager.accessoryList?.firstOrNull()
    }

    /**
     * Claim the AOA bulk interface. Requires the host to have already granted
     * permission (usually via the accessory-attached intent + `requestPermission`).
     */
    fun openAccessory(): ParcelFileDescriptor? {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return null
        val accessory = findAccessory() ?: run {
            Log.w(TAG, "No AOA accessory attached")
            return null
        }
        if (!usbManager.hasPermission(accessory)) {
            Log.w(TAG, "AOA permission not granted for ${accessory.model}")
            return null
        }
        return try {
            usbManager.openAccessory(accessory).also { accessoryHandle = it }
        } catch (e: Exception) {
            Log.e(TAG, "openAccessory failed", e)
            null
        }
    }

    /** Stream a framed bytecode payload over the AOA bulk channel. */
    fun injectBytecode(seq: Int, bytecode: ByteArray): Boolean {
        val handle = accessoryHandle ?: openAccessory() ?: return false
        return try {
            FileOutputStream(handle.fileDescriptor).use { out ->
                out.write(frame(CHANNEL_BYTECODE, 0x00, seq, bytecode))
                out.flush()
            }
            Log.i(TAG, "Injected ${bytecode.size} bytecode bytes over AOA (seq=$seq)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "AOA bytecode injection failed", e)
            false
        }
    }

    fun close() {
        try {
            accessoryHandle?.close()
        } catch (e: Exception) {
            Log.w(TAG, "close() ignored: ${e.message}")
        } finally {
            accessoryHandle = null
        }
    }

    // -------------------------------------------------------------------- OMAPI

    /**
     * Read the installed eUICC profiles via SGP.22 ISD-R using the Open Mobile API.
     * Returns a best-effort [JSONArray] of `{ iccid, aid }` records. On devices
     * without a secure element (or below API 28) the array is empty.
     */
    fun readEuiccProfiles(): JSONArray {
        val profiles = JSONArray()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.w(TAG, "OMAPI requires API 28+ (running on ${Build.VERSION.SDK_INT})")
            return profiles
        }
        return readEuiccProfilesApi28(profiles)
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private fun readEuiccProfilesApi28(profiles: JSONArray): JSONArray {
        var service: android.se.omapi.SEService? = null
        var session: android.se.omapi.Session? = null
        var channel: android.se.omapi.Channel? = null
        try {
            val latch = CountDownLatch(1)
            service = android.se.omapi.SEService(
                context.applicationContext,
                context.mainExecutor,
                object : android.se.omapi.SEService.OnConnectedListener {
                    override fun onConnected() {
                        latch.countDown()
                    }
                }
            )

            if (!latch.await(OMAPI_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                Log.w(TAG, "SEService connection timed out")
                return profiles
            }

            val reader = service.readers.firstOrNull { it.isSecureElementPresent } ?: run {
                Log.w(TAG, "No secure element present")
                return profiles
            }

            session = reader.openSession()
            channel = session.openLogicalChannel(hexToBytes(ISD_R_AID)) ?: run {
                Log.w(TAG, "ISD-R logical channel unavailable")
                return profiles
            }

            val response = channel.transmit(hexToBytes(APDU_GET_PROFILES))
            val sw = "0x%02x%02x".format(response[response.size - 2], response[response.size - 1])
            val payloadBytes = response.copyOfRange(0, (response.size - 2).coerceAtLeast(0))

            profiles.put(
                JSONObject().apply {
                    put("aid", ISD_R_AID)
                    put("iccid", decodeBcdNibbleSwapped(payloadBytes))
                    put("sw", sw)
                    put("tsl", "SGP.22 v2.2.2 / ES10b")
                    put("bytes", payloadBytes.size)
                }
            )
        } catch (e: Exception) {
            Log.e(TAG, "eUICC profile read failed", e)
        } finally {
            try {
                channel?.close()
            } catch (_: Exception) {
            }
            try {
                session?.close()
            } catch (_: Exception) {
            }
            try {
                service?.shutdown()
            } catch (_: Exception) {
            }
        }
        return profiles
    }

    // ----------------------------------------------------------------- HID sync

    /**
     * Inject a raw 8-byte USB HID keyboard report into `/dev/uinput`.
     * Fails closed (returns false) on unprivileged devices.
     */
    fun injectHidReport(report: ByteArray): Boolean {
        val device = File(UINPUT_DEVICE)
        if (!device.exists() || !device.canWrite()) {
            Log.w(TAG, "uinput unavailable at $UINPUT_DEVICE; HID injection requires a privileged target")
            return false
        }
        return try {
            FileOutputStream(device).use { stream ->
                stream.write(report)
                stream.flush()
            }
            Log.i(TAG, "Injected ${report.size}-byte HID report into $UINPUT_DEVICE")
            true
        } catch (e: Exception) {
            Log.e(TAG, "HID injection failed", e)
            false
        }
    }

    /** Pack a standard 8-byte USB HID keyboard report (modifier + 6 key slots). */
    fun buildHidKeyboardReport(modifiers: Int, keycodes: IntArray): ByteArray {
        val report = ByteArray(8)
        report[0] = modifiers.toByte()
        report[1] = 0
        for (i in 0 until 6) {
            report[2 + i] = if (i < keycodes.size) keycodes[i].toByte() else 0
        }
        return report
    }

    // ------------------------------------------------------------------ helpers

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.replace(" ", "").uppercase()
        require(clean.length % 2 == 0) { "Invalid APDU hex length" }
        return ByteArray(clean.length / 2) { i ->
            val hi = Character.digit(clean[i * 2], 16)
            val lo = Character.digit(clean[i * 2 + 1], 16)
            ((hi shl 4) or lo).toByte()
        }
    }

    /** ICCID/IMSI bytes are BCD with the nibbles swapped inside each byte. */
    private fun decodeBcdNibbleSwapped(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }
            .chunked(2)
            .joinToString("") { it.reversed() }
}
