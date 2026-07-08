# CV Default Template + WYSIWYG Export — Design

Date: 2026-07-08
Branch: `feat/cv-default-template`
Status: Approved for planning

## Problem

The Documents CV generator produces thin, structurally flat output. The AI
skill and content model do not capture the layout users expect, and the export
pipeline flattens structured content to plain markdown before rendering
(`cv_content_to_markdown` → `printpdf`/`docx-rs`), so the PDF/DOCX lose all
typographic structure: no job title line, no pipe-delimited contact row, no
grouped skill rows, no right-aligned dates, no inline emphasis on metrics.
User style choices (font/size/colour) reach only the live preview and the ATS
advisory check — they are **not** applied to exported files.

The target default output is a single-column ATS résumé (reference:
`CV Vitalii Kasap-s.pdf`) with the structure documented in "Default Template"
below.

## Goals

1. The default generated CV matches the reference layout, content-complete.
2. On-screen preview and exported PDF are visually identical (WYSIWYG).
3. Both PDF and DOCX are produced; DOCX stays ATS-parseable.
4. Full styling: font family, size, colour, **weight**, with per-section
   overrides, threaded into preview + both exports + ATS check.

## Non-Goals

- Multiple visual template themes (only one default template this iteration;
  the existing `CvTemplate` layout/ordering mechanism is retained but not
  expanded).
- Cover-letter redesign (unchanged; may reuse the style plumbing later).
- Pixel-identical DOCX (structurally faithful + ATS-safe is the DOCX bar).

## Default Template (reference layout)

Single column, top to bottom:

1. **Name** — large, UPPERCASE.
2. **Title** — role line, e.g. "Senior Frontend Software Engineer".
3. **Contact row** — one line, `|` separated: location · phone · email ·
   website · linkedin. Empty fields are omitted with no dangling separators.
4. **Summary** — paragraph.
5. **Section: TECHNICAL SKILLS** — caps heading; rows of `Label: values`
   (Languages, Frameworks, Build Tools, Data, Cloud & DevOps, Quality, GenAI…).
6. **Section: PROFESSIONAL EXPERIENCE** — per entry: `Company — industry`
   (bold) with location right-aligned; `Role` with dates right-aligned;
   bullets with **inline bold** on metrics/keywords.
7. **Section: EDUCATION**.
8. **Section: LANGUAGES** — one line, `|` separated.

Section order follows the active `CvTemplate.sectionsJson`; the default
template preset defines the order above.

## Architecture

### Rendering strategy — HTML/CSS canonical + webview print-to-PDF (Approach A)

The layout is defined **once** in an Angular preview component + CSS. That HTML
is the single source of truth.

- **Preview**: the component renders `CvContent` + `CvStyle` live and editable.
- **PDF**: a Rust Tauri command prints the same rendered HTML to a PDF file via
  the platform webview print API (WKWebView `createPDF` on macOS, WebView2
  `PrintToPdfAsync` on Windows). A dedicated hidden print route
  (`/print/cv/:id`) renders CV-only with `@page`/print CSS; the command loads
  it in a hidden `WebviewWindow`, waits for a render-complete signal, prints to
  the target path, and closes the window. Guarantees 1:1 with preview.
- **DOCX**: separate Rust renderer (`docx-rs`) consuming `content_json` +
  `style_json` directly (no markdown intermediary) — headings, a right-aligned
  table cell for dates/location, bold runs for inline emphasis, ATS-safe fonts.

**Fallback (Plan B, PDF only):** if cross-platform native print proves too
costly, render PDF from a Typst template driven by the same style tokens. This
is a contingency; it does not block Phases 1, 3, 4. The DOCX path is unaffected
either way.

The existing `cv_content_to_markdown` + `md_to_pdf_bytes` path is removed from
the CV export flow once Phase 2 lands (kept only if still used by tailoring;
verified during implementation).

### Data model changes (`libs/core/src/lib/models/document.model.ts`)

- `CvPersonalDetailsSection` += `title?`, `website?`, `linkedin?` (optional
  strings). Existing `birthDate`/`maritalStatus` remain, gated by template.
- Skills become grouped:
  `CvSkillsSection { groups: CvSkillGroup[] }`,
  `CvSkillGroup { label: string; values: string[] }`.
  Backward compat: a loader normalizes legacy `items: string[]` into a single
  `{ label: 'Skills', values: items }` group (non-destructive).
