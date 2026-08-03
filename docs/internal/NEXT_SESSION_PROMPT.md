# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the latest entries in `docs/internal/DUTY_WATCH.md`. The four
watch entries dated 2026-08-03 and 2026-08-04 are the immediate history and are worth reading in
full before touching anything.

## Where things stand

`main` is clean, no open PRs. Measure with `npm run quality:file-size:all` - **not** the plain
`quality:file-size`, which is diff-scoped and whose clean report means only "nothing I touched is
near budget". That distinction has already caused one false all-clear in `CURRENT_STATE.md`.

Current audit: **47 files over budget** - 20 TypeScript, 13 stylesheets, 12 templates, 2 Rust.

The Rust side is nearly finished. Remaining: `commands/job_url.rs` 580/500 and
`commands/discover_geo.rs` 522/500. Both are small, mechanical, and follow the pattern the last six
PRs used. Doing them first is a reasonable warm-up that also closes Rust entirely.

After that, Angular is the whole remaining problem, and it is a different kind of work.

## The method that has been working

Every split in this campaign followed the same loop. Keep it.

1. **Consumer audit before choosing a seam.** `grep` every symbol you plan to move for uses outside
   the block. Twice this surfaced an inversion worth fixing in the same PR - `discover_parsers` was
   importing `RawJob` and `json_str` back out of `discover.rs`, and `ats_format` was importing
   `tokenize` out of `ats.rs`. The defining module should be the one consumers name.
2. **Extract line ranges to a scratch file first, then diff after deleting.** Do not skip this. It
   is what proves nothing was silently dropped, and it caught a real deletion once (PR #292).
3. **Move the tests with the code**, and keep the repo's `_tests.rs` sibling-file convention where
   the module already used it.
4. **Mutation-test the moved logic.** Break one real rule, confirm a named test fails, restore, and
   `diff` the restore to prove it is byte-exact.
5. Gates before commit: `cargo clippy --all-targets`, `cargo test --lib`,
   `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`,
   `git diff --check`. For Angular also `nx run desktop:type-check`, `lint`, `test`.
6. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`. The maintainer has authorised merging your own PRs once CI is green.

## Traps that have actually fired

- **A mutation run from the wrong directory looks exactly like a passing one.** Two runs in the last
  session silently never applied the mutation. Always print a "mutated" confirmation from the script
  itself, and use absolute paths.
- **A surviving mutation is not automatically a coverage gap.** One survivor turned out to be a
  no-op: the mutated code path was unreachable for that fixture. Check that the mutation actually
  changes behaviour before reporting or "fixing" it.
- **Never restore a mutated file with `git checkout` if the file is untracked** - it silently fails
  and leaves the mutation in place. Copy from a backup and `diff`.
- **Splits that move Tauri commands must repoint `lib.rs`** - and grep for direct
  `crate::ai::...`/`crate::commands::...` calls too. `commands/health.rs` called `cli_health`
  directly, which a registry-only check would have missed.
- **Angular style encapsulation stops the page's CSS at a child component's boundary.** Card styles
  had to move with the markup, including `.muted` and `.status`, which look like global utilities in
  this repo but are page-local. `.btn`, `.badge` and `.ai-thinking__dots` genuinely are global.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml` with a new date. Discard it.
- The correct format command is `npx nx format:write`, not `npm run format:write`.
- Open PRs against `main` only. Stacked PRs break CI with `fatal: ambiguous argument 'main'`.

## The Angular part, and the decision waiting in it

`jobs.component.ts` is 1080/400, its template 941/300, its stylesheet 860/400. The page has ~110
declarations of which **48 are pure aliases** onto services, existing only so the template can name
a signal.

The lever that works: the page provides **17 services component-scoped**, so a child component
rendered inside its template inherits that injector and can inject them directly. That deletes the
alias and the template block in one move. `app-job-document-cards` (PR #299) retired nine aliases
that way and is the worked example to copy.

Two constraints learned there:

- **Measure the template block before writing the child.** A single child for the whole wizard
  documents step would have been ~330 template lines - over the 300 budget on the day it was born.
- **Do not let a presentational child reach back into orchestration.** The final-checks section was
  deliberately left in the page because `retailorFromFinalChecks()` drives tailoring and scoring, and
  that is the code path the #284 duplicate-row bug lived on.

The wizard's remaining steps (`wizardExportApplyStep` ~120 template lines, `wizardTailorStep` ~172)
are the same shape and are the obvious next cuts.

**Ask the maintainer before starting Angular work.** UI changes here were agreed to be verified by
walking the flow in the running app (`npm run desktop:dev`), not by tests alone - a broken template
binding can pass type-check, lint and unit tests. Automated control of the app window was declined
last session, so either ask them to click through, or ask for access. Do not merge an Angular PR on
tests alone without saying so explicitly.

## Open item not in the campaign

A background task was filed: `cli_probe`'s status mapping in
`apps/desktop/src-tauri/src/ai/cli_probe.rs` has an untested branch that could report a broken CLI
as working in Settings. Pre-existing, low severity, needs a pure `status_for` extraction to become
testable. Pick it up only if the maintainer wants it.

## Housekeeping

A `npm run desktop:dev` process may still be running from the previous session. Check with
`pgrep -fl "tauri dev"` and stop it if it is not wanted.
