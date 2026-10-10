import type { CanonicalResume } from './resume-normalizer';

export type ResumeIntakeStage = 'idle' | 'uploading' | 'parsing' | 'review' | 'saving' | 'confirmed' | 'cancelled' | 'error';

export function resumeIntakeSummary(resume: CanonicalResume) {
  return {
    name: resume.name,
    title: resume.title,
    experienceCount: resume.experience.length,
    skillCount: resume.skills.reduce((count, group) => count + group.items.length, 0),
    educationCount: resume.education.length,
    hasSourceEvidence: Boolean(resume.name || resume.title || resume.summary || resume.experience.length || resume.skills.length),
  };
}

export function isCurrentResumeIntake(requestId: number, currentRequestId: number, signal?: AbortSignal) {
  return requestId === currentRequestId && signal?.aborted !== true;
}

export function resumeIntakeSaveOptions(
  savedFrom: 'sona_agent_upload' | 'landing_resume_handoff',
  handoffId?: string,
  intakeIdempotencyKey?: string,
) {
  const idempotencyKey = savedFrom === 'landing_resume_handoff'
    ? handoffId || intakeIdempotencyKey
    : intakeIdempotencyKey;
  return idempotencyKey ? { idempotencyKey } : {};
}

export function resumeDraftStorageKey(userId: string | null | undefined) {
  return userId ? `talent-resume-draft:${userId}` : null;
}

export function isCurrentSourceParse(
  requestId: number,
  currentRequestId: number,
  ownerId: string | null,
  liveOwnerId: string | null,
  mounted: boolean,
) {
  return mounted && requestId === currentRequestId && ownerId === liveOwnerId;
}

export function createResumeIntakeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    .padEnd(40, '0').slice(0, 40);
}

export function createResumeIntakeController() {
  let requestId = 0;
  let accountId: string | null = null;
  let phase: 'idle' | 'review' | 'saving' | 'saved' | 'cancelled' = 'idle';
  let saveStarted = false;
  let idempotencyKey = '';

  return {
    begin(nextRequestId: number, nextAccountId: string | null) {
      requestId = nextRequestId;
      accountId = nextAccountId;
      phase = 'idle';
      saveStarted = false;
      idempotencyKey = createResumeIntakeIdempotencyKey();
      return idempotencyKey;
    },
    stage(nextRequestId: number, nextAccountId: string | null) {
      if (!this.isCurrent(nextRequestId, nextAccountId)) return false;
      phase = 'review';
      return true;
    },
    beginSave(nextRequestId: number, nextAccountId: string | null) {
      if (!this.isCurrent(nextRequestId, nextAccountId) || phase !== 'review' || saveStarted) return false;
      saveStarted = true;
      phase = 'saving';
      return true;
    },
    finishSave(nextRequestId: number, nextAccountId: string | null, success: boolean) {
      if (!this.isCurrent(nextRequestId, nextAccountId) || phase !== 'saving') return false;
      phase = success ? 'saved' : 'review';
      saveStarted = false;
      return true;
    },
    cancel(nextRequestId: number, nextAccountId: string | null) {
      if (!this.isCurrent(nextRequestId, nextAccountId)) return false;
      phase = 'cancelled';
      return true;
    },
    invalidate() {
      requestId += 1;
      phase = 'cancelled';
      saveStarted = false;
    },
    isCurrent(nextRequestId: number, nextAccountId: string | null) {
      return nextRequestId === requestId && nextAccountId === accountId && phase !== 'cancelled';
    },
    get phase() { return phase; },
    get idempotencyKey() { return idempotencyKey; },
  };
}
