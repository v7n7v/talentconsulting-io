import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { writingEvidence, selectedWritingEvidence } from '@/lib/source-preserving-writing';

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  if (guard.user.tier === 'free') return NextResponse.json({ error: 'LinkedIn Optimizer is a Standard feature.', upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || ['headline', 'about', 'targetRole'].some(key => body[key] !== undefined && typeof body[key] !== 'string') || (body.headline?.length || 0) > 220 || (body.about?.length || 0) > 2600 || (body.targetRole?.length || 0) > 200 || JSON.stringify(body.resumeData || {}).length > 100000) return NextResponse.json({ error: 'Provide a headline up to 220 characters, About up to 2600, and target role up to 200.' }, { status: 400 });
  const units = writingEvidence(body.resumeData, body);
  if (!units.length || !units.some(unit => unit.length <= 220)) return NextResponse.json({ error: 'Provide a current profile or select a resume with a title and documented experience.' }, { status: 400 });
  try {
    const selection = await groqJSONCompletion<{ headlineIndices: number[]; aboutIndices: number[] }>(
      'Select source evidence for a LinkedIn draft. Return JSON with headlineIndices and aboutIndices, arrays of integer indices from the supplied evidence. Headline: select one source unit no longer than 220 characters. About: select up to 12 relevant source units, total including blank-line separators <=2600 characters. Select only provided evidence. Target role is a preference, never evidence of qualifications. Do not return rewritten facts or new text.',
      JSON.stringify({ targetRole: body.targetRole || '', evidence: units.map((text, index) => ({ index, text })) }),
      { temperature: 0.2, maxTokens: 500 },
    );
    const headline = selectedWritingEvidence(units, selection.headlineIndices, 220);
    const about = selectedWritingEvidence(units, selection.aboutIndices, 2600);
    return NextResponse.json({ success: true,
      headline: { current: body.headline || '', optimized: headline, score: null, tips: ['Edit the selected evidence into your preferred voice before copying.'] },
      about: { current: body.about || '', optimized: about, score: null, tips: ['Confirm each claim is accurate and appropriate for your public profile.'] },
      overallScore: null, keywordsMissing: [], profileStrengths: [], quickWins: ['Review the editable draft, then copy it manually to LinkedIn.'],
      draftingMode: 'source-preserving', sourceResumeId: body.resumeVersionId || null,
      reviewNotice: 'Selected text is preserved from your evidence. This is not an independent fact check or recruiter-outcome prediction.',
    });
  } catch {
    return NextResponse.json({ error: 'The draft could not be assembled from the selected evidence. Your inputs are unchanged; please retry.' }, { status: 502 });
  }
}
