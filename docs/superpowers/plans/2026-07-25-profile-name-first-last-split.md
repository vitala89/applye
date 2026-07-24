# Profile Name First/Last Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the profile name as first name plus last name alongside the existing display name, and have the onboarding review step ask the user to confirm the split when the resume parse was not sure about it.

**Architecture:** Additive. `fullName` stays the canonical display name and the `# H1` of the profile markdown; `firstName` and `lastName` are new `## Contact` lines carried by the existing `CONTACT_FIELDS` machinery. A pure `splitDisplayName` helper is the single place that ever guesses a split, and it runs inside `parseCvSkillResponse` so every parsed CV arrives with the fields populated. The onboarding review step nudges when the split is unconfirmed and never blocks.

**Tech Stack:** Nx monorepo, Angular 20 standalone components with signals, Vitest, TypeScript, Tauri 2.

**Design spec:** `docs/superpowers/specs/2026-07-25-profile-name-first-last-split-design.md`

## Global Constraints

- **Branch:** work stays on `feat/onboarding-welcome`. Do not branch from `main`.
- **No em dashes or en dashes** anywhere: not in code, comments, commit messages, docs, or UI strings. Banned: `—` (U+2014), `–` (U+2013). Allowed: `-` (U+002D). This applies to every file this plan touches.
- **Commits:** Conventional Commits. No `Co-Authored-By:`, no `Generated with`, no attribution or agent trailer of any kind. The commit message ends with its last body paragraph.
- **Test first.** Every task writes the failing test, runs it and sees it fail, then implements.
- **The confirm nudge never gates.** The Continue button in onboarding review must stay enabled in every case.
- **`parseProfileMd` stays a faithful reader.** It never derives or guesses; the round-trip identity `parseProfileMd(serializeProfileForm(f)) === f` must keep holding.
- Run commands from the repo root `/Users/eugenekasap/WebstormProjects/applye`.

## File Structure

| File                                                                               | Responsibility                                                                        | Task |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| `libs/core/src/lib/profile/split-display-name.ts`                                  | new. The only place that guesses a first/last split.                                  | 1    |
| `libs/core/src/lib/profile/split-display-name.spec.ts`                             | new. Table test for the splitter.                                                     | 1    |
| `libs/core/src/index.ts`                                                           | export the new module.                                                                | 1    |
| `libs/core/src/lib/profile/profile-markdown.ts`                                    | `ProfileForm`, `EMPTY_FORM`, `CONTACT_FIELDS`, `ContactKey` gain first/last.          | 2    |
| `libs/core/src/lib/profile/profile-markdown.spec.ts`                               | Contact round-trip covers the new fields.                                             | 2    |
| `libs/core/src/lib/models/document.model.ts`                                       | `CvParsedContent.personalDetails` gains the three optional fields.                    | 3    |
| `apps/desktop/src/app/pages/documents/cv-content.util.ts`                          | `parseCvSkillResponse` fills the fields, falling back to `splitDisplayName`.          | 3    |
| `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`                     | Parser fallback tests.                                                                | 3    |
| `libs/skills/src/cv-import/cv-import.md`                                           | AI prompt asks for the split and the confidence flag.                                 | 3    |
| `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts`                  | `ParsedCv`, `cvToProfileMarkdown`, `OnboardingCvOverrides`, `applyContactOverrides`.  | 4    |
| `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts`             | Round-trip through `parseProfileMd`.                                                  | 4    |
| `libs/i18n/src/lib/translations/translations.ts`                                   | New `field_first_name`, `field_last_name`, `name_confirm_hint` keys in `en` and `de`. | 5    |
| `apps/desktop/src/app/core/onboarding/onboarding.component.ts` / `.html` / `.scss` | Two review fields plus the confirm nudge.                                             | 6    |
| `apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts`                | Nudge and seeding tests.                                                              | 6    |
| `apps/desktop/src/app/pages/profile/profile.component.ts`                          | Two fields plus lazy backfill from the H1.                                            | 7    |
| `docs/product/CURRENT_STATE.md`, `CHANGELOG.md`                                    | State sync.                                                                           | 8    |

## Deviation from the spec, decided during planning

The spec put the `splitDisplayName` fallback in the onboarding component. It goes in `parseCvSkillResponse` instead. That function is already the single normalizer for every AI parse (it fills every `personalDetails` key with `?? null` today), so putting the fallback there means every consumer of a parsed CV gets populated fields, not just onboarding.

For the same reason the three new fields are **optional** on `CvParsedContent.personalDetails` rather than required. Fourteen test fixtures across four spec files build partial `personalDetails` literals; making the fields required would force churn through all of them for no behavioral gain, since the normalizer populates them at runtime regardless.

---

### Task 1: `splitDisplayName` helper

**Files:**

- Create: `libs/core/src/lib/profile/split-display-name.ts`
- Test: `libs/core/src/lib/profile/split-display-name.spec.ts`
- Modify: `libs/core/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `splitDisplayName(fullName: string): { firstName: string; lastName: string; confident: boolean }`, exported from `@applye/core`. Tasks 3, 6 and 7 import it by that name.

- [ ] **Step 1: Write the failing test**

Create `libs/core/src/lib/profile/split-display-name.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitDisplayName } from './split-display-name';

