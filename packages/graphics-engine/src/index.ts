/**
 * @portal/graphics-engine
 * Sovereign Portal C-137 — 3D GLB + WebGL graphics engine.
 *
 * `PostProcessing` must be mounted inside an @react-three/fiber <Canvas>.
 */

export { PortalGunModel, preloadPortalGun, DEFAULT_GUN_PATH } from './PortalGunModel';
export type { PortalGunProps } from './PortalGunModel';

export { VortexCanvas } from './VortexCanvas';
export type { VortexCanvasProps } from './VortexCanvas';

export { GraphicsPipelineEffects } from './PostProcessing';
export type { GraphicsPipelineEffectsProps } from './PostProcessing';

/** Static paths of the graphics assets. */
export const GRAPHICS_ASSETS = {
  portalGunGlb: '/models/rick_portal_gun.glb',
  portalShader: '/shaders/portal.frag',
} as const;
