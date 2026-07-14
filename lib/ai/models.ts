/**
 * Vercel AI SDK — Model Registry
 * Semantic model names mapped to provider-specific model IDs.
 */

import { groq, openrouter, google } from './providers';

export const models = {
  /** Primary fast inference — Groq */
  fast: groq('openai/gpt-oss-120b'),

  /** Google Gemini — validation, scoring, editing */
  validator: google('gemini-3-flash-preview'),

  /** Sona agent — via OpenRouter */
  sona: openrouter('qwen/qwen3.6-plus'),

  /** Writing & detection models — via OpenRouter */
  writing: {
    default: openrouter('openai/gpt-oss-120b'),
    verifier: openrouter('deepseek/deepseek-v4-flash'),
    premium: openrouter('deepseek/deepseek-v4-pro'),
    fallback: openrouter('qwen/qwen3.6-plus'),
  },
} as const;

/** Re-export model name constants for backward compat */
export const GROQ_MODEL = 'openai/gpt-oss-120b';
export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const SONA_MODEL = 'qwen/qwen3.6-plus';
