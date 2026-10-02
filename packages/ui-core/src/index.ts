/**
 * @portal/ui-core
 * Sovereign Portal C-137 — shared design tokens and theme.
 *
 * Import the tokens once at the app root:
 *   import '@portal/ui-core/tokens.css';
 */

export {
  theme,
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
  paletteCssVariables,
  prefersReducedMotion,
} from './theme';

export type { PortalPalette, PortalTheme } from './theme';

/** Relative specifier for the bundled token stylesheet. */
export const TOKENS_STYLESHEET = '@portal/ui-core/tokens.css';
