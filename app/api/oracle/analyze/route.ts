/**
 * Oracle Analyze API — Dual-AI Career Intelligence
 * Stage 1 (GPT): Extract resume skills, parse JD, identify matches/gaps, detect red flags
 * Stage 2 (DeepSeek): Cross-validate, refine decision brief, salary confidence & hidden signals
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { openRouterJSONCompletion, WRITING_MODELS } from '@/lib/ai/openrouter-client';
import { validateBody } from '@/lib/validate';
import { OracleAnalyzeSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';
import { buildOracleV2Report, type OracleBreakdown, type OracleDecision, type OraclePacketPlan } from '@/lib/oracle-v2';

interface GPTAnalysis {
  resumeSkills: string[];
  jdRequirements: string[];
  matchedSkills: string[];
  gapSkills: string[];
  fitScoreEstimate: number;
  salaryRange: { min: number; max: number; currency: string };
  redFlags: { flag: string; severity: 'low' | 'medium' | 'high'; explanation: string }[];
  hiddenRequirements: { stated: string; actual: string }[];
  keywordsToAdd: string[];
  roleLevel: string;
  bridgeSkills: { skill: string; impact: number; salaryIncrease: number }[];
  marketTrends: { skill: string; growth: number }[];
}

interface OracleValidation {
  fitScore: number;
  fitVerdict: 'excellent' | 'strong' | 'moderate' | 'weak';
  verdict?: OracleDecision['verdict'];
  confidence?: OracleDecision['confidence'];
  readinessScore?: number;
  riskScore?: number;
  recommendedNextAction?: string;
  applyStrategy?: OracleDecision['applyStrategy'];
  interviewYield?: OracleDecision['interviewYield'];
  salaryRefinement: { min: number; max: number; userPosition: number; withBridgeSkills: number };
  additionalRedFlags: { flag: string; severity: 'low' | 'medium' | 'high'; explanation: string }[];
  additionalHiddenReqs: { stated: string; actual: string }[];
  industryInsights: string[];
  competitiveEdge: string;
  overallAssessment: string;
  coveredRequirements?: string[];
  missingRequirements?: string[];
  proofGaps?: string[];
  resumeFixes?: string[];
  coverLetterThemes?: string[];
  linkedinKeywords?: string[];
  interviewPrepPrompts?: string[];
  hiddenScreenSignals?: OracleBreakdown['hiddenScreenSignals'];
  readinessMoves?: OraclePacketPlan['readinessMoves'];
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    // Pro+ feature
    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Oracle Analysis is a Pro feature. Upgrade to unlock full career intelligence.', upgrade: true },
        { status: 403 }
      );
    }

    const validated = await validateBody(req, OracleAnalyzeSchema);
    if (!validated.success) return validated.error;
    const { resumeText, jdText, targetRole, location } = validated.data;

    // ═══ STAGE 1: GPT — Extract & Analyze ═══
    const gptAnalysis = await groqJSONCompletion<GPTAnalysis>(
      `You are a Senior Career Intelligence Analyst with 20 years of recruiting experience at top tech companies. 
You analyze resumes against job descriptions with surgical precision, identifying exact skill matches, gaps, and market dynamics.

You MUST return a JSON object with this exact structure:
{
  "resumeSkills": ["skill1", "skill2", ...],
  "jdRequirements": ["requirement1", "requirement2", ...],
  "matchedSkills": ["skill that appears in BOTH resume and JD"],
  "gapSkills": ["skill in JD but NOT in resume"],
  "fitScoreEstimate": 0-100,
  "salaryRange": {"min": number, "max": number, "currency": "USD"},
  "redFlags": [{"flag": "short description", "severity": "low|medium|high", "explanation": "why this matters"}],
  "hiddenRequirements": [{"stated": "what JD says", "actual": "what they really mean"}],
  "keywordsToAdd": ["keywords from JD to add to resume"],
  "roleLevel": "Junior|Mid|Senior|Staff|Principal|Lead|Director|VP",
  "bridgeSkills": [{"skill": "name", "impact": 1-10, "salaryIncrease": estimated_dollars}],
  "marketTrends": [{"skill": "name", "growth": percent_growth}]
}

Red flag detection rules:
- 15+ requirements = unicorn hunt (high severity)
- "Fast-paced environment" = potential overwork culture (medium)
- No salary listed = often below market (low)
- "Wear many hats" = understaffed team (medium)
- "Like a family" = boundary issues (medium)
- Vague growth promises = limited advancement (low)
- Too many buzzwords = unclear role (medium)
- "Competitive salary" without range = often below market (low)

Hidden requirement detection:
- "Python" in data context = actually means ML pipeline experience
- "Team player" = cross-functional leadership expected
- "Self-starter" = minimal mentorship/support
- "3+ years React" = they'll accept 2 if you're strong
- "Nice to have" items that appear first = actually required`,

      `RESUME:
${sanitizeForAI(resumeText, 4000)}

${jdText ? `JOB DESCRIPTION:
${sanitizeForAI(jdText, 3000)}` : `TARGET ROLE: ${targetRole || 'Software Engineer'}`}

LOCATION: ${location || 'United States'}

Analyze this resume ${jdText ? 'against this specific job description' : 'for the target role'} and return the full JSON analysis. Be specific and actionable.`,
      { temperature: 0.3, maxTokens: 3000 }
    );

    // ═══ STAGE 2: DeepSeek — Validate & Enrich ═══
    let oracleValidation: OracleValidation | null = null;
    try {
      oracleValidation = await openRouterJSONCompletion<OracleValidation>(
      `You are an elite Career Data Scientist specializing in compensation benchmarking and market analysis.
Your role is the "Role Deal Desk" — you validate another AI's analysis and turn it into a practical job-search decision.

You MUST return JSON with this structure:
{
  "fitScore": 0-100 (your independent assessment),
  "fitVerdict": "excellent|strong|moderate|weak",
  "verdict": "apply|prepare_first|watch|skip",
  "confidence": "high|medium|low",
  "readinessScore": 0-100,
  "riskScore": 0-100,
  "recommendedNextAction": "one concrete next action",
  "applyStrategy": "direct_apply|referral_first|recruiter_outreach|portfolio_proof|skip",
  "interviewYield": {"score": 0-100, "label": "high_yield|selective|uncertain|low_yield", "rationale": "short rationale"},
  "salaryRefinement": {
    "min": refined_min_salary,
    "max": refined_max_salary,
    "userPosition": where_user_falls_in_range_as_percentile_0_to_100,
    "withBridgeSkills": projected_salary_with_bridge_skills
  },
  "additionalRedFlags": [{"flag": "...", "severity": "...", "explanation": "..."}],
  "additionalHiddenReqs": [{"stated": "...", "actual": "..."}],
  "industryInsights": ["actionable insight 1", "insight 2", "insight 3"],
  "competitiveEdge": "What makes this candidate stand out (or not) for this role",
  "overallAssessment": "2-3 sentence executive summary of fit",
  "coveredRequirements": ["requirement covered by resume evidence"],
  "missingRequirements": ["important JD requirement not clearly covered"],
  "proofGaps": ["specific proof the candidate should add before applying"],
  "resumeFixes": ["specific resume edits"],
  "coverLetterThemes": ["themes to use in cover letter"],
  "linkedinKeywords": ["terms for recruiter search"],
  "interviewPrepPrompts": ["interview prep question"],
  "hiddenScreenSignals": [{"signal": "...", "confidence": "high|medium|low", "evidence": "..."}],
  "readinessMoves": [{"action": "resume_edit|portfolio_proof|interview_prep|skill_bridge|networking_angle|prepare_packet", "title": "...", "reason": "...", "effort": "low|medium|high"}]
}

Be critical but fair. Do not reward keyword stuffing. Favor roles where the candidate has proof, not just terms.
Return useful practical advice for a job seeker deciding whether this application is worth the effort.`,

      `GPT's analysis of this candidate:
${JSON.stringify(gptAnalysis, null, 2)}

ORIGINAL RESUME (first 2000 chars):
${sanitizeForAI(resumeText, 2000)}

${jdText ? `ORIGINAL JD (first 1500 chars):
${sanitizeForAI(jdText, 1500)}` : ''}

Cross-validate GPT's analysis. Refine the salary estimates for ${location || 'US market'}. Add red flags, hidden screen signals, proof gaps, and a concrete apply strategy.`,
        {
          model: WRITING_MODELS.premiumFallback,
          temperature: 0.2,
          maxTokens: 2600,
          title: 'TalentConsulting.io Market Oracle',
          timeoutMs: 28_000,
        }
      );
    } catch (validationError) {
      console.warn('[api/oracle/analyze] DeepSeek validation unavailable, using deterministic Oracle V2 fallback:', validationError instanceof Error ? validationError.message : 'unknown');
    }

    // ═══ MERGE — Combine both analyses ═══
    const validationFitScore = oracleValidation?.fitScore ?? gptAnalysis.fitScoreEstimate;
    const finalFitScore = Math.round((gptAnalysis.fitScoreEstimate + validationFitScore) / 2);
    const allRedFlags = [
      ...gptAnalysis.redFlags,
      ...(oracleValidation?.additionalRedFlags || []),
    ].slice(0, 8);
    const allHiddenReqs = [
      ...gptAnalysis.hiddenRequirements,
      ...(oracleValidation?.additionalHiddenReqs || []),
    ].slice(0, 6);
    const legacyAnalysis = {
      fitScore: finalFitScore,
      fitVerdict: oracleValidation?.fitVerdict || (finalFitScore >= 80 ? 'excellent' : finalFitScore >= 65 ? 'strong' : finalFitScore >= 45 ? 'moderate' : 'weak'),
      overallAssessment: oracleValidation?.overallAssessment || `This role scores ${finalFitScore}% based on resume/JD alignment. Review proof gaps before applying.`,
      competitiveEdge: oracleValidation?.competitiveEdge || 'Use the strongest matching accomplishments as the lead story.',
      resumeSkills: gptAnalysis.resumeSkills,
      jdRequirements: gptAnalysis.jdRequirements,
      matchedSkills: gptAnalysis.matchedSkills,
      gapSkills: gptAnalysis.gapSkills,
      keywordsToAdd: gptAnalysis.keywordsToAdd,
      salaryIntel: {
        min: oracleValidation?.salaryRefinement?.min || gptAnalysis.salaryRange.min,
        max: oracleValidation?.salaryRefinement?.max || gptAnalysis.salaryRange.max,
        userPosition: oracleValidation?.salaryRefinement?.userPosition || 50,
        withBridgeSkills: oracleValidation?.salaryRefinement?.withBridgeSkills || gptAnalysis.salaryRange.max,
        currency: gptAnalysis.salaryRange.currency || 'USD',
      },
      redFlags: allRedFlags,
      hiddenRequirements: allHiddenReqs,
      roleLevel: gptAnalysis.roleLevel,
      bridgeSkills: gptAnalysis.bridgeSkills,
      marketTrends: gptAnalysis.marketTrends,
      industryInsights: oracleValidation?.industryInsights || [],
    };
    const oracleV2 = buildOracleV2Report({
      session: {
        resumeText,
        jdText,
        role: targetRole,
        location,
        source: 'manual',
      },
      legacy: legacyAnalysis,
      modelDecision: oracleValidation ? {
        verdict: oracleValidation.verdict,
        confidence: oracleValidation.confidence,
        fitScore: oracleValidation.fitScore,
        readinessScore: oracleValidation.readinessScore,
        riskScore: oracleValidation.riskScore,
        recommendedNextAction: oracleValidation.recommendedNextAction,
        applyStrategy: oracleValidation.applyStrategy,
        interviewYield: oracleValidation.interviewYield,
        summary: oracleValidation.overallAssessment,
        proofGaps: oracleValidation.proofGaps,
        coveredRequirements: oracleValidation.coveredRequirements,
        missingRequirements: oracleValidation.missingRequirements,
        coverLetterThemes: oracleValidation.coverLetterThemes,
        resumeFixes: oracleValidation.resumeFixes,
        interviewPrepPrompts: oracleValidation.interviewPrepPrompts,
        linkedinKeywords: oracleValidation.linkedinKeywords,
        hiddenScreenSignals: oracleValidation.hiddenScreenSignals,
        readinessMoves: oracleValidation.readinessMoves,
      } : undefined,
      marketDataMode: 'analysis_only',
    });

    return NextResponse.json({
      success: true,
      analysis: legacyAnalysis,
      oracleV2,
      pipeline: { stage1: 'Sona fast structuring', stage2: oracleValidation ? 'Sona decision synthesis' : 'Sona deterministic fallback' },
    });
  } catch (error: unknown) {
    console.error('[api/oracle/analyze] Error:', error);
    monitor.critical('Tool: oracle/analyze', String(error));
    return NextResponse.json(
      { error: 'Failed to analyze. Please try again.' },
      { status: 500 }
    );
  }
}
