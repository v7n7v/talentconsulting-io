'use client';

import { motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
  size?: 'sm' | 'md';
  className?: string;
}

export default function ThemeToggle({ size = 'sm', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // isLight here drives the FUNCTIONAL icon/knob/sky state (which theme is active),
  // not colour theming — colours are tokens and flip via the [data-theme] cascade.
  const isLight = mounted ? theme === 'light' : false;
  const dims = size === 'md'
    ? { w: 64, h: 34, knob: 28, pad: 3, iconSize: 19 }
    : { w: 54, h: 30, knob: 24, pad: 3, iconSize: 17 };

  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  const knobOffset = dims.w - dims.knob - dims.pad * 2;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isLight}
      title={label}
      className={`relative inline-flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] ${className}`}
      style={{
        minWidth: Math.max(dims.w, 44),
        minHeight: 44,
        background: 'transparent',
        border: 'none',
      }}
    >
      <span className="sr-only">{label}</span>

      {/* Visual track — the 44px button is the hit area; this is the switch itself. */}
      <span
        className="relative inline-flex items-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)]"
        style={{
          width: dims.w,
          height: dims.h,
          padding: dims.pad,
        }}
        aria-hidden="true"
      >
        {/* Night sky — stars, shown in dark mode */}
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: isLight ? 0 : 1 }}
          transition={{ duration: 0.22 }}
          aria-hidden="true"
        >
          {mounted && [
            { x: '18%', y: '28%', s: 2 },
            { x: '32%', y: '66%', s: 1.5 },
            { x: '54%', y: '22%', s: 1.5 },
            { x: '72%', y: '58%', s: 2 },
          ].map((star, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-[var(--text-muted)]"
              style={{
                left: star.x,
                top: star.y,
                width: star.s,
                height: star.s,
              }}
              animate={{
                opacity: [0.35, 0.95, 0.35],
                scale: [0.85, 1.25, 0.85],
              }}
              transition={{
                duration: 1.8 + i * 0.15,
                delay: i * 0.12,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.span>

        {/* Day sky — clouds, shown in light mode */}
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: isLight ? 1 : 0 }}
          transition={{ duration: 0.22 }}
          aria-hidden="true"
        >
          <motion.span
            className="absolute rounded-full bg-[var(--text-muted)]"
            style={{
              width: size === 'md' ? 17 : 14,
              height: size === 'md' ? 7 : 6,
              left: '16%',
              top: '26%',
            }}
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          <motion.span
            className="absolute rounded-full bg-[var(--text-muted)]"
            style={{
              width: size === 'md' ? 11 : 9,
              height: size === 'md' ? 5 : 4,
              right: '18%',
              bottom: '24%',
            }}
            animate={{ x: [0, -3, 0] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        </motion.span>

        <motion.span
          className="relative z-10 flex items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)]"
          style={{
            width: dims.knob,
            height: dims.knob,
          }}
          initial={false}
          animate={{
            x: isLight ? knobOffset : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
          aria-hidden="true"
        >
          <motion.span
            key={isLight ? 'light_mode' : 'dark_mode'}
            className="material-symbols-rounded leading-none text-[var(--text-primary)]"
            style={{
              fontSize: dims.iconSize,
              fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24",
            }}
            initial={{ opacity: 0, scale: 0.68, rotate: isLight ? -35 : 35 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {isLight ? 'light_mode' : 'dark_mode'}
          </motion.span>
        </motion.span>
      </span>
    </button>
  );
}
