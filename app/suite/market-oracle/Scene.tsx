'use client';

import { useState, useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { DeepSpaceEnvironment, WarpLane } from './environment';
import { ORACLE_COLORS } from './palette';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
export interface JobStar {
  id: string;
  title: string;
  company: string;
  // null when the source did not list a salary — the tooltip shows "Salary not
  // listed" rather than a synthetic figure.
  salary: number | null;
  skills: string[];
  // null when no fit was measured for this job — the tooltip shows "Fit not
  // computed" rather than a synthetic percentage.
  fitScore: number | null;
  position: [number, number, number];
  color: string;
  isConstellation: boolean;
  url?: string;
  location?: string;
  description?: string;
  isReal?: boolean;
  source?: string;
}

export interface BridgeSkill {
  skill: string;
  // impact, salaryIncrease and newFitScore are gone. impact was an LLM-estimated
  // 1-10 score (or `4 + index` in the client fallback), salaryIncrease was dollars
  // from the same guess, and newFitScore was derived from impact — so a fabricated
  // input produced a fabricated score. newPosition stays: it is only where the node
  // is drawn in 3D space, not a claim about the user.
  newPosition: [number, number, number];
}

export interface MarketAnalysis {
  currentPosition: [number, number, number];
  talentDensityPercentile: number | null;
  topSkills: string[];
  missingSkills: string[];
  bridgeSkills: BridgeSkill[];
  jobs: JobStar[];
  industryInsights: string[];
}

// ═══════════════════════════════════════════════════════
// JOB STAR — Tiered visual based on fit score
// ═══════════════════════════════════════════════════════
function JobStarMesh({
  job, onClick, isSelected, showBridge
}: {
  job: JobStar;
  onClick: () => void;
  isSelected: boolean;
  showBridge: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Tiered visuals. A null fit (not measured) falls to the muted 'low' tier for
  // layout; the tooltip states "Fit not computed" rather than implying a score.
  const fit = job.fitScore;
  const tier = fit == null ? 'low'
    : fit > 0.8 ? 'elite'
    : fit > 0.6 ? 'strong'
    : fit > 0.4 ? 'decent' : 'low';

  const config = {
    elite:  { size: 0.3, emissive: 2.5, glowScale: 1.8, color: ORACLE_COLORS.coral },
    strong: { size: 0.22, emissive: 1.5, glowScale: 1.4, color: ORACLE_COLORS.coralInk },
    decent: { size: 0.16, emissive: 0.8, glowScale: 0,   color: ORACLE_COLORS.soft },
    low:    { size: 0.1,  emissive: 0.3, glowScale: 0,   color: ORACLE_COLORS.muted },
  }[tier];

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    // Pulse for elite/strong
    if (tier === 'elite') {
      meshRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.12);
    } else if (tier === 'strong') {
      meshRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.06);
    }

    // Hover/select expand
    if (hovered || isSelected) {
      meshRef.current.scale.setScalar(1.6);
    }

    // Glow ring rotation
    if (glowRef.current) {
      glowRef.current.rotation.z += 0.005;
      glowRef.current.scale.setScalar(config.glowScale + Math.sin(t * 1.5) * 0.2);
    }
  });

  // Company initials for tooltip
  const initials = job.company.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <group position={job.position}>
      {/* Core star */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[config.size, 16, 16]} />
        <meshStandardMaterial
          color={config.color}
          emissive={config.color}
          emissiveIntensity={hovered || isSelected ? config.emissive * 1.5 : config.emissive}
          transparent
          opacity={showBridge && !job.isConstellation ? 0.25 : 1}
        />
      </mesh>

      {/* Outer glow ring (elite + strong only) */}
      {config.glowScale > 0 && (
        <mesh ref={glowRef}>
          <ringGeometry args={[config.size * 1.8, config.size * 2.2, 32]} />
          <meshBasicMaterial
            color={config.color}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Hover tooltip */}
      {(hovered || isSelected) && (
        <Html distanceFactor={12} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: `color-mix(in srgb, ${ORACLE_COLORS.ink} 92%, transparent)`,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${config.color}40`,
            borderRadius: 12,
            padding: '10px 14px',
            whiteSpace: 'nowrap',
            minWidth: 180,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: `color-mix(in srgb, ${config.color} 14%, ${ORACLE_COLORS.ink})`, border: `1px solid ${config.color}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: config.color, fontSize: 11, fontWeight: 700,
              }}>
                {initials}
              </div>
              <div>
                <p style={{ color: ORACLE_COLORS.paper, fontSize: 13, fontWeight: 700, margin: 0 }}>{job.title}</p>
                <p style={{ color: config.color, fontSize: 11, margin: 0 }}>{job.company}</p>
              </div>
            </div>
            {job.location && (
              <p style={{ color: ORACLE_COLORS.soft, fontSize: 10, margin: '0 0 4px 0' }}>📍 {job.location}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {job.salary != null ? (
                <span style={{ color: ORACLE_COLORS.coral, fontSize: 14, fontWeight: 700 }}>
                  ${job.salary.toLocaleString()}
                </span>
              ) : (
                <span style={{ color: ORACLE_COLORS.soft, fontSize: 11, fontWeight: 600 }}>
                  Salary not listed
                </span>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 20,
                background: `${config.color}20`, border: `1px solid ${config.color}30`,
              }}>
                <span style={{ color: config.color, fontSize: 11, fontWeight: 600 }}>
                  {job.fitScore != null ? `${Math.round(job.fitScore * 100)}% fit` : 'Fit not computed'}
                </span>
              </div>
            </div>
            {job.isReal && (
              <div style={{
                marginTop: 6, padding: '2px 6px', borderRadius: 4,
                background: `color-mix(in srgb, ${ORACLE_COLORS.coral} 12%, ${ORACLE_COLORS.ink})`, border: `1px solid ${ORACLE_COLORS.coral}`,
                color: ORACLE_COLORS.coral, fontSize: 9, fontWeight: 600, textAlign: 'center',
              }}>
                ● LIVE JOB
              </div>
            )}
            <p style={{ color: ORACLE_COLORS.muted, fontSize: 9, margin: '5px 0 0 0', textAlign: 'center' }}>
              Click to explore →
            </p>
          </div>
        </Html>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// CONSTELLATION LINES — Connect high-fit jobs to user
// ═══════════════════════════════════════════════════════
function ConstellationLines({ jobs, userPosition }: { jobs: JobStar[]; userPosition: [number, number, number] }) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    jobs.filter(j => j.isConstellation).forEach(job => {
      points.push(new THREE.Vector3(...userPosition));
      points.push(new THREE.Vector3(...job.position));
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [jobs, userPosition]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={ORACLE_COLORS.coral}
        transparent
        opacity={0.2}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

// ═══════════════════════════════════════════════════════
// USER AVATAR — "The Navigator" with crystal + ring + field
// ═══════════════════════════════════════════════════════
function UserAvatar({ position }: { position: [number, number, number] }) {
  const crystalRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const fieldRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (crystalRef.current) {
      crystalRef.current.rotation.y += 0.015;
      crystalRef.current.rotation.x = Math.sin(t * 0.5) * 0.1;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= 0.008;
      ringRef.current.rotation.x = Math.PI / 4;
      ringRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.1);
    }
    if (fieldRef.current) {
      fieldRef.current.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05);
      (fieldRef.current.material as THREE.MeshBasicMaterial).opacity = 0.04 + Math.sin(t) * 0.02;
    }
  });

  return (
    <group position={position}>
      {/* Gravitational field (outer) */}
      <mesh ref={fieldRef}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={ORACLE_COLORS.coral}
          transparent
          opacity={0.04}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Energy ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.8, 0.04, 16, 64]} />
        <meshStandardMaterial
          color={ORACLE_COLORS.coralInk}
          emissive={ORACLE_COLORS.coralInk}
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Core crystal */}
      <mesh ref={crystalRef}>
        <icosahedronGeometry args={[0.35, 1]} />
        <meshStandardMaterial
          color={ORACLE_COLORS.coral}
          emissive={ORACLE_COLORS.coral}
          emissiveIntensity={2.5}
          metalness={0.3}
          roughness={0.2}
        />
      </mesh>

      {/* Point light from user */}
      <pointLight color={ORACLE_COLORS.coral} intensity={1} distance={8} decay={2} />

      {/* YOU label with stats */}
      <Html position={[0, 1.5, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: `color-mix(in srgb, ${ORACLE_COLORS.ink} 90%, transparent)`,
          backdropFilter: 'blur(12px)',
          border: `1px solid ${ORACLE_COLORS.coral}`,
          borderRadius: 12,
          padding: '6px 14px',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          <span style={{ color: ORACLE_COLORS.coral, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, display: 'block' }}>
            ◆ YOU ARE HERE
          </span>
          <span style={{ color: ORACLE_COLORS.soft, fontSize: 9, display: 'block', marginTop: 2 }}>
            The galaxy orbits around your skills
          </span>
        </div>
      </Html>
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// CINEMATIC INTRO — Camera fly-in on mount
// ═══════════════════════════════════════════════════════
function CinematicIntro({ userPosition }: { userPosition: [number, number, number] }) {
  const { camera } = useThree();
  const phaseRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    if (doneRef.current) return;

    phaseRef.current += delta;
    const t = phaseRef.current;

    if (t < 2.5) {
      // Fly from far position to orbit distance
      const progress = Math.min(1, t / 2.0);
      const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      const startZ = 60;
      const endZ = 18;
      const startY = 15;
      const endY = userPosition[1] + 5;

      camera.position.set(
        userPosition[0] + Math.sin(progress * 0.5) * 3,
        THREE.MathUtils.lerp(startY, endY, ease),
        THREE.MathUtils.lerp(startZ, endZ, ease)
      );
      camera.lookAt(new THREE.Vector3(...userPosition));
    } else {
      doneRef.current = true;
    }
  });

  return null;
}

