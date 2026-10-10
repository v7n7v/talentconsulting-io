import { AI_PHRASES, getBannedWordList, type DetectionResult } from './ai-detection';
import type { LengthMode } from './writing-prompts';

export type RewriteIntensity = 'light' | 'balanced' | 'deep';
export type RewriteScope = 'full' | 'flagged_paragraphs';
export type QualityGateStatus = 'pass' | 'warn' | 'fail';

export interface QualityGate {
  id: string;
  label: string;
  status: QualityGateStatus;
  detail: string;
}

export interface QualityDecision {
  passed: boolean;
  decision: 'accepted' | 'accepted_with_warnings' | 'escalate';
  gates: QualityGate[];
  warnings: string[];
}

export interface HumanizePatch {
  original: string;
  rewritten: string;
  paragraphIndex: number;
  reason: string;
  riskReduced?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

export function countPlainWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function extractProtectedTerms(text: string, manualTerms: string[] = []): string[] {
  const terms = new Set<string>();
  const patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /https?:\/\/[^\s)]+/gi,
    /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\$[\d,.]+(?:\s?[kKmMbB])?\b/g,
    /\b\d+(?:\.\d+)?%(?!\w)/g,
    /\b\d+(?:\.\d+)?\s?(?:x|X|k|K|m|M|b|B|hrs?|hours?|days?|weeks?|months?|years?|users?|customers?|devices?|engineers?|people|reports?|pipelines?|seconds?|minutes?)\b/g,
    /\b\d+(?:\.\d+)?(?:\s?(?:ms|µs|ns|GB|MB|TB|GHz|MHz))?\b/g,
    /["“][^"”\r\n]+["”]/g,
    /\b(?:19|20)\d{2}\b/g,
    /\[[^\]]+\]/g,
    /\([A-Z][A-Za-z]+,\s*(?:19|20)\d{2}\)/g,
    /\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){1,4}\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim().replace(/[),.;:]+$/g, '');
      const firstWord = value.split(/\s+/)[0];
      const looksLikeSentenceStart =
        /\s/.test(value) &&
        ['The', 'This', 'That', 'These', 'Those', 'I', 'We', 'Our', 'My', 'Your', 'A', 'An', 'In', 'For', 'As', 'When', 'While'].includes(firstWord) &&
        !/\b(Inc|LLC|Ltd|Corp|Corporation|University|College|School|Labs|Systems|Technologies|Engineering|Engineer|Manager|Director)\b/.test(value);
      if (looksLikeSentenceStart) continue;
      if (value.length >= 2 && value.length <= 80) terms.add(value);
    }
  }

  for (const term of manualTerms) {
    const value = term.trim();
    if (value) terms.add(value);
  }

  return [...terms].slice(0, 120);
}

export function missingProtectedTerms(text: string, protectedTerms: string[]): string[] {
  return protectedTerms.filter(term => {
    const compactTerm = term.trim();
    if (!compactTerm) return false;
    // Match complete terms. `$10` must not be considered preserved by `$100`.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(compactTerm)}(?![\\p{L}\\p{N}])`, 'iu');
    return !pattern.test(text);
  });
}

