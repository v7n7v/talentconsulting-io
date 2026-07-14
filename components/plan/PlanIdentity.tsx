'use client';

import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import {
  getPlanIdentity,
  planAccentForTheme,
  type PlanFeature,
  type PlanIdentityTier,
} from '@/lib/plan-identity';

interface PlanAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function styleForTier(tier: PlanIdentityTier, theme: 'light' | 'dark'): CSSProperties {
  const plan = getPlanIdentity(tier);
  const readableAccent = planAccentForTheme(plan, theme);
  return {
    '--plan-accent': plan.accent,
    '--plan-accent-alt': plan.accentAlt,
    '--plan-accent-readable': readableAccent,
    '--plan-border': plan.border,
    '--plan-surface': plan.surface,
    '--plan-button-text': plan.buttonText,
  } as CSSProperties;
}

export function PlanBadge({
  tier,
  size = 'sm',
  active = false,
  className = '',
}: {
  tier: PlanIdentityTier;
  size?: 'xs' | 'sm' | 'md';
  active?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const plan = getPlanIdentity(tier);
  const sizeClass = size === 'xs'
    ? 'px-1.5 py-0.5 text-[8px]'
    : size === 'md'
      ? 'px-3 py-1 text-[11px]'
      : 'px-2.5 py-0.5 text-[9px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${sizeClass} ${active && plan.shimmer ? 'plan-badge-shimmer' : ''} ${className}`}
      style={{
        ...styleForTier(tier, theme),
        background: `color-mix(in srgb, var(--plan-accent) ${active ? 18 : 11}%, var(--bg-elevated))`,
        borderColor: `color-mix(in srgb, var(--plan-accent) ${active ? 34 : 22}%, var(--border-subtle))`,
        color: 'var(--plan-accent-readable)',
      }}
    >
      {active && plan.id !== 'free' && (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--plan-accent)]" aria-hidden="true" />
      )}
      {plan.label}
    </span>
  );
}

