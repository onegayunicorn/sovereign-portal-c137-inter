// =============================================================================
// @portal/database — public package surface
// =============================================================================

export { prisma, assertCloudConnected, disconnectPrisma } from "./prisma-client";
export {
  createLocalDrizzleClient,
  createEdgeDrizzleClient,
  schema as drizzleSchema,
} from "./drizzle-client";
export type { LocalDrizzleClient, EdgeDrizzleClient } from "./drizzle-client";
export { SyncEngine } from "./sync-engine";
export type { SyncResult, SyncEngineOptions } from "./sync-engine";

// Local (Drizzle / SQLite) table definitions + inferred types.
export {
  localCoordinates,
  telemetryEvents,
  interactiveCues,
  syncLogs,
} from "../drizzle/schema";
export type {
  LocalCoordinate,
  LocalCoordinateInsert,
  TelemetryEvent,
  TelemetryEventInsert,
  InteractiveCue,
  InteractiveCueInsert,
  SyncLog,
  SyncLogInsert,
} from "../drizzle/schema";

export const PORTAL_DB_VERSION = "1.0.0";
export const DEFAULT_DIMENSION = "C-137";
export const DEFAULT_RESONANCE_HZ = 1207;
