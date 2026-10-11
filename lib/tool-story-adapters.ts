import type { ToolGuidanceAvailability, ToolGuidanceConfig, ToolGuidanceStep } from './tool-guidance';

/** Small authored adapters observe the tool; they never invoke a workflow action. */
export function storyStep(id: string, title: string, description: string, anchor: string, targetUnavailableReason?: string): ToolGuidanceStep {
  return { id, title, description, anchor, targetUnavailableReason };
}

export interface ToolStoryObservation {
  toolId: string;
  title: string;
  /** Record/source/mode identity only. Keep draft text out of this key. */
  contextKey: string;
  modalSurface?: string;
  purpose: string;
  work: ToolGuidanceStep[];
  result?: ToolGuidanceStep[];
  recovery?: ToolGuidanceStep[];
  pending?: boolean;
  hasResult?: boolean;
  failed?: boolean;
  stale?: boolean;
  blockedReason?: string;
  resultWaitingReason?: string;
  preferredChapterId?: string;
}

export function buildToolStory(observation: ToolStoryObservation): ToolGuidanceConfig {
  const { toolId, title, contextKey, purpose, work, result = [], recovery = [], pending, hasResult, failed, stale, blockedReason } = observation;
  const resultAvailability: ToolGuidanceAvailability = pending ? 'waiting' : stale ? 'stale' : hasResult ? 'available' : failed || blockedReason ? 'blocked' : 'waiting';
  const resultReason = pending
    ? 'The tool is working. Your current inputs and any retained work remain in the tool.'
    : stale
      ? 'The working context has changed. Review the current source before using an earlier result.'
      : hasResult ? undefined : blockedReason || observation.resultWaitingReason || (failed ? 'The last attempt did not return a new result. Review the recovery steps.' : 'Use the tool when you are ready. This chapter opens when real work is available.');
  return {
    toolId, title, version: '1', contextKey, modalSurface: observation.modalSurface,
    preferredChapterId: observation.preferredChapterId || (failed && recovery.length ? 'recovery' : hasResult && !pending ? 'result' : 'work'),
    chapters: [
      { id: 'work', title: 'Purpose and work', description: purpose, steps: work },
      ...(result.length ? [{ id: 'result', title: 'Review and choose', availability: resultAvailability, unavailableReason: resultReason, steps: result }] : []),
      ...(failed && recovery.length ? [{ id: 'recovery', title: 'Recover your work', description: 'Review the existing message and choose the next action yourself.', steps: recovery }] : []),
    ],
  };
}

/** Only the latest operation may define the current conversation result/recovery. */
export function observeLatestConversation(messages: ReadonlyArray<{ role: string; recovery?: unknown }>) {
  const index = messages.length - 1;
  const message = messages[index];
  const isAssistant = message?.role === 'assistant';
  const hasQuestion = messages.slice(0, index).some(item => item.role === 'user');
  return { index, failed: Boolean(isAssistant && message.recovery), hasResult: Boolean(isAssistant && hasQuestion && !message.recovery) };
}

/** A returning editor can contain saved text even without a generated response object. */
export function observeEditableDocument(phase: string, text: string, recordId?: string) {
  return {
    contextKey: JSON.stringify([phase, recordId || 'new-document']),
    hasResult: phase === 'result' && Boolean(text.trim()),
    preferredChapterId: phase === 'result' && text.trim() ? 'result' : 'work',
  };
}

/** The guide describes the current application; advancing it never changes the
 * application, approves a packet, downloads a document, or sends anything. */
export function applicationsJourneyGuidance(input: {
  ownerId: string; viewMode: string; pending: boolean; failed: boolean;
  record: { id: string; status: string; source?: string; queueId?: string } | null;
  review?: { revision: string; status: string } | null;
}): ToolGuidanceConfig {
  const { record, review } = input;
  const prepared = record?.source === 'apply_pipeline';
  const queued = record?.source === 'agent_queue' && Boolean(record.queueId);
  const submitted = Boolean(record && record.status !== 'not_applied');
  const result: ToolGuidanceStep[] = [storyStep('record', 'Check the role and record', 'Check the employer, role and saved status. A prepared draft and a submitted application are separate events.', 'application-detail')];
  if (prepared) result.push(
    storyStep('source', 'Start with your confirmed résumé', 'Use the saved source as your factual reference. Missing evidence stays missing; review any suggested wording against your own experience.', 'application-review-source'),
    storyStep('compare', 'Read both prepared documents', 'Compare the résumé and cover letter with the source and the role. This guide does not approve the drafts.', 'application-review-compare'),
    storyStep('approve', review?.status === 'approved' ? 'Check which revision is approved' : 'Choose whether to approve these drafts', 'Approval applies to the current document revision. Changed documents, source or job context need a fresh review.', 'application-review-approve'),
    storyStep('export', 'Download the approved revision', 'PDF and Word downloads recheck the current approval and source. If they changed, reopen the review instead of using a stale draft.', 'application-review-export'),
  );
  if (queued) result.push(storyStep('queue', 'Review the originating packet', 'This tracker links to its own queue packet. Open that review yourself; approval and tracking have separate records.', 'application-document-review'));
  result.push(storyStep('manual', submitted ? 'Keep the real timeline accurate' : 'Submit yourself, then record it', submitted
    ? 'Record responses, interviews and offers only after they happen. A follow-up draft has not been sent.'
    : 'After reviewing and downloading, submit on the employer’s website yourself. Mark the application submitted only after you complete that step.', 'application-manual-submission'));
  return buildToolStory({
    toolId: 'applications', title: 'Applications',
    contextKey: JSON.stringify([input.ownerId, record?.id || 'tracker', review?.revision || null, review?.status || null, input.viewMode]),
    modalSurface: record ? 'application-detail' : undefined,
    purpose: 'Review your prepared materials, submit yourself, and keep a truthful application history.',
    pending: input.pending, failed: input.failed, hasResult: Boolean(record),
    work: [
      storyStep('capture', 'Track a real application', 'Record an external submission or an unsent tracker. Preparing documents is optional.', 'applications-capture'),
      storyStep('find', 'Find the record you need', 'Search or filter your application history, then open a record yourself.', 'applications-search'),
      storyStep('records', 'Continue from its actual state', 'A draft needs review; an application you already submitted needs an accurate timeline and next action.', 'applications-records'),
    ],
    result,
    recovery: [storyStep('retry', 'Keep your work and inspect the error', 'A failed request does not confirm a saved change. Use the tool’s retry or reload control yourself when ready.', record ? 'application-detail' : 'applications-records')],
  });
}

/** Native DOM ancestry includes portaled guidance controls inside the workflow surface. */
export function trapWorkflowTab(event: KeyboardEvent, surface: HTMLElement) {
  if (event.key !== 'Tab' || event.defaultPrevented || surface.ownerDocument.querySelector('dialog[open]')) return;
  const controls = Array.from(surface.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); return; }
  const active = surface.ownerDocument.activeElement;
  if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
}
