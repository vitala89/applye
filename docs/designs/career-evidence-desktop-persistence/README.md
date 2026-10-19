# Career Evidence desktop persistence

Design-only proposal. This document does not approve itself.

|                                             |                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                                      | Pending maintainer approval                                                                                                                  |
| Revision                                    | Head of this design pull request                                                                                                             |
| Base                                        | `21cab03b911261d492e6538209a734e525f4ab24`                                                                                                   |
| Implementation                              | Not started from this design. [#591](https://github.com/vitala89/applye/pull/591) is an earlier unapproved prototype and is not this design. |
| Next slice after an approved implementation | Career Profile / Evidence UI                                                                                                                 |

Canon: [architecture.md](../../architecture.md), [domain-architecture.md](../../domain-architecture.md), [ADR-0005](../../product/decisions/ADR-0005-application-layer-owns-page-state.md), [ADR-0006](../../product/decisions/ADR-0006-career-company-network-interview-intelligence.md), [CODE_QUALITY.md](../../governance/CODE_QUALITY.md), [Career Intelligence brief](../../product/feature-briefs/career-company-network-interview-intelligence.md).

## Diagrams

Mermaid is enough. There is no UI layout and no new deployment.

- [data-flow.mmd](data-flow.mmd) — a future caller moves the domain value; `libs/data` calls `libs/core` only to rehydrate
- [lifecycle.mmd](lifecycle.mmd) — review states this slice may store
- [sequence.mmd](sequence.mmd) — the caller uses core, then the gateway; the compare-and-set save stays in Rust

## Problem and scope

Applye can already build a `CareerEvidence` value in `libs/core` ([#590](https://github.com/vitala89/applye/pull/590)). It cannot store one. This slice adds the smallest local persistence path so a later Career Profile screen can save and reload that lifecycle.

Existing behavior on this `main`:

- `CareerEvidence` is a nominal type. It has no runtime class and no persistence id.
- Lifecycle functions are `draftCareerEvidence`, `proposeCareerEvidence`, `confirmCareerEvidence`, and `rejectCareerEvidence`.
- There is no `career_evidence` table, no Tauri command, and no `CareerEvidenceGateway`.
- The latest shipped migration is `0030_de_bund_source.sql`.
- Backup is `VACUUM INTO` of the open database. Restore opens through `Db::init`, which runs pending migrations.

Proposed behavior: persist that lifecycle in the existing desktop SQLite file, behind the existing gateway and thin-command split.

Non-goals: Career Profile UI, an application signal store, AI Career Discovery, CV or transcript ingestion, revise/edit, delete, Company / Network / Interview Intelligence, a web API, sync, and conversion of Profile, experience, education, or story bank rows.

## Context and boundaries

Career Evidence stays in the Career Intelligence vocabulary. Persistence uses the existing desktop stack. No new bounded-context library and no repository type.

```text
Caller                  future application layer    not in this slice
   |                         |
   | lifecycle call          | gateway call
   v                         v
CareerEvidence          libs/core              existing domain value
                              ^
                              | rehydrateCareerEvidence
                              |
CareerEvidenceGateway   libs/data              proposed Tauri adapter
        |
        v
Tauri command           commands/              proposed thin IPC
        |
        v
career_evidence         src-tauri feature      proposed checks and SQL
        |
        v
career_evidence table   local SQLite           proposed
```

`apps/desktop` production UI does not gain a caller in this slice. A later screen follows ADR-0005: the page renders, a signal store in `libs/application` owns screen state, and that store is what calls the gateway. This design does not add the store.

Dependency direction is unchanged. `libs/data` may use `@applye/core`. Rust does not import TypeScript. The domain rules stay in `libs/core`. Rust protects the stored row. It does not grow a second lifecycle model.

## Identity

SQLite row identity is infrastructure.

`CareerEvidence` stays id-free. A persisted desktop value pairs the row id with the domain value:

```text
PersistedCareerEvidence
  id: number
  evidence: CareerEvidence
```

`id` is a positive integer primary key. It is not serialized as a field of `evidence`. Rehydration does not accept an id.

## Rehydration

Proposed function: `rehydrateCareerEvidence` in `libs/core`, beside the lifecycle functions, so it can seal a value without exporting the seal.

Input is the stored lifecycle fields, typed loosely enough that a bad IPC payload is a runtime failure. Output is nominal `CareerEvidence`. There is no `as CareerEvidence` at the gateway.

Reject a payload the lifecycle cannot produce. Do not trim a stored statement into a different statement. Empty optional provenance (`null` or blank) stays absent. A non-empty untrimmed string is rejected.

## Timestamp invariant

`confirmCareerEvidence` sets `updatedAt` and `confirmedAt` to the same caller clock, and leaves `createdAt` alone. Calling it again on an already confirmed value returns that same value. `rejectCareerEvidence` sets `updatedAt` and `rejectedAt` to the same clock. A new draft or proposal sets `createdAt` and `updatedAt` to the same clock and has neither review time.

That is the canonical clock. The same rule is required in rehydration, Rust validation, SQLite `CHECK` constraints, and tests.

| State       | Origin           | `confirmedAt` | `rejectedAt` | `updatedAt`            |
| ----------- | ---------------- | ------------- | ------------ | ---------------------- |
| `draft`     | `user`           | absent        | absent       | equal to `createdAt`   |
| `proposal`  | `ai` or `import` | absent        | absent       | equal to `createdAt`   |
| `confirmed` | original origin  | present       | absent       | equal to `confirmedAt` |
| `rejected`  | original origin  | absent        | present      | equal to `rejectedAt`  |

A confirmed row whose `updatedAt` differs from `confirmedAt` is corrupt, including in TypeScript rehydration and in SQLite. The same applies to a rejected row and `rejectedAt`. A draft or proposal whose `updatedAt` differs from `createdAt` is corrupt. This closes the split in the unapproved #591 prototype, where only the Rust check required the confirmed and rejected equalities.

`capturedAt` is provenance. It is not a review clock and is not rewritten by confirm or reject.

## Lifecycle the store may accept

```text
user text        -> draft
ai or import     -> proposal
draft            -> confirmed | rejected
proposal         -> confirmed | rejected
confirmed        -> confirmed only when every stored field is unchanged
rejected         -> rejected only when every stored field is unchanged
```

Insert accepts only a draft or proposal. There is no insert of an already confirmed or rejected row.

There is no revise. Statement, origin, source label, source ref, `capturedAt`, and `createdAt` are written on insert and are not columns of the lifecycle `UPDATE`.

Rejected evidence stays in the table and is not a fact. This slice has no delete.

## Concurrency

A read, a check in process, then an unconditional `UPDATE` is not safe. Two saves can both observe `draft`, one confirms, and the later write can replace that row with `rejected`.

The lifecycle write is one atomic compare-and-set. SQLite applies the `UPDATE` as one statement. The predicate carries the state the transition is allowed to leave, plus the columns that must not change:

```text
UPDATE career_evidence
SET review_state = :next,
    updated_at = :updated_at,
    confirmed_at = :confirmed_at,
    rejected_at = :rejected_at
WHERE id = :id
  AND review_state IN (:allowed_previous)
  AND statement = :statement
  AND origin = :origin
  AND captured_at = :captured_at
  AND created_at = :created_at
  AND source_label IS :source_label
  AND source_ref IS :source_ref
  AND confirmed_at IS :previous_confirmed_at
  AND rejected_at IS :previous_rejected_at
```

For a move from draft or proposal into confirmed or rejected, `:allowed_previous` is those two states, and both previous review times are null. `source_label IS :source_label` is SQLite's null-safe comparison.

`SET` does not include statement, origin, source label, source ref, `captured_at`, or `created_at`.

Rows affected:

| Result | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| 1      | The transition was stored. Return the row after rehydration.            |
| 0      | Nothing was written. Load the row and classify. Do not retry the write. |

Classification when nothing was written:

| Observed row                             | Result                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Missing                                  | `Career Evidence row was not found.`                                 |
| Every field equals the request           | Idempotent success. Return the row. No second write.                 |
| Same review state, any timestamp differs | `Career Evidence lifecycle timestamps cannot change.`                |
| Statement differs                        | `Career Evidence lifecycle cannot change the statement.`             |
| Provenance differs                       | `Career Evidence lifecycle cannot change provenance.`                |
| `createdAt` differs                      | `Career Evidence lifecycle cannot change createdAt.`                 |
| Stored confirmed, request rejected       | `Confirmed Career Evidence cannot be rejected without a new review.` |
| Stored rejected, request confirmed       | `Rejected Career Evidence cannot be confirmed.`                      |

A lost race is the last two rows. The first terminal write wins. The later writer sees that terminal state and receives the domain error. It cannot overwrite it, because its `WHERE` no longer matches.

Same-state success is only the identical value `confirmCareerEvidence` or `rejectCareerEvidence` returns when the evidence is already in that state. A new clock on an already terminal row is a timestamp change and fails.

Error text names the operation or the row id only when an id is required to find the row. It does not include the statement, source label, or source ref.

No event bus and no repository trait. The feature module owns this statement. The Tauri command only forwards arguments and the `Db` pool.

## Migration

Next number on this `main` is `0031`, because `0030` is the latest shipped file. The implementation must re-check that number before adding the file. Shipped migrations are not edited. The new file's SHA-384 checksum is added to the pinned list in `db.rs`. Old pins stay.

Proposed table `career_evidence`:

| Column         | Rule                                                    |
| -------------- | ------------------------------------------------------- |
| `id`           | integer primary key                                     |
| `statement`    | required, non-empty, already trimmed                    |
| `review_state` | `draft`, `proposal`, `confirmed`, `rejected`            |
| `origin`       | `user`, `ai`, `import`                                  |
| `source_label` | optional trimmed text, otherwise null                   |
| `source_ref`   | optional opaque text, otherwise null. Not a foreign key |
| `captured_at`  | required trimmed text                                   |
| `created_at`   | required trimmed text                                   |
| `updated_at`   | required trimmed text                                   |
| `confirmed_at` | optional trimmed text                                   |
| `rejected_at`  | optional trimmed text                                   |

`CHECK` constraints encode the timestamp table above, including `updated_at = confirmed_at` for confirmed rows, `updated_at = rejected_at` for rejected rows, and `updated_at = created_at` for draft and proposal rows. They also encode draft-is-user and proposal-is-ai-or-import.

No evidence-kind column. No confidence or freshness. No foreign key to Profile, Application, or Job.

Rollback of an applied migration is not offered. Recovery is the existing database restore. An older backup has no `career_evidence` table; `Db::init` applies this migration after restore.

## Contracts

Proposed gateway methods:

| Method                        | Command                             | Argument           | Returns                                     |
| ----------------------------- | ----------------------------------- | ------------------ | ------------------------------------------- |
| `insertCareerEvidence`        | `db_insert_career_evidence`         | `{ evidence }`     | `PersistedCareerEvidence`                   |
| `listCareerEvidence`          | `db_list_career_evidence`           | none               | `PersistedCareerEvidence[]` ordered by `id` |
| `saveCareerEvidenceLifecycle` | `db_save_career_evidence_lifecycle` | `{ id, evidence }` | `PersistedCareerEvidence`                   |

IPC rows use camelCase field names, flat, matching the columns. The gateway maps a successful row through `rehydrateCareerEvidence`. A failed command rejects. The gateway does not catch that and invent a `CareerEvidence`.

List order is `id` ascending. One corrupt row fails the list. It is not skipped and not cast.

## Backup, privacy, and failures

Backup code stays as it is. `VACUUM INTO` copies the committed database, so `career_evidence` is included without a table allowlist. Restore still ends in `Db::init`.

Career Evidence text is private local data. The table lives only in the Applye SQLite file. This slice adds no network call, telemetry, cloud upload, account, or AI provider call. Logs and IPC errors do not contain statement or provenance text.

A constraint failure is reported as `Career Evidence could not be stored.` The database error string is not forwarded, so a driver message cannot echo the bound text.

## Alternatives rejected

| Option                                        | Why not                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Put `id` on `CareerEvidence`                  | Mixes a SQLite key into the domain type #590 kept id-free.                                     |
| Unconditional update after an in-memory check | The #591 prototype race. A later write can replace a terminal state.                           |
| Generic upsert                                | Can replace a confirmed statement and keep `confirmed`. That is the deferred revise operation. |
| Delete                                        | Rejection already retains the row. No approved delete rule.                                    |
| Database triggers                             | The `UPDATE` predicate is enough.                                                              |
| Weaker clocks in SQL than in TypeScript       | The #591 split. A row Rust would refuse could still be stored or rehydrated.                   |

## Verification for the later implementation

Tests, not part of this pull request:

- fresh migrate reaches the new version, and `jobs` still exists
- user draft, AI proposal, and import proposal round-trip, with absent provenance staying absent
- confirmed and rejected round-trip keep statement, provenance, `createdAt`, and the matching review clock
- persistence id is beside `CareerEvidence`, not inside it
- malformed rehydration throws and is not cast
- SQLite rejects illegal state and timestamp combinations, including confirmed `updatedAt` that is not `confirmedAt`
- lifecycle save cannot change statement, provenance, or `createdAt`
- rejected to confirmed fails, and confirmed to rejected fails
- two competing terminal transitions on one id: one write wins, the other fails, and the stored terminal state is the winner
- a second save of the identical terminal value succeeds without changing clocks
- a terminal save with a new clock fails

Validation for that implementation, from [VALIDATION_MATRIX.md](../../governance/VALIDATION_MATRIX.md): shared-contract rows (`quality:file-size`, `type-check`, `lint`, `test`, `desktop:build`, `cargo test --lib`, `cargo clippy -- -D warnings`) and the Rust migration rows (`cargo fmt --check`, `cargo test --lib`, `cargo clippy -- -D warnings`, `cargo check`), plus `quality:attribution`, `quality:application-boundaries`, `format:check`, and `git diff --check`. Native `desktop:dev` launch against an existing database is a backlog item if the agent cannot drive it. No dependency audit unless dependencies change.

## Approval record

- **Status:** Pending maintainer approval
- **Revision:** head of this design pull request, based on `21cab03b`
- **Reviewer decision:** not given
- **Date:** 2026-10-19
- **Open questions:** none. The clock equality and the compare-and-set write are proposed decisions, not options left open.
- **Implementation PR:** none. Do not treat #591 as the implementation of this design.
