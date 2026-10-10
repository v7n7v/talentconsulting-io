import { detectAI, type DetectionResult } from './ai-detection';
import type { HumanizeTone, LengthMode, WritingDomain } from './writing-prompts';

export const WRITING_TRUST_DRAFT_KEY = 'talent-writing-trust-draft';
export const WRITING_TRUST_HANDOFF_KEY = 'talent-writing-trust-handoff:v2';

export type PipelineStep = 'scan' | 'diagnose' | 'humanize' | 'verify' | 'export';

export type RewriteMode =
  | 'safe_polish'
  | 'voice_match'
  | 'recruiter_ready'
  | 'academic_integrity'
  | 'creative_rewrite';

export type ConfidenceBand = 'Enough text for a style reading' | 'Limited style signal' | 'Not enough text';

export interface WritingPipelineSession {
  id?: string;
  inputText: string;
  finalText?: string;
  sourceFileName?: string | null;
  documentName?: string;
  domain: WritingDomain;
  tone: HumanizeTone;
  lengthMode: LengthMode;
  mode: RewriteMode;
  step: PipelineStep;
  createdAt: string;
  updatedAt: string;
}

export interface WritingTrustReport {
  humanScore: number;
  trustLabel: 'Repetitive writing patterns' | 'Mixed Signals' | 'Varied writing patterns';
  confidenceBand: ConfidenceBand;
  verdict: DetectionResult['verdict'];
  breakdown: DetectionResult['breakdown'];
  paragraphScores: DetectionResult['paragraphScores'];
  flags: DetectionResult['flags'];
  readability: {
    wordCount: number;
    sentenceCount: number;
    averageSentenceLength: number;
    paragraphCount: number;
  };
  deepScan?: {
    confidence?: number;
    summary?: string;
    recommendations?: string[];
  } | null;
}

export interface HumanizePatch {
  original: string;
  rewritten: string;
  paragraphIndex?: number;
  reason: string;
  riskReduced?: number;
}

export const REWRITE_MODES: Array<{
  value: RewriteMode;
  label: string;
  description: string;
  icon: string;
  settings: { domain: WritingDomain; tone: HumanizeTone; lengthMode: LengthMode };
}> = [
  {
    value: 'safe_polish',
    label: 'Safe Polish',
    description: 'Low-risk clarity and rhythm improvements.',
    icon: 'auto_fix_high',
    settings: { domain: 'general', tone: 'professional', lengthMode: 'exact' },
  },
  {
    value: 'voice_match',
    label: 'Natural Voice',
    description: 'More natural cadence while preserving meaning.',
    icon: 'record_voice_over',
    settings: { domain: 'general', tone: 'casual', lengthMode: 'exact' },
  },
  {
    value: 'recruiter_ready',
    label: 'Recruiter Ready',
    description: 'Clear career writing without adding experience.',
    icon: 'work',
    settings: { domain: 'resume', tone: 'confident', lengthMode: 'exact' },
  },
  {
    value: 'academic_integrity',
    label: 'Academic Style',
    description: 'Formal revision without hiding authorship cues.',
    icon: 'school',
    settings: { domain: 'academic', tone: 'academic', lengthMode: 'exact' },
  },
  {
    value: 'creative_rewrite',
    label: 'Creative Rewrite',
    description: 'More expressive wording, with the same facts.',
    icon: 'palette',
    settings: { domain: 'creative', tone: 'creative', lengthMode: 'expand' },
  },
];

export function mapModeToSettings(mode: RewriteMode) {
  return REWRITE_MODES.find(option => option.value === mode)?.settings || REWRITE_MODES[0].settings;
}

export function getTrustLabel(score: number): WritingTrustReport['trustLabel'] {
  if (score >= 72) return 'Varied writing patterns';
  if (score >= 45) return 'Mixed Signals';
  return 'Repetitive writing patterns';
}

export function getTrustColor(score: number): string {
  if (score >= 72) return 'var(--text-primary)';
  if (score >= 45) return 'var(--accent)';
  return 'var(--accent)';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function buildReadability(text: string): WritingTrustReport['readability'] {
  const words = countWords(text);
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 4);
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  return {
    wordCount: words,
    sentenceCount: sentences.length,
    averageSentenceLength: sentences.length ? Math.round(words / sentences.length) : 0,
    paragraphCount: paragraphs.length || (text.trim() ? 1 : 0),
  };
}

export function getConfidenceBand(text: string, detection: DetectionResult): ConfidenceBand {
  const words = countWords(text);
  if (words < 50) return 'Not enough text';
  if (detection.humanScore >= 45 && detection.humanScore <= 72) return 'Limited style signal';
  if (detection.flags.filter(flag => flag.type === 'critical' || flag.type === 'high').length >= 6) {
    return 'Limited style signal';
  }
  return 'Enough text for a style reading';
}

export function buildTrustReport(
  text: string,
  detection: DetectionResult = detectAI(text),
  deepScan?: WritingTrustReport['deepScan']
): WritingTrustReport {
  return {
    humanScore: detection.humanScore,
    trustLabel: getTrustLabel(detection.humanScore),
    confidenceBand: getConfidenceBand(text, detection),
    verdict: detection.verdict,
    breakdown: detection.breakdown,
    paragraphScores: detection.paragraphScores,
    flags: detection.flags,
    readability: buildReadability(text),
    deepScan: deepScan || null,
  };
}

export function buildSessionTitle(text: string, sourceFileName?: string | null): string {
  if (sourceFileName) return sourceFileName.replace(/\.[^.]+$/, '');
  const firstLine = text.split('\n').find(line => line.trim().length > 0)?.trim();
  return firstLine ? firstLine.slice(0, 58) : 'Untitled writing session';
}
