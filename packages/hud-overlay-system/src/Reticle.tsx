import React, { useMemo } from 'react';

export interface ReticleProps {
  /** Diameter in pixels. Default 96. */
  size?: number;
  /** Accent color. Default portal green (#00ff88). */
  color?: string;
  /** Secondary ring color. Default HUD cyan (#00e5ff). */
  accentColor?: string;
  /** Extra class names merged onto the root. */
  className?: string;
  /** Slow down (>1) or speed up (<1) the rotation. Default 1. */
  speed?: number;
  /** Renders the 4 crosshair ticks. Default true. */
  ticks?: boolean;
  /** Accessible label. Default "Portal targeting reticle". */
  label?: string;
}

interface TickGeometry {
  key: string;
  width: number;
  height: number;
  top: string;
  left: string;
}

/**
 * Targeting reticle used by the portal HUD: two counter-rotating rings plus a
 * glowing core and crosshair ticks, matching the deconstructed C-137 interface.
 */
export const Reticle: React.FC<ReticleProps> = ({
  size = 96,
  color = '#00ff88',
  accentColor = '#00e5ff',
  className,
  speed = 1,
  ticks = true,
  label = 'Portal targeting reticle',
}) => {
  const half = size / 2;
  const ringInset = size * 0.14;
  const tickLength = size * 0.14;
  const tickThickness = Math.max(1, Math.round(size * 0.017));

  const tickGeometry = useMemo<TickGeometry[]>(() => {
    const offset = `${half - tickThickness / 2}px`;
    const near = `${ringInset}px`;
    const far = `${size - ringInset - tickLength}px`;
    return [
      { key: 'top', width: tickThickness, height: tickLength, top: near, left: offset },
      { key: 'bottom', width: tickThickness, height: tickLength, top: far, left: offset },
      { key: 'left', width: tickLength, height: tickThickness, top: offset, left: near },
      { key: 'right', width: tickLength, height: tickThickness, top: offset, left: far },
    ];
  }, [half, tickLength, tickThickness, size, ringInset]);

  const duration = `${9 / Math.max(0.1, speed)}s`;

  return (
    <div
      className={['hud-root', 'hud-reticle', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <span
        className="hud-reticle__ring hud-reticle__ring--spin"
        style={{ inset: ringInset, borderColor: color, animationDuration: duration }}
      />
      <span
        className="hud-reticle__ring hud-reticle__ring--counter"
        style={{
          inset: ringInset * 1.9,
          borderColor: accentColor,
          animationDuration: `${6 / Math.max(0.1, speed)}s`,
        }}
      />
      <span
        className="hud-reticle__core"
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: size * 0.16,
          height: size * 0.16,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        }}
      />
      {ticks &&
        tickGeometry.map((tick) => (
          <span
            key={tick.key}
            className="hud-reticle__tick"
            style={{
              width: tick.width,
              height: tick.height,
              top: tick.top,
              left: tick.left,
              backgroundColor: color,
            }}
          />
        ))}
    </div>
  );
};

export default Reticle;
