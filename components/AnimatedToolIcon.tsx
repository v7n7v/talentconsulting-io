'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

type AnimatedToolIconState = 'idle' | 'active' | 'thinking' | 'locked';
type AnimatedToolIconSize = 'xs' | 'sm' | 'md';

export type ToolIconTone =
  | 'emerald'
  | 'mint'
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'rose'
  | 'pink'
  | 'amber'
  | 'slate';

export interface ToolIconPalette {
  bg: string;
  bg2: string;
  icon: string;
  border: string;
  shadow: string;
}

export const toolIconPalettes: Record<ToolIconTone, ToolIconPalette> = {
  emerald: { bg: '#a7e9bd', bg2: '#91ddae', icon: '#287a40', border: '#7bd397', shadow: 'rgba(40,122,64,0.18)' },
  mint: { bg: '#a7eadf', bg2: '#87ddd0', icon: '#11766e', border: '#64d0c2', shadow: 'rgba(17,118,110,0.18)' },
  cyan: { bg: '#9be8f5', bg2: '#7edcea', icon: '#087f9b', border: '#5bcfe1', shadow: 'rgba(8,127,155,0.18)' },
  blue: { bg: '#8ec8f4', bg2: '#72b8ea', icon: '#4b5f73', border: '#5ba9e7', shadow: 'rgba(75,95,115,0.18)' },
  indigo: { bg: '#ded8ff', bg2: '#d4cbff', icon: '#818cf8', border: '#bfb4ff', shadow: 'rgba(129,140,248,0.2)' },
  violet: { bg: '#ead4ff', bg2: '#dfc3fb', icon: '#7c3aed', border: '#c9a8f5', shadow: 'rgba(124,58,237,0.18)' },
  purple: { bg: '#efd1fa', bg2: '#e7bff5', icon: '#2563eb', border: '#dca8ef', shadow: 'rgba(37,99,235,0.18)' },
  rose: { bg: '#ffc9d5', bg2: '#ffb4c4', icon: '#dc2626', border: '#ff93aa', shadow: 'rgba(220,38,38,0.18)' },
  pink: { bg: '#f6c3e1', bg2: '#efa9d3', icon: '#db2777', border: '#e78fc4', shadow: 'rgba(219,39,119,0.18)' },
  amber: { bg: '#ffd89a', bg2: '#ffc877', icon: '#d97706', border: '#f3b45c', shadow: 'rgba(217,119,6,0.18)' },
  slate: { bg: '#dfe5ee', bg2: '#d2dae6', icon: '#475569', border: '#c0cad8', shadow: 'rgba(71,85,105,0.16)' },
};

interface AnimatedToolIconProps {
  icon: string;
  tone?: ToolIconTone;
  color?: string;
  state?: AnimatedToolIconState;
  size?: AnimatedToolIconSize;
  className?: string;
  toneMode?: 'neutral' | 'accent';
}

const sizeClass: Record<AnimatedToolIconSize, string> = {
  xs: 'h-9 w-9 rounded-[11px]',
  sm: 'h-14 w-14 rounded-[18px]',
  md: 'h-16 w-16 rounded-[20px]',
};

const iconSize: Record<AnimatedToolIconSize, number> = {
  xs: 19,
  sm: 28,
  md: 32,
};

function toneFromColor(color?: string): ToolIconTone {
  switch (color?.toLowerCase()) {
    case '#10b981':
    case '#22c55e':
      return 'emerald';
    case '#14b8a6':
      return 'mint';
    case '#06b6d4':
      return 'cyan';
    case '#3b82f6':
      return 'blue';
    case '#8b5cf6':
      return 'indigo';
    case '#a855f7':
      return 'violet';
    case '#f43f5e':
      return 'rose';
    case '#ec4899':
      return 'pink';
    case '#f59e0b':
    case '#f97316':
      return 'amber';
    default:
      return 'slate';
  }
}

export default function AnimatedToolIcon({
  icon,
  tone,
  color,
  state = 'idle',
  size = 'sm',
  className = '',
  toneMode = 'neutral',
}: AnimatedToolIconProps) {
  const prefersReducedMotion = useReducedMotion();
  const isThinking = state === 'thinking';
  const isLocked = state === 'locked';
  const palette = isLocked ? toolIconPalettes.slate : toolIconPalettes[tone || toneFromColor(color)];
  const useAccent = toneMode === 'accent' && !isLocked;

  return (
    <motion.span
      className={`animated-tool-icon ${useAccent ? '' : 'icon-shell-neutral'} relative inline-grid shrink-0 place-items-center overflow-hidden border ${sizeClass[size]} ${className}`}
      style={
        useAccent
          ? ({
              '--tool-accent': palette.icon,
              background: `linear-gradient(135deg, ${palette.bg} 0%, ${palette.bg2} 100%)`,
              borderColor: palette.border,
              boxShadow: `0 12px 26px ${palette.shadow}, inset 0 1px 0 rgba(255,255,255,0.28)`,
            } as CSSProperties)
          : undefined
      }
      animate={
        prefersReducedMotion
          ? undefined
          : {
              scale: isThinking ? [1, 1.03, 0.99, 1] : [1, 1.015, 1],
            }
      }
      transition={{ duration: isThinking ? 1.4 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      {useAccent && <span className="animated-tool-icon__shine absolute inset-0" />}
      <motion.span
        className={`material-symbols-rounded relative z-10 ${useAccent ? '' : 'icon-neutral'}`}
        style={{
          color: useAccent ? palette.icon : 'var(--icon-static)',
          fontSize: iconSize[size],
          fontVariationSettings: '"FILL" 0, "wght" 430, "GRAD" 0, "opsz" 24',
        }}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: isThinking ? [0, -1, 1, 0] : [0, -0.5, 0],
              }
        }
        transition={{ duration: isThinking ? 1.2 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {isLocked ? 'lock' : icon}
      </motion.span>
    </motion.span>
  );
}
