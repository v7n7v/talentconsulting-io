import type { CanonicalResume } from './resume-normalizer';

/** A lossless, explicitly unstructured fallback. Never invents career fields. */
export function resumeTextDraft(text: string): CanonicalResume {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const first = lines[0] || '';
  const name = first.length <= 80 && !/[@\d:]/.test(first) && !/^(resume|curriculum vitae|experience|summary)$/i.test(first) ? first : '';
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  // Preserve all source lines, including contact details, for explicit user review.
  const sections: NonNullable<CanonicalResume['additionalSections']> = [];
  let current = { id: 'import-0', title: 'Imported content', items: [] as string[] };
  for (const line of lines) {
    if (/^(professional summary|summary|profile|work experience|professional experience|experience|employment|education|skills|technical skills|certifications|projects|awards|volunteering|languages|publications)\s*:?$/i.test(line)) {
      if (current.items.length) sections.push(current);
      current = { id: `import-${sections.length}`, title: line.replace(/:$/, ''), items: [] };
    } else {
      // The editor and export paths receive every character, in bounded items.
      for (let offset = 0; offset < line.length; offset += 3000) current.items.push(line.slice(offset, offset + 3000));
    }
  }
  if (current.items.length) sections.push(current);
  return { name, title: '', email, phone: '', location: '', summary: '', experience: [], education: [], skills: [], certifications: [], additionalSections: sections };
}
