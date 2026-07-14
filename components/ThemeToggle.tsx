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
      className={`relative inline-flex flex-shrink-0 cursor-pointer items-center overflow-hidden rounded-full outline-none transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] ${className}`}
      style={{
        width: dims.w,
        height: dims.h,
        minHeight: dims.h,
        padding: dims.pad,
        border: '1px solid var(--border-subtle)',
        background: isLight
          ? 'linear-gradient(135deg, #bae6fd 0%, #60a5fa 54%, #2563eb 100%)'
          : 'linear-gradient(135deg, #020617 0%, #0f172a 54%, #1e293b 100%)',
        boxShadow: isLight
          ? 'inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 18px rgba(37,99,235,0.16)'
          : 'inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px rgba(2,6,23,0.22)',
      }}
    >
      <span className="sr-only">{label}</span>

      <motion.div
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
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/90"
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
      </motion.div>

      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: isLight ? 1 : 0 }}
        transition={{ duration: 0.22 }}
        aria-hidden="true"
      >
        <motion.div
          className="absolute rounded-full bg-white/75"
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
        <motion.div
          className="absolute rounded-full bg-white/55"
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
      </motion.div>

      <motion.div
        className="relative z-10 flex items-center justify-center rounded-full shadow-md"
        style={{
          width: dims.knob,
          height: dims.knob,
          background: isLight
            ? 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)',
          boxShadow: isLight
            ? 'inset 0 -1px 2px rgba(120,53,15,0.25), 0 2px 8px rgba(120,53,15,0.18)'
            : 'inset 0 -1px 2px rgba(15,23,42,0.22), 0 2px 8px rgba(2,6,23,0.18)',
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
          className="material-symbols-rounded leading-none"
          style={{
            fontSize: dims.iconSize,
            color: isLight ? '#78350f' : '#0f172a',
            fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24",
          }}
          initial={{ opacity: 0, scale: 0.68, rotate: isLight ? -35 : 35 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {isLight ? 'light_mode' : 'dark_mode'}
        </motion.span>
      </motion.div>
    </button>
  );
}
