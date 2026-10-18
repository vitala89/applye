import {
  CareerEvidence,
  confirmCareerEvidence,
  draftCareerEvidence,
  isConfirmedCareerEvidence,
  proposeCareerEvidence,
  rejectCareerEvidence,
} from '../../index';

const capturedAt = '2026-10-16T08:00:00.000Z';
const createdAt = '2026-10-16T09:00:00.000Z';
const reviewedAt = '2026-10-16T10:00:00.000Z';

const statement = 'Owned frontend architecture for a high-volume workflow.';

function careerEvidenceIsTypeOnly(): void {
  // @ts-expect-error CareerEvidence is a type. The module does not export a runtime class.
  const runtimeValue = CareerEvidence;
  void runtimeValue;
}

function proposal(origin: 'ai' | 'import' = 'ai'): CareerEvidence {
  return proposeCareerEvidence(
    {
      statement,
      origin,
      sourceLabel: ' 2024 CV ',
      sourceRef: ' doc:cv ',
      capturedAt,
    },
    createdAt,
  );
}

describe('Career Evidence public lifecycle', () => {
  it('rejects a blank statement', () => {
    expect(() => draftCareerEvidence({ statement: '   ', capturedAt }, createdAt)).toThrow(
      /statement is empty/,
    );
    expect(() =>
      proposeCareerEvidence({ statement: '', origin: 'ai', capturedAt }, createdAt),
    ).toThrow(/statement is empty/);
  });

  it('trims the statement and keeps the wording inside it', () => {
    const draft = draftCareerEvidence(
      { statement: '  Migrated a production application.  ', capturedAt },
      createdAt,
    );

    expect(draft.statement).toBe('Migrated a production application.');
  });

  it('keeps a user draft unconfirmed', () => {
    const draft = draftCareerEvidence({ statement, capturedAt, sourceLabel: '  ' }, createdAt);

    expect(draft.reviewState).toBe('draft');
    expect(draft.provenance.origin).toBe('user');
    expect(draft.provenance.sourceLabel).toBeUndefined();
    expect(draft.confirmedAt).toBeUndefined();
    expect(draft.rejectedAt).toBeUndefined();
    expect(isConfirmedCareerEvidence(draft)).toBe(false);
  });

  it('starts an AI proposal unconfirmed', () => {
    const evidence = proposal('ai');

    expect(evidence.reviewState).toBe('proposal');
    expect(evidence.provenance).toEqual({
      origin: 'ai',
      sourceLabel: '2024 CV',
      sourceRef: 'doc:cv',
      capturedAt,
    });
    expect(evidence.confirmedAt).toBeUndefined();
    expect(isConfirmedCareerEvidence(evidence)).toBe(false);
  });

  it('starts an imported inference unconfirmed', () => {
    const evidence = proposal('import');

    expect(evidence.reviewState).toBe('proposal');
    expect(evidence.provenance.origin).toBe('import');
    expect(isConfirmedCareerEvidence(evidence)).toBe(false);
  });

  it('refuses to propose user-written text', () => {
    expect(() =>
      proposeCareerEvidence(
        {
          statement,
          origin: 'user' as 'ai',
          capturedAt,
        },
        createdAt,
      ),
    ).toThrow(/User-written text is a draft/);
  });

  it('confirms a draft only through explicit confirmation', () => {
    const draft = draftCareerEvidence({ statement, capturedAt }, createdAt);
    const confirmed = confirmCareerEvidence(draft, reviewedAt);

    expect(isConfirmedCareerEvidence(confirmed)).toBe(true);
    expect(confirmed.reviewState).toBe('confirmed');
    expect(confirmed.confirmedAt).toBe(reviewedAt);
    expect(confirmed.rejectedAt).toBeUndefined();
    expect(confirmed.createdAt).toBe(createdAt);
    expect(confirmed.updatedAt).toBe(reviewedAt);
    expect(confirmed.provenance).toEqual(draft.provenance);
    expect(draft.reviewState).toBe('draft');
    expect(draft.confirmedAt).toBeUndefined();
  });

  it('confirms an AI proposal only when the user confirms it', () => {
    const evidence = proposal('ai');
    const confirmed = confirmCareerEvidence(evidence, reviewedAt);

    expect(isConfirmedCareerEvidence(evidence)).toBe(false);
    expect(isConfirmedCareerEvidence(confirmed)).toBe(true);
    expect(confirmed.provenance).toEqual(evidence.provenance);
    expect(confirmed.createdAt).toBe(createdAt);
  });

  it('does not treat rejected evidence as a fact', () => {
    const evidence = proposal('import');
    const rejected = rejectCareerEvidence(evidence, reviewedAt);

    expect(rejected.reviewState).toBe('rejected');
    expect(rejected.rejectedAt).toBe(reviewedAt);
    expect(rejected.confirmedAt).toBeUndefined();
    expect(rejected.provenance).toEqual(evidence.provenance);
    expect(rejected.createdAt).toBe(evidence.createdAt);
    expect(isConfirmedCareerEvidence(rejected)).toBe(false);
    expect(() => confirmCareerEvidence(rejected, '2026-10-16T11:00:00.000Z')).toThrow(
      /cannot be confirmed/,
    );
  });

  it('does not reject a confirmed fact through the proposal rejection path', () => {
    const confirmed = confirmCareerEvidence(proposal(), reviewedAt);

    expect(() => rejectCareerEvidence(confirmed, '2026-10-16T11:00:00.000Z')).toThrow(
      /cannot be rejected/,
    );
    expect(confirmed.confirmedAt).toBe(reviewedAt);
  });

  it('leaves an already confirmed record unchanged', () => {
    const confirmed = confirmCareerEvidence(proposal(), reviewedAt);

    expect(confirmCareerEvidence(confirmed, '2026-10-16T12:00:00.000Z')).toBe(confirmed);
  });

  it('exposes Career Evidence as a type and drops the seal on object spread', () => {
    const evidence: CareerEvidence = proposal('ai');
    const rewritten = {
      ...evidence,
      reviewState: 'confirmed' as const,
      confirmedAt: reviewedAt,
    };

    // @ts-expect-error Object spread drops the seal, so a rewritten proposal is not Career Evidence.
    isConfirmedCareerEvidence(rewritten);

    expect(evidence.reviewState).toBe('proposal');
    expect(evidence.confirmedAt).toBeUndefined();
    expect(isConfirmedCareerEvidence(evidence)).toBe(false);
  });

  it('keeps the type-only Career Evidence check in the compiled test', () => {
    expect(typeof careerEvidenceIsTypeOnly).toBe('function');
  });

  it('rejects an empty clock or capture time', () => {
    expect(() => draftCareerEvidence({ statement, capturedAt: '  ' }, createdAt)).toThrow(
      /capture time is empty/,
    );
    expect(() => confirmCareerEvidence(proposal(), ' ')).toThrow(/Confirmation time is empty/);
  });
});
