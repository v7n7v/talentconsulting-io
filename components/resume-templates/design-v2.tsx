'use client';
import React from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import type { ResumeDesignConfig, ResumeDocumentPlan, ResumeDocumentSection } from '@/lib/resume-design/types';
import { buildResumeDocumentPlan, getApplicationResumeDesign, shouldUseStackedResumeHeader } from '@/lib/resume-design';
import './design-v2.css';

function SectionContent({ section, design, isRail = false, sectionNumber = 1 }: { section: ResumeDocumentSection; design: ResumeDesignConfig; isRail?: boolean; sectionNumber?: number }) {
  const t = section.typography ? { ...design.typography, ...section.typography } : design.typography;
  return <section className={`resume-v2-section heading-${design.layout.headingStyle}${section.breakBefore ? ' resume-v2-break-before' : ''}`} style={{ marginBottom: `${design.layout.sectionGap}pt`, fontFamily: fontLabel(t.bodyFont), fontSize: `${t.bodySize}pt`, fontWeight: t.bodyWeight, lineHeight: t.lineHeight, ['--resume-heading' as string]: `'${fontLabel(t.headingFont)}', sans-serif`, ['--resume-heading-size' as string]: `${t.headingSize}pt`, ['--resume-role-size' as string]: `${t.roleSize}pt`, ['--resume-heading-weight' as string]: t.headingWeight, ['--resume-body-size' as string]: `${t.bodySize}pt`, ['--resume-ink' as string]: isRail ? design.colors.railInk : design.colors.ink, ['--resume-heading-color' as string]: isRail ? design.colors.railInk : design.colors.heading, ['--resume-letter-spacing' as string]: `${t.letterSpacing}pt`, ['--resume-rule-width' as string]: `${design.layout.ruleWidth}pt`, ['--resume-box-fill' as string]: design.colors.rail }}>
    <h2 style={{ textTransform: t.headingCase === 'uppercase' ? 'uppercase' : 'none', fontWeight: t.headingWeight }}>{design.layout.headingStyle === 'numbered' ? `${sectionNumber}. ` : ''}{section.title}</h2>
    {section.kind === 'summary' && section.entries.map((entry) => <p className={design.breakBeforeEntries.includes(entry.id) ? 'resume-v2-break-before' : undefined} key={entry.id}>{entry.text}</p>)}
    {section.kind === 'experience' && section.entries.map((entry) => <article className={`resume-v2-entry${design.breakBeforeEntries.includes(entry.id) ? ' resume-v2-break-before' : ''}`} key={entry.id}>
      <div className="resume-v2-entry-heading"><strong style={{ fontSize: `${t.roleSize}pt` }}>{entry.title}</strong>{design.layout.dates === 'inline' && entry.date && <span>{entry.date}</span>}</div>
      {entry.subtitle && <div className="resume-v2-subtitle">{entry.subtitle}</div>}
      {design.layout.dates === 'below' && entry.date && <div className="resume-v2-date">{entry.date}</div>}
      {entry.text && <p>{entry.text}</p>}{entry.bullets.length > 0 && <ul className={`bullet-${design.layout.bullet}`}>{entry.bullets.map((bullet, i) => <li key={`${entry.id}-${i}`}>{bullet}</li>)}</ul>}
    </article>)}
    {['education', 'certifications', 'additional'].includes(section.kind) && section.entries.map((entry) => <article className={`resume-v2-entry${design.breakBeforeEntries.includes(entry.id) ? ' resume-v2-break-before' : ''}`} key={entry.id}><div className="resume-v2-entry-heading">{entry.title && <strong style={{ fontSize: `${t.roleSize}pt` }}>{entry.title}</strong>}{design.layout.dates === 'inline' && entry.date && <span>{entry.date}</span>}</div>{entry.subtitle && <div className="resume-v2-subtitle">{entry.subtitle}</div>}{design.layout.dates === 'below' && entry.date && <div className="resume-v2-date">{entry.date}</div>}{entry.text && <p>{entry.text}</p>}{entry.bullets.map((bullet, i) => <p key={i}>{bullet}</p>)}</article>)}
    {section.kind === 'skills' && section.entries.map((entry) => <p className={`resume-v2-skill${design.breakBeforeEntries.includes(entry.id) ? ' resume-v2-break-before' : ''}`} key={entry.id}><strong style={{ fontSize: `${t.roleSize}pt` }}>{entry.title}: </strong>{entry.text || entry.bullets.join(' · ')}</p>)}
  </section>;
}

