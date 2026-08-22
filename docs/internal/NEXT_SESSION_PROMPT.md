# Next session prompt

Copy everything below the line into a fresh session.

---

**The print pipeline is closed out - `#515` and `#516` are both merged to `main`, and `B5` (the
LANGUAGES-section indent/narrowing on exported page two) is natively confirmed fixed by the
maintainer.** This session found a new, unrelated, well-diagnosed bug: three independent filename
functions decide the export save-dialog's suggested name, and they disagree. Read the mechanism
below before touching anything - the fix is close to obvious, but there is one real decision fork
in it, and it should be grilled rather than guessed.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-22` entries in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, up to date with `origin/main` at `974a6808`.
  Working tree clean.
- `#515` (duplicate-heading fragmentation fix) and `#516` (raw Cmd/Ctrl+P printing the whole app
  shell) are both merged. Neither needs further action.
- **`B5` is natively confirmed fixed by the maintainer**, on a real multi-page CV export where
  LANGUAGES lands on page two. It was never touched directly - the working hypothesis, reasoned
  from code alone (no code today reproduces its described mechanism: `.page-card`/`.page-card__atom`
  are uniform block-flow with no per-section or per-position width variance, and `#511`'s width-pin
  removed the one two-pipeline divergence that could have explained a narrower, indented box on
  whichever card lands after a forced break) is that `#511` fixed it as a side effect, months before
  anyone re-tested it. `docs/internal/NATIVE_GATE_FINDINGS.md`'s `B5` entry and
  `NATIVE_GATE_BACKLOG.md` still list it as open and need updating to reflect the native
  confirmation - do that first, it is bookkeeping, not investigation.

## The new bug: three filename functions for one save dialog

**The maintainer noticed the PDF save dialog suggests a different filename for what looked like
"the same CV" depending on which button they pressed** - roughly `Angular Engineer Umbra Labs.pdf`
exporting from the apply wizard's Preview step, versus `Halvorsen_Mira_Lebenslauf.pdf` exporting the
same CV from the Documents list's row action. Read as "no single source of truth" and it is exactly
that, at the code level - confirmed this session by reading all four call sites, not by guessing:

**Three independent functions each decide the suggested filename for the same action - a PDF/DOCX
save dialog for a CV or cover letter - and only one of them implements the documented convention:**

1. **[`export-filename.ts`](../../libs/application/src/lib/documents/export-filename.ts)**
   (`exportFileName`/`exportFileBase`) - wired into
   [`DocumentExportService.filename()`](../../libs/application/src/lib/documents/document-export.service.ts:137),
   which is called from `cv-detail.component.ts`'s and `cover-letter-detail.component.ts`'s Export
   buttons and from `job-export-apply-step.component.ts` (the apply wizard's export step). Preserves
   case and non-ASCII, collapses separators to single spaces, drops illegal characters only. **No
   region-specific rule at all.**
2. **[`cv-filename.ts`](../../libs/application/src/lib/documents/cv-filename.ts)**
   (`suggestCvFilename`) - wired into `cv-list.component.ts`'s row-level Export action (the Documents
   list). **Implements a documented German-market convention** (`ROADMAP §16.6`):
   `Nachname_Vorname_Lebenslauf.ext` when `item.regionTag === 'de'` and the stored content has a
   parseable full name; otherwise falls back to a lowercase, underscore-joined slug of `item.label` -
   a different fallback shape from `export-filename.ts`'s.
3. **[`cover-letter-filename.ts`](../../libs/application/src/lib/documents/cover-letter-filename.ts)**
   (`suggestCoverLetterFilename`) - wired into `cover-letter-list.component.ts`'s row action. Lowercase,
   underscore-joined slug of `item.label` only - **no German convention**, even though `cv-filename.ts`
   right next to it has one.

**This means the maintainer's two exports did not need to be different underlying documents to
produce different names** (though they may also be, separately - see the open question below): even
the exact same `document_library` row, exported once from an editor/wizard button and once from the
Documents list, runs through genuinely different code and can disagree. `suggestCvFilename`'s DE rule
is the one place `Halvorsen_Mira_Lebenslauf`-style naming exists at all; `export-filename.ts` has no
path to it, ever, regardless of `regionTag`.

