// =============================================================================
// @portal/native-bridge — public package surface
// =============================================================================

export {
  BridgeClient,
  detectNativePlatform,
  isNativeAvailable,
  generateUuidV4,
} from "./bridge-client";
export type {
  NativePlatform,
  NativeBridgeHost,
  BridgeInvokeResult,
  BridgeClientOptions,
} from "./bridge-client";

export {
  HardenedBridgeClient,
  timingSafeEqual,
  DEFAULT_ALLOWED_COMMANDS,
} from "./hardened-bridge-client";
export type {
  BridgeMessage,
  HardenedBridgeOptions,
  HardenedBridgeResponse,
} from "./hardened-bridge-client";

export const NATIVE_BRIDGE_VERSION = "1.0.0";
export const BRIDGE_NONCE_WINDOW_MS = 3000;
