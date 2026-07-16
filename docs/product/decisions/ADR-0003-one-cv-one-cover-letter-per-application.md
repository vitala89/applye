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
