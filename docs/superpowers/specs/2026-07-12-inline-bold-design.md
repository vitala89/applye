# Inline Bold for Summary & Bullets — Design Spec

- **Date**: 2026-07-12
- **Status**: Approved (design), pending implementation plan
- **Area**: Documents · CV builder editor + preview (`apps/desktop`), shared text lib (`libs/core`), Rust export (`tailoring.rs`, `documents.rs`)
- **Related**: builds on the existing `parseInlineEmphasis` (`**bold**`) already used for bullet preview; extends it to summary, the editor UX, and full export fidelity. On branch `feat/cv-theme-engine`.

## Problem

Users want to bold specific important words inside prose fields (summary, experience bullets) — the way the reference LaTeX CV uses `\textbf{…}` mid-sentence. Today the `**word**` markdown convention is only half-wired:

| Surface                 | Inline `**word**` bold                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Bullet preview          | ✅ works (`runs()` → `parseInlineEmphasis`)                                                    |
| Summary preview         | ❌ renders literal `**` (`{{ section.text }}`)                                                 |
| Bullet / summary editor | ⚠️ user must type `**` by hand; no button/shortcut                                             |
| DOCX / PDF / tex export | ❌ only a whole-line `**…**` wrap bolds (`strip_bold_wrap`); mid-sentence bold is not rendered |

The goal is bold that works end-to-end — edit → preview → export — for summary and experience bullets.

## Decisions (locked)

| Question     | Decision                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Scope        | **Full**: summary preview parity + editor Bold button/shortcut + inline bold in DOCX/PDF/tex export.  |
| Markup       | Keep `**word**` (markdown). No schema change; bold is encoded in the stored text. Fully back-compat.  |
| Which fields | Only **summary** and **experience bullets** (the prose fields). Skills/education/languages unchanged. |
| Marks        | Bold only — no italics/underline/other inline marks.                                                  |
| Editor model | Keep the plain textarea/input + `**` model. No rich contenteditable.                                  |

## Component 1 — Editor: Bold button + shortcut

- A small **B** control on the summary textarea and on each experience-bullet input.
- Behavior, via a pure helper in `libs/core`:
  `toggleBoldWrap(text: string, selStart: number, selEnd: number): { text: string; selStart: number; selEnd: number }`
  - Non-empty selection not already wrapped → wrap the selected substring in `**…**`; returned selection spans the inner text.
  - Selection already exactly `**…**` (or the wrap immediately surrounds it) → unwrap (toggle off).
  - Empty selection → insert `****` at the caret, returned caret placed between the markers.
- The component method reads the focused field's `selectionStart`/`selectionEnd`, calls `toggleBoldWrap`, writes the new text back to the model (summary text / `entry.bullets[i]`), and restores the selection.
- `Cmd/Ctrl+B` on a focused summary/bullet field invokes the same method (`preventDefault`).

## Component 2 — Preview: summary parity

- Change the summary preview from `{{ section.text }}` to iterate `runs(section.text)` (the existing `runs()` method → `parseInlineEmphasis`), emitting `<strong>` for bold runs and plain text otherwise — identical to the existing bullet template. Bullet rendering is unchanged.

## Component 3 — Export: inline bold in DOCX / PDF / tex

There are two PDF paths, which decides where Rust work is needed:

- **Detail-view "Export PDF"** prints the HTML preview (`window.print()`). Once the summary preview renders `<strong>` (Component 2) — bullets already do — this path shows inline bold **automatically, with no Rust work**. This is the primary, full-fidelity PDF.
- **List "Export as PDF"** uses the legacy Rust `printpdf` renderer (`render_blocks_pdf`), whose own comments note it is slated for retirement. **Decision: inline bold in this path is deferred** — it continues to show literal `**` for now. Manual mixed-font-mid-line work on a retiring renderer is not worth it while the detail Export PDF covers the real need.

Rust work in this task is limited to DOCX and tex. The block model carries a single `bold: bool` per block; inline runs are added at emit time, so the block struct is unchanged:

- New shared Rust helper `parse_inline_runs(&str) -> Vec<InlineRun>` where `InlineRun { text: String, bold: bool }`, mirroring the TS `parseInlineEmphasis` semantics (`**…**` → bold spans; unmatched `**` stays literal text; no spans → one non-bold run).
- **DOCX** (`block_paragraph` in `tailoring.rs`): for each body/bullet block, emit one docx run per `InlineRun`; a run is bold when the block is bold (heading / effective weight ≥ 600 / block-level bold) **OR** the run's inline bold is set. The bullet `•  ` prefix stays a leading non-bold run.
- **tex** (`cv_content_to_tex` in `documents.rs`): convert inline `**x**` → `\textbf{x}` within escaped body text (summary + bullets), in addition to the existing whole-line/heading bolding.
- **List-PDF** (`render_blocks_pdf`): unchanged this task (deferred). The library CV path currently passes `**` through verbatim, so it renders literal — a known, documented gap covered by the detail Export PDF.

## Data model

No change. Bold remains encoded as `**` inside the existing summary/bullet strings. Existing documents render unchanged (no `**` → one plain run).

## Testing

- **`toggleBoldWrap`** (libs/core, pure): wrap a selection; unwrap when already wrapped (toggle); empty-selection inserts `****` with caret between; selection offsets returned correctly.
- **`parse_inline_runs`** (Rust): no marks → one plain run; single `**x**`; multiple spans in one line; whole-line wrap → single bold run; unmatched `**` stays literal.
- **Summary preview**: `**x**` in summary renders a `<strong>`; plain text stays plain.
- **Export**: a body line with a mid-sentence `**x**` yields multiple runs (bold span + plain) in DOCX, and `\textbf{x}` in tex; block-level bold still bolds the whole line. (List-PDF inline bold deferred; detail Export PDF is HTML-based and covered by the preview test.)

## Scope boundaries (YAGNI)

- Bold only; no other inline marks.
- Only summary + experience bullets get the button.
- No contenteditable / rich editor.
- Legacy list-PDF (`printpdf`) inline bold deferred — detail Export PDF covers it.

## Known risks

- **Three renderers must stay consistent** — DOCX, PDF, and tex each parse `**` independently; a divergence would make export inconsistent with the preview. Mitigated by the shared `parse_inline_runs` helper (DOCX/PDF) and mirrored tex regex, plus per-renderer tests.
- **Block-vs-inline bold interaction** — a run's final weight must be `block.bold || run.bold`, so headings/semibold blocks stay fully bold while non-bold blocks bold only wrapped spans.
- **Selection restore** on the textarea/input after model write-back must not fight Angular's change detection (write text, then restore selection in a microtask / after view update).
