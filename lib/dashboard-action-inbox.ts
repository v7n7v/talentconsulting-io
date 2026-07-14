export type DashboardActionKind =
  | 'packet'
  | 'offer'
  | 'interview'
  | 'debrief'
  | 'outcome'
  | 'followup'
  | 'application';

export interface DashboardActionInboxItem {
  id: string;
  kind: DashboardActionKind;
  icon: string;
  eyebrow: string;
  title: string;
  subject: string;
  detail: string;
  actionLabel: string;
  href: string;
  priority: number;
  urgency: number;
}

export interface DashboardActionInboxResult {
  items: DashboardActionInboxItem[];
  total: number;
  counts: Record<DashboardActionKind, number>;
}

export interface DashboardQueueInput {
  id: string;
  status?: string;
  company?: string;
  job_title?: string;
  match_score?: number;
  expires_at?: string;
  sourceMeta?: {
    sourceConfidence?: string;
  } | null;
}

export interface DashboardApplicationInput {
  id: string;
  company_name?: string;
  job_title?: string;
  status?: string;
  created_at?: string;
  applied_at?: string;
  interview_date?: string;
  outcome_response?: string | null;
  offer_details?: unknown;
  negotiation_status?: string;
  packet_status?: string | null;
}

const DAY_MS = 86_400_000;
const EMPTY_COUNTS: Record<DashboardActionKind, number> = {
  packet: 0,
  offer: 0,
  interview: 0,
  debrief: 0,
  outcome: 0,
  followup: 0,
  application: 0,
};

function timestamp(value?: string) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function daysSince(value: string | undefined, now: number) {
  const parsed = timestamp(value);
  if (parsed === null) return 0;
  return Math.max(0, Math.floor((now - parsed) / DAY_MS));
}

function daysUntil(value: string | undefined, now: number) {
  const parsed = timestamp(value);
  if (parsed === null) return null;
  return Math.ceil((parsed - now) / DAY_MS);
}

