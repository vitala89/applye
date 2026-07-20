# Profile Structured Editor + AI Raw-Parse - Design

Date: 2026-07-20
Status: Approved (design), pending implementation
Branch: `feat/profile-structured-editor`

## Goal

Bring the Profile editor's Form mode up to the same structured-editing quality as
the CV editor, and make Raw Markdown mode useful for non-technical users by letting
the AI parse free text into the structured form.

Two user-facing outcomes:

1. **Form mode** edits Experience, Skills, and Languages as structured widgets
   (matching the CV editor), each in a collapsible card. Education is already
   structured and stays as-is.
2. **Raw Markdown mode** gains an AI "parse" action: the user types or pastes
   free text, the AI extracts profile fields, shows a preview for verification,
   and on confirmation fills the Form.

## Non-goals

- No migration of Profile storage to a JSON model. Profile stays
  markdown-as-source-of-truth (`Profile.fullMd`).
- No change to the scoring / pitch / profile-compress AI skills.
- No grouped skills (see Decisions).

## Current state (baseline)

- Profile is one markdown string `fullMd`. `ProfileForm` is a parsed view,
  re-serialized to `fullMd` on every keystroke (`parseProfileMd` /
  `serializeProfileForm` in `libs/core/src/lib/profile/profile-markdown.ts`).
- Experience: single free-text `## Experience` textarea (`experienceText`).
- Skills: comma string bound to `skills: string[]`.
- Languages: comma string bound to `languages: string[]` - **no levels**.
- Education: already multi-entry structured via `EducationEntry` +
  `parseEducationEntries` / `serializeEducationEntries` (the pattern to copy).
- Raw mode: plain textarea + a static example scaffold. No AI.
- `ProfileForm.notes` / `.other` are lossless overflow buckets - anything the
  parser cannot place survives a round-trip and is re-emitted under `## Notes`.

## Architecture

Keep markdown as the source of truth. Add per-section parse/serialize helpers in
`profile-markdown.ts`, mirroring the existing Education helpers. The component
keeps a structured signal per section (like `educationEntries`), edits it
immutably, and folds it back into the corresponding `ProfileForm` string field,
which `serializeProfileForm` writes into `fullMd`.

### New types + helpers (`libs/core/src/lib/profile/profile-markdown.ts`)

```
interface ExperienceEntry {
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;   // empty => ongoing ("Present")
  bullets: string[];
}
parseExperienceEntries(experienceText: string): ExperienceEntry[]
serializeExperienceEntries(entries: ExperienceEntry[]): string

interface LanguageEntry { language: string; level: string; }
parseLanguageEntries(languages: string[] | string): LanguageEntry[]
serializeLanguageEntries(entries: LanguageEntry[]): string[]  // back into skills-like list
```

- **Experience markdown shape** (round-trips under `## Experience`):
  `### {role} - {company}` header, optional `{location} · {startDate} - {endDate}`
  meta line, then `- {bullet}` lines. Lenient parse: a legacy free-text block
  becomes one entry with the text as a single bullet (nothing dropped).
- **Languages shape**: stored in the existing `## Languages` list, one item per
  language as `{language} ({level})` (level omitted when empty). `ProfileForm.languages`
  stays `string[]` on disk; the structured `LanguageEntry[]` is a view, so
  `serializeProfileForm` and `profile-compress` are untouched.

`ProfileForm` itself is unchanged (still `experienceText: string`,
`skills: string[]`, `languages: string[]`, `education: string`), so nothing
downstream (scoring, completeness, pitch) changes. The structured editors are a
UI-layer view folded back into those string/array fields - identical strategy to
Education today.

## Section designs

### Experience (structured, like CV)

Card list of positions. Each position: `role`, `company`, `location`,
`startDate`, `endDate` inputs + a nested bullet list (add / remove / edit).
Immutable update methods copied from `cv-experience-editor.component.ts`.
Replaces the current single textarea. Backed by an `experienceEntries` signal,
folded into `form().experienceText` via `serializeExperienceEntries`.

### Skills (flat chips, CV input style)

Type + Enter adds a chip; X removes it. Same interaction as the CV skills
editor, but a **flat `string[]`** with no labeled groups. Backed directly by
`form().skills`.

### Languages (language + level)

