'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getJobApplications, type JobApplication } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import AnimatedToolIcon, { type ToolIconTone } from '@/components/AnimatedToolIcon';
import { AssistantMark } from '@/components/assistant';
import {
  SuiteToolHeader,
  SuiteToolShell,
  SuitePanel,
  SuiteMetricCard,
  SuiteEmptyState,
  SuiteUnmeasured,
} from '@/components/suite/SuiteToolChrome';
import { showToast } from '@/components/Toast';

type ContactType = 'recruiter' | 'hiring_manager' | 'referral' | 'peer' | 'other';
type InteractionType = 'email' | 'call' | 'meeting' | 'linkedin' | 'referral' | 'note';
type ViewMode = 'command' | 'grid' | 'list' | 'company';
type AttentionFilter = 'all' | 'attention' | 'due' | 'first_touch' | 'dormant' | 'linked';
// Status carried by hue is one of three tokened meanings, distinct from the blue
// interaction accent. Categorical contact types use the design system's tag tokens.
type StatusTone = 'accent' | 'success' | 'warning';
type TagHue = 'blue' | 'green' | 'amber' | 'purple' | 'neutral';

interface ContactInteraction {
  type: InteractionType | string;
  note: string;
  date: string;
}

interface Contact {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  type: ContactType;
  notes: string;
  applicationId: string | null;
  lastContactedAt: unknown;
  followUpDate: string | null;
  interactions: ContactInteraction[];
  created_at: unknown;
  updated_at?: unknown;
}

interface ContactFormState {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  type: ContactType;
  notes: string;
  applicationId: string;
  followUpDate: string;
}

type ContactInsight = Contact & {
  linkedApplication: JobApplication | null;
  daysSinceLastContact: number | null;
  isFollowUpDue: boolean;
  isDormant: boolean;
  needsFirstTouch: boolean;
  needsAttention: boolean;
  relationshipStrength: number;
  nextAction: {
    label: string;
    detail: string;
    icon: string;
    tone: StatusTone;
    priority: number;
  };
};

const EMPTY_FORM: ContactFormState = {
  name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
  linkedin: '',
  type: 'recruiter',
  notes: '',
  applicationId: '',
  followUpDate: '',
};

const CONTACT_TYPE_KEYS: ContactType[] = ['recruiter', 'hiring_manager', 'referral', 'peer', 'other'];

const TYPE_CONFIG: Record<ContactType, { icon: string; label: string; tone: ToolIconTone; tag: TagHue; description: string }> = {
  recruiter: {
    icon: 'support_agent',
    label: 'Recruiter',
    tone: 'blue',
    tag: 'blue',
    description: 'Talent partner, sourcer, or recruiting contact',
  },
  hiring_manager: {
    icon: 'person_pin',
    label: 'Hiring Manager',
    tone: 'emerald',
    tag: 'green',
    description: 'Decision maker or future manager',
  },
  referral: {
    icon: 'groups',
    label: 'Referral',
    tone: 'amber',
    tag: 'amber',
    description: 'Warm intro, advocate, or internal sponsor',
  },
  peer: {
    icon: 'handshake',
    label: 'Peer',
    tone: 'violet',
    tag: 'purple',
    description: 'Colleague, alumni, or networking peer',
  },
  other: {
    icon: 'person',
    label: 'Other',
    tone: 'slate',
    tag: 'neutral',
    description: 'Useful contact outside the main buckets',
  },
};

const INTERACTION_CONFIG: Record<InteractionType, { icon: string; label: string }> = {
  email: { icon: 'mail', label: 'Email' },
  call: { icon: 'call', label: 'Call' },
  meeting: { icon: 'event_available', label: 'Meeting' },
  linkedin: { icon: 'open_in_new', label: 'LinkedIn' },
  referral: { icon: 'diversity_3', label: 'Referral' },
  note: { icon: 'edit_note', label: 'Note' },
};

const ACTIVE_APPLICATION_STATUSES: JobApplication['status'][] = [
  'not_applied',
  'applied',
  'screening',
  'interview_scheduled',
  'interviewed',
  'offer',
];

// Status hue -> tokened CSS var. Blue accent is interaction; success/warning
// carry state. Both themes flip automatically through the token cascade.
function toneVar(tone: StatusTone) {
  return tone === 'accent' ? '--accent' : tone === 'success' ? '--success' : '--warning';
}

// A tinted chip/icon-shell (fill + hairline + ink) built entirely from a status
// token via color-mix, so it stays correct in light and dark with no literals.
function toneChipStyle(tone: StatusTone): CSSProperties {
  const v = toneVar(tone);
  return {
    color: `var(${v})`,
    background: `color-mix(in srgb, var(${v}) 12%, transparent)`,
    borderColor: `color-mix(in srgb, var(${v}) 30%, transparent)`,
  };
}

// Categorical contact-type tint from the design system's tag tokens. Colour is
// the last channel here: the glyph shape and label already identify the type.
function tagChipStyle(tag: TagHue): CSSProperties {
  if (tag === 'neutral') {
    return {
      color: 'var(--text-secondary)',
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border-subtle)',
    };
  }
  return {
    color: `var(--tag-${tag}-text)`,
    background: `var(--tag-${tag}-bg)`,
    borderColor: `color-mix(in srgb, var(--tag-${tag}-text) 30%, transparent)`,
  };
}

