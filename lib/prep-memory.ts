export type PrepMemoryType = 'skill-bridge' | 'interview' | 'flashcards';

export interface PrepMemoryItem {
  id: string;
  type: PrepMemoryType;
  title: string;
  excerpt: string;
  content?: string;
  skill?: string | null;
  applicationId?: string | null;
  resumeVersionId?: string | null;
  sourceTool?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

const TYPE_LABEL: Record<PrepMemoryType, string> = {
  'skill-bridge': 'Skill Bridge',
  interview: 'Interview',
  flashcards: 'Flashcards',
};

export const PREP_MEMORY_TYPES: PrepMemoryType[] = ['skill-bridge', 'interview', 'flashcards'];

export function isPrepMemoryType(value: unknown): value is PrepMemoryType {
  return typeof value === 'string' && PREP_MEMORY_TYPES.includes(value as PrepMemoryType);
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\-[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPrepMemoryExcerpt(content: unknown, fallback = '', max = 220): string {
  const raw = typeof content === 'string' && content.trim() ? content : fallback;
  const clean = stripMarkdown(raw || '');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function inferSkill(data: Record<string, any>, title: string): string | null {
  if (typeof data.skill === 'string' && data.skill.trim()) return data.skill.trim();
  if (Array.isArray(data.items)) {
    const match = data.items.find((item: any) => typeof item?.skill === 'string' && item.skill.trim());
    if (match?.skill) return String(match.skill).trim();
  }
  const syllabus = title.match(/^(.+?)\s+Syllabus$/i);
  if (syllabus?.[1]) return syllabus[1].trim();
  const proof = title.match(/^(.+?)\s+proof$/i);
  if (proof?.[1]) return proof[1].trim();
  return null;
}

export function normalizePrepMemoryItem(
  id: string,
  data: Record<string, any>,
  options: { includeContent?: boolean } = {}
): PrepMemoryItem {
  const type = isPrepMemoryType(data.type) ? data.type : 'skill-bridge';
  const title = String(data.title || data.topic || `${TYPE_LABEL[type]} note`).trim();
  const content = String(data.content || data.summary || '');
  const excerpt = String(data.excerpt || buildPrepMemoryExcerpt(content, title)).trim();
  const createdAt = String(data.createdAt || data.created_at || data.updatedAt || new Date(0).toISOString());

  return {
    id,
    type,
    title,
    excerpt,
    content: options.includeContent ? content : undefined,
    skill: inferSkill(data, title),
    applicationId: data.applicationId || data.application_id || null,
    resumeVersionId: data.resumeVersionId || data.resume_version_id || null,
    sourceTool: data.sourceTool || data.source_tool || type,
    createdAt,
    updatedAt: data.updatedAt || data.updated_at || null,
  };
}

export function prepMemorySearchText(item: PrepMemoryItem): string {
  return [
    item.title,
    item.excerpt,
    item.content,
    item.skill,
    item.sourceTool,
    item.type,
  ].filter(Boolean).join(' ').toLowerCase();
}

