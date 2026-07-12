# Inline Bold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users bold important words in the CV summary and experience bullets via `**word**`, working end-to-end: editor Bold button + shortcut, summary preview parity, and inline bold in DOCX + tex export (detail Export PDF gets it free via the HTML preview).

**Architecture:** Bold is encoded as `**word**` in the existing text fields — no schema change. A pure `toggleBoldWrap` helper (libs/core) powers a Bold button + Cmd/Ctrl+B on the summary textarea and bullet inputs. The summary preview switches to the same `runs()`/`parseInlineEmphasis` path bullets already use. Rust export gains a shared `parse_inline_runs` that DOCX and tex emit per-run; the legacy list-PDF is deferred.

**Tech Stack:** Angular 20 (signals, standalone, template-driven `ngModel`), TypeScript, `@applye/core`, Rust (`tailoring.rs`, `documents.rs`), docx-rs.

## Global Constraints

- Do not modify `package.json` or Cargo dependencies.
- Conventional Commits; commit **subject must be lowercase** (commitlint `subject-case`). End commit bodies with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Markup is `**word**` (matches the existing `parseInlineEmphasis` and `EMPHASIS_RE = /\*\*(.+?)\*\*/g`). No new schema/migration; back-compat (no `**` → one plain run).
- Only **summary** + **experience bullets** get the Bold button. Bold only — no other marks.
- Themed/export surfaces in scope: editor, preview, DOCX, tex, and the HTML-preview detail Export PDF. **Legacy list-PDF (`render_blocks_pdf`) inline bold is deferred** — do not modify it; it keeps rendering literal `**` for now.
- New user-facing strings need EN + DE i18n keys (single `libs/i18n/src/lib/translations/translations.ts`, `en`/`de` blocks).
- Branch: `feat/cv-theme-engine` (continuing the same branch).

---

## File Structure

**Create:**

- (tests only — no new source files)

**Modify:**

- `libs/core/src/lib/text/inline-emphasis.ts` — add `toggleBoldWrap`.
- `libs/core/src/lib/text/inline-emphasis.spec.ts` (create if absent) — `toggleBoldWrap` tests.
- `libs/core/src/index.ts` — export `toggleBoldWrap` if not already surfaced by the existing `parseInlineEmphasis` export path (it re-exports the module, so likely automatic — verify).
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` — `applyBold(field, ...)` handler + Cmd/Ctrl+B; import `toggleBoldWrap`.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` — Bold button on summary + bullets; summary preview uses `runs()`.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` — small style for the Bold button (if needed).
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts` — summary-preview-runs test.
- `libs/i18n/src/lib/translations/translations.ts` — `cv_bold_action` EN + DE.
- `apps/desktop/src-tauri/src/commands/tailoring.rs` — `parse_inline_runs` + per-run DOCX emit in `block_paragraph`.
- `apps/desktop/src-tauri/src/commands/documents.rs` — inline `**`→`\textbf` in `cv_content_to_tex`.
- `docs/product/CURRENT_STATE.md` — record the feature (in the final task).

---

## Task 1: `toggleBoldWrap` pure helper (libs/core)

**Files:**

- Modify: `libs/core/src/lib/text/inline-emphasis.ts`
- Test: `libs/core/src/lib/text/inline-emphasis.spec.ts` (create if missing)

**Interfaces:**

- Produces: `toggleBoldWrap(text: string, selStart: number, selEnd: number): { text: string; selStart: number; selEnd: number }`
- Consumes: nothing new.

**Behavior:**

- Non-empty selection whose selected substring is exactly `**…**` OR is immediately surrounded by `**…**` → unwrap (remove the two pairs of `*`), return selection around the now-unwrapped inner text.
- Non-empty selection not wrapped → wrap the selected substring in `**`, return selection spanning the inner (original) text (i.e. offset by 2 on each side).
- Empty selection (`selStart === selEnd`) → insert `****` at the caret; return caret at `selStart + 2` (between the markers), zero-length.