function factualTokens(text: string): string[] {
  return [
    ...(text.match(/(?:[$€£¥]\s*)?\d[\d,.]*(?:%|\s?(?:ms|mins?|hours?|days?|weeks?|months?|years?))?/gi) || []),
    ...(text.match(/\b(?:not|never|no|without|didn't|can't|cannot|won't|isn't|wasn't)\b/gi) || []),
    ...(text.match(/\b[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3}\b/g) || []),
  ].map(value => value.trim().toLowerCase());
}

function meaningReviewGate(original: string, rewritten: string): QualityGate {
  if (original === rewritten) return {id:'meaning_review',label:'Meaning review',status:'pass',detail:'Source text is unchanged.'};
  const source=factualTokens(original), output=factualTokens(rewritten), remaining=[...output];
  const changed=source.filter(token=>{const index=remaining.indexOf(token);if(index<0)return true;remaining.splice(index,1);return false;});
  // Token retention cannot establish who did what, causality, or equivalent meaning.
  // Every rewrite requires review even when the limited checks find no changes.
  return {id:'meaning_review',label:'Meaning review',status:'warn',detail:
    changed.length || remaining.length
      ? `Review changed factual tokens (removed: ${changed.slice(0,4).join(', ') || 'none'}; added: ${remaining.slice(0,4).join(', ') || 'none'}). Meaning is not verified.`
      : 'Compare this rewrite with your source. Retained tokens do not verify meaning or the roles of named people.'};
}

function lengthGate(original: string, rewritten: string, mode: LengthMode): QualityGate {
  const originalWords = countPlainWords(original);
  const rewrittenWords = countPlainWords(rewritten);
  const ratio = originalWords > 0 ? rewrittenWords / originalWords : 1;

  if (mode === 'condense') {
    const ok = ratio >= 0.75 && ratio <= 0.85;
    return {
      id: 'length',
      label: 'Length target',
      status: ok ? 'pass' : 'warn',
      detail: `${rewrittenWords}/${originalWords} words`,
    };
  }

  if (mode === 'expand') {
    const ok = ratio >= 1.2 && ratio <= 1.35;
    return {
      id: 'length',
      label: 'Length target',
      status: ok ? 'pass' : 'warn',
      detail: `${rewrittenWords}/${originalWords} words`,
    };
  }

  const ok = Math.abs(rewrittenWords - originalWords) <= Math.max(1, originalWords * 0.05);
  return {
    id: 'length',
    label: 'Length target',
    status: ok ? 'pass' : 'warn',
    detail: `${rewrittenWords}/${originalWords} words`,
  };
}

function phraseGate(text: string): QualityGate {
  const unquoted = text.replace(/["“][^"”\r\n]+["”]/g, '');
  const lower = unquoted.toLowerCase();
  const bannedWords = getBannedWordList().split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  const phraseHits = AI_PHRASES.filter(phrase => lower.includes(phrase.toLowerCase()));
  const wordHits = bannedWords.filter(word => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(unquoted));
  const hits = [...phraseHits, ...wordHits].slice(0, 8);

  return {
    id: 'ai_artifacts',
    label: 'Common phrasing',
    status: hits.length === 0 ? 'pass' : 'warn',
    detail: hits.length === 0 ? 'No common phrases flagged by this limited check' : `Review in context: ${hits.join(', ')}. Conventional phrasing may be appropriate.`,
  };
}

function protectedGate(text: string, protectedTerms: string[]): QualityGate {
  const missing = missingProtectedTerms(text, protectedTerms);
  return {
    id: 'protected_terms',
    label: 'Protected terms',
    status: missing.length === 0 ? 'pass' : 'fail',
    detail: missing.length === 0 ? `${protectedTerms.length} preserved` : `Missing: ${missing.slice(0, 8).join(', ')}`,
  };
}

function styleObservationGate(originalDetection: DetectionResult | null, finalDetection: DetectionResult | null): QualityGate {
  const delta = originalDetection && finalDetection ? finalDetection.humanScore - originalDetection.humanScore : null;
  return {
    id: 'trust_score',
    label: 'Style observation',
    status: 'warn',
    detail: delta == null
      ? 'No comparable style reading. This does not verify authorship or writing quality.'
      : `Heuristic style movement: ${delta >= 0 ? '+' : ''}${delta}. This is not a quality target or evidence of authorship.`,
  };
}

function mechanicsGate(text: string): QualityGate {
  const duplicateWords = /\b(\w+)\s+\1\b/i.test(text);
  const empty = text.trim().length === 0;
  const brokenPunctuation = /[,.!?;:]{3,}/.test(text);
  const fail = empty || duplicateWords || brokenPunctuation;
  return {
    id: 'mechanics',
    label: 'Mechanical cleanup',
    status: fail ? 'fail' : 'pass',
    detail: fail ? 'Detected empty, repeated, or malformed text artifact' : 'No obvious mechanical artifacts',
  };
}

export function evaluateHumanizationQuality(options: {
  originalText: string;
  rewrittenText: string;
  protectedTerms: string[];
  lengthMode: LengthMode;
  originalDetection?: DetectionResult | null;
  finalDetection?: DetectionResult | null;
}): QualityDecision {
  const gates = [
    mechanicsGate(options.rewrittenText),
    protectedGate(options.rewrittenText, options.protectedTerms),
    lengthGate(options.originalText, options.rewrittenText, options.lengthMode),
    phraseGate(options.rewrittenText),
    styleObservationGate(options.originalDetection || null, options.finalDetection || null),
    meaningReviewGate(options.originalText, options.rewrittenText),
  ];
  const failures = gates.filter(gate => gate.status === 'fail');
  const warnings = gates.filter(gate => gate.status === 'warn');

  return {
    passed: failures.length === 0,
    decision: failures.length > 0 ? 'escalate' : warnings.length > 0 ? 'accepted_with_warnings' : 'accepted',
    gates,
    warnings: [...failures, ...warnings].map(gate => `${gate.label}: ${gate.detail}`),
  };
}

export function mergeParagraphPatches(originalText: string, patches: HumanizePatch[]): string {
  const chunks = originalText.split(/(\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*)/);
  let paragraphIndex = 0;
  return chunks.map((chunk,index) => {
    if (index % 2 || !chunk.trim()) return chunk;
    const patch=patches.find(value=>value.paragraphIndex===paragraphIndex++);
    return patch ? patch.rewritten : chunk;
  }).join('');
}

export function buildFallbackPatches(originalText: string, rewrittenText: string, paragraphIndices: number[] = []): HumanizePatch[] {
  const originals = splitParagraphs(originalText);
  const rewritten = splitParagraphs(rewrittenText);
  const indices = paragraphIndices.length ? paragraphIndices : originals.map((_, index) => index);

  if (paragraphIndices.length && rewritten.length !== paragraphIndices.length) return [];
  if (!paragraphIndices.length && rewritten.length !== originals.length) return [];
  return indices
    .map(index => ({
      original: originals[index] || '',
      rewritten: rewritten[index] || '',
      paragraphIndex: index,
      reason: paragraphIndices.length ? 'Selected-paragraph rewrite' : 'Full-document rewrite',
    }))
    .filter(patch => patch.original && patch.rewritten);
}
