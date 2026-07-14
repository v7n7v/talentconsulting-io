import { groqJSONCompletion, GROQ_MODEL } from './groq-client';
import { WRITING_MODELS, openRouterJSONCompletion } from './openrouter-client';
import type { QualityDecision } from '../writing-quality';

export type WritingTask =
  | 'humanize'
  | 'public_humanize'
  | 'verify'
  | 'deep_detect'
  | 'story_extract'
  | 'story_match'
  | 'story_answer'
  | 'story_quality';
export type WritingEngine = 'groq' | 'openrouter';
export type WritingQualityMode = 'fast' | 'best';

export interface WritingCompletionResult<T> {
  result: T;
  engine: WritingEngine;
  model: string;
  fallbackCount: number;
  latencyMs: number;
  qualityDecision: QualityDecision;
}

const ACCEPTED: QualityDecision = {
  passed: true,
  decision: 'accepted',
  gates: [],
  warnings: [],
};

function modelPlanForTask(
  task: WritingTask,
  userTier?: string,
  qualityMode: WritingQualityMode = 'fast'
): Array<{ engine: WritingEngine; model: string }> {
  if (task === 'verify' || task === 'deep_detect') {
    return [
      { engine: 'openrouter', model: WRITING_MODELS.verifier },
      { engine: 'openrouter', model: WRITING_MODELS.premiumFallback },
      { engine: 'openrouter', model: WRITING_MODELS.qwenFallback },
    ];
  }

  if (task.startsWith('story_')) {
    return [
      { engine: 'openrouter', model: WRITING_MODELS.verifier },
      { engine: 'openrouter', model: WRITING_MODELS.premiumFallback },
      { engine: 'openrouter', model: WRITING_MODELS.qwenFallback },
    ];
  }

  if (task === 'public_humanize') {
    return [
      { engine: 'groq', model: GROQ_MODEL },
      { engine: 'openrouter', model: WRITING_MODELS.premiumFallback },
      { engine: 'openrouter', model: WRITING_MODELS.qwenFallback },
    ];
  }

  if (qualityMode === 'best') {
    return [
      { engine: 'openrouter', model: WRITING_MODELS.verifier },
      { engine: 'openrouter', model: WRITING_MODELS.premiumFallback },
      { engine: 'openrouter', model: WRITING_MODELS.qwenFallback },
    ];
  }

  return [
    { engine: 'groq', model: GROQ_MODEL },
    { engine: 'openrouter', model: WRITING_MODELS.verifier },
    { engine: 'openrouter', model: WRITING_MODELS.premiumFallback },
    { engine: 'openrouter', model: WRITING_MODELS.qwenFallback },
  ];
}

export async function writingJSONCompletion<T = any>(options: {
  task: WritingTask;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  qualityPolicy?: (result: T, meta: { engine: WritingEngine; model: string }) => QualityDecision;
  userTier?: string;
  qualityMode?: WritingQualityMode;
  title?: string;
}): Promise<WritingCompletionResult<T>> {
  const started = Date.now();
  const models = modelPlanForTask(options.task, options.userTier, options.qualityMode);
  let lastError: unknown = null;
  let lastDecision: QualityDecision | null = null;

  for (let index = 0; index < models.length; index++) {
    const candidate = models[index];
    try {
      const result = candidate.engine === 'groq'
        ? await groqJSONCompletion<T>(options.systemPrompt, options.userPrompt, {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          })
        : await openRouterJSONCompletion<T>(options.systemPrompt, options.userPrompt, {
            model: candidate.model,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            title: options.title || 'TalentConsulting.io Writing Engine',
            timeoutMs: candidate.model === WRITING_MODELS.verifier ? 18_000 : 26_000,
          });

      const decision = options.qualityPolicy
        ? options.qualityPolicy(result, candidate)
        : ACCEPTED;
      lastDecision = decision;

      if (decision.passed || index === models.length - 1) {
        return {
          result,
          engine: candidate.engine,
          model: candidate.model,
          fallbackCount: index,
          latencyMs: Date.now() - started,
          qualityDecision: decision,
        };
      }
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(lastDecision ? 'Writing model quality gates failed' : 'All writing models failed');
}
