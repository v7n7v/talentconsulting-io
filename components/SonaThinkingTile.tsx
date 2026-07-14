'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { SonaMark } from '@/components/sona';

type SonaThinkingVariant = 'default' | 'resume' | 'writing' | 'jobs' | 'oracle' | 'agent' | 'success';

const variantAccent: Record<SonaThinkingVariant, string> = {
  default: '#0ea5e9',
  resume: '#10b981',
  writing: '#22d3ee',
  jobs: '#2563eb',
  oracle: '#0ea5e9',
  agent: '#8b5cf6',
  success: '#059669',
};

interface SonaThinkingTileProps {
  title?: string;
  description?: string;
  label?: string;
  icon?: string;
  variant?: SonaThinkingVariant;
  accentColor?: string;
  stages?: string[];
  activeStage?: string;
  compact?: boolean;
  className?: string;
}

export default function SonaThinkingTile({
  title = 'Sona is thinking',
  description = 'Working through the next step.',
  label = 'Sona is working',
  variant = 'default',
  accentColor,
  stages = [],
  activeStage,
  compact = false,
  className = '',
}: SonaThinkingTileProps) {
  const prefersReducedMotion = useReducedMotion();
  const accent = accentColor || variantAccent[variant];
  const softAccent = `${accent}18`;
  const borderAccent = `${accent}36`;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${compact ? 'p-3' : 'p-4'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="sona-shimmer-sweep"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}08, ${accent}16, ${accent}08, transparent)`,
        }}
      />
      <div className="relative z-10 flex min-w-0 items-start gap-3">
        <div
          className={`relative grid shrink-0 place-items-center ${compact ? 'h-12 w-12' : 'h-14 w-14'}`}
          style={{ borderColor: borderAccent, background: softAccent }}
        >
          <SonaMark
            size={compact ? 'sm' : 'md'}
            state={variant === 'success' ? 'success' : 'thinking'}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ borderColor: borderAccent, background: softAccent, color: accent }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: accent }}
                animate={prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4], scale: [1, 1.45, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              {activeStage || label}
            </span>
            <p className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-[var(--text-primary)]`}>{title}</p>
          </div>
          {!compact && <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>}
          {compact && <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>}

          {stages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stages.map((stage, index) => (
                <motion.span
                  key={stage}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  style={{ borderColor: borderAccent, background: softAccent, color: accent }}
                  animate={prefersReducedMotion ? undefined : {
                    opacity: [0.55, 1, 0.68],
                    y: [0, -1, 0],
                    boxShadow: [`0 0 0 ${accent}00`, `0 0 18px ${accent}36`, `0 0 0 ${accent}00`],
                  }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.18, ease: 'easeInOut' }}
                >
                  {stage}
                </motion.span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="sona-accent-line">
        <motion.div
          className="h-full w-1/2"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          animate={prefersReducedMotion ? undefined : { x: ['-100%', '210%'] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}
