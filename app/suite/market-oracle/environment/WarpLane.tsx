'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ORACLE_COLORS } from '../palette';

interface WarpLaneProps {
  startPosition: [number, number, number];
  endPosition: [number, number, number];
  skillName: string;
  active: boolean;
}

// salaryIncrease was a prop here and rendered as "+$NK" beside the skill. Nothing
// measured it: the API asked a language model to estimate dollars, and the client
// fallback computed `5000 + index * 2500` from the array index. Both reached a
// between-roles user as a salary outcome. Removed rather than re-sourced — there
// is no honest source for it.
export default function WarpLane({ startPosition, endPosition, skillName, active }: WarpLaneProps) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const ghostRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  // Build a curved path between start and end
  const { curve, tubeGeo } = useMemo(() => {
    const start = new THREE.Vector3(...startPosition);
    const end = new THREE.Vector3(...endPosition);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    // Arc upward for visual clarity
    mid.y += 2;
    mid.x += (Math.random() - 0.5) * 2;

    const c = new THREE.CatmullRomCurve3([start, mid, end]);
    const geo = new THREE.TubeGeometry(c, 48, 0.04, 8, false);
    return { curve: c, tubeGeo: geo };
  }, [startPosition, endPosition]);

  useFrame((state) => {
    if (!active) return;

    // Animate entry
    if (progressRef.current < 1) {
      progressRef.current = Math.min(1, progressRef.current + 0.02);
    }

    // Ghost marker rotation + pulse
    if (ghostRef.current) {
      ghostRef.current.rotation.y -= 0.015;
      ghostRef.current.scale.setScalar(0.8 + Math.sin(state.clock.elapsedTime * 2.5) * 0.15);
    }

    // Tube dash animation via material offset
    if (tubeRef.current) {
      const mat = tubeRef.current.material as THREE.MeshBasicMaterial;
      if (mat.map) {
        mat.map.offset.x -= 0.015;
      }
    }
  });

  if (!active) return null;

  // Midpoint for label
  const midPoint = curve.getPoint(0.5);
  const labelPos: [number, number, number] = [midPoint.x, midPoint.y + 0.8, midPoint.z];

  return (
    <group>
      {/* Warp Lane Tube */}
      <mesh ref={tubeRef} geometry={tubeGeo}>
        <meshBasicMaterial
          color={ORACLE_COLORS.coral}
          transparent
          opacity={0.6 * progressRef.current}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Outer glow tube (wider, dimmer) */}
      <mesh geometry={new THREE.TubeGeometry(curve, 48, 0.12, 8, false)}>
        <meshBasicMaterial
          color={ORACLE_COLORS.coralInk}
          transparent
          opacity={0.1 * progressRef.current}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Ghost marker at endpoint */}
      <mesh ref={ghostRef} position={endPosition}>
        <icosahedronGeometry args={[0.35, 1]} />
        <meshStandardMaterial
          color={ORACLE_COLORS.coral}
          emissive={ORACLE_COLORS.coral}
          emissiveIntensity={1.5}
          transparent
          opacity={0.5 * progressRef.current}
          wireframe
        />
      </mesh>

      {/* Label along the path */}
      <Html position={labelPos} center>
        <div
          style={{
            background: `color-mix(in srgb, ${ORACLE_COLORS.ink} 90%, transparent)`,
            backdropFilter: 'blur(12px)',
            border: `1px solid ${ORACLE_COLORS.coral}`,
            borderRadius: 8,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
            opacity: progressRef.current,
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: ORACLE_COLORS.coral, fontSize: 11, fontWeight: 600 }}>+{skillName}</span>
        </div>
      </Html>
    </group>
  );
}
