// =============================================================================
// @portal/gist-sync — public package surface
// =============================================================================

export { GistSyncClient } from "./gist-client";
export type { GistSyncClientOptions, GistImportResult } from "./gist-client";

export {
  buildPortalGistPayload,
  serializePortalPayload,
  deserializePortalPayload,
  payloadFilename,
  payloadChecksum,
  PORTAL_DEFAULTS,
  PORTAL_GIST_SCHEMA_VERSION,
} from "./coordinate-pack";
export type {
  PortalGistPayload,
  PortalCoordinateSnapshot,
  OrchestratorLogEntry,
  OfflineModelConfig,
  BuildPayloadInput,
} from "./coordinate-pack";

export const GIST_SYNC_VERSION = "1.0.0";
