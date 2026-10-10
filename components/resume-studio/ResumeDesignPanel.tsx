'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { RESUME_FONTS, buildResumeDocumentPlan, getResumeDesignWarnings, normalizeResumeDesign } from '@/lib/resume-design';
import type { ResumeDesignConfig, ResumeDesignSection } from '@/lib/resume-design/types';
import { RESUME_DESIGN_COLOR_PRESETS } from '@/lib/resume-design/color-presets';
import './resume-design-panel.css';

export interface ResumeDesignPanelProps {
  resume: CanonicalResume;
  value: ResumeDesignConfig;
  onChange: (next: ResumeDesignConfig) => void;
  onReset?: () => void;
  onUseLegacy?: () => void;
  hideHistory?: boolean;
  compositionLocked?: boolean;
}

const COLOR_FIELDS = ['paper', 'ink', 'heading', 'accent', 'rail', 'railInk'] as const;
const COLOR_LABELS: Record<(typeof COLOR_FIELDS)[number], string> = {
  paper: 'Paper', ink: 'Body ink', heading: 'Headings', accent: 'Accent', rail: 'Rail fill', railInk: 'Rail text',
};
const selectOptions = (values: readonly string[]) => values.map(value => <option key={value} value={value}>{value}</option>);

function NumberField({ value, onCommit, min, max, step = 1, placeholder }: { value?: number; onCommit: (value?: number) => void; min: number; max: number; step?: number; placeholder?: string }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value === undefined ? '' : String(value));
  }
  return <input type="number" min={min} max={max} step={step} value={draft} placeholder={placeholder} onChange={event => setDraft(event.target.value)} onBlur={() => {
    if (!draft.trim()) { if (value !== undefined) onCommit(undefined); return; }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) { if (parsed !== value) onCommit(parsed); }
    else setDraft(value === undefined ? '' : String(value));
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

function HexField({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) { setLastValue(value); setDraft(value); }
  const valid = /^#[\da-f]{6}$/i.test(draft);
  return <>
    <input type="text" value={draft} aria-label={`${label} hex value`} aria-invalid={!valid} maxLength={7} onChange={event => setDraft(event.target.value)} onBlur={() => { if (valid && draft.toLowerCase() !== value.toLowerCase()) onCommit(draft.toLowerCase()); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    {!valid && <small className="rdp-hex-hint" role="status">Use # followed by 6 hex digits.</small>}
  </>;
}

export function ResumeDesignPanel({ resume, value, onChange, onReset, onUseLegacy, hideHistory = false, compositionLocked = false }: ResumeDesignPanelProps) {
  const currentKey = JSON.stringify(value);
  const [history, setHistory] = useState<ResumeDesignConfig[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const previousExternal = useRef(currentKey);
  const [activeSection, setActiveSection] = useState('');
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const plan = useMemo(() => buildResumeDocumentPlan(resume, value), [resume, value]);
  const warnings = getResumeDesignWarnings(value, resume);

  useEffect(() => {
    if (previousExternal.current !== currentKey) {
      previousExternal.current = currentKey;
      setHistory([value]);
      setHistoryIndex(0);
    }
  }, [currentKey, value]);

  const update = (mutate: (draft: ResumeDesignConfig) => void) => {
    const next = structuredClone(value);
    mutate(next);
    const normalized = normalizeResumeDesign(next, next.templateId, resume);
    if (JSON.stringify(normalized) === currentKey) return;
    setHistory(old => [...old.slice(0, historyIndex + 1), normalized].slice(-40));
    setHistoryIndex(index => Math.min(index + 1, 39));
    previousExternal.current = JSON.stringify(normalized);
    onChange(normalized);
  };
  const restore = (index: number) => {
    const next = history[index];
    if (!next) return;
    setHistoryIndex(index);
    previousExternal.current = JSON.stringify(next);
    onChange(next);
  };
  const setTypography = (key: keyof ResumeDesignConfig['typography'], val: string | number) => update(d => { (d.typography as unknown as Record<string, unknown>)[key] = val; });
  const setLayout = (key: keyof ResumeDesignConfig['layout'], val: unknown) => update(d => { (d.layout as unknown as Record<string, unknown>)[key] = val; });
  const setSection = (id: string, mutate: (section: ResumeDesignSection, sections: ResumeDesignSection[]) => void) => update(d => {
    const section = d.sections.find(item => item.id === id);
    if (section) mutate(section, d.sections);
  });
  const moveSection = (id: string, direction: -1 | 1) => setSection(id, (_section, sections) => {
    const index = sections.findIndex(item => item.id === id);
    const destination = index + direction;
    if (destination < 0 || destination >= sections.length) return;
    [sections[index], sections[destination]] = [sections[destination], sections[index]];
  });
  const reorderSection = (sourceId: string, targetId: string) => update(d => {
    const sourceIndex = d.sections.findIndex(section => section.id === sourceId);
    const targetIndex = d.sections.findIndex(section => section.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const [moved] = d.sections.splice(sourceIndex, 1);
    d.sections.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, moved);
  });
  const allSections = value.sections;
  const selectedSection = allSections.find(section => section.id === activeSection) || allSections[0];
  const entries = plan.sections.flatMap(section => section.entries.map(entry => ({ ...entry, sectionTitle: section.title })));
  const hiddenCount = allSections.filter(section => !section.visible).length;

  return <aside className="resume-design-panel" aria-label="Résumé design controls" data-guide="resume-design">
    <header className="rdp-header"><div><span className="rdp-kicker">DESIGN SYSTEM</span><h2>Make it yours</h2><p>Changes affect presentation. Your résumé facts stay intact.</p></div>
      {!hideHistory && <div className="rdp-history"><button type="button" onClick={() => restore(historyIndex - 1)} disabled={historyIndex <= 0} aria-label="Undo design change">↶</button><button type="button" onClick={() => restore(historyIndex + 1)} disabled={historyIndex >= history.length - 1} aria-label="Redo design change">↷</button></div>}
    </header>

    <section className="rdp-quick" aria-label="Quick design controls">
      <label>Body font<select value={value.typography.bodyFont} onChange={e => setTypography('bodyFont', e.target.value)}>{RESUME_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
      <label>Heading font<select value={value.typography.headingFont} onChange={e => setTypography('headingFont', e.target.value)}>{RESUME_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
      <label>Page<select value={value.pageSize} onChange={e => update(d => { d.pageSize = e.target.value as ResumeDesignConfig['pageSize']; })}>{selectOptions(['A4', 'LETTER'])}</select></label>
      <label>Section spacing<select value={value.layout.sectionGap <= 8 ? 'compact' : value.layout.sectionGap >= 16 ? 'spacious' : 'balanced'} onChange={e => setLayout('sectionGap', e.target.value === 'compact' ? 8 : e.target.value === 'spacious' ? 16 : 11)}>{selectOptions(['compact', 'balanced', 'spacious'])}</select></label>
    </section>

        {warnings.length > 0 && <div className="rdp-warnings" role="status"><strong>Readability checks</strong><ul>{warnings.map((warning, i) => <li key={i}>{typeof warning === 'string' ? warning : JSON.stringify(warning)}</li>)}</ul><p>Colors remain as selected. Adjust them in the controls to address a contrast warning.</p></div>}
    <div className="rdp-groups">
      <details open><summary>Type <span>Font, scale and rhythm</span></summary><div className="rdp-fields">
        <label>Body size <NumberField min={7} max={18} step={0.5} value={value.typography.bodySize} onCommit={n => n !== undefined && setTypography('bodySize', n)} /> <small>pt</small></label>
        <label>Body weight<select value={value.typography.bodyWeight} onChange={e => setTypography('bodyWeight', Number(e.target.value))}><option value={400}>Regular</option><option value={700}>Bold</option></select></label>
        <label>Name size <NumberField min={16} max={48} value={value.typography.nameSize} onCommit={n => n !== undefined && setTypography('nameSize', n)} /> <small>pt</small></label>
        <label>Heading size <NumberField min={8} max={24} step={0.5} value={value.typography.headingSize} onCommit={n => n !== undefined && setTypography('headingSize', n)} /> <small>pt</small></label>
        <label>Heading weight<select value={value.typography.headingWeight} onChange={e => setTypography('headingWeight', Number(e.target.value))}><option value={400}>Regular</option><option value={700}>Bold</option></select></label>
        <label>Role size <NumberField min={7} max={18} step={0.5} value={value.typography.roleSize} onCommit={n => n !== undefined && setTypography('roleSize', n)} /> <small>pt</small></label>
        <label>Contact size <NumberField min={7} max={16} step={0.5} value={value.typography.contactSize} onCommit={n => n !== undefined && setTypography('contactSize', n)} /> <small>pt</small></label>
        <label>Line height <NumberField min={1} max={2} step={0.05} value={value.typography.lineHeight} onCommit={n => n !== undefined && setTypography('lineHeight', n)} /></label>
        <label>Letter spacing <NumberField min={-1} max={3} step={0.1} value={value.typography.letterSpacing} onCommit={n => n !== undefined && setTypography('letterSpacing', n)} /> <small>pt</small></label>
        <label>Heading case<select value={value.typography.headingCase} onChange={e => setTypography('headingCase', e.target.value)}>{selectOptions(['normal', 'uppercase'])}</select></label>
      </div></details>

      <details><summary>Color <span>Six independent color roles</span></summary>
        <div className="rdp-palette-presets" role="group" aria-label="Color presets">{RESUME_DESIGN_COLOR_PRESETS.map(preset => <button key={preset.name} type="button" onClick={() => update(d => { d.colors = { ...preset.colors }; })}>{preset.name}</button>)}</div>
        <div className="rdp-colors">{COLOR_FIELDS.filter(field => !compositionLocked || !['rail', 'railInk'].includes(field)).map(field => <label key={field}><span>{COLOR_LABELS[field]}</span><input type="color" aria-label={COLOR_LABELS[field]} value={value.colors[field]} onChange={e => update(d => { d.colors[field] = e.target.value; })} /><HexField label={COLOR_LABELS[field]} value={value.colors[field]} onCommit={color => update(d => { d.colors[field] = color; })} /></label>)}</div>

      </details>

      <details><summary>Layout <span>Composition and page flow</span></summary><div className="rdp-fields">
        {!compositionLocked && <><label>Columns<select value={value.layout.columns} onChange={e => setLayout('columns', Number(e.target.value))}>{selectOptions(['1', '2'])}</select></label>
        <label>Rail side<select value={value.layout.railSide} onChange={e => setLayout('railSide', e.target.value)}>{selectOptions(['left', 'right'])}</select></label>
        <label>Rail width<NumberField min={20} max={45} value={value.layout.railWidth} onCommit={n => n !== undefined && setLayout('railWidth', n)} /> <small>%</small></label>
        <label>Header<select value={value.layout.headerStyle} onChange={e => setLayout('headerStyle', e.target.value)}>{selectOptions(['left', 'center', 'split', 'band'])}</select></label>
        <label>Section headings<select value={value.layout.headingStyle} onChange={e => setLayout('headingStyle', e.target.value)}>{selectOptions(['plain', 'rule', 'box', 'bar', 'numbered'])}</select></label></>}
        <label>Role order<select value={value.layout.companyFirst ? 'company' : 'role'} onChange={e => setLayout('companyFirst', e.target.value === 'company')}>{selectOptions(['role', 'company'])}</select></label>
        <label>Dates<select value={value.layout.dates} onChange={e => setLayout('dates', e.target.value)}>{selectOptions(['inline', 'below'])}</select></label>
        <label>Bullets<select value={value.layout.bullet} onChange={e => setLayout('bullet', e.target.value)}>{selectOptions(['disc', 'dash', 'none'])}</select></label>
        {!compositionLocked && <><label>Rule width<NumberField min={0} max={5} step={0.25} value={value.layout.ruleWidth} onCommit={n => n !== undefined && setLayout('ruleWidth', n)} /> <small>pt</small></label>
        <label className="rdp-check"><input type="checkbox" checked={value.layout.showMotif} onChange={e => setLayout('showMotif', e.target.checked)} /> Show template motif</label></>}
      </div>
      {compositionLocked && <p className="rdp-muted">Signature uses one content sequence with section labels. Header, rail and decorative heading controls belong to other layouts.</p>}
      <fieldset className="rdp-margins"><legend>Page margins · mm</legend>{(['top', 'right', 'bottom', 'left'] as const).map(edge => <label key={edge}>{edge}<NumberField min={5} max={40} value={value.layout.margins[edge]} onCommit={n => n !== undefined && update(d => { d.layout.margins[edge] = n; })} /></label>)}</fieldset>
      <div className="rdp-fields">{!compositionLocked && <label>Column gap<NumberField min={6} max={36} value={value.layout.columnGap} onCommit={n => n !== undefined && setLayout('columnGap', n)} /> <small>pt</small></label>}<label>Section gap<NumberField min={0} max={30} value={value.layout.sectionGap} onCommit={n => n !== undefined && setLayout('sectionGap', n)} /> <small>pt</small></label><label>Entry gap<NumberField min={0} max={24} value={value.layout.entryGap} onCommit={n => n !== undefined && setLayout('entryGap', n)} /> <small>pt</small></label><label>Bullet gap<NumberField min={0} max={12} value={value.layout.bulletGap} onCommit={n => n !== undefined && setLayout('bulletGap', n)} /> <small>pt</small></label></div></details>

      <details><summary>Sections &amp; Pages <span>Order, visibility and breaks</span></summary>
        <div className="rdp-section-list"><p className="rdp-muted">Drag sections or use the arrows to reorder them. Hidden sections retain all source content.</p>{allSections.map((section, index) => <div className={`rdp-section-row${draggedSectionId && draggedSectionId !== section.id ? ' is-drop-target' : ''}`} key={section.id} onDragOver={event => { if (draggedSectionId) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); const validIds = new Set(value.sections.map(item => item.id)); if (sourceId !== section.id && validIds.has(sourceId) && validIds.has(section.id)) reorderSection(sourceId, section.id); setDraggedSectionId(null); }}>
          <button className="rdp-drag-handle" type="button" draggable onDragStart={event => { event.dataTransfer.setData('text/plain', section.id); event.dataTransfer.effectAllowed = 'move'; setDraggedSectionId(section.id); }} onDragEnd={() => setDraggedSectionId(null)} aria-label={`Drag ${section.title} to reorder`} title="Drag to reorder">⠿</button>
          <button className="rdp-section-name" type="button" onClick={() => setActiveSection(section.id)} aria-pressed={selectedSection?.id === section.id}>{section.title}</button>
          <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} aria-label={`Move ${section.title} up`}>↑</button><button type="button" onClick={() => moveSection(section.id, 1)} disabled={index === allSections.length - 1} aria-label={`Move ${section.title} down`}>↓</button>
          {!compositionLocked && <select aria-label={`${section.title} region`} value={section.region} onChange={e => setSection(section.id, item => { item.region = e.target.value as ResumeDesignSection['region']; })}>{selectOptions(['main', 'rail'])}</select>}
          <button type="button" aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.title}`} aria-pressed={section.visible} onClick={() => setSection(section.id, item => { item.visible = !item.visible; })}>{section.visible ? 'Shown' : 'Hidden'}</button>
        </div>)}</div>
        {selectedSection && <div className="rdp-fields rdp-selected-section"><label>Rename section<input value={selectedSection.title} onChange={e => setSection(selectedSection.id, item => { item.title = e.target.value; })} /></label><label>Section body font<select value={selectedSection.typography?.bodyFont || ''} onChange={e => setSection(selectedSection.id, item => { item.typography = { ...item.typography }; if (e.target.value) item.typography.bodyFont = e.target.value as ResumeDesignConfig['typography']['bodyFont']; else delete item.typography.bodyFont; })}><option value="">Use global font</option>{RESUME_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label><label>Section heading font<select value={selectedSection.typography?.headingFont || ''} onChange={e => setSection(selectedSection.id, item => { item.typography = { ...item.typography }; if (e.target.value) item.typography.headingFont = e.target.value as ResumeDesignConfig['typography']['headingFont']; else delete item.typography.headingFont; })}><option value="">Use global font</option>{RESUME_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label><label>Section body size<NumberField min={7} max={18} step={0.5} value={selectedSection.typography?.bodySize} placeholder={`${value.typography.bodySize} default`} onCommit={n => setSection(selectedSection.id, item => { item.typography = { ...item.typography, bodySize: n }; })} /></label><label>Section heading size<NumberField min={8} max={24} step={0.5} value={selectedSection.typography?.headingSize} placeholder={`${value.typography.headingSize} default`} onCommit={n => setSection(selectedSection.id, item => { item.typography = { ...item.typography, headingSize: n }; })} /></label><label>Section role size<NumberField min={7} max={18} step={0.5} value={selectedSection.typography?.roleSize} placeholder={`${value.typography.roleSize} default`} onCommit={n => setSection(selectedSection.id, item => { item.typography = { ...item.typography, roleSize: n }; })} /></label><label>Section line height<NumberField min={1} max={2} step={0.05} value={selectedSection.typography?.lineHeight} placeholder={`${value.typography.lineHeight} default`} onCommit={n => setSection(selectedSection.id, item => { item.typography = { ...item.typography, lineHeight: n }; })} /></label><label className="rdp-check"><input type="checkbox" checked={selectedSection.breakBefore} onChange={e => setSection(selectedSection.id, item => { item.breakBefore = e.target.checked; })} /> Start section on new page</label></div>}
        <label className="rdp-check rdp-continuation"><input type="checkbox" checked={value.continuationHeader} onChange={e => update(d => { d.continuationHeader = e.target.checked; })} /> Repeat identity on continuation pages</label>
        <div className="rdp-breaks"><strong>Start an entry on a new page</strong>{entries.length ? entries.map(entry => <label key={entry.id}><input type="checkbox" checked={value.breakBeforeEntries.includes(entry.id)} onChange={e => update(d => { d.breakBeforeEntries = e.target.checked ? [...d.breakBeforeEntries, entry.id] : d.breakBeforeEntries.filter(id => id !== entry.id); })} />{entry.title || entry.subtitle || entry.text?.slice(0, 100) || entry.sectionTitle}</label>) : <p className="rdp-muted">No entries available.</p>}</div>
        {hiddenCount > 0 && <p className="rdp-hidden-note" role="status">{hiddenCount} hidden {hiddenCount === 1 ? 'section remains' : 'sections remain'} in the résumé and can be shown again.</p>}
      </details>
    </div>
    <footer className="rdp-footer"><button type="button" onClick={() => { onReset?.(); }}>Reset design</button>{onUseLegacy && <button type="button" onClick={onUseLegacy}>Use original template</button>}</footer>
  </aside>;
}

export default ResumeDesignPanel;
