'use client';

import Link from 'next/link';
import type { ApplicationKitContext } from '@/lib/application-kit';

type ToolId = 'ats' | 'cover-letter' | 'linkedin';

const TOOL_ACTIONS: Record<ToolId, { label: string; href: string; icon: string }[]> = {
  ats: [
    { label: 'Draft Cover Letter', href: '/suite/cover-letter', icon: 'edit_document' },
    { label: 'Optimize LinkedIn', href: '/suite/linkedin', icon: 'badge' },
  ],
  'cover-letter': [
    { label: 'Run ATS', href: '/suite/ats-analyzer', icon: 'analytics' },
    { label: 'Optimize LinkedIn', href: '/suite/linkedin', icon: 'badge' },
  ],
  linkedin: [
    { label: 'Run ATS', href: '/suite/ats-analyzer', icon: 'analytics' },
    { label: 'Draft Cover Letter', href: '/suite/cover-letter', icon: 'edit_document' },
  ],
};

interface ApplicationKitContextBarProps {
  context: ApplicationKitContext;
  activeTool: ToolId;
  onChange: (patch: Partial<ApplicationKitContext>) => void;
}

export default function ApplicationKitContextBar({ context, activeTool, onChange }: ApplicationKitContextBarProps) {
  const hasResume = Boolean(context.resumeSnapshot || context.resumeText);
  const hasTarget = Boolean(context.jobDescription?.trim() || context.jobTitle?.trim() || context.targetRole?.trim());
  const missingKeywords = context.atsResult?.data?.keywords?.filter((keyword: any) => keyword.status === 'missing').length || 0;
  const activeStatus = activeTool === 'ats'
    ? context.atsResult?.status
    : activeTool === 'cover-letter'
      ? context.coverLetterResult?.status
      : context.linkedinResult?.status;

  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Application kit</p>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mt-1">One resume and target powers every application asset.</h2>
          <p className="text-[12px] text-[var(--text-secondary)] mt-1 max-w-2xl">
            Select a saved resume, keep the JD here, then move between ATS, cover letter, and LinkedIn without re-entering context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TOOL_ACTIONS[activeTool].map(action => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all"
            >
              <span className="material-symbols-rounded text-[15px]">{action.icon}</span>
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Resume', value: hasResume ? (context.resumeVersionName || 'Loaded') : 'Select one', icon: hasResume ? 'check_circle' : 'description', tone: hasResume ? 'emerald' : 'muted' },
          { label: 'Target', value: context.jobTitle || context.targetRole || 'Role pending', icon: hasTarget ? 'my_location' : 'flag', tone: hasTarget ? 'cyan' : 'muted' },
          { label: 'Company', value: context.company || 'Not set', icon: 'domain', tone: context.company ? 'amber' : 'muted' },
          { label: 'ATS gaps', value: context.atsResult?.data ? `${missingKeywords} missing` : 'Not run', icon: 'analytics', tone: context.atsResult?.data ? 'rose' : 'muted' },
        ].map(item => (
          <div key={item.label} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-rounded text-[15px] ${
                item.tone === 'emerald' ? 'text-emerald-500' : item.tone === 'cyan' ? 'text-cyan-500' : item.tone === 'amber' ? 'text-amber-500' : item.tone === 'rose' ? 'text-rose-500' : 'text-[var(--text-muted)]'
              }`}>
                {item.icon}
              </span>
              <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
            </div>
            <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
          </div>
        ))}
      </div>

      <details className="group mt-3 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Edit shared target context</span>
          <span className="material-symbols-rounded text-[17px] text-[var(--text-muted)] group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div className="px-3 pb-3 grid md:grid-cols-2 gap-3">
          <input
            value={context.company || ''}
            onChange={e => onChange({ company: e.target.value })}
            placeholder="Company"
            className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/25"
          />
          <input
            value={context.jobTitle || context.targetRole || ''}
            onChange={e => onChange({ jobTitle: e.target.value, targetRole: e.target.value })}
            placeholder="Target role"
            className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/25"
          />
          <textarea
            value={context.jobDescription || ''}
            onChange={e => onChange({ jobDescription: e.target.value })}
            placeholder="Paste the job description once. ATS, Cover Letter, and LinkedIn will all use it."
            rows={4}
            className="md:col-span-2 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-cyan-500/25 resize-none"
          />
        </div>
      </details>

      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px]" aria-live="polite">
        <span className="text-[var(--text-muted)]">
          {hasResume && hasTarget
            ? 'Context ready across ATS, Cover Letter, LinkedIn, Resume Studio, and Job Search.'
            : hasResume
              ? 'Resume is ready. Add a target role or JD once to unlock the connected flow.'
              : 'Choose a resume once and the rest of the application kit will follow it.'}
        </span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${
          activeStatus === 'loading'
            ? 'text-cyan-500'
            : activeStatus === 'success'
              ? 'text-emerald-500'
              : activeStatus === 'error'
                ? 'text-rose-500'
                : 'text-[var(--text-muted)]'
        }`}>
          <span className="material-symbols-rounded text-[14px]">
            {activeStatus === 'loading' ? 'sync' : activeStatus === 'success' ? 'check_circle' : activeStatus === 'error' ? 'error' : 'history'}
          </span>
          {activeStatus === 'loading'
            ? 'Working...'
            : activeStatus === 'success'
              ? 'Latest result saved for this session'
              : activeStatus === 'error'
                ? 'Latest action needs attention'
                : 'Draft saved in this browser'}
        </span>
      </div>
    </section>
  );
}
