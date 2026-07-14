/**
 * Secure AI API Route — Backend-for-Frontend (BFF) pattern
 * All Groq API calls go through this server-side route
 * Protects the API key from client-side exposure
 */

import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { guardApiRoute } from '@/lib/api-auth';
import { checkUsageAllowed, incrementUsage, type UsageFeature } from '@/lib/usage-tracker';
import { validateBody } from '@/lib/validate';
import { AICompletionSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';

const MODEL = 'openai/gpt-oss-120b';

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found in server environment variables');
  }
  return new Groq({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, { rateLimit: 10, rateLimitWindow: 60_000, allowAnonymous: false });
    if (guard.error) return guard.error;

    const validated = await validateBody(request, AICompletionSchema);
    if (!validated.success) return validated.error;
    const { action, prompt, systemPrompt, options, usageFeature } = validated.data;

    // Sanitize user-supplied prompt text
    const safePrompt = sanitizeForAI(prompt);
    const safeSystemPrompt = systemPrompt ? sanitizeForAI(systemPrompt) : undefined;

    // Optional lifetime usage cap (e.g., JD generator passes 'jdGenerations')
    if (usageFeature) {
      const usageCheck = await checkUsageAllowed(guard.user.uid, usageFeature as UsageFeature, guard.user.tier);
      if (!usageCheck.allowed) {
        return NextResponse.json(
          {
            error: 'You used your free AI runs. Your work is saved.',
            upgrade: true,
            limitReached: true,
            feature: usageFeature,
            used: usageCheck.used,
            cap: usageCheck.cap,
            upgradeUrl: '/suite/upgrade',
          },
          { status: 403 }
        );
      }
    }

    const groq = getGroqClient();

    if (action === 'json') {
      const enhancedSystem = `${safeSystemPrompt || 'You are a helpful AI assistant. Always respond with valid JSON.'}\n\nIMPORTANT: You must respond with valid JSON only. Do not include any markdown formatting or explanations.`;

      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: enhancedSystem },
          { role: 'user', content: safePrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
      }

      try {
        const parsed = JSON.parse(content);
        if (usageFeature) await incrementUsage(guard.user.uid, usageFeature as UsageFeature);
        return NextResponse.json({ result: parsed });
      } catch {
        return NextResponse.json({ error: 'AI response was not valid JSON', raw: content }, { status: 502 });
      }
    }

    if (action === 'stream') {
      const stream = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: safeSystemPrompt || 'You are a helpful AI assistant.' },
          { role: 'user', content: safePrompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: true,
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Default: text completion
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: safeSystemPrompt || 'You are a helpful AI assistant specializing in talent assessment and career development.' },
        { role: 'user', content: safePrompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 0.95,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    if (usageFeature) await incrementUsage(guard.user.uid, usageFeature as UsageFeature);
    return NextResponse.json({ result: content });
  } catch (error: unknown) {
    console.error('[api/ai] Error:', error);
    monitor.critical('Tool: ai', String(error));
    return NextResponse.json(
      { error: 'AI request failed' },
      { status: 500 }
    );
  }
}
