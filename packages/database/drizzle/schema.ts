// =============================================================================
// Sovereign Portal C-137 — Local / Edge Schema (SQLite core via Drizzle ORM)
// -----------------------------------------------------------------------------
// Drizzle ORM is the LOCAL-FIRST plane: browser sqlite-wasm, better-sqlite3 on
// desktop/portable builds, and libSQL / Turso at the edge. Zero bundle bloat,
// synchronous reads, and background batch reconciliation into Prisma (Postgres).
// =============================================================================

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const localCoordinates = sqliteTable("local_coordinates", {
  id: text("id").primaryKey(),
  dimensionCode: text("dimension_code").notNull().unique(),
  stability: real("stability").default(1.0).notNull(),
  resonanceHz: integer("resonance_hz").default(1207).notNull(),
  status: text("status").default("ACTIVE").notNull(),
  gistUrl: text("gist_url"),
  syncedToCloud: integer("synced_to_cloud", { mode: "boolean" }).default(false).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const telemetryEvents = sqliteTable("telemetry_events", {
  id: text("id").primaryKey(),
  timestamp: integer("timestamp").notNull(),
  quantumCoherence: real("quantum_coherence").notNull(),
  fluxDecay: real("flux_decay").notNull(),
  activeUniverseId: text("active_universe_id").notNull(),
  statusFlag: text("status_flag").notNull(),
});

export const interactiveCues = sqliteTable("interactive_cues", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull(),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  cueType: text("cue_type").notNull(), // hotspot | branch_choice | telemetry_ping | cv_track
  payloadJson: text("payload_json").notNull(),
});

export const syncLogs = sqliteTable("sync_logs", {
  gistId: text("gist_id").primaryKey(),
  lastSyncedAt: integer("last_synced_at").notNull(),
  checksum: text("checksum").notNull(),
});

export type LocalCoordinate = typeof localCoordinates.$inferSelect;
export type LocalCoordinateInsert = typeof localCoordinates.$inferInsert;
export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type TelemetryEventInsert = typeof telemetryEvents.$inferInsert;
export type InteractiveCue = typeof interactiveCues.$inferSelect;
export type InteractiveCueInsert = typeof interactiveCues.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type SyncLogInsert = typeof syncLogs.$inferInsert;
