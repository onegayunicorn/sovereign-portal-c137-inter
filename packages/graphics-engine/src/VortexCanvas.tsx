import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PortalGunModel } from './PortalGunModel';

export interface VortexCanvasProps {
  /** Normalized audio resonance 0..1. */
  resonance?: number;
  /** Firing state forwarded to the portal gun. */
  firing?: boolean;
  /** Render the portal gun model. Default true. */
  showGun?: boolean;
  /** Render the particle accretion vortex. Default true. */
  showVortex?: boolean;
  /** Number of vortex particles. Default 1400. */
  particleCount?: number;
  className?: string;
  /** Passed through to the underlying Canvas. */
  dpr?: [number, number];
}

/** Canonical GLSL lives in `src/shaders/portal.frag`; this is the r3f binding. */
const VORTEX_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VORTEX_FRAGMENT_SHADER = `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_audio_resonance;
  uniform vec2 u_portal_center;
  varying vec2 vUv;

  #define PI 3.14159265359

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = vUv - 0.5 - u_portal_center;
    uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

    float dist = length(uv);
    float angle = atan(uv.y, uv.x);

    float warp = 3.0 * sin(dist * 8.0 - u_time * 2.5 + u_audio_resonance * 4.0);
    float spiral = angle + warp / (dist + 0.15);

    vec2 p = vec2(dist * 4.0 - u_time * 0.8, spiral * 2.0 / PI);
    float n = noise(p) * 0.65 + noise(p * 2.5 + u_time * 0.5) * 0.35;

    vec3 col_core = vec3(0.05, 0.95, 0.35);
    vec3 col_accent = vec3(0.85, 1.00, 0.40);
    vec3 col_void = vec3(0.01, 0.08, 0.04);

    float rim = smoothstep(0.75, 0.25, dist);
    float center_glow = exp(-dist * 4.5) * (1.2 + u_audio_resonance * 2.0);

    vec3 color = mix(col_void, col_core, n * rim);
    color += col_accent * center_glow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface VortexPlaneProps {
  resonance: number;
}

/** Fullscreen vortex quad rendered behind every other element. */
const VortexPlane: React.FC<VortexPlaneProps> = ({ resonance }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(size.width, size.height) },
      u_audio_resonance: { value: resonance },
      u_portal_center: { value: new THREE.Vector2(0, 0) },
    }),
    // Uniform objects are intentionally stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.u_time.value = state.clock.getElapsedTime();
    material.uniforms.u_resolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    material.uniforms.u_audio_resonance.value = resonance;
  });

  return (
    <mesh position={[0, 0, -4]}>
      <planeGeometry args={[viewport.width * 3, viewport.height * 3, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VORTEX_VERTEX_SHADER}
        fragmentShader={VORTEX_FRAGMENT_SHADER}
        depthWrite={false}
      />
    </mesh>
  );
};

interface AccretionParticlesProps {
  resonance: number;
  count: number;
}

/** Audio-reactive accretion vortex particles spiralling into the portal core. */
const AccretionParticles: React.FC<AccretionParticlesProps> = ({ resonance, count }) => {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    const angles = new Float32Array(count);
    const heights = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const radius = 0.45 + Math.random() * 2.6;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 1.4;
      radii[i] = radius;
      angles[i] = angle;
      heights[i] = height;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius * 0.35;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    (geo as THREE.BufferGeometry & { userData: Record<string, unknown> }).userData = { radii, angles, heights };
    return geo;
  }, [count]);

  useFrame((state, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    const time = state.clock.getElapsedTime();
    const attribute = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const { radii, angles, heights } = (points.geometry as THREE.BufferGeometry & {
      userData: { radii: Float32Array; angles: Float32Array; heights: Float32Array };
    }).userData;

    const spin = 0.35 + resonance * 1.9;
    for (let i = 0; i < radii.length; i += 1) {
      const radius = 0.45 + ((radii[i] - 0.45 - delta * (0.25 + resonance)) % 2.6 + 2.6) % 2.6;
      const angle = angles[i] + time * spin;
      attribute.setXYZ(
        i,
        Math.cos(angle) * radius,
        heights[i] + Math.sin(time * 2.0 + i * 0.12) * 0.06,
        Math.sin(angle) * radius * 0.35,
      );
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color="#00ff88"
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
};

/**
 * VortexCanvas — audio-reactive WebGL stage combining the portal vortex shader,
 * the accretion particle vortex and the interactive portal gun.
 */
export const VortexCanvas: React.FC<VortexCanvasProps> = ({
  resonance = 0,
  firing = false,
  showGun = true,
  showVortex = true,
  particleCount = 1400,
  className,
  dpr = [1, 2],
}) => {
  return (
    <div className={className} style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 4], fov: 45, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#020b05'), 1);
        }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[3, 3, 4]} intensity={2.2} color="#00ff88" />
        <pointLight position={[-4, -2, 2]} intensity={1.1} color="#00e5ff" />

        {showVortex && <VortexPlane resonance={resonance} />}
        {showVortex && <AccretionParticles resonance={resonance} count={particleCount} />}
        {showGun && <PortalGunModel resonance={resonance} firing={firing} />}
      </Canvas>
    </div>
  );
};

export default VortexCanvas;