- Bullets stay `string[]`; **inline emphasis is encoded inline** with `**…**`
  markers. A shared pure function `parseInlineEmphasis(text): TextRun[]`
  (`TextRun { text: string; bold: boolean }`) is consumed by the HTML preview
  and the DOCX renderer. Chosen over a nested rich-bullet model to minimise
  churn and keep AI output simple.
- `CvStyle` += `fontWeight: number` (default 400). Optional per-section
  overrides: `sectionStyles?: Partial<Record<CvSectionKey, Partial<CvStyle>>>`.
  `CV_STYLE_DEFAULT` extended accordingly (Calibri, 11pt, #333333, 400).

### AI skill (`libs/skills/src/cv-generate-baseline/cv-generate-baseline.md`)

Update the emitted JSON schema + examples to the new shape: `title`,
`website`, `linkedin`, grouped `skills`, and bullets carrying `**…**` emphasis
on metrics/keywords. Region/archetype/language inputs unchanged. This is the
primary fix for "generates poorly" — richer, correctly structured output.
`cv-import` skill schema updated to the same shape for round-trip parity.

### Content builder (`apps/desktop/src/app/pages/documents/cv-content.util.ts`)

- `parseCvSkillResponse` / `buildCvContent` handle the new fields and grouped
  skills; legacy normalization applied on load.
- `cvContentToMd` (used by tailoring/jobs) updated to serialize groups +
  emphasis markers without loss.

### Style UI (`cv-detail.component.*`)

- Add a **weight** control (select: e.g. 300/400/500/600/700, or the
  ATS-reasonable subset).
- Ensure font/size/colour/weight bind to CSS variables on the preview and are
  passed to both export commands.
- `check_style_safety` extended to advise on weight (very light/heavy →
  readability/ATS note), reusing the existing `StyleNote` mechanism.

### i18n

New UI labels (weight control, any new export messaging) go through
`libs/i18n`. Skill/content strings are data, not UI.

## Data Flow

```
profile markdown ─▶ cv-generate-baseline (AI) ─▶ JSON
   ─▶ parseCvSkillResponse ─▶ buildCvContent ─▶ CvContent (content_json)
                                              + CvStyle (style_json)
Preview:  CvContent + CvStyle ─▶ Angular template (CSS vars) ─▶ editable HTML
PDF:      /print/cv/:id (same template, print CSS) ─▶ hidden webview
              ─▶ Rust print command ─▶ PDF file
DOCX:     content_json + style_json ─▶ Rust docx-rs renderer ─▶ DOCX file
```

## Error Handling

- Invalid model JSON → `cleanJsonText` + parse; on failure keep prior content
  (never wipe), surface an error, show `lowConfidenceNotes`.
- Missing profile fields → skill emits `lowConfidenceNotes`; template omits
  empty rows and trims separators (no dangling `|`).
- Print-to-PDF failure → surface a clear error; DOCX export remains available;
  Plan B (Typst) is the escalation path if native print is unviable.
- Legacy document shape → normalized on load; save writes the new shape.

## Testing

- **Unit (TS)**: `parseInlineEmphasis`; `buildCvContent` with grouped skills +
  new personal fields; skill-JSON parsing; legacy skills migration
  (`items[]` → group); empty-field separator trimming; `suggestCvFilename`.
- **Component**: preview renders all sections, omits empty fields, applies
  style CSS variables incl. weight and per-section overrides.
- **Rust**: DOCX structured render (assert bold runs + right-aligned
  date/location cells + ATS fonts); print command path/arg handling.
- **Golden**: feed the reference profile → generated `CvContent` has title,
  contact links, grouped skills, emphasized bullets, correct section order.

## Phases

1. **Content + preview look like the reference** — data model (#1), skill (#2),
   builder (#3), HTML/CSS preview template (#4). Most visible result; fixes the
   "nothing there" complaint without touching export plumbing.
2. **WYSIWYG PDF export** — hidden print route + native webview print-to-PDF
   command (#5). Plan B held in reserve.
3. **Structured DOCX export** — upgrade `docx-rs` renderer from content+style
   (#6), ATS-safe.
4. **Full customization** — weight control + per-section overrides threaded to
   preview + both exports + ATS check (#7).

Each phase is independently shippable and independently verifiable.
