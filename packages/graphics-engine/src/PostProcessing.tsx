import React from 'react';
import { EffectComposer, Bloom, ChromaticAberration, Scanline } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

export interface GraphicsPipelineEffectsProps {
  /** Master switch — returns `null` when the pipeline is dormant. */
  active: boolean;
  /** Neon bloom strength. Default 1.5. */
  bloomIntensity?: number;
  /** Bloom luminance threshold. Default 0.2. */
  luminanceThreshold?: number;
  /** Chromatic aberration offset. Default 0.002. */
  aberrationOffset?: number;
  /** Scanline density. Default 2.5. */
  scanlineDensity?: number;
  /** Scanline opacity. Default 0.12. */
  scanlineOpacity?: number;
}

/**
 * GraphicsPipelineEffects — holographic CRT post stack for the portal stage.
 * Bloom (neon glow) + ChromaticAberration (dimensional split) + Scanline (CRT).
 *
 * Must be rendered inside an @react-three/fiber <Canvas>.
 */
export function GraphicsPipelineEffects({
  active,
  bloomIntensity = 1.5,
  luminanceThreshold = 0.2,
  aberrationOffset = 0.002,
  scanlineDensity = 2.5,
  scanlineOpacity = 0.12,
}: GraphicsPipelineEffectsProps) {
  if (!active) return null;

  return (
    <EffectComposer>
      {/* Rick Portal Neon Glow */}
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={0.9}
        blendFunction={BlendFunction.SCREEN}
      />
      {/* Dimensional Aberration */}
      <ChromaticAberration
        offset={new THREE.Vector2(aberrationOffset, aberrationOffset)}
        radialModulation={false}
        modulationOffset={0.15}
      />
      {/* Holographic Scanlines */}
      <Scanline density={scanlineDensity} opacity={scanlineOpacity} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  );
}

export default GraphicsPipelineEffects;
