import { z } from 'zod';
const text = z.string().min(1).max(20000);
const strings = z.array(text).max(100);
const score = z.number().min(0).max(100);
const styles = z.object({ apa: text, mla: text, chicago: text, harvard: text });
export const paidGalleryTools = new Set(['paraphraser', 'email-composer', 'thesis-generator']);
export const galleryOutputs: Record<string, z.ZodTypeAny> = {
  'grammar-checker': z.object({ correctedText: text, corrections: z.array(z.object({ original: text, corrected: z.string(), rule: text, explanation: text })).max(100), overallScore: score, summary: text }),
  'citation-machine': z.object({ citations: styles, inText: styles }),
  paraphraser: z.object({ variations: z.array(z.object({ style: z.enum(['formal','casual','concise']), text })).length(3) }),
  'tone-analyzer': z.object({ primaryTone: text, secondaryTones: strings, formality: score, sentiment: z.number().min(-100).max(100), readabilityGrade: z.number().min(0).max(100), suggestions: strings }),
  summarizer: z.object({ oneLiner: text, brief: text, detailed: text, bulletPoints: strings, wordCount: z.object({ original: z.number().nonnegative(), brief: z.number().nonnegative(), detailed: z.number().nonnegative() }) }),
  'email-composer': z.object({ subject: text, body: text, variations: z.array(z.object({ tone: text, body: text })).min(1).max(5) }),
  'thesis-generator': z.object({ thesisStatements: z.array(z.object({ type: z.enum(['argumentative','analytical','expository']), statement: text, strength: z.enum(['strong','moderate']) })).length(3), outlineHints: strings }),
};
export function runWordCounter(input: string) {
  const words = input.trim().split(/\s+/u).filter(Boolean).length;
  const sentences = input.split(/[.!?]+/u).filter(part => part.trim()).length;
  const frequencies = new Map<string, number>();
  for (const word of input.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []) if (word.length > 3) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  return { words, characters: input.length, charactersNoSpaces: input.replace(/\s/gu, '').length, sentences,
    paragraphs: input.split(/\n\s*\n/u).filter(part => part.trim()).length, avgWordsPerSentence: sentences ? Math.round(words / sentences) : 0,
    readingTimeMinutes: Math.ceil(words / 250), speakingTimeMinutes: Math.ceil(words / 150),
    topWords: [...frequencies].sort((a,b) => b[1]-a[1]).slice(0,8).map(([word,count]) => ({word,count})) };
}
