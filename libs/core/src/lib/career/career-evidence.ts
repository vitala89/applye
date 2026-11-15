/**
 * Career Evidence is a career claim plus where it came from and whether the
 * user has accepted it. Origin is not review state: an AI or import proposal
 * stays unconfirmed until `confirmCareerEvidence`. There is no constructor
 * that accepts a status, so a caller cannot stamp a proposal as confirmed.
 *
 * The seal is a private member of an unexported class. `CareerEvidence` is only
 * a type. Object spread does not copy the seal, so rewriting a proposal as
 * `confirmed` does not produce Career Evidence.
 *
 * A later slice may edit a record. That edit has to clear confirmation when
 * the statement or provenance changes. This module has no update operation.
 */

/** How the statement entered Applye. Independent of whether the user accepted it. */
export type CareerEvidenceOrigin = 'user' | 'ai' | 'import';

/** `ai` and `import` are proposals. A user writes a draft, then confirms or rejects it. */
export type CareerEvidenceProposalOrigin = Exclude<CareerEvidenceOrigin, 'user'>;

/**
 * `draft` is user-written and not final. `proposal` is AI or import inference
 * waiting for review. `confirmed` is a user-owned fact. `rejected` is kept and
 * is not a fact.
 */
export type CareerEvidenceReviewState = 'draft' | 'proposal' | 'confirmed' | 'rejected';

/**
 * Minimum provenance for this lifecycle. `sourceRef` is an opaque label for a
 * future caller, not a database key. `capturedAt` is an ISO-8601 timestamp
 * supplied by that caller.
 */
export interface CareerEvidenceProvenance {
  readonly origin: CareerEvidenceOrigin;
  readonly sourceLabel?: string;
  readonly sourceRef?: string;
  readonly capturedAt: string;
}

/**
 * Nominal seal. It is not exported. Object spread drops the private member, so
 * a copied proposal is not `CareerEvidence`.
 */
declare class CareerEvidenceSeal {
  private readonly seal: never;
}

/**
 * Career Evidence as a type. There is no runtime class and no constructor.
 * The lifecycle functions are the only way to obtain a value of this type.
 */
export type CareerEvidence = CareerEvidenceSeal & {
  readonly statement: string;
  readonly reviewState: CareerEvidenceReviewState;
  readonly provenance: CareerEvidenceProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly rejectedAt?: string;
};

interface CareerEvidenceData {
  readonly statement: string;
  readonly reviewState: CareerEvidenceReviewState;
  readonly provenance: CareerEvidenceProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly rejectedAt?: string;
}

export interface CareerEvidenceDraftInput {
  statement: string;
  sourceLabel?: string;
  sourceRef?: string;
  capturedAt: string;
}

export interface CareerEvidenceProposalInput extends CareerEvidenceDraftInput {
  origin: CareerEvidenceProposalOrigin;
}

/** User-written text that is not yet a fact. Origin is `user`. */
export function draftCareerEvidence(input: CareerEvidenceDraftInput, now: string): CareerEvidence {
  return createCareerEvidence({
    statement: input.statement,
    reviewState: 'draft',
    provenance: provenanceFrom(input, 'user'),
    now,
  });
}

/**
 * AI output or an inference from imported text. Always a proposal.
 * Passing `user` is rejected: user-written text is a draft.
 */
export function proposeCareerEvidence(
  input: CareerEvidenceProposalInput,
  now: string,
): CareerEvidence {
  const origin = input.origin as CareerEvidenceOrigin;
  if (origin !== 'ai' && origin !== 'import') {
    throw new Error(
      'AI and imported Career Evidence start as proposals. User-written text is a draft.',
    );
  }
  return createCareerEvidence({
    statement: input.statement,
    reviewState: 'proposal',
    provenance: provenanceFrom(input, origin),
    now,
  });
}

/**
 * Explicit user confirmation. The only transition into a factual record.
 * Rejected evidence stays rejected.
 */
