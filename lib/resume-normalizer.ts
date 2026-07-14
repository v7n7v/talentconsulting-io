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
  company: string;
  role: string;
  duration: string;
  achievements: string[];
}

export interface CanonicalEducation {
  degree: string;
  institution: string;
  year: string;
  details?: string;
}

export interface CanonicalSkillGroup {
  category: string;
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
  summary: string;
  experience: CanonicalExperience[];
  education: CanonicalEducation[];
  skills: CanonicalSkillGroup[];
  certifications: string[];
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

// ============================================================
// SKILL NORMALIZER
// Handles every format the AI might return:
//  - ["Python", "Java"]           → [{category: "Skills", items: [...]}]
//  - "Python, Java, React"        → [{category: "Skills", items: [...]}]
//  - [{category, items}]          → passthrough
//  - [{name: "Python", level: 5}] → [{category: "Skills", items: [...]}]
// ============================================================
function normalizeSkills(raw: any, fallback?: any[]): CanonicalSkillGroup[] {
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return fallback ? normalizeSkills(fallback) : [];
  }

  // String → split into items
  if (typeof raw === 'string') {
    const items = raw.split(/[,;]/).map((s: string) => cleanResumeText(s)).filter(Boolean);
    return items.length > 0 ? [{ category: 'Skills', items }] : [];
  }

  if (!Array.isArray(raw)) return [];

  const first = raw[0];

  // Already structured: [{category: "Technical", items: ["Python"]}]
  if (typeof first === 'object' && first !== null && Array.isArray(first.items)) {
    return raw.map((s: any) => ({
      category: cleanResumeText(s.category || s.name) || 'Skills',
      items: (s.items || []).map((i: any) => cleanResumeText(i)).filter(Boolean),
    })).filter((s: CanonicalSkillGroup) => s.items.length > 0);
  }

  // Flat strings: ["Python", "Java"]
  if (typeof first === 'string') {
    const items = raw.map((s: any) => cleanResumeText(s)).filter(Boolean);
    return items.length > 0 ? [{ category: 'Skills', items }] : [];
  }

  // Object with name/level: [{name: "Python", level: 5}]
  if (typeof first === 'object' && first !== null && (first.name || first.skill)) {
    const items = raw.map((s: any) => cleanResumeText(s.name || s.skill)).filter(Boolean);
    return items.length > 0 ? [{ category: 'Skills', items }] : [];
  }

  return [];
}

// ============================================================
// EXPERIENCE NORMALIZER
// Handles: role vs title, missing achievements, etc.
// ============================================================
function normalizeExperience(raw: any): CanonicalExperience[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((exp: any) => ({
    company: cleanResumeText(exp.company || exp.organization),
    role: cleanResumeText(exp.role || exp.title || exp.position),
    duration: cleanResumeText(exp.duration || exp.dates || exp.period),
    achievements: normalizeStringArray(exp.achievements || exp.bullets || exp.highlights || []),
  })).filter((e: CanonicalExperience) => e.company || e.role);
}

// ============================================================
// EDUCATION NORMALIZER
// Handles: institution vs school, missing year, etc.
// ============================================================
function normalizeEducation(raw: any): CanonicalEducation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((edu: any) => ({
    degree: cleanResumeText(edu.degree || edu.program),
    institution: cleanResumeText(edu.institution || edu.school || edu.university),
    year: cleanResumeText(edu.year || edu.graduation || edu.date),
    details: cleanResumeText(edu.details) || undefined,
  })).filter((e: CanonicalEducation) => e.degree || e.institution || e.year || e.details);
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
  if (Array.isArray(raw)) return raw.map((s: any) => cleanResumeText(s)).filter(Boolean);
  return [];
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
    summary: cleanResumeText(raw.summary || raw.objective || raw.about),
    experience: normalizeExperience(raw.experience),
    education: normalizeEducation(raw.education),
    skills: normalizeSkills(raw.skills, original?.skills),
    certifications: normalizeCertifications(raw.certifications),
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

  return sections.filter(Boolean).join('\n');
}
