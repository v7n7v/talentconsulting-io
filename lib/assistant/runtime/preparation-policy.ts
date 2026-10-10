import { canPrepareApplicationPackets } from '@/lib/assistant/workload-policy';
import {
  PreparationCommandSchema, PreparationRequestSchema, SourceBindingSchema, CurrentPreparationAccessSchema,
  bindPosting, preparationFingerprint,
  type CurrentPreparationAccess, type PreparationCommand,
} from './preparation-contract';

export type PreparationAction = 'read_source' | 'analyze' | 'draft_packet' | 'save_internal';
export type PreparationDenial =
  | 'invalid_command' | 'owner_mismatch' | 'restore_quarantined' | 'deleted' | 'revoked'
  | 'authority_changed' | 'policy_changed' | 'not_yet_valid' | 'expired'
  | 'scope_mismatch' | 'entitlement_required' | 'action_not_allowed' | 'budget_exhausted';
export type PreparationDecision = { allowed: true } | { allowed: false; reason: PreparationDenial };

/**
 * Pure P1 policy, not an authorization endpoint. The future adapter must load
 * command/access/source inside its server transaction and repeat this check at
 * claim and commit. Passing a model/client object as command would violate this
 * boundary. Provider actions check a NEW reservation; reconcile a completed
 * attempt before using save_internal at its commit. No production caller is
 * wired to this module yet.
 */
export function evaluatePreparation(input: {
  command: unknown;
  request: unknown;
  currentSource: unknown;
  access: CurrentPreparationAccess;
  action: string;
  nowMs: number;
  incurredCostMicros: number;
  reservedCostMicros: number;
  providerAttempts: number;
  reservedProviderAttempts: number;
  nextProviderReservationMicros: number;
}): PreparationDecision {
  const command = PreparationCommandSchema.safeParse(input.command);
  const request = PreparationRequestSchema.safeParse(input.request);
  const source = SourceBindingSchema.safeParse(input.currentSource);
  const currentAccess = CurrentPreparationAccessSchema.safeParse(input.access);
  const deny = (reason: PreparationDenial): PreparationDecision => ({ allowed: false, reason });
  if (!command.success || !request.success || !source.success || !currentAccess.success
    || !Number.isSafeInteger(input.nowMs) || input.nowMs <= 0) return deny('invalid_command');
  const grant = command.data;
  const access = currentAccess.data;
  if (grant.userId !== access.userId) return deny('owner_mismatch');
  if (access.restoreState !== 'ready') return deny('restore_quarantined');
  if (access.deleted) return deny('deleted');
  if (access.revoked) return deny('revoked');
  if (grant.authorityEpoch !== access.authorityEpoch || grant.deletionEpoch !== access.deletionEpoch) return deny('authority_changed');
  if (grant.policyVersion !== access.policyVersion) return deny('policy_changed');
  if (input.nowMs < grant.issuedAtMs) return deny('not_yet_valid');
  if (input.nowMs >= grant.expiresAtMs) return deny('expired');
  if (request.data.resumeVersionId !== source.data.id
    || request.data.requestId !== grant.requestId
    || request.data.operation !== grant.operation
    || source.data.collection !== grant.source.collection
    || source.data.id !== grant.source.id
    || source.data.hash !== grant.source.hash
    || bindPosting(request.data.posting.text).hash !== grant.posting.hash
    || preparationFingerprint(request.data, source.data) !== grant.requestFingerprint) return deny('scope_mismatch');
  if (grant.operation === 'prepare_packet' ? !canPrepareApplicationPackets(access.tier)
    : !['pro', 'studio', 'god'].includes(access.tier)) return deny('entitlement_required');
  const permitted: readonly string[] = grant.operation === 'prepare_packet'
    ? ['read_source', 'analyze', 'draft_packet', 'save_internal']
    : ['read_source', 'analyze', 'save_internal'];
  if (!permitted.includes(input.action)) return deny('action_not_allowed');
  const isProviderAction = input.action === 'analyze' || input.action === 'draft_packet';
  const counters = [input.incurredCostMicros, input.reservedCostMicros, input.providerAttempts,
    input.reservedProviderAttempts, input.nextProviderReservationMicros];
  if (counters.some(value => !Number.isSafeInteger(value) || value < 0)
    || input.incurredCostMicros > grant.budget.maxCostMicros
    || input.providerAttempts > grant.budget.maxProviderAttempts
    || input.reservedCostMicros > grant.budget.maxCostMicros - input.incurredCostMicros
    || input.reservedProviderAttempts > grant.budget.maxProviderAttempts - input.providerAttempts
    || (isProviderAction && (input.nextProviderReservationMicros <= 0
      || input.nextProviderReservationMicros > grant.budget.maxCostMicros - input.incurredCostMicros - input.reservedCostMicros
      || input.providerAttempts + input.reservedProviderAttempts >= grant.budget.maxProviderAttempts))) return deny('budget_exhausted');
  return { allowed: true };
}

/**
 * Run inside the eventual command-creation transaction; does no I/O. A replay
 * returns the stored command, never the candidate's renewed deadline/budget.
 * Revalidate that returned command against current authority before using it.
 */
export function resolvePreparationReplay(
  existing: PreparationCommand | null,
  candidate: PreparationCommand,
): { kind: 'new' | 'replay'; command: PreparationCommand } | { kind: 'conflict' } {
  const next = PreparationCommandSchema.parse(candidate);
  if (!existing) return { kind: 'new', command: next };
  const previous = PreparationCommandSchema.parse(existing);
  return previous.userId === next.userId && previous.requestId === next.requestId
    && previous.requestFingerprint === next.requestFingerprint
    && previous.operation === next.operation
    && previous.policyVersion === next.policyVersion
    && previous.authorityEpoch === next.authorityEpoch && previous.deletionEpoch === next.deletionEpoch
    ? { kind: 'replay', command: previous } : { kind: 'conflict' };
}
