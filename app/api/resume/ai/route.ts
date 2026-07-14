import { NextRequest, NextResponse } from 'next/server';
import { groqJSONCompletion, groqCompletion } from '@/lib/ai/groq-client';
import { guardApiRoute } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { ResumeAISchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';

const CLAIM_NUMBER_PATTERN = /(?:[$£€]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|x|k|m|b))?/gi;
const COMMON_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'that', 'this', 'into', 'using', 'their', 'your', 'role', 'work', 'team', 'professional']);

function normalizedClaims(value: string) {
  return value.match(CLAIM_NUMBER_PATTERN)?.map(item => item.toLowerCase().replace(/[\s,]+/g, '')) || [];
}

function evidenceTokens(value: string) {
  return value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)?.filter(token => !COMMON_WORDS.has(token)) || [];
}

function isEvidenceBackedRewrite(source: string, candidate: string) {
  const sourceNumbers = new Set(normalizedClaims(source));
  if (normalizedClaims(candidate).some(claim => !sourceNumbers.has(claim))) return false;
  const sourceTokens = new Set(evidenceTokens(source));
  const candidateTokens = evidenceTokens(candidate);
  if (candidateTokens.length === 0) return false;
  const supported = candidateTokens.filter(token => sourceTokens.has(token)).length;
  return supported >= 2 && supported / candidateTokens.length >= 0.35;
}

function skillExistsInSource(source: string, skill: string) {
  const normalizedSource = ` ${source.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ')} `;
  const normalizedSkill = skill.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
  return normalizedSkill.length > 1 && normalizedSource.includes(` ${normalizedSkill} `);
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000, allowAnonymous: true });
    if (guard.error) return guard.error;

    const validated = await validateBody(req, ResumeAISchema);
    if (!validated.success) return validated.error;
    const { action, text, jobDescription } = validated.data;

    if (action === 'extract_company') {
      const res = await groqJSONCompletion<{ company: string }>(
        'Extract the Company Name from this Job Description. Return { "company": "Name" }',
        sanitizeForAI(jobDescription || text || '', 2000),
        { temperature: 0, maxTokens: 50 }
      );
      return NextResponse.json({ company: res.company || '' });
    }

    if (action === 'generate_summary') {
      const summary = await groqCompletion(
        'Write a concise 2-3 sentence professional summary using only the details provided. Do not invent skills, employers, credentials, achievements, seniority, or metrics. If the evidence is sparse, keep the summary modest and factual. Return only the summary text.',
        text || '',
        { temperature: 0.6, maxTokens: 300 }
      );
      if (!isEvidenceBackedRewrite(text || '', summary)) {
        return NextResponse.json({ error: 'The summary draft introduced claims that were not supported by the resume evidence.' }, { status: 422 });
      }
      return NextResponse.json({ summary });
    }

    if (action === 'generate_achievements') {
      const achievements = await groqJSONCompletion<{ achievements: string[] }>(
        'Rewrite the supplied source evidence into up to 4 concise resume bullets. Use only facts, skills, actions, and numbers already present in the source evidence. Never invent or infer an achievement or metric. If there is no source evidence, return an empty array. Return JSON: { "achievements": ["bullet 1"] }',
        text || '',
        { temperature: 0.6, maxTokens: 500 }
      );
      const supportedAchievements = (achievements.achievements || [])
        .filter(item => isEvidenceBackedRewrite(text || '', item))
        .slice(0, 4);
      if (supportedAchievements.length === 0) {
        return NextResponse.json({ error: 'No rewritten achievement passed the source-evidence check.' }, { status: 422 });
      }
      return NextResponse.json({ achievements: supportedAchievements });
    }

    if (action === 'suggest_skills') {
      const skills = await groqJSONCompletion<{ skills: { category: string; items: string[] }[] }>(
        'Organize only the skills explicitly present in the supplied text into useful resume categories. Do not add related, expected, or inferred skills. If no skills are provided, return an empty skills array. Return JSON: { "skills": [{ "category": "Category", "items": ["Skill1"] }] }',
        text || '',
        { temperature: 0.7, maxTokens: 400 }
      );
      const supportedSkills = (skills.skills || [])
        .map(group => ({
          ...group,
          items: Array.isArray(group.items) ? group.items.filter(item => skillExistsInSource(text || '', item)) : [],
        }))
        .filter(group => group.items.length > 0);
      return NextResponse.json({ skills: supportedSkills });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[api/resume/ai] Error:', error);
    monitor.critical('Tool: resume/ai', String(error));
    return NextResponse.json(
      { error: 'AI request failed' },
      { status: 500 }
    );
  }
}
