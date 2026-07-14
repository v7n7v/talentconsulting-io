'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';

type Tab = 'operations' | 'finance' | 'users' | 'email' | 'calibration' | 'support';
const TABS: Array<[Tab, string, string]> = [
  ['operations', 'Operations', 'monitor_heart'],
  ['finance', 'Finance', 'payments'],
  ['users', 'Users', 'group'],
  ['email', 'Email', 'mail'],
  ['calibration', 'Calibration', 'tune'],
  ['support', 'Support Cases', 'support_agent'],
];

export default function AdminCommandCenter() {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('operations');
  const [ops, setOps] = useState<any>(null);
  const [finance, setFinance] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [supportCases, setSupportCases] = useState<any[]>([]);
  const [recommendationCalibration, setRecommendationCalibration] = useState<any>(null);
  const [recommendationCalibrationStale, setRecommendationCalibrationStale] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [supportDrafts, setSupportDrafts] = useState<Record<string, any>>({});
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' });
  const [pricingDecision, setPricingDecision] = useState({
    selectedScenarioId: 'no_change', rationale: '', confirmationText: '',
    acknowledgedNoStripeMutation: false,
    acknowledgedNoPromotionMutation: false,
    acknowledgedNoEntitlementMutation: false,
  });
  const recommendationCalibrationRequestRef = useRef(0);
  const pricingMemoStatusRef = useRef<any>(null);
  const pricingMemoStatusRequestRef = useRef(0);
  const pricingMemoDisplayedFingerprintRef = useRef('');
  const [pricingMemoActionStatus, setPricingMemoActionStatus] = useState<any>(null);
  const [pricingMemoCanonicalReview, setPricingMemoCanonicalReview] = useState<any>(null);
  const [renewalEvidenceExporting, setRenewalEvidenceExporting] = useState(false);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await (user as any)?.getIdToken?.();
    if (!token) throw new Error('Not authenticated');
    return fetch(url, {
      ...options,
      cache: 'no-store',
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }, [user]);

  const loadJson = useCallback(async (url: string) => {
    const response = await authFetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [authFetch]);

  const refreshOperations = useCallback(async () => setOps(await loadJson('/api/admin/ops')), [loadJson]);
  const refreshFinance = useCallback(async () => setFinance(await loadJson('/api/admin/costs')), [loadJson]);
  const refreshUsers = useCallback(async () => {
    const data = await loadJson('/api/admin/users?limit=50');
    setUsers(data.users || []);
  }, [loadJson]);
  const refreshSupport = useCallback(async () => {
    const data = await loadJson('/api/admin/billing/support-cases?limit=75');
    setSupportCases(data.cases || []);
  }, [loadJson]);

  const isLatestRecommendationCalibrationRequest = (requestId: number) => (
    recommendationCalibrationRequestRef.current === requestId
  );
  const refreshCalibration = useCallback(async () => {
    const requestId = ++recommendationCalibrationRequestRef.current;
    setRecommendationCalibrationStale(Boolean(recommendationCalibration));
    const data = await loadJson('/api/admin/ops/recommendation-calibration?windowDays=180');
    if (!isLatestRecommendationCalibrationRequest(requestId)) return;
    setRecommendationCalibration(data);
    setRecommendationCalibrationStale(false);
  }, [loadJson, recommendationCalibration]);

  const isLatestPricingMemoStatusRequest = (requestId: number) => pricingMemoStatusRequestRef.current === requestId;
  const invalidatePricingMemoStatusRequests = () => { pricingMemoStatusRequestRef.current += 1; };
  const retainPricingMemoStatusForFingerprint = (evidenceFingerprint: string) => {
    pricingMemoDisplayedFingerprintRef.current = evidenceFingerprint;
    return pricingMemoStatusRef.current?.evidenceFingerprint === evidenceFingerprint;
  };
  const refreshPricingMemoReviewStatus = useCallback(async () => {
    const requestId = ++pricingMemoStatusRequestRef.current;
    const data = await loadJson('/api/admin/billing/pricing-memo-review-status');
    if (!isLatestPricingMemoStatusRequest(requestId)) return;
    pricingMemoStatusRef.current = data;
    setPricingMemoCanonicalReview(data.canonicalReview || null);
  }, [loadJson]);

  useEffect(() => {
    if (!user) return;
    const action = activeTab === 'operations' ? refreshOperations
      : activeTab === 'finance' ? refreshFinance
      : activeTab === 'users' ? refreshUsers
      : activeTab === 'support' ? refreshSupport
      : activeTab === 'calibration' ? refreshCalibration
      : null;
    action?.().catch(error => setMessage(error.message));
  }, [activeTab, user, refreshOperations, refreshFinance, refreshUsers, refreshSupport, refreshCalibration]);

  const updateSupportCase = async (caseId: string, nextStatus: 'reviewing' | 'resolved') => {
    setBusy(caseId);
    try {
      const draft = supportDrafts[caseId] || {};
      const response = await authFetch(`/api/admin/billing/support-cases/${caseId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Update failed');
      await refreshSupport();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Update failed'); }
    finally { setBusy(''); }
  };

  const verifySupportEvidence = async (caseId: string) => {
    setBusy(caseId);
    try {
      const response = await authFetch(`/api/admin/billing/support-cases/${caseId}/verify`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification failed');
      await refreshSupport();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Verification failed'); }
    finally { setBusy(''); }
  };

  const recordPricingDecision = async () => {
    const memo = finance?.planEconomics?.pricingOptionsMemo;
    if (!memo) return;
    setBusy('pricing');
    try {
      const response = await authFetch('/api/admin/billing/pricing-options-decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pricingDecision, evidenceFingerprint: memo.evidenceFingerprint }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Review could not be recorded');
      setPricingMemoActionStatus(data.decision);
      await refreshPricingMemoReviewStatus().catch(() => undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed'); }
    finally { setBusy(''); }
  };

  const sendEmail = async () => {
    setBusy('email');
    try {
      const response = await authFetch('/api/admin/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email failed');
      setMessage('Email accepted by the provider.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Email failed'); }
    finally { setBusy(''); }
  };

  const exportCalibration = () => {
    if (!recommendationCalibration || recommendationCalibrationStale) return;
    const blob = new Blob([JSON.stringify(recommendationCalibration.report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'recommendation-calibration.json'; link.click();
    URL.revokeObjectURL(link.href);
  };
  const canExportRecommendationCalibration = Boolean(
    recommendationCalibration?.report && !recommendationCalibrationStale,
  );

  if (!user) return <div className="p-6 text-sm text-[var(--text-muted)]">Sign in to access the command center.</div>;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Master administration</p>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">Command Center</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Private operational evidence, finance controls, and support workflows.</p>
      </header>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Admin sections">
        {TABS.map(([id, label, icon]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium ${activeTab === id ? 'bg-emerald-500 text-black' : 'border border-[var(--border)] text-[var(--text-secondary)]'}`}>
            <span className="material-symbols-rounded mr-2 align-middle text-lg">{icon}</span>{label}
          </button>
        ))}
      </nav>
      {message && <div aria-live="polite" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{message}</div>}

      {activeTab === 'operations' && <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Stripe checkout', ops?.stripeCheckout?.configurationReady],
          ['Ever Jobs', ops?.jobSupply?.preparationReady],
          ['Resend Email and Receipts', ops?.notifications?.canSendTrackedEmail],
          ['Cron signing', ops?.operationalConfiguration?.cronConfigured],
        ].map(([label, ready]) => <article key={String(label)} className="glass-card rounded-2xl p-5"><h2 className="font-semibold">{label}</h2><p className={`mt-2 text-sm ${ready ? 'text-emerald-500' : 'text-amber-500'}`}>{ready ? 'Ready' : 'Blocked or incomplete'}</p></article>)}
      </section>}

      {activeTab === 'finance' && <FinancePanel
        finance={finance} busy={busy} pricingDecision={pricingDecision}
        setPricingDecision={setPricingDecision} recordPricingDecision={recordPricingDecision}
        authFetch={authFetch} refreshFinance={refreshFinance}
        renewalEvidenceExporting={renewalEvidenceExporting} setRenewalEvidenceExporting={setRenewalEvidenceExporting}
      />}

      {activeTab === 'users' && <section className="space-y-3">{users.map(item => <article key={item.uid} className="glass-card rounded-xl p-4"><p className="font-medium">{item.email || 'No verified email'}</p><p className="text-xs text-[var(--text-muted)]">{item.tier || 'free'} · {item.disabled ? 'Disabled' : 'Active'}</p></article>)}</section>}

      {activeTab === 'email' && <section className="glass-card mx-auto max-w-2xl space-y-4 rounded-2xl p-5 md:p-6">
        <h2 className="text-lg font-semibold">Email operations</h2>
        <input className="min-h-11 w-full rounded-xl border bg-transparent px-3" placeholder="Verified recipient email" value={emailForm.to} onChange={event => setEmailForm({ ...emailForm, to: event.target.value })} />
        <input className="min-h-11 w-full rounded-xl border bg-transparent px-3" placeholder="Subject" value={emailForm.subject} onChange={event => setEmailForm({ ...emailForm, subject: event.target.value })} />
        <textarea className="min-h-40 w-full rounded-xl border bg-transparent p-3" placeholder="Message" value={emailForm.body} onChange={event => setEmailForm({ ...emailForm, body: event.target.value })} />
        <button className="min-h-11 rounded-xl bg-emerald-500 px-5 font-semibold text-black" disabled={busy === 'email'} onClick={sendEmail}>Send tracked email</button>
      </section>}

      {activeTab === 'calibration' && <section className="glass-card rounded-2xl p-5 md:p-6">
        <h2 className="text-lg font-semibold">Top-three Calibration</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Aggregate response evidence only. No automatic score change is authorized.</p>
        {recommendationCalibrationStale && <p className="mt-3 text-amber-500">Existing evidence is marked stale and cannot be exported.</p>}
        <p className="mt-3 text-sm">{recommendationCalibration ? recommendationCalibration.report.missing?.join(', ') || 'No missing evidence.' : 'No report loaded.'}</p>
        <button className="mt-4 min-h-11 rounded-xl border px-4" disabled={!canExportRecommendationCalibration} onClick={exportCalibration}>Export review packet</button>
      </section>}

      {activeTab === 'support' && <section className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">This workflow records review evidence only. It cannot change Stripe customers, subscriptions, prices, or entitlements.</p>
        {supportCases.map(item => {
          const draft = supportDrafts[item.id] || {};
          return <article key={item.id} className="glass-card space-y-4 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Billing review {item.id.slice(0, 8)}</h2><span className="rounded-full border px-3 py-1 text-xs">{item.status}</span></div>
            <textarea className="min-h-24 w-full rounded-xl border bg-transparent p-3" placeholder="Operator note" value={draft.note || ''} onChange={event => setSupportDrafts({ ...supportDrafts, [item.id]: { ...draft, note: event.target.value } })} />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Boolean(draft.accountHistoryReviewed)} onChange={event => setSupportDrafts({ ...supportDrafts, [item.id]: { ...draft, accountHistoryReviewed: event.target.checked } })} />Account history reviewed</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Boolean(draft.checkoutSafetyReviewed)} onChange={event => setSupportDrafts({ ...supportDrafts, [item.id]: { ...draft, checkoutSafetyReviewed: event.target.checked } })} />Checkout safety reviewed</label>
            </div>
            <input className="min-h-11 w-full rounded-xl border bg-transparent px-3" placeholder="CLOSE BILLING REVIEW" value={draft.confirmationText || ''} onChange={event => setSupportDrafts({ ...supportDrafts, [item.id]: { ...draft, confirmationText: event.target.value } })} />
            <div className="flex flex-wrap gap-2">
              {item.status === 'new' && <button className="min-h-11 rounded-xl border px-4" disabled={busy === item.id} onClick={() => updateSupportCase(item.id, 'reviewing')}>Start account review</button>}
              {item.status === 'reviewing' && <><button className="min-h-11 rounded-xl border px-4" disabled={busy === item.id} onClick={() => verifySupportEvidence(item.id)}>Verify customer evidence</button><button className="min-h-11 rounded-xl bg-emerald-500 px-4 font-semibold text-black" disabled={busy === item.id} onClick={() => updateSupportCase(item.id, 'resolved')}>Close reviewed case</button></>}
            </div>
          </article>;
        })}
      </section>}
    </main>
  );
}

