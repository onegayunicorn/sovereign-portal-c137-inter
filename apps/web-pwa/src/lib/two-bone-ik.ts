import * as THREE from 'three';

/**
 * two-bone-ik
 * Analytic Two-Bone Inverse Kinematics solver using the Law of Cosines to
 * position humanoid arms so they point precisely at HUD target points in 3D
 * world space.
 */

export interface TwoBoneIKChain {
  root: THREE.Bone; // Shoulder
  mid: THREE.Bone; // Elbow
  effector: THREE.Bone; // Wrist
  lengthA: number; // Upper arm length
  lengthB: number; // Forearm length
}

export interface TwoBoneIKResult {
  reachable: boolean;
  /** Clamped distance actually used by the solver (metres). */
  targetDistance: number;
  /** Interior elbow angle in radians. */
  elbowAngle: number;
  /** Shoulder offset angle applied around the local Y axis. */
  shoulderOffsetAngle: number;
}

const EPSILON = 0.001;

/**
 * Solves analytic Two-Bone IK in 3D using the Law of Cosines.
 * Mutates `chain.root` and `chain.mid` rotations; never touches the effector.
 */
export function solveTwoBoneIK(
  chain: TwoBoneIKChain,
  targetWorldPos: THREE.Vector3,
  poleTarget: THREE.Vector3,
): TwoBoneIKResult | null {
  const rootWorldPos = new THREE.Vector3();
  chain.root.getWorldPosition(rootWorldPos);

  const a = chain.lengthA;
  const b = chain.lengthB;
  if (a <= 0 || b <= 0) return null;

  const dir = new THREE.Vector3().subVectors(targetWorldPos, rootWorldPos);
  const targetDist = Math.min(dir.length(), a + b - EPSILON);
  if (targetDist <= EPSILON) {
    // Target coincides with the shoulder — nothing sensible to solve.
    return { reachable: false, targetDistance: targetDist, elbowAngle: 0, shoulderOffsetAngle: 0 };
  }

  const cosElbow = (a * a + b * b - targetDist * targetDist) / (2 * a * b);
  const elbowAngle = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosElbow)));

  const cosShoulder = (a * a + targetDist * targetDist - b * b) / (2 * a * targetDist);
  const shoulderOffsetAngle = Math.acos(Math.max(-1, Math.min(1, cosShoulder)));

  dir.normalize();
  const parent = chain.root.parent;
  if (!parent) return null;

  const localTarget = targetWorldPos.clone();
  parent.worldToLocal(localTarget);

  // Aim the shoulder at the target, then rotate into the plane defined by the
  // pole target so the elbow bends in a natural direction.
  chain.root.lookAt(targetWorldPos);

  const poleDir = new THREE.Vector3().subVectors(poleTarget, rootWorldPos);
  if (poleDir.lengthSq() > EPSILON) {
    poleDir.normalize();
    const bendSign = Math.sign(poleDir.dot(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)))) || 1;
    chain.root.rotateY(shoulderOffsetAngle * bendSign);
  } else {
    chain.root.rotateY(shoulderOffsetAngle);
  }

  chain.mid.rotation.set(0, 0, 0);
  chain.mid.rotateZ(elbowAngle);

  return {
    reachable: targetDist < a + b - EPSILON,
    targetDistance: targetDist,
    elbowAngle,
    shoulderOffsetAngle,
  };
}

/**
 * Projects a 2D screen coordinate (percentage 0-100) into 3D world space on a
 * plane parallel to the camera at `targetZPlane`.
 */
export function projectScreenToWorld(
  screenXPercent: number,
  screenYPercent: number,
  camera: THREE.Camera,
  targetZPlane = 0.5,
): THREE.Vector3 {
  const ndcX = (screenXPercent / 100) * 2 - 1;
  const ndcY = -(screenYPercent / 100) * 2 + 1;

  const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
  vector.unproject(camera);

  const dir = vector.sub(camera.position).normalize();
  const denominator = Math.abs(dir.z) < EPSILON ? EPSILON : dir.z;
  const distance = (targetZPlane - camera.position.z) / denominator;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

/**
 * Convenience wrapper: aims a whole arm chain at a percentage coordinate.
 * Returns `null` when the chain or camera is unusable.
 */
export function aimChainAtScreenTarget(
  chain: TwoBoneIKChain,
  screenXPercent: number,
  screenYPercent: number,
  camera: THREE.Camera,
  poleTarget?: THREE.Vector3,
): TwoBoneIKResult | null {
  const worldTarget = projectScreenToWorld(screenXPercent, screenYPercent, camera);
  const rootWorldPos = new THREE.Vector3();
  chain.root.getWorldPosition(rootWorldPos);
  const resolvedPole =
    poleTarget ?? rootWorldPos.clone().add(new THREE.Vector3(0, -1, -0.5));
  return solveTwoBoneIK(chain, worldTarget, resolvedPole);
}
