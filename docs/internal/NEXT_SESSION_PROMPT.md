# Next session prompt

Copy everything below the line into a fresh session.

---

**The print bug is fixed and unconfirmed. Confirm it first, in five minutes, before starting
anything else** - four of its five attempts were rejected by a native export, and the fifth has not
been looked at yet. Then `P1`/`P2`/`B12`, which is specified in the maintainer's own words and has
been waiting several rounds.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`.
`docs/internal/NATIVE_GATE_FINDINGS.md` is the work list.

## Read this before touching the print path

`B4` - "the exported PDF does not use the margins shown in the editor" - took **five** attempts, and
four of them were wrong in the same way. **Every one of them changed the layer where the symptom was
visible.** The margins turned out to have three owners: the CSS `@page` rule, the card's padding, and
`NSPrintInfo` in `commands/print.rs`. On top of that the previews modelled the page at `96 / 25.4`
while WKWebView prints CSS pixels at **0.8 points** - 90 to the inch - so every page was **6.67%
larger than the sheet** and the bottom of each card was **clipped away**. The export was losing text,
not mis-margining it.

**Nothing in this repository could distinguish any of those.** jsdom has no layout, and the engine
that prints is not here. What settled it was the maintainer exporting the same CV twice, once with
20mm margins and once with none, and the clip box and text-matrix scale being read straight out of
the two files. **When a defect is only visible in the output, ask for the output.** The general rule
is in the `2026-08-21` Duty Watch entries and it is the most expensive thing this project has learned
this month: _when a value can be applied by more than one layer, count the layers before choosing
which one to change._

Reading a PDF is cheap and you should do it rather than reason: `/MediaBox` gives the paper, the
`re W n` clip box gives what the print system allowed, and the `cm` matrices give the scale and where
text actually landed. `python3` with `zlib` is enough; there is a worked example in the
`2026-08-21` entry titled "the preview believed in a page 6.67% too big".

## First task, and it is five minutes

Export a **two-page** CV from **both** buttons - the editor's Export and the Documents list's - and
compare with the on-screen preview.

Expected: the two files are identical, the margins match the Style card, the page break falls where
the preview shows it, and no text is missing from the end of page one.

If the break still differs, the remaining gap was **one block** at last measurement. Ask for the file
and measure it; do not reason about it. If it matches, tick `B4` in `NATIVE_GATE_BACKLOG.md` along
with `B2`, `B6` and `B10`, which the maintainer already confirmed on 2026-08-21.

## Then: `P1`, `P2` and `B12`, as one change

The maintainer specified this, in this order, and each answer is recorded in
`NATIVE_GATE_FINDINGS.md`:

1. **Create Application saves; it does not apply.** The status is the existing `saved` - there is no
   `tailored` in the schema, and the job detail already shows a Tailored badge from the tailoring
   cache, so no migration, no seventh status, no Pipeline column.
2. **An Apply button is the user's own act**, pressed after they have actually submitted the
   employer's form on the employer's site.
3. **`applied` is terminal for everything.** Retailor **disabled**, not hidden. Editing closed. The
   CV and cover letter become **read-only or deletable, not editable** - the version that was sent is
   the version that exists. **The read-only editor mode does not exist today and is the largest piece
   of this work.**
4. **`B12`: nothing is generated that was not asked for.** Today `JobActionsStore.markApplied` calls
   `JobDocumentsStore.commit`, and with no cover letter linked `decideCoverLetterAction` answers
   "create" - so Create Application silently generates a cover letter the user deliberately skipped,
   which is also why it takes so long. Commit what exists; skip what does not.

`P2` is **half-built already**: an applied job shows `Applied - description is locked` and the
description is read-only. The gap is the Retailor button and the documents.

Run the grilling gate on the details before implementing - what a disabled Retailor says, what the
Create Application step shows, what a read-only editor looks like - but **not** on the four decisions
above. Those are settled and re-asking them wastes the maintainer's time.

## What else is open

- **`B9`** - the wizard's footer padding. Three candidate causes were eliminated by reading: one
  footer element rendered outside the step switch, no bottom padding on it to vary, and the shell's
  page-bottom gap added in July. **It needs evidence, not more reading**: which two steps differ, and
  the computed `padding-bottom` of `.apply-wizard__footer` and its scrolling ancestor on each. The
  maintainer's clue - present on a first tailoring, absent on a re-tailor - narrows it from "varies
  between steps" to "varies with state".
- **`B5`** - a section indented and narrowed on exported page two. Needs the exported page or the DOM
  of the card that lands after the break.
- **`S1`** - blocked on **one query**, not on a decision. `tailoring_cache` already records
  `tokens_input` and `tokens_output` per pass; the query is in the `S1` entry. Reading the prompt
  disproved the hypothesis that file used to carry, and `S3` (the profile and JD re-sent uncached on
  all three passes) was found while doing it.
- **A raw Cmd+P in either document editor prints the whole application.** It sets no `printing-cv`
  class and injects no page rule. Pre-existing, found while deleting `printWithPageRule`, recorded
  under `B4`.
- **An open question for the maintainer, not a defect:** `quality:file-size` counts **every non-empty
  line, comments included** (`effectiveLineCount` in `tools/check-file-size-budgets.mjs`). This
  repository asks for reasoning to be written down and then charges for it: on 2026-08-21
  `cv-detail.component.ts` crossed 400 because of one doc block, not because of logic. That was
  resolved well - the explanation moved to the shared service, one copy instead of two - but the next
  one might be resolved by deleting the explanation. Options are: leave it, exclude comments and
  lower the thresholds, or budget comments separately. **Do not decide this alone.**

## Do not re-open

- **The gateway migration and the `ADR-0005` file-size campaign are finished.**
- **The desktop suite is not flaky.** Failures reading `Exceeded timeout of 5000 ms` with **no
  assertion failing** are nine jest workers on a loaded machine - `PR #487` measured it. It happened
  again on 2026-08-21 while the maintainer had a Tauri dev server and a PDF viewer running.
  `--maxWorkers=2` is clean. **Check the machine's load before the code.**
