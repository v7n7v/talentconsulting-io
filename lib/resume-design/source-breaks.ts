import type { CanonicalResume } from '@/lib/resume-normalizer';
import type { ResumeDesignConfig } from './types';
import { buildResumeDocumentPlan } from './index';

/** Positional references cannot follow a different source record after reorder or replacement. */
export function reconcileResumeEntryBreaks(previous: CanonicalResume, next: CanonicalResume, design: ResumeDesignConfig): { design:ResumeDesignConfig; invalidated:string[] } {
  const allVisible = { ...design, sections:design.sections.map(section => ({ ...section, visible:true })) };
  const oldPlan = buildResumeDocumentPlan(previous, allVisible);
  const newPlan = buildResumeDocumentPlan(next, allVisible);
  const oldEntries = new Map(oldPlan.sections.flatMap(section => section.entries.map(entry => [entry.id, JSON.stringify(entry)] as const)));
  const newEntries = new Map(newPlan.sections.flatMap(section => section.entries.map(entry => [entry.id, JSON.stringify(entry)] as const)));
  const stable = new Set([
    ...previous.experience.filter(entry => entry.id).map(entry => `experience:${entry.id}`),
    ...previous.education.filter(entry => entry.id).map(entry => `education:${entry.id}`),
    ...previous.skills.filter(entry => entry.id).map(entry => `skills:${entry.id}`),
    'summary:0',
  ]);
  const invalidated = design.breakBeforeEntries.filter(id => !newEntries.has(id) || (!stable.has(id) && oldEntries.get(id) !== newEntries.get(id)));
  if (!invalidated.length) return { design,invalidated };
  return { design:{ ...design, breakBeforeEntries:design.breakBeforeEntries.filter(id => !invalidated.includes(id)) },invalidated };
}
