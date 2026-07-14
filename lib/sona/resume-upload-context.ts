import type { CanonicalResume } from '@/lib/resume-normalizer';

const EMPTY_RESUME: CanonicalResume = {
  name: '',
  title: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
};

function cleanLine(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getUsefulLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 80);
}

function looksLikeContactLine(line: string) {
  return /@|\+?\d[\d\s().-]{6,}|https?:|linkedin\.com|\|/.test(line);
}

function looksLikeName(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5 && line.length <= 80 && !looksLikeContactLine(line);
}

function extractSkills(lines: string[]) {
  const skillsLine = lines.find(line => /^skills?\s*[:|-]/i.test(line));
  if (!skillsLine) return [];

  const [, rawSkills = ''] = skillsLine.split(/[:|-]/, 2);
  return rawSkills
    .split(/[,;•]/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 30);
}

export function hasResumeContextEvidence(resume: Partial<CanonicalResume> | null | undefined) {
  if (!resume) return false;
  return Boolean(
    cleanLine(resume.name) ||
    cleanLine(resume.title) ||
    cleanLine(resume.email) ||
    cleanLine(resume.phone) ||
    cleanLine(resume.location) ||
    cleanLine(resume.summary) ||
    (resume.experience?.length || 0) > 0 ||
    (resume.education?.length || 0) > 0 ||
    (resume.skills?.some(group => group.items?.length) || false) ||
    (resume.certifications?.length || 0) > 0,
  );
}

export function buildResumeContextFromUpload(text: string, fileName = 'Uploaded resume'): CanonicalResume {
  const lines = getUsefulLines(text);
  const skills = extractSkills(lines);
  const firstLine = lines[0] || '';
  const secondLine = lines[1] || '';

  const resume: CanonicalResume = {
    ...EMPTY_RESUME,
    name: looksLikeName(firstLine) ? firstLine : '',
    title: secondLine && !looksLikeContactLine(secondLine) && secondLine.length <= 120 ? secondLine : '',
    summary: lines.join('\n').slice(0, 6000),
    skills: skills.length > 0 ? [{ category: 'Extracted skills', items: skills }] : [],
  };

  if (!hasResumeContextEvidence(resume)) {
    return {
      ...EMPTY_RESUME,
      title: fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded resume',
    };
  }

  return resume;
}
