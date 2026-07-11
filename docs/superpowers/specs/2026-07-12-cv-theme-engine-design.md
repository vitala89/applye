# CV Theme Engine — Design Spec

- **Date**: 2026-07-12
- **Status**: Approved (design), pending implementation plan
- **Area**: Documents · CV builder (`apps/desktop` + `libs/core` + Rust `check_style_safety`/new `validate_theme`)
- **Related**: ROADMAP §16 (Documents CV & Cover Letter Library); builds on per-section Style (Wave B), WYSIWYG preview→export, paginated page-card preview.

## Problem

The CV builder renders exactly **one** hardcoded visual look. The preview markup and SCSS
(`cv-detail.component.{html,scss}`, `cvpreview__*` classes) bake in a single design: uppercase
section titles, single-line experience heads (company left / dates right), default accent colour.

The user wants:

1. To keep the current look as a named built-in.
2. A **second** built-in visual theme matching a supplied LaTeX/PDF CV (teal accent, uppercase
   ruled section headers, two-line experience entries, Lato).
3. Architecture so **more themes** can be added by the project and later **uploaded by users**,
   with an eventual **marketplace** for community themes.

The existing `CvTemplate` (in `cv_templates`) is **content layout only** (which sections, order,
photo/birthdate flags) — it does not describe visuals. `CvStyle` provides font/size/accent/weight
knobs but cannot express a distinct _look_ (header treatment, entry-layout structure, rule lines,
case). A new layer is required.

## Decisions (locked)

| Question                    | Decision                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| How much architecture now   | **Full declarative theme engine** — both themes render through one data-driven engine; upload/marketplace slot in later with no rework. |
| Output surfaces themed now  | **Preview + print→PDF only** (one renderer; PDF is generated from the preview DOM). DOCX/LaTeX themed export deferred.                  |
| Theme ↔ Style interaction   | **Theme sets defaults; `CvStyle` overrides layer on top.** Switching theme reseeds token defaults but keeps explicit user overrides.    |
| Theme #2 name               | **"Aurora"**. Current default named **"Classic"**.                                                                                      |
| Experience `industry` field | Add optional `industry?: string` (back-compat). Aurora shows it; Classic ignores it.                                                    |
| DOCX divergence             | **Accepted** for this task: Aurora preview + Export-PDF are themed; DOCX export stays Classic until themed-DOCX lands (follow-up).      |

## Architecture — three separate layers

```
CvTemplate   → content layout: which sections, order, photo/birthdate flags   (UNCHANGED)
CvTheme      → visual look: accent, header, section-header, entry layout, rules (NEW)
CvStyle      → user overrides: font/size/accent/weight + per-section overrides (UNCHANGED)
```

**Resolution order (deep merge):** `theme.tokens (defaults)` ◄ `CvStyle` ◄ `CvStyle.sectionStyles[key]`.

A pure resolver produces one `ResolvedCvVisual` consumed by the renderer. The resolver is
side-effect-free and unit-tested independently.

## `CvTheme` descriptor — pure validated data (the sandbox)

A theme is a JSON object of **typed/enumerated fields only** — no raw CSS/HTML/JS, ever. Shape
(`libs/core` types; exact field list finalized in the plan):

- `tokens`: `accentHex`, `mutedHex`, `fontFamily`, `baseSizePt`, `fontWeight` — seed `CvStyle`
  defaults when the theme is selected.
- `header`: `nameStyle` (size/weight/case), `titleColor` (`accent`\|`text`), `contactLayout`
  (`inline-pipe`\|`stacked`), `rule` (`{ weightPt, color: accent|muted|none }`).
- `sectionHeader`: `case` (`upper`\|`none`), `color` (`accent`\|`text`), `rule`
  (`{ weightPt, color, position: under|none }`).
- `entryLayout`: `single-line` \| `two-line`.
  - `single-line` (Classic): company left, dates right.
  - `two-line` (Aurora): line 1 = company (accent bold) + `-` + industry (muted) | location
    (muted, right); line 2 = role (italic) | dates (italic muted, right) + thin rule under.
