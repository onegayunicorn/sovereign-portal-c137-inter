// =============================================================================
// BridgeClient — native platform detection + plain invoke (non-crypto baseline)
// -----------------------------------------------------------------------------
// Detects every sovereign host runtime exposed to the web layer and dispatches
// a command to whichever one is present. The cryptographically hardened variant
// (HMAC-SHA256 + anti-replay nonce) lives in ./hardened-bridge-client.ts and
// shares the same detection logic.
// =============================================================================

export type NativePlatform =
  | "android"
  | "tauri"
  | "electron"
  | "ios"
  | "browser";

export interface BridgeInvokeResult<T = unknown> {
  status: string;
  data?: T;
  simulated?: boolean;
  error?: string;
}

/** The minimal contract every native host bridge must expose. */
export interface NativeBridgeHost {
  dispatchSecure?: (envelopeJson: string) => string;
  executeCommand?: (envelopeJson: string) => string;
  invokeNativeHardware?: (command: string, payloadJson: string) => string;
}

declare global {
  interface Window {
    SovereignBridge?: NativeBridgeHost;
    SovereignAndroidBridge?: NativeBridgeHost;
    SovereignElectronBridge?: NativeBridgeHost;
    __TAURI_INVOKE__?: (cmd: string, args: unknown) => Promise<unknown>;
    webkit?: { messageHandlers?: Record<string, { postMessage: (m: unknown) => void }> };
  }
}

/**
 * Detect which sovereign native runtime (if any) is hosting this web layer.
 * Mirrors the detection order used by the hardened client.
 */
export function detectNativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "browser";
  if (typeof window.SovereignBridge !== "undefined") return "android";
  if (typeof window.SovereignAndroidBridge !== "undefined") return "android";
  if (typeof window.__TAURI_INVOKE__ !== "undefined") return "tauri";
  if (typeof window.SovereignElectronBridge !== "undefined") return "electron";
  if (typeof window.webkit?.messageHandlers?.sovereign !== "undefined") return "ios";
  return "browser";
}

export function isNativeAvailable(): boolean {
  return detectNativePlatform() !== "browser";
}

export interface BridgeClientOptions {
  /** Command allowlist; anything else is rejected before dispatch. */
  allowedCommands?: string[];
  /** Max accepted |now - timestamp| for anti-replay, in ms. */
  nonceWindowMs?: number;
}

const DEFAULT_ALLOWED = [
  "TRIGGER_HAPTIC",
  "READ_BATTERY_TELEMETRY",
  "READ_BATTERY_VOLTAGE",
  "READ_HARDWARE_SENSORS",
  "SYNC_LOCAL_STATE",
  "SYNC_OFFLINE_STORAGE",
];

/**
 * Plain bridge client. Prefer {@link HardenedBridgeClient} for any host that
 * exposes `dispatchSecure` — this class exists for lightweight/legacy hosts.
 */
export class BridgeClient {
  protected readonly platform: NativePlatform;
  protected readonly allowedCommands: Set<string>;
  protected readonly nonceWindowMs: number;

  constructor(options: BridgeClientOptions = {}) {
    this.platform = detectNativePlatform();
    this.allowedCommands = new Set(options.allowedCommands ?? DEFAULT_ALLOWED);
    this.nonceWindowMs = options.nonceWindowMs ?? 3000;
  }

  get runtime(): NativePlatform {
    return this.platform;
  }

  get nativeAvailable(): boolean {
    return this.platform !== "browser";
  }

  /** Dispatch a command; returns a browser-sandbox stub if no host is present. */
  async invoke<TReq = Record<string, unknown>, TRes = unknown>(
    command: string,
    payload: TReq = {} as TReq
  ): Promise<BridgeInvokeResult<TRes>> {
    if (!this.allowedCommands.has(command)) {
      return { status: "ERROR", error: "UNAUTHORIZED_COMMAND" };
    }

    if (this.platform === "browser") {
      console.warn("[BridgeClient] Native bridge absent. Browser-sandbox fallback engaged.");
      return { status: "SANDBOX", simulated: true, data: payload as unknown as TRes };
    }

    const envelope = {
      command,
      payload,
      timestamp: Date.now(),
      nonce: generateUuidV4(),
    };

    try {
      const raw = this.dispatchToHost(envelope);
      const parsed = JSON.parse(raw) as BridgeInvokeResult<TRes>;
      return parsed;
    } catch (err) {
      return { status: "ERROR", error: (err as Error).message };
    }
  }

  private dispatchToHost(envelope: unknown): string | Promise<string> {
    const w = window as Window;
    const json = JSON.stringify(envelope);

    switch (this.platform) {
      case "android":
        return (
          w.SovereignBridge?.executeCommand?.(json) ??
          w.SovereignAndroidBridge?.executeCommand?.(json) ??
          "{}"
        );
      case "electron":
        return w.SovereignElectronBridge?.executeCommand?.(json) ?? "{}";
      case "ios":
        w.webkit?.messageHandlers?.sovereign?.postMessage(envelope);
        return "{}";
      default:
        return "{}";
    }
  }
}

/** RFC-4122 v4 UUID generator (uses crypto.randomUUID when available). */
export function generateUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default BridgeClient;
