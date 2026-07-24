# Profile name: split into first name and last name

Date: 2026-07-25
Branch: `feat/onboarding-welcome`
Status: approved design, ready for planning

## Problem

The profile carries a single `fullName`. Two consumers need the parts separately:

1. **Generated documents.** Cover letters address the reader and introduce the user; the first
   name alone is the natural form ("I'm Anna"), and application forms have discrete First / Last
   fields.
2. **Job-board form autofill (future).** ATS portals demand discrete first and last name inputs.
   Splitting a display name at fill time, in the browser, with no chance to ask the user, is the
   worst place to guess.

Personalized greetings in the app come free once the split exists.

Because the split feeds outward-facing output, a wrong split is a defect the user sends to an
employer. But Applye augments rather than blocks, so the review step **nudges** and never gates.

A secondary defect is fixed on the way: the same field is labelled "Full name" in onboarding
(`translations.ts:1540`) and "Name" on the profile page (`translations.ts:528`).

## Approach: additive

`fullName` stays the canonical display name and the `# H1` of the profile markdown.
`firstName` and `lastName` are added alongside it, serialized as `- First name:` and
`- Last name:` lines inside `## Contact`. On save, `fullName` is composed as
`` `${first} ${last}`.trim() `` when both parts exist; when they do not, the existing display
name is left as it is.

Rejected alternatives:

- **First/last as the source of truth, `fullName` derived.** Breaks the "H1 is the name" model
  and every CV title generation path. Much more churn for no extra capability.
- **One `fullName` plus a stored split index.** Compact, but unreadable in markdown the user is
  meant to be able to edit by hand, which is the point of the markdown profile.

## Components

### 1. `splitDisplayName` (new, `libs/core`)

Pure function, the single place that guesses a split.

```
splitDisplayName(fullName: string): { firstName: string; lastName: string; confident: boolean }
```

Rules:

- Trim and collapse internal whitespace first.
- Exactly two tokens: `firstName` = first token, `lastName` = second, `confident: true`.
- Any other shape (empty, one token, three or more tokens): best effort split at the last
  whitespace, `confident: false`. A mononym yields `firstName` set and `lastName` empty.

`confident: true` for two tokens only is deliberate. Middle names, compound surnames and
patronymics all produce three or more tokens and all split differently, so the honest answer is
to ask.

Two callers:

- Fallback whenever a parse omits the structured fields (older parses, a provider that ignores
  the new prompt keys).
- Backfill for profiles that predate this change, applied when the profile page loads a profile
  whose Contact block has no First/Last lines.

`parseProfileMd` itself stays a faithful reader and does no deriving, so the round-trip identity
test keeps its meaning.

### 2. Parse contract (`libs/skills/src/cv-import/cv-import.md`, `libs/core/.../document.model.ts`)

`CvParsedContent.personalDetails` gains:

- `firstName: string | null`
- `lastName: string | null`
- `nameSplitConfident: boolean`

`fullName` is unchanged and still required when findable.

The prompt instructs: split the name into given name and family name; when the ordering or the
boundary is not clear (a single token, a mononym, a name written family-name-first, three or more
tokens with no obvious break), set `nameSplitConfident` to false and leave `lastName` null rather
than guessing.

An explicit boolean is used instead of matching text inside `lowConfidenceNotes`. Those notes are
free text in the user's language; matching them is brittle and cannot be tested across locales.
The AI may still add a name note there as well, and the two signals coexist without shared logic.

### 3. Profile markdown (`libs/core/src/lib/profile/profile-markdown.ts`)

- `ProfileForm` and `EMPTY_FORM` gain `firstName: string` and `lastName: string`.
- `CONTACT_FIELDS` and `ContactKey` gain `firstName` ("First name") and `lastName` ("Last name"),
  so the existing `parseContactSection` and `serializeProfileForm` machinery carries them with no
  new parsing code.
- The `# H1` continues to hold the display name.

### 4. Onboarding write path (`onboarding-content.util.ts`)