- `bullets`: `marker` (`disc`\|`textbullet`), spacing token.
- `spacing`: coarse section/entry gap tokens.

**Validation** (`validate_theme`, Rust, mirrors `check_style_safety`): hex-colour format, numeric
ranges (sizes/weights), enum membership for every variant field. Anything failing → rejected. This
is what makes an **uploaded or marketplace** theme safe: it cannot inject styles or execute code.

## Renderer — one data-driven engine

Refactor the CV preview so it no longer hardcodes one look:

1. Emit CSS custom properties from resolved tokens onto the preview root
   (`--cv-accent`, `--cv-muted`, `--cv-section-case`, `--cv-header-rule`, `--cv-entry-rule`, …).
2. Section-header case/colour/rule driven by those vars + theme-driven classes.
3. Entry layout switches on `entryLayout` variant via a small template branch
   (`single-line` vs `two-line`) in the html.

Both **Classic** (current look captured as a descriptor) and **Aurora** flow through this one
engine — Classic's existing render must be byte-for-byte equivalent so current tests stay green.
Print→PDF inherits automatically (same DOM). This satisfies "preview + print-PDF only" with a
single renderer.

## Storage

- New table `cv_themes` (migration): `id`, `name`, `is_builtin`, `descriptor_json`, `version`,
  `created_at`. Seed **Classic** + **Aurora** as built-ins.
- `document_library.theme_id` (nullable) references it; absent → Classic (back-compat, no data
  migration for existing docs).
- Later: user-uploaded themes = same table, `is_builtin=0`, gated by `validate_theme`.
  Marketplace = remote fetch → `validate_theme` → insert row. No schema rework.

## Data-model addition

`CvExperienceEntry.industry?: string` — optional, back-compat, empty default. Aurora's two-line
layout renders it; Classic ignores it. Import/generate population is out of scope here.

## Aurora descriptor (encodes the supplied `.tex`)

- Tokens: accent `#1B7464`, muted `#666666`, font `Lato`, base `10pt`.
- Header: name large bold (mixed case), title accent bold, contact `inline-pipe` small muted,
  header rule `0.8pt` accent.
- Section header: `upper`, `accent`, rule `0.8pt` accent `under`.
- Entry layout: `two-line` — company accent-bold + `-` industry muted | location muted right;
  role italic | dates italic muted right + `0.4pt` gray rule under.
- Bullets: `textbullet`, tight spacing.

## UI

A **Theme** picker in the CV detail style area (Classic / Aurora). Selecting a theme:

- sets `document_library.theme_id`,
- reseeds `CvStyle` token defaults (e.g. accent → teal for Aurora) **without** clearing the user's
  explicit per-section overrides.

"Import theme…" button and marketplace entry are left as a visible seam — not implemented.

## Pagination interaction

The recently-built atom model splits experience entries into head + per-bullet atoms with glue
semantics. Aurora's `two-line` entry head has an extra role line; the head must remain a single
glued atom (or a coherent glued run) so the head never splits mid-entry and stays glued to its
first bullet. Existing `paginate.util` glue-run behaviour must hold.

## Testing

- **Resolver**: merge-precedence unit tests (theme ◄ style ◄ section).
- **Validation (security)**: `validate_theme` rejects bad hex, out-of-range sizes/weights, unknown
  enum values.
- **Render**: Aurora emits two-line entry atoms + accent CSS vars; Classic render unchanged
  (existing `cv-detail` tests green).
- **Pagination**: two-line head keeps glue-to-first-bullet; no mid-head split.

## Scope boundaries (YAGNI — deferred, seams only)

- DOCX / LaTeX **themed** export (DOCX stays Classic this task).
- Theme upload UI, custom theme editor.
- Marketplace (browse/fetch/install).

## Known risks

- **Pagination × two-line entry** — the extra role line must not break the head-atom glue model.
- **Reseed vs overrides** — theme switch must reseed defaults without clobbering explicit user
  section overrides (precedence bug surface).
- **DOCX divergence** — Aurora preview/PDF vs Classic DOCX is an intentional, communicated gap.
- **Classic parity** — Classic-as-descriptor must reproduce the current look exactly, or existing
  render tests fail.
