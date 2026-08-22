# Next session prompt

Copy everything below the line into a fresh session.

---

**The print-pipeline duplicate-heading bug is closed and natively confirmed - this is a genuinely
different state from every previous handoff on this line of investigation, which all opened with
"still broken, do not trust the last confirmation."** This one does not carry that caveat. Read the
mechanism below before touching anything else, because the fix that worked is not the fix the last
four sessions kept trying.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-22` entry in `docs/internal/DUTY_WATCH.md` (titled
"duplicate-heading print bug: root cause was fragmentation, not a margin gap"), and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand, mechanically

- **Branch `fix/paginated-sheet-print-fragmentation`, cut from `main`, is gate-clean and
  uncommitted.** Check `git branch --show-current` before assuming otherwise - this repository has
  handed off mid-branch before with the working tree quietly back on `main`.
- **The first task is trivial and should take one command:** commit the branch and open a PR. Nothing
  is blocking it. Everything below this line is background for that commit message and for what comes
  after, not more investigation to do first.
- Full gate set already run and green on the branch: lint (`data`/`application`/`desktop`/`ui`,
  `--skip-nx-cache`), `desktop:type-check`, `ui:type-check`, `nx test data/application/ui/desktop`
  (83 / 1684 / 37 / 1165, all passing), `nx build desktop`, `quality:file-size --staged`,
  `quality:attribution`, `format:check`, `git diff --check`. `libs/core` and `src-tauri` were
  untouched, so their gates were skipped, correctly.

## The bug, the mechanism, and why four prior fixes missed it

**"LANGUAGES" (and in one export, a whole bullet's worth of text) was printing twice: once, clipped,
near the bottom of one page, and again in full at the top of the next.** Four sessions tried to close
this by giving the paginator more headroom - `PRINT_HEIGHT_SAFETY_MARGIN_PX` went 16 to 24 on the
theory that it was the same on-screen-vs-print sub-pixel gap that a width margin had already fixed for
right-aligned text, just showing up on the height axis instead.

**That theory was wrong, and this session found out why with two native exports read forensically
(`pypdf`, per-run text position measured against the font's own `/Widths` array - never eyeballed).**
The paginator's own page-break decision was _already correct_: the second page's clip region was
exactly one heading plus one line tall, meaning the heading had genuinely been assigned to the right
page. The duplicate was WKWebView's own print rasterizer: it begins laying the _next_ page-card out in
whatever printable space is left at the foot of the _current_ page, paints that card's first line(s)
into the leftover space, and only afterward honours the forced page break - so the same content gets
drawn once in the leftover strip and once, correctly, on the following page.

**This means every margin increase had been making the bug worse, not better.** More packing headroom
means less content fits on each page, which means _more_ unused space at the foot of every page for
WKWebView to fragment the next card into. The lever had been pointed the wrong way since `#514`.

**Two more fixes were tried and measured to change nothing, before the real one:**

1. Swapping `break-before: page` for `break-after: page` on the page-card wrap - grilled with the
   maintainer, confirmed as one clean selector swap via `check-style-move.mjs`, all gates green. A
   fresh export showed the exported PDF's clip geometry unchanged to the hundredth of a point. This
   proved the break property was never the lever - the leftover space exists on either side of it.
2. (Not separately tried, but worth knowing if the fix below ever needs revisiting): raising the
   height margin further would only enlarge the leftover space, per the mechanism above.

**The fix that measured clean:** every page-card but the last is now given the exact printed page
height, closing off the leftover space entirely.

