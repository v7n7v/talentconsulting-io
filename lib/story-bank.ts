import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeText } from '@/lib/sanitize';

export const STORY_BANK_COLLECTION = 'agent_stories';

export const BEHAVIORAL_CATEGORIES = [
  'leadership',
  'teamwork',
  'conflict resolution',
  'failure',
  'initiative',
  'communication',
  'problem solving',
  'time management',
  'adaptability',
  'creativity',
  'work ethic',
  'customer focus',
  'technical depth',
  'ownership',
  'stakeholder management',
] as const;

export const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  leadership: [
    /lead|led|leadership|manage|mentor|delegate|team.*lead|supervise|direct/i,
    /took charge|stepped up|guided.*team/i,
  ],
  teamwork: [
    /team|collaborat|group|together|cross-functional|partner|peer/i,
    /worked with|coordinated with/i,
  ],
  'conflict resolution': [
    /conflict|disagree|difficult.*person|tension|clash|dispute|argument/i,
    /dealt with|handle.*disagreement|resolve/i,
  ],
  failure: [
    /fail|mistake|wrong|went badly|didn't work|setback|screw.*up/i,
    /learned from|biggest mistake|something.*wrong/i,
  ],
  initiative: [
    /initiative|self-start|proactive|above.*beyond|without.*asked|volunteer/i,
    /identified.*opportunity|saw.*gap|proposed/i,
  ],
  communication: [
    /communicat|present|explain|convey|persuad|influenc|pitch/i,
    /difficult.*conversation|convince|articulate/i,
  ],
  'problem solving': [
    /problem.*solv|challenge|obstacle|complex.*issue|troubleshoot|debug/i,
    /figure.*out|creative.*solution|overcome/i,
  ],
  'time management': [
    /time.*manage|deadline|priorit|multiple.*task|workload|under.*pressure/i,
    /tight.*timeline|fast.*paced|juggl/i,
  ],
  adaptability: [
    /adapt|change|pivot|ambiguity|uncertain|new.*situation|flexibility/i,
    /adjust|shift|evolv|unexpected/i,
  ],
  creativity: [
    /creative|innovate|new.*approach|outside.*box|novel|unique.*idea/i,
    /reimagine|redesign|invent/i,
  ],
  'work ethic': [
    /work.*ethic|dedication|commitment|go.*extra|above.*beyond/i,
    /long.*hours|perseveran|determination|grit/i,
  ],
  'customer focus': [
    /customer|client|user|stakeholder.*satisf|feedback|serve/i,
    /customer.*experience|user.*need|client.*relation/i,
  ],
  'technical depth': [
    /technical|engineer|architecture|system|debug|pipeline|security|cloud|api|data|model|automation|code/i,
    /built|deployed|implemented|optimized|refactored|integrated/i,
  ],
  ownership: [
    /owned|ownership|accountable|responsible|drove|delivered|end-to-end|from scratch/i,
  ],
  'stakeholder management': [
    /stakeholder|executive|partner|vendor|customer|client|alignment|buy-in|requirement/i,
  ],
};

export type StoryPrivacyRisk = 'low' | 'medium' | 'high';
export type StorySource =
  | 'manual'
  | 'chat'
  | 'conversation'
  | 'resume'
  | 'debrief'
  | 'interview_debrief'
  | 'application'
  | 'fit_analysis'
  | 'legacy'
  | string;

export interface StoryBankStory {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[];
  source: StorySource;
  sourceTool?: string;
  category: string;
  competencies: string[];
  company?: string | null;
  role?: string | null;
  applicationId?: string | null;
  resumeVersionId?: string | null;
  contactId?: string | null;
  confidence: number;
  proofScore: number;
  privacyRisk: StoryPrivacyRisk;
  usageCount: number;
  lastUsedAt?: string | null;
  legacySource?: string | null;
  legacySourcePath?: string | null;
  legacySourceId?: string | null;
  migratedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface StoryListFilters {
  search?: string;
  category?: string;
  source?: string;
  applicationId?: string;
  resumeVersionId?: string;
  contactId?: string;
  limit?: number;
  page?: number;
}

type StoryWriteInput = Partial<Omit<StoryBankStory, 'id' | 'createdAt' | 'updatedAt' | 'proofScore' | 'privacyRisk' | 'confidence'>>;

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value: unknown, max = 6000) {
  return typeof value === 'string' ? normalizeText(value).slice(0, max) : '';
}

