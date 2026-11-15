import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { CareerEvidenceGateway } from './career-evidence.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

const capturedAt = '2026-10-16T08:00:00.000Z';
const createdAt = '2026-10-16T09:00:00.000Z';
const reviewedAt = '2026-10-16T10:00:00.000Z';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    statement: 'Owned frontend architecture for a high-volume workflow.',
    reviewState: 'draft',
    origin: 'user',
    sourceLabel: null,
    sourceRef: null,
    capturedAt,
    createdAt,
    updatedAt: createdAt,
    confirmedAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

describe('CareerEvidenceGateway', () => {
  let gateway: CareerEvidenceGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockReset();
    (invoke as jest.Mock).mockResolvedValue(row());
    TestBed.configureTestingModule({ providers: [CareerEvidenceGateway] });
    gateway = TestBed.inject(CareerEvidenceGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('inserts, lists, and saves through the Career Evidence commands', async () => {
    const evidence = { statement: 'claim' } as never;
    await gateway.insertCareerEvidence(evidence);
    expect(invoke).toHaveBeenCalledWith('db_insert_career_evidence', { evidence });

    (invoke as jest.Mock).mockResolvedValueOnce([]);
    await gateway.listCareerEvidence();
    expect(invoke).toHaveBeenCalledWith('db_list_career_evidence', undefined);

    await gateway.saveCareerEvidenceLifecycle(3, evidence);
    expect(invoke).toHaveBeenCalledWith('db_save_career_evidence_lifecycle', {
      id: 3,
      evidence,
    });
  });

  it('rehydrates an inserted row and keeps the id beside the domain value', async () => {
    const persisted = await gateway.insertCareerEvidence({} as never);

    expect(persisted.id).toBe(1);
    expect(persisted.evidence.reviewState).toBe('draft');
    expect(persisted.evidence.provenance.origin).toBe('user');
    expect(persisted.evidence.provenance.sourceLabel).toBeUndefined();
    expect('id' in persisted.evidence).toBe(false);
  });

  it('rehydrates a list in the order the command returned', async () => {
    (invoke as jest.Mock).mockResolvedValueOnce([
      row({ id: 2, reviewState: 'proposal', origin: 'ai' }),
      row({
        id: 4,
        reviewState: 'confirmed',
        updatedAt: reviewedAt,
        confirmedAt: reviewedAt,
      }),
    ]);

    const listed = await gateway.listCareerEvidence();

    expect(listed.map((item) => item.id)).toEqual([2, 4]);
    expect(listed[0].evidence.reviewState).toBe('proposal');
    expect(listed[1].evidence.confirmedAt).toBe(reviewedAt);
    expect('id' in listed[1].evidence).toBe(false);
  });

  it('rehydrates a lifecycle save', async () => {
    (invoke as jest.Mock).mockResolvedValueOnce(
      row({
        id: 8,
        reviewState: 'rejected',
        origin: 'import',
        updatedAt: reviewedAt,
        rejectedAt: reviewedAt,
      }),
    );

    const persisted = await gateway.saveCareerEvidenceLifecycle(8, {} as never);

    expect(persisted.id).toBe(8);
    expect(persisted.evidence.reviewState).toBe('rejected');
    expect(persisted.evidence.rejectedAt).toBe(reviewedAt);
  });

  it('rejects a persistence id that is not a positive integer before invoking', async () => {
    await expect(gateway.saveCareerEvidenceLifecycle(0, {} as never)).rejects.toThrow(
      /positive integer/,
    );
    await expect(gateway.saveCareerEvidenceLifecycle(1.5, {} as never)).rejects.toThrow(
      /positive integer/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a malformed row', async () => {
    (invoke as jest.Mock).mockResolvedValueOnce(row({ reviewState: 'archived' }));

    await expect(gateway.insertCareerEvidence({} as never)).rejects.toThrow(
      /review state is not recognized/,
    );
  });

  it('rejects the whole list when one row cannot be rehydrated', async () => {
    (invoke as jest.Mock).mockResolvedValueOnce([row(), row({ id: 2, statement: ' padded ' })]);

    await expect(gateway.listCareerEvidence()).rejects.toThrow(/statement is not canonical/);
  });

  it('rejects a returned id that is not a positive integer', async () => {
    (invoke as jest.Mock).mockResolvedValueOnce([row({ id: 0 })]);

    await expect(gateway.listCareerEvidence()).rejects.toThrow(/positive integer/);
  });
});
