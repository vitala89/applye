# Handoff: split profile name into first + last (Batch B)

Paste the "Prompt for the new session" block below into a fresh Claude Code session.
Everything it needs is here; no need to re-investigate.

---

## Prompt for the new session

> Work on the Applye desktop app (Nx monorepo, Tauri 2 + Angular). Continue on the
> existing branch **`feat/onboarding-welcome`** (do NOT branch from main - the user
> chose to keep this work on that branch). Repo: the `applye` working copy on the maintainer's machine.
>
> **Task:** split the profile "name" into **first name + last name**, with a
> **confirm-when-unsure** step: when the resume parse cannot confidently split the
> name, the onboarding review must ask the user to confirm/edit it (nudge, never
> hard-block - the app's augmentation principle).
>
> This is creative UI + a data-model change, so: run `superpowers:brainstorming`
> for the confirm-UX first, then `superpowers:writing-plans`, then implement
> test-first (`superpowers:test-driven-development`). Read `AGENTS.md` +
> `docs/product/CURRENT_STATE.md` and do the Plan Check. House rule: **no em/en
> dashes** anywhere (plain hyphen only). Conventional Commits, no attribution
> trailers. Verify with `nx test desktop` + `nx test core` and the frontend gate.
>
> First housekeeping: **remove the temporary "Restart (dev)" button** left in the
> tree - it is uncommitted in `apps/desktop/src/app/layout/shell-layout.component.html`
> (a `<button appButton variant="danger" size="sm" ... (click)="devRestart()">Restart (dev)</button>`
> inside `.topbar__actions`, marked `TEMP DEV`) and its handler `devRestart()` in
> `shell-layout.component.ts` (also marked `TEMP DEV`). Delete both, or commit them
> as a throwaway and revert - the user will confirm which.

## Recommended design (additive - lowest breakage)

The CV document and the profile markdown `# <name>` H1 both need a single display
name (the CV title). **Keep `fullName` as the canonical display name** and ADD
structured `firstName` / `lastName` alongside it. On save, compose
`fullName = "${first} ${last}".trim()` when both exist.

Alternative (make first/last the source of truth and derive fullName) is more
invasive - it breaks the "H1 is the name" model and CV title generation. Prefer
additive unless brainstorming surfaces a strong reason.

## Files + layers to change

1. **AI extraction prompt** - `libs/skills/src/cv-import/cv-import.md`
   - Add `firstName` + `lastName` to the `personalDetails` it extracts (keep
     `fullName`). Instruct: when the name cannot be confidently split (single
     token, non-Latin ordering, mononym), leave `lastName` empty and add a
     `lowConfidenceNotes` entry so the UI knows to ask.

2. **Parsed model** - `libs/core/src/lib/models/document.model.ts`
   - `CvParsedContent.personalDetails`: add `firstName: string | null;`
     `lastName: string | null;` (keep `fullName`).

3. **Profile model + markdown** - `libs/core/src/lib/profile/profile-markdown.ts`
   - `ProfileForm` (+ `EMPTY_FORM`): add `firstName: string; lastName: string;`
   - `CONTACT_FIELDS` + `ContactKey`: add `firstName` (label "First name") and
     `lastName` (label "Last name") so `## Contact` serializes/parses them via the
     existing `parseContactSection` / `serializeProfileForm` machinery. Keep the
     `# <name>` H1 as the composed display name.
   - Decide in serialize: `name` H1 stays the display name; first/last live in
     Contact. Round-trip test must hold (`parseProfileMd(serializeProfileForm(f))`
     `.toEqual(f)`), so add first/last to that fixture.

4. **Onboarding profile-write path** - `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts`
   - `ParsedCv.personalDetails`: add `firstName` / `lastName`.
   - `cvToProfileMarkdown`: emit `- First name:` / `- Last name:` in the Contact
     block (reuse the same pattern as Website/LinkedIn).
   - `OnboardingCvOverrides` + `applyContactOverrides`: the review step now edits
     first + last (see step 5), so overrides carry them; compose `fullName` from
     them for the H1/label.

5. **Onboarding review UI** - `apps/desktop/src/app/core/onboarding/onboarding.component.ts` + `.html`
   - Replace the single "Full name" field (`onboarding.preview.field_name`) with
     two: First name + Last name. Seed from the parse.
   - **Confirm nudge:** when the parse flagged low confidence on the name (empty
     `lastName`, or a matching `lowConfidenceNotes` entry), show a subtle "Please
     confirm your name" hint on those fields. Nudge, do not block Continue.
   - `reviewOverrides()` / `reviewName()` signals: split into `reviewFirstName` /
     `reviewLastName`.

6. **Profile page form** - `apps/desktop/src/app/pages/profile/profile.component.ts`
   - Two fields (First name / Last name) instead of one "Name". Align the label
     with onboarding (this also resolves the old "Full name" vs "Name"
     inconsistency the user reported).

## Contract facts (already verified, do not re-investigate)

- `parseProfileMd` / `serializeProfileForm` are the canonical reader/writer
  (`profile-markdown.ts`). Contact lines are `- Label: value`, parsed
  case-insensitively via `CONTACT_FIELDS`.
- `cvToProfileMarkdown` (onboarding-content.util.ts) is a parallel writer that
  must match what `parseProfileMd` reads - keep them in lockstep; the round-trip
  test in `onboarding-content.util.spec.ts` is what holds them together.
- CV document path (`buildOnboardingCvInput`) spreads the full parse - keep the
  display `fullName` flowing there so the generated CV title is unchanged.

## Tests to write (test-first)

- `profile-markdown.spec.ts`: Contact round-trips first/last; H1 stays the display
  name; `serializeProfileForm`->`parseProfileMd` identity includes the new fields.
- `onboarding-content.util.spec.ts`: `cvToProfileMarkdown` emits First/Last and
  they read back via `parseProfileMd`; `fullName` composed from first+last.
- `onboarding.component.spec.ts` (if it covers review state): low-confidence name
  triggers the confirm hint; both fields seed from the parse.

## State of the branch at handoff

- `feat/onboarding-welcome`, based on clean `origin/main` (dd44390).
- Committed and green (`nx test desktop` = 647): topbar buttons on the design
  system, footer spacing, animated welcome (Claude Design choreography), banned
  em/en dashes removed, dashboard side-stripe + profile header wrap, and the
  onboarding->profile sync fixes (website/linkedin/education/languages/salary +
  role-vs-company + dateless "Present").
- Uncommitted: only the temp "Restart (dev)" button (remove it - see the prompt).
- Design reference lives in Claude Design project `08d869cc-82ee-4d98-a8be-20fa48f0a838`
  (file `Welcome.dc.html`); the welcome is already implemented from it.
