# Next session prompt

Copy everything below the line into a fresh session.

---

**Four print-pipeline fixes landed this session on the same feature, and three of them were each
disproved or extended by the maintainer's next native export. Confirm the fourth first, in five
minutes, before starting anything else.** Then decide whether to keep patching axis by axis or take
the real fix - both are laid out below, and the maintainer should choose, not the next agent alone.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries (start at
`2026-08-22, the print pipeline had three more layers, and only one is unmerged`),
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`.

## Read this before touching the print path again

Four defects were found in one evening in the same feature, each by reading the maintainer's own
exported PDF, never by running the app:

1. **`#511`** - `.page-card` fell back to `width: auto` during print, letting WKWebView re-derive the
   printable width independently of what `<lib-paginated-sheet>` had already measured every atom
   against. A word wrapped in the export that did not wrap in the preview, orphaning it onto the next
   page.
2. **`#512`** - fixed on a real rebuild, and the _next_ export still sheared text off the right edge.
   `.cvpreview-viewport`/`.letter-sheet-viewport` carry `padding: var(--space-4)` (12px) that no print
   rule had ever reached, pushing the whole (correctly-sized, per `#511`) page-card 12px past the
   margin `NSPrintInfo` had already established.
3. **`#514`** (open, unmerged) - fixed on the _next_ rebuild after that, and the export after _that_
   printed a section title twice: once cut off at the foot of one page, again in full at the top of
   the next. Traced to pagination deciding every page break once, on the editor's own on-screen
   layout, _before_ print CSS ever activates - a page-card packed to a screen-measured height that
   comes out even fractionally taller in print forces a break inside a box marked
   `break-inside: avoid`, and the observed failure is consistent with that break landing inside the
   atom rather than between atoms.

**The through-line is one number, computed twice.** WKWebView prints CSS pixels at 90 px/inch; the
screen renders at 96. `PRINT_PX_PER_MM` in `libs/core` exists to make those agree - but it is applied
once in TypeScript, in the browser, to decide the on-screen layout and the page-break decisions, and
independently a second time by WKWebView's own print layout when it actually paints. The two are meant
to land on the exact same value and mostly do, but "mostly" is not "always" at the sub-pixel level a
word-wrap or page-break decision needs - and every one of these four defects is that same gap
surfacing on a different axis (width, an unaddressed wrapper, height).

**The maintainer was asked directly why the export does not just save what the preview already shows,
without going through Rust, and answered it explicitly: it already does.** `<app-cv-preview>` is the
same Angular component in both places; Rust does not parse or reformat the document, it only drives
WKWebView's native print API - the only way to write a PDF silently, since a webpage cannot write
files without a dialog. **The maintainer also confirmed, explicitly, that a rasterized/screenshot
export is not acceptable regardless of how much simpler it would be: ATS parsers need real, selectable
text, which is the entire reason this pipeline exists in its current, harder shape.** Do not propose a
screenshot-based export as a way out of this class of bug - it was asked about and rejected on the
record.

Reading a PDF is cheap and beats guessing: `python3` with `pypdf` gives `/MediaBox`, every clip
rectangle (`re W n`), and every text run's position (`cm`/`Tm`) - a worked example is in each of the
four PR descriptions above and the `2026-08-22` Duty Watch entry. `qlmanage -t -s <size> -o <dir>
<file.pdf>` renders a visual thumbnail with no extra tooling on macOS. **This method finds real,
reproducible defects and is why four were found and fixed in one session - but it is forensics, not a
live pass, and three fixes in a row were each superseded by the next export because forensics on one
exported file cannot prove the fix works for every document shape.**

## First task, and it should take five minutes

Export a CV **and** a cover letter, each long enough to span two pages with a short final section
(Languages on the CV is what caught `#514`), and compare against the live preview.

Expected: no word wraps differently than the preview, no character is sheared off any edge, no
section title appears twice, and the page break falls where the preview shows it.

If it holds, tick `#514` as natively confirmed. If it does not, the gap is now a _fifth_ instance of
the same class of defect - at which point patching one more axis is very likely no longer the
efficient move. Read on before doing that.

## The real fix, if the maintainer wants it instead of a fifth patch

**Re-run pagination after print CSS activates, not before.** Today `awaitPrintSettle()`
(`apps/desktop/src/app/pages/documents/print-settle.util.ts`) waits for fonts and two settle ticks,
_then_ adds the `printing-cv` class that turns on every `@media print` rule - by which point
`PaginatedSheetComponent`'s `pages()` signal has already locked in which atoms go on which page-card,
computed entirely under normal screen CSS. Print CSS can change how an already-decided page-card is
drawn, but nothing re-measures atom heights or re-runs `paginate()` after the print layout is what is
actually in effect. That ordering is _why_ four different symptoms (width, an unaddressed wrapper,
height) all trace back to "measured under one layout, painted under a slightly different one" -
patching each axis narrows the gap without closing it, and there is no proof there are only four axes.

**This is a real change to `PaginatedSheetComponent`'s measure/settle sequence, not a one-file patch,
and needs its own design before implementation:**

- Can `.printing-cv` be added _before_ the first measure pass in the print route specifically (the
  interactive editor still needs its own, unprinted measurement), so `pages()` is decided once, under
  the layout that will actually be painted?
