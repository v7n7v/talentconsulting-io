export type SonaHarnessNotificationDisplayStatus = 'accepted' | 'in_app_only' | 'unavailable';

type HarnessNotification = {
  inApp?: unknown;
  emailAccepted?: unknown;
  emailSent?: unknown;
  emailSkippedReason?: unknown;
} | null | undefined;

const NOTIFICATION_DISABLED_REASON = 'notification disabled for this run';

export function getSonaHarnessNotificationStatus(notification: HarnessNotification) {
  if (notification?.emailAccepted === true) {
    return {
      status: 'accepted' as const,
      label: 'Confirmation pending',
      icon: 'outgoing_mail',
      message: 'The email provider accepted this run. Delivery confirmation is pending. Your picks are already safe in Agent Queue.',
    };
  }

  const skippedReason = typeof notification?.emailSkippedReason === 'string'
    ? notification.emailSkippedReason.trim().toLowerCase()
    : '';
  if (skippedReason && skippedReason !== NOTIFICATION_DISABLED_REASON) {
    return {
      status: 'unavailable' as const,
      label: 'Email unavailable',
      icon: 'mail_lock',
      message: 'Email was not sent for this run. Your picks remain available in Agent Queue.',
    };
  }

  return {
    status: 'in_app_only' as const,
    label: 'In-app only',
    icon: 'notifications_none',
    message: 'This run stayed in Talent Studio. Email remains off until you save alert consent.',
  };
}
