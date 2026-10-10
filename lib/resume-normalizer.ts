'use client';

/**
 * Resume Data Normalizer
 * Single source of truth for resume data shape.
 * Every AI response (morph, auto-fix, parse, build) runs through this
 * BEFORE touching React state or template rendering.
 */

// ============================================================
// CANONICAL RESUME SCHEMA
// ============================================================
export interface CanonicalExperience {
  id?: string;
  company: string;
  role: string;
  duration: string;
  achievements: string[];
}

export interface CanonicalEducation {
  id?: string;
  degree: string;
  institution: string;
  year: string;
  details?: string;
}

export interface CanonicalSkillGroup {
  id?: string;
  category: string;
  items: string[];
}

export interface CanonicalAdditionalSection {
  id: string;
  title: string;
  items: string[];
}

export interface CanonicalResume {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  website?: string;
  links?: string[];
  summary: string;
  experience: CanonicalExperience[];
  education: CanonicalEducation[];
  skills: CanonicalSkillGroup[];
  certifications: string[];
  additionalSections?: CanonicalAdditionalSection[];
}

const MISSING_TEXT_VALUES = new Set([
  'undefined',
  'null',
  'none',
  'n/a',
  'na',
  'unknown',
  'unidentified',
  'not specified',
  'not provided',
  'not listed',
  'tbd',
  'to be added',
]);

export function cleanResumeText(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (MISSING_TEXT_VALUES.has(text.toLowerCase())) return '';
  return text;
}

export function isResumeTextMissing(value: unknown): boolean {
  return cleanResumeText(value) === '';
}

