import { Injectable } from '@angular/core';
import { CareerEvidence, rehydrateCareerEvidence } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Desktop row for Career Evidence. `id` is the SQLite row. `evidence` is the
 * domain value and does not carry that id.
 */
export interface PersistedCareerEvidence {
  readonly id: number;
  readonly evidence: CareerEvidence;
}

interface CareerEvidenceRow {
  id: unknown;
  statement: unknown;
  reviewState: unknown;
  origin: unknown;
  sourceLabel?: unknown;
  sourceRef?: unknown;
  capturedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  confirmedAt?: unknown;
  rejectedAt?: unknown;
}

/**
 * Local Career Evidence persistence. Insert stores a new draft or proposal.
 * Lifecycle save records a confirm or reject the domain already produced.
 * This gateway does not edit the statement or provenance.
 */
@Injectable({ providedIn: 'root' })
export class CareerEvidenceGateway {
  async insertCareerEvidence(evidence: CareerEvidence): Promise<PersistedCareerEvidence> {
    const row = await tauriInvoke<CareerEvidenceRow>('db_insert_career_evidence', { evidence });
    return persistedFrom(row);
  }

  async listCareerEvidence(): Promise<PersistedCareerEvidence[]> {
    const rows = await tauriInvoke<CareerEvidenceRow[]>('db_list_career_evidence');
    return rows.map(persistedFrom);
  }

  async saveCareerEvidenceLifecycle(
    id: number,
    evidence: CareerEvidence,
  ): Promise<PersistedCareerEvidence> {
    const row = await tauriInvoke<CareerEvidenceRow>('db_save_career_evidence_lifecycle', {
      id,
      evidence,
    });
    return persistedFrom(row);
  }
}

function persistedFrom(row: CareerEvidenceRow): PersistedCareerEvidence {
  if (typeof row.id !== 'number' || !Number.isInteger(row.id) || row.id <= 0) {
    throw new Error('Career Evidence persistence id is missing.');
  }
  return {
    id: row.id,
    evidence: rehydrateCareerEvidence({
      statement: row.statement,
      reviewState: row.reviewState,
      origin: row.origin,
      sourceLabel: row.sourceLabel,
      sourceRef: row.sourceRef,
      capturedAt: row.capturedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      confirmedAt: row.confirmedAt,
      rejectedAt: row.rejectedAt,
    }),
  };
}
