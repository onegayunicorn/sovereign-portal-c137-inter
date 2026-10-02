import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioReactor } from '@portal/matrix-engine';
import type { AudioReactorSource } from '@portal/matrix-engine';

export interface UseAudioReactorOptions {
  /** Start the synthetic 1207 Hz oscillator automatically. Default true. */
  autoStartSynthetic?: boolean;
  /** Analyser FFT size — powers of two only. Default 2048. */
  fftSize?: number;
  /** Frames per second of the polling loop. Default 30. */
  sampleFps?: number;
  /** Resonance band used for the portal vortex. Default [80, 2000] Hz. */
  resonanceBandHz?: [number, number];
  /** Synthetic carrier frequency. Default 1207 Hz (C-137 resonance). */
  syntheticFrequencyHz?: number;
}

export interface UseAudioReactorResult {
  /** Normalized 0..1 resonance for the portal shader + HUD. */
  resonance: number;
  /** Live FFT spectrum bytes (0..255). */
  frequency: Uint8Array;
  /** Live time-domain waveform bytes (128 = silence). */
  waveform: Uint8Array;
  /** Which source is currently feeding the analyser. */
  source: AudioReactorSource | null;
  /** True once an analyser node is attached. */
  running: boolean;
  /** True while the microphone permission prompt / capture is in flight. */
  connecting: boolean;
  /** Human-readable failure reason, or null. */
  error: string | null;
  /** Requests microphone capture (falls back to the synthetic source on denial). */
  startMicrophone: () => Promise<void>;
  /** Starts the deterministic synthetic oscillator. */
  startSynthetic: () => void;
  /** Detaches the analyser and closes the AudioContext. */
  stop: () => void;
}

/**
 * React binding for the shared AudioReactor: owns the analyser, drives the
 * polling loop and exposes resonance + raw buffers to the HUD and the GLSL
 * portal uniforms.
 */
export function useAudioReactor(options: UseAudioReactorOptions = {}): UseAudioReactorResult {
  const {
    autoStartSynthetic = true,
    fftSize = 2048,
    sampleFps = 30,
    resonanceBandHz = [80, 2000],
    syntheticFrequencyHz = 1207,
  } = options;

  const reactorRef = useRef<AudioReactor | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSampleRef = useRef(0);

  const [resonance, setResonance] = useState(0);
  const [frequency, setFrequency] = useState<Uint8Array>(() => new Uint8Array(0));
  const [waveform, setWaveform] = useState<Uint8Array>(() => new Uint8Array(0));
  const [source, setSource] = useState<AudioReactorSource | null>(null);
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureReactor = useCallback((): AudioReactor => {
    if (!reactorRef.current) {
      reactorRef.current = new AudioReactor({
        fftSize,
        resonanceBandHz,
        syntheticFrequencyHz,
      });
    }
    return reactorRef.current;
  }, [fftSize, resonanceBandHz, syntheticFrequencyHz]);

  const beginLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const interval = 1000 / Math.max(1, sampleFps);
    const lastSample = lastSampleRef;

    const tick = (ts: number) => {
      const reactor = reactorRef.current;
      if (!reactor) return;
      rafRef.current = requestAnimationFrame(tick);

      if (ts - lastSample.current < interval) return;
      lastSample.current = ts;

      const frame = reactor.sample();
      setResonance(frame.resonance);
      // Copy so React sees fresh buffers each frame without mutating history.
      setFrequency(new Uint8Array(frame.frequency));
      setWaveform(new Uint8Array(frame.waveform));
      setSource(reactor.sourceKind);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [sampleFps]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startSynthetic = useCallback(() => {
    try {
      const reactor = ensureReactor();
      reactor.startOscillator();
      setSource(reactor.sourceKind);
      setRunning(reactor.isRunning);
      setError(null);
      beginLoop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthetic audio source failed to start.');
    }
  }, [beginLoop, ensureReactor]);

  const startMicrophone = useCallback(async () => {
    setConnecting(true);
    try {
      const reactor = ensureReactor();
      await reactor.startMicrophone();
      setSource(reactor.sourceKind);
      setRunning(reactor.isRunning);
      setError(
        reactor.sourceKind === 'oscillator'
          ? 'Microphone unavailable — running the synthetic 1207 Hz carrier instead.'
          : null,
      );
      beginLoop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone capture failed.');
    } finally {
      setConnecting(false);
    }
  }, [beginLoop, ensureReactor]);

  const stop = useCallback(() => {
    stopLoop();
    reactorRef.current?.dispose();
    reactorRef.current = null;
    setRunning(false);
    setSource(null);
    setResonance(0);
    setFrequency(new Uint8Array(0));
    setWaveform(new Uint8Array(0));
  }, [stopLoop]);

  useEffect(() => {
    if (autoStartSynthetic) {
      startSynthetic();
    }
    return () => {
      stopLoop();
      reactorRef.current?.dispose();
      reactorRef.current = null;
    };
    // Intentionally mount-only: restarts are driven by the returned callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    resonance,
    frequency,
    waveform,
    source,
    running,
    connecting,
    error,
    startMicrophone,
    startSynthetic,
    stop,
  };
}

export default useAudioReactor;