Rows of `language` input + `level` select. Levels: `['', 'A1', 'A2', 'B1', 'B2',
'C1', 'C2', 'Native']` (matching `cv-languages-editor`). Backed by a
`languageEntries` signal, folded into `form().languages` via
`serializeLanguageEntries`.

### Education (unchanged)

Already structured. Leave as-is; just wrap it in the same collapsible card shell
as the others for visual consistency.

### Collapsible shell

Experience / Skills / Languages / Education each become a collapsible card:
header with chevron + a summary chip (e.g. "3 positions", "12 skills",
"2 languages", "1 degree"). Basic fields (name, title, location, email, phone,
website, linkedin) stay always visible at the top. Reuse the existing chevron
toggle pattern from the AI Tools cards.

- **Default open state**: collapsed when the section has content, expanded when
  empty (invites filling). Implemented as a per-section `open` signal seeded on
  load and when leaving raw mode.

### Raw Markdown - AI parse

- Keep the textarea and the static example scaffold.
- Add a **"Parse text"** button (Sparkles icon) below the textarea.
- Flow: click -> AI parses the free text -> an inline preview panel shows the
  recognized fields (name, contacts, website, linkedin, experience, skills,
  languages, education) + low-confidence notes -> an **"Apply to form"** button
  fills `ProfileForm` and switches to the Form tab. Never auto-applies.
- Disabled while parsing / empty text. Loading dots consistent with existing AI
  tool cards. Errors surfaced via the existing toast + status pattern.

### New AI skill (`libs/skills/src/profile-import/profile-import.md`)

Modeled on `cv-import`:

- Input: free profile text + output language.
- Output: valid JSON only, mapping to the profile fields (name, title, location,
  email, phone, website, linkedin, experience[], skills[], languages[{language,
  level}], education[], lowConfidenceNotes[]).
- Structure detection only - no rewriting or inventing. Ligature-repair rule
  reused from cv-import.
- Recommended model: `claude-haiku-4-5`. Cached by input-text hash (same
  hashing the scoring/pitch flows use) so re-parsing the same text never
  re-spends tokens.

## Data flow

```
Raw text --(Parse button)--> profile-import skill (AI) --> JSON preview
   --(Apply)--> ProfileForm (+ structured section signals) --> serializeProfileForm --> fullMd --(Save)--> DB

Form edits --> section signals --> ProfileForm string/array fields --> serializeProfileForm --> fullMd
Load / leave-raw --> parseProfileMd + per-section parse helpers --> section signals
```

## Error handling

- AI parse failure: toast + inline status, form untouched, raw text preserved.
- Malformed AI JSON: reuse the tolerant JSON-extraction approach from
  `parseScoringJson` (strip code fences, `JSON.parse`, null on failure) - on
  null, show a "could not parse" status and do not clear the form.
- Lossless guarantee preserved: `notes` / `other` buckets still catch anything
  the structured parse cannot place.

## Testing

- Unit tests in `profile-markdown.spec.ts` for each new helper: round-trip,
  legacy free-text input, empty, and edge cases (missing dates, ongoing role,
  language without level, bullet-only experience).
- Component: the new editors render and mutate the form; typecheck + eslint
  clean on changed files; run `core` and `desktop` test suites.
- Manual verification of the raw-parse preview -> apply flow via the desktop
  preview.

## i18n

New EN + DE keys for: section headers/summaries, experience field labels + add
buttons, language level labels, the Parse/Apply buttons, preview panel labels,
and low-confidence-note display. Follow the recent multi-entry-education key
pattern.

## Decisions (resolved)

- **Experience granularity**: full CV-style (role / company / location / dates +
  bullets). [confirmed]
- **AI parse UX**: preview then apply (like cv-import), no auto-apply. [confirmed]
- **Scope**: one branch / one PR for all of it. [confirmed]
- **Skills**: flat chips, no labeled groups - keeps the `## Skills` markdown
  format and `profile-compress` untouched. [author decision, accepted]
- **Storage**: markdown-as-source-of-truth, no JSON migration. [author decision]

## Risks

- Experience markdown round-trip is the trickiest helper (must not lose legacy
  free-text). Mitigated by the lenient parse + a bullet-only fallback entry, and
  covered by round-trip tests.
- Languages model change (string list -> language+level view) must stay
  backward-compatible with existing comma-separated profiles. Covered by a
  legacy-input test.
