export const JOB_ALERT_EMAIL_CONSENT_VERSION = '2026-07-10';

type JobAlertPreferenceRecord = {
  jobAlertsEnabled?: unknown;
  emailNotifications?: unknown;
  jobAlertsConsentAt?: unknown;
  jobAlertsConsentVersion?: unknown;
  jobAlertsSubscribedAt?: unknown;
  jobAlertsDeliveryStatus?: unknown;
  jobAlertsDeliveryUpdatedAt?: unknown;
  jobAlertsDeliveryError?: unknown;
  jobAlertsLastSentAt?: unknown;
  jobAlertsLastAcceptedAt?: unknown;
  jobAlertsLastDeliveredAt?: unknown;
  jobAlertsProviderMessageId?: unknown;
  jobAlertsReceiptTracking?: unknown;
  jobAlertsDeliveryPausedReason?: unknown;
  jobAlertsDeliveryPausedAt?: unknown;
  emailDeliveryPausedAt?: unknown;
  emailDeliveryPausedReason?: unknown;
  agentDigestDeliveryPausedAt?: unknown;
  lastNotificationSentAt?: unknown;
  jobAlertsLastJobCount?: unknown;
  agentEnabled?: unknown;
  agentDigestEmailEnabled?: unknown;
  agentDigestConsentAt?: unknown;
  agentDigestConsentVersion?: unknown;
  lastUpdated?: unknown;
};

export type JobAlertDeliveryStatus = 'consent_required' | 'ready' | 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getJobAlertEmailConsent(preferences: JobAlertPreferenceRecord | null | undefined) {
  const prefs = preferences || {};
  const alertsEnabled = prefs.jobAlertsEnabled === true;
  const emailEnabled = prefs.emailNotifications === true;
  const consentAt = optionalString(prefs.jobAlertsConsentAt) || optionalString(prefs.jobAlertsSubscribedAt);
  const version = optionalString(prefs.jobAlertsConsentVersion) || (consentAt ? 'legacy-explicit-opt-in' : null);
  const granted = alertsEnabled && emailEnabled && Boolean(consentAt);

  return {
    channel: 'email' as const,
    granted,
    consentAt,
    version,
    reason: !alertsEnabled
      ? 'Job alerts are not enabled'
      : !emailEnabled
        ? 'Email delivery is paused'
        : !consentAt
          ? 'Email consent has not been recorded'
          : null,
  };
}

export function getAgentDigestEmailConsent(preferences: JobAlertPreferenceRecord | null | undefined) {
  const prefs = preferences || {};
  const agentEnabled = prefs.agentEnabled === true;
  const emailEnabled = prefs.emailNotifications === true;
  const digestEnabled = prefs.agentDigestEmailEnabled === true;
  const consentAt = optionalString(prefs.agentDigestConsentAt);
  const version = optionalString(prefs.agentDigestConsentVersion) || (consentAt ? 'legacy-explicit-opt-in' : null);
  const granted = agentEnabled && emailEnabled && digestEnabled && Boolean(consentAt);

  return {
    channel: 'email' as const,
    purpose: 'sona_agent_digest' as const,
    granted,
    consentAt,
    version,
    reason: !agentEnabled
      ? 'Sona Agent is not enabled'
      : !emailEnabled
        ? 'Email delivery is paused'
        : !digestEnabled
          ? 'Sona agent digest is not enabled'
          : !consentAt
            ? 'Agent digest consent has not been recorded'
            : null,
  };
}

export function sanitizeJobDeliveryError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || 'Delivery provider rejected the message');
  return message.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function verifyJobAlertEmailResume(
  preferences: JobAlertPreferenceRecord | null | undefined,
  request: { enableEmail: boolean; resumeAfterProviderPause?: unknown; providerPauseAt?: unknown },
) {
  const prefs = preferences || {};
  const pausedAt = optionalString(prefs.emailDeliveryPausedAt)
    || optionalString(prefs.jobAlertsDeliveryPausedAt)
    || optionalString(prefs.agentDigestDeliveryPausedAt);
  const resuming = request.enableEmail && prefs.emailNotifications !== true;
  if (!pausedAt || !resuming) return { allowed: true, required: false, pausedAt };
  const allowed = request.resumeAfterProviderPause === true && optionalString(request.providerPauseAt) === pausedAt;
  return { allowed, required: true, pausedAt };
}

export function getJobAlertDeliverySnapshot(preferences: JobAlertPreferenceRecord | null | undefined) {
  const prefs = preferences || {};
  const consent = getJobAlertEmailConsent(prefs);
  const rawStatus = optionalString(prefs.jobAlertsDeliveryStatus);
  const pausedReason = optionalString(prefs.emailDeliveryPausedReason)
    || optionalString(prefs.jobAlertsDeliveryPausedReason);
  const normalizedStatus = rawStatus === 'sent'
    ? 'accepted'
    : rawStatus === 'sending'
      || rawStatus === 'accepted'
      || rawStatus === 'delivered'
      || rawStatus === 'delayed'
      || rawStatus === 'failed'
      ? rawStatus
      : 'ready';
  const status: JobAlertDeliveryStatus = !consent.granted
    ? pausedReason ? 'failed' : 'consent_required'
    : normalizedStatus;
  const lastAcceptedAt = optionalString(prefs.jobAlertsLastAcceptedAt)
    || optionalString(prefs.jobAlertsLastSentAt)
    || optionalString(prefs.lastNotificationSentAt);

  return {
    channel: 'email' as const,
    status,
    consent,
    updatedAt: optionalString(prefs.jobAlertsDeliveryUpdatedAt),
    lastAcceptedAt,
    lastSentAt: lastAcceptedAt,
    lastDeliveredAt: optionalString(prefs.jobAlertsLastDeliveredAt),
    providerMessageId: optionalString(prefs.jobAlertsProviderMessageId),
    receiptTracking: optionalString(prefs.jobAlertsReceiptTracking) || 'unavailable',
    lastJobCount: Number.isFinite(Number(prefs.jobAlertsLastJobCount))
      ? Math.max(0, Number(prefs.jobAlertsLastJobCount))
      : 0,
    error: status === 'failed' ? optionalString(prefs.jobAlertsDeliveryError) : null,
    pausedReason,
    pausedAt: optionalString(prefs.emailDeliveryPausedAt)
      || optionalString(prefs.jobAlertsDeliveryPausedAt)
      || optionalString(prefs.agentDigestDeliveryPausedAt),
  };
}
