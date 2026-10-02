import React, { useMemo } from 'react';

export interface WaveformBarProps {
  /** Time-domain waveform bytes (0..255, 128 = silence) or FFT bins. */
  data?: Uint8Array | number[];
  /** Number of rendered bars. Default 48. */
  barCount?: number;
  /** Normalized 0..1 resonance used for colour shifting. Default 0. */
  resonance?: number;
  /** Fixed height in pixels. Default 48. */
  height?: number;
  /** Render in alert colour. Default false. */
  alert?: boolean;
  /** Extra class names merged onto the root. */
  className?: string;
  /** Accessible label. Default "Audio waveform". */
  label?: string;
}

/**
 * HUD waveform visualizer driven by the AudioReactor byte arrays.
 * Accepts either a time-domain waveform (centered on 128) or an FFT spectrum
 * (bottom-up). Bar heights are computed without any canvas, so it stays cheap
 * enough to re-render at audio rate.
 */
export const WaveformBar: React.FC<WaveformBarProps> = ({
  data,
  barCount = 48,
  resonance = 0,
  height = 48,
  alert = false,
  className,
  label = 'Audio waveform',
}) => {
  const bars = useMemo(() => {
    const source = data ? Array.from(data) : [];
    if (source.length === 0) {
      // Idle: flat line with a gentle synthesized breath.
      return new Array(barCount).fill(0).map((_, index) => 6 + (index % 4) * 1.5);
    }

    const stride = Math.max(1, Math.floor(source.length / barCount));
    const values: number[] = [];
    for (let i = 0; i < barCount; i += 1) {
      const start = i * stride;
      let peak = 0;
      for (let j = 0; j < stride; j += 1) {
        const raw = source[start + j] ?? 128;
        // Treat the signal as time-domain: distance from the 128 midpoint.
        const amplitude = Math.abs(raw - 128) / 128;
        if (amplitude > peak) peak = amplitude;
      }
      values.push(peak);
    }
    const max = Math.max(0.0001, ...values);
    return values.map((value) => {
      const normalized = value / max;
      return Math.max(2, normalized * height * (0.55 + resonance * 0.45));
    });
  }, [barCount, data, height, resonance]);

  const barClass = ['hud-waveform__bar', alert ? 'hud-waveform__bar--alert' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={['hud-root', 'hud-waveform', className].filter(Boolean).join(' ')}
      style={{ height }}
      role="img"
      aria-label={label}
    >
      {bars.map((barHeight, index) => (
        <span key={index} className={barClass} style={{ height: barHeight }} />
      ))}
    </div>
  );
};

export default WaveformBar;
