/**
 * Navigation describes where work lives. Query-based shortcuts are separate:
 * opening Applications must never silently choose its Follow-ups view.
 * This is a UI contract, not an entitlement or authorization policy.
 */
export type WorkspaceSection = 'home' | 'experience' | 'roles' | 'applications' | 'interviews' | 'assistant' | 'more' | 'utility' | 'admin' | 'internal';
export type WorkspacePlacement = 'primary' | 'assistant' | 'tool' | 'writing' | 'utility';

export interface WorkspaceDestination {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: string;
  section: WorkspaceSection;
  placement: WorkspacePlacement;
  keywords: readonly string[];
  guestHref?: string;
}

export const workspaceDestinations: readonly WorkspaceDestination[] = [
  { id: 'home', label: 'Home', description: 'Your next action and recent work', path: '/suite', icon: 'home', section: 'home', placement: 'primary', keywords: ['dashboard', 'today', 'inbox'], guestHref: '/suite' },
  { id: 'experience', label: 'Resumes', description: 'Create, edit, design and export your resumes', path: '/suite/resume', icon: 'description', section: 'experience', placement: 'primary', keywords: ['resume studio', 'cv', 'source', 'upload', 'editor', 'career details'], guestHref: '/suite/resume' },
  { id: 'roles', label: 'Find roles', description: 'Search, compare and save jobs', path: '/suite/job-search', icon: 'work_history', section: 'roles', placement: 'primary', keywords: ['job search', 'opportunities', 'radar'] },
  { id: 'applications', label: 'Applications', description: 'Review drafts and track applications', path: '/suite/applications', icon: 'work', section: 'applications', placement: 'primary', keywords: ['tracker', 'pipeline', 'follow-ups', 'offer'] },
  { id: 'interviews', label: 'Interview prep', description: 'Practice answers and review interviews', path: '/suite/interview-sim', icon: 'interpreter_mode', section: 'interviews', placement: 'primary', keywords: ['interview studio', 'mock', 'practice', 'debrief'] },
  { id: 'assistant', label: 'Ask Taco', description: 'Help with the work in front of you', path: '/suite/agent', icon: 'auto_awesome', section: 'assistant', placement: 'assistant', keywords: ['sona', 'assistant', 'chat', 'coach'], guestHref: '/suite/agent' },
  { id: 'ats-analyzer', label: 'Check a resume', description: 'ATS preview and role-specific checks', path: '/suite/ats-analyzer', icon: 'scanner', section: 'experience', placement: 'tool', keywords: ['ats analyzer', 'score', 'match', 'proof'], guestHref: '/suite/ats-analyzer?tab=score' },
  { id: 'stories', label: 'Story bank', description: 'Save examples from your experience', path: '/suite/agent/stories', icon: 'auto_stories', section: 'experience', placement: 'tool', keywords: ['star', 'answers', 'evidence'] },
  { id: 'market-oracle', label: 'Analyze a role', description: 'Explore a job description and fit', path: '/suite/job-search?view=analysis', icon: 'troubleshoot', section: 'roles', placement: 'tool', keywords: ['market oracle', 'jd', 'decoder', 'fit'] },
  { id: 'agent-queue', label: 'Drafts to review', description: 'Prepared application packets awaiting your decision', path: '/suite/applications?view=review', icon: 'pending_actions', section: 'applications', placement: 'tool', keywords: ['agent queue', 'prepared', 'approval', 'packet'] },
  { id: 'cover-letter', label: 'Cover letters', description: 'Write a letter for a selected role', path: '/suite/cover-letter', icon: 'mail', section: 'applications', placement: 'tool', keywords: ['letter', 'documents', 'writing'] },
  { id: 'network', label: 'Your network', description: 'Contacts and follow-ups', path: '/suite/network', icon: 'contacts', section: 'more', placement: 'tool', keywords: ['network crm', 'recruiter', 'outreach'] },
  { id: 'skill-bridge', label: 'Learning plan', description: 'Explore skills, learning and study memory', path: '/suite/skill-bridge', icon: 'route', section: 'more', placement: 'tool', keywords: ['skill bridge', 'gap', 'vault', 'memory'] },
  { id: 'gallery', label: 'Writing toolkit', description: 'Grammar, summaries, citations and more', path: '/suite/gallery', icon: 'widgets', section: 'more', placement: 'tool', keywords: ['gallery', 'writing', 'tools'], guestHref: '/suite/gallery' },
  { id: 'writing-tools', label: 'Humanize writing', description: 'Revise tone and phrasing', path: '/suite/writing-tools', icon: 'edit_note', section: 'more', placement: 'tool', keywords: ['humanize', 'polish', 'rewrite'], guestHref: '/tools/ai-humanizer' },
  { id: 'linkedin', label: 'LinkedIn profile', description: 'Work on your profile and professional summary', path: '/suite/linkedin', icon: 'person', section: 'more', placement: 'tool', keywords: ['profile', 'headline', 'bio'] },
  { id: 'jd-generator', label: 'Job description writer', description: 'Draft a job description', path: '/suite/jd-generator', icon: 'post_add', section: 'more', placement: 'tool', keywords: ['jd generator', 'hiring'] },
  { id: 'intelligence', label: 'Career insights', description: 'Activity, trends and career context', path: '/suite/intelligence', icon: 'insights', section: 'more', placement: 'tool', keywords: ['career intelligence', 'analytics', 'health'] },
  { id: 'pulse', label: 'Weekly review', description: 'Review weekly activity and check in', path: '/suite/intelligence?tab=weekly', icon: 'monitoring', section: 'more', placement: 'tool', keywords: ['pulse', 'market', 'trends'] },
  { id: 'agent-quality', label: 'Application results', description: 'Review application and pipeline metrics', path: '/suite/intelligence?tab=results', icon: 'query_stats', section: 'applications', placement: 'tool', keywords: ['agent quality', 'results', 'metrics'] },
  { id: 'negotiate', label: 'Offer planning', description: 'Continue offer work in Applications', path: '/suite/negotiate', icon: 'handshake', section: 'applications', placement: 'tool', keywords: ['negotiate', 'salary', 'offer'] },
  { id: 'settings', label: 'Settings', description: 'Account, privacy and preferences', path: '/suite/settings', icon: 'settings', section: 'utility', placement: 'utility', keywords: ['account', 'privacy', 'notifications'] },
  { id: 'upgrade', label: 'Plans and usage', description: 'Compare plans and included usage', path: '/suite/upgrade', icon: 'diamond', section: 'utility', placement: 'utility', keywords: ['upgrade', 'subscription', 'limits'] },
  { id: 'feedback', label: 'Help and feedback', description: 'Report a problem or share feedback', path: '/suite/feedback', icon: 'help', section: 'utility', placement: 'utility', keywords: ['help', 'support', 'feedback'] },
  ...[
    ['grammar-checker', 'Grammar check', 'Check spelling and grammar'],
    ['word-counter', 'Word count', 'Count words and characters'],
    ['citation-machine', 'Citations', 'Create a citation'],
    ['summarizer', 'Summarize text', 'Pull out the main points'],
    ['tone-analyzer', 'Check tone', 'Review how your writing sounds'],
    ['paraphraser', 'Paraphrase text', 'Try another way to phrase a passage'],
    ['email-composer', 'Email writer', 'Draft a message for review'],
    ['thesis-generator', 'Thesis writer', 'Draft a thesis statement'],
  ].map(([id, label, description]): WorkspaceDestination => ({
    id, label, description, path: `/suite/gallery?tool=${id}`, icon: 'edit_note', section: 'more', placement: 'writing', keywords: [id, 'writing', 'gallery'],
    // Gallery enforces the selected tool's own tier and usage policy.
    guestHref: `/suite/gallery?tool=${id}`,
  })),
];

