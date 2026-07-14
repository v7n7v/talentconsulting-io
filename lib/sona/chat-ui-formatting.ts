export interface SonaChatActionPlanLike {
  intent?: string;
  capabilityId?: string;
  plannedSteps?: string[];
  approvalRequired?: boolean;
}

export type SonaMessageBlock =
  | { type: 'paragraph' | 'heading'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

const SONA_PLAN_LABELS: Record<string, string> = {
  'jobs.prepare_packet': 'Prepare application packet',
  'jobs.find_rank_prepare': 'Find and rank jobs',
  'resume.morph_for_job': 'Tailor resume for this job',
  'resume.explain_intelligence': 'Review resume strategy',
  'oracle.decide_strategy': 'Analyze job fit',
  'stories.match_answer': 'Match interview story',
  'interview.prepare_session': 'Prepare interview session',
  'skill_bridge.plan_verify': 'Build skill plan',
  'linkedin.optimize_positioning': 'Improve LinkedIn positioning',
  'writing.trust_rewrite': 'Polish writing',
  'applications.next_actions': 'Plan application follow-up',
};

const SONA_STAGE_LABELS: Record<string, string> = {
  understand: 'Understand',
  plan: 'Plan',
  create: 'Create',
  verify: 'Verify',
  save: 'Save',
};

/**
 * Normalize model output before it is persisted or rendered. Headings become
 * plain labels so old messages and new replies share the same chat treatment.
 */
export function normalizeSonaMessage(raw: string): string {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_, heading: string) => `${heading.replace(/[:\s]+$/, '')}:`)
    .replace(/^[ \t]*```(?:markdown|md|text)?[ \t]*$/gim, '')
    .replace(/^[ \t]*```[ \t]*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert lightweight markdown into semantic chat blocks for the Sona UI. */
export function parseSonaMessage(raw: string): SonaMessageBlock[] {
  const lines = normalizeSonaMessage(raw).split('\n');
  const blocks: SonaMessageBlock[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', ordered: listOrdered, items: listItems });
      listItems = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const number = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (bullet || number) {
      const ordered = Boolean(number);
      if (listItems.length > 0 && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems.push(bullet?.[1] || number?.[1] || '');
      return;
    }

    flushList();
    if (!trimmed) return;

    if (/^[A-Z][A-Za-z0-9 /&+()'’.,-]{2,64}:$/.test(trimmed)) {
      blocks.push({ type: 'heading', text: trimmed.slice(0, -1).trim() });
      return;
    }

    blocks.push({ type: 'paragraph', text: trimmed });
  });

  flushList();
  return blocks;
}

export function formatSonaPlanTitle(plan?: SonaChatActionPlanLike | null) {
  if (!plan) return 'Sona plan';
  return (plan.capabilityId && SONA_PLAN_LABELS[plan.capabilityId]) || plan.intent || 'Sona plan';
}

export function formatSonaPlanSteps(plan?: SonaChatActionPlanLike | null) {
  const steps = Array.isArray(plan?.plannedSteps) ? plan.plannedSteps : [];
  if (steps.length === 0) return plan?.approvalRequired ? 'Review required' : 'Plan ready';
  return steps.map((step) => SONA_STAGE_LABELS[step] || step).join(' -> ');
}
