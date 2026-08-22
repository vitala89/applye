# Next session prompt

Copy everything below the line into a fresh session.

---

**The print pipeline (`#511`-`#516`) and `B5` are closed - see prior entries in
`docs/internal/DUTY_WATCH.md` if you need that history. The export-filename split found after that
work is now fixed, uncommitted.** Read the state below before touching anything.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-22` entries in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`. As of this writing the filename fix below sits
  **uncommitted** on `main` - check `git status` first; if a later session already committed it,
  this whole section is stale and the fix is done.
- **The three-functions export-filename bug is fixed.** `export-filename.ts`, `cv-filename.ts`, and
  `cover-letter-filename.ts` are consolidated into
  [`document-filename.ts`](../../libs/application/src/lib/documents/document-filename.ts), exporting
  `documentFilenameBase`, `suggestCvFilename`, `suggestCoverLetterFilename`.
  [`DocumentExportService.filename()`](../../libs/application/src/lib/documents/document-export.service.ts:137)
  (the editor/wizard Export buttons) now delegates to the same two functions the Documents-list row
  actions call, keyed on `item.docType` - every entry point for a given `document_library` row
  suggests the same name now.
- **The decision, as grilled with the maintainer** (one round, `aif-grilling`, maintainer answered
  "as you recommend"): the documented German `Nachname_Vorname_Lebenslauf` convention (ROADMAP
  §16.6) spreads to every CV entry point rather than being removed; cover letters stay region-blind
  for now (no existing DE cover-letter convention to reuse - that would be new product work, not
  bundled into a bug fix); the non-DE fallback for both CV and cover letter switched from a
  lowercased, underscore-joined slug to the case-preserving, non-ASCII-safe base the old
  `exportFileName` used - this was a necessary correction, not a separate decision, since the naive
  merge would otherwise have silently regressed every non-German user's export name.
- **Gates run and green**: `nx run application:test` (1683/1683), `nx run desktop:type-check`,
  `nx run-many --target=lint --projects=data,application,desktop,ui --skip-nx-cache`,
  `nx test desktop --maxWorkers=2` (1169/1169), `npm run quality:file-size`,
  `npm run quality:attribution`, `npm run format:check`, `git diff --check`, `nx build desktop`. Full
  detail and file list in `docs/internal/DUTY_WATCH.md`'s "export-filename split unified into
  document-filename.ts" entry.
- **Not done**: no commit, no PR. That is the next first action if the maintainer approves the diff -
  review it, commit (Conventional Commit, something like
  `fix(documents): unify the three export-filename functions`), open a PR.
- **No native verification was possible for this fix** - a save-dialog filename suggestion needs a
  real Tauri `save()` call, which the repository-only environment cannot reach. The unit tests are
  the full verification surface. If the maintainer wants an extra check before merging: export the
  same CV from both the apply-wizard Preview step and the Documents-list row action, native, and
  confirm the two suggested names now match.

## Do not re-open

- **The print pipeline (`#511`-`#516`) and `B5` are closed.** Do not re-litigate any of it.
- **The export-filename naming direction is decided** (spread the DE convention; cover letters stay
  generic for now; one consolidated file). Do not re-grill it - if new information changes the
  premise, say so and re-triage explicitly rather than quietly re-deciding.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text.
- **Third-party PDF libraries** were raised out of frustration in an earlier session and should not be
  adopted reflexively - see the reasoning already on file if this comes up again.

## What else is open, untouched this and recent sessions

- **`B9`** - wizard footer padding inconsistent between two steps. Needs a native screenshot/computed
  `padding-bottom` comparison; not reproducible from the repository alone (`desktop-web` has no real
  Tauri IPC, so the wizard cannot be reached with data).
- **`S1`** - tailoring run is slow; blocked on one read-only query against `tailoring_cache`'s
  `tokens_input`/`tokens_output`. Ask the maintainer before running it - standing rule against
  touching the live database without asking.
- **The disabled-Retailor state and locked editor mode (`P1`/`P2`/`B12`)** still need a native pass.
- **A separate, not-yet-chased-down question** from the session that diagnosed the filename bug: the
  maintainer's original repro (two different filenames for "the same CV") may have involved two
  different `document_library` rows (a job-scoped tailored draft via `jobDocLabel()` vs. the generic
  default CV), not only the code-path divergence this fix addresses. Worth one native check - open
  both entries in the Documents list side by side and compare IDs/labels - if the maintainer still
  sees a mismatch after this fix ships.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context (`libs/data/src/lib/tauri.invoke.ts`), so every gateway call fails and
  the app renders empty states only. Useful for pure DOM/CSS bugs reachable without data; useless for
  anything needing a real job, CV, or application - those need a native `tauri dev` pass, which only
  the maintainer can drive.
- **Cut every branch from `main`, and check `git branch --show-current` before assuming otherwise.**
  This repository's working tree has repeatedly reset to `main` between sessions.
- **When a backlog has several open items with different blockers, ask which one rather than
  guessing.**

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui --skip-nx-cache`, `nx test data`, `nx test
application`, `nx test desktop --maxWorkers=2`, `nx test ui` if touched, `nx test core` and `nx build
web` if `libs/core` changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it
changed, `nx build desktop`, `npm run quality:file-size -- --staged`, `npm run quality:attribution`,
`npm run format:check`, `git diff --check`.
