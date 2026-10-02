import React from 'react';

export interface ScanlineFilterProps {
  /** Opacity of each scanline band, 0..1. Default 0.22. */
  opacity?: number;
  /** Seconds per full vertical sweep. Default 6. */
  sweepSeconds?: number;
  /** Render the darkened CRT vignette. Default true. */
  vignette?: boolean;
  /** Render the slow vertical sweep band. Default true. */
  sweep?: boolean;
  /** Extra class names merged onto the root. */
  className?: string;
  /** Children rendered underneath the filter (filter is non-interactive). */
  children?: React.ReactNode;
}

/**
 * Pure-CSS CRT/HUD overlay: scanline raster, slow luminance sweep and vignette.
 * Mirrors the GPU `crt-overlay.frag` pass so the effect survives without WebGL.
 * The overlay is always `pointer-events: none` — it must never eat HUD clicks.
 */
export const ScanlineFilter: React.FC<ScanlineFilterProps> = ({
  opacity = 0.22,
  sweepSeconds = 6,
  vignette = true,
  sweep = true,
  className,
  children,
}) => {
  const style = {
    '--hud-scanline-opacity': opacity,
    '--hud-sweep-duration': `${sweepSeconds}s`,
  } as React.CSSProperties;

  return (
    <div className={['hud-root', className].filter(Boolean).join(' ')} style={{ position: 'relative' }}>
      {children}
      <div className="hud-scanlines" style={style} aria-hidden="true">
        {sweep && <div className="hud-scanlines__sweep" />}
        {vignette && <div className="hud-scanlines__vignette" />}
      </div>
    </div>
  );
};

export default ScanlineFilter;
