export interface WritingReviewPart {
  original: string;
  proposed: string;
  decision: 'pending' | 'keep' | 'reject';
}

/** Preserve separators; ambiguous paragraph restructuring is one reviewable edit. */
export function buildWritingReview(source: string, candidate: string): WritingReviewPart[] {
  const split = (text: string) => text.split(/(\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*)/);
  const before = split(source), after = split(candidate);
  if (before.length !== after.length || before.some((part, i) => i % 2 === 1 && part !== after[i])) {
    return [{ original: source, proposed: candidate, decision: source === candidate ? 'keep' : 'pending' }];
  }
  return before.map((original, index) => ({ original, proposed: after[index], decision: original === after[index] ? 'keep' : 'pending' }));
}

export function materializeWritingReview(parts: WritingReviewPart[]): string {
  return parts.map(part => part.decision === 'reject' ? part.original : part.proposed).join('');
}

export interface WritingRevision { text: string; label: string; createdAt: string }
export function appendWritingRevision(history: WritingRevision[], text: string, label: string): WritingRevision[] {
  if (history.at(-1)?.text === text) return history;
  return [...history, { text, label, createdAt: new Date().toISOString() }].slice(-5);
}

export function paragraphIndicesForSelection(text: string, start: number, end: number): number[] {
  if (start === end) return [];
  const indices: number[] = [];
  let offset = 0, index = 0;
  for (const part of text.split(/(\n\s*\n)/)) {
    if (part.trim()) {
      if (offset < end && offset + part.length > start) indices.push(index);
      index++;
    }
    offset += part.length;
  }
  return indices;
}
