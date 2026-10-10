'use client';

import PageHelp from '@/components/PageHelp';
import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep, trapWorkflowTab } from '@/lib/tool-story-adapters';

import { TacoName, TacoText } from '@/components/BrandLogo';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import QueueContent from '@/app/suite/agent/queue/QueueContent';
import ManualApplicationForm from '@/components/suite/ManualApplicationForm';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import {
  deleteJobApplication,
  getAllStudyProgress,
  getJobApplications,
  getResumeVersions,
  reportApplicationOutcome,
  updateApplicationOffer,
  updateApplicationNotes,
  updateApplicationStatus,
  type JobApplication,
  type NegotiationBrief,
  type OfferDetails,
  type ResumeVersion,
  type StudyProgress,
} from '@/lib/database-suite';
import { authFetch } from '@/lib/auth-fetch';
import { downloadResumePDF } from '@/lib/pdf-templates';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getPersistedResumePaletteColors,
  getPersistedResumeDesign,
  getPersistedResumeTemplateId,
  isResumeTemplateSelectionEntitled,
} from '@/lib/resume-templates';
import { normalizeResume } from '@/lib/resume-normalizer';
import { useStore } from '@/lib/store';
import { useUserTier } from '@/hooks/use-user-tier';
import { MobileStickyActionBar } from '@/components/mobile/MobileWorkbench';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { AssistantMark } from '@/components/assistant';
import { SuitePanel, SuiteToolHeader, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { showToast } from '@/components/Toast';
import ApplicationsContext from '@/components/workspace/ApplicationsContext';
import PacketResumeDocument from '@/components/workspace/PacketResumeDocument';
import { offerInputSignature } from '@/lib/application-commands';
import { createApplicationsLifecycleGuard } from '@/lib/applications-lifecycle';

type ViewMode = 'command' | 'grid' | 'kanban' | 'list';
type OutcomeFilter = 'all' | 'pending' | 'reported' | 'positive' | 'negative';
type AttentionKind = 'offer' | 'outcome' | 'followup' | 'prep' | 'apply';
type InboxDrawerAction = 'offer' | 'outcome' | 'followup' | 'application';
type SkillBridgeSummary = {
  percent: number | null;
  skills: StudyProgress[];
  completedDays: number;
  totalDays: number;
  readinessScore: number | null;
  statusLabel: string;
  nextAction: string;
};

const OUTCOME_KEYS = ['callback', 'interview', 'offer', 'rejection', 'ghosted'] as const;
const STATUS_KEYS = [
  'not_applied',
  'applied',
  'screening',
  'interview_scheduled',
  'interviewed',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const satisfies JobApplication['status'][];

const OUTCOME_CONFIG: Record<NonNullable<JobApplication['outcome_response']>, { icon: string; label: string; color: string }> = {
  callback: { icon: 'call', label: 'Callback', color: 'var(--warning)' },
  interview: { icon: 'groups', label: 'Interview', color: 'var(--warning)' },
  offer: { icon: 'celebration', label: 'Offer', color: 'var(--success)' },
  rejection: { icon: 'cancel', label: 'Rejected', color: 'var(--danger)' },
  ghosted: { icon: 'visibility_off', label: 'Ghosted', color: 'var(--text-muted)' },
};

const OUTCOME_STATUS_MAP: Partial<Record<NonNullable<JobApplication['outcome_response']>, JobApplication['status']>> = {
  callback: 'screening',
  interview: 'interview_scheduled',
  offer: 'offer',
  rejection: 'rejected',
};

const STATUS_CONFIG: Record<JobApplication['status'], { icon: string; label: string; color: string; order: number }> = {
  not_applied: { icon: 'edit_document', label: 'Draft', color: 'var(--text-muted)', order: 0 },
  applied: { icon: 'send', label: 'Applied', color: 'var(--warning)', order: 1 },
  screening: { icon: 'visibility', label: 'Screening', color: 'var(--warning)', order: 2 },
  interview_scheduled: { icon: 'calendar_month', label: 'Interview Scheduled', color: 'var(--warning)', order: 3 },
  interviewed: { icon: 'mic', label: 'Interviewed', color: 'var(--warning)', order: 4 },
  offer: { icon: 'celebration', label: 'Offer Received', color: 'var(--success)', order: 5 },
  accepted: { icon: 'check_circle', label: 'Accepted', color: 'var(--success)', order: 6 },
  rejected: { icon: 'cancel', label: 'Rejected', color: 'var(--danger)', order: 7 },
  withdrawn: { icon: 'undo', label: 'Withdrawn', color: 'var(--text-muted)', order: 8 },
};

const TERMINAL_STATUSES: JobApplication['status'][] = ['rejected', 'withdrawn', 'accepted'];

function availableOutcomeUpdates(app: JobApplication) {
  if (TERMINAL_STATUSES.includes(app.status) || app.outcome_response === 'offer' || app.outcome_response === 'ghosted') return [];
  if (app.outcome_response === 'interview') return OUTCOME_KEYS.filter(outcome => ['offer', 'rejection', 'ghosted'].includes(outcome));
  if (app.outcome_response === 'callback') return OUTCOME_KEYS.filter(outcome => ['interview', 'offer', 'rejection', 'ghosted'].includes(outcome));
  if (app.outcome_response === 'rejection') return [];
  return [...OUTCOME_KEYS];
}

function nextStatusForOutcome(app: JobApplication, outcome: NonNullable<JobApplication['outcome_response']>) {
  const target = OUTCOME_STATUS_MAP[outcome];
  if (!target) return app.status;
  if (outcome === 'rejection') return target;
  return STATUS_CONFIG[target].order > STATUS_CONFIG[app.status].order ? target : app.status;
}

// Token-safe tint. The colours are now CSS variables (var(--success), …), so an
// alpha suffix on a hex string no longer works — mix the token with transparent
// instead. `alpha` is still the old two-digit hex-of-255 so every call site keeps
// its intended weight (14→8%, 28→16%, 30→19%, 45→27%).
function soft(color: string, alpha = '14') {
  const pct = Math.round((parseInt(alpha, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function daysSince(date?: string) {
  if (!date) return 0;
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

function formatDate(date?: string) {
  if (!date) return 'Not set';
  const time = new Date(date);
  if (Number.isNaN(time.getTime())) return 'Not set';
  return time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateForInput(date?: string | null) {
  if (!date) return '';
  const isoDate = date.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const time = new Date(date);
  if (Number.isNaN(time.getTime())) return '';
  return time.toISOString().slice(0, 10);
}

function formatReadinessStatus(status?: StudyProgress['readiness_status']) {
  if (status === 'ready_to_verify') return 'Ready to verify';
  if (status === 'verified') return 'Verified';
  if (status === 'review_due') return 'Review due';
  return 'Learning';
}

function buildSkillBridgeSummary(progresses: StudyProgress[]): SkillBridgeSummary {
  const completedDays = progresses.reduce((sum, progress) => sum + (progress.completed_days?.length || 0), 0);
  const totalDays = progresses.reduce((sum, progress) => sum + (progress.total_days || 0), 0);
  const readinessScores = progresses
    .map(progress => progress.readiness_score)
    .filter((score): score is number => typeof score === 'number');
  const readinessScore = readinessScores.length
    ? Math.round(readinessScores.reduce((sum, score) => sum + score, 0) / readinessScores.length)
    : null;
  const percent = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : null;
  const primary = [...progresses].sort((a, b) => {
    const aScore = a.readiness_score ?? 0;
    const bScore = b.readiness_score ?? 0;
    return aScore - bScore || new Date(b.last_activity_at || b.started_at).getTime() - new Date(a.last_activity_at || a.started_at).getTime();
  })[0];
  const needsVerification = progresses.some(progress => progress.readiness_status === 'ready_to_verify' || progress.readiness_status === 'review_due');

  return {
    percent,
    skills: progresses,
    completedDays,
    totalDays,
    readinessScore,
    statusLabel: primary ? formatReadinessStatus(primary.readiness_status) : 'No plan linked',
    nextAction: needsVerification
      ? 'Verify the strongest skill evidence before the next interview.'
      : primary
        ? `Continue ${primary.skill}.`
        : 'Link a study plan to this application.',
  };
}

function canFollowUp(app: JobApplication) {
  if (app.status !== 'applied') return false;
  return daysSince(app.applied_at || app.created_at) >= 5;
}

function needsOutcome(app: JobApplication) {
  if (app.outcome_response || app.status !== 'applied') return false;
  return daysSince(app.applied_at || app.created_at) >= 7;
}

function needsPrep(app: JobApplication) {
  return app.status === 'interview_scheduled' || app.status === 'interviewed';
}

function isOfferStage(app: JobApplication) {
  return app.status === 'offer' || app.outcome_response === 'offer' || Boolean(app.offer_details);
}

function isNegotiationFinal(app: JobApplication) {
  return app.status === 'accepted' || app.negotiation_status === 'accepted' || app.negotiation_status === 'declined';
}

function needsOfferReview(app: JobApplication) {
  return isOfferStage(app) && !isNegotiationFinal(app);
}

function isApplicationDraft(app: JobApplication) {
  return app.status === 'not_applied';
}

function getActivityDateLabel(app: JobApplication) {
  if (isApplicationDraft(app)) return `Drafted ${formatDate(app.created_at)}`;
  if (app.applied_at) return `Applied ${formatDate(app.applied_at)}`;
  return `Created ${formatDate(app.created_at)}`;
}

function getOfferAction(app: JobApplication) {
  if (!app.offer_details?.base && !app.offer_details?.total) return { label: 'Capture offer', detail: 'Add compensation details', icon: 'payments' };
  if (!app.negotiation_brief) return { label: 'Prepare counter', detail: 'Generate a negotiation brief', icon: 'handshake' };
  return { label: 'Record decision', detail: 'Review script or close the loop', icon: 'fact_check' };
}

// Counts how many of five preparation signals are present on an application.
// This is a checklist-completeness signal, NOT a measured quality score, and must
// never be rendered as a 1-5 star rating. No floor: zero signals present reads as 0.
function countPrepSignals(app: JobApplication): number {
  let score = 0;
  if (app.resume_version_id) score += 1;
  if (app.talent_density_score) score += 1;
  if ((app.talent_density_score || 0) >= 70) score += 1;
  if (app.status !== 'not_applied') score += 1;
  if (app.notes && app.notes.length > 10) score += 1;
  return Math.min(5, score);
}

function getDossierCompletion(app: JobApplication) {
  const checks = [
    Boolean(app.company_name),
    Boolean(app.job_title),
    Boolean(app.job_description),
    Boolean(app.resume_version_id),
    Boolean(app.application_link),
    Boolean(app.notes && app.notes.length > 10),
    Boolean(app.outcome_response || TERMINAL_STATUSES.includes(app.status)),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function getWorkspaceAction(app: JobApplication) {
  if (needsOfferReview(app)) {
    const offer = getOfferAction(app);
    return { ...offer, tone: 'var(--success)', kind: 'Offer review' };
  }
  if (needsOutcome(app)) {
    return { label: 'Log outcome', detail: `${daysSince(app.applied_at || app.created_at)} days since applied`, icon: 'fact_check', tone: 'var(--warning)', kind: 'Outcome' };
  }
  if (canFollowUp(app)) {
    return { label: 'Draft follow-up', detail: `${daysSince(app.applied_at || app.created_at)} days since applied`, icon: 'forward_to_inbox', tone: 'var(--warning)', kind: 'Follow-up' };
  }
  if (needsPrep(app)) {
    return { label: 'Prepare interview', detail: app.interview_date ? formatDate(app.interview_date) : 'Interview stage', icon: 'psychology', tone: 'var(--accent)', kind: 'Interview prep' };
  }
  if (app.status === 'not_applied') {
    return { label: 'Submit manually', detail: 'Open the posting, submit yourself, then mark applied', icon: 'open_in_new', tone: 'var(--accent)', kind: 'Application packet' };
  }
  return { label: 'Keep tracking', detail: app.outcome_response ? OUTCOME_CONFIG[app.outcome_response].label : STATUS_CONFIG[app.status].label, icon: 'route', tone: 'var(--accent)', kind: 'Tracker' };
}

function dispatchSona(prompt: string, contextLabel?: string) {
  window.dispatchEvent(new CustomEvent('assistant:open', { detail: { prompt, contextLabel } }));
}

function ApplicationsWorkspace() {
  const user = useStore(state => state.user);
  const { isPro, loading: tierLoading } = useUserTier();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [allProgress, setAllProgress] = useState<StudyProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('command');
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [linkedResume, setLinkedResume] = useState<ResumeVersion | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState<{ subject: string; body: string; timing: string; daysSinceApplied: number } | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepData, setPrepData] = useState<{ questions: any[]; questionsToAsk: any[]; prepNotes: string } | null>(null);
  const [showPrepCard, setShowPrepCard] = useState(false);
  const [drawerActionError, setDrawerActionError] = useState<string | null>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [requestedOutcomeConfirmation, setRequestedOutcomeConfirmation] = useState<NonNullable<JobApplication['outcome_response']> | null>(null);
  const [inboxDrawerAction, setInboxDrawerAction] = useState<InboxDrawerAction | null>(null);
  const handledOutcomeLinkRef = useRef(false);
  const handledApplicationLinkRef = useRef(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRequestRef = useRef(0);
  const applicationLoadRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const lifecycleRef = useRef(createApplicationsLifecycleGuard());
  const ownerRef = useRef<string | null | undefined>(undefined);

  const selectedActionRef = useRef(selectedApp?.id);
  selectedActionRef.current = selectedApp?.id;
  const notesRevisionRef = useRef(0);
  const offerRevisionRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const actionSerials = useRef(new Map<string, number>());
  function captureAction(appId: string, action: string) {
    const owner = user?.uid;
    const selected = selectedActionRef.current;
    const drawerEpoch = drawerRequestRef.current;
    const inputEpoch = action === 'notes' ? notesRevisionRef.current : action.startsWith('offer') ? offerRevisionRef.current : 0;
    const key = `${appId}:${action}`; const serial = (actionSerials.current.get(key) || 0) + 1;
    actionSerials.current.set(key, serial);
    return () => mountedRef.current && useStore.getState().user?.uid === owner
      && drawerRequestRef.current === drawerEpoch && selectedActionRef.current === selected && actionSerials.current.get(key) === serial
      && inputEpoch === (action === 'notes' ? notesRevisionRef.current : action.startsWith('offer') ? offerRevisionRef.current : 0);
  }
  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = lifecycleRef.current;
    lifecycle.setup(useStore.getState().user?.uid || null);
    return () => {
      mountedRef.current = false;
      lifecycle.cleanup();
      drawerRequestRef.current += 1;
      applicationLoadRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const mobileView = params.get('mobileView');
    if (status && STATUS_KEYS.includes(status as JobApplication['status'])) {
      setStatusFilter(status);
      setViewMode(status === 'offer' ? 'command' : 'grid');
    } else if (mobileView === 'followups') {
      setViewMode('command');
      setOutcomeFilter('pending');
    }
  }, []);

  useEffect(() => {
    lifecycleRef.current.begin(user?.uid || null);
    const ownerChanged = ownerRef.current !== undefined && ownerRef.current !== (user?.uid || null);
    ownerRef.current = user?.uid || null;
    if (ownerChanged) {
      drawerRequestRef.current += 1;
      handledApplicationLinkRef.current = false;
      setSelectedApp(null);
      setLinkedResume(null);
      setResumeLoading(false);
      setApplications([]);
      setAllProgress([]);
      setLoadError(null);
    }
    if (!user) {
      applicationLoadRequestRef.current += 1;
      drawerRequestRef.current += 1;
      handledApplicationLinkRef.current = false;
      setSelectedApp(null);
      setLinkedResume(null);
      setResumeLoading(false);
      setApplications([]);
      setAllProgress([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    loadApplications();
  }, [user]);

  useEffect(() => {
    if (!selectedApp) return;
    drawerCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedApp?.id]);

  async function loadApplications() {
    const requestId = ++applicationLoadRequestRef.current;
    const userId = user?.uid;
    const lifecycleToken = lifecycleRef.current.begin(userId || null);
    setIsLoading(true);
    setLoadError(null);
    try {
      const [appResult, progressResult] = await Promise.all([getJobApplications(), getAllStudyProgress()]);
      if (!lifecycleRef.current.isCurrent(lifecycleToken, useStore.getState().user?.uid || null) || requestId !== applicationLoadRequestRef.current) return;
      if (!appResult.success) {
        setLoadError((appResult as any).error || 'Applications could not be loaded.');
        return;
      }
      setApplications(appResult.data || []);
      if (progressResult.success && progressResult.data) setAllProgress(progressResult.data);
    } catch (error: any) {
      if (!lifecycleRef.current.isCurrent(lifecycleToken, useStore.getState().user?.uid || null) || requestId !== applicationLoadRequestRef.current) return;
      setLoadError(error?.message || 'Applications could not be loaded.');
    } finally {
      if (lifecycleRef.current.isCurrent(lifecycleToken, useStore.getState().user?.uid || null) && requestId === applicationLoadRequestRef.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!user || isLoading || handledOutcomeLinkRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get('outcome');
    const outcome = params.get('result') as NonNullable<JobApplication['outcome_response']> | null;
    if (!applicationId || !outcome) return;

    handledOutcomeLinkRef.current = true;
    const cleanOutcomeParams = () => {
      params.delete('outcome');
      params.delete('result');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    };

    const targetApp = applications.find(app => app.id === applicationId);
    if (!OUTCOME_KEYS.includes(outcome)) {
      showToast('That outcome link is invalid', 'cancel');
      cleanOutcomeParams();
      return;
    }
    if (!targetApp) {
      showToast('Application not found', 'cancel');
      cleanOutcomeParams();
      return;
    }
    if (isApplicationDraft(targetApp)) {
      showToast('Mark applied before logging an outcome', 'cancel');
      cleanOutcomeParams();
      return;
    }
    if (targetApp.outcome_response === outcome) {
      showToast('That outcome is already logged', 'check_circle');
      cleanOutcomeParams();
      return;
    }
    if (!availableOutcomeUpdates(targetApp).includes(outcome)) {
      showToast('That outcome cannot follow the current application stage', 'cancel');
      cleanOutcomeParams();
      return;
    }

    openDrawer(targetApp);
    setInboxDrawerAction('outcome');
    setRequestedOutcomeConfirmation(outcome);
    showToast(`Review and confirm: ${OUTCOME_CONFIG[outcome].label}`, 'fact_check');
    cleanOutcomeParams();
  }, [applications, isLoading, user]);

  useEffect(() => {
    if (!user || isLoading || handledApplicationLinkRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get('application');
    const requestedAction = params.get('action');
    if (!applicationId) return;

    handledApplicationLinkRef.current = true;
    const targetApp = applicationId.length <= 200
      ? applications.find(app => app.id === applicationId)
      : null;
    if (!targetApp) {
      showToast('That application is no longer available', 'cancel');
      params.delete('application');
      params.delete('action');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      return;
    }

    setInboxDrawerAction(
      requestedAction && ['offer', 'outcome', 'followup', 'application'].includes(requestedAction)
        ? requestedAction as InboxDrawerAction
        : 'application',
    );
    void openDrawer(targetApp);
  }, [applications, isLoading, user]);

  function updateLocalApplication(id: string, patch: Partial<JobApplication>) {
    setApplications(prev => prev.map(app => (app.id === id ? { ...app, ...patch } : app)));
    setSelectedApp(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  function getApplicationProgress(appId: string) {
    const appProgresses = allProgress.filter(progress => progress.application_ids?.includes(appId));
    if (appProgresses.length === 0) return null;
    const totals = appProgresses.reduce(
      (acc, progress) => {
        acc.done += progress.completed_days.length;
        acc.possible += progress.total_days || 0;
        return acc;
      },
      { done: 0, possible: 0 },
    );
    if (totals.possible === 0) return 0;
    return Math.round((totals.done / totals.possible) * 100);
  }

  function getApplicationSkillSummary(appId: string) {
    const appProgresses = allProgress.filter(progress => progress.application_ids?.includes(appId));
    return buildSkillBridgeSummary(appProgresses);
  }

  async function handleStatusUpdate(app: JobApplication, newStatus: JobApplication['status']) {
    if (newStatus === 'applied' && isApplicationDraft(app)) {
      const confirmed = window.confirm('Mark this as applied only after you submitted it on the job site. TalentConsulting.io has not submitted it for you.');
      if (!confirmed) return;
    }
    const additionalData: { appliedAt?: Date } = {};
    if (newStatus === 'applied' && !app.applied_at) additionalData.appliedAt = new Date();
    const current = captureAction(app.id, 'status');
    const result = await updateApplicationStatus(app.id, newStatus, additionalData);
    if (!current()) return;
    if (!result.success) {
      showToast('Failed to update status', 'cancel');
      return;
    }
    updateLocalApplication(app.id, result.data || { status: newStatus, last_updated: new Date().toISOString() });
    showToast(
      newStatus === 'applied'
        ? 'Marked applied. TalentConsulting.io did not submit it for you.'
        : `Status updated to ${STATUS_CONFIG[newStatus].label}`,
      'check_circle',
    );
  }

  async function handleNotesUpdate() {
    if (!selectedApp) return;
    const current = captureAction(selectedApp.id, 'notes');
    const result = await updateApplicationNotes(selectedApp.id, editingNotes);
    if (!current()) return;
    if (!result.success) {
      showToast('Failed to save notes', 'cancel');
      return;
    }
    updateLocalApplication(selectedApp.id, { notes: editingNotes, last_updated: new Date().toISOString() });
    showToast('Notes saved', 'edit_document');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this application? This cannot be undone.')) return;
    const current = captureAction(id, 'delete');
    const result = await deleteJobApplication(id);
    if (!current()) return;
    if (!result.success) {
      showToast('Application delete failed', 'cancel');
      return;
    }
    setApplications(prev => prev.filter(app => app.id !== id));
    if (selectedApp?.id === id) closeDrawer();
    showToast('Application deleted', 'delete');
  }

  async function openDrawer(app: JobApplication) {
    if (!selectedApp) returnFocusRef.current = document.activeElement as HTMLElement | null;
    const requestId = ++drawerRequestRef.current;
    setResumeLoading(false); setFollowUpLoading(false); setFollowUpDraft(null); setShowFollowUpModal(false); setPrepLoading(false); setOutcomeLoading(false);
    const userId = user?.uid;
    setSelectedApp(app);
    setEditingNotes(app.notes || '');
    setLinkedResume(null);
    setShowResumePreview(false);
    setPrepData(null);
    setShowPrepCard(false);
    setDrawerActionError(null);
    setRequestedOutcomeConfirmation(null);

    if (!app.resume_version_id) return;
    setResumeLoading(true);
    let versions;
    try { versions = await getResumeVersions(); } catch { if (mountedRef.current && requestId === drawerRequestRef.current) { setResumeLoading(false); setDrawerActionError('Linked resume could not be loaded. Reopen this application to retry.'); } return; }
    if (!mountedRef.current || requestId !== drawerRequestRef.current || useStore.getState().user?.uid !== userId) return;
    if (!versions.success) setDrawerActionError('Linked resume could not be loaded. Reopen this application to retry.');
    if (versions.success && versions.data) {
      setLinkedResume(versions.data.find(version => version.id === app.resume_version_id) || null);
    }
    if (mountedRef.current && requestId === drawerRequestRef.current) setResumeLoading(false);
  }

  function closeDrawer() {
    drawerRequestRef.current += 1;
    setFollowUpLoading(false); setFollowUpDraft(null); setShowFollowUpModal(false); setPrepLoading(false); setOutcomeLoading(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.isConnected && returnFocusRef.current.focus());
    handledApplicationLinkRef.current = false;
    setResumeLoading(false);
    setSelectedApp(null);
    setLinkedResume(null);
    setShowResumePreview(false);
    setPrepData(null);
    setShowPrepCard(false);
    setDrawerActionError(null);
    setInboxDrawerAction(null);
    setRequestedOutcomeConfirmation(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('application');
    params.delete('action');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  async function handleDownloadPDF() {
    if (!linkedResume?.content) return;
    if (!selectedApp?.resume_version_id || selectedApp.resume_version_id !== linkedResume.id) {
      showToast('The linked resume changed. Reopen this application before exporting.', 'cancel');
      return;
    }
    const templateId = getPersistedResumeTemplateId(linkedResume);
    if (tierLoading) {
      showToast('Your plan access is still loading. Try again in a moment.', 'hourglass_top');
      return;
    }
    if (!isResumeTemplateSelectionEntitled(templateId, isPro)) {
      showToast('This linked resume uses a Standard template. Upgrade or choose a free template in Resume Studio.', 'workspace_premium');
      return;
    }
    setDownloading(true);
    try {
      const colors = getPersistedResumePaletteColors(linkedResume);
      const design = getPersistedResumeDesign(linkedResume, normalizeResume(linkedResume.content));
      await downloadResumePDF(linkedResume.content as any, colors, undefined, templateId, undefined, design?.pageSize || 'A4', design || undefined);
      showToast('PDF downloaded', 'check_circle');
    } catch (error: unknown) {
      showToast(`PDF failed: ${error instanceof Error ? error.message : 'Download failed'}`, 'cancel');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadWord() {
    if (!linkedResume?.content) return;
    if (!selectedApp?.resume_version_id || selectedApp.resume_version_id !== linkedResume.id) {
      showToast('The linked resume changed. Reopen this application before exporting.', 'cancel');
      return;
    }
    const resume = linkedResume.content as any;
    const templateId = getPersistedResumeTemplateId(linkedResume);
    if (tierLoading) {
      showToast('Your plan access is still loading. Try again in a moment.', 'hourglass_top');
      return;
    }
    if (!isResumeTemplateSelectionEntitled(templateId, isPro)) {
      showToast('This linked resume uses a Standard template. Upgrade or choose a free template in Resume Studio.', 'workspace_premium');
      return;
    }
    setDownloading(true);
    try {
      const design = getPersistedResumeDesign(linkedResume, normalizeResume(resume));
      if (design) {
        const { buildResumeDesignDocxBlob } = await import('@/lib/resume-design/docx');
        const blob = await buildResumeDesignDocxBlob(normalizeResume(resume), design);
        saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
        showToast('Editable Word companion downloaded', 'check_circle');
        setDownloading(false);
        return;
      }
      if (NEW_SIGNATURE_TEMPLATE_IDS.includes(templateId as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number])) {
        const { buildCuratedSignatureDocxBlob } = await import('@/lib/resume-signature-docx');
        const blob = await buildCuratedSignatureDocxBlob(
          normalizeResume(resume),
          templateId,
          getPersistedResumePaletteColors(linkedResume),
        );
        saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
        showToast('Linear Word companion downloaded', 'check_circle');
        setDownloading(false);
        return;
      }
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ children: [new TextRun({ text: resume.name || '', bold: true, size: 48 })] }),
            new Paragraph({ children: [new TextRun({ text: resume.title || '', size: 28, color: '666666' })] }),
            new Paragraph({ children: [new TextRun({ text: [resume.email, resume.phone, resume.location].filter(Boolean).join(' | '), size: 20 })] }),
            new Paragraph({ text: '' }),
            ...(resume.summary ? [
              new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: resume.summary }),
              new Paragraph({ text: '' }),
            ] : []),
            ...(resume.experience?.length ? [
              new Paragraph({ text: 'EXPERIENCE', heading: HeadingLevel.HEADING_2 }),
              ...resume.experience.flatMap((exp: any) => [
                new Paragraph({ children: [new TextRun({ text: `${exp.role} at ${exp.company}`, bold: true }), new TextRun({ text: ` (${exp.duration})`, italics: true })] }),
                ...(exp.achievements || []).map((item: string) => new Paragraph({ text: `- ${item}`, indent: { left: 360 } })),
                new Paragraph({ text: '' }),
              ]),
            ] : []),
            ...(resume.education?.length ? [
              new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_2 }),
              ...resume.education.map((edu: any) => new Paragraph({ text: `${edu.degree} - ${edu.institution} (${edu.year})` })),
              new Paragraph({ text: '' }),
            ] : []),
            ...(resume.skills?.length ? [
              new Paragraph({ text: 'SKILLS', heading: HeadingLevel.HEADING_2 }),
              ...resume.skills.map((cat: any) => new Paragraph({ text: `${cat.category}: ${cat.items.join(', ')}` })),
            ] : []),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
      showToast('Word document downloaded', 'check_circle');
    } catch {
      showToast('Download failed', 'cancel');
    }
    setDownloading(false);
  }

  async function handleFollowUp(appId: string) {
    const current = captureAction(appId, 'followup');
    setFollowUpLoading(true);
    setDrawerActionError(null);
    try {
      const res = await authFetch('/api/agent/follow-up', {
        method: 'POST',
        body: JSON.stringify({ applicationId: appId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!current()) return;
      if (!res.ok || !data.success) {
        const message = data.error || 'Failed to draft follow-up';
        setDrawerActionError(message);
        showToast(message, 'cancel');
        return;
      }
      setFollowUpDraft(data);
      setShowFollowUpModal(true);
    } catch {
      if (!current()) return;
      const message = 'Failed to generate follow-up';
      setDrawerActionError(message);
      showToast(message, 'cancel');
    } finally {
      if (current()) setFollowUpLoading(false);
    }
  }

  async function handleInterviewPrep(app: JobApplication) {
    const current = captureAction(app.id, 'prep');
    setPrepLoading(true);
    setDrawerActionError(null);
    try {
      const res = await authFetch('/api/agent/interview-prep', {
        method: 'POST',
        body: JSON.stringify({ applicationId: app.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!current()) return;
      if (!res.ok || !data.success) {
        const message = data.error || 'Failed to generate prep';
        setDrawerActionError(message);
        showToast(message, 'cancel');
        return;
      }
      setPrepData(data);
      setShowPrepCard(true);
    } catch {
      if (!current()) return;
      const message = 'Failed to load interview prep';
      setDrawerActionError(message);
      showToast(message, 'cancel');
    } finally {
      if (current()) setPrepLoading(false);
    }
  }

  async function handleOutcome(outcome: NonNullable<JobApplication['outcome_response']>) {
    if (!selectedApp) return;
    if (isApplicationDraft(selectedApp)) {
      showToast('Mark applied before logging an outcome', 'cancel');
      return;
    }
    const current = captureAction(selectedApp.id, 'outcome');
    setOutcomeLoading(true);
    setDrawerActionError(null);
    try {
      const result = await reportApplicationOutcome(selectedApp.id, outcome, { source: 'manual' });
      if (!current()) return;
      if (!result.success) {
        const message = result.error || 'Failed to log outcome';
        setDrawerActionError(message);
        showToast(message, 'cancel');
        return;
      }
      const nextStatus = nextStatusForOutcome(selectedApp, outcome);
      const reportedAt = new Date().toISOString();
      updateLocalApplication(selectedApp.id, {
        status: nextStatus,
        outcome_response: outcome,
        outcome_reported_at: reportedAt,
        outcome_source: 'manual',
        outcome_history: [
          ...(selectedApp.outcome_history || []),
          {
            outcome,
            reportedAt,
            daysToResponse: selectedApp.outcome_days_to_response || 0,
            source: 'manual' as const,
          },
        ].slice(-25),
      });
      setRequestedOutcomeConfirmation(null);
      window.requestAnimationFrame(() => {
        if (!current()) return;
        document.getElementById('application-action-outcome')?.focus({ preventScroll: true });
      });
      showToast(result.duplicate ? 'Outcome was already saved' : `Outcome: ${OUTCOME_CONFIG[outcome].label}`, OUTCOME_CONFIG[outcome].icon);
    } catch { if (current()) setDrawerActionError('Outcome could not be saved. Please retry.'); } finally {
      if (current()) setOutcomeLoading(false);
    }
  }

  async function handleSaveOffer(app: JobApplication, offerDetails: OfferDetails, status?: JobApplication['negotiation_status']) {
    const current = captureAction(app.id, 'offer-save');
    const result = await updateApplicationOffer(app.id, {
      expectedOfferSignature: offerInputSignature(app.offer_details),
      offerDetails,
      negotiationStatus: status || app.negotiation_status || 'not_started',
    });
    if (!current()) return null;
    if (!result.success) {
      showToast(result.error || 'Failed to save offer details', 'cancel');
      return null;
    }
    updateLocalApplication(app.id, result.data || {
      offer_details: offerDetails,
      offer_amount: offerDetails.base || offerDetails.total || app.offer_amount,
      negotiation_status: status || app.negotiation_status || 'not_started',
      last_updated: new Date().toISOString(),
    });
    showToast('Offer details saved', 'payments');
    return result.data || null;
  }

  async function handleGenerateOfferBrief(app: JobApplication, offerDetails: OfferDetails) {
    const current = captureAction(app.id, 'offer-brief');
    const savedApp = await handleSaveOffer(app, offerDetails, app.negotiation_status || 'not_started');
    if (!savedApp) throw new Error('Save the offer details before generating a brief.');
    if (!current()) throw new Error('Offer input or application changed. Review your current details.');
    const sourceApp = savedApp;
    const res = await authFetch('/api/agent/negotiate', {
      method: 'POST',
      body: JSON.stringify({
        applicationId: app.id,
        company: sourceApp.company_name,
        role: sourceApp.job_title,
        jobDescription: sourceApp.job_description,
        resumeVersionId: sourceApp.resume_version_id,
        offerDetails,
      }),
    });
    const data = await res.json();
    if (!current()) throw new Error('The selected application changed. Reopen it to continue.');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate negotiation brief');
    }
    const brief: NegotiationBrief = {
      method: 'entered_offer_v1', sourceOfferSignature: JSON.stringify(offerDetailsToDraft(offerDetails)),
      counterStrategy: data.counterStrategy,
      emailScript: data.emailScript,
      phoneScript: data.phoneScript,
      batna: data.batna,
      leveragePoints: data.leveragePoints || [],
      nonSalaryAsks: data.nonSalaryAsks || [],
      redFlags: data.redFlags || [],
    };
    const result = await updateApplicationOffer(app.id, {
      expectedOfferSignature: offerInputSignature(savedApp.offer_details),
      offerDetails,
      negotiationBrief: brief,
      negotiationStatus: 'drafted',
    });
    if (!current()) throw new Error('The current offer changed while saving the brief.');
    if (!result.success) {
      throw new Error(result.error || 'Failed to save negotiation brief');
    }
    updateLocalApplication(app.id, result.data || {
      offer_details: offerDetails,
      negotiation_brief: brief,
      negotiation_status: 'drafted',
      negotiation_generated_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    });
    showToast('Negotiation brief ready', 'handshake');
    return brief;
  }

  async function handleNegotiationStatus(app: JobApplication, status: NonNullable<JobApplication['negotiation_status']>) {
    if (['accepted','declined'].includes(status) && !window.confirm(`Record that you ${status} this offer? This records your decision; no message will be sent.`)) return;
    const current = captureAction(app.id, 'offer-status');
    const result = await updateApplicationOffer(app.id, { negotiationStatus: status });
    if (!current()) return;
    if (!result.success) {
      showToast('Failed to update negotiation status', 'cancel');
      return;
    }
    updateLocalApplication(app.id, result.data || { negotiation_status: status, last_updated: new Date().toISOString() });

    showToast(status === 'accepted' ? 'Offer marked accepted' : status === 'declined' ? 'Offer marked declined' : 'Negotiation updated', 'check_circle');
  }

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return applications.filter(app => {
      const matchesSearch = !q || app.company_name.toLowerCase().includes(q) || app.job_title?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      const matchesOutcome =
        outcomeFilter === 'all' ||
        (outcomeFilter === 'pending' && !app.outcome_response) ||
        (outcomeFilter === 'reported' && Boolean(app.outcome_response)) ||
        (outcomeFilter === 'positive' && ['callback', 'interview', 'offer'].includes(app.outcome_response || '')) ||
        (outcomeFilter === 'negative' && ['rejection', 'ghosted'].includes(app.outcome_response || ''));
      return matchesSearch && matchesStatus && matchesOutcome;
    });
  }, [applications, outcomeFilter, searchQuery, statusFilter]);

  const attentionItems = useMemo(() => {
    const items: Array<{ app: JobApplication; kind: AttentionKind; label: string; detail: string; priority: number; icon: string; color: string }> = [];
    applications.forEach(app => {
      const appliedDays = daysSince(app.applied_at || app.created_at);
      if (needsOfferReview(app)) {
        const offerAction = getOfferAction(app);
        items.push({ app, kind: 'offer', label: offerAction.label, detail: offerAction.detail, priority: 0, icon: offerAction.icon, color: 'var(--success)' });
      } else if (needsOutcome(app)) {
        items.push({ app, kind: 'outcome', label: 'Log outcome', detail: `${appliedDays} days with no result logged`, priority: 1, icon: 'fact_check', color: 'var(--warning)' });
      } else if (canFollowUp(app)) {
        items.push({ app, kind: 'followup', label: 'Send follow-up', detail: `${appliedDays} days since applied`, priority: 2, icon: 'forward_to_inbox', color: 'var(--warning)' });
      } else if (needsPrep(app)) {
        items.push({ app, kind: 'prep', label: 'Prepare interview', detail: app.interview_date ? `Interview ${formatDate(app.interview_date)}` : 'Interview stage needs prep', priority: 3, icon: 'psychology', color: 'var(--accent)' });
      } else if (app.status === 'not_applied') {
        items.push({ app, kind: 'apply', label: 'Submit manually', detail: 'Open the posting and submit before marking applied', priority: 4, icon: 'open_in_new', color: 'var(--accent)' });
      }
    });
    return items.sort((a, b) => a.priority - b.priority || daysSince(b.app.created_at) - daysSince(a.app.created_at)).slice(0, 12);
  }, [applications]);

  const stats = useMemo(() => {
    const prepSignalCounts = applications.map(countPrepSignals);
    const appliedApps = applications.filter(app => app.status !== 'not_applied');
    const positiveOutcomes = applications.filter(app => ['callback', 'interview', 'offer'].includes(app.outcome_response || '')).length;
    const withOutcome = applications.filter(app => app.outcome_response).length;
    return {
      active: applications.filter(app => !TERMINAL_STATUSES.includes(app.status)).length,
      needsAttention: attentionItems.length,
      interviews: applications.filter(needsPrep).length,
      offers: applications.filter(needsOfferReview).length,
      responseRate: appliedApps.length ? Math.round((positiveOutcomes / appliedApps.length) * 100) : 0,
      outcomeCoverage: appliedApps.length ? Math.round((withOutcome / appliedApps.length) * 100) : 0,
      avgPrepSignals: prepSignalCounts.length ? (prepSignalCounts.reduce((sum, value) => sum + value, 0) / prepSignalCounts.length).toFixed(1) : null,
    };
  }, [applications, attentionItems.length]);

  const todayActions = [
    { label: 'Offers to review', value: stats.offers, icon: 'payments', onClick: () => { setStatusFilter('offer'); setOutcomeFilter('all'); setViewMode('command'); } },
    { label: 'Follow-ups due', value: applications.filter(canFollowUp).length, icon: 'forward_to_inbox', onClick: () => { setViewMode('command'); } },
    { label: 'Prep interviews', value: applications.filter(needsPrep).length, icon: 'psychology', onClick: () => { setStatusFilter('interview_scheduled'); setViewMode('grid'); } },
    { label: 'Drafts ready', value: applications.filter(app => app.status === 'not_applied').length, icon: 'edit_document', onClick: () => { setStatusFilter('not_applied'); setViewMode('grid'); } },
  ];

  // MUST6: response rate and average quality are only meaningful once there are
  // applied applications to measure. With no denominator they must read as a
  // labelled absence, never a fabricated "0%" or "0".
  const hasAppliedApps = applications.some(app => app.status !== 'not_applied');

  useToolGuidance(buildToolStory({
    toolId: 'applications', title: 'Applications', contextKey: JSON.stringify([selectedApp?.id || 'tracker', viewMode]), modalSurface: selectedApp ? 'application-detail' : undefined,
    purpose: 'Track real applications, inspect prepared documents and record only the events that happened.',
    pending: isLoading || followUpLoading || outcomeLoading, hasResult: Boolean(selectedApp), failed: Boolean(loadError || drawerActionError),
    work: [storyStep('capture', 'Track a real application', 'Open Track an application to record an external submission or an unsent tracker. Generation is not required.', 'applications-capture'), storyStep('find', 'Find your record', 'Search or filter your real application history. Choose a record yourself to open its details.', 'applications-search'), storyStep('records', 'Open the application you need', 'The current view shows loaded records, not invented examples. Opening a record does not change its status.', 'applications-records')],
    result: [...(selectedApp?.status === 'offer' ? [storyStep('offer', 'Review the actual offer', 'Enter genuine compensation and deadlines, review any brief against those inputs, and record the decision only after it occurs. Saving an offer or copying counter language never sends it.', 'application-offer')] : []), storyStep('review', 'Inspect this record', 'Check the role, status, linked source, notes and real timeline. Prepared and submitted remain separate.', 'application-detail'), storyStep('documents', 'Review prepared documents when present', 'Compare the source and drafts. Explicit approval applies to a document revision and does not submit it.', 'application-document-review', 'This application has no inline prepared-document review. Queue packets link to their own review.'), storyStep('followup', 'Choose the next action', 'Draft a follow-up only when appropriate; a draft is not an email sent. Record status or outcome only after the event occurred.', 'application-followup', 'Follow-up drafting is available only for eligible application statuses. Other record actions remain in the drawer.')],
    recovery: [storyStep('retry', 'Review the existing error', 'A failed load or action does not confirm a saved change. Keep your current work and use the tool recovery control when ready.', 'applications-records', 'Close the details yourself to reach the tracker load message if it is behind the drawer.')],
  }));

  const hasFilters = Boolean(searchQuery.trim()) || statusFilter !== 'all' || outcomeFilter !== 'all';

  return (
    <SuiteToolShell variant="workbench">
        <ApplicationsContext active="tracking" context="Track status, outcomes, and follow-ups" />
        <SuiteToolHeader
          tool="applications"
          actions={
            <>
              <button
                type="button"
                onClick={() => dispatchSona('Review my application pipeline and tell me the three most important next actions.', 'Applications')}
                className="inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
              >
                <AssistantMark size="xs" state="idle" />
                Ask <TacoName />
              </button>
            </>
          }
        />

        <div data-guide="applications-capture"><ManualApplicationForm key={user?.uid || 'guest'} applications={applications} onSaved={app => setApplications(previous => [app, ...previous.filter(item => item.id !== app.id)])} /></div>

        <details className="taco-application-overview border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Pipeline overview</summary>
        <ApplicationWorkspaceBrief
          applications={applications}
          stats={stats}
          onOpenFollowUps={() => {
            setViewMode('command');
            setStatusFilter('all');
            setOutcomeFilter('all');
          }}
          onOpenOutcomes={() => {
            setViewMode('command');
            setStatusFilter('applied');
            setOutcomeFilter('pending');
          }}
          onOpenDossiers={() => {
            setViewMode('grid');
            setStatusFilter('all');
            setOutcomeFilter('all');
          }}
          onAskSona={() => dispatchSona('Audit my application workspace. Check tracker coverage, company dossiers, follow-ups, recruiter notes, outcome logging, and the next three review-first actions.', 'Application Workspace')}
        />

        </details>

        <section className="taco-application-actions mobile-card-rail grid gap-3 lg:grid-cols-4">
          {todayActions.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="group elevation-interactive rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="icon-shell-neutral grid h-10 w-10 place-items-center rounded-[13px] border">
                  <span className="material-symbols-rounded icon-neutral text-[21px]">{action.icon}</span>
                </span>
                <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{action.value}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{action.label}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Open the matching work queue</p>
            </button>
          ))}
        </section>

        <section className="mobile-card-rail grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Active pipeline" value={stats.active} icon="route" />
          <Metric label="Needs attention" value={stats.needsAttention} icon="priority_high" />
          <Metric label="Interviews" value={stats.interviews} icon="groups" />
          <Metric label="Response rate" value={hasAppliedApps ? `${stats.responseRate}%` : 'n/a'} icon="mark_email_read" />
          <Metric label="Avg prep signals" value={hasAppliedApps && stats.avgPrepSignals !== null ? `${stats.avgPrepSignals} of 5` : 'n/a'} icon="checklist" />
        </section>

        <section className="mobile-tool-shell elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_180px_180px_auto]">
            <label className="flex min-w-0 items-center gap-2">
              <span className="pointer-events-none flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]" aria-hidden="true">
                <span className="material-symbols-rounded block text-[22px] leading-none">search</span>
              </span>
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search company or role"
                data-guide="applications-search"
                aria-label="Search applications"
                className="h-11 min-w-0 flex-1 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
              />
            </label>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-11 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
            >
              <option value="all">All statuses</option>
              {STATUS_KEYS.map(status => <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>)}
            </select>
            <select
              value={outcomeFilter}
              onChange={event => setOutcomeFilter(event.target.value as OutcomeFilter)}
              className="h-11 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
            >
              <option value="all">All outcomes</option>
              <option value="pending">Outcome pending</option>
              <option value="reported">Outcome reported</option>
              <option value="positive">Positive signals</option>
              <option value="negative">Rejected or ghosted</option>
            </select>
            <div className="flex rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1">
              {[
                { mode: 'command' as const, icon: 'bolt', label: 'Command' },
                { mode: 'grid' as const, icon: 'grid_view', label: 'Grid' },
                { mode: 'kanban' as const, icon: 'view_kanban', label: 'Board' },
                { mode: 'list' as const, icon: 'view_list', label: 'List' },
              ].map(view => (
                <button
                  key={view.mode}
                  type="button"
                  aria-label={`${view.label} view`}
                  onClick={() => setViewMode(view.mode)}
                  className={`group relative grid h-9 w-10 place-items-center rounded-[10px] transition-colors ${viewMode === view.mode ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] elevation-card' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
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

        <div data-guide="applications-records">{isLoading ? (
          <ApplicationsSkeleton />
        ) : loadError ? (
          <ApplicationsErrorState message={loadError} onRetry={loadApplications} />
        ) : applications.length === 0 ? (
          <EmptyState mode="empty" />
        ) : filteredApplications.length === 0 ? (
          <EmptyState mode="filtered" onClear={() => { setSearchQuery(''); setStatusFilter('all'); setOutcomeFilter('all'); }} />
        ) : viewMode === 'command' ? (
          <CommandView
            attentionItems={attentionItems}
            apps={filteredApplications}
            onOpen={openDrawer}
            onAsk={app => dispatchSona(`What should I do next for my ${app.job_title || 'role'} application at ${app.company_name}?`, app.company_name)}
            onFollowUp={handleFollowUp}
            onPrep={handleInterviewPrep}
            getProgress={getApplicationProgress}
          />
        ) : viewMode === 'kanban' ? (
          <KanbanView apps={filteredApplications} onOpen={openDrawer} getProgress={getApplicationProgress} />
        ) : viewMode === 'list' ? (
          <ListView
            apps={filteredApplications}
            statusDropdownId={statusDropdownId}
            setStatusDropdownId={setStatusDropdownId}
            onOpen={openDrawer}
            onDelete={handleDelete}
            onStatusUpdate={handleStatusUpdate}
            getProgress={getApplicationProgress}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredApplications.map((app, index) => (
              <ApplicationCard
                key={app.id}
                app={app}
                index={index}
                onOpen={openDrawer}
                onDelete={handleDelete}
                onStatusUpdate={handleStatusUpdate}
                onAsk={() => dispatchSona(`Help me decide the next step for ${app.company_name}${app.job_title ? `, ${app.job_title}` : ''}.`, app.company_name)}
                getProgress={getApplicationProgress}
              />
            ))}
          </div>
        )}


      </div>
      <ApplicationDrawer
        app={selectedApp}
        initialAction={inboxDrawerAction}
        linkedResume={linkedResume}
        resumeLoading={resumeLoading}
        showResumePreview={showResumePreview}
        setShowResumePreview={setShowResumePreview}
        editingNotes={editingNotes}
        setEditingNotes={value => { notesRevisionRef.current += 1; setEditingNotes(value); }}
        downloading={downloading}
        followUpLoading={followUpLoading}
        prepLoading={prepLoading}
        outcomeLoading={outcomeLoading}
        initialOutcomeConfirmation={requestedOutcomeConfirmation}
        prepData={prepData}
        showPrepCard={showPrepCard}
        setShowPrepCard={setShowPrepCard}
        closeRef={drawerCloseRef}
        skillProgress={selectedApp ? getApplicationProgress(selectedApp.id) : null}
        skillSummary={selectedApp ? getApplicationSkillSummary(selectedApp.id) : buildSkillBridgeSummary([])}
        actionError={drawerActionError}
        onDismissActionError={() => setDrawerActionError(null)}
        onClose={closeDrawer}
        onStatusUpdate={handleStatusUpdate}
        onNotesSave={handleNotesUpdate}
        onDelete={handleDelete}
        onDownloadPDF={handleDownloadPDF}
        onDownloadWord={handleDownloadWord}
        onOutcome={handleOutcome}
        onOfferInputChange={() => { offerRevisionRef.current += 1; }}
        onSaveOffer={handleSaveOffer}
        onGenerateOfferBrief={handleGenerateOfferBrief}
        onNegotiationStatus={handleNegotiationStatus}
        onFollowUp={handleFollowUp}
        onInterviewPrep={handleInterviewPrep}
        onAsk={app => dispatchSona(`Help me with this application: ${app.company_name}${app.job_title ? `, ${app.job_title}` : ''}. What is the best next move?`, app.company_name)}
      />

      <FollowUpModal draft={followUpDraft} open={showFollowUpModal} onClose={() => setShowFollowUpModal(false)} />
      {!selectedApp && (
        <MobileStickyActionBar
          className="mobile-sticky-actionbar--with-appbar"
          primaryLabel="Ask Taco"
          primaryIcon="auto_awesome"
          onPrimary={() => dispatchSona('Review my application pipeline and tell me the three most important next actions.', 'Applications')}
          secondaryActions={[
            {
              label: hasFilters ? 'Clear' : 'Filters',
              icon: hasFilters ? 'filter_alt_off' : 'filter_alt',
              onClick: () => {
                if (hasFilters) {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setOutcomeFilter('all');
                } else {
                  document.querySelector<HTMLInputElement>('input[aria-label="Search applications"]')?.focus();
                }
              },
            },
          ]}
        />
      )}
    </SuiteToolShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="icon-shell-neutral grid h-9 w-9 place-items-center rounded-[12px] border">
          <span className="material-symbols-rounded icon-neutral text-[19px]">{icon}</span>
        </span>
        <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
      </div>
      <p className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: JobApplication['status'] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold"
      style={{ color: config.color, background: soft(config.color), borderColor: soft(config.color, '30') }}
    >
      <span className="material-symbols-rounded text-[14px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome?: JobApplication['outcome_response'] | null }) {
  if (!outcome) return <span className="text-xs text-[var(--text-muted)]">Pending</span>;
  const config = OUTCOME_CONFIG[outcome];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold" style={{ color: config.color, background: soft(config.color), borderColor: soft(config.color, '30') }}>
      <span className="material-symbols-rounded text-[14px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function QualityPills({ app }: { app: JobApplication }) {
  const signals = countPrepSignals(app);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]" title={`${signals} of 5 prep signals present`}>
      <span className="material-symbols-rounded text-[15px]">checklist</span>
      <span className="font-semibold">{signals} of 5 prep signals</span>
    </span>
  );
}

function ApplicationsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading applications">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-[14px] bg-[var(--bg-elevated)]" />
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

function EmptyState({ mode, onClear }: { mode: 'empty' | 'filtered'; onClear?: () => void }) {
  return (
    <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-12 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)]">
        <span className="material-symbols-rounded text-[32px]">{mode === 'empty' ? 'inventory_2' : 'filter_alt_off'}</span>
      </div>
      <h2 className="mt-5 text-xl font-bold text-[var(--text-primary)]">{mode === 'empty' ? 'No applications yet' : 'No applications match these filters'}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
        <TacoText text={mode === 'empty'
          ? 'Start from Resume Studio, Job Search, or Taco Queue. Prepared applications will show up here for follow-up and outcome tracking.'
          : 'Clear the filters or search for a different company, role, status, or outcome.'} />
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {mode === 'empty' ? (
          <>
            <Link href="/suite/resume" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
              <span className="material-symbols-rounded text-[18px]">transform</span>
              Prepare resume
            </Link>
            <button
              type="button"
              onClick={() => dispatchSona('Help me create my first tracked application.', 'Applications')}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-4 py-2 text-sm font-semibold text-[var(--accent)]"
            >
              <AssistantMark size="xs" state="idle" />
              Ask <TacoName />
            </button>
          </>
        ) : (
          <button type="button" onClick={onClear} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
}

function ApplicationsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section role="alert" className="elevation-card rounded-[22px] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-5 py-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]">
        <span className="material-symbols-rounded text-[28px]" aria-hidden="true">cloud_off</span>
      </div>
      <h2 className="mt-4 text-lg font-bold text-[var(--text-primary)]">Applications did not load</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
        {message} Your saved tracker has not been replaced or cleared.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
      >
        <span className="material-symbols-rounded text-[18px]" aria-hidden="true">refresh</span>
        Try again
      </button>
    </section>
  );
}

function ApplicationWorkspaceBrief({
  applications,
  stats,
  onOpenFollowUps,
  onOpenOutcomes,
  onOpenDossiers,
  onAskSona,
}: {
  applications: JobApplication[];
  stats: {
    active: number;
    needsAttention: number;
    outcomeCoverage: number;
  };
  onOpenFollowUps: () => void;
  onOpenOutcomes: () => void;
  onOpenDossiers: () => void;
  onAskSona: () => void;
}) {
  const followUpsDue = applications.filter(canFollowUp).length;
  const outcomeGaps = applications.filter(needsOutcome).length;
  const dossierScores = applications.map(getDossierCompletion);
  const averageDossier = dossierScores.length
    ? Math.round(dossierScores.reduce((sum, score) => sum + score, 0) / dossierScores.length)
    : 0;
  // MUST6: percentages are only real once there is something to measure. With no
  // applications (dossier) or no applied applications (outcome coverage) they must
  // render as a labelled absence, never a fabricated 0%.
  const hasApplied = applications.some(app => app.status !== 'not_applied');
  const nextAction = applications
    .filter(app => !TERMINAL_STATUSES.includes(app.status))
    .map(app => ({ app, action: getWorkspaceAction(app) }))
    .sort((a, b) => {
      const priority: Record<string, number> = {
        'Offer review': 0,
        Outcome: 1,
        'Follow-up': 2,
        'Interview prep': 3,
        'Application packet': 4,
        Tracker: 5,
      };
      return (priority[a.action.kind] ?? 9) - (priority[b.action.kind] ?? 9);
    })[0];

  const lanes = [
    {
      label: 'Tracker',
      value: stats.active,
      detail: `${applications.length} total applications`,
      icon: 'view_kanban',
      tone: 'var(--accent)',
      action: onOpenDossiers,
    },
    {
      label: 'Company dossiers',
      value: applications.length ? `${averageDossier}%` : 'n/a',
      detail: 'Role, posting, resume, notes, and outcome coverage',
      icon: 'corporate_fare',
      tone: 'var(--accent)',
      action: onOpenDossiers,
    },
    {
      label: 'Follow-ups',
      value: followUpsDue,
      detail: 'Ready for a review-first message',
      icon: 'forward_to_inbox',
      tone: 'var(--warning)',
      action: onOpenFollowUps,
    },
    {
      label: 'Outcomes',
      value: hasApplied ? `${stats.outcomeCoverage}%` : 'n/a',
      detail: outcomeGaps > 0 ? `${outcomeGaps} need a result logged` : 'No overdue outcome gaps',
      icon: 'fact_check',
      tone: 'var(--success)',
      action: onOpenOutcomes,
    },
  ];

  return (
    <SuitePanel className="p-4 md:p-5">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="hub" size="md" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Application workspace</p>
            <h2 className="premium-heading-wrap mt-1 text-base font-bold text-[var(--text-primary)] md:text-lg">
              Track the pipeline from packet to outcome.
            </h2>
            <p className="premium-copy-wrap mt-1 max-w-3xl text-sm leading-5 text-[var(--text-secondary)] md:leading-6">
              Each application should have a company dossier, a next action, recruiter notes, follow-up timing, and a logged outcome.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAskSona}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-hover)]"
        >
          <AssistantMark size="xs" state="listening" />
          Review workspace
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {lanes.map(lane => (
          <button
            key={lane.label}
            type="button"
            onClick={lane.action}
            className="min-w-0 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-left transition hover:border-[var(--border)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)] md:p-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="icon-shell-neutral grid h-8 w-8 shrink-0 place-items-center rounded-[11px] border md:h-9 md:w-9 md:rounded-[12px]">
                <span className="material-symbols-rounded icon-neutral text-[18px] md:text-[19px]" aria-hidden="true">{lane.icon}</span>
              </span>
              <span className="whitespace-nowrap text-lg font-black tabular-nums text-[var(--text-primary)] md:text-xl">{lane.value}</span>
            </div>
            <p className="premium-heading-wrap mt-2 text-sm font-bold text-[var(--text-primary)]">{lane.label}</p>
            <p className="premium-copy-wrap mt-1 line-clamp-2 text-xs leading-4 text-[var(--text-muted)] md:leading-5">{lane.detail}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        {nextAction ? (
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="icon-shell-neutral grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border">
                <span className="material-symbols-rounded icon-neutral text-[20px]" aria-hidden="true">{nextAction.action.icon}</span>
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Next best workspace action</p>
                <p className="premium-heading-wrap mt-1 text-sm font-bold text-[var(--text-primary)]">
                  {nextAction.action.label}: {nextAction.app.company_name}
                </p>
                <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {nextAction.action.detail}
                  {nextAction.app.job_title ? ` for ${nextAction.app.job_title}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onAskSona}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
            >
              <AssistantMark size="xs" state="idle" />
              Ask for plan
            </button>
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Add or prepare applications to start the workspace loop.
          </p>
        )}
      </div>
    </SuitePanel>
  );
}

function CommandView({
  attentionItems,
  apps,
  onOpen,
  onAsk,
  onFollowUp,
  onPrep,
  getProgress,
}: {
  attentionItems: Array<{ app: JobApplication; kind: AttentionKind; label: string; detail: string; icon: string; color: string }>;
  apps: JobApplication[];
  onOpen: (app: JobApplication) => void;
  onAsk: (app: JobApplication) => void;
  onFollowUp: (id: string) => void;
  onPrep: (app: JobApplication) => void;
  getProgress: (id: string) => number | null;
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
            onClick={() => dispatchSona('Review the applications that need attention and tell me what to handle first.', 'Needs attention')}
            className="inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)]"
          >
            <AssistantMark size="xs" state="idle" />
            Ask <TacoName />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {attentionItems.length === 0 ? (
            <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">No urgent application work right now.</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Keep the pipeline fresh by reviewing new roles or logging outcomes when replies come in.</p>
            </div>
          ) : attentionItems.map(item => (
            <AttentionRow key={`${item.app.id}-${item.kind}`} item={item} onOpen={onOpen} onAsk={onAsk} onFollowUp={onFollowUp} onPrep={onPrep} />
          ))}
        </div>
      </section>

      <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pipeline scan</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Recent applications</h2>
          </div>
          <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]">{apps.length} visible</span>
        </div>
        <div className="mt-4 space-y-2">
          {apps.slice(0, 7).map(app => (
            <button key={app.id} type="button" onClick={() => onOpen(app)} className="flex w-full items-center gap-3 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left hover:bg-[var(--bg-hover)]">
              <CompanyAvatar company={app.company_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{app.company_name}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]">{app.job_title || 'Role not specified'}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {app.talent_density_score ? <span className="text-xs font-semibold text-[var(--accent)]">{app.talent_density_score}%</span> : null}
                {getProgress(app.id) !== null ? <span className="text-xs text-[var(--text-muted)]">{getProgress(app.id)}%</span> : null}
              </div>
              <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">chevron_right</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AttentionRow({
  item,
  onOpen,
  onAsk,
  onFollowUp,
  onPrep,
}: {
  item: { app: JobApplication; kind: AttentionKind; label: string; detail: string; icon: string; color: string };
  onOpen: (app: JobApplication) => void;
  onAsk: (app: JobApplication) => void;
  onFollowUp: (id: string) => void;
  onPrep: (app: JobApplication) => void;
}) {
  const primary = () => {
    if (item.kind === 'followup') onFollowUp(item.app.id);
    else if (item.kind === 'prep') onPrep(item.app);
    else onOpen(item.app);
  };
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border" style={{ color: item.color, background: soft(item.color), borderColor: soft(item.color, '28') }}>
        <span className="material-symbols-rounded text-[20px]">{item.icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.app.company_name}</p>
        <p className="truncate text-xs text-[var(--text-secondary)]">{item.app.job_title || 'Role not specified'}</p>
        <p className="mt-1 text-xs font-medium" style={{ color: item.color }}>{item.label}: {item.detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={primary} className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
          {item.kind === 'followup' ? 'Draft' : item.kind === 'prep' ? 'Prep' : item.kind === 'apply' ? 'Open' : 'Review'}
        </button>
        {item.kind === 'prep' && (
          <Link href={`/suite/interview-sim?application=${item.app.id}`} className="rounded-[11px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
            Practice
          </Link>
        )}
        <button type="button" onClick={() => onAsk(item.app)} className="rounded-[11px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
          Ask <TacoName />
        </button>
      </div>
    </div>
  );
}

function ApplicationCard({
  app,
  index,
  onOpen,
  onDelete,
  onStatusUpdate,
  onAsk,
  getProgress,
}: {
  app: JobApplication;
  index: number;
  onOpen: (app: JobApplication) => void;
  onDelete: (id: string) => void;
  onStatusUpdate: (app: JobApplication, status: JobApplication['status']) => void;
  onAsk: () => void;
  getProgress: (id: string) => number | null;
}) {
  const [openStatus, setOpenStatus] = useState(false);
  const progress = getProgress(app.id);
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`elevation-card relative rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 ${openStatus ? 'z-20' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(app)} className="flex min-w-0 items-center gap-3 text-left">
          <CompanyAvatar company={app.company_name} />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-[var(--text-primary)]">{app.company_name}</span>
            <span className="block truncate text-sm text-[var(--text-secondary)]">{app.job_title || 'Role not specified'}</span>
          </span>
        </button>
        <button type="button" onClick={() => onDelete(app.id)} aria-label={`Delete ${app.company_name}`} className="rounded-[10px] p-2 text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger)]">
          <span className="material-symbols-rounded text-[17px]">delete</span>
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenStatus(value => !value)}
              aria-haspopup="menu"
              aria-expanded={openStatus}
              aria-label={`Change status for ${app.company_name}`}
            >
              <StatusBadge status={app.status} />
            </button>
            <StatusMenu open={openStatus} app={app} onClose={() => setOpenStatus(false)} onStatusUpdate={onStatusUpdate} />
          </div>
          <OutcomeBadge outcome={app.outcome_response} />
          <QualityPills app={app} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniProgress label="Match" value={app.talent_density_score ?? null} color="var(--accent)" />
          <MiniProgress label="Skill Bridge" value={progress} color="var(--accent)" />
        </div>
        {app.notes ? <p className="line-clamp-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs leading-5 text-[var(--text-secondary)]">{app.notes}</p> : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
        <span>{getActivityDateLabel(app)}</span>
        <div className="flex gap-1">
          <button type="button" onClick={onAsk} className="rounded-[10px] px-2 py-1 font-semibold text-[var(--accent)] hover:bg-[var(--accent-hover)]">Ask <TacoName /></button>
          <button type="button" onClick={() => onOpen(app)} className="rounded-[10px] px-2 py-1 font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Details</button>
        </div>
      </div>
    </motion.article>
  );
}

function CompanyAvatar({ company }: { company: string }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-base font-bold text-[var(--text-primary)]">
      {(company || '?')[0].toUpperCase()}
    </span>
  );
}

function MiniProgress({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--text-primary)]">{value === null ? 'Not measured' : `${value}%`}</span>
      </div>
      {/* MUST6: an unmeasured value renders the absence, never an empty bar that
          reads as a measured 0%. Only draw the track once there is a number. */}
      {value === null ? (
        <div className="h-1.5 rounded-full border border-dashed border-[var(--border-subtle)]" />
      ) : (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <motion.div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.4 }} />
        </div>
      )}
    </div>
  );
}

function StatusMenu({
  open,
  app,
  onClose,
  onStatusUpdate,
}: {
  open: boolean;
  app: JobApplication;
  onClose: () => void;
  onStatusUpdate: (app: JobApplication, status: JobApplication['status']) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="absolute left-0 top-full z-50 mt-2 w-56 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 elevation-raised"
          role="menu"
        >
          {STATUS_KEYS.map(status => (
            <button
              key={status}
              type="button"
              onClick={() => { onStatusUpdate(app, status); onClose(); }}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-[var(--bg-hover)]"
              style={{ color: STATUS_CONFIG[status].color }}
              role="menuitemradio"
              aria-checked={app.status === status}
            >
              <span className="material-symbols-rounded text-[16px]">{STATUS_CONFIG[status].icon}</span>
              {STATUS_CONFIG[status].label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function KanbanView({ apps, onOpen, getProgress }: { apps: JobApplication[]; onOpen: (app: JobApplication) => void; getProgress: (id: string) => number | null }) {
  return (
    <div className="flex min-h-[58vh] gap-3 overflow-x-auto pb-4">
      {STATUS_KEYS.map(status => {
        const config = STATUS_CONFIG[status];
        const columnApps = apps.filter(app => app.status === status);
        return (
          <section key={status} className="elevation-card flex w-[280px] shrink-0 flex-col rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: config.color }}>
                <span className="material-symbols-rounded text-[17px]">{config.icon}</span>
                {config.label}
              </span>
              <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{columnApps.length}</span>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {columnApps.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] p-5 text-center text-xs text-[var(--text-muted)]">No applications</div>
              ) : columnApps.map(app => (
                <button key={app.id} type="button" onClick={() => onOpen(app)} className="w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left hover:bg-[var(--bg-hover)]">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{app.company_name}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{app.job_title || 'Role not specified'}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--accent)]">{app.talent_density_score ? `${app.talent_density_score}%` : 'No match'}</span>
                    {getProgress(app.id) !== null ? <span className="text-[var(--text-muted)]">{getProgress(app.id)}% Skill</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListView({
  apps,
  statusDropdownId,
  setStatusDropdownId,
  onOpen,
  onDelete,
  onStatusUpdate,
  getProgress,
}: {
  apps: JobApplication[];
  statusDropdownId: string | null;
  setStatusDropdownId: (id: string | null) => void;
  onOpen: (app: JobApplication) => void;
  onDelete: (id: string) => void;
  onStatusUpdate: (app: JobApplication, status: JobApplication['status']) => void;
  getProgress: (id: string) => number | null;
}) {
  return (
    <div className="elevation-card overflow-x-auto rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <table className="min-w-[980px] w-full">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th className="p-4">Company</th>
            <th className="p-4">Status</th>
            <th className="p-4">Match</th>
            <th className="p-4">Quality</th>
            <th className="p-4">Skill</th>
            <th className="p-4">Outcome</th>
            <th className="p-4">Date</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {apps.map(app => (
            <tr key={app.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)]">
              <td className="p-4">
                <button type="button" onClick={() => onOpen(app)} className="flex min-w-0 items-center gap-3 text-left">
                  <CompanyAvatar company={app.company_name} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{app.company_name}</span>
                    <span className="block truncate text-xs text-[var(--text-secondary)]">{app.job_title || 'Role not specified'}</span>
                  </span>
                </button>
              </td>
              <td className="p-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownId(statusDropdownId === app.id ? null : app.id)}
                    aria-haspopup="menu"
                    aria-expanded={statusDropdownId === app.id}
                    aria-label={`Change status for ${app.company_name}`}
                  >
                    <StatusBadge status={app.status} />
                  </button>
                  <StatusMenu open={statusDropdownId === app.id} app={app} onClose={() => setStatusDropdownId(null)} onStatusUpdate={onStatusUpdate} />
                </div>
              </td>
              <td className="p-4 text-sm font-semibold text-[var(--accent)]">{app.talent_density_score ? `${app.talent_density_score}%` : 'n/a'}</td>
              <td className="p-4"><QualityPills app={app} /></td>
              <td className="p-4 text-sm text-[var(--text-secondary)]">{getProgress(app.id) === null ? 'n/a' : `${getProgress(app.id)}%`}</td>
              <td className="p-4"><OutcomeBadge outcome={app.outcome_response} /></td>
              <td className="p-4 text-sm text-[var(--text-secondary)]">{getActivityDateLabel(app)}</td>
              <td className="p-4 text-right">
                <button type="button" onClick={() => onOpen(app)} className="rounded-[10px] px-2 py-1 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">Open</button>
                <button type="button" onClick={() => onDelete(app.id)} className="rounded-[10px] px-2 py-1 text-sm font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationDossier({
  app,
  linkedResume,
  skillProgress,
  skillSummary,
}: {
  app: JobApplication;
  linkedResume: ResumeVersion | null;
  skillProgress: number | null;
  skillSummary: SkillBridgeSummary;
}) {
  const action = getWorkspaceAction(app);
  const dossierCompletion = getDossierCompletion(app);
  const appliedDays = daysSince(app.applied_at || app.created_at);
  const facts = [
    {
      label: 'Company',
      value: app.company_name,
      detail: app.application_link ? 'Posting link saved' : 'Posting link missing',
      icon: 'corporate_fare',
      tone: app.application_link ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: 'Role',
      value: app.job_title || 'Role not set',
      detail: app.job_description ? 'Job description captured' : 'Add JD for better context',
      icon: 'work',
      tone: app.job_description ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: 'Resume',
      value: linkedResume?.version_name || app.morphed_resume_name || 'No resume linked',
      detail: app.resume_version_id ? 'Application packet has a resume source' : 'Link a resume before applying',
      icon: 'description',
      tone: app.resume_version_id ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: 'Outcome',
      value: app.outcome_response ? OUTCOME_CONFIG[app.outcome_response].label : 'Not logged',
      detail: app.outcome_response
        ? `Reported ${formatDate(app.outcome_reported_at)}`
        : isApplicationDraft(app)
          ? 'Apply manually before logging outcomes'
          : `${appliedDays} day${appliedDays === 1 ? '' : 's'} since activity`,
      icon: app.outcome_response ? OUTCOME_CONFIG[app.outcome_response].icon : 'fact_check',
      tone: app.outcome_response ? OUTCOME_CONFIG[app.outcome_response].color : needsOutcome(app) ? 'var(--warning)' : 'var(--text-muted)',
    },
  ];
  const gates = [
    {
      label: 'Review packet',
      detail: app.status === 'not_applied' ? 'Confirm the resume and posting, submit manually, then mark applied.' : 'Packet has moved into tracking.',
      done: app.status !== 'not_applied',
    },
    {
      label: 'Recruiter notes',
      detail: app.notes && app.notes.length > 10 ? 'Notes are attached to this application.' : 'Add recruiter names, dates, or follow-up context.',
      done: Boolean(app.notes && app.notes.length > 10),
    },
    {
      label: 'Follow-up timing',
      detail: canFollowUp(app) ? 'A follow-up is due for review.' : app.status === 'applied' ? 'Follow-up window is not due yet.' : 'Follow-up depends on the current status.',
      done: !canFollowUp(app),
    },
    {
      label: 'Outcome ledger',
      detail: app.outcome_response ? 'Outcome is logged for analytics.' : 'Log the result when you hear back.',
      done: Boolean(app.outcome_response),
    },
    {
      label: 'Skill Bridge',
      detail: skillSummary.skills.length
        ? skillSummary.nextAction
        : 'No skill plan is linked to this application yet.',
      done: skillSummary.skills.length > 0 && (skillSummary.readinessScore ?? skillSummary.percent ?? 0) >= 70,
    },
  ];

  return (
    <DrawerSection title="Application dossier" icon="dataset">
      <div className="space-y-3">
        <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Workspace plan</p>
              <h3 className="premium-heading-wrap mt-1 text-sm font-bold text-[var(--text-primary)]">{action.label}</h3>
              <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{action.detail}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold" style={{ color: action.tone, background: soft(action.tone), borderColor: soft(action.tone, '28') }}>
              <span className="material-symbols-rounded text-[14px]" aria-hidden="true">{action.icon}</span>
              {action.kind}
            </span>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">Dossier completion</span>
              <span className="font-black tabular-nums text-[var(--text-primary)]">{dossierCompletion}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
              <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${dossierCompletion}%` }} />
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {facts.map(fact => (
            <div key={fact.label} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="icon-shell-neutral grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border">
                  <span className="material-symbols-rounded icon-neutral text-[17px]" aria-hidden="true">{fact.icon}</span>
                </span>
                <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{fact.label}</p>
              </div>
              <p className="premium-heading-wrap mt-2 break-words text-sm font-bold text-[var(--text-primary)]">{fact.value}</p>
              <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{fact.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MiniProgress label="Match" value={app.talent_density_score ?? null} color="var(--accent)" />
          <MiniProgress label="Skill Bridge" value={skillProgress} color="var(--accent)" />
        </div>

        <div className="space-y-2">
          {gates.map(gate => (
            <div key={gate.label} className="flex min-w-0 items-start gap-3 rounded-[13px] bg-[var(--bg-elevated)] px-3 py-2.5">
              <span className={`material-symbols-rounded mt-0.5 shrink-0 text-[17px] ${gate.done ? 'icon-status-success' : 'icon-status-warning'}`} aria-hidden="true">
                {gate.done ? 'check_circle' : 'pending_actions'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{gate.label}</span>
                <span className="premium-copy-wrap block text-xs leading-5 text-[var(--text-muted)]">{gate.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </DrawerSection>
  );
}

function SkillBridgePanel({ app, summary }: { app: JobApplication; summary: SkillBridgeSummary }) {
  const hasSkills = summary.skills.length > 0;
  const score = summary.readinessScore ?? summary.percent;

  return (
    <DrawerSection title="Skill Bridge" icon="route">
      <div className="space-y-3">
        <div className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{hasSkills ? summary.statusLabel : 'No skill plan linked'}</p>
            <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{summary.nextAction}</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{score === null ? 'n/a' : `${score}%`}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">readiness</p>
          </div>
        </div>

        {hasSkills ? (
          <div className="space-y-2">
            {summary.skills.slice(0, 3).map(progress => {
              const done = progress.completed_days?.length || 0;
              const total = progress.total_days;
              const hasTotal = typeof total === 'number' && total > 0;
              const percent = hasTotal ? Math.round((done / total) * 100) : null;
              return (
                <div key={progress.id || progress.skill_id} className="rounded-[13px] bg-[var(--bg-elevated)] px-3 py-2.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="wrap-natural text-sm font-semibold text-[var(--text-primary)]">{progress.skill}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatReadinessStatus(progress.readiness_status)}, {hasTotal ? `${done} of ${total} days` : `${done} days logged, plan length not set`}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">{percent === null ? '—' : `${percent}%`}</span>
                  </div>
                  {hasTotal ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                      <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">Progress unavailable until the plan length is set</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[13px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
            Link a skill plan when this application exposes a gap. <TacoName /> can then turn it into interview drills and proof notes.
          </div>
        )}

        <Link href={`/suite/skill-bridge?applicationId=${app.id}`} className="inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">
          <span className="material-symbols-rounded text-[17px]">open_in_new</span>
          Open Skill Bridge
        </Link>
      </div>
    </DrawerSection>
  );
}

function ActionFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mt-3 flex items-start gap-3 rounded-[13px] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2.5 text-sm text-[var(--danger)]">
      <span className="material-symbols-rounded mt-0.5 text-[17px]" aria-hidden="true">error</span>
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss action error" className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]">
        <span className="material-symbols-rounded text-[16px]">close</span>
      </button>
    </div>
  );
}

function ApplicationDrawer({
  app,
  initialAction,
  linkedResume,
  resumeLoading,
  showResumePreview,
  setShowResumePreview,
  editingNotes,
  setEditingNotes,
  downloading,
  followUpLoading,
  prepLoading,
  outcomeLoading,
  initialOutcomeConfirmation,
  prepData,
  showPrepCard,
  setShowPrepCard,
  closeRef,
  skillProgress,
  skillSummary,
  actionError,
  onDismissActionError,
  onClose,
  onStatusUpdate,
  onNotesSave,
  onDelete,
  onDownloadPDF,
  onDownloadWord,
  onOutcome,
  onOfferInputChange,
  onSaveOffer,
  onGenerateOfferBrief,
  onNegotiationStatus,
  onFollowUp,
  onInterviewPrep,
  onAsk,
}: {
  app: JobApplication | null;
  initialAction: InboxDrawerAction | null;
  linkedResume: ResumeVersion | null;
  resumeLoading: boolean;
  showResumePreview: boolean;
  setShowResumePreview: (value: boolean) => void;
  editingNotes: string;
  setEditingNotes: (value: string) => void;
  downloading: boolean;
  followUpLoading: boolean;
  prepLoading: boolean;
  outcomeLoading: boolean;
  initialOutcomeConfirmation: NonNullable<JobApplication['outcome_response']> | null;
  prepData: { questions: any[]; questionsToAsk: any[]; prepNotes: string } | null;
  showPrepCard: boolean;
  setShowPrepCard: (value: boolean) => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  skillProgress: number | null;
  skillSummary: SkillBridgeSummary;
  actionError: string | null;
  onDismissActionError: () => void;
  onClose: () => void;
  onStatusUpdate: (app: JobApplication, status: JobApplication['status']) => void;
  onNotesSave: () => void;
  onDelete: (id: string) => void;
  onDownloadPDF: () => void;
  onDownloadWord: () => void;
  onOutcome: (outcome: NonNullable<JobApplication['outcome_response']>) => Promise<void>;
  onOfferInputChange: () => void;
  onSaveOffer: (app: JobApplication, offerDetails: OfferDetails, status?: JobApplication['negotiation_status']) => Promise<JobApplication | null>;
  onGenerateOfferBrief: (app: JobApplication, offerDetails: OfferDetails) => Promise<NegotiationBrief>;
  onNegotiationStatus: (app: JobApplication, status: NonNullable<JobApplication['negotiation_status']>) => void;
  onFollowUp: (id: string) => void;
  onInterviewPrep: (app: JobApplication) => void;
  onAsk: (app: JobApplication) => void;
}) {
  const [confirmOutcome, setConfirmOutcome] = useState<NonNullable<JobApplication['outcome_response']> | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const workflowDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const surface = workflowDrawerRef.current;
    if (!app || !surface) return;
    const keydown = (event: KeyboardEvent) => trapWorkflowTab(event, surface);
    surface.addEventListener('keydown', keydown);
    return () => surface.removeEventListener('keydown', keydown);
  }, [app?.id]);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const confirmSubmitRef = useRef<HTMLButtonElement>(null);
  const outcomeTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setConfirmOutcome(initialOutcomeConfirmation);
  }, [app?.id, initialOutcomeConfirmation]);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmOutcome && !dialog.open) dialog.showModal();
    if (!confirmOutcome && dialog.open) dialog.close();
  }, [confirmOutcome]);

  const cancelOutcomeConfirmation = () => {
    setConfirmOutcome(null);
    if (confirmDialogRef.current?.open) confirmDialogRef.current.close();
  };

  const restoreOutcomeFocus = () => {
    const target = outcomeTriggerRef.current || document.getElementById('application-action-outcome');
    window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!app || !initialAction) return;
    const timeout = window.setTimeout(() => {
      const target = document.getElementById(`application-action-${initialAction}`)
        || document.getElementById('application-action-application');
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [app?.id, initialAction]);

  return (
    <AnimatePresence>
      {app && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-[var(--modal-backdrop)] backdrop-blur-sm" />
          <motion.aside data-guide="application-detail" data-guide-surface="application-detail"
            role="dialog"
            ref={workflowDrawerRef}
            aria-modal="true"
            aria-label={`${app.company_name} application details`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="taco-application-drawer fixed inset-x-0 bottom-0 top-8 z-50 flex w-full flex-col rounded-t-[24px] border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-raised sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-2xl sm:rounded-none sm:border-l sm:border-t-0"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4 md:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyAvatar company={app.company_name} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-[var(--text-primary)]">{app.company_name}</h2>
                  <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{app.job_title || 'Position not specified'}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PageHelp toolId="applications" />
              <button
                  type="button"
                  onClick={() => onAsk(app)}
                  aria-label={`Ask Taco about ${app.company_name}`}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[11px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-hover)] sm:px-3"
                >
                  <AssistantMark size="xs" state="idle" />
                  <span className="sm:hidden">Ask</span>
                  <span className="hidden sm:inline">Ask <TacoName /></span>
                </button>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close application details" className="grid h-11 w-11 place-items-center rounded-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-[20px]">close</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <div className="space-y-4">
                <ApplicationPacketReview key={app.id} app={app} />
                <ApplicationDossier app={app} linkedResume={linkedResume} skillProgress={skillProgress} skillSummary={skillSummary} />
                <SkillBridgePanel app={app} summary={skillSummary} />

                <DrawerSection id="application-action-application" title="Status and next action" icon="route">
                  {isApplicationDraft(app) && (
                    <div className="mb-3 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="material-symbols-rounded icon-status-warning mt-0.5 shrink-0 text-[18px]" aria-hidden="true">lock</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Draft, not submitted</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                            Open the posting and submit it yourself. Mark applied only after that step is done.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STATUS_KEYS.map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => onStatusUpdate(app, status)}
                        className={`rounded-[13px] border p-3 text-left text-xs transition-colors ${app.status === status ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]'}`}
                        style={{ borderColor: app.status === status ? soft(STATUS_CONFIG[status].color, '45') : 'var(--border-subtle)', color: STATUS_CONFIG[status].color }}
                        aria-pressed={app.status === status}
                      >
                        <span className="material-symbols-rounded block text-[18px]">{STATUS_CONFIG[status].icon}</span>
                        <span className="mt-1 block font-semibold">{STATUS_CONFIG[status].label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canFollowUp(app) && (
                      <button data-guide="application-followup" id="application-action-followup" type="button" onClick={() => onFollowUp(app.id)} disabled={followUpLoading} className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--warning)] disabled:opacity-50">
                        <span className="material-symbols-rounded text-[18px]">forward_to_inbox</span>
                        Draft follow-up
                      </button>
                    )}
                    {needsPrep(app) && (
                      <button type="button" onClick={() => onInterviewPrep(app)} disabled={prepLoading} className="inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50">
                        <span className="material-symbols-rounded text-[18px]">psychology</span>
                        Prep interview
                      </button>
                    )}
                    {app.application_link && (
                      <a href={app.application_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                        <span className="material-symbols-rounded text-[18px]">open_in_new</span>
                        Open posting
                      </a>
                    )}
                  </div>
                  {actionError && <ActionFeedback message={actionError} onDismiss={onDismissActionError} />}
                  {followUpLoading && <AssistantThinkingTile compact variant="agent" title="Taco is drafting" description="Preparing a concise follow-up." className="mt-3" />}
                  {prepLoading && <AssistantThinkingTile compact variant="agent" title="Taco is preparing" description="Building interview questions and notes." className="mt-3" />}
                </DrawerSection>

                <DrawerSection title="Linked resume" icon="description">
                  {resumeLoading ? (
                    <AssistantThinkingTile compact variant="resume" title="Loading resume" description="Finding the version tied to this application." />
                  ) : linkedResume ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-[var(--accent-dim)] text-[var(--accent)]">
                          <span className="material-symbols-rounded text-[20px]">description</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{linkedResume.version_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">Saved {formatDate(linkedResume.created_at)}</p>
                        </div>
                        <button type="button" onClick={() => setShowResumePreview(!showResumePreview)} className="text-xs font-semibold text-[var(--accent)]">{showResumePreview ? 'Hide' : 'Preview'}</button>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={onDownloadPDF} disabled={downloading} className="flex-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50">Download PDF</button>
                        <button type="button" onClick={onDownloadWord} disabled={downloading} className="flex-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50">Download Word</button>
                      </div>
                      <AnimatePresence>
                        {showResumePreview && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <ResumePreviewCard resume={linkedResume.content as any} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
                      No saved resume is linked. <Link href="/suite/resume" className="font-semibold text-[var(--accent)]">Create one in Resume Studio</Link>.
                    </div>
                  )}
                </DrawerSection>

                <DrawerSection title="Notes" icon="edit_note">
                  <textarea
                    value={editingNotes}
                    onChange={event => setEditingNotes(event.target.value)}
                    rows={4}
                    placeholder="Add recruiter names, deadlines, interview notes, or follow-up context."
                    className="w-full resize-none rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
                  />
                  {editingNotes !== (app.notes || '') && (
                    <button type="button" onClick={onNotesSave} className="mt-2 rounded-[11px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">Save notes</button>
                  )}
                </DrawerSection>

                <DrawerSection id="application-action-outcome" title="Outcome" icon="fact_check">
                  {isApplicationDraft(app) ? (
                    <div className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Apply manually and mark this record applied before logging an outcome.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {app.outcome_response && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-secondary)]">Latest response</span>
                          <OutcomeBadge outcome={app.outcome_response} />
                          <span className="text-xs text-[var(--text-muted)]">Reported {formatDate(app.outcome_reported_at)}</span>
                        </div>
                      )}
                      {availableOutcomeUpdates(app).length > 0 ? (
                        <div>
                          {app.outcome_response && (
                            <p className="mb-2 text-xs leading-5 text-[var(--text-secondary)]">
                              Update this when the application advances. Earlier responses stay in the outcome history.
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            {availableOutcomeUpdates(app).map(outcome => (
                              <button
                                key={outcome}
                                type="button"
                                onClick={event => {
                                  if (['offer', 'rejection', 'ghosted'].includes(outcome)) {
                                    outcomeTriggerRef.current = event.currentTarget;
                                    setConfirmOutcome(outcome);
                                  } else {
                                    void onOutcome(outcome);
                                  }
                                }}
                                disabled={outcomeLoading || Boolean(confirmOutcome)}
                                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[11px] border px-2 py-2 text-center text-xs font-semibold disabled:cursor-wait disabled:opacity-50 sm:px-3"
                                style={{ color: OUTCOME_CONFIG[outcome].color, background: soft(OUTCOME_CONFIG[outcome].color), borderColor: soft(OUTCOME_CONFIG[outcome].color, '30') }}
                              >
                                <span className={`material-symbols-rounded shrink-0 text-[15px] ${outcomeLoading ? 'animate-pulse' : ''}`} aria-hidden="true">
                                  {OUTCOME_CONFIG[outcome].icon}
                                </span>
                                <span className="min-w-0 wrap-natural">{OUTCOME_CONFIG[outcome].label}</span>
                              </button>
                            ))}
                          </div>
                          <dialog
                            ref={confirmDialogRef}
                            aria-labelledby="confirm-outcome-title"
                            aria-describedby="confirm-outcome-description"
                            onCancel={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              cancelOutcomeConfirmation();
                            }}
                            onKeyDown={event => {
                              if (event.key === 'Escape') event.stopPropagation();
                              if (event.key !== 'Tab') return;
                              const first = confirmCancelRef.current;
                              const last = confirmSubmitRef.current;
                              if (!first || !last) return;
                              if (event.shiftKey && document.activeElement === first) {
                                event.preventDefault();
                                last.focus();
                              } else if (!event.shiftKey && document.activeElement === last) {
                                event.preventDefault();
                                first.focus();
                              }
                            }}
                            onClose={restoreOutcomeFocus}
                            className="m-auto w-[calc(100vw_-_2rem)] max-w-sm rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-0 text-[var(--text-primary)] elevation-raised backdrop:bg-[var(--modal-backdrop)]"
                          >
                            {confirmOutcome && availableOutcomeUpdates(app).includes(confirmOutcome) && (
                              <div className="p-4">
                                <p id="confirm-outcome-title" className="text-base font-semibold text-[var(--text-primary)]">
                                  Confirm {OUTCOME_CONFIG[confirmOutcome].label.toLowerCase()}?
                                </p>
                                <p id="confirm-outcome-description" className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                  This records a final response for {app.company_name}. Earlier callback and interview evidence will stay in the history.
                                </p>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    ref={confirmCancelRef}
                                    autoFocus
                                    onClick={cancelOutcomeConfirmation}
                                    disabled={outcomeLoading}
                                    className="inline-flex min-h-11 items-center justify-center rounded-[11px] border border-[var(--border-subtle)] px-3 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    ref={confirmSubmitRef}
                                    onClick={() => {
                                      const outcome = confirmOutcome;
                                      cancelOutcomeConfirmation();
                                      void onOutcome(outcome);
                                    }}
                                    disabled={outcomeLoading}
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-3 text-sm font-semibold text-[var(--bg-deep)] disabled:cursor-wait disabled:opacity-50"
                                  >
                                    <span className={`material-symbols-rounded text-[17px] ${outcomeLoading ? 'animate-spin' : ''}`} aria-hidden="true">
                                      {outcomeLoading ? 'progress_activity' : 'check'}
                                    </span>
                                    Confirm {OUTCOME_CONFIG[confirmOutcome].label.toLowerCase()}
                                  </button>
                                </div>
                              </div>
                            )}
                          </dialog>
                        </div>
                      ) : app.outcome_response ? (
                        <p className="text-xs leading-5 text-[var(--text-secondary)]">This outcome is final. Its earlier response history remains attached to the application.</p>
                      ) : null}
                    </div>
                  )}
                </DrawerSection>

                {isOfferStage(app) && (
                  <OfferCoachSection
                    key={app.id}
                    app={app}
                    focusId="application-action-offer"
                    onInputChange={onOfferInputChange}
                    onSave={onSaveOffer}
                    onGenerate={onGenerateOfferBrief}
                    onStatus={onNegotiationStatus}
                  />
                )}

                {showPrepCard && prepData && (
                  <DrawerSection title="Interview prep" icon="psychology">
                    <div className="space-y-3">
                      {prepData.questions.map((question: any, index: number) => (
                        <div key={`${question.question}-${index}`} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{question.question}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{question.tip}</p>
                          {question.matchedStory && <p className="mt-2 text-xs font-semibold text-[var(--accent)]">Story: {question.matchedStory}</p>}
                        </div>
                      ))}
                      {prepData.questionsToAsk.length > 0 && (
                        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--success)]">Questions to ask</p>
                          <div className="mt-2 space-y-2">
                            {prepData.questionsToAsk.map((question: any, index: number) => (
                              <p key={`${question.question}-${index}`} className="text-sm text-[var(--text-primary)]">{question.question}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      <button type="button" onClick={() => setShowPrepCard(false)} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]">Hide prep</button>
                    </div>
                  </DrawerSection>
                )}

                <DrawerSection title="Timeline" icon="history">
                  <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                    <p>Created {formatDate(app.created_at)}</p>
                    {app.applied_at && <p>Applied {formatDate(app.applied_at)}</p>}
                    {app.last_updated && <p>Updated {formatDate(app.last_updated)}</p>}
                    {app.interview_date && <p>Interview {formatDate(app.interview_date)}</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/suite/skill-bridge?applicationId=${app.id}`} className="rounded-[12px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Open Skill Bridge</Link>
                    <button type="button" onClick={() => onDelete(app.id)} className="rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">Delete</button>
                  </div>
                </DrawerSection>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function OfferCoachSection({
  app,
  focusId,
  onInputChange,
  onSave,
  onGenerate,
  onStatus,
}: {
  app: JobApplication;
  focusId?: string;
  onInputChange: () => void;
  onSave: (app: JobApplication, offerDetails: OfferDetails, status?: JobApplication['negotiation_status']) => Promise<JobApplication | null>;
  onGenerate: (app: JobApplication, offerDetails: OfferDetails) => Promise<NegotiationBrief>;
  onStatus: (app: JobApplication, status: NonNullable<JobApplication['negotiation_status']>) => void;
}) {
  const [draft, setDraftState] = useState(() => offerDetailsToDraft(app.offer_details));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(!app.negotiation_brief);
  const [offerError, setOfferError] = useState<string | null>(null);
  const revisionRef = useRef(0); const mounted = useRef(true); const busyRef = useRef(false);
  const savedSignature = JSON.stringify(offerDetailsToDraft(app.offer_details));
  const lastSavedSignature = useRef(savedSignature);
  const draftSignature = JSON.stringify(draft);
  const edited = draftSignature !== savedSignature;
  const brief = app.negotiation_brief?.method === 'entered_offer_v1' && app.negotiation_brief.sourceOfferSignature === draftSignature ? app.negotiation_brief : null;
  function setDraft(next: typeof draft) { revisionRef.current += 1; onInputChange(); setDraftState(next); setOfferError(null); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revisionRef.current += 1; }; }, []);
  const hasComp = Boolean(draft.base || draft.total);


  useEffect(() => {
    // Server refreshes may update the brief while the user is editing. Only
    // synchronize the fields when they still match the prior saved values.
    if (draftSignature === lastSavedSignature.current) setDraftState(offerDetailsToDraft(app.offer_details));
    lastSavedSignature.current = savedSignature;
  }, [app.id, savedSignature]);

  const offerDetails = draftToOfferDetails(draft);

  async function saveDetails() {
    if (busyRef.current) return; busyRef.current = true;
    const revision = revisionRef.current;
    const current = () => mounted.current && revision === revisionRef.current;
    setSaving(true);
    setOfferError(null);
    try {
      const saved = await onSave(app, offerDetails, app.negotiation_status || 'not_started');
      if (!current()) return;
      if (!saved) setOfferError('Offer details were not saved. Check the fields and try again.');
    } catch (error: any) {
      if (!current()) return;
      setOfferError(error.message || 'Offer details were not saved. Try again.');
    } finally {
      if (mounted.current) { busyRef.current = false; setSaving(false); }
    }
  }

  async function generateBrief() {
    if (!hasComp) {
      showToast('Add base or total compensation first', 'warning');
      return;
    }
    if (busyRef.current) return; busyRef.current = true;
    const revision = revisionRef.current;
    const current = () => mounted.current && revision === revisionRef.current;
    setGenerating(true);
    setOfferError(null);
    try {
      await onGenerate(app, offerDetails);
      if (!current()) return;
      setShowDetails(false);
    } catch (error: any) {
      if (!current()) return;
      const message = error.message || 'Failed to generate negotiation brief';
      setOfferError(message);
      showToast(message, 'cancel');
    } finally {
      if (mounted.current) { busyRef.current = false; setGenerating(false); }
    }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); if (mounted.current) showToast(`${label} copied`, 'content_copy'); } catch { if (mounted.current) setOfferError('Clipboard unavailable. Select and copy the text manually.'); }
  }

  return (
    <DrawerSection id={focusId} title="Offer Coach" icon="payments"><div data-guide="application-offer">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-[15px] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{getOfferAction(app).label}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Evaluate the offer, prepare a counter, and keep the final decision attached to this application.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
            <span className="material-symbols-rounded text-[14px]">verified</span>
            {formatNegotiationStatus(app.negotiation_status)}
          </span>
        </div>

        {app.negotiation_brief && !brief && <p role="status" className="text-sm text-[var(--text-muted)]">{edited ? 'Offer details have changed. Save and refresh the brief before using it.' : 'This saved brief lacks current input provenance. Refresh it to review a brief based on your entered offer; legacy market claims are hidden.'}</p>}
        {offerError && <ActionFeedback message={offerError} onDismiss={() => setOfferError(null)} />}

        <button
          type="button"
          onClick={() => setShowDetails(value => !value)}
          className="flex w-full items-center justify-between rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <span>{showDetails ? 'Hide offer details' : 'Edit offer details'}</span>
          <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">{showDetails ? 'expand_less' : 'expand_more'}</span>
        </button>

        <AnimatePresence initial={false}>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <OfferInput label={`Base salary (${draft.currency} / ${draft.period})`} value={draft.base} onChange={value => setDraft({ ...draft, base: value })} placeholder="190000" />
                <OfferInput label={`Total comp (${draft.currency} / ${draft.period})`} value={draft.total} onChange={value => setDraft({ ...draft, total: value })} placeholder="235000" />
                <OfferInput label={`Bonus (${draft.currency} / ${draft.period})`} value={draft.bonus} onChange={value => setDraft({ ...draft, bonus: value })} placeholder="15000" />
                <OfferInput label={`Sign-on (${draft.currency} once)`} value={draft.signOn} onChange={value => setDraft({ ...draft, signOn: value })} placeholder="20000" />
                <OfferInput label={`Desired base (${draft.currency} / ${draft.period})`} value={draft.desiredBase} onChange={value => setDraft({ ...draft, desiredBase: value })} placeholder="215000" />
                <OfferInput label={`Desired total (${draft.currency} / ${draft.period})`} value={draft.desiredTotal} onChange={value => setDraft({ ...draft, desiredTotal: value })} placeholder="275000" />
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Equity</span>
                  <input value={draft.equity} onChange={event => setDraft({ ...draft, equity: event.target.value })} placeholder="RSUs, options, vesting details" className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Decision deadline</span>
                  <input type="date" value={draft.deadline} onChange={event => setDraft({ ...draft, deadline: event.target.value })} className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">Competing offer</span>
                    <span className="block text-xs text-[var(--text-muted)]">Use only if true.</span>
                  </span>
                  <input type="checkbox" checked={draft.competingOffer} onChange={event => setDraft({ ...draft, competingOffer: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                </label>
                <label>Currency<select value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })} className="min-h-11 w-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3">{['USD','EUR','GBP','CAD','AUD','INR','JPY'].map(value => <option key={value}>{value}</option>)}</select></label>
                <label>Pay period<select value={draft.period} onChange={event => setDraft({ ...draft, period: event.target.value as OfferDetails['period'] || 'year' })} className="min-h-11 w-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3"><option value="year">Annual</option><option value="month">Monthly</option><option value="hour">Hourly</option></select></label>
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Benefits and context</span>
                  <textarea value={draft.context} onChange={event => setDraft({ ...draft, context: event.target.value })} rows={3} placeholder="Benefits, recruiter notes, deadlines, location, or anything unusual." className="w-full resize-none rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={saveDetails} disabled={saving || generating} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save offer'}
                </button>
                <button type="button" onClick={generateBrief} disabled={saving || generating || !hasComp} className="rounded-[12px] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--success)] disabled:opacity-50">
                  {generating ? 'Preparing...' : brief ? 'Refresh brief' : 'Evaluate offer'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {generating && (
          <AssistantThinkingTile
            compact
            variant="success"
            icon="handshake"
            title="Taco is preparing your offer brief"
            description="Checking compensation, leverage, counter language, and non-salary asks."
            activeStage="counter"
            stages={['Offer', 'Leverage', 'Counter', 'Script']}
          />
        )}

        {brief && (
          <div className="space-y-3">
            <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Negotiation brief</span>

              </div>
<p className="mt-2 text-sm text-[var(--text-secondary)]">Based on your entered offer and preferences. No market benchmark is available.</p>
              {brief.counterStrategy && <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{brief.counterStrategy}</p>}

            </div>

            <OfferList title="Leverage points" items={brief.leveragePoints} tone="var(--success)" />
            <OfferList title="Non-salary asks" items={brief.nonSalaryAsks} tone="var(--accent)" />
            <OfferList title="Red flags" items={brief.redFlags} tone="var(--danger)" />

            {brief.emailScript && (
              <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Email script</p>
                  <button type="button" onClick={() => copy(brief.emailScript || '', 'Email script')} className="rounded-[10px] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Copy</button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{brief.emailScript}</p>
              </div>
            )}

            {brief.phoneScript && (
              <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Phone notes</p>
                  <button type="button" onClick={() => copy(brief.phoneScript || '', 'Phone notes')} className="rounded-[10px] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Copy</button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{brief.phoneScript}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onStatus(app, 'counter_sent')} className="rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--warning)]">Counter sent</button>
              <button type="button" onClick={() => onStatus(app, 'accepted')} className="rounded-[12px] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--success)]">Accepted</button>
              <button type="button" onClick={() => onStatus(app, 'declined')} className="rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">Declined</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {[
            ['Ask Taco', `Help me think through this offer from ${app.company_name}.`],
            ['Rewrite email', `Rewrite my negotiation email for ${app.company_name} so it is concise and professional.`],
            ['Make it warmer', `Make my ${app.company_name} counter-offer message warmer while keeping the ask clear.`],
            ['Make it firmer', `Make my ${app.company_name} counter-offer message firmer without sounding aggressive.`],
            ['If they say no', `What should I do if ${app.company_name} says no to my counter offer?`],
          ].map(([label, prompt]) => (
            <button key={label} type="button" onClick={() => dispatchSona(prompt, `${app.company_name} offer`)} className="rounded-[11px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
    </DrawerSection>
  );
}

function offerDetailsToDraft(details?: OfferDetails | null) {
  return {
    currency: details?.currency || 'USD',
    period: details?.period || 'year',
    base: details?.base ? String(details.base) : '',
    total: details?.total ? String(details.total) : '',
    bonus: details?.bonus ? String(details.bonus) : '',
    signOn: details?.signOn ? String(details.signOn) : '',
    desiredBase: details?.desiredBase ? String(details.desiredBase) : '',
    desiredTotal: details?.desiredTotal ? String(details.desiredTotal) : '',
    equity: details?.equity || '',
    deadline: formatDateForInput(details?.deadline),
    competingOffer: Boolean(details?.competingOffer),
    context: details?.context || details?.benefits || '',
  };
}

function draftToOfferDetails(draft: ReturnType<typeof offerDetailsToDraft>): OfferDetails {
  return {
    currency: draft.currency, period: draft.period,
    base: parseOfferNumber(draft.base),
    total: parseOfferNumber(draft.total),
    bonus: parseOfferNumber(draft.bonus),
    signOn: parseOfferNumber(draft.signOn),
    desiredBase: parseOfferNumber(draft.desiredBase),
    desiredTotal: parseOfferNumber(draft.desiredTotal),
    equity: draft.equity.trim() || null,
    benefits: draft.context.trim() || null,
    deadline: draft.deadline || null,
    competingOffer: draft.competingOffer,
    context: draft.context.trim() || null,
  };
}

function parseOfferNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatNegotiationStatus(status?: JobApplication['negotiation_status']) {
  if (status === 'counter_sent') return 'Counter sent';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (status === 'drafted') return 'Brief ready';
  return 'Not started';
}

function OfferInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
      />
    </label>
  );
}

function OfferRangeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">${Math.round(value / 1000)}k</p>
    </div>
  );
}

function OfferList({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.slice(0, 3).map(item => (
          <p key={item} className="flex gap-2 text-sm leading-5 text-[var(--text-secondary)]">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
            <span>{item}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function DrawerSection({ id, title, icon, children }: { id?: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className="taco-application-drawer-section elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FollowUpModal({ draft, open, onClose }: { draft: { subject: string; body: string; timing: string; daysSinceApplied: number } | null; open: boolean; onClose: () => void }) {
  if (!draft) return null;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-[var(--modal-backdrop)] backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-draft-title"
            className="fixed inset-x-4 top-[6vh] z-[61] mx-auto flex max-h-[88vh] max-w-xl flex-col overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-raised"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-5">
              <div>
                <h2 id="follow-up-draft-title" className="text-lg font-bold text-[var(--text-primary)]">Follow-up draft</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{draft.daysSinceApplied} days since applied, timing: {draft.timing}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close follow-up draft" className="grid h-11 w-11 place-items-center rounded-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                <span className="material-symbols-rounded text-[19px]">close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Subject</p>
                <div className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-primary)]">{draft.subject}</div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Body</p>
                <div className="whitespace-pre-wrap rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm leading-6 text-[var(--text-primary)]">{draft.body}</div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--border-subtle)] p-4">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
                  showToast('Copied to clipboard', 'content_copy');
                }}
                className="flex-1 rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--warning)]"
              >
                Copy email
              </button>
              <button type="button" onClick={onClose} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]">
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ResumePreviewCard({ resume }: { resume: any }) {
  if (!resume) return null;
  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-[var(--text-secondary)]" style={{ fontSize: '12px', lineHeight: '1.55' }}>
      <div className="mb-3 border-b border-[var(--border-subtle)] pb-3 text-center">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{resume.name || 'Your Name'}</h2>
        {resume.title && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{resume.title}</p>}
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{[resume.email, resume.phone, resume.location].filter(Boolean).join(' | ')}</p>
      </div>
      {resume.summary && (
        <div className="mb-3">
          <h3 className="mb-1.5 border-b border-[var(--border-subtle)] pb-1 text-xs font-bold uppercase text-[var(--text-secondary)]">Professional summary</h3>
          <p>{resume.summary}</p>
        </div>
      )}
      {resume.experience?.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 border-b border-[var(--border-subtle)] pb-1 text-xs font-bold uppercase text-[var(--text-secondary)]">Experience</h3>
          {resume.experience.map((exp: any, index: number) => (
            <div key={index} className="mb-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[var(--text-primary)]">{exp.role}</span>
                <span className="whitespace-nowrap text-[11px] text-[var(--text-muted)]">{exp.duration}</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">{exp.company}</p>
              {exp.achievements?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {exp.achievements.slice(0, 4).map((item: string, itemIndex: number) => (
                    <li key={itemIndex} className="pl-3 text-[var(--text-secondary)]">- {item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {resume.skills?.length > 0 && (
        <div>
          <h3 className="mb-1.5 border-b border-[var(--border-subtle)] pb-1 text-xs font-bold uppercase text-[var(--text-secondary)]">Skills</h3>
          <div className="flex flex-wrap gap-1">
            {resume.skills.flatMap((cat: any) => cat.items).slice(0, 18).map((skill: string, index: number) => (
              <span key={`${skill}-${index}`} className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">{skill}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


interface ApplicationReviewSnapshot {
  id: string;
  user_id: string;
  review_revision: string;
  review_ready: boolean;
  review_status: 'needs_review' | 'blocked' | 'stale' | 'approved';
  review_error?: string | null;
  review_source?: Record<string, unknown> | null;
  review_resume?: Record<string, unknown> | null;
  cover_letter?: string;
  keyword_gaps?: string[];
}

function ApplicationPacketReview({ app }: { app: JobApplication }) {
  const user = useStore(state => state.user);
  const [snapshot, setSnapshot] = useState<ApplicationReviewSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const operationRef = useRef<AbortController | null>(null);
  const generated = app.source === 'apply_pipeline';
  const visibleSnapshot = snapshot?.user_id === user?.uid && snapshot?.id === app.id ? snapshot : null;

  useEffect(() => {
    if (!generated || !user?.uid) return;
    const controller = new AbortController();
    operationRef.current = controller;
    authFetch(`/api/agent/packet-review?kind=application&id=${encodeURIComponent(app.id)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'The current packet could not be loaded.');
        if (!controller.signal.aborted) { setSnapshot(result.data[0]); setError(''); }
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message || 'The current packet could not be loaded.'); });
    return () => controller.abort();
  }, [app.id, generated, reload, user?.uid]);

  async function approve() {
    if (!visibleSnapshot?.review_ready || !operationRef.current || operationRef.current.signal.aborted) return;
    const controller = operationRef.current;
    setBusy(true);
    setError('');
    try {
      const response = await authFetch('/api/agent/packet-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ kind: 'application', id: app.id, action: 'approve', revision: visibleSnapshot.review_revision }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !result.success) {
        setSnapshot(null);
        throw new Error(result.error || 'The review could not be saved.');
      }
      setSnapshot(previous => previous ? { ...previous, review_status: 'approved' } : null);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The review could not be saved.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (app.source === 'agent_queue' && app.source_meta?.queue_id) return (
    <DrawerSection title="Packet review" icon="fact_check">
      <Link href={`/suite/agent/queue?packet=${encodeURIComponent(app.source_meta.queue_id)}`} className="font-semibold text-[var(--accent)]">Open the linked packet and its review</Link>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">The tracker records your application separately from the packet review.</p>
    </DrawerSection>
  );
  if (!generated) return null;
  return (
    <DrawerSection title="Review prepared documents" icon="fact_check"><div data-guide="application-document-review">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">Compare the saved source with the prepared resume and cover letter. Approval applies to these drafts and does not submit an application.</p>
      {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      {!visibleSnapshot && !error && <p className="mt-3 text-sm" role="status">Loading the current documents…</p>}
      {visibleSnapshot && (
        <div className="mt-3 space-y-3">
          {visibleSnapshot.review_error && <p className="text-sm text-[var(--warning)]">{visibleSnapshot.review_error}</p>}
          <details className="border border-[var(--border-subtle)] p-3">
            <summary className="cursor-pointer font-semibold">Source resume</summary>
                {visibleSnapshot.review_source ? <PacketResumeDocument resume={visibleSnapshot.review_source} /> : <p className="mt-2 text-sm">The source is no longer available.</p>}
          </details>
          <details open className="border border-[var(--border-subtle)] p-3">
            <summary className="cursor-pointer font-semibold">Prepared resume</summary>
                {visibleSnapshot.review_resume ? <PacketResumeDocument resume={visibleSnapshot.review_resume} /> : <p className="mt-2 text-sm">The prepared resume is not available.</p>}
          </details>
          <details open className="border border-[var(--border-subtle)] p-3">
            <summary className="cursor-pointer font-semibold">Cover letter</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{visibleSnapshot.cover_letter || 'The cover letter is not available.'}</p>
          </details>
          {Boolean(visibleSnapshot.keyword_gaps?.length) && <p className="text-sm text-[var(--text-secondary)]">Terms to check against your experience: {visibleSnapshot.keyword_gaps!.join(', ')}. These are suggestions to review.</p>}
          {visibleSnapshot.review_status === 'approved'
            ? <p className="border border-[var(--theme-border)] bg-[var(--bg-elevated)] p-3 font-semibold" role="status">These drafts are approved for use.</p>
            : <button type="button" onClick={approve} disabled={busy || !visibleSnapshot.review_ready} className="min-h-11 border border-[var(--theme-border)] bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--text-primary)] disabled:opacity-50">{busy ? 'Saving review…' : 'Approve these drafts for use'}</button>}
        </div>
      )}
      <button type="button" onClick={() => { setSnapshot(null); setError(''); setBusy(false); setReload(value => value + 1); }} disabled={busy} className="mt-3 min-h-11 px-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50">Reload current documents</button></div>
    </DrawerSection>
  );
}


export default function ApplicationsPage() {
  const searchParams = useSearchParams();
  const owner = useStore(state => state.user?.uid || 'guest');
  const review = searchParams.get('view') === 'review';
  return review ? <QueueContent key={owner} /> : <ApplicationsWorkspace key={owner} />;
}
