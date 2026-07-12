# CV Theme Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a declarative, sandboxed CV visual-theme layer with two built-in themes (Classic + Aurora), rendered through one data-driven preview engine, upload/marketplace-ready.

**Architecture:** A `CvThemeDescriptor` (pure typed data — no CSS/HTML/JS) lives beside `CvTemplate` (content layout) and `CvStyle` (user overrides). A theme contributes two things: (1) a **style seed** — four base tokens (font/size/weight/accent) reseeded into `CvStyle` when the theme is selected, still overridable via the existing Style panel; and (2) **theme-only CSS custom properties** (`--cv-*`) applied once on the preview viewport and inherited into every page card, driving the visual bits that `CvStyle` cannot express (section/header/entry rules, section-title colour source, role italics, industry visibility, contact separator, title case). Classic's descriptor sets vars to the current values, so "Classic" renders byte-identically to today. Aurora sets teal/ruled/italic values. Print→PDF inherits automatically (same DOM). DOCX/LaTeX themed export is out of scope.

**Tech Stack:** Angular 20 (signals, standalone), TypeScript, `@applye/core` domain lib, Rust (Tauri commands), SQLite migrations, Vitest/Jest-style specs already present in the repo.

## Global Constraints

- Do not modify `package.json` or add dependencies.
- Conventional Commits; commit **subject must be lowercase** (commitlint `subject-case`). End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Themed output surfaces in this task: **Angular preview + WYSIWYG print→PDF only**. DOCX/LaTeX exports keep the current single look.
- Theme descriptors are **pure data**: enumerated/typed fields only. No raw CSS/HTML/JS may enter a descriptor or the render path from a descriptor.
- Back-compat: existing documents (no `theme_id`) render as **Classic**, identical to today. No data migration of existing rows.
- New user-facing strings require EN + DE i18n keys (follow existing `cv_*` documents keys).
- Built-in theme ids are stable: **1 = Classic, 2 = Aurora**.
- Branch: `feat/cv-theme-engine` (already created; spec committed).

---

## File Structure

**Create:**

- `libs/core/src/lib/models/cv-theme.model.ts` — `CvThemeDescriptor` + sub-types, `CV_THEME_CLASSIC`, `CV_THEME_AURORA`, `CV_THEMES_BUILTIN`, `getBuiltinTheme`, `themeStyleSeed`, `themeCssVars`.
- `libs/core/src/lib/models/cv-theme.model.spec.ts` — unit tests for the above.
- `apps/desktop/src-tauri/migrations/0014_cv_themes.sql` — `cv_themes` table + seed + `document_library.theme_id`.

**Modify:**

