export type ResumeSourcePromptMode = 'all' | 'mobile' | 'none';

export function resolveResumeSourcePromptMode(input: {
  intentRequested: boolean;
  activeResumeId?: string | null;
  uploadReady: boolean;
}): ResumeSourcePromptMode {
  if (input.activeResumeId || input.uploadReady) return 'none';
  return input.intentRequested ? 'all' : 'mobile';
}
