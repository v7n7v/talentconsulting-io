export type SonaRecoveryAction = 'retry' | 'upload_resume' | 'edit_target' | 'open_queue' | 'none';

export interface SonaRecovery {
  code: 'model_busy' | 'network_interrupted' | 'service_unavailable' | 'invalid_target' | 'selected_resume_unavailable' | 'resume_lookup_unavailable' | 'activation_preview_consumed' | 'harness_failed' | 'sona_failed';
  title: string;
  message: string;
  nextAction: string;
  action: SonaRecoveryAction;
  retryable: boolean;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  return String(error || '').toLowerCase();
}

export function classifySonaFailure(error: unknown): SonaRecovery {
  const message = errorText(error);

  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return {
      code: 'model_busy',
      title: 'Sona is busy',
      message: 'Your message and workspace are still here. No resume, queue item, or application was changed.',
      nextAction: 'Retry in a moment',
      action: 'retry',
      retryable: true,
    };
  }

  if (message.includes('timeout') || message.includes('timed out') || message.includes('abort') || message.includes('network') || message.includes('fetch failed')) {
    return {
      code: 'network_interrupted',
      title: 'Connection interrupted',
      message: 'Sona stopped safely before completing the response. Your saved resume and target are unchanged.',
      nextAction: 'Retry this message',
      action: 'retry',
      retryable: true,
    };
  }

  return {
    code: 'sona_failed',
    title: 'Sona paused safely',
    message: 'Sona could not complete this step. Nothing was submitted and your verified workspace data was not changed.',
    nextAction: 'Retry this message',
    action: 'retry',
    retryable: true,
  };
}

export function sonaServiceUnavailableRecovery(): SonaRecovery {
  return {
    code: 'service_unavailable',
    title: 'Sona is temporarily unavailable',
    message: 'The career agent is not configured on this environment. Your workspace is still available.',
    nextAction: 'Try again after service access is restored',
    action: 'none',
    retryable: false,
  };
}

export function invalidTargetRecovery(): SonaRecovery {
  return {
    code: 'invalid_target',
    title: 'Target brief needs attention',
    message: 'Sona needs a valid role, location, work mode, or verified resume before starting the scout.',
    nextAction: 'Update target brief',
    action: 'edit_target',
    retryable: false,
  };
}

export function resumeLookupUnavailableRecovery(): SonaRecovery {
  return {
    code: 'resume_lookup_unavailable',
    title: 'Selected resume is temporarily unavailable',
    message: 'Sona stopped before searching or creating a packet. Your selected resume and target remain unchanged.',
    nextAction: 'Retry this request',
    action: 'retry',
    retryable: true,
  };
}

export function activationPreviewConsumedRecovery(): SonaRecovery {
  return {
    code: 'activation_preview_consumed',
    title: 'Run a fresh scout preview',
    message: 'Sona could not confirm that this scout started. The one-time preview is now closed, so it cannot be retried. No external application was submitted.',
    nextAction: 'Run Preview scout again',
    action: 'edit_target',
    retryable: false,
  };
}

export function selectedResumeUnavailableRecovery(): SonaRecovery {
  return {
    code: 'selected_resume_unavailable',
    title: 'Selected resume is no longer available',
    message: 'Sona did not replace it with another resume. No search, packet, or application was created.',
    nextAction: 'Select or upload a resume',
    action: 'upload_resume',
    retryable: false,
  };
}

export function harnessFailureRecovery(): SonaRecovery {
  return {
    code: 'harness_failed',
    title: 'Scout paused safely',
    message: 'Your resume and target are still saved. Sona stopped before any external action.',
    nextAction: 'Retry scout',
    action: 'retry',
    retryable: true,
  };
}
