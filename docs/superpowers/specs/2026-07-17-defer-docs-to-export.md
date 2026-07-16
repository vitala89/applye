# Defer generated documents to Export & Apply (draft-scoped)

## Problem

In the MyJob apply wizard's document-review step, clicking Create CV / Create
cover letter immediately writes a row to `document_library`. That row shows up
in the Documents library list right away, and the review-step buttons are
confusing (Create AND Regenerate side by side; state looks lost on return).

## Intent

Generated CV / cover-letter drafts must not appear in the Documents library
until the user reaches step 5 (Export & Apply) and actually commits (exports the
PDF or marks the job applied). Review / inline-edit / preview / export must keep
working unchanged.

## Approach A — draft-scoped persistence (chosen)

Keep persisting the generated content to a `document_library` row (so review /
editor / export by id keep working), but tag it as an uncommitted application
draft and hide drafts from every library _list_. Committing (export success or
markApplied) clears the tag, turning the draft into a normal library entry.

### Layers

1. **SQL** `migrations/0016_document_draft_flag.sql`
   - `ALTER TABLE document_library ADD COLUMN is_application_draft INTEGER NOT NULL DEFAULT 0;`
2. **Rust** `commands/documents.rs`
   - Add `is_application_draft: bool` to `DocumentLibraryItem`; `Option<bool>` to `UpsertDocumentLibraryItemInput`.
   - `document_library_list_core`: add `AND is_application_draft = 0` (both branches). `document_library_get` stays unfiltered (Review/export fetch drafts by id).
   - `document_library_upsert_core`:
     - INSERT: bind `input.is_application_draft.unwrap_or(false)`.
     - UPDATE: `is_application_draft = COALESCE(?, is_application_draft)` binding `input.is_application_draft` — so a caller that omits the flag (document editor saving a Review edit) never un-drafts a draft.
   - New command `document_library_commit(id)` → `UPDATE ... SET is_application_draft = 0 WHERE id = ?`; register in `lib.rs`.
   - Update Rust unit tests for the new column + a list-excludes-draft test + commit test.
3. **TS data** `libs/core .../document.model.ts` + `libs/data .../db.service.ts`
   - Add `isApplicationDraft` to item + input types; add `documentLibraryCommit(id)`.
4. **Angular** `jobs.component.ts`
   - `createCvDraft` / `createCoverLetterDraft`: pass `isApplicationDraft: true` on upsert.
   - `doExport` (on success) + `markApplied`: call `documentLibraryCommit` for the linked doc(s).
   - Buttons: when no linked doc → single "Generate" (no duplicate Regenerate). When linked → "Review" + "Regenerate". Keep spinner/disabled states.
5. **Global** ResizeObserver: suppress the benign "ResizeObserver loop completed with undelivered notifications" in the app's `ErrorHandler`.

### Out of scope / follow-up

- Generation speed: sequential gap-analysis → dialog → cv-import is inherent (answers feed generation). Report options (faster model tier, streaming) separately; no risky change bundled here.

## Follow-up fixes (found during review of the button-reverts report)

- **Root cause of the "Review reverts to Generate after a few seconds" bug (and the broken return-state):** `ApplicationInput` (Rust) and the `db_upsert_application` UPDATE/INSERT never included `cv_document_id` / `cover_letter_document_id`, so `upsertApplication({...app, cvDocumentId})` silently dropped the id - the column was unwritable since migration 0011. The wizard set `linkedCv` locally (showed "Review"), then `docCompletionEffect` → `loadLinkedDocuments` re-read the _null_ persisted id and cleared it. This also silently broke ADR-0003 (one-doc-per-job): `app.cvDocumentId` was always null, so every regenerate minted a duplicate row. Fix: add the two columns to the input struct + UPDATE (`COALESCE(?, col)` so minimal callers never wipe a link) + INSERT; extracted `db_upsert_application_core(pool)` and added a regression test.
- **Stray separator on an Education entry with no degree:** the CV preview template ([cv-preview.component.html](../../../apps/desktop/src/app/pages/documents/cv-detail/cv-preview/cv-preview.component.html)) rendered a hardcoded `", "` between degree and institution unconditionally, so an empty degree showed a leading comma. Now gated on `entry.degree && entry.institution`. `cv-print` reuses `<app-cv-preview>`, so the exported PDF is covered too.

## Tests

Rust: list excludes drafts, commit clears flag, upsert preserves flag on omit.
TS: db.service commit invoke. Angular: generate hides from list intent, commit-on-export, single-button rendering, return shows Review.

## Docs

Sync `docs/product/CURRENT_STATE.md` + CHANGELOG on the way out.
