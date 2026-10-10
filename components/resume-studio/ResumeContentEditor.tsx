"use client";

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CanonicalResume, CanonicalEducation, CanonicalExperience, CanonicalSkillGroup } from "@/lib/resume-normalizer";
import "./resume-content-editor.css";

type AdditionalSection = { id: string; title: string; items: string[] };
export type EditableResume = CanonicalResume & { additionalSections?: AdditionalSection[] };

export interface ResumeEditorSession {
  history: EditableResume[];
  future: EditableResume[];
  activeSection: string;
}

export function createResumeEditorSession(): ResumeEditorSession {
  return { history: [], future: [], activeSection: "identity" };
}

export interface ResumeContentEditorProps {
  value: CanonicalResume;
  onChange: (value: CanonicalResume) => void;
  disabled?: boolean;
  context?: "experience" | "resume";
  sourceText?: string;
  warnings?: string[];
  title?: string;
  session?: ResumeEditorSession;
  onSessionChange?: Dispatch<SetStateAction<ResumeEditorSession>>;
}

const MAX_HISTORY = 30;
const emptyExperience = (): CanonicalExperience => ({ id: crypto.randomUUID(), company: "", role: "", duration: "", achievements: [""] });
const emptyEducation = (): CanonicalEducation => ({ id: crypto.randomUUID(), degree: "", institution: "", year: "", details: "" });
const emptySkills = (): CanonicalSkillGroup => ({ id: crypto.randomUUID(), category: "", items: [""] });
const emptyResume = (resume: EditableResume): EditableResume => ({
  ...resume,
  experience: resume.experience || [], education: resume.education || [], skills: resume.skills || [], certifications: resume.certifications || [],
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pretty(value: unknown) { return JSON.stringify(value); }

export function ResumeContentEditor({
  value, onChange, disabled = false, context = "resume", sourceText, warnings = [], title, session, onSessionChange,
}: ResumeContentEditorProps) {
  const resume = emptyResume(value as EditableResume);
  const baseId = useId();
  const [localSession, setLocalSession] = useState<ResumeEditorSession>(createResumeEditorSession);
  const controlledSession = session !== undefined && onSessionChange !== undefined;
  const editorSession = controlledSession ? session : localSession;
  const setEditorSession = controlledSession ? onSessionChange : setLocalSession;
  const history = editorSession.history;
  const future = editorSession.future;
  const activeSection = editorSession.activeSection;
  const lastEmitted = useRef(pretty(resume));
  const setHistory: Dispatch<SetStateAction<EditableResume[]>> = (action) => setEditorSession((previous) => ({
    ...previous,
    history: typeof action === "function" ? action(previous.history) : action,
  }));
  const setFuture: Dispatch<SetStateAction<EditableResume[]>> = (action) => setEditorSession((previous) => ({
    ...previous,
    future: typeof action === "function" ? action(previous.future) : action,
  }));
  const setActiveSection = (activeSection: string) => setEditorSession(previous => ({ ...previous, activeSection }));
  const extraSections = useMemo(() => resume.additionalSections || [], [resume.additionalSections]);

  useEffect(() => {
    const signature = pretty(resume);
    if (signature !== lastEmitted.current) {
      setHistory([]); setFuture([]); lastEmitted.current = signature;
    }
  // The parent value is intentionally the synchronization boundary for a controlled editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (next: EditableResume) => {
    if (disabled || pretty(next) === pretty(resume)) return;
    setHistory((items) => [...items, clone(resume)].slice(-MAX_HISTORY));
    setFuture([]);
    lastEmitted.current = pretty(next);
    onChange(next);
  };

  const updateField = <K extends keyof EditableResume>(field: K, next: EditableResume[K]) => update({ ...resume, [field]: next });
  const undo = () => {
    if (disabled || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1)); setFuture((items) => [clone(resume), ...items].slice(0, MAX_HISTORY));
    lastEmitted.current = pretty(previous); onChange(previous);
  };
  const redo = () => {
    if (disabled || future.length === 0) return;
    const next = future[0];
    setFuture((items) => items.slice(1)); setHistory((items) => [...items, clone(resume)].slice(-MAX_HISTORY));
    lastEmitted.current = pretty(next); onChange(next);
  };

  const sections = useMemo(() => [
    ["identity", "Identity"], ["summary", "Summary"], ["experience", "Work"], ["education", "Education"],
    ["skills", "Skills"], ["credentials", "Credentials"], ["links", "Links"], ...extraSections.map((section) => [section.id, section.title] as const),
  ] as const, [extraSections]);
  const moveSection = (index: number, direction: -1 | 1) => {
    const next = [...extraSections]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateField("additionalSections", next);
  };
  const scrollToSection = (id: string) => { setActiveSection(id); document.getElementById(`${baseId}-${id}`)?.scrollIntoView({ behavior: "auto", block: "start" }); };

  return <section className="resume-content-editor" aria-labelledby={`${baseId}-heading`} data-guide="resume-editor">
    <header className="resume-content-editor__header">
      <div>
        <p className="resume-content-editor__eyebrow">{context === "experience" ? "Your experience" : "Resume content"}</p>
        <h2 id={`${baseId}-heading`}>{title || (context === "experience" ? "Keep your experience current" : "Shape the content for this resume")}</h2>
        <p className="resume-content-editor__intro">Add what you know now. Missing details can stay blank while you build.</p>
      </div>
      <div className="resume-content-editor__history" aria-label="Edit history">
        <button type="button" onClick={undo} disabled={disabled || history.length === 0} aria-label="Undo last edit">Undo</button>
        <button type="button" onClick={redo} disabled={disabled || future.length === 0} aria-label="Redo last edit">Redo</button>
      </div>
    </header>
    {warnings.length > 0 && <aside className="resume-content-editor__warnings" aria-label="Review notes">
      <strong>Review notes</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
    </aside>}
    <nav className="resume-content-editor__nav" aria-label="Content sections">
      {sections.map(([id, label]) => <button key={id} type="button" className={activeSection === id ? "is-active" : ""} onClick={() => scrollToSection(id)}>{label}</button>)}
    </nav>
    <div className="resume-content-editor__body">
      <div className="resume-content-editor__main">
        <fieldset id={`${baseId}-identity`} className="resume-content-editor__section">
          <legend>Identity and contact</legend><p className="resume-content-editor__hint">These labels stay with your record so every use has clear context.</p>
          <div className="resume-content-editor__grid">
            {(["name", "title", "email", "phone", "location"] as const).map((field) => <label key={field} htmlFor={`${baseId}-${field}`}>{field === "title" ? "Headline or role" : field[0].toUpperCase() + field.slice(1)}<input id={`${baseId}-${field}`} value={resume[field]} disabled={disabled} onChange={(event) => updateField(field, event.target.value)} /></label>)}
          </div>
        </fieldset>
        <fieldset id={`${baseId}-summary`} className="resume-content-editor__section"><legend>Summary</legend><label htmlFor={`${baseId}-summary-input`}>About you<textarea id={`${baseId}-summary-input`} rows={5} value={resume.summary} disabled={disabled} placeholder="A short, honest description of your focus and strengths." onChange={(event) => updateField("summary", event.target.value)} /></label></fieldset>
        <ExperienceSection id={`${baseId}-experience`} entries={resume.experience} disabled={disabled} onChange={(experience) => updateField("experience", experience)} />
        <EducationSection id={`${baseId}-education`} entries={resume.education} disabled={disabled} onChange={(education) => updateField("education", education)} />
        <SkillsSection id={`${baseId}-skills`} entries={resume.skills} disabled={disabled} onChange={(skills) => updateField("skills", skills)} />
        <fieldset id={`${baseId}-credentials`} className="resume-content-editor__section"><legend>Credentials</legend><p className="resume-content-editor__hint">Use neutral, self-reported wording. You can add verification context later.</p><StringList label="Credential or certification" values={resume.certifications} disabled={disabled} onChange={(certifications) => updateField("certifications", certifications)} addLabel="Add credential" /></fieldset>
        <fieldset id={`${baseId}-links`} className="resume-content-editor__section"><legend>Links</legend><div className="resume-content-editor__grid"><label htmlFor={`${baseId}-linkedin`}>LinkedIn<input id={`${baseId}-linkedin`} value={resume.linkedin || ""} disabled={disabled} onChange={(event) => updateField("linkedin", event.target.value || undefined)} /></label><label htmlFor={`${baseId}-website`}>Website or portfolio<input id={`${baseId}-website`} value={resume.website || ""} disabled={disabled} onChange={(event) => updateField("website", event.target.value || undefined)} /></label></div><StringList label="Other link" values={resume.links || []} disabled={disabled} onChange={links => updateField("links", links)} addLabel="Add link" /></fieldset>
        {extraSections.map((section, index) => <fieldset id={`${baseId}-${section.id}`} className="resume-content-editor__section" key={section.id}><legend>{section.title || "Additional section"}</legend><div className="resume-content-editor__section-actions"><button type="button" onClick={() => moveSection(index, -1)} disabled={disabled || index === 0}>Move up</button><button type="button" onClick={() => moveSection(index, 1)} disabled={disabled || index === extraSections.length - 1}>Move down</button></div><label>Section title<input value={section.title} disabled={disabled} onChange={event => updateField("additionalSections", extraSections.map(item => item.id === section.id ? { ...item, title: event.target.value } : item))} /></label><button type="button" disabled={disabled} onClick={() => updateField("additionalSections", extraSections.filter(item => item.id !== section.id))}>Remove section</button><StringList label={`${section.title || "Additional"} item`} values={section.items} disabled={disabled} onChange={(items) => updateField("additionalSections", extraSections.map((item) => item.id === section.id ? { ...item, items } : item))} addLabel="Add item" /></fieldset>)}
        <button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => updateField("additionalSections", [...extraSections, { id: crypto.randomUUID(), title: "Additional experience", items: [""] }])}>+ Add a section (projects, publications, languages…)</button>
      </div>
      <aside className="resume-content-editor__source" aria-label="Source comparison">
        {sourceText ? <details><summary>Compare with source</summary><p>Source text is kept for reference. Edits here are your reviewable record.</p><pre>{sourceText}</pre></details> : <p className="resume-content-editor__empty">No source text attached. You can build this record manually.</p>}
      </aside>
    </div>
  </section>;
}

function ExperienceSection({ id, entries, disabled, onChange }: { id: string; entries: CanonicalExperience[]; disabled: boolean; onChange: (value: CanonicalExperience[]) => void }) {
  const edit = (index: number, patch: Partial<CanonicalExperience>) => onChange(entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...patch } : entry));
  return <fieldset id={id} className="resume-content-editor__section"><legend>Work and roles</legend><p className="resume-content-editor__hint">Projects, caregiving, freelance work, and community roles belong here too.</p>{entries.map((entry, index) => <div className="resume-content-editor__card" key={entry.id || index}><div className="resume-content-editor__card-heading"><h3>{entry.role || entry.company || `Role ${index + 1}`}</h3><EntryActions index={index} length={entries.length} disabled={disabled} onMove={(direction) => { const next = [...entries]; const target = index + direction; if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; onChange(next); }} onRemove={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))} label="work entry" /></div><div className="resume-content-editor__grid"><label>Company or context<input value={entry.company} disabled={disabled} onChange={(event) => edit(index, { company: event.target.value })} /></label><label>Role or contribution<input value={entry.role} disabled={disabled} onChange={(event) => edit(index, { role: event.target.value })} /></label><label>Duration<input value={entry.duration} disabled={disabled} placeholder="Dates or ongoing" onChange={(event) => edit(index, { duration: event.target.value })} /></label></div><BulletList idPrefix={`${id}-${entry.id || index}`} values={entry.achievements} disabled={disabled} onChange={(achievements) => edit(index, { achievements })} /></div>)}<button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => onChange([...entries, emptyExperience()])}>+ Add role or project</button></fieldset>;
}

