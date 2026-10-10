'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useStore } from '@/lib/store';
import { useOwnedResource } from '@/hooks/useOwnedResource';
import type { computeApplicationMetrics } from '@/lib/application-records';
import { SuiteToolShell, SuiteToolHeader, SuitePanel, SuiteMetricCard, SuiteEmptyState } from '@/components/suite/SuiteToolChrome';
import SuiteSignedOut from '@/components/suite/SuiteSignedOut';

type Results = ReturnType<typeof computeApplicationMetrics> & { complete?: boolean };

function validResults(value: unknown): boolean {
  const data = value as Results | null;
  return !!data && typeof data.totalApplications === 'number' && Number.isFinite(data.totalApplications)
    && typeof data.weeklyVelocity === 'number' && !!data.pipeline
    && ['applied','interviewing','offer','rejected'].every(key => typeof data.pipeline[key as keyof Results['pipeline']] === 'number')
    && Array.isArray(data.recentActivity) && data.recentActivity.every(item => typeof item.company === 'string' && typeof item.role === 'string' && typeof item.status === 'string');
}
export default function ApplicationResults({ embedded = false }: { embedded?: boolean } = {}) {
  const owner = useStore(state => state.user?.uid);
  const { data, loading, error, reload } = useOwnedResource<Results>('/api/agent/quality', validResults);
  useToolGuidance(buildToolStory({
    toolId: embedded ? 'intelligence' : 'quality', title: 'Application results', contextKey: 'application-results',
    purpose: 'Inspect recorded submitted applications, cohort limits and actual milestones.',
    pending: loading, hasResult: Boolean(data && data.totalApplications > 0), failed: Boolean(error), stale: Boolean(error && data),
    work: [storyStep('refresh', 'Read current outcomes', 'Refresh reads your recorded applications. Prepared drafts remain excluded from this cohort.', 'quality-refresh'), storyStep('track', 'Record events in Applications', 'An empty cohort has no submitted records to analyze. Use Applications to record real submission dates and outcomes.', 'quality-empty', 'When outcomes are present, use the Applications destination to record new events.')],
    result: [storyStep('cohort', 'Inspect the recorded cohort', 'Check submission dates, bounded samples and actual employer milestones. Missing measurements stay unknown.', 'quality-report'), storyStep('basis', 'Understand document context', 'A linked resume does not establish which file was sent or whether it was tailored. Coverage is not a hiring probability.', 'quality-report'), storyStep('next', 'Choose where to act', 'Use Applications to inspect or update a real record yourself. Reading a report does not change an outcome.', 'quality-report')],
    recovery: [storyStep('retry', 'Review the load error', 'Retained results may be stale. Use the existing Try again control when ready; no refreshed outcome is implied.', 'quality-error')],
  }));

  const percentage = (value: number | null) => value === null ? 'Not measured' : `${value}%`;
  return <SuiteToolShell variant="standard" noBackground={embedded} className={embedded ? '!min-h-0 !p-0' : undefined}>
    {embedded ? <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Application results</h2><p className="text-sm text-[var(--text-secondary)]">Outcomes from the applications you recorded.</p></div><button data-guide="quality-refresh" onClick={() => void reload()} disabled={loading} className="btn-secondary min-h-11 px-3">Refresh</button></div> : <SuiteToolHeader tool="quality" title="Application results" subtitle="Outcomes from the applications you recorded." icon="monitoring" pageHelpId="quality"
      actions={<button data-guide="quality-refresh" type="button" onClick={() => void reload()} disabled={loading} className="min-h-11 border border-[var(--border)] px-4 py-2">{loading ? 'Loading…' : 'Refresh'}</button>} />}
    {!owner ? <SuiteSignedOut title="Your application results" description="Sign in to see the outcomes you have recorded." /> : <>
      {error && <div data-guide="quality-error" role="alert" className="border border-[var(--danger)] p-4"><p>{error}</p>{data && <p>Showing the last loaded results. They may be out of date.</p>}<button onClick={() => void reload()} className="mt-2 min-h-11 underline">Try again</button></div>}
      {loading && !data && <p role="status" className="p-6">Loading your recorded outcomes…</p>}
      {!loading && !error && data && data.totalApplications === 0 && <SuiteEmptyState icon="work" title="No submitted applications recorded" description="Track a role in Applications, then mark it as sent when you submit it. Prepared drafts are kept separate." action={<a data-guide="quality-empty" href="/suite/applications" className="btn-primary inline-flex min-h-11 items-center">Open Applications</a>} />}
      {data && data.totalApplications > 0 && <div data-guide="quality-report" className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">{data.cohort || 'Recorded submitted applications; drafts excluded.'} {data.complete === false && 'This is a bounded sample; larger histories are not fully represented.'}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SuiteMetricCard label="Submitted" value={String(data.totalApplications)} icon="send" description="Marked as sent by you" />
          <SuiteMetricCard label="Reached interview" value={percentage(data.interviewYield)} icon="record_voice_over" description={`${data.pipeline.interviewing} of ${data.totalApplications}; includes past interviews`} />
          <SuiteMetricCard label="Sent this week" value={String(data.weeklyVelocity)} icon="calendar_month" description="Recorded submission date within seven days" />
        </div>
        {!!data.unknownSubmissionDates && <p className="text-sm text-[var(--text-muted)]">{data.unknownSubmissionDates} submitted records have no sent date and are excluded from timing metrics.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <SuitePanel><h2 className="mb-3 text-lg font-semibold">Recorded milestones</h2><dl className="space-y-3">
            <div className="flex justify-between"><dt>Reached an interview</dt><dd>{data.pipeline.interviewing}</dd></div>
            <div className="flex justify-between"><dt>Received an offer</dt><dd>{data.pipeline.offer}</dd></div>
            <div className="flex justify-between"><dt>Currently marked rejected</dt><dd>{data.pipeline.rejected}</dd></div>
          </dl><p className="mt-4 text-xs text-[var(--text-muted)]">Milestones can overlap. A later rejection does not erase an earlier interview.</p></SuitePanel>
          <SuitePanel><h2 className="mb-3 text-lg font-semibold">Document context</h2><p>{data.tailoredCount} of {data.totalApplications} submitted records have a saved resume linked.</p><p className="mt-2 text-sm text-[var(--text-secondary)]">A linked resume does not establish which file was sent or whether it was tailored.</p><p className="mt-4">Recorded role-coverage score: {data.avgFitScore == null ? 'Not measured' : `${data.avgFitScore}/100`}</p><p className="text-xs text-[var(--text-muted)]">{data.scoredCount || 0} scored records. Text coverage is not a hiring probability.</p></SuitePanel>
        </div>
        <SuitePanel><h2 className="mb-3 text-lg font-semibold">Recent activity</h2><ul className="divide-y divide-[var(--border)]">{data.recentActivity.map((item, index) => <li key={`${item.company}-${item.role}-${index}`} className="py-3"><p className="font-medium">{item.role} · {item.company}</p><p className="text-sm text-[var(--text-secondary)]">{item.status.replaceAll('_', ' ')}{item.date && ` · ${new Date(item.date).toLocaleDateString()}`}</p></li>)}</ul></SuitePanel>
      </div>}
    </>}
  </SuiteToolShell>;
}
