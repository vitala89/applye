import { Injectable } from '@angular/core';
import { CareerEvidence, rehydrateCareerEvidence } from '@applye/core';

import { tauriInvoke } from '../tauri.invoke';

/**
 * Local Career Evidence rows. The SQLite id stays beside the domain value.
 * A raw IPC row is rehydrated, so a bad payload cannot be cast into
 * `CareerEvidence`.
 */
export interface PersistedCareerEvidence {
  readonly id: number;
  readonly evidence: CareerEvidence;
}

@Injectable({ providedIn: 'root' })
export class CareerEvidenceGateway {
  insertCareerEvidence(evidence: CareerEvidence): Promise<PersistedCareerEvidence> {
    return tauriInvoke<unknown>('db_insert_career_evidence', { evidence }).then(persistedFromRow);
  }

  async listCareerEvidence(): Promise<PersistedCareerEvidence[]> {
    const rows = await tauriInvoke<unknown>('db_list_career_evidence');
    if (!Array.isArray(rows)) throw new Error('Career Evidence could not be read.');
    return rows.map((row) => persistedFromRow(row));
  }

  async saveCareerEvidenceLifecycle(
    id: number,
    evidence: CareerEvidence,
  ): Promise<PersistedCareerEvidence> {
    requirePersistenceId(id);
    const row = await tauriInvoke<unknown>('db_save_career_evidence_lifecycle', { id, evidence });
    return persistedFromRow(row);
  }
}

function persistedFromRow(row: unknown): PersistedCareerEvidence {
  if (!isRecord(row)) throw new Error('Career Evidence could not be read.');
  requirePersistenceId(row['id']);
  const evidence = rehydrateCareerEvidence({
    statement: row['statement'],
    reviewState: row['reviewState'],
    provenance: {
      origin: row['origin'],
      sourceLabel: row['sourceLabel'],
      sourceRef: row['sourceRef'],
      capturedAt: row['capturedAt'],
    },
    createdAt: row['createdAt'],
    updatedAt: row['updatedAt'],
    confirmedAt: row['confirmedAt'],
    rejectedAt: row['rejectedAt'],
  });
  return { id: row['id'], evidence };
}

function requirePersistenceId(id: unknown): asserts id is number {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Career Evidence persistence id must be a positive integer.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
