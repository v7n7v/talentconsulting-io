import { z } from 'zod';
export const applicationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const amount = z.number().finite().positive().max(1_000_000_000).nullable().optional();
export const offerDetailsSchema = z.object({
  base: amount, total: amount, bonus: amount, signOn: amount, desiredBase: amount, desiredTotal: amount,
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), period: z.enum(['year', 'month', 'hour']).default('year'),
  equity: z.string().max(4000).nullable().optional(), benefits: z.string().max(4000).nullable().optional(),
  context: z.string().max(8000).nullable().optional(), deadline: z.string().max(40).nullable().optional(), competingOffer: z.boolean().optional(),
}).strict();
const text = z.string().max(12000).optional();
export const offerCommandSchema = z.object({
  applicationId: applicationIdSchema,
  expectedOfferSignature: z.string().max(24000).optional(),
  offerDetails: offerDetailsSchema.nullable().optional(),
  negotiationBrief: z.object({ method: z.literal('entered_offer_v1').optional(), sourceOfferSignature: z.string().max(24000).optional(), counterStrategy: text, emailScript: text, phoneScript: text, batna: text,
    leveragePoints: z.array(z.string().max(2000)).max(20).optional(), nonSalaryAsks: z.array(z.string().max(2000)).max(20).optional(),
    redFlags: z.array(z.string().max(2000)).max(20).optional(),
  }).strict().nullable().optional(),
  negotiationStatus: z.enum(['not_started','drafted','counter_sent','accepted','declined']).optional(),
}).strict().superRefine((value, context) => {
  if (value.negotiationBrief && value.expectedOfferSignature === undefined) context.addIssue({ code: 'custom', path: ['expectedOfferSignature'], message: 'Reload the saved offer before saving a generated brief.' });
});
export const manualApplicationSchema = z.object({
  requestId: applicationIdSchema,
  company: z.string().trim().min(1).max(160), role: z.string().trim().min(1).max(200),
  url: z.union([z.literal(''), z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value), 'Use an http or https posting link.')]).default(''),
  submitted: z.boolean(), sentDate: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (value.submitted && (!value.sentDate || !/^\d{4}-\d{2}-\d{2}$/.test(value.sentDate) || !Number.isFinite(Date.parse(value.sentDate)) || new Date(value.sentDate).toISOString().slice(0,10) !== value.sentDate || value.sentDate > new Date().toISOString().slice(0,10))) {
    context.addIssue({ code: 'custom', path:['sentDate'], message: 'Enter the actual submission date, today or earlier.' });
  }
});
export function offerUpdatePatch(existing: Record<string, any>, command: z.infer<typeof offerCommandSchema>, now: string) {
  const patch: Record<string, any> = { last_updated: now, updatedAt: now };
  if (command.offerDetails !== undefined) {
    patch.offer_details = command.offerDetails;
    patch.offer_amount = command.offerDetails?.base ?? command.offerDetails?.total ?? null;
    // Changing inputs invalidates a brief based on an older offer.
    if (JSON.stringify(existing.offer_details) !== JSON.stringify(command.offerDetails) && command.negotiationBrief === undefined) {
      patch.negotiation_brief = null; patch.negotiation_generated_at = null;
    }
  }
  if (command.negotiationBrief !== undefined) { patch.negotiation_brief = command.negotiationBrief; patch.negotiation_generated_at = command.negotiationBrief ? now : null; }
  if (command.negotiationStatus) {
    patch.negotiation_status = command.negotiationStatus;
    if (['accepted','declined'].includes(command.negotiationStatus)) {
      patch.status = command.negotiationStatus === 'accepted' ? 'accepted' : 'withdrawn';
      if (existing.negotiation_status !== command.negotiationStatus) {
        patch.offer_history = [...(Array.isArray(existing.offer_history) ? existing.offer_history : []), { decision: command.negotiationStatus, recorded_at: now }];
      }
    }
  }
  return patch;
}

/** Canonical optimistic token for the entered offer; it contains no generated brief. */
export function offerInputSignature(details: unknown) {
  if (details == null) return 'null';
  const parsed = offerDetailsSchema.safeParse(details);
  return JSON.stringify(parsed.success ? parsed.data : details);
}
