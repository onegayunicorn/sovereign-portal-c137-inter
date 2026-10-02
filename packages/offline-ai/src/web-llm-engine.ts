/**
 * offline-ai / web-llm-engine.ts
 * Sovereign Portal C-137 — zero-network WebGPU LLM inference.
 *
 * The MLC runtime (`@mlc-ai/web-llm`) is ~1MB+ of WASM glue, so it is imported
 * dynamically: this module is safe to statically import in a plain browser and
 * only pays the cost when the operator actually boots the AI core.
 */

/** Minimal structural types so we never need a static dependency on the package. */
export interface InitProgressReport {
  progress: number;
  timeElapsed: number;
  text: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRecord {
  model_id: string;
  model_url: string;
  model_lib_url: string;
  required_features?: string[];
}

export interface SovereignAIEngineOptions {
  /** MLC model id. Default: Llama-3.2-1B-Instruct-q4f16_1-MLC. */
  modelId?: string;
  /** Local weight directory (served by the PWA service worker range cache). */
  modelUrl?: string;
  /** Local compiled WebGPU library (.wasm). */
  modelLibUrl?: string;
  /** Local base path for every model asset. Default `/models/`. */
  modelsBasePath?: string;
  /** System prompt handed to the orchestrator persona. */
  systemPrompt?: string;
  /** Extra model records appended to the app config (e.g. SmolLM2 fallback). */
  extraModels?: ModelRecord[];
}

export const DEFAULT_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
export const FALLBACK_MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

export const DEFAULT_SYSTEM_PROMPT = [
  "You are Rick C-137's Portal Orchestrator AI.",
  'Speak concisely, cynically, and scientifically.',
  'Embed gesture and emotion tags in your reply, for example:',
  '<gesture name="point_ui" targetX="75" targetY="40" /> and <emotion name="smug" intensity="0.8" />.',
].join(' ');

interface MLCEngineLike {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>>;
    };
  };
  unload?: () => Promise<void>;
}

interface WebLlmModule {
  CreateMLCEngine: (modelId: string, config?: Record<string, unknown>) => Promise<MLCEngineLike>;
  prebuiltAppConfig?: { model_list: ModelRecord[] };
}

export class SovereignAIEngine {
  private engine: MLCEngineLike | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly options: Required<Omit<SovereignAIEngineOptions, 'extraModels'>> & {
    extraModels: ModelRecord[];
  };

  constructor(options: SovereignAIEngineOptions = {}) {
    const base = options.modelsBasePath ?? '/models/';
    const modelId = options.modelId ?? DEFAULT_MODEL_ID;
    this.options = {
      modelId,
      modelsBasePath: base,
      modelUrl: options.modelUrl ?? `${base}${modelId}/`,
      modelLibUrl: options.modelLibUrl ?? `${base}${modelId}-ctx4k_webgpu.wasm`,
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      extraModels: options.extraModels ?? [],
      
    };
  }

  get modelId(): string {
    return this.options.modelId;
  }

  get isReady(): boolean {
    return this.engine !== null;
  }

  /** True when the browser exposes a WebGPU adapter. */
  static isWebGpuAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Boots the engine. Concurrent callers share a single init promise.
   *
   * @throws when WebGPU is unavailable or the local weights are missing.
   */
  async init(onProgress?: (report: InitProgressReport) => void): Promise<void> {
    if (this.engine) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.bootstrap(onProgress).catch((error: unknown) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  private async bootstrap(onProgress?: (report: InitProgressReport) => void): Promise<void> {
    if (!SovereignAIEngine.isWebGpuAvailable()) {
      throw new Error(
        'WebGPU is required for Sovereign Local AI. Enable hardware acceleration (chrome://flags/#enable-unsafe-webgpu).',
      );
    }

    onProgress?.({ progress: 0.05, timeElapsed: 0, text: 'Loading MLC WebGPU runtime…' });
    const webllm = (await import(/* @vite-ignore */ '@mlc-ai/web-llm')) as unknown as WebLlmModule;

    const modelRecord: ModelRecord = {
      model_id: this.options.modelId,
      model_url: this.options.modelUrl,
      model_lib_url: this.options.modelLibUrl,
      required_features: ['shader-f16'],
    };

    const modelList: ModelRecord[] = [modelRecord, ...this.options.extraModels];
    const appConfig = {
      model_list: modelList,
      useIndexedDBCache: true,
    };

    onProgress?.({ progress: 0.2, timeElapsed: 0, text: 'Committed local weight manifest. Warming GPU VRAM…' });

    this.engine = await webllm.CreateMLCEngine(this.options.modelId, {
      appConfig,
      initProgressCallback: (report: InitProgressReport) => onProgress?.(report),
    });

    onProgress?.({ progress: 1, timeElapsed: 0, text: 'Sovereign Offline AI Core Ready' });
  }

  /**
   * Streams a completion token-by-token.
   * `onChunk` receives the accumulated response so far, matching the blueprint contract.
   */
  async generateStream(
    prompt: string,
    systemPrompt?: string,
    onChunk?: (accumulatedText: string) => void,
  ): Promise<string> {
    if (!this.engine) {
      await this.init();
    }
    const engine = this.engine;
    if (!engine) throw new Error('Sovereign AI Engine failed to initialize.');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt ?? this.options.systemPrompt },
      { role: 'user', content: prompt },
    ];

    const asyncChunkGenerator = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 512,
    });

    let fullResponse = '';
    for await (const chunk of asyncChunkGenerator) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      fullResponse += delta;
      if (delta.length > 0) onChunk?.(fullResponse);
    }
    onChunk?.(fullResponse);
    return fullResponse;
  }

  /** Convenience wrapper for non-streaming callers. */
  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    return this.generateStream(prompt, systemPrompt);
  }

  /** Releases the GPU-backed engine. */
  async dispose(): Promise<void> {
    if (this.engine?.unload) {
      await this.engine.unload();
    }
    this.engine = null;
    this.initPromise = null;
  }
}

/** Shared singleton used by the portal HUD orchestrator. */
export const sovereignAI = new SovereignAIEngine();

export default SovereignAIEngine;
