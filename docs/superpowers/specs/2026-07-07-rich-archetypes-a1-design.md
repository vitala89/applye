# Rich Archetypes (A1) + Profile Page Redesign (Claude Design 1A)

**Date:** 2026-07-07
**Status:** Approved design, ready for implementation planning
**Depends on / follows:** the merged human-friendly Profile UI (`fullMd` structured form + ScoringSummaryComponent). This slice enriches the `targetArchetypes` field **and** restyles the whole Profile page per Claude Design option 1A ("Guided single-column · completeness-first").
**Design source:** Claude Design project `a5c47cb7-31a0-4838-836f-49283055e65b`, file `Profile Redesign.dc.html`, option **1A**.

## Problem

Applye's "Target roles" are stored as a flat `string[]` (JSON in `Profile.targetArchetypes`). A reference tool (Career-Ops) models each archetype as a richer object with `fit` (primary/secondary/adjacent) and `sell_when` (when this role matches a JD). That richer shape serves two applye jobs at once:

- **Sharper off-target filtering** — `fit` gives weight to the 0-token pre-scoring flag.
- **Tailoring context** — `sell_when` gives the AI "when does this role fit" context for scoring/pitch.

This slice (A1) delivers the data model, backward-compatible migration, and the editor UI. Feeding `sell_when` into the AI scoring/pitch prompts is a separate follow-up slice (A2), out of scope here.

## Non-Goals

- No database schema change. `targetArchetypes` stays a JSON string column.
- No Rust change. The `check_archetype_match` (0-token filter) keeps receiving a JSON `string[]` of archetype **names**.
- No AI-prompt wiring for `sell_when` (that is slice A2).
- No multi-track selection mechanics (slice E, backlog). No `track`/`level` fields.

## Decisions (from brainstorming)

| Decision        | Choice                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| First scope     | A only (rich archetypes); B/C/D/E to backlog                                                 |
| Purpose         | Both — sharper filter (`fit`) + tailoring context (`sell_when`)                              |
| Object shape    | `name` + `fit` + `sellWhen` (no `track`/`level`)                                             |
| Slice split     | A1 = model + migration + editor UI + keep filter working; A2 (scoring/pitch wiring) deferred |
| Rust filter     | Untouched — client extracts names → passes existing `string[]` JSON                          |
| Migration       | Lazy — backward-compatible parse; re-serialized as objects on next save                      |
| Page layout     | Adopt Claude Design 1A (completeness-hero-first single column) in this same plan             |
| Hero vs summary | Hero owns completeness+gaps; ScoringSummary keeps strengths + AI-notes + raw JSON            |
| Icons           | `lucide-angular` (already a dependency) for the profile page                                 |

## Architecture

`targetArchetypes` remains a JSON string. A pure util converts between that JSON and a typed `Archetype[]`, tolerating the legacy `string[]` shape. All consumers that need plain names go through a `archetypeNames()` helper, so the Rust filter and CV-tag derivation see the same `string[]` contract they see today.

```
targetArchetypes (JSON string, stored)
  ──parseArchetypes──▶  Archetype[]  ──serializeArchetypes──▶  JSON string
                              │
                              └─archetypeNames──▶ string[]  (Rust filter, cv tag)
```

### Types (new)

```ts
export type ArchetypeFit = 'primary' | 'secondary' | 'adjacent';
export interface Archetype {
  name: string;
  fit: ArchetypeFit;
  sellWhen: string;
}
```

### Pure util — `libs/core/src/lib/profile/archetype.ts` (new, no Angular)

- `parseArchetypes(json: string | null | undefined): Archetype[]`
  - Accepts legacy `["Senior FE", ...]` → each becomes `{ name, fit: 'primary', sellWhen: '' }`.
  - Accepts new `[{ name, fit, sellWhen }]`; coerces missing `fit` to `'primary'`, missing `sellWhen` to `''`, invalid `fit` to `'primary'`.
  - Never throws; malformed/empty → `[]`.
- `serializeArchetypes(list: Archetype[]): string`
  - `JSON.stringify` of objects, dropping entries whose `name` is blank after trim.
- `archetypeNames(list: Archetype[]): string[]`
  - Maps to trimmed non-empty `name`s.

### Editor UI — `apps/desktop/src/app/pages/profile/profile.component.ts` (modify)

- The archetype signal changes from `signal<string[]>` to `signal<Archetype[]>`.
- Each archetype renders as a small card: `name` text input, `fit` `<select>` (Primary / Secondary / Adjacent), `sellWhen` textarea (label + hint "when does this role fit — helps AI"), and a remove button. Add button appears while length < 5.
- `addArchetype()` pushes `{ name: '', fit: 'primary', sellWhen: '' }`.
- `updateArchetype(index, patch)` merges a partial into the entry.
- `archetypesDirty` compares the serialized signal against the stored value via `parseArchetypes`.
- `save()` serializes via `serializeArchetypes`.

### Consumers kept working

- `jobs.component.ts` `checkArchetypeMatch(title, jdText, archetypesJson)` — pass `JSON.stringify(archetypeNames(parseArchetypes(profile()?.targetArchetypes)))`. The Rust command still receives a JSON `string[]`; no Rust change.
- `jobs.component.ts` `hasArchetypes()` — `parseArchetypes(...).length > 0`.
- `cv-list.component.ts` archetype-tag derivation — replace the legacy `(targetArchetypes ?? '').split(',')[0]` (which mis-parses a JSON string) with `archetypeNames(parseArchetypes(targetArchetypes))[0] ?? ''`. This corrects a pre-existing bug in code this slice already touches.
- `onboarding.component.ts` — the `onboarding-archetypes` skill still returns `string[]`; wrap its output through the legacy parse path (strings → `{name, fit:'primary', sellWhen:''}`) and save via `serializeArchetypes`. The onboarding skill itself is unchanged.

