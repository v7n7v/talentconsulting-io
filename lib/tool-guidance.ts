/** Authored explanations only. These types deliberately contain no action callbacks. */
export type ToolGuidanceAvailability = 'available' | 'waiting' | 'blocked' | 'stale' | 'complete';

export interface ToolGuidanceStep {
  id: string;
  title: string;
  description: string;
  /** Constant semantic data-guide value; never user content or an account identifier. */
  anchor?: string;
  availability?: ToolGuidanceAvailability;
  unavailableReason?: string;
  targetUnavailableReason?: string;
}

export interface ToolGuidanceChapter {
  id: string;
  title: string;
  description?: string;
  availability?: ToolGuidanceAvailability;
  unavailableReason?: string;
  steps: ToolGuidanceStep[];
}

export interface ToolGuidanceConfig {
  toolId: string;
  version?: string;
  title?: string;
  /** Owner/object/source identity, not draft text. A change closes the current guide. */
  contextKey: string;
  preferredChapterId?: string;
  /** Audited workflow dialog data-guide-surface name. Requires an internal explicit Help trigger. */
  modalSurface?: string;
  chapters: ToolGuidanceChapter[];
}

export interface ToolGuidancePosition {
  chapterId: string;
  stepId: string;
}

export function initialGuidancePosition(config: ToolGuidanceConfig): ToolGuidancePosition | null {
  const chapters = config.chapters.filter(chapter => chapter.steps.length > 0);
  const chapter = chapters.find(item => item.id === config.preferredChapterId) || chapters[0];
  return chapter ? { chapterId: chapter.id, stepId: chapter.steps[0].id } : null;
}

export function resolveGuidancePosition(config: ToolGuidanceConfig, position: ToolGuidancePosition | null) {
  const chapter = config.chapters.find(item => item.id === position?.chapterId);
  const step = chapter?.steps.find(item => item.id === position?.stepId);
  if (chapter && step) return { chapter, step, position: { chapterId: chapter.id, stepId: step.id } };
  const fallback = initialGuidancePosition(config);
  if (!fallback) return null;
  const fallbackChapter = config.chapters.find(item => item.id === fallback.chapterId)!;
  return { chapter: fallbackChapter, step: fallbackChapter.steps[0], position: fallback };
}

export function guidanceAvailability(chapter: ToolGuidanceChapter, step: ToolGuidanceStep) {
  const chapterState = chapter.availability || 'available';
  if (chapterState !== 'available' && chapterState !== 'complete') {
    return { state: chapterState, reason: chapter.unavailableReason || step.unavailableReason };
  }
  return { state: step.availability || 'available', reason: step.unavailableReason };
}

/** Moving an explanation never changes the tool's task state. */
export function moveGuidancePosition(config: ToolGuidanceConfig, position: ToolGuidancePosition | null, direction: -1 | 1) {
  const current = resolveGuidancePosition(config, position);
  if (!current) return null;
  const state = guidanceAvailability(current.chapter, current.step).state;
  if (direction === 1 && state !== 'available' && state !== 'complete') return current.position;
  const positions = config.chapters.flatMap(chapter => chapter.steps.map(step => ({ chapterId: chapter.id, stepId: step.id })));
  const index = positions.findIndex(item => item.chapterId === current.position.chapterId && item.stepId === current.position.stepId);
  return positions[Math.min(positions.length - 1, Math.max(0, index + direction))] || current.position;
}

export function guidanceScope(route: string, owner: string | null, config?: ToolGuidanceConfig | null) {
  return JSON.stringify([route, owner, config?.toolId || null, config?.version || '1', config?.contextKey || null, config?.modalSurface || null]);
}

export function guidanceInvitationKey(owner: string | null, config: ToolGuidanceConfig) {
  return JSON.stringify([owner, config.toolId, config.version || '1']);
}

export function guidanceUnavailableText(state: ToolGuidanceAvailability, reason?: string) {
  if (reason) return reason;
  if (state === 'waiting') return 'Use the tool when you are ready. This part of the guide will become available when that work returns.';
  if (state === 'blocked') return 'This part needs a prerequisite. Review the instructions and make that choice in the tool.';
  if (state === 'stale') return 'The working context has changed. Review the current inputs before using an earlier result.';
  return '';
}
