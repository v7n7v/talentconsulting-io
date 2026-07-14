/**
 * Story Search — RAG Answer Engine for Behavioral Questions
 * 
 * Classifies behavioral questions → searches Story Bank → drafts answers
 * using the user's own STAR stories as source material.
 */

import { quickClean } from '@/lib/humanize-guard';
import { CATEGORY_PATTERNS, coverageFromStories, listStoryBankStories } from '@/lib/story-bank';
import { matchStoryQuestion } from '@/lib/story-intelligence';

// ── Behavioral Question Categories ──

export interface QuestionMatch {
  category: string;
  confidence: number;
  story: {
    id: string;
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    tags: string[];
  } | null;
  alternateStories: number;
}

/** Classify a behavioral question into a category */
export function classifyQuestion(question: string): { category: string; confidence: number }[] {
  const results: { category: string; confidence: number }[] = [];
  const lower = question.toLowerCase();

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(lower)) matchCount++;
    }
    if (matchCount > 0) {
      results.push({
        category,
        confidence: Math.min(100, matchCount * 50),
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // If nothing matched, return general
  if (results.length === 0) {
    results.push({ category: 'general', confidence: 30 });
  }

  return results;
}

/** Search story bank for the best matching story */
export async function findBestStory(
  uid: string,
  categories: string[]
): Promise<{ best: QuestionMatch['story']; alternateCount: number }> {
  const { stories } = await listStoryBankStories(uid, { limit: 100 });

  if (stories.length === 0) {
    return { best: null, alternateCount: 0 };
  }

  // Score each story against the categories
  const scored = stories.map(story => {
    const tags = (story.tags || []).map((t: string) => t.toLowerCase());
    let score = 0;

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i].toLowerCase();
      // Direct tag match
      if (tags.some((t: string) => t.includes(cat) || cat.includes(t))) {
        score += 100 - (i * 20); // Weight by category priority
      }
      // Content match
      const fullText = `${story.situation || ''} ${story.task || ''} ${story.action || ''} ${story.result || ''}`.toLowerCase();
      const catPatterns = CATEGORY_PATTERNS[categories[i]] || [];
      for (const pattern of catPatterns) {
        if (pattern.test(fullText)) {
          score += 30 - (i * 5);
        }
      }
    }

    return { story, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const bestRaw = scored[0];
  if (!bestRaw || bestRaw.score === 0) {
    // No match — return most recent story as fallback
    const fallback = stories[0];
    return {
      best: {
        id: fallback.id,
        title: fallback.title || 'Untitled Story',
        situation: fallback.situation || '',
        task: fallback.task || '',
        action: fallback.action || '',
        result: fallback.result || '',
        tags: fallback.tags || [],
      },
      alternateCount: Math.max(0, stories.length - 1),
    };
  }

  return {
    best: {
      id: bestRaw.story.id,
      title: bestRaw.story.title || 'Untitled Story',
      situation: bestRaw.story.situation || '',
      task: bestRaw.story.task || '',
      action: bestRaw.story.action || '',
      result: bestRaw.story.result || '',
      tags: bestRaw.story.tags || [],
    },
    alternateCount: scored.filter(s => s.score > 0).length - 1,
  };
}

/** Draft a behavioral answer from a STAR story */
export function draftAnswer(
  story: QuestionMatch['story'],
  question: string,
  maxWords: number = 200
): string {
  if (!story) {
    return 'No matching story found in your Story Bank. Try adding more STAR stories from your interview debriefs.';
  }

  // Build a natural answer from STAR components
  const parts: string[] = [];

  if (story.situation) {
    parts.push(story.situation.trim());
  }
  if (story.task) {
    parts.push(story.task.trim());
  }
  if (story.action) {
    parts.push(story.action.trim());
  }
  if (story.result) {
    parts.push(story.result.trim());
  }

  let answer = parts.join(' ');

  // Apply humanization cleanup
  answer = quickClean(answer);

  // Trim to approximate word limit
  const words = answer.split(/\s+/);
  if (words.length > maxWords) {
    answer = words.slice(0, maxWords).join(' ') + '...';
  }

  return answer;
}

/** Full pipeline: classify → search → draft */
export async function answerBehavioralQuestion(
  uid: string,
  question: string
): Promise<{
  categories: { category: string; confidence: number }[];
  story: QuestionMatch['story'];
  answer: string;
  alternateStories: number;
  source: string;
}> {
  const result = await matchStoryQuestion(uid, { question });
  return {
    categories: result.categories,
    story: result.story,
    answer: result.answer,
    alternateStories: result.alternateStories,
    source: result.source,
  };
}

/** Get coverage map — which categories have stories, which don't */
export async function getCoverageMap(uid: string): Promise<{
  covered: { category: string; storyCount: number }[];
  uncovered: string[];
  totalStories: number;
  coveragePercent: number;
}> {
  const { stories } = await listStoryBankStories(uid, { limit: 150 });
  return coverageFromStories(stories);
}
