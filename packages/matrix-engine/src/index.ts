/**
 * @portal/matrix-engine
 * Sovereign Portal C-137 — matrix background engine.
 *
 * Public surface: WebGL CanvasManager (portal vortex), WebAudio AudioReactor
 * (mic + synthetic resonance), and the raw GLSL shader sources shipped as
 * static assets under `src/shaders/`.
 */

export { CanvasManager, PORTAL_VERTEX_SHADER } from './CanvasManager';
export type { CanvasManagerOptions, PortalUniforms } from './CanvasManager';

export { AudioReactor } from './AudioReactor';
export type { AudioReactorFrame, AudioReactorOptions, AudioReactorSource } from './AudioReactor';

/** Static paths of the shipped GLSL shaders (served from `/shaders/*`). */
export const SHADER_PATHS = {
  portal: '/shaders/portal.frag',
  matrixRain: '/shaders/matrix-rain.frag',
  crtOverlay: '/shaders/crt-overlay.frag',
} as const;

/**
 * Loads a raw GLSL source from the served shader directory.
 * Returns `null` when the asset cannot be fetched (offline / air-gapped).
 */
export async function loadShaderSource(
  name: keyof typeof SHADER_PATHS,
  basePath = '',
): Promise<string | null> {
  try {
    const response = await fetch(`${basePath}${SHADER_PATHS[name]}`);
    if (!response.ok) return null;
    const source = await response.text();
    return source.trim().length > 0 ? source : null;
  } catch {
    return null;
  }
}
