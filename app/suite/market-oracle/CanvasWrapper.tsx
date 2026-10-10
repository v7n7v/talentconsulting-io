'use client';

import { Canvas } from '@react-three/fiber';
import { ReactNode } from 'react';
import * as THREE from 'three';

interface CanvasWrapperProps {
  children: ReactNode;
  className?: string;
  camera?: { position: [number, number, number]; fov: number };
}

export default function CanvasWrapper({ children, className, camera, ...rest }: CanvasWrapperProps) {
  return (
    <Canvas
      className={className}
      camera={camera}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        alpha: false,
      }}
      dpr={[1, 1.5]}
      style={{ background: '#151515' }}
      {...rest}
    >
      {children}
    </Canvas>
  );
}