- **Two dependency advisories are deliberately open**: `glib` `GHSA-wrw7-89jp-8q8g` (Linux-only,
  reached through the gtk-rs stack Tauri pins) and the `image-size` → `less` npm chain (zero `.less`
  files, both apps set `inlineStyleLanguage: scss`). Closing either costs more than it buys.
- **`style-src 'unsafe-inline'`** is an Angular constraint, documented in `docs/architecture.md`.

## Workflow notes that cost time

- **Cut every branch from `main`, and check.** A branch cut from another feature branch conflicts
  against its own squash-merged self, which looks like a content conflict and is not.
- **The database is three files** (`applye.db`, `-wal`, `-shm`). Back up with
  `sqlite3 … ".backup …"`, never `cp`.
- **`npm run quality:file-size` reports "no changed source files to check" against a docs-only tree.
  That is not a pass.** Use `--staged` after `git add`, or `--base origin/main`.
- **`--skip-nx-cache` on lint is mandatory**: orphaned imports survive a green type-check.
- **A change in `libs/` may not reach a running dev server.** `npx nx reset` and a full restart, not
  HMR - this cost a whole round on 2026-08-21 when a fix was merged, rebuilt and still absent.
- **Only `CHANGELOG.md`, `CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md` ever
  conflict.** Keep both sides, newest first, then `prettier --write`.
- **Run `check-style-move.mjs` whenever a stylesheet changes**, and name a deliberate delta in the
  pull request rather than letting it read as a move.

## Gates before commit

`nx run desktop:type-check`,
`nx run-many --target=lint --projects=data,application,desktop --skip-nx-cache`, `nx test data`,
`nx test application`, `nx test desktop`, `nx test core` when `libs/core` changed, `nx build desktop`,
`nx build web` when `libs/core` changed, `cargo check` and `cargo test --lib` in `src-tauri` when
anything under it changed, `npm run quality:file-size`, `npm run quality:attribution`,
`npm run format:check`, `git diff --check`.

Run triage and the Plan Check from `AGENTS.md` before touching code, and invoke `aif-grilling` when a
decision changes a `libs/` public API, a database schema, or the privacy or security posture.

**Say plainly what a check does and does not prove.** Four rounds of this bug were reported as fixed
on the strength of a green suite that could not see the defect. A test that pins a technique is a
guard, not evidence.
