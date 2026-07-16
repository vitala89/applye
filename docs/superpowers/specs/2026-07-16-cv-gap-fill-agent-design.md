# CV Gap-Fill Agent - Design

- **Date**: 2026-07-16
- **Status**: approved (design)
- **Area**: MyJob apply wizard, CV generation (Batch C of the second wizard review)

## Problem

When the wizard generates a tailored CV, it works from whatever the profile /
base CV already contains. If that source is thin (missing tech the job asks
for, vague experience, no language levels), the CV comes out thin too - the
user has no chance to add the missing facts in the moment. The user asked for
an "agentic" step that detects the gaps against the specific job and gathers
the missing information conversationally before generating.

## Decisions (locked with the user)

- **Gap detection: AI-driven.** One AI call compares the base/tailored CV text
  against the job description and returns targeted questions. Not a static
  profile-completeness checklist.
- **Answer destination: this generation + optional save to profile.** Answers
  always feed the CV being generated now; a single "Save to my profile"
  checkbox additionally appends them to the profile so the user is not asked
  again next time.
- **Presentation: overlay panel inside the wizard**, on Create/Regenerate CV
  (step 3, Review Documents). Not a separate modal, not a new route.
- **MVP scope: the full flow** - animated analysis, questions one at a time
  (answer or skip), save-to-profile toggle, then generation that incorporates
  the answers.

## Flow

```
Create / Regenerate CV (step 3)
  → cv-gap-analysis (AI): { cv_text: finalTailoredCvMd, job_description, language }
        → JSON { questions: [{ id, category, question, hint }] }  (0-5, only real gaps)
  → no questions        → generate as today (createCvDraft's cv-import path)
  → questions present    → open CvGapDialog overlay:
        [analyzing animation] → each question (answer textarea / Skip / Next)
        → "Save to my profile" checkbox → Done
  → buildAdditionalInfoBlock(answers) → markdown block of answered items
  → cv-import( finalTailoredCvMd + additionalInfoBlock ) → structured CvContent
        → documentLibraryUpsert (one doc per job, ADR-0003)
  → if saveToProfile: append the block under a heading to profile.fullMd, persist
```

Skipping every question, or closing the dialog, proceeds to generation with no
answers (never blocks the user).

## Components (isolated, each testable)

1. **AI skill `cv-gap-analysis`** - `libs/skills/src/cv-gap-analysis/cv-gap-analysis.md`,
   registered in `apps/desktop/src-tauri/src/ai/skills.rs` (match arm →
   `include_str!`, mirroring `cv-import`). Frontmatter: `version`, `description`,
   inputs (`cv_text`, `job_description`, `language`), `output_format: valid JSON
only`, `recommended_model: claude-haiku-4-5`. Contract: output
   `{ "questions": [ { "id": string, "category": "skill"|"experience"|"language"|"other", "question": string, "hint": string|null } ] }`,
   at most 5, each a real gap the job asks for that the CV does not evidence;
   empty array when the CV already covers the job. No invented facts - it asks,
   it does not answer.

2. **`CvGapDialog` component** - standalone overlay in `pages/jobs`. Inputs:
   `questions`, `analyzing` (bool). Outputs: `submit({ answers: {id, question, answer}[], saveToProfile: boolean })`, `cancel()`. Internal state:
   current question index, per-question answer text. Renders the analyzing
   animation (reuse `.ai-thinking__dots`, gated behind `prefers-reduced-motion`),
   then one question at a time with an answer `<textarea>`, Skip and Next; a
   final review with the save-to-profile checkbox and Generate. Pure UI - no DB,
   no AI; the parent owns the calls.

3. **`buildAdditionalInfoBlock(answers)` pure function** - in
   `pages/documents/cv-content.util.ts` (next to the other CV text helpers).
   Takes the answered items (skips empty answers) and returns a markdown block,
   e.g. `## Additional information\n- Kubernetes: 2 years in production\n- German: B2`.
   Returns `''` when nothing was answered. Unit-tested.

4. **Wiring in `JobsComponent`** - `createCvDraft` gains a pre-step:
   run `cv-gap-analysis`; if it returns questions, open `CvGapDialog` and await
   its result (a promise resolved by the dialog's submit/cancel); build the
   additional-info block; pass `finalTailoredCvMd() + block` as the `cv_text`
   into the existing `cv-import` call. If `saveToProfile`, append the block
   under an `## Additional information` heading to `profile.fullMd` and persist
   via `db.upsertProfile` - append only, never rewriting the whole document
   (the #97 whole-row-replace lesson: read the current profile, add to
   `fullMd`, write all fields back). New signals: `gapAnalyzing`,
   `gapDialogOpen`, `gapQuestions`, `gapDialogResolver`.

## Data shapes

```ts
interface CvGapQuestion {
  id: string;
  category: 'skill' | 'experience' | 'language' | 'other';
  question: string;
  hint: string | null;
}
interface CvGapAnswer {
  id: string;
  question: string;
  answer: string;
}
interface CvGapResult {
  answers: CvGapAnswer[];
  saveToProfile: boolean;
}
```

`parseCvGapResponse(text): CvGapQuestion[]` reuses the JSON-cleaning helpers
already in `cv-content.util.ts` (`cleanJsonText`) and returns `[]` on any
malformed output (fail-open: a bad gap analysis must never block generation).

## Caching, cost, models

- `cv-gap-analysis` runs on `economyModel` and is cached by an input hash of
  `(cv_text, job_description, language)` via `db.hashText`, matching every
  other AI call in the component, so re-opening the same job does not re-spend.
- One extra AI call per Create/Regenerate that finds gaps. When the analysis
  returns no questions, only that one cheap call was spent and generation
  proceeds silently.

## Error handling

- Gap analysis fails or returns junk → `parseCvGapResponse` yields `[]` →
  dialog never opens → generation proceeds unchanged. The feature is additive
  and fail-open.
- Dialog cancelled / all skipped → generate with no answers.
- Save-to-profile write fails → surface the existing `documentReviewStatus`
  error, but the CV was still generated (the profile save is a non-blocking
  extra).

## Testing

- `buildAdditionalInfoBlock`: answered items → block; empties dropped; nothing
  answered → `''`. Mutation-relevant.
- `parseCvGapResponse`: valid JSON → questions; truncated/garbage → `[]`; caps
  at 5.
- Skill registration: a Rust test that `cv-gap-analysis` renders (mirror the
  `every_registered_skill_renders` test added in #94).
- Component: `CvGapDialog` advances through questions, Skip records an empty
  answer, submit emits the collected answers + checkbox state.

## Out of scope (YAGNI)

- No change to the tailoring pass (step 1).
- No free-form chat - a single analysis yields a fixed question set; no
  follow-up-to-the-follow-up.
- No in-dialog profile editing beyond the append toggle.
- Cover letters keep their current generation (this is CV-only, matching the
  request).

## i18n

New EN + DE strings for the dialog: analyzing label, question header, Skip,
Next, Generate, save-to-profile label, the "no gaps" is silent (no string).

## Files touched

- New: `libs/skills/src/cv-gap-analysis/cv-gap-analysis.md`,
  `apps/desktop/src/app/pages/jobs/cv-gap-dialog.component.ts` (+ spec).
- Edit: `apps/desktop/src-tauri/src/ai/skills.rs` (register + test),
  `apps/desktop/src/app/pages/jobs/jobs.component.ts` (wiring + signals + dialog
  in template), `apps/desktop/src/app/pages/documents/cv-content.util.ts`
  (`buildAdditionalInfoBlock`, `parseCvGapResponse`) + its spec,
  `libs/i18n/src/lib/translations/translations.ts`.
