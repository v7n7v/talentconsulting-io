import React from 'react';
import type { CSSProperties } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { buildResumeDocumentPlan, getApplicationResumeDesign, RESUME_FONTS } from '@/lib/resume-design';
import { measureBundledText } from '@/lib/resume-design/font-metrics';
import { wrapContactLines, wrapLongTokens } from '@/lib/resume-design/text-layout';
import type { ResumeDesignConfig, ResumeDocumentPlan, ResumeDocumentSection, ResumeFontId } from '@/lib/resume-design/types';
import './index.css';

export type ResumeFlagshipMode = 'designed' | 'application';
export interface ResumeFlagshipHTMLProps {
  resume: CanonicalResume;
  design: ResumeDesignConfig;
  mode?: ResumeFlagshipMode;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string) => void;
}

const PT_PER_MM = 72 / 25.4;
const GUTTER_WIDTH_PT = 62;
const GUTTER_GAP_PT = 14;
const fontLabel = (id: ResumeFontId) => RESUME_FONTS.find(font => font.id === id)?.label || 'Inter';
const textWidth = (pagePt: number, margins: ResumeDesignConfig['layout']['margins']) => Math.max(1, pagePt - (margins.left + margins.right) * PT_PER_MM);
const cssSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

function presentText(value: string, widthPt: number, size: number, font: ResumeFontId, weight: 400 | 700, tracking: number) {
  return wrapLongTokens(value, widthPt, size, font, weight, tracking);
}

