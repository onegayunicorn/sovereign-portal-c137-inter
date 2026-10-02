/**
 * @portal/config — shared Tailwind CSS preset.
 * Sovereign Portal C-137 monorepo.
 *
 * Usage (`tailwind.config.ts`):
 *   import preset from '@portal/config/tailwind-preset';
 *   export default { presets: [preset], content: ['./index.html', './src/**\/*.{ts,tsx}'] };
 *
 * The preset is dependency-free: it only exposes tokens from the manifest
 * palette, never imports Tailwind internals, and works for both Tailwind v3
 * (`presets`) and v4 (`@config` / `@theme` mirroring via `cssVariables`).
 */

/** Canonical palette (BUILD_MANIFEST.md — non-negotiable). */
export const colors = {
  portal: {
    green: '#00ff88',
    yellow: '#d4ff00',
    DEFAULT: '#00ff88',
  },
  hud: {
    cyan: '#00e5ff',
    alert: '#ff0055',
    DEFAULT: '#00e5ff',
  },
  void: {
    DEFAULT: '#020b05',
    deep: '#010804',
  },
  surface: {
    panel: 'rgba(2, 11, 5, 0.72)',
    solid: 'rgba(2, 11, 5, 0.94)',
    scrim: 'rgba(1, 8, 4, 0.86)',
  },
};

export const fontFamily = {
  mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
  hud: ['"JetBrains Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
  display: ['Orbitron', 'Rajdhani', '"JetBrains Mono"', 'monospace'],
};

export const boxShadow = {
  hud: '0 0 18px rgba(0, 255, 136, 0.28)',
  'hud-strong': '0 0 32px rgba(0, 255, 136, 0.45)',
  cyan: '0 0 20px rgba(0, 229, 255, 0.32)',
  alert: '0 0 20px rgba(255, 0, 85, 0.35)',
  'text-green': '0 0 12px rgba(0, 255, 136, 0.45)',
};

export const borderRadius = {
  hud: '10px',
  'hud-sm': '6px',
};

export const letterSpacing = {
  hud: '0.18em',
};

export const zIndex = {
  vortex: '0',
  video: '10',
  overlay: '20',
  hud: '30',
  scanlines: '40',
  capsule: '50',
  modal: '70',
};

export const keyframes = {
  'hud-pulse': {
    '0%, 100%': { opacity: '1', transform: 'scale(1)' },
    '50%': { opacity: '0.35', transform: 'scale(0.78)' },
  },
  'hud-scan-sweep': {
    '0%': { top: '-25%' },
    '100%': { top: '105%' },
  },
  'hud-caret': {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0' },
  },
  'hud-reticle-spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
};

export const animation = {
  'hud-pulse': 'hud-pulse 1.6s ease-in-out infinite',
  'hud-scan-sweep': 'hud-scan-sweep 6s linear infinite',
  'hud-caret': 'hud-caret 1s steps(2, start) infinite',
  'hud-reticle-spin': 'hud-reticle-spin 9s linear infinite',
  'hud-reticle-spin-reverse': 'hud-reticle-spin 6s linear infinite reverse',
};

/** Flat CSS custom-property map — handy for the Tailwind v4 `@theme` block. */
export const cssVariables = {
  '--portal-green': colors.portal.green,
  '--portal-yellow': colors.portal.yellow,
  '--hud-cyan': colors.hud.cyan,
  '--hud-alert': colors.hud.alert,
  '--void': colors.void.DEFAULT,
  '--font-hud': fontFamily.hud.join(', '),
  '--glow-hud': boxShadow.hud,
  '--radius-hud': borderRadius.hud,
};

/**
 * Emits a Tailwind v4 `@theme { ... }` block string from the tokens above.
 * Useful for build scripts that generate the design-system stylesheet.
 */
export function themeBlock() {
  const lines = Object.entries(cssVariables).map(([name, value]) => `  ${name}: ${value};`);
  return `@theme {\n${lines.join('\n')}\n}\n`;
}

const preset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      fontFamily,
      boxShadow,
      borderRadius,
      letterSpacing,
      zIndex,
      keyframes,
      animation,
    },
  },
};

export default preset;
