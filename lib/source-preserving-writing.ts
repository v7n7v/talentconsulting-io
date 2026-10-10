/** Strict drafting boundary: AI may select source units, never supply candidate facts. */
export function writingEvidence(resume: unknown, profile?: { headline?: string; about?: string }) {
  const value = resume && typeof resume === 'object' && !Array.isArray(resume) ? resume as Record<string, any> : {};
  const units: string[] = [];
  const add = (text: unknown) => { if (typeof text === 'string' && text.trim()) units.push(text.trim()); };
  add(profile?.headline);
  for (const line of (profile?.about || '').split(/\n+/)) add(line);
  add(value.title); add(value.summary);
  for (const entry of Array.isArray(value.experience) ? value.experience : []) {
    for (const key of ['achievements', 'bullets', 'responsibilities']) {
      for (const line of Array.isArray(entry?.[key]) ? entry[key] : []) add(line);
    }
  }
  for (const skill of Array.isArray(value.skills) ? value.skills : []) {
    if (typeof skill === 'string') add(skill);
    else for (const item of Array.isArray(skill?.items) ? skill.items : []) add(item);
  }
  return Array.from(new Set(units)).filter(unit => unit.length <= 2600).slice(0, 100);
}

export function selectedWritingEvidence(units: string[], selected: unknown, limit: number) {
  if (!Array.isArray(selected) || !selected.length || selected.length > 12 || selected.some(index => !Number.isInteger(index) || index < 0 || index >= units.length)) {
    throw new Error('The draft did not select valid source evidence.');
  }
  const text = Array.from(new Set(selected as number[])).map(index => units[index]).join('\n\n');
  if (text.length > limit) throw new Error('The selected source text exceeds the section limit.');
  return text;
}