export function ResumeDesignHTML({ resume, design, mode = 'designed' }: { resume: CanonicalResume; design: ResumeDesignConfig; mode?: 'designed' | 'application' }) {
  const plan = buildResumeDocumentPlan(resume, design) as ResumeDocumentPlan;
  const resolved = plan.design;
  const app = mode === 'application';
  const d = app ? getApplicationResumeDesign(resolved) : resolved;
  const headerStyle = shouldUseStackedResumeHeader(d, plan.name, plan.contact) ? 'left' : d.layout.headerStyle;
  const main = app || d.layout.columns === 1 ? plan.sections : plan.sections.filter((s) => s.region === 'main' && s.visible);
  const rail = app || d.layout.columns === 1 ? [] : plan.sections.filter((s) => s.region === 'rail' && s.visible);
  const columns = d.layout.columns === 2 && rail.length > 0 ? 2 : 1;
  const numbered = d.layout.railSide === 'left' && d.layout.columns === 2 && !app ? [...rail, ...main] : [...main, ...rail];
  const sectionNumbers = new Map(numbered.map((section, index) => [section.id, index + 1]));
  return <main className={`resume-v2-page header-${headerStyle} paper-${mode}`} style={{
    width: d.pageSize === 'A4' ? '210mm' : '8.5in', minHeight: d.pageSize === 'A4' ? '297mm' : '11in',
    padding: `${d.layout.margins.top}mm ${d.layout.margins.right}mm ${d.layout.margins.bottom}mm ${d.layout.margins.left}mm`,
    color: d.colors.ink, backgroundColor: mode === 'application' ? '#ffffff' : d.colors.paper,
    fontFamily: `var(--resume-body)`, fontSize: `${d.typography.bodySize}pt`, fontWeight: d.typography.bodyWeight, lineHeight: d.typography.lineHeight,
    ['--resume-body' as string]: `'${fontLabel(d.typography.bodyFont)}', sans-serif`, ['--resume-heading' as string]: `'${fontLabel(d.typography.headingFont)}', sans-serif`,
    ['--resume-heading-color' as string]: d.colors.heading, ['--resume-header-ink' as string]: d.layout.headerStyle === 'band' && mode === 'designed' ? d.colors.paper : d.colors.heading, ['--resume-contact-ink' as string]: d.layout.headerStyle === 'band' && mode === 'designed' ? d.colors.paper : d.colors.ink, ['--resume-accent' as string]: d.colors.accent, ['--resume-rail' as string]: d.colors.rail, ['--resume-rail-ink' as string]: d.colors.railInk,
    ['--resume-rail-width' as string]: `${d.layout.railWidth}%`, ['--resume-name-size' as string]: `${d.typography.nameSize}pt`, ['--resume-title-size' as string]: `${d.typography.headingSize}pt`, ['--resume-contact-size' as string]: `${d.typography.contactSize}pt`, ['--resume-heading-weight' as string]: d.typography.headingWeight, ['--resume-letter-spacing' as string]: `${d.typography.letterSpacing}pt`, ['--resume-rule-width' as string]: `${d.layout.ruleWidth}pt`, ['--resume-box-fill' as string]: d.colors.rail, ['--resume-gap' as string]: `${d.layout.columnGap}pt`, ['--resume-section-gap' as string]: `${d.layout.sectionGap}pt`, ['--resume-entry-gap' as string]: `${d.layout.entryGap}pt`, ['--resume-bullet-gap' as string]: `${d.layout.bulletGap}pt`, ['--resume-page-side' as string]: `${d.layout.margins.left}mm`,
  } as React.CSSProperties}>
    <header className="resume-v2-header"><h1 style={{ fontWeight: d.typography.headingWeight }}>{plan.name}</h1>{d.layout.showMotif && <span className="resume-v2-motif" aria-hidden="true" />}{plan.title && <div className="resume-v2-title" style={{ fontWeight: d.typography.headingWeight }}>{plan.title}</div>}<address style={{ fontWeight: d.typography.bodyWeight }}>{plan.contact.join(' · ')}</address></header>
    <div className={`resume-v2-columns columns-${columns} rail-${d.layout.railSide}`}>
      <div className="resume-v2-main">{main.map((s, i) => <SectionContent key={s.id} section={s} design={d} sectionNumber={sectionNumbers.get(s.id) || i + 1} />)}</div>
      {d.layout.columns === 2 && rail.length > 0 && <aside>{rail.map((s, i) => <SectionContent key={s.id} section={s} design={d} isRail sectionNumber={sectionNumbers.get(s.id) || i + 1} />)}</aside>}
    </div>
  </main>;
}
function fontLabel(id: string) { return ({ inter: 'Inter', 'liberation-sans': 'Liberation Sans', 'liberation-serif': 'Liberation Serif', 'liberation-mono': 'Liberation Mono', 'dejavu-sans': 'DejaVu Sans', 'dejavu-serif': 'DejaVu Serif' } as Record<string,string>)[id] || 'Inter'; }
