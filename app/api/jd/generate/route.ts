import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';

const Input = z.object({
  roleTitle: z.string().trim().min(2).max(160), department: z.string().max(80), seniority: z.string().max(60),
  teamContext: z.string().max(4000).optional(), companyInfo: z.string().max(4000).optional(), style: z.enum(['startup','corporate','technical','creative']),
  includeCompensation: z.boolean().optional(), salaryRange: z.string().max(200).optional(),
});
const Output = z.object({ roleTitle: z.string(), missionStatement: z.string(), overview: z.string(), first90Days: z.array(z.object({ day: z.string(), milestone: z.string() })), coreRequirements: z.array(z.string()), niceToHave: z.array(z.string()), culturePulse: z.array(z.object({ trait: z.string(), description: z.string() })), talentDensity: z.string(), growthPath: z.array(z.string()), compensation: z.string().optional(), benefits: z.array(z.string()).optional() });

export async function POST(request: NextRequest) {
  const guard = await guardApiRoute(request, { feature: 'jdGenerations', rateLimit: 5, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  try {
    const parsed = Input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Provide a valid role brief.' }, { status: 400 });
    const data = parsed.data;
    const suppliedComp = data.includeCompensation && data.salaryRange?.trim();
    const system = 'Create a structured job description from the supplied role brief. Use only company, team, compensation, benefits, and growth facts explicitly supplied. If a fact is absent, omit it. Role requirements and 90-day milestones must be explicitly labeled as proposed, requiring employer review. Use empty arrays and empty strings for unavailable required fields. Never assert company facts in the overview unless supplied. Do not invent salary, equity, benefits, company claims, metrics, or promises. Return JSON with roleTitle, missionStatement, overview, first90Days (day/milestone), coreRequirements, niceToHave, culturePulse (trait/description), talentDensity, growthPath, and optional compensation/benefits.';
    const { salaryRange: ignoredSalary, includeCompensation: ignoredOptIn, ...brief } = data;
    const user = JSON.stringify({ ...brief, compensation: suppliedComp || undefined });
    const raw = await groqJSONCompletion(system, user, { temperature: 0.45, maxTokens: 3000 });
    const result = Output.safeParse(raw);
    if (!result.success) return NextResponse.json({ error: 'The JD provider returned an invalid draft.' }, { status: 502 });
    // Compensation is an exact supplied value, never a model-authored promise.
    result.data.compensation = suppliedComp || undefined;
    if (!data.companyInfo?.trim() && !data.teamContext?.trim()) { result.data.benefits = []; result.data.culturePulse = []; result.data.growthPath = []; }
    if (guard.user.tier === 'free' && !guard.user.uid.startsWith('anon:')) await incrementUsage(guard.user.uid, 'jdGenerations');
    return NextResponse.json({ result: result.data });
  } catch { return NextResponse.json({ error: 'Job description generation could not complete.' }, { status: 500 }); }
}
