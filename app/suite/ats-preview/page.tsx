import { notFound, redirect } from 'next/navigation';
import {
  ProofEngineReport,
  type ProofEngineReportData,
} from '@/components/suite/ProofEngineReport';

const PROOF_ENGINE_VISUAL_FIXTURE: ProofEngineReportData = {
  title: 'Proof report for this resume morph',
  description: 'This report turns the rewrite into evidence: what matched the job, what changed, which facts stayed locked, and what Talent Studio refused to invent.',
  score: 16,
  scoreLabel: 'Morph fit',
  sourceLabel: 'Cellular network engineer',
  requirements: [
    {
      label: 'cellular',
      status: 'missing',
      evidence: 'Not found in the source resume or the optimized resume.',
      source: 'JD weight 1.69',
    },
    {
      label: 'network',
      status: 'missing',
      evidence: 'Not found in the source resume or the optimized resume.',
      source: 'JD weight 1.69',
    },
    {
      label: 'cellular network',
      status: 'missing',
      evidence: 'Not found in the source resume or the optimized resume.',
      source: 'JD weight 1.69',
    },
    {
      label: 'network engineer',
      status: 'missing',
      evidence: 'Not found in the source resume or the optimized resume.',
      source: 'JD weight 1.69',
    },
    {
      label: 'engineer',
      status: 'matched',
      evidence: 'Found in the source resume and preserved in the optimized resume.',
      source: 'JD weight 1',
    },
  ],
  preservedFacts: [
    {
      label: 'Identity and contact locked',
      detail: 'Contact fields come from the source resume and should not be rewritten by the morph.',
      tone: 'success',
    },
    {
      label: 'Education and credentials locked',
      detail: 'Education, certifications, licenses, and schools stay tied to the uploaded resume.',
      tone: 'success',
    },
    {
      label: 'Work history locked',
      detail: 'Employers, job titles, dates, and role count are restored from the source resume after morphing.',
      tone: 'success',
    },
    {
      label: 'Protected fields checked',
      detail: '23 protected field groups were checked after the rewrite.',
      tone: 'warning',
    },
    {
      label: 'Deterministic proof available',
      detail: 'TF-IDF proof moved from 16/100 to 16/100.',
      tone: 'success',
    },
  ],
  rejectedClaims: [
    {
      claim: 'experience[0].company',
      reason: 'The morph tried to change a protected fact.',
      decision: 'Restored source value: OSI Engineering (Apple)',
    },
    {
      claim: 'experience[0].role',
      reason: 'The morph tried to change a protected fact.',
      decision: 'Restored source value: Lead Project Manager',
    },
    {
      claim: 'experience[0].duration',
      reason: 'The morph tried to change a protected fact.',
      decision: 'Restored source value: 01/10/2024 – Present',
    },
    {
      claim: 'experience[0].achievements',
      reason: 'The morph tried to add or remove a protected fact.',
      decision: 'Restored source value: 8 entries',
    },
    {
      claim: 'experience[0].achievements[0]',
      reason: 'The morph tried to change a protected fact.',
      decision: 'Restored source value: Created field test cases and managed field-testing teams to gather real-world data',
    },
  ],
  changes: [
    {
      before: 'Source resume match was 16/100.',
      after: 'Optimized resume match is 16/100 at 100% morph strength.',
      rationale: 'The rewrite can improve match language, but protected resume facts still control what can be claimed.',
    },
  ],
  formattingChecks: [
    {
      label: 'No-invention guard',
      detail: '27 protected edits were blocked or restored.',
      tone: 'warning',
    },
    {
      label: 'Morph strength',
      detail: '100% rewrite strength was used. Maximum strength still keeps protected facts locked.',
      tone: 'warning',
    },
    {
      label: 'Template review',
      detail: 'Technical Signal is selected. Confirm headings and spacing before export.',
      tone: 'neutral',
    },
    {
      label: 'Export readiness',
      detail: 'Final save, tracking, PDF, and Word export can proceed after user review.',
      tone: 'success',
    },
  ],
};

export default async function ATSPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const params = await searchParams;
  if (params.module === 'proof-engine') {
    if (process.env.NODE_ENV === 'production') notFound();
    return (
      <div className="min-h-dvh bg-[var(--bg-page)] p-3 sm:p-4">
        <ProofEngineReport report={PROOF_ENGINE_VISUAL_FIXTURE} />
      </div>
    );
  }
  redirect('/suite/ats-analyzer?tab=preview');
}
