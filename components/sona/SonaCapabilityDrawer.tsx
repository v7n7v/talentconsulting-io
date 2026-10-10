'use client';

import { TacoName } from '@/components/BrandLogo';
import type { SonaCapability } from '@/lib/assistant/capabilities';
import type { SonaExecutionContext } from '@/lib/assistant/execution-context';
import { summarizeSonaContext } from '@/lib/assistant/execution-context';
import SonaMark from './SonaMark';

interface SonaCapabilityDrawerProps {
  capabilities: SonaCapability[];
  context?: Partial<SonaExecutionContext>;
  onRun: (capability: SonaCapability) => void;
  compact?: boolean;
}

function ApprovalBadge({ approval }: { approval: SonaCapability['approval'] }) {
  const label = approval === 'external' ? 'Approval' : approval === 'review' ? 'Review' : 'Instant';
  const tone = approval === 'external'
    ? 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]'
    : approval === 'review'
      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
      : 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]';
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${tone}`}>
      {label}
    </span>
  );
}

export default function SonaCapabilityDrawer({ capabilities, context, onRun, compact = false }: SonaCapabilityDrawerProps) {
  const visibleCapabilities = capabilities.slice(0, compact ? 3 : 4);
  const contextLines = compact ? [] : summarizeSonaContext(context).slice(0, 3);

  if (!visibleCapabilities.length) return null;

  return (
    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SonaMark size="xs" state="idle" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]"><TacoName showSymbol={false} /> can operate here</p>
            <p className="wrap-natural text-xs font-semibold text-[var(--text-primary)]">
              {visibleCapabilities[0]?.toolName || 'Current tool'} moves
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
          {visibleCapabilities.length}
        </span>
      </div>

      {contextLines.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contextLines.map((line, index) => (
            <span key={`${line || 'context-line'}-${index}`} className="wrap-anywhere rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
              {line}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {visibleCapabilities.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onRun(item)}
            className="group flex min-h-[44px] w-full min-w-0 items-start gap-2 rounded-[13px] border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="material-symbols-rounded mt-0.5 shrink-0 text-[17px] text-[var(--accent)]">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="wrap-natural text-xs font-bold text-[var(--text-primary)]">{item.shortTitle}</span>
                <ApprovalBadge approval={item.approval} />
              </span>
              {!compact && (
                <span className="premium-copy-wrap mt-0.5 block text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {item.description}
                </span>
              )}
            </span>
            <span className="material-symbols-rounded mt-1 shrink-0 text-[15px] text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
          </button>
        ))}
      </div>
    </section>
  );
}
