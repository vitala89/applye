# CV Builder Wave A — Blocker Bug Fixes — Design

Date: 2026-07-08
Branch: `feat/cv-default-template` (continues Phase 1)
Status: Approved for planning

## Problem

Testing the built desktop app surfaced blockers that make the CV builder
unusable end-to-end. Diagnosed root causes (all confirmed against code):

1. **No personal-details section / no name.** The default `de` template
   resolves to `DE-ATS-modern` (sorts before `DE-traditional`), whose seeded
   `sections_json` omits `personal_details`; 4 of 5 built-in templates omit it.
   `buildCvContent` builds sections strictly from `template.sectionsJson`, so
   the identity section is never created and the preview shows no name.
   (`migrations/0011_documents_library.sql:49-55`,
   `commands/documents.rs:82`, `cv-list.component.ts:239-243,304-308`,
   `cv-content.util.ts:33-49`)
2. **Cannot add Experience/Education entries.** Edit mode only `@for`s existing
   entries; there is no add/remove-entry or add-bullet control and no component
   method for it. Skills/Languages work only because they use a freeform
   textarea. (`cv-detail.component.html:404-471`)
3. **Import throws "AI returned invalid JSON".** `MAX_TOKENS = 2048` is hardcoded
   in the Rust API-mode call (`ai/api.rs:20`, used at `:38` and `:103`), which
   truncates long CV JSON mid-string. `parseCvSkillResponse` has no repair/retry
   and throws. Secondary: `cv-import.md`'s schema is stale vs
   `cv-generate-baseline.md` (missing title/website/linkedin/skillGroups).
