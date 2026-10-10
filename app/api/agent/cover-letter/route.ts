import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { buildTruthLockedCoverLetter, normalizeJobPacketLabel } from '@/lib/cover-letter-guardrails';

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  if (guard.user.tier === 'free') return NextResponse.json({ error: 'Cover Letter Studio is a Standard feature.', upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !normalizeJobPacketLabel(body.company) || !normalizeJobPacketLabel(body.jobTitle)) return NextResponse.json({ error: 'Company and job title must be single-line labels of at most 120 characters.' }, { status: 400 });
  const resume = body.resumeData;
  if (!resume || typeof resume !== 'object' || Array.isArray(resume) || JSON.stringify(resume).length > 100000) return NextResponse.json({ error: 'Select a resume with documented experience before drafting.' }, { status: 400 });
  try {
    const draft = buildTruthLockedCoverLetter({
      resume, company: body.company, jobTitle: body.jobTitle,
      sourceResumeId: typeof body.resumeVersionId === 'string' ? body.resumeVersionId : 'reviewed-draft',
      sourceResumeHash: createHash('sha256').update(JSON.stringify(resume)).digest('hex'),
      tone: body.tone, template: body.template,
    });
    if (draft.content.length > 6000) return NextResponse.json({ error: 'Selected evidence is too long for a cover letter. Shorten the source summary or achievements first.' }, { status: 400 });
    return NextResponse.json({ success: true, coverLetter: draft.content,
      subject: `Application: ${draft.report.targetJobTitle} — ${draft.report.targetCompany}`,
      keyHighlights: [], wordCount: draft.content.split(/\s+/).length, toneScore: null,
      sourceReport: draft.report, draftingMode: 'source-preserving',
      reviewNotice: 'Evidence is copied from your selected source, not independently verified. Review and edit before sending.' });
  } catch {
    return NextResponse.json({ error: 'The selected resume needs a summary or documented achievement before drafting.' }, { status: 400 });
  }
}
