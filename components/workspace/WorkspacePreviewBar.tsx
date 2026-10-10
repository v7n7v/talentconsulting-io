'use client';

import './workspace-preview.css';

import {getWorkspacePreviewScenario, isIsolatedWorkspacePreview, type WorkspacePreviewScenario} from '@/lib/workspace-preview';

export default function WorkspacePreviewBar() {
  if (!isIsolatedWorkspacePreview()) return null;
  const scenario = getWorkspacePreviewScenario();
  const choose = (value: WorkspacePreviewScenario) => {
    document.cookie = `taco-preview-state=${value}; Path=/; SameSite=Strict`;
    window.location.assign('/suite');
  };
  return <aside className="workspace-preview-bar" aria-label="Local preview controls">
    <div><strong>Local preview · fictional data</strong><p>Changes stay in this browser session. External services are blocked.</p></div>
    <label>Example state <select aria-label="Example state" value={scenario} onChange={event => choose(event.target.value as WorkspacePreviewScenario)}>
      <option value="new">New account</option><option value="active">Ready to search</option><option value="review">Drafts and next actions</option><option value="partial">Partial data failure</option>
    </select></label>
  </aside>;
}
