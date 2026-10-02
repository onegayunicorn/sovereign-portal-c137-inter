/**
 * offline-ai / kokoro-tts.ts
 * Sovereign Portal C-137 — zero-latency local neural speech synthesis.
 *
 * Primary path: Kokoro / Piper ONNX voice models executed through
 * Transformers.js on WASM (no network, weights served from `/models/`).
 * Graceful degradation: when the local voice model or the runtime is missing,
 * every method silently routes through the browser SpeechSynthesis API so the
 * orchestrator never loses its voice.
 */

export type TtsBackend = 'kokoro' | 'piper' | 'speech-synthesis';

export interface KokoroTtsOptions {
  /** Local model directory served by the service worker. Default `/models/`. */
  localModelPath?: string;
  /** Text-to-speech model id. Default `kokoro-82m`. */
  modelId?: string;
  /** Voice / speaker id passed to the model. Default `af_heart`. */
  voice?: string;
  /** Playback rate for the SpeechSynthesis fallback. Default 1.0. */
  rate?: number;
  /** Pitch for the SpeechSynthesis fallback. Default 1.0. */
  pitch?: number;
  /** BCP-47 language tag for the fallback. Default `en-US`. */
  lang?: string;
}

interface TtsModule {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>;
  env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    localModelPath: string;
  };
}

interface RawAudio {
  audio?: Float32Array;
  sampling_rate?: number;
}

type TtsPipeline = (text: string, options?: Record<string, unknown>) => Promise<RawAudio>;

export class SovereignTts {
  private synth: TtsPipeline | null = null;
  private initPromise: Promise<void> | null = null;
  private backend: TtsBackend = 'speech-synthesis';
  private readonly options: Required<KokoroTtsOptions>;

  constructor(options: KokoroTtsOptions = {}) {
    this.options = {
      localModelPath: options.localModelPath ?? '/models/',
      modelId: options.modelId ?? 'kokoro-82m',
      voice: options.voice ?? 'af_heart',
      rate: options.rate ?? 1.0,
      pitch: options.pitch ?? 1.0,
      lang: options.lang ?? 'en-US',
    };
  }

  get activeBackend(): TtsBackend {
    return this.backend;
  }

  get isNeuralReady(): boolean {
    return this.synth !== null;
  }

  /**
   * Attempts to boot the local neural voice.
   * Resolves with `false` (never throws) when the fallback is in effect.
   */
  async init(): Promise<boolean> {
    if (this.synth) return true;
    if (this.initPromise) {
      await this.initPromise;
      return this.synth !== null;
    }

    this.initPromise = this.bootstrap().catch((error: unknown) => {
      console.warn('[SovereignTts] Local neural voice unavailable — using SpeechSynthesis fallback.', error);
      this.synth = null;
      this.backend = 'speech-synthesis';
      this.initPromise = null;
    });

    await this.initPromise;
    return this.synth !== null;
  }

  private async bootstrap(): Promise<void> {
    const transformers = (await import(/* @vite-ignore */ '@xenova/transformers')) as unknown as TtsModule;
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.useBrowserCache = true;
    transformers.env.localModelPath = this.options.localModelPath;

    const pipe = (await transformers.pipeline('text-to-speech', this.options.modelId, {
      quantized: true,
      device: 'wasm',
    })) as unknown as TtsPipeline;

    this.synth = pipe;
    this.backend = this.options.modelId.includes('piper') ? 'piper' : 'kokoro';
  }

  /**
   * Synthesizes `text` and plays it immediately.
   * Returns the backend actually used so the HUD can report honestly.
   */
  async speak(text: string): Promise<TtsBackend> {
    const spoken = await this.synthesize(text);
    if (!spoken) return 'speech-synthesis';
    return this.backend;
  }

  /**
   * Renders `text` to a playable AudioBuffer.
   * Returns `null` when the neural path is unavailable (caller may fall back).
   */
  async synthesize(text: string): Promise<AudioBuffer | null> {
    const ready = await this.init();
    if (!ready || !this.synth) {
      await this.speakWithBrowser(text);
      return null;
    }

    try {
      const raw = await this.synth(text, { voice: this.options.voice });
      const samples = raw?.audio;
      const samplingRate = raw?.sampling_rate ?? 24000;
      if (!samples || samples.length === 0) throw new Error('Empty neural audio payload.');

      const AudioContextCtor: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor({ sampleRate: samplingRate });
      const buffer = audioContext.createBuffer(1, samples.length, samplingRate);
      buffer.copyToChannel(samples instanceof Float32Array ? samples : Float32Array.from(samples), 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
      source.onended = () => {
        void audioContext.close().catch(() => undefined);
      };
      return buffer;
    } catch (error) {
      console.warn('[SovereignTts] Neural synthesis failed — degrading to SpeechSynthesis.', error);
      await this.speakWithBrowser(text);
      return null;
    }
  }

  private async speakWithBrowser(text: string): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.options.rate;
    utterance.pitch = this.options.pitch;
    utterance.lang = this.options.lang;
    window.speechSynthesis.speak(utterance);
  }

  /** Cancels any queued browser speech. */
  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    this.synth = null;
    this.initPromise = null;
    this.backend = 'speech-synthesis';
  }
}

/** Alias kept for blueprint naming parity. */
export const SovereignKokoro = SovereignTts;

export default SovereignTts;