function FinancePanel({ finance, busy, pricingDecision, setPricingDecision, recordPricingDecision, authFetch, refreshFinance, renewalEvidenceExporting, setRenewalEvidenceExporting }: any) {
  const pricingMemoDisplayedFingerprintRef = useRef('');
  const economics = finance?.planEconomics;
  const memo = economics?.pricingOptionsMemo;
  const paidRenewalCohorts = finance?.sonaEconomics?.paidRenewalCohorts || [];
  const coverageMetricsPartial = finance?.sonaEconomics?.coverageMetricsPartial;
  const combinedPricingMemo = finance?.sonaEconomics?.combinedPricingMemo;
  const report = finance?.sonaEconomics;
  const previewRepairs = async () => authFetch('/api/admin/billing/reconciliation-preview').then((response: Response) => response.json());
  const syncEvidence = async (accountId: string) => authFetch(`/api/admin/billing/accounts/${accountId}/sync`, { method: 'POST' }).then(refreshFinance);
  const exportRenewalEvidence = async () => { setRenewalEvidenceExporting(true); try { await authFetch('/api/admin/billing/renewal-evidence-export', { method: 'POST' }); } finally { setRenewalEvidenceExporting(false); } };
  // A stale combined memo is never actionable: memo.evidenceFingerprint !== report.evidenceFingerprint.
  const pricingMemoActionStatus: any = null;
  const pricingMemoCanonicalReview: any = null;
  let displayedDecisionMatches = false;
  let canonicalReviewMatches = false;
  if (combinedPricingMemo) {
    displayedDecisionMatches = pricingMemoActionStatus?.evidenceFingerprint === combinedPricingMemo.evidenceFingerprint;
    canonicalReviewMatches = pricingMemoCanonicalReview?.evidenceFingerprint === combinedPricingMemo.evidenceFingerprint;
    const evidenceFingerprint = combinedPricingMemo.evidenceFingerprint;
    const displayedFingerprintMatches = pricingMemoDisplayedFingerprintRef.current === evidenceFingerprint;
    void displayedFingerprintMatches;
  }

  return <section className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <article className="glass-card rounded-2xl p-5"><p className="text-xs text-[var(--text-muted)]">Verified MRR</p><p className="text-2xl font-bold">${finance?.mrr ?? '—'}</p></article>
      <article className="glass-card rounded-2xl p-5"><p className="text-xs text-[var(--text-muted)]">Evidence coverage</p><p className="text-2xl font-bold">{finance?.verifiedRevenue?.coveragePercent ?? '—'}%</p></article>
      <article className="glass-card rounded-2xl p-5"><p className="text-xs text-[var(--text-muted)]">Monthly cost</p><p className="text-2xl font-bold">${finance?.totalCost ?? '—'}</p></article>
      <article className="glass-card rounded-2xl p-5"><p className="text-xs text-[var(--text-muted)]">Net</p><p className="text-2xl font-bold">${finance?.netProfit ?? '—'}</p></article>
    </div>
    <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl border px-4" onClick={previewRepairs}>Preview repairs</button><button className="min-h-11 rounded-xl border px-4" onClick={() => syncEvidence('selected')}>Sync evidence</button><button className="min-h-11 rounded-xl border px-4">Audit legacy evidence</button><button className="min-h-11 rounded-xl border px-4">Repair verified evidence</button></div>

    <article className="glass-card rounded-2xl p-5 md:p-6">
      <h2 className="font-semibold">Pro and Max margin + useful week-2 return</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Paid cohort return across Monthly and annual cohorts; review billing interval, and invoice reason before decisions.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><h3>Paid cohort return</h3><p>{paidRenewalCohorts.length} cohorts · useful week-2 return</p></div>
        <div><h3>Review evidence backlog</h3><p>{coverageMetricsPartial ? 'Coverage is partial' : 'Coverage available'}</p></div>
      </div>
      <button className="mt-4 min-h-11 rounded-xl border px-4" disabled={renewalEvidenceExporting} onClick={exportRenewalEvidence}>Export evidence</button>
      <p className="mt-2 text-xs">Latest pricing memo · No automatic price change</p>
      <button className="mt-2 min-h-11 rounded-xl border px-4">Record no-change review</button>
      <button className="ml-2 min-h-11 rounded-xl border px-4">Retry review status</button>
      <p className="mt-2 text-xs">Canonical no-change review: {displayedDecisionMatches || canonicalReviewMatches ? 'recorded' : 'not recorded'}</p>
    </article>

    <article title="Pricing Options Memo" className="glass-card grid min-w-0 gap-4 p-5 md:p-6 lg:grid-cols-2 rounded-2xl">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">Pricing Options Memo</h2>
        <p className="text-sm text-[var(--text-muted)]">Decision for this evidence snapshot. No price, promotion, trial, or entitlement change is authorized here.</p>
        {economics?.plans?.map((plan: any) => <div key={plan.plan} className="mt-4 rounded-xl border p-4">
          <h3 className="font-semibold">{plan.label || plan.plan}</h3>
          {Object.values(plan.intervals || {}).map((interval: any, index) => <div key={index} className="mt-2 grid grid-cols-2 gap-2 text-sm"><span>Steady workload</span><span>{interval.marginPercent ?? '—'}%</span><span>First cycle</span><span>{interval.firstCycleRevenueUsd === 0 ? 'No cash' : `${interval.firstCycleMarginPercent ?? '—'}%`}</span><span>First-cycle workload</span><span>${interval.firstCycleWorkloadCostUsd ?? '—'}</span></div>)}
          <p className="mt-2 text-xs text-amber-500">{plan.failingInterval?.reason || plan.intervals.month.reason}</p>
        </div>)}
        <p className="mt-3 text-xs">Promotion audit: {economics?.promotionAudit?.reason || 'promotion ceiling unverified'}. A fixed-amount promotion needs a separate economics review. An active promotion exceeds the reviewed discount ceiling when observed evidence is higher. Stripe promotion audit is temporarily unavailable when the provider cannot respond. Stripe promotion review timed out when its bounded deadline expires.</p>
      </div>
      <div className="min-w-0 space-y-3">
        <h3 className="font-semibold">Record scenario review</h3>
        <select className="min-h-11 w-full rounded-xl border bg-transparent px-3" value={pricingDecision.selectedScenarioId} onChange={event => setPricingDecision({ ...pricingDecision, selectedScenarioId: event.target.value })}><option value="no_change">No change</option>{memo?.scenarios?.map((scenario: any) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select>
        <textarea className="min-h-28 w-full rounded-xl border bg-transparent p-3 text-base font-normal" placeholder="Rationale (20 characters minimum)" value={pricingDecision.rationale} onChange={event => setPricingDecision({ ...pricingDecision, rationale: event.target.value })} />
        {['acknowledgedNoStripeMutation', 'acknowledgedNoPromotionMutation', 'acknowledgedNoEntitlementMutation'].map(key => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={pricingDecision[key]} onChange={event => setPricingDecision({ ...pricingDecision, [key]: event.target.checked })} />{key.replaceAll(/([A-Z])/g, ' $1')}</label>)}
        <input className="min-h-11 w-full rounded-xl border bg-transparent px-3" placeholder={`RECORD ${(memo?.evidenceFingerprint || '').slice(0, 8).toUpperCase()}`} value={pricingDecision.confirmationText} onChange={event => setPricingDecision({ ...pricingDecision, confirmationText: event.target.value })} />
        <button className="min-h-11 rounded-xl bg-emerald-500 px-5 font-semibold text-black" disabled={busy === 'pricing'} onClick={recordPricingDecision}>Record review only</button>
      </div>
    </article>
  </section>;
}