function cleanLabel(value: string | undefined, fallback: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function fitScore(value: number | undefined) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function applicationHref(id: string, action: DashboardActionKind) {
  return `/suite/applications?application=${encodeURIComponent(id)}&action=${encodeURIComponent(action)}`;
}

function buildPacketAction(item: DashboardQueueInput, now: number): DashboardActionInboxItem | null {
  if (!item.id || item.status !== 'pending') return null;
  const company = cleanLabel(item.company, 'Company not named');
  const role = cleanLabel(item.job_title, 'Prepared role');
  const score = fitScore(item.match_score);
  const expiry = daysUntil(item.expires_at, now);
  const confidence = cleanLabel(item.sourceMeta?.sourceConfidence, 'unverified').toLowerCase();
  const expiryText = expiry === null
    ? 'Review before the role changes'
    : expiry <= 0
      ? 'Expires today'
      : expiry === 1
        ? 'Expires tomorrow'
        : `Expires in ${expiry} days`;

  return {
    id: `packet:${item.id}`,
    kind: 'packet',
    icon: 'fact_check',
    eyebrow: 'Packet review',
    title: role,
    subject: company,
    detail: `${score === null ? 'Fit pending' : `${score}% fit`} · ${confidence} source · ${expiryText}`,
    actionLabel: 'Review packet',
    href: `/suite/agent/queue?packet=${encodeURIComponent(item.id)}`,
    priority: expiry !== null && expiry <= 1 ? 0 : 1,
    urgency: expiry === null ? Number.MAX_SAFE_INTEGER : expiry,
  };
}

function buildApplicationAction(
  app: DashboardApplicationInput,
  now: number,
  debriefedApplicationIds: ReadonlySet<string>,
  allowDebriefActions: boolean,
): DashboardActionInboxItem | null {
  if (!app.id) return null;
  const company = cleanLabel(app.company_name, 'Company not named');
  const role = cleanLabel(app.job_title, 'Role not named');
  const age = daysSince(app.applied_at || app.created_at, now);
  const interviewAt = timestamp(app.interview_date);
  const interviewDays = daysUntil(app.interview_date, now);
  const negotiationDone = app.status === 'accepted'
    || app.negotiation_status === 'accepted'
    || app.negotiation_status === 'declined';
  const offerDetails = app.offer_details && typeof app.offer_details === 'object'
    ? app.offer_details as Record<string, unknown>
    : null;
  const hasOfferEvidence = Boolean(offerDetails && Object.values(offerDetails).some(value => {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    if (typeof value === 'boolean') return value;
    return typeof value === 'string' && value.trim().length > 0;
  }));
  const offerStage = app.status === 'offer' || app.outcome_response === 'offer' || hasOfferEvidence;

  if (offerStage && !negotiationDone) {
    return {
      id: `offer:${app.id}`,
      kind: 'offer',
      icon: 'payments',
      eyebrow: 'Offer decision',
      title: role,
      subject: company,
      detail: 'Review compensation, deadline, and negotiation evidence',
      actionLabel: 'Review offer',
      href: applicationHref(app.id, 'offer'),
      priority: 0,
      urgency: 0,
    };
  }

  const debriefAge = daysSince(app.interview_date || app.applied_at || app.created_at, now);
  const needsRecentDebrief = allowDebriefActions && (
    app.status === 'interviewed'
    || (app.status === 'interview_scheduled' && interviewDays !== null && interviewDays < 0)
  ) && debriefAge <= 14 && !debriefedApplicationIds.has(app.id);

  if (needsRecentDebrief) {
    return {
      id: `debrief:${app.id}`,
      kind: 'debrief',
      icon: 'rate_review',
      eyebrow: 'Interview debrief',
      title: role,
      subject: company,
      detail: 'Capture questions, signals, and the next follow-up while they are fresh',
      actionLabel: 'Open debrief',
      href: `/suite/interview-sim?mode=debrief_review&application=${encodeURIComponent(app.id)}`,
      priority: 1,
      urgency: -debriefAge,
    };
  }

  if (app.status === 'interview_scheduled' && (interviewDays === null || interviewDays >= 0)) {
    const timing = interviewDays === null
      ? 'Interview date not set'
      : interviewDays < 0
        ? 'Interview date passed'
        : interviewDays === 0
          ? 'Interview today'
          : interviewDays === 1
            ? 'Interview tomorrow'
            : `Interview in ${interviewDays} days`;
    return {
      id: `interview:${app.id}`,
      kind: 'interview',
      icon: 'interpreter_mode',
      eyebrow: 'Interview prep',
      title: role,
      subject: company,
      detail: `${timing} · practise from this application`,
      actionLabel: 'Start prep',
      href: `/suite/interview-sim?mode=quick_drill&application=${encodeURIComponent(app.id)}`,
      priority: 1,
      urgency: interviewDays === null ? Number.MAX_SAFE_INTEGER : Math.abs(interviewDays),
    };
  }

  if (app.status === 'applied' && !app.outcome_response && age >= 7) {
    return {
      id: `outcome:${app.id}`,
      kind: 'outcome',
      icon: 'fact_check',
      eyebrow: 'Outcome check',
      title: role,
      subject: company,
      detail: `${age} days since applied · record what happened`,
      actionLabel: 'Log outcome',
      href: applicationHref(app.id, 'outcome'),
      priority: 2,
      urgency: -age,
    };
  }

  if (app.status === 'applied' && age >= 5) {
    return {
      id: `followup:${app.id}`,
      kind: 'followup',
      icon: 'forward_to_inbox',
      eyebrow: 'Follow-up due',
      title: role,
      subject: company,
      detail: `${age} days since applied · prepare before sending`,
      actionLabel: 'Draft follow-up',
      href: applicationHref(app.id, 'followup'),
      priority: 3,
      urgency: -age,
    };
  }

  if (app.status === 'not_applied' && app.packet_status === 'tracker_draft') {
    return {
      id: `application:${app.id}`,
      kind: 'application',
      icon: 'open_in_new',
      eyebrow: 'Ready to submit',
      title: role,
      subject: company,
      detail: 'Review the tracker draft, then submit on the company site',
      actionLabel: 'Open draft',
      href: applicationHref(app.id, 'application'),
      priority: 4,
      urgency: -daysSince(app.created_at, now),
    };
  }

  return null;
}

export function buildDashboardActionInbox(input: {
  queue?: DashboardQueueInput[];
  applications?: DashboardApplicationInput[];
  debriefedApplicationIds?: string[];
  allowDebriefActions?: boolean;
  now?: number;
  limit?: number;
}): DashboardActionInboxResult {
  const now = input.now ?? Date.now();
  const limit = Math.max(1, Math.min(10, Math.floor(input.limit ?? 3)));
  const debriefedApplicationIds = new Set(
    (input.debriefedApplicationIds || []).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200),
  );
  const all = [
    ...(input.queue || []).map(item => buildPacketAction(item, now)),
    ...(input.applications || []).map(item => buildApplicationAction(
      item,
      now,
      debriefedApplicationIds,
      input.allowDebriefActions !== false,
    )),
  ].filter((item): item is DashboardActionInboxItem => Boolean(item));

  all.sort((a, b) => a.priority - b.priority || a.urgency - b.urgency || a.id.localeCompare(b.id));
  const counts = { ...EMPTY_COUNTS };
  all.forEach(item => {
    counts[item.kind] += 1;
  });

  return {
    items: all.slice(0, limit),
    total: all.length,
    counts,
  };
}
