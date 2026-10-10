/* TEST ONLY: bundled solely by scripts/ui-verify-fixtures.cjs, never a Next route. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import WorkspaceFrame from '@/components/workspace/WorkspaceFrame';
import { ThemeProvider } from '@/components/ThemeProvider';
import Toast from '@/components/Toast';
import JobSearchPage from '@/app/suite/job-search/page';
import CoverLetterPage from '@/app/suite/cover-letter/page';
import JobFeedWidget from '@/components/JobFeedWidget';
import { SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { useStore } from '@/lib/store';
import { ResumeReviewWorkbench } from '@/components/resume-studio/ResumeReviewWorkbench';
import '@/components/resume-studio/resume-review-workbench.css';
import { sampleUser } from 'ui-fixture:firebase';

const MARKER = 'UI_VERIFY_TEST_ONLY_COMPONENT_BOUNDARY_V1';
window.__uiFixture = {
  marker: MARKER,
  violations: [],
  boundaryReads: [],
  setUser(user) { useStore.getState().setUser(user ? { ...sampleUser, ...user } : null); },
  storeSnapshot() { const { user, userProfile } = useStore.getState(); return { uid: user?.uid || null, profile: userProfile }; },
};
function App() {
  const pathname = usePathname();
  const [supplement,setSupplement]=useState(null);
  window.__uiFixture.supplement=setSupplement;
  const [revision, setRevision] = useState(0);
  window.__uiFixture.remount = () => setRevision(value => value + 1);
  const resume={name:'Sample resume verification',title:'Sample role',email:'sample@example.invalid',phone:'',location:'Sample location',summary:'Sample source text for component verification.',experience:[],education:[],skills:[]};
  const readOnly=()=>window.__uiFixture.violations.push('Unexpected supplemental resume action');
  const page = supplement==='resume-review' ? <section data-ui-supplement='resume-review'><p>Sample supplemental actual ResumeReviewWorkbench; all measurements unknown; read-only callbacks.</p><ResumeReviewWorkbench sourceResume={resume} candidateResume={resume} reviewState={{version:1,decisions:{},selectedId:null,view:'comparison',documentTab:'source'}} onReviewStateChange={readOnly} onContinue={readOnly} onBack={readOnly} onStartOver={readOnly} targetLabel='Sample target' morphStrength={0} fitScore={null} atsScore={null} proofScore={null} protectedCount={null} saveState='idle' savedAt={null} isPro={false} onRunAtsScan={readOnly} atsScanLoading={false}/></section> : pathname === '/suite/job-search' ? <JobSearchPage />
    : pathname === '/suite/cover-letter' ? <CoverLetterPage />
    : pathname === '/suite' ? <SuiteToolShell><section data-ui-widget-boundary="JobFeedWidget"><h1>Sample dashboard widget verification</h1><p>Real JobFeedWidget and Zustand store; component-only fixture, server authorization is not certified.</p><JobFeedWidget /></section></SuiteToolShell>
    : <div><h1>Sample navigation reached {pathname}</h1><p>This test bundle renders only the three approved surfaces.</p></div>;
  return <ThemeProvider><WorkspaceFrame key={revision} showOnboardingPrompt={false}>{page}</WorkspaceFrame><Toast /></ThemeProvider>;
}
createRoot(document.getElementById('fixture-root')).render(<App />);
