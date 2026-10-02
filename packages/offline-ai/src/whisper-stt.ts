/**
 * offline-ai / whisper-stt.ts
 * Sovereign Portal C-137 — local Whisper speech-to-text via Transformers.js.
 *
 * `@xenova/transformers` is dynamically imported so the package (and the PWA
 * shell) loads in a plain browser without the ONNX runtime present.
 * `env.allowRemoteModels = false` guarantees zero HuggingFace CDN traffic —
 * the tiny-en weights must be dropped into `/models/`.
 */

export interface SovereignWhisperOptions {
  /** Local model directory served by the PWA service worker. Default `/models/`. */
  localModelPath?: string;
  /** Local model id. Default `whisper-tiny-en`. */
  modelId?: string;
  /** Inference device. Default `webgpu`, falls back to `wasm`. */
  device?: 'webgpu' | 'wasm';
  /** Target sample rate for decoding. Whisper expects 16000 Hz. */
  sampleRate?: number;
  /** Language hint passed to the pipeline. */
  language?: string;
}

export const WHISPER_MODEL_ID = 'whisper-tiny-en';

interface WhisperPipelineOutput {
  text?: string;
}

type WhisperPipeline = (
  audio: Float32Array | string,
  options?: Record<string, unknown>,
) => Promise<WhisperPipelineOutput | WhisperPipelineOutput[]>;

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    localModelPath: string;
  };
}

export class SovereignWhisper {
  private transcriber: WhisperPipeline | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly options: Required<SovereignWhisperOptions>;
  private activeDevice: 'webgpu' | 'wasm' = 'wasm';

  constructor(options: SovereignWhisperOptions = {}) {
    this.options = {
      localModelPath: options.localModelPath ?? '/models/',
      modelId: options.modelId ?? WHISPER_MODEL_ID,
      device: options.device ?? 'webgpu',
      sampleRate: options.sampleRate ?? 16000,
      language: options.language ?? 'en',
    };
  }

  get isReady(): boolean {
    return this.transcriber !== null;
  }

  get device(): 'webgpu' | 'wasm' {
    return this.activeDevice;
  }

  /** Boots the local Whisper pipeline. Safe to call concurrently. */
  async init(): Promise<void> {
    if (this.transcriber) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.bootstrap().catch((error: unknown) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  private async bootstrap(): Promise<void> {
    const transformers = (await import(/* @vite-ignore */ '@xenova/transformers')) as unknown as TransformersModule;

    // Force local assets, disable remote HuggingFace CDN fallbacks.
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.useBrowserCache = true;
    transformers.env.localModelPath = this.options.localModelPath;

    const buildPipeline = async (device: 'webgpu' | 'wasm') => {
      const pipe = (await transformers.pipeline('automatic-speech-recognition', this.options.modelId, {
        quantized: true,
        device,
      })) as unknown as WhisperPipeline;
      return pipe;
    };

    try {
      this.transcriber = await buildPipeline(this.options.device);
      this.activeDevice = this.options.device;
    } catch (webgpuError) {
      console.warn('[SovereignWhisper] WebGPU pipeline failed, falling back to WASM.', webgpuError);
      this.transcriber = await buildPipeline('wasm');
      this.activeDevice = 'wasm';
    }
  }

  /**
   * Transcribes a recorded audio Blob (typically from MediaRecorder).
   * Decodes with WebAudio at 16 kHz mono, exactly what Whisper expects.
   */
  async transcribeAudioBlob(audioBlob: Blob): Promise<string> {
    if (!this.transcriber) await this.init();
    const transcriber = this.transcriber;
    if (!transcriber) throw new Error('[SovereignWhisper] Transcriber unavailable.');

    const arrayBuffer = await audioBlob.arrayBuffer();
    const AudioContextCtor: typeof AudioContext =
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextCtor({ sampleRate: this.options.sampleRate });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);
    await audioContext.close().catch(() => undefined);

    const output = await transcriber(audioData, { language: this.options.language, task: 'transcribe' });
    const result = Array.isArray(output) ? output[0] : output;
    return (result?.text ?? '').trim();
  }

  /** Transcribes a raw Float32 PCM buffer already sampled at 16 kHz. */
  async transcribePcm(audioData: Float32Array): Promise<string> {
    if (!this.transcriber) await this.init();
    const transcriber = this.transcriber;
    if (!transcriber) throw new Error('[SovereignWhisper] Transcriber unavailable.');

    const output = await transcriber(audioData, { language: this.options.language, task: 'transcribe' });
    const result = Array.isArray(output) ? output[0] : output;
    return (result?.text ?? '').trim();
  }

  /** Releases the ONNX session. */
  async dispose(): Promise<void> {
    this.transcriber = null;
    this.initPromise = null;
  }
}

export default SovereignWhisper;
