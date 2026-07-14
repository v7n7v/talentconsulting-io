/**
 * Vercel AI SDK — Bridge Layer
 * Drop-in replacements for groq-client.ts, gemini-client.ts, openrouter-client.ts
 * Routes can migrate one import at a time.
 */

import { generateText, generateObject, streamText } from 'ai';
import { z } from 'zod';
import { models } from './models';
import type { LanguageModel } from 'ai';

// ── Drop-in for groqCompletion() ──
export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: LanguageModel;
  } = {}
): Promise<string> {
  const { text } = await generateText({
    model: options.model ?? models.fast,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  });

  if (!text) throw new Error('Empty response from AI');
  return text;
}

// ── Drop-in for groqJSONCompletion() / geminiJSONCompletion() / openRouterJSONCompletion() ──
export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: LanguageModel;
    schema?: z.ZodType<T>;
  } = {}
): Promise<T> {
  if (options.schema) {
    const { object } = await generateObject({
      model: options.model ?? models.fast,
      system: systemPrompt,
      prompt: userPrompt,
      schema: options.schema,
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 2048,
    });
    return object;
  }

  // Fallback: JSON mode without schema (backward compat)
  const { text } = await generateText({
    model: options.model ?? models.fast,
    system: systemPrompt + '\n\nIMPORTANT: Respond with valid JSON only.',
    prompt: userPrompt,
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens ?? 2048,
  });

  if (!text) throw new Error('Empty response from AI');
  return JSON.parse(text) as T;
}

// ── Drop-in for groqStreamCompletion() — actually works now ──
export function stream(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: LanguageModel;
  } = {}
) {
  return streamText({
    model: options.model ?? models.fast,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  });
}

// ── Gemini validation (drop-in for geminiValidate) ──
export async function validate(
  content: string,
  validationPrompt: string,
  criteria: string[]
): Promise<{
  score: number;
  issues: string[];
  suggestions: string[];
  verdict: 'excellent' | 'good' | 'needs_work' | 'poor';
}> {
  const systemPrompt = `You are a critical AI editor and quality assurance specialist.
Your job is to evaluate content against specific criteria and provide actionable feedback.
Always be honest — if something is weak, say so. If it's strong, confirm it.`;

  const userPrompt = `Evaluate the following content:

---
${content}
---

Validation focus: ${validationPrompt}

Score against these criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;

  const validationSchema = z.object({
    score: z.number().min(0).max(100),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
    verdict: z.enum(['excellent', 'good', 'needs_work', 'poor']),
  });

  return generateJSON(systemPrompt, userPrompt, {
    model: models.validator,
    temperature: 0.2,
    schema: validationSchema,
  });
}

// ── JSON with multi-model fallback (drop-in for openRouterJSONWithFallbacks) ──
export async function generateJSONWithFallbacks<T>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    models?: LanguageModel[];
    temperature?: number;
    maxTokens?: number;
    schema?: z.ZodType<T>;
  } = {}
): Promise<{ result: T; modelIndex: number; fallbackCount: number }> {
  const modelChain = options.models ?? [
    models.writing.default,
    models.writing.verifier,
    models.writing.premium,
    models.writing.fallback,
  ];
  let lastError: unknown = null;

  for (let index = 0; index < modelChain.length; index++) {
    try {
      const result = await generateJSON<T>(systemPrompt, userPrompt, {
        model: modelChain[index],
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        schema: options.schema,
      });
      return { result, modelIndex: index, fallbackCount: index };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All models failed');
}
