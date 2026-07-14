/**
 * Shared Email Template System
 * Provides a unified shell (header + footer) and template builders
 * for all transactional and marketing emails.
 *
 * Design tokens:
 *   Header: #0f172a (slate-900)
 *   Accent: #10b981 (emerald-500)
 *   Text:   #1f2937 / #6b7280 / #9ca3af
 *   Border: #e5e7eb
 */
import { sanitizeHtml } from './sanitize';
import { resolveTalentSourceTrust } from './job-recommendation-platform';

// ── Shared Constants ──────────────────────────────────────────

export const EMAIL_FROM = 'TalentConsulting.io <hello@talentconsulting.io>';

const BRAND_URL = 'https://talentconsulting.io';
const BRAND_LOGO_URL = `${BRAND_URL}/brand/talentconsulting-logo-email.png`;
const SUITE_URL = `${BRAND_URL}/suite`;
const SETTINGS_URL = `${SUITE_URL}/settings?tab=notifications`;
const MAILING_ADDRESS = process.env.EMAIL_MAILING_ADDRESS || 'TalentConsulting.io, United States';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value: unknown, maxLength = 1000): string {
  return escapeHtml(String(value ?? '').slice(0, maxLength));
}

function safeHtml(value: string): string {
  return sanitizeHtml(value);
}

function safeHttpUrl(value: unknown, fallback = BRAND_URL): string {
  try {
    const url = new URL(String(value || fallback), BRAND_URL);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return escapeHtml(url.toString());
    }
  } catch {
    // Fall through to the safe fallback.
  }
  return escapeHtml(fallback);
}

function trustedJobDigestUrl(sourceName: unknown, value: unknown): string | null {
  const raw = String(value || '');
  const source = String(sourceName || '');
  if (!raw || !source || !resolveTalentSourceTrust(source, raw).approved) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? escapeHtml(url.toString()) : null;
  } catch {
    return null;
  }
}

function safeSubject(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'TalentConsulting.io update';
}

// ── Shell Builder ─────────────────────────────────────────────

interface ShellOptions {
  title: string;
  content: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  showUnsubscribe?: boolean;
  unsubscribeUrl?: string;
}

export function buildEmailShell(opts: ShellOptions): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<div style="text-align:center;margin:28px 0 8px">
        <a href="${safeHttpUrl(opts.ctaUrl)}" style="display:inline-block;padding:13px 32px;background:#10b981;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:10px;letter-spacing:0.01em">
          ${safeText(opts.ctaLabel, 100)}
        </a>
      </div>`
    : '';

  const unsubLine = opts.showUnsubscribe
    ? `<span style="margin:0 6px;color:#d1d5db">·</span><a href="${safeHttpUrl(opts.unsubscribeUrl || SETTINGS_URL)}" style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>`
    : '';

  const footerNote = opts.footerNote
    ? `<p style="font-size:11px;color:#9ca3af;margin:6px 0 0;line-height:1.5">${safeText(opts.footerNote, 400)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#ffffff;padding:20px 24px;border:1px solid #e5e7eb;border-bottom:none;border-radius:12px 12px 0 0">
      <a href="${BRAND_URL}" aria-label="TalentConsulting.io" style="display:inline-block;text-decoration:none;margin:0 0 12px">
        <img src="${BRAND_LOGO_URL}" width="260" height="32" alt="TalentConsulting.io" style="display:block;width:260px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none">
      </a>
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em">${safeText(opts.title, 200)}</h1>
    </div>

    <!-- Content -->
    <div style="background:#ffffff;padding:28px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      ${opts.content}
      ${cta}
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0">
        &copy; ${new Date().getFullYear()} <a href="${BRAND_URL}" style="color:#9ca3af;text-decoration:none">TalentConsulting.io</a>
        ${unsubLine}
      </p>
      ${footerNote}
      <p style="font-size:10px;color:#c0c4cc;margin:6px 0 0;line-height:1.5">${safeText(MAILING_ADDRESS, 300)}</p>
    </div>

  </div>
</body>
</html>`;
}

// ── Helper: score badge color ─────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '';
  const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

// ── Template: Welcome ─────────────────────────────────────────

export function buildWelcomeEmail(name: string): { subject: string; html: string } {
  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 20px">
      Welcome to TalentConsulting.io. Your account is ready. Here's how to get the most out of it:
    </p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 8px">
      ${[
        { step: '1', icon: '📄', text: 'Upload your resume to the Vault' },
        { step: '2', icon: '🎯', text: 'Set your job preferences for AI-curated matches' },
        { step: '3', icon: '🎙️', text: 'Practice with the Interview Simulator' },
        { step: '4', icon: '📬', text: '<a href="' + SETTINGS_URL + '" style="color:#10b981;text-decoration:underline">Enable Sona Picks</a> — get curated matches in your inbox' },
      ].map(s => `
        <tr>
          <td style="padding:10px 12px;vertical-align:top;width:32px">
            <div style="width:28px;height:28px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#16a34a">${s.step}</div>
          </td>
          <td style="padding:10px 12px;font-size:14px;color:#374151;line-height:1.5">
            ${s.text}
          </td>
        </tr>
      `).join('')}
    </table>
  `;

  return {
    subject: 'Welcome to TalentConsulting.io',
    html: buildEmailShell({
      title: 'Welcome to TalentConsulting.io',
      content,
      ctaLabel: 'Go to Dashboard →',
      ctaUrl: SUITE_URL,
    }),
  };
}

