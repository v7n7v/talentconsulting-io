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