- [ ] **Step 1: Write the failing tests**

Create/append `libs/core/src/lib/text/inline-emphasis.spec.ts`:

```ts
import { parseInlineEmphasis, toggleBoldWrap } from './inline-emphasis';

describe('parseInlineEmphasis', () => {
  it('splits a mid-sentence bold span', () => {
    expect(parseInlineEmphasis('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
  });
});

describe('toggleBoldWrap', () => {
  it('wraps a non-empty selection', () => {
    // "Led a big refactor", select "big" (6..9)
    const r = toggleBoldWrap('Led a big refactor', 6, 9);
    expect(r.text).toBe('Led a **big** refactor');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('big');
  });

  it('unwraps a selection that is already bold (toggle off)', () => {
    // "Led a **big** refactor", select inner "big" (8..11)
    const r = toggleBoldWrap('Led a **big** refactor', 8, 11);
    expect(r.text).toBe('Led a big refactor');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('big');
  });

  it('inserts empty markers at the caret when selection is empty', () => {
    const r = toggleBoldWrap('abc', 1, 1);
    expect(r.text).toBe('a****bc');
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx nx test core --testPathPattern=inline-emphasis`
Expected: FAIL — `toggleBoldWrap` not exported.

- [ ] **Step 3: Implement `toggleBoldWrap`**

Append to `libs/core/src/lib/text/inline-emphasis.ts`:

```ts
/** Toggle `**bold**` around the selection of a plain text field. Pure — the
 * caller reads selStart/selEnd from the DOM field, applies the result to the
 * model, and restores the returned selection. */
export function toggleBoldWrap(
  text: string,
  selStart: number,
  selEnd: number,
): { text: string; selStart: number; selEnd: number } {
  if (selStart === selEnd) {
    const next = text.slice(0, selStart) + '****' + text.slice(selStart);
    return { text: next, selStart: selStart + 2, selEnd: selStart + 2 };
  }
  const before = text.slice(0, selStart);
  const sel = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);
  // Already wrapped as part of the selection?
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
    const inner = sel.slice(2, sel.length - 2);
    return { text: before + inner + after, selStart, selEnd: selStart + inner.length };
  }
  // Wrapped immediately outside the selection?
  if (before.endsWith('**') && after.startsWith('**')) {
    const nb = before.slice(0, before.length - 2);
    const na = after.slice(2);
    return { text: nb + sel + na, selStart: selStart - 2, selEnd: selEnd - 2 };
  }
  // Not wrapped → wrap.
  const next = before + '**' + sel + '**' + after;
  return { text: next, selStart: selStart + 2, selEnd: selEnd + 2 };
}
```

- [ ] **Step 4: Run, verify pass + barrel**

Run: `npx nx test core --testPathPattern=inline-emphasis`
Expected: PASS.
Verify `toggleBoldWrap` is exported from `@applye/core`: `grep -n "inline-emphasis\|parseInlineEmphasis" libs/core/src/index.ts`. If the barrel re-exports the module (`export * from './lib/text/inline-emphasis'`), it's automatic. If `parseInlineEmphasis` is exported by name, add `toggleBoldWrap` alongside it.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/text/inline-emphasis.ts libs/core/src/lib/text/inline-emphasis.spec.ts libs/core/src/index.ts
git commit -m "feat(documents): add toggleBoldWrap helper for inline bold"
```

---

## Task 2: Editor Bold button + shortcut + summary preview parity (Angular)

**Files:**

- Modify: `cv-detail.component.ts`, `cv-detail.component.html`, `cv-detail.component.scss`, `libs/i18n/src/lib/translations/translations.ts`
- Test: `cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `toggleBoldWrap`, `runs()` (existing).
- Produces: `applyBold(el: HTMLTextAreaElement | HTMLInputElement, set: (v: string) => void): void`.

**Design notes:**

