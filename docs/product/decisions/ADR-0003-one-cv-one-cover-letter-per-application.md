# Architecture Decision Record: One CV and one cover letter per application

- **Status**: `accepted`
- **Date**: 2026-07-16

---

## Context

The apply wizard tailors a CV (and optionally a cover letter) for a single
job. A user can tailor once and then retailor - after final checks, or just to
try again. The question is what retailoring does to the linked documents: does
it produce a new CV/cover letter each time, or update the one already attached
to the application?

The data model already answers most of this. `Application`
(`libs/core/src/lib/models/application.model.ts`) holds single-valued
`cvDocumentId` and `coverLetterDocumentId` - an application points at exactly
one CV and one cover letter. There is no schema affordance for "versions" or a
list of tailored documents per job.

The bug that prompted this ADR: `createCvDraft(false)` upserts with
`id: undefined`, which creates a **new** library row every time the non-
regenerate path runs (auto-fire on entering the Documents step, or a Create
click before the linked state has updated). The result is duplicate
"<Company> - Tailored CV" rows in the Documents library for one job, which is
exactly the confusion this decision rules out.

## Decision

**One job/application gets one CV and one cover letter.** Retailoring updates
the document already linked to the application in place; it never creates a
second CV or cover letter for the same job.

- The single source of truth for "which document belongs to this application"
  is `Application.cvDocumentId` / `coverLetterDocumentId`.
- Every generate/retailor path resolves to that id: if the application already
  links a document, upsert into it (`id: existing`); only create a new library
  row when the application links none.
- No "update existing vs create new" prompt. For one job there is one document,
  so the choice does not exist for the user to make. (If per-job document
  variants are ever wanted, that is a separate, future feature with its own
  schema change - not the default flow.)

This folds into audit item **E** (persist documents only at final Apply / hold
a draft until then): the draft is keyed by the application's linked id, so
retailoring mutates the draft rather than accumulating rows, and the single
library write at Apply lands on that one id.

## Options Considered

- **One document per application, update in place (chosen).** Pros: matches the
  single-valued schema; no duplicates; Documents library stays legible (one CV
  per job). Cons: no built-in history of prior tailorings (acceptable - the
  wizard is a produce-the-final-artifact flow, not a versioning tool).
- **New document per retailor.** Pros: keeps every attempt. Cons: contradicts
  the single-valued `cvDocumentId`; floods the library with near-duplicate rows
  for one job; the user must then pick which one is "the" CV - the confusion we
  are removing.
- **Prompt "update existing or create new" on retailor.** Pros: user choice.
  Cons: adds a decision to every retailor for a case (multiple CVs per job) the
  data model does not support and the user did not ask for; still needs the
  duplicate-management UI the schema avoids.

---

## Implications & Consequences

### Consequences

- `createCvDraft` / `createCoverLetterDraft` must resolve the existing linked
  id before upserting, so the non-regenerate path stops creating duplicate
  library rows. The `id: undefined` create is only correct when the application
  links no document yet.
- Retailor (`retailorFromFinalChecks`, and any Regenerate) reuses the linked
  id - already true for the `regenerate: true` path; the fix is to make the
  first/auto create path also reuse an already-linked id rather than minting a
  new row.
- Documents library shows one CV and one cover letter per job, matching user
  expectation.

### Privacy / Security Impact

None. Documents remain local; this only changes how many rows are written and
which id they target.

### Reversibility

Easy to reverse or extend. Adding per-job variants later would require a schema
change (a document list or version table) and is independent of this decision.

---

## References

- **Links**: PR #101 (apply-wizard CV parse + gating groundwork);
  `apps/desktop/src/app/pages/jobs/jobs.component.ts` (`createCvDraft`,
  `createCoverLetterDraft`, `prepareDocumentsStep`, `retailorFromFinalChecks`);
  `libs/core/src/lib/models/application.model.ts` (`cvDocumentId`,
  `coverLetterDocumentId`). Related audit items: E (persist at Apply), D
  (wizard state persistence).
- **Follow-up Tasks**:
  - [ ] Make every CV/cover-letter create path reuse the application's linked
        id when one exists; only create a new row when none is linked.
  - [ ] Hold generated documents as an in-memory draft and write to the library
        only at final Apply / Update application (audit item E).
  - [ ] Confirm no duplicate "<Company> - Tailored CV" rows after tailor then
        retailor for one job.

---

## Amendment one: a discard owns the pass it is abandoning, not every draft it can see

**Date**: 2026-08-20. **Trigger**: `B1` in `docs/internal/NATIVE_GATE_FINDINGS.md`, the one check of
station 3 that failed in the first full native gate walk, expanded by station 12.

This ADR settled that an application points at exactly one CV and one cover letter. It did not settle
**who may destroy them**, and the gap had a price: `TailoringDiscardService` deleted every linked
document whose `isApplicationDraft` was true, with no notion of which tailoring pass produced it.

That reads as safe, because a committed document is excluded. It is not. A job tailored once and
never exported or marked applied keeps both documents in draft, exactly as this ADR intends. So
re-tailoring that job and pressing **Cancel** deleted the _previous_ pass's CV and cover letter -
and `document_library_delete` unlinks the application first, then deletes the row
(`apps/desktop/src-tauri/src/commands/documents.rs`), so nothing brought them back. The next run's
**Review documents** step read `Missing` for both, and the user paid a second time for two documents
they already had.

**The decision**: a discard destroys the drafts the in-flight pass created, and nothing else.
Ownership is recorded at the moment a draft is born - `JobDocumentDraftsStore.link`, the single
creation path - in `TailoringPassDraftsService`, a root-scoped, `sessionStorage`-backed record of one
pass at a time. Choosing an existing library document links without recording: that document is the
user's, not the pass's.

**Why recorded at creation rather than snapshotted at wizard open.** There are two ways into the
wizard - `JobActionsStore.openWizard` and the cross-job confirm - and only one way to create a draft.
A snapshot missed on either open path silently restores the old behaviour, and the failure mode is
the bug. Recording at creation cannot be routed around.

**The failure direction is chosen, not accidental.** The record is session-scoped, so an app restart
empties it and a discard afterwards deletes nothing rather than deleting too much. An orphaned draft
is a row the user can delete; a destroyed one cost tokens and is gone.

**A second defect shared the same symptom and is not the same bug.** `discardTailoring` called
`resetJobScopedState()` and stopped, so the screen emptied and never re-read - `enterJob` will not
reload when the route still points at the id it already loaded. The job rendered blank and recovered
only by leaving for My Jobs and coming back. It now awaits `lifecycle.loadJob(id)`, as
`updateApplication` already did. That half destroyed nothing; it is what made the destructive half
look recoverable.

### Consequences

- Cancelling a re-tailor returns the job to the state it was in, with its cached score, its linked
  documents and its tailoring cache re-read from the database.
- A first tailoring is unchanged: the pass created both drafts, so the discard still removes both.
- Every path that ends a pass disowns its drafts - close the wizard, mark applied, update the
  application, and the discard itself once its deletes are through. A failed discard keeps the record
  so a retry still has the authority to finish.
- `TailoringDiscardContext` is unchanged. The public-API delta is one additive export.

### Privacy / Security Impact

None. The record holds document-library row ids for the current session only, in `sessionStorage`,
and nothing leaves the machine.

### Reversibility

Easy. Deleting `TailoringPassDraftsService` and restoring `applicationDrafts` at the call site
returns the previous behaviour, including its defect.
