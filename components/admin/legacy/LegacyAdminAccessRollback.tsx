'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import { TacoMark, TacoWordmark } from '@/components/BrandLogo';

type AdminRole = 'owner' | 'administrator' | 'billing_admin' | 'support_admin' | 'operations_admin' | 'analyst';
type AdminStatus = 'provisioning' | 'active' | 'suspended';

interface AdminSession {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: string[];
  mfaSatisfied: boolean;
  mfaEnforced: boolean;
}

interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: AdminStatus;
  version: number;
  requireMfa: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  invitationDelivery?: 'not_requested' | 'sent' | 'failed';
}

interface AuditEntry {
  id: string;
  action: string;
  actorEmail: string;
  actorRole: AdminRole | 'bootstrap';
  targetEmail?: string;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Owner',
  administrator: 'Administrator',
  billing_admin: 'Billing admin',
  support_admin: 'Support admin',
  operations_admin: 'Operations admin',
  analyst: 'Analyst',
};

const ASSIGNABLE_ROLES: Array<Exclude<AdminRole, 'owner'>> = [
  'administrator',
  'billing_admin',
  'support_admin',
  'operations_admin',
  'analyst',
];

const ROLE_DESCRIPTIONS: Record<Exclude<AdminRole, 'owner'>, string> = {
  administrator: 'Operate users, billing, support, settings, and platform workflows.',
  billing_admin: 'Review customers and manage billing without platform-wide control.',
  support_admin: 'Handle customer cases and approved communications.',
  operations_admin: 'Manage platform operations, settings, and reliability workflows.',
  analyst: 'Read aggregate analytics without user-management or mutation access.',
};

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// Roles are categorical, not a state, and the token system carries no per-role
// hue. The role label text identifies the role; the badge is a neutral token chip.
function roleTone(_role: AdminRole) {
  return 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]';
}

function statusTone(status: AdminStatus) {
  if (status === 'active') return 'border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]';
  if (status === 'suspended') return 'border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]';
  return 'border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]';
}