export const primaryWorkspaceDestinations = workspaceDestinations.filter(item => item.placement === 'primary');
export const assistantWorkspaceDestination = workspaceDestinations.find(item => item.id === 'assistant')!;
export const moreWorkspaceDestinations = workspaceDestinations.filter(item => item.placement === 'tool');

export interface WorkspaceQuickAction {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: string;
  keywords: readonly string[];
}

export const workspaceQuickActions: readonly WorkspaceQuickAction[] = [
  { id: 'review-agent-queue', label: 'Review application drafts', description: 'Open prepared packets that need your decision', path: '/suite/applications?view=review', icon: 'pending_actions', keywords: ['queue', 'review', 'approval', 'packet'] },
  { id: 'upload-resume', label: 'Upload or check a resume', description: 'Open the resume check workflow', path: '/suite/resume?mobileAction=check', icon: 'upload_file', keywords: ['upload', 'resume', 'cv', 'check'] },
  { id: 'save-job', label: 'Save a job', description: 'Capture a role before preparing an application', path: '/suite/job-search?intent=save-job', icon: 'bookmark_add', keywords: ['save', 'job', 'role', 'posting'] },
  { id: 'due-follow-ups', label: 'Review follow-ups', description: 'Open the follow-ups view of Applications', path: '/suite/applications?mobileView=followups', icon: 'forward_to_inbox', keywords: ['follow up', 'email', 'recruiter', 'due'] },
  { id: 'start-mock-interview', label: 'Start a quick interview drill', description: 'Open Interview prep in quick drill mode', path: '/suite/interview-sim?mode=quick_drill', icon: 'interpreter_mode', keywords: ['interview', 'mock', 'practice', 'drill'] },
  { id: 'study-cards', label: 'Study interview cards', description: 'Open saved interview study cards', path: '/suite/interview-sim?mode=study_cards', icon: 'style', keywords: ['flashcards', 'study', 'interview'] },
  { id: 'review-debrief', label: 'Review an interview debrief', description: 'Open the debrief review workspace', path: '/suite/interview-sim?mode=debrief_review', icon: 'rate_review', keywords: ['debrief', 'interview', 'review'] },
  { id: 'study-memory', label: 'Review study memory', description: 'Open learning history and saved study material', path: '/suite/skill-bridge?view=memory', icon: 'history_edu', keywords: ['vault', 'memory', 'learning'] },
  { id: 'billing', label: 'Open billing and plan', description: 'Review billing, plan and limits', path: '/suite/settings?tab=subscription', icon: 'credit_card', keywords: ['billing', 'stripe', 'subscription', 'usage'] },
];

