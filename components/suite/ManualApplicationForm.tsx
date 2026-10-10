'use client';
import { useRef, useState, useEffect } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';
import type { JobApplication } from '@/lib/database-suite';

export default function ManualApplicationForm({ applications, onSaved }: { applications: JobApplication[]; onSaved: (application: JobApplication) => void }) {
  const owner = useStore(state => state.user?.uid);
  const [company, setCompany] = useState(''); const [role, setRole] = useState(''); const [url, setUrl] = useState('');
  const [submitted, setSubmitted] = useState(true); const [sentDate, setSentDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const [hydratedOwner, setHydratedOwner] = useState<string | null>(null);
  const [storageError, setStorageError] = useState('');
  const requestPayload = useRef('');
  const request = useRef(''); const mounted = useRef(true); const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const storageKey = `taco:manual-application:${owner || 'guest'}`;
  useEffect(() => {
    setHydratedOwner(null); setCompany(''); setRole(''); setUrl(''); setSubmitted(true); setSentDate(new Date().toLocaleDateString('en-CA')); setError(''); setSaved(false); setBusy(false); busyRef.current = false; request.current = ''; requestPayload.current = '';
    try { const raw = localStorage.getItem(storageKey); if (raw) { const draft = JSON.parse(raw); setCompany(typeof draft.company === 'string' ? draft.company : ''); setRole(typeof draft.role === 'string' ? draft.role : ''); setUrl(typeof draft.url === 'string' ? draft.url : ''); setSubmitted(draft.submitted !== false); if (typeof draft.sentDate === 'string') setSentDate(draft.sentDate); request.current = draft.requestId || ''; requestPayload.current = draft.requestPayload || ''; } }
    catch { setStorageError('Device recovery unavailable. Keep this tab open until the application is saved.'); }
    setHydratedOwner(owner || 'guest');
  }, [storageKey, owner]);
  useEffect(() => {
    if (hydratedOwner !== (owner || 'guest')) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ company, role, url, submitted, sentDate, requestId: request.current, requestPayload: requestPayload.current })); setStorageError(''); }
    catch { setStorageError('Device recovery unavailable. Keep this tab open until the application is saved.'); }
  }, [company, role, url, submitted, sentDate, storageKey, hydratedOwner, owner]);
  const duplicate = applications.some(app => url.trim() ? app.application_link === url.trim() : app.company_name.toLowerCase() === company.trim().toLowerCase() && app.job_title?.toLowerCase() === role.trim().toLowerCase());
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busyRef.current || !owner) return;
    busyRef.current = true; setBusy(true); setError(''); setSaved(false);
    const payload = { company: company.trim(), role: role.trim(), url: url.trim(), submitted, sentDate: submitted ? sentDate : undefined };
    const signature = JSON.stringify(payload);
    if (!request.current || signature !== requestPayload.current) { request.current = crypto.randomUUID(); requestPayload.current = signature; }
    try { localStorage.setItem(storageKey, JSON.stringify({ ...payload, requestId: request.current, requestPayload: signature })); } catch { setStorageError('Device recovery unavailable. Keep this tab open until the application is saved.'); }
    const current = () => mounted.current && useStore.getState().user?.uid === owner;
    try {
      const response = await authFetch('/api/applications/manual', { method:'POST', body:JSON.stringify({ requestId: request.current, ...payload }) });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok || !result.success || !result.data?.id) throw new Error(result.error || 'Could not save this application.');
      onSaved(result.data); setSaved(true); request.current = ''; requestPayload.current = ''; setCompany(''); setRole(''); setUrl('');
    } catch (error) { if (current()) setError(error instanceof Error ? error.message : 'Save failed. Retry with your details intact.'); }
    finally { if (current()) { busyRef.current = false; setBusy(false); } }
  }
  const field = 'w-full min-h-11 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base';
  return <details className="my-4 border-2 border-[var(--border)] bg-[var(--bg-surface)] p-4">
    <summary className="cursor-pointer font-semibold">Track an application</summary>
    <p className="my-3 text-sm text-[var(--text-secondary)]">Record a role you applied for elsewhere, or save an unsent tracker. No generated documents required.</p>
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label>Company<input required maxLength={160} className={field} value={company} onChange={event => setCompany(event.target.value)} disabled={busy}/></label>
      <label>Role<input required maxLength={200} className={field} value={role} onChange={event => setRole(event.target.value)} disabled={busy}/></label>
      <label className="sm:col-span-2">Posting link <span className="text-sm">(optional)</span><input type="url" className={field} value={url} onChange={event => setUrl(event.target.value)} disabled={busy}/></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={submitted} onChange={event => setSubmitted(event.target.checked)} disabled={busy}/> I already submitted this application</label>
      {submitted && <label>Actual submission date<input type="date" required max={new Date().toLocaleDateString('en-CA')} className={field} value={sentDate} onChange={event => setSentDate(event.target.value)} disabled={busy}/></label>}
      {duplicate && <p className="sm:col-span-2 text-sm" role="status">A similar application is already tracked. Saving will create a separate record.</p>}
      {storageError && <p role="status" className="sm:col-span-2 text-sm">{storageError}</p>}
      {error && <p className="sm:col-span-2 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      {saved && <p className="sm:col-span-2 text-sm" role="status">Application saved. You can open its details below.</p>}
      <button disabled={busy || !owner} className="min-h-11 border-2 border-[var(--text-primary)] bg-[var(--accent)] px-4 py-2 font-semibold disabled:opacity-50">{busy ? 'Saving…' : submitted ? 'Save submitted application' : 'Save unsent tracker'}</button>
    </form>
  </details>;
}
