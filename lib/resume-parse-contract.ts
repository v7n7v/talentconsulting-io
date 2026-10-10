/** Runtime boundary for model output. This is a draft extracted record, never
 * proof that a credential or employment claim is true. */

export type ResumeEvidence = { field: string; value: string; start?: number; end?: number };
export type ResumeParseWarning = {
  code: 'UNSUPPORTED_CLAIM' | 'MISSING_EVIDENCE' | 'TRUNCATED_SOURCE' | 'INCOMPLETE_OUTPUT' | 'SPARSE_SOURCE';
  message: string;
  field?: string;
};

export type ResumeParseRecord = {
  isResume: boolean;
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
  experience: Array<{ company: string; role: string; duration: string; achievements: string[] }>;
  education: Array<{ degree: string; institution: string; year: string }>;
  skills: Array<{ category: string; items: string[] }>;
  certifications: string[];
  projects: Array<{ name: string; description: string; technologies: string[] }>;
  languages: string[];
  awards: string[];
  volunteering: string[];
  publications: string[];
  links: string[];
  evidence?: ResumeEvidence[];
};

export type ResumeParseReceipt = {
  sourceHash: string;
  parserVersion: string;
  originalCharacterCount: number;
  extractedCharacterCount: number;
  rawText: string;
  warnings: ResumeParseWarning[];
  evidence: ResumeEvidence[];
};

const MAX = { string: 4000, items: 80, groups: 40, evidence: 300 };
const text = (value: unknown, max = MAX.string) => typeof value === 'string' && value.length <= max ? value : null;
const array = (value: unknown) => Array.isArray(value) && value.length <= MAX.items ? value : null;

function requiredString(value: unknown, max = MAX.string): string | null {
  const result = text(value, max);
  return result === null ? null : result;
}

function parseGroups(value: unknown, fields: string[]): any[] | null {
  const values = array(value);
  if (!values) return null;
  const output: any[] = [];
  for (const item of values) {
    if (!item || typeof item !== 'object') return null;
    const record: any = {};
    for (const field of fields) {
      const val = (item as any)[field];
      if (field === 'achievements' || field === 'items' || field === 'technologies') {
        const list = array(val);
        if (!list || list.some(entry => text(entry, 1200) === null)) return null;
        record[field] = list;
      } else {
        const parsed = requiredString(val, 1600);
        if (parsed === null) return null;
        record[field] = parsed;
      }
    }
    output.push(record);
  }
  return output;
}

export function validateResumeParseOutput(value: unknown, source: string): ResumeParseRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resume parser returned an invalid object.');
  const input = value as any;
  if (typeof input.isResume !== 'boolean') throw new Error('Resume parser did not classify the document.');
  if (!input.isResume) return { isResume: false, name: '', title: '', email: '', phone: '', location: '', linkedin: '', website: '', summary: '', experience: [], education: [], skills: [], certifications: [], projects: [], languages: [], awards: [], volunteering: [], publications: [], links: [] };
  const scalarFields = ['name', 'title', 'email', 'phone', 'location', 'linkedin', 'website', 'summary'] as const;
  const scalars: any = {};
  for (const field of scalarFields) {
    const parsed = requiredString(input[field]);
    if (parsed === null) throw new Error(`Resume parser returned an invalid ${field}.`);
    scalars[field] = parsed;
  }
  const experience = parseGroups(input.experience, ['company', 'role', 'duration', 'achievements']);
  const education = parseGroups(input.education, ['degree', 'institution', 'year']);
  const skills = parseGroups(input.skills, ['category', 'items']);
  const projects = parseGroups(input.projects ?? [], ['name', 'description', 'technologies']);
  if (!experience || !education || !skills || !projects) throw new Error('Resume parser returned invalid structured sections.');
  const lists: any = {};
  for (const field of ['certifications', 'languages', 'awards', 'volunteering', 'publications', 'links']) {
    const list = array(input[field] ?? []);
    if (!list || list.some(item => text(item, 1600) === null)) throw new Error(`Resume parser returned invalid ${field}.`);
    lists[field] = list;
  }
  if (experience.length + education.length + skills.length + projects.length + lists.certifications.length === 0 && !scalars.name && !scalars.summary) {
    throw new Error('Resume parser returned no meaningful resume content.');
  }
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (evidence.length > MAX.evidence || evidence.some((item: any) => !item || typeof item.field !== 'string' || typeof item.value !== 'string')) {
    throw new Error('Resume parser returned invalid evidence.');
  }
  for (const item of evidence) {
    if (item.start !== undefined && (!Number.isInteger(item.start) || item.start < 0 || item.start > source.length) || item.end !== undefined && (!Number.isInteger(item.end) || item.end < 0 || item.end > source.length)) throw new Error('Resume parser returned an evidence span outside the source.');
    if (item.start !== undefined && item.end !== undefined && (item.end < item.start || source.slice(item.start, item.end) !== item.value)) throw new Error('Resume parser returned an evidence span that does not match the source.');
  }
  return { isResume: true, ...scalars, experience, education, skills, ...lists, evidence };
}

