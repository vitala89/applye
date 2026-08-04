# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. The Rust half is finished; Angular is what remains.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent entries in `docs/internal/DUTY_WATCH.md`. The
entries from 2026-08-03 and 2026-08-04 are the campaign's own history and are worth reading before
touching anything.

## Where things stand

Measure with `npm run quality:file-size:all`. Do **not** read a clean `npm run quality:file-size` as
a repository-wide all-clear - that gate is diff-scoped, and misreading it already produced one false
claim in `CURRENT_STATE.md` that had to be corrected later.

Current audit: **44 files over budget** - 19 TypeScript, 13 stylesheets, 12 templates, and
**0 Rust**. Rust closed at 62 files, all within budget, after eight splits.

**One PR is open and needs a decision, not more work: `#309`, the wizard's tailor step.** It is
rebased onto `main`, all gates pass locally (type-check, lint, 1201 tests across 95 suites,
file-size, format, `git diff --check`), and CI was green before the rebase. It is deliberately **not
merged** - see the verification rule below.

## The verification rule for Angular, agreed with the maintainer

UI changes here are verified by walking the flow in the running app (`npm run desktop:dev`), not by
tests alone. A broken template binding passes type-check, lint and unit tests. Automated control of
the app window was requested once and **declined**, so either ask the maintainer to click through,
or ask for access - and never merge an Angular PR on tests alone without saying plainly that the
walkthrough did not happen.

For `#309` specifically, the flow worth clicking is the apply wizard's tailor step: the three phase
cards, starting a run from the base-CV picker, cancelling mid-run, and the change and gap notes a
finished run leaves behind.

## The lever that works on the jobs page

`jobs.component.ts` is 1068/400, its template 786/300, its stylesheet 624/400 (with `#309` applied).

The page has ~110 declarations of which roughly 40 are **pure aliases** onto services, existing only
so the template can name a signal. The unblocking observation: the page provides **17 services
component-scoped**, so a child component rendered inside its template inherits that injector and can
inject them directly - which deletes the alias and the template block in one move.

Two worked examples to copy: `app-job-document-cards` (PR #299, retired nine aliases) and
`app-job-tailor-step` (PR #309, retired seven).

Two constraints both of them ran into:

- **Measure the template block before writing the child.** One child for the whole wizard documents
  step would have been ~330 template lines - over the 300 budget on the day it was born. It had to
  become two.
- **Do not let a presentational child reach back into orchestration.** The final-checks section was
  left in the page on purpose, because `retailorFromFinalChecks()` drives tailoring and scoring, and
  that is the code path the `#284` duplicate-row bug lived on.

The wizard's remaining step, `wizardExportApplyStep` (~120 template lines), is the same shape and is
the obvious next cut. After that the page's own header and dialogs are what is left.

## The method every split in this campaign used

1. **Consumer audit before choosing a seam.** Grep every symbol you plan to move for uses outside
   the block. This surfaced two real inversions worth fixing in the same PR - `discover_parsers` was
   importing `RawJob` and `json_str` back out of `discover.rs`, and `ats_format` was importing
   `tokenize` out of `ats.rs`. The defining module should be the one consumers name.
2. **Extract the line ranges to a scratch file first, then diff after deleting.** Do not skip this.
   It is what proves nothing was silently dropped, and it caught a real deletion once (PR #292).
3. **Move the tests with the code.**
4. **Mutation-test the moved logic.** Break one real rule, confirm a _named_ test fails, restore,
   and `diff` the restore to prove it is byte-exact.
5. Gates before commit: `nx run desktop:type-check`, `lint`, `test`, `npm run quality:file-size`,
   `quality:attribution`, `format:check`, `git diff --check`. Rust also `cargo clippy
--all-targets` and `cargo test --lib`.
6. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`.

## Traps that actually fired in this campaign

- **A mutation run from the wrong directory looks exactly like a passing one.** Two runs silently
  never applied the mutation and reported all-green. Print a "mutated" confirmation from the script
  itself and use absolute paths.
- **A surviving mutation is not automatically a coverage gap.** One survivor was a no-op - the
  mutated path was unreachable for that fixture. Check the mutation actually changes behaviour
  before reporting or "fixing" it.
- **`git checkout` silently fails to restore an untracked mutated file.** Copy from a backup and
  `diff`.
- **Splits that move Tauri commands must repoint `lib.rs`** _and_ be grepped for direct calls.
  `commands/health.rs` called `cli_health` directly, which a registry-only check would have missed.
- **Angular style encapsulation stops the page's CSS at a child's boundary.** Extracted card styles
  had to travel with the markup, including `.muted` and `.status`, which look like global utilities
  here but are page-local. `.btn`, `.badge` and `.ai-thinking__dots` genuinely are global.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml` with a new date. Discard it.
- The format command is `npx nx format:write`, not `npm run format:write`.
- Open PRs against `main` only. Stacked PRs fail CI with `fatal: ambiguous argument 'main'`.
- Long-running branches conflict in `CHANGELOG.md` and `DUTY_WATCH.md` every time. Both conflicts
  are always pure additions - keep both sides, newest on top.

## Open items outside the campaign

- A background task is filed: `cli_probe`'s status mapping in `apps/desktop/src-tauri/src/ai/
cli_probe.rs` has an untested branch that could report a broken CLI as working in Settings.
  Pre-existing, low severity, needs a pure `status_for` extraction to become testable.
- `#301` is a dependabot bump (`ip-address` 10.2.0 -> 10.4.0) sitting in a blocked state.
- The worst single file in the repository is `discover.component.scss` at **1915/400**, untouched.
  Its page's template (1070/300) and class (1069/400) are equally untouched, and unlike the jobs
  page nobody has audited where its seams are.
