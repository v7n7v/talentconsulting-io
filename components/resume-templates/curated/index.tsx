'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getRegisteredTemplate,
  type AtsClassification,
  type ResumeTemplateMetadata,
  type TemplateColors,
} from '@/lib/resume-templates/catalog';
import { requireResumeTemplateRegistryEntry } from '@/lib/resume-templates/registry';
import {
  cleanResumeText,
  type CanonicalEducation,
  type CanonicalExperience,
  type CanonicalResume,
  type CanonicalSkillGroup,
} from '@/lib/resume-normalizer';

export type CuratedSignatureTemplateId = (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number];

export interface CuratedSignatureTemplateProps {
  resume: CanonicalResume;
  templateId: CuratedSignatureTemplateId;
  colors: Pick<TemplateColors, 'primary' | 'accent' | 'text'>;
}

interface CuratedRendererProps {
  resume: CanonicalResume;
  colors: CuratedSignatureTemplateProps['colors'];
}

type CuratedRenderer = (props: CuratedRendererProps) => ReactNode;
type SectionName = 'Summary' | 'Experience' | 'Skills' | 'Education' | 'Certifications';

interface CompositionDefinition {
  composition: string;
  eyebrow: string;
  sectionMarker: string;
  bullet: string;
}

/**
 * These definitions are presentation-only. Structure, order, density, ATS mode,
 * typography, rules, experience, skills, contact, and motif classes are always
 * read from the catalog metadata.
 */
export const CURATED_COMPOSITIONS: Record<CuratedSignatureTemplateId, CompositionDefinition> = {
  'executive-ledger': { composition: 'linear-ledger', eyebrow: 'Leadership record', sectionMarker: 'I', bullet: '—' },
  'strategy-brief': { composition: 'memo-frame', eyebrow: 'Strategy memorandum', sectionMarker: '§', bullet: '→' },
  'product-signal': { composition: 'tabbed-signal', eyebrow: 'Product outcomes', sectionMarker: '+', bullet: '•' },
  'engineering-core': { composition: 'spec-stack', eyebrow: 'Engineering specification', sectionMarker: '//', bullet: '›' },
  'data-evidence': { composition: 'evidence-index', eyebrow: 'Evidence profile', sectionMarker: '#', bullet: '·' },
  'finance-standard': { composition: 'statement-ledger', eyebrow: 'Professional statement', sectionMarker: '00', bullet: '—' },
  'legal-brief': { composition: 'pleading-caption', eyebrow: 'Professional brief', sectionMarker: '¶', bullet: '•' },
  'healthcare-precision': { composition: 'credential-sheet', eyebrow: 'Clinical & operational profile', sectionMarker: '+', bullet: '•' },
  'academic-profile': { composition: 'journal-spread', eyebrow: 'Curriculum profile', sectionMarker: '§', bullet: '—' },
  'public-service': { composition: 'civic-record', eyebrow: 'Public service record', sectionMarker: '◆', bullet: '•' },
  'mission-impact': { composition: 'impact-band', eyebrow: 'Mission & community impact', sectionMarker: '○', bullet: '→' },
  'career-pivot': { composition: 'bridge-flow', eyebrow: 'Transferable experience', sectionMarker: '↗', bullet: '•' },
  'emerging-professional': { composition: 'launch-track', eyebrow: 'Professional profile', sectionMarker: '01', bullet: '•' },
  'sales-momentum': { composition: 'momentum-stack', eyebrow: 'Revenue performance', sectionMarker: '↑', bullet: '›' },
  'creative-director': { composition: 'portfolio-spread', eyebrow: 'Selected career work', sectionMarker: '□', bullet: '—' },
  'architectural-grid': { composition: 'drawing-sheet', eyebrow: 'Practice & project record', sectionMarker: 'A', bullet: '·' },
  'editorial-signature': { composition: 'literary-review', eyebrow: 'Editorial profile', sectionMarker: '¶', bullet: '—' },
};

function metadataFor(id: CuratedSignatureTemplateId): ResumeTemplateMetadata {
  const template = getRegisteredTemplate(id);
  if (!template || !NEW_SIGNATURE_TEMPLATE_IDS.includes(template.id as CuratedSignatureTemplateId)) {
    throw new Error(`Curated resume template metadata is missing for "${id}".`);
  }
  return template;
}