- `applyBold` reads `el.selectionStart`/`selectionEnd`, calls `toggleBoldWrap(el.value, …)`, calls `set(result.text)` to write the model, then restores selection after the view updates: `queueMicrotask(() => { el.value = result.text; el.setSelectionRange(result.selStart, result.selEnd); el.focus(); })`. (Setting `el.value` directly keeps the DOM and restored caret in sync with the `ngModel` write on the same tick.)
- The button uses `(mousedown)="$event.preventDefault()"` so clicking it does not blur/steal the field selection before `applyBold` runs on `(click)`.

- [ ] **Step 1: Add the `applyBold` handler + Cmd/Ctrl+B**

In `cv-detail.component.ts`, add the `toggleBoldWrap` import to the `@applye/core` import block, and add:

```ts
  /** Wrap/unwrap **bold** around the field's current selection, then write the
   * result back to the model and restore the caret. Bound to the Bold button
   * and Cmd/Ctrl+B on summary + bullet fields. */
  applyBold(el: HTMLTextAreaElement | HTMLInputElement, set: (v: string) => void): void {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const r = toggleBoldWrap(el.value, start, end);
    set(r.text);
    queueMicrotask(() => {
      el.value = r.text;
      el.setSelectionRange(r.selStart, r.selEnd);
      el.focus();
    });
  }
```

- [ ] **Step 2: Add i18n key**

In `translations.ts`, add to `en` (near `cv_field_bullet`): `cv_bold_action: 'Bold (**)',` and to `de`: `cv_bold_action: 'Fett (**)',`.

- [ ] **Step 3: Add the Bold button + shortcut to the summary textarea**

In `cv-detail.component.html`, replace the summary `@case ('summary')` textarea block with a wrapper that adds a Bold button and keydown:

```html
@case ('summary') {
<div class="cvdetail__bold-field">
  <textarea
    #summaryEl
    [ngModel]="$any(section).text"
    (ngModelChange)="$any(section).text = $event"
    (keydown)="
                              ($event.metaKey || $event.ctrlKey) && $event.key === 'b'
                                ? (applyBold(summaryEl, (v) => ($any(section).text = v)),
                                  $event.preventDefault())
                                : null
                            "
    rows="4"
  ></textarea>
  <button
    type="button"
    class="cvdetail__bold-btn"
    [attr.aria-label]="t()('documents.cv_bold_action')"
    (mousedown)="$event.preventDefault()"
    (click)="applyBold(summaryEl, (v) => ($any(section).text = v))"
  >
    B
  </button>
</div>
}
```

- [ ] **Step 4: Add the Bold button + shortcut to each bullet input**

In the experience `@for (bullet of entry.bullets …)` row, add a template ref, keydown, and a Bold button beside the input (before the remove button):

```html
<div class="cvdetail__bullet-row">
  <span class="cvdetail__bullet-dot">•</span>
  <input
    #bulletEl
    type="text"
    [ngModel]="bullet"
    (ngModelChange)="entry.bullets[$index] = $event"
    (keydown)="
                                    ($event.metaKey || $event.ctrlKey) && $event.key === 'b'
                                      ? (applyBold(bulletEl, (v) => (entry.bullets[$index] = v)),
                                        $event.preventDefault())
                                      : null
                                  "
    [placeholder]="t()('documents.cv_field_bullet')"
  />
  <button
    type="button"
    class="cvdetail__bold-btn"
    [attr.aria-label]="t()('documents.cv_bold_action')"
    (mousedown)="$event.preventDefault()"
    (click)="applyBold(bulletEl, (v) => (entry.bullets[$index] = v))"
  >
    B
  </button>
  <button
    class="cvdetail__bullet-remove"
    type="button"
    [attr.aria-label]="t()('documents.cv_remove_bullet')"
    (click)="removeBullet(entry, $index)"
  >
    <lucide-icon [img]="icons.close" [size]="14" aria-hidden="true" />
  </button>
</div>
```

