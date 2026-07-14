/**
 * GA4 Analytics — Conversion Event Tracking
 * Centralized event tracking for key business metrics.
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

type ConversionEvent =
  | 'sign_up'
  | 'login'
  | 'begin_checkout'
  | 'upgrade_viewed'
  | 'upgrade_plan_selected'
  | 'upgrade_interval_selected'
  | 'checkout_session_failed'
  | 'purchase'
  | 'tool_use'
  | 'resume_download'
  | 'job_search'
  | 'job_apply'
  | 'preferences_saved'
  | 'sona_resume_upload_started'
  | 'sona_resume_parsed'
  | 'sona_resume_upload_failed'
  | 'sona_resume_handoff_staged'
  | 'sona_resume_auth_presented'
  | 'sona_resume_auth_abandoned'
  | 'sona_resume_saved'
  | 'sona_target_prompt_submitted'
  | 'sona_packet_prompt_started'
  | 'email_digest_sent'
  | 'newsletter_subscribe'
  | 'digest_sent'
  | 'digest_click_prepare'
  | 'digest_unsubscribe'
  | 'social_signup';

interface EventParams {
  method?: string;
  tool?: string;
  tier?: string;
  value?: number;
  currency?: string;
  [key: string]: any;
}

function track(event: ConversionEvent, params?: EventParams) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, {
    ...params,
    send_to: 'G-8HXZDQQ3YJ',
  });
}

export const analytics = {
  /** User signed up (email or Google) */
  signUp(method: 'email' | 'google') {
    track('sign_up', { method });
  },

  /** User logged in */
  login(method: 'email' | 'google' | 'mfa') {
    track('login', { method });
  },

  /** User clicked upgrade / started checkout */
  beginCheckout(
    tier: string,
    value?: number,
    context: { source?: string; interval?: string; currency?: string } = {},
  ) {
    const currency = context.currency?.trim().toUpperCase();
    track('begin_checkout', {
      tier,
      ...(Number.isFinite(value) ? { value } : {}),
      ...(currency ? { currency } : {}),
      ...(context.source ? { source: context.source } : {}),
      ...(context.interval ? { interval: context.interval } : {}),
    });
  },

  upgradeViewed(source: string, tier: string, interval: string) {
    track('upgrade_viewed', { source, tier, interval, event_category: 'conversion' });
  },

  upgradePlanSelected(source: string, tier: string, interval: string) {
    track('upgrade_plan_selected', { source, tier, interval, event_category: 'conversion' });
  },

  upgradeIntervalSelected(source: string, tier: string, interval: string) {
    track('upgrade_interval_selected', { source, tier, interval, event_category: 'conversion' });
  },

  checkoutSessionFailed(source: string, tier: string, interval: string, reason: string) {
    track('checkout_session_failed', { source, tier, interval, reason, event_category: 'conversion' });
  },

  /** Stripe checkout completed */
  purchase(tier: string, value: number) {
    track('purchase', { tier, value, currency: 'USD', transaction_id: `sub_${Date.now()}` });
  },

  /** User used a core tool */
  toolUse(tool: string) {
    track('tool_use', { tool, event_category: 'engagement' });
  },

  /** Resume downloaded (PDF/Word) */
  resumeDownload(format: 'pdf' | 'word') {
    track('resume_download', { format, event_category: 'engagement' });
  },

  /** Job search executed */
  jobSearch(query: string, resultCount: number) {
    track('job_search', { search_term: query, results: resultCount });
  },

  /** User clicked "Apply Now" on a job */
  jobApply(company: string, title: string) {
    track('job_apply', { company, job_title: title });
  },

  /** Job preferences saved */
  preferencesSaved(roleCount: number, cityCount: number) {
    track('preferences_saved', { roles: roleCount, cities: cityCount });
  },

  sonaResumeUploadStarted(source = 'sona_agent') {
    track('sona_resume_upload_started', { source, event_category: 'activation' });
  },

  sonaResumeParsed(sourceType: string, characterCount: number) {
    track('sona_resume_parsed', { source_type: sourceType, character_count: characterCount, event_category: 'activation' });
  },

  sonaResumeUploadFailed(source: string, reason: string) {
    const allowedReasons = new Set([
      'file_too_large',
      'unsupported_type',
      'auth_required',
      'scanned_pdf',
      'parse_empty',
      'parse_failed',
      'handoff_failed',
    ]);
    track('sona_resume_upload_failed', {
      source,
      reason: allowedReasons.has(reason) ? reason : 'parse_failed',
      event_category: 'activation',
    });
  },

  sonaResumeHandoffStaged() {
    track('sona_resume_handoff_staged', { source: 'landing_hero', event_category: 'activation' });
  },

  sonaResumeAuthPresented(mode: 'login' | 'signup') {
    track('sona_resume_auth_presented', { source: 'landing_hero', method: mode, event_category: 'activation' });
  },

  sonaResumeAuthAbandoned(mode: 'login' | 'signup') {
    track('sona_resume_auth_abandoned', { source: 'landing_hero', method: mode, event_category: 'activation' });
  },

  sonaResumeSaved(versionId: string) {
    track('sona_resume_saved', { version_id: versionId, event_category: 'activation' });
  },

  sonaTargetPromptSubmitted(hasResume: boolean, workMode?: string) {
    track('sona_target_prompt_submitted', { has_resume: hasResume, work_mode: workMode || 'unspecified', event_category: 'activation' });
  },

  sonaPacketPromptStarted(source = 'sona_agent') {
    track('sona_packet_prompt_started', { source, event_category: 'activation' });
  },

  /** Weekly digest email sent */
  emailDigestSent(jobCount: number) {
    track('email_digest_sent', { job_count: jobCount });
  },

  newsletterSubscribe(source: string, frequency: string) {
    track('newsletter_subscribe', { source, frequency, event_category: 'growth' });
  },

  digestSent(jobCount: number, frequency?: string) {
    track('digest_sent', { job_count: jobCount, frequency, event_category: 'growth' });
  },

  digestClickPrepare(source = 'email') {
    track('digest_click_prepare', { source, event_category: 'growth' });
  },

  digestUnsubscribe(source = 'email') {
    track('digest_unsubscribe', { source, event_category: 'growth' });
  },

  socialSignup(source: string) {
    track('social_signup', { source, event_category: 'growth' });
  },
};
