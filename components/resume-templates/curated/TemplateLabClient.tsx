'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ResumeTemplate } from '@/components/resume-templates';
import { ResumeDesignPanel } from '@/components/resume-studio/ResumeDesignPanel';
import { ResumeExportPreview } from '@/components/resume-studio/ResumeExportPreview';
import { createResumeDesign, normalizeResumeDesign, switchResumeDesignTemplate, RESUME_DESIGN_FAMILIES, RESUME_DESIGN_PRESETS, type ResumeDesignConfig } from '@/lib/resume-design';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { RESUME_TEMPLATE_FIXTURES, type ResumeTemplateFixtureId } from '@/lib/resume-templates/fixtures';
import { getSelectableTemplates } from '@/lib/resume-templates';
import { PLAN_IDENTITIES } from '@/lib/plan-identity';

const TEMPLATES = getSelectableTemplates();
type LabFixtureId = ResumeTemplateFixtureId | 'graduate' | 'academic';
type LabVersion = 'v1' | 'v2';
const FIXTURE_IDS: LabFixtureId[] = ['full', 'sparse', 'long', 'graduate', 'academic'];
const PAGE_WIDTH: Record<'A4' | 'LETTER', number> = { A4: 794, LETTER: 816 };
const LAB_FIXTURES: Record<LabFixtureId, CanonicalResume> = {
  ...RESUME_TEMPLATE_FIXTURES,
  graduate: {
    name: 'Maya Chen', title: 'Environmental Science Graduate', email: 'maya.chen@example.test', phone: '555-0144', location: 'Seattle, WA',
    linkedin: 'linkedin.test/in/mayachen', summary: 'Recent environmental science graduate combining field research, clear communication, and practical data analysis to support community resilience.',
    experience: [
      { company: 'Puget Sound Field Lab', role: 'Research Assistant', duration: '2024–2025', achievements: ['Collected and quality-checked 240 shoreline samples across six sites.', 'Built a repeatable field log that reduced missing metadata by 30%.'] },
      { company: 'City Climate Office', role: 'Climate Programs Intern', duration: 'Summer 2024', achievements: ['Mapped cooling-center access for 12 neighborhoods and summarized service gaps for program staff.'] },
    ],
    education: [{ degree: 'BS, Environmental Science', institution: 'University of Washington', year: '2025', details: 'GIS certificate · Honors thesis on urban heat exposure' }],
    skills: [{ category: 'Research', items: ['Field sampling', 'Survey design', 'Data quality'] }, { category: 'Tools', items: ['R', 'QGIS', 'Excel', 'ArcGIS'] }],
    certifications: ['First Aid / CPR'],
    additionalSections: [{ id: 'projects', title: 'Projects', items: ['Urban Heat Atlas — combined public temperature and tree-canopy data to identify priority blocks.', 'Community Air Monitor — designed a low-cost sensor deployment plan with local partners.'] }],
  },
  academic: {
    name: 'Dr. Elena Rivera', title: 'Researcher · Public Health', email: 'elena.rivera@example.test', phone: '555-0192', location: 'Chicago, IL',
    linkedin: 'linkedin.test/in/elenarivera', website: 'elenarivera.test', summary: 'Public health researcher studying neighborhood conditions, preventive care access, and evidence that communities can use to improve health outcomes.',
    experience: [
      { company: 'Great Lakes School of Public Health', role: 'Postdoctoral Research Fellow', duration: '2023–Present', achievements: ['Co-led a mixed-methods study of preventive-care access across 18 community clinics.', 'Developed a reproducible analysis workflow used by a six-person research team.'] },
      { company: 'Midwest Health Equity Collaborative', role: 'Research Associate', duration: '2019–2023', achievements: ['Coordinated participant recruitment and partner reporting for a multi-site community health study.'] },
    ],
    education: [{ degree: 'PhD, Community Health Sciences', institution: 'University of Illinois Chicago', year: '2023' }, { degree: 'MPH, Epidemiology', institution: 'University of Michigan', year: '2018' }],
    skills: [{ category: 'Methods', items: ['Mixed methods', 'Cohort studies', 'Community-based research'] }, { category: 'Analysis', items: ['R', 'Stata', 'Qualitative coding'] }],
    certifications: ['CITI Human Subjects Research'],
    additionalSections: [
      { id: 'research', title: 'Research', items: ['Community clinic access study — co-investigator; protocol, analysis plan, and partner coordination.', 'Neighborhood health indicators — lead analyst for a public-use data brief.'] },
      { id: 'publications', title: 'Publications', items: ['Rivera E, Patel S. Community partnerships and preventive-care access. Journal of Public Health Practice, 2024.', 'Nguyen T, Rivera E, et al. Measuring neighborhood conditions with local data. Health Equity Review, 2022.'] },
      { id: 'teaching', title: 'Teaching', items: ['Guest lecturer, Community Health Assessment, 2024–2025.', 'Teaching assistant, Epidemiologic Methods, 2020–2022.'] },
      { id: 'grants', title: 'Grants', items: ['Co-investigator, Community Data Partnership Pilot, $48,000, 2024–2025.', 'Contributing author, Great Lakes Health Equity Seed Award, $22,500, 2022.'] },
    ],
  },
};