- `pageBoxHeightPx()`, a new computed signal in `PaginatedSheetComponent`
  ([paginated-sheet.ts](../../libs/ui/src/lib/paginated-sheet/paginated-sheet.ts)), returns the full
  printable page height minus a new, separately measured `PRINT_PAGE_BOX_TRIM_PX = 1` (a live export's
  own content box read 728.00pt / 910.00px at WKWebView's 0.8 print scale, where the geometry computed
  910.63px - a small screen-vs-print rounding gap, same category as the width fix's own).
- A new `--pc-page-height` CSS custom property carries it onto each `.page-card`
  ([paginated-sheet.html](../../libs/ui/src/lib/paginated-sheet/paginated-sheet.html)).
- [styles.scss](../../apps/desktop/src/styles.scss) applies it: `.page-card-wrap:not(:last-child)
.page-card { height: var(--pc-page-height) !important; }`. The **last** card deliberately keeps
  `height: auto` - giving it a full page too, with nothing following it, is exactly what produces a
  trailing blank page.
- The two margin constants (`PRINT_HEIGHT_SAFETY_MARGIN_PX = 24`, `PRINT_WIDTH_SAFETY_MARGIN_PX = 4`)
  both stay. Their headroom now sits _inside_ each full-height card, below its last atom, where nothing
  can be painted into it - they stopped being the mechanism that closes the duplicate-paint bug, but
  they still do real, independently measured work (the width margin: `Oslo, Norway` would otherwise
  end roughly 2.77pt past the clip edge; both numbers were re-verified this session with a corrected
  forensic method - see the `DUTY_WATCH.md` entry for the 90-DPI scale-factor bug in the _first_ pass
  of that verification, since it is worth knowing before trusting any pypdf-based measurement in this
  codebase).
- **Confirmed by the maintainer directly**: re-exporting the same CV after the CSS change matched the
  in-app preview exactly, with the leftover clip region gone, the heading present only on the correct
  page, and the page count unchanged at 2 (not 3 - the `:not(:last-child)` guard against a trailing
  blank page held).

## First task, concretely

1. `git branch --show-current` - confirm you're on `fix/paginated-sheet-print-fragmentation`, or check
   it out if not.
2. Commit. The gate set is already green (see above); nothing new needs to run unless you've changed
   something since. A commit message should name the fragmentation mechanism, not "raise the margin
   again" - the whole point of this fix is that it is not another margin change.
3. Open a PR against `main`.

## Second task: the pagination-timing redesign question, now genuinely open again

Discussed at length in an earlier session, deliberately deferred pending a clean native result on this
exact line of investigation (re-run `PaginatedSheetComponent`'s `pages()` computation _after_ print CSS
activates, not before - today `awaitPrintSettle()` in
[print-settle.util.ts](../../apps/desktop/src/app/pages/documents/print-settle.util.ts) adds the
`printing-cv` class only after its own settle ticks, by which point pagination already locked in page
breaks under normal screen CSS).

**That clean result now exists.** The duplicate-paint bug is closed at its source - a card that fills
its own page cannot fragment into the next one - not patched around with headroom. This is a strong
signal the redesign is not needed for the failure mode that motivated it. But "not needed" is a
recommendation, not a decision already made: **ask the maintainer explicitly** whether to close the
redesign discussion or still pursue it for other reasons (a residual on-screen-vs-print divergence
could still theoretically show up elsewhere; the redesign was never scoped to only this one bug). Do
not silently drop it, and do not restart it without asking first - both are what "genuinely open again"
means here.

If it does proceed, the settled scope from the earlier grilling round still holds: only
`cv-print.component.ts`, `cover-letter-print.component.ts`, `print-settle.util.ts`. Nothing outside
`paginated-sheet.ts` consumes the `pages()` signal, so it cannot affect the interactive editor's own
on-screen pagination, page count, or overflow warning.

## Do not re-open

- **A screenshot/rasterized PDF export is not the fix.** Rejected by the maintainer in an earlier
  session. ATS parsers need real, selectable text.
- **A third-party PDF-generation library was raised by the maintainer out of frustration** in an
  earlier session and should still not be adopted reflexively. The root cause this session found was
  narrow and specific to WKWebView's own page-fragmentation behavior at a forced break - a structured
  PDF renderer would not have been immune to a differently-shaped version of the same class of bug, and
  this codebase already tried and abandoned a hand-rolled renderer once (see the module header of
  [wysiwyg-print.ts](../../apps/desktop/src/app/pages/documents/wysiwyg-print.ts)). If the maintainer
  still wants this conversation, have it deliberately, not as a reflex to a hard bug - which this one no
  longer is.
- **The gateway migration and the `ADR-0005` file-size campaign are finished.**
- **The file-size budget comment-exclusion is finished** (`#510`, merged 2026-08-21).
- **The desktop suite is not flaky** - `--maxWorkers=2` is clean; check machine load before the code.
- **Two dependency advisories are deliberately open**: `glib` `GHSA-wrw7-89jp-8q8g` and the
  `image-size` -> `less` npm chain.
- **`style-src 'unsafe-inline'`** is an Angular constraint, documented in `docs/architecture.md`.

## What else is open, untouched this and last session

- **`B9`** - wizard footer padding. Needs which two steps differ and the computed `padding-bottom`.
- **`B5`** - a section indented/narrowed on exported page two. Needs the exported page or the DOM.
- **`S1`** - blocked on one query against `tailoring_cache`'s `tokens_input`/`tokens_output`.
- **A raw Cmd+P in either editor prints the whole application** - pre-existing, recorded under `B4`.
- **The disabled-Retailor state and locked editor mode (`P1`/`P2`/`B12`)** still need a native pass.

## Workflow notes that cost real time across this line of investigation

- **A directory's mtime only reflects changes to its direct children, not its descendants.** The
  previous session read `NetworkCache`'s parent directory's June mtime as proof of a stale WebKit disk
  cache; it was a false alarm. Checking a cache's _contents_ for the actual data in question (`grep` a
  specific constant out of the cached blob directly) is reliable; checking a directory's own mtime is
  not.
