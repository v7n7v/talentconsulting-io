'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { SonaMarkV2PrimaryState } from './sona-v2-geometry';

interface SonaSignalsV2Props {
  state: SonaMarkV2PrimaryState;
  activity: number;
  detailed: boolean;
  reducedMotion: boolean;
  starGradientId: string;
  signalGradientId: string;
}

const orbitX = [0, 9, 1, -29, -60, -76, -63, -34, 0];
const orbitY = [0, 28, 56, 74, 64, 38, 11, 0, 0];
const compactListeningPaths = [
  { id: 'left-inner', path: 'M 23 42 C 14 50 14 70 23 78', width: 2.8 },
  { id: 'right-inner', path: 'M 97 42 C 106 50 106 70 97 78', width: 2.8 },
];
const detailedListeningPaths = [
  ...compactListeningPaths,
  { id: 'left-outer', path: 'M 17 35 C 4 47 4 73 17 85', width: 1.8 },
  { id: 'right-outer', path: 'M 103 35 C 116 47 116 73 103 85', width: 1.8 },
];

function Star({ state, activity, reducedMotion, gradientId }: {
  state: SonaMarkV2PrimaryState;
  activity: number;
  reducedMotion: boolean;
  gradientId: string;
}) {
  const strength = 0.7 + activity * 0.55;
  const staticPose = state === 'thinking'
    ? { x: -31, y: 14, rotate: 24, scale: 1.05 }
    : state === 'speaking'
      ? { x: 0, y: 3, rotate: 8, scale: strength }
      : { x: 0, y: 0, rotate: 0, scale: state === 'locked' ? 0.82 : 1 };

  const animate = reducedMotion
    ? staticPose
    : state === 'thinking'
      ? { x: orbitX, y: orbitY, rotate: [0, 45, 90, 140, 190, 235, 285, 330, 360], scale: [1, 1.08, 0.94, 1.05, 1] }
      : state === 'speaking'
        ? { y: [0, -3 * strength, 1, -2 * strength, 0], rotate: [0, 8, -5, 6, 0], scale: [1, strength, 0.94, 1.08, 1] }
        : state === 'listening'
          ? { scale: [1, strength, 1], opacity: [0.7, 1, 0.7] }
          : state === 'success'
            ? { x: [0, 7, 0], y: [0, 8, 0], rotate: [0, 70, 0], scale: [1, 1.2, 1] }
            : state === 'error'
              ? { opacity: [0.52, 0.34, 0.52], scale: [1, 0.92, 1] }
              : state === 'locked'
                ? staticPose
                : { scale: [1, 1, 1.18, 1], rotate: [0, 0, 12, 0] };

  const transition = reducedMotion
    ? { duration: 0 }
    : state === 'thinking'
      ? { duration: 3.2, repeat: Infinity, ease: 'linear' as const }
      : state === 'success' || state === 'error'
        ? { duration: 0.62, repeat: 0, ease: 'easeOut' as const }
        : state === 'locked'
          ? { duration: 0 }
          : { duration: state === 'idle' ? 4.8 : 1.1, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <g transform="translate(94 22)">
      <motion.g animate={animate} transition={transition} style={{ transformOrigin: '0px 0px' }}>
        <path
          d="M 0 -8 C 0.9 -3.1 3.1 -0.9 8 0 C 3.1 0.9 0.9 3.1 0 8 C -0.9 3.1 -3.1 0.9 -8 0 C -3.1 -0.9 -0.9 -3.1 0 -8 Z"
          fill={`url(#${gradientId})`}
          opacity={state === 'locked' ? 0.5 : 1}
        />
      </motion.g>
    </g>
  );
}

export default function SonaSignalsV2({
  state,
  activity,
  detailed,
  reducedMotion,
  starGradientId,
  signalGradientId,
}: SonaSignalsV2Props) {
  const strength = 0.35 + activity * 0.65;

  return (
    <>
      <AnimatePresence initial={false}>
        {state === 'listening' && (
          <motion.g
            key="listening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            fill="none"
            stroke={`url(#${signalGradientId})`}
            strokeLinecap="round"
          >
            {(detailed ? detailedListeningPaths : compactListeningPaths).map((signal, index) => (
              <motion.path
                key={signal.id}
                d={signal.path}
                strokeWidth={signal.width}
                animate={reducedMotion ? { opacity: strength } : { opacity: [0.2, strength, 0.2], pathLength: [0.45, 1, 0.45] }}
                transition={{ duration: 1.45, delay: (index % 2) * 0.12 + Math.floor(index / 2) * 0.18, repeat: reducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
              />
            ))}
          </motion.g>
        )}

        {state === 'speaking' && (
          <motion.g
            key="speaking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            fill="none"
            stroke={`url(#${signalGradientId})`}
            strokeLinecap="round"
            strokeWidth={detailed ? 2.5 : 3}
          >
            {[46, 60, 74].map((y, index) => (
              <motion.path
                key={y}
                d={`M 97 ${y} C ${105 + index * 2} ${y - 4} ${106 + index * 2} ${y + 4} 114 ${y}`}
                animate={reducedMotion ? { pathLength: 0.7 + activity * 0.25 } : { pathLength: [0.35, 0.72 + activity * 0.28, 0.46], opacity: [0.45, 1, 0.55] }}
                transition={{ duration: 0.62 + index * 0.13, repeat: reducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
              />
            ))}
          </motion.g>
        )}

        {state === 'thinking' && detailed && (
          <motion.g key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <ellipse cx="60" cy="60" rx="49" ry="41" fill="none" stroke={`url(#${signalGradientId})`} strokeWidth="1.4" strokeDasharray="2 5" opacity="0.68" />
            {[0, 1, 2].map((index) => (
              <motion.circle
                key={index}
                cx="94"
                cy="22"
                r={2.4 - index * 0.45}
                fill={index === 0 ? '#ffd27d' : index === 1 ? '#77e6ef' : '#ff8acb'}
                animate={reducedMotion ? { x: -31 - index * 4, y: 14 + index * 5, opacity: 0.45 } : { x: orbitX, y: orbitY, opacity: [0, 0.5, 0.28, 0] }}
                transition={{ duration: 3.2, delay: -index * 0.18, repeat: reducedMotion ? 0 : Infinity, ease: 'linear' }}
              />
            ))}
          </motion.g>
        )}

        {state === 'success' && detailed && (
          <motion.path
            key="success"
            d="M 89 31 C 99 34 104 42 103 51"
            fill="none"
            stroke="#76dfb2"
            strokeWidth="2.2"
            strokeLinecap="round"
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: [0, 1, 0], pathLength: 1 }}
            transition={{ duration: 0.72, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <Star state={state} activity={activity} reducedMotion={reducedMotion} gradientId={starGradientId} />
    </>
  );
}
