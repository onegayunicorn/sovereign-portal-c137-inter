import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface PortalGunProps {
  /** Audio resonance 0.0 - 1.0 driving the fluid emissive intensity. */
  resonance?: number;
  /** Firing state — flips the fluid chamber to high-voltage yellow + recoil. */
  firing?: boolean;
  /** GLB asset path. Default `/models/rick_portal_gun.glb`. */
  modelPath?: string;
  /** Renders the procedural fallback gun when the GLB is absent. Default true. */
  allowFallback?: boolean;
}

export const DEFAULT_GUN_PATH = '/models/rick_portal_gun.glb';

const FIRING_COLOR = 0xffcc00;
const IDLE_COLOR = 0x00ff88;

/** Probes the asset once so we can choose GLB vs procedural without a 404 spam. */
function useAssetAvailable(url: string): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof fetch !== 'function') {
      setAvailable(false);
      return () => {
        cancelled = true;
      };
    }
    fetch(url, { method: 'HEAD' })
      .then((response) => {
        if (!cancelled) setAvailable(response.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return available;
}

/** Procedural portal-gun stand-in: barrel, chassis and glowing fluid chamber. */
function ProceduralPortalGun({ resonance, firing }: { resonance: number; firing: boolean }) {
  const chamberRef = useRef<THREE.Mesh>(null);
  const chamberMaterial = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_state, delta) => {
    const material = chamberMaterial.current;
    if (material) {
      material.emissiveIntensity = 2.0 + resonance * 5.0;
      material.emissive.setHex(firing ? FIRING_COLOR : IDLE_COLOR);
    }
    if (chamberRef.current) {
      chamberRef.current.rotation.y += delta * (0.6 + resonance * 1.8);
    }
  });

  return (
    <group>
      {/* Chest / chassis */}
      <mesh castShadow receiveShadow position={[0, -0.1, 0]}>
        <boxGeometry args={[0.9, 0.4, 0.5]} />
        <meshStandardMaterial color="#1c2b22" metalness={0.85} roughness={0.32} />
      </mesh>
      {/* Barrel */}
      <mesh castShadow position={[0.95, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.12, 1.1, 24]} />
        <meshStandardMaterial color="#2f4034" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* Muzzle emitter */}
      <mesh position={[1.55, 0.05, 0]}>
        <torusGeometry args={[0.14, 0.035, 16, 32]} />
        <meshStandardMaterial
          color={firing ? '#ffcc00' : '#00ff88'}
          emissive={firing ? '#ffcc00' : '#00ff88'}
          emissiveIntensity={2.4 + resonance * 3}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>
      {/* Glowing portal fluid chamber */}
      <mesh ref={chamberRef} position={[-0.05, 0.28, 0]}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial
          ref={chamberMaterial}
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={2.4}
          transparent
          opacity={0.9}
          metalness={0.1}
          roughness={0.15}
        />
      </mesh>
      {/* Grip */}
      <mesh castShadow position={[-0.28, -0.5, 0]} rotation={[0, 0, 0.22]}>
        <boxGeometry args={[0.24, 0.6, 0.3]} />
        <meshStandardMaterial color="#141d17" metalness={0.6} roughness={0.55} />
      </mesh>
    </group>
  );
}

/** Real GLB loader. Suspends until drei has parsed the model. */
function PortalGunGLB({
  modelPath,
  resonance,
  firing,
  animatedRef,
}: {
  modelPath: string;
  resonance: number;
  firing: boolean;
  animatedRef: React.RefObject<THREE.Group | null>;
}) {
  const { scene } = useGLTF(modelPath) as unknown as { scene: THREE.Group };
  const fluidMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Resolve the "PortalLiquid" material once the scene graph is available.
  useEffect(() => {
    let found: THREE.MeshStandardMaterial | null = null;
    scene.traverse((child) => {
      if (!found && (child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if (material && material.name === 'PortalLiquid') {
            found = material as THREE.MeshStandardMaterial;
          }
        });
      }
    });
    fluidMaterialRef.current = found;
  }, [scene]);

  useFrame((state) => {
    if (!animatedRef.current) return;
    const time = state.clock.getElapsedTime();
    animatedRef.current.position.y = Math.sin(time * 2.0) * 0.05 + (firing ? -0.1 : 0);
    animatedRef.current.rotation.z = Math.sin(time * 1.5) * 0.02;

    if (fluidMaterialRef.current) {
      fluidMaterialRef.current.emissiveIntensity = 2.0 + resonance * 5.0;
      fluidMaterialRef.current.emissive = new THREE.Color(firing ? FIRING_COLOR : IDLE_COLOR);
    }
  });

  return <primitive object={scene} />;
}

/**
 * Interactive 3D portal gun.
 * Renders the real `/models/rick_portal_gun.glb` when present and silently
 * falls back to a fully procedural stand-in when the asset is missing —
 * the portal HUD never shows a blank canvas.
 */
export function PortalGunModel({
  resonance = 0,
  firing = false,
  modelPath = DEFAULT_GUN_PATH,
  allowFallback = true,
}: PortalGunProps) {
  const gunRef = useRef<THREE.Group | null>(null);
  const available = useAssetAvailable(modelPath);

  useFrame((_state, delta) => {
    if (!gunRef.current) return;
    if (available) return; // GLB path animates its own group.
    gunRef.current.rotation.y += delta * 0.12;
  });

  const useGlb = available === true;

  return (
    <group ref={gunRef} scale={[1.8, 1.8, 1.8]} position={[0, -0.6, 0]}>
      {useGlb ? (
        <Suspense fallback={<ProceduralPortalGun resonance={resonance} firing={firing} />}>
          <PortalGunGLB modelPath={modelPath} resonance={resonance} firing={firing} animatedRef={gunRef} />
        </Suspense>
      ) : allowFallback ? (
        <ProceduralPortalGun resonance={resonance} firing={firing} />
      ) : null}
    </group>
  );
}

// Only preload when the asset actually exists — the caller controls the path.
export function preloadPortalGun(modelPath: string = DEFAULT_GUN_PATH): void {
  try {
    useGLTF.preload(modelPath);
  } catch {
    // Asset absent — the procedural fallback covers the stage.
  }
}

export default PortalGunModel;
