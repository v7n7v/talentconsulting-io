import { z } from 'zod';
import { writingJSONCompletion } from '@/lib/ai/writing-model-router';
import type { QualityDecision } from '@/lib/writing-quality';
import { sanitizeForAI, wrapUserContent } from '@/lib/sanitize';
import {
  classifyStoryText,
  computePrivacyRisk,
  computeProofScore,
  createStoryBankStory,
  inferStoryCategory,
  inferStoryCompetencies,
  listStoryBankStories,
  markStoryUsed,
  normalizeStoryData,
  storyToText,
  type StoryBankStory,
  type StorySource,
} from '@/lib/story-bank';

export interface StoryMatchRequest {
  question: string;
  company?: string;
  role?: string;
  jobDescription?: string;
  applicationId?: string;
  maxAnswers?: number;
}

export interface StoryRank {
  id: string;
  title: string;
  fitScore: number;
  category: string;
  reason: string;
  answerAngle: string;
  risks?: string[];
}

export interface StoryAnswerVariant {
  label: 'screening' | 'sixty_second' | 'ninety_second' | 'follow_up';
  title: string;
  answer: string;
}

export interface StoryMatchResult {
  category: string;
  categories: { category: string; confidence: number }[];
  rankedStories: StoryRank[];
  recommendedStoryId: string | null;
  answerVariants: StoryAnswerVariant[];
  gaps: string[];
  qualityWarnings: string[];
  source: string;
  story: StoryBankStory | null;
  answer: string;
  alternateStories: number;
}

export interface StoryDraft {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection?: string;
  tags: string[];
  category?: string;
  competencies?: string[];
  confidence?: number;
  company?: string | null;
  role?: string | null;
}

export interface StoryQualityReport {
  proofScore: number;
  privacyRisk: 'low' | 'medium' | 'high';
  missingMetrics: string[];
  clarityIssues: string[];
  confidentialityWarnings: string[];
  suggestedImprovements: string[];
  strengths: string[];
}

function accepted(gates: QualityDecision['gates'] = [], warnings: string[] = []): QualityDecision {
  return {
    passed: true,
    decision: warnings.length ? 'accepted_with_warnings' : 'accepted',
    gates,
    warnings,
  };
}

function escalate(detail: string): QualityDecision {
  return {
    passed: false,
    decision: 'escalate',
    gates: [{ id: 'story_shape', label: 'Story output shape', status: 'fail', detail }],
    warnings: [detail],
  };
}

function safeSentence(value: unknown, max = 500) {
  return typeof value === 'string' ? sanitizeForAI(value, max).trim() : '';
}

function storySummary(stories: StoryBankStory[]) {
  return stories.map(story => ({
    id: story.id,
    title: story.title,
    category: story.category,
    competencies: story.competencies,
    tags: story.tags,
    proofScore: story.proofScore,
    privacyRisk: story.privacyRisk,
    situation: story.situation.slice(0, 420),
    task: story.task.slice(0, 300),
    action: story.action.slice(0, 520),
    result: story.result.slice(0, 360),
    company: story.company,
    role: story.role,
  }));
}

