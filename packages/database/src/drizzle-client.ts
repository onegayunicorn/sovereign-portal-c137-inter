// =============================================================================
// Drizzle Client — local SQLite (better-sqlite3) + libSQL / Turso edge variant
// -----------------------------------------------------------------------------
// Two construction paths:
//   createLocalDrizzleClient()  -> synchronous better-sqlite3, browser/desktop
//   createEdgeDrizzleClient()   -> libSQL / Turso HTTP client for edge workers
// Both share the sqlite-core schema in ../drizzle/schema.ts.
// =============================================================================

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "../drizzle/schema";

export type LocalDrizzleClient = BetterSQLite3Database<typeof schema>;
export type EdgeDrizzleClient = LibSQLDatabase<typeof schema>;

/**
 * Local-first, fully offline client backed by a real SQLite file.
 * Used by desktop / portable / Tauri / Capacitor runtimes.
 */
export function createLocalDrizzleClient(
  dbPath = process.env.LOCAL_SQLITE_PATH ?? "portal-c137.local.db"
): LocalDrizzleClient {
  // Imported lazily so browser bundles never pull the native binary.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db: LocalDrizzleClient = drizzle(sqlite, { schema });
  ensureLocalTables(db, sqlite);
  return db;
}

/**
 * Edge / serverless client over libSQL (Turso, Cloudflare-compatible).
 * Falls back to a local `file:` URL when no remote endpoint is configured.
 */
export function createEdgeDrizzleClient(
  url = process.env.LIBSQL_URL ?? "file:portal-c137.edge.db",
  authToken = process.env.LIBSQL_AUTH_TOKEN
): EdgeDrizzleClient {
  const { createClient } = require("@libsql/client");
  const { drizzle } = require("drizzle-orm/libsql");

  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

/** Idempotent DDL for the local plane (mirrors drizzle-kit push output). */
function ensureLocalTables(db: LocalDrizzleClient, sqlite: any): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_coordinates (
      id TEXT PRIMARY KEY,
      dimension_code TEXT NOT NULL UNIQUE,
      stability REAL NOT NULL DEFAULT 1.0,
      resonance_hz INTEGER NOT NULL DEFAULT 1207,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      gist_url TEXT,
      synced_to_cloud INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      quantum_coherence REAL NOT NULL,
      flux_decay REAL NOT NULL,
      active_universe_id TEXT NOT NULL,
      status_flag TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interactive_cues (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      cue_type TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_logs (
      gist_id TEXT PRIMARY KEY,
      last_synced_at INTEGER NOT NULL,
      checksum TEXT NOT NULL
    );
  `);
  void db;
}

export { schema };
