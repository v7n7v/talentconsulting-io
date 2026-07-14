import type { UsageFeature } from '@/lib/usage-tracker';

export const PLAN_LABELS = {
  free: 'Free',
  pro: 'Pro',
  studio: 'Max',
  god: 'Max',
} as const;

export const UPGRADE_COPY = {
  primaryCta: 'View Pro / Max',
  neutralPrice: 'View price in checkout',
  freeLimitTitle: 'Free limit reached',
  keepEditingCta: 'Keep editing',
  planChoice: 'Pro connects your active search. Max puts Sona to work scouting and preparing review-ready packets.',
  sidebarPlanChoice: 'Pro connects your search. Max puts Sona to work.',
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
};

export function featureLabel(feature?: string | null) {
  if (!feature) return 'tool';
  return FEATURE_LABELS[feature as UsageFeature] || feature.replace(/[_-]/g, ' ');
}

export function limitReachedBody(feature?: string | null) {
  return `You used your free ${featureLabel(feature)} runs. Your work is saved.`;
}