export function PlanFeatureList({
  tier,
  features,
  limit,
  compact = false,
}: {
  tier: PlanIdentityTier;
  features?: PlanFeature[];
  limit?: number;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const plan = getPlanIdentity(tier);
  const items = (features || plan.features).slice(0, limit || plan.features.length);

  return (
    <ul className={`${compact ? 'space-y-1.5' : 'space-y-2.5'}`}>
      {items.map((feature) => (
        <li key={feature.label} className="flex min-w-0 items-start gap-2.5">
          <span
            className={`${compact ? 'mt-0.5 h-6 w-6 rounded-[9px]' : 'h-8 w-8 rounded-[11px]'} flex shrink-0 items-center justify-center border bg-[var(--bg-elevated)] text-[var(--text-muted)]`}
            style={{
              ...styleForTier(tier, theme),
              borderColor: `color-mix(in srgb, var(--plan-accent) 20%, var(--border-subtle))`,
            }}
          >
            <span className={`material-symbols-rounded ${compact ? 'text-[14px]' : 'text-[17px]'}`}>{feature.icon}</span>
          </span>
          <span className="min-w-0">
            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block font-semibold leading-snug text-[var(--text-primary)]`}>
              {feature.label}
            </span>
            {!compact && (
              <span className="mt-0.5 block text-xs leading-snug text-[var(--text-secondary)]">
                {feature.description}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PlanStatusStrip({
  tier,
  title,
  caption,
  action,
  compact = false,
  className = '',
}: {
  tier: PlanIdentityTier;
  title?: string;
  caption?: string;
  action?: PlanAction;
  compact?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const plan = getPlanIdentity(tier);

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-[14px] border bg-[var(--card-bg)] ${compact ? 'p-2' : 'p-3'} ${className}`}
      style={{
        ...styleForTier(tier, theme),
        borderColor: 'var(--plan-border)',
        background: `linear-gradient(135deg, color-mix(in srgb, var(--plan-accent) 7%, var(--card-bg)), var(--card-bg))`,
      }}
    >
      <span
        className={`${compact ? 'h-8 w-8 rounded-[11px]' : 'h-10 w-10 rounded-[13px]'} flex shrink-0 items-center justify-center border bg-[var(--bg-elevated)]`}
        style={{
          borderColor: `color-mix(in srgb, var(--plan-accent) 24%, var(--border-subtle))`,
          color: 'var(--plan-accent-readable)',
        }}
      >
        <span className={`material-symbols-rounded ${compact ? 'text-[17px]' : 'text-[20px]'} ${plan.id !== 'free' ? 'plan-status-icon-rotate' : ''}`}>{plan.icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`${compact ? 'text-[12px]' : 'text-sm'} truncate font-semibold text-[var(--text-primary)]`}>
            {title || plan.displayName}
          </span>
          <PlanBadge tier={tier} active={plan.id !== 'free'} size="xs" className="shrink-0" />
        </span>
        {caption && (
          <span className="mt-0.5 block truncate text-[10px] leading-tight text-[var(--text-muted)]">
            {caption}
          </span>
        )}
      </span>
      {action && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
          disabled={action.disabled || action.loading}
          className="plan-focus shrink-0 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-60"
        >
          {action.loading ? 'Opening...' : action.label}
        </button>
      )}
    </div>
  );
}

export function PlanIdentityCard({
  tier,
  current = false,
  priceLabel,
  billingLine,
  statusLabel,
  primaryAction,
  secondaryAction,
  compact = false,
  children,
  className = '',
}: {
  tier: PlanIdentityTier;
  current?: boolean;
  priceLabel?: string;
  billingLine?: string;
  statusLabel?: string;
  primaryAction?: PlanAction;
  secondaryAction?: PlanAction;
  compact?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const { theme } = useTheme();
  const plan = getPlanIdentity(tier);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-[22px] border ${compact ? 'p-4' : 'p-5 lg:p-6'} ${className}`}
      style={{
        ...styleForTier(tier, theme),
        background: 'var(--plan-surface)',
        borderColor: 'var(--plan-border)',
        boxShadow: current
          ? '0 18px 48px color-mix(in srgb, var(--plan-accent) 10%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--plan-accent) 8%, transparent)'
          : 'inset 0 0 0 1px color-mix(in srgb, var(--plan-accent) 4%, transparent)',
      }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl opacity-20 plan-card-aura" />

      <div className="relative z-10 flex min-w-0 flex-col gap-5">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`${compact ? 'h-10 w-10 rounded-[14px]' : 'h-12 w-12 rounded-[16px]'} flex shrink-0 items-center justify-center border bg-[var(--bg-elevated)]`}
              style={{
                borderColor: `color-mix(in srgb, var(--plan-accent) 28%, var(--border-subtle))`,
                color: 'var(--plan-accent-readable)',
              }}
            >
              <span className={`${compact ? 'text-[20px]' : 'text-[24px]'} material-symbols-rounded`}>{plan.icon}</span>
            </span>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <PlanBadge tier={tier} active={current || plan.id !== 'free'} />
                {statusLabel && (
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                    {statusLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {plan.eyebrow}
              </p>
              <h3 className={`${compact ? 'text-lg' : 'text-xl lg:text-2xl'} mt-1 font-bold leading-tight text-[var(--text-primary)]`}>
                {plan.displayName}
              </h3>
              <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[var(--text-secondary)]">
                {current ? plan.activeDescription : plan.description}
              </p>
            </div>
          </div>

          {priceLabel && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Price</p>
              <p className="mt-1 whitespace-nowrap text-lg font-black tabular-nums text-[var(--text-primary)]">{priceLabel}</p>
            </div>
          )}
        </div>

        {billingLine && (
          <p className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {billingLine}
          </p>
        )}

        <PlanFeatureList tier={tier} compact={compact} />

        {children}

        {(primaryAction || secondaryAction) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {primaryAction && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  primaryAction.onClick();
                }}
                disabled={primaryAction.disabled || primaryAction.loading}
                className="plan-focus flex min-h-10 flex-1 items-center justify-center rounded-[13px] px-4 py-2 text-sm font-semibold transition hover:brightness-105 disabled:opacity-60"
                style={{ background: 'var(--plan-accent)', color: 'var(--plan-button-text)' }}
              >
                {primaryAction.loading ? 'Opening...' : primaryAction.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  secondaryAction.onClick();
                }}
                disabled={secondaryAction.disabled || secondaryAction.loading}
                className="plan-focus flex min-h-10 flex-1 items-center justify-center rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                {secondaryAction.loading ? 'Opening...' : secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
