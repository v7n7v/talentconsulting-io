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
    /\b\d+(?:\.\d+)?%\b/g,
    /\b\d+(?:\.\d+)?\s?(?:x|X|k|K|m|M|b|B|hrs?|hours?|days?|weeks?|months?|years?|users?|customers?|devices?|engineers?|people|reports?|pipelines?|seconds?|minutes?)\b/g,
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
    const pattern = new RegExp(escapeRegExp(compactTerm), 'i');
    return !pattern.test(text);
  });
}

function lengthGate(original: string, rewritten: string, mode: LengthMode): QualityGate {
  const originalWords = countPlainWords(original);
  const rewrittenWords = countPlainWords(rewritten);
  const ratio = originalWords > 0 ? rewrittenWords / originalWords : 1;

  if (mode === 'condense') {
    const ok = ratio >= 0.65 && ratio <= 0.95;
    return {
      id: 'length',
      label: 'Length target',
      status: ok ? 'pass' : 'warn',
      detail: `${rewrittenWords}/${originalWords} words`,
    };
  }

  if (mode === 'expand') {
    const ok = ratio >= 1.05 && ratio <= 1.55;
    return {
      id: 'length',
      label: 'Length target',
      status: ok ? 'pass' : 'warn',
      detail: `${rewrittenWords}/${originalWords} words`,
    };
  }

  const ok = ratio >= 0.8 && ratio <= 1.2;
  return {
    id: 'length',
    label: 'Length target',
    status: ok ? 'pass' : 'warn',
    detail: `${rewrittenWords}/${originalWords} words`,
  };
}

function phraseGate(text: string): QualityGate {
  const lower = text.toLowerCase();
  const bannedWords = getBannedWordList().split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  const phraseHits = AI_PHRASES.filter(phrase => lower.includes(phrase.toLowerCase()));
  const wordHits = bannedWords.filter(word => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(text));
  const hits = [...phraseHits, ...wordHits].slice(0, 8);

  return {
    id: 'ai_artifacts',
    label: 'AI artifacts',
    status: hits.length === 0 ? 'pass' : hits.length <= 2 ? 'warn' : 'fail',
    detail: hits.length === 0 ? 'No major banned phrase residue' : `Found: ${hits.join(', ')}`,
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

function trustGate(originalDetection: DetectionResult | null, finalDetection: DetectionResult | null): QualityGate {
  if (!finalDetection) {
    return { id: 'trust_score', label: 'Trust movement', status: 'warn', detail: 'No final score available' };
  }
  const original = originalDetection?.humanScore ?? finalDetection.humanScore;
  const delta = finalDetection.humanScore - original;
  const ok = finalDetection.humanScore >= 60 || delta >= 6;
  const status: QualityGateStatus = ok ? 'pass' : finalDetection.humanScore >= 50 ? 'warn' : 'fail';
  return {
    id: 'trust_score',
    label: 'Trust movement',
    status,
    detail: `${original} → ${finalDetection.humanScore} (${delta >= 0 ? '+' : ''}${delta})`,
  };
}

function mechanicsGate(text: string): QualityGate {
  const duplicateWords = /\b(\w+)\s+\1\b/i.test(text);
  const empty = countPlainWords(text) < 10;
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
    trustGate(options.originalDetection || null, options.finalDetection || null),
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
  if (patches.length === 0) return originalText;
  const paragraphs = splitParagraphs(originalText);
  for (const patch of patches) {
    if (patch.paragraphIndex >= 0 && patch.paragraphIndex < paragraphs.length && patch.rewritten.trim()) {
      paragraphs[patch.paragraphIndex] = patch.rewritten.trim();
    }
  }
  return paragraphs.join('\n\n');
}

export function buildFallbackPatches(originalText: string, rewrittenText: string, paragraphIndices: number[] = []): HumanizePatch[] {
  const originals = splitParagraphs(originalText);
  const rewritten = splitParagraphs(rewrittenText);
  const indices = paragraphIndices.length ? paragraphIndices : originals.map((_, index) => index);

  return indices
    .map(index => ({
      original: originals[index] || '',
      rewritten: rewritten[index] || rewrittenText,
      paragraphIndex: index,
      reason: paragraphIndices.length ? 'Targeted trust-signal rewrite' : 'Full-document rewrite',
    }))
    .filter(patch => patch.original && patch.rewritten);
}
