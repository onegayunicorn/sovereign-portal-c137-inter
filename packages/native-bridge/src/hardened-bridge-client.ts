// =============================================================================
// HardenedBridgeClient — zero-trust, HMAC-SHA256 signed native IPC
// -----------------------------------------------------------------------------
// Protocol (matches the native Kotlin HardenedSovereignBridge byte-for-byte):
//   canonical = `${command}:${nonce}:${timestamp}:${payload}`
//   signature = HMAC-SHA256(canonical, sessionKey)  -> lowercase hex
//   envelope  = { command, nonce, timestamp, payload, signature }
// Hardening:
//   * UUIDv4 single-use nonce (anti-replay)
//   * ±3000 ms timestamp freshness window
//   * explicit command allowlist
//   * browser-sandbox fallback (never throws on absent host)
// =============================================================================

import { detectNativePlatform, generateUuidV4, type NativePlatform } from "./bridge-client";

export interface BridgeMessage<T = unknown> {
  command: string;
  nonce: string;
  timestamp: number;
  payload: T;
  signature: string;
}

export interface HardenedBridgeOptions {
  /** Ephemeral session secret exchanged during runtime initialisation. */
  sessionKey: string;
  allowedCommands?: string[];
  /** Accepted clock skew window in ms (default 3000). */
  nonceWindowMs?: number;
  /** Called whenever the browser-sandbox fallback path is taken. */
  onSandbox?: (reason: string) => void;
}

export interface HardenedBridgeResponse<T = unknown> {
  status: "SUCCESS" | "SANDBOX" | "ERROR";
  nonce?: string;
  data?: T;
  simulated?: boolean;
  error?: string;
}

export const DEFAULT_ALLOWED_COMMANDS = [
  "TRIGGER_HAPTIC",
  "READ_BATTERY_TELEMETRY",
  "READ_BATTERY_VOLTAGE",
  "READ_HARDWARE_SENSORS",
  "SYNC_LOCAL_STATE",
  "SYNC_OFFLINE_STORAGE",
] as const;

const DEFAULT_NONCE_WINDOW_MS = 3000;

export class HardenedBridgeClient {
  private readonly sessionKey: string;
  private readonly platform: NativePlatform;
  private readonly allowedCommands: Set<string>;
  private readonly nonceWindowMs: number;
  private readonly onSandbox?: (reason: string) => void;

  /** Ring buffer of nonces this device has already emitted (local anti-replay). */
  private readonly issuedNonces = new Set<string>();
  private static readonly MAX_NONCE_MEMORY = 1000;

  constructor(options: HardenedBridgeOptions) {
    if (!options.sessionKey) {
      throw new Error("HardenedBridgeClient requires a non-empty sessionKey");
    }
    this.sessionKey = options.sessionKey;
    this.platform = detectNativePlatform();
    this.allowedCommands = new Set(options.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS);
    this.nonceWindowMs = options.nonceWindowMs ?? DEFAULT_NONCE_WINDOW_MS;
    this.onSandbox = options.onSandbox;
  }

  get runtime(): NativePlatform {
    return this.platform;
  }

  get isSandbox(): boolean {
    return this.platform === "browser";
  }

  /**
   * Build, sign, and dispatch a hardened command envelope.
   */
  async sendCommand<TReq = Record<string, unknown>, TRes = unknown>(
    command: string,
    payload: TReq = {} as TReq
  ): Promise<HardenedBridgeResponse<TRes>> {
    if (!this.allowedCommands.has(command)) {
      return { status: "ERROR", error: "UNAUTHORIZED_COMMAND" };
    }

    if (this.platform === "browser") {
      const reason = "Native bridge not mounted. Operating in browser sandbox mode.";
      console.warn(`[HardenedBridge] ${reason}`);
      this.onSandbox?.(reason);
      return { status: "SANDBOX", simulated: true, data: payload as unknown as TRes };
    }

    const nonce = this.mintNonce();
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);

    // Canonical signing string — MUST match the native host exactly.
    const canonical = `${command}:${nonce}:${timestamp}:${payloadStr}`;
    const signature = await this.hmacSha256(canonical, this.sessionKey);

    const envelope: BridgeMessage<TReq> = {
      command,
      nonce,
      timestamp,
      payload,
      signature,
    };

    try {
      const raw = await this.dispatch(envelope);
      const parsed = JSON.parse(raw) as HardenedBridgeResponse<TRes>;
      if (parsed.status !== "SUCCESS" && parsed.status !== "SANDBOX") {
        throw new Error(`Native Bridge Error: ${parsed.error}`);
      }
      return parsed;
    } catch (err) {
      return { status: "ERROR", error: (err as Error).message };
    }
  }

  /**
   * Verify an *inbound* envelope's signature + freshness (host -> web direction).
   */
  async verifyEnvelope<T = unknown>(envelope: BridgeMessage<T>): Promise<boolean> {
    const age = Math.abs(Date.now() - envelope.timestamp);
    if (age > this.nonceWindowMs) return false;

    const payloadStr = JSON.stringify(envelope.payload);
    const canonical = `${envelope.command}:${envelope.nonce}:${envelope.timestamp}:${payloadStr}`;
    const expected = await this.hmacSha256(canonical, this.sessionKey);
    return timingSafeEqual(expected, envelope.signature);
  }

  // --- internals ------------------------------------------------------------

  private mintNonce(): string {
    const nonce = generateUuidV4();
    this.issuedNonces.add(nonce);
    if (this.issuedNonces.size > HardenedBridgeClient.MAX_NONCE_MEMORY) {
      const oldest = this.issuedNonces.values().next().value as string | undefined;
      if (oldest) this.issuedNonces.delete(oldest);
    }
    return nonce;
  }

  private async dispatch(envelope: BridgeMessage): Promise<string> {
    const w = window as Window;
    const json = JSON.stringify(envelope);

    if (typeof w.SovereignBridge !== "undefined") {
      return Promise.resolve(w.SovereignBridge.dispatchSecure?.(json) ?? "{}");
    }
    if (typeof w.SovereignAndroidBridge !== "undefined") {
      return Promise.resolve(w.SovereignAndroidBridge.dispatchSecure?.(json) ?? "{}");
    }
    if (typeof w.__TAURI_INVOKE__ !== "undefined") {
      const res = await w.__TAURI_INVOKE__("sovereign_bridge", envelope);
      return typeof res === "string" ? res : JSON.stringify(res);
    }
    if (typeof w.SovereignElectronBridge !== "undefined") {
      return Promise.resolve(w.SovereignElectronBridge.dispatchSecure?.(json) ?? "{}");
    }
    if (typeof w.webkit?.messageHandlers?.sovereign !== "undefined") {
      w.webkit.messageHandlers.sovereign.postMessage(envelope);
      return "{}";
    }
    return "{}";
  }

  private async hmacSha256(message: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
    return Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

/** Constant-time string comparison for signatures. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export default HardenedBridgeClient;