4. **Profile → CV.** Wiring is otherwise correct (blocked by #1), but
   `cvToProfileMarkdown` only carries fullName/email/phone/address — never
   title/website/linkedin — so those come back null even with #1 fixed.

## Goals

Make generate + import + manual editing work end-to-end: a generated or
imported CV shows the user's name/title/contact, all sections are editable
(including adding jobs/schools), and import of a real 2-page CV succeeds.

## Non-Goals (later waves)

- Per-section styling (color/font/size/weight per section) + font-weight
  control — **Wave B**.
- Two-pane live layout, inline-bold-by-selection, section visibility toggles,
  page-fit badge, autosave/undo, templates gallery — **Wave C**.
- Threading `CvStyle` into the DOCX/PDF export renderer (export honors style) —
  deferred to the WYSIWYG export phase. Style remains preview-only this wave.

## Design

### F1 — `personal_details` always present

`personal_details` is identity, not layout — it must never depend on a
template's section list.

- **Builder (authoritative):** `buildCvContent` always emits a
  `personal_details` section. If the template's `sectionsJson` omits it, force
  it in as the first section (order 0) and shift the template-ordered sections
  after it. Same guarantee applied on load via a small normalizer so existing
  stored CVs that lack the section gain an (empty) one.
- **Migration `0012`:** `UPDATE cv_templates` for the built-in rows whose
  `sections_json` lacks `personal_details` (DE-ATS-modern, US, UK, generic) to
  prepend `"personal_details"` — fixes "Save as template"/reorder UX and
  existing installs. Idempotent (only updates rows missing the key).

Rationale for both: the builder guarantee fixes content immediately for all
flows; the migration keeps the template layer honest so the section is
reorderable/visible in the editor.

### F2 — Add/remove entries + bullets (Experience/Education)

Component methods on `cv-detail.component.ts`:

- `addEntry(section)` — pushes a blank `CvExperienceEntry`/`CvEducationEntry`.
- `removeEntry(section, index)`.
- `addBullet(entry)` / `removeBullet(entry, index)` (experience only).

Template (`cv-detail.component.html` edit block): a "+ Add experience" /
"+ Add education" button (shown including the empty state), a remove "×" per
entry, and add/remove-bullet controls in each experience entry. Follow existing
edit-control styling. New i18n keys via `libs/i18n`.

### F3 — Import doesn't truncate

- **Configurable output cap:** replace the hardcoded `MAX_TOKENS = 2048` with a
  value carried on the request. Add an optional `maxTokens` to the AI request
  contract (Rust `AiRequest` + the TS `AiService.run` params + the `ai_run`
  command args), applied in both the Anthropic (`:38`) and OpenAI-compatible
  (`:103`) paths. Default when unset: **8192**. The CV generate/import callers
  pass 8192 explicitly.
- **Repair/retry on parse:** `parseCvSkillResponse` gains one automatic retry
  path for the caller: on `JSON.parse` failure after `cleanJsonText`, attempt a
  bounded structural repair (close an unterminated trailing string/array/object
  from a truncated response); if repair still fails, throw the existing clear
  error. The repair is a pure, tested helper (`repairTruncatedJson(raw)`), used
  before giving up. Never wipe existing content on failure (import/generate
  callers already keep prior state on throw — preserve that).
- **Schema sync:** update `cv-import.md`'s output schema + rules to match
  `cv-generate-baseline.md` (add title/website/linkedin, `skillGroups`, keep
  flat `skills`), so import produces the same enriched `CvParsedContent`.

### F4 — Profile → CV

- **Carry the new fields:** extend the onboarding `ParsedCv` personal shape and
  `cvToProfileMarkdown` (`onboarding-content.util.ts`) to emit title / website /
  linkedin into `profile.fullMd` when present, so the generate skill can copy
  them.
- **"Pull from profile" action** in `cv-detail`: a button that regenerates only
  the personal-details fields from the profile via the baseline skill with
  `section: 'personalDetails'`, merging the result into the current
  `personal_details` section (name/title/email/phone/address/website/linkedin).
  Reuses the existing skill/run machinery; guarded like `regenerateSection`
  (needs `profile.fullMd`, shows a spinner, surfaces errors via toast).

## Data Flow (unchanged except where noted)

```
profile.fullMd ─▶ cv-generate-baseline (section: all | personalDetails)
   ─▶ JSON (≤8192 tok) ─▶ parseCvSkillResponse (+repairTruncatedJson)
   ─▶ buildCvContent (personal_details forced first) ─▶ CvContent
Import: file ─▶ Rust extract ─▶ cv-import (synced schema, ≤8192 tok) ─▶ same parse/build
```

## Error Handling

- Truncated/invalid model JSON → `cleanJsonText` → `repairTruncatedJson` → if
  still invalid, throw the existing `AI returned invalid JSON: …` error;
  callers keep prior content (no silent wipe).
- Missing profile on "Pull from profile" → the existing
  `documents.cv_generate_no_profile` error via toast.
- Stored CV lacking `personal_details` → normalized to include an empty one on
  load (no crash, name field editable).
- Migration 0012 is additive/idempotent; never removes a section.

## Testing

- **Unit (TS):** `buildCvContent` forces `personal_details` first when the
  template omits it (and keeps template order otherwise); load-normalizer adds
  an empty personal section to a legacy CV; `repairTruncatedJson` (truncated
  string, truncated array, truncated nested object, already-valid passthrough);
  `parseCvSkillResponse` recovers a truncated fixture via repair;
  `cvToProfileMarkdown` emits title/website/linkedin; add/remove entry+bullet
  mutations produce correct arrays.
- **Rust:** `ai_run`/api call uses the request's `maxTokens` when provided and
  8192 default otherwise (both provider paths); migration 0012 updates the 4
  built-in templates and leaves DE-traditional unchanged (SQL/round-trip test).
- **Component:** add-entry button appears in empty Experience/Education and adds
  an editable entry; remove works.
- **Manual (controller, desktop build):** generate a CV → name/title/contact
  present in preview; import a 2-page PDF → succeeds; add a job manually; "Pull
  from profile" fills identity.

## Phasing (within Wave A, one plan)

1. **F1** — builder guarantee + load-normalizer + migration 0012.
2. **F2** — add/remove entry + bullet UI + methods + i18n.
3. **F3** — configurable maxTokens (Rust + TS) + `repairTruncatedJson` +
   cv-import schema sync.
4. **F4** — profile field carry + "Pull from profile" action.

Each is independently shippable/testable.
