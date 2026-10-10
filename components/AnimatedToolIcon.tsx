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

const sharedToolIconPalette: ToolIconPalette = {
  bg: 'var(--accent-dim, var(--bg-elevated))',
  bg2: 'var(--bg-elevated)',
  icon: 'var(--accent)',
  border: 'var(--accent-active)',
  shadow: 'var(--elevation-card)',
};

export const toolIconPalettes: Record<ToolIconTone, ToolIconPalette> = {
  emerald: sharedToolIconPalette,
  mint: sharedToolIconPalette,
  cyan: sharedToolIconPalette,
  blue: sharedToolIconPalette,
  indigo: sharedToolIconPalette,
  violet: sharedToolIconPalette,
  purple: sharedToolIconPalette,
  rose: sharedToolIconPalette,
  pink: sharedToolIconPalette,
  amber: sharedToolIconPalette,
  slate: sharedToolIconPalette,
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
  void color;
  return 'slate';
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
              boxShadow: 'var(--elevation-card)',
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
