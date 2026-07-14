'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import PageHelp from '@/components/PageHelp';
import {
  getSuiteToolDefinition,
  type SuiteToolDefinition,
  type SuiteToolLayoutVariant,
} from '@/lib/suite-tool-registry';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const shellWidth: Record<SuiteToolLayoutVariant, string> = {
  standard: 'max-w-[1120px]',
  workbench: 'max-w-[1280px]',
  editor: 'max-w-[1280px]',
  agent: 'max-w-[1280px]',
};

const iconSize = {
  sm: { shell: 'h-10 w-10 rounded-[14px]', icon: 'text-[21px]' },
  md: { shell: 'h-12 w-12 rounded-[16px]', icon: 'text-[24px]' },
  lg: { shell: 'h-14 w-14 rounded-[18px]', icon: 'text-[28px]' },
} as const;

export interface SuiteToolShellProps {
  children: ReactNode;
  variant?: SuiteToolLayoutVariant;
  className?: string;
  contentClassName?: string;
  noBackground?: boolean;
}

export function SuiteToolShell({
  children,
  variant = 'standard',
  className,
  contentClassName,
  noBackground = false,
}: SuiteToolShellProps) {
  return (
    <div
      className={cx(
        'mobile-app-content min-h-dvh px-4 py-3 text-[var(--text-primary)] md:px-6 md:py-6',
        !noBackground && 'bg-[var(--bg-deep)]',
        className,
      )}
    >
      <div className={cx('mx-auto flex w-full flex-col gap-4 md:gap-5', shellWidth[variant], contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export interface SuiteToolIconProps {
  icon: string;
  size?: keyof typeof iconSize;
  className?: string;
  iconClassName?: string;
}

export function SuiteToolIcon({
  icon,
  size = 'md',
  className,
  iconClassName,
}: SuiteToolIconProps) {
  return (
    <span
      className={cx(
        'icon-shell-neutral inline-grid shrink-0 place-items-center border',
        iconSize[size].shell,
        className,
      )}
      aria-hidden="true"
    >
      <span className={cx('material-symbols-rounded icon-neutral leading-none', iconSize[size].icon, iconClassName)}>
        {icon}
      </span>
    </span>
  );
}

export interface SuiteToolHeaderProps {
  tool: string | SuiteToolDefinition;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: string;
  pageHelpId?: string | null;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  actionsClassName?: string;
}

export function SuiteToolHeader({
  tool,
  title,
  subtitle,
  eyebrow,
  icon,
  pageHelpId,
  meta,
  actions,
  children,
  className,
  iconClassName,
  titleClassName,
  actionsClassName,
}: SuiteToolHeaderProps) {
  const prefersReducedMotion = useReducedMotion();
  const definition = typeof tool === 'string' ? getSuiteToolDefinition(tool) : tool;
  const resolvedTitle = title || definition?.title || 'Talent Studio';
  const resolvedSubtitle = subtitle || definition?.subtitle;
  const resolvedEyebrow = eyebrow || definition?.eyebrow;
  const resolvedIcon = icon || definition?.icon || 'widgets';
  const resolvedHelp = pageHelpId === null ? undefined : pageHelpId || definition?.pageHelpId;
  const hasActions = Boolean(actions);

  return (
    <motion.header
      initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cx(
        'suite-tool-header relative rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 shadow-sm md:rounded-[24px] md:p-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <SuiteToolIcon
            icon={resolvedIcon}
            size="md"
            className={cx('max-md:h-10 max-md:w-10 max-md:rounded-[14px]', iconClassName)}
            iconClassName="max-md:text-[21px]"
          />
          <div className={cx('min-w-0 flex-1', resolvedHelp && 'pr-12 lg:pr-0')}>
            {resolvedEyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:text-[11px] md:tracking-[0.14em]">
                {resolvedEyebrow}
              </p>
            )}
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={cx('premium-heading-wrap min-w-0 max-w-full text-[1.35rem] font-bold leading-tight text-[var(--text-primary)] md:text-2xl', titleClassName)}>
                {resolvedTitle}
              </h1>
              {meta}
            </div>
            {resolvedSubtitle && (
              <p className="premium-copy-wrap mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                {resolvedSubtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div
            className={cx('flex min-w-0 flex-wrap items-center gap-2 max-lg:pl-[52px] lg:flex-1 lg:justify-end', actionsClassName)}
          >
            {actions}
            {resolvedHelp && (
              <span className="hidden lg:inline-flex">
                <PageHelp toolId={resolvedHelp} />
              </span>
            )}
          </div>
        )}
        {resolvedHelp && !actions && (
          <div className="hidden shrink-0 items-center gap-2 lg:flex lg:justify-end">
            <PageHelp toolId={resolvedHelp} />
          </div>
        )}
      </div>
      {resolvedHelp && (
        <div className="absolute right-4 top-4 flex shrink-0 items-center gap-2 md:right-6 md:top-6 lg:hidden">
          <PageHelp toolId={resolvedHelp} />
        </div>
      )}
      {children && <div className="mt-3 min-w-0 md:mt-4">{children}</div>}
    </motion.header>
  );
}

export interface SuitePanelProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'figure';
}

export function SuitePanel({ children, className, as: Component = 'section' }: SuitePanelProps) {
  return (
    <Component
      className={cx(
        'mobile-tool-shell min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm md:p-5',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function SuiteCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
      {children}
    </section>
  );
}

export function SuiteMetricCard({
  label,
  value,
  icon,
  description,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon: string;
  description?: string;
  onClick?: () => void;
}) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'group min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left transition-colors',
        onClick && 'hover:border-[var(--border)] hover:bg-[var(--bg-hover)]',
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <SuiteToolIcon icon={icon} size="sm" />
        <span className="min-w-0 whitespace-nowrap text-2xl font-bold tabular-nums text-[var(--text-primary)]">
          {value}
        </span>
      </div>
      <p className="premium-heading-wrap mt-3 text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      {description && <p className="premium-copy-wrap mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
    </Component>
  );
}

export function SuiteEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <SuitePanel className={cx('p-8 text-center', className)}>
      <SuiteToolIcon icon={icon} size="lg" className="mx-auto" />
      <h2 className="premium-heading-wrap mx-auto mt-4 max-w-xl text-xl font-bold text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="premium-copy-wrap mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        {description}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </SuitePanel>
  );
}
