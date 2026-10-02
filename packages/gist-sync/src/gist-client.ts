// =============================================================================
// GistSyncClient — sovereign, serverless state sharing via GitHub Gists
// -----------------------------------------------------------------------------
// Operates in two modes:
//   * Token mode    : Authorization: Bearer <GITHUB_GIST_TOKEN> (private gists)
//   * Anonymous mode: no token (public gists, rate-limited)
// The export payload shape is the canonical PortalGistPayload (see coordinate-pack.ts).
// =============================================================================

import type { PortalGistPayload } from "./coordinate-pack";

export interface GistSyncClientOptions {
  /** Personal-access token. Falls back to process.env.GITHUB_GIST_TOKEN. */
  token?: string | null;
  /** Override the GitHub API base (e.g. GHES). */
  apiBase?: string;
  /** Injectable fetch (for tests / Deno / edge runtimes). */
  fetchImpl?: typeof fetch;
}

export interface GistImportResult {
  gistId: string;
  url: string;
  payload: PortalGistPayload;
}

export class GistSyncClient {
  private token: string | null;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(tokenOrOptions?: string | null | GistSyncClientOptions) {
    if (typeof tokenOrOptions === "object" && tokenOrOptions !== null) {
      this.token = tokenOrOptions.token ?? readEnvToken() ?? null;
      this.apiBase = (tokenOrOptions.apiBase ?? "https://api.github.com").replace(/\/$/, "");
      this.fetchImpl = tokenOrOptions.fetchImpl ?? globalThis.fetch.bind(globalThis);
    } else {
      this.token = tokenOrOptions ?? readEnvToken() ?? null;
      this.apiBase = "https://api.github.com";
      this.fetchImpl = globalThis.fetch.bind(globalThis);
    }
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  /**
   * Export a full portal state snapshot to a new GitHub Gist.
   * @returns the direct html_url of the created Gist.
   */
  async exportPortalState(payload: PortalGistPayload, isPublic = false): Promise<string> {
    const filename = `portal-${payload.dimension.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const body = {
      description: `Rick C-137 Portal Coordinate & Orchestrator Snapshot: ${payload.dimension}`,
      public: isPublic,
      files: {
        [filename]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    };

    const res = await this.fetchImpl(`${this.apiBase}/gists`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to create Gist: ${res.statusText}`);
    }

    const data = (await res.json()) as { html_url: string };
    return data.html_url; // Direct Gist URL
  }

  /** Import a portal state snapshot from an existing Gist (by id or URL). */
  async importPortalState(gistId: string): Promise<PortalGistPayload> {
    const id = GistSyncClient.parseGistId(gistId);

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await this.fetchImpl(`${this.apiBase}/gists/${id}`, { headers });
    if (!res.ok) throw new Error("Gist not found or unreachable");

    const data = (await res.json()) as { files: Record<string, { content: string }> };
    const firstFile = Object.values(data.files)[0] as { content: string };
    return JSON.parse(firstFile.content) as PortalGistPayload;
  }

  /** Import with gist metadata (id + url) alongside the payload. */
  async importPortalStateWithMeta(gistId: string): Promise<GistImportResult> {
    const id = GistSyncClient.parseGistId(gistId);
    const payload = await this.importPortalState(id);
    return { gistId: id, url: `https://gist.github.com/${id}`, payload };
  }

  /** Update an existing Gist in place (requires token mode). */
  async updatePortalState(gistId: string, payload: PortalGistPayload): Promise<string> {
    if (!this.token) throw new Error("updatePortalState requires an authenticated token");

    const id = GistSyncClient.parseGistId(gistId);
    const filename = `portal-${payload.dimension.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;

    const res = await this.fetchImpl(`${this.apiBase}/gists/${id}`, {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        files: { [filename]: { content: JSON.stringify(payload, null, 2) } },
      }),
    });

    if (!res.ok) throw new Error(`Failed to update Gist: ${res.statusText}`);
    const data = (await res.json()) as { html_url: string };
    return data.html_url;
  }

  /** Extract a bare Gist id from a raw id or any gist URL. */
  static parseGistId(gistIdOrUrl: string): string {
    const match = gistIdOrUrl.match(/([0-9a-f]{5,40})\/?$/i);
    return match ? match[1] : gistIdOrUrl;
  }
}

function readEnvToken(): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env.GITHUB_GIST_TOKEN;
  }
  return undefined;
}

export default GistSyncClient;
