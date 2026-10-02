// =============================================================================
// @portal/matrix-protocol — public package surface
// =============================================================================

export {
  SovereignMatrixClient,
  EVENT_PORTAL_TELEMETRY,
  EVENT_PORTAL_COORDINATE,
} from "./matrix-client";
export type {
  MatrixClientConfig,
  PortalTelemetryEvent,
  PortalCoordinateEvent,
  Ed25519Identity,
} from "./matrix-client";

export { TwinSync, TWIN_SYNC_VERSION, TWIN_SYNC_STATE_VERSION } from "./twin-sync";
export type { TwinSyncConfig, TwinPeerState, TwinSyncListener } from "./twin-sync";

export const MATRIX_PROTOCOL_VERSION = "1.0.0";
export const DEFAULT_MESH_ROOM_ALIAS = "#dimension-c137:sovereign.mesh";
