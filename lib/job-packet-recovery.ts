export type JobPacketRecoveryAction = 'retry_packet' | 'upload_resume' | 'upgrade' | 'open_applications' | 'none';

export type JobPacketRecoveryCode =
  | 'packet_resume_required'
  | 'packet_upgrade_required'
  | 'packet_limit_reached'
  | 'packet_input_invalid'
  | 'packet_identity_conflict'
  | 'packet_incomplete'
  | 'packet_busy'
  | 'packet_network_interrupted'
  | 'packet_failed';

export interface JobPacketRecovery {
  code: JobPacketRecoveryCode;
  title: string;
  message: string;
  nextAction: string;
  action: JobPacketRecoveryAction;
  retryable: boolean;
  trackerDraftState: 'preserved' | 'not_created' | 'unknown';
  externalApplicationSubmitted: false;
}

const JOB_PACKET_RECOVERY_CODES = new Set<JobPacketRecoveryCode>([
  'packet_resume_required',
  'packet_upgrade_required',
  'packet_limit_reached',
  'packet_input_invalid',
  'packet_identity_conflict',
  'packet_incomplete',
  'packet_busy',
  'packet_network_interrupted',
  'packet_failed',
]);

const JOB_PACKET_RECOVERY_ACTIONS = new Set<JobPacketRecoveryAction>([
  'retry_packet',
  'upload_resume',
  'upgrade',
  'open_applications',
  'none',
]);

const TRACKER_DRAFT_STATES = new Set<JobPacketRecovery['trackerDraftState']>([
  'preserved',
  'not_created',
  'unknown',
]);

function recoveryCombinationIsValid(candidate: Partial<JobPacketRecovery>) {
  switch (candidate.code) {
    case 'packet_resume_required':
      return candidate.action === 'upload_resume' && candidate.retryable === false && candidate.trackerDraftState === 'not_created';
    case 'packet_upgrade_required':
    case 'packet_limit_reached':
      return candidate.action === 'upgrade' && candidate.retryable === false && candidate.trackerDraftState === 'not_created';
    case 'packet_input_invalid':
      return candidate.action === 'none' && candidate.retryable === false && candidate.trackerDraftState === 'not_created';
    case 'packet_identity_conflict':
      return candidate.action === 'none' && candidate.retryable === false && candidate.trackerDraftState === 'preserved';
    case 'packet_incomplete':
      return candidate.action === 'retry_packet' && candidate.retryable === true && candidate.trackerDraftState === 'preserved';
    case 'packet_busy':
      return candidate.action === 'retry_packet' && candidate.retryable === true
        && (candidate.trackerDraftState === 'preserved' || candidate.trackerDraftState === 'unknown');
    case 'packet_network_interrupted':
    case 'packet_failed':
      return candidate.action === 'retry_packet' && candidate.retryable === true && candidate.trackerDraftState === 'unknown';
    default:
      return false;
  }
}

/** Accept only the bounded recovery contract rendered by the client. */
export function readJobPacketRecovery(value: unknown): JobPacketRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<JobPacketRecovery>;
  if (!JOB_PACKET_RECOVERY_CODES.has(candidate.code as JobPacketRecoveryCode)
    || !JOB_PACKET_RECOVERY_ACTIONS.has(candidate.action as JobPacketRecoveryAction)
    || !TRACKER_DRAFT_STATES.has(candidate.trackerDraftState as JobPacketRecovery['trackerDraftState'])
    || typeof candidate.title !== 'string'
    || typeof candidate.message !== 'string'
    || typeof candidate.nextAction !== 'string'
    || !candidate.title.trim()
    || !candidate.message.trim()
    || !candidate.nextAction.trim()
    || typeof candidate.retryable !== 'boolean'
    || candidate.externalApplicationSubmitted !== false
    || !recoveryCombinationIsValid(candidate)) {
    return null;
  }
  return candidate as JobPacketRecovery;
}

function recovery(
  value: Omit<JobPacketRecovery, 'externalApplicationSubmitted'>,
): JobPacketRecovery {
  return { ...value, externalApplicationSubmitted: false };
}

