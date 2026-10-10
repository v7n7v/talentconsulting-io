import { z } from 'zod';
import type { EmailTemplateDefinition, StructuredEmailContent } from './contracts';

const nameSchema = z.string().trim().min(1).max(120).optional();
const urlSchema = z.string().trim().url().max(2_000);
const shortTextSchema = z.string().trim().min(1).max(200);
const moneySchema = z.string().trim().min(1).max(80);

const actionSchema = z.object({
  recipientName: nameSchema,
  actionUrl: urlSchema,
  expiresInMinutes: z.number().int().positive().max(10_080).optional(),
});

const adminInvitationSchema = actionSchema.extend({
  roleName: shortTextSchema,
  invitedBy: z.string().trim().email().max(320),
});

const welcomeSchema = z.object({
  recipientName: nameSchema,
  dashboardUrl: urlSchema.default('https://talentconsulting.io/suite'),
});

const accessChangedSchema = z.object({
  recipientName: nameSchema,
  planName: shortTextSchema,
  accessSummary: z.string().trim().min(1).max(800).optional(),
  dashboardUrl: urlSchema.default('https://talentconsulting.io/suite'),
});

const subscriptionSchema = z.object({
  recipientName: nameSchema,
  planName: shortTextSchema,
  interval: z.enum(['month', 'year', 'monthly', 'annual', 'other']),
  price: moneySchema.optional(),
  effectiveAt: shortTextSchema.optional(),
  invoiceUrl: urlSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const trialEndingSchema = z.object({
  recipientName: nameSchema,
  daysLeft: z.number().int().min(0).max(90),
  endsAt: shortTextSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const planChangedSchema = z.object({
  recipientName: nameSchema,
  oldPlan: shortTextSchema,
  newPlan: shortTextSchema,
  effectiveAt: shortTextSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const cancellationSchema = z.object({
  recipientName: nameSchema,
  accessEndsAt: shortTextSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const paymentFailedSchema = z.object({
  recipientName: nameSchema,
  amount: moneySchema.optional(),
  nextAttemptAt: shortTextSchema.optional(),
  invoiceUrl: urlSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const billingNoticeSchema = z.object({
  recipientName: nameSchema,
  planName: shortTextSchema.optional(),
  amount: moneySchema.optional(),
  effectiveAt: shortTextSchema.optional(),
  nextEventAt: shortTextSchema.optional(),
  invoiceUrl: urlSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const paymentActionSchema = z.object({
  recipientName: nameSchema,
  amount: moneySchema.optional(),
  invoiceUrl: urlSchema,
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const intervalChangedSchema = z.object({
  recipientName: nameSchema,
  oldInterval: shortTextSchema,
  newInterval: shortTextSchema,
  effectiveAt: shortTextSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const paymentMethodSchema = z.object({
  recipientName: nameSchema,
  brand: shortTextSchema.optional(),
  last4: z.string().regex(/^\d{4}$/).optional(),
  expiresAt: shortTextSchema.optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const priceChangeSchema = z.object({
  recipientName: nameSchema,
  planName: shortTextSchema,
  oldPrice: moneySchema,
  newPrice: moneySchema,
  effectiveAt: shortTextSchema,
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const refundSchema = z.object({
  recipientName: nameSchema,
  amount: moneySchema,
  statusDate: shortTextSchema.optional(),
  reason: z.string().trim().min(1).max(300).optional(),
  billingUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=billing'),
});

const disputeSchema = z.object({
  recipientName: nameSchema,
  amount: moneySchema,
  status: shortTextSchema.optional(),
  supportUrl: urlSchema.default('https://talentconsulting.io/contact'),
});

const securityNoticeSchema = z.object({
  recipientName: nameSchema,
  occurredAt: shortTextSchema.optional(),
  device: shortTextSchema.optional(),
  location: shortTextSchema.optional(),
  securityUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=security'),
});

const accountActionSchema = z.object({
  recipientName: nameSchema,
  actionUrl: urlSchema,
  expiresInMinutes: z.number().int().positive().max(10_080).optional(),
});

const accountNoticeSchema = z.object({
  recipientName: nameSchema,
  occurredAt: shortTextSchema.optional(),
  details: z.array(z.object({ label: shortTextSchema, value: z.string().trim().min(1).max(300) })).max(12).optional(),
  accountUrl: urlSchema.default('https://talentconsulting.io/suite/settings'),
});

const supportCaseSchema = z.object({
  recipientName: nameSchema,
  caseId: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600).optional(),
  occurredAt: shortTextSchema.optional(),
  caseUrl: urlSchema.default('https://talentconsulting.io/contact'),
});

const serviceNoticeSchema = z.object({
  recipientName: nameSchema,
  serviceName: shortTextSchema.default('TalentConsulting.io'),
  summary: z.string().trim().min(1).max(800),
  startsAt: shortTextSchema.optional(),
  endsAt: shortTextSchema.optional(),
  statusUrl: urlSchema.default('https://talentconsulting.io/contact'),
});

const productNoticeSchema = z.object({
  recipientName: nameSchema,
  summary: z.string().trim().min(1).max(800),
  items: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  actionUrl: urlSchema,
  preferenceUrl: urlSchema.optional(),
  unsubscribeUrl: urlSchema.optional(),
});

const internalAlertSchema = z.object({
  referenceId: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1_000),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  occurredAt: shortTextSchema.optional(),
  dashboardUrl: urlSchema.optional(),
  details: z.array(z.object({ label: shortTextSchema, value: z.string().trim().min(1).max(500) })).max(16).default([]),
});

const marketingNoticeSchema = z.object({
  recipientName: nameSchema,
  headline: shortTextSchema,
  summary: z.string().trim().min(1).max(1_200),
  items: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  actionLabel: shortTextSchema,
  actionUrl: urlSchema,
  unsubscribeUrl: urlSchema,
  mailingAddress: z.string().trim().min(8).max(300),
});

const preferencesUpdatedSchema = z.object({
  recipientName: nameSchema,
  changedPreferences: z.array(shortTextSchema).min(1).max(20),
  settingsUrl: urlSchema.default('https://talentconsulting.io/suite/settings?tab=notifications'),
});

const template = <TSchema extends z.ZodType>(
  definition: EmailTemplateDefinition<TSchema>,
): EmailTemplateDefinition<TSchema> => definition;

function greeting(name?: string): string {
  return name ? `Hi ${name},` : 'Hello,';
}

function planLabel(value: string): string {
  if (value.toLowerCase() === 'studio') return 'Max';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tacoPersona(
  message = 'Prepared for your review. You decide what happens next.',
  presentation: 'hero' | 'byline' = 'byline',
): NonNullable<StructuredEmailContent['persona']> {
  return {
    kind: 'taco',
    presentation,
    role: 'Your review-first career copilot',
    message,
  };
}

export const emailCatalog = {
  'security.email_verification_requested': template({
    event: 'security.email_verification_requested',
    stream: 'transactional',
    sender: 'security',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: actionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Verify your TalentConsulting.io email address',
      preheader: 'Confirm this email address to finish securing your account.',
      category: 'Security',
      title: 'Verify your email address',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Confirm that this email address belongs to you to finish setting up your account.'],
      callout: {
        tone: 'neutral',
        title: 'Didn’t request this?',
        body: 'You can safely ignore this email. Your account will not be changed.',
      },
      action: { label: 'Verify email address', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This secure link expires in ${payload.expiresInMinutes} minutes.` : 'This is an automated account-security message.',
    }),
  }),
  'security.password_reset_requested': template({
    event: 'security.password_reset_requested',
    stream: 'transactional',
    sender: 'security',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: actionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Reset your TalentConsulting.io password',
      preheader: 'Use this secure link to choose a new password.',
      category: 'Security',
      title: 'Reset your password',
      greeting: greeting(payload.recipientName),
      paragraphs: ['We received a request to reset the password for your TalentConsulting.io account.'],
      callout: {
        tone: 'warning',
        title: 'Didn’t request this?',
        body: 'Ignore this email and your password will stay the same. Never share this link with anyone.',
      },
      action: { label: 'Reset password', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This one-time link expires in ${payload.expiresInMinutes} minutes.` : 'This one-time security link will expire automatically.',
    }),
  }),
  'security.password_changed': template({
    event: 'security.password_changed',
    stream: 'transactional',
    sender: 'security',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: z.object({
      recipientName: nameSchema,
      changedAt: shortTextSchema.optional(),
      secureAccountUrl: urlSchema.default('https://talentconsulting.io/auth/reset-password'),
    }),
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io password was changed',
      preheader: 'Your account password was updated successfully.',
      category: 'Security',
      title: 'Password changed',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Your TalentConsulting.io password was changed successfully.'],
      details: payload.changedAt ? [{ label: 'Changed', value: payload.changedAt }] : undefined,
      callout: {
        tone: 'danger',
        title: 'Wasn’t you?',
        body: 'Secure your account immediately by resetting your password, then contact support.',
      },
      action: { label: 'Secure my account', url: payload.secureAccountUrl },
    }),
  }),
  'security.email_change_requested': template({
    event: 'security.email_change_requested', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: actionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Confirm your new email address', preheader: 'Confirm this address to finish changing your account email.',
      category: 'Security', title: 'Confirm your email change', greeting: greeting(payload.recipientName),
      paragraphs: ['A request was made to use this email address for a TalentConsulting.io account. Confirm the change using the secure link below.'],
      callout: { tone: 'warning', title: 'Didn’t request this?', body: 'Do not use the link. Your current account email will remain unchanged.' },
      action: { label: 'Confirm new email', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This secure link expires in ${payload.expiresInMinutes} minutes.` : 'This secure link expires automatically.',
    }),
  }),
  'security.email_changed': template({
    event: 'security.email_changed', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io email address changed', preheader: 'The sign-in email for your account was updated.',
      category: 'Security', title: 'Email address changed', greeting: greeting(payload.recipientName),
      paragraphs: ['The sign-in email for your TalentConsulting.io account was changed.'],
      details: payload.occurredAt ? [{ label: 'Changed', value: payload.occurredAt }] : undefined,
      callout: { tone: 'danger', title: 'Wasn’t you?', body: 'Secure your account immediately and contact support.' },
      action: { label: 'Review account security', url: payload.securityUrl },
    }),
  }),
  'security.email_recovery_requested': template({
    event: 'security.email_recovery_requested', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: actionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Restore your TalentConsulting.io email address', preheader: 'Use this secure link if you did not authorize the email-address change.',
      category: 'Security', title: 'Restore your email address', greeting: greeting(payload.recipientName),
      paragraphs: ['The email address on your account changed. Use this secure link to restore the previous address if you did not authorize the change.'],
      callout: { tone: 'danger', body: 'After restoring the address, reset your password and review active sessions.' },
      action: { label: 'Restore email address', url: payload.actionUrl },
    }),
  }),
  'security.new_sign_in': template({
    event: 'security.new_sign_in', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'New sign-in to your TalentConsulting.io account', preheader: 'Review a recent sign-in to your account.',
      category: 'Security', title: 'New sign-in detected', greeting: greeting(payload.recipientName),
      paragraphs: ['A new sign-in to your TalentConsulting.io account was detected.'],
      details: [
        ...(payload.occurredAt ? [{ label: 'Time', value: payload.occurredAt }] : []),
        ...(payload.device ? [{ label: 'Device', value: payload.device }] : []),
        ...(payload.location ? [{ label: 'Approximate location', value: payload.location }] : []),
      ],
      callout: { tone: 'warning', title: 'Don’t recognize this?', body: 'Change your password and revoke other sessions immediately.' },
      action: { label: 'Review account security', url: payload.securityUrl },
    }),
  }),
  'security.mfa_enabled': template({
    event: 'security.mfa_enabled', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Two-factor authentication was enabled', preheader: 'Your TalentConsulting.io account has an additional security factor.',
      category: 'Security', title: 'Two-factor authentication enabled', greeting: greeting(payload.recipientName),
      paragraphs: ['An authenticator was added to your account. Future sign-ins may require a verification code.'],
      callout: { tone: 'danger', title: 'Wasn’t you?', body: 'Review account security and contact support immediately.' },
      action: { label: 'Review security settings', url: payload.securityUrl },
    }),
  }),
  'security.mfa_disabled': template({
    event: 'security.mfa_disabled', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Two-factor authentication was disabled', preheader: 'An additional security factor was removed from your account.',
      category: 'Security', title: 'Two-factor authentication disabled', greeting: greeting(payload.recipientName),
      paragraphs: ['Two-factor authentication was removed from your TalentConsulting.io account.'],
      callout: { tone: 'danger', title: 'Wasn’t you?', body: 'Reset your password and review active sessions immediately.' },
      action: { label: 'Secure my account', url: payload.securityUrl },
    }),
  }),
  'security.recovery_codes_generated': template({
    event: 'security.recovery_codes_generated', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'New account recovery codes were generated', preheader: 'Previously generated recovery codes may no longer work.',
      category: 'Security', title: 'Recovery codes changed', greeting: greeting(payload.recipientName),
      paragraphs: ['A new set of recovery codes was generated. For security, recovery codes are never included in email.'],
      callout: { tone: 'warning', body: 'Store the new codes securely. Review account security if you did not generate them.' },
      action: { label: 'Review security settings', url: payload.securityUrl },
    }),
  }),
  'security.admin_invitation': template({
    event: 'security.admin_invitation',
    stream: 'transactional',
    sender: 'security',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: adminInvitationSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'You were invited to TalentConsulting administration',
      preheader: `Set up your ${payload.roleName} access using this secure invitation.`,
      category: 'Privileged access',
      title: 'Your admin invitation',
      greeting: greeting(payload.recipientName),
      paragraphs: [
        `You were invited to serve as ${payload.roleName} for TalentConsulting.io.`,
        'Admin access is separate from plan access and is limited to the permissions assigned to your role.',
      ],
      details: [
        { label: 'Admin role', value: payload.roleName },
        { label: 'Invited by', value: payload.invitedBy },
      ],
      callout: {
        tone: 'warning',
        title: 'Protect this account',
        body: 'Use a unique password and enroll multi-factor authentication. Never share this invitation or an admin session.',
      },
      action: { label: 'Set up admin access', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes
        ? `This single-use setup link expires in ${payload.expiresInMinutes} minutes.`
        : 'Sign in again to refresh your admin permissions. Contact the owner if you did not expect this invitation.',
    }),
  }),
  'security.sessions_revoked': template({
    event: 'security.sessions_revoked', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your other sessions were signed out', preheader: 'Active TalentConsulting.io sessions were revoked.',
      category: 'Security', title: 'Sessions revoked', greeting: greeting(payload.recipientName),
      paragraphs: ['Other active sessions for your account were revoked. You may need to sign in again on your devices.'],
      action: { label: 'Review account security', url: payload.securityUrl },
    }),
  }),
  'security.account_locked': template({
    event: 'security.account_locked', stream: 'transactional', sender: 'security', preferenceKey: null, templateVersion: '1.0.0',
    schema: securityNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io account was temporarily locked', preheader: 'Sign-in was limited to protect your account.',
      category: 'Security', title: 'Account temporarily locked', greeting: greeting(payload.recipientName),
      paragraphs: ['Sign-in was temporarily limited after unusual or repeated activity. This precaution helps protect your account.'],
      details: payload.occurredAt ? [{ label: 'Locked', value: payload.occurredAt }] : undefined,
      callout: { tone: 'warning', body: 'Wait before trying again. Contact support if you did not cause the activity.' },
      action: { label: 'Contact support', url: 'https://talentconsulting.io/contact' },
    }),
  }),
  'account.welcome': template({
    event: 'account.welcome',
    stream: 'transactional',
    sender: 'account',
    preferenceKey: null,
    templateVersion: '2.0.0',
    schema: welcomeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Welcome—your career command center is ready',
      preheader: 'Meet Taco and create your first useful career win in about 10 minutes.',
      category: 'Welcome to TalentConsulting',
      title: 'Your next career move starts here',
      greeting: greeting(payload.recipientName),
      paragraphs: [
        'Your private career workspace is ready. TalentConsulting turns scattered career work into one clear, review-first system built around your goals.',
        'Start with a little context once, then let Taco help you find the signal, strengthen your story, and prepare your next best move.',
      ],
      items: [
        'Add or review your resume.',
        'Name the role, location, and compensation you want.',
        'Review your first personalized next steps.',
      ],
      callout: {
        tone: 'success',
        title: 'Your first win is about 10 minutes away',
        body: 'Leave with one practical next move you understand and chose—not another overwhelming list.',
      },
      persona: tacoPersona('I’ll connect your experience, goals, and opportunities—without taking control away from you.', 'hero'),
      action: { label: 'Start my first win', url: payload.dashboardUrl },
      secondaryAction: { label: 'Say hello to Taco', url: 'https://talentconsulting.io/suite/agent' },
      showSocialFooter: true,
      footerNote: 'Nothing is submitted to an employer without your decision.',
    }),
  }),
  'account.preferences_updated': template({
    event: 'account.preferences_updated',
    stream: 'transactional',
    sender: 'account',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: preferencesUpdatedSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your email preferences were updated',
      preheader: 'A receipt for changes to your TalentConsulting.io email settings.',
      category: 'Account',
      title: 'Email preferences updated',
      greeting: greeting(payload.recipientName),
      paragraphs: ['We saved the following changes to your email preferences:'],
      items: payload.changedPreferences,
      callout: {
        tone: 'neutral',
        title: 'Wasn’t you?',
        body: 'Review your settings and contact support if you did not make these changes.',
      },
      action: { label: 'Review email preferences', url: payload.settingsUrl },
    }),
  }),
  'account.access_changed': template({
    event: 'account.access_changed',
    stream: 'transactional',
    sender: 'account',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: accessChangedSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `${planLabel(payload.planName)} access is now available`,
      preheader: `Your account now includes ${planLabel(payload.planName)} access.`,
      category: 'Account',
      title: 'Your account access changed',
      greeting: greeting(payload.recipientName),
      paragraphs: [`Your account now includes ${planLabel(payload.planName)} access.`],
      callout: payload.accessSummary ? { tone: 'info', title: 'What changed', body: payload.accessSummary } : undefined,
      action: { label: 'Open your dashboard', url: payload.dashboardUrl },
    }),
  }),
  'account.deactivation_requested': template({
    event: 'account.deactivation_requested', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountActionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Confirm optional-email pause', preheader: 'Use this secure link to pause optional email. Sign-in remains available.',
      category: 'Account', title: 'Confirm optional-email pause', greeting: greeting(payload.recipientName),
      paragraphs: ['A request was made to pause optional product email. This does not disable sign-in or delete your account data.'],
      callout: { tone: 'warning', title: 'Didn’t request this?', body: 'Ignore this email. Your email preferences will not change.' },
      action: { label: 'Pause optional email', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This single-use link expires in ${payload.expiresInMinutes} minutes.` : 'This single-use link expires automatically.',
    }),
  }),
  'account.deactivated': template({
    event: 'account.deactivated', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your optional email is paused', preheader: 'Optional product email is paused. Your account remains accessible.',
      category: 'Account', title: 'Optional email paused', greeting: greeting(payload.recipientName),
      paragraphs: ['Optional product email is paused. You can still sign in, and your account data has not been deleted. Essential account and security messages may still be sent.'],
      details: payload.occurredAt ? [{ label: 'Paused', value: payload.occurredAt }] : undefined,
      action: { label: 'Review account', url: payload.accountUrl },
    }),
  }),
  'account.reactivated': template({
    event: 'account.reactivated', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io account is active again', preheader: 'Your account was reactivated successfully.',
      category: 'Account', title: 'Account reactivated', greeting: greeting(payload.recipientName),
      paragraphs: ['Your account is active again. Optional email preferences remain under your control and are not automatically re-enabled.'],
      action: { label: 'Open account settings', url: payload.accountUrl },
    }),
  }),
  'account.deletion_requested': template({
    event: 'account.deletion_requested', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountActionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Confirm permanent account deletion', preheader: 'Review and confirm the permanent deletion request for your account.',
      category: 'Account', title: 'Confirm account deletion', greeting: greeting(payload.recipientName),
      paragraphs: ['A request was made to delete your TalentConsulting.io account. Confirming this link queues the request for processing; it does not mean deletion is complete. Retention requirements may apply.'],
      callout: { tone: 'danger', title: 'Permanent action', body: 'Only continue if you understand that account data and access may not be recoverable.' },
      action: { label: 'Review deletion request', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This single-use link expires in ${payload.expiresInMinutes} minutes.` : 'This single-use link expires automatically.',
    }),
  }),
  'account.deleted': template({
    event: 'account.deleted', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io account was deleted', preheader: 'Confirmation that your account deletion was completed.',
      category: 'Account', title: 'Account deletion complete', greeting: greeting(payload.recipientName),
      paragraphs: ['Your account deletion was completed. Some records may be retained where required for security, fraud prevention, legal, or financial obligations.'],
      details: payload.occurredAt ? [{ label: 'Completed', value: payload.occurredAt }] : undefined,
      action: { label: 'Contact support', url: 'https://talentconsulting.io/contact' },
    }),
  }),
  'account.export_ready': template({
    event: 'account.export_ready', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: accountActionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io data export is ready', preheader: 'Download the export using a secure, expiring link.',
      category: 'Privacy', title: 'Data export ready', greeting: greeting(payload.recipientName),
      paragraphs: ['The data export you requested is ready. The download link is personal, single-use where supported, and expires automatically.'],
      callout: { tone: 'warning', body: 'Do not forward this email or share the download link.' },
      action: { label: 'Download data export', url: payload.actionUrl },
      footerNote: payload.expiresInMinutes ? `This secure link expires in ${payload.expiresInMinutes} minutes.` : 'This secure link expires automatically.',
    }),
  }),
  'account.material_policy_notice': template({
    event: 'account.material_policy_notice', stream: 'transactional', sender: 'account', preferenceKey: null, templateVersion: '1.0.0',
    schema: z.object({
      recipientName: nameSchema,
      policyName: shortTextSchema,
      summary: z.string().trim().min(1).max(1_200),
      effectiveAt: shortTextSchema,
      policyUrl: urlSchema,
    }),
    build: (payload): StructuredEmailContent => ({
      subject: `Important update to our ${payload.policyName}`, preheader: `Review a material ${payload.policyName} update effective ${payload.effectiveAt}.`,
      category: 'Account', title: `${payload.policyName} update`, greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary],
      details: [{ label: 'Effective', value: payload.effectiveAt }],
      action: { label: `Read the ${payload.policyName}`, url: payload.policyUrl },
    }),
  }),
  'billing.subscription_activated': template({
    event: 'billing.subscription_activated',
    stream: 'transactional',
    sender: 'billing',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: subscriptionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Your ${planLabel(payload.planName)} subscription is active`,
      preheader: `Your TalentConsulting.io ${planLabel(payload.planName)} subscription is ready.`,
      category: 'Billing',
      title: 'Subscription confirmed',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Your subscription is active and your account access has been updated. Stripe remains the source of record for your receipt and invoice.'],
      details: [
        { label: 'Plan', value: planLabel(payload.planName) },
        { label: 'Billing interval', value: payload.interval },
        ...(payload.price ? [{ label: 'Price', value: payload.price }] : []),
        ...(payload.effectiveAt ? [{ label: 'Effective', value: payload.effectiveAt }] : []),
      ],
      action: payload.invoiceUrl
        ? { label: 'View Stripe receipt', url: payload.invoiceUrl }
        : { label: 'Manage billing', url: payload.billingUrl },
      secondaryAction: payload.invoiceUrl ? { label: 'Manage billing settings', url: payload.billingUrl } : undefined,
      footerNote: 'This confirmation complements Stripe’s official receipt; it does not replace it.',
    }),
  }),
  'billing.trial_ending': template({
    event: 'billing.trial_ending',
    stream: 'transactional',
    sender: 'billing',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: trialEndingSchema,
    build: (payload): StructuredEmailContent => ({
      subject: payload.daysLeft === 0 ? 'Your TalentConsulting.io trial ends today' : `Your trial ends in ${payload.daysLeft} day${payload.daysLeft === 1 ? '' : 's'}`,
      preheader: 'Review your billing details before your trial converts.',
      category: 'Billing',
      title: 'Your trial is ending',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Your trial will convert to a paid subscription unless you cancel before it ends.'],
      details: [
        { label: 'Time remaining', value: payload.daysLeft === 0 ? 'Ends today' : `${payload.daysLeft} day${payload.daysLeft === 1 ? '' : 's'}` },
        ...(payload.endsAt ? [{ label: 'Trial ends', value: payload.endsAt }] : []),
      ],
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.plan_changed': template({
    event: 'billing.plan_changed',
    stream: 'transactional',
    sender: 'billing',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: planChangedSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Your plan changed to ${planLabel(payload.newPlan)}`,
      preheader: `Your TalentConsulting.io plan changed from ${planLabel(payload.oldPlan)} to ${planLabel(payload.newPlan)}.`,
      category: 'Billing',
      title: 'Plan change confirmed',
      greeting: greeting(payload.recipientName),
      paragraphs: ['We updated your subscription plan. Your account access reflects the new plan.'],
      details: [
        { label: 'Previous plan', value: planLabel(payload.oldPlan) },
        { label: 'New plan', value: planLabel(payload.newPlan) },
        ...(payload.effectiveAt ? [{ label: 'Effective', value: payload.effectiveAt }] : []),
      ],
      action: { label: 'Manage billing', url: payload.billingUrl },
    }),
  }),
  'billing.cancellation_scheduled': template({
    event: 'billing.cancellation_scheduled',
    stream: 'transactional',
    sender: 'billing',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: cancellationSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your subscription cancellation is scheduled',
      preheader: 'Your paid access will remain available until the end of the current billing period.',
      category: 'Billing',
      title: 'Cancellation scheduled',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Your subscription will not renew. You can continue using paid features until your current billing period ends.'],
      details: payload.accessEndsAt ? [{ label: 'Paid access ends', value: payload.accessEndsAt }] : undefined,
      action: { label: 'Review subscription', url: payload.billingUrl },
    }),
  }),
  'billing.payment_failed': template({
    event: 'billing.payment_failed',
    stream: 'transactional',
    sender: 'billing',
    preferenceKey: null,
    templateVersion: '1.0.0',
    schema: paymentFailedSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Action needed: your payment did not go through',
      preheader: 'Update your payment method to avoid an interruption in access.',
      category: 'Billing',
      title: 'Payment failed',
      greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe could not complete the latest subscription payment. Update your payment method to keep your account in good standing.'],
      details: [
        ...(payload.amount ? [{ label: 'Amount', value: payload.amount }] : []),
        ...(payload.nextAttemptAt ? [{ label: 'Next attempt', value: payload.nextAttemptAt }] : []),
      ],
      callout: { tone: 'warning', body: 'TalentConsulting.io will never ask you to send card details by email.' },
      action: { label: 'Update payment method', url: payload.billingUrl },
      secondaryAction: payload.invoiceUrl ? { label: 'View invoice in Stripe', url: payload.invoiceUrl } : undefined,
    }),
  }),
  'billing.trial_started': template({
    event: 'billing.trial_started', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io trial has started',
      preheader: 'Your trial access is active. Review when it ends and what happens next.',
      category: 'Billing', title: 'Trial started', greeting: greeting(payload.recipientName),
      paragraphs: ['Your trial access is active. You can review or cancel the subscription at any time from Billing settings.'],
      details: [
        ...(payload.planName ? [{ label: 'Plan', value: planLabel(payload.planName) }] : []),
        ...(payload.nextEventAt ? [{ label: 'Trial ends', value: payload.nextEventAt }] : []),
      ],
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.renewal_upcoming': template({
    event: 'billing.renewal_upcoming', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your subscription renewal is coming up',
      preheader: 'Review the amount and renewal date for your TalentConsulting.io subscription.',
      category: 'Billing', title: 'Upcoming renewal', greeting: greeting(payload.recipientName),
      paragraphs: ['Your subscription is scheduled to renew automatically through Stripe.'],
      details: [
        ...(payload.planName ? [{ label: 'Plan', value: planLabel(payload.planName) }] : []),
        ...(payload.amount ? [{ label: 'Estimated total', value: payload.amount }] : []),
        ...(payload.nextEventAt ? [{ label: 'Renews', value: payload.nextEventAt }] : []),
      ],
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.renewal_succeeded': template({
    event: 'billing.renewal_succeeded', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your subscription renewed successfully',
      preheader: 'Stripe completed your TalentConsulting.io subscription renewal.',
      category: 'Billing', title: 'Renewal successful', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe completed your renewal and your subscription remains active. The Stripe invoice is the official financial record.'],
      details: [
        ...(payload.planName ? [{ label: 'Plan', value: planLabel(payload.planName) }] : []),
        ...(payload.amount ? [{ label: 'Amount paid', value: payload.amount }] : []),
        ...(payload.nextEventAt ? [{ label: 'Next renewal', value: payload.nextEventAt }] : []),
      ],
      action: payload.invoiceUrl ? { label: 'View Stripe invoice', url: payload.invoiceUrl } : { label: 'Review billing', url: payload.billingUrl },
      secondaryAction: payload.invoiceUrl ? { label: 'Manage billing', url: payload.billingUrl } : undefined,
      footerNote: 'This message complements Stripe’s official invoice; it does not replace it.',
    }),
  }),
  'billing.invoice_available': template({
    event: 'billing.invoice_available', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema.extend({ invoiceUrl: urlSchema }),
    build: (payload): StructuredEmailContent => ({
      subject: 'Your Stripe invoice is available',
      preheader: 'View your official subscription invoice securely in Stripe.',
      category: 'Billing', title: 'Invoice available', greeting: greeting(payload.recipientName),
      paragraphs: ['Your official TalentConsulting.io invoice is ready in Stripe.'],
      details: [
        ...(payload.amount ? [{ label: 'Amount', value: payload.amount }] : []),
        ...(payload.effectiveAt ? [{ label: 'Invoice date', value: payload.effectiveAt }] : []),
      ],
      action: { label: 'View Stripe invoice', url: payload.invoiceUrl },
      footerNote: 'Stripe hosts the authoritative invoice and payment record.',
    }),
  }),
  'billing.payment_succeeded': template({
    event: 'billing.payment_succeeded', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your payment was successful',
      preheader: 'Stripe completed your TalentConsulting.io payment.',
      category: 'Billing', title: 'Payment successful', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe completed your payment successfully.'],
      details: [
        ...(payload.amount ? [{ label: 'Amount paid', value: payload.amount }] : []),
        ...(payload.effectiveAt ? [{ label: 'Paid', value: payload.effectiveAt }] : []),
      ],
      action: payload.invoiceUrl ? { label: 'View Stripe receipt', url: payload.invoiceUrl } : { label: 'Review billing', url: payload.billingUrl },
      footerNote: 'Stripe remains the source of record for the receipt and invoice.',
    }),
  }),
  'billing.payment_action_required': template({
    event: 'billing.payment_action_required', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: paymentActionSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Action required to complete your payment',
      preheader: 'Complete Stripe’s secure payment authentication to keep your subscription active.',
      category: 'Billing', title: 'Payment action required', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe needs you to complete an additional authentication step before this payment can finish.'],
      details: payload.amount ? [{ label: 'Amount', value: payload.amount }] : undefined,
      callout: { tone: 'warning', body: 'Complete the step only on Stripe’s secure page. Never send card or authentication details by email.' },
      action: { label: 'Complete payment in Stripe', url: payload.invoiceUrl },
      secondaryAction: { label: 'Review billing settings', url: payload.billingUrl },
    }),
  }),
  'billing.interval_changed': template({
    event: 'billing.interval_changed', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: intervalChangedSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Your billing interval changed to ${payload.newInterval}`,
      preheader: `Your subscription billing changed from ${payload.oldInterval} to ${payload.newInterval}.`,
      category: 'Billing', title: 'Billing interval changed', greeting: greeting(payload.recipientName),
      paragraphs: ['We updated how often your subscription renews.'],
      details: [
        { label: 'Previous interval', value: payload.oldInterval },
        { label: 'New interval', value: payload.newInterval },
        ...(payload.effectiveAt ? [{ label: 'Effective', value: payload.effectiveAt }] : []),
      ],
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.cancellation_reversed': template({
    event: 'billing.cancellation_reversed', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: billingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your subscription will continue',
      preheader: 'The scheduled cancellation was reversed and automatic renewal is active.',
      category: 'Billing', title: 'Cancellation reversed', greeting: greeting(payload.recipientName),
      paragraphs: ['The scheduled cancellation was removed. Your subscription will continue and renew automatically through Stripe.'],
      details: payload.nextEventAt ? [{ label: 'Next renewal', value: payload.nextEventAt }] : undefined,
      action: { label: 'Review subscription', url: payload.billingUrl },
    }),
  }),
  'billing.subscription_ended': template({
    event: 'billing.subscription_ended', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: cancellationSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your paid subscription has ended',
      preheader: 'Your TalentConsulting.io account has returned to free access.',
      category: 'Billing', title: 'Subscription ended', greeting: greeting(payload.recipientName),
      paragraphs: ['Your paid subscription has ended and your account now uses free access. Your saved account data remains available under the applicable retention policy.'],
      details: payload.accessEndsAt ? [{ label: 'Paid access ended', value: payload.accessEndsAt }] : undefined,
      action: { label: 'Review plans', url: payload.billingUrl },
    }),
  }),
  'billing.payment_method_expiring': template({
    event: 'billing.payment_method_expiring', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: paymentMethodSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your payment method is expiring soon',
      preheader: 'Update your payment method before the next subscription renewal.',
      category: 'Billing', title: 'Payment method expiring', greeting: greeting(payload.recipientName),
      paragraphs: ['The payment method Stripe has on file is approaching its expiration date.'],
      details: [
        ...(payload.brand || payload.last4 ? [{ label: 'Payment method', value: `${payload.brand || 'Card'}${payload.last4 ? ` ending in ${payload.last4}` : ''}` }] : []),
        ...(payload.expiresAt ? [{ label: 'Expires', value: payload.expiresAt }] : []),
      ],
      action: { label: 'Update payment method', url: payload.billingUrl },
    }),
  }),
  'billing.payment_method_updated': template({
    event: 'billing.payment_method_updated', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: paymentMethodSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your payment method was updated',
      preheader: 'The payment method for your TalentConsulting.io subscription changed.',
      category: 'Billing', title: 'Payment method updated', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe updated the payment method associated with your subscription.'],
      details: payload.brand || payload.last4 ? [{ label: 'New payment method', value: `${payload.brand || 'Card'}${payload.last4 ? ` ending in ${payload.last4}` : ''}` }] : undefined,
      callout: { tone: 'neutral', title: 'Wasn’t you?', body: 'Review billing and contact support immediately if you did not make this change.' },
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.price_change_notice': template({
    event: 'billing.price_change_notice', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: priceChangeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `An upcoming price change for ${planLabel(payload.planName)}`,
      preheader: 'Review the new subscription price and when it takes effect.',
      category: 'Billing', title: 'Subscription price change', greeting: greeting(payload.recipientName),
      paragraphs: ['The price of your subscription is changing. This notice is being sent before the new price takes effect.'],
      details: [
        { label: 'Plan', value: planLabel(payload.planName) },
        { label: 'Current price', value: payload.oldPrice },
        { label: 'New price', value: payload.newPrice },
        { label: 'Effective', value: payload.effectiveAt },
      ],
      action: { label: 'Review subscription', url: payload.billingUrl },
    }),
  }),
  'billing.refund_requested': template({
    event: 'billing.refund_requested', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: refundSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'We received your refund request',
      preheader: 'Your refund request is under review.',
      category: 'Billing', title: 'Refund request received', greeting: greeting(payload.recipientName),
      paragraphs: ['We received your refund request. We will update you after the request is reviewed or submitted to Stripe.'],
      details: [{ label: 'Requested amount', value: payload.amount }, ...(payload.statusDate ? [{ label: 'Requested', value: payload.statusDate }] : [])],
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.refund_succeeded': template({
    event: 'billing.refund_succeeded', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: refundSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your refund was processed',
      preheader: 'Stripe processed your refund. Bank posting times can vary.',
      category: 'Billing', title: 'Refund processed', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe processed your refund. Your bank or card issuer may take additional time to show the credit.'],
      details: [{ label: 'Refund amount', value: payload.amount }, ...(payload.statusDate ? [{ label: 'Processed', value: payload.statusDate }] : [])],
      callout: { tone: 'info', body: 'Stripe’s refund receipt and your financial institution are the authoritative sources for settlement timing.' },
      action: { label: 'Review billing', url: payload.billingUrl },
    }),
  }),
  'billing.refund_failed': template({
    event: 'billing.refund_failed', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: refundSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'There is a problem with your refund',
      preheader: 'The refund could not be completed and needs review.',
      category: 'Billing', title: 'Refund needs review', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe could not complete the refund. Our billing team will review the issue.'],
      details: [{ label: 'Refund amount', value: payload.amount }],
      callout: payload.reason ? { tone: 'warning', title: 'Status', body: payload.reason } : undefined,
      action: { label: 'Contact support', url: 'https://talentconsulting.io/contact' },
    }),
  }),
  'billing.dispute_received': template({
    event: 'billing.dispute_received', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: disputeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'We were notified of a payment dispute',
      preheader: 'A payment dispute was opened with your financial institution.',
      category: 'Billing', title: 'Payment dispute received', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe notified us that a payment was disputed through your bank or card issuer. Do not email card details or dispute evidence.'],
      details: [{ label: 'Disputed amount', value: payload.amount }, ...(payload.status ? [{ label: 'Status', value: payload.status }] : [])],
      callout: { tone: 'warning', body: 'If you recognize the purchase or opened the dispute by mistake, contact your bank and TalentConsulting.io support.' },
      action: { label: 'Contact support', url: payload.supportUrl },
    }),
  }),
  'billing.dispute_won': template({
    event: 'billing.dispute_won', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: disputeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your payment dispute was resolved',
      preheader: 'Stripe reported that the dispute was resolved in TalentConsulting.io’s favor.',
      category: 'Billing', title: 'Dispute resolved', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe reported that the payment dispute was resolved and the disputed funds were returned to TalentConsulting.io.'],
      details: [{ label: 'Disputed amount', value: payload.amount }, { label: 'Outcome', value: 'Resolved in merchant’s favor' }],
      action: { label: 'Contact support', url: payload.supportUrl },
    }),
  }),
  'billing.dispute_lost': template({
    event: 'billing.dispute_lost', stream: 'transactional', sender: 'billing', preferenceKey: null, templateVersion: '1.0.0',
    schema: disputeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your payment dispute was resolved',
      preheader: 'Stripe reported that the disputed funds were returned through your financial institution.',
      category: 'Billing', title: 'Dispute resolved', greeting: greeting(payload.recipientName),
      paragraphs: ['Stripe reported that the dispute was resolved and the disputed funds were returned through your bank or card issuer.'],
      details: [{ label: 'Disputed amount', value: payload.amount }, { label: 'Outcome', value: 'Resolved in customer’s favor' }],
      action: { label: 'Contact support', url: payload.supportUrl },
    }),
  }),
  'support.feedback_received': template({
    event: 'support.feedback_received', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `We received your message (${payload.caseId})`, preheader: 'Your message reached TalentConsulting.io support.',
      category: 'Support', title: 'Message received', greeting: greeting(payload.recipientName),
      paragraphs: ['Thanks for contacting TalentConsulting.io. Your message is in our support queue.'],
      details: [{ label: 'Reference', value: payload.caseId }, ...(payload.occurredAt ? [{ label: 'Received', value: payload.occurredAt }] : [])],
      callout: payload.summary ? { tone: 'neutral', title: 'Your message', body: payload.summary } : undefined,
      action: { label: 'Contact support', url: payload.caseUrl },
    }),
  }),
  'support.case_opened': template({
    event: 'support.case_opened', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Support case ${payload.caseId} is open`, preheader: 'TalentConsulting.io support opened a case for your request.',
      category: 'Support', title: 'Support case opened', greeting: greeting(payload.recipientName),
      paragraphs: ['Our support team opened a case and will use the reference below for follow-up.'],
      details: [{ label: 'Case', value: payload.caseId }, ...(payload.occurredAt ? [{ label: 'Opened', value: payload.occurredAt }] : [])],
      callout: payload.summary ? { tone: 'neutral', body: payload.summary } : undefined,
      action: { label: 'View support options', url: payload.caseUrl },
    }),
  }),
  'support.case_updated': template({
    event: 'support.case_updated', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Update on support case ${payload.caseId}`, preheader: 'There is an update on your TalentConsulting.io support case.',
      category: 'Support', title: 'Support case updated', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary || 'There is a new update on your support case.'],
      details: [{ label: 'Case', value: payload.caseId }, ...(payload.occurredAt ? [{ label: 'Updated', value: payload.occurredAt }] : [])],
      action: { label: 'Contact support', url: payload.caseUrl },
    }),
  }),
  'support.case_resolved': template({
    event: 'support.case_resolved', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Support case ${payload.caseId} was resolved`, preheader: 'Your TalentConsulting.io support case is marked resolved.',
      category: 'Support', title: 'Support case resolved', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary || 'Your support case is marked resolved. Contact us if you still need help.'],
      details: [{ label: 'Case', value: payload.caseId }],
      action: { label: 'Get more help', url: payload.caseUrl },
    }),
  }),
  'support.case_reopened': template({
    event: 'support.case_reopened', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Support case ${payload.caseId} was reopened`, preheader: 'Your support case is active again.',
      category: 'Support', title: 'Support case reopened', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary || 'Your support case was reopened and is back in the support queue.'],
      details: [{ label: 'Case', value: payload.caseId }],
      action: { label: 'Contact support', url: payload.caseUrl },
    }),
  }),
  'support.billing_review_opened': template({
    event: 'support.billing_review_opened', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: supportCaseSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Billing review ${payload.caseId} is open`, preheader: 'Our billing team is reviewing your request.',
      category: 'Billing support', title: 'Billing review opened', greeting: greeting(payload.recipientName),
      paragraphs: ['Our billing team is reviewing your request. Stripe records remain authoritative while the review is in progress.'],
      details: [{ label: 'Reference', value: payload.caseId }],
      callout: payload.summary ? { tone: 'neutral', body: payload.summary } : undefined,
      action: { label: 'Contact billing support', url: payload.caseUrl },
    }),
  }),
  'support.maintenance_scheduled': template({
    event: 'support.maintenance_scheduled', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: serviceNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Scheduled maintenance for ${payload.serviceName}`, preheader: 'A planned maintenance window may affect service availability.',
      category: 'Service notice', title: 'Scheduled maintenance', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary],
      details: [
        ...(payload.startsAt ? [{ label: 'Starts', value: payload.startsAt }] : []),
        ...(payload.endsAt ? [{ label: 'Expected end', value: payload.endsAt }] : []),
      ],
      action: { label: 'Get support', url: payload.statusUrl },
    }),
  }),
  'support.incident_opened': template({
    event: 'support.incident_opened', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: serviceNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Service incident affecting ${payload.serviceName}`, preheader: 'We are investigating a service incident.',
      category: 'Service incident', title: 'We are investigating', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary],
      details: payload.startsAt ? [{ label: 'Started', value: payload.startsAt }] : undefined,
      callout: { tone: 'warning', body: 'We will send meaningful updates as the investigation progresses.' },
      action: { label: 'Get support', url: payload.statusUrl },
    }),
  }),
  'support.incident_updated': template({
    event: 'support.incident_updated', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: serviceNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Update: ${payload.serviceName} service incident`, preheader: 'There is a new update on the active service incident.',
      category: 'Service incident', title: 'Incident update', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary],
      action: { label: 'Get support', url: payload.statusUrl },
    }),
  }),
  'support.incident_resolved': template({
    event: 'support.incident_resolved', stream: 'transactional', sender: 'support', preferenceKey: null, templateVersion: '1.0.0',
    schema: serviceNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: `Resolved: ${payload.serviceName} service incident`, preheader: 'The service incident has been resolved.',
      category: 'Service incident', title: 'Incident resolved', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary],
      details: payload.endsAt ? [{ label: 'Resolved', value: payload.endsAt }] : undefined,
      callout: { tone: 'success', body: 'Service has returned to normal operation.' },
      action: { label: 'Get support', url: payload.statusUrl },
    }),
  }),
  'product.career_picks': template({
    event: 'product.career_picks', stream: 'product', sender: 'taco', preferenceKey: 'jobDigest', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your Career Picks by Taco are ready', preheader: 'Review curated job matches and decide what to pursue.',
      category: 'Career Picks by Taco', title: 'Your career picks are ready', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      callout: { tone: 'neutral', body: 'Taco prepared recommendations for your review. Nothing was submitted or sent to an employer.' },
      persona: tacoPersona('I found a focused set of opportunities for you to review.'),
      action: { label: 'Review career picks', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
      footerNote: 'You receive this only while Career Picks by Taco email is enabled.',
    }),
  }),
  'product.taco_digest': template({
    event: 'product.taco_digest', stream: 'product', sender: 'taco', preferenceKey: 'jobDigest', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Taco prepared your review queue', preheader: 'Review the opportunities and next actions Taco prepared.',
      category: 'Taco digest', title: 'Your review queue is ready', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      callout: { tone: 'info', body: 'Review-first: Taco did not apply or contact anyone for you.' },
      persona: tacoPersona('I organized the most useful opportunities and actions into one review queue.'),
      action: { label: 'Open Taco review queue', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.study_reminder': template({
    event: 'product.study_reminder', stream: 'product', sender: 'taco', preferenceKey: 'studyReminders', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your Skill Bridge plan is ready for today', preheader: 'Continue your learning plan and keep your progress moving.',
      category: 'Skill Bridge', title: 'Today’s study plan', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('I kept today’s plan focused so it is easier to finish.'),
      action: { label: 'Continue studying', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.application_update': template({
    event: 'product.application_update', stream: 'product', sender: 'taco', preferenceKey: 'applicationUpdates', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'An application in your pipeline changed', preheader: 'Review the latest application status and next action.',
      category: 'Applications', title: 'Application update', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('I noticed a change in your application pipeline.'),
      action: { label: 'Review applications', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.interview_reminder': template({
    event: 'product.interview_reminder', stream: 'product', sender: 'taco', preferenceKey: 'interviewReminders', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your interview is coming up', preheader: 'Review the schedule and preparation notes for your interview.',
      category: 'Interview', title: 'Interview reminder', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('I pulled your interview details and preparation notes together.'),
      action: { label: 'Prepare for interview', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.offer_update': template({
    event: 'product.offer_update', stream: 'product', sender: 'taco', preferenceKey: 'offerUpdates', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'There is an update on an offer you track', preheader: 'Review the offer status and your saved decision notes.',
      category: 'Offers', title: 'Offer update', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('I organized the latest offer details for a clear review.'),
      action: { label: 'Review offer', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.workflow_result': template({
    event: 'product.workflow_result', stream: 'product', sender: 'taco', preferenceKey: 'weeklyRecap', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your TalentConsulting.io workflow finished', preheader: 'Review the result and decide the next action.',
      category: 'Workflow', title: 'Workflow complete', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('Your result is ready. I left the final decision with you.'),
      action: { label: 'Review result', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'product.weekly_recap': template({
    event: 'product.weekly_recap', stream: 'product', sender: 'taco', preferenceKey: 'weeklyRecap', templateVersion: '2.0.0',
    schema: productNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: 'Your weekly career progress recap', preheader: 'Review progress, open actions, and the next useful steps.',
      category: 'Weekly recap', title: 'Your week in review', greeting: greeting(payload.recipientName),
      paragraphs: [payload.summary], items: payload.items,
      persona: tacoPersona('Here is the progress worth noticing and the next move worth considering.'),
      action: { label: 'Open dashboard', url: payload.actionUrl }, preferenceUrl: payload.preferenceUrl, unsubscribeUrl: payload.unsubscribeUrl,
      showSocialFooter: true,
    }),
  }),
  'internal.refund_escalation': template({
    event: 'internal.refund_escalation', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Refund escalation', 'A refund requires operations review.'),
  }),
  'internal.dispute_escalation': template({
    event: 'internal.dispute_escalation', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Dispute escalation', 'A Stripe dispute requires operations review.'),
  }),
  'internal.stripe_reconciliation_failed': template({
    event: 'internal.stripe_reconciliation_failed', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Stripe reconciliation failed', 'Billing state could not be reconciled automatically.'),
  }),
  'internal.email_delivery_failed': template({
    event: 'internal.email_delivery_failed', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Email delivery failed', 'A transactional message reached a terminal delivery failure.'),
  }),
  'internal.email_queue_backlog': template({
    event: 'internal.email_queue_backlog', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Email queue backlog', 'The email outbox requires operations attention.'),
  }),
  'internal.email_complaint_received': template({
    event: 'internal.email_complaint_received', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Email complaint received', 'A recipient complaint paused optional email delivery.'),
  }),
  'internal.support_request_received': template({
    event: 'internal.support_request_received', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Support request received', 'A new customer support request is ready for triage.'),
  }),
  'internal.security_anomaly': template({
    event: 'internal.security_anomaly', stream: 'internal', sender: 'operations', preferenceKey: null, templateVersion: '1.0.0',
    schema: internalAlertSchema,
    build: (payload): StructuredEmailContent => internalAlertContent(payload, 'Security anomaly', 'A security signal requires investigation.'),
  }),
  'marketing.product_announcement': template({
    event: 'marketing.product_announcement', stream: 'marketing', sender: 'marketing', preferenceKey: 'marketing', templateVersion: '1.1.0',
    schema: marketingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: payload.headline, preheader: payload.summary.slice(0, 180), category: 'Product news', title: payload.headline,
      greeting: greeting(payload.recipientName), paragraphs: [payload.summary], items: payload.items,
      action: { label: payload.actionLabel, url: payload.actionUrl }, unsubscribeUrl: payload.unsubscribeUrl, mailingAddress: payload.mailingAddress,
      showSocialFooter: true,
      footerNote: 'You are receiving this because you explicitly opted in to marketing email.',
    }),
  }),
  'marketing.educational_newsletter': template({
    event: 'marketing.educational_newsletter', stream: 'marketing', sender: 'marketing', preferenceKey: 'marketing', templateVersion: '1.1.0',
    schema: marketingNoticeSchema,
    build: (payload): StructuredEmailContent => ({
      subject: payload.headline, preheader: payload.summary.slice(0, 180), category: 'Career newsletter', title: payload.headline,
      greeting: greeting(payload.recipientName), paragraphs: [payload.summary], items: payload.items,
      action: { label: payload.actionLabel, url: payload.actionUrl }, unsubscribeUrl: payload.unsubscribeUrl, mailingAddress: payload.mailingAddress,
      showSocialFooter: true,
      footerNote: 'You are receiving this because you explicitly opted in to marketing email.',
    }),
  }),
} as const;

export type EmailCatalog = typeof emailCatalog;
export type ImplementedEmailEventKey = keyof EmailCatalog;

function internalAlertContent(
  payload: z.output<typeof internalAlertSchema>,
  title: string,
  defaultSummary: string,
): StructuredEmailContent {
  return {
    subject: `[${payload.severity.toUpperCase()}] ${title}: ${payload.referenceId}`,
    preheader: payload.summary.slice(0, 180),
    category: 'Internal operations',
    title,
    paragraphs: [defaultSummary, payload.summary],
    details: [
      { label: 'Reference', value: payload.referenceId },
      { label: 'Severity', value: payload.severity },
      ...(payload.occurredAt ? [{ label: 'Occurred', value: payload.occurredAt }] : []),
      ...payload.details,
    ],
    callout: { tone: payload.severity === 'critical' ? 'danger' : payload.severity === 'warning' ? 'warning' : 'info', body: 'Do not forward this internal operations message outside authorized channels.' },
    action: payload.dashboardUrl ? { label: 'Open operations dashboard', url: payload.dashboardUrl } : undefined,
  };
}