- **A forensic PDF-measurement script needs the page's own print scale, not just the text matrix.**
  WKWebView's print pass writes `Tf /F 1` with the real point size in the text matrix, then applies a
  page-wide `cm` scale of `0.8` (72pt / 90px-per-inch - it rasterizes print output at 90 DPI, not 96).
  A script that reads `tm[0]` alone as the effective font size overstates every measured width by 25%,
  which produced several nonsense "0.9pt past the edge" and "120pt past the edge" readings this session
  before the scale factor was found and corrected. Any future `pypdf` measurement against this
  pipeline's exports should account for it from the start.
- **A wrapped multi-line text run reported by `pypdf`'s `visitor_text` callback carries only its first
  line's true origin.** Summing glyph widths across the whole run (including later lines) produces a
  fictional "end position" for a line that was never drawn - exclude any run whose computed width
  exceeds the known column width before trusting its right-edge measurement.
- **Distinguish test/demo data the maintainer manually edited from real bug evidence before spending
  time on it.** An earlier session spent a full round chasing manually-pasted padding as a live defect.
  Ask directly before treating duplicated content as a new bug instance.
- **Never query the live user database, even read-only, without asking first.** Reason from what the
  maintainer can show you (exports, screenshots) instead.
- **Cut every branch from `main`, and check `git branch --show-current`.** The working tree has more
  than once turned out to be back on `main` at the start of a session.
- **`npm run quality:file-size` reports "no changed source files to check" against a branch with no
  divergence from its base yet - that is not a pass.** Use `--staged` after `git add`, or
  `--base origin/main` once the branch has commits ahead.
- **`--skip-nx-cache` on lint is mandatory**: orphaned imports survive a green type-check.
- **Only `CHANGELOG.md`, `CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md` ever
  conflict.** Keep both sides, newest first, then `prettier --write`.
- **Run `check-style-move.mjs` whenever a stylesheet changes** - it caught and confirmed the
  `break-before`/`break-after` swap as exactly one deliberate change, nothing lost by accident.
- **PDF forensics workflow, worked repeatedly now:** `python3` + `pypdf` -
  `PdfReader(...).pages[i].mediabox`, `page.extract_text(visitor_text=fn)` where `fn(text, cm, tm,
fontdict, fontsize)` gives exact decoded text at its real position (remember the `cm[0]` print-scale
  correction above), the font's own `/Widths` array via
  `page.get("/Resources")["/Font"]["/TTn"].get_object()` for exact glyph-run widths, `re W n` regex for
  clip rectangles. `qlmanage -t -s <n> -o <dir> <file.pdf>` for a quick visual render, no extra install
  needed on macOS.
- **Verifying a dev-server-served bundle directly:** open the route in the Browser pane (`preview_start`
  with the `localhost:4200` URL) or list the chunk names another way, `curl` each chunk directly and
  grep for the symbol or constant in question. More reliable than trusting that a restart means fresh
  code - chunk hashes change on rebuild, so a chunk name from an earlier session will 404.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` (touched this session),
`nx run-many --target=lint --projects=data,application,desktop,ui --skip-nx-cache`, `nx test data`,
`nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` (touched this session),
`nx test core` when `libs/core` changed, `nx build desktop`, `nx build web` when `libs/core` changed,
`cargo check` and `cargo test --lib` in `src-tauri` when anything under it changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.

All of the above were run and green for the branch's diff already this session - see the `2026-08-22`
`DUTY_WATCH.md` entry ("duplicate-heading print bug...") for the exact output.

Run triage and the Plan Check from `AGENTS.md` before touching code, and invoke `aif-grilling` if the
pagination-timing redesign starts - it changes `PaginatedSheetComponent`'s public timing contract,
shared by both print routes.
