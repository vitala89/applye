# Next session prompt

Copy everything below the line into a fresh session.

---

**The print pipeline (`#511`-`#516`), `B5`, and the export-filename split (`#518`) are all closed and
merged to `main`.** There is no code left to write from what past sessions diagnosed - everything
that remains open needs the maintainer to drive the app natively, which this repository-only
environment cannot do. Read the state below, then **ask the maintainer which item to take** rather
than guessing - that has gone faster than picking every time it came up this week. `B9` was tried on
2026-08-22 and deferred - it did not reproduce on demand from a verbal description alone, so it is
the weakest candidate to lead with again unless the maintainer has since caught it with a screenshot
in hand.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-22` entries in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, at `90157723` or later, clean. **Verify this before
  trusting anything else below** - this repository's working tree has repeatedly reset to `main`
  between sessions, and branches have drifted from what a stale prompt claimed.
- `#511`-`#516` (print pipeline), `B5` (LANGUAGES page-two indent), and the export-filename split are
  **all merged**. [`PR #518`](https://github.com/vitala89/applye/pull/518) unified the three filename
  functions into `document-filename.ts` - full detail in `docs/internal/DUTY_WATCH.md`'s two
  2026-08-22 entries about it.
- Local and remote `fix/export-filename-unify` branches still exist post-merge (not auto-deleted) -
  harmless; delete them if you want a tidy branch list, but that was not asked for, so it was left.

## What's open - every item below needs the maintainer, not more code reading

Source: `docs/internal/NATIVE_GATE_FINDINGS.md` (verbatim status, re-checked 2026-08-22 - do not
re-diagnose any of these from the repository, the mechanism is already found for all but `B9`):

1. **`B9`** - the apply wizard's footer (Cancel/Next row) has inconsistent bottom padding between
   steps. **Confirmed NOT reproducible from the repository** - the footer is one element with no
   bottom padding at all, so nothing here can even produce the symptom to look at. **Tried to catch
   it live on 2026-08-22**: the maintainer described it verbally (padding present, then missing on
   the footer right after pressing Next/Continue to move to the next step) but could not reproduce it
   on demand in that moment, and no screenshot was captured. **Possibly already fixed** - several
   layout-affecting changes landed this week (`#511`-`#516`, the P1/P2/B12 native-lock UI). What
   would settle it, if it recurs: which two steps differ, plus the computed `padding-bottom` of
   `.apply-wizard__footer` and its scrolling ancestor on each, or two screenshots at the same window
   height (one with the gap, one without, right after the Next click that triggered it). Needs the
   maintainer running `tauri dev` with real data - ask them to grab it next time it happens rather
   than trying to force a repro from a description alone, which did not converge this session.

2. **`P1`/`P2`/`B12`** - fixed in code on 2026-08-21 (`JobActionsService.markApplied` split,
   `decideCoverLetterAction`'s `!linked` branch now `keep`, Retailor disabled once a job leaves
   `saved`, `DocumentApplicationLockService` forces the CV/cover-letter editors read-only for a
   locked application). **Not verified natively.** Needs the maintainer to exercise: Create
   Application with only a CV generated (cover letter should stay ungenerated), press Apply on the
   summary screen, confirm Retailor is disabled and both editors go read-only for that job.

3. **`S1`** - tailoring run takes ~2.5 minutes, half of it the dual-critique pass. Root cause is
   already measured; the next step is one **read-only** query against `tailoring_cache`'s
   `tokens_input`/`tokens_output` to size the fix. **Ask the maintainer before running it** -
   standing rule against touching the live database without asking, even read-only.

4. **A loose end from the filename fix**: the maintainer's original repro (two different filenames
   for "the same CV") may have involved two different `document_library` rows - a job-scoped tailored
   draft (via `jobDocLabel()`) versus the generic default CV - rather than only the code-path
   divergence `#518` fixed. This is now moot if the maintainer confirms the fix resolved what they
   saw; worth one native check only if they still see a mismatch: open both entries in the Documents
   list side by side and compare IDs/labels.

None of the four has a next action inside this repository. **Ask which one the maintainer wants
looked at, or whether there's something else entirely** - do not pick one and start without asking.

## Do not re-open

- **The print pipeline, `B5`, and the export-filename unification are done.** Do not re-litigate any
  of them, including the naming direction `#518` settled (DE convention spreads to every CV entry
  point; cover letters stay region-blind; one consolidated file) - if new information changes that
  premise, say so explicitly and re-triage rather than quietly re-deciding.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text.
- **Third-party PDF libraries** were raised out of frustration in an earlier session and should not be
  adopted reflexively - see the reasoning already on file if this comes up again.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context, so every gateway call fails and the app renders empty states only.
  Useful for pure DOM/CSS bugs reachable without data; useless for anything needing a real job, CV,
  or application - those need a native `tauri dev` pass, which only the maintainer can drive.
- **Cut every branch from `main`, and check `git branch --show-current` before assuming otherwise.**
- **When several open items have different blockers, ask which one rather than guessing** - this has
  been true every time it came up this week.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui --skip-nx-cache`, `nx test data`, `nx test
application`, `nx test desktop --maxWorkers=2`, `nx test ui` if touched, `nx test core` and `nx build
web` if `libs/core` changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it
changed, `nx build desktop`, `npm run quality:file-size -- --staged`, `npm run quality:attribution`,
`npm run format:check`, `git diff --check`.