### i18n (en + de, symmetric)

New keys: `profile.archetype_name`, `profile.archetype_fit`, `profile.fit_primary`, `profile.fit_secondary`, `profile.fit_adjacent`, `profile.archetype_sell_when`, `profile.archetype_sell_when_hint`. Reuse existing `section_archetypes`, `add_archetype`, `remove_archetype`, `archetype_placeholder`.

## Page Redesign (Claude Design 1A)

Option 1A is a single-column, completeness-first Profile page. Section order:
**completeness hero → target roles → markdown profile → AI tools (scoring, pitch)**.
It uses `lucide-angular` icons (already a project dependency) and applye's existing
CSS tokens (`--accent`, `--surface-sunken`, etc. — the mockup already references them).

### Completeness hero (new component — `completeness-hero.component.ts`)

Top-of-page card:

- Circular SVG progress ring (radius 44, `stroke-dasharray` driven by `completeness`),
  with `{{completeness}}%` centered.
- Name + subtitle (`seniority · location · domain` — from the scoring profile / form).
- Open-gaps row: for each missing field, a pill button (`lucide` `plus` + label) that
  emits `addField(key)` → parent focuses/scrolls to that form field (reuses the existing
  `focusField` handler and `missingFields`/`profileCompleteness` from `@applye/core`).
- Done state: when no gaps, show a `badge-check` icon + "Profile complete — AI matching
  is at full strength."

Inputs: `completeness: number`, `gaps: ProfileFieldKey[]`, `name`, `subtitle`.
Output: `addField: EventEmitter<ProfileFieldKey>`.

### ScoringSummaryComponent reduction (reconciliation)

To avoid duplicating completeness+gaps between the hero and the AI-tools scoring card,
the hero **owns** the completeness ring and the gap add-buttons. `ScoringSummaryComponent`
**drops** its completeness bar and its gaps list, and keeps only: header line, **Strengths**
chips, **AI notes** (`red_flags`), and the raw-JSON toggle. Its `completeness`/`gaps`/`onAdd`
members and the `addField` output are removed; the `form` input is no longer needed there.
(The 1A mockup literally shows gaps in both places — this spec intentionally deviates to keep
completeness in one place.)

### Target roles within 1A

The 1A mockup renders target roles as flat text chips. This spec supersedes that with the
A1 **rich archetype cards** (name + fit + sell_when), styled to match 1A's card chrome
(`target` lucide icon, remove `x` button, "Add role" button with `plus`). A1 data governs;
1A governs the surrounding page chrome.

### Icons & layout

- Replace the profile page's hand-rolled inline info SVG and text glyphs with
  `lucide-angular` icons where 1A uses them (`info`, `target`, `x`, `plus`, `sparkles`,
  `refresh-cw`, `check`, `triangle-alert`, `badge-check`).
- Markdown-profile form field grouping follows 1A: Name; then Current role + Location on
  one row; Experience; then Skills + Languages on one row; then Education.

### Out of scope (page redesign)

- The global **sidebar** nav-icon restyle shown in the 1A mockup — it is the shared app
  shell used by every page, not the Profile page. Separate effort.
- Options 1B (sticky AI rail) and 1C (in-page section nav) from the design file.

## Data flow

- **Load:** `getProfile()` → `parseArchetypes(fullProfile.targetArchetypes)` populates the editor signal (legacy strings auto-wrapped).
- **Edit:** field edits update the `Archetype[]` signal.
- **Save:** `serializeArchetypes(signal)` → stored `targetArchetypes`. Legacy profiles thus migrate to object form on first save.
- **Filter:** jobs flow extracts names → existing Rust `check_archetype_match` contract.

## Error handling

- `parseArchetypes` never throws; malformed JSON or non-array → `[]`; non-object / non-string entries skipped.
- Blank-name archetypes are dropped on serialize so they never reach the filter or storage.

## Testing

- **archetype.spec.ts:** legacy `string[]` → objects with defaults; new object round-trip; mixed legacy+object array; missing/invalid `fit` coerced to `primary`; malformed/empty/null → `[]`; `archetypeNames` trims and drops blanks; `serializeArchetypes` drops blank-name entries.
- **profile.component:** `archetypesDirty` reflects edits; save serializes the object shape; add/remove/update field mutate the signal correctly.
- **jobs.component:** `checkArchetypeMatch` receives a JSON `string[]` of names (contract preserved); `hasArchetypes` true/false.
- **completeness-hero.component:** ring dash reflects `completeness`; renders one gap pill per `gaps` entry; `addField` emits the clicked key; done-state when `gaps` empty.
- **scoring-summary.component:** after reduction, renders strengths chips + AI-notes + raw-JSON toggle; no longer renders a completeness bar or gaps list (update/trim the existing spec accordingly).

## Out of scope / future

- A2: feed `sell_when` (and `fit` weighting) into the AI scoring/pitch prompts.
- B: structured compensation. C: structured eligibility (visa/timezone/onsite). D: structured proof points. E: multi-track selection mechanics (`track`/`level`).