- `libs/core/src/lib/models/document.model.ts` — add `industry?` to `CvExperienceEntry`; add `themeId?` to `DocumentLibraryItem` + `UpsertDocumentLibraryItemInput`.
- `libs/core/src/index.ts` — re-export the new theme model.
- `apps/desktop/src-tauri/src/commands/documents.rs` — `theme_id` on the Rust document row struct + upsert read/write; new `validate_theme` command + tests.
- `apps/desktop/src-tauri/src/lib.rs` — register `validate_theme`.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` — `themeId` signal, `activeTheme`/`themeVars` computed, load/save theme, reseed-on-switch, theme picker handler.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` — apply `themeVars` on `.cvpreview-viewport`; guarded industry span; contact separator + entry-rule hooks; theme picker control.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` — var-ize `cvpreview__*` rules with Classic-equal fallbacks.
- `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts` — theme render tests.
- i18n EN + DE resource files (documents section) — theme picker labels.
- `docs/product/CURRENT_STATE.md` — record the feature.

---

## Task 1: Core theme model + pure helpers (`libs/core`)

**Files:**

- Create: `libs/core/src/lib/models/cv-theme.model.ts`
- Test: `libs/core/src/lib/models/cv-theme.model.spec.ts`
- Modify: `libs/core/src/lib/models/document.model.ts`, `libs/core/src/index.ts`

**Interfaces:**

- Produces:
  - `interface CvThemeDescriptor { id: number; name: string; version: number; tokens: CvThemeTokens; header: CvThemeHeader; sectionHeader: CvThemeSectionHeader; entry: CvThemeEntry; bullets: CvThemeBullets; }`
  - `CvThemeTokens { accentHex: string; mutedHex: string; fontFamily: string; baseSizePt: number; fontWeight: CvFontWeight; }`
  - `CvThemeHeader { titleColor: 'accent' | 'text'; contactLayout: 'inline-pipe' | 'stacked'; ruleWeightPt: number; ruleColor: 'accent' | 'muted' | 'none'; }`
  - `CvThemeSectionHeader { case: 'upper' | 'none'; color: 'accent' | 'text'; ruleWeightPt: number; ruleColor: 'accent' | 'muted' | 'none'; }`
  - `CvThemeEntry { companyColor: 'accent' | 'text'; roleItalic: boolean; showIndustry: boolean; ruleWeightPt: number; ruleColor: 'accent' | 'muted' | 'none'; }`
  - `CvThemeBullets { marker: 'disc' | 'textbullet'; }`
  - `getBuiltinTheme(id: number | undefined): CvThemeDescriptor` — returns Classic for `undefined`/unknown id.
  - `themeStyleSeed(theme: CvThemeDescriptor): Pick<CvStyle,'fontFamily'|'fontSizePt'|'fontWeight'|'accentColorHex'>`
  - `themeCssVars(theme: CvThemeDescriptor): Record<string, string>` — the `--cv-*` map.
  - Consts `CV_THEME_CLASSIC`, `CV_THEME_AURORA`, `CV_THEMES_BUILTIN: Record<number, CvThemeDescriptor>`.
- Consumes: `CvFontWeight`, `CvStyle` from `document.model.ts`.

**Design notes (read before coding):**

- Classic's `themeCssVars` MUST equal the values the current SCSS hardcodes so Classic render is unchanged. Concretely Classic yields: company colour = `inherit`, section-title colour source = the resolved title colour (so `--cv-section-title-color: inherit` — the existing `titleCss` binding stays authoritative), role font-style `normal`, header/section/entry rule widths `0`, section case `uppercase`, contact separator implicit. Aurora overrides these.
- `themeCssVars` returns strings only from enumerated inputs (colours resolved to `var(--...)`/hex, weights to numbers) — never passes descriptor text through verbatim into a style string, preserving the sandbox.
- Colour mapping helper: `'accent' → 'var(--cv-accent)'`, `'muted' → 'var(--cv-muted)'`, `'text' → 'inherit'`, `'none' → '0'` (for rule widths use `${n}pt`, and `ruleColor:'none' → width 0`).

- [ ] **Step 1: Add `industry?` to `CvExperienceEntry`**

In `libs/core/src/lib/models/document.model.ts`, edit the interface:

```ts
export interface CvExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  location?: string;
  /** Optional industry / domain tag, shown by themes whose entry layout
   * surfaces it (e.g. Aurora "Company - Industry"); ignored by others. */
  industry?: string;
  bullets: string[];
}
```

- [ ] **Step 2: Add `themeId?` to the two document library interfaces**

In the same file, add to both `DocumentLibraryItem` and `UpsertDocumentLibraryItemInput` (place near `templateId?`):

```ts
  /** Selected visual theme id (built-in: 1=Classic, 2=Aurora). Absent → Classic. */
  themeId?: number;
```

- [ ] **Step 3: Write the failing spec for the theme model**

Create `libs/core/src/lib/models/cv-theme.model.spec.ts`:

```ts
import {
  CV_THEME_CLASSIC,
  CV_THEME_AURORA,
  getBuiltinTheme,
  themeStyleSeed,
  themeCssVars,
} from './cv-theme.model';

describe('cv-theme model', () => {
  it('exposes stable built-in ids', () => {
    expect(CV_THEME_CLASSIC.id).toBe(1);
    expect(CV_THEME_AURORA.id).toBe(2);
  });

  it('getBuiltinTheme falls back to Classic for undefined/unknown', () => {
    expect(getBuiltinTheme(undefined).id).toBe(1);
    expect(getBuiltinTheme(999).id).toBe(1);
    expect(getBuiltinTheme(2).id).toBe(2);
  });

  it('Aurora style seed carries teal accent + Lato', () => {
    const seed = themeStyleSeed(CV_THEME_AURORA);
    expect(seed.accentColorHex).toBe('#1B7464');
    expect(seed.fontFamily).toBe('Lato');
  });

  it('Classic css vars are visually neutral (no rules, inherit company)', () => {
    const v = themeCssVars(CV_THEME_CLASSIC);
    expect(v['--cv-company-color']).toBe('inherit');
    expect(v['--cv-header-rule-width']).toBe('0pt');
    expect(v['--cv-role-style']).toBe('normal');
  });

  it('Aurora css vars apply accent rules + italic role', () => {
    const v = themeCssVars(CV_THEME_AURORA);
    expect(v['--cv-company-color']).toBe('var(--cv-accent)');
    expect(v['--cv-role-style']).toBe('italic');
    expect(v['--cv-section-rule-width']).toBe('0.8pt');
    expect(v['--cv-accent']).toBe('#1B7464');
  });
});
```

- [ ] **Step 4: Run the spec, verify it fails**

Run: `npx nx test core --testPathPattern=cv-theme.model`
Expected: FAIL — module `./cv-theme.model` not found.

- [ ] **Step 5: Implement `cv-theme.model.ts`**

Create `libs/core/src/lib/models/cv-theme.model.ts`:

```ts
import type { CvFontWeight, CvStyle } from './document.model';

