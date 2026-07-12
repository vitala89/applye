# CV Refactor Phase A — Remove LaTeX Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the `.tex`/LaTeX export surface end-to-end (Rust generator, dispatch arm, Rust tests, frontend export option + note + signal, format union, EN/DE i18n keys), leaving DOCX and PDF export untouched.

**Architecture:** LaTeX is dead code — the app bundles no TeX toolchain and never compiles the emitted `.tex`. Removal is isolated: one Rust generator + its two tests + one dispatch arm, and in the frontend one `<option>`, one info-note, one signal, one type-union member, and two i18n keys (× EN/DE). No behaviour depends on it.

**Tech Stack:** Rust (`docx-rs`/`printpdf` unaffected), Angular (standalone components, signals), TypeScript, project i18n (`libs/i18n`).

## Global Constraints

- Do not modify application source code beyond the LaTeX-removal surface listed here; no dependency or `package.json`/`Cargo.toml` changes.
- Do not edit root-level canonical documents (CURRENT_STATE.md etc.) for this small iteration.
- Commit subjects must be lowercase (commitlint `subject-case`: no sentence/start/pascal/upper case). Conventional Commit format, `docs`/`feat`/`refactor`/`chore` types.
- Every commit passes the repo pre-commit hooks (lint-staged: prettier + lint on staged files).
- End commit messages with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Remove the Rust LaTeX generator, dispatch arm, and tests

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/documents.rs`
  - Delete fn `tex_escape` (starts line 529, doc-comment at 528)
  - Delete fn `tex_inline` (doc-comment ~546, fn at 550)
  - Delete fn `cv_content_to_tex` (line 568 through its closing `}`, ~line 760)
  - Delete the dispatch arm at line 1228: `"tex" => Ok(cv_content_to_tex(&content_json)?.into_bytes()),`
  - Delete test fn `cv_content_to_tex_escapes_special_characters_and_hides_invisible_sections` (line 1799) with its `#[test]` attribute
  - Delete test fn `cv_content_to_tex_renders_inline_bold_as_textbf` (line 1814) with its `#[test]` attribute

**Interfaces:**

- Consumes: nothing new.
- Produces: `cv_document_export` now supports only `"docx"` and `"pdf"`; any other format string (including `"tex"`) hits the existing `other => Err(...)` arm.

- [ ] **Step 1: Confirm the exact span of `cv_content_to_tex` before deleting**

Run: `grep -nE "^fn |^}" apps/desktop/src-tauri/src/commands/documents.rs | awk 'NR>0' | grep -A1 "568"` — or open the file and locate the closing brace of `cv_content_to_tex` (the next top-level `fn` after it defines the end). Note the last line number of the function body.

Expected: the function ends just before the next item (around line 758–760). Record it so the deletion removes the whole body and nothing after.

- [ ] **Step 2: Delete the three functions and their doc-comments**

Remove, in `documents.rs`:

- lines 528–544 (`/// Escapes LaTeX…` doc-comment + `fn tex_escape` body)
- lines ~546–566 (`/// Escapes text for LaTeX…` doc-comment + `fn tex_inline` body)
- lines 568–~760 (`fn cv_content_to_tex` body, up to and including its closing `}`)

Leave `parse_inline_runs` (in `tailoring.rs`) and all block/docx/pdf code intact — `tex_inline` was the only tex-specific caller of it here.

- [ ] **Step 3: Delete the dispatch arm**

In `cv_document_export`, remove line 1228:

```rust
        "tex" => Ok(cv_content_to_tex(&content_json)?.into_bytes()),
```

Keep the surrounding arms:

```rust
        "pdf" => { /* … render_blocks_pdf … */ }
        other => Err(format!("cv_document_export: unsupported format '{other}'")),
```

- [ ] **Step 4: Delete the two tex unit tests**

Remove the full `#[test] fn cv_content_to_tex_escapes_special_characters_and_hides_invisible_sections() { … }` (from line 1799) and `#[test] fn cv_content_to_tex_renders_inline_bold_as_textbf() { … }` (from line 1814), including each `#[test]` line.

- [ ] **Step 5: Verify no residual tex references remain in Rust**

Run: `grep -rnE "tex_escape|tex_inline|cv_content_to_tex|\"tex\"" apps/desktop/src-tauri/src`
Expected: no matches (empty output). `read_docx_text`/`read_pdf_text`/`text` identifiers are unrelated and were never matched by these patterns.

- [ ] **Step 6: Build and test the Rust crate**