function EducationSection({ id, entries, disabled, onChange }: { id: string; entries: CanonicalEducation[]; disabled: boolean; onChange: (value: CanonicalEducation[]) => void }) {
  const edit = (index: number, patch: Partial<CanonicalEducation>) => onChange(entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...patch } : entry));
  return <fieldset id={id} className="resume-content-editor__section"><legend>Education</legend>{entries.map((entry, index) => <div className="resume-content-editor__card" key={entry.id || index}><div className="resume-content-editor__card-heading"><h3>{entry.degree || entry.institution || `Education ${index + 1}`}</h3><EntryActions index={index} length={entries.length} disabled={disabled} onMove={(direction) => { const next = [...entries]; const target = index + direction; if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; onChange(next); }} onRemove={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))} label="education entry" /></div><div className="resume-content-editor__grid"><label>Degree, program, or learning<input value={entry.degree} disabled={disabled} onChange={(event) => edit(index, { degree: event.target.value })} /></label><label>Institution<input value={entry.institution} disabled={disabled} onChange={(event) => edit(index, { institution: event.target.value })} /></label><label>Year or period<input value={entry.year} disabled={disabled} onChange={(event) => edit(index, { year: event.target.value })} /></label></div><label>Details (optional)<textarea rows={2} value={entry.details || ""} disabled={disabled} onChange={(event) => edit(index, { details: event.target.value })} /></label></div>)}<button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => onChange([...entries, emptyEducation()])}>+ Add education</button></fieldset>;
}