export function LegacyAdminAccessRollback() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    role: 'administrator' as Exclude<AdminRole, 'owner'>,
  });

  const canReadAccounts = session?.permissions.includes('admin.accounts.read') === true;
  const canManageAccounts = session?.permissions.includes('admin.accounts.manage') === true;
  const canReadAudit = session?.permissions.includes('admin.audit.read') === true;

  const loadAdminData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const sessionResponse = await authFetch('/api/admin/session', { cache: 'no-store' });
      const sessionPayload = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) {
        setSession(null);
        throw new Error(sessionPayload.error || 'This account does not have active admin access.');
      }

      const nextSession = sessionPayload.admin as AdminSession;
      setSession(nextSession);
      const requests: Array<Promise<Response>> = [];
      const accountIndex = nextSession.permissions.includes('admin.accounts.read') ? requests.push(authFetch('/api/admin/accounts', { cache: 'no-store' })) - 1 : -1;
      const auditIndex = nextSession.permissions.includes('admin.audit.read') ? requests.push(authFetch('/api/admin/audit', { cache: 'no-store' })) - 1 : -1;
      const responses = await Promise.all(requests);

      if (accountIndex >= 0) {
        const response = responses[accountIndex];
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Admin accounts could not be loaded.');
        setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      } else {
        setAccounts([]);
      }

      if (auditIndex >= 0) {
        const response = responses[auditIndex];
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Admin audit history could not be loaded.');
        setAudit(Array.isArray(payload.audit) ? payload.audit : []);
      } else {
        setAudit([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Admin access could not be verified.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const metrics = useMemo(() => ({
    active: accounts.filter(account => account.status === 'active').length,
    owners: accounts.filter(account => account.role === 'owner' && account.status === 'active').length,
    mfaRequired: accounts.filter(account => account.requireMfa).length,
    suspended: accounts.filter(account => account.status === 'suspended').length,
  }), [accounts]);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const response = await authFetch('/api/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          displayName: form.displayName || undefined,
          role: form.role,
          sendInvitation: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The admin account could not be created.');
      setForm({ email: '', displayName: '', role: 'administrator' });
      setNotice(
        payload.invitationDelivery === 'sent'
          ? 'Admin access created and the secure invitation was sent.'
          : 'Admin access was created, but invitation delivery needs review.',
      );
      await loadAdminData(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The admin account could not be created.');
    } finally {
      setCreating(false);
    }
  }

  async function updateAccount(account: AdminAccount, change: { role?: Exclude<AdminRole, 'owner'>; status?: 'active' | 'suspended' }) {
    setBusyUid(account.uid);
    setError('');
    setNotice('');
    try {
      const response = await authFetch(`/api/admin/accounts/${encodeURIComponent(account.uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The admin account could not be updated.');
      setNotice(change.status === 'suspended' ? 'Admin access suspended and active sessions revoked.' : 'Admin access updated and sessions refreshed.');
      await loadAdminData(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'The admin account could not be updated.');
    } finally {
      setBusyUid('');
    }
  }

  if (loading) {
    return (
      <main className="min-h-dvh bg-[var(--bg-surface)] px-4 py-12 text-[var(--text-primary)]">
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-10 w-72 rounded-xl bg-[var(--card-bg)]" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(item => <div key={item} className="h-28 rounded-2xl bg-[var(--card-bg)]" />)}
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-dvh bg-[var(--bg-surface)] px-4 py-12 text-[var(--text-primary)]">
        <section className="mx-auto max-w-xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-8 elevation-raised">
          <TacoMark className="h-12 w-12 rounded-2xl border border-[var(--border-subtle)]" />
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[var(--danger)]">Protected administration</p>
          <h1 className="mt-2 text-3xl font-bold">Admin access required</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{error || 'Sign in with an active admin account and try again.'}</p>
          <p className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs leading-5 text-[var(--text-muted)]">
            Newly provisioned admins must sign out and sign back in so Firebase can issue a token containing the current role version.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--bg-surface)] px-4 py-8 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] elevation-raised">
          <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <TacoMark className="h-11 w-11 rounded-2xl border border-[var(--border-subtle)] bg-white" />
                <TacoWordmark className="w-52 max-w-full" />
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Administrative command center</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Access with guardrails</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Role-scoped admin accounts, versioned Firebase claims, server-side revocation, and an immutable operating trail.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 lg:min-w-72">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{session.displayName}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{session.email}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roleTone(session.role)}`}>{ROLE_LABELS[session.role]}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs">
                <span className="text-[var(--text-muted)]">MFA posture</span>
                <span className={session.mfaSatisfied ? 'font-semibold text-[var(--success)]' : session.mfaEnforced ? 'font-semibold text-[var(--danger)]' : 'font-semibold text-[var(--warning)]'}>
                  {session.mfaSatisfied ? 'Verified' : session.mfaEnforced ? 'Required' : 'Enrollment pending'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-3 text-xs text-[var(--text-muted)] sm:px-8">
            <span className="inline-flex items-center gap-1.5"><span className="material-symbols-rounded text-sm text-[var(--success)]">verified_user</span> Claims + database must agree</span>
            <span className="text-[var(--text-muted)]">•</span>
            <span>Revoked-token verification</span>
            <span className="text-[var(--text-muted)]">•</span>
            <span>No client-side admin database access</span>
            <button type="button" onClick={() => void loadAdminData(true)} disabled={refreshing} className="ml-auto min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? <div role="alert" className="mt-5 rounded-2xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
        {notice ? <div role="status" className="mt-5 rounded-2xl border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm text-[var(--success)]">{notice}</div> : null}

        {canReadAccounts ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Admin account metrics">
            {[
              ['Active admins', metrics.active, 'shield_person', 'text-[var(--text-muted)]'],
              ['Active owners', metrics.owners, 'workspace_premium', 'text-[var(--text-muted)]'],
              ['MFA required', metrics.mfaRequired, 'phonelink_lock', 'text-[var(--text-muted)]'],
              ['Suspended', metrics.suspended, 'person_off', 'text-[var(--text-muted)]'],
            ].map(([label, value, icon, tone]) => (
              <article key={String(label)} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 elevation-card">
                <div className="flex items-center justify-between">
                  <span className={`material-symbols-rounded text-2xl ${tone}`}>{icon}</span>
                  <span className="text-3xl font-bold tabular-nums">{value}</span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
              </article>
            ))}
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] elevation-card">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold">Admin accounts</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Owner changes require the guarded bootstrap command.</p>
              </div>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{accounts.length} total</span>
            </div>

            {!canReadAccounts ? (
              <div className="p-6 text-sm text-[var(--text-secondary)]">Your role does not include access to the admin account directory.</div>
            ) : accounts.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-rounded text-4xl text-[var(--text-muted)]">shield_person</span>
                <p className="mt-3 text-sm font-semibold">No admin records were returned</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Use the guarded bootstrap command to create the first owner.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="bg-[var(--bg-surface)] text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Account</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Version</th>
                      <th className="px-4 py-3 font-semibold">Updated</th>
                      <th className="px-5 py-3 text-right font-semibold">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {accounts.map(account => {
                      const immutable = account.role === 'owner' || account.uid === session.uid || !canManageAccounts;
                      return (
                        <tr key={account.uid} className="align-middle">
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold">{account.displayName || account.email.split('@')[0]}</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">{account.email}</p>
                            {account.invitationDelivery === 'failed' ? <p className="mt-1 text-[11px] text-[var(--danger)]">Invitation delivery failed</p> : null}
                          </td>
                          <td className="px-4 py-4">
                            {immutable ? (
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${roleTone(account.role)}`}>{ROLE_LABELS[account.role]}</span>
                            ) : (
                              <select
                                value={account.role}
                                disabled={busyUid === account.uid}
                                onChange={event => void updateAccount(account, { role: event.target.value as Exclude<AdminRole, 'owner'> })}
                                className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                              >
                                {ASSIGNABLE_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${statusTone(account.status)}`}>{account.status}</span></td>
                          <td className="px-4 py-4 font-mono text-xs text-[var(--text-secondary)]">v{account.version}</td>
                          <td className="px-4 py-4 text-xs text-[var(--text-muted)]">{formatDate(account.updatedAt)}</td>
                          <td className="px-5 py-4 text-right">
                            {immutable ? (
                              <span className="text-xs text-[var(--text-muted)]">{account.uid === session.uid ? 'Current account' : account.role === 'owner' ? 'CLI protected' : 'Read only'}</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyUid === account.uid}
                                onClick={() => void updateAccount(account, { status: account.status === 'suspended' ? 'active' : 'suspended' })}
                                className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${account.status === 'suspended' ? 'border-[var(--success)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]' : 'border-[var(--danger)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]'}`}
                              >
                                {busyUid === account.uid ? 'Updating…' : account.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            {canManageAccounts ? (
              <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 elevation-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]">
                    <span className="material-symbols-rounded">person_add</span>
                  </span>
                  <div>
                    <h2 className="font-bold">Create admin account</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Invitation and session revocation included.</p>
                  </div>
                </div>
                <form onSubmit={createAccount} className="mt-5 space-y-4">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    Work email
                    <input type="email" required value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" placeholder="admin@company.com" />
                  </label>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    Display name
                    <input type="text" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" placeholder="Optional" maxLength={120} />
                  </label>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    Role
                    <select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value as Exclude<AdminRole, 'owner'> }))} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                      {ASSIGNABLE_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                    </select>
                  </label>
                  <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs leading-5 text-[var(--text-muted)]">{ROLE_DESCRIPTIONS[form.role]}</p>
                  <button type="submit" disabled={creating} className="min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] disabled:cursor-wait disabled:opacity-60">
                    {creating ? 'Creating secure access…' : 'Create and invite'}
                  </button>
                </form>
              </section>
            ) : null}

            <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 elevation-card">
              <h2 className="font-bold">Role boundary</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                Your current role includes {session.permissions.length} explicit permissions. No route trusts the sidebar or email address as authorization.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.permissions.map(permission => <span key={permission} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">{permission}</span>)}
              </div>
            </section>
          </aside>
        </div>

        {canReadAudit ? (
          <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] elevation-card">
            <div className="border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold">Administrative audit trail</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Server-written records for account provisioning, role changes, and suspensions.</p>
            </div>
            {audit.length === 0 ? (
              <p className="p-6 text-sm text-[var(--text-muted)]">No admin account changes have been recorded yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {audit.slice(0, 30).map(entry => (
                  <article key={entry.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <time className="text-xs text-[var(--text-muted)]">{formatDate(entry.occurredAt)}</time>
                    <div>
                      <p className="text-sm font-semibold">{entry.action.replaceAll('.', ' ')}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{entry.actorEmail}{entry.targetEmail ? ` → ${entry.targetEmail}` : ''}</p>
                    </div>
                    <span className="justify-self-start rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] sm:justify-self-end">{entry.actorRole}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