- [ ] **Step 5: Summary preview parity — render runs**

In `#summaryTpl`, replace `{{ section.text }}` (the `.cvpreview__summary` paragraph) with the same run loop bullets use:

```html
<p class="cvpreview__summary">
  @for (run of runs(section.text); track $index) { @if (run.bold) {
  <strong>{{ run.text }}</strong>
  } @else { {{ run.text }} } }
</p>
```

- [ ] **Step 6: Minimal SCSS for the Bold button**

In `cv-detail.component.scss`, add a small style (a compact bold-weighted square button aligned to the field). Match the existing `.cvdetail__bullet-remove` sizing:

```scss
.cvdetail__bold-field {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.cvdetail__bold-btn {
  flex: none;
  width: 28px;
  height: 28px;
  font-weight: 700;
  border: var(--border-width) solid var(--border-strong);
  border-radius: var(--radius-input);
  background: var(--surface-1);
  color: var(--text-secondary);
  cursor: pointer;
}
.cvdetail__bold-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 7: Write the summary-preview test**

In `cv-detail.component.spec.ts`, add a test that a summary containing `**x**` renders a `<strong>` in the preview. Follow the existing Aurora/preview test harness (build component, set a document whose summary text includes `**Key**`, `fixture.detectChanges()`), then:

```ts
it('summary preview renders **bold** as <strong>', () => {
  // ...load/set a CV whose summary text is 'A **Key** point'
  fixture.detectChanges();
  const strongs = fixture.nativeElement.querySelectorAll('.cvpreview__summary strong');
  expect(Array.from(strongs).some((s: any) => s.textContent.trim() === 'Key')).toBe(true);
});
```

- [ ] **Step 8: Run tests**

Run: `npx nx test desktop --testPathPattern=cv-detail.component`
Expected: PASS (new test green, existing green).
Run: `npx nx test i18n`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/ libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(documents): bold button and summary bold rendering in cv editor"
```

---

## Task 3: Inline bold in DOCX + tex export (Rust)

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`parse_inline_runs` + `block_paragraph`), `apps/desktop/src-tauri/src/commands/documents.rs` (`cv_content_to_tex`)

**Interfaces:**

- Produces: `pub(crate) fn parse_inline_runs(s: &str) -> Vec<InlineRun>` with `pub(crate) struct InlineRun { pub text: String, pub bold: bool }`.
- Consumes: existing `RenderBlock` (`text`, `bold`, `level`).

**Design notes:**

- `parse_inline_runs` mirrors the TS `EMPHASIS_RE = /\*\*(.+?)\*\*/g`: scan for `**…**` (non-greedy, non-empty inner), emit alternating plain/bold runs; unmatched `**` stays literal; empty input or no matches → one non-bold run with the whole string.
- DOCX: in `block_paragraph`, replace the single `Run` with one run per `parse_inline_runs(&b.text)`; each run bold when `b.bold || run.bold`. The bullet `•  ` prefix becomes a leading non-bold run.
- The list-PDF `render_blocks_pdf` is intentionally NOT changed (deferred).

- [ ] **Step 1: Write failing Rust tests for `parse_inline_runs`**

In the `#[cfg(test)]` module of `tailoring.rs`, add:

```rust
#[test]
fn parse_inline_runs_plain_and_spans() {
    assert_eq!(parse_inline_runs("plain").len(), 1);
    let r = parse_inline_runs("a **b** c");
    assert_eq!(r.len(), 3);
    assert_eq!((r[1].text.as_str(), r[1].bold), ("b", true));
    assert_eq!((r[0].text.as_str(), r[0].bold), ("a ", false));
}

#[test]
fn parse_inline_runs_multiple_and_unmatched() {
    let r = parse_inline_runs("**x** y **z**");
    assert_eq!(r.iter().filter(|s| s.bold).count(), 2);
    // unmatched trailing ** stays literal, not a panic
    let u = parse_inline_runs("a **b");
    assert_eq!(u.iter().any(|s| s.bold), false);
}
```