- `ParsedCv.personalDetails` gains the three new fields.
- `cvToProfileMarkdown` emits `- First name:` and `- Last name:` in the Contact block, following
  the existing Website / LinkedIn pattern.
- `OnboardingCvOverrides` and `applyContactOverrides` carry first and last; the display name for
  the H1 is composed from them.
- `buildOnboardingCvInput` keeps passing the display `fullName` through, so the generated CV
  title is unchanged.

### 5. Onboarding review UI (`onboarding.component.ts` / `.html`)

- `reviewName` is replaced by `reviewFirstName` and `reviewLastName`, seeded from the parse, or
  from `splitDisplayName(fullName)` when the parse did not supply them.
- Two fields replace the single one in the existing `ob__grid-2` grid.
- Confirm nudge, computed as
  `needsNameConfirm = !firstName || !lastName || !nameSplitConfident`:
  both fields take an accent border and one shared note sits beneath them, "We weren't sure how
  to split this, please check." The note clears as soon as either field is edited. Continue is
  never disabled and the note gates nothing.
- The existing `ob__warning-card` is untouched.

### 6. Profile page (`profile.component.ts`)

Two fields, First name and Last name, replacing the single Name field, labelled identically to
onboarding. No confirm nudge here: onboarding review is the confirm moment, and repeating the
prompt on every profile visit would nag users whose name split correctly.

On load, when the parsed form has an empty `firstName` and `lastName` but a non-empty display
name, seed both from `splitDisplayName`.

### 7. i18n (`libs/i18n/src/lib/translations/translations.ts`)

New keys `field_first_name`, `field_last_name` and `name_confirm_hint`, added to `en` and `de`.
The `ru`, `es`, `fr` and `uk` maps are built with `stub(en, ...)` and inherit automatically.
The old `field_name` key is removed from both the onboarding and profile blocks, which retires
the "Full name" versus "Name" inconsistency.

## Data flow

```
CV text
  -> AI parse (firstName, lastName, nameSplitConfident, fullName)
  -> review step (seeded; nudge when not confident; user may edit)
  -> cvToProfileMarkdown (H1 = composed display name; Contact = First/Last)
  -> parseProfileMd -> ProfileForm -> profile page
  -> serializeProfileForm -> markdown  (round-trip identity)
```

The CV document path is a separate branch off the parse and keeps consuming `fullName` only.

## Error handling

- Parse omits the new fields entirely: `splitDisplayName` fills them and the nudge fires, because
  a derived split is by definition unconfirmed.
- Parse returns a `lastName` with no `fullName`: the composed display name is whatever the parts
  produce; an empty result leaves the H1 empty, exactly as today.
- Existing profile with no First/Last lines: backfilled from the H1 on load, then saved back on
  the next save. Nothing is rewritten behind the user's back on read alone.
- Mononym: `lastName` stays empty, the composed display name is the single token, and the nudge
  fires once. The user can leave it empty and continue.

## Testing

Written test first.

`split-display-name.spec.ts`
: table over empty, single token, two tokens, three tokens, hyphenated surname, and surrounding
or repeated whitespace; asserts `confident` is true only for the two-token case.

`profile-markdown.spec.ts`
: First and Last round-trip through `## Contact`; the H1 stays the display name;
`parseProfileMd(serializeProfileForm(form))` equals `form` with the new fields in the fixture.

`onboarding-content.util.spec.ts`
: `cvToProfileMarkdown` emits First and Last and they read back through `parseProfileMd`; the
composed `fullName` matches first plus last; the CV title path is unchanged.

`onboarding.component.spec.ts`
: a low-confidence parse raises the nudge; editing either field clears it; both fields seed from
the parse, and from `splitDisplayName` when the parse omits them; Continue stays enabled in
every case.

Verification: `nx test core`, `nx test desktop`, `nx lint desktop`, `nx build desktop`.

## Out of scope

- Job-board autofill itself. This change only makes the data available to it.
- Middle names, name prefixes and suffixes as separate fields.
- Backfilling existing profiles in a migration. Backfill happens lazily on load.
