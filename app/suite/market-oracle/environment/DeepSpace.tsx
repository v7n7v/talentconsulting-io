'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ORACLE_COLORS } from '../palette';

// ═══════════════════════════════════════════════════════
// 1. FAR STARS — Distant twinkling star field
// ═══════════════════════════════════════════════════════
export function FarStars({ count = 3000 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.1 + Math.random() * 0.4;
    }
    return [pos, sz];
  }, [count]);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.00015;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        color={ORACLE_COLORS.paper}
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ═══════════════════════════════════════════════════════
// 2. NEBULA CLOUDS — Soft colored fog layers
// ═══════════════════════════════════════════════════════
function NebulaCloud({ position, color, scale, speed }: {
  position: [number, number, number];
  color: string;
  scale: number;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z += speed * 0.001;
      ref.current.position.y += Math.sin(state.clock.elapsedTime * speed * 0.3) * 0.003;
    }
  });

  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={[scale, scale]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.06}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function NebulaClouds() {
  const clouds = useMemo(() => [
    { position: [-15, 8, -35] as [number, number, number], color: ORACLE_COLORS.coral, scale: 40, speed: 0.4 },
    { position: [20, -5, -45] as [number, number, number], color: ORACLE_COLORS.coralInk, scale: 50, speed: 0.3 },
    { position: [-8, -12, -30] as [number, number, number], color: ORACLE_COLORS.soft, scale: 35, speed: 0.5 },
    { position: [12, 15, -40] as [number, number, number], color: ORACLE_COLORS.coral, scale: 45, speed: 0.35 },
  ], []);

  return (
    <>
      {clouds.map((c, i) => (
        <NebulaCloud key={i} {...c} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════
// 3. PARTICLE DUST — Micro-particles with drift
// ═══════════════════════════════════════════════════════
export function ParticleDust({ count = 400 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const geo = ref.current.geometry;
    const posAttr = geo.getAttribute('position');
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      posAttr.setY(ix / 3, posAttr.getY(ix / 3) + Math.sin(t + i * 0.1) * 0.002);
      posAttr.setX(ix / 3, posAttr.getX(ix / 3) + Math.cos(t * 0.5 + i * 0.05) * 0.001);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color={ORACLE_COLORS.coral}
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ═══════════════════════════════════════════════════════
// 4. GRID FLOOR — Spatial reference plane
// ═══════════════════════════════════════════════════════
export function GridFloor() {
  const ref = useRef<THREE.GridHelper>(null);

  return (
    <gridHelper
      ref={ref}
      args={[60, 30, ORACLE_COLORS.coral, ORACLE_COLORS.coralInk]}
      position={[0, -10, 0]}
      rotation={[0, 0, 0]}
      material-transparent
      material-opacity={0.06}
      material-depthWrite={false}
    />
  );
}

// ═══════════════════════════════════════════════════════
// COMBINED EXPORT
// ═══════════════════════════════════════════════════════
export default function DeepSpaceEnvironment() {
  return (
    <>
      <FarStars count={3000} />
      <NebulaClouds />
      <ParticleDust count={400} />
      <GridFloor />
    </>
  );
}
