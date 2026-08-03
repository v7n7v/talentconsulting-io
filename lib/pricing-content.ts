import { getSonaDailyWorkloadBudget, resolveSonaWorkloadEntitlement } from '@/lib/assistant/workload-policy';

/**
 * Plan copy, in one place.
 *
 * These lists lived inside app/suite/upgrade/page.tsx, which meant the public
 * pricing page could only have them by copying - and a marketing page whose
 * feature list has drifted from the one behind the paywall is a promise the
 * product does not keep. Both surfaces read from here.
 *
 * The numbers are resolved from the entitlement tables, never typed in. If a
 * limit changes in lib/assistant/sona-workload, this copy follows it.
 *
 * Prices are deliberately absent: PLAN_PRICE is null for every paid tier by
 * design and prices resolve from Stripe at runtime (lib/billing-prices.ts).
 * Nothing here may state an amount.
 */

const FREE_OUTCOME = resolveSonaWorkloadEntitlement('free');
const PRO_OUTCOME = resolveSonaWorkloadEntitlement('pro');
const MAX_OUTCOME = resolveSonaWorkloadEntitlement('studio');
const PRO_DAILY = getSonaDailyWorkloadBudget('pro');
const MAX_DAILY = getSonaDailyWorkloadBudget('studio');

export type PlanFeature = {
  icon: string;
  title: string;
  desc: string;
};

export const PRO_FEATURES: PlanFeature[] = [
  { icon: 'troubleshoot', title: 'Job fit and market insight', desc: 'Review role fit, salary signals, skill gaps, and red flags before you apply.' },
  { icon: 'description', title: 'Resume tools for active roles', desc: 'Shape each resume around the job while keeping your experience clear and accurate.' },
  { icon: 'mic', title: 'Interview practice', desc: 'Rehearse role-specific interviews with voice and focused feedback.' },
  { icon: 'route', title: 'Skill gap plans', desc: 'Turn missing skills into a focused learning path for the roles you want.' },
  { icon: 'work_history', title: 'Application workspace', desc: 'Keep target roles, next steps, and preparation together.' },
  { icon: 'inventory_2', title: 'Saved career evidence', desc: 'Reuse coaching notes, proof, and interview feedback across your search.' },
  { icon: 'edit_note', title: 'Application writing tools', desc: 'Create cover letters, recruiter replies, and LinkedIn updates in one workflow.' },
  { icon: 'support_agent', title: 'Priority support', desc: 'Get faster help when something blocks your search.' },
];

export const STUDIO_EXTRAS: PlanFeature[] = [
  { icon: 'travel_explore', title: 'Proactive Taco scouting', desc: MAX_OUTCOME.outcomeDescription },
  { icon: 'sort', title: 'Ranked job picks', desc: 'See the strongest matches first, with clear reasons for every recommendation.' },
  { icon: 'verified_user', title: 'Truth-locked resume tailoring', desc: 'Tailor against each role without inventing experience, skills, or credentials.' },
  { icon: 'inventory', title: 'Review-ready application packets', desc: 'Bring the resume, cover letter, role context, and next steps together before you apply.' },
  { icon: 'notifications_active', title: 'User-controlled alerts', desc: 'Choose what Taco watches and when you hear about new matches.' },
];

export type ComparisonRow = {
  label: string;
  free: string;
  pro: string;
  studio: string;
};

export const COMPARISON: ComparisonRow[] = [
  { label: 'Job fit and market insight', free: 'Starter access', pro: 'Full access', studio: 'Full access' },
  { label: 'Resume tools', free: 'Starter access', pro: 'Full access', studio: 'Truth-locked' },
  { label: 'Interview practice', free: 'Starter access', pro: 'Full access', studio: 'Full access' },
  { label: 'Skill gap plans', free: 'Starter access', pro: 'Full access', studio: 'Full access' },
  { label: 'Taco workflow', free: 'One preview', pro: 'On demand', studio: 'Proactive + prep' },
  { label: 'Ranked job picks', free: `${FREE_OUTCOME.maxRankedRoles} once`, pro: `${PRO_OUTCOME.maxRankedRoles} per run`, studio: `${MAX_OUTCOME.maxPreparedPackets} prepared` },
  { label: 'Daily Taco workloads', free: 'One lifetime', pro: `${PRO_DAILY.runsMax} manual`, studio: `${MAX_DAILY.runsMax} incl. proactive` },
  { label: 'Application packets', free: 'Not included', pro: 'Prepare manually', studio: 'Taco prepares' },
  { label: 'Email controls', free: 'Opt-in picks', pro: 'Opt-in picks', studio: 'Proactive digest' },
];

/** What the free tier actually includes, for the public page. */
export const FREE_FEATURES: PlanFeature[] = [
  { icon: 'fact_check', title: 'Free career check', desc: 'Paste a resume, a bullet, or a recruiter reply and see what to fix first. No account.' },
  { icon: 'construction', title: 'The free tools', desc: 'Resume builder, ATS analyzer, interview prep, humanizer and detector.' },
  { icon: 'visibility', title: 'One Taco preview', desc: `See ${FREE_OUTCOME.maxRankedRoles} ranked roles once, so you know what the paid tiers do before paying for them.` },
];
