'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useOwnedResource } from '@/hooks/useOwnedResource';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolShell, SuiteToolHeader, SuitePanel, SuiteMetricCard, SuiteEmptyState } from '@/components/suite/SuiteToolChrome';
import SuiteSignedOut from '@/components/suite/SuiteSignedOut';

type Pulse = {
  totalApps: number; appliedApps: number; thisWeekApps: number; responded: number; interviews: number; offers: number;
  weeklyRate: number | null; complete?: boolean; unknownSubmissionDates?: number;
  staleApps: { company: string; role: string; daysAgo: number }[];
  followUps: { id?: string; company: string; role: string; daysSinceApply: number }[];
  upcomingInterviews: { id?: string; company: string; role: string; date: string | null }[];
  moraleHistory: { week: string; score: number }[];
  smartApplyRate?: number | null; morphedCount?: number;
};

function validPulse(value: unknown): boolean {
  const pulse = (value as { pulse?: Pulse } | null)?.pulse;
  return !!pulse && ['totalApps','appliedApps','thisWeekApps','responded','interviews','offers'].every(key => typeof pulse[key as keyof Pulse] === 'number')
    && Array.isArray(pulse.moraleHistory) && pulse.moraleHistory.every(item => typeof item.week === 'string' && typeof item.score === 'number')
    && Array.isArray(pulse.staleApps) && Array.isArray(pulse.followUps) && Array.isArray(pulse.upcomingInterviews)
    && [...pulse.followUps, ...pulse.upcomingInterviews].every(item => typeof item.company === 'string' && typeof item.role === 'string');
}
export function PulseContent({ embedded = false, onCheckIn }: { embedded?: boolean; onCheckIn?: () => void } = {}) {
  const owner = useStore(state => state.user?.uid);
  const { data: response, loading, error, reload } = useOwnedResource<{ pulse: Pulse }>('/api/agent/pulse', validPulse);
  const data = response?.pulse;
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ owner: string; text: string } | null>(null);
  const saveMorale = async (score: number) => {
    if (!owner || saving === owner) return;
    const actor = owner;
    setSaving(actor); setSaveError(null);
    try {
      const result = await authFetch('/api/agent/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ morale: score }) });
      if (!result.ok) throw new Error('Your check-in could not be saved. Try again.');
      if (useStore.getState().user?.uid === actor) { await reload(); onCheckIn?.(); }
    } catch (cause) {
      if (useStore.getState().user?.uid === actor) setSaveError({ owner: actor, text: cause instanceof Error ? cause.message : 'Could not save this check-in.' });
    } finally { setSaving(previous => previous === actor ? null : previous); }
  };
  useToolGuidance(buildToolStory({
    toolId: embedded ? 'intelligence' : 'pulse', title: 'Weekly review', contextKey: 'weekly-review',
    purpose: 'Read recorded activity, inspect dated follow-ups and optionally record your own weekly reflection.',
    pending: loading || saving === owner, hasResult: Boolean(data), failed: Boolean(error || saveError?.owner === owner), stale: Boolean(error && data),
    work: [storyStep('refresh', 'Read the current week', 'Refresh reads your account records. Unknown submission dates and bounded samples remain labelled.', 'pulse-refresh'), storyStep('records', 'Review real activity', 'The review describes what was recorded. It does not establish an application was sent unless you recorded submission.', 'pulse-report', 'A recorded weekly report appears after the account read succeeds.')],
    result: [storyStep('review', 'Inspect follow-up context', 'Follow-up windows are reminders, not predictions. Open a specific application or interview prep only when useful.', 'pulse-report'), storyStep('reflection', 'Choose a personal check-in', 'A check-in records your own feeling after a successful save. Help does not pick a feeling or manufacture progress.', 'pulse-checkin'), storyStep('saved', 'Read the recorded state', 'The last recorded week comes from saved account data. A pending or failed save has no new confirmed check-in.', 'pulse-checkin')],
    recovery: [storyStep('retry', 'Review the failed read or save', 'Keep any retained report and choose the existing retry or check-in control yourself. Earlier information may be stale.', 'pulse-report', 'When no report loaded, use the displayed load error and Try again.')],
  }));

  const latest = data?.moraleHistory.at(-1);
  return <SuiteToolShell variant="standard" noBackground={embedded} className={embedded ? '!min-h-0 !p-0' : undefined}>
    {embedded ? <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Weekly review</h2><p className="text-sm text-[var(--text-secondary)]">Your recorded activity and next steps.</p></div><button data-guide="pulse-refresh" onClick={() => void reload()} disabled={loading} className="btn-secondary min-h-11 px-3">Refresh</button></div> : <SuiteToolHeader tool="pulse" title="Weekly review" subtitle="Your recorded activity, follow-ups and next interviews." icon="calendar_month" pageHelpId="pulse"
      actions={<button data-guide="pulse-refresh" className="min-h-11 border border-[var(--border)] px-4" disabled={loading} onClick={() => void reload()}>{loading ? 'Loading…' : 'Refresh'}</button>} />}
    {!owner ? <SuiteSignedOut title="Your weekly review" description="Sign in to review your recorded applications and check-ins." /> : <>
      {error && <div role="alert" className="border border-[var(--danger)] p-4">{error}{data && <p>Last loaded information is shown below and may be out of date.</p>}<button onClick={() => void reload()} className="mt-2 block min-h-11 underline">Try again</button></div>}
      {loading && !data && <p role="status">Loading your weekly review…</p>}
      {!loading && !error && data && data.totalApps === 0 && <SuiteEmptyState icon="work" title="Start with an application" description="Track a role you are pursuing. Your own recorded activity will appear here." action={<a href="/suite/applications" className="btn-primary inline-flex min-h-11 items-center">Open Applications</a>} />}
      {data && <div data-guide="pulse-report" className="space-y-4">
        {data.complete === false && <p role="status">This summary covers a bounded sample of your application history.</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <SuiteMetricCard label="Sent in seven days" value={String(data.thisWeekApps)} icon="send" description="Uses your recorded submission dates" />
          <SuiteMetricCard label="Employer responses" value={`${data.responded} of ${data.appliedApps}`} icon="mark_email_read" description="Across applications marked as sent" />
          <SuiteMetricCard label="Recorded pace" value={data.weeklyRate == null ? 'Not measured' : `${data.weeklyRate} / week`} icon="calendar_month" description="Applications with a known sent date" />
        </div>
        {!!data.unknownSubmissionDates && <p className="text-sm text-[var(--text-secondary)]">{data.unknownSubmissionDates} sent applications have no submission date. Add those dates to include them in timing metrics.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <SuitePanel><h2 className="mb-3 text-lg font-semibold">Follow-ups to consider</h2>{data.followUps.length ? <ul className="space-y-3">{data.followUps.map((item, i) => <li key={i}><p className="font-medium">{item.role} · {item.company}</p><p className="text-sm">Sent {item.daysSinceApply} days ago</p>{item.id && <a className="inline-flex min-h-11 items-center underline" href={`/suite/applications?application=${encodeURIComponent(item.id)}`}>Review this application</a>}</li>)}</ul> : <p>No unanswered applications fall in the 10–21 day reminder window.</p>}<a href="/suite/applications?mobileView=followups" className="mt-4 inline-flex min-h-11 items-center underline">Review applications</a><p className="mt-2 text-xs text-[var(--text-muted)]">A reminder window, not a prediction of employer response time.</p></SuitePanel>
          <SuitePanel><h2 className="mb-3 text-lg font-semibold">Upcoming interviews</h2>{data.upcomingInterviews.length ? <ul className="space-y-3">{data.upcomingInterviews.map((item, i) => <li key={i}><p className="font-medium">{item.role} · {item.company}</p><p className="text-sm">{item.date ? new Date(item.date).toLocaleDateString() : 'Date not recorded'}</p>{item.id && <a className="inline-flex min-h-11 items-center underline" href={`/suite/interview-sim?application=${encodeURIComponent(item.id)}`}>Prepare for this role</a>}</li>)}</ul> : <p>No upcoming interviews recorded.</p>}<a href="/suite/interview-sim" className="mt-4 inline-flex min-h-11 items-center underline">Open interview prep</a></SuitePanel>
        </div>
        <SuitePanel><div data-guide="pulse-checkin"><h2 className="mb-2 text-lg font-semibold">Your check-in</h2><p className="text-sm text-[var(--text-secondary)]">How does your search feel this week? This is your own reflection.</p><div className="mt-4 flex flex-wrap gap-2">{['Difficult', 'Low', 'Okay', 'Good', 'Great'].map((label, i) => <button key={label} aria-pressed={latest?.score === i + 1} disabled={saving === owner} onClick={() => void saveMorale(i + 1)} className="min-h-11 border border-[var(--border)] px-4 aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--text-on-action)]">{label}</button>)}</div>{saveError?.owner === owner && <p role="alert" className="mt-2 text-[var(--danger)]">{saveError.text}</p>}{saving === owner && <p role="status">Saving check-in…</p>}{latest && <p className="mt-3 text-xs text-[var(--text-muted)]">Last recorded week: {latest.week}</p>}</div></SuitePanel>
      </div>}
    </>}
  </SuiteToolShell>;
}