function SkillsSection({ id, entries, disabled, onChange }: { id: string; entries: CanonicalSkillGroup[]; disabled: boolean; onChange: (value: CanonicalSkillGroup[]) => void }) {
  const edit = (index: number, patch: Partial<CanonicalSkillGroup>) => onChange(entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...patch } : entry));
  return <fieldset id={id} className="resume-content-editor__section"><legend>Skills</legend><p className="resume-content-editor__hint">Group skills in the way that makes sense for you. Levels are optional.</p>{entries.map((entry, index) => <div className="resume-content-editor__card" key={entry.id || index}><div className="resume-content-editor__card-heading"><h3>{entry.category || `Skill group ${index + 1}`}</h3><EntryActions index={index} length={entries.length} disabled={disabled} onMove={(direction) => { const next = [...entries]; const target = index + direction; if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; onChange(next); }} onRemove={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))} label="skill group" /></div><label>Group name<input value={entry.category} disabled={disabled} onChange={(event) => edit(index, { category: event.target.value })} /></label><label>Skills<textarea rows={Math.max(2, entry.items.length)} value={entry.items.join("\n")} disabled={disabled} placeholder="One skill per line" onChange={(event) => edit(index, { items: event.target.value.split("\n") })} /></label></div>)}<button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => onChange([...entries, emptySkills()])}>+ Add skill group</button></fieldset>;
}

