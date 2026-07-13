# AI ↔ CV Content Contract

The AI produces **content only**. Style and theme are a separate axis the AI never
writes.

## What the AI produces

Both CV skills — `cv-import` (parse an uploaded CV) and `cv-generate-baseline`
(draft/regenerate from the profile) — return the same JSON shape, `CvParsedContent`
(`libs/core/.../document.model.ts`): `personalDetails` (7 fixed fields), `summary`,
`experience[]`, `education[]`, `skills[]`, `skillGroups[]?`, `languages[]`,
`lowConfidenceNotes[]`. No font, colour, size, weight, accent, or theme field exists
in this shape or in either prompt.

Inline `**bold**` markers inside summary/experience-bullet strings are **content**,
not style — they are semantic emphasis stored in the text and rendered identically in
preview and export. They are the only formatting the AI emits, and they are allowed.

## How the boundary is enforced

1. `parseCvSkillResponse` assembles its result by **explicit field selection** — it
   never spreads the raw parsed object, so any unknown key (a rogue `style`/`theme`/
   `fontFamily`) is dropped at the parse boundary. (`personalDetails` is likewise
   picked field-by-field.)
2. `buildCvContent`/`sectionFor` construct each `CvSection` field-by-field, so even
   entry-level extraneous keys never reach a persisted `CvContent`.
3. Style/theme are stored in separate columns (`style_json`, `theme_id`) written only
   from the editor's local `style`/`themeId` signals in `cv-detail.save()` — never
   from an AI response.

## Rule for future code

Persist AI output **only** through `buildCvContent` / `mergeRegeneratedSection`. Never
write a parsed AI object (or a superset of it) directly to `content_json`, and never
let an AI response feed `style_json` / `theme_id`.
