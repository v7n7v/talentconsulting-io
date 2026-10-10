import type { ToolGuidanceConfig, ToolGuidanceStep } from './tool-guidance';
import type { ResumeSection } from './resume-workflow';

export function resumeGuidanceContext(documentId: string | null, sourceId: string | null | undefined,
  sourceContentHash: string | null | undefined, editorEpoch: number): string {
  return JSON.stringify(['resume', documentId || 'working', sourceId || 'local', sourceContentHash || null, editorEpoch]);
}

export interface ResumeGuidanceState {
  contextKey: string;
  section: ResumeSection;
  start: boolean;
  confirming: boolean;
  editing: boolean;
  reviewing: boolean;
  hasSource: boolean;
  hasJob: boolean;
  pending: boolean;
  sourceError: boolean;
  hasCandidate: boolean;
  stale: boolean;
  reviewRequired: boolean;
  templateAllowed: boolean;
  careerDetails?: boolean;
}

/** This adapter only describes work. It has no action or navigation callbacks. */
export function createResumeGuidance(state: ResumeGuidanceState): ToolGuidanceConfig {
  const step = (id: string, title: string, description: string, anchor: string,
    availability: ToolGuidanceStep['availability'] = 'available', unavailableReason?: string): ToolGuidanceStep =>
    ({ id, title, description, anchor, availability, unavailableReason });
  const sourceReason = state.pending ? 'Your import is still processing. Your work stays here.'
    : state.sourceError ? 'The import did not finish. Use the recovery options beside your source.'
    : 'Import or enter a resume, then confirm its facts before using source-dependent actions.';
  const outputStatus = state.stale ? 'stale' : state.pending ? 'waiting' : 'available';
  const outputReason = state.stale ? 'The source, job or settings changed. Review the retained version and explicitly choose your next step.'
    : 'Wait for the current operation to finish; the guide will not start another one.';
  const preferredChapterId = state.confirming ? 'confirm' : state.careerDetails ? 'career' : state.editing ? 'edit'
    : state.start ? 'source' : state.reviewing ? 'review' : state.section;
  return {
    toolId: 'resume', version: '1', title: state.careerDetails ? 'Your career details' : 'Your resumes', contextKey: state.contextKey,
    preferredChapterId,
    chapters: [
      ...(state.careerDetails ? [{ id: 'career', title: 'Keep reusable career details', steps: [
        step('career-content', 'Describe your real experience', 'Edit reusable roles, achievements and skills. These details are separate from your existing resume versions.', 'resume-editor'),
        step('career-save', 'Confirm and save deliberately', 'Use the actual save action after checking the facts. The page reports whether this revision was saved.', 'experience-save', state.pending ? 'waiting' : 'available', 'Wait for the current save or import to finish.'),
        step('career-reuse', 'Use the details when useful', 'Create a resume from these confirmed details when you choose. Guidance will not replace your current document.', 'experience-reuse'),
      ] }] : []),
      { id: 'source', title: 'Bring your resume', description: state.sourceError ? sourceReason : undefined, availability: state.start && state.pending ? 'waiting' : 'available', unavailableReason: sourceReason, steps: [
        step('start', 'Start with your content', 'Upload a PDF, Word document or text file. You can also paste your resume or start blank.', 'resume-start', state.start ? 'available' : 'waiting', 'Open Source yourself to import or enter content; guidance will not change your document.'),
        step('alternatives', 'Choose the way that suits you', 'Paste text or start blank if you do not have a file. These are independent ways to begin.', 'resume-alternatives', state.start ? 'available' : 'waiting', 'Alternative starts are in the Source section.'),
        step('library', 'Return to saved work', 'Open a saved resume or continue a retained draft. Importing a file is optional when you already have usable work.', 'resume-library', state.start ? 'available' : 'waiting', 'Your saved-resume library is on the Source page.'),
      ] },
      { id: 'confirm', title: 'Confirm the facts', availability: state.confirming ? 'available' : 'waiting', unavailableReason: sourceReason, steps: [
        step('source-review', 'Compare the import with your source', 'Check names, roles, dates and achievements. Correct extraction mistakes before confirming the resume.', 'resume-source-review'),
        step('source-confirm', 'Confirm when you are ready', 'Use the actual confirmation action after reviewing the facts. You can continue to a job description or use the resume without AI tailoring.', 'resume-source-confirm', state.pending ? 'waiting' : 'available', sourceReason),
      ] },
      { id: 'edit', title: 'Edit your resume', availability: state.editing ? 'available' : 'waiting', unavailableReason: 'Open the content editor yourself. Guidance never switches stages or replaces edits.', steps: [
        step('content', 'Keep the facts yours', 'Edit your real experience directly. Changes stay in this working document until you use its save controls.', 'resume-editor'),
        step('continue', 'Choose what comes next', 'Continue to a job description if you want tailoring, or choose Design for a general resume.', 'resume-next'),
      ] },
      { id: 'target', title: 'Choose your target', steps: [
        step('job', 'Bring the job description', 'Paste the actual posting to guide wording. Job targeting is optional; a general resume can continue without an AI rewrite.', 'resume-job', state.section === 'target' ? 'available' : 'waiting', 'Open Job Description yourself when you want to tailor this resume.'),
        step('target-next', 'Check the target before continuing', 'Correct the role and company details, then use the page action to choose your next step.', 'resume-next', state.section === 'target' ? 'available' : 'waiting', 'The continuation action appears in Job Description.'),
      ] },
      { id: 'shape', title: 'Shape the wording', steps: [
        step('strength', 'Choose rewrite intensity', 'Adjust the wording strength. Employers, qualifications, dates and other protected facts remain locked.', 'resume-strength', state.section === 'shape' ? outputStatus : 'waiting', state.section === 'shape' ? outputReason : 'Open AI Morph yourself to inspect these settings.'),
        step('generate', 'Generate only when ready', 'Use the actual generation button after confirming the source and job. You can also continue without AI tailoring.', 'resume-generate', state.pending ? 'waiting' : !state.hasSource || !state.hasJob ? 'blocked' : 'available', !state.hasSource ? sourceReason : !state.hasJob ? 'Add a job description before a job-specific rewrite.' : outputReason),
        step('open-review', 'Inspect proposed changes', 'A generated version needs your review. Keep truthful wording and reject unsupported additions before moving on.', 'resume-open-review', state.hasCandidate ? outputStatus : 'waiting', state.hasCandidate ? outputReason : 'A generated version must exist before its review control is available.'),
      ] },
      { id: 'review', title: 'Review the rewrite', availability: state.reviewing ? outputStatus : 'waiting', unavailableReason: state.reviewing ? outputReason : 'Open the review yourself after a rewrite, or continue with your confirmed source without AI.', steps: [
        step('changes', 'Decide what to keep', 'Compare proposed wording with your source. Guidance will not accept changes or resolve factual questions for you.', 'resume-review'),
        step('review-next', 'Continue after your review', 'Use the review controls to resolve required changes, then continue to Design when ready.', 'resume-review-next'),
      ] },
      { id: 'design', title: 'Design the document', steps: [
        step('design', 'Choose a layout you can read', 'Explore templates and customise the actual document. Template access follows your existing plan.', 'resume-design', state.section === 'design' ? 'available' : 'waiting', 'Open Design yourself. Guidance does not change your selected template.'),
        step('design-next', 'Move to the actual export', 'Continue to Export & Save to inspect the generated pages and name this version.', 'resume-next', !state.templateAllowed ? 'blocked' : state.section === 'design' ? 'available' : 'waiting', !state.templateAllowed ? 'Choose an available template or review your current plan before exporting.' : 'The continuation action appears in Design.'),
      ] },
      { id: 'ship', title: 'Inspect, save and export', steps: [
        step('export', 'Inspect the real pages', 'Check the actual export before downloading. A preview is not proof that the version was saved to your account.', 'resume-export', state.section === 'ship' ? outputStatus : 'waiting', state.section === 'ship' ? outputReason : 'Open Export & Save yourself when ready.'),
        step('save', 'Choose where your work goes', 'Name and save this version to your account, or download it. The page reports the actual outcome; guidance cannot save or export for you.', 'resume-save', state.reviewRequired ? 'blocked' : state.section === 'ship' ? outputStatus : 'waiting', state.reviewRequired ? 'Resolve the required review decisions before using this draft.' : state.section === 'ship' ? outputReason : 'Save and download controls appear in Export & Save.'),
      ] },
    ],
  };
}
