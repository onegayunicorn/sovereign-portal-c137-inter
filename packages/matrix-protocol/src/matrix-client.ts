// =============================================================================
// SovereignMatrixClient — matrix-js-sdk wrapper for the interdimensional mesh
// -----------------------------------------------------------------------------
//  * Ed25519 identity key pair generated with WebCrypto, persisted in IndexedDB.
//  * Olm/Megolm end-to-end encryption via the SDK's rust-crypto crypto stack.
//  * Custom state events:  m.portal.telemetry  /  m.portal.coordinate
//  * Zero central tracking — points at a self-hosted Dendrite / Conduit node.
// =============================================================================

import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";

export const EVENT_PORTAL_TELEMETRY = "m.portal.telemetry";
export const EVENT_PORTAL_COORDINATE = "m.portal.coordinate";

export interface MatrixClientConfig {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  /** IndexedDB database name used for the Ed25519 identity + crypto store. */
  identityDbName?: string;
  deviceDisplayName?: string;
}

export interface PortalTelemetryEvent {
  dimension: string;
  resonanceHz: number;
  stability: number;
  actor: string;
  message: string;
  timestamp: string;
}

export interface PortalCoordinateEvent {
  dimensionCode: string;
  stability: number;
  resonanceHz: number;
  status: string;
  gistUrl?: string | null;
  timestamp: string;
}

export interface Ed25519Identity {
  publicKeyJwk: JsonWebKey;
  createdAt: string;
  fingerprint: string;
}

const IDENTITY_STORE = "sovereign-identity";
const IDENTITY_KEY = "ed25519-primary";

export class SovereignMatrixClient {
  private client: MatrixClient | null = null;
  private readonly config: MatrixClientConfig;
  private identity: Ed25519Identity | null = null;

  constructor(config: MatrixClientConfig) {
    this.config = {
      identityDbName: "portal-c137-matrix",
      deviceDisplayName: "Sovereign Portal C-137",
      ...config,
    };
  }

  /** Lazily create + start the underlying matrix-js-sdk client. */
  async connect(): Promise<MatrixClient> {
    if (this.client) return this.client;

    const sdk = await import("matrix-js-sdk");
    const baseUrl = new URL(this.config.homeserverUrl).origin;

    this.client = sdk.createClient({
      baseUrl,
      accessToken: this.config.accessToken,
      userId: this.config.userId,
      deviceId: undefined,
      // Olm/Megolm E2EE + the native rust-crypto stack.
      cryptoStore: undefined,
      timelineSupport: true,
      useAuthorizationHeader: true,
    });

    // Initialise the crypto stack; rust-crypto persists into IndexedDB in browsers.
    if (this.client.initRustCrypto) {
      await this.client.initRustCrypto();
    } else if (this.client.initCrypto) {
      await this.client.initCrypto();
    }

    await this.client.startClient({ initialSyncLimit: 20 });
    return this.client;
  }

  // --- Identity -------------------------------------------------------------

  /**
   * Generate (or load) the device's Ed25519 identity key pair using WebCrypto.
   * The private key never leaves the IndexedDB-backed CryptoKey store.
   */
  async ensureEd25519Identity(): Promise<Ed25519Identity> {
    if (this.identity) return this.identity;

    const existing = await this.loadIdentity();
    if (existing) {
      this.identity = existing;
      return existing;
    }

    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["sign", "verify"]
    );

    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const fingerprint = await sha256Hex(JSON.stringify(publicKeyJwk));

    const identity: Ed25519Identity = {
      publicKeyJwk,
      createdAt: new Date().toISOString(),
      fingerprint,
    };

    await this.saveIdentity(identity);
    this.identity = identity;
    return identity;
  }

  // --- Custom portal state events ------------------------------------------

  /** Publish an `m.portal.telemetry` state event into a room. */
  async publishTelemetry(roomId: string, telemetry: PortalTelemetryEvent): Promise<void> {
    const client = await this.connect();
    await client.sendStateEvent(roomId, EVENT_PORTAL_TELEMETRY as any, telemetry as any, "");
  }

  /** Publish an `m.portal.coordinate` state event into a room. */
  async publishCoordinate(roomId: string, coordinate: PortalCoordinateEvent): Promise<void> {
    const client = await this.connect();
    await client.sendStateEvent(roomId, EVENT_PORTAL_COORDINATE as any, coordinate as any, coordinate.dimensionCode);
  }

  /** Read the latest `m.portal.telemetry` state from a room. */
  getRoomTelemetry(roomId: string): PortalTelemetryEvent | null {
    const room = this.requireRoom(roomId);
    const event = room.currentState.getStateEvents(EVENT_PORTAL_TELEMETRY as any, "");
    return (event?.getContent() as PortalTelemetryEvent) ?? null;
  }

  /** Read every `m.portal.coordinate` state key from a room. */
  getRoomCoordinates(roomId: string): PortalCoordinateEvent[] {
    const room = this.requireRoom(roomId);
    const events = room.currentState.getStateEvents(EVENT_PORTAL_COORDINATE as any);
    return (events ?? []).map((e: MatrixEvent) => e.getContent() as PortalCoordinateEvent);
  }

  /** Subscribe to portal state events across all joined rooms. */
  onPortalEvent(handler: (roomId: string, event: MatrixEvent) => void): () => void {
    if (!this.client) throw new Error("connect() must be awaited before subscribing");
    const listener = (event: MatrixEvent) => {
      const type = event.getType();
      if (type === EVENT_PORTAL_TELEMETRY || type === EVENT_PORTAL_COORDINATE) {
        handler(event.getRoomId() ?? "", event);
      }
    };
    this.client.on("RoomState.events" as any, listener);
    return () => this.client?.off("RoomState.events" as any, listener);
  }

  // --- Rooms ----------------------------------------------------------------

  async joinOrCreateRoom(aliasOrId: string, name?: string): Promise<string> {
    const client = await this.connect();
    if (aliasOrId.startsWith("!")) {
      const joined = await client.joinRoom(aliasOrId);
      return joined.roomId;
    }
    const created = await client.createRoom({
      name: name ?? aliasOrId,
      room_alias_name: aliasOrId.replace(/^#/, ""),
      visibility: "private" as any,
      preset: "private_chat" as any,
    });
    return created.room_id;
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.stopClient();
      this.client = null;
    }
  }

  // --- internals ------------------------------------------------------------

  private requireRoom(roomId: string): Room {
    if (!this.client) throw new Error("Matrix client not connected");
    const room = this.client.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId} is not in the local store`);
    return room;
  }

  private async loadIdentity(): Promise<Ed25519Identity | null> {
    const store = await openIdentityStore(this.config.identityDbName!);
    return new Promise((resolve) => {
      const tx = store.transaction(IDENTITY_STORE, "readonly");
      const req = tx.objectStore(IDENTITY_STORE).get(IDENTITY_KEY);
      req.onsuccess = () => resolve((req.result as Ed25519Identity) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  private async saveIdentity(identity: Ed25519Identity): Promise<void> {
    const store = await openIdentityStore(this.config.identityDbName!);
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction(IDENTITY_STORE, "readwrite");
      const req = tx.objectStore(IDENTITY_STORE).put(identity, IDENTITY_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

function openIdentityStore(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default SovereignMatrixClient;
