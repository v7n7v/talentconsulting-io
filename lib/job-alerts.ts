export type JobAlertsFrequency = 'daily' | 'weekly' | 'biweekly';
export type JobAlertsTier = 'free' | 'pro' | 'studio' | 'god';

export const JOB_ALERT_FREQUENCIES: JobAlertsFrequency[] = ['daily', 'weekly', 'biweekly'];
export const VISIBLE_JOB_ALERT_FREQUENCIES: Extract<JobAlertsFrequency, 'daily' | 'weekly'>[] = ['weekly', 'daily'];
const JOB_ALERT_TIME_ZONE = 'America/New_York';

const jobAlertDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: JOB_ALERT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const jobAlertWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: JOB_ALERT_TIME_ZONE,
  weekday: 'short',
});

export function isPaidJobAlertsTier(tier?: string | null) {
  return tier === 'pro' || tier === 'studio' || tier === 'god';
}

export function isMaxJobAlertsTier(tier?: string | null) {
  return tier === 'studio' || tier === 'god';
}

export function normalizeJobAlertsFrequency(
  value: unknown,
  tier: string | null | undefined = 'free'
): JobAlertsFrequency {
  if (value === 'daily' && isMaxJobAlertsTier(tier)) return 'daily';
  return 'weekly';
}

export function getJobAlertSendLimit(tier?: string | null) {
  if (isMaxJobAlertsTier(tier)) return 15;
  if (tier === 'pro') return 10;
  return 5;
}

export function getJobAlertFrequencyLabel(freq: JobAlertsFrequency, tier?: string | null) {
  return normalizeJobAlertsFrequency(freq, tier) === 'daily' ? 'Daily (weekdays)' : 'Weekly';
}

export function normalizeJobAlertKey(job: { title?: string; company?: string; location?: string; url?: string }) {
  const clean = (value = '') => value.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return [clean(job.company), clean(job.title), clean(job.location || ''), clean(job.url || '').slice(0, 90)]
    .filter(Boolean)
    .join('|');
}

function jobAlertDayKey(date: Date) {
  const parts = Object.fromEntries(
    jobAlertDateFormatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function jobAlertWeekday(date: Date) {
  switch (jobAlertWeekdayFormatter.format(date)) {
    case 'Mon': return 1;
    case 'Tue': return 2;
    case 'Wed': return 3;
    case 'Thu': return 4;
    case 'Fri': return 5;
    case 'Sat': return 6;
    default: return 0;
  }
}

function sameJobAlertDay(a: Date, b: Date) {
  return jobAlertDayKey(a) === jobAlertDayKey(b);
}

export function shouldSendJobAlertDigest({
  enabled,
  emailNotifications,
  frequency,
  tier,
  lastSentAt,
  now = new Date(),
}: {
  enabled: boolean;
  emailNotifications: boolean;
  frequency: JobAlertsFrequency;
  tier: JobAlertsTier | string;
  lastSentAt?: string;
  now?: Date;
}): { send: boolean; reason?: string } {
  if (!enabled) return { send: false, reason: 'skip:no-optin' };
  if (!emailNotifications) return { send: false, reason: 'skip:notif-off' };

  const lastSent = lastSentAt ? new Date(lastSentAt) : null;
  if (lastSent && !Number.isNaN(lastSent.getTime()) && sameJobAlertDay(lastSent, now)) {
    return { send: false, reason: 'skip:sent-today' };
  }

  const day = jobAlertWeekday(now);
  const normalized = normalizeJobAlertsFrequency(frequency, tier);
  if (normalized === 'daily') {
    return day >= 1 && day <= 5
      ? { send: true }
      : { send: false, reason: 'skip:daily-weekend' };
  }

  return day === 1 ? { send: true } : { send: false, reason: 'skip:weekly-window' };
}

export function withSonaPicksUtm(url: string, content: string) {
  try {
    const next = new URL(url, 'https://talentconsulting.io');
    next.searchParams.set('utm_source', 'sona_picks');
    next.searchParams.set('utm_medium', 'email');
    next.searchParams.set('utm_campaign', 'crafted_jobs');
    next.searchParams.set('utm_content', content);
    return next.toString();
  } catch {
    return url;
  }
}
