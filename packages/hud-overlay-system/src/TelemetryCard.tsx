import React from 'react';

export type TelemetryTone = 'default' | 'cyan' | 'alert';

export interface TelemetryMetric {
  label: string;
  value: string | number;
  unit?: string;
}

export interface TelemetryCardProps {
  /** Card heading, rendered uppercase with wide tracking. */
  title: string;
  /** Primary readout value. */
  value: string | number;
  /** Unit suffix for the primary readout. */
  unit?: string;
  /** Secondary metrics rendered in the footer grid. */
  metrics?: TelemetryMetric[];
  /** Visual tone. Default `default` (portal green). */
  tone?: TelemetryTone;
  /** Shows the pulsing status dot. Default true. */
  status?: boolean;
  /** Renders the readout in the alert colour. Default false. */
  alert?: boolean;
  /** Trailing status text, e.g. `ACTIVE`, `DEGRADED`. */
  statusLabel?: string;
  /** Extra class names merged onto the root. */
  className?: string;
}

const TONE_CLASS: Record<TelemetryTone, string> = {
  default: '',
  cyan: 'hud-card--cyan',
  alert: 'hud-card--alert',
};

/**
 * Cybernetic telemetry readout card. Used for dimension coordinates
 * (`1207 / 1207`), stability (`99.87%`), resonance (`1207 Hz`) and mesh status.
 */
export const TelemetryCard: React.FC<TelemetryCardProps> = ({
  title,
  value,
  unit,
  metrics,
  tone = 'default',
  status = true,
  alert = false,
  statusLabel,
  className,
}) => {
  const valueStyle: React.CSSProperties | undefined = alert
    ? { color: 'var(--hud-alert)', textShadow: '0 0 12px rgba(255, 0, 85, 0.5)' }
    : undefined;

  return (
    <section
      className={['hud-root', 'hud-card', TONE_CLASS[tone], className].filter(Boolean).join(' ')}
      aria-label={`${title} telemetry`}
    >
      <header className="hud-card__header">
        <span>{title}</span>
        {status && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={['hud-dot', alert ? 'hud-dot--alert' : ''].filter(Boolean).join(' ')} />
            {statusLabel && <span>{statusLabel}</span>}
          </span>
        )}
      </header>

      <div className="hud-card__value" style={valueStyle}>
        {value}
        {unit && <span className="hud-card__unit">{unit}</span>}
      </div>

      {metrics && metrics.length > 0 && (
        <div className="hud-card__meta">
          {metrics.map((metric) => (
            <span key={metric.label}>
              {metric.label}: <strong>{metric.value}</strong>
              {metric.unit ? ` ${metric.unit}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export default TelemetryCard;
