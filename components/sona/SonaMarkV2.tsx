'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { memo, useId } from 'react';
import SonaMarkV2Defs, { type SonaV2SvgIds } from './SonaMarkV2Defs';
import SonaSignalsV2 from './SonaSignalsV2';
import {
  SONA_VIEW_BOX,
  clampSonaActivity,
  normalizeSonaV2State,
  sonaRibbonPaths,
  sonaV2DetailedSize,
  sonaV2SizeClass,
  type SonaMarkV2Size,
  type SonaMarkV2State,
} from './sona-v2-geometry';

export interface SonaMarkV2Props {
  state?: SonaMarkV2State;
  size?: SonaMarkV2Size;
  activity?: number;
  className?: string;
  title?: string;
}

function cleanSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function SonaMarkV2({
  state = 'idle',
  size = 'md',
  activity,
  className = '',
  title,
}: SonaMarkV2Props) {
  const reactId = cleanSvgId(useId());
  const prefersReducedMotion = Boolean(useReducedMotion());
  const normalizedState = normalizeSonaV2State(state);
  const level = clampSonaActivity(activity);
  const detailed = sonaV2DetailedSize[size];
  const ribbonPath = detailed ? sonaRibbonPaths[normalizedState] : sonaRibbonPaths.idle;
  const locked = normalizedState === 'locked';
  const error = normalizedState === 'error';

  const ids: SonaV2SvgIds = {
    ribbon: `sona-ribbon-${reactId}`,
    fold: `sona-fold-${reactId}`,
    star: `sona-star-${reactId}`,
    signal: `sona-signal-${reactId}`,
    clip: `sona-clip-${reactId}`,
    mask: `sona-mask-${reactId}`,
    glow: `sona-glow-${reactId}`,
    shadow: `sona-shadow-${reactId}`,
  };

  const ribbonAnimate = prefersReducedMotion
    ? { d: ribbonPath, x: 0, scale: 1 }
    : normalizedState === 'idle'
      ? { d: ribbonPath, y: [0, -0.8, 0], scaleY: [1, 1.012, 1], scaleX: [1, 0.997, 1] }
      : normalizedState === 'listening'
        ? { d: ribbonPath, x: level * 1.2, scale: [1, 1 + level * 0.016, 1] }
        : normalizedState === 'thinking'
          ? { d: ribbonPath, rotate: [-0.7, 0.9, -0.7], y: [0, -1.2, 0] }
          : normalizedState === 'speaking'
            ? { d: ribbonPath, scaleX: [1, 1 + level * 0.018, 1], scaleY: [1, 1 + level * 0.034, 0.995, 1] }
            : normalizedState === 'success'
              ? { d: ribbonPath, scale: [1, 1.04, 1] }
              : normalizedState === 'error'
                ? { d: ribbonPath, x: [0, -1.8, 1.6, -0.8, 0] }
                : { d: ribbonPath };

  const ribbonTransition = prefersReducedMotion
    ? { duration: 0 }
    : normalizedState === 'idle'
      ? { duration: 5.2, repeat: Infinity, ease: 'easeInOut' as const }
      : normalizedState === 'success' || normalizedState === 'error'
        ? { duration: 0.58, repeat: 0, ease: 'easeOut' as const }
        : normalizedState === 'locked'
          ? { duration: 0 }
          : { duration: normalizedState === 'thinking' ? 2 : normalizedState === 'speaking' ? 0.82 : 1.45, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <motion.span
      className={`sona-mark-v2 inline-grid shrink-0 place-items-center overflow-visible ${sonaV2SizeClass[size]} ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      data-sona-state={normalizedState}
      data-sona-size={size}
      initial={false}
      animate={{ opacity: locked ? 0.72 : 1 }}
      transition={{ duration: 0.2 }}
    >
      <svg viewBox={SONA_VIEW_BOX} className="h-full w-full overflow-visible" focusable="false" aria-hidden="true">
        <SonaMarkV2Defs ids={ids} locked={locked} error={error} />

        {detailed && !locked && (
          <motion.path
            d={ribbonPath}
            fill="none"
            stroke={normalizedState === 'success' ? '#72ddb0' : normalizedState === 'error' ? '#dc8190' : '#66dfe9'}
            strokeWidth="25"
            strokeLinecap="round"
            opacity={normalizedState === 'thinking' ? 0.24 : 0.14}
            filter={`url(#${ids.glow})`}
            animate={ribbonAnimate}
            transition={ribbonTransition}
            style={{ transformOrigin: '60px 60px' }}
          />
        )}

        <motion.g style={{ transformOrigin: '60px 60px' }} filter={detailed ? `url(#${ids.shadow})` : undefined}>
          <motion.path
            d={ribbonPath}
            fill="none"
            stroke={`url(#${ids.ribbon})`}
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={ribbonAnimate}
            transition={ribbonTransition}
            style={{ transformOrigin: '60px 60px' }}
          />
          {detailed && !locked && (
            <motion.path
              d={ribbonPath}
              fill="none"
              stroke={`url(#${ids.fold})`}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="64 145"
              animate={{ d: ribbonPath, strokeDashoffset: normalizedState === 'thinking' ? [5, -22, 5] : [0, -8, 0] }}
              transition={{ duration: normalizedState === 'thinking' ? 2 : 5.2, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
              opacity="0.62"
            />
          )}
          {!detailed && (
            <motion.path
              d={ribbonPath}
              fill="none"
              stroke="#fff"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity={locked ? 0.18 : 0.32}
              animate={{ d: ribbonPath }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
          )}
        </motion.g>

        {detailed && !locked && (
          <motion.path
            d={ribbonPath}
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="18 154"
            clipPath={`url(#${ids.clip})`}
            mask={`url(#${ids.mask})`}
            opacity={normalizedState === 'error' ? 0.16 : 0.58}
            animate={{ d: ribbonPath, strokeDashoffset: prefersReducedMotion ? -34 : [24, -170] }}
            transition={{ duration: normalizedState === 'thinking' ? 2.4 : 6.8, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
          />
        )}

        <SonaSignalsV2
          state={normalizedState}
          activity={level}
          detailed={detailed}
          reducedMotion={prefersReducedMotion}
          starGradientId={ids.star}
          signalGradientId={ids.signal}
        />
      </svg>
    </motion.span>
  );
}

export default memo(SonaMarkV2);

export type { SonaMarkV2Size, SonaMarkV2State } from './sona-v2-geometry';
