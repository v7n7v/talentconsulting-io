'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import {
  getSelectableTemplates,
  getDefaultPaletteId,
  getTemplateWithPalette,
  type AtsClassification,
  type ResumeTemplateMetadata,
} from '@/lib/resume-templates';
import { RESUME_TEMPLATE_FIXTURES } from '@/lib/resume-templates/fixtures';
import { ResumeTemplate } from '@/components/resume-templates';
import { createResumeDesign, RESUME_DESIGN_FAMILIES, RESUME_DESIGN_PRESETS, type ResumeTemplateFamily } from '@/lib/resume-design';
import './resume-template-browser.css';

export interface ResumeTemplateBrowserProps {
  compact?: boolean;
  selectedTemplateId: string;
  hasProAccess: boolean;
  loadingAccess?: boolean;
  onSelect: (templateId: string) => void;
  onBrowse?: () => void;
  resume?: CanonicalResume;
}

const ATS_FILTERS: Array<'All' | AtsClassification> = [
  'All',
  'ATS-first',
  'ATS-conscious',
  'Human-first',
];
const DESIGN_FAMILIES: Array<'All' | ResumeTemplateFamily> = ['All', 'foundation', 'outcomes', 'specialized', 'editorial'];

function TemplateCard({
  template,
  selected,
  locked,
  accessLoading,
  resume,
  family,
  onSelect,
}: {
  template: ResumeTemplateMetadata;
  selected: boolean;
  locked: boolean;
  accessLoading: boolean;
  resume?: CanonicalResume;
  family: ResumeTemplateFamily;
  onSelect: (templateId: string) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const palette = getTemplateWithPalette(template, getDefaultPaletteId(template.id));
  const previewResume = resume || RESUME_TEMPLATE_FIXTURES.sparse;
  const design = createResumeDesign(template.id, previewResume, palette.colors);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (!width) return;
      const nextScale = width / 793.7;
      setPreviewScale(current => Math.abs(current - nextScale) < 0.001 ? current : nextScale);
    });
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  return (
    <article className={`resume-template-card${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}>
      <div className="resume-template-card__heading">
        <div className="resume-template-card__title-wrap">
          <div className="resume-template-card__title-line">
            <h3>{template.name}</h3>
            {selected && <span className="resume-template-card__selected-mark">Selected</span>}
          </div>
          <p>{template.description}</p>
        </div>
        <span className={`resume-template-card__badge${locked ? ' is-standard' : ''}`}>
          {locked ? 'Standard' : template.atsClassification}
        </span>
      </div>

      <div ref={previewRef} className="resume-template-preview" aria-label={`${template.name} resume preview`}>
        <div className="resume-template-preview__page" style={{ transform: `scale(${previewScale})` }}>
          <ResumeTemplate
            resume={previewResume}
            templateId={template.id}
            colors={palette.colors}
            design={design}
          />
        </div>
      </div>

      {!resume && <p className="resume-template-card__sample-note">Fictional sample · your draft stays untouched</p>}
      {resume && <p className="resume-template-card__sample-note">Preview of your resume</p>}

      <div className="resume-template-card__footer">
        <div className="resume-template-card__meta">
            <span>{RESUME_DESIGN_FAMILIES[family]}</span>
          <span>{template.structure.columns === 1 ? 'Single column' : 'Two column'}</span>
        </div>
        <button
          type="button"
          className="resume-template-card__select"
          aria-pressed={selected}
          disabled={locked || accessLoading}
          onClick={() => onSelect(template.id)}
        >
          {accessLoading
            ? 'Checking access…'
            : locked
              ? 'Available with Standard'
              : `${resume ? 'Apply' : 'Use'} ${template.name}`}
        </button>
      </div>
    </article>
  );
}

export function ResumeTemplateBrowser({
  compact = false,
  selectedTemplateId,
  hasProAccess,
  loadingAccess = false,
  onSelect,
  onBrowse,
  resume,
}: ResumeTemplateBrowserProps) {
  const [category, setCategory] = useState('All styles');
  const [ats, setAts] = useState<(typeof ATS_FILTERS)[number]>('All');
  const [family, setFamily] = useState<(typeof DESIGN_FAMILIES)[number]>('All');
  const templates = useMemo(() => getSelectableTemplates(), []);
  const categories = useMemo(() => ['All styles', ...new Set(templates.map(template => template.category))], [templates]);
  const filteredTemplates = templates.filter(template =>
    (category === 'All styles' || template.category === category)
      && (ats === 'All' || template.atsClassification === ats),
  ).filter(template => family === 'All' || RESUME_DESIGN_PRESETS[template.id]?.family === family);
  const visibleTemplates = compact ? templates.slice(0, 3) : filteredTemplates;

  return (
    <section className={`resume-template-browser${compact ? ' is-compact' : ' is-full'}`} aria-labelledby="resume-template-browser-title" data-guide="resume-design">
      <div className="resume-template-browser__top">
        <div>
          <p className="resume-template-browser__eyebrow">Resume design</p>
          <h2 id="resume-template-browser-title">Choose a template</h2>
          <p className="resume-template-browser__intro">
            {resume ? 'See your experience in each style.' : 'Preview real layouts with a fictional sample.'}
          </p>
        </div>
        {compact && onBrowse && (
          <button type="button" className="resume-template-browser__browse" onClick={onBrowse}>
            Browse all <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      {!compact && (
        <div className="resume-template-browser__filters" aria-label="Filter templates">
          <label>
            <span>Style</span>
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {categories.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Family</span>
            <select value={family} onChange={event => setFamily(event.target.value as (typeof DESIGN_FAMILIES)[number])}>
              {DESIGN_FAMILIES.map(item => <option key={item} value={item}>{item === 'All' ? 'All families' : RESUME_DESIGN_FAMILIES[item]}</option>)}
            </select>
          </label>
          <label>
            <span>ATS fit</span>
            <select value={ats} onChange={event => setAts(event.target.value as (typeof ATS_FILTERS)[number])}>
              {ATS_FILTERS.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <p>{filteredTemplates.length} templates</p>
        </div>
      )}

      <div className="resume-template-browser__grid">
        {visibleTemplates.map(template => {
          const locked = template.tier === 'pro' && !hasProAccess;
          return (
            <TemplateCard
              key={template.id}
              template={template}
              selected={selectedTemplateId === template.id}
              locked={locked}
              accessLoading={loadingAccess}
              resume={resume}
              family={RESUME_DESIGN_PRESETS[template.id]?.family || 'foundation'}
              onSelect={onSelect}
            />
          );
        })}
      </div>
      {loadingAccess && <p className="resume-template-browser__status" role="status">Checking template access…</p>}
      {!compact && visibleTemplates.length === 0 && <p className="resume-template-browser__empty">No templates match these filters.</p>}
    </section>
  );
}

export default ResumeTemplateBrowser;
