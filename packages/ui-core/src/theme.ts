/**
 * @portal/ui-core — theme
 * Typed mirror of `tokens.css` so TS/TSX (and Tailwind presets) can reference
 * the exact Sovereign Portal C-137 palette without stringly-typed drift.
 */

/** Canonical, non-negotiable palette from BUILD_MANIFEST.md. */
export const palette = {
  portalGreen: '#00ff88',
  portalYellow: '#d4ff00',
  hudCyan: '#00e5ff',
  hudAlert: '#ff0055',
  void: '#020b05',
} as const;

/** CSS custom-property names for each palette entry. */
export const paletteVars = {
  portalGreen: 'var(--portal-green)',
  portalYellow: 'var(--portal-yellow)',
  hudCyan: 'var(--hud-cyan)',
  hudAlert: 'var(--hud-alert)',
  void: 'var(--void)',
} as const;

/** Frozen C-137 specification values. */
export const portalSpec = {
  productName: 'Sovereign Portal C-137',
  dimensionCode: 'C-137',
  resonanceHz: 1207,
  stability: 0.9987,
  stabilityLabel: '99.87%',
} as const;

export const typography = {
  fontMono: '"JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontDisplay: '"Orbitron", "Rajdhani", "JetBrains Mono", monospace',
  sizes: {
    '2xs': '0.625rem',
    xs: '0.6875rem',
    sm: '0.75rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '2rem',
  },
  tracking: {
    hud: '0.18em',
    wide: '0.08em',
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radii = {
  hud: '10px',
  hudSm: '6px',
  pill: '999px',
  full: '50%',
} as const;

export const glows = {
  hud: '0 0 18px rgba(0, 255, 136, 0.28)',
  hudStrong: '0 0 32px rgba(0, 255, 136, 0.45)',
  cyan: '0 0 20px rgba(0, 229, 255, 0.32)',
  alert: '0 0 20px rgba(255, 0, 85, 0.35)',
  textGreen: '0 0 12px rgba(0, 255, 136, 0.45)',
  textCyan: '0 0 12px rgba(0, 229, 255, 0.45)',
} as const;

export const motion = {
  durations: {
    instant: '80ms',
    fast: '160ms',
    normal: '260ms',
    slow: '600ms',
    sweep: '6s',
  },
  easing: {
    hud: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

export const zIndex = {
  vortex: 0,
  video: 10,
  canvasOverlay: 20,
  hud: 30,
  scanlines: 40,
  capsule: 50,
  toast: 60,
  modal: 70,
} as const;

export const layout = {
  gutter: '16px',
  headerHeight: '56px',
  capsuleHeight: '52px',
  maxWidthMobile: '480px',
  maxWidthDesktop: '1280px',
  videoAspect: '9 / 16',
} as const;

export const theme = {
  palette,
  paletteVars,
  portalSpec,
  typography,
  spacing,
  radii,
  glows,
  motion,
  zIndex,
  layout,
} as const;

export type PortalTheme = typeof theme;
export type PortalPalette = typeof palette;

/**
 * Emits the palette as inline CSS custom properties.
 * Useful for shadow DOM / SSR where `tokens.css` is not guaranteed to load.
 */
export function paletteCssVariables(): Record<string, string> {
  return {
    '--portal-green': palette.portalGreen,
    '--portal-yellow': palette.portalYellow,
    '--hud-cyan': palette.hudCyan,
    '--hud-alert': palette.hudAlert,
    '--void': palette.void,
  };
}

/** Neutralizes the CRT/scanline motion tokens when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default theme;
