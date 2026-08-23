# Next session prompt

Copy everything below the line into a fresh session.

---

**Seven bugs found and fixed via native testing this session (`#520`-`#526`) are all closed and
merged to `main`.** The maintainer ran the apply wizard and My Jobs scoring end to end in `tauri dev`
and reported what broke, one at a time; each was diagnosed, fixed, gated, and shipped before moving to
the next. Two chained mistakes are worth reading before touching this area again: `#520`'s fix was the
wrong shape and needed `#522` on top of it, and `#523`'s scoring-persistence fix targeted the wrong
method and needed `#525` on top of it - see `docs/internal/DUTY_WATCH.md`'s 2026-08-23 entry for the
full chain and why each follow-up was necessary. There is no code left to write from what this session
diagnosed. Everything that remains open needs the maintainer to drive the app natively, exactly as
before this session - **ask the maintainer which item to take** rather than guessing.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the 2026-08-23 entry in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, at `0c5cbea1` or later, clean. **Verify this before
  trusting anything else below** - this repository's working tree has repeatedly reset to `main`
  between sessions.
- `#520`-`#526` are **all merged**: the Retailor badge/cache bug (closed properly only as of `#522`),
  a tailor-pass Retry button (`#521`), score/rescore surviving navigation plus honest Cancel copy
  (`#523`, completed by `#525`), and the score/rescore spinner living inside the button rather than
  beside it (`#524`, corrected by `#526`). Full narrative in `DUTY_WATCH.md`.
- `#526` briefly showed as `CONFLICTING` on GitHub because it branched before `#525` merged and both
  touched the top of `CHANGELOG.md`/`CURRENT_STATE.md`. Resolved with a merge commit (not a rebase),
  already pushed and merged - nothing left to do about it.
- A stale `tauri dev` build caused two false-alarm bug reports this session (the maintainer testing
  code that predated the fix they thought they were testing). If a fix looks like it "didn't work,"
  check `git log -1 --oneline` in the terminal running `tauri dev` and confirm it matches `main`
  _before_ re-diagnosing the code - both false alarms this session would have resolved in one command.

## What's open - every item below needs the maintainer, not more code reading

Source: `docs/internal/NATIVE_GATE_FINDINGS.md` (verbatim status as of 2026-08-22 - not re-checked this
session, since this session's native reports were about tailoring/scoring, not these four):

1. **`B9`** - the apply wizard's footer (Cancel/Next row) has inconsistent bottom padding between
   steps. **Confirmed NOT reproducible from the repository.** Tried to catch it live on 2026-08-22; the
   maintainer could not reproduce it on demand and no screenshot was captured. **Possibly already
   fixed** by this week's layout changes - the weakest of the four to lead with unless the maintainer
   has since caught it with a screenshot or the two step names in hand.

2. **`P1`/`P2`/`B12`** - fixed in code on 2026-08-21 (`JobActionsService.markApplied` split,
   `decideCoverLetterAction`'s `!linked` branch now `keep`, Retailor disabled once a job leaves
   `saved`, `DocumentApplicationLockService` forces the CV/cover-letter editors read-only for a locked
   application). **Still not verified natively** - this was the item planned for this session, but the
   maintainer's live testing surfaced the seven tailoring/scoring bugs instead. Needs the maintainer to
   exercise: Create Application with only a CV generated (cover letter stays ungenerated), press Apply
   on the summary screen, confirm Retailor is disabled and both editors go read-only for that job.

3. **`S1`** - tailoring run takes ~2.5 minutes, half of it the dual-critique pass. Root cause is
   already measured; the next step is one **read-only** query against `tailoring_cache`'s
   `tokens_input`/`tokens_output` to size the fix. **Ask the maintainer before running it** - standing
   rule against touching the live database without asking, even read-only.

4. **A loose end from the filename fix (`#518`)**: the maintainer's original repro (two different
   filenames for "the same CV") may have involved two different `document_library` rows rather than
   only the code-path divergence `#518` fixed. Moot if the maintainer confirms the fix resolved what
   they saw; worth one native check only if they still see a mismatch: open both entries in the
   Documents list side by side and compare IDs/labels.

None of the four has a next action inside this repository. **Ask which one the maintainer wants looked
at, or whether there's something else entirely** - do not pick one and start without asking.

## Do not re-open

- **The print pipeline, `B5`, the export-filename unification, and this session's seven tailoring/
  scoring fixes (`#520`-`#526`) are done.** Do not re-litigate any settled decision, including: the DE
  filename convention spreads to every CV entry point (`#518`); `isTailored` reads a `source: 'tailored'`
  tag on the linked CV rather than replaying a cache-hash chain, and does **not** attempt a full
  phase-card/Changes/Gaps restore on reopen - that was explicitly scoped out in `#522`'s grilling round
  and stays a separate, larger ask if the maintainer wants it later; real mid-request AI cancellation
  needs new Rust plumbing and was explicitly deferred in `#523`'s grilling round in favor of honest
  button copy - do not build the Rust cancellation registry without a fresh grilling round confirming
  the maintainer still wants it now. If new information changes any of these premises, say so
  explicitly and re-triage rather than quietly re-deciding.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text.
- **Third-party PDF libraries** were raised out of frustration in an earlier session and should not be
  adopted reflexively - see the reasoning already on file if this comes up again.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context, so every gateway call fails and the app renders empty states only.
  Useful for pure DOM/CSS bugs reachable without data; useless for anything needing a real job, CV, or
  application - those need a native `tauri dev` pass, which only the maintainer can drive.
- **When the maintainer reports a fix "isn't working," check for a stale build before re-diagnosing
  the code.** `git log -1 --oneline` in the `tauri dev` terminal, compared against the commit that
  actually shipped the fix, settles it in one step - two separate reports this session turned out to be
  this, not a code problem.
- **Cut every branch from `main`, and check `git branch --show-current` before assuming otherwise.**
- **When several open items have different blockers, ask which one rather than guessing.**
- **A fix that looks locally correct can still be built on a wrong assumption about a sibling method or
  code path.** Both `#520`→`#522` and `#523`→`#525` were cases where the first fix was real and
  well-tested but addressed the wrong instance of the underlying pattern; the giveaway both times was
  the maintainer reproducing the _exact_ reported symptom again after the fix merged. Take that
  seriously rather than assuming a stale build first - check the build second, and only after reading
  whether the method the report is actually about was the one touched.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui,i18n,core --skip-nx-cache` (scope to touched
projects), `nx test data`, `nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` if
touched, `nx test i18n` if any locale file changed, `nx test core` and `nx build web` if `libs/core`
changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it changed, `nx build
desktop`, `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`,
`git diff --check`.
