/**
 * AudioReactor — Sovereign Portal C-137
 * WebAudio AnalyserNode bridge that turns microphone input (or a synthetic
 * oscillator for air-gapped demo mode) into:
 *   - a normalized resonance value in 0..1 consumed by `portal.frag`
 *   - a raw `getByteFrequencyData` spectrum
 *   - a raw `getByteTimeDomainData` waveform for the HUD visualizer
 */

export type AudioReactorSource = 'microphone' | 'oscillator';

export interface AudioReactorOptions {
  /** FFT size — must be a power of two. Default 2048. */
  fftSize?: number;
  /** Smoothing time constant passed to the analyser. Default 0.75. */
  smoothingTimeConstant?: number;
  /** Frequency band (Hz) used for the resonance peak. Default: 80 .. 2000. */
  resonanceBandHz?: [number, number];
  /** Synthetic oscillator frequency when running without a microphone. */
  syntheticFrequencyHz?: number;
}

export interface AudioReactorFrame {
  /** Normalized 0..1 resonance derived from the peak of the target band. */
  resonance: number;
  /** Byte frequency spectrum (0..255 per bin). */
  frequency: Uint8Array;
  /** Byte time-domain waveform (0..255 per sample, 128 = silence). */
  waveform: Uint8Array;
  /** Analyser sample rate in Hz. */
  sampleRate: number;
}

const DEFAULT_OPTIONS: Required<AudioReactorOptions> = {
  fftSize: 2048,
  smoothingTimeConstant: 0.75,
  resonanceBandHz: [80, 2000],
  syntheticFrequencyHz: 1207,
};

export class AudioReactor {
  private readonly options: Required<AudioReactorOptions>;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private stream: MediaStream | null = null;

  private frequencyData: Uint8Array = new Uint8Array(0);
  private waveformData: Uint8Array = new Uint8Array(0);

  private resonance = 0;
  private smoothedResonance = 0;
  private activeSource: AudioReactorSource | null = null;
  private disposed = false;

  constructor(options: AudioReactorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get sourceKind(): AudioReactorSource | null {
    return this.activeSource;
  }

  get isRunning(): boolean {
    return this.analyser !== null;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  private ensureContext(): AudioContext {
    if (this.disposed) throw new Error('[AudioReactor] Instance already disposed.');
    if (!this.context) {
      const Ctor: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('[AudioReactor] WebAudio is not supported in this browser.');
      this.context = new Ctor();
    }
    return this.context;
  }

  private buildAnalyser(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = this.options.fftSize;
    analyser.smoothingTimeConstant = this.options.smoothingTimeConstant;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.waveformData = new Uint8Array(analyser.fftSize);
    return analyser;
  }

  /** Starts microphone capture. Requires a user gesture + permission grant. */
  async startMicrophone(): Promise<boolean> {
    if (this.disposed) return false;
    const context = this.ensureContext();

    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('[AudioReactor] getUserMedia unavailable — falling back to synthetic source.');
      return this.startOscillator();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      console.warn('[AudioReactor] Microphone denied — falling back to synthetic source.', error);
      return this.startOscillator();
    }

    if (context.state === 'suspended') {
      await context.resume();
    }

    this.teardownSource();
    const source = context.createMediaStreamSource(this.stream);
    const analyser = this.buildAnalyser(context);
    source.connect(analyser);
    this.sourceNode = source;
    this.analyser = analyser;
    this.activeSource = 'microphone';
    return true;
  }

  /**
   * Starts a deterministic synthetic source (default 1207 Hz resonance carrier)
   * so the portal vortex stays alive with zero network / zero microphone.
   */
  startOscillator(frequencyHz?: number): boolean {
    if (this.disposed) return false;
    const context = this.ensureContext();

    this.teardownSource();
    const analyser = this.buildAnalyser(context);

    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequencyHz ?? this.options.syntheticFrequencyHz;

    // Slow amplitude LFO so the vortex breathes instead of flat-lining.
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.31;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.35;

    const gain = context.createGain();
    gain.gain.value = 0.45;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscillator.connect(gain);
    gain.connect(analyser);
    // Analyser must be pulled by the graph; route to a muted sink.
    const sink = context.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(context.destination);

    oscillator.start();
    lfo.start();

    this.oscillator = oscillator;
    this.gainNode = gain;
    this.sourceNode = gain;
    this.analyser = analyser;
    this.activeSource = 'oscillator';

    if (context.state === 'suspended') {
      void context.resume();
    }
    return true;
  }

  /**
   * Pulls one analyser frame, updating resonance + spectrum + waveform buffers.
   * Call from a rAF loop or let CanvasManager read `getResonance()`.
   */
  sample(): AudioReactorFrame {
    if (!this.analyser) {
      return {
        resonance: this.smoothedResonance,
        frequency: this.frequencyData,
        waveform: this.waveformData,
        sampleRate: this.sampleRate,
      };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.waveformData);
    this.resonance = this.computeBandResonance();
    // One-pole smoothing so GLSL uniforms never jitter.
    this.smoothedResonance = this.smoothedResonance * 0.82 + this.resonance * 0.18;

    return {
      resonance: this.smoothedResonance,
      frequency: this.frequencyData,
      waveform: this.waveformData,
      sampleRate: this.sampleRate,
    };
  }

  /** Current normalized 0..1 resonance (smoothed). Safe to call every frame. */
  getResonance(): number {
    if (this.analyser) {
      this.sample();
    }
    return this.smoothedResonance;
  }

  /** Raw byte frequency spectrum (0..255). Use for FFT/HUD bars. */
  getFrequencyData(): Uint8Array {
    this.sample();
    return this.frequencyData;
  }

  /** Raw byte time-domain waveform (0..255, 128 = silence). */
  getWaveformData(): Uint8Array {
    this.sample();
    return this.waveformData;
  }

  private computeBandResonance(): number {
    if (!this.analyser || this.frequencyData.length === 0) return 0;
    const nyquist = this.sampleRate / 2;
    const binCount = this.frequencyData.length;
    const [lowHz, highHz] = this.options.resonanceBandHz;

    const lowBin = Math.max(0, Math.floor((lowHz / nyquist) * binCount));
    const highBin = Math.min(binCount - 1, Math.ceil((highHz / nyquist) * binCount));

    let peak = 0;
    let sum = 0;
    for (let i = lowBin; i <= highBin; i += 1) {
      const value = this.frequencyData[i];
      if (value > peak) peak = value;
      sum += value;
    }
    const count = Math.max(1, highBin - lowBin + 1);
    const mean = sum / count;

    // Blend peak + mean, then normalize the byte range into 0..1.
    const blended = peak * 0.7 + mean * 0.3;
    return Math.min(1, Math.max(0, blended / 255));
  }

  private teardownSource(): void {
    try {
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
      }
      if (this.gainNode) this.gainNode.disconnect();
      if (this.sourceNode) this.sourceNode.disconnect();
      if (this.analyser) this.analyser.disconnect();
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      // Already torn down — nothing to release.
    }
    this.oscillator = null;
    this.gainNode = null;
    this.sourceNode = null;
    this.analyser = null;
    this.stream = null;
    this.activeSource = null;
  }

  /** Releases the audio graph. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.teardownSource();
    if (this.context) {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.frequencyData = new Uint8Array(0);
    this.waveformData = new Uint8Array(0);
    this.disposed = true;
  }
}

export default AudioReactor;
