import { useCallback, useEffect, useState } from 'react';

/**
 * useGist — sovereign telemetry transmission via the GitHub Gist API.
 * The token is operator-supplied and stored locally only (localStorage); it is
 * never sent anywhere except `api.github.com`.
 */

export interface PortalGistPayload {
  dimension: string;
  resonance: number;
  stability: number;
  orchestratorLogs: Array<{ actor: string; text: string; time: string }>;
  offlineModelConfig: { model: string; temperature: number };
}

export interface GistExportResult {
  gistId: string;
  url: string;
}

export interface UseGistResult {
  /** Persisted operator token, or null. */
  token: string | null;
  /** Persists (or clears) the GitHub token. */
  setToken: (token: string | null) => void;
  /** True while a Gist request is in flight. */
  transmitting: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Last successful export. */
  lastExport: GistExportResult | null;
  /** Creates a Gist from a payload. Resolves to null on failure. */
  exportPortalState: (payload: PortalGistPayload, isPublic?: boolean) => Promise<GistExportResult | null>;
  /** Clears the last error. */
  clearError: () => void;
}

const TOKEN_STORAGE_KEY = 'portal-c137.github-token';
const GIST_ENDPOINT = 'https://api.github.com/gists';

function gistFilename(dimension: string): string {
  const slug = dimension.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'c-137';
  return `portal-${slug}.json`;
}

export function useGist(initialToken?: string): UseGistResult {
  const [token, setTokenState] = useState<string | null>(() => {
    if (initialToken !== undefined) return initialToken;
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<GistExportResult | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — the token simply stays in memory.
    }
  }, [token]);

  const setToken = useCallback((next: string | null) => {
    setTokenState(next && next.trim().length > 0 ? next.trim() : null);
    setError(null);
  }, []);

  const exportPortalState = useCallback(
    async (payload: PortalGistPayload, isPublic = false): Promise<GistExportResult | null> => {
      if (!token) {
        setError('A GitHub token is required to transmit telemetry to a Gist.');
        return null;
      }

      setTransmitting(true);
      setError(null);

      try {
        const response = await fetch(GIST_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            description: `Portal C-137 Telemetry Snapshot [${payload.dimension}]`,
            public: isPublic,
            files: {
              [gistFilename(payload.dimension)]: {
                content: JSON.stringify(payload, null, 2),
              },
            },
          }),
        });

        if (!response.ok) {
          let detail = response.statusText;
          try {
            const body = (await response.json()) as { message?: string };
            if (body?.message) detail = body.message;
          } catch {
            // Non-JSON error body — keep the status text.
          }
          throw new Error(`GitHub Gist API error ${response.status}: ${detail}`);
        }

        const data = (await response.json()) as { id: string; html_url: string };
        const result: GistExportResult = { gistId: data.id, url: data.html_url };
        setLastExport(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gist transmission failed.');
        return null;
      } finally {
        setTransmitting(false);
      }
    },
    [token],
  );

  const clearError = useCallback(() => setError(null), []);

  return { token, setToken, transmitting, error, lastExport, exportPortalState, clearError };
}

export default useGist;