function cleanOptional(value: unknown, max = 500) {
  const text = cleanString(value, max);
  return text || null;
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(tag => cleanString(tag, 48))
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

export function storyToText(story: Partial<StoryBankStory>) {
  return [
    story.title,
    story.situation,
    story.task,
    story.action,
    story.result,
    story.reflection,
    ...(story.tags || []),
  ].filter(Boolean).join('\n');
}

export function classifyStoryText(text: string): { category: string; confidence: number }[] {
  const normalized = text.toLowerCase();
  const results = Object.entries(CATEGORY_PATTERNS)
    .map(([category, patterns]) => {
      const matches = patterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
      return matches > 0 ? { category, confidence: Math.min(100, matches * 45) } : null;
    })
    .filter(Boolean) as { category: string; confidence: number }[];

  results.sort((a, b) => b.confidence - a.confidence);
  return results.length ? results : [{ category: 'general', confidence: 30 }];
}

export function inferStoryCategory(story: Partial<StoryBankStory>) {
  const tagged = (story.category || '').trim().toLowerCase();
  if (tagged) return tagged;
  return classifyStoryText(storyToText(story))[0]?.category || 'general';
}

export function inferStoryCompetencies(story: Partial<StoryBankStory>) {
  const tags = cleanTags(story.tags);
  const categoryMatches = classifyStoryText(storyToText(story)).map(match => match.category);
  return [...new Set([...categoryMatches, ...tags.map(tag => tag.toLowerCase())])].slice(0, 10);
}

export function computePrivacyRisk(story: Partial<StoryBankStory>): StoryPrivacyRisk {
  const text = storyToText(story);
  const hasSensitiveWords = /\b(confidential|nda|secret|classified|private|proprietary|patient|medical|ssn|social security|password|token|key)\b/i.test(text);
  const hasClientDetail = /\b(client|customer|vendor)\b/i.test(text) && /\$[\d,.]+|\b\d+(?:\.\d+)?%\b/i.test(text);
  if (hasSensitiveWords) return 'high';
  if (hasClientDetail) return 'medium';
  return 'low';
}

export function computeProofScore(story: Partial<StoryBankStory>): number {
  const text = storyToText(story);
  let score = 18;
  if (story.situation && story.situation.length > 40) score += 12;
  if (story.task && story.task.length > 24) score += 10;
  if (story.action && story.action.length > 50) score += 20;
  if (story.result && story.result.length > 30) score += 18;
  if (/\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:x|hours?|days?|weeks?|months?|users?|customers?|devices?|people)\b/i.test(text)) score += 14;
  if ((story.tags || []).length >= 2) score += 4;
  if (story.company || story.role || story.applicationId) score += 4;
  return Math.max(0, Math.min(100, score));
}