- If so, does anything in the interactive editor rely on `pages()` reflecting screen-only layout
  (e.g. the on-screen page count shown to the user, or the overflow warning)?
- `awaitPrintSettle`'s two 250ms ticks were themselves an attempt to let a settle cycle complete
  blindly; if pagination runs under the correct layout from the start, are they still needed, or does
  the settle wait shrink to "wait for `pages()` to stop changing" (bounded, not blind)?
- Run the Grilling gate before implementing (this changes `PaginatedSheetComponent`'s public timing
  contract, shared by both the CV and cover-letter print routes) - but the four confirmed root causes
  above are settled findings, not open questions; do not re-ask them.

Get the maintainer's decision on this before starting: keep axis-by-axis patching as symptoms surface,
or take this redesign now while the whole failure mode is fresh and characterized.

## What else is open (unchanged this session, not touched)

- **`B9`** - the wizard's footer padding. Needs which two steps differ and the computed
  `padding-bottom` of `.apply-wizard__footer` and its scrolling ancestor on each.
- **`B5`** - a section indented and narrowed on exported page two. Needs the exported page or the DOM
  of the card that lands after the break.
- **`S1`** - blocked on one query against `tailoring_cache`'s `tokens_input`/`tokens_output`.
- **A raw Cmd+P in either document editor prints the whole application** (no `printing-cv` class, no
  page rule). Pre-existing, recorded under `B4`.
- **The disabled-Retailor state and the locked editor mode (`P1`/`P2`/`B12`) still need a native pass**
  - automated coverage exists, WKWebView-specific rendering does not have any.

## Do not re-open

- **The gateway migration and the `ADR-0005` file-size campaign are finished.**
- **The file-size budget comment-exclusion is finished** (`#510`, merged 2026-08-21) - budgets now
  exclude comment lines via `tools/lib/comment-mask.mjs`, and every threshold was lowered by its
  category's measured comment share. Do not re-raise "should comments count" as an open question.
- **The desktop suite is not flaky.** `--maxWorkers=2` is clean; check machine load before the code.
- **Two dependency advisories are deliberately open**: `glib` `GHSA-wrw7-89jp-8q8g` and the
  `image-size` -> `less` npm chain. Closing either costs more than it buys.
- **`style-src 'unsafe-inline'`** is an Angular constraint, documented in `docs/architecture.md`.
- **A screenshot/rasterized PDF export is not the fix** - asked about and explicitly rejected by the
  maintainer this session. ATS text-readability is a hard requirement, not a nice-to-have.

## Workflow notes that cost time

- **`gh pr view <n> --json state,mergedAt` before assuming a branch reflects what's running.** This
  session's second and third fixes were only correctly diagnosed after confirming the maintainer had
  actually rebuilt (`nx reset`) and re-exported on the merged fix, not a stale build.
- **Cut every branch from `main`, and check.** A branch cut from another feature branch conflicts
  against its own squash-merged self, which looks like a content conflict and is not.
- **The database is three files** (`applye.db`, `-wal`, `-shm`). Back up with
  `sqlite3 … ".backup …"`, never `cp`.
- **`npm run quality:file-size` reports "no changed source files to check" against a docs-only tree.
  That is not a pass.** Use `--staged` after `git add`, or `--base origin/main`.
- **`--skip-nx-cache` on lint is mandatory**: orphaned imports survive a green type-check.
- **A change in `libs/` may not reach a running dev server.** `npx nx reset` and a full restart, not
  HMR.
- **Only `CHANGELOG.md`, `CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md` ever
  conflict.** Keep both sides, newest first, then `prettier --write`.
- **Run `check-style-move.mjs` whenever a stylesheet changes**, and name a deliberate delta in the
  pull request rather than letting it read as a move.
- **PDF forensics workflow, worked four times this session:** `python3` + `pypdf`
  (`PdfReader(...).pages[i].mediabox`, `.get_contents().get_data()` for the raw content stream, regex
  for `re W n` clip rectangles and `cm`/`Tm` text-position matrices) plus `qlmanage -t -s <n> -o <dir>
<file>` for a visual render. No extra install needed on macOS; `pdftoppm`/`pdftotext` are not
  installed and `pip install poppler` is not necessary.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` when `libs/ui` changed,
`nx run-many --target=lint --projects=data,application,desktop,ui --skip-nx-cache`, `nx test data`,
`nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` when `libs/ui` changed,
`nx test core` when `libs/core` changed, `nx build desktop`, `nx build web` when `libs/core` changed,
`cargo check` and `cargo test --lib` in `src-tauri` when anything under it changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.

Run triage and the Plan Check from `AGENTS.md` before touching code, and invoke `aif-grilling` when a
decision changes a `libs/` public API, a database schema, or the privacy or security posture - which
the pagination redesign above does.

**Say plainly what a check does and does not prove.** Three of this session's four print fixes were
reported fixed on a green suite that could not see the defect - none of these bugs are visible to
jsdom, which has no layout. A green test here is a guard on a technique, not evidence the export is
correct; only a native `tauri dev` export, read the same forensic way, is that evidence.
