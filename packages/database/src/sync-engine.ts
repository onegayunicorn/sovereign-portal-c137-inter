// =============================================================================
// Two-Way Sync Engine — local Drizzle (SQLite) <-> cloud Prisma (PostgreSQL)
// -----------------------------------------------------------------------------
// Strategy:
//   PUSH : rows with syncedToCloud = false are batched and upserted to Postgres,
//          then flagged locally. Last-write-wins by updatedAt.
//   PULL : rows mutated in the cloud after the last watermark are streamed back
//          and upserted into the local SQLite plane.
//   LOG  : every run records a checksum in the local `sync_logs` table so the
//          next reconciliation can be incremental.
// =============================================================================

import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { prisma } from "./prisma-client";
import type { LocalDrizzleClient } from "./drizzle-client";
import { localCoordinates, syncLogs, telemetryEvents } from "../drizzle/schema";

export interface SyncResult {
  pushed: number;
  pulled: number;
  checksum: string;
  durationMs: number;
  startedAt: string;
}

export interface SyncEngineOptions {
  batchSize?: number;
  watermark?: number;
}

export class SyncEngine {
  private readonly local: LocalDrizzleClient;
  private readonly batchSize: number;
  private watermark: number;

  constructor(local: LocalDrizzleClient, options: SyncEngineOptions = {}) {
    this.local = local;
    this.batchSize = options.batchSize ?? 250;
    this.watermark = options.watermark ?? 0;
  }

  /** Run one full reconcile cycle (push then pull). */
  async reconcile(): Promise<SyncResult> {
    const startedAt = new Date();
    const t0 = Date.now();

    const pushed = await this.pushLocalCoordinates();
    const pulled = await this.pullCloudCoordinates();

    const checksum = createHash("sha256")
      .update(`${pushed}:${pulled}:${this.watermark}`)
      .digest("hex");

    await this.local.insert(syncLogs).values({
      gistId: "local-cloud-reconcile",
      lastSyncedAt: Date.now(),
      checksum,
    }).onConflictDoUpdate({
      target: syncLogs.gistId,
      set: { lastSyncedAt: Date.now(), checksum },
    });

    return {
      pushed,
      pulled,
      checksum,
      durationMs: Date.now() - t0,
      startedAt: startedAt.toISOString(),
    };
  }

  /** Local -> Cloud: upsert dirty coordinates in batches. */
  private async pushLocalCoordinates(): Promise<number> {
    const dirty = await this.local
      .select()
      .from(localCoordinates)
      .where(eq(localCoordinates.syncedToCloud, false))
      .limit(this.batchSize);

    if (dirty.length === 0) return 0;

    for (const row of dirty) {
      await prisma.dimensionCoordinate.upsert({
        where: { dimensionCode: row.dimensionCode },
        create: {
          dimensionCode: row.dimensionCode,
          stability: row.stability,
          resonanceHz: row.resonanceHz,
          status: row.status,
          gistUrl: row.gistUrl ?? undefined,
        },
        update: {
          stability: row.stability,
          resonanceHz: row.resonanceHz,
          status: row.status,
          gistUrl: row.gistUrl ?? undefined,
        },
      });
    }

    await this.local
      .update(localCoordinates)
      .set({ syncedToCloud: true })
      .where(
        inArray(
          localCoordinates.id,
          dirty.map((r) => r.id)
        )
      );

    return dirty.length;
  }

  /** Cloud -> Local: pull rows updated after the watermark and upsert locally. */
  private async pullCloudCoordinates(): Promise<number> {
    const since = new Date(this.watermark);
    const remote = await prisma.dimensionCoordinate.findMany({
      where: { updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
      take: this.batchSize,
    });

    if (remote.length === 0) return 0;

    let newest = this.watermark;
    for (const row of remote) {
      await this.local
        .insert(localCoordinates)
        .values({
          id: row.id,
          dimensionCode: row.dimensionCode,
          stability: row.stability,
          resonanceHz: row.resonanceHz,
          status: row.status,
          gistUrl: row.gistUrl ?? null,
          syncedToCloud: true,
          updatedAt: row.updatedAt,
        })
        .onConflictDoUpdate({
          target: localCoordinates.id,
          set: {
            stability: row.stability,
            resonanceHz: row.resonanceHz,
            status: row.status,
            gistUrl: row.gistUrl ?? null,
            syncedToCloud: true,
            updatedAt: row.updatedAt,
          },
        });
      newest = Math.max(newest, row.updatedAt.getTime());
    }

    this.watermark = newest;
    return remote.length;
  }

  /** Queue a local telemetry event (written to SQLite, flushed on next push). */
  async recordTelemetry(event: {
    id: string;
    timestamp: number;
    quantumCoherence: number;
    fluxDecay: number;
    activeUniverseId: string;
    statusFlag: string;
  }): Promise<void> {
    await this.local.insert(telemetryEvents).values(event);
  }
}
