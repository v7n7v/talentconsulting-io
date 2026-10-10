import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { claimPractice, finishPractice, releasePractice, resolvePracticeEvidence, practiceError } from '@/lib/practice-session-server';
import { guardApiRoute } from '@/lib/api-auth';
import { checkUsageAllowed, incrementUsage, type UsageFeature } from '@/lib/usage-tracker';
import { validateBody } from '@/lib/validate';
import { GauntletGenerateSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';
import { getAdminDb } from '@/lib/firebase-admin';
import { getVerifiedResumeForUserById } from '@/lib/server-resume';
import { getStoryBankStory } from '@/lib/story-bank';

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  return new Groq({ apiKey });
}

export async function POST(req: NextRequest) {
    let claim: Awaited<ReturnType<typeof claimPractice>> | undefined;
    try {
        const guard = await guardApiRoute(req, { rateLimit: 7, rateLimitWindow: 60_000, skipUsageCap: true });
        if (guard.error) return guard.error;

        const rawBody = await req.clone().json().catch(() => ({}));
        const validated = await validateBody(req, GauntletGenerateSchema);
        if (!validated.success) return validated.error;
        let { jobDescription, resumeText, interviewStyle, questionCount, interviewType, drillCategory, mode, drillRole } = validated.data;
        const resumeVersionId = typeof rawBody?.resumeVersionId === 'string' ? rawBody.resumeVersionId.slice(0, 120) : '';
        const selectedStoryIds = Array.isArray(rawBody?.selectedStoryIds) ? rawBody.selectedStoryIds.filter((id: unknown) => typeof id === 'string').slice(0, 8) : [];
        const sessionId = typeof rawBody?.sessionId === 'string' ? rawBody.sessionId.slice(0, 120) : '';
        const groq = getGroqClient();
        if (interviewType === 'mock-interview' && !jobDescription) return NextResponse.json({ error: 'Job description required' }, { status: 400 });
        // Resolve evidence before consuming an allowance. Session metadata is authoritative.
        const ownedRef = getAdminDb().collection('users').doc(guard.user.uid).collection('interview_sessions').doc(sessionId || '_missing');
        const owned = await ownedRef.get();
        if (!owned.exists) return NextResponse.json({ error: 'Interview session required' }, { status: 404 });
        jobDescription = owned.data()?.jobDescription || '';
        if (interviewType === 'mock-interview' && !jobDescription) return NextResponse.json({ error: 'Job description required' }, { status: 400 });
        drillRole = owned.data()?.role || '';
        if ((mode === 'flashcards') !== (owned.data()?.mode === 'study_cards')) return NextResponse.json({ error: 'Session mode mismatch' }, { status: 400 });
        const evidence = owned.data()?.evidenceSnapshot || await resolvePracticeEvidence(guard.user.uid, owned.data()!);
        claim = await claimPractice(guard.user.uid, sessionId, guard.user.tier, 'generation');
        if (claim.cached) return NextResponse.json(claim.cached);
        if ((mode === 'flashcards') !== (claim.data.mode === 'study_cards')) throw new Error('SESSION_MODE_MISMATCH');
        const resolvedResumeText = evidence.resume ? JSON.stringify(evidence.resume).slice(0, 12000) : resumeText || '';
        const storyContext = JSON.stringify(evidence.stories).slice(0, 8000);

        // ===== FLASHCARD MODE =====
        if (mode === 'flashcards') {
            const flashcardPrompt = `Generate exactly ${questionCount || 10} study flashcards for interview preparation.

${jobDescription ? `JOB DESCRIPTION:\n${(jobDescription || "").substring(0, 3000)}` : ''}
${resolvedResumeText ? `\nCANDIDATE'S RESUME:\n${resolvedResumeText.substring(0, 2000)}` : ''}
TARGET ROLE: ${drillRole || claim.data.role || 'General interview practice'}

Generate flashcards that help the candidate prepare for this specific role. Each card should:
- Cover a key concept, framework, or skill mentioned in the JD
- Have a clear, concise question on the front
- Have a detailed but focused answer on the back (2-3 sentences max)
- Include the category (technical, behavioral, domain, company-specific)

Focus on:
- Technical concepts they'll be tested on
- Behavioral scenarios they should prepare stories for
- Industry/domain knowledge gaps
- Company-specific knowledge they should research`;

            const flashcardSystem = `Return a JSON object with a "flashcards" array. Each flashcard has:
- "question": Front of card (the question/prompt)
- "answer": Back of card (the ideal answer, 2-3 sentences)
- "category": One of "technical", "behavioral", "domain", "company"
- "difficulty": "basic", "intermediate", "advanced"

Return: { "flashcards": [...] }`;

            const response = await groq.chat.completions.create({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: flashcardSystem },
                    { role: 'user', content: flashcardPrompt },
                ],
                temperature: 0.6,
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('No response from Groq');
            const parsed = z.object({ flashcards: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1), category: z.enum(['technical', 'behavioral', 'domain', 'company']), difficulty: z.enum(['basic', 'intermediate', 'advanced']) })).length(questionCount || 10) }).parse(JSON.parse(content));
            await finishPractice(claim, 'generation', parsed, { rubric: parsed.flashcards, status: 'active', evidenceSnapshot: evidence });
            return NextResponse.json(parsed);
        }

        // ===== INTERVIEW QUESTION MODE =====
        let prompt = '';

        if (interviewType === 'mock-interview') {


            // Persona definitions — each has a distinct questioning style
            const PERSONAS: Record<string, { title: string; systemPrefix: string; style: string }> = {
                'faang-lead': {
                    title: 'FAANG Senior Tech Lead',
                    systemPrefix: `You are a Senior Staff Engineer at a top-tier tech company (Google/Meta/Apple level). You've conducted 500+ interviews and have a 40% pass rate. You are direct, surgical, and waste zero time on fluff. You probe for depth, challenge assumptions, and ask "why?" relentlessly. If a candidate gives a surface-level answer, you drill deeper. You value systems thinking, trade-off analysis, and intellectual honesty.`,
                    style: 'aggressive, probing, technically deep — expects specific numbers, architectures, and trade-offs'
                },
                'friendly-hr': {
                    title: 'Supportive HR Hiring Manager',
                    systemPrefix: `You are a warm, experienced HR manager who believes the best interviews feel like conversations. You create psychological safety so candidates show their best selves. You ask open-ended questions, give encouraging follow-ups, and focus on culture fit and growth mindset. You still assess competency rigorously — you're just kind about it.`,
                    style: 'warm, conversational, supportive — focuses on culture fit and growth potential'
                },
                'startup-cto': {
                    title: 'Startup CTO',
                    systemPrefix: `You are a startup CTO who has bootstrapped 3 companies. You care about speed, scrappiness, and whether someone can "figure it out." You hate over-engineering and love pragmatism. You ask candidates to solve real startup problems: how would you ship this in 2 weeks? What would you cut? How do you prioritize when everything is on fire? You value ownership, resourcefulness, and bias-for-action.`,
                    style: 'fast-paced, practical, startup-minded — values scrappiness and speed over perfection'
                },
                'vp-engineering': {
                    title: 'VP of Engineering',
                    systemPrefix: `You are a VP of Engineering managing 200+ engineers across 15 teams. You interview for strategic thinking, cross-team collaboration, and leadership maturity. You ask about trade-offs at scale, organizational challenges, stakeholder management, and technical strategy. You probe whether someone can think beyond their immediate team and influence without authority.`,
                    style: 'strategic, big-picture, leadership-focused — expects org-level thinking and executive communication'
                },
                'consulting-partner': {
                    title: 'Management Consulting Partner',
                    systemPrefix: `You are a senior partner at a top consulting firm (McKinsey/BCG/Bain level). You use structured, case-based questioning. You test the candidate's ability to structure ambiguous problems, use frameworks, drive to insight, and communicate concisely. You expect MECE thinking, hypothesis-driven analysis, and "so what?" conclusions. You interrupt if someone rambles.`,
                    style: 'structured, framework-heavy, case-based — expects MECE thinking and concise communication'
                },
                'behavioral-specialist': {
                    title: 'Behavioral Interview Specialist',
                    systemPrefix: `You are a behavioral interview specialist trained in industrial-organizational psychology. You exclusively use the STAR method and probe each component deeply. For every answer, you follow up: "What specifically did YOU do?" "What was the measurable result?" "What would you do differently?" You catch vague answers and push for concrete examples with metrics.`,
                    style: 'methodical, STAR-obsessed, detail-oriented — demands specifics and measurable outcomes'
                },
            };

            const personaId = claim.data.persona || (interviewStyle === 'tough' ? 'faang-lead' : 'friendly-hr');
            const persona = PERSONAS[personaId] || PERSONAS['faang-lead'];

            prompt = `${persona.systemPrefix}

You are conducting a real interview for the following role.

Generate exactly ${questionCount} interview questions.

JOB DESCRIPTION:
${(jobDescription || "").substring(0, 3000)}

${resolvedResumeText ? `CANDIDATE'S CONFIRMED RESUME:\n${resolvedResumeText.substring(0, 5000)}\n\nGenerate questions that PROBE the gaps between the resume and JD. Attack their weak spots while exploring their strengths.` : 'Generate questions that test the key requirements in this JD.'}
${storyContext ? `\nUSER-APPROVED STORY EVIDENCE:\n${storyContext}` : ''}

REQUIREMENTS:
- Mix question types: at least 2 behavioral, 1-2 technical, and 1 situational
- Behavioral questions must require STAR format answers
- Technical questions should be contextual (not trivia)
- Each question must have a "context" explaining WHY you're asking it
- Your questioning style is: ${persona.style}
- Questions should feel like they come from a real ${persona.title}, not a textbook`;
        } else {
            prompt = `Generate exactly ${questionCount} ${drillCategory} interview questions for rapid practice.

${drillRole ? `TARGET ROLE: ${drillRole}\nTailor ALL questions specifically for a ${drillRole} position.` : ''}

${resolvedResumeText ? `CANDIDATE'S CONFIRMED RESUME:\n${resolvedResumeText.substring(0, 2000)}\n\nUse their background to personalize questions — reference their experience level, skills, and potential gaps.` : ''}
${storyContext ? `\nUSER-APPROVED STORY EVIDENCE:\n${storyContext}` : ''}

Focus: ${drillCategory === 'behavioral' ? 'STAR-format behavioral questions about leadership, conflict, failure, and achievement' :
                drillCategory === 'technical' ? 'Practical technical questions about architecture, debugging, trade-offs, and system thinking' :
                drillCategory === 'system-design' ? 'System design questions about scaling, reliability, and architectural decisions' :
                drillCategory === 'case' ? 'Business case questions about structured analysis, hypotheses, and recommendations' : drillCategory === 'leadership' ? 'Leadership and management scenario questions about team dynamics, strategy, and decision-making' : 'A balanced mix of behavioral, technical, situational and role-relevant questions'}

${drillRole ? `Every question must be relevant to a ${drillRole} role specifically — not generic.` : ''}
Make the questions progressively harder. Each must include context explaining what competency it tests.`;
        }

        const systemPrompt = `Generate interview questions as a JSON object with a "questions" key containing an array.

Each question must have:
- "text": The full question text (be specific, not generic)
- "type": One of "behavioral", "technical", "system-design", "situational", "leadership"
- "context": Why this question matters (1 sentence)
- "difficulty": "standard", "advanced", or "killer"

Return: { "questions": [...] }`;

        const response = await groq.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${prompt}\nUSER REQUESTED PRACTICE FOCUS: ${String(claim.data.notes || '').slice(0, 1000)}` },
            ],
            temperature: 0.7,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from Groq');
        }

        const parsed = z.object({ questions: z.array(z.object({ text: z.string().min(1), type: z.enum(['behavioral', 'technical', 'system-design', 'situational', 'leadership']), context: z.string().min(1), difficulty: z.enum(['standard', 'advanced', 'killer']) })).length(questionCount || 5) }).parse(JSON.parse(content));
        await finishPractice(claim, 'generation', parsed, { rubric: parsed.questions, status: 'active', evidenceSnapshot: evidence });
        return NextResponse.json(parsed);

    } catch (error: unknown) {
        await releasePractice(claim, 'generation').catch(() => {});
        console.error('[api/gauntlet/generate] Error:', error);
        monitor.critical('Tool: gauntlet/generate', String(error));
        return NextResponse.json(
            { error: 'Could not generate questions. Retry this saved session.', code: practiceError(error).code },
            { status: practiceError(error).status }
        );
    }
}