// Danger-tinted surface (delete/error) from the --danger token, both themes.
const dangerChipStyle: CSSProperties = {
  color: 'var(--danger)',
  background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
  borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)',
};

function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === 'function') return record.toDate();
    const seconds = record.seconds ?? record._seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return null;
}

function toDateInput(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function isPastOrToday(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() <= today.getTime();
}

function getLastInteractionDate(contact: Contact) {
  const latestInteraction = [...(contact.interactions || [])]
    .map(interaction => normalizeDate(interaction.date))
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];
  return normalizeDate(contact.lastContactedAt) || latestInteraction || null;
}

function getContactForm(contact: Contact): ContactFormState {
  return {
    name: contact.name || '',
    company: contact.company || '',
    role: contact.role || '',
    email: contact.email || '',
    phone: contact.phone || '',
    linkedin: contact.linkedin || '',
    type: contact.type || 'other',
    notes: contact.notes || '',
    applicationId: contact.applicationId || '',
    followUpDate: toDateInput(contact.followUpDate),
  };
}

function normalizeLinkedIn(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function getInteractionConfig(type: string) {
  return INTERACTION_CONFIG[type as InteractionType] || INTERACTION_CONFIG.note;
}

function buildInsight(contact: Contact, appMap: Map<string, JobApplication>): ContactInsight {
  const interactions = contact.interactions || [];
  const lastContactDate = getLastInteractionDate(contact);
  const daysSinceLastContact = daysSince(lastContactDate);
  const linkedApplication = contact.applicationId ? appMap.get(contact.applicationId) || null : null;
  const needsFirstTouch = interactions.length === 0;
  const isFollowUpDue = Boolean(contact.followUpDate && isPastOrToday(contact.followUpDate));
  const isDormant = !needsFirstTouch && (daysSinceLastContact ?? 0) >= 21;

  let relationshipStrength = 1;
  if (contact.email || contact.phone || contact.linkedin) relationshipStrength += 1;
  if (interactions.length >= 1) relationshipStrength += 1;
  if (interactions.length >= 3) relationshipStrength += 1;
  if (linkedApplication || (daysSinceLastContact !== null && daysSinceLastContact <= 14)) relationshipStrength += 1;
  relationshipStrength = Math.min(5, relationshipStrength);

  let nextAction: ContactInsight['nextAction'];
  if (isFollowUpDue) {
    nextAction = {
      label: 'Follow up today',
      detail: `Due ${formatDate(contact.followUpDate)}`,
      icon: 'notification_important',
      tone: 'warning',
      priority: 1,
    };
  } else if (needsFirstTouch) {
    nextAction = {
      label: 'Log first touch',
      detail: 'Add your first email, call, or note',
      icon: 'add_comment',
      tone: 'accent',
      priority: 2,
    };
  } else if (linkedApplication && ACTIVE_APPLICATION_STATUSES.includes(linkedApplication.status)) {
    nextAction = {
      label: 'Use this connection',
      detail: `${linkedApplication.company_name}, ${linkedApplication.job_title || 'active role'}`,
      icon: 'link',
      tone: 'success',
      priority: 3,
    };
  } else if (isDormant) {
    nextAction = {
      label: 'Reconnect',
      detail: `${daysSinceLastContact} days since last contact`,
      icon: 'history',
      tone: 'warning',
      priority: 4,
    };
  } else {
    nextAction = {
      label: 'Keep warm',
      detail: daysSinceLastContact === null ? 'Ready for notes' : `Last contact ${daysSinceLastContact} days ago`,
      icon: 'check_circle',
      tone: 'success',
      priority: 8,
    };
  }

  return {
    ...contact,
    linkedApplication,
    daysSinceLastContact,
    isFollowUpDue,
    isDormant,
    needsFirstTouch,
    needsAttention: isFollowUpDue || needsFirstTouch || isDormant || Boolean(linkedApplication && ACTIVE_APPLICATION_STATUSES.includes(linkedApplication.status)),
    relationshipStrength,
    nextAction,
  };
}

function dispatchSona(prompt: string, contextLabel = 'Network CRM') {
  window.dispatchEvent(new CustomEvent('assistant:open', { detail: { prompt, contextLabel } }));
}

export default function NetworkPage() {
  const { user } = useStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ContactType | 'all'>('all');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('command');
  const [addForm, setAddForm] = useState<ContactFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  const token = (user as any)?.accessToken || (user as any)?.stsTokenManager?.accessToken;

  async function loadData() {
    if (!user || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [networkResponse, appsResult] = await Promise.all([
        fetch('/api/agent/network', { headers: { Authorization: `Bearer ${token}` } }),
        getJobApplications(),
      ]);
      const networkData = await networkResponse.json();
      if (!networkResponse.ok || !networkData.success) throw new Error(networkData.error || 'Failed to fetch contacts.');
      setContacts(networkData.contacts || []);
      if (appsResult.success) setApplications(appsResult.data || []);
    } catch (loadError: any) {
      setError(loadError.message || 'Could not load Network CRM.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user, token]);

  useEffect(() => {
    if (selectedContactId) drawerCloseRef.current?.focus();
  }, [selectedContactId]);

  const appMap = useMemo(() => {
    return new Map(applications.map(application => [application.id, application]));
  }, [applications]);

  const enrichedContacts = useMemo(() => {
    return contacts
      .map(contact => buildInsight(contact, appMap))
      .sort((a, b) => a.nextAction.priority - b.nextAction.priority || a.name.localeCompare(b.name));
  }, [contacts, appMap]);

  const selectedContact = useMemo(
    () => enrichedContacts.find(contact => contact.id === selectedContactId) || null,
    [enrichedContacts, selectedContactId],
  );

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return enrichedContacts.filter(contact => {
      const searchable = [
        contact.name,
        contact.company,
        contact.role,
        contact.email,
        contact.phone,
        contact.linkedin,
        contact.notes,
        contact.linkedApplication?.company_name,
        contact.linkedApplication?.job_title,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesType = filterType === 'all' || contact.type === filterType;
      const matchesAttention =
        attentionFilter === 'all'
        || (attentionFilter === 'attention' && contact.needsAttention)
        || (attentionFilter === 'due' && contact.isFollowUpDue)
        || (attentionFilter === 'first_touch' && contact.needsFirstTouch)
        || (attentionFilter === 'dormant' && contact.isDormant)
        || (attentionFilter === 'linked' && Boolean(contact.linkedApplication));
      return matchesSearch && matchesType && matchesAttention;
    });
  }, [attentionFilter, enrichedContacts, filterType, searchQuery]);

  const attentionContacts = useMemo(() => {
    return enrichedContacts.filter(contact => contact.needsAttention).slice(0, 8);
  }, [enrichedContacts]);

  const metrics = useMemo(() => {
    const interactionCount = contacts.reduce((sum, contact) => sum + (contact.interactions?.length || 0), 0);
    // No contacts means there is nothing to average - render a labelled absence,
    // never "0/5", which would read as a measured floor (MUST6).
    const avgStrength = enrichedContacts.length
      ? (enrichedContacts.reduce((sum, contact) => sum + contact.relationshipStrength, 0) / enrichedContacts.length).toFixed(1)
      : null;
    return {
      total: contacts.length,
      attention: enrichedContacts.filter(contact => contact.needsAttention).length,
      due: enrichedContacts.filter(contact => contact.isFollowUpDue).length,
      referrals: enrichedContacts.filter(contact => contact.type === 'referral').length,
      linked: enrichedContacts.filter(contact => contact.linkedApplication).length,
      interactions: interactionCount,
      avgStrength,
    };
  }, [contacts, enrichedContacts]);

  const todayActions = [
    {
      label: 'Due follow-ups',
      value: metrics.due,
      icon: 'notification_important',
      onClick: () => { setAttentionFilter('due'); setViewMode('command'); },
    },
    {
      label: 'First touch needed',
      value: enrichedContacts.filter(contact => contact.needsFirstTouch).length,
      icon: 'add_comment',
      onClick: () => { setAttentionFilter('first_touch'); setViewMode('command'); },
    },
    {
      label: 'Dormant contacts',
      value: enrichedContacts.filter(contact => contact.isDormant).length,
      icon: 'history',
      onClick: () => { setAttentionFilter('dormant'); setViewMode('command'); },
    },
    {
      label: 'Warm referrals',
      value: metrics.referrals,
      icon: 'diversity_3',
      onClick: () => { setFilterType('referral'); setViewMode('grid'); },
    },
    {
      label: 'Linked to apps',
      value: metrics.linked,
      icon: 'link',
      onClick: () => { setAttentionFilter('linked'); setViewMode('list'); },
    },
  ];

  const hasFilters = Boolean(searchQuery.trim()) || filterType !== 'all' || attentionFilter !== 'all';

  async function createContact() {
    if (!addForm.name.trim()) {
      showToast('Name is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/agent/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'create',
          ...addForm,
          linkedin: normalizeLinkedIn(addForm.linkedin),
          applicationId: addForm.applicationId || null,
          followUpDate: addForm.followUpDate || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to add contact.');
      showToast('Contact added', 'person_add');
      setAddForm(EMPTY_FORM);
      setShowAddPanel(false);
      await loadData();
    } catch (createError: any) {
      showToast(createError.message || 'Failed to add contact', 'cancel');
    } finally {
      setSaving(false);
    }
  }

  async function updateContact(id: string, updates: Partial<ContactFormState>) {
    setSaving(true);
    try {
      const payload = {
        ...updates,
        linkedin: updates.linkedin !== undefined ? normalizeLinkedIn(updates.linkedin) : undefined,
        applicationId: updates.applicationId === '' ? null : updates.applicationId,
        followUpDate: updates.followUpDate === '' ? null : updates.followUpDate,
      };
      const response = await fetch('/api/agent/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update', id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to update contact.');
      showToast('Contact updated', 'check');
      await loadData();
    } catch (updateError: any) {
      showToast(updateError.message || 'Failed to update contact', 'cancel');
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(id: string) {
    setSaving(true);
    try {
      const response = await fetch('/api/agent/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to delete contact.');
      setContacts(prev => prev.filter(contact => contact.id !== id));
      if (selectedContactId === id) setSelectedContactId(null);
      showToast('Contact removed', 'delete');
    } catch (deleteError: any) {
      showToast(deleteError.message || 'Failed to delete contact', 'cancel');
    } finally {
      setSaving(false);
    }
  }

  async function logInteraction(id: string, interactionType: InteractionType, note: string, followUpDate: string) {
    if (!note.trim()) {
      showToast('Add a short note before logging', 'warning');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/agent/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'log_interaction',
          id,
          interactionType,
          note,
          followUpDate: followUpDate || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to log interaction.');
      showToast('Interaction logged', 'check');
      await loadData();
    } catch (logError: any) {
      showToast(logError.message || 'Failed to log interaction', 'cancel');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SuiteToolShell variant="workbench">
        <SuiteToolHeader
          tool="network"
          actions={
            <>
              <button
                type="button"
                onClick={() => dispatchSona('Review my Network CRM and tell me who I should follow up with first.', 'Network CRM')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
              >
                <AssistantMark size="xs" state="idle" />
                Ask Taco
              </button>
              <button
                type="button"
                onClick={() => setShowAddPanel(true)}
                disabled={!user || !token}
                title={!user || !token ? 'Sign in to add contacts' : undefined}
                className="btn-primary inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-rounded text-[18px]">person_add</span>
                Add contact
              </button>
            </>
          }
        />

        {/* The cockpit's counts only mean something once real contacts are loaded.
            Rendering it during loading / signed-out would show measured-zero
            metrics for data we never measured (MUST6), so it is gated. */}
        {!loading && !error && user && token && contacts.length > 0 && (
          <>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {todayActions.map(action => (
            <SuiteMetricCard
              key={action.label}
              label={action.label}
              value={action.value}
              icon={action.icon}
              onClick={action.onClick}
            />
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SuiteMetricCard label="Total contacts" value={metrics.total} icon="group" />
          <SuiteMetricCard label="Needs attention" value={metrics.attention} icon="priority_high" />
          <SuiteMetricCard label="Interactions logged" value={metrics.interactions} icon="forum" />
          {metrics.avgStrength === null ? (
            <SuiteUnmeasured
              label="Avg relationship strength"
              reason="Add contacts to compute strength across your network."
            />
          ) : (
            <SuiteMetricCard label="Avg strength" value={`${metrics.avgStrength}/5`} icon="network_node" />
          )}
        </section>

        <section className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="grid gap-2 xl:grid-cols-[1fr_170px_210px_auto]">
            <label className="flex min-w-0 items-center gap-2">
              <span className="pointer-events-none flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]" aria-hidden="true">
                <span className="material-symbols-rounded block text-[22px] leading-none">search</span>
              </span>
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search name, company, role, email, notes..."
                aria-label="Search contacts"
                className="h-11 min-w-0 flex-1 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <select
              value={filterType}
              onChange={event => setFilterType(event.target.value as ContactType | 'all')}
              className="h-11 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="all">All types</option>
              {CONTACT_TYPE_KEYS.map(type => <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>)}
            </select>
            <select
              value={attentionFilter}
              onChange={event => setAttentionFilter(event.target.value as AttentionFilter)}
              className="h-11 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="all">All relationship states</option>
              <option value="attention">Needs attention</option>
              <option value="due">Follow-up due</option>
              <option value="first_touch">First touch needed</option>
              <option value="dormant">Dormant</option>
              <option value="linked">Linked to application</option>
            </select>
            <div className="flex rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1">
              {[
                { mode: 'command' as const, icon: 'bolt', label: 'Command' },
                { mode: 'grid' as const, icon: 'grid_view', label: 'Grid' },
                { mode: 'list' as const, icon: 'view_list', label: 'List' },
                { mode: 'company' as const, icon: 'account_tree', label: 'Company' },
              ].map(view => (
                <button
                  key={view.mode}
                  type="button"
                  aria-label={`${view.label} view`}
                  onClick={() => setViewMode(view.mode)}
                  className={`group relative grid h-11 w-11 place-items-center rounded-[10px] transition-colors ${viewMode === view.mode ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] elevation-card' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="material-symbols-rounded text-[18px]" aria-hidden="true">{view.icon}</span>
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--text-secondary)] opacity-0 elevation-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {view.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
          </>
        )}

        {loading ? (
          <NetworkSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : !user || !token ? (
          <SignedOutState />
        ) : contacts.length === 0 ? (
          <EmptyState
            mode="empty"
            onAdd={() => setShowAddPanel(true)}
            onAsk={() => dispatchSona('Help me create my first networking plan for this job search.', 'Network CRM')}
          />
        ) : filteredContacts.length === 0 ? (
          <EmptyState
            mode="filtered"
            onClear={() => { setSearchQuery(''); setFilterType('all'); setAttentionFilter('all'); }}
          />
        ) : viewMode === 'command' ? (
          <CommandView contacts={filteredContacts} attentionContacts={attentionContacts} onOpen={setSelectedContactId} />
        ) : viewMode === 'list' ? (
          <ListView contacts={filteredContacts} onOpen={setSelectedContactId} onDelete={deleteContact} />
        ) : viewMode === 'company' ? (
          <CompanyView contacts={filteredContacts} onOpen={setSelectedContactId} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredContacts.map(contact => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onOpen={setSelectedContactId}
                onDelete={deleteContact}
              />
            ))}
          </div>
        )}


      <ContactDrawer
        contact={selectedContact}
        applications={applications}
        saving={saving}
        closeRef={drawerCloseRef}
        onClose={() => setSelectedContactId(null)}
        onUpdate={updateContact}
        onDelete={deleteContact}
        onLogInteraction={logInteraction}
      />

      <AddContactPanel
        open={showAddPanel}
        form={addForm}
        applications={applications}
        saving={saving}
        onChange={setAddForm}
        onClose={() => setShowAddPanel(false)}
        onSubmit={createContact}
      />
    </SuiteToolShell>
  );
}

function TypeBadge({ type }: { type: ContactType }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.other;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold"
      style={tagChipStyle(config.tag)}
    >
      <span className="material-symbols-rounded text-[14px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function ContactIcon({ contact, size = 'sm' }: { contact: ContactInsight; size?: 'xs' | 'sm' | 'md' }) {
  const config = TYPE_CONFIG[contact.type] || TYPE_CONFIG.other;
  return <AnimatedToolIcon icon={config.icon} tone={config.tone} size={size} state={contact.needsAttention ? 'thinking' : 'idle'} />;
}

function StrengthMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Relationship strength ${value} of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className="h-2 flex-1 rounded-full"
          style={{ background: index < value ? 'var(--success)' : 'var(--bg-elevated)' }}
        />
      ))}
    </div>
  );
}

function ActionPill({ contact }: { contact: ContactInsight }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold"
      style={toneChipStyle(contact.nextAction.tone)}
    >
      <span className="material-symbols-rounded text-[14px]">{contact.nextAction.icon}</span>
      <span className="truncate">{contact.nextAction.label}</span>
    </span>
  );
}

function CommandView({
  contacts,
  attentionContacts,
  onOpen,
}: {
  contacts: ContactInsight[];
  attentionContacts: ContactInsight[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Today</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Needs attention</h2>
          </div>
          <button
            type="button"
            onClick={() => dispatchSona('Look at my network contacts that need attention and tell me what to handle first.', 'Network needs attention')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            <AssistantMark size="xs" state="idle" />
            Ask Taco
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {attentionContacts.length === 0 ? (
            <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">No urgent relationship work right now.</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Keep the network warm by logging recent conversations or adding follow-up dates.</p>
            </div>
          ) : attentionContacts.map(contact => (
            <AttentionRow key={contact.id} contact={contact} onOpen={onOpen} />
          ))}
        </div>
      </section>

      <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Network scan</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Recent contacts</h2>
          </div>
          <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]">{contacts.length} visible</span>
        </div>
        <div className="mt-4 space-y-2">
          {contacts.slice(0, 7).map(contact => (
            <button key={contact.id} type="button" onClick={() => onOpen(contact.id)} className="flex w-full items-center gap-3 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left hover:bg-[var(--bg-hover)]">
              <ContactIcon contact={contact} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{contact.name}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]">{contact.role || TYPE_CONFIG[contact.type].label}{contact.company ? ` at ${contact.company}` : ''}</p>
              </div>
              <div className="hidden w-24 sm:block">
                <StrengthMeter value={contact.relationshipStrength} />
              </div>
              <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">chevron_right</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AttentionRow({ contact, onOpen }: { contact: ContactInsight; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border" style={toneChipStyle(contact.nextAction.tone)}>
        <span className="material-symbols-rounded text-[20px]">{contact.nextAction.icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{contact.name}</p>
        <p className="truncate text-xs text-[var(--text-secondary)]">{contact.role || TYPE_CONFIG[contact.type].label}{contact.company ? ` at ${contact.company}` : ''}</p>
        <p className="mt-1 truncate text-xs font-medium" style={{ color: `var(${toneVar(contact.nextAction.tone)})` }}>{contact.nextAction.label}: {contact.nextAction.detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={() => onOpen(contact.id)} className="min-h-[44px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
          Open
        </button>
        <button
          type="button"
          onClick={() => dispatchSona(`What should I do next with ${contact.name}${contact.company ? ` at ${contact.company}` : ''}?`, contact.name)}
          className="min-h-[44px] rounded-[11px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Ask Taco
        </button>
      </div>
    </div>
  );
}

function ContactCard({
  contact,
  onOpen,
  onDelete,
}: {
  contact: ContactInsight;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <SuitePanel as="article">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(contact.id)} className="flex min-w-0 items-center gap-3 text-left">
          <ContactIcon contact={contact} />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-[var(--text-primary)]">{contact.name}</span>
            <span className="block truncate text-sm text-[var(--text-secondary)]">{contact.role || TYPE_CONFIG[contact.type].label}</span>
            {contact.company ? <span className="block truncate text-xs text-[var(--text-muted)]">{contact.company}</span> : null}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(contact.id)}
          aria-label={`Delete ${contact.name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--danger)]"
        >
          <span className="material-symbols-rounded text-[17px]">delete</span>
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={contact.type} />
          <ActionPill contact={contact} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Relationship strength</span>
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">{contact.relationshipStrength}/5</span>
          </div>
          <StrengthMeter value={contact.relationshipStrength} />
        </div>
        {contact.notes ? <p className="line-clamp-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs leading-5 text-[var(--text-secondary)]">{contact.notes}</p> : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
        <span>{contact.interactions?.length || 0} interactions</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => dispatchSona(`Draft a warm message to ${contact.name}${contact.company ? ` at ${contact.company}` : ''}.`, contact.name)} className="min-h-[44px] rounded-[10px] px-2 py-1 font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-dim)]">Ask Taco</button>
          <button type="button" onClick={() => onOpen(contact.id)} className="min-h-[44px] rounded-[10px] px-2 py-1 font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Details</button>
        </div>
      </div>
    </SuitePanel>
  );
}

function ListView({ contacts, onOpen, onDelete }: { contacts: ContactInsight[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="elevation-card overflow-x-auto rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <table className="w-full min-w-[980px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th className="p-4">Contact</th>
            <th className="p-4">Type</th>
            <th className="p-4">Next action</th>
            <th className="p-4">Strength</th>
            <th className="p-4">Follow-up</th>
            <th className="p-4">Linked app</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map(contact => (
            <tr key={contact.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)]">
              <td className="p-4">
                <button type="button" onClick={() => onOpen(contact.id)} className="flex min-h-[44px] min-w-0 items-center gap-3 py-1 text-left">
                  <ContactIcon contact={contact} size="xs" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{contact.name}</span>
                    <span className="block truncate text-xs text-[var(--text-secondary)]">{contact.role || 'Role not set'}{contact.company ? `, ${contact.company}` : ''}</span>
                  </span>
                </button>
              </td>
              <td className="p-4"><TypeBadge type={contact.type} /></td>
              <td className="p-4"><ActionPill contact={contact} /></td>
              <td className="p-4"><div className="w-28"><StrengthMeter value={contact.relationshipStrength} /></div></td>
              <td className="p-4 text-sm text-[var(--text-secondary)]">{formatDate(contact.followUpDate)}</td>
              <td className="p-4 text-sm text-[var(--text-secondary)]">{contact.linkedApplication ? contact.linkedApplication.company_name : 'None'}</td>
              <td className="p-4 text-right">
                <button type="button" onClick={() => onOpen(contact.id)} className="min-h-[44px] rounded-[10px] px-2 py-1 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">Open</button>
                <button type="button" onClick={() => onDelete(contact.id)} className="min-h-[44px] rounded-[10px] px-2 py-1 text-sm font-semibold text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompanyView({ contacts, onOpen }: { contacts: ContactInsight[]; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, ContactInsight[]>();
    contacts.forEach(contact => {
      const key = contact.company?.trim() || 'Independent contacts';
      map.set(key, [...(map.get(key) || []), contact]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [contacts]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(([company, group]) => (
        <section key={company} className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-[var(--text-primary)]">{company}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{group.length} contact{group.length === 1 ? '' : 's'}</p>
            </div>
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
              {group.filter(contact => contact.needsAttention).length} need attention
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {group.map(contact => (
              <button key={contact.id} type="button" onClick={() => onOpen(contact.id)} className="flex w-full items-center gap-3 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left hover:bg-[var(--bg-hover)]">
                <ContactIcon contact={contact} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{contact.name}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{contact.role || TYPE_CONFIG[contact.type].label}</p>
                </div>
                <ActionPill contact={contact} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ContactDrawer({
  contact,
  applications,
  saving,
  closeRef,
  onClose,
  onUpdate,
  onDelete,
  onLogInteraction,
}: {
  contact: ContactInsight | null;
  applications: JobApplication[];
  saving: boolean;
  closeRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<ContactFormState>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLogInteraction: (id: string, type: InteractionType, note: string, followUpDate: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ContactFormState>(EMPTY_FORM);
  const [interactionType, setInteractionType] = useState<InteractionType>('email');
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionFollowUp, setInteractionFollowUp] = useState('');

  useEffect(() => {
    if (!contact) return;
    setDraft(getContactForm(contact));
    setInteractionType('email');
    setInteractionNote('');
    setInteractionFollowUp('');
  }, [contact?.id]);

  if (!contact) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(getContactForm(contact));
  const sortedInteractions = [...(contact.interactions || [])].sort((a, b) => {
    return (normalizeDate(b.date)?.getTime() || 0) - (normalizeDate(a.date)?.getTime() || 0);
  });

  async function saveDraft() {
    await onUpdate(contact!.id, draft);
  }

  async function submitInteraction() {
    await onLogInteraction(contact!.id, interactionType, interactionNote, interactionFollowUp);
    setInteractionType('email');
    setInteractionNote('');
    setInteractionFollowUp('');
  }

  return (
    <AnimatePresence>
      {contact && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]" />
          <motion.aside
            role="dialog"
            aria-label={`${contact.name} contact details`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="elevation-raised fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4 md:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <ContactIcon contact={contact} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-[var(--text-primary)]">{contact.name}</h2>
                  <p className="truncate text-sm text-[var(--text-secondary)]">{contact.role || TYPE_CONFIG[contact.type].label}{contact.company ? ` at ${contact.company}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => dispatchSona(`Help me with this networking contact: ${contact.name}${contact.company ? ` at ${contact.company}` : ''}. What should I do next?`, contact.name)}
                  className="min-h-[44px] rounded-[11px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Ask Taco
                </button>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close contact details" className="grid h-11 w-11 place-items-center rounded-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-[20px]">close</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <div className="space-y-4">
                <DrawerSection title="Status and next action" icon={contact.nextAction.icon}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                      <ActionPill contact={contact} />
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{contact.nextAction.detail}</p>
                    </div>
                    <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">Strength</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{contact.relationshipStrength}/5</p>
                      <div className="mt-2"><StrengthMeter value={contact.relationshipStrength} /></div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Next follow-up
                      <input
                        type="date"
                        value={draft.followUpDate}
                        onChange={event => setDraft(prev => ({ ...prev, followUpDate: event.target.value }))}
                        className="mt-1 h-11 w-full rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Linked application
                      <select
                        value={draft.applicationId}
                        onChange={event => setDraft(prev => ({ ...prev, applicationId: event.target.value }))}
                        className="mt-1 h-11 w-full rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        <option value="">No linked application</option>
                        {applications.map(app => (
                          <option key={app.id} value={app.id}>{app.company_name}{app.job_title ? `, ${app.job_title}` : ''}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </DrawerSection>

                <DrawerSection title="Contact profile" icon="badge">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField label="Name" value={draft.name} onChange={value => setDraft(prev => ({ ...prev, name: value }))} />
                    <SelectField label="Type" value={draft.type} onChange={value => setDraft(prev => ({ ...prev, type: value as ContactType }))}>
                      {CONTACT_TYPE_KEYS.map(type => <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>)}
                    </SelectField>
                    <TextField label="Company" value={draft.company} onChange={value => setDraft(prev => ({ ...prev, company: value }))} />
                    <TextField label="Role" value={draft.role} onChange={value => setDraft(prev => ({ ...prev, role: value }))} />
                    <TextField label="Email" value={draft.email} onChange={value => setDraft(prev => ({ ...prev, email: value }))} />
                    <TextField label="Phone" value={draft.phone} onChange={value => setDraft(prev => ({ ...prev, phone: value }))} />
                    <div className="sm:col-span-2">
                      <TextField label="LinkedIn URL" value={draft.linkedin} onChange={value => setDraft(prev => ({ ...prev, linkedin: value }))} />
                    </div>
                  </div>
                  <label className="mt-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Notes
                    <textarea
                      value={draft.notes}
                      onChange={event => setDraft(prev => ({ ...prev, notes: event.target.value }))}
                      rows={4}
                      placeholder="Add context, relationship history, referral angle, or message notes."
                      className="mt-1 w-full resize-none rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  {dirty && (
                    <button type="button" onClick={saveDraft} disabled={saving || !draft.name.trim()} className="btn-primary mt-3 inline-flex min-h-[44px] items-center rounded-[11px] px-3 py-2 text-xs font-semibold disabled:opacity-50">
                      Save changes
                    </button>
                  )}
                </DrawerSection>

                <DrawerSection title="Log interaction" icon="add_comment">
                  <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                    <SelectField label="Type" value={interactionType} onChange={value => setInteractionType(value as InteractionType)}>
                      {Object.entries(INTERACTION_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </SelectField>
                    <TextField label="Optional next follow-up" type="date" value={interactionFollowUp} onChange={setInteractionFollowUp} />
                  </div>
                  <label className="mt-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    What happened?
                    <textarea
                      value={interactionNote}
                      onChange={event => setInteractionNote(event.target.value)}
                      rows={3}
                      placeholder="Reached out about the role, got a referral offer, scheduled a coffee chat..."
                      className="mt-1 w-full resize-none rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={submitInteraction} disabled={saving || !interactionNote.trim()} className="btn-primary inline-flex min-h-[44px] items-center rounded-[11px] px-3 py-2 text-xs font-semibold disabled:opacity-50">
                      Log interaction
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatchSona(`Draft a follow-up message to ${contact.name}${contact.company ? ` at ${contact.company}` : ''}. Use this context: ${interactionNote || contact.notes || contact.nextAction.detail}`, contact.name)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-[11px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
                    >
                      <AssistantMark size="xs" state="idle" />
                      Draft with Taco
                    </button>
                  </div>
                </DrawerSection>

                <DrawerSection title="Timeline" icon="timeline">
                  {sortedInteractions.length === 0 ? (
                    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
                      No interactions logged yet. Add the first touch so follow-ups have context.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedInteractions.map((interaction, index) => {
                        const config = getInteractionConfig(interaction.type);
                        return (
                          <div key={`${interaction.date}-${index}`} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                                <span className="material-symbols-rounded text-[15px]">{config.icon}</span>
                                {config.label}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">{formatDate(interaction.date)}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-[var(--text-secondary)]">{interaction.note || 'No note added.'}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </DrawerSection>

                <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
                  <button type="button" onClick={() => onDelete(contact.id)} disabled={saving} className="inline-flex min-h-[44px] items-center rounded-[11px] border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={dangerChipStyle}>
                    Delete contact
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function AddContactPanel({
  open,
  form,
  applications,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: ContactFormState;
  applications: JobApplication[];
  saving: boolean;
  onChange: (form: ContactFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]" />
          <motion.aside
            role="dialog"
            aria-label="Add network contact"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="elevation-raised fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4 md:p-5">
              <div className="flex items-center gap-3">
                <AnimatedToolIcon icon="person_add" tone="emerald" size="xs" />
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Add contact</h2>
                  <p className="text-sm text-[var(--text-secondary)]">Capture the person, context, and next follow-up.</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close add contact" className="grid h-11 w-11 place-items-center rounded-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextField label="Name" value={form.name} onChange={value => onChange({ ...form, name: value })} />
                  <SelectField label="Type" value={form.type} onChange={value => onChange({ ...form, type: value as ContactType })}>
                    {CONTACT_TYPE_KEYS.map(type => <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>)}
                  </SelectField>
                  <TextField label="Company" value={form.company} onChange={value => onChange({ ...form, company: value })} />
                  <TextField label="Role" value={form.role} onChange={value => onChange({ ...form, role: value })} />
                  <TextField label="Email" value={form.email} onChange={value => onChange({ ...form, email: value })} />
                  <TextField label="Phone" value={form.phone} onChange={value => onChange({ ...form, phone: value })} />
                  <div className="sm:col-span-2">
                    <TextField label="LinkedIn URL" value={form.linkedin} onChange={value => onChange({ ...form, linkedin: value })} />
                  </div>
                  <TextField label="Next follow-up" type="date" value={form.followUpDate} onChange={value => onChange({ ...form, followUpDate: value })} />
                  <SelectField label="Linked application" value={form.applicationId} onChange={value => onChange({ ...form, applicationId: value })}>
                    <option value="">No linked application</option>
                    {applications.map(app => <option key={app.id} value={app.id}>{app.company_name}{app.job_title ? `, ${app.job_title}` : ''}</option>)}
                  </SelectField>
                </div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={event => onChange({ ...form, notes: event.target.value })}
                    rows={4}
                    placeholder="How did you meet? What should future-you remember?"
                    className="mt-1 w-full resize-none rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] p-4 md:p-5">
              <button type="button" onClick={onClose} className="btn-secondary inline-flex min-h-[44px] items-center rounded-[12px] px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button type="button" onClick={onSubmit} disabled={saving || !form.name.trim()} className="btn-primary inline-flex min-h-[44px] items-center rounded-[12px] px-4 py-2 text-sm font-semibold disabled:opacity-50">
                Add contact
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerSection({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <span className="material-symbols-rounded text-[17px]">{icon}</span>
        </span>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-[var(--text-secondary)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-[var(--text-secondary)]">
      {label}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {children}
      </select>
    </label>
  );
}

function NetworkSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading contacts">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-[18px] bg-[var(--bg-elevated)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-[var(--bg-elevated)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)]" />
            </div>
          </div>
          <div className="mt-5 h-24 rounded-[14px] bg-[var(--bg-elevated)]" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section
      className="elevation-card rounded-[22px] border px-5 py-10 text-center"
      style={{ borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}
    >
      <div
        className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border text-[var(--danger)]"
        style={{ borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)' }}
      >
        <span className="material-symbols-rounded text-[30px]">error</span>
      </div>
      <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">Network CRM could not load</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
      <button type="button" onClick={onRetry} className="btn-secondary mt-5 inline-flex min-h-[44px] items-center rounded-[12px] px-4 py-2 text-sm font-semibold">
        Try again
      </button>
    </section>
  );
}

function SignedOutState() {
  return (
    <SuiteEmptyState
      icon="lock"
      title="Sign in to use Network CRM"
      description="Your contacts, follow-ups, and interaction history are saved to your private workspace."
    />
  );
}

function EmptyState({
  mode,
  onAdd,
  onAsk,
  onClear,
}: {
  mode: 'empty' | 'filtered';
  onAdd?: () => void;
  onAsk?: () => void;
  onClear?: () => void;
}) {
  return (
    <SuiteEmptyState
      icon={mode === 'empty' ? 'person_add' : 'filter_alt_off'}
      title={mode === 'empty' ? 'Start with the next useful person' : 'No contacts match these filters'}
      description={
        mode === 'empty'
          ? 'Add recruiters, referrals, hiring managers, and peers. Then set the next follow-up so the network keeps moving.'
          : 'Clear the filters or search for a different contact, company, role, email, or note.'
      }
      action={
        mode === 'empty' ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onAdd} className="btn-primary inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-4 py-2 text-sm font-semibold">
              <span className="material-symbols-rounded text-[18px]">person_add</span>
              Add first contact
            </button>
            <button type="button" onClick={onAsk} className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--accent)] bg-[var(--accent-dim)] px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]">
              <AssistantMark size="xs" state="idle" />
              Ask Taco
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClear} className="btn-secondary inline-flex min-h-[44px] items-center rounded-[12px] px-4 py-2 text-sm font-semibold">
            Clear filters
          </button>
        )
      }
    />
  );
}