// ── Template: Subscription Confirmed ──────────────────────────

export function buildSubscriptionConfirmedEmail(
  name: string,
  plan: string,
  interval: string,
  priceDisplay?: string
): { subject: string; html: string } {
  const planLabel = plan === 'studio' ? 'Max' : 'Pro';
  const price = priceDisplay ? safeText(priceDisplay, 80) : '';
  const planBenefits = plan === 'studio'
    ? [
        'Sona scouting with ranked opportunities and source checks',
        'Truth-locked resumes and review-ready application packets',
        'Review-first alerts and next actions under your control',
        'Connected interview, writing, and application context',
      ]
    : [
        'Role-ready resumes grounded in your real experience',
        'Job fit, market insight, and application tracking',
        'Role-specific interview practice and feedback',
        'Connected cover letter, LinkedIn, and career writing tools',
      ];

  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 20px">
      Your Talent ${planLabel} plan is active. Your career workflow is ready in Talent Studio.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Current plan</p>
      <p style="margin:0;font-size:24px;font-weight:800;color:#059669">Talent ${planLabel}</p>
      ${price ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">${price}</p>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse">
      ${planBenefits.map(f => `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#374151">
            <span style="color:#10b981;margin-right:8px">✓</span>${f}
          </td>
        </tr>
      `).join('')}
    </table>
  `;

  return {
    subject: `Talent ${planLabel} is active`,
    html: buildEmailShell({
      title: `Talent ${planLabel} Is Active`,
      content,
      ctaLabel: 'Open Talent Studio',
      ctaUrl: SUITE_URL,
      footerNote: 'Billing is processed securely by Stripe. You can manage your plan from Settings.',
    }),
  };
}

// ── Template: Subscription Cancelled ──────────────────────────

export function buildSubscriptionCancelledEmail(name: string, accessEndsAt?: string): { subject: string; html: string } {
  const accessLine = accessEndsAt
    ? `Your paid access stays active until <strong>${safeText(accessEndsAt, 120)}</strong>.`
    : 'Your paid access stays active through the end of the current billing period.';
  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Your plan is set to end. ${accessLine}
    </p>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 8px">
      Your resumes, applications, preferences, and saved work stay in place. After access ends, your account moves to Free and you can restart a paid plan anytime.
    </p>
  `;

  return {
    subject: 'Your plan is scheduled to end',
    html: buildEmailShell({
      title: 'Plan Cancellation Scheduled',
      content,
      ctaLabel: 'Review Plan',
      ctaUrl: `${SUITE_URL}/settings?tab=subscription`,
      footerNote: 'Billing changes are handled securely through Stripe.',
    }),
  };
}

// ── Template: Plan Change ─────────────────────────────────────

export function buildPlanChangeEmail(
  name: string,
  oldPlan: string,
  newPlan: string
): { subject: string; html: string } {
  const labels: Record<string, string> = { free: 'Free', pro: 'Pro', studio: 'Max' };
  const oldLabel = safeText(labels[oldPlan] || oldPlan, 80);
  const newLabel = safeText(labels[newPlan] || newPlan, 80);
  const isUpgrade = newPlan === 'studio' || (newPlan === 'pro' && oldPlan === 'free');

  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 20px">
      Your plan has been ${isUpgrade ? 'upgraded' : 'changed'}.
    </p>

    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="text-align:center;padding:16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;width:42%">
            <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Previous</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#6b7280">${oldLabel}</p>
          </td>
          <td style="text-align:center;width:16%;color:#9ca3af;font-size:20px">→</td>
          <td style="text-align:center;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;width:42%">
            <p style="margin:0 0 4px;font-size:11px;color:#059669;text-transform:uppercase;letter-spacing:0.05em">Current</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#059669">${newLabel}</p>
          </td>
        </tr>
      </table>
    </div>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0">
      ${isUpgrade
        ? newPlan === 'studio'
          ? 'Sona can now scout, rank and prepare truth-locked application work for your review.'
          : 'Your active resume, application, interview and writing work can now stay connected.'
        : 'Your access has been adjusted to match your new plan. Your data and preferences are preserved.'}
    </p>
  `;

  return {
    subject: `Your plan has been ${isUpgrade ? 'upgraded' : 'updated'} to ${newLabel}`,
    html: buildEmailShell({
      title: isUpgrade ? 'Plan Upgraded' : 'Plan Updated',
      content,
      ctaLabel: 'View Your Plan →',
      ctaUrl: `${SUITE_URL}/settings?tab=subscription`,
    }),
  };
}

// ── Template: Trial Ending ────────────────────────────────────

export function buildTrialEndingEmail(name: string, daysLeft: number): { subject: string; html: string } {
  const safeDaysLeft = Math.max(0, Math.round(Number.isFinite(daysLeft) ? daysLeft : 0));
  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 20px">
      Your free trial ends in <strong>${safeDaysLeft} day${safeDaysLeft !== 1 ? 's' : ''}</strong>. After that, you'll be moved to the Free tier.
    </p>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin:0 0 20px">
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5">
        <strong>What changes:</strong> Paid resume, interview, writing, and Sona workflows return to Free access when the trial ends.
      </p>
    </div>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0">
      Upgrade now to keep uninterrupted access.
    </p>
  `;

  return {
    subject: `Your trial ends in ${safeDaysLeft} day${safeDaysLeft !== 1 ? 's' : ''}`,
    html: buildEmailShell({
      title: 'Your Trial Is Ending Soon',
      content,
      ctaLabel: 'Upgrade Now →',
      ctaUrl: `${SUITE_URL}/settings?tab=subscription`,
    }),
  };
}

// ── Template: Account Upgrade (admin-granted) ─────────────────

export function buildUpgradeEmail(plan: string, months?: number): { subject: string; html: string } {
  const planName = plan === 'studio' ? 'Talent Max' : plan === 'pro' ? 'Talent Pro' : 'Free Workspace';
  const safePlanName = safeText(planName, 80);
  const safeMonths = months ? Math.max(1, Math.round(months)) : null;
  const durationText = safeMonths ? `for the next ${safeMonths} months` : '';
  const accessSummary = plan === 'studio'
    ? 'Sona can scout and rank opportunities, prepare truth-locked application packets, and bring each next move back for your review.'
    : plan === 'pro'
      ? 'Your role research, resumes, applications, interview practice, and career writing can now stay connected.'
      : 'Your workspace is ready for free career checks, drafts, and exploration.';

  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 16px">
      Hello,
    </p>
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 20px">
      Your TalentConsulting.io account has been upgraded to the <strong>${safePlanName}</strong>.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">New Access Level</p>
      <p style="margin:0;font-size:24px;font-weight:800;color:#059669">${safePlanName}</p>
      ${durationText ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Valid ${durationText}</p>` : ''}
    </div>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0">
      ${accessSummary}
    </p>
  `;

  return {
    subject: safeSubject(`Account Upgrade: ${planName} unlocked`),
    html: buildEmailShell({
      title: 'Your Account Has Been Upgraded',
      content,
      ctaLabel: 'Go to Dashboard →',
      ctaUrl: SUITE_URL,
    }),
  };
}

// ── Template: Job Digest (weekly picks) ───────────────────────

export interface JobForDigest {
  title: string;
  company: string;
  location: string;
  acceptanceChance: number;
  acceptanceReason: string;
  sourceConfidence?: 'high' | 'medium' | 'low';
  sourceName?: string;
  fitConfidence?: 'high' | 'medium' | 'low';
  scoreVersion?: string;
  url: string;
  salary?: { min: number | null; max: number | null };
  freshnessNote?: string;
  ghostRisk?: 'low' | 'medium' | 'high';
  prepareUrl?: string;
  saveUrl?: string;
  viewUrl?: string;
}

export function buildJobDigestEmail(
  name: string,
  jobs: JobForDigest[],
  topScore: number,
  opts: {
    tier?: string;
    frequencyLabel?: string;
    unsubscribeUrl?: string;
    campaign?: string;
  } = {}
): { subject: string; html: string } {
  const jobCards = jobs.slice(0, 15).map(job => {
    const color = scoreColor(job.acceptanceChance);
    const sal = job.salary ? formatSalary(job.salary.min ?? null, job.salary.max ?? null) : '';
    const riskColor = job.ghostRisk === 'high' ? '#ef4444' : job.ghostRisk === 'medium' ? '#f59e0b' : '#10b981';
    const prepareUrl = job.prepareUrl || `${SUITE_URL}/resume`;
    const saveUrl = job.saveUrl || `${SUITE_URL}/applications`;
    const viewUrl = trustedJobDigestUrl(job.sourceName, job.viewUrl || job.url);

    return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 12px;background:#ffffff">
        <!-- Score + salary row -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px">
          <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;color:${color};background:${color}12;border:1px solid ${color}25">
            ${job.acceptanceChance}% Talent Fit
          </span>
          ${sal ? `<span style="font-size:12px;font-weight:600;color:#10b981">${safeText(sal, 80)}</span>` : ''}
        </div>

        <!-- Title + company -->
        <h3 style="margin:0 0 2px;font-size:15px;font-weight:600;color:#111827;line-height:1.3">${safeText(job.title, 180)}</h3>
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280">${safeText(job.company, 140)} · ${safeText(job.location, 140)}</p>

        <!-- AI reason -->
        <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;font-style:italic;line-height:1.4">${safeText(job.acceptanceReason, 500)}</p>
        ${job.sourceConfidence || job.fitConfidence ? `
          <p style="margin:0 0 12px;font-size:11px;color:#6b7280;line-height:1.4">
            ${job.fitConfidence ? `Fit confidence: ${safeText(job.fitConfidence, 20)}` : ''}${job.fitConfidence && job.sourceConfidence ? ' · ' : ''}${job.sourceConfidence ? `Source confidence: ${safeText(job.sourceConfidence, 20)}` : ''}
          </p>
        ` : ''}
        ${job.freshnessNote || job.ghostRisk ? `
          <p style="margin:0 0 12px;font-size:11px;color:${riskColor};line-height:1.4">
            ${safeText(job.freshnessNote || `${job.ghostRisk} posting-risk signal`, 220)}
          </p>
        ` : ''}

        <!-- CTAs -->
        <div>
          <a href="${safeHttpUrl(prepareUrl)}" style="display:inline-block;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:700;color:#ffffff;background:#10b981;text-decoration:none;margin-right:8px">Prepare Application</a>
          <a href="${safeHttpUrl(saveUrl)}" style="display:inline-block;padding:8px 14px;border-radius:7px;font-size:12px;font-weight:600;color:#06b6d4;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.18);text-decoration:none;margin-right:8px">Save to Pipeline</a>
          ${viewUrl ? `<a href="${viewUrl}" style="display:inline-block;padding:8px 14px;border-radius:7px;font-size:12px;font-weight:600;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;text-decoration:none" target="_blank" rel="noopener noreferrer">View verified job</a>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const content = `
    <p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 4px">
      Hi ${safeText(name, 120)},
    </p>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px">
      Here are your top ${jobs.length} Sona-crafted matches${opts.frequencyLabel ? ` for this ${opts.frequencyLabel.toLowerCase()} digest` : ''}. Best match: <strong style="color:${scoreColor(topScore)}">${topScore}%</strong>.
    </p>
    ${jobCards}
  `;

  return {
    subject: `Sona Picks: ${jobs.length} crafted jobs — up to ${topScore}% fit`,
    html: buildEmailShell({
      title: 'Sona Picks',
      content,
      ctaLabel: 'View All Suggestions →',
      ctaUrl: `${SUITE_URL}/job-search`,
      showUnsubscribe: true,
      unsubscribeUrl: opts.unsubscribeUrl,
      footerNote: 'You\'re receiving this because you enabled Sona Picks job alerts.',
    }),
  };
}

// ── Template: Study Reminder (Skill Bridge) ───────────────────

export interface SkillProgress {
  skill: string;
  completedDays: number;
  totalDays: number;
  todayFocus?: string;
  todayTasks?: string[];
}

export function buildStudyReminderEmail(
  name: string,
  skills: SkillProgress[],
  totalCompleted: number,
  totalDays: number,
  streak: number
): { subject: string; html: string } {
  const safeTotalDays = Math.max(1, Math.round(totalDays || 0));
  const safeTotalCompleted = Math.max(0, Math.round(totalCompleted || 0));
  const safeStreak = Math.max(0, Math.round(streak || 0));
  const overallPercent = Math.max(0, Math.min(100, Math.round((safeTotalCompleted / safeTotalDays) * 100)));

  const motivationalMessages = [
    "You're building something no AI can fake — real knowledge.",
    "Every day you study is a day closer to landing that interview.",
    "Skills aren't built overnight — but 7 days? That's doable.",
    "The best candidates aren't the ones with the best resumes. They're the ones who can back it up.",
  ];
  const motivation = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

  const skillRows = skills.map(s => {
    const completedDays = Math.max(0, Math.round(s.completedDays || 0));
    const totalSkillDays = Math.max(1, Math.round(s.totalDays || 1));
    const pct = Math.max(0, Math.min(100, Math.round((completedDays / totalSkillDays) * 100)));
    const bar = '█'.repeat(Math.min(completedDays, totalSkillDays)) + '░'.repeat(Math.max(0, totalSkillDays - completedDays));

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
          <div style="font-weight:600;color:#1a1a1a;margin:0 0 4px;font-size:14px">${safeText(s.skill, 180)}</div>
          <div style="font-family:monospace;font-size:13px;color:#10b981;letter-spacing:2px;margin:0 0 4px">${bar} ${pct}%</div>
          <div style="font-size:12px;color:#9ca3af">Day ${completedDays} of ${totalSkillDays}${pct >= 100 ? ' — Complete!' : ''}</div>
          ${s.todayFocus ? `<div style="font-size:12px;color:#3b82f6;margin-top:6px;font-weight:500">Today: ${safeText(s.todayFocus, 300)}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  const content = `
    <!-- Overall Progress -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:20px;color:white;margin:0 0 16px">
      <div style="font-size:32px;font-weight:800;margin:0 0 4px">${overallPercent}%</div>
      <div style="font-size:13px;opacity:0.7;margin:0 0 12px">Overall Progress · ${safeTotalCompleted}/${safeTotalDays} days · ${safeStreak} day streak</div>
      <div style="background:rgba(255,255,255,0.15);border-radius:6px;height:6px;overflow:hidden">
        <div style="background:linear-gradient(to right,#10b981,#06b6d4);height:100%;width:${overallPercent}%;border-radius:6px"></div>
      </div>
    </div>

    <!-- Motivation -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin:0 0 16px;text-align:center">
      <p style="margin:0;font-size:13px;color:#92400e;font-style:italic;line-height:1.5">${safeText(motivation, 220)}</p>
    </div>

    <!-- Skill Table -->
    <table style="width:100%;border-collapse:collapse">
      ${skillRows}
    </table>
  `;

  const subject = overallPercent >= 100
    ? 'You completed all your study plans!'
    : overallPercent >= 50
      ? `${overallPercent}% done — you're past the halfway mark!`
      : `Day ${safeTotalCompleted + 1} awaits — keep the momentum going!`;

  return {
    subject,
    html: buildEmailShell({
      title: 'Skill Bridge Daily',
      content,
      ctaLabel: 'Continue Studying →',
      ctaUrl: `${SUITE_URL}/skill-bridge`,
      showUnsubscribe: true,
      footerNote: 'You\'re receiving this because you opted in to Skill Bridge reminders.',
    }),
  };
}

// ── Template: Contact Form (internal notification) ────────────

export function buildContactEmail(
  safeName: string,
  safeEmail: string,
  categoryLabel: string,
  safeMessage: string
): { subject: string; html: string } {
  const content = `
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;width:80px">From:</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#1f2937">${safeText(safeName, 200)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px">Email:</td>
        <td style="padding:8px 0;font-size:14px"><a href="mailto:${safeText(safeEmail, 320)}" style="color:#10b981">${safeText(safeEmail, 320)}</a></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px">Category:</td>
        <td style="padding:8px 0;font-size:14px;color:#1f2937">${safeText(categoryLabel, 120)}</td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px" />
    <div style="font-size:14px;line-height:1.6;color:#1f2937;white-space:pre-wrap">${safeText(safeMessage, 5000)}</div>
  `;

  return {
    subject: safeSubject(`[TalentConsulting.io] ${categoryLabel} from ${safeName}`),
    html: buildEmailShell({ title: `New ${categoryLabel}`, content }),
  };
}

// ── Outcome Check Email ───────────────────────────────────────

interface PendingApp {
  company: string;
  jobTitle: string;
  daysAgo: number;
  appId: string;
}

export function buildOutcomeCheckEmail(
  name: string,
  pendingApps: PendingApp[]
): { subject: string; html: string } {
  const appRows = pendingApps.slice(0, 5).map(app => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6">
        <div style="font-weight:600;color:#1f2937;font-size:14px">${safeText(app.company, 140)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${safeText(app.jobTitle, 180)} · ${app.daysAgo} days ago</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap">
        <a href="${safeHttpUrl(`${SUITE_URL}/applications?outcome=${encodeURIComponent(app.appId)}&result=callback`)}" style="display:inline-block;padding:4px 10px;background:#10b981;color:white;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600;margin:0 2px">✓ Heard back</a>
        <a href="${safeHttpUrl(`${SUITE_URL}/applications?outcome=${encodeURIComponent(app.appId)}&result=ghosted`)}" style="display:inline-block;padding:4px 10px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600;margin:0 2px">⌛ Nothing</a>
      </td>
    </tr>
  `).join('');

  const content = `
    <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px">
      Hi ${safeText(name, 120)}, quick check-in on ${pendingApps.length} application${pendingApps.length > 1 ? 's' : ''} — any updates?
    </div>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <tbody>
        ${appRows}
      </tbody>
    </table>
    <div style="font-size:12px;color:#9ca3af;margin-top:16px;text-align:center">
      Tracking outcomes helps us personalize your job matches over time.
    </div>
  `;

  return {
    subject: `Quick check-in on ${pendingApps.length} application${pendingApps.length > 1 ? 's' : ''} — any updates?`,
    html: buildEmailShell({
      title: 'Application Check-in',
      content,
      ctaLabel: 'View All Applications',
      ctaUrl: `${SUITE_URL}/applications`,
      footerNote: 'You can log outcomes anytime from your Applications page.',
    }),
  };
}

// ── Agent Digest Email ────────────────────────────────────────

export interface AgentJobForDigest {
  title: string;
  company: string;
  location: string;
  matchScore: number;
  salary: string;
  reason?: string;
  nextAction?: string;
  riskCount?: number;
}

export function buildAgentDigestEmail(
  name: string,
  jobs: AgentJobForDigest[]
): { subject: string; html: string } {
  const scoreColor = (s: number) => s >= 85 ? '#2563eb' : s >= 75 ? '#10b981' : '#f59e0b';
  const topScore = jobs.reduce((max, job) => Math.max(max, job.matchScore || 0), 0);
  const riskCount = jobs.reduce((sum, job) => sum + (job.riskCount || 0), 0);

  const jobRows = jobs.map(j => `
    <tr>
      <td style="padding:18px 18px;border-bottom:1px solid #e8eef8">
        <div style="display:flex;align-items:flex-start;gap:14px">
          <div style="width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,${scoreColor(j.matchScore)}24,#ffffff);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:${scoreColor(j.matchScore)};flex-shrink:0;border:1px solid ${scoreColor(j.matchScore)}42;box-shadow:0 10px 24px ${scoreColor(j.matchScore)}18">
            ${j.matchScore}%
          </div>
          <div style="min-width:0">
            <div style="font-weight:700;color:#111827;font-size:15px;line-height:1.35">${safeText(j.title, 180)}</div>
            <div style="font-size:12px;color:#4b5563;margin-top:3px">${safeText(j.company, 140)} · ${safeText(j.location, 140)}${j.salary ? ` · ${safeText(j.salary, 80)}` : ''}</div>
            ${j.reason ? `<div style="font-size:12px;color:#374151;line-height:1.55;margin-top:8px">${safeText(j.reason, 500)}</div>` : ''}
            <div style="margin-top:10px">
              <span style="display:inline-block;padding:4px 9px;background:#10b98114;color:#047857;border:1px solid #10b98124;border-radius:999px;font-size:10px;font-weight:700;margin-right:5px">Packet ready</span>
              <span style="display:inline-block;padding:4px 9px;background:#2563eb12;color:#1d4ed8;border:1px solid #2563eb24;border-radius:999px;font-size:10px;font-weight:700;margin-right:5px">${safeText(j.nextAction || 'Review next', 120)}</span>
              ${j.riskCount ? `<span style="display:inline-block;padding:4px 9px;background:#f59e0b14;color:#b45309;border:1px solid #f59e0b24;border-radius:999px;font-size:10px;font-weight:700">${j.riskCount} check${j.riskCount > 1 ? 's' : ''}</span>` : ''}
            </div>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  const content = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;width:54px;height:54px;border-radius:18px;background:linear-gradient(135deg,#dbeafe,#e0f2fe 48%,#f5d0fe);margin-bottom:12px;line-height:54px;font-size:24px;border:1px solid #bfdbfe;color:#2563eb;font-weight:900">S</div>
      <div style="font-size:18px;font-weight:800;color:#111827">Sona prepared ${jobs.length} high-fit packet${jobs.length > 1 ? 's' : ''}</div>
      <div style="font-size:13px;color:#4b5563;margin-top:5px;line-height:1.6">Review the shortlist, inspect the tailored assets, then decide what to submit. Nothing was sent for you.</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#f8fafc">
        <div style="font-size:20px;font-weight:800;color:#111827">${jobs.length}</div>
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Packets</div>
      </div>
      <div style="border:1px solid #dbeafe;border-radius:14px;padding:12px;background:#eff6ff">
        <div style="font-size:20px;font-weight:800;color:#1d4ed8">${topScore}%</div>
        <div style="font-size:11px;color:#2563eb;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Top fit</div>
      </div>
      <div style="border:1px solid #fef3c7;border-radius:14px;padding:12px;background:#fffbeb">
        <div style="font-size:20px;font-weight:800;color:#b45309">${riskCount}</div>
        <div style="font-size:11px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Checks</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
      <tbody>
        ${jobRows}
      </tbody>
    </table>
    <div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb;color:#475569;font-size:12px;line-height:1.6">
      Sona only prepared these packets. Open Talent Studio to review the resume, cover letter, posting, and fit notes before you apply.
    </div>
  `;

  return {
    subject: `Sona prepared ${jobs.length} high-fit opportunit${jobs.length > 1 ? 'ies' : 'y'} for review`,
    html: buildEmailShell({
      title: 'Agent Digest',
      content,
      ctaLabel: 'Review Agent Queue',
      ctaUrl: `${SUITE_URL}/agent/queue`,
      footerNote: 'Sona digest emails are opt-in. Manage them from Job Search preferences.',
    }),
  };
}

// ── Template: Custom Admin Email ──────────────────────────────

export function buildCustomEmail(
  subject: string,
  bodyHtml: string,
  ctaLabel?: string,
  ctaUrl?: string
): { subject: string; html: string } {
  const cleanSubject = safeSubject(subject);
  return {
    subject: cleanSubject,
    html: buildEmailShell({
      title: cleanSubject,
      content: `<div style="font-size:15px;color:#1f2937;line-height:1.7">${safeHtml(bodyHtml)}</div>`,
      ctaLabel,
      ctaUrl,
    }),
  };
}
