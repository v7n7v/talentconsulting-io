# Evidence states

The four states are the core of this design system. They exist because Talent Studio's differentiator is review-first automation: the user is being asked to approve AI work before it goes to an employer, and they can only do that if they can see, at a glance, what the AI actually knows.

## The states

### Verified
The value came from the user's own resume, their confirmed profile, or a trusted external source. It is not a model claim.

Full `--text-primary` ink. A solid 2px left rule in `--border`. No badge needed on dense surfaces - verified is the baseline and marking it everywhere is noise.

### Inferred
The model reasoned its way here. It may well be right. It is not established.

`--text-secondary` ink. Dotted 2px left rule. Where space allows, name the basis: *"inferred from 3 years at Stripe"*. An inference the user can trace is an inference they can correct.

### Draft
Generated content awaiting review. The defining property is that it is *pending an action from the user*.

`--accent`-tinted surface at low opacity, `--accent` left rule, and a visible "Draft" marker. Draft state should feel unfinished - if a draft looks identical to approved content, users approve without reading, and the review-first promise becomes theatre.

### Missing
No evidence exists. **This is the one people get wrong.**

Dashed 1px outline in `--border-subtle`, `--text-muted` ink, and a plain statement of what's absent: *"No salary data for this role"*, *"Resume has no dates for this position"*.

**Never render missing as zero.** A missing ATS score is not 0%. An unmeasured salary is not $0. An unknown match is not "low fit". `design-qa.md` has stripped this pattern repeatedly, and it's worth understanding why it keeps coming back: a zero makes the layout look complete, and a gap looks like a bug. It isn't. The gap is the honest answer, and honesty about gaps is the product.

If the empty state looks broken, fix the empty state's design - don't fill it with a fake number.

## Encode with weight, not just hue

Ink, rule style and weight do the primary work; hue is secondary. Three reasons this matters:

1. **Colorblind users and forced-colors mode** get the same information.
2. **It survives 320px**, where a color-only legend has nowhere to live.
3. **It keeps the color budget small** - one accent plus four status colors, so accent still means something.

A useful test: screenshot the surface, desaturate it, and check you can still tell fact from inference. If you can't, the encoding is doing too little.

## Applying it

Surfaces where epistemic status genuinely matters:

- **Job cards** - which requirements are matched from the resume vs inferred from the title
- **Resume morph / diff** - what was preserved (verified) vs rewritten (draft)
- **ATS score** - what was measured vs estimated vs unmeasurable
- **Application packet review** - the whole point of the screen
- **Taco responses** - claims about the user vs claims about the world
- **Skill graph, story bank, interview prep** - anything asserting something about the user's experience

Surfaces where it doesn't: settings, navigation, billing, admin operations. Don't apply evidence states to things that aren't evidence - it dilutes the signal.

## The rule this enforces

Every value the AI produced carries a state. There is no unmarked model output in this product.

That's a strong constraint and it's deliberate. The moment some AI output is unmarked, the user has to guess which surfaces are trustworthy - and they'll guess wrong in the direction that's worst for them, which is trusting a fabrication in front of an employer.

## Interaction with truth locks

Evidence states are the *visual* layer of a guarantee that is enforced in `firestore.rules` and re-applied at the PDF/DOCX export boundary (`lib/resume-export-truth.ts`). The database refuses to let a client rewrite a verified resume version once a guardrail report is attached.

So the UI is not the enforcement - it's the explanation. Never build a UI affordance that implies a user can edit something the rules will reject; that produces a confusing failure instead of a clear one. If the data layer says a field is locked, the interface should show it locked, with the reason.