function EntryActions({ index, length, disabled, onMove, onRemove, label }: { index: number; length: number; disabled: boolean; onMove: (direction: -1 | 1) => void; onRemove: () => void; label: string }) {
  return <div className="resume-content-editor__entry-actions"><button type="button" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label={`Move ${label} up`}>↑</button><button type="button" onClick={() => onMove(1)} disabled={disabled || index === length - 1} aria-label={`Move ${label} down`}>↓</button><button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`}>Remove</button></div>;
}

function BulletList({ idPrefix, values, disabled, onChange }: { idPrefix: string; values: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const move = (index: number, direction: -1 | 1) => { const next = [...values]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="resume-content-editor__bullet-list"><span className="resume-content-editor__list-label">Achievements or contributions</span>{values.map((item, index) => <div className="resume-content-editor__list-row" key={index}><label htmlFor={`${idPrefix}-achievement-${index}`}>Bullet {index + 1}<textarea id={`${idPrefix}-achievement-${index}`} rows={2} value={item} disabled={disabled} placeholder="Describe the contribution in your own words" onChange={(event) => onChange(values.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} /></label><div className="resume-content-editor__entry-actions"><button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label={`Move bullet ${index + 1} up`}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={disabled || index === values.length - 1} aria-label={`Move bullet ${index + 1} down`}>↓</button><button type="button" onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))} disabled={disabled} aria-label={`Remove bullet ${index + 1}`}>Remove</button></div></div>)}<button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => onChange([...values, ""])}>+ Add bullet</button></div>;
}

function StringList({ label, values, disabled, onChange, addLabel }: { label: string; values: string[]; disabled: boolean; onChange: (values: string[]) => void; addLabel: string }) {
  const listId = useId();
  return <div className="resume-content-editor__list">{values.map((item, index) => <div className="resume-content-editor__list-row" key={index}><label htmlFor={`${listId}-${index}`}>{label} {index + 1}<input id={`${listId}-${index}`} value={item} disabled={disabled} onChange={(event) => onChange(values.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} /></label><button type="button" disabled={disabled} onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))} aria-label={`Remove ${label} ${index + 1}`}>Remove</button></div>)}<button type="button" className="resume-content-editor__add" disabled={disabled} onClick={() => onChange([...values, ""])}>+ {addLabel}</button></div>;
}
