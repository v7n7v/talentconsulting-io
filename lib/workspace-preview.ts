/** Explicitly opt-in, development-only fixtures. Never an authentication mode. */
export function isIsolatedWorkspacePreview() {
  return process.env.NODE_ENV === 'development'
    && process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW === 'true'
    && process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE === 'true';
}

export type WorkspacePreviewScenario = 'new' | 'active' | 'review' | 'partial';
export function readWorkspacePreviewScenario(value: unknown): WorkspacePreviewScenario {
  return value === 'new' || value === 'active' || value === 'partial' ? value : 'review';
}
export function getWorkspacePreviewScenario(): WorkspacePreviewScenario {
  if (!isIsolatedWorkspacePreview() || typeof document === 'undefined') return 'review';
  return readWorkspacePreviewScenario(document.cookie.split('; ').find(item => item.startsWith('taco-preview-state='))?.split('=')[1]);
}
