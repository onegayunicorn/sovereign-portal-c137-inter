/**
 * @portal/hud-overlay-system
 * Sovereign Portal C-137 — cybernetic HUD overlay component library.
 *
 * Import the stylesheet once at the app root:
 *   import '@portal/hud-overlay-system/styles.css';
 */

export { Reticle } from './Reticle';
export type { ReticleProps } from './Reticle';

export { ScanlineFilter } from './ScanlineFilter';
export type { ScanlineFilterProps } from './ScanlineFilter';

export { TelemetryCard } from './TelemetryCard';
export type { TelemetryCardProps, TelemetryMetric, TelemetryTone } from './TelemetryCard';

export { WaveformBar } from './WaveformBar';
export type { WaveformBarProps } from './WaveformBar';

export { TerminalPrompt } from './TerminalPrompt';
export type { TerminalLine, TerminalLineKind, TerminalPromptProps } from './TerminalPrompt';

/** Relative path of the bundled stylesheet (for `import '.../styles.css'`). */
export const HUD_STYLESHEET = '@portal/hud-overlay-system/styles.css';