Run: `cd apps/desktop/src-tauri && cargo test --lib commands::documents 2>&1 | tail -30`
Expected: compiles clean, all remaining `documents` tests PASS, no reference to the deleted tests. (If the workspace test command differs, use the project's standard, e.g. `cargo test -p <crate>`.)

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "refactor(documents): remove latex (.tex) cv export generator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove the frontend LaTeX export option, note, signal, union member, and i18n keys

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts`
  - line 121: delete `readonly texExportNoteOpen = signal(false);`
  - line 125: narrow union `format: 'pdf' | 'docx' | 'tex'` → `format: 'pdf' | 'docx'`
  - line 130: delete `if (format === 'tex') this.texExportNoteOpen.set(true);`
- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.html`
  - delete the `@if (texExportNoteOpen()) { … }` note block (lines ~15–20)
  - delete the `<option value="tex">{{ t()('documents.cv_export_tex_action') }}</option>` line (~81)
- Modify: `libs/i18n/src/lib/translations/translations.ts`
  - EN: delete `cv_export_tex_action` (line 597) and `cv_export_tex_note` (lines 598–599)
  - DE: delete `cv_export_tex_action` (line 1585) and `cv_export_tex_note` (lines 1586–1587)
- Check (modify only if typed): `apps/desktop/src/app/**/db.service.ts` — if `cvDocumentExport`'s `format` parameter is typed as a union including `'tex'`, narrow it to `'pdf' | 'docx'`.

**Interfaces:**

- Consumes: `cv_document_export` now `"docx"`/`"pdf"` only (from Task 1).
- Produces: `exportDoc(item, format: 'pdf' | 'docx', event)` — callers must pass only those two formats.

- [ ] **Step 1: Verify current tex references in the frontend**

Run: `grep -rn "cv_export_tex\|texExportNoteOpen\|'tex'\|value=\"tex\"" apps/desktop/src/app libs/i18n/src`
Expected: matches only in `cv-list.component.ts` (121/125/130), `cv-list.component.html` (~17/~81), and `translations.ts` (597/598 EN, 1585/1586 DE). Record any _additional_ hit and handle it too (e.g. `jobs.component.ts:3633` — confirm its `format` value is never `'tex'`; if a local union there includes `'tex'`, narrow it).

- [ ] **Step 2: Edit `cv-list.component.ts`**

Delete the signal (line 121), narrow the union (line 125) to `format: 'pdf' | 'docx'`, and delete the tex-note trigger (line 130). The method becomes:

```ts
  async exportDoc(
    item: DocumentLibraryItem,
    format: 'pdf' | 'docx',
    event: Event,
  ): Promise<void> {
    event.stopPropagation();
    if (!format || this.exportBusyId() != null) return;
    this.exportBusyId.set(item.id);
    try {
      const path = await save({ defaultPath: suggestCvFilename(item, format) });
      if (!path) return;
      await this.db.cvDocumentExport(item.id, format, path);
    } finally {
      this.exportBusyId.set(null);
    }
  }
```

(Match the surrounding method body exactly — only remove the `format === 'tex'` line and narrow the type; keep whatever try/finally/save logic already exists.)

- [ ] **Step 3: Edit `cv-list.component.html`**

Delete the note block:

```html
@if (texExportNoteOpen()) {
<div class="cvlist__note">
  <p>{{ t()('documents.cv_export_tex_note') }}</p>
  <button class="icon-btn" type="button" (click)="texExportNoteOpen.set(false)">×</button>
</div>
}
```

And delete the tex option from the export `<select>`:

```html
<option value="tex">{{ t()('documents.cv_export_tex_action') }}</option>
```

Leave the `pdf` and `docx` options and the surrounding `<select>` intact.

- [ ] **Step 4: Remove the i18n keys (EN + DE)**

In `libs/i18n/src/lib/translations/translations.ts`, delete these keys from both the EN block (~597–599) and the DE block (~1585–1587):

```ts
    cv_export_tex_action: '…',
    cv_export_tex_note: '…',
```

Keep `cv_export_pdf_action` / `cv_export_docx_action` / `cv_export_action`.

- [ ] **Step 5: Verify no residual tex references remain in the frontend**

Run: `grep -rn "cv_export_tex\|texExportNoteOpen\|value=\"tex\"\|'tex'" apps/desktop/src/app libs/i18n/src`
Expected: no matches (empty output).

- [ ] **Step 6: Typecheck / build the affected project**

Run: `npx nx build desktop` (or the project's standard build/typecheck for the desktop app, e.g. `npx nx run desktop:typecheck` if defined).
Expected: no TS errors; specifically no "Type '\"tex\"' is not assignable" and no missing-i18n-key errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts apps/desktop/src/app/pages/documents/cv-list/cv-list.component.html libs/i18n/src/lib/translations/translations.ts
git commit -m "refactor(documents): remove latex export option from cv list ui

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Full-repo verification gate

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Repo-wide grep gate for any surviving LaTeX export surface**

Run: `grep -rniE "cv_content_to_tex|tex_escape|tex_inline|cv_export_tex|texExportNoteOpen|export.*\.tex|LaTeX" apps/desktop/src apps/desktop/src-tauri/src libs`
Expected: no matches related to CV export. (Incidental substrings like `context`, `text`, `next` are excluded by these specific patterns; if any real reference survives, remove it and re-run.)

- [ ] **Step 2: Rust test suite green**

Run: `cd apps/desktop/src-tauri && cargo test --lib 2>&1 | tail -20`
Expected: all tests PASS, zero references to the removed tex tests.

- [ ] **Step 3: Frontend unit tests green (if the changed files have specs)**

Run: `npx nx test desktop 2>&1 | tail -30` (or the standard test command).
Expected: PASS. No spec should reference `cv_export_tex_*` or `texExportNoteOpen`.

- [ ] **Step 4: Manual smoke (desktop build, optional but recommended)**

If a desktop build is convenient: open a CV in the list, open the export dropdown, confirm only **PDF** and **DOCX** appear (no ".tex" / "LaTeX source" option), and the LaTeX info-note no longer shows.

- [ ] **Step 5: No commit needed** — verification only. Phase A complete.

## Self-Review

- **Spec coverage:** Spec §"LaTeX removal" lists exactly: `tex_escape`/`tex_inline`/`cv_content_to_tex` (Task 1), the `"tex"` dispatch arm (Task 1), `'tex'` format union in TS (Task 2), the `.tex` UI action + i18n keys (Task 2), and Rust+TS tests (Task 1 tests removed; Task 3 gates the rest). All covered.
- **Placeholder scan:** No TBD/TODO; each edit shows exact file, line, and resulting code. Deletion tasks legitimately verify via grep-gate + build + existing suite rather than a new failing test (removal has no new behaviour to test).
- **Type consistency:** Union narrowed to `'pdf' | 'docx'` consistently in the `exportDoc` signature (Task 2 Step 2) and its callers (Task 2 Step 1 checks `jobs.component.ts` + `db.service.ts`).