function stableId(prefix: string, identity: string, occurrence: number): string {
  let hash = 2166136261;
  for (const char of `${prefix}\0${identity}\0${occurrence}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function withStableIds<T extends { id?: string }>(items: T[], prefix: string, identity: (item: T) => string, original?: T[]): T[] {
  const previous = new Map<string, string>();
  for (const item of original || []) {
    const key = identity(item);
    if (item.id && key) previous.set(key, item.id);
  }
  const occurrences = new Map<string, number>();
  return items.map(item => {
    if (item.id) return item;
    const key = identity(item) || 'unknown';
    const occurrence = occurrences.get(key) || 0;
    occurrences.set(key, occurrence + 1);
    return { ...item, id: previous.get(key) || stableId(prefix, key, occurrence) };
  });
}

// ============================================================
// SKILL NORMALIZER
// Handles every format the AI might return:
//  - ["Python", "Java"]           → [{category: "Skills", items: [...]}]
//  - "Python, Java, React"        → [{category: "Skills", items: [...]}]
//  - [{category, items}]          → passthrough
//  - [{name: "Python", level: 5}] → [{category: "Skills", items: [...]}]
// ============================================================
function normalizeSkills(raw: any, fallback?: any[], original?: CanonicalSkillGroup[]): CanonicalSkillGroup[] {
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return fallback ? normalizeSkills(fallback, undefined, original) : [];
  }

  // String → split into items
  if (typeof raw === 'string') {
    const items = raw.split(/[,;]/).map((s: string) => cleanResumeText(s)).filter(Boolean);
    return items.length > 0 ? [{ id: stableId('skill', 'Skills', 0), category: 'Skills', items }] : [];
  }

  if (!Array.isArray(raw)) return [];

  const first = raw[0];

  // Already structured: [{category: "Technical", items: ["Python"]}]
  if (typeof first === 'object' && first !== null && Array.isArray(first.items)) {
    return withStableIds(raw.map((s: any) => ({
      ...(cleanResumeText(s.id) ? { id: cleanResumeText(s.id) } : {}),
      category: cleanResumeText(s.category || s.name) || 'Skills',
      items: (s.items || []).map((i: any) => cleanResumeText(i)).filter(Boolean),
    })).filter((s: CanonicalSkillGroup) => s.items.length > 0), 'skill', s => s.category, original);
  }

  // Flat strings: ["Python", "Java"]
  if (typeof first === 'string') {
    const items = raw.map((s: any) => cleanResumeText(s)).filter(Boolean);
    return items.length > 0 ? [{ id: stableId('skill', 'Skills', 0), category: 'Skills', items }] : [];
  }

  // Object with name/level: [{name: "Python", level: 5}]
  if (typeof first === 'object' && first !== null && (first.name || first.skill)) {
    const items = raw.map((s: any) => cleanResumeText(s.name || s.skill)).filter(Boolean);
    return items.length > 0 ? [{ id: stableId('skill', 'Skills', 0), category: 'Skills', items }] : [];
  }

  return [];
}

// ============================================================
// EXPERIENCE NORMALIZER
// Handles: role vs title, missing achievements, etc.
// ============================================================
function normalizeExperience(raw: any, original?: CanonicalExperience[]): CanonicalExperience[] {
  if (!Array.isArray(raw)) return [];
  return withStableIds(raw.map((exp: any) => ({
    ...(cleanResumeText(exp.id) ? { id: cleanResumeText(exp.id) } : {}),
    company: cleanResumeText(exp.company || exp.organization),
    role: cleanResumeText(exp.role || exp.title || exp.position),
    duration: cleanResumeText(exp.duration || exp.dates || exp.period),
    achievements: normalizeStringArray(exp.achievements || exp.bullets || exp.highlights || []),
  })).filter((e: CanonicalExperience) => e.company || e.role || e.achievements.length), 'experience', e => `${e.company}|${e.role}`, original);
}

// ============================================================
// EDUCATION NORMALIZER
// Handles: institution vs school, missing year, etc.
// ============================================================
function normalizeEducation(raw: any, original?: CanonicalEducation[]): CanonicalEducation[] {
  if (!Array.isArray(raw)) return [];
  return withStableIds(raw.map((edu: any) => ({
    ...(cleanResumeText(edu.id) ? { id: cleanResumeText(edu.id) } : {}),
    degree: cleanResumeText(edu.degree || edu.program),
    institution: cleanResumeText(edu.institution || edu.school || edu.university),
    year: cleanResumeText(edu.year || edu.graduation || edu.date),
    details: cleanResumeText(edu.details) || undefined,
  })).filter((e: CanonicalEducation) => e.degree || e.institution || e.year || e.details), 'education', e => `${e.degree}|${e.institution}`, original);
}

// ============================================================
// CERTIFICATIONS NORMALIZER
// ============================================================
function normalizeCertifications(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return cleanResumeText(raw) ? [cleanResumeText(raw)] : [];
  if (Array.isArray(raw)) {
    return raw.map((c: any) => {
      if (typeof c === 'string') return cleanResumeText(c);
      if (typeof c === 'object' && c !== null) return cleanResumeText(c.name || c.title || c.cert);
      return '';
    }).filter(Boolean);
  }
  return [];
}

// ============================================================
// UTILITY
// ============================================================
function normalizeStringArray(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return cleanResumeText(raw) ? [cleanResumeText(raw)] : [];
  if (Array.isArray(raw)) return raw.map((s: any) => typeof s === 'object' && s !== null
    ? cleanResumeText(s.url || s.href || s.text || s.label || s.name)
    : cleanResumeText(s)).filter(Boolean);
  return [];
}

function normalizeAdditionalSections(raw: any): CanonicalAdditionalSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((section: any, index: number) => {
    const title = cleanResumeText(section?.title || section?.name || section?.section || `Additional ${index + 1}`);
    const values = section?.items ?? section?.entries ?? section?.content ?? section?.bullets ?? [];
    const items = Array.isArray(values)
      ? values.map((item: any) => typeof item === 'object' && item !== null
        ? Object.entries(item).flatMap(([key, value]) => {
          if (value == null || key === 'id') return [];
          if (Array.isArray(value)) return value.map(entry => cleanResumeText(entry)).filter(Boolean).map(entry => `${key}: ${entry}`);
          const cleaned = cleanResumeText(value);
          return cleaned ? [`${key}: ${cleaned}`] : [];
        }).join('; ')
        : cleanResumeText(item)).flatMap((item: any) => Array.isArray(item) ? item : [item]).filter(Boolean)
      : normalizeStringArray(values);
    return { id: cleanResumeText(section?.id) || `additional-${index + 1}`, title, items };
  }).filter((section: CanonicalAdditionalSection) => section.title || section.items.length);
}

function collectAdditionalSections(raw: any): CanonicalAdditionalSection[] {
  const direct = normalizeAdditionalSections(raw?.additionalSections || raw?.additional_sections);
  const known = [
    ['Projects', raw?.projects], ['Publications', raw?.publications], ['Languages', raw?.languages],
    ['Awards', raw?.awards], ['Volunteer', raw?.volunteering || raw?.volunteer],
  ].flatMap(([title, values], index) => {
    if (!values) return [];
    return normalizeAdditionalSections([{ id: `additional-${String(title).toLowerCase()}`, title, items: values }]);
  });
  const seen = new Set<string>();
  return [...direct, ...known].filter(section => {
    if (seen.has(section.id)) return false;
    seen.add(section.id); return true;
  });
}

// ============================================================
// MAIN NORMALIZER
// ============================================================
export function normalizeResume(raw: any, original?: any): CanonicalResume {
  if (!raw) {
    return {
      name: '', title: '', email: '', phone: '', location: '',
      summary: '', experience: [], education: [], skills: [], certifications: [],
    };
  }

  return {
    name: cleanResumeText(raw.name),
    title: cleanResumeText(raw.title || raw.role || raw.position),
    email: cleanResumeText(raw.email),
    phone: cleanResumeText(raw.phone || raw.tel),
    location: cleanResumeText(raw.location || raw.address || raw.city),
    linkedin: cleanResumeText(raw.linkedin) || undefined,
    website: cleanResumeText(raw.website) || undefined,
    links: normalizeStringArray(raw.links || raw.contactLinks || raw.portfolioLinks),
    summary: cleanResumeText(raw.summary || raw.objective || raw.about),
    experience: normalizeExperience(raw.experience, original?.experience),
    education: normalizeEducation(raw.education, original?.education),
    skills: normalizeSkills(raw.skills, original?.skills, original?.skills),
    certifications: normalizeCertifications(raw.certifications),
    additionalSections: collectAdditionalSections(raw),
  };
}

// ============================================================
// SERIALIZER (for sending to AI APIs)
// Handles both formats safely — replaces inline serializeSkills()
// ============================================================
export function serializeResumeToText(resume: CanonicalResume): string {
  const sections: string[] = [];

  if (resume.name) sections.push(resume.name);
  if (resume.title) sections.push(resume.title);
  if (resume.email) sections.push(resume.email);
  if (resume.phone) sections.push(resume.phone);
  if (resume.location) sections.push(resume.location);
  if (resume.links?.length) sections.push(`Links: ${resume.links.join(', ')}`);
  if (resume.summary) sections.push(resume.summary);

  for (const exp of resume.experience) {
    const line = `${exp.role} at ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}: ${exp.achievements.join('. ')}`;
    sections.push(line);
  }

  for (const edu of resume.education) {
    const educationLine = [
      edu.degree,
      edu.institution ? `from ${edu.institution}` : '',
      edu.year ? `(${edu.year})` : '',
    ].filter(Boolean).join(' ');
    if (educationLine) sections.push(educationLine);
  }

  const skillText = resume.skills
    .map(s => s.category ? `${s.category}: ${s.items.join(', ')}` : s.items.join(', '))
    .join('; ');
  if (skillText) sections.push(`Skills: ${skillText}`);

  if (resume.certifications.length > 0) {
    sections.push(`Certifications: ${resume.certifications.join(', ')}`);
  }

  for (const section of resume.additionalSections || []) {
    if (section.title) sections.push(`${section.title}: ${section.items.join('. ')}`);
  }

  return sections.filter(Boolean).join('\n');
}