// ═══════════════════════════════════════════════════════
// MAIN SCENE
// ═══════════════════════════════════════════════════════
export default function OracleScene({
  analysis, selectedJob, setSelectedJob, showBridge, activeBridgeSkill, visibleTiers
}: {
  analysis: MarketAnalysis;
  selectedJob: JobStar | null;
  setSelectedJob: (job: JobStar | null) => void;
  showBridge: boolean;
  activeBridgeSkill: BridgeSkill | null;
  visibleTiers: Set<string>;
}) {
  const filteredJobs = useMemo(() => {
    return analysis.jobs.filter(job => {
      const fit = job.fitScore;
      const tier = fit == null ? 'low'
        : fit >= 0.8 ? 'elite'
        : fit >= 0.6 ? 'strong'
        : fit >= 0.4 ? 'decent'
        : 'low';
      return visibleTiers.has(tier);
    });
  }, [analysis.jobs, visibleTiers]);
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <pointLight position={[15, 15, 15]} intensity={0.8} color={ORACLE_COLORS.paper} />
      <pointLight position={[-15, -10, -15]} intensity={0.4} color={ORACLE_COLORS.coralInk} />
      <pointLight position={[0, 20, 0]} intensity={0.3} color={ORACLE_COLORS.coral} />

      {/* Deep Space Environment */}
      <DeepSpaceEnvironment />

      {/* Cinematic Camera Intro */}
      <CinematicIntro userPosition={analysis.currentPosition} />

      {/* Job Stars */}
      {filteredJobs.map((job) => (
        <JobStarMesh
          key={job.id}
          job={job}
          onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
          isSelected={selectedJob?.id === job.id}
          showBridge={showBridge}
        />
      ))}

      {/* Constellation Lines */}
      <ConstellationLines jobs={filteredJobs} userPosition={analysis.currentPosition} />

      {/* User Avatar */}
      <UserAvatar position={analysis.currentPosition} />

      {/* Warp Lanes for Bridge Skills */}
      {analysis.bridgeSkills.map((bs) => (
        <WarpLane
          key={bs.skill}
          startPosition={analysis.currentPosition}
          endPosition={bs.newPosition}
          skillName={bs.skill}
          active={activeBridgeSkill?.skill === bs.skill}
        />
      ))}

      {/* Axis Labels */}
      <Html position={[10, -9, 0]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: ORACLE_COLORS.coral, fontSize: 11, fontWeight: 600, opacity: 0.8 }}>FIT SCORE →</span>
      </Html>
      <Html position={[0, 8, 0]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: ORACLE_COLORS.soft, fontSize: 11, fontWeight: 600, opacity: 0.8 }}>SALARY ↑</span>
      </Html>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={45}
        autoRotate
        autoRotateSpeed={0.3}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  );
}