export default function TemplateLabClient({ initialTemplateId, initialFixtureId, initialDark }: { initialTemplateId?: string; initialFixtureId?: string; initialDark?: boolean }) {
  const initialTemplate = TEMPLATES.some(template => template.id === initialTemplateId) ? initialTemplateId! : TEMPLATES[0].id;
  const initialFixture: LabFixtureId = FIXTURE_IDS.includes(initialFixtureId as LabFixtureId) ? initialFixtureId as LabFixtureId : 'full';
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [fixtureId, setFixtureId] = useState<LabFixtureId>(initialFixture);
  const [version, setVersion] = useState<LabVersion>('v2');
  const [keepStyling, setKeepStyling] = useState(false);
  const [pdfMode, setPdfMode] = useState<'designed' | 'application'>('designed');
  const [dark, setDark] = useState(Boolean(initialDark));
  const [designState, setDesignState] = useState<ResumeDesignConfig>(() => createResumeDesign(initialTemplate, LAB_FIXTURES[initialFixture]));
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number>();
  const template = useMemo(() => TEMPLATES.find(candidate => candidate.id === templateId) || TEMPLATES[0], [templateId]);
  const resume = LAB_FIXTURES[fixtureId];
  const design = useMemo(() => normalizeResumeDesign(designState, templateId, resume), [designState, templateId, resume]);
  const pageSize = version === 'v2' ? design.pageSize : 'A4';
  const pageWidth = version === 'v2' ? PAGE_WIDTH[design.pageSize] : PAGE_WIDTH.A4;

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('version');
    // The server only provides template and fixture props; read the audit-baseline override after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requested === '1') setVersion('v1');
    else if (requested === '2') setVersion('v2');
  }, []);

  useEffect(() => {
    const frame = previewFrameRef.current;
    const content = previewContentRef.current;
    if (!frame || !content) return;
    const measure = () => {
      const nextScale = Math.min(1, frame.clientWidth / pageWidth);
      setPreviewScale(nextScale);
      setPreviewHeight(content.scrollHeight * nextScale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [fixtureId, template.id, pageWidth, design]);

  const syncUrl = (nextTemplate: string, nextFixture: LabFixtureId, nextDark: boolean, nextVersion: LabVersion) => {
    const params = new URLSearchParams({ template: nextTemplate, fixture: nextFixture, theme: nextDark ? 'dark' : 'light', version: nextVersion === 'v1' ? '1' : '2' });
    window.history.replaceState({}, '', `/resume-template-lab?${params.toString()}`);
  };
  const selectTemplate = (nextId: string) => {
    const next = keepStyling ? switchResumeDesignTemplate(design, nextId, resume, true) : createResumeDesign(nextId, resume, undefined, design.pageSize);
    setDesignState(next);
    setTemplateId(nextId);
    syncUrl(nextId, fixtureId, dark, version);
  };
  const selectVersion = (nextVersion: LabVersion) => {
    setVersion(nextVersion);
    if (nextVersion === 'v2') setDesignState(createResumeDesign(templateId, resume));
    syncUrl(templateId, fixtureId, dark, nextVersion);
  };

  return <main data-template-lab data-template-id={template.id} data-fixture={fixtureId} data-version={version} data-theme={dark ? 'dark' : 'light'} className="min-h-dvh bg-[var(--bg-deep)] px-3 py-4 text-[var(--text-primary)] sm:px-6 sm:py-6">
    <div className="elevation-card sticky top-2 z-40 mx-auto mb-5 flex max-w-[1320px] flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 backdrop-blur">
      <label className="text-xs font-semibold text-[var(--text-secondary)]">Version<select aria-label="Template version" value={version} onChange={event => selectVersion(event.target.value as LabVersion)} className="ml-2 min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]"><option value="v2">Customizable v2</option><option value="v1">Original v1</option></select></label>
      <label className="text-xs font-semibold text-[var(--text-secondary)]">Template<select aria-label="Template" value={template.id} onChange={event => selectTemplate(event.target.value)} className="ml-2 min-h-10 max-w-[230px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]">{TEMPLATES.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-[var(--text-secondary)]">Fixture<select aria-label="Fixture" value={fixtureId} onChange={event => { const next = event.target.value as LabFixtureId; setFixtureId(next); syncUrl(template.id, next, dark, version); }} className="ml-2 min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]">{FIXTURE_IDS.map(id => <option key={id} value={id}>{id === 'graduate' ? 'Graduate' : id === 'academic' ? 'Academic CV' : id}</option>)}</select></label>
      {version === 'v2' && <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]"><input type="checkbox" checked={keepStyling} onChange={event => setKeepStyling(event.target.checked)} />Keep styling when changing template</label>}
      {version === 'v2' && <label className="text-xs font-semibold text-[var(--text-secondary)]">PDF mode<select aria-label="PDF mode" value={pdfMode} onChange={event => setPdfMode(event.target.value as 'designed' | 'application')} className="ml-2 min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]"><option value="designed">Designed</option><option value="application">Application</option></select></label>}
      <button type="button" onClick={() => { const next = !dark; setDark(next); syncUrl(template.id, fixtureId, next, version); }} className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)]">{dark ? 'Light chrome' : 'Dark chrome'}</button>
      <div className="ml-auto text-right text-[11px] text-[var(--text-muted)]"><div>{template.atsClassification} · {template.tier === 'pro' ? PLAN_IDENTITIES.pro.label : 'FREE'}</div><div>{version === 'v2' ? RESUME_DESIGN_FAMILIES[RESUME_DESIGN_PRESETS[template.id].family] : template.structure.family} · {version === 'v2' ? design.layout.columns : template.structure.columns} column</div></div>
    </div>

    <div className={version === 'v2' ? 'mx-auto grid max-w-[1320px] grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]' : 'mx-auto max-w-[1320px]'}>
      {version === 'v2' && <ResumeDesignPanel resume={resume} value={design} onChange={setDesignState} onReset={() => setDesignState(createResumeDesign(templateId, resume))} onUseLegacy={() => selectVersion('v1')} />}
      <div className="min-w-0">
        <div ref={previewFrameRef} className="elevation-raised mx-auto w-full overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--paper)]" style={{ height: previewHeight }}>
          <div ref={previewContentRef} data-template-lab-scale={previewScale.toFixed(4)} style={{ width: pageWidth, transform: `matrix(${previewScale}, 0, 0, ${previewScale}, 0, 0)`, transformOrigin: 'top left' }}>
            <ResumeTemplate resume={resume} templateId={template.id} colors={template.colors} {...(version === 'v2' ? { design } : {})} />
          </div>
        </div>
        {version === 'v2' && <div className="mt-5"><ResumeExportPreview resume={resume} templateId={template.id} colors={template.colors} pageSize={pageSize} design={design} mode={pdfMode} /></div>}
      </div>
    </div>
  </main>;
}