function fallbackMatch(question: string, stories: StoryBankStory[]): StoryMatchResult {
  const categories = classifyStoryText(question);
  const primaryCategory = categories[0]?.category || 'general';
  const ranked = stories
    .map(story => {
      const text = storyToText(story).toLowerCase();
      const categoryHit = story.category === primaryCategory || story.competencies.includes(primaryCategory);
      const keywordHits = question.toLowerCase().split(/\W+/).filter(word => word.length > 4 && text.includes(word)).length;
      return {
        story,
        score: Math.min(100, (categoryHit ? 60 : 25) + keywordHits * 6 + Math.round(story.proofScore / 8)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.story || null;
  const answer = best
    ? [best.situation, best.task, best.action, best.result].filter(Boolean).join(' ')
    : '';

  return {
    category: primaryCategory,
    categories,
    rankedStories: ranked.slice(0, 4).map(item => ({
      id: item.story.id,
      title: item.story.title,
      fitScore: item.score,
      category: item.story.category,
      reason: item.story.category === primaryCategory ? 'Matches the likely behavioral category.' : 'Closest available story from your bank.',
      answerAngle: item.story.result ? 'Lead with the measurable result, then explain your action.' : 'Use this as a base, but add a clearer outcome first.',
      risks: item.story.result ? [] : ['Result needs stronger proof.'],
    })),
    recommendedStoryId: best?.id || null,
    answerVariants: best ? [
      { label: 'screening', title: 'Screening answer', answer: answer.slice(0, 900) },
      { label: 'sixty_second', title: '60 second answer', answer: answer.slice(0, 1200) },
    ] : [],
    gaps: best ? [] : ['No saved story directly supports this question yet.'],
    qualityWarnings: best?.proofScore && best.proofScore < 55 ? ['The best match needs stronger metrics before interview use.'] : [],
    source: best ? `Story Bank: "${best.title}"` : 'No matching story',
    story: best,
    answer,
    alternateStories: Math.max(0, ranked.length - 1),
  };
}

function normalizeMatchResult(raw: any, stories: StoryBankStory[], question: string): StoryMatchResult {
  const byId = new Map(stories.map(story => [story.id, story]));
  const fallback = fallbackMatch(question, stories);
  const categories = Array.isArray(raw?.categories) && raw.categories.length
    ? raw.categories.map((item: any) => ({
      category: safeSentence(item.category, 80) || fallback.category,
      confidence: Math.max(0, Math.min(100, Number(item.confidence) || 55)),
    })).slice(0, 4)
    : fallback.categories;

  const rankedStories = Array.isArray(raw?.rankedStories)
    ? raw.rankedStories
      .map((item: any) => {
        const story = byId.get(String(item.id || ''));
        if (!story) return null;
        return {
          id: story.id,
          title: story.title,
          fitScore: Math.max(0, Math.min(100, Number(item.fitScore) || story.proofScore)),
          category: safeSentence(item.category, 80) || story.category,
          reason: safeSentence(item.reason, 300) || 'Relevant proof from your saved Story Bank.',
          answerAngle: safeSentence(item.answerAngle, 300) || 'Frame the story around action and measurable result.',
          risks: Array.isArray(item.risks) ? item.risks.map((risk: any) => safeSentence(risk, 160)).filter(Boolean).slice(0, 4) : [],
        };
      })
      .filter(Boolean)
      .slice(0, 6) as StoryRank[]
    : fallback.rankedStories;

  const recommendedStoryId = byId.has(raw?.recommendedStoryId)
    ? raw.recommendedStoryId
    : rankedStories[0]?.id || null;
  const best = recommendedStoryId ? byId.get(recommendedStoryId) || null : null;

  const answerVariants = Array.isArray(raw?.answerVariants)
    ? raw.answerVariants
      .map((item: any) => {
        const label = ['screening', 'sixty_second', 'ninety_second', 'follow_up'].includes(item.label) ? item.label : 'screening';
        const answer = safeSentence(item.answer, 1800);
        if (!answer) return null;
        return {
          label,
          title: safeSentence(item.title, 100) || 'Interview answer',
          answer,
        };
      })
      .filter(Boolean)
      .slice(0, 4) as StoryAnswerVariant[]
    : fallback.answerVariants;

  const answer = answerVariants[0]?.answer || fallback.answer;

  return {
    category: safeSentence(raw?.category, 80) || categories[0]?.category || fallback.category,
    categories,
    rankedStories,
    recommendedStoryId,
    answerVariants,
    gaps: Array.isArray(raw?.gaps) ? raw.gaps.map((gap: any) => safeSentence(gap, 220)).filter(Boolean).slice(0, 6) : fallback.gaps,
    qualityWarnings: Array.isArray(raw?.qualityWarnings) ? raw.qualityWarnings.map((warning: any) => safeSentence(warning, 220)).filter(Boolean).slice(0, 6) : fallback.qualityWarnings,
    source: best ? `Story Bank: "${best.title}"` : 'No matching story',
    story: best,
    answer,
    alternateStories: Math.max(0, rankedStories.length - 1),
  };
}

export async function matchStoryQuestion(uid: string, request: StoryMatchRequest): Promise<StoryMatchResult> {
  const question = safeSentence(request.question, 2000);
  if (!question) throw new Error('Question is required');

  const { stories } = await listStoryBankStories(uid, { limit: 100 });
  if (!stories.length) return fallbackMatch(question, []);

  try {
    const validIds = new Set(stories.map(story => story.id));
    const completion = await writingJSONCompletion<any>({
      task: 'story_match',
      qualityMode: 'best',
      temperature: 0.25,
      maxTokens: 3000,
      title: 'TalentConsulting.io Story Bank',
      systemPrompt: `You are Taco's Story Bank intelligence engine. Match interview or application questions to the user's saved STAR stories.

Rules:
- Use only the provided stories. Do not invent accomplishments, metrics, employers, or dates.
- Return JSON only.
- Prefer stories with concrete action and measurable results.
- If no story is strong, say what proof is missing instead of pretending.
- Never mention model names or vendors.

Return:
{
  "category": "primary category",
  "categories": [{ "category": "leadership", "confidence": 80 }],
  "rankedStories": [{ "id": "story id", "fitScore": 0-100, "category": "category", "reason": "why this fits", "answerAngle": "how to frame it", "risks": ["optional"] }],
  "recommendedStoryId": "story id or null",
  "answerVariants": [{ "label": "screening|sixty_second|ninety_second|follow_up", "title": "short label", "answer": "grounded answer" }],
  "gaps": ["missing proof or story gaps"],
  "qualityWarnings": ["grounding or privacy warnings"]
}`,
      userPrompt: [
        wrapUserContent('question', question),
        wrapUserContent('context', JSON.stringify({
          company: request.company || '',
          role: request.role || '',
          jobDescription: sanitizeForAI(request.jobDescription || '', 2500),
          applicationId: request.applicationId || '',
          maxAnswers: request.maxAnswers || 4,
        })),
        wrapUserContent('stories', JSON.stringify(storySummary(stories))),
      ].join('\n\n'),
      qualityPolicy: (result) => {
        const ranked = Array.isArray(result?.rankedStories) ? result.rankedStories : [];
        const invalidIds = ranked.map((item: any) => String(item.id || '')).filter((id: string) => id && !validIds.has(id));
        if (invalidIds.length) return escalate('Story match referenced a story outside the user bank.');
        if (!ranked.length && stories.length) return escalate('Story match returned no ranked stories.');
        return accepted([{ id: 'grounding', label: 'Grounding', status: 'pass', detail: 'All story ids belong to this user.' }]);
      },
    });

    const normalized = normalizeMatchResult(completion.result, stories, question);
    if (normalized.recommendedStoryId) {
      markStoryUsed(uid, normalized.recommendedStoryId).catch(() => {});
    }
    return normalized;
  } catch {
    return fallbackMatch(question, stories);
  }
}

export async function assessStoryQuality(story: StoryBankStory): Promise<StoryQualityReport> {
  const deterministic: StoryQualityReport = {
    proofScore: computeProofScore(story),
    privacyRisk: computePrivacyRisk(story),
    missingMetrics: /\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:x|hours?|days?|weeks?|months?|users?|customers?|devices?|people)\b/i.test(storyToText(story)) ? [] : ['Add one measurable outcome, such as time saved, risk reduced, users supported, or revenue protected.'],
    clarityIssues: story.action.length < 50 ? ['Action is too thin. Add what you personally did and how you made decisions.'] : [],
    confidentialityWarnings: computePrivacyRisk(story) === 'high' ? ['This story may include confidential details. Generalize names, systems, or client facts before using it externally.'] : [],
    suggestedImprovements: [],
    strengths: [],
  };

  try {
    const completion = await writingJSONCompletion<StoryQualityReport>({
      task: 'story_quality',
      qualityMode: 'best',
      temperature: 0.2,
      maxTokens: 1600,
      title: 'TalentConsulting.io Story Quality',
      systemPrompt: `You grade STAR stories for interview readiness. Return JSON only.
Do not invent facts. Suggest only truthful improvements.
Return { "proofScore": number, "privacyRisk": "low|medium|high", "missingMetrics": [], "clarityIssues": [], "confidentialityWarnings": [], "suggestedImprovements": [], "strengths": [] }`,
      userPrompt: wrapUserContent('story', JSON.stringify(story)),
      qualityPolicy: result => {
        const score = Number(result?.proofScore);
        if (Number.isNaN(score)) return escalate('Quality report did not include a proof score.');
        return accepted();
      },
    });

    const report = z.object({ proofScore: z.number().min(0).max(100), privacyRisk: z.enum(['low', 'medium', 'high']), missingMetrics: z.array(z.string()), clarityIssues: z.array(z.string()), confidentialityWarnings: z.array(z.string()), suggestedImprovements: z.array(z.string()), strengths: z.array(z.string()) }).parse(completion.result);
    return {
      ...deterministic,
      ...report,
      proofScore: Math.max(0, Math.min(100, Number(completion.result.proofScore) || deterministic.proofScore)),
      privacyRisk: ['low', 'medium', 'high'].includes(completion.result.privacyRisk) ? completion.result.privacyRisk : deterministic.privacyRisk,
    };
  } catch {
    return {
      ...deterministic,
      suggestedImprovements: [
        ...deterministic.suggestedImprovements,
        'Use a crisp ending that names the business or team impact.',
      ],
      strengths: story.result ? ['Has a result section ready for interview framing.'] : [],
    };
  }
}

export async function extractStoryDrafts(options: {
  sourceType: 'resume' | 'debrief' | 'conversation' | 'application' | 'manual_text';
  text: string;
  company?: string;
  role?: string;
  applicationId?: string;
  resumeVersionId?: string;
  save?: boolean;
  uid?: string;
}) {
  const sourceText = safeSentence(options.text, 12000);
  if (!sourceText) throw new Error('Text is required');

  const completion = await writingJSONCompletion<{ stories: StoryDraft[] }>({
    task: 'story_extract',
    qualityMode: 'best',
    temperature: 0.25,
    maxTokens: 3000,
    title: 'TalentConsulting.io Story Extraction',
    systemPrompt: `Extract truthful STAR stories from source material. Return JSON only.
Rules:
- Extract 1-5 stories.
- Do not invent achievements.
- If details are missing, leave concise placeholders in task/action/result and include low confidence.
- Prefer stories with action, result, and measurable proof.
Return { "stories": [{ "title": "", "situation": "", "task": "", "action": "", "result": "", "reflection": "", "tags": [], "category": "", "competencies": [], "confidence": 0-100, "company": null, "role": null }] }`,
    userPrompt: [
      wrapUserContent('source_meta', JSON.stringify({
        sourceType: options.sourceType,
        company: options.company || '',
        role: options.role || '',
      })),
      wrapUserContent('source_text', sourceText),
    ].join('\n\n'),
    qualityPolicy: result => {
      if (!Array.isArray(result?.stories)) return escalate('Story extraction did not return a stories array.');
      return accepted();
    },
  });

  const output = z.object({ stories: z.array(z.object({ title: z.string().min(1), situation: z.string().min(1), task: z.string(), action: z.string(), result: z.string(), reflection: z.string().optional(), tags: z.array(z.string()).optional(), category: z.string().optional(), competencies: z.array(z.string()).optional(), confidence: z.number().min(0).max(100).optional(), company: z.string().nullable().optional(), role: z.string().nullable().optional() })).max(5) }).parse(completion.result);
  const drafts = output.stories
    .map(draft => normalizeStoryData({
      ...draft,
      source: options.sourceType as StorySource,
      sourceTool: 'story_extract',
      company: draft.company || options.company || null,
      role: draft.role || options.role || null,
      applicationId: options.applicationId || null,
      resumeVersionId: options.resumeVersionId || null,
      category: draft.category || inferStoryCategory(draft as any),
      competencies: draft.competencies?.length ? draft.competencies : inferStoryCompetencies(draft as any),
      confidence: draft.confidence ?? 0,
    }))
    .filter(story => story.title && story.situation)
    .slice(0, 5);

  if (options.save && options.uid) {
    const saved = [];
    for (const draft of drafts) {
      saved.push(await createStoryBankStory(options.uid, draft));
    }
    return { stories: saved, saved: true };
  }

  return { stories: drafts, saved: false };
}