export interface WorkspaceRoute {
  path: string;
  destinationId: string | null;
  section: WorkspaceSection;
  /** Existing compatibility target; the manifest does not perform redirects. */
  canonicalPath?: string;
}

/** Every suite page is accounted for, including routes excluded from customer menus. */
export const workspaceRoutes: readonly WorkspaceRoute[] = [
  ...workspaceDestinations.filter(item => item.placement !== 'writing' && !item.path.includes('?')).map(item => ({ path: item.path, destinationId: item.id, section: item.section })),
  { path: '/suite/ats-score', destinationId: 'ats-analyzer', section: 'experience', canonicalPath: '/suite/ats-analyzer' },
  { path: '/suite/ats-preview', destinationId: 'ats-analyzer', section: 'experience', canonicalPath: '/suite/ats-analyzer' },
  { path: '/suite/flashcards', destinationId: 'interviews', section: 'interviews', canonicalPath: '/suite/interview-sim?mode=study_cards' },
  { path: '/suite/interview-debrief', destinationId: 'interviews', section: 'interviews', canonicalPath: '/suite/interview-sim?mode=debrief_review' },
  { path: '/suite/vault', destinationId: 'skill-bridge', section: 'more', canonicalPath: '/suite/skill-bridge?view=memory' },
  { path: '/suite/market-oracle', destinationId: 'market-oracle', section: 'roles', canonicalPath: '/suite/job-search?view=analysis' },
  { path: '/suite/agent/queue', destinationId: 'agent-queue', section: 'applications', canonicalPath: '/suite/applications?view=review' },
  { path: '/suite/agent/quality', destinationId: 'agent-quality', section: 'applications', canonicalPath: '/suite/intelligence?tab=results' },
  { path: '/suite/pulse', destinationId: 'pulse', section: 'more', canonicalPath: '/suite/intelligence?tab=weekly' },
  { path: '/suite/analytics', destinationId: 'intelligence', section: 'more', canonicalPath: '/suite/intelligence?tab=results' },
  { path: '/suite/gallery/taco', destinationId: null, section: 'internal' },
  { path: '/suite/gallery/sona', destinationId: null, section: 'internal', canonicalPath: '/suite/gallery/taco' },
  ...['/suite/admin-preview', '/suite/admin', '/suite/admin/access', '/suite/admin/audit', '/suite/admin/calibration', '/suite/admin/email', '/suite/admin/finance', '/suite/admin/observability', '/suite/admin/operations', '/suite/admin/support', '/suite/admin/users'].map(path => ({ path, destinationId: null, section: 'admin' as const })),
];

export function getWorkspaceRoute(href: string): WorkspaceRoute | undefined {
  const current = new URL(href, 'https://workspace.local');
  const pathname = current.pathname.replace(/\/$/, '') || '/';
  const queryDestination = workspaceDestinations.find(item => { const target = new URL(item.path, 'https://workspace.local'); return target.search && target.pathname === pathname && [...target.searchParams].every(([key,value]) => current.searchParams.get(key) === value); });
  if (queryDestination) return { path: pathname, destinationId: queryDestination.id, section: queryDestination.section };
  return workspaceRoutes.find(route => {
    const candidate = new URL(route.path, 'https://workspace.local');
    return candidate.pathname === pathname && [...candidate.searchParams].every(([key,value]) => current.searchParams.get(key) === value);
  });
}

export function isWorkspaceDestinationActive(id: string, href: string): boolean {
  const route = getWorkspaceRoute(href);
  const destination = workspaceDestinations.find(item => item.id === id);
  if (!route || !destination) return false;
  if (destination.placement === 'primary') return route.section === destination.section;
  if (destination.placement === 'writing') {
    return route.path.split('?')[0] === '/suite/gallery' && new URLSearchParams(href.split('?')[1]?.split('#')[0]).get('tool') === id;
  }
  return route.destinationId === id;
}

/** Preserve explicit supported query modes; only the unqualified ATS entry needs a guest fallback. */
export function getGuestWorkspaceHref(href: string): string | undefined {
  const exact = workspaceDestinations.find(item => item.path === href);
  if (exact?.guestHref) return exact.guestHref;
  const route = getWorkspaceRoute(href);
  const destination = workspaceDestinations.find(item => item.id === route?.destinationId);
  if (!destination?.guestHref) return undefined;
  if (destination.guestHref.split('?')[0] !== destination.path) return destination.guestHref;
  if (route?.canonicalPath) return destination.guestHref;
  return href;
}
