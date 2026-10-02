/**
 * @portal/offline-ai
 * Sovereign Portal C-137 — 100% local, zero-network AI stack.
 *
 * Every heavy dependency (@mlc-ai/web-llm, @xenova/transformers, sql.js) is
 * dynamically imported inside the corresponding class, so importing this
 * package in a plain browser is always safe and side-effect free.
 */

export {
  SovereignAIEngine,
  sovereignAI,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  DEFAULT_SYSTEM_PROMPT,
} from './web-llm-engine';
export type {
  ChatMessage,
  InitProgressReport,
  ModelRecord,
  SovereignAIEngineOptions,
} from './web-llm-engine';

export { SovereignWhisper, WHISPER_MODEL_ID } from './whisper-stt';
export type { SovereignWhisperOptions } from './whisper-stt';

export { SovereignTts, SovereignKokoro } from './kokoro-tts';
export type { KokoroTtsOptions, TtsBackend } from './kokoro-tts';

export { SovereignVectorStore, cosineSimilarity } from './vector-store';
export type {
  VectorMatch,
  VectorRecord,
  VectorStoreBackend,
  VectorStoreOptions,
} from './vector-store';

export { MemoryManager } from './memory-manager';
export type { ChatTurn, MemoryManagerOptions, SovereignMemoryRecord } from './memory-manager';