function fingerprint(story: Partial<StoryBankStory>) {
  const key = `${story.title || ''}|${story.situation || ''}|${story.action || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 220);
  return key;
}

export function normalizeStoryData(data: any, id = ''): StoryBankStory {
  const title = cleanString(data?.title, 180) || 'Untitled story';
  const base: Partial<StoryBankStory> = {
    title,
    situation: cleanString(data?.situation),
    task: cleanString(data?.task),
    action: cleanString(data?.action),
    result: cleanString(data?.result),
    reflection: cleanString(data?.reflection),
    tags: cleanTags(data?.tags),
    source: cleanString(data?.source, 80) || 'manual',
    sourceTool: cleanString(data?.sourceTool, 80) || undefined,
    category: cleanString(data?.category, 80),
    competencies: cleanTags(data?.competencies),
    company: cleanOptional(data?.company),
    role: cleanOptional(data?.role),
    applicationId: cleanOptional(data?.applicationId),
    resumeVersionId: cleanOptional(data?.resumeVersionId),
    contactId: cleanOptional(data?.contactId),
    legacySource: cleanOptional(data?.legacySource),
    legacySourcePath: cleanOptional(data?.legacySourcePath),
    legacySourceId: cleanOptional(data?.legacySourceId),
    migratedAt: cleanOptional(data?.migratedAt),
    lastUsedAt: cleanOptional(data?.lastUsedAt),
    createdAt: cleanString(data?.createdAt, 80) || nowIso(),
    updatedAt: cleanString(data?.updatedAt, 80) || undefined,
  };

  const category = base.category || inferStoryCategory(base);
  const competencies = base.competencies?.length ? base.competencies : inferStoryCompetencies({ ...base, category });
  const proofScore = typeof data?.proofScore === 'number' ? data.proofScore : computeProofScore(base);
  const confidence = typeof data?.confidence === 'number' ? data.confidence : Math.max(45, Math.min(95, proofScore));
  const privacyRisk = ['low', 'medium', 'high'].includes(data?.privacyRisk) ? data.privacyRisk : computePrivacyRisk(base);

  return {
    id,
    title,
    situation: base.situation || '',
    task: base.task || '',
    action: base.action || '',
    result: base.result || '',
    reflection: base.reflection || '',
    tags: base.tags || [],
    source: base.source || 'manual',
    sourceTool: base.sourceTool,
    category,
    competencies,
    company: base.company || null,
    role: base.role || null,
    applicationId: base.applicationId || null,
    resumeVersionId: base.resumeVersionId || null,
    contactId: base.contactId || null,
    confidence,
    proofScore,
    privacyRisk,
    usageCount: typeof data?.usageCount === 'number' ? data.usageCount : 0,
    lastUsedAt: base.lastUsedAt || null,
    legacySource: base.legacySource || null,
    legacySourcePath: base.legacySourcePath || null,
    legacySourceId: base.legacySourceId || null,
    migratedAt: base.migratedAt || null,
    createdAt: base.createdAt || nowIso(),
    updatedAt: base.updatedAt,
  };
}

function toFirestoreStory(story: StoryBankStory) {
  const { id, ...data } = story;
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

/**
 * A stable canonical id for a legacy story.
 *
 * `canonicalRef.doc()` mints a fresh auto-id, which makes the migration
 * non-idempotent under concurrency: two handlers that both read before either
 * writes each insert their own copy of the same legacy doc, and because the
 * copies then dedupe against *each other* by legacySourceId, the duplication
 * is permanent. A deterministic id makes the second write land on the first
 * write's document instead of beside it.
 */
function legacyCanonicalId(legacySourcePath: string, legacyDocId: string) {
  const safe = `legacy_${legacySourcePath}_${legacyDocId}`
    .replace(/[/\\]/g, '-')
    .replace(/^__|__$/g, '_')
    .slice(0, 1400);
  return safe;
}

export async function migrateLegacyStories(uid: string) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const canonicalRef = userRef.collection(STORY_BANK_COLLECTION);
  const canonicalSnap = await canonicalRef.limit(400).get();
  const existingLegacy = new Set<string>();
  const existingFingerprints = new Set<string>();

  canonicalSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.legacySourcePath && data.legacySourceId) {
      existingLegacy.add(`${data.legacySourcePath}:${data.legacySourceId}`);
    }
    existingFingerprints.add(fingerprint(normalizeStoryData(data, doc.id)));
  });

  const legacySources = [
    { legacySourcePath: 'stories', ref: userRef.collection('stories') },
    { legacySourcePath: 'agent/stories/items', ref: userRef.collection('agent').doc('stories').collection('items') },
  ];

  let migratedCount = 0;
  const batch = db.batch();

  for (const source of legacySources) {
    const snap = await source.ref.limit(100).get();
    snap.docs.forEach(doc => {
      const key = `${source.legacySourcePath}:${doc.id}`;
      const normalized = normalizeStoryData({
        ...doc.data(),
        source: doc.data().source || 'legacy',
        legacySource: source.legacySourcePath,
        legacySourcePath: source.legacySourcePath,
        legacySourceId: doc.id,
        migratedAt: nowIso(),
      });

      const fp = fingerprint(normalized);
      if (existingLegacy.has(key) || existingFingerprints.has(fp)) return;

      const nextRef = canonicalRef.doc(legacyCanonicalId(source.legacySourcePath, doc.id));
      batch.set(nextRef, toFirestoreStory(normalized));
      existingLegacy.add(key);
      existingFingerprints.add(fp);
      migratedCount++;
    });
  }

  if (migratedCount > 0) await batch.commit();
  return migratedCount;
}

/**
 * Read the canonical bank. No migration, no write, no pagination.
 *
 * `listStoryBankStories` runs `migrateLegacyStories` first, and that is a
 * read-then-write with no transaction and no lock. Anything that only needs to
 * READ the bank must come through here instead: two handlers racing into the
 * migration on one page load is how a user's stories get duplicated.
 */
export async function readStoryBankStories(uid: string): Promise<StoryBankStory[]> {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(uid)
    .collection(STORY_BANK_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(300)
    .get();
  return snap.docs.map(doc => normalizeStoryData(doc.data(), doc.id));
}

export async function listStoryBankStories(uid: string, filters: StoryListFilters = {}) {
  const migratedCount = await migrateLegacyStories(uid);
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 150);
  const page = Math.max(Number(filters.page) || 1, 1);

  let stories = await readStoryBankStories(uid);
  const search = cleanString(filters.search, 200).toLowerCase();
  const category = cleanString(filters.category, 80).toLowerCase();
  const source = cleanString(filters.source, 80).toLowerCase();

  if (search) {
    stories = stories.filter(story => storyToText(story).toLowerCase().includes(search));
  }
  if (category && category !== 'all') {
    stories = stories.filter(story => story.category.toLowerCase() === category || story.competencies.includes(category));
  }
  if (source && source !== 'all') {
    stories = stories.filter(story => story.source.toLowerCase() === source || story.sourceTool?.toLowerCase() === source);
  }
  if (filters.applicationId) stories = stories.filter(story => story.applicationId === filters.applicationId);
  if (filters.resumeVersionId) stories = stories.filter(story => story.resumeVersionId === filters.resumeVersionId);
  if (filters.contactId) stories = stories.filter(story => story.contactId === filters.contactId);

  const total = stories.length;
  const offset = (page - 1) * limit;
  return {
    stories: stories.slice(offset, offset + limit),
    count: total,
    migratedCount,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}

export async function getStoryBankStory(uid: string, storyId: string) {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).collection(STORY_BANK_COLLECTION).doc(storyId).get();
  return doc.exists ? normalizeStoryData(doc.data(), doc.id) : null;
}

export async function createStoryBankStory(uid: string, input: StoryWriteInput) {
  const db = getAdminDb();
  const story = normalizeStoryData({
    ...input,
    source: input.source || 'manual',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  if (!story.title.trim() || !story.situation.trim()) {
    throw new Error('title and situation are required');
  }

  const docRef = await db.collection('users').doc(uid).collection(STORY_BANK_COLLECTION).add(toFirestoreStory(story));
  return { ...story, id: docRef.id };
}

export async function updateStoryBankStory(uid: string, storyId: string, updates: StoryWriteInput) {
  const existing = await getStoryBankStory(uid, storyId);
  if (!existing) throw new Error('Story not found');

  const merged = normalizeStoryData({
    ...existing,
    ...updates,
    updatedAt: nowIso(),
  }, storyId);

  const db = getAdminDb();
  await db.collection('users').doc(uid).collection(STORY_BANK_COLLECTION).doc(storyId).update(toFirestoreStory(merged));
  return merged;
}

export async function deleteStoryBankStory(uid: string, storyId: string) {
  const db = getAdminDb();
  await db.collection('users').doc(uid).collection(STORY_BANK_COLLECTION).doc(storyId).delete();
}

export async function markStoryUsed(uid: string, storyId: string) {
  const db = getAdminDb();
  await db.collection('users').doc(uid).collection(STORY_BANK_COLLECTION).doc(storyId).set({
    lastUsedAt: nowIso(),
    usageCount: FieldValue.increment(1),
    updatedAt: nowIso(),
  }, { merge: true });
}

export function coverageFromStories(stories: StoryBankStory[]) {
  const categoryCounts: Record<string, number> = {};
  BEHAVIORAL_CATEGORIES.forEach(category => { categoryCounts[category] = 0; });

  stories.forEach(story => {
    const categories = new Set([story.category, ...story.competencies].map(item => item?.toLowerCase()).filter(Boolean));
    BEHAVIORAL_CATEGORIES.forEach(category => {
      if (categories.has(category)) categoryCounts[category]++;
    });
  });

  const covered = Object.entries(categoryCounts)
    .filter(([, storyCount]) => storyCount > 0)
    .map(([category, storyCount]) => ({ category, storyCount }))
    .sort((a, b) => b.storyCount - a.storyCount);

  const uncovered = Object.entries(categoryCounts)
    .filter(([, storyCount]) => storyCount === 0)
    .map(([category]) => category);

  return {
    covered,
    uncovered,
    totalStories: stories.length,
    /** The denominator, so a caller can show the fraction instead of only the percent. */
    total: BEHAVIORAL_CATEGORIES.length,
    coveragePercent: Math.round((covered.length / BEHAVIORAL_CATEGORIES.length) * 100),
  };
}