export function confirmCareerEvidence(evidence: CareerEvidence, now: string): CareerEvidence {
  if (evidence.reviewState === 'confirmed') return evidence;
  if (evidence.reviewState === 'rejected') {
    throw new Error('Rejected Career Evidence cannot be confirmed.');
  }
  const confirmedAt = requireTimestamp(now, 'Confirmation time is empty.');
  return seal({
    statement: evidence.statement,
    reviewState: 'confirmed',
    provenance: copyProvenance(evidence.provenance),
    createdAt: evidence.createdAt,
    updatedAt: confirmedAt,
    confirmedAt,
  });
}

/**
 * User rejection of a draft or proposal. The record remains, and it is not a fact.
 * Confirmed evidence is not rejected here; this slice has no way to reopen a fact.
 */
export function rejectCareerEvidence(evidence: CareerEvidence, now: string): CareerEvidence {
  if (evidence.reviewState === 'rejected') return evidence;
  if (evidence.reviewState === 'confirmed') {
    throw new Error('Confirmed Career Evidence cannot be rejected without a new review.');
  }
  const rejectedAt = requireTimestamp(now, 'Rejection time is empty.');
  return seal({
    statement: evidence.statement,
    reviewState: 'rejected',
    provenance: copyProvenance(evidence.provenance),
    createdAt: evidence.createdAt,
    updatedAt: rejectedAt,
    rejectedAt,
  });
}

/** Whether Applye may use this record as a user-owned factual career claim. */
export function isConfirmedCareerEvidence(evidence: CareerEvidence): boolean {
  return (
    evidence.reviewState === 'confirmed' &&
    hasText(evidence.confirmedAt) &&
    evidence.rejectedAt == null
  );
}

/**
 * Rebuild a Career Evidence value from stored fields. The caller must not pass
 * a persistence id: that key stays beside the domain value. Stored text is
 * kept only when the lifecycle could already have produced it, so a padded
 * statement is rejected instead of trimmed into a different statement.
 */
export function rehydrateCareerEvidence(input: unknown): CareerEvidence {
  if (!isRecord(input)) throw new Error('Career Evidence could not be rehydrated.');
  if ('id' in input) {
    throw new Error('Career Evidence rehydration does not accept a persistence id.');
  }
  const statement = canonicalText(
    input['statement'],
    'Career Evidence statement is not canonical.',
  );
  const reviewState = reviewStateFrom(input['reviewState']);
  const provenance = provenanceFromStored(input['provenance']);
  const createdAt = canonicalText(
    input['createdAt'],
    'Career Evidence timestamps are not canonical.',
  );
  const updatedAt = canonicalText(
    input['updatedAt'],
    'Career Evidence timestamps are not canonical.',
  );
  const confirmedAt = absentOrCanonical(
    input['confirmedAt'],
    'Career Evidence timestamps are not canonical.',
  );
  const rejectedAt = absentOrCanonical(
    input['rejectedAt'],
    'Career Evidence timestamps are not canonical.',
  );
  assertStoredLifecycle(
    reviewState,
    provenance.origin,
    createdAt,
    updatedAt,
    confirmedAt,
    rejectedAt,
  );
  return seal({
    statement,
    reviewState,
    provenance,
    createdAt,
    updatedAt,
    ...(confirmedAt === undefined ? {} : { confirmedAt }),
    ...(rejectedAt === undefined ? {} : { rejectedAt }),
  });
}

function createCareerEvidence(input: {
  statement: string;
  reviewState: 'draft' | 'proposal';
  provenance: CareerEvidenceProvenance;
  now: string;
}): CareerEvidence {
  const now = requireTimestamp(input.now, 'Career Evidence time is empty.');
  return seal({
    statement: requireStatement(input.statement),
    reviewState: input.reviewState,
    provenance: input.provenance,
    createdAt: now,
    updatedAt: now,
  });
}

