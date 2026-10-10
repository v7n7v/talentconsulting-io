'use client';
import { useRef, useState } from 'react';
import { FLAGSHIP_FIXTURES } from '@/lib/resume-design/flagship-fixtures';
import { createResumeFlagshipPrototypeDesign } from '@/lib/resume-design/flagship';
import { reconcileResumeEntryBreaks } from '@/lib/resume-design/source-breaks';
import { createResumeDesign } from '@/lib/resume-design';
import { ResumeDesignWorkbench } from '@/components/resume-studio/ResumeDesignWorkbench';
import { ResumeDesignPaper } from '@/components/resume-studio/ResumeDesignPaper';
import { ResumeFlagshipHTML } from '@/components/resume-templates/flagship';
import { ResumeDesignHTML } from '@/components/resume-templates/design-v2';
import { ResumeExportPreview } from '@/components/resume-studio/ResumeExportPreview';
import { ResumeContentEditor } from '@/components/resume-studio/ResumeContentEditor';
import './lab.css';

export default function ResumeFlagshipLab() {
  const [fixture, setFixture] = useState('full');
  const [resume, setResume] = useState(FLAGSHIP_FIXTURES.full);
  const [design, setDesign] = useState(() => createResumeFlagshipPrototypeDesign(FLAGSHIP_FIXTURES.full));
  const [baselineDesign, setBaselineDesign] = useState(() => createResumeDesign('technical-signal', FLAGSHIP_FIXTURES.full));
  const [mode, setMode] = useState<'designed'|'application'>('designed');
  const [composition, setComposition] = useState<'standard'|'flagship-experiment'>('flagship-experiment');
  const [sourceNotice, setSourceNotice] = useState('');
  const [grayscale, setGrayscale] = useState(false);
  const pdfSection = useRef<HTMLDivElement>(null);
  const activeDesign = composition === 'standard' ? baselineDesign : design;
  const changeDesign = composition === 'standard' ? setBaselineDesign : setDesign;
  const changeSource = (next:typeof resume) => {
    const signatureResult = reconcileResumeEntryBreaks(resume, next, design);
    const baselineResult = reconcileResumeEntryBreaks(resume, next, baselineDesign);
    setDesign(signatureResult.design); setBaselineDesign(baselineResult.design); setResume(next);
    setSourceNotice(signatureResult.invalidated.length || baselineResult.invalidated.length ? 'Source changed. Page breaks for moved or replaced items were cleared in both compositions.' : '');
  };
  return <main className="flagship-lab"><header className="flagship-lab-header"><p>DEVELOPMENT REVIEW · FICTIONAL CANDIDATES</p><h1>Taco Signature</h1><p>An original résumé composition and focused design workbench. This experiment is not an account record.</p><a href="/suite/resume">Open the résumé workspace</a></header>
    <div className="flagship-lab-options"><label>Example<select value={fixture} onChange={e => { const next = FLAGSHIP_FIXTURES[e.target.value]; setFixture(e.target.value); setResume(next); setDesign(createResumeFlagshipPrototypeDesign(next, activeDesign.pageSize)); setBaselineDesign(createResumeDesign('technical-signal',next,undefined,activeDesign.pageSize)); }}>{Object.keys(FLAGSHIP_FIXTURES).map(id => <option key={id} value={id}>{id}</option>)}</select></label><label>Composition<select value={composition} onChange={e => setComposition(e.target.value as typeof composition)}><option value="flagship-experiment">Taco Signature prototype</option><option value="standard">Technical Signal baseline</option></select></label><label>PDF style<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="designed">Designed</option><option value="application">Application</option></select></label><label><input type="checkbox" checked={grayscale} onChange={e => setGrayscale(e.target.checked)} /> Grayscale editing view</label></div>
    <ResumeDesignWorkbench key={`${fixture}:${composition}`} resume={resume} value={activeDesign} onChange={changeDesign} title={composition === 'standard' ? 'Technical Signal comparison' : 'Taco Signature prototype'} onReset={() => composition === 'standard' ? createResumeDesign('technical-signal', resume, undefined, activeDesign.pageSize) : createResumeFlagshipPrototypeDesign(resume, activeDesign.pageSize)} onInspect={() => pdfSection.current?.scrollIntoView({behavior:'smooth',block:'start'})} singleColumnComposition={composition === 'flagship-experiment'} renderDocument={(selected, select) => <div style={{filter:grayscale ? 'grayscale(1)' : undefined}}><ResumeDesignPaper pageSize={activeDesign.pageSize}>{composition === 'flagship-experiment' ? <ResumeFlagshipHTML resume={resume} design={activeDesign} mode={mode} selectedSectionId={selected} onSelectSection={select} /> : <ResumeDesignHTML resume={resume} design={activeDesign} mode={mode} />}</ResumeDesignPaper></div>} />
    {sourceNotice && <p role="status">{sourceNotice}</p>}<details className="flagship-lab-source"><summary>Edit fictional source content</summary><ResumeContentEditor value={resume} onChange={changeSource} /></details>
    <div ref={pdfSection}><ResumeExportPreview resume={resume} templateId={design.templateId} pageSize={activeDesign.pageSize} design={activeDesign} mode={mode} composition={composition} /></div>
  </main>;
}