describe('splitDisplayName', () => {
  it('splits a plain two-token name confidently', () => {
    expect(splitDisplayName('Anna Kowalska')).toEqual({
      firstName: 'Anna',
      lastName: 'Kowalska',
      confident: true,
    });
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(splitDisplayName('  Anna   Kowalska  ')).toEqual({
      firstName: 'Anna',
      lastName: 'Kowalska',
      confident: true,
    });
  });

  it('treats a hyphenated surname as one token', () => {
    expect(splitDisplayName('Anna Nowak-Kowalska')).toEqual({
      firstName: 'Anna',
      lastName: 'Nowak-Kowalska',
      confident: true,
    });
  });

  it('splits three tokens at the last space but is not confident', () => {
    expect(splitDisplayName('Anna Maria Kowalska')).toEqual({
      firstName: 'Anna Maria',
      lastName: 'Kowalska',
      confident: false,
    });
  });

  it('leaves a mononym without a last name and is not confident', () => {
    expect(splitDisplayName('Prince')).toEqual({
      firstName: 'Prince',
      lastName: '',
      confident: false,
    });
  });

  it('returns empty parts for an empty name', () => {
    expect(splitDisplayName('')).toEqual({ firstName: '', lastName: '', confident: false });
    expect(splitDisplayName('   ')).toEqual({ firstName: '', lastName: '', confident: false });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run libs/core/src/lib/profile/split-display-name.spec.ts
```

Expected: FAIL, `Failed to resolve import "./split-display-name"`.

- [ ] **Step 3: Write the implementation**

Create `libs/core/src/lib/profile/split-display-name.ts`:

```ts
/** The result of guessing where a display name splits.
 *
 * `confident` is true only for an unambiguous two-token name. Middle names,
 * compound surnames and patronymics all produce three or more tokens and all
 * split differently, so the honest answer there is to ask the user rather than
 * to pick one convention and be quietly wrong for everyone else. */
export interface DisplayNameParts {
  firstName: string;
  lastName: string;
  confident: boolean;
}

/** Guesses a first/last split from a single display name.
 *
 * This is the only place in the app that guesses. Every other caller either
 * takes what the AI extracted or takes what the user typed. Keep it that way:
 * a second splitter is a second set of rules to disagree with this one. */
export function splitDisplayName(fullName: string): DisplayNameParts {
  const tokens = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { firstName: '', lastName: '', confident: false };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '', confident: false };
  const lastName = tokens[tokens.length - 1];
  const firstName = tokens.slice(0, -1).join(' ');
  return { firstName, lastName, confident: tokens.length === 2 };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx vitest run libs/core/src/lib/profile/split-display-name.spec.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Export it from the library barrel**

In `libs/core/src/index.ts`, after the line `export * from './lib/profile/profile-markdown';`, add:

```ts
export * from './lib/profile/split-display-name';
```

- [ ] **Step 6: Run the whole core suite**

```bash
npx nx test core
```

Expected: PASS, all suites green.

- [ ] **Step 7: Commit**

```bash
git add libs/core/src/lib/profile/split-display-name.ts libs/core/src/lib/profile/split-display-name.spec.ts libs/core/src/index.ts
git commit -m "feat(core): add splitDisplayName for guessing a first/last name split"
```

---

### Task 2: First and last name in the profile markdown contract

**Files:**

- Modify: `libs/core/src/lib/profile/profile-markdown.ts` (`ProfileForm` at line 1, `EMPTY_FORM` at line 55, `CONTACT_FIELDS` at line 82, `ContactKey` at line 90)
- Test: `libs/core/src/lib/profile/profile-markdown.spec.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `ProfileForm` gains `firstName: string` and `lastName: string`. The `## Contact` section serializes them as `- First name: …` and `- Last name: …`, written before `- Location:`. Tasks 4, 6 and 7 rely on those exact labels.

- [ ] **Step 1: Write the failing test**

Append to `libs/core/src/lib/profile/profile-markdown.spec.ts`:

```ts
describe('first and last name', () => {
  it('serializes both into the Contact section', () => {
    const md = serializeProfileForm({
      ...EMPTY_FORM,
      name: 'Anna Kowalska',
      firstName: 'Anna',
      lastName: 'Kowalska',
      email: 'anna@example.com',
    });
    expect(md).toContain('# Anna Kowalska');
    expect(md).toContain('- First name: Anna');
    expect(md).toContain('- Last name: Kowalska');
  });

  it('reads both back out of the Contact section', () => {
    const form = parseProfileMd(
      ['# Anna Kowalska', '', '## Contact', '- First name: Anna', '- Last name: Kowalska'].join(
        '\n',
      ),
    );
    expect(form.name).toBe('Anna Kowalska');
    expect(form.firstName).toBe('Anna');
    expect(form.lastName).toBe('Kowalska');
  });

  it('matches the labels case-insensitively, like every other contact line', () => {
    const form = parseProfileMd(
      ['## Contact', '- first name: Anna', '- LAST NAME: Kowalska'].join('\n'),
    );
    expect(form.firstName).toBe('Anna');
    expect(form.lastName).toBe('Kowalska');
  });

  it('round-trips a form carrying the new fields', () => {
    const form = {
      ...EMPTY_FORM,
      name: 'Anna Kowalska',
      firstName: 'Anna',
      lastName: 'Kowalska',
      title: 'Senior Engineer',
      location: 'Lisboa, Portugal',
      email: 'anna@example.com',
    };
    expect(parseProfileMd(serializeProfileForm(form))).toEqual(form);
  });

  it('omits the lines entirely when the parts are empty', () => {
    const md = serializeProfileForm({ ...EMPTY_FORM, name: 'Prince' });
    expect(md).not.toContain('First name');
    expect(md).not.toContain('Last name');
  });
});
```

If `EMPTY_FORM`, `serializeProfileForm` or `parseProfileMd` is not already imported at the top of that spec file, add it to the existing `import { … } from './profile-markdown';` line.

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run libs/core/src/lib/profile/profile-markdown.spec.ts
```

Expected: FAIL. TypeScript rejects `firstName` as not existing on `ProfileForm`, and the parse assertions return `undefined`.

- [ ] **Step 3: Add the fields to `ProfileForm`**

In `libs/core/src/lib/profile/profile-markdown.ts`, change the top of the interface from:

```ts
export interface ProfileForm {
  name: string;
  title: string;
```

to:

```ts
export interface ProfileForm {
  /** The display name: the `# H1` of the markdown and the CV document's title.
   * Stays canonical. `firstName` and `lastName` are the structured parts that
   * generated documents and job-board autofill need; they sit beside it rather
   * than replacing it, so nothing that reads the H1 has to change. */
  name: string;
  firstName: string;
  lastName: string;
  title: string;
```

- [ ] **Step 4: Add the fields to `EMPTY_FORM`**

Change:

```ts
export const EMPTY_FORM: ProfileForm = {
  name: '',
  title: '',
```

to:

```ts
export const EMPTY_FORM: ProfileForm = {
  name: '',
  firstName: '',
  lastName: '',
  title: '',
```

- [ ] **Step 5: Add the fields to the contact machinery**

Change `CONTACT_FIELDS` and `ContactKey` from:

```ts
const CONTACT_FIELDS: { key: ContactKey; label: string }[] = [
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
];

type ContactKey = 'location' | 'email' | 'phone' | 'website' | 'linkedin';
```

to:

```ts
const CONTACT_FIELDS: { key: ContactKey; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
];

type ContactKey =
  | 'firstName'
  | 'lastName'
  | 'location'
  | 'email'
  | 'phone'
  | 'website'
  | 'linkedin';
```

No other change is needed: `parseContactSection` already matches any `- Label: value` line whose label appears in `CONTACT_FIELDS`, case-insensitively, and its regex `/^[-*]\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/` already accepts a label containing a space. `serializeProfileForm` already writes every `CONTACT_FIELDS` entry whose value is non-empty.

- [ ] **Step 6: Run the test and watch it pass**

```bash
npx vitest run libs/core/src/lib/profile/profile-markdown.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run the whole core suite**

```bash
npx nx test core
```

Expected: PASS. If an existing round-trip fixture fails on the two new keys, add `firstName: ''` and `lastName: ''` to that fixture; do not weaken the `toEqual` assertion.

- [ ] **Step 8: Commit**

```bash
git add libs/core/src/lib/profile/profile-markdown.ts libs/core/src/lib/profile/profile-markdown.spec.ts
git commit -m "feat(core): carry first and last name through the profile Contact section"
```

---

### Task 3: Parse contract and the AI prompt

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts:546-554`
- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts:440-469`
- Modify: `libs/skills/src/cv-import/cv-import.md` (lines 30, 41)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`

**Interfaces:**

- Consumes: `splitDisplayName` from Task 1, imported from `@applye/core`.
- Produces: `CvParsedContent['personalDetails']` gains `firstName?: string | null`, `lastName?: string | null`, `nameSplitConfident?: boolean`. `parseCvSkillResponse` always populates all three. Tasks 4 and 6 read them.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`:

```ts
describe('parseCvSkillResponse name split', () => {
  it('keeps the split the AI supplied', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Anna Kowalska',
          firstName: 'Anna',
          lastName: 'Kowalska',
          nameSplitConfident: true,
        },
      }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives the split when the AI omitted it, and marks a clean two-token name confident', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives an unconfident split for a three-token name', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Maria Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna Maria');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('reports a mononym as unconfident with no last name', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: { fullName: 'Prince' } }));
    expect(cv.personalDetails.firstName).toBe('Prince');
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('trusts an explicit false flag even when the name looks clean', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Kim Minjun',
          firstName: 'Minjun',
          lastName: 'Kim',
          nameSplitConfident: false,
        },
      }),
    );
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('leaves every name field null when there is no name at all', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: {} }));
    expect(cv.personalDetails.fullName).toBeNull();
    expect(cv.personalDetails.firstName).toBeNull();
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run apps/desktop/src/app/pages/documents/cv-content.util.spec.ts -t 'name split'
```

Expected: FAIL. TypeScript rejects `firstName` on `personalDetails`, and the assertions read `undefined`.

- [ ] **Step 3: Extend the model**

In `libs/core/src/lib/models/document.model.ts`, change:

```ts
  personalDetails: {
    fullName: string | null;
    title: string | null;
```

to:

```ts
  personalDetails: {
    /** The display name, used as the CV document's title. Canonical. */
    fullName: string | null;
    /** The structured parts of the name. Optional on the type because many
     * test fixtures and older stored parses predate them; `parseCvSkillResponse`
     * always populates all three, so anything that came through the normalizer
     * has them. */
    firstName?: string | null;
    lastName?: string | null;
    /** False when the split was guessed rather than read off the CV, which is
     * what makes the onboarding review step ask the user to confirm it. */
    nameSplitConfident?: boolean;
    title: string | null;
```

- [ ] **Step 4: Fill the fields in the normalizer**

In `apps/desktop/src/app/pages/documents/cv-content.util.ts`, change the start of the returned object in `parseCvSkillResponse` from:

```ts
  const p: Partial<CvParsedContent['personalDetails']> = parsed.personalDetails ?? {};
  return {
    personalDetails: {
      fullName: p.fullName ?? null,
      title: p.title ?? null,
```

to:

```ts
  const p: Partial<CvParsedContent['personalDetails']> = parsed.personalDetails ?? {};
  // The AI is asked for the split, but a provider that ignores the new keys
  // must not leave the fields empty: a derived split is better than none, and
  // `nameSplitConfident` is what tells the review step to ask about it.
  const derived = splitDisplayName(p.fullName ?? '');
  return {
    personalDetails: {
      fullName: p.fullName ?? null,
      firstName: p.firstName ?? (derived.firstName || null),
      lastName: p.lastName ?? (derived.lastName || null),
      nameSplitConfident: p.nameSplitConfident ?? derived.confident,
      title: p.title ?? null,
```

Add `splitDisplayName` to the existing `import { … } from '@applye/core';` statement at the top of the file.

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
```

Expected: PASS, whole file green.

- [ ] **Step 6: Update the AI prompt**

In `libs/skills/src/cv-import/cv-import.md`, replace line 30, which currently reads:

```
- personalDetails.fullName is required if findable (usually the top line); title (the role line under the name, e.g. "Senior Frontend Software Engineer"), email, phone, address, website, linkedin are null if absent. Extract, never invent.
```

with:

```
- personalDetails.fullName is required if findable (usually the top line); title (the role line under the name, e.g. "Senior Frontend Software Engineer"), email, phone, address, website, linkedin are null if absent. Extract, never invent.
- personalDetails.firstName and personalDetails.lastName split fullName into the given name and the family name, and personalDetails.nameSplitConfident says whether you are sure of that split. Set it true only when the split is unambiguous. Set it false, and leave lastName null, when the name is a single word, when it is written family-name-first (common in Hungarian, Chinese, Japanese, Korean and Vietnamese CVs), or when three or more words leave no obvious boundary. Do not guess a boundary to avoid saying false: the user is asked to confirm whenever it is false, which is the correct outcome.
```

Then replace line 41, which currently reads:

```
"personalDetails": { "fullName": "string or null", "title": "string or null", "email": "string or null", "phone": "string or null", "address": "string or null", "website": "string or null", "linkedin": "string or null" },
```

with:

```
"personalDetails": { "fullName": "string or null", "firstName": "string or null", "lastName": "string or null", "nameSplitConfident": true, "title": "string or null", "email": "string or null", "phone": "string or null", "address": "string or null", "website": "string or null", "linkedin": "string or null" },
```

- [ ] **Step 7: Run the desktop and core suites**

```bash
npx nx test core && npx nx test desktop
```

Expected: PASS, both projects green.

- [ ] **Step 8: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts libs/skills/src/cv-import/cv-import.md
git commit -m "feat(cv-import): extract first and last name with a confidence flag"
```

---

### Task 4: Onboarding write path

**Files:**

- Modify: `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts` (`ParsedCv` at line 14, `cvToProfileMarkdown` contact block at lines 41-52, `OnboardingCvOverrides` at line 124, `applyContactOverrides` at line 135)
- Test: `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts`

**Interfaces:**

- Consumes: the `- First name:` / `- Last name:` Contact labels from Task 2; the parsed fields from Task 3.
- Produces: `OnboardingCvOverrides` gains `firstName: string` and `lastName: string` and **loses** `fullName`, which is now composed. `applyContactOverrides` returns `{ fullName, firstName, lastName, email, phone, address }`. Task 6 constructs the overrides object.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts`:

```ts
describe('first and last name', () => {
  it('writes both into the Contact block and they read back', () => {
    const md = cvToProfileMarkdown({
      personalDetails: {
        fullName: 'Anna Kowalska',
        firstName: 'Anna',
        lastName: 'Kowalska',
        email: 'anna@example.com',
      },
    });
    expect(md).toContain('- First name: Anna');
    expect(md).toContain('- Last name: Kowalska');
    const form = parseProfileMd(md);
    expect(form.name).toBe('Anna Kowalska');
    expect(form.firstName).toBe('Anna');
    expect(form.lastName).toBe('Kowalska');
  });

  it('omits the lines when the parse had no split', () => {
    const md = cvToProfileMarkdown({ personalDetails: { fullName: 'Prince' } });
    expect(md).not.toContain('First name');
    expect(md).not.toContain('Last name');
    expect(parseProfileMd(md).name).toBe('Prince');
  });

  it('composes the display name from the override parts', () => {
    expect(
      applyContactOverrides({
        firstName: ' Anna ',
        lastName: ' Kowalska ',
        email: '',
        phone: '',
        address: '',
      }),
    ).toEqual({
      fullName: 'Anna Kowalska',
      firstName: 'Anna',
      lastName: 'Kowalska',
      email: null,
      phone: null,
      address: null,
    });
  });

  it('composes a mononym display name from a first name alone', () => {
    expect(
      applyContactOverrides({
        firstName: 'Prince',
        lastName: '',
        email: '',
        phone: '',
        address: '',
      }),
    ).toMatchObject({ fullName: 'Prince', firstName: 'Prince', lastName: null });
  });

  it('reports no display name when both parts are blank', () => {
    expect(
      applyContactOverrides({ firstName: '  ', lastName: '', email: '', phone: '', address: '' }),
    ).toMatchObject({ fullName: null, firstName: null, lastName: null });
  });
});
```

If `applyContactOverrides` or `parseProfileMd` is not already imported in that spec file, add it to the existing imports.

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts -t 'first and last name'
```

Expected: FAIL. TypeScript rejects `firstName` in both the parse literal and the overrides literal.

- [ ] **Step 3: Extend `ParsedCv`**

In `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts`, change:

```ts
  personalDetails?: {
    fullName?: string | null;
    title?: string | null;
```

to:

```ts
  personalDetails?: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    nameSplitConfident?: boolean;
    title?: string | null;
```

- [ ] **Step 4: Emit the two lines in `cvToProfileMarkdown`**

Change the contact array from:

```ts
const contact = [
  ['Location', cv.personalDetails?.address],
  ['Email', cv.personalDetails?.email],
  ['Phone', cv.personalDetails?.phone],
  ['Website', cv.personalDetails?.website],
  ['LinkedIn', cv.personalDetails?.linkedin],
] as const;
```

to:

```ts
// The labels and their order must match CONTACT_FIELDS in profile-markdown.ts:
// this writer and parseProfileMd are held in lockstep only by the round-trip
// test below it, so a label typo here silently drops the field on read.
const contact = [
  ['First name', cv.personalDetails?.firstName],
  ['Last name', cv.personalDetails?.lastName],
  ['Location', cv.personalDetails?.address],
  ['Email', cv.personalDetails?.email],
  ['Phone', cv.personalDetails?.phone],
  ['Website', cv.personalDetails?.website],
  ['LinkedIn', cv.personalDetails?.linkedin],
] as const;
```

- [ ] **Step 5: Rework the overrides**

Change:

```ts
export interface OnboardingCvOverrides {
  fullName: string;
  email: string;
  phone: string;
  address: string;
}
```

to:

```ts
export interface OnboardingCvOverrides {
  /** The review step edits the parts, never the display name: the display name
   * is composed from them, so the H1 and the Contact lines cannot disagree. */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
}
```

Then change the body of `applyContactOverrides` from:

```ts
export function applyContactOverrides(overrides: OnboardingCvOverrides): {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
} {
  return {
    fullName: overrides.fullName.trim() || null,
    email: overrides.email.trim() || null,
    phone: overrides.phone.trim() || null,
    address: overrides.address.trim() || null,
  };
}
```

to:

```ts
export function applyContactOverrides(overrides: OnboardingCvOverrides): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
} {
  const firstName = overrides.firstName.trim();
  const lastName = overrides.lastName.trim();
  return {
    fullName: [firstName, lastName].filter(Boolean).join(' ') || null,
    firstName: firstName || null,
    lastName: lastName || null,
    email: overrides.email.trim() || null,
    phone: overrides.phone.trim() || null,
    address: overrides.address.trim() || null,
  };
}
```

- [ ] **Step 6: Fix the existing override fixtures in this spec file**

Every existing `applyContactOverrides({ fullName: 'X', … })` or `overrides: { fullName: 'X', … }` literal in `onboarding-content.util.spec.ts` no longer compiles. Find them:

```bash
grep -n "fullName:" apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts
```

For each one inside an overrides object, replace `fullName: 'Jane Smith'` with `firstName: 'Jane', lastName: 'Smith'`. Leave `fullName:` inside `personalDetails` literals alone: that field is unchanged.

- [ ] **Step 7: Run the spec and watch it pass**

```bash
npx vitest run apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts
```

Expected: PASS, whole file green.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding-content.util.ts apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts
git commit -m "feat(onboarding): write first and last name into the profile markdown"
```

---

### Task 5: Translations

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts` (`en` block near line 528 and 1540, `de` block near line 2110 and 3150)

**Interfaces:**

- Consumes: nothing.
- Produces: keys `profile.field_first_name`, `profile.field_last_name`, `onboarding.preview.field_first_name`, `onboarding.preview.field_last_name`, `onboarding.preview.name_confirm_hint`. Tasks 6 and 7 use them through `t()`.

Only `en` and `de` need editing. `ru`, `es`, `fr` and `uk` are built with `stub(en, …)` and inherit anything they do not override.

- [ ] **Step 1: Find the four sites**

```bash
grep -n "field_name" libs/i18n/src/lib/translations/translations.ts
```

Expected: four hits. Roughly line 528 (`en` profile, `'Name'`), 1540 (`en` onboarding preview, `'Full name'`), 2110 (`de` profile), 3150 (`de` onboarding preview).

- [ ] **Step 2: Replace the `en` profile key**

At the `en` profile hit, replace:

```ts
    field_name: 'Name',
```

with:

```ts
    field_first_name: 'First name',
    field_last_name: 'Last name',
```

- [ ] **Step 3: Replace the `en` onboarding preview key**

At the `en` onboarding preview hit, replace:

```ts
      field_name: 'Full name',
```

with:

```ts
      field_first_name: 'First name',
      field_last_name: 'Last name',
      name_confirm_hint: "We weren't sure how to split this. Please check it.",
```

- [ ] **Step 4: Replace the `de` profile key**

At the `de` profile hit, replace:

```ts
    field_name: 'Name',
```

with:

```ts
    field_first_name: 'Vorname',
    field_last_name: 'Nachname',
```

- [ ] **Step 5: Replace the `de` onboarding preview key**

At the `de` onboarding preview hit, replace:

```ts
      field_name: 'Vollständiger Name',
```

with:

```ts
      field_first_name: 'Vorname',
      field_last_name: 'Nachname',
      name_confirm_hint: 'Wir waren uns bei der Aufteilung nicht sicher. Bitte prüfen.',
```

- [ ] **Step 6: Verify no reference to the removed key survives**

```bash
grep -rn "field_name" apps libs
```

Expected: two hits only, both template usages that Tasks 6 and 7 replace (`onboarding.component.html` and `profile.component.ts`). If any other file references `field_name`, update it to the new keys before continuing.

- [ ] **Step 7: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): add first name, last name and name confirm hint strings"
```

Note: the desktop build is expected to fail between this task and Task 7, because the two templates still reference the removed `field_name` key. Tasks 6 and 7 close that.

---

### Task 6: Onboarding review step, two fields plus the confirm nudge

**Files:**

- Modify: `apps/desktop/src/app/core/onboarding/onboarding.component.ts` (review signals at lines 423-427, seeding at lines 494-497, `resumeSummary` near line 680, `reviewOverrides` near line 705)
- Modify: `apps/desktop/src/app/core/onboarding/onboarding.component.html` (the name field at lines 521-533)
- Modify: the onboarding stylesheet that defines `ob__field` and `ob__input`
- Test: `apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts`

**Interfaces:**

- Consumes: `splitDisplayName` (Task 1), the parsed `firstName` / `lastName` / `nameSplitConfident` (Task 3), the reworked `OnboardingCvOverrides` (Task 4), the new i18n keys (Task 5).
- Produces: signals `reviewFirstName`, `reviewLastName`, `nameEdited`, and the computed `needsNameConfirm`. `reviewName` is deleted.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts`, matching however that file already constructs the component under test:

```ts
describe('name confirm nudge', () => {
  it('seeds both fields from a confident parse and does not nudge', () => {
    const c = createComponent();
    c.parsedCv.set(
      makeParsed({
        fullName: 'Anna Kowalska',
        firstName: 'Anna',
        lastName: 'Kowalska',
        nameSplitConfident: true,
      }),
    );
    c.seedReviewFields();
    expect(c.reviewFirstName()).toBe('Anna');
    expect(c.reviewLastName()).toBe('Kowalska');
    expect(c.needsNameConfirm()).toBe(false);
  });

  it('nudges when the parse was not confident', () => {
    const c = createComponent();
    c.parsedCv.set(
      makeParsed({
        fullName: 'Anna Maria Kowalska',
        firstName: 'Anna Maria',
        lastName: 'Kowalska',
        nameSplitConfident: false,
      }),
    );
    c.seedReviewFields();
    expect(c.needsNameConfirm()).toBe(true);
  });

  it('nudges when the last name is missing', () => {
    const c = createComponent();
    c.parsedCv.set(makeParsed({ fullName: 'Prince', firstName: 'Prince', lastName: null }));
    c.seedReviewFields();
    expect(c.reviewFirstName()).toBe('Prince');
    expect(c.reviewLastName()).toBe('');
    expect(c.needsNameConfirm()).toBe(true);
  });

  it('derives the split when the parse omitted it', () => {
    const c = createComponent();
    c.parsedCv.set(makeParsed({ fullName: 'Anna Kowalska' }));
    c.seedReviewFields();
    expect(c.reviewFirstName()).toBe('Anna');
    expect(c.reviewLastName()).toBe('Kowalska');
    expect(c.needsNameConfirm()).toBe(true);
  });

  it('stops nudging once the user edits either field', () => {
    const c = createComponent();
    c.parsedCv.set(makeParsed({ fullName: 'Prince', firstName: 'Prince', lastName: null }));
    c.seedReviewFields();
    expect(c.needsNameConfirm()).toBe(true);
    c.onNameEdited();
    expect(c.needsNameConfirm()).toBe(false);
  });
});
```

Add a `makeParsed` helper to that spec file if one does not already exist:

```ts
function makeParsed(personalDetails: Partial<CvParsedContent['personalDetails']>): CvParsedContent {
  return {
    personalDetails: {
      fullName: null,
      title: null,
      email: null,
      phone: null,
      address: null,
      website: null,
      linkedin: null,
      ...personalDetails,
    },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    languages: [],
    lowConfidenceNotes: [],
  };
}
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts -t 'name confirm nudge'
```

Expected: FAIL, `reviewFirstName is not a function`.

- [ ] **Step 3: Replace the review signals**

In `onboarding.component.ts`, replace:

```ts
  // ---- Review (editable overrides seeded once from the parsed CV) ----
  readonly reviewName = signal('');
```

with:

```ts
  // ---- Review (editable overrides seeded once from the parsed CV) ----
  readonly reviewFirstName = signal('');
  readonly reviewLastName = signal('');
  /** Set the first time the user touches either name field. The nudge is a
   * question, and a question stops being worth asking once it is answered -
   * including when the answer is "what you parsed was already right". */
  readonly nameEdited = signal(false);

  /** True when the parse could not confirm the split, so the review step should
   * ask. Never gates Continue: Applye augments, it does not block. */
  readonly needsNameConfirm = computed(() => {
    if (this.nameEdited()) return false;
    if (!this.reviewFirstName().trim()) return false;
    if (!this.reviewLastName().trim()) return true;
    return this.parsedCv()?.personalDetails.nameSplitConfident !== true;
  });

  onNameEdited(): void {
    this.nameEdited.set(true);
  }
```

The `!this.reviewFirstName().trim()` guard means a CV with no name at all does not nudge: there is nothing to confirm, and the empty fields already say so.

- [ ] **Step 4: Replace the seeding**

Replace:

```ts
if (!this.reviewName().trim()) this.reviewName.set(cv.personalDetails.fullName ?? '');
```

with:

```ts
const split = splitDisplayName(cv.personalDetails.fullName ?? '');
if (!this.reviewFirstName().trim())
  this.reviewFirstName.set(cv.personalDetails.firstName ?? split.firstName);
if (!this.reviewLastName().trim())
  this.reviewLastName.set(cv.personalDetails.lastName ?? split.lastName);
```

Add `splitDisplayName` to the existing `import { … } from '@applye/core';` statement.

If the test in Step 1 calls a `seedReviewFields()` method, extract those lines into a public method of that name and call it from the parse handler in place of the inline block, so the test can drive the seeding without running a full parse.

- [ ] **Step 5: Update `reviewOverrides`**

Replace:

```ts
  private reviewOverrides(): OnboardingCvOverrides {
    return {
      fullName: this.reviewName(),
      email: this.reviewEmail(),
      phone: this.reviewPhone(),
      address: this.reviewAddress(),
    };
  }
```

with:

```ts
  private reviewOverrides(): OnboardingCvOverrides {
    return {
      firstName: this.reviewFirstName(),
      lastName: this.reviewLastName(),
      email: this.reviewEmail(),
      phone: this.reviewPhone(),
      address: this.reviewAddress(),
    };
  }
```

- [ ] **Step 6: Update `resumeSummary`**

Replace:

```ts
const name = this.reviewName().trim();
```

with:

```ts
const name = [this.reviewFirstName().trim(), this.reviewLastName().trim()]
  .filter(Boolean)
  .join(' ');
```

- [ ] **Step 7: Replace the template field**

In `onboarding.component.html`, replace the single name field block:

```html
<div class="ob__field">
  <label class="ob__field-label" for="ob-review-name"
    >{{ t()('onboarding.preview.field_name') }}</label
  >
  <input
    id="ob-review-name"
    class="ob__input"
    [ngModel]="reviewName()"
    (ngModelChange)="reviewName.set($event)"
  />
</div>
```

with:

```html
<div class="ob__field">
  <label class="ob__field-label" for="ob-review-first-name"
    >{{ t()('onboarding.preview.field_first_name') }}</label
  >
  <input
    id="ob-review-first-name"
    class="ob__input"
    [class.ob__input--confirm]="needsNameConfirm()"
    [ngModel]="reviewFirstName()"
    (ngModelChange)="reviewFirstName.set($event); onNameEdited()"
  />
</div>
<div class="ob__field">
  <label class="ob__field-label" for="ob-review-last-name"
    >{{ t()('onboarding.preview.field_last_name') }}</label
  >
  <input
    id="ob-review-last-name"
    class="ob__input"
    [class.ob__input--confirm]="needsNameConfirm()"
    [ngModel]="reviewLastName()"
    (ngModelChange)="reviewLastName.set($event); onNameEdited()"
  />
</div>
@if (needsNameConfirm()) {
<p class="ob__field-hint ob__field-hint--confirm">
  {{ t()('onboarding.preview.name_confirm_hint') }}
</p>
}
```

The hint sits as its own child of `ob__grid-2`, so it starts on a fresh grid row under the two fields it refers to. If the grid is a two-column `display: grid`, add `grid-column: 1 / -1;` to `.ob__field-hint--confirm` in the next step so it spans both.

- [ ] **Step 8: Style the nudge**

In the stylesheet that defines `.ob__input` (find it with `grep -rn "ob__input" apps/desktop/src --include=*.scss`), append:

```scss
.ob__input--confirm {
  border-color: var(--color-warning-border);
}

.ob__field-hint--confirm {
  grid-column: 1 / -1;
  margin: calc(var(--space-1) * -1) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-warning-fg);
}
```

Before committing, confirm those three custom properties exist:

```bash
grep -rn "color-warning-border\|color-warning-fg\|font-size-sm\|space-1" apps/desktop/src --include=*.scss | head
```

If a token is missing, use the ones the existing `.ob__warning-card` rule already uses rather than inventing a name; an undefined custom property renders as nothing and the nudge would be invisible.

- [ ] **Step 9: Run the spec and watch it pass**

```bash
npx vitest run apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts
```

Expected: PASS, whole file green.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/app/core/onboarding/onboarding.component.ts apps/desktop/src/app/core/onboarding/onboarding.component.html apps/desktop/src/app/core/onboarding/onboarding.component.spec.ts apps/desktop/src/app/core/onboarding
git commit -m "feat(onboarding): confirm the first and last name split in the review step"
```

---

### Task 7: Profile page

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts` (template name field at lines 376-385, profile load at line 2023, raw-mode reparse at line 2204)

**Interfaces:**

- Consumes: `ProfileForm.firstName` / `.lastName` (Task 2), `splitDisplayName` (Task 1), the new i18n keys (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/app/pages/profile/profile.component.spec.ts`, matching how it already builds the component:

```ts
describe('name backfill', () => {
  it('fills the two fields from the H1 when the markdown has no Contact name lines', () => {
    const c = createComponent();
    c.applyLoadedMarkdown('# Anna Kowalska\n\n## Contact\n- Email: anna@example.com');
    expect(c.form().name).toBe('Anna Kowalska');
    expect(c.form().firstName).toBe('Anna');
    expect(c.form().lastName).toBe('Kowalska');
  });

  it('leaves the stored split alone when the markdown already carries it', () => {
    const c = createComponent();
    c.applyLoadedMarkdown(
      '# Anna Maria Kowalska\n\n## Contact\n- First name: Anna\n- Last name: Maria Kowalska',
    );
    expect(c.form().firstName).toBe('Anna');
    expect(c.form().lastName).toBe('Maria Kowalska');
  });

  it('recomposes the display name when a part is edited', () => {
    const c = createComponent();
    c.applyLoadedMarkdown('# Anna Kowalska');
    c.updateField('lastName', 'Nowak');
    expect(c.form().name).toBe('Anna Nowak');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx vitest run apps/desktop/src/app/pages/profile/profile.component.spec.ts -t 'name backfill'
```

Expected: FAIL, `applyLoadedMarkdown is not a function`.

- [ ] **Step 3: Add the load helper**

In `profile.component.ts`, add this method to the component class:

```ts
  /** Reads markdown into the form, backfilling the name split for profiles that
   * predate the first/last fields. The derive happens here rather than inside
   * `parseProfileMd` so the parser stays a faithful reader and its round-trip
   * identity test keeps its meaning. Nothing is written back on read alone: the
   * backfilled values reach disk on the user's next save. */
  applyLoadedMarkdown(md: string): void {
    const form = parseProfileMd(md);
    if (!form.firstName.trim() && !form.lastName.trim() && form.name.trim()) {
      const split = splitDisplayName(form.name);
      form.firstName = split.firstName;
      form.lastName = split.lastName;
    }
    this.form.set(form);
  }
```

Add `splitDisplayName` to the existing `import { … } from '@applye/core';` statement.

- [ ] **Step 4: Route both load sites through it**

Replace line 2023:

```ts
this.form.set(parseProfileMd(p?.fullMd ?? ''));
```

with:

```ts
this.applyLoadedMarkdown(p?.fullMd ?? '');
```

Replace line 2204:

```ts
this.form.set(parseProfileMd(this.fullMd()));
```

with:

```ts
this.applyLoadedMarkdown(this.fullMd());
```

- [ ] **Step 5: Recompose the display name on edit**

Replace `updateField` at line 2158, which currently reads:

```ts
  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.syncMdFromForm();
  }
```

with:

```ts
  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => {
      const next = { ...f, [key]: value };
      // Editing a name part recomposes the display name, so the `# H1` and the
      // Contact lines can never disagree. Only when the parts produce something:
      // clearing both must not silently wipe a display name the user set by
      // hand in raw mode.
      if (key === 'firstName' || key === 'lastName') {
        const composed = [next.firstName.trim(), next.lastName.trim()].filter(Boolean).join(' ');
        if (composed) next.name = composed;
      }
      return next;
    });
    this.syncMdFromForm();
  }
```

- [ ] **Step 6: Replace the template field**

Replace:

```html
<div class="field">
  <label class="field__label" for="field-name">{{ t()('profile.field_name') }}</label>
  <input
    id="field-name"
    class="field__input"
    type="text"
    [ngModel]="form().name"
    (ngModelChange)="updateField('name', $event)"
  />
</div>
```

with:

```html
<div class="field-row">
  <div class="field">
    <label class="field__label" for="field-first-name">{{ t()('profile.field_first_name') }}</label>
    <input
      id="field-first-name"
      class="field__input"
      type="text"
      [ngModel]="form().firstName"
      (ngModelChange)="updateField('firstName', $event)"
    />
  </div>
  <div class="field">
    <label class="field__label" for="field-last-name">{{ t()('profile.field_last_name') }}</label>
    <input
      id="field-last-name"
      class="field__input"
      type="text"
      [ngModel]="form().lastName"
      (ngModelChange)="updateField('lastName', $event)"
    />
  </div>
</div>
```

`field-row` is the existing two-up wrapper used by the Title and Location pair directly below, so no new styling is needed.

- [ ] **Step 7: Run the spec and watch it pass**

```bash
npx vitest run apps/desktop/src/app/pages/profile/profile.component.spec.ts
```

Expected: PASS, whole file green.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts apps/desktop/src/app/pages/profile
git commit -m "feat(profile): edit the name as first and last, backfilling older profiles"
```

---

### Task 8: Full verification and state sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run every suite**

```bash
npx nx run-many -t test --all
```

Expected: PASS across all projects. The desktop suite was at 647 tests before this work and should now be higher.

- [ ] **Step 2: Lint and build**

```bash
npx nx lint desktop && npx nx build desktop
```

Expected: 0 lint errors, build succeeds.

- [ ] **Step 3: Check for banned dashes in everything this branch touched**

```bash
git diff main...HEAD --name-only | xargs grep -n $'[—–]' || echo "clean"
```

Expected: `clean`. If any hit appears, replace the character with a plain hyphen `-` and amend the commit that introduced it.

- [ ] **Step 4: Confirm the old key is gone**

```bash
grep -rn "field_name\|reviewName\b" apps libs || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Update `CHANGELOG.md`**

Add to the unreleased section:

```markdown
- The profile name is now stored as a first name and a last name alongside the display name,
  so generated documents and future job-board autofill get the parts they need. When the resume
  parse cannot confirm how a name splits, the onboarding review step asks the user to check it
  without blocking them. Profiles saved before this change fill their parts in from the display
  name when they are next opened.
```

- [ ] **Step 6: Update `docs/product/CURRENT_STATE.md`**

The state doc is stale: it describes `main` with a clean tree and no open branches, which has not been true since the 2026-07-24 session. Update the **Current branch / focus** bullet to name `feat/onboarding-welcome` and summarize what it now holds: the animated welcome screen, the design system button migration and design QA sweep, the onboarding to profile sync fixes (website, LinkedIn, education, languages, salary, role versus company, dateless "Present"), and this first/last name split. Keep the existing **Next action** bullet about the pending `tauri dev` pass and add the name split to the list of things it must cover, since the confirm nudge has never been seen running natively.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs: record the first and last name split and sync the state doc"
```

---

## Notes for the implementer

- The temporary "Restart (dev)" button in `shell-layout.component.html` / `.ts` is deliberately left uncommitted for native testing. Do not commit it and do not revert it. Keep `git add` paths explicit rather than using `git add -A`, or those two files will ride along.
- The parallel writers `cvToProfileMarkdown` (Task 4) and `serializeProfileForm` (Task 2) are held in lockstep only by the round-trip test through `parseProfileMd`. If you change a Contact label in one, change it in both, and the round-trip test is what proves you did.
- The CV document path is untouched on purpose. `buildOnboardingCvInput` spreads `applyContactOverrides` output into `personalDetails`, and since that output still carries a composed `fullName`, the generated CV title keeps working with no change. If a CV title test breaks, the composition in `applyContactOverrides` is wrong, not the CV code.