function token(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function present(value: unknown): string {
  return cleanResumeText(value);
}

function usableExperience(entries: CanonicalExperience[]): CanonicalExperience[] {
  return entries
    .map((entry) => ({
      company: present(entry.company),
      role: present(entry.role),
      duration: present(entry.duration),
      achievements: entry.achievements.map(present).filter(Boolean),
    }))
    .filter((entry) => entry.company || entry.role || entry.duration || entry.achievements.length);
}

function usableEducation(entries: CanonicalEducation[]): CanonicalEducation[] {
  return entries
    .map((entry) => ({
      degree: present(entry.degree),
      institution: present(entry.institution),
      year: present(entry.year),
      ...(present(entry.details) ? { details: present(entry.details) } : {}),
    }))
    .filter((entry) => entry.degree || entry.institution || entry.year || entry.details);
}

function usableSkills(groups: CanonicalSkillGroup[]): CanonicalSkillGroup[] {
  return groups
    .map((group) => ({
      category: present(group.category) || 'Skills',
      items: group.items.map(present).filter(Boolean),
    }))
    .filter((group) => group.items.length);
}

function SectionHeading({
  children,
  index,
}: {
  children: string;
  index: number;
}) {
  return (
    <div className="curated-section-heading">
      <span className="curated-section-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <h2>{children}</h2>
      <span className="curated-section-rule" aria-hidden="true" />
    </div>
  );
}

function SummarySection({ summary }: { summary: string }) {
  if (!summary) return null;
  return <p className="curated-summary">{summary}</p>;
}

function ExperienceSection({
  entries,
  bullet,
}: {
  entries: CanonicalExperience[];
  bullet: string;
}) {
  if (!entries.length) return null;
  return (
    <div className="curated-experience-list">
      {entries.map((entry, index) => (
        <article className="curated-experience-entry" key={entry.id || `${entry.company}-${entry.role}-${index}`}>
          <div className="curated-experience-heading">
            <div>
              {entry.role && <h3>{entry.role}</h3>}
              {entry.company && <p className="curated-company">{entry.company}</p>}
            </div>
            {entry.duration && <p className="curated-duration">{entry.duration}</p>}
          </div>
          {entry.achievements.length > 0 && (
            <ul>
              {entry.achievements.map((achievement, achievementIndex) => (
                <li key={`${achievement}-${achievementIndex}`}>
                  <span className="curated-bullet" aria-hidden="true">{bullet}</span>
                  <span>{achievement}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function SkillsSection({ groups }: { groups: CanonicalSkillGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="curated-skills-list">
      {groups.map((group, index) => (
        <div className="curated-skill-group" key={group.id || `${group.category}-${index}`}>
          <h3>{group.category}</h3>
          <p>{group.items.join(' • ')}</p>
        </div>
      ))}
    </div>
  );
}

function EducationSection({ entries }: { entries: CanonicalEducation[] }) {
  if (!entries.length) return null;
  return (
    <div className="curated-education-list">
      {entries.map((entry, index) => (
        <article className="curated-education-entry" key={entry.id || `${entry.institution}-${entry.degree}-${index}`}>
          <div className="curated-education-heading">
            <div>
              {entry.degree && <h3>{entry.degree}</h3>}
              {entry.institution && <p>{entry.institution}</p>}
            </div>
            {entry.year && <p className="curated-education-year">{entry.year}</p>}
          </div>
          {entry.details && <p className="curated-education-details">{entry.details}</p>}
        </article>
      ))}
    </div>
  );
}

function CertificationsSection({ certifications }: { certifications: string[] }) {
  if (!certifications.length) return null;
  return (
    <ul className="curated-certifications">
      {certifications.map((certification, index) => (
        <li key={`${certification}-${index}`}>{certification}</li>
      ))}
    </ul>
  );
}

function CuratedDocument({
  resume,
  colors,
  template,
}: CuratedRendererProps & { template: ResumeTemplateMetadata }) {
  const composition = CURATED_COMPOSITIONS[template.id as CuratedSignatureTemplateId];
  const name = present(resume.name) || 'Resume';
  const title = present(resume.title);
  const summary = present(resume.summary);
  const experience = usableExperience(resume.experience);
  const education = usableEducation(resume.education);
  const skills = usableSkills(resume.skills);
  const certifications = resume.certifications.map(present).filter(Boolean);
  const additionalSections = (resume as CanonicalResume & { additionalSections?: { id: string; title: string; items: string[] }[] }).additionalSections || [];
  const contact = [
    present(resume.email),
    present(resume.phone),
    present(resume.location),
    present(resume.linkedin),
    present(resume.website),
    ...(resume.links || []).map(present),
  ].filter(Boolean);

  const content: Partial<Record<SectionName, ReactNode>> = {
    Summary: summary ? <SummarySection summary={summary} /> : null,
    Experience: experience.length
      ? <ExperienceSection entries={experience} bullet={composition.bullet} />
      : null,
    Skills: skills.length ? <SkillsSection groups={skills} /> : null,
    Education: education.length ? <EducationSection entries={education} /> : null,
    Certifications: certifications.length
      ? <CertificationsSection certifications={certifications} />
      : null,
  };
  const orderedNames = [
    ...template.structure.sectionOrder.filter(
      (section): section is Exclude<SectionName, 'Certifications'> =>
        section === 'Summary' || section === 'Experience' || section === 'Skills' || section === 'Education',
    ),
    'Certifications' as const,
  ];
  const style = {
    '--curated-primary': colors.primary,
    '--curated-accent': colors.accent,
    '--curated-text': colors.text,
  } as CSSProperties;

  const className = [
    'curated-page',
    `template-${token(template.id)}`,
    `family-${token(template.structure.family)}`,
    `composition-${token(composition.composition)}`,
    `columns-${template.structure.columns}`,
    `header-${token(template.structure.headerGeometry)}`,
    `density-${template.structure.density}`,
    `rules-${token(template.structure.ruleSystem)}`,
    `experience-${token(template.structure.experienceTreatment)}`,
    `skills-${token(template.structure.skillsTreatment)}`,
    `type-${token(template.structure.typography)}`,
    `motif-${token(template.structure.decorativeSystem)}`,
    `contact-${token(template.structure.contactTreatment)}`,
  ].join(' ');

  return (
    <>
      <article
        aria-label={`${name} resume in the ${template.name} template`}
        className={className}
        data-template-id={template.id}
        data-family={template.structure.family}
        data-ats={template.atsClassification}
        data-columns={template.structure.columns}
        data-section-order={template.structure.sectionOrder.join('|')}
        style={style}
      >
        <div className="curated-motif" aria-hidden="true">
          <span /><span /><span />
        </div>
        <header className="curated-header">
          <p className="curated-eyebrow">{composition.eyebrow}</p>
          <div className="curated-identity">
            <div>
              <h1>{name}</h1>
              {title && <p className="curated-title">{title}</p>}
            </div>
            <span className="curated-header-mark" aria-hidden="true">{composition.sectionMarker}</span>
          </div>
          {contact.length > 0 && (
            <address className="curated-contact">
              {contact.map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
              ))}
            </address>
          )}
        </header>
        <div className="curated-content">
          <p className="curated-preview-label">Editing preview · final PDF or Word controls page flow</p>
          {orderedNames.map((sectionName, index) => {
            const sectionContent = content[sectionName];
            if (!sectionContent) return null;
            return (
              <section
                className={`curated-section section-${sectionName.toLowerCase()}`}
                key={sectionName}
              >
                <SectionHeading index={index}>{sectionName}</SectionHeading>
                {sectionContent}
              </section>
            );
          })}
          {additionalSections.map((section, sectionIndex) => {
            const items = (section.items || []).map(present).filter(Boolean);
            if (!present(section.title) && items.length === 0) return null;
            return <section className="curated-section" key={section.id || `${section.title}-${sectionIndex}`}><SectionHeading index={orderedNames.length + sectionIndex}>{present(section.title) || 'Additional information'}</SectionHeading><ul className="curated-certifications">{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>;
          })}
        </div>
      </article>
      <style>{CURATED_SIGNATURE_STYLES}</style>
    </>
  );
}

function createRenderer(id: CuratedSignatureTemplateId): CuratedRenderer {
  const template = metadataFor(id);
  return function CuratedRegistryRenderer(props: CuratedRendererProps) {
    return <CuratedDocument {...props} template={template} />;
  };
}

/**
 * Intentionally explicit: adding a catalog signature does not silently acquire a
 * generic renderer. The registry must be reviewed and extended one key at a time.
 */
export const CURATED_HTML_TEMPLATE_MAP: Record<CuratedSignatureTemplateId, CuratedRenderer> = {
  'executive-ledger': createRenderer('executive-ledger'),
  'strategy-brief': createRenderer('strategy-brief'),
  'product-signal': createRenderer('product-signal'),
  'engineering-core': createRenderer('engineering-core'),
  'data-evidence': createRenderer('data-evidence'),
  'finance-standard': createRenderer('finance-standard'),
  'legal-brief': createRenderer('legal-brief'),
  'healthcare-precision': createRenderer('healthcare-precision'),
  'academic-profile': createRenderer('academic-profile'),
  'public-service': createRenderer('public-service'),
  'mission-impact': createRenderer('mission-impact'),
  'career-pivot': createRenderer('career-pivot'),
  'emerging-professional': createRenderer('emerging-professional'),
  'sales-momentum': createRenderer('sales-momentum'),
  'creative-director': createRenderer('creative-director'),
  'architectural-grid': createRenderer('architectural-grid'),
  'editorial-signature': createRenderer('editorial-signature'),
};

export function isCuratedSignatureTemplateId(value: string): value is CuratedSignatureTemplateId {
  return Object.prototype.hasOwnProperty.call(CURATED_HTML_TEMPLATE_MAP, value);
}

export function getCuratedHtmlRenderer(id: CuratedSignatureTemplateId): CuratedRenderer {
  return requireResumeTemplateRegistryEntry(CURATED_HTML_TEMPLATE_MAP, id, 'html');
}

export function CuratedSignatureTemplate({
  resume,
  templateId,
  colors,
}: CuratedSignatureTemplateProps) {
  const Renderer = requireResumeTemplateRegistryEntry(
    CURATED_HTML_TEMPLATE_MAP,
    templateId,
    'html',
  );
  return <>{Renderer({ resume, colors })}</>;
}

export function CuratedTemplateMiniature({ template }: { template: ResumeTemplateMetadata }) {
  const composition = requireResumeTemplateRegistryEntry(
    CURATED_COMPOSITIONS,
    template.id,
    'html',
  );
  const miniatureStyle = {
    '--mini-primary': template.colors.primary,
    '--mini-accent': template.colors.accent,
  } as CSSProperties;
  return (
    <article
      aria-label={`${template.name} template preview`}
      className={[
        'curated-miniature',
        `mini-${token(template.id)}`,
        `mini-composition-${token(composition.composition)}`,
        `mini-columns-${template.structure.columns}`,
      ].join(' ')}
      data-template-id={template.id}
      data-family={template.structure.family}
      data-ats={template.atsClassification}
      style={miniatureStyle}
    >
      <div className="mini-motif" aria-hidden="true" />
      <header>
        <span />
        <strong>{template.name}</strong>
        <i />
      </header>
      <div className="mini-body" aria-hidden="true">
        <section><b /><span /><span /></section>
        <section><b /><span /><span /><span /></section>
        <section><b /><span /></section>
      </div>
      <style>{CURATED_MINIATURE_STYLES}</style>
    </article>
  );
}

export function getCuratedRegistryIds(): CuratedSignatureTemplateId[] {
  return Object.keys(CURATED_HTML_TEMPLATE_MAP) as CuratedSignatureTemplateId[];
}

export function assertCuratedRegistryCoverage(): true {
  const registered = getCuratedRegistryIds();
  const expected = [...NEW_SIGNATURE_TEMPLATE_IDS];
  if (
    registered.length !== expected.length
    || expected.some((id) => !registered.includes(id))
  ) {
    throw new Error('Curated HTML template registry does not match the signature catalog.');
  }
  return true;
}

export function getCuratedTemplateTestAttributes(id: CuratedSignatureTemplateId): {
  templateId: string;
  family: string;
  ats: AtsClassification;
  composition: string;
} {
  const template = metadataFor(id);
  return {
    templateId: template.id,
    family: template.structure.family,
    ats: template.atsClassification,
    composition: CURATED_COMPOSITIONS[id].composition,
  };
}

const CURATED_SIGNATURE_STYLES = `
.curated-page, .curated-page * { box-sizing: border-box; }
.curated-page {
  position: relative;
  isolation: isolate;
  width: 210mm;
  min-height: 297mm;
  overflow: visible;
  padding: 15mm 16mm 17mm;
  background: #fff;
  color: var(--curated-text);
  font-family: Inter, Arial, sans-serif;
  font-size: 10.5px;
  line-height: 1.48;
  text-rendering: optimizeLegibility;
}
.curated-page h1, .curated-page h2, .curated-page h3, .curated-page p { margin: 0; }
.curated-page h1 { color: var(--curated-primary); font-size: 34px; line-height: 1.02; letter-spacing: -0.035em; overflow-wrap: anywhere; }
.curated-header { position: relative; z-index: 1; margin-bottom: 20px; }
.curated-eyebrow { color: var(--curated-primary); font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.curated-identity { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-top: 6px; }
.curated-title { margin-top: 5px !important; color: var(--curated-text); font-size: 14px; font-weight: 650; line-height: 1.25; }
.curated-header-mark { flex: 0 0 auto; color: var(--curated-accent); font-size: 34px; font-weight: 900; line-height: 1; }
.curated-contact { display: flex; flex-wrap: wrap; gap: 3px 14px; margin-top: 10px; color: var(--curated-text); font-size: 10px; font-style: normal; overflow-wrap: anywhere; }
.curated-contact span { display: inline; }
.curated-content { position: relative; z-index: 1; }
.curated-section { margin-top: 18px; break-inside: auto; }
.curated-section:first-child { margin-top: 0; }
.curated-section-heading { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 8px; margin-bottom: 8px; }
.curated-section-heading h2 { color: var(--curated-primary); font-size: 11px; font-weight: 850; letter-spacing: .105em; text-transform: uppercase; }
.curated-section-index { color: var(--curated-primary); font-size: 10px; font-weight: 800; }
.curated-section-rule { height: 1px; background: var(--curated-primary); opacity: .42; }
.curated-summary { max-width: 72em; font-size: 11px; line-height: 1.62; }
.curated-preview-label { margin-bottom: 9px !important; color: var(--curated-text); font-size: 8px; font-style: italic; opacity: .72; }
.curated-experience-list { display: grid; gap: 14px; }
.curated-experience-entry, .curated-education-entry { break-inside: avoid; }
.curated-experience-heading, .curated-education-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.curated-experience-entry h3, .curated-education-entry h3, .curated-skill-group h3 { color: var(--curated-primary); font-size: 11px; line-height: 1.3; }
.curated-company { margin-top: 1px !important; font-weight: 650; }
.curated-duration, .curated-education-year { flex: 0 0 auto; color: var(--curated-text); font-size: 10px; font-weight: 650; }
.curated-experience-entry ul { display: grid; gap: 3px; margin: 6px 0 0; padding: 0; list-style: none; }
.curated-experience-entry li { display: grid; grid-template-columns: 14px 1fr; gap: 3px; }
.curated-bullet { color: var(--curated-primary); font-weight: 800; }
.curated-skills-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
.curated-skill-group p { margin-top: 2px; }
.curated-education-list { display: grid; gap: 10px; }
.curated-education-details { margin-top: 3px !important; }
.curated-certifications { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; margin: 0; padding-left: 16px; }
.curated-motif { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.curated-motif span { position: absolute; display: block; background: var(--curated-accent); }
.density-compact { padding-top: 12mm; font-size: 10px; line-height: 1.4; }
.density-compact .curated-section { margin-top: 14px; }
.density-spacious { padding: 18mm 18mm 20mm; font-size: 11px; line-height: 1.56; }
.density-spacious .curated-section { margin-top: 23px; }
.columns-2 .curated-skills-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rules-ledger-lines .curated-section-heading, .rules-double-entry-rules .curated-section-heading { border-top: 1px solid var(--curated-primary); border-bottom: 1px solid var(--curated-primary); padding: 4px 0; }
.rules-memo-dividers .curated-section-heading, .rules-pleading-rules .curated-section-heading { grid-template-columns: 30px auto 1fr; }
.rules-signal-tabs .curated-section-heading h2, .rules-launch-rules .curated-section-heading h2 { padding: 4px 9px; border: 1px solid var(--curated-primary); }
.rules-spec-rules .curated-section-rule, .rules-drawing-grid .curated-section-rule { height: 3px; background: repeating-linear-gradient(90deg, var(--curated-primary) 0 10px, transparent 10px 14px); }
.rules-evidence-rules .curated-section-index, .rules-citation-rules .curated-section-index { font-family: Georgia, serif; font-style: italic; }
.rules-clinical-rules .curated-section-heading { padding-left: 8px; border-left: 4px solid var(--curated-primary); }
.rules-civic-rules .curated-section-heading { border-bottom: 2px solid var(--curated-primary); padding-bottom: 4px; }
.rules-impact-rules .curated-section-heading { background: color-mix(in srgb, var(--curated-primary) 7%, white); padding: 5px 7px; }
.rules-bridge-rules .curated-section-rule { height: 2px; background: linear-gradient(90deg, var(--curated-primary), transparent); }
.rules-momentum-rules .curated-section-heading { transform: skewX(-5deg); border-bottom: 3px solid var(--curated-primary); }
.rules-gallery-rules .curated-section-heading { grid-template-columns: auto auto; }
.rules-gallery-rules .curated-section-rule { display: none; }
.rules-editorial-rules .curated-section-heading { border-top: 3px double var(--curated-primary); padding-top: 5px; }
.experience-scope-impact .curated-experience-entry { padding-left: 12px; border-left: 2px solid var(--curated-primary); }
.experience-case-briefs .curated-experience-entry { display: grid; grid-template-columns: 1fr 2.7fr; gap: 12px; }
.experience-outcome-cards .curated-experience-entry { padding: 10px; border: 1px solid color-mix(in srgb, var(--curated-primary) 28%, white); border-radius: 5px; }
.experience-system-impact .curated-experience-entry { padding: 8px 0; border-top: 1px dashed var(--curated-primary); }
.experience-hypothesis-results .curated-experience-entry { counter-increment: evidence; padding-left: 20px; position: relative; }
.experience-hypothesis-results .curated-experience-entry:before { content: counter(evidence); position: absolute; left: 0; color: var(--curated-primary); font-weight: 800; }
.experience-transaction-record .curated-experience-heading { border-bottom: 1px dotted var(--curated-primary); padding-bottom: 3px; }
.experience-matter-outcomes .curated-experience-entry { padding: 9px 12px; border-left: 1px solid var(--curated-primary); }
.experience-care-impact .curated-experience-entry { padding-left: 26px; position: relative; }
.experience-care-impact .curated-experience-entry:before { content: '+'; position: absolute; left: 2px; color: var(--curated-primary); font-size: 18px; font-weight: 800; }
.experience-scholarship-streams .curated-experience-entry { border-bottom: 1px solid color-mix(in srgb, var(--curated-primary) 20%, white); padding-bottom: 12px; }
.experience-accountability-record .curated-experience-heading { padding: 5px 7px; background: color-mix(in srgb, var(--curated-primary) 8%, white); }
.experience-program-impact .curated-experience-entry { border-radius: 12px 0 12px 0; padding: 10px; border: 1px solid color-mix(in srgb, var(--curated-primary) 25%, white); }
.experience-transferable-evidence .curated-experience-entry { padding-left: 14px; border-left: 3px double var(--curated-primary); }
.experience-project-first-evidence .curated-experience-list { counter-reset: launch; }
.experience-project-first-evidence .curated-experience-entry { counter-increment: launch; }
.experience-project-first-evidence .curated-experience-heading:before { content: '0' counter(launch); color: var(--curated-primary); font-weight: 900; }
.experience-quota-results .curated-experience-entry { border-top: 4px solid var(--curated-primary); padding-top: 7px; }
.experience-project-spreads .curated-experience-entry { display: grid; grid-template-columns: minmax(150px, .9fr) 2fr; gap: 16px; padding: 12px 0; border-top: 1px solid var(--curated-primary); }
.experience-project-sheets .curated-experience-entry { padding: 10px; outline: 1px solid var(--curated-primary); outline-offset: -1px; }
.experience-publication-features .curated-experience-entry:first-child h3:first-letter { font-family: Georgia, serif; font-size: 24px; }
.skills-competency-line .curated-skills-list, .skills-capability-list .curated-skills-list, .skills-qualification-list .curated-skills-list, .skills-foundation-list .curated-skills-list { grid-template-columns: 1fr; }
.skills-product-stack .curated-skill-group { padding: 7px; border: 1px solid color-mix(in srgb, var(--curated-primary) 24%, white); }
.skills-technology-groups .curated-skill-group { font-family: Consolas, monospace; padding-left: 9px; border-left: 2px solid var(--curated-primary); }
.skills-methods-index .curated-skills-list { counter-reset: method; }
.skills-methods-index .curated-skill-group { counter-increment: method; display: grid; grid-template-columns: 22px 1fr; }
.skills-methods-index .curated-skill-group:before { content: counter(method, decimal-leading-zero); color: var(--curated-primary); font-weight: 800; grid-row: span 2; }
.skills-finance-coverage .curated-skill-group { border-bottom: 1px dotted var(--curated-primary); padding-bottom: 4px; }
.skills-practice-areas .curated-skill-group h3, .skills-credential-list .curated-skill-group h3 { border-bottom: 1px solid var(--curated-primary); padding-bottom: 2px; }
.skills-methods-sidebar .curated-skills-list, .skills-discipline-sidebar .curated-skills-list, .skills-practice-sidebar .curated-skills-list, .skills-beats-sidebar .curated-skills-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.skills-mission-capabilities .curated-skill-group { border-radius: 10px; padding: 7px 9px; background: color-mix(in srgb, var(--curated-primary) 7%, white); }
.skills-bridge-columns .curated-skills-list { column-gap: 30px; }
.skills-market-coverage .curated-skill-group { padding: 6px 0 6px 10px; border-left: 6px solid var(--curated-primary); }
.type-transitional-sans h1, .type-financial-serif h1, .type-legal-serif h1, .type-scholarly-serif h1, .type-literary-serif h1 { font-family: Georgia, 'Times New Roman', serif; }
.type-sans-mono .curated-eyebrow, .type-sans-mono .curated-section-heading, .type-architectural-grotesk .curated-eyebrow { font-family: Consolas, 'Courier New', monospace; }
.type-scientific-sans .curated-section-heading, .type-clinical-sans .curated-section-heading { letter-spacing: .14em; }
.type-display-editorial h1 { font-family: Impact, 'Arial Narrow', sans-serif; font-size: 42px; text-transform: uppercase; }
.type-literary-serif { font-family: Georgia, 'Times New Roman', serif; }
.type-literary-serif .curated-contact, .type-literary-serif .curated-eyebrow { font-family: Inter, Arial, sans-serif; }
.header-left-ledger .curated-header { padding-left: 14px; border-left: 5px solid var(--curated-primary); }
.header-memo-block .curated-header { padding: 11px 13px; border: 1px solid var(--curated-primary); }
.header-outcome-banner .curated-header { padding-bottom: 12px; border-bottom: 7px solid var(--curated-primary); }
.header-specification-line .curated-header { border-top: 2px solid var(--curated-primary); padding-top: 8px; }
.header-abstract-header .curated-header { text-align: center; border-bottom: 1px solid var(--curated-primary); padding-bottom: 12px; }
.header-abstract-header .curated-identity { justify-content: center; }
.header-statement-title .curated-header { border-top: 5px double var(--curated-primary); border-bottom: 5px double var(--curated-primary); padding: 9px 0; }
.header-caption-header .curated-header { display: grid; grid-template-columns: 90px 1fr; column-gap: 14px; border-bottom: 2px solid var(--curated-primary); padding-bottom: 10px; }
.header-caption-header .curated-eyebrow { grid-row: span 2; border-right: 1px solid var(--curated-primary); padding-right: 12px; }
.header-credential-band .curated-header { border-radius: 0 18px 0 0; padding: 12px; background: color-mix(in srgb, var(--curated-primary) 7%, white); }
.header-journal-masthead .curated-header { text-align: center; border-top: 1px solid var(--curated-primary); border-bottom: 1px solid var(--curated-primary); padding: 10px 0; }
.header-journal-masthead .curated-identity { justify-content: center; }
.header-agency-line .curated-header { padding-top: 12px; border-top: 9px solid var(--curated-primary); }
.header-mission-statement .curated-header { max-width: 86%; padding: 11px 15px; border-radius: 0 24px 24px 0; background: color-mix(in srgb, var(--curated-primary) 8%, white); }
.header-transition-arc .curated-header { text-align: center; padding-bottom: 14px; border-bottom: 3px double var(--curated-primary); }
.header-transition-arc .curated-identity { justify-content: center; }
.header-identity-line .curated-header { padding: 10px 0 10px 18px; border-left: 2px solid var(--curated-primary); border-bottom: 1px solid var(--curated-primary); }
.header-quota-line .curated-header { transform: skewX(-3deg); padding: 10px 14px; border: 3px solid var(--curated-primary); }
.header-gallery-title .curated-header { min-height: 112px; display: flex; flex-direction: column; justify-content: flex-end; border-bottom: 1px solid var(--curated-primary); }
.header-title-block .curated-header { margin-left: 20%; padding: 10px; border: 2px solid var(--curated-primary); }
.header-byline-masthead .curated-header { display: grid; grid-template-columns: 1fr auto; column-gap: 18px; border-bottom: 4px double var(--curated-primary); padding-bottom: 9px; }
.header-byline-masthead .curated-contact { grid-column: 1 / -1; }
.contact-centered-stack .curated-contact, .contact-affiliation-block .curated-contact { justify-content: center; }
.contact-caption-row .curated-contact, .contact-title-block-details .curated-contact { padding-top: 6px; border-top: 1px dotted var(--curated-primary); }
.contact-protocol-row .curated-contact, .contact-citation-line .curated-contact { font-family: Consolas, monospace; }
.motif-hairline-ledger .curated-motif span:first-child { left: 7mm; top: 0; width: 1px; height: 100%; opacity: .2; }
.motif-brief-markers .curated-motif span:first-child { right: 9mm; top: 9mm; width: 16mm; height: 3px; }
.motif-signal-dots .curated-motif { background-image: radial-gradient(var(--curated-accent) .7px, transparent .7px); background-size: 12px 12px; opacity: .08; }
.motif-version-marks .curated-motif span:first-child { right: 7mm; top: 7mm; width: 12mm; height: 12mm; border: 2px solid var(--curated-accent); background: transparent; }
.motif-evidence-numbers .curated-motif span:first-child { right: 7mm; top: 24mm; width: 20mm; height: 2px; transform: rotate(90deg); opacity: .55; }
.motif-accounting-lines .curated-motif span:first-child { left: 0; right: 0; top: 10mm; height: 1px; opacity: .35; }
.motif-caption-lines .curated-motif span:first-child { left: 7mm; top: 14mm; width: 2px; height: 42mm; opacity: .45; }
.motif-precision-marks .curated-motif span:first-child { right: 9mm; top: 9mm; width: 15mm; height: 15mm; background: linear-gradient(90deg, transparent 44%, var(--curated-accent) 44% 56%, transparent 56%), linear-gradient(transparent 44%, var(--curated-accent) 44% 56%, transparent 56%); }
.motif-citation-folios .curated-motif span:first-child { left: 50%; top: 8mm; width: 22mm; height: 2px; transform: translateX(-50%); }
.motif-service-seal-line .curated-motif span:first-child { right: 8mm; top: 8mm; width: 15mm; height: 15mm; border: 4px double var(--curated-accent); border-radius: 50%; background: transparent; }
.motif-impact-marks .curated-motif span:first-child { right: -10mm; top: 28mm; width: 27mm; height: 27mm; border: 8px solid var(--curated-accent); border-radius: 50%; background: transparent; opacity: .25; }
.motif-transition-arrows .curated-motif span:first-child { left: 9mm; top: 10mm; width: 30mm; height: 3px; transform: rotate(-18deg); opacity: .55; }
.motif-milestone-dots .curated-motif { background: linear-gradient(var(--curated-accent), var(--curated-accent)) 8mm 0 / 2px 100% no-repeat; opacity: .16; }
.motif-momentum-ticks .curated-motif span:first-child { right: 7mm; top: 7mm; width: 28mm; height: 10mm; background: repeating-linear-gradient(110deg, var(--curated-accent) 0 3px, transparent 3px 8px); }
.motif-portfolio-frames .curated-motif span:first-child { right: 8mm; top: 8mm; width: 42mm; height: 24mm; border: 6px solid var(--curated-accent); background: transparent; opacity: .2; }
.motif-registration-marks .curated-motif span:first-child, .motif-registration-marks .curated-motif span:nth-child(2) { width: 14mm; height: 1px; top: 8mm; right: 8mm; }
.motif-registration-marks .curated-motif span:nth-child(2) { transform: rotate(90deg); }
.motif-drop-cap-marks .curated-motif span:first-child { right: 8mm; top: 8mm; width: 9mm; height: 9mm; border-radius: 50% 0 50% 50%; opacity: .3; }
@media print {
  .curated-page { width: 210mm; min-height: 297mm; margin: 0; box-shadow: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
}
`;

const CURATED_MINIATURE_STYLES = `
.curated-miniature, .curated-miniature * { box-sizing: border-box; }
.curated-miniature { position: relative; width: 100%; aspect-ratio: 210 / 297; overflow: hidden; padding: 9% 8%; background: #fff; color: var(--mini-primary); border: 1px solid color-mix(in srgb, var(--mini-primary) 18%, white); }
.curated-miniature header { position: relative; display: grid; gap: 4%; min-height: 24%; padding-bottom: 7%; border-bottom: 2px solid var(--mini-primary); }
.curated-miniature header > span { width: 28%; height: 3px; background: var(--mini-accent); }
.curated-miniature header strong { font: 800 clamp(7px, 1.8vw, 12px)/1.05 Inter, sans-serif; overflow-wrap: anywhere; }
.curated-miniature header i { width: 58%; height: 3px; background: var(--mini-primary); opacity: .45; }
.mini-body { position: relative; display: grid; gap: 8%; padding-top: 9%; }
.mini-body section { display: grid; gap: 4px; }
.mini-body b { width: 35%; height: 3px; background: var(--mini-primary); }
.mini-body span { display: block; width: 100%; height: 2px; background: var(--mini-primary); opacity: .24; }
.mini-body span:last-child { width: 72%; }
.mini-motif { position: absolute; right: -7%; top: -4%; width: 28%; aspect-ratio: 1; background: var(--mini-accent); opacity: .2; }
.mini-composition-linear-ledger { border-left: 6px double var(--mini-primary); }
.mini-composition-memo-frame header { border: 2px solid var(--mini-primary); padding: 6%; }
.mini-composition-tabbed-signal header { border-bottom-width: 7px; }
.mini-composition-spec-stack { font-family: monospace; border-top: 5px solid var(--mini-primary); }
.mini-composition-evidence-index header { text-align: center; }
.mini-composition-statement-ledger header { border-top: 4px double var(--mini-primary); border-bottom: 4px double var(--mini-primary); }
.mini-composition-pleading-caption { border-left: 2px solid var(--mini-primary); }
.mini-composition-credential-sheet header { border-radius: 0 14px 0 0; background: color-mix(in srgb, var(--mini-primary) 7%, white); padding: 6%; }
.mini-composition-journal-spread header { text-align: center; border-top: 1px solid var(--mini-primary); }
.mini-composition-civic-record { border-top: 8px solid var(--mini-primary); }
.mini-composition-impact-band header { border-radius: 0 18px 18px 0; background: color-mix(in srgb, var(--mini-primary) 8%, white); padding: 6%; }
.mini-composition-bridge-flow header { text-align: center; border-bottom: 3px double var(--mini-primary); }
.mini-composition-launch-track { border-left: 3px solid var(--mini-accent); }
.mini-composition-momentum-stack { transform: skewX(-1deg); border-top: 5px solid var(--mini-primary); }
.mini-composition-portfolio-spread header { min-height: 35%; justify-content: end; }
.mini-composition-drawing-sheet header { margin-left: 18%; border: 2px solid var(--mini-primary); padding: 5%; }
.mini-composition-literary-review header { font-family: Georgia, serif; border-bottom: 4px double var(--mini-primary); }
.mini-columns-2 .mini-body { grid-template-columns: 1fr 1fr; }
.mini-columns-2 .mini-body section:first-child { grid-column: 1 / -1; }
`;
