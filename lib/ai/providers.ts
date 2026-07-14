/**
 * Vercel AI SDK — Provider Registry
 * Single source of truth for all AI provider connections.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const groq = createOpenAICompatible({
  name: 'groq',
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY!,
});

export const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    'HTTP-Referer': 'https://talentconsulting.io',
    'X-Title': 'TalentConsulting.io AI',
  },
});

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});
