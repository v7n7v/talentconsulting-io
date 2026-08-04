import type { UsageFeature } from '@/lib/usage-tracker';

export const PLAN_LABELS = {
  free: 'Free',
  pro: 'Standard',
  studio: 'Max',
  god: 'Max',
} as const;

export const UPGRADE_COPY = {
  primaryCta: 'View Standard / Max',
  neutralPrice: 'View price in checkout',
  freeLimitTitle: 'Free limit reached',
  /* A tier lock and a spent cap are different facts and must not share copy.
     "Free limit reached" told a user who had run the tool zero times that they
     had used something up. */
  tierLockedTitle: 'Available on a paid plan',
  keepEditingCta: 'Keep editing',
  planChoice: 'Standard connects your active search. Max puts Taco to work scouting and preparing review-ready packets.',
  sidebarPlanChoice: 'Standard connects your search. Max puts Taco to work.',
} as const;

export const FEATURE_LABELS: Record<UsageFeature, string> = {
  morphs: 'resume morph',
  gauntlets: 'interview practice',
  flashcards: 'flashcard',
  jdGenerations: 'job description',
  coverLetters: 'cover letter',
  resumeChecks: 'resume check',
  linkedinProfiles: 'LinkedIn profile',
  writingTools: 'writing toolkit',
  galleryTools: 'writing toolkit',
  // Named for what the user did, not for the endpoint. "You used your free
  // resumeParses runs" is not a sentence anyone should read.
  resumeParses: 'resume upload',
  resumeAssists: 'resume AI assist',
  vaultExports: 'vault export',
};

export function featureLabel(feature?: string | null) {
  if (!feature) return 'tool';
  return FEATURE_LABELS[feature as UsageFeature] || feature.replace(/[_-]/g, ' ');
}

export function limitReachedBody(feature?: string | null) {
  return `You used your free ${featureLabel(feature)} runs. Your work is saved.`;
}

/**
 * For a feature the free plan never had, as opposed to one whose runs are spent.
 * Names no specific tier: some of these routes gate at Standard and some at Max,
 * and the panel's CTA is the comparison page, which is where that is answered.
 * `featureLabel` returns the generic "tool" for a missing key, so the specific
 * wording is only used when the response actually named a feature.
 */
export function featureLockedBody(feature?: string | null) {
  const what = feature ? `The ${featureLabel(feature)} tool` : 'This tool';
  return `${what} is not included in Free. Nothing you entered has been lost.`;
}

/**
 * The humanizer meters words per month, not runs, and every tier has a ceiling
 * (WRITING_WORD_CAPS in lib/usage-tracker.ts). Neither of the two bodies above
 * can say that truthfully: "You used your free writing toolkit runs" is wrong
 * about the unit, and on a paid plan it is wrong about the plan as well.
 */
export const WORD_CAP_TITLE = 'Monthly word limit reached';

export function wordCapBody(used: number, cap: number) {
  return `You have used ${used} of ${cap} words this month. Nothing you entered has been lost.`;
}
