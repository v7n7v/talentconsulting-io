/**
 * Job Preferences API — Save/load user job search preferences from Firestore
 * Firestore path: users/{uid}/settings/jobPreferences
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { normalizeJobAlertsFrequency, type JobAlertsFrequency } from '@/lib/job-alerts';
import { invalidateTwin } from '@/lib/career-twin';
import {
  JOB_ALERT_EMAIL_CONSENT_VERSION,
  getJobAlertDeliverySnapshot,
  verifyJobAlertEmailResume,
} from '@/lib/job-notification-delivery';

export interface JobPreferences {
  targetRoles: string[];
  preferredCities: string[];
  remotePref: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin: number;
  industries: string[];
  emailNotifications: boolean;
  lastUpdated: string;
  agentEnabled?: boolean;
  agentMaxPerNight?: number;
  agentMinMatchScore?: number;
  agentExcludeCompanies?: string[];
  agentAutonomyLevel?: 'scout' | 'prepare' | 'review' | 'assist';
  agentDigestEmailEnabled?: boolean;
  agentDigestFrequency?: 'daily' | 'weekly';
  agentDigestConsentAt?: string;
  agentDigestConsentVersion?: string;
  agentDigestConsentSource?: string;
  jobAlertsEnabled?: boolean;
  jobAlertsFrequency?: JobAlertsFrequency;
  jobAlertsSubscribedAt?: string;
  jobAlertsUnsubscribedAt?: string;
  jobAlertsConsentAt?: string;
  jobAlertsConsentVersion?: string;
  jobAlertsConsentSource?: string;
  jobAlertsLastSentAt?: string;
  jobAlertsLastJobCount?: number;
  jobAlertsRecentKeys?: string[];
  jobAlertsDeliveryStatus?: string;
  jobAlertsDeliveryError?: string | null;
  jobAlertsDeliveryPausedReason?: string | null;
}

const DEFAULT_PREFS: JobPreferences = {
  targetRoles: [],
  preferredCities: [],
  remotePref: 'any',
  salaryMin: 0,
  industries: [],
  emailNotifications: false,
  jobAlertsFrequency: 'weekly',
  lastUpdated: new Date().toISOString(),
};

// GET — Load preferences
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const db = getAdminDb();
    const docRef = db.collection('users').doc(guard.user.uid).collection('settings').doc('jobPreferences');
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({
        success: true,
        preferences: DEFAULT_PREFS,
        delivery: getJobAlertDeliverySnapshot(DEFAULT_PREFS),
        isNew: true,
      });
    }

    const data = snap.data() as JobPreferences;
    const jobAlertsFrequency = normalizeJobAlertsFrequency(data.jobAlertsFrequency || 'weekly', guard.user.tier);
    const canUseProactiveAgent = guard.user.tier === 'studio' || guard.user.tier === 'god';
    if (data.jobAlertsFrequency !== jobAlertsFrequency) {
      docRef.set({ jobAlertsFrequency }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      preferences: {
        ...DEFAULT_PREFS,
        ...data,
        emailNotifications: data.emailNotifications === true,
        agentEnabled: canUseProactiveAgent && data.agentEnabled === true,
        agentDigestEmailEnabled: canUseProactiveAgent && data.agentDigestEmailEnabled === true,
        jobAlertsFrequency,
      },
      delivery: getJobAlertDeliverySnapshot(data),
      isNew: false,
    });
  } catch (error) {
    console.error('[jobs/preferences] GET error:', error);
    monitor.critical('Tool: jobs/preferences', String(error));
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

// POST — Save preferences
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection('users').doc(guard.user.uid).collection('settings').doc('jobPreferences');
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};
    const now = new Date().toISOString();
    const canUseProactiveAgent = guard.user.tier === 'studio' || guard.user.tier === 'god';
    const jobAlertsFrequency = normalizeJobAlertsFrequency(body.jobAlertsFrequency ?? existing.jobAlertsFrequency ?? 'weekly', guard.user.tier);
    const jobAlertsEnabled = body.jobAlertsEnabled !== undefined
      ? body.jobAlertsEnabled === true
      : existing.jobAlertsEnabled === true;
    const resumingEmail = body.emailNotifications === true && existing.emailNotifications !== true;
    const enablingJobAlerts = jobAlertsEnabled && (existing.jobAlertsEnabled !== true || resumingEmail);
    if (enablingJobAlerts && body.jobAlertsConsentAcknowledged !== true) {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_CONSENT_REQUIRED',
        error: 'Confirm email delivery before enabling Sona Picks.',
      }, { status: 400 });
    }
    const agentDigestEmailEnabled = canUseProactiveAgent && (body.agentDigestEmailEnabled !== undefined
      ? body.agentDigestEmailEnabled === true
      : existing.agentDigestEmailEnabled === true);
    const enablingAgentDigest = agentDigestEmailEnabled && (existing.agentDigestEmailEnabled !== true || resumingEmail);
    if (enablingAgentDigest && body.agentDigestConsentAcknowledged !== true) {
      return NextResponse.json({
        success: false,
        code: 'AGENT_DIGEST_CONSENT_REQUIRED',
        error: 'Confirm Sona agent digest email before enabling it.',
      }, { status: 400 });
    }

    const prefs: JobPreferences = {
      ...DEFAULT_PREFS,
      targetRoles: Array.isArray(body.targetRoles) ? body.targetRoles.slice(0, 10) : (existing.targetRoles || []),
      preferredCities: Array.isArray(body.preferredCities) ? body.preferredCities.slice(0, 10) : (existing.preferredCities || []),
      remotePref: ['remote', 'hybrid', 'onsite', 'any'].includes(body.remotePref) ? body.remotePref : (existing.remotePref || 'any'),
      salaryMin: body.salaryMin !== undefined
        ? Math.max(0, Math.min(500000, parseInt(body.salaryMin) || 0))
        : (existing.salaryMin || 0),
      industries: Array.isArray(body.industries) ? body.industries.slice(0, 10) : (existing.industries || []),
      emailNotifications: body.emailNotifications !== undefined ? body.emailNotifications === true : existing.emailNotifications === true,
      lastUpdated: now,
      agentEnabled: canUseProactiveAgent && (body.agentEnabled !== undefined ? body.agentEnabled === true : existing.agentEnabled === true),
      agentMaxPerNight: body.agentMaxPerNight !== undefined
        ? Math.min(10, Math.max(1, parseInt(body.agentMaxPerNight) || 5))
        : (existing.agentMaxPerNight || 5),
      agentMinMatchScore: body.agentMinMatchScore !== undefined
        ? Math.min(95, Math.max(50, parseInt(body.agentMinMatchScore) || 70))
        : (existing.agentMinMatchScore || 70),
      agentExcludeCompanies: Array.isArray(body.agentExcludeCompanies) ? body.agentExcludeCompanies.slice(0, 20) : (existing.agentExcludeCompanies || []),
      agentAutonomyLevel: ['scout', 'prepare', 'review', 'assist'].includes(body.agentAutonomyLevel) ? body.agentAutonomyLevel : (existing.agentAutonomyLevel || 'prepare'),
      agentDigestEmailEnabled,
      agentDigestFrequency: ['daily', 'weekly'].includes(body.agentDigestFrequency) ? body.agentDigestFrequency : (existing.agentDigestFrequency || 'daily'),
      jobAlertsEnabled,
      jobAlertsFrequency,
    };
    const saveResult = await db.runTransaction(async transaction => {
      const latestSnap = await transaction.get(docRef);
      const latest = latestSnap.data() || {};
      const latestResumingEmail = prefs.emailNotifications === true && latest.emailNotifications !== true;
      const latestEnablingJobAlerts = prefs.jobAlertsEnabled === true
        && (latest.jobAlertsEnabled !== true || latestResumingEmail);
      const latestEnablingAgentDigest = prefs.agentDigestEmailEnabled === true
        && (latest.agentDigestEmailEnabled !== true || latestResumingEmail);
      const resume = verifyJobAlertEmailResume(latest, {
        enableEmail: prefs.emailNotifications === true,
        resumeAfterProviderPause: body.resumeAfterProviderPause,
        providerPauseAt: body.providerPauseAt,
      });
      if (!resume.allowed) {
          return {
            error: 'EMAIL_RESUME_CONFIRMATION_REQUIRED' as const,
            message: 'Email was paused after a provider complaint or rejection. Reopen these controls and choose Resume email.',
          };
      }
      if (latestEnablingJobAlerts && body.jobAlertsConsentAcknowledged !== true) {
        return { error: 'EMAIL_CONSENT_REQUIRED' as const, message: 'Confirm email delivery before enabling Sona Picks.' };
      }
      if (latestEnablingAgentDigest && body.agentDigestConsentAcknowledged !== true) {
        return { error: 'AGENT_DIGEST_CONSENT_REQUIRED' as const, message: 'Confirm Sona agent digest email before enabling it.' };
      }

      const update: Record<string, unknown> = {
        ...prefs,
        jobAlertsSubscribedAt: prefs.jobAlertsEnabled ? (latest.jobAlertsSubscribedAt || now) : latest.jobAlertsSubscribedAt,
        jobAlertsUnsubscribedAt: !prefs.jobAlertsEnabled && latest.jobAlertsEnabled === true ? now : latest.jobAlertsUnsubscribedAt,
        jobAlertsConsentAt: latestEnablingJobAlerts ? now : latest.jobAlertsConsentAt,
        jobAlertsConsentVersion: latestEnablingJobAlerts ? JOB_ALERT_EMAIL_CONSENT_VERSION : latest.jobAlertsConsentVersion,
        jobAlertsConsentSource: latestEnablingJobAlerts
          ? String(body.jobAlertsConsentSource || 'job_preferences').slice(0, 80)
          : latest.jobAlertsConsentSource,
        agentDigestConsentAt: latestEnablingAgentDigest ? now : latest.agentDigestConsentAt,
        agentDigestConsentVersion: latestEnablingAgentDigest ? JOB_ALERT_EMAIL_CONSENT_VERSION : latest.agentDigestConsentVersion,
        agentDigestConsentSource: latestEnablingAgentDigest
          ? String(body.agentDigestConsentSource || 'job_preferences').slice(0, 80)
          : latest.agentDigestConsentSource,
      };
      if (latestEnablingJobAlerts) Object.assign(update, {
        jobAlertsDeliveryStatus: 'ready',
        jobAlertsDeliveryError: null,
        emailDeliveryPausedAt: null,
        emailDeliveryPausedReason: null,
        jobAlertsDeliveryPausedAt: null,
        jobAlertsDeliveryPausedReason: null,
        agentDigestDeliveryPausedAt: null,
        agentDigestDeliveryPausedReason: null,
      });
      if (latestEnablingAgentDigest) Object.assign(update, {
        agentDigestDeliveryStatus: 'ready',
        agentDigestDeliveryError: null,
        emailDeliveryPausedAt: null,
        emailDeliveryPausedReason: null,
        agentDigestDeliveryPausedAt: null,
        agentDigestDeliveryPausedReason: null,
        jobAlertsDeliveryPausedAt: null,
        jobAlertsDeliveryPausedReason: null,
      });
      transaction.set(docRef, update, { merge: true });
      return { prefs: { ...latest, ...update } };
    });
    if ('error' in saveResult) {
      return NextResponse.json({ success: false, code: saveResult.error, error: saveResult.message }, { status: 409 });
    }
    const savedPrefs = saveResult.prefs as JobPreferences;
    invalidateTwin(guard.user.uid).catch(() => {});

    // Also store user email for notification purposes
    if (guard.user.email) {
      await db.collection('users').doc(guard.user.uid).set(
        { email: guard.user.email, lastPrefsUpdate: savedPrefs.lastUpdated },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, preferences: savedPrefs, delivery: getJobAlertDeliverySnapshot(savedPrefs) });
  } catch (error) {
    console.error('[jobs/preferences] POST error:', error);
    monitor.critical('Tool: jobs/preferences', String(error));
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
