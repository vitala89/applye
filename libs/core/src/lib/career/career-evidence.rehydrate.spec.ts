import { CareerEvidence, rehydrateCareerEvidence } from '../../index';

const capturedAt = '2026-10-16T08:00:00.000Z';
const createdAt = '2026-10-16T09:00:00.000Z';
const reviewedAt = '2026-10-16T10:00:00.000Z';
const statement = 'Owned frontend architecture for a high-volume workflow.';

function stored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    statement,
    reviewState: 'draft',
    provenance: { origin: 'user', capturedAt },
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function persistenceIdIsNotDomainState(evidence: CareerEvidence): void {
  // @ts-expect-error persistence id is not part of CareerEvidence
  const id = evidence.id;
  void id;
}

describe('rehydrateCareerEvidence', () => {
  it('rehydrates a user draft and keeps absent provenance absent', () => {
    const evidence = rehydrateCareerEvidence(
      stored({
        provenance: { origin: 'user', sourceLabel: '   ', sourceRef: null, capturedAt },
      }),
    );

    expect(evidence.reviewState).toBe('draft');
    expect(evidence.provenance).toEqual({ origin: 'user', capturedAt });
    expect(evidence.confirmedAt).toBeUndefined();
    expect(evidence.rejectedAt).toBeUndefined();
    expect(evidence.updatedAt).toBe(createdAt);
    persistenceIdIsNotDomainState(evidence);
    expect(Object.keys(evidence)).not.toContain('id');
  });

  it('rehydrates an AI proposal and an import proposal', () => {
    const ai = rehydrateCareerEvidence(
      stored({
        reviewState: 'proposal',
        provenance: { origin: 'ai', sourceLabel: '2024 CV', sourceRef: 'doc:cv', capturedAt },
      }),
    );
    const imported = rehydrateCareerEvidence(
      stored({
        reviewState: 'proposal',
        provenance: { origin: 'import', capturedAt },
      }),
    );

    expect(ai.provenance.origin).toBe('ai');
    expect(ai.provenance.sourceLabel).toBe('2024 CV');
    expect(imported.provenance.origin).toBe('import');
    expect(imported.reviewState).toBe('proposal');
  });

  it('rehydrates confirmed and rejected evidence with matching clocks', () => {
    const confirmed = rehydrateCareerEvidence(
      stored({
        reviewState: 'confirmed',
        updatedAt: reviewedAt,
        confirmedAt: reviewedAt,
      }),
    );
    const rejected = rehydrateCareerEvidence(
      stored({
        reviewState: 'rejected',
        provenance: { origin: 'ai', capturedAt },
        updatedAt: reviewedAt,
        rejectedAt: reviewedAt,
      }),
    );

    expect(confirmed.confirmedAt).toBe(reviewedAt);
    expect(confirmed.updatedAt).toBe(reviewedAt);
    expect(confirmed.rejectedAt).toBeUndefined();
    expect(rejected.rejectedAt).toBe(reviewedAt);
    expect(rejected.confirmedAt).toBeUndefined();
    expect(rejected.createdAt).toBe(createdAt);
  });

  it('rejects an unrecognized review state', () => {
    expect(() => rehydrateCareerEvidence(stored({ reviewState: 'archived' }))).toThrow(
      /review state is not recognized/,
    );
  });

  it('rejects an origin that cannot produce the review state', () => {
    expect(() =>
      rehydrateCareerEvidence(stored({ provenance: { origin: 'ai', capturedAt } })),
    ).toThrow(/origin does not match its review state/);
    expect(() =>
      rehydrateCareerEvidence(
        stored({
          reviewState: 'proposal',
          provenance: { origin: 'user', capturedAt },
        }),
      ),
    ).toThrow(/origin does not match its review state/);
    expect(() =>
      rehydrateCareerEvidence(stored({ provenance: { origin: 'guess', capturedAt } })),
    ).toThrow(/origin is not recognized/);
  });

  it('rejects malformed stored values instead of trimming them', () => {
    expect(() => rehydrateCareerEvidence(null)).toThrow(/could not be rehydrated/);
    expect(() => rehydrateCareerEvidence(stored({ statement: '  padded  ' }))).toThrow(
      /statement is not canonical/,
    );
    expect(() => rehydrateCareerEvidence(stored({ statement: '   ' }))).toThrow(
      /statement is not canonical/,
    );
    expect(() =>
      rehydrateCareerEvidence(
        stored({ provenance: { origin: 'user', sourceLabel: ' padded ', capturedAt } }),
      ),
    ).toThrow(/provenance is not canonical/);
  });

  it('rejects a confirmed row whose updatedAt is not confirmedAt', () => {
    expect(() =>
      rehydrateCareerEvidence(
        stored({
          reviewState: 'confirmed',
          updatedAt: reviewedAt,
          confirmedAt: createdAt,
        }),
      ),
    ).toThrow(/timestamps are inconsistent/);
  });

  it('rejects a rejected row whose updatedAt is not rejectedAt', () => {
    expect(() =>
      rehydrateCareerEvidence(
        stored({
          reviewState: 'rejected',
          updatedAt: reviewedAt,
          rejectedAt: createdAt,
        }),
      ),
    ).toThrow(/timestamps are inconsistent/);
  });

  it('rejects a draft or proposal whose updatedAt is not createdAt', () => {
    expect(() => rehydrateCareerEvidence(stored({ updatedAt: reviewedAt }))).toThrow(
      /timestamps are inconsistent/,
    );
    expect(() =>
      rehydrateCareerEvidence(
        stored({
          reviewState: 'proposal',
          provenance: { origin: 'import', capturedAt },
          updatedAt: reviewedAt,
        }),
      ),
    ).toThrow(/timestamps are inconsistent/);
  });

  it('rejects a persistence id on the rehydration input', () => {
    expect(() => rehydrateCareerEvidence({ ...stored(), id: 4 })).toThrow(
      /does not accept a persistence id/,
    );
  });
});
