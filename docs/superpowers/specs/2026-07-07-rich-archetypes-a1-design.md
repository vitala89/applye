# Rich Archetypes — Slice A1 (data + migration + editor UI)

**Date:** 2026-07-07
**Status:** Approved design, ready for implementation planning
**Depends on / follows:** the merged human-friendly Profile UI (`fullMd` structured form). This slice enriches the separate `targetArchetypes` field.

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

| Decision     | Choice                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| First scope  | A only (rich archetypes); B/C/D/E to backlog                                                 |
| Purpose      | Both — sharper filter (`fit`) + tailoring context (`sell_when`)                              |
| Object shape | `name` + `fit` + `sellWhen` (no `track`/`level`)                                             |
| Slice split  | A1 = model + migration + editor UI + keep filter working; A2 (scoring/pitch wiring) deferred |
| Rust filter  | Untouched — client extracts names → passes existing `string[]` JSON                          |
| Migration    | Lazy — backward-compatible parse; re-serialized as objects on next save                      |

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

## Out of scope / future

- A2: feed `sell_when` (and `fit` weighting) into the AI scoring/pitch prompts.
- B: structured compensation. C: structured eligibility (visa/timezone/onsite). D: structured proof points. E: multi-track selection mechanics (`track`/`level`).