**A second, separate question the maintainer's exact wording raised and this session did not chase
down**: `jobDocLabel()` in
[`job-gap-fill.service.ts`](../../libs/application/src/lib/documents/job-gap-fill.service.ts:12)
(`"{company} - {title} - {suffix}"`, e.g. `Umbra Labs - Angular Engineer - Tailored CV`) is what
`job-document-drafts.store.ts` sets as `label` when the apply wizard creates a **new**,
job-scoped draft CV during tailoring - which is architecturally a different `document_library` row
from the person's generic default CV the Documents list shows first. If the maintainer's two exports
came from two different rows (a tailored draft vs. the generic original) rather than the same row
seen through two buttons, that is expected/by-design row separation, not a naming bug - worth
confirming with one native check (open both entries in the Documents list side by side and compare
IDs/labels) before assuming every observed difference traces to the three-functions problem above.
Do not skip this check and assume - the filename-function divergence is proven; whether the
maintainer's specific repro also involved two different rows is not.

### The decision fork - grill this, do not just pick one

Unifying on one function is clearly right; which one, and what it should do, is not a fact to look
up:

- **Should CV filename suggestions everywhere gain the German convention** (make
  `DocumentExportService.filename()` call `suggestCvFilename`/`suggestCoverLetterFilename` instead of
  the generic `exportFileName`), or **should the German convention be removed from the Documents list
  too**, so every entry point uses the same case-preserving, non-ASCII-safe `exportFileName` rule?
  `ROADMAP §16.6` favors keeping and spreading the German convention, but that is a product call, not
  an obvious code fact.
- **Should cover letters also get a region-specific naming convention**, matching whatever the CV
  side settles on, or is `Lebenslauf`-style naming CV-specific by design (a CV is what German
  recruiters expect in that filename shape; a cover letter/`Anschreiben` may not carry the same
  expectation)?
- **Where should the unified function live** - keep three files and have two of them delegate to the
  third, or fold into one `document-filename.ts` used everywhere? This is a `libs/application` public
  API shape question per `CLAUDE.md`'s Grilling gate (touches a shared library's exported surface),
  so it needs the `aif-grilling` skill regardless of which naming direction is chosen.

Run `aif-grilling` on this before writing any code. The three-functions-disagree diagnosis above is a
fact, already verified by reading every call site; the resolution is not.

## Repro, as the maintainer described it

1. Open a job's apply wizard, reach the Preview/Export step for its CV, press Export - note the
   suggested filename.
2. Open Documents → CV list, find the corresponding row, press the row's Export action - note the
   suggested filename.
3. Compare. They should not need to match by coincidence; today they do not run the same code at all.

## Do not re-open

- **The print pipeline (`#511`-`#516`) is closed.** Do not re-litigate the fragmentation fix, the raw
  Cmd+P fix, or the pagination-timing redesign (still explicitly rejected by the maintainer). `B5` is
  now closed too, per the native confirmation above - update the two backlog docs, do not re-diagnose
  it from scratch.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text.
- **Third-party PDF libraries** were raised out of frustration in an earlier session and should not be
  adopted reflexively - see the reasoning already on file if this comes up again.

## What else is open, untouched this and recent sessions

- **`B9`** - wizard footer padding inconsistent between two steps. Needs a native screenshot/computed
  `padding-bottom` comparison; not reproducible from the repository alone (confirmed this session -
  the desktop-web browser preview has no real Tauri IPC, so the wizard cannot be reached with data).
- **`S1`** - tailoring run is slow; blocked on one read-only query against `tailoring_cache`'s
  `tokens_input`/`tokens_output`. Ask the maintainer before running it - standing rule against
  touching the live database without asking.
- **The disabled-Retailor state and locked editor mode (`P1`/`P2`/`B12`)** still need a native pass.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context (`libs/data/src/lib/tauri.invoke.ts`), so every gateway call fails and
  the app renders empty states only. Useful for pure DOM/CSS bugs reachable without data (confirmed
  this session for the raw-Cmd+P fix); useless for anything needing a real job, CV, or application -
  those need a native `tauri dev` pass, which only the maintainer can drive (see
  `NATIVE_GATE_BACKLOG.md`'s own note that synthetic clicks never reach the Tauri webview either).
- **Cut every branch from `main`, and check `git branch --show-current` before assuming otherwise.**
  This repository's working tree has repeatedly reset to `main` between sessions.
- **When a backlog has several open items with different blockers, ask which one rather than
  guessing** - this session's raw-Cmd+P pick and its B5 follow-up both went faster for having asked
  first instead of spending a round on the wrong item.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui --skip-nx-cache`, `nx test data`, `nx test
application`, `nx test desktop --maxWorkers=2`, `nx test ui` if touched, `nx test core` and `nx build
web` if `libs/core` changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it
changed, `nx build desktop`, `npm run quality:file-size -- --staged`, `npm run quality:attribution`,
`npm run format:check`, `git diff --check`.
