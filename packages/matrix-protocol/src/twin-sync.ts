// =============================================================================
// TwinSync — peer-to-peer interdimensional state synchronizer over Matrix rooms
// -----------------------------------------------------------------------------
// Each device ("dimension") is a peer in a shared, E2EE Matrix room. TwinSync
//     1. gossips local coordinate/telemetry deltas as m.portal.* state events,
//     2. reconciles remote deltas into the local sovereign store, and
//     3. resolves conflicts deterministically by (updatedAt, deviceId) vectors.
// =============================================================================

import type { MatrixEvent } from "matrix-js-sdk";
import {
  SovereignMatrixClient,
  EVENT_PORTAL_COORDINATE,
  EVENT_PORTAL_TELEMETRY,
  type PortalCoordinateEvent,
} from "./matrix-client";

export interface TwinSyncConfig {
  client: SovereignMatrixClient;
  roomId: string;
  /** Stable identifier for this device/dimension, e.g. "device-workstation". */
  deviceId: string;
  /** How often, in ms, to gossip a full coordinate snapshot. */
  heartbeatMs?: number;
}

export interface TwinPeerState {
  deviceId: string;
  dimensionCode: string;
  stability: number;
  resonanceHz: number;
  status: string;
  revision: number;
  updatedAt: string;
}

export type TwinSyncListener = (peers: Map<string, TwinPeerState>) => void;

const LD_CLOCK_VERSION = 1;

export class TwinSync {
  private readonly client: SovereignMatrixClient;
  private readonly roomId: string;
  private readonly deviceId: string;
  private readonly heartbeatMs: number;

  private readonly peers = new Map<string, TwinPeerState>();
  private readonly revision = new Map<string, number>();
  private listeners = new Set<TwinSyncListener>();
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: TwinSyncConfig) {
    this.client = config.client;
    this.roomId = config.roomId;
    this.deviceId = config.deviceId;
    this.heartbeatMs = config.heartbeatMs ?? 15_000;
  }

  /** Begin listening for remote twin state and emitting periodic heartbeats. */
  async start(): Promise<void> {
    if (this.running) return;
    await this.client.connect();
    this.running = true;

    this.unsubscribe = this.client.onPortalEvent((roomId, event) => {
      if (roomId !== this.roomId) return;
      this.ingestRemoteEvent(event);
    });

    // Seed from the current room state.
    for (const coordinate of this.client.getRoomCoordinates(this.roomId)) {
      this.mergePeer(coordinate);
    }

    this.timer = setInterval(() => {
      void this.heartbeat();
    }, this.heartbeatMs);
  }

  /** Announce (or update) this device's authoritative coordinate state. */
  async publishLocalState(state: {
    dimensionCode: string;
    stability: number;
    resonanceHz: number;
    status: string;
    gistUrl?: string | null;
  }): Promise<void> {
    const nextRevision = (this.revision.get(state.dimensionCode) ?? 0) + 1;
    this.revision.set(state.dimensionCode, nextRevision);

    const payload: PortalCoordinateEvent = {
      ...state,
      timestamp: new Date().toISOString(),
    };
    await this.client.publishCoordinate(this.roomId, payload);

    this.peers.set(this.deviceId, {
      deviceId: this.deviceId,
      revision: nextRevision,
      updatedAt: payload.timestamp,
      ...state,
    });
    this.emit();
  }

  /** Push a telemetry ping that all twins react to in real time. */
  async broadcastTelemetry(message: string, resonanceHz: number, stability: number): Promise<void> {
    await this.client.publishTelemetry(this.roomId, {
      dimension: this.deviceId,
      resonanceHz,
      stability,
      actor: this.deviceId,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /** Snapshot of all currently-known peer states. */
  getPeers(): Map<string, TwinPeerState> {
    return new Map(this.peers);
  }

  /** Peer with the highest revision (the "governing" dimension). */
  getGoverningPeer(): TwinPeerState | null {
    let best: TwinPeerState | null = null;
    for (const peer of this.peers.values()) {
      if (!best || comparePeer(peer, best) < 0) best = peer;
    }
    return best;
  }

  subscribe(listener: TwinSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getPeers());
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.unsubscribe) this.unsubscribe();
    this.timer = null;
    this.unsubscribe = null;
  }

  // --- internals ------------------------------------------------------------

  private ingestRemoteEvent(event: MatrixEvent): void {
    if (event.getType() !== EVENT_PORTAL_COORDINATE) return;
    const content = event.getContent() as PortalCoordinateEvent;
    this.mergePeer(content);
  }

  private mergePeer(content: PortalCoordinateEvent): void {
    const key = content.dimensionCode;
    const incoming: TwinPeerState = {
      deviceId: this.deviceId,
      dimensionCode: key,
      stability: content.stability,
      resonanceHz: content.resonanceHz,
      status: content.status,
      revision: (this.revision.get(key) ?? 0) + 1,
      updatedAt: content.timestamp,
    };
    const current = this.peers.get(key);
    if (!current || comparePeer(incoming, current) < 0) {
      this.peers.set(key, incoming);
      this.revision.set(key, incoming.revision);
      this.emit();
    }
  }

  private async heartbeat(): Promise<void> {
    const governing = this.getGoverningPeer();
    if (!governing) return;
    await this.client.publishTelemetry(this.roomId, {
      dimension: governing.dimensionCode,
      resonanceHz: governing.resonanceHz,
      stability: governing.stability,
      actor: this.deviceId,
      message: `twin-heartbeat rev=${governing.revision}`,
      timestamp: new Date().toISOString(),
    });
  }

  private emit(): void {
    const snapshot = this.getPeers();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/**
 * Deterministic total order over peer states:
 * newer updatedAt wins; ties break on higher revision, then deviceId.
 */
function comparePeer(a: TwinPeerState, b: TwinPeerState): number {
  const ta = Date.parse(a.updatedAt) || 0;
  const tb = Date.parse(b.updatedAt) || 0;
  if (ta !== tb) return tb - ta; // newer first (negative => a is higher priority)
  if (a.revision !== b.revision) return b.revision - a.revision;
  return a.deviceId.localeCompare(b.deviceId);
}

export const TWIN_SYNC_VERSION = LD_CLOCK_VERSION;
export const TWIN_SYNC_STATE_VERSION = "1.0.0";