export interface CvThemeTokens {
  accentHex: string;
  mutedHex: string;
  fontFamily: string;
  baseSizePt: number;
  fontWeight: CvFontWeight;
}

export interface CvThemeHeader {
  titleColor: 'accent' | 'text';
  contactLayout: 'inline-pipe' | 'stacked';
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeSectionHeader {
  case: 'upper' | 'none';
  color: 'accent' | 'text';
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeEntry {
  companyColor: 'accent' | 'text';
  roleItalic: boolean;
  showIndustry: boolean;
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeBullets {
  marker: 'disc' | 'textbullet';
}

/** A CV visual theme — pure typed data, no CSS/HTML/JS. Renders via
 * `themeCssVars` (custom properties) + `themeStyleSeed` (CvStyle defaults). */
export interface CvThemeDescriptor {
  id: number;
  name: string;
  version: number;
  tokens: CvThemeTokens;
  header: CvThemeHeader;
  sectionHeader: CvThemeSectionHeader;
  entry: CvThemeEntry;
  bullets: CvThemeBullets;
}

export const CV_THEME_CLASSIC: CvThemeDescriptor = {
  id: 1,
  name: 'Classic',
  version: 1,
  tokens: {
    accentHex: '#333333',
    mutedHex: '#666666',
    fontFamily: 'Calibri',
    baseSizePt: 11,
    fontWeight: 400,
  },
  header: { titleColor: 'text', contactLayout: 'stacked', ruleWeightPt: 0, ruleColor: 'none' },
  sectionHeader: { case: 'upper', color: 'text', ruleWeightPt: 0, ruleColor: 'none' },
  entry: {
    companyColor: 'text',
    roleItalic: false,
    showIndustry: false,
    ruleWeightPt: 0,
    ruleColor: 'none',
  },
  bullets: { marker: 'disc' },
};

export const CV_THEME_AURORA: CvThemeDescriptor = {
  id: 2,
  name: 'Aurora',
  version: 1,
  tokens: {
    accentHex: '#1B7464',
    mutedHex: '#666666',
    fontFamily: 'Lato',
    baseSizePt: 10,
    fontWeight: 400,
  },
  header: {
    titleColor: 'accent',
    contactLayout: 'inline-pipe',
    ruleWeightPt: 0.8,
    ruleColor: 'accent',
  },
  sectionHeader: { case: 'upper', color: 'accent', ruleWeightPt: 0.8, ruleColor: 'accent' },
  entry: {
    companyColor: 'accent',
    roleItalic: true,
    showIndustry: true,
    ruleWeightPt: 0.4,
    ruleColor: 'muted',
  },
  bullets: { marker: 'textbullet' },
};

export const CV_THEMES_BUILTIN: Record<number, CvThemeDescriptor> = {
  [CV_THEME_CLASSIC.id]: CV_THEME_CLASSIC,
  [CV_THEME_AURORA.id]: CV_THEME_AURORA,
};

export function getBuiltinTheme(id: number | undefined): CvThemeDescriptor {
  return (id != null && CV_THEMES_BUILTIN[id]) || CV_THEME_CLASSIC;
}

export function themeStyleSeed(
  theme: CvThemeDescriptor,
): Pick<CvStyle, 'fontFamily' | 'fontSizePt' | 'fontWeight' | 'accentColorHex'> {
  return {
    fontFamily: theme.tokens.fontFamily,
    fontSizePt: theme.tokens.baseSizePt,
    fontWeight: theme.tokens.fontWeight,
    accentColorHex: theme.tokens.accentHex,
  };
}

function colorVar(c: 'accent' | 'muted' | 'text' | 'none'): string {
  switch (c) {
    case 'accent':
      return 'var(--cv-accent)';
    case 'muted':
      return 'var(--cv-muted)';
    case 'text':
      return 'inherit';
    case 'none':
      return 'transparent';
  }
}

function ruleWidth(weightPt: number, color: 'accent' | 'muted' | 'none'): string {
  return color === 'none' ? '0pt' : `${weightPt}pt`;
}

/** CSS custom properties for one theme, applied on the preview viewport and
 * inherited into every page card. Classic's values equal the SCSS defaults so
 * Classic renders unchanged. */
export function themeCssVars(theme: CvThemeDescriptor): Record<string, string> {
  const t = theme;
  return {
    '--cv-accent': t.tokens.accentHex,
    '--cv-muted': t.tokens.mutedHex,
    '--cv-section-case': t.sectionHeader.case === 'upper' ? 'uppercase' : 'none',
    '--cv-section-rule-width': ruleWidth(t.sectionHeader.ruleWeightPt, t.sectionHeader.ruleColor),
    '--cv-section-rule-color': colorVar(t.sectionHeader.ruleColor),
    '--cv-header-rule-width': ruleWidth(t.header.ruleWeightPt, t.header.ruleColor),
    '--cv-header-rule-color': colorVar(t.header.ruleColor),
    '--cv-title-color': colorVar(t.header.titleColor),
    '--cv-company-color': colorVar(t.entry.companyColor),
    '--cv-role-style': t.entry.roleItalic ? 'italic' : 'normal',
    '--cv-entry-rule-width': ruleWidth(t.entry.ruleWeightPt, t.entry.ruleColor),
    '--cv-entry-rule-color': colorVar(t.entry.ruleColor),
  };
}
```

- [ ] **Step 6: Re-export from the core barrel**

In `libs/core/src/index.ts`, add an export line next to the other model exports:

```ts
export * from './lib/models/cv-theme.model';
```

- [ ] **Step 7: Run the spec, verify it passes**

Run: `npx nx test core --testPathPattern=cv-theme.model`
Expected: PASS (5 tests).

- [ ] **Step 8: Typecheck the core lib**

Run: `npx nx build core` (or `npx tsc -p libs/core/tsconfig.lib.json --noEmit`)
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add libs/core/src/lib/models/cv-theme.model.ts libs/core/src/lib/models/cv-theme.model.spec.ts libs/core/src/lib/models/document.model.ts libs/core/src/index.ts
git commit -m "feat(documents): add cv theme descriptor model and helpers"
```

---

## Task 2: Storage migration + Rust `theme_id` + `validate_theme`

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0014_cv_themes.sql`
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs`, `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**

- Produces: Tauri command `validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote>` (empty = valid). Document row gains `theme_id: Option<i64>` on read/write.
- Consumes: existing `StyleNote` struct and `document_library` upsert path in `documents.rs`.

**Design notes:**

- `validate_theme` mirrors `check_style_safety`'s shape but is a **hard validator** for uploaded themes (future): it returns notes for malformed hex, out-of-range sizes/weights, or unknown enum values. Built-ins never trigger it; it exists so the upload/marketplace path (later) has a gate. This task wires the command + tests only; no UI calls it yet.
- Seed the two descriptors as JSON matching the TS constants (id 1 Classic, id 2 Aurora) so the FK is valid and future user themes coexist.

- [ ] **Step 1: Write the migration**

Create `apps/desktop/src-tauri/migrations/0014_cv_themes.sql`:

```sql
-- 0014_cv_themes.sql
-- CV visual themes (design spec 2026-07-12). Additive: a themes table plus a
-- nullable theme_id on document_library. Absent theme_id → Classic (id 1),
-- so existing documents are unchanged. descriptor_json holds the pure-data
-- CvThemeDescriptor; built-ins mirror the libs/core constants. User-uploaded
-- and marketplace themes will reuse this table with is_builtin = 0.

CREATE TABLE IF NOT EXISTS cv_themes (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    is_builtin      INTEGER DEFAULT 0,
    descriptor_json TEXT NOT NULL,
    version         INTEGER DEFAULT 1,
    created_at      TEXT
);

ALTER TABLE document_library ADD COLUMN theme_id INTEGER REFERENCES cv_themes(id);

INSERT OR IGNORE INTO cv_themes (id, name, is_builtin, descriptor_json, version, created_at) VALUES
    (1, 'Classic', 1, '{"id":1,"name":"Classic","version":1,"tokens":{"accentHex":"#333333","mutedHex":"#666666","fontFamily":"Calibri","baseSizePt":11,"fontWeight":400},"header":{"titleColor":"text","contactLayout":"stacked","ruleWeightPt":0,"ruleColor":"none"},"sectionHeader":{"case":"upper","color":"text","ruleWeightPt":0,"ruleColor":"none"},"entry":{"companyColor":"text","roleItalic":false,"showIndustry":false,"ruleWeightPt":0,"ruleColor":"none"},"bullets":{"marker":"disc"}}', 1, datetime('now')),
    (2, 'Aurora', 1, '{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}', 1, datetime('now'));
```

- [ ] **Step 2: Confirm the migration is registered**

The repo registers migrations in a list (grep to find it):

Run: `grep -rn "0013_cv_templates_personal_details" apps/desktop/src-tauri/src`
Add a sibling entry for `0014_cv_themes.sql` in the same array/macro, mirroring the existing pattern (same `Migration { version: 14, ... kind: MigrationKind::Up }` shape used for 13).

- [ ] **Step 3: Add `theme_id` to the Rust document row read/write**

In `apps/desktop/src-tauri/src/commands/documents.rs`, find the `DocumentLibraryItem` struct and the SELECT/UPSERT for `document_library` (grep `template_id` to locate every site). Add `theme_id: Option<i64>` to the struct (serde rename `themeId` to match TS camelCase — mirror how `template_id`/`templateId` is done), include `theme_id` in the SELECT column list + row mapping, and in the INSERT/UPDATE column list + bindings. Follow the exact style of the adjacent `template_id` handling.

Run: `grep -n "template_id\|templateId" apps/desktop/src-tauri/src/commands/documents.rs`
Expected: use each match as the template for an adjacent `theme_id` line.

- [ ] **Step 4: Write the failing `validate_theme` test**

In the `#[cfg(test)]` module of `documents.rs`, add:

```rust
#[test]
fn validate_theme_accepts_builtin_aurora() {
    let aurora = r#"{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"#;
    assert!(validate_theme_core(Some(aurora.to_string())).is_empty());
}

#[test]
fn validate_theme_flags_bad_hex_and_enum() {
    let bad = r#"{"id":9,"name":"X","version":1,"tokens":{"accentHex":"teal","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"rainbow","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"#;
    let notes = validate_theme_core(Some(bad.to_string()));
    assert!(!notes.is_empty());
}
```

- [ ] **Step 5: Run the tests, verify they fail**

Run: `cargo test -p applye --manifest-path apps/desktop/src-tauri/Cargo.toml validate_theme`
Expected: FAIL — `validate_theme_core` not found. (If the crate name differs, use the name printed by `cargo test`; confirm via `grep -m1 'name =' apps/desktop/src-tauri/Cargo.toml`.)

- [ ] **Step 6: Implement `validate_theme`**

In `documents.rs`, add near `check_style_safety`:

```rust
/// Hard validator for an uploaded CvThemeDescriptor (future upload/marketplace
/// path). Returns a note per problem; empty = safe to store. Built-in themes
/// always pass. Deliberately strict: rejects malformed hex, out-of-range
/// numerics, and unknown enum values so untrusted descriptors cannot smuggle
/// unexpected values into the render path.
#[tauri::command]
pub fn validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote> {
    validate_theme_core(descriptor_json)
}

fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    (b.len() == 4 || b.len() == 7)
        && b[0] == b'#'
        && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

fn validate_theme_core(descriptor_json: Option<String>) -> Vec<StyleNote> {
    let mut notes: Vec<StyleNote> = Vec::new();
    let Some(raw) = descriptor_json else { return notes };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        notes.push(StyleNote { kind: "font_ats_risk".into(), detail: "malformed theme".into() });
        return notes;
    };
    // hex tokens
    for path in [("tokens", "accentHex"), ("tokens", "mutedHex")] {
        if let Some(s) = v.get(path.0).and_then(|o| o.get(path.1)).and_then(|x| x.as_str()) {
            if !is_hex_color(s) {
                notes.push(StyleNote { kind: "color_readability_risk".into(), detail: s.into() });
            }
        }
    }
    // size + weight ranges
    if let Some(sz) = v.get("tokens").and_then(|o| o.get("baseSizePt")).and_then(|x| x.as_f64()) {
        if !(6.0..=18.0).contains(&sz) {
            notes.push(StyleNote { kind: "size_out_of_range".into(), detail: sz.to_string() });
        }
    }
    if let Some(w) = v.get("tokens").and_then(|o| o.get("fontWeight")).and_then(|x| x.as_i64()) {
        if ![300, 400, 600, 700].contains(&w) {
            notes.push(StyleNote { kind: "weight_unavailable_risk".into(), detail: w.to_string() });
        }
    }
    // enum membership
    let check_enum = |notes: &mut Vec<StyleNote>, val: Option<&str>, allowed: &[&str]| {
        if let Some(s) = val {
            if !allowed.contains(&s) {
                notes.push(StyleNote { kind: "font_ats_risk".into(), detail: s.into() });
            }
        }
    };
    check_enum(&mut notes, v.get("header").and_then(|o| o.get("titleColor")).and_then(|x| x.as_str()), &["accent", "text"]);
    check_enum(&mut notes, v.get("header").and_then(|o| o.get("contactLayout")).and_then(|x| x.as_str()), &["inline-pipe", "stacked"]);
    check_enum(&mut notes, v.get("sectionHeader").and_then(|o| o.get("case")).and_then(|x| x.as_str()), &["upper", "none"]);
    check_enum(&mut notes, v.get("sectionHeader").and_then(|o| o.get("color")).and_then(|x| x.as_str()), &["accent", "text"]);
    check_enum(&mut notes, v.get("entry").and_then(|o| o.get("companyColor")).and_then(|x| x.as_str()), &["accent", "text"]);
    check_enum(&mut notes, v.get("bullets").and_then(|o| o.get("marker")).and_then(|x| x.as_str()), &["disc", "textbullet"]);
    for k in ["header", "sectionHeader", "entry"] {
        check_enum(&mut notes, v.get(k).and_then(|o| o.get("ruleColor")).and_then(|x| x.as_str()), &["accent", "muted", "none"]);
    }
    notes
}
```

- [ ] **Step 7: Register the command**

In `apps/desktop/src-tauri/src/lib.rs`, add `commands::documents::validate_theme,` to the `tauri::generate_handler![…]` list next to `check_style_safety`.

- [ ] **Step 8: Run tests + build**

Run: `cargo test -p applye --manifest-path apps/desktop/src-tauri/Cargo.toml validate_theme`
Expected: PASS (2 new tests).
Run: `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: builds (confirms handler registration + struct changes compile).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0014_cv_themes.sql apps/desktop/src-tauri/src/commands/documents.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(documents): persist cv theme id and add validate_theme command"
```

---

## Task 3: Var-ize the preview SCSS + wire theme (Classic parity)

**Goal of this task:** introduce the theme vars into the component and rewrite the SCSS to consume them with **Classic-equal fallbacks**, so with the default (Classic) theme the render is unchanged and all existing `cv-detail` tests stay green. No Aurora-specific DOM yet.

**Files:**

- Modify: `cv-detail.component.ts`, `cv-detail.component.html`, `cv-detail.component.scss`
- Test: `cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `getBuiltinTheme`, `themeCssVars`, `themeStyleSeed` from `@applye/core` (Task 1).
- Produces: `themeId` signal, `activeTheme` computed, `themeVars()` computed used by the template; `selectTheme(id: number)` method.

- [ ] **Step 1: Add theme state to the component**

In `cv-detail.component.ts`, extend the `@applye/core` import block with `getBuiltinTheme, themeCssVars, themeStyleSeed` and add:

```ts
  readonly themeId = signal<number>(1);
  readonly activeTheme = computed(() => getBuiltinTheme(this.themeId()));
  /** Theme custom properties for the preview viewport; inherited by all page cards. */
  readonly themeVars = computed<Record<string, string>>(() => themeCssVars(this.activeTheme()));
```

- [ ] **Step 2: Load `theme_id` and reseed on load**

In the document-load path (near line 637 where `styleJson` is parsed), set the theme first, then layer style so the saved style still wins:

```ts
const themeId = item.themeId ?? 1;
this.themeId.set(themeId);
const seed = themeStyleSeed(getBuiltinTheme(themeId));
const style: CvStyle = item.styleJson
  ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(item.styleJson) }
  : { ...CV_STYLE_DEFAULT, ...seed };
this.style.set(style);
```

- [ ] **Step 3: Persist `theme_id` on save**

In `save()` (near line 961), include `themeId: this.themeId()` in the upsert input object (alongside `styleJson`, `templateId`).

- [ ] **Step 4: Add `selectTheme` (reseed base tokens, keep overrides)**

```ts
  /** Switch theme: reseed the four base tokens to the theme's defaults but keep
   * the user's explicit per-section overrides, title style, title border, and
   * page geometry. */
  selectTheme(id: number): void {
    this.themeId.set(id);
    const seed = themeStyleSeed(getBuiltinTheme(id));
    this.style.set({ ...this.style(), ...seed });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }
```

- [ ] **Step 5: Apply theme vars on the viewport**

In `cv-detail.component.html`, add `[ngStyle]="themeVars()"` to the `.cvpreview-viewport` element (line ~986):

```html
<div class="cvpreview-viewport" [ngStyle]="themeVars()"></div>
```

- [ ] **Step 6: Var-ize the SCSS with Classic-equal fallbacks**

In `cv-detail.component.scss`, update the `cvpreview__*` rules so each themed property reads a var with a fallback equal to today's value. Key edits:

```scss
.cvpreview__section-title {
  text-transform: var(--cv-section-case, uppercase);
  letter-spacing: var(--tracking-wide);
  padding-bottom: var(--space-2);
  margin: 0 0 var(--space-3);
  // Aurora adds a coloured rule; Classic's width is 0 → invisible.
  border-bottom: var(--cv-section-rule-width, 0pt) solid var(--cv-section-rule-color, transparent);
}
.cvpreview__entry-role {
  font-weight: var(--weight-medium);
  font-style: var(--cv-role-style, normal);
}
.cvpreview__entry-company {
  font-weight: 700;
  color: var(--cv-company-color, inherit);
}
.cvpreview__header {
  // existing rules kept; add the header underline (Classic width 0 → none)
  border-bottom: var(--cv-header-rule-width, 0pt) solid var(--cv-header-rule-color, transparent);
}
```

Note: the section-title colour stays driven by the existing `[ngStyle]="titleCss(key)"` binding — for Classic that is the resolved title colour (unchanged); for Aurora the reseeded teal accent flows through `effectiveTitleStyle` automatically, so no extra var is needed for title colour. Do **not** add a `border-bottom` that double-draws with the existing `[style.borderBottom]="titleBorderCss(key)"`: keep the user title-border binding as the authoritative underline, and gate the theme section-rule so it only applies when the user has **not** set a title border. Simplest: drop the SCSS `border-bottom` on `.cvpreview__section-title` and instead express the Aurora section rule through the existing `titleBorderCss` default path — see Task 4 Step 3 for the reconciled approach. For this task, only add the `font-style`, `company-color`, and header-rule vars (which don't collide), and leave section-title underline exactly as-is.

- [ ] **Step 7: Run existing cv-detail tests, verify still green (Classic unchanged)**

Run: `npx nx test desktop --testPathPattern=cv-detail.component`
Expected: PASS — no regressions; Classic theme produces identical atoms/markup.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss
git commit -m "feat(documents): wire theme vars into cv preview with classic parity"
```

---

## Task 4: Aurora specifics + theme picker UI

**Files:**

- Modify: `cv-detail.component.ts`, `cv-detail.component.html`, `cv-detail.component.scss`, i18n EN + DE resources
- Test: `cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `activeTheme()`, `selectTheme()` (Task 3), `CV_THEMES_BUILTIN` (Task 1).

- [ ] **Step 1: Write the failing render test for Aurora**

In `cv-detail.component.spec.ts`, add a test that sets the Aurora theme and asserts the themed vars + industry rendering. Follow the file's existing harness for building the component and a fixture document (reuse the existing experience-atom test's setup). Assert:

```ts
it('Aurora theme exposes teal accent var and shows industry', async () => {
  // ...load a doc with an experience entry that has industry: 'SaaS'
  component.selectTheme(2);
  fixture.detectChanges();
  const viewport: HTMLElement = fixture.nativeElement.querySelector('.cvpreview-viewport');
  expect(viewport.style.getPropertyValue('--cv-accent')).toBe('#1B7464');
  expect(viewport.style.getPropertyValue('--cv-role-style')).toBe('italic');
  expect(fixture.nativeElement.textContent).toContain('SaaS');
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx nx test desktop --testPathPattern=cv-detail.component -t "Aurora"`
Expected: FAIL — industry not rendered / picker absent.

- [ ] **Step 3: Add the guarded industry span + reconcile the section rule**

In `cv-detail.component.html`, in the `#expHeadTpl` first row, append the industry after the company (Aurora only, and only when present):

```html
<div class="cvpreview__entry-head">
  <span class="cvpreview__entry-company">{{ entry.company }}</span>
  @if (activeTheme().entry.showIndustry && entry.industry) {
  <span class="cvpreview__entry-industry"> - {{ entry.industry }}</span>
  }
  <span class="cvpreview__entry-meta">{{ entry.location }}</span>
</div>
```

Note the flex row currently is `justify-content: space-between`; wrap company+industry in a left group so the location stays right-aligned:

```html
<div class="cvpreview__entry-head">
  <span class="cvpreview__entry-lead">
    <span class="cvpreview__entry-company">{{ entry.company }}</span>
    @if (activeTheme().entry.showIndustry && entry.industry) {
    <span class="cvpreview__entry-industry"> - {{ entry.industry }}</span>
    }
  </span>
  <span class="cvpreview__entry-meta">{{ entry.location }}</span>
</div>
```

Reconcile the section/entry rules in SCSS (Aurora rule appears only when the user hasn't set their own title border — the `titleBorderCss` default already yields a solid border, so Aurora's coloured rule is achieved purely by the reseeded accent colour on the border). Add the entry-head bottom rule (Aurora) and industry colour:

```scss
.cvpreview__entry-industry {
  color: var(--cv-muted, var(--text-tertiary));
}
.cvpreview__entry-head:last-of-type {
  // Aurora draws a thin rule under the role/dates line; Classic width 0.
  padding-bottom: var(--space-1);
  border-bottom: var(--cv-entry-rule-width, 0pt) solid var(--cv-entry-rule-color, transparent);
}
```

- [ ] **Step 4: Make the section-title underline colour follow the theme accent**

The existing `titleBorderCss` returns `var(--border-width) solid var(--border-subtle)`. For Aurora the section rule should be accent-coloured and 0.8pt. Update `titleBorderCss` in `cv-detail.component.ts` to use the theme's section-rule when the user hasn't overridden the border:

```ts
  titleBorderCss(key: CvSectionKey): string {
    const b = effectiveTitleBorder(this.style(), key);
    if (b === 'none') return 'none';
    const sh = this.activeTheme().sectionHeader;
    if (sh.ruleColor !== 'none' && !this.hasExplicitTitleBorder(key)) {
      const color = sh.ruleColor === 'accent' ? 'var(--cv-accent)' : 'var(--cv-muted)';
      return `${sh.ruleWeightPt}pt ${b} ${color}`;
    }
    return `var(--border-width) ${b} var(--border-subtle)`;
  }

  private hasExplicitTitleBorder(key: CvSectionKey): boolean {
    const s = this.style();
    return s.sectionStyles?.[key]?.titleBorder != null || s.titleBorder != null;
  }
```

- [ ] **Step 5: Add the theme picker control**

In `cv-detail.component.html`, add a Theme picker at the top of the Style card (near the existing document-wide style controls). Use the existing select/segmented-control pattern in that card:

```html
<label class="docedit-field">
  <span>{{ 'documents.cv_theme_label' | translate }}</span>
  <select [value]="themeId()" (change)="selectTheme(+$any($event.target).value)">
    <option [value]="1">{{ 'documents.cv_theme_classic' | translate }}</option>
    <option [value]="2">{{ 'documents.cv_theme_aurora' | translate }}</option>
  </select>
</label>
<button
  type="button"
  class="docedit-import-theme"
  disabled
  [title]="'documents.cv_theme_import_soon' | translate"
>
  {{ 'documents.cv_theme_import' | translate }}
</button>
```

- [ ] **Step 6: Add i18n keys (EN + DE)**

Locate the documents i18n block (`grep -rn "cv_style" libs/i18n`), and add, in EN:

```
"cv_theme_label": "Theme",
"cv_theme_classic": "Classic",
"cv_theme_aurora": "Aurora",
"cv_theme_import": "Import theme…",
"cv_theme_import_soon": "Custom theme import is coming soon"
```

DE:

```
"cv_theme_label": "Design",
"cv_theme_classic": "Klassisch",
"cv_theme_aurora": "Aurora",
"cv_theme_import": "Design importieren…",
"cv_theme_import_soon": "Eigene Designs können bald importiert werden"
```

- [ ] **Step 7: Run the Aurora test + full cv-detail suite**

Run: `npx nx test desktop --testPathPattern=cv-detail.component`
Expected: PASS — Aurora test green, Classic tests still green.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/ libs/i18n
git commit -m "feat(documents): add aurora theme rendering and theme picker"
```

---

## Task 5: Verify build + docs sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Full relevant test sweep**

Run: `npx nx test core --testPathPattern=cv-theme.model` → PASS
Run: `npx nx test desktop --testPathPattern=cv-detail.component` → PASS
Run: `cargo test -p applye --manifest-path apps/desktop/src-tauri/Cargo.toml validate_theme` → PASS

- [ ] **Step 2: Production build**

Run: `npx nx build desktop`
Expected: succeeds (SCSS var usage + template changes compile).

- [ ] **Step 3: Update CURRENT_STATE.md**

Add a "Recently completed" bullet describing the theme engine (Classic + Aurora, declarative sandboxed descriptor, `cv_themes` table + `theme_id`, `validate_theme`, preview + print-PDF themed, DOCX/LaTeX/upload/marketplace deferred), linking the spec and this plan.

- [ ] **Step 4: Commit**

```bash
git add docs/product/CURRENT_STATE.md
git commit -m "docs(documents): record cv theme engine in current state"
```

- [ ] **Step 5: Manual desktop gate (user-run, cannot be automated here)**

On a real desktop build: open a CV, switch Theme Classic↔Aurora, confirm the preview updates (teal accent, uppercase ruled section headers, two-line entries with industry + role rule for Aurora), Export-PDF matches the on-screen sheet, and switching keeps any per-section style overrides the user set.

---

## Self-Review

**Spec coverage:**

- Three layers (Template/Theme/Style) → Task 1 types + Task 3 wiring. ✅
- Declarative sandboxed descriptor → Task 1 (`CvThemeDescriptor`, pure data) + Task 2 (`validate_theme`). ✅
- One data-driven renderer, Classic parity → Task 3. ✅
- Preview + print-PDF only (inherited vars) → Task 3 Step 5 (viewport ngStyle). ✅
- Storage `cv_themes` + `theme_id`, back-compat → Task 2. ✅
- `industry?` field → Task 1 Step 1 + Task 4 Step 3. ✅
- Aurora descriptor encodes the .tex → Task 1 `CV_THEME_AURORA` + Task 4 rendering. ✅
- Theme picker + reseed-without-wiping-overrides → Task 3 Step 4 + Task 4 Step 5. ✅
- Testing (resolver/validation/render/pagination) → covered; pagination is protected by keeping the atom structure unchanged (vars-only), verified by the unchanged Classic atom tests. ✅
- Scope boundaries (DOCX/LaTeX/upload/marketplace deferred) → not implemented; `validate_theme` + disabled Import button are the seams. ✅

**Placeholder scan:** No TBD/TODO; every code step carries concrete code. Rust struct edit (Task 2 Step 3) and migration-registry edit (Task 2 Step 2) are grep-guided against an existing identical pattern rather than blind — acceptable because the exact adjacent code is the template.

**Type consistency:** `themeId` (number) consistent across TS model, component, save path; `getBuiltinTheme`/`themeCssVars`/`themeStyleSeed` signatures match Task 1 definitions and Task 3/4 uses; `validate_theme`/`validate_theme_core` names consistent Task 2.

**Known deviation from spec wording:** the spec described `entryLayout: single-line | two-line` as a template branch. During planning the current DOM was found to already render two rows, so the variant collapses to styling vars + a guarded industry span — same visual outcome, lower risk to pagination. Documented here and acceptable.
