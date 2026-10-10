'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { buildResumeDocumentPlan, getResumeDesignWarnings, normalizeResumeDesign, RESUME_FONTS, type ResumeDesignConfig, type ResumeDesignSection } from '@/lib/resume-design';
import { reconcileResumeEntryBreaks } from '@/lib/resume-design/source-breaks';
import { ResumeDesignPanel } from './ResumeDesignPanel';
import './resume-design-workbench.css';

interface Props {
  resume: CanonicalResume;
  value: ResumeDesignConfig;
  onChange: (design: ResumeDesignConfig) => void;
  title: string;
  renderDocument: (selectedId: string | null, select: (id: string) => void) => ReactNode;
  onInspect?: () => void;
  onReset?: () => ResumeDesignConfig;
  onUseLegacy?: () => void;
  personalStyles?: (change:(next:ResumeDesignConfig)=>void) => ReactNode;
  singleColumnComposition?: boolean;
}

function ContextNumber({ value, placeholder, min, max, step, onCommit }: { value?:number; placeholder:string; min:number; max:number; step:number; onCommit:(value:string)=>void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) { setLastValue(value); setDraft(value === undefined ? '' : String(value)); }
  return <input type="number" min={min} max={max} step={step} placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (!draft.trim() || Number.isFinite(Number(draft))) onCommit(draft); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function StylesSlot({ render, onChange }: { render:NonNullable<Props['personalStyles']>; onChange:(design:ResumeDesignConfig)=>void }) {
  return render(onChange);
}

/** One history for contextual and global presentation changes; source replacement starts a new history. */
export function ResumeDesignWorkbench({ resume, value, onChange, title, renderDocument, onInspect, onReset, onUseLegacy, personalStyles, singleColumnComposition = false }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([value]);
  const [cursor, setCursor] = useState(0);
  const last = useRef(JSON.stringify(value));
  const sourceKey = JSON.stringify(resume);
  const previousSource = useRef(sourceKey);
  const previousResume = useRef(resume);
  const globalButton = useRef<HTMLButtonElement>(null);
  const plan = useMemo(() => buildResumeDocumentPlan(resume, value), [resume, value]);
  const inventory = useMemo(() => buildResumeDocumentPlan(resume, { ...value, sections:value.sections.map(section => ({ ...section, visible:true })) }).sections, [resume, value]);
  const active = value.sections.find(section => section.id === selected && section.visible);
  const hidden = inventory.filter(section => !value.sections.find(item => item.id === section.id)?.visible);
  const warnings = getResumeDesignWarnings(value, resume);
  const key = JSON.stringify(value);

  useEffect(() => {
    if (previousSource.current !== sourceKey || last.current !== key) {
      setHistory([value]); setCursor(0);
      const ownDesign = last.current === key; last.current = key;
      if (previousSource.current !== sourceKey) {
        setSelected(null);
        const reconciled = ownDesign ? reconcileResumeEntryBreaks(previousResume.current, resume, value) : { design:value, invalidated:[] };
        setNotice(reconciled.invalidated.length ? 'Source changed. Entry breaks for moved or replaced records were cleared; review pagination again.' : 'Source changed. Global design controls selected.');
        if (reconciled.invalidated.length) { last.current = JSON.stringify(reconciled.design); setHistory([reconciled.design]); onChange(reconciled.design); }
      }
      previousSource.current = sourceKey; previousResume.current = resume;

    }
    // External source/settings can remove the selected section; reconcile that boundary once.
    if (selected && !plan.sections.some(section => section.id === selected)) setSelected(null);
  }, [key, sourceKey, plan.sections, selected, value, resume, onChange]);

  const commit = (next: ResumeDesignConfig) => {
    const normalized = normalizeResumeDesign(next, next.templateId, resume);
    const nextKey = JSON.stringify(normalized);
    if (nextKey === key) return;
    last.current = nextKey;
    const stack = [...history.slice(0, cursor + 1), normalized].slice(-40);
    setHistory(stack); setCursor(stack.length - 1); onChange(normalized);
  };
  const restore = (index: number) => {
    const next = history[index]; if (!next) return;
    last.current = JSON.stringify(next); setCursor(index); onChange(next);
    if (selected && !next.sections.some(section => section.id === selected && section.visible)) setSelected(null);
    setNotice(index < cursor ? 'Design change undone.' : 'Design change restored.');
  };
  const select = (id: string) => { if (plan.sections.some(section => section.id === id)) { setSelected(id); setNotice(`${value.sections.find(s => s.id === id)?.title} design controls selected.`); } };
  const updateSection = (mutate: (section: ResumeDesignSection) => void) => {
    const next = structuredClone(value); const section = next.sections.find(s => s.id === selected);
    if (section) { mutate(section); commit(next); }
  };
  const setOverride = (key: 'bodySize' | 'lineHeight' | 'bodyFont', nextValue: string) => updateSection(section => {
    section.typography = { ...section.typography };
    if (!nextValue) delete section.typography[key];
    else if (key === 'bodyFont') section.typography.bodyFont = nextValue as ResumeDesignConfig['typography']['bodyFont'];
    else section.typography[key] = Number(nextValue);
  });

  return <section className="rdw" aria-label="Résumé design workbench" data-guide="resume-design">
    <div className="rdw-toolbar"><div><p className="rdw-kicker">DOCUMENT DESIGN</p><h2>{title}</h2><p>Choose a section to adjust its presentation.</p></div><div className="rdw-actions"><button ref={globalButton} type="button" aria-pressed={!active} onClick={() => { setSelected(null); setNotice('Global design controls selected.'); }}>Global design controls</button><button type="button" aria-label="Undo design change" disabled={cursor <= 0} onClick={() => restore(cursor - 1)}>Undo</button><button type="button" aria-label="Redo design change" disabled={cursor >= history.length - 1} onClick={() => restore(cursor + 1)}>Redo</button></div></div>
    <div className="rdw-selector"><label>Choose a section<select value={active?.id || ''} onChange={event => event.target.value ? select(event.target.value) : setSelected(null)}><option value="">Global design</option>{plan.sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label><span>{value.pageSize} · {value.layout.columns === 1 ? 'Single content column' : 'Two columns'}</span></div>
    <p className="rdw-status" role="status" aria-live="polite">{notice || 'The editing view is continuous. PDF pages are measured separately.'}</p>
    {warnings.length > 0 && <div className="rdw-warnings" aria-label="Readability checks"><strong>Before exporting</strong><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    <div className="rdw-grid"><div className="rdw-controls">
      {active ? <section className="rdw-context" aria-label={`${active.title} design controls`}><p className="rdw-kicker">SELECTED SECTION</p><h3>{active.title}</h3><p>Your original facts remain in the résumé.</p>
        <label>Section title<input maxLength={120} value={active.title} onChange={e => updateSection(section => { section.title = e.target.value; })} /></label>
        <label>Body font<select value={active.typography?.bodyFont || ''} onChange={e => setOverride('bodyFont', e.target.value)}><option value="">Use global font</option>{RESUME_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
        <label>Body size · pt<ContextNumber key={`${active.id}:size`} step={0.5} min={6} max={24} placeholder={`${value.typography.bodySize} global`} value={active.typography?.bodySize} onCommit={text => setOverride('bodySize', text)} /></label>
        {(active.typography?.bodySize ?? value.typography.bodySize) < 10 && <p className="rdw-warning">Text below 10 pt can be difficult to read in print.</p>}
        <label>Line height<ContextNumber key={`${active.id}:height`} step={0.05} min={1} max={2.2} placeholder={`${value.typography.lineHeight} global`} value={active.typography?.lineHeight} onCommit={text => setOverride('lineHeight', text)} /></label>
        <label className="rdw-check"><input type="checkbox" checked={active.breakBefore} onChange={e => updateSection(section => { section.breakBefore = e.target.checked; })} /> Start on a new PDF page</label>
        <button type="button" onClick={() => { updateSection(section => { delete section.typography; }); setNotice('Section typography now inherits global settings.'); }}>Reset section typography</button>
        <button type="button" onClick={() => { updateSection(section => { section.visible = false; }); setSelected(null); setNotice(`${active.title} hidden. Its settings and facts are retained below.`); requestAnimationFrame(() => document.getElementById(`rdw-restore-${active.id}`)?.focus()); }}>Hide {active.title}</button>
      </section> : <ResumeDesignPanel resume={resume} value={value} onChange={commit} onReset={onReset ? () => commit(onReset()) : undefined} onUseLegacy={onUseLegacy} hideHistory compositionLocked={singleColumnComposition} />}
      {hidden.length > 0 && <section className="rdw-hidden" aria-label="Hidden sections"><h3>Hidden sections</h3><p>Content and settings are retained.</p>{hidden.map(section => <button id={`rdw-restore-${section.id}`} key={section.id} type="button" onClick={() => { const next = structuredClone(value); next.sections.find(s => s.id === section.id)!.visible = true; commit(next); setSelected(section.id); setNotice(`${section.title} restored and selected.`); globalButton.current?.focus(); }}>Restore {section.title}</button>)}</section>}
      {personalStyles && <StylesSlot render={personalStyles} onChange={commit} />}
    </div><div className="rdw-preview"><div className="rdw-paper-label"><strong>Editing view</strong><span>Continuous · select a section</span></div><div className="rdw-paper">{renderDocument(active?.id || null, select)}</div><p className="rdw-caption">This view helps you edit. Inspect the actual PDF for pagination and page count.</p>{onInspect && <button className="rdw-inspect" type="button" onClick={onInspect}>Inspect PDF pages &amp; export</button>}</div></div>
  </section>;
}
