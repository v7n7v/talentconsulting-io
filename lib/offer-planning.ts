/** Drafts from entered numbers only. This is a preference comparison, never a market appraisal. */
export function buildOfferPlanningBrief(input: { company: string; role: string; base?: number | null; total?: number | null; desiredBase?: number | null; desiredTotal?: number | null; currency: string; period: string; competingOffer?: boolean }) {
  const money = (value: number) => `${input.currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} per ${input.period}`;
  const offered = input.base != null ? `${money(input.base)} base pay` : input.total != null ? `${money(input.total)} total compensation` : 'written compensation';
  const target = input.desiredBase ?? input.desiredTotal;
  const targetKind = input.desiredBase ? 'base pay' : 'total compensation';
  return {
    counterStrategy: target
      ? `Your entered ${targetKind} target is ${money(target)}. Compare that preference with the written offer, benefits, working conditions and alternatives. Decide whether to accept, ask questions or propose a change.`
      : `Review the ${offered} offer against your priorities. Set a target only if it reflects your preferences; a counteroffer is optional.`,
    emailScript: `Thank you for the offer for the ${input.role} role at ${input.company}. I would like to clarify the written compensation and benefits before making my decision.${target ? ` Would there be flexibility toward ${money(target)} in ${targetKind}?` : ' Could you confirm the compensation components and decision deadline?'} I would welcome a conversation about the package and the expectations for the role.`,
    phoneScript: `Confirm the written offer, the ${input.period} pay period and which components are guaranteed.${target ? ` Explain your preference for ${money(target)} in ${targetKind} and ask whether there is flexibility.` : 'Ask questions about the components you need to evaluate.'} Agree on a time to follow up; do not imply acceptance until you decide.`,
    batna: input.competingOffer ? 'Compare the competing written offer using the same currency, pay period and guaranteed components.' : 'Consider your current position, ongoing search and other realistic alternatives. No competing offer is assumed.',
    leveragePoints: [], nonSalaryAsks: ['Discuss working arrangements if they matter to you.', 'Clarify time off, benefits and review timing.'],
    redFlags: ['No external compensation benchmark was supplied. Equity value and variable pay are not guaranteed cash.'],
  };
}