function provenanceFrom(
  input: CareerEvidenceDraftInput,
  origin: CareerEvidenceOrigin,
): CareerEvidenceProvenance {
  const capturedAt = requireTimestamp(input.capturedAt, 'Career Evidence capture time is empty.');
  const sourceLabel = optionalText(input.sourceLabel);
  const sourceRef = optionalText(input.sourceRef);
  return {
    origin,
    capturedAt,
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
    ...(sourceRef === undefined ? {} : { sourceRef }),
  };
}

function copyProvenance(provenance: CareerEvidenceProvenance): CareerEvidenceProvenance {
  return {
    origin: provenance.origin,
    capturedAt: provenance.capturedAt,
    ...(provenance.sourceLabel === undefined ? {} : { sourceLabel: provenance.sourceLabel }),
    ...(provenance.sourceRef === undefined ? {} : { sourceRef: provenance.sourceRef }),
  };
}

function seal(evidence: CareerEvidenceData): CareerEvidence {
  return evidence as CareerEvidence;
}

function requireStatement(statement: string): string {
  const trimmed = statement.trim();
  if (!trimmed) throw new Error('Career Evidence statement is empty.');
  return trimmed;
}

function requireTimestamp(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function optionalText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(message);
  }
  return value;
}

function absentOrCanonical(value: unknown, message: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new Error(message);
  if (value.trim() === '') return undefined;
  if (value.trim() !== value) throw new Error(message);
  return value;
}

function reviewStateFrom(value: unknown): CareerEvidenceReviewState {
  if (value === 'draft' || value === 'proposal' || value === 'confirmed' || value === 'rejected') {
    return value;
  }
  throw new Error('Career Evidence review state is not recognized.');
}

function provenanceFromStored(value: unknown): CareerEvidenceProvenance {
  if (!isRecord(value)) throw new Error('Career Evidence could not be rehydrated.');
  const origin = originFrom(value['origin']);
  const capturedAt = canonicalText(
    value['capturedAt'],
    'Career Evidence provenance is not canonical.',
  );
  const sourceLabel = absentOrCanonical(
    value['sourceLabel'],
    'Career Evidence provenance is not canonical.',
  );
  const sourceRef = absentOrCanonical(
    value['sourceRef'],
    'Career Evidence provenance is not canonical.',
  );
  return {
    origin,
    capturedAt,
    ...(sourceLabel === undefined ? {} : { sourceLabel }),
    ...(sourceRef === undefined ? {} : { sourceRef }),
  };
}

function originFrom(value: unknown): CareerEvidenceOrigin {
  if (value === 'user' || value === 'ai' || value === 'import') return value;
  throw new Error('Career Evidence origin is not recognized.');
}

function assertStoredLifecycle(
  reviewState: CareerEvidenceReviewState,
  origin: CareerEvidenceOrigin,
  createdAt: string,
  updatedAt: string,
  confirmedAt: string | undefined,
  rejectedAt: string | undefined,
): void {
  if (reviewState === 'draft' && origin !== 'user') {
    throw new Error('Career Evidence origin does not match its review state.');
  }
  if (reviewState === 'proposal' && origin !== 'ai' && origin !== 'import') {
    throw new Error('Career Evidence origin does not match its review state.');
  }
  const open = reviewState === 'draft' || reviewState === 'proposal';
  if (open && (confirmedAt !== undefined || rejectedAt !== undefined || updatedAt !== createdAt)) {
    throw new Error('Career Evidence lifecycle timestamps are inconsistent.');
  }
  if (
    reviewState === 'confirmed' &&
    (confirmedAt === undefined || rejectedAt !== undefined || updatedAt !== confirmedAt)
  ) {
    throw new Error('Career Evidence lifecycle timestamps are inconsistent.');
  }
  if (
    reviewState === 'rejected' &&
    (rejectedAt === undefined || confirmedAt !== undefined || updatedAt !== rejectedAt)
  ) {
    throw new Error('Career Evidence lifecycle timestamps are inconsistent.');
  }
}