/** A lightweight consistency gate: unsupported proper nouns, dates and metrics
 * must have a source occurrence. This flags claims; it does not prove truth. */
export function findUnsupportedClaims(record: ResumeParseRecord, source: string): ResumeParseWarning[] {
  const haystack = source.toLocaleLowerCase();
  const values: Array<{ field: string; value: string }> = [];
  const add = (field: string, value: string) => { if (value.trim()) values.push({ field, value }); };
  add('name', record.name); add('title', record.title); add('email', record.email); add('phone', record.phone); add('linkedin', record.linkedin); add('website', record.website);
  (record.experience ?? []).forEach((item, i) => { add(`experience[${i}].company`, item.company); add(`experience[${i}].role`, item.role); add(`experience[${i}].duration`, item.duration); (item.achievements ?? []).forEach((v, j) => add(`experience[${i}].achievements[${j}]`, v)); });
  (record.education ?? []).forEach((item, i) => { add(`education[${i}].institution`, item.institution); add(`education[${i}].degree`, item.degree); add(`education[${i}].year`, item.year); });
  (record.certifications ?? []).forEach((v, i) => add(`certifications[${i}]`, v));
  (record.skills ?? []).forEach((group, i) => { add(`skills[${i}].category`, group.category); (group.items ?? []).forEach((v, j) => add(`skills[${i}].items[${j}]`, v)); });
  (record.projects ?? []).forEach((item, i) => { add(`projects[${i}].name`, item.name); add(`projects[${i}].description`, item.description); (item.technologies ?? []).forEach((v, j) => add(`projects[${i}].technologies[${j}]`, v)); });
  for (const field of ['languages', 'awards', 'volunteering', 'publications', 'links'] as const) (record[field] ?? []).forEach((v, i) => add(`${field}[${i}]`, v));
  return values.filter(({ value }) => {
    const normalized = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}@.+#-]+/gu, ' ').trim();
    if (!normalized) return false;
    if (haystack.includes(normalized)) return false;
    const numbers = normalized.match(/\d+(?:[.,]\d+)?%?/g) ?? [];
    if (numbers.some(number => !haystack.includes(number))) return true;
    const negated = /\b(no|not|never|without|didn't|did not|cannot|can't)\b/.test(normalized);
    if (negated && !/\b(no|not|never|without|didn't|did not|cannot|can't)\b/.test(haystack)) return true;
    const tokens = normalized.split(/\s+/).filter(token => token.length > 2);
    return tokens.length > 0 && tokens.filter(token => haystack.includes(token)).length < Math.min(2, tokens.length);
  }).map(({ field, value }) => ({ code: 'UNSUPPORTED_CLAIM', field, message: `The extracted value “${value}” could not be located in the source text and needs review.` }));
}

export function makeSourceHash(source: string): string {
  return `sha256-${createHash('sha256').update(source, 'utf8').digest('hex')}`;
}
import { createHash } from 'node:crypto';
