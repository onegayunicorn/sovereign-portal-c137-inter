/**
 * offline-ai / memory-manager.ts
 * Sovereign Portal C-137 — IndexedDB persistence for the orchestrator chat
 * transcript and the long-term "sovereign memory" records.
 *
 * Zero dependencies: a dependency-free IndexedDB wrapper with graceful
 * degradation to an in-memory map when IndexedDB is blocked (private mode,
 * file:// origin, hardened browser profile).
 */

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  dimensionCode: string;
  createdAt: number;
}

export interface SovereignMemoryRecord {
  id: string;
  /** Memory classification, e.g. `telemetry`, `coordinate`, `persona`. */
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface MemoryManagerOptions {
  databaseName?: string;
  chatStore?: string;
  memoryStore?: string;
  version?: number;
}

const DEFAULT_OPTIONS: Required<MemoryManagerOptions> = {
  databaseName: 'portal-c137-sovereign',
  chatStore: 'chat_turns',
  memoryStore: 'sovereign_memory',
  version: 1,
};

function makeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

export class MemoryManager {
  private readonly options: Required<MemoryManagerOptions>;
  private db: IDBDatabase | null = null;
  private openPromise: Promise<void> | null = null;
  private readonly chatFallback = new Map<string, ChatTurn>();
  private readonly memoryFallback = new Map<string, SovereignMemoryRecord>();

  constructor(options: MemoryManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** True when IndexedDB is driving persistence. */
  get isPersistent(): boolean {
    return this.db !== null;
  }

  async open(): Promise<void> {
    if (this.db) return;
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise<void>((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.options.databaseName, this.options.version);
      } catch {
        resolve();
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.options.chatStore)) {
          const store = db.createObjectStore(this.options.chatStore, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('dimensionCode', 'dimensionCode');
        }
        if (!db.objectStoreNames.contains(this.options.memoryStore)) {
          const store = db.createObjectStore(this.options.memoryStore, { keyPath: 'id' });
          store.createIndex('kind', 'kind');
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => {
        console.warn('[MemoryManager] IndexedDB unavailable — running in volatile memory mode.');
        resolve();
      };
    });

    return this.openPromise;
  }

  private transaction(storeName: string, mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db) return null;
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  private static awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }

  // ---------------------------------------------------------------- chat ---

  async appendChatTurn(
    turn: Omit<ChatTurn, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
  ): Promise<ChatTurn> {
    await this.open();
    const record: ChatTurn = {
      id: turn.id ?? makeId('turn'),
      role: turn.role,
      content: turn.content,
      dimensionCode: turn.dimensionCode || 'C-137',
      createdAt: turn.createdAt ?? Date.now(),
    };

    const store = this.transaction(this.options.chatStore, 'readwrite');
    if (store) {
      await MemoryManager.awaitRequest(store.put(record));
    } else {
      this.chatFallback.set(record.id, record);
    }
    return record;
  }

  async getChatHistory(limit = 100, dimensionCode?: string): Promise<ChatTurn[]> {
    await this.open();
    let turns: ChatTurn[];

    const store = this.transaction(this.options.chatStore, 'readonly');
    if (store) {
      turns = (await MemoryManager.awaitRequest(store.getAll())) as ChatTurn[];
      if (dimensionCode) {
        turns = turns.filter((turn) => turn.dimensionCode === dimensionCode);
      }
    } else {
      turns = Array.from(this.chatFallback.values());
    }

    return turns.sort((a, b) => a.createdAt - b.createdAt).slice(-Math.max(1, limit));
  }

  async clearChat(): Promise<void> {
    await this.open();
    const store = this.transaction(this.options.chatStore, 'readwrite');
    if (store) {
      await MemoryManager.awaitRequest(store.clear());
    } else {
      this.chatFallback.clear();
    }
  }

  // ------------------------------------------------------- sovereign mem ---

  async remember(
    record: Omit<SovereignMemoryRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
  ): Promise<SovereignMemoryRecord> {
    await this.open();
    const stored: SovereignMemoryRecord = {
      id: record.id ?? makeId('mem'),
      kind: record.kind || 'general',
      content: record.content,
      metadata: record.metadata ?? {},
      createdAt: record.createdAt ?? Date.now(),
    };

    const store = this.transaction(this.options.memoryStore, 'readwrite');
    if (store) {
      await MemoryManager.awaitRequest(store.put(stored));
    } else {
      this.memoryFallback.set(stored.id, stored);
    }
    return stored;
  }

  async recall(kind?: string, limit = 200): Promise<SovereignMemoryRecord[]> {
    await this.open();
    let records: SovereignMemoryRecord[];

    const store = this.transaction(this.options.memoryStore, 'readonly');
    if (store) {
      records = (await MemoryManager.awaitRequest(store.getAll())) as SovereignMemoryRecord[];
    } else {
      records = Array.from(this.memoryFallback.values());
    }

    if (kind) records = records.filter((record) => record.kind === kind);
    return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async forget(id: string): Promise<void> {
    await this.open();
    const store = this.transaction(this.options.memoryStore, 'readwrite');
    if (store) {
      await MemoryManager.awaitRequest(store.delete(id));
    } else {
      this.memoryFallback.delete(id);
    }
  }

  /** Full JSON snapshot for Gist export / air-gapped transfer. */
  async exportSnapshot(): Promise<{ chat: ChatTurn[]; memory: SovereignMemoryRecord[] }> {
    const [chat, memory] = await Promise.all([this.getChatHistory(10000), this.recall(undefined, 10000)]);
    return { chat, memory };
  }

  /** Restores a snapshot produced by `exportSnapshot`. */
  async importSnapshot(snapshot: { chat?: ChatTurn[]; memory?: SovereignMemoryRecord[] }): Promise<void> {
    await this.open();
    for (const turn of snapshot.chat ?? []) {
      const store = this.transaction(this.options.chatStore, 'readwrite');
      if (store) await MemoryManager.awaitRequest(store.put(turn));
      else this.chatFallback.set(turn.id, turn);
    }
    for (const record of snapshot.memory ?? []) {
      const store = this.transaction(this.options.memoryStore, 'readwrite');
      if (store) await MemoryManager.awaitRequest(store.put(record));
      else this.memoryFallback.set(record.id, record);
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.openPromise = null;
  }
}

export default MemoryManager;
