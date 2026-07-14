/**
 * Groq AI Client for GPT-OSS 120B
 * Unified AI interface for all TalentConsulting.io features
 * Uses Groq SDK for better reliability
 */

import Groq from "groq-sdk";

const MODEL = "openai/gpt-oss-120b";

export function isGroqConfigured() {
  const apiKey = String(process.env.GROQ_API_KEY || '').trim();
  return Boolean(apiKey) && apiKey !== 'gsk_your_api_key_here' && !apiKey.includes('your');
}

// Initialize Groq client
const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found in environment variables. Please check your .env.local file.');
  }

  if (!isGroqConfigured()) {
    throw new Error('Please set your actual Groq API key in .env.local file');
  }

  return new Groq({
    apiKey: apiKey,
  });
};

/**
 * Main Groq AI completion function
 */
export async function groqCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  } = {}
): Promise<string> {
  try {
    const groq = getGroqClient();

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 0.95,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.error('Groq API Response:', response);
      throw new Error('No response content from Groq API');
    }

    return content;
  } catch (error: any) {
    console.error('Groq API error details:', {
      message: error.message,
      status: error.status,
      error: error.error
    });

    // Provide helpful error messages
    if (error.status === 403) {
      throw new Error(
        `Groq API error (403): Model access denied. Please check your Groq project settings at https://console.groq.com/settings/project/limits to enable the GPT-OSS 120B model.`
      );
    }

    if (error.status === 401) {
      throw new Error(
        `Groq API error (401): Invalid API key. Please check your NEXT_PUBLIC_GROQ_API_KEY in .env.local file.`
      );
    }

    throw new Error(`Failed to get AI response: ${error.message || 'Unknown error'}`);
  }
}

/**
 * JSON extraction helper
 * Extracts JSON from AI response that might have markdown formatting
 */
export function extractJSON(text: string): any {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // Try to find raw JSON
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('No JSON found in response');
}

/**
 * Structured JSON completion
 * Ensures the response is valid JSON
 */
export async function groqJSONCompletion<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<T> {
  try {
    const groq = getGroqClient();

    const enhancedSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. Do not include any markdown formatting or explanations.`;

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response content from Groq API');
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse JSON response from Groq');
      throw new Error('AI response was not valid JSON');
    }
  } catch (error: any) {
    console.error('Groq JSON API error:', error?.message || error);
    throw error;
  }
}

/**
 * Stream-based completion (for real-time features like Shadow Interviewer)
 */
export async function* groqStreamCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): AsyncGenerator<string, void, unknown> {
  try {
    const groq = getGroqClient();

    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('Groq Stream API error:', error);
    throw new Error(`Failed to stream AI response: ${error.message || 'Unknown error'}`);
  }
}

// Export model name for reference
export const GROQ_MODEL = MODEL;
export { MODEL as GROQ_MODELS };
