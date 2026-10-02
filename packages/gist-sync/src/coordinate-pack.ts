// =============================================================================
// coordinate-pack.ts — PortalGistPayload serialization
// -----------------------------------------------------------------------------
// Canonical, versioned JSON envelope used for sovereign state export/import.
// Matches the blueprint schema exactly:
//   { dimension, resonance, stability, orchestratorLogs[], offlineModelConfig }
// plus forward-compatible extensions (coordinates + telemetry + checksum).
// =============================================================================

export interface OrchestratorLogEntry {
  actor: string;
  text: string;
  time: string;
}

export interface OfflineModelConfig {
  model: string;
  temperature: number;
}

export interface PortalGistPayload {
  dimension: string;
  resonance: number;
  stability: number;
  orchestratorLogs: OrchestratorLogEntry[];
  offlineModelConfig: OfflineModelConfig;
  /** Extension: pinned coordinate rows mirrored from the local plane. */
  coordinates?: PortalCoordinateSnapshot[];
  /** Extension: schema version for forward/backward compatibility. */
  schemaVersion?: string;
  /** Extension: ISO timestamp of the export. */
  generatedAt?: string;
}

export interface PortalCoordinateSnapshot {
  dimensionCode: string;
  stability: number;
  resonanceHz: number;
  status: string;
  gistUrl?: string | null;
}

export const PORTAL_GIST_SCHEMA_VERSION = "1.0.0";

/** Runtime defaults for the sovereign portal (C-137). */
export const PORTAL_DEFAULTS = {
  dimension: "C-137",
  resonance: 1207,
  stability: 0.9987,
  offlineModel: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  temperature: 0.7,
} as const;

export interface BuildPayloadInput {
  dimension?: string;
  resonance?: number;
  stability?: number;
  orchestratorLogs?: OrchestratorLogEntry[];
  offlineModelConfig?: Partial<OfflineModelConfig>;
  coordinates?: PortalCoordinateSnapshot[];
}

/** Build a complete, normalized payload from partial input. */
export function buildPortalGistPayload(input: BuildPayloadInput = {}): PortalGistPayload {
  return {
    dimension: input.dimension ?? PORTAL_DEFAULTS.dimension,
    resonance: input.resonance ?? PORTAL_DEFAULTS.resonance,
    stability: input.stability ?? PORTAL_DEFAULTS.stability,
    orchestratorLogs: input.orchestratorLogs ?? [],
    offlineModelConfig: {
      model: input.offlineModelConfig?.model ?? PORTAL_DEFAULTS.offlineModel,
      temperature: input.offlineModelConfig?.temperature ?? PORTAL_DEFAULTS.temperature,
    },
    coordinates: input.coordinates ?? [],
    schemaVersion: PORTAL_GIST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

/** Stable JSON string (2-space pretty print) for Gist file content. */
export function serializePortalPayload(payload: PortalGistPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Parse + validate a payload string back into a PortalGistPayload. */
export function deserializePortalPayload(raw: string): PortalGistPayload {
  const parsed = JSON.parse(raw) as Partial<PortalGistPayload>;
  if (typeof parsed.dimension !== "string") {
    throw new Error("Invalid PortalGistPayload: missing `dimension`");
  }
  return buildPortalGistPayload({
    dimension: parsed.dimension,
    resonance: parsed.resonance,
    stability: parsed.stability,
    orchestratorLogs: parsed.orchestratorLogs,
    offlineModelConfig: parsed.offlineModelConfig,
    coordinates: parsed.coordinates,
  });
}

/** Deterministic filename slug used as the Gist file key. */
export function payloadFilename(dimension: string): string {
  return `portal-${dimension.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
}

/** Minimal integrity checksum (djb2) — handy for local sync_logs. */
export function payloadChecksum(payload: PortalGistPayload): string {
  const str = serializePortalPayload(payload);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
