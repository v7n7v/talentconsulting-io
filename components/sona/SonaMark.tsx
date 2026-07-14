'use client';

import { motion, useReducedMotion } from 'framer-motion';

export type SonaMarkState = 'idle' | 'listening' | 'thinking' | 'responding' | 'success' | 'error' | 'locked';
export type SonaMarkSize = 'xs' | 'sm' | 'md' | 'lg';

interface SonaMarkProps {
  state?: SonaMarkState;
  size?: SonaMarkSize;
  className?: string;
  title?: string;
}

const sizeClass: Record<SonaMarkSize, string> = {
  xs: 'h-7 w-7 rounded-[10px]',
  sm: 'h-10 w-10 rounded-[14px]',
  md: 'h-14 w-14 rounded-[18px]',
  lg: 'h-24 w-24 rounded-[28px]',
};

const ringInset: Record<SonaMarkSize, string> = {
  xs: '-inset-[2px]',
  sm: '-inset-[3px]',
  md: '-inset-[4px]',
  lg: '-inset-[6px]',
};

const stateGlow: Record<SonaMarkState, string> = {
  idle: '0 10px 26px rgba(56,189,248,0.14), 0 7px 20px rgba(124,58,237,0.08)',
  listening: '0 13px 32px rgba(14,165,233,0.24), 0 8px 24px rgba(16,185,129,0.14)',
  thinking: '0 15px 38px rgba(14,165,233,0.28), 0 10px 30px rgba(124,58,237,0.18), 0 5px 18px rgba(236,72,153,0.12)',
  responding: '0 13px 34px rgba(59,130,246,0.24), 0 9px 24px rgba(236,72,153,0.13)',
  success: '0 12px 30px rgba(16,185,129,0.22), 0 7px 20px rgba(14,165,233,0.1)',
  error: '0 10px 24px rgba(148,163,184,0.12)',
  locked: '0 10px 24px rgba(148,163,184,0.12)',
};

const stateAccent: Record<SonaMarkState, string> = {
  idle: 'rgba(14,165,233,0.46)',
  listening: 'rgba(16,185,129,0.64)',
  thinking: 'rgba(14,165,233,0.78)',
  responding: 'rgba(59,130,246,0.68)',
  success: 'rgba(16,185,129,0.72)',
  error: 'rgba(239,68,68,0.58)',
  locked: 'rgba(148,163,184,0.5)',
};

export default function SonaMark({ state = 'idle', size = 'md', className = '', title }: SonaMarkProps) {
  const prefersReducedMotion = useReducedMotion();
  const muted = state === 'error' || state === 'locked';
  const active = state === 'thinking' || state === 'listening' || state === 'responding';

  const floatMotion = prefersReducedMotion
    ? undefined
    : active
      ? { y: [0, -2, 0], scale: [1, 1.018, 1] }
      : state === 'success'
        ? { scale: [1, 1.04, 1] }
        : undefined;

  const imageMotion = prefersReducedMotion || muted
    ? undefined
    : state === 'thinking'
      ? {
          scale: [1, 1.035, 1],
          filter: ['saturate(1.04) brightness(1)', 'saturate(1.18) brightness(1.045)', 'saturate(1.04) brightness(1)'],
        }
      : state === 'listening'
        ? {
            scale: [1, 1.025, 1],
            filter: ['saturate(1.06)', 'saturate(1.2)', 'saturate(1.06)'],
          }
        : state === 'responding'
          ? {
              scale: [1, 1.02, 1],
              filter: ['saturate(1.05) brightness(1)', 'saturate(1.14) brightness(1.035)', 'saturate(1.05) brightness(1)'],
            }
          : undefined;

  return (
    <motion.span
      className={`relative inline-grid shrink-0 place-items-center overflow-visible ${sizeClass[size]} ${className}`}
      style={{
        boxShadow: stateGlow[state],
      }}
      animate={floatMotion}
      transition={{ duration: state === 'thinking' ? 2.4 : 3.2, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {(active || state === 'success') && (
        <motion.span
          className={`pointer-events-none absolute ${ringInset[size]} rounded-[inherit] opacity-80`}
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${stateAccent[state]} 82deg, rgba(236,72,153,0.34) 138deg, transparent 220deg, transparent 360deg)`,
          }}
          animate={prefersReducedMotion ? undefined : { rotate: 360, opacity: [0.58, 0.95, 0.58] }}
          transition={{ duration: state === 'thinking' ? 2.2 : 3.4, repeat: Infinity, ease: 'linear' }}
        />
      )}

      <span
        className="relative z-10 block h-full w-full overflow-hidden rounded-[inherit] border"
        style={{
          borderColor: muted ? 'rgba(148,163,184,0.32)' : stateAccent[state],
          background: 'var(--bg-surface)',
        }}
      >
        <motion.img
          src="/sona-icon.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-full w-full select-none object-cover"
          style={{
            filter: muted ? 'grayscale(0.86) saturate(0.34) opacity(0.74)' : undefined,
          }}
          animate={imageMotion}
          transition={{ duration: state === 'thinking' ? 2.3 : 3.1, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
        />
        {active && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background: 'linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.72) 44%, rgba(125,211,252,0.36) 56%, transparent 78%)',
            }}
            animate={prefersReducedMotion ? undefined : { x: ['-125%', '125%'] }}
            transition={{ duration: state === 'thinking' ? 1.7 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </span>
    </motion.span>
  );
}
