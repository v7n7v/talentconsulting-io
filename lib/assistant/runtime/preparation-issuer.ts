import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CurrentPreparationAccessSchema,
  PreparationCommandSchema,
  PreparationRequestSchema,
  SourceBindingSchema,
  bindPosting,
  preparationFingerprint,
  type CurrentPreparationAccess,
  type PreparationCommand,
  type PreparationRequest,
  type SourceBinding,
} from './preparation-contract';
import { evaluatePreparation, resolvePreparationReplay } from './preparation-policy';

const uidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);

const IssuerConfigSchema = z.object({
  policyVersion: z.string().min(1).max(80),
  maxLifetimeMs: z.number().int().positive().max(86_400_000),
  budget: z.object({
    maxProviderAttempts: z.number().int().positive().max(10_000),
    maxCostMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
}).strict();

export interface PreparationIssuerConfig {
  policyVersion: string;
  maxLifetimeMs: number;
  budget: {
    maxProviderAttempts: number;
    maxCostMicros: number;
  };
}

export const DEFAULT_PREPARATION_ISSUER_CONFIG: Readonly<PreparationIssuerConfig> = Object.freeze({
  policyVersion: 'preparation-p1-v1',
  maxLifetimeMs: 15 * 60_000,
  budget: Object.freeze({ maxProviderAttempts: 4, maxCostMicros: 1_000_000 }),
});

export interface ConfirmedPreparationSource {
  binding: SourceBinding;
  verificationKind: 'explicit_user_source' | 'legacy_user_approved' | 'unverified';
}

/**
 * Adapter contract for a trusted server-side issuer only. Every read and
 * createCommand must share one serialization/atomicity scope. In particular,
 * sequential reads across the business and authority Firestore databases do
 * not implement this contract and cannot provide its issuance guarantee.
 * This interface itself is not deployed enforcement; production callers must
 * supply an adapter whose transaction semantics have been proven.
 */
export interface PreparationIssuerTransaction {
  /** Must read live authority state keyed to the transaction's authenticated uid. */
  readCurrentAccess(): Promise<CurrentPreparationAccess | null>;
  /**
   * Must read the exact persisted source under that uid in this transaction,
   * independently classify its server-side provenance, and return its actual
   * content binding. Never accept caller-supplied verification or hashes.
   */
  readConfirmedSource(resumeVersionId: string): Promise<ConfirmedPreparationSource | null>;
  readCommand(): Promise<PreparationCommand | null>;
  createCommand(command: PreparationCommand): void;
}

export interface PreparationIssuerStore {
  runTransaction<T>(
    uid: string,
    requestId: string,
    callback: (transaction: PreparationIssuerTransaction) => Promise<T>,
  ): Promise<T>;
}

export type PreparationIssueResult =
  | { status: 'accepted'; command: PreparationCommand; replayed: boolean }
  | { status: 'rejected'; code: RejectionCode };

type RejectionCode =
  | 'invalid_identity' | 'invalid_request' | 'invalid_config' | 'invalid_time'
  | 'access_unavailable' | 'invalid_access' | 'source_unavailable' | 'invalid_source'
  | 'source_unconfirmed' | 'source_mismatch' | 'command_conflict' | 'store_unavailable'
  | 'invalid_command' | 'owner_mismatch' | 'restore_quarantined' | 'deleted' | 'revoked'
  | 'authority_changed' | 'policy_changed' | 'not_yet_valid' | 'expired' | 'scope_mismatch'
  | 'entitlement_required' | 'action_not_allowed' | 'budget_exhausted';

function commandIdFor(uid: string, requestId: string) {
  // Fixed JSON framing avoids ambiguous concatenation and makes retries stable.
  const framedIdentity = JSON.stringify(['preparation-command-v1', uid, requestId]);
  return createHash('sha256').update(framedIdentity, 'utf8').digest('hex');
}

function rejected(code: RejectionCode): PreparationIssueResult {
  return { status: 'rejected', code };
}

/**
 * Construct a compatibility issuer for an authenticated server caller.
 * `uid` must come from verified server identity; `body` is strict client input.
 * This only creates internal preparation authority. It does not authorize an
 * external action, execute a provider, or establish a production persistence
 * boundary by itself.
 */
export async function issuePreparationCommand(input: {
  uid: unknown;
  body: unknown;
  store: PreparationIssuerStore;
  config?: PreparationIssuerConfig;
  now?: () => number;
}): Promise<PreparationIssueResult> {
  const identity = uidSchema.safeParse(input.uid);
  if (!identity.success) return rejected('invalid_identity');

  const parsedRequest = PreparationRequestSchema.safeParse(input.body);
  if (!parsedRequest.success) return rejected('invalid_request');
  const request: PreparationRequest = parsedRequest.data;

  const parsedConfig = IssuerConfigSchema.safeParse(input.config ?? DEFAULT_PREPARATION_ISSUER_CONFIG);
  if (!parsedConfig.success) return rejected('invalid_config');
  const config = parsedConfig.data;
  const now = input.now ?? Date.now;

  try {
    return await input.store.runTransaction(identity.data, request.requestId, async transaction => {
      const rawAccess = await transaction.readCurrentAccess();
      if (rawAccess == null) return rejected('access_unavailable');
      const currentAccess = CurrentPreparationAccessSchema.safeParse(rawAccess);
      if (!currentAccess.success) return rejected('invalid_access');

      const confirmedSource = await transaction.readConfirmedSource(request.resumeVersionId);
      if (confirmedSource == null) return rejected('source_unavailable');
      if (confirmedSource.verificationKind !== 'explicit_user_source') return rejected('source_unconfirmed');
      const source = SourceBindingSchema.safeParse(confirmedSource.binding);
      if (!source.success) return rejected('invalid_source');
      if (source.data.id !== request.resumeVersionId) return rejected('source_mismatch');

      // Finish the transaction's reads before sampling time: even a replay may
      // expire while the command lookup is in flight.
      const rawExisting = await transaction.readCommand();
      const issuedAtMs = now();
      const expiresAtMs = issuedAtMs + config.maxLifetimeMs;
      if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0
        || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= issuedAtMs) return rejected('invalid_time');

      const candidate = PreparationCommandSchema.safeParse({
        schemaVersion: 1,
        commandId: commandIdFor(identity.data, request.requestId),
        requestId: request.requestId,
        userId: identity.data,
        operation: request.operation,
        requestFingerprint: preparationFingerprint(request, source.data),
        source: source.data,
        posting: bindPosting(request.posting.text),
        policyVersion: config.policyVersion,
        authorityEpoch: currentAccess.data.authorityEpoch,
        deletionEpoch: currentAccess.data.deletionEpoch,
        issuedAtMs,
        expiresAtMs,
        budget: config.budget,
      });
      if (!candidate.success) return rejected('invalid_command');

      const candidateDecision = evaluatePreparation({
        command: candidate.data,
        request,
        currentSource: source.data,
        access: currentAccess.data,
        action: 'read_source',
        nowMs: issuedAtMs,
        // Issuing authority does not consume or reserve provider attempts/cost.
        incurredCostMicros: 0,
        reservedCostMicros: 0,
        providerAttempts: 0,
        reservedProviderAttempts: 0,
        nextProviderReservationMicros: 0,
      });
      if (!candidateDecision.allowed) return rejected(candidateDecision.reason);

      let resolution: ReturnType<typeof resolvePreparationReplay>;
      try {
        resolution = resolvePreparationReplay(rawExisting, candidate.data);
      } catch {
        return rejected('command_conflict');
      }
      if (resolution.kind === 'conflict') return rejected('command_conflict');

      const command = resolution.command;
      if (resolution.kind === 'replay') {
        const replayDecision = evaluatePreparation({
          command,
          request,
          currentSource: source.data,
          access: currentAccess.data,
          action: 'read_source',
          nowMs: issuedAtMs,
          incurredCostMicros: 0,
          reservedCostMicros: 0,
          providerAttempts: 0,
          reservedProviderAttempts: 0,
          nextProviderReservationMicros: 0,
        });
        if (!replayDecision.allowed) return rejected(replayDecision.reason);
      }

      if (resolution.kind === 'new') transaction.createCommand(command);
      return { status: 'accepted', command, replayed: resolution.kind === 'replay' };
    });
  } catch {
    return rejected('store_unavailable');
  }
}
