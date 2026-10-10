export type PlanIdentityTier = 'free' | 'pro' | 'studio' | 'god' | 'max' | string | null | undefined;
export type CanonicalPlanTier = 'free' | 'pro' | 'studio';

export interface PlanFeature {
  icon: string;
  label: string;
  description: string;
}

export interface PlanIdentity {
  id: CanonicalPlanTier;
  label: 'FREE' | 'STANDARD' | 'MAX';
  displayName: string;
  shortName: string;
  eyebrow: string;
  description: string;
  activeDescription: string;
  icon: string;
  accent: string;
  accentAlt: string;
  accentSoft: string;
  accentText: string;
  accentTextDark: string;
  border: string;
  surface: string;
  buttonText: string;
  features: PlanFeature[];
  primaryAction: string;
  secondaryAction: string;
  upgradeHref: string;
  shimmer: boolean;
}

const PLAN_ACCENT = 'var(--accent-active)';
const PLAN_ACCENT_TEXT = 'var(--accent)';
const PLAN_ACCENT_SOFT = 'var(--accent-dim, var(--bg-elevated))';

export function normalizePlanTier(tier: PlanIdentityTier): CanonicalPlanTier {
  if (tier === 'studio' || tier === 'god' || tier === 'max') return 'studio';
  if (tier === 'pro') return 'pro';
  return 'free';
}

export const PLAN_IDENTITIES: Record<CanonicalPlanTier, PlanIdentity> = {
  free: {
    id: 'free',
    label: 'FREE',
    displayName: 'Free Workspace',
    shortName: 'Free',
    eyebrow: 'Started workspace',
    description: 'Start with free career checks, drafts, and one-off career decisions.',
    activeDescription: 'Your free workspace is ready for checks, drafts, and exploration.',
    icon: 'local_activity',
    accent: PLAN_ACCENT,
    accentAlt: PLAN_ACCENT,
    accentSoft: PLAN_ACCENT_SOFT,
    accentText: PLAN_ACCENT_TEXT,
    accentTextDark: PLAN_ACCENT_TEXT,
    border: 'var(--accent)',
    surface: 'var(--bg-elevated)',
    buttonText: 'var(--accent-on)',
    features: [
      { icon: 'fact_check', label: 'Free career checks', description: 'Try ATS, writing trust, and readiness checks.' },
      { icon: 'edit_note', label: 'Starter writing tools', description: 'Polish small drafts and recruiter replies.' },
      { icon: 'history', label: 'Connected-workspace path', description: 'Move from one-off checks to saved resume, application, and preparation workflows.' },
    ],
    primaryAction: 'View Standard / Max',
    secondaryAction: 'Compare plans',
    upgradeHref: '/suite/upgrade',
    shimmer: false,
  },
  pro: {
    id: 'pro',
    label: 'STANDARD',
    displayName: 'Talent Standard',
    shortName: 'Standard',
    eyebrow: 'Core career tools',
    description: 'Hands-on tools for tailoring applications, practicing interviews, and keeping active search work connected.',
    activeDescription: 'Core career tools unlocked for active resumes, applications, and prep.',
    icon: 'workspace_premium',
    accent: PLAN_ACCENT,
    accentAlt: PLAN_ACCENT,
    accentSoft: PLAN_ACCENT_SOFT,
    accentText: PLAN_ACCENT_TEXT,
    accentTextDark: PLAN_ACCENT_TEXT,
    border: 'var(--accent)',
    surface: 'var(--bg-elevated)',
    buttonText: 'var(--accent-on)',
    features: [
      { icon: 'auto_awesome', label: 'Role-ready resumes', description: 'Tailor job-specific versions from your verified experience.' },
      { icon: 'mic', label: 'Interview practice', description: 'Rehearse target-role questions with focused feedback.' },
      { icon: 'route', label: 'Connected search workflow', description: 'Keep role research, writing, applications, and preparation together.' },
    ],
    primaryAction: 'Start Standard',
    secondaryAction: 'Explore Max',
    upgradeHref: '/suite/upgrade?plan=pro',
    shimmer: true,
  },
  studio: {
    id: 'studio',
    label: 'MAX',
    displayName: 'Talent Max',
    shortName: 'Max',
    eyebrow: 'Career command center',
    description: 'Taco scouts, ranks, and prepares truth-locked application packets for your review.',
    activeDescription: 'Your Taco command center is active with ranked scouting, prepared packets, and review-first alerts.',
    icon: 'diamond',
    accent: PLAN_ACCENT,
    accentAlt: PLAN_ACCENT,
    accentSoft: PLAN_ACCENT_SOFT,
    accentText: PLAN_ACCENT_TEXT,
    accentTextDark: PLAN_ACCENT_TEXT,
    border: 'var(--accent)',
    surface: 'var(--bg-elevated)',
    buttonText: 'var(--accent-on)',
    features: [
      { icon: 'smart_toy', label: 'Taco career agent', description: 'Scout and rank opportunities against your verified context.' },
      { icon: 'verified_user', label: 'Truth-locked packets', description: 'Prepare resumes and letters without inventing career facts.' },
      { icon: 'radar', label: 'Proactive review queue', description: 'Bring new matches, follow-ups, and next moves back for approval.' },
    ],
    primaryAction: 'Unlock Max',
    secondaryAction: 'Manage billing',
    upgradeHref: '/suite/upgrade?plan=studio',
    shimmer: true,
  },
};

export function getPlanIdentity(tier: PlanIdentityTier): PlanIdentity {
  return PLAN_IDENTITIES[normalizePlanTier(tier)];
}

export function planAccentForTheme(plan: PlanIdentity, theme: 'light' | 'dark') {
  return theme === 'light' ? plan.accentText : plan.accentTextDark;
}