export function packetResumeRequiredRecovery(): JobPacketRecovery {
  return recovery({
    code: 'packet_resume_required',
    title: 'Resume required',
    message: 'Add or select a verified resume before Sona prepares application materials. Nothing was submitted.',
    nextAction: 'Add a resume',
    action: 'upload_resume',
    retryable: false,
    trackerDraftState: 'not_created',
  });
}

export function packetUpgradeRecovery(limitReached = false): JobPacketRecovery {
  return recovery({
    code: limitReached ? 'packet_limit_reached' : 'packet_upgrade_required',
    title: limitReached ? 'Packet limit reached' : 'Pro or Max required',
    message: limitReached
      ? 'Your current packet allowance is used. Existing drafts remain available and nothing was submitted.'
      : 'Application packets are available with Pro or Max. This role remains available for review and nothing was submitted.',
    nextAction: limitReached ? 'Review plan limits' : 'View Pro and Max',
    action: 'upgrade',
    retryable: false,
    trackerDraftState: 'not_created',
  });
}

export function packetInputRecovery(): JobPacketRecovery {
  return recovery({
    code: 'packet_input_invalid',
    title: 'Role details required',
    message: 'Sona needs a role title and company before preparing a packet. Nothing was submitted.',
    nextAction: 'Return to role details',
    action: 'none',
    retryable: false,
    trackerDraftState: 'not_created',
  });
}

export function packetIdentityConflictRecovery(): JobPacketRecovery {
  return recovery({
    code: 'packet_identity_conflict',
    title: 'Role details changed',
    message: 'This request no longer matches the saved tracker draft. Open the role from Job Search again. Nothing was submitted.',
    nextAction: 'Return to Job Search',
    action: 'none',
    retryable: false,
    trackerDraftState: 'preserved',
  });
}

export function packetGenerationInProgressRecovery(): JobPacketRecovery {
  return recovery({
    code: 'packet_busy',
    title: 'Packet already preparing',
    message: 'Another request is preparing this packet. Its tracker draft is preserved and nothing has been submitted.',
    nextAction: 'Retry in a moment',
    action: 'retry_packet',
    retryable: true,
    trackerDraftState: 'preserved',
  });
}

export function packetIncompleteRecovery(options: {
  morphSucceeded: boolean;
  coverLetterSucceeded: boolean;
  atsSucceeded: boolean;
}): JobPacketRecovery {
  const missing = [
    !options.morphSucceeded ? 'verified tailored resume' : '',
    !options.coverLetterSucceeded ? 'cover letter' : '',
    !options.atsSucceeded ? 'ATS check' : '',
  ].filter(Boolean).join(' and ');
  return recovery({
    code: 'packet_incomplete',
    title: 'Packet needs attention',
    message: `The tracker draft is saved, but Sona did not finish the ${missing || 'application materials'}. Nothing was submitted externally.`,
    nextAction: 'Retry packet',
    action: 'retry_packet',
    retryable: true,
    trackerDraftState: 'preserved',
  });
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  return String(error || '').toLowerCase();
}

export function classifyJobPacketFailure(error: unknown): JobPacketRecovery {
  const message = errorText(error);
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return recovery({
      code: 'packet_busy',
      title: 'Packet service is busy',
      message: 'Sona stopped safely before completing this packet. Any tracker draft created remains in Applications, and nothing was submitted.',
      nextAction: 'Retry in a moment',
      action: 'retry_packet',
      retryable: true,
      trackerDraftState: 'unknown',
    });
  }
  if (message.includes('timeout') || message.includes('timed out') || message.includes('abort') || message.includes('network') || message.includes('fetch failed')) {
    return recovery({
      code: 'packet_network_interrupted',
      title: 'Connection interrupted',
      message: 'Packet preparation stopped safely. If a tracker draft was created, it remains in Applications. Nothing was submitted.',
      nextAction: 'Retry packet',
      action: 'retry_packet',
      retryable: true,
      trackerDraftState: 'unknown',
    });
  }
  return recovery({
    code: 'packet_failed',
    title: 'Packet paused safely',
    message: 'Sona could not complete this packet. If a tracker draft was created, it remains in Applications. Nothing was submitted.',
    nextAction: 'Retry packet',
    action: 'retry_packet',
    retryable: true,
    trackerDraftState: 'unknown',
  });
}
