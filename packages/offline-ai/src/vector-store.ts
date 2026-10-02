/**
 * offline-ai / vector-store.ts
 * Sovereign Portal C-137 — long-term sovereign memory.
 *
 * Persistence ladder (first available wins):
 *   1. sqlite-wasm on OPFS  — real SQL, best durability, Chrome/Edge/Safari 16.4+
 *   2. sqlite-wasm on IndexedDB (VFS fallback)
 *   3. pure in-memory array — always works, keeps the portal bootable offline
 *
 * Embeddings themselves are produced by the caller (WebGPU / Transformers.js),
 * this store only owns persistence + cosine similarity search.
 */

export interface VectorRecord {
  id: string;
  /** Free-form text the embedding was produced from. */
  content: string;
  /** L2-normalized or raw embedding vector. */
  embedding: Float32Array | number[];
  /** Arbitrary metadata (dimension code, actor, timestamp…). */
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface VectorMatch extends VectorRecord {
  score: number;
}

export type VectorStoreBackend = 'opfs' | 'indexeddb' | 'memory';

export interface VectorStoreOptions {
  /** Logical table/collection name. Default `sovereign_memory`. */
  namespace?: string;
  /** sqlite-wasm DB filename inside the VFS. Default `sovereign.db`. */
  databaseName?: string;
  /** Preferred backend order. Default [`opfs`, `indexeddb`, `memory`]. */
  preferredBackends?: Array<Exclude<VectorStoreBackend, 'memory'>>;
}

const DEFAULT_NS = 'sovereign_memory';

export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface SqlJsDatabase {
  exec(options: { sql: string; bind?: unknown[] }): Array<{ columns: string[]; values: unknown[][] }>;
  close(): void;
}

interface SqlJsStatic {
  Database: new (filename?: string) => SqlJsDatabase;
}

export class SovereignVectorStore {
  private readonly options: Required<VectorStoreOptions>;
  private backend: VectorStoreBackend = 'memory';
  private db: SqlJsDatabase | null = null;
  private readonly memory = new Map<string, VectorRecord>();
  private initPromise: Promise<VectorStoreBackend> | null = null;

  constructor(options: VectorStoreOptions = {}) {
    this.options = {
      namespace: options.namespace ?? DEFAULT_NS,
      databaseName: options.databaseName ?? 'sovereign.db',
      preferredBackends: options.preferredBackends ?? ['opfs', 'indexeddb'],
    };
  }

  get activeBackend(): VectorStoreBackend {
    return this.backend;
  }

  /** Boots the durability ladder. Never throws — degrades to memory. */
  async init(): Promise<VectorStoreBackend> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.bootstrap();
    return this.initPromise;
  }

  private async bootstrap(): Promise<VectorStoreBackend> {
    for (const candidate of this.options.preferredBackends) {
      try {
        const supported = candidate === 'opfs' ? await this.isOpfsSupported() : await this.isIndexedDbSupported();
        if (!supported) continue;

        const sqlJs = await this.loadSqlJs();
        const db = new sqlJs.Database(this.options.databaseName);
        this.db = db;
        this.migrate();
        this.backend = candidate;
        return this.backend;
      } catch (error) {
        console.warn(`[SovereignVectorStore] ${candidate} backend unavailable.`, error);
      }
    }
    this.backend = 'memory';
    return this.backend;
  }

  private async loadSqlJs(): Promise<SqlJsStatic> {
    // sqlite-wasm is a multi-MB WASM payload — loaded only when a real
    // persistent backend is actually available.
    const mod = (await import(/* @vite-ignore */ 'sql.js')) as unknown as
      | { default: () => Promise<SqlJsStatic> }
      | SqlJsStatic;
    if (typeof (mod as { default?: unknown }).default === 'function') {
      const factory = (mod as { default: () => Promise<SqlJsStatic> }).default;
      return factory();
    }
    return mod as SqlJsStatic;
  }

  private async isOpfsSupported(): Promise<boolean> {
    try {
      const storage = (navigator as unknown as { storage?: { getDirectory?: () => Promise<unknown> } }).storage;
      if (!storage?.getDirectory) return false;
      await storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  }

  private async isIndexedDbSupported(): Promise<boolean> {
    return typeof indexedDB !== 'undefined';
  }

  private migrate(): void {
    if (!this.db) return;
    this.db.exec({
      sql: `CREATE TABLE IF NOT EXISTS ${this.options.namespace} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );`,
    });
  }

  /** Upserts one record. */
  async put(record: VectorRecord): Promise<void> {
    await this.init();
    const normalized: VectorRecord = {
      ...record,
      embedding: record.embedding instanceof Float32Array ? record.embedding : Float32Array.from(record.embedding),
      metadata: record.metadata ?? {},
      createdAt: record.createdAt || Date.now(),
    };

    if (this.db) {
      this.db.exec({
        sql: `INSERT INTO ${this.options.namespace} (id, content, embedding, metadata, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET content=excluded.content, embedding=excluded.embedding,
              metadata=excluded.metadata;`,
        bind: [
          normalized.id,
          normalized.content,
          JSON.stringify(Array.from(normalized.embedding)),
          JSON.stringify(normalized.metadata),
          normalized.createdAt,
        ],
      });
      return;
    }
    this.memory.set(normalized.id, normalized);
  }

  /** Bulk upsert used when importing a memory snapshot. */
  async putMany(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      await this.put(record);
    }
  }

  /** Returns every stored record (newest first). */
  async all(): Promise<VectorRecord[]> {
    await this.init();
    if (this.db) {
      const result = this.db.exec({ sql: `SELECT * FROM ${this.options.namespace};` });
      const rows = result[0];
      if (!rows) return [];
      return rows.values.map((row) => {
        const [id, content, embedding, metadata, createdAt] = row as [
          string,
          string,
          string,
          string | null,
          number,
        ];
        return {
          id,
          content,
          embedding: Float32Array.from(JSON.parse(embedding) as number[]),
          metadata: metadata ? (JSON.parse(metadata) as Record<string, unknown>) : {},
          createdAt,
        };
      });
    }
    return Array.from(this.memory.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Cosine-similarity top-K retrieval. */
  async search(queryEmbedding: Float32Array | number[], topK = 5, minScore = 0.0): Promise<VectorMatch[]> {
    const records = await this.all();
    const scored: VectorMatch[] = records
      .map((record) => ({ ...record, score: cosineSimilarity(queryEmbedding, record.embedding) }))
      .filter((match) => match.score >= minScore)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(0, topK));
  }

  async delete(id: string): Promise<void> {
    await this.init();
    if (this.db) {
      this.db.exec({ sql: `DELETE FROM ${this.options.namespace} WHERE id = ?;`, bind: [id] });
      return;
    }
    this.memory.delete(id);
  }

  async count(): Promise<number> {
    await this.init();
    if (this.db) {
      const result = this.db.exec({ sql: `SELECT COUNT(*) AS total FROM ${this.options.namespace};` });
      const value = result[0]?.values?.[0]?.[0];
      return typeof value === 'number' ? value : 0;
    }
    return this.memory.size;
  }

  /** Closes the database handle. */
  async dispose(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.memory.clear();
    this.initPromise = null;
    this.backend = 'memory';
  }
}

export default SovereignVectorStore;
