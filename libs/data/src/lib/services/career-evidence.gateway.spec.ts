import { TestBed } from '@angular/core/testing';
import { CareerEvidence, draftCareerEvidence, isConfirmedCareerEvidence } from '@applye/core';
import { invoke } from '@tauri-apps/api/core';

import { CareerEvidenceGateway } from './career-evidence.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

const capturedAt = '2026-10-16T08:00:00.000Z';
const createdAt = '2026-10-16T09:00:00.000Z';

function draft(): CareerEvidence {
  return draftCareerEvidence(
    { statement: 'Owned frontend architecture for a high-volume workflow.', capturedAt },
    createdAt,
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    statement: 'Owned frontend architecture for a high-volume workflow.',
    reviewState: 'draft',
    origin: 'user',
    capturedAt,
    createdAt,
    updatedAt: createdAt,
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

  it('inserts, lists, and saves a lifecycle under three commands', async () => {
    const evidence = draft();
    (invoke as jest.Mock)
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce(row());
    await gateway.insertCareerEvidence(evidence);
    await gateway.listCareerEvidence();
    await gateway.saveCareerEvidenceLifecycle(4, evidence);

    expect(invoke).toHaveBeenNthCalledWith(1, 'db_insert_career_evidence', { evidence });
    expect(invoke).toHaveBeenNthCalledWith(2, 'db_list_career_evidence', undefined);
    expect(invoke).toHaveBeenNthCalledWith(3, 'db_save_career_evidence_lifecycle', {
      id: 4,
      evidence,
    });
  });

  it('rehydrates a stored row and keeps the persistence id beside it', async () => {
    (invoke as jest.Mock).mockResolvedValue(
      row({
        sourceLabel: null,
        sourceRef: '',
        confirmedAt: null,
      }),
    );

    const persisted = await gateway.insertCareerEvidence(draft());

    expect(persisted.id).toBe(4);
    expect(persisted.evidence.statement).toBe(
      'Owned frontend architecture for a high-volume workflow.',
    );
    expect(persisted.evidence.reviewState).toBe('draft');
    expect(persisted.evidence.provenance.origin).toBe('user');
    expect(persisted.evidence.provenance.sourceLabel).toBeUndefined();
    expect(persisted.evidence.provenance.sourceRef).toBeUndefined();
    expect(persisted.evidence.createdAt).toBe(createdAt);
    expect(isConfirmedCareerEvidence(persisted.evidence)).toBe(false);
    expect('id' in persisted.evidence).toBe(false);
  });

  it('rejects a malformed stored row instead of casting it', async () => {
    (invoke as jest.Mock).mockResolvedValue([row({ reviewState: 'confirmed', confirmedAt: null })]);

    await expect(gateway.listCareerEvidence()).rejects.toThrow(/confirmation time/);
  });

  it('rejects a row whose persistence id is missing', async () => {
    (invoke as jest.Mock).mockResolvedValue([row({ id: 0 })]);

    await expect(gateway.listCareerEvidence()).rejects.toThrow(/persistence id/);
  });
});
