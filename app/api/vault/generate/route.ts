import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { guardApiRoute } from '@/lib/api-auth';
import { groqCompletion } from '@/lib/ai/groq-client';
import { validateBody } from '@/lib/validate';
import { VaultGenerateSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';
import { buildPrepMemoryExcerpt } from '@/lib/prep-memory';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5 });
    if (guard.error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const validated = await validateBody(req, VaultGenerateSchema);
    if (!validated.success) return validated.error;
    const { type, topic, items, applicationId, resumeVersionId, sourceTool } = validated.data;
    const skill = validated.data.skill || String(items.find((item: any) => item?.skill)?.skill || '').trim() || null;

    let prompt = `You are an expert career coach creating a concise study guide. The user just completed a "${topic}" interview practice session.\n`;
    
    if (type === 'flashcards') {
      prompt += `They marked the following flashcard questions as "Needs Work". Focus EXCLUSIVELY on explaining these specific concepts clearly and succinctly.\n\n`;
      items.forEach((item: any, i: number) => {
        prompt += `Q${i+1}: ${item.question}\nA${i+1}: ${item.answer}\n\n`;
      });
    } else if (type === 'interview') {
      prompt += `Review their interview performance below focusing heavily on areas of weakness or missed points, and provide actionable tips to improve.\n\n`;
      items.forEach((item: any, i: number) => {
        prompt += `Question ${i+1}: ${item.question}\nUser's Answer: ${item.userAnswer}\nAI Feedback: ${item.feedback}\n\n`;
      });
    } else if (type === 'skill-bridge') {
      prompt = `You are a career coach creating a concise Skill Bridge proof note for the user's Memory.

Turn the verification attempt below into a readable Markdown note with:
- skill and challenge type
- score and verdict
- the proof prompt
- a short answer summary
- strengths
- gaps
- next practice steps

Keep it under 450 words. Do not invent certifications, credentials, or external achievements.\n\n`;
      items.forEach((item: any, i: number) => {
        prompt += `Proof ${i + 1}:\n${JSON.stringify(item, null, 2)}\n\n`;
      });
    }

    prompt += `\nOutput a Markdown-formatted Study Guide. Make it highly readable with bullet points and bold text. Keep it concise (max 400 words). Do not include any filler text.`;

    // groqCompletion might take (prompt: string, maxTokens?: number, temperature?: number) or similar. 
    // Wait, the lint error said: Argument of type '{ temperature: number; maxTokens: number; }' is not assignable to parameter of type 'string'.
    // So the second argument might be systemPrompt? Let's fix this in a second after looking at groq-client.
    
    const summary = await groqCompletion('You are a helpful assistant.', prompt);

    // Save to Firestore
    const now = new Date().toISOString();
    const vaultItem = {
      userId: guard.user?.uid || 'anonymous',
      type,
      title: topic,
      topic,
      content: summary,
      summary,
      excerpt: buildPrepMemoryExcerpt(summary, topic),
      skill,
      applicationId: applicationId || null,
      resumeVersionId: resumeVersionId || null,
      sourceTool: sourceTool || type,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getAdminDb().collection('study_vault').add(vaultItem);

    return NextResponse.json({ success: true, id: docRef.id, summary: vaultItem.summary });

  } catch (error: unknown) {
    console.error('[api/vault/generate] Error:', error);
    monitor.critical('Tool: vault/generate', String(error));
    return NextResponse.json({ error: 'Failed to generate study notes' }, { status: 500 });
  }
}
