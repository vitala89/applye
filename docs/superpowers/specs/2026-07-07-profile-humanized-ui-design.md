# Profile — Human-Friendly UI (v1)

**Date:** 2026-07-07
**Status:** Approved design, ready for implementation planning
**Component:** `apps/desktop/src/app/pages/profile/profile.component.ts`

## Problem

The Profile page exposes two developer-oriented surfaces that are intimidating to
non-technical users:

1. **Markdown editor** — a raw `<textarea>` where the user writes their profile in
   Markdown (`#`, `##` section markers).
2. **Scoring profile** — a raw JSON blob rendered in a `<pre>` block
   (`{ "years_exp": null, "red_flags": [...] }`). This is the worst offender: it
   looks like an error and hides genuinely useful information (the `red_flags`
   array is effectively "what to improve").

The Default pitch section is already prose and needs no change. Target roles
(archetypes) are already friendly chip-inputs and need no change.

Goal: one unified, friendly UX for **all** users (not a separate "simple mode"),
with a Raw/technical escape hatch retained for power users.

## Non-Goals

- No database schema change. `fullMd` and `scoringJson` remain the stored fields.
- No change to any AI call contract — `fullMd` stays the source of truth fed to
  `profile-compress` and `pitch`.
- No repeatable structured Experience entries in v1 (see Decisions).
- No AI-driven completeness scoring in v1 (see Decisions).

## Decisions (from brainstorming)

| Decision              | Choice                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                 | Replace both raw MD editing and JSON display with friendly UI                                                                                                |
| MD contract           | Structured fields are the primary editor; serialize to `fullMd` on save. A **Raw Markdown** toggle remains the escape hatch and handles non-parsing content. |
| Scoring display       | Variant A — summary card: completeness bar + strengths chips + "what to improve" list                                                                        |
| Completeness % source | Derived **locally** from filled form fields (deterministic, 0 tokens, live). Strengths/gaps still read from AI `scoringJson`.                                |
| Experience field      | Single free-form `<textarea>` inside the Experience card (v1).                                                                                               |
| Overall layout        | Direction A — stacked section cards, "AI view" summary below.                                                                                                |

## Architecture

Two UI layers added on top of unchanged data. No new persistence.

```
fullMd (stored, source of truth)  ──parse──▶  ProfileForm (signals, edited via fields)
                                  ◀─serialize──
scoringJson (stored, AI output)   ──parse──▶  ScoringProfile ──▶ "How AI sees you" card
```

### Component / file decomposition

`profile.component.ts` is already 789 lines. Extract to keep units focused:

1. **`libs/core/src/lib/profile/profile-markdown.ts`** (new, pure, no Angular)
   - Types: `ProfileForm` (`name, title, location, experienceText, skills: string[], education, languages: string[], other`).
   - `parseProfileMd(md: string): ProfileForm` — best-effort section parse.
   - `serializeProfileForm(form: ProfileForm): string` — canonical Markdown out,
     matching the existing scaffold (`# Name · Title · Location`, then
     `## Experience`, `## Skills`, `## Education`, `## Languages`).
   - `+ profile-markdown.spec.ts`.

2. **`apps/desktop/src/app/pages/profile/scoring-summary.component.ts`** (new, presentational)
   - Inputs: `scoringJson: string | null`, `form: ProfileForm` (for completeness %).
   - Output: `addField` event (which gap the user clicked "add" on) so the parent
     can scroll/focus the relevant field.
   - Tolerant JSON parse: malformed `scoringJson` falls back to showing the raw
     `<pre>` block (never throws, never blank).
   - Renders: header (name · seniority · location), completeness bar, strengths
     chips (`skills` + `seniority` + `domains`), "what to improve" list from
     `red_flags`, and a `▸ Show technical data (JSON)` toggle revealing the
     existing `<pre>` pretty-printed JSON.
   - `+ scoring-summary.component.spec.ts`.

3. **`profile.component.ts`** (modified)
   - Holds `ProfileForm` as signals plus a `rawMode` signal.
   - `Form / Raw MD` toggle. On Raw→Form switch, re-parse `fullMd`; on Form→Raw
     switch (and on save), serialize form → `fullMd`.
   - `dirty` continues to compare serialized `fullMd` against stored value.
   - Renders section cards (Identity, Experience, Skills, Education, Languages)
     and embeds `<app-scoring-summary>`.
   - Handles `addField` by focusing/scrolling to the matching field.

### Completeness calculation

Pure function (in `profile-markdown.ts` or a sibling util): weight the presence of
each core field (`title`, `location`, `experienceText`, `skills`, `education`,
`languages`) and return an integer percentage. Deterministic; recomputed on every
form edit; no AI call.

## Data flow

- **Load:** existing `getProfile()` → `parseProfileMd(fullMd)` populates form
  signals; `scoringJson` passed to summary component.
- **Edit (Form mode):** field edits update form signals; completeness recomputes
  live; `fullMd` is derived on demand via `serializeProfileForm`.
- **Toggle Raw:** binds the raw `fullMd` textarea (current behavior).
- **Save:** serialize form → `fullMd`, then existing `upsertProfile` path.
  `scoringJson` / `scoringHash` / `pitchMd` / `targetArchetypes` unchanged.
- **Generate scoring/pitch:** unchanged — still operate on `fullMd`.

## Error handling

- `parseProfileMd` never throws; unrecognized content is preserved in a `other`
  bucket and re-appended on serialize so no user text is ever lost.
- Malformed `scoringJson` → summary component falls back to the raw JSON `<pre>`.
- Existing toast + inline status error handling for save/generate is retained.

## i18n

New EN + DE keys (symmetric), e.g.: field labels (`profile.field_name`,
`field_title`, `field_location`, `field_experience`, `field_skills`,
`field_education`, `field_languages`), `profile.mode_form`, `profile.mode_raw`,
`profile.ai_view_title`, `profile.strengths`, `profile.improve`,
`profile.add_field`, `profile.completeness`, `profile.show_json`. Reuse existing
keys where present.

## Testing

- **profile-markdown.spec.ts:** `parse(serialize(x)) === x`; `serialize(parse(md))`
  stable/idempotent; unknown content round-trips through `other`; empty input.
- **scoring-summary.component.spec.ts:** renders chips + gaps from valid JSON;
  malformed JSON shows raw fallback; empty `scoringJson` shows generate/empty
  state; `addField` emits correct field key.
- **completeness:** 0% empty, 100% all filled, monotonic as fields fill.
- **profile.component:** Form↔Raw toggle preserves content; save serializes
  expected Markdown.

## Out of scope / future

- Repeatable structured Experience entries.
- AI-computed completeness/quality score.
- WYSIWYG Markdown rendering.
