/**
 * Server-Side AI Detection — LLM-Assisted Predictability Analysis
 * "Binoculars-lite": Uses a low-cost OpenRouter model to test if text is statistically predictable.
 * If the model can accurately complete masked sentences from the text, the text was likely AI-generated.
 */

import { writingJSONCompletion } from './ai/writing-model-router';
import { normalizeText } from './sanitize';
import { splitSentences } from './ai-detection';

export interface DeepDetectionResult {
  predictabilityScore: number; // 0-100 (higher = more predictable = more likely AI)
  humanConfidence: number;     // 0-100 (inverse: higher = more likely human)
  sentenceSamples: SentenceSample[];
  verdict: 'likely_ai' | 'mixed' | 'likely_human';
}

interface SentenceSample {
  original: string;
  masked: string;
  predicted: string;
  overlap: number; // 0-1 overlap ratio
}

/**
 * Deep AI detection via masked sentence completion.
 * Takes 5 random sentences, masks the last 3 words, and asks a model to complete them.
 * High prediction overlap = text was written by a model (it's what a model would say).
 */
export async function deepDetect(text: string): Promise<DeepDetectionResult> {
  const normalized = normalizeText(text);
  const sentences = splitSentences(normalized).filter(s => {
    const words = s.split(/\s+/);
    return words.length >= 8; // need enough words to mask meaningfully
  });

  if (sentences.length < 3) {
    return {
      predictabilityScore: 50,
      humanConfidence: 50,
      sentenceSamples: [],
      verdict: 'mixed',
    };
  }

  // Select up to 5 random sentences
  const shuffled = sentences.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(5, shuffled.length));

  // Build masked versions
  const maskedSentences = selected.map(s => {
    const words = s.split(/\s+/);
    const maskCount = Math.min(3, Math.floor(words.length / 3));
    const visible = words.slice(0, words.length - maskCount).join(' ');
    const hidden = words.slice(words.length - maskCount).join(' ');
    return { original: s, masked: visible + ' ___', hidden };
  });

  // Ask a low-cost model to complete all at once
  const systemPrompt = `You are a sentence completion engine. For each incomplete sentence, predict the most natural ending (1-4 words). Respond with JSON: { "completions": ["completion1", "completion2", ...] }`;

  const userPrompt = `Complete each sentence naturally:\n${maskedSentences.map((m, i) => `${i + 1}. ${m.masked}`).join('\n')}`;

  try {
    const { result } = await writingJSONCompletion<{ completions: string[] }>({
      task: 'deep_detect',
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxTokens: 512,
      title: 'TalentConsulting.io Deep Writing Detection',
    });

    const completions = result.completions || [];

    // Score overlap between predictions and actual text
    const samples: SentenceSample[] = maskedSentences.map((m, i) => {
      const predicted = (completions[i] || '').toLowerCase().trim();
      const actual = m.hidden.toLowerCase().trim();

      // Word-level overlap
      const predWords = new Set(predicted.split(/\s+/).filter(Boolean));
      const actualWords = actual.split(/\s+/).filter(Boolean);
      const matchCount = actualWords.filter(w => predWords.has(w)).length;
      const overlap = actualWords.length > 0 ? matchCount / actualWords.length : 0;

      return {
        original: m.original,
        masked: m.masked,
        predicted: completions[i] || '',
        overlap,
      };
    });

    // Average overlap = predictability
    const avgOverlap = samples.length > 0
      ? samples.reduce((a, s) => a + s.overlap, 0) / samples.length
      : 0.5;

    const predictabilityScore = Math.round(avgOverlap * 100);
    const humanConfidence = 100 - predictabilityScore;

    const verdict: DeepDetectionResult['verdict'] =
      predictabilityScore >= 60 ? 'likely_ai' :
      predictabilityScore >= 35 ? 'mixed' :
      'likely_human';

    return { predictabilityScore, humanConfidence, sentenceSamples: samples, verdict };

  } catch (error) {
    console.error('[deepDetect] OpenRouter error:', error);
    return {
      predictabilityScore: 50,
      humanConfidence: 50,
      sentenceSamples: [],
      verdict: 'mixed',
    };
  }
}