function SectionBody({ section, design, mode, selectedSectionId, onSelectSection, sectionNumber, contentWidthPt }: {
  section: ResumeDocumentSection;
  design: ResumeDesignConfig;
  mode: ResumeFlagshipMode;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string) => void;
  sectionNumber: number;
  contentWidthPt: number;
}) {
  const typography = { ...design.typography, ...section.typography };
  const title = `${design.layout.headingStyle === 'numbered' ? `${sectionNumber}. ` : ''}${section.title}`;
  const titleText = typography.headingCase === 'uppercase' ? title.toLocaleUpperCase() : title;
  const labelIsLong = mode === 'designed' && measureBundledText(typography.headingFont, typography.headingWeight, titleText, typography.headingSize, typography.letterSpacing) > GUTTER_WIDTH_PT * 1.65;
  const bodyWidthPt = mode === 'application' || labelIsLong ? contentWidthPt : Math.max(1, contentWidthPt - GUTTER_WIDTH_PT - GUTTER_GAP_PT);
  const selectable = Boolean(onSelectSection);
  const selected = selectable && selectedSectionId === section.id;
  const sectionDomId = `flagship-section-${cssSafeId(section.id)}`;
  const sectionHeadingId = `${sectionDomId}-heading`;
  const bodyStyle = {
    '--section-body-font': `'${fontLabel(typography.bodyFont)}'`,
    '--section-heading-font': `'${fontLabel(typography.headingFont)}'`,
    '--section-body-size': `${typography.bodySize}pt`,
    '--section-heading-size': `${typography.headingSize}pt`,
    '--section-role-size': `${typography.roleSize}pt`,
    '--section-body-weight': typography.bodyWeight,
    '--section-heading-weight': typography.headingWeight,
    '--section-line-height': typography.lineHeight,
    '--section-tracking': `${typography.letterSpacing}pt`,
    '--section-gap': `${design.layout.sectionGap}pt`,
    '--entry-gap': `${design.layout.entryGap}pt`,
    '--bullet-gap': `${design.layout.bulletGap}pt`,
    '--section-ink': mode === 'application' ? design.colors.ink : design.colors.ink,
    '--section-heading-ink': design.colors.heading,
    '--section-accent': design.colors.accent,
  } as CSSProperties;
  const headingButton = selectable
    ? <button className="flagship-label-button" type="button" aria-label={`Select ${section.title} section for design controls`} aria-pressed={Boolean(selected)} aria-controls={`${sectionDomId}-content`} onClick={() => onSelectSection?.(section.id)}>{titleText}</button>
    : <span>{titleText}</span>;
  const heading = <h2 className="flagship-section-heading" id={sectionHeadingId}>{headingButton}<span className="flagship-print-label" aria-hidden="true">{titleText}</span></h2>;
  const longHeading = labelIsLong || mode === 'application';
  const content = <div className="flagship-section-content" id={`${sectionDomId}-content`} aria-labelledby={sectionHeadingId}>
    {section.kind === 'summary' && section.entries.map(entry => <p className="flagship-summary" key={entry.id}>{presentText(entry.text || '', bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</p>)}
    {section.kind === 'experience' && section.entries.map(entry => {
      const entryBreak = design.breakBeforeEntries.includes(entry.id);
      const hasInlineDate = Boolean(entry.date && design.layout.dates === 'inline');
      const dateWidth = hasInlineDate ? Math.min(bodyWidthPt * 0.32, Math.max(54, measureBundledText(typography.bodyFont, typography.bodyWeight, entry.date || '', typography.bodySize, typography.letterSpacing) + 4)) : 0;
      const metadataWidth = hasInlineDate ? Math.max(1, bodyWidthPt - dateWidth - 12) : bodyWidthPt;
      return <article className={`flagship-entry${entryBreak ? ' flagship-entry-break' : ''}`} key={entry.id}>
        <div className={`flagship-entry-meta${hasInlineDate ? ' is-inline-date' : ''}`} style={hasInlineDate ? { gridTemplateColumns:`minmax(0,1fr) ${dateWidth}pt` } : undefined}>
          <div className="flagship-entry-identifiers">
            {entry.title && <div className="flagship-entry-primary">{presentText(entry.title, metadataWidth, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</div>}
            {entry.subtitle && <div className="flagship-entry-secondary">{presentText(entry.subtitle, metadataWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</div>}
          </div>
          {entry.date && design.layout.dates === 'inline' && <time className="flagship-entry-date is-inline">{presentText(entry.date, dateWidth, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</time>}
        </div>
        {entry.date && design.layout.dates === 'below' && <time className="flagship-entry-date">{presentText(entry.date, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</time>}
        {entry.text && <p className="flagship-entry-text">{presentText(entry.text, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</p>}
        {entry.bullets.length > 0 && <ul className={`flagship-bullets bullet-${design.layout.bullet}`}>{entry.bullets.map((bullet, index) => <li key={`${entry.id}-bullet-${index}`}>{presentText(bullet, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</li>)}</ul>}
      </article>;
    })}
    {['education', 'certifications', 'additional'].includes(section.kind) && section.entries.map((entry, index) => {
      const entryBreak = design.breakBeforeEntries.includes(entry.id);
      return <article className={`flagship-entry${entryBreak ? ' flagship-entry-break' : ''}`} key={entry.id}>
        {section.kind === 'additional' && section.entries.length > 4 && index > 0 && <span className={`flagship-additional-context${longHeading ? ' is-inline' : ' is-gutter'}`}>{section.title}</span>}
        {(entry.title || entry.subtitle) && <div className="flagship-entry-identifiers">
          {entry.title && <div className="flagship-entry-primary">{presentText(entry.title, bodyWidthPt, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</div>}
          {entry.subtitle && <div className="flagship-entry-secondary">{presentText(entry.subtitle, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</div>}
        </div>}
        {entry.date && <time className={`flagship-entry-date${design.layout.dates === 'inline' && entry.title ? ' after-identifiers' : ''}`}>{presentText(entry.date, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</time>}
        {entry.text && <p className="flagship-entry-text">{presentText(entry.text, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</p>}
        {entry.bullets.length > 0 && <ul className={`flagship-bullets bullet-${design.layout.bullet}`}>{entry.bullets.map((bullet, index) => <li key={`${entry.id}-bullet-${index}`}>{presentText(bullet, bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}</li>)}</ul>}
      </article>;
    })}
    {section.kind === 'skills' && section.entries.map(entry => <p className={`flagship-skill${design.breakBeforeEntries.includes(entry.id) ? ' flagship-entry-break' : ''}`} key={entry.id}>
      <strong>{presentText(`${entry.title}:`, bodyWidthPt, typography.roleSize, typography.headingFont, 700, typography.letterSpacing)}</strong>{' '}
      {presentText(entry.text || entry.bullets.join(' · '), bodyWidthPt, typography.bodySize, typography.bodyFont, typography.bodyWeight, typography.letterSpacing)}
    </p>)}
  </div>;
  return <section className={`flagship-section${longHeading ? ' flagship-section-long-label' : ''}${selected ? ' is-selected' : ''}${onSelectSection ? ' is-selectable' : ''}${section.breakBefore ? ' flagship-section-break' : ''}`} style={bodyStyle} aria-labelledby={sectionHeadingId} data-resume-section-id={section.id} data-selected={selected ? 'true' : undefined} onClick={event => {
    if (!onSelectSection || (event.target as HTMLElement).closest('button')) return;
    onSelectSection(section.id);
  }}>
    {longHeading ? <>{heading}{content}</> : <div className="flagship-section-grid"><div className="flagship-section-label">{heading}</div>{content}</div>}
  </section>;
}

export function ResumeFlagshipHTML({ resume, design, mode = 'designed', selectedSectionId, onSelectSection }: ResumeFlagshipHTMLProps) {
  const plan = buildResumeDocumentPlan(resume, design);
  const d = mode === 'application' ? getApplicationResumeDesign(plan.design) : plan.design;
  const pageWidthPt = d.pageSize === 'A4' ? 595.276 : 612;
  const contentWidthPt = textWidth(pageWidthPt, d.layout.margins);
  const nameWidthPt = contentWidthPt;
  const contactText = wrapContactLines(plan.contact, contentWidthPt, d.typography.contactSize, d.typography.bodyFont, d.typography.bodyWeight, d.typography.letterSpacing);
  const pageVars = {
    '--flagship-paper': d.colors.paper,
    '--flagship-ink': d.colors.ink,
    '--flagship-heading': d.colors.heading,
    '--flagship-accent': d.colors.accent,
    '--flagship-gutter': `${GUTTER_WIDTH_PT}pt`,
    '--flagship-column-gap': `${GUTTER_GAP_PT}pt`,
    '--flagship-page-width': d.pageSize === 'A4' ? '210mm' : '8.5in',
    '--flagship-page-height': d.pageSize === 'A4' ? '297mm' : '11in',
    '--flagship-margin-top': `${d.layout.margins.top}mm`,
    '--flagship-margin-right': `${d.layout.margins.right}mm`,
    '--flagship-margin-bottom': `${d.layout.margins.bottom}mm`,
    '--flagship-margin-left': `${d.layout.margins.left}mm`,
    '--flagship-name-size': `${d.typography.nameSize}pt`,
    '--flagship-title-size': `${d.typography.headingSize}pt`,
    '--flagship-contact-size': `${d.typography.contactSize}pt`,
    '--flagship-body-size': `${d.typography.bodySize}pt`,
    '--flagship-name-font': `'${fontLabel(d.typography.headingFont)}'`,
    '--flagship-body-font': `'${fontLabel(d.typography.bodyFont)}'`,
    '--flagship-heading-font': `'${fontLabel(d.typography.headingFont)}'`,
    '--flagship-name-weight': d.typography.headingWeight,
    '--flagship-heading-weight': d.typography.headingWeight,
    '--flagship-body-weight': d.typography.bodyWeight,
    '--flagship-tracking': `${d.typography.letterSpacing}pt`,
    '--flagship-header-gap': `${d.layout.sectionGap}pt`,
  } as CSSProperties;
  const name = presentText(plan.name, nameWidthPt, d.typography.nameSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing);
  const title = plan.title ? presentText(plan.title, contentWidthPt, d.typography.headingSize, d.typography.headingFont, d.typography.headingWeight, d.typography.letterSpacing) : '';
  return <article className={`resume-flagship-page mode-${mode}`} style={pageVars} data-page-size={d.pageSize} aria-label={`${plan.name || 'Candidate'} résumé document`}>
    <header className="flagship-document-header">
      <h1>{name}</h1>
      {title && <p className="flagship-document-title">{title}</p>}
      {contactText && <address className="flagship-contact" aria-label="Contact information">{contactText}</address>}
    </header>
    <div className={`flagship-sections${mode === 'application' ? ' is-application' : ''}`}>
      {plan.sections.map((section, index) => <SectionBody key={section.id} section={section} design={d} mode={mode} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} sectionNumber={index + 1} contentWidthPt={contentWidthPt} />)}
    </div>
  </article>;
}
