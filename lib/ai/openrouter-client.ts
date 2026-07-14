/**
 * OpenRouter client for low-cost writing generation.
 * Used by high-volume rewrite tools where Gemini is too expensive as default.
 */

export const WRITING_MODELS = {
  defaultRewrite: 'openai/gpt-oss-120b',
  publicRewrite: 'openai/gpt-oss-120b',
  verifier: 'deepseek/deepseek-v4-flash',
  premiumFallback: 'deepseek/deepseek-v4-pro',
  qwenFallback: 'qwen/qwen3.6-plus',
} as const;

export type WritingModelKey = keyof typeof WRITING_MODELS;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function isOpenRouterConfigured() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  return Boolean(apiKey)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo)/i.test(apiKey);
}

function getOpenRouterKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY not found');
  }
  return apiKey;
}

function parseJSON<T>(content: string): T {
  const strategies = [
    () => JSON.parse(content),
    () => {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (!match) throw new Error('no code block');
      return JSON.parse(match[1]);
    },
    () => {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('no object');
      return JSON.parse(content.slice(start, end + 1));
    },
    () => {
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']');
      if (start === -1 || end <= start) throw new Error('no array');
      return JSON.parse(content.slice(start, end + 1));
    },
  ];

  for (const strategy of strategies) {
    try {
      return strategy();
    } catch {
      continue;
    }
  }

  throw new Error('Could not parse JSON from OpenRouter response');
}

export async function openRouterJSONCompletion<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    seed?: number;
    referer?: string;
    title?: string;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const apiKey = getOpenRouterKey();
  const model = options.model || WRITING_MODELS.defaultRewrite;
  const controller = options.timeoutMs ? new AbortController() : undefined;
  const timeout = options.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined;
  const enhancedSystemPrompt = `${systemPrompt}

IMPORTANT: Respond with ONLY a valid JSON object. No markdown, no prose before or after JSON, no code fences.`;

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller?.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': options.referer || 'https://talentconsulting.io',
        'X-Title': options.title || 'TalentConsulting.io Writing Tools',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: enhancedSystemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2048,
        seed: options.seed,
        response_format: { type: 'json_object' },
      }),
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${model} error ${res.status}: ${errText.slice(0, 220)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(`OpenRouter ${model} returned empty content`);
  }

  return parseJSON<T>(content);
}

export async function openRouterJSONWithFallbacks<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    models?: string[];
    temperature?: number;
    maxTokens?: number;
    seed?: number;
    title?: string;
  } = {}
): Promise<{ result: T; model: string; fallbackCount: number }> {
  const models = options.models?.length
    ? options.models
    : [WRITING_MODELS.defaultRewrite, WRITING_MODELS.verifier, WRITING_MODELS.premiumFallback, WRITING_MODELS.qwenFallback];
  let lastError: unknown = null;

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      const result = await openRouterJSONCompletion<T>(systemPrompt, userPrompt, {
        model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        seed: options.seed,
        title: options.title,
      });
      return { result, model, fallbackCount: index };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All OpenRouter models failed');
}
