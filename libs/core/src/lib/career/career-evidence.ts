/**
 * Career Evidence is a career claim plus where it came from and whether the
 * user has accepted it. Origin is not review state: an AI or import proposal
 * stays unconfirmed until `confirmCareerEvidence`. There is no constructor
 * that accepts a status, so a caller cannot stamp a proposal as confirmed.
 *
 * A later slice may edit a record. That edit has to clear confirmation when
 * the statement or provenance changes. This module has no update operation.
 */

declare const careerEvidenceBrand: unique symbol;

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

export interface CareerEvidence {
  readonly statement: string;
  readonly reviewState: CareerEvidenceReviewState;
  readonly provenance: CareerEvidenceProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly rejectedAt?: string;
  readonly [careerEvidenceBrand]: true;
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

function seal(evidence: Omit<CareerEvidence, typeof careerEvidenceBrand>): CareerEvidence {
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