- [ ] **Step 2: Run, verify fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml parse_inline_runs`
Expected: FAIL — `parse_inline_runs` not found. (Use the crate name from `grep -m1 'name =' apps/desktop/src-tauri/Cargo.toml` if `-p` is needed.)

- [ ] **Step 3: Implement `parse_inline_runs`**

In `tailoring.rs` (near `strip_bold_wrap`):

```rust
#[derive(Debug, Clone)]
pub(crate) struct InlineRun {
    pub text: String,
    pub bold: bool,
}

/// Splits a line into `**bold**` / plain runs, mirroring the TS
/// `parseInlineEmphasis`. Unmatched `**` stays literal; no spans → one plain
/// run. Never panics on odd markers.
pub(crate) fn parse_inline_runs(s: &str) -> Vec<InlineRun> {
    let bytes = s.as_bytes();
    let mut runs: Vec<InlineRun> = Vec::new();
    let mut i = 0usize;
    let mut plain_start = 0usize;
    while i + 1 < bytes.len() {
        if bytes[i] == b'*' && bytes[i + 1] == b'*' {
            // find closing ** after i+2
            if let Some(rel) = s[i + 2..].find("**") {
                let inner_start = i + 2;
                let inner_end = inner_start + rel;
                if inner_end > inner_start {
                    if i > plain_start {
                        runs.push(InlineRun { text: s[plain_start..i].to_string(), bold: false });
                    }
                    runs.push(InlineRun { text: s[inner_start..inner_end].to_string(), bold: true });
                    i = inner_end + 2;
                    plain_start = i;
                    continue;
                }
            }
        }
        i += 1;
    }
    if plain_start < s.len() {
        runs.push(InlineRun { text: s[plain_start..].to_string(), bold: false });
    }
    if runs.is_empty() {
        runs.push(InlineRun { text: s.to_string(), bold: false });
    }
    runs
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml parse_inline_runs`
Expected: PASS.

- [ ] **Step 5: Emit per-run DOCX in `block_paragraph`**

In `block_paragraph` (tailoring.rs), replace the single-run construction with per-run. Keep the size/color/font/spacing logic; build runs from `parse_inline_runs`:

```rust
    let (r, g, bl) = b.rgb;
    let color = format!("{r:02X}{g:02X}{bl:02X}");
    let mk_run = |seg: &str, bold: bool| {
        let mut run = Run::new()
            .add_text(seg)
            .size((b.size_pt * 2.0).round() as usize)
            .color(&color)
            .fonts(RunFonts::new().ascii(&b.font_family).hi_ansi(&b.font_family));
        if bold {
            run = run.bold();
        }
        run
    };
    let mut para = Paragraph::new().line_spacing(
        LineSpacing::new().before(before).after(after),
    );
    if b.level == BlockLevel::Bullet {
        para = para.add_run(mk_run("•  ", b.bold));
    }
    for seg in parse_inline_runs(&b.text) {
        para = para.add_run(mk_run(&seg.text, b.bold || seg.bold));
    }
```

Note: the existing code computes `(before, after)` before building `para`; reorder so `before`/`after` are computed first, then `para` is built as above (move the `Paragraph::new()` construction below the `(before, after)` match). Verify the function still returns `para` with the same trailing logic (photo/no-photo callers unchanged).

- [ ] **Step 6: Inline `**`→`\textbf` in tex export\*\*

In `cv_content_to_tex` (documents.rs), the summary and bullet bodies currently do `tex_escape(&text)`. Add a helper that escapes THEN converts `**x**`→`\textbf{x}` (escaping first so the `**` survive, then a regex/scan replaces them). Add near `tex_escape`:

```rust
/// Escapes text for LaTeX, then renders `**bold**` spans as \textbf{...}.
fn tex_inline(text: &str) -> String {
    let escaped = tex_escape(text);
    let runs = crate::commands::tailoring::parse_inline_runs(&escaped);
    let mut out = String::new();
    for r in runs {
        if r.bold {
            out.push_str(&format!("\\textbf{{{}}}", r.text));
        } else {
            out.push_str(&r.text);
        }
    }
    out
}
```

Then use `tex_inline(&text)` instead of `tex_escape(&text)` for the **summary body** (the `body.push_str(&tex_escape(&text))` under `"summary"`) and for **bullets** (`format!("\\item {}\n", tex_escape(bullet))` → `tex_inline(bullet)`). Leave headings/role/company lines on `tex_escape` (they are not user-bold-marked prose).

Note: `tex_escape` must not escape `*` into something that breaks the `**` scan. Verify `tex_escape` leaves `*` intact (`grep -n "'\\*'\|\\\\\\*\|push('\\\\\\\\')" documents.rs` around the escape match). If `tex_escape` escapes `*`, call `parse_inline_runs` on the RAW text first, then `tex_escape` each run's text — invert the order in `tex_inline`.

- [ ] **Step 7: Run Rust tests + build**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` (documents + tailoring)
Expected: PASS (new tests + existing).
Run: `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/tailoring.rs apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "feat(documents): render inline bold in docx and tex export"
```

---

## Task 4: Verify build + docs

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Sweep**

Run: `npx nx test core --testPathPattern=inline-emphasis` → PASS
Run: `npx nx test desktop --testPathPattern=cv-detail.component` → PASS
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → PASS
Run: `npx nx build desktop` → succeeds

- [ ] **Step 2: Update CURRENT_STATE.md**

Add a "Recently completed" bullet: inline bold for summary + experience bullets via `**word**` — editor Bold button + Cmd/Ctrl+B, summary preview parity, DOCX + tex + detail Export PDF (HTML) inline bold; legacy list-PDF deferred. Link the spec `docs/superpowers/specs/2026-07-12-inline-bold-design.md` and this plan.

- [ ] **Step 3: Commit**

```bash
git add docs/product/CURRENT_STATE.md
git commit -m "docs(documents): record inline bold feature in current state"
```

- [ ] **Step 4: Manual desktop gate (user-run)**

On a real desktop build: select a word in the summary and a bullet, click **B** (and try Cmd/Ctrl+B) → `**` wraps and the preview shows bold; toggle again removes it. Export DOCX and tex → the word is bold / `\textbf`. Detail Export PDF shows the bold.

---

## Self-Review

**Spec coverage:**

- `toggleBoldWrap` helper → Task 1. ✅
- Bold button + Cmd/Ctrl+B on summary + bullets → Task 2 Steps 3-4. ✅
- Summary preview parity → Task 2 Step 5. ✅
- DOCX inline bold → Task 3 Step 5. ✅
- tex inline bold → Task 3 Step 6. ✅
- Detail Export PDF (HTML) inline bold → free via Task 2 Step 5 (preview `<strong>`); confirmed in the manual gate. ✅
- List-PDF deferred → not modified; documented. ✅
- No schema change / back-compat → no migration; `parse_inline_runs`/`parseInlineEmphasis` yield one plain run when no `**`. ✅
- Tests (toggleBoldWrap, parse_inline_runs, summary preview, export) → Tasks 1-3. ✅

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The tex step (Task 3 Step 6) includes an explicit escape-order guard rather than a blind edit.

**Type consistency:** `toggleBoldWrap` signature identical across Task 1 (def) and Task 2 (use). `parse_inline_runs`/`InlineRun` identical across Task 3 tailoring def and documents.rs use (`crate::commands::tailoring::parse_inline_runs`). `applyBold(el, set)` signature consistent across summary + bullet call sites.

**Known deviation:** none beyond the explicitly-approved list-PDF deferral.
