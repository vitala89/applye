# CV Default Template — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated CV content + live preview match the reference single-column ATS layout (title line, pipe-delimited contacts, grouped skill rows, right-aligned dates, inline-bold metrics), fixing the "generates poorly / nothing there" problem before any export plumbing changes.

**Architecture:** Enrich the shared CV content model and the AI baseline skill to emit the richer structure; keep the AI/parse contract additive so existing consumers (`onboarding-content.util.ts`) don't break; rebuild the Angular preview as the single canonical layout driven by `CvStyle`. Pure logic (emphasis parsing, contact line, skill grouping, normalization) lives in tested functions; the Angular template only renders them.

**Tech Stack:** TypeScript, Angular (standalone, signals, control-flow `@if/@for/@switch`), Nx, Jest. No new dependencies.

## Global Constraints

- Branch: `feat/cv-default-template` (already checked out). Never commit to `main`.
- Commit subjects: Conventional Commits, subject **lowercase** (commitlint rejects sentence/pascal/upper case). End every commit body with the `Co-Authored-By` trailer already used in this repo.
- Additive AI/parse contract: keep `CvParsedContent.skills: string[]`; add optional `skillGroups`. Do **not** remove `skills`.
- Inline emphasis encoding in bullet strings is `**bold**` (double asterisk). No other markdown in bullets.
- Stored content skills use `groups` (grouped); legacy `items` is migrated on load, never written back.
- All user-facing UI strings go through `libs/i18n` (`t()('documents.…')`). Skill/content strings are data, not UI.
- ATS-safe: no change to `CV_ATS_SAFE_FONTS` / `check_style_safety` in this phase.
- Test commands: `npx nx test core` and `npx nx test desktop`. Target a file with `--testPathPattern=<substr>`; target a test name with `-t '<name>'`.
- Do not touch Rust export code, `cv-list` generation flow, cover-letter code, or add deps in this phase.

---

### Task 1: Inline emphasis parser (`parseInlineEmphasis`)

Shared pure function used by the preview now and reused by TS tailoring later. Rust DOCX reimplements it separately (Phase 3).

**Files:**

- Create: `libs/core/src/lib/text/inline-emphasis.ts`
- Modify: `libs/core/src/index.ts` (add export)
- Test: `libs/core/src/lib/text/inline-emphasis.spec.ts`

**Interfaces:**

- Produces: `interface CvTextRun { text: string; bold: boolean }`; `parseInlineEmphasis(input: string): CvTextRun[]`

- [ ] **Step 1: Write the failing test**

`libs/core/src/lib/text/inline-emphasis.spec.ts`:

```ts
import { parseInlineEmphasis } from './inline-emphasis';

describe('parseInlineEmphasis', () => {
  it('splits **bold** spans from plain text', () => {
    expect(parseInlineEmphasis('cut bundle size by **25%** overall')).toEqual([
      { text: 'cut bundle size by ', bold: false },
      { text: '25%', bold: true },
      { text: ' overall', bold: false },
    ]);
  });

  it('handles a leading and multiple bold spans', () => {
    expect(parseInlineEmphasis('**Led** the **GA** launch')).toEqual([
      { text: 'Led', bold: true },
      { text: ' the ', bold: false },
      { text: 'GA', bold: true },
      { text: ' launch', bold: false },
    ]);
  });

  it('returns a single plain run when there is no emphasis', () => {
    expect(parseInlineEmphasis('plain line')).toEqual([{ text: 'plain line', bold: false }]);
  });

  it('never returns an empty array for empty input', () => {
    expect(parseInlineEmphasis('')).toEqual([{ text: '', bold: false }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core --testPathPattern=inline-emphasis`
Expected: FAIL — cannot find module `./inline-emphasis`.

- [ ] **Step 3: Write minimal implementation**

`libs/core/src/lib/text/inline-emphasis.ts`:

```ts
/** One styled span of a CV bullet/summary line. Bullet strings carry inline
 * emphasis as `**bold**`; this splits a line into ordered runs the preview
 * (and later the DOCX renderer) turn into <strong>/plain text. */
export interface CvTextRun {
  text: string;
  bold: boolean;
}

const EMPHASIS_RE = /\*\*(.+?)\*\*/g;

export function parseInlineEmphasis(input: string): CvTextRun[] {
  const runs: CvTextRun[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  EMPHASIS_RE.lastIndex = 0;
  while ((match = EMPHASIS_RE.exec(input)) !== null) {
    if (match.index > last) runs.push({ text: input.slice(last, match.index), bold: false });
    runs.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < input.length) runs.push({ text: input.slice(last), bold: false });
  return runs.length ? runs : [{ text: input, bold: false }];
}
```

- [ ] **Step 4: Add the barrel export**

In `libs/core/src/index.ts`, add near the other `export * from './lib/...'` lines:

```ts
export * from './lib/text/inline-emphasis';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core --testPathPattern=inline-emphasis`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/text/inline-emphasis.ts libs/core/src/lib/text/inline-emphasis.spec.ts libs/core/src/index.ts
git commit -m "feat: add inline emphasis parser for cv bullets"
```

---

### Task 2: Model enrichment + normalization + contact line

Extend the content model and add the two pure functions the preview needs. Type changes compile because the new functions consume them.

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts`
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (create)

**Interfaces:**

- Consumes: model types below.
- Produces:
  - `interface CvSkillGroup { label: string; values: string[] }`
  - `CvSkillsSection { key: 'skills'; groups: CvSkillGroup[] }` (replaces `items`)
  - `CvPersonalDetailsSection` += `title?`, `website?`, `linkedin?`
  - `CvParsedContent.personalDetails` += `title/website/linkedin: string | null`; `CvParsedContent.skillGroups?: CvSkillGroup[]`
  - `normalizeCvContent(content: CvContent): CvContent`
  - `buildContactLine(p: CvPersonalDetailsSection, opts: { includeBirthdate: boolean; includeMaritalStatus: boolean }): string`

- [ ] **Step 1: Apply the model changes**

In `libs/core/src/lib/models/document.model.ts`:

Replace the `CvPersonalDetailsSection` interface (currently lines 37-45) with:

```ts
export interface CvPersonalDetailsSection extends CvSectionBase {
  key: 'personal_details';
  fullName: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  linkedin?: string;
  birthDate?: string;
  maritalStatus?: string;
}
```

Replace the `CvSkillsSection` interface (currently lines 78-81) with:

```ts
export interface CvSkillGroup {
  label: string;
  values: string[];
}

export interface CvSkillsSection extends CvSectionBase {
  key: 'skills';
  groups: CvSkillGroup[];
}
```

In the `CvParsedContent` interface (currently lines 281-294), replace the
`personalDetails` block and the `skills` field so the whole interface reads:

```ts
export interface CvParsedContent {
  personalDetails: {
    fullName: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
    linkedin: string | null;
  };
  summary: string | null;
  experience: CvParsedExperienceEntry[];
  education: CvParsedEducationEntry[];
  skills: string[];
  skillGroups?: CvSkillGroup[];
  languages: CvParsedLanguageEntry[];
  lowConfidenceNotes: string[];
}
```

- [ ] **Step 2: Write the failing test**

`apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`:

```ts
import type { CvContent, CvPersonalDetailsSection } from '@applye/core';
import { buildContactLine, normalizeCvContent } from './cv-content.util';

describe('normalizeCvContent', () => {
  it('migrates a legacy items[] skills section into a single group', () => {
    const legacy = {
      sections: [{ key: 'skills', order: 0, visible: true, items: ['TypeScript', 'Rust'] }],
    } as unknown as CvContent;
    const out = normalizeCvContent(legacy);
    const skills = out.sections[0] as {
      key: 'skills';
      groups: { label: string; values: string[] }[];
    };
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TypeScript', 'Rust'] }]);
    expect((out.sections[0] as Record<string, unknown>)['items']).toBeUndefined();
  });

  it('leaves an already-grouped skills section untouched', () => {
    const modern = {
      sections: [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [{ label: 'Languages', values: ['TS'] }],
        },
      ],
    } as unknown as CvContent;
    expect(normalizeCvContent(modern).sections[0]).toEqual(modern.sections[0]);
  });
});

describe('buildContactLine', () => {
  const base: CvPersonalDetailsSection = {
    key: 'personal_details',
    order: 0,
    visible: true,
    fullName: 'Vitalii Kasap',
    address: 'Nuremberg, Germany',
    phone: '+49 171 206 4899',
    email: 'v@icloud.com',
    website: 'vitaliikasap.com',
    linkedin: 'linkedin.com/in/vitaliikasap',
  };

  it('joins present fields with a pipe in reference order', () => {
    expect(buildContactLine(base, { includeBirthdate: false, includeMaritalStatus: false })).toBe(
      'Nuremberg, Germany | +49 171 206 4899 | v@icloud.com | vitaliikasap.com | linkedin.com/in/vitaliikasap',
    );
  });

  it('omits empty fields with no dangling separators', () => {
    expect(
      buildContactLine(
        { ...base, website: undefined, linkedin: '' },
        { includeBirthdate: false, includeMaritalStatus: false },
      ),
    ).toBe('Nuremberg, Germany | +49 171 206 4899 | v@icloud.com');
  });

  it('includes birthdate/marital only when toggled on', () => {
    const withExtra = { ...base, birthDate: '1990-01-01', maritalStatus: 'single' };
    expect(
      buildContactLine(withExtra, { includeBirthdate: true, includeMaritalStatus: true }),
    ).toContain('1990-01-01 | single');
    expect(
      buildContactLine(withExtra, { includeBirthdate: false, includeMaritalStatus: false }),
    ).not.toContain('1990-01-01');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: FAIL — `normalizeCvContent`/`buildContactLine` are not exported.

- [ ] **Step 4: Implement the two functions**

In `apps/desktop/src/app/pages/documents/cv-content.util.ts`, update the import
on line 1 to add the new types, then append the functions.

Change line 1 to:

```ts
import {
  CvContent,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvSection,
  CvSectionKey,
  CvSkillGroup,
  CvSkillsSection,
  CvTemplate,
} from '@applye/core';
```

Append at end of file:

```ts
/** Migrates a stored CvContent to the current shape without rewriting content
 * the user authored. Currently: a legacy `items: string[]` skills section
 * becomes a single `{ label: 'Skills', values }` group. Idempotent. */
export function normalizeCvContent(content: CvContent): CvContent {
  const sections = content.sections.map((section) => {
    if (section.key !== 'skills') return section;
    const legacy = section as unknown as {
      key: 'skills';
      order: number;
      visible: boolean;
      sourceHash?: string;
      items?: string[];
      groups?: CvSkillGroup[];
    };
    if (legacy.groups) return section;
    const migrated: CvSkillsSection = {
      key: 'skills',
      order: legacy.order,
      visible: legacy.visible,
      sourceHash: legacy.sourceHash,
      groups: [{ label: 'Skills', values: legacy.items ?? [] }],
    };
    return migrated;
  });
  return { sections };
}

/** Reference-order single-line contact string: location · phone · email ·
 * website · linkedin, then optionally birthdate/marital. Empty fields drop out
 * with no dangling ` | `. */
export function buildContactLine(
  p: CvPersonalDetailsSection,
  opts: { includeBirthdate: boolean; includeMaritalStatus: boolean },
): string {
  return [
    p.address,
    p.phone,
    p.email,
    p.website,
    p.linkedin,
    opts.includeBirthdate ? p.birthDate : undefined,
    opts.includeMaritalStatus ? p.maritalStatus : undefined,
  ]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' | ');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS (5 tests). If TS errors surface elsewhere in `cv-content.util.ts`
from the `CvSkillsSection.groups` rename, they are fixed in Task 3 — but this
file must still compile for the test to run, so also apply Task 3 Step 4 edits
to `sectionFor`/`cvContentToMd`/`markdownToCvContentFallback` now if the
compiler blocks the test. (Cleanest: run Task 3 immediately after.)

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat: enrich cv model with title, links and grouped skills"
```

---

### Task 3: Builder, parser and markdown for the new shape

Wire the enriched parsed shape through `sectionFor`, `parseCvSkillResponse`,
`cvContentToMd`, and `markdownToCvContentFallback`.

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts`
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (extend)

**Interfaces:**

- Consumes: Task 2 types.
- Produces: `buildCvContent` emits `personal_details` with `title/website/linkedin` and `skills` as `groups`; `parseCvSkillResponse` tolerates missing new personal fields and both `skills`/`skillGroups`.

- [ ] **Step 1: Write the failing tests (append to the spec)**

```ts
import { buildCvContent, cvContentToMd, parseCvSkillResponse } from './cv-content.util';
import type { CvParsedContent, CvTemplate } from '@applye/core';

function parsed(over: Partial<CvParsedContent> = {}): CvParsedContent {
  return {
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'v@icloud.com',
      phone: null,
      address: 'Nuremberg',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Senior FE engineer.',
    experience: [],
    education: [],
    skills: [],
    skillGroups: [
      { label: 'Languages', values: ['TypeScript', 'JavaScript'] },
      { label: 'Frameworks', values: ['Angular', 'React'] },
    ],
    languages: [],
    lowConfidenceNotes: [],
    ...over,
  };
}

describe('buildCvContent (enriched)', () => {
  const template = null as unknown as CvTemplate | null;

  it('maps title/website/linkedin onto personal_details', () => {
    const content = buildCvContent(parsed(), template);
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    expect(pd['title']).toBe('Senior Frontend Software Engineer');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
  });

  it('uses skillGroups when present', () => {
    const content = buildCvContent(parsed(), template);
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string }[];
    };
    expect(skills.groups.map((g) => g.label)).toEqual(['Languages', 'Frameworks']);
  });

  it('wraps flat skills into one group when skillGroups is absent', () => {
    const content = buildCvContent(
      parsed({ skillGroups: undefined, skills: ['TS', 'Rust'] }),
      template,
    );
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string; values: string[] }[];
    };
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TS', 'Rust'] }]);
  });
});

describe('parseCvSkillResponse (enriched)', () => {
  it('fills missing new personal fields with null, not undefined', () => {
    const out = parseCvSkillResponse('{"personalDetails":{"fullName":"A"}}');
    expect(out.personalDetails.title).toBeNull();
    expect(out.personalDetails.website).toBeNull();
    expect(out.personalDetails.linkedin).toBeNull();
  });

  it('reads skillGroups from the model JSON', () => {
    const out = parseCvSkillResponse('{"skillGroups":[{"label":"Data","values":["SQL"]}]}');
    expect(out.skillGroups).toEqual([{ label: 'Data', values: ['SQL'] }]);
  });
});

describe('cvContentToMd (grouped skills)', () => {
  it('renders each skill group as a labelled line', () => {
    const md = cvContentToMd(buildCvContent(parsed(), null as unknown as CvTemplate | null));
    expect(md).toContain('**Languages:** TypeScript, JavaScript');
    expect(md).toContain('**Frameworks:** Angular, React');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: FAIL (builder still maps `items`, parser lacks new personal defaults).

- [ ] **Step 3: Update `emptyParsedContent`**

Replace `emptyParsedContent` (currently lines 149-159) with:

```ts
function emptyParsedContent(): CvParsedContent {
  return {
    personalDetails: {
      fullName: null,
      title: null,
      email: null,
      phone: null,
      address: null,
      website: null,
      linkedin: null,
    },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    skillGroups: undefined,
    languages: [],
    lowConfidenceNotes: [],
  };
}
```

- [ ] **Step 4: Update `sectionFor`, `parseCvSkillResponse`, `cvContentToMd`, `markdownToCvContentFallback`**

In `sectionFor`, replace the `personal_details` case body (currently lines 53-64) with:

```ts
    case 'personal_details':
      return {
        key: 'personal_details',
        order,
        visible: true,
        fullName: parsed.personalDetails.fullName ?? '',
        title: parsed.personalDetails.title ?? undefined,
        email: parsed.personalDetails.email ?? undefined,
        phone: parsed.personalDetails.phone ?? undefined,
        address: parsed.personalDetails.address ?? undefined,
        website: parsed.personalDetails.website ?? undefined,
        linkedin: parsed.personalDetails.linkedin ?? undefined,
        birthDate: undefined,
        maritalStatus: undefined,
      };
```

Replace the `skills` case (currently line 94) with:

```ts
    case 'skills': {
      const groups: CvSkillGroup[] = parsed.skillGroups?.length
        ? parsed.skillGroups
        : parsed.skills.length
          ? [{ label: 'Skills', values: parsed.skills }]
          : [];
      return { key: 'skills', order, visible: true, groups };
    }
```

Replace `parseCvSkillResponse` (currently lines 180-189) with a version that
deep-merges `personalDetails` so missing new fields default to null:

```ts
export function parseCvSkillResponse(text: string): CvParsedContent {
  const raw = cleanJsonText(text);
  let parsed: Partial<CvParsedContent>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  const base = emptyParsedContent();
  return {
    ...base,
    ...parsed,
    personalDetails: { ...base.personalDetails, ...(parsed.personalDetails ?? {}) },
  };
}
```

Replace the `skills` branch of `cvContentToMd` (currently lines 279-283) with:

```ts
    } else if (s.key === 'skills') {
      const p = s as Extract<CvSection, { key: 'skills' }>;
      const groups = p.groups.filter((g) => g.values.length);
      if (groups.length) {
        parts.push('## Skills');
        for (const g of groups) parts.push(`**${g.label}:** ${g.values.join(', ')}`);
      }
```

In `markdownToCvContentFallback`, replace the skills section object (currently
lines 324-329, the `key: 'skills'` entry) with:

```ts
      {
        key: 'skills',
        order: 4,
        visible: true,
        groups: [],
      },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS (all cv-content.util tests).

- [ ] **Step 6: Verify no other consumer broke**

Run: `npx nx test desktop`
Expected: PASS. If `onboarding-content.util.spec.ts` fails, it means a shared
type drifted — `cvToProfileMarkdown` consumes `CvParsedContent.skills` (still
`string[]`), so it must still compile untouched. Fix any compile error there by
importing `CvSkillGroup` only where needed; do not change `cvToProfileMarkdown`'s
behavior.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat: build enriched cv sections from grouped skill data"
```

---

### Task 4: Update the AI baseline skill schema

Teach `cv-generate-baseline` to emit the enriched shape: title, website,
linkedin, grouped skills, and `**bold**` emphasis on metrics.

**Files:**

- Modify: `libs/skills/src/cv-generate-baseline/cv-generate-baseline.md`
- Test: covered by the `parseCvSkillResponse` tests in Task 3 (the parser
  already tolerates the new fields); this task adds a fixture round-trip test.

**Interfaces:**

- Produces: model JSON conforming to the schema below (consumed by `parseCvSkillResponse`).

- [ ] **Step 1: Update the `[SYSTEM]` rules**

In `cv-generate-baseline.md`, replace the `personalDetails:` rule (line 42) and
the `skills:` rule (line 46) and add an emphasis rule. The rules block should
read (only these three lines change/added):

```md
- personalDetails: copy fullName/title/email/phone/address/website/linkedin exactly as they appear in profile_md; null for anything not present. `title` is the candidate's current/target role line (e.g. "Senior Frontend Software Engineer"). Never fabricate contact details.
- skillGroups: group skills into labelled categories appropriate to the archetype (e.g. Languages, Frameworks, Build Tools, Data, Cloud & DevOps, Quality) drawn only from profile_md, ordered to foreground what scoring_json indicates scores well. Also emit the flat `skills` array (all skills, ungrouped) for backward compatibility.
- experience bullets: wrap the single most important metric or outcome phrase per bullet in `**double asterisks**` (e.g. "reduced bundle size by **25%**"). At most one or two emphasised spans per bullet; never emphasise a whole bullet.
```

- [ ] **Step 2: Update the output schema block**

Replace the schema (currently lines 53-61) with:

```md
{
"personalDetails": { "fullName": "string or null", "title": "string or null", "email": "string or null", "phone": "string or null", "address": "string or null", "website": "string or null", "linkedin": "string or null" },
"summary": "string or null",
"experience": [ { "company": "string", "role": "string", "startDate": "string or null", "endDate": "string or null", "location": "string or null", "bullets": ["string"] } ],
"education": [ { "institution": "string", "degree": "string", "startDate": "string or null", "endDate": "string or null" } ],
"skills": ["string"],
"skillGroups": [ { "label": "string", "values": ["string"] } ],
"languages": [ { "language": "string", "level": "string" } ],
"lowConfidenceNotes": ["string"]
}
```

- [ ] **Step 3: Update the per-section regenerate rule**

The rule at line 50 lists section names. Change the allowed `{{section}}` values
line so callers can still regenerate `skills` (which now also fills
`skillGroups`). Replace line 50 with:

```md
- If {{section}} is not "all": only fill in that one top-level field with a fresh regeneration; every other top-level field must be its empty value (null for personalDetails/summary, [] for the array fields, omitted for skillGroups). When {{section}} is "skills", fill both `skills` and `skillGroups`. The caller merges just the regenerated field(s) into the existing document and leaves the rest untouched.
```

- [ ] **Step 4: Add a fixture round-trip test**

Append to `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` a test
that a representative baseline-shaped JSON parses and builds cleanly:

```ts
describe('cv-generate-baseline output → content', () => {
  const sample = JSON.stringify({
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'v@icloud.com',
      phone: '+49 171 206 4899',
      address: 'Nuremberg, Germany',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Senior FE engineer with 5+ years.',
    experience: [
      {
        company: 'Celonis',
        role: 'Senior FE Engineer',
        startDate: 'Jan 2026',
        endDate: 'Jun 2026',
        location: 'Munich',
        bullets: ['Cut bundle size by **25%**'],
      },
    ],
    education: [],
    skills: ['TypeScript', 'Angular'],
    skillGroups: [
      { label: 'Languages', values: ['TypeScript'] },
      { label: 'Frameworks', values: ['Angular'] },
    ],
    languages: [{ language: 'English', level: 'C1' }],
    lowConfidenceNotes: [],
  });

  it('parses and builds a full enriched CvContent', () => {
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string }[];
    };
    expect(pd['title']).toBe('Senior Frontend Software Engineer');
    expect(skills.groups.map((g) => g.label)).toEqual(['Languages', 'Frameworks']);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/skills/src/cv-generate-baseline/cv-generate-baseline.md apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat: emit title, grouped skills and bold metrics from baseline skill"
```

---

### Task 5: Rebuild the preview as the reference layout

Rewrite the `@case` preview blocks in `cv-detail.component.html`, add the
component helpers, apply `CvStyle` to the preview container, and add the CSS.

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (preview block, lines 179-281)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss`

**Interfaces:**

- Consumes: `parseInlineEmphasis`, `buildContactLine`, `normalizeCvContent` from Tasks 1-2.
- Produces: preview DOM matching the reference layout.

- [ ] **Step 1: Add component helpers + apply normalization on load**

In `cv-detail.component.ts`:

Add to the imports from `@applye/core` (line 24 region) `parseInlineEmphasis`
and the `CvTextRun`/`CvPersonalDetailsSection` types; add `buildContactLine` and
`normalizeCvContent` to the `../cv-content.util` import (lines 29-36).

Add these members to the class (near `sectionLabelKey`, line 65):

```ts
  protected readonly buildContactLine = buildContactLine;

  runs(text: string): CvTextRun[] {
    return parseInlineEmphasis(text);
  }
```

In `load()`, after `JSON.parse(item.contentJson)` (line 170), pass the parsed
content through `normalizeCvContent` before sorting:

```ts
const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
const content = normalizeCvContent(raw);
const ordered = [...content.sections].sort((a, b) => a.order - b.order);
this.sections.set(ordered);
```

- [ ] **Step 2: Replace the preview markup**

In `cv-detail.component.html`, replace the whole preview container (lines
179-281, the `@if (previewMode())` … `</div>` for `.cvpreview`) with:

```html
@if (previewMode()) {
<div
  class="cvpreview"
  [style.font-family]="style().fontFamily"
  [style.font-size.pt]="style().fontSizePt"
>
  @if (!previewSections().length) {
  <p class="cvpreview__empty">{{ t()('documents.cv_preview_empty') }}</p>
  } @for (section of previewSections(); track section.key) { @switch (section.key) { @case
  ('personal_details') {
  <h2 class="cvpreview__name" [style.color]="style().accentColorHex">
    {{ $any(section).fullName || t()('documents.cv_untitled') }}
  </h2>
  @if ($any(section).title) {
  <p class="cvpreview__title">{{ $any(section).title }}</p>
  }
  <p class="cvpreview__contact">
    {{ buildContactLine($any(section), { includeBirthdate: includeBirthdate(), includeMaritalStatus:
    includeMaritalStatus(), }) }}
  </p>
  } @case ('summary') { @if ($any(section).text) {
  <div class="cvpreview__section">
    <h3 class="cvpreview__section-title" [style.color]="style().accentColorHex">
      {{ t()(sectionLabelKey(section.key)) }}
    </h3>
    <p class="cvpreview__summary">{{ $any(section).text }}</p>
  </div>
  } } @case ('skills') { @if ($any(section).groups.length) {
  <div class="cvpreview__section">
    <h3 class="cvpreview__section-title" [style.color]="style().accentColorHex">
      {{ t()(sectionLabelKey(section.key)) }}
    </h3>
    @for (group of $any(section).groups; track $index) { @if (group.values.length) {
    <p class="cvpreview__skill-row">
      <strong>{{ group.label }}:</strong> {{ group.values.join(', ') }}
    </p>
    } }
  </div>
  } } @case ('experience') { @if ($any(section).entries.length) {
  <div class="cvpreview__section">
    <h3 class="cvpreview__section-title" [style.color]="style().accentColorHex">
      {{ t()(sectionLabelKey(section.key)) }}
    </h3>
    @for (entry of $any(section).entries; track $index) {
    <div class="cvpreview__entry">
      <div class="cvpreview__entry-head">
        <span class="cvpreview__entry-company">{{ entry.company }}</span>
        <span class="cvpreview__entry-meta">{{ entry.location }}</span>
      </div>
      <div class="cvpreview__entry-head">
        <span class="cvpreview__entry-role">{{ entry.role }}</span>
        <span class="cvpreview__entry-dates">
          {{ entry.startDate }} – {{ entry.endDate || t()('documents.cv_present') }}
        </span>
      </div>
      @if (entry.bullets.length) {
      <ul>
        @for (bullet of entry.bullets; track $index) {
        <li>
          @for (run of runs(bullet); track $index) { @if (run.bold) {
          <strong>{{ run.text }}</strong>
          } @else { {{ run.text }} } }
        </li>
        }
      </ul>
      }
    </div>
    }
  </div>
  } } @case ('education') { @if ($any(section).entries.length) {
  <div class="cvpreview__section">
    <h3 class="cvpreview__section-title" [style.color]="style().accentColorHex">
      {{ t()(sectionLabelKey(section.key)) }}
    </h3>
    @for (entry of $any(section).entries; track $index) {
    <div class="cvpreview__entry">
      <div class="cvpreview__entry-head">
        <span class="cvpreview__entry-role">{{ entry.degree }}, {{ entry.institution }}</span>
        <span class="cvpreview__entry-dates">
          {{ entry.startDate }} – {{ entry.endDate || t()('documents.cv_present') }}
        </span>
      </div>
    </div>
    }
  </div>
  } } @case ('languages') { @if ($any(section).items.length) {
  <div class="cvpreview__section">
    <h3 class="cvpreview__section-title" [style.color]="style().accentColorHex">
      {{ t()(sectionLabelKey(section.key)) }}
    </h3>
    <p class="cvpreview__languages">{{ $any(section).items.map((i) => i.language).join(' | ') }}</p>
  </div>
  } } } }
</div>
} @else {
```

(Note: the trailing `@else {` reconnects to the existing edit-mode block that
starts at the old line 282. Do not duplicate it.)

- [ ] **Step 3: Add the preview CSS**

Append to `cv-detail.component.scss`:

```scss
.cvpreview__name {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1.6rem;
  margin: 0;
}
.cvpreview__title {
  font-weight: 600;
  margin: 0.1rem 0 0.4rem;
}
.cvpreview__contact {
  margin: 0 0 0.8rem;
  font-size: 0.85em;
}
.cvpreview__skill-row {
  margin: 0.15rem 0;
}
.cvpreview__entry-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.cvpreview__entry-company {
  font-weight: 700;
}
.cvpreview__entry-meta,
.cvpreview__entry-dates {
  white-space: nowrap;
  font-size: 0.85em;
}
```

- [ ] **Step 4: Verify the preview renders (manual, real app)**

Run the desktop web preview and open a CV document in preview mode:

```bash
npx nx serve desktop --port 4201
```

Then via the preview tools: open the app, navigate to a CV detail, toggle
Preview, and confirm: name is UPPERCASE, a title line appears, the contact row
uses `|` separators, skills render as `Label: values` rows, experience shows
company (bold) + location right, role + dates right, and a bullet containing
`**…**` shows the phrase in bold. Change font/size/colour in edit mode and
confirm the preview reflects it.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss
git commit -m "feat: rebuild cv preview to match reference layout"
```

---

### Task 6: Edit-mode fields + skills-group editing + i18n

Add editor inputs for the new personal fields and switch the skills editor from
a flat list to per-group editing, with i18n keys.

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (edit block, personal_details grid + skills case)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`onSkillsChange`)
- Modify: i18n dictionaries (locate below)

**Interfaces:**

- Consumes: `CvSkillsSection`, `CvSkillGroup`.
- Produces: `onSkillsChange(section, value)` parses a `Label: v1, v2` per-line textarea into groups.

- [ ] **Step 1: Add the personal-detail inputs**

In `cv-detail.component.html`, inside the edit-mode `personal_details` grid
(currently lines 308-349), after the `fullName` input add a `title` input, and
after the `address` input add `website` and `linkedin` inputs:

```html
<input
  type="text"
  [ngModel]="$any(section).title"
  (ngModelChange)="$any(section).title = $event"
  [placeholder]="t()('documents.cv_field_title')"
/>
```

(place directly after the fullName input) and:

```html
<input
  type="text"
  [ngModel]="$any(section).website"
  (ngModelChange)="$any(section).website = $event"
  [placeholder]="t()('documents.cv_field_website')"
/>
<input
  type="text"
  [ngModel]="$any(section).linkedin"
  (ngModelChange)="$any(section).linkedin = $event"
  [placeholder]="t()('documents.cv_field_linkedin')"
/>
```

(place directly after the address input, before the `@if (includeBirthdate())`).

- [ ] **Step 2: Replace the skills editor**

Replace the edit-mode `skills` case (currently lines 426-438) with a
per-group textarea:

```html
@case ('skills') {
<textarea
  [ngModel]="skillGroupsToText($any(section).groups)"
  (ngModelChange)="onSkillsChange($any(section), $event)"
  rows="4"
  [placeholder]="t()('documents.cv_field_skills_hint')"
></textarea>
}
```

- [ ] **Step 3: Add the parse/format helpers to the component**

In `cv-detail.component.ts`, add:

```ts
  skillGroupsToText(groups: CvSkillGroup[]): string {
    return groups.map((g) => `${g.label}: ${g.values.join(', ')}`).join('\n');
  }

  onSkillsChange(section: Extract<CvSection, { key: 'skills' }>, value: string): void {
    section.groups = value
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const idx = line.indexOf(':');
        const label = idx >= 0 ? line.slice(0, idx).trim() : 'Skills';
        const rest = idx >= 0 ? line.slice(idx + 1) : line;
        return {
          label,
          values: rest
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v),
        };
      });
  }
```

Add `CvSkillGroup` to the `@applye/core` type import.

- [ ] **Step 4: Add i18n keys**

Find the locale files and the existing `cv_field_address` key:

```bash
grep -rl "cv_field_address" libs/i18n/src
```

In each locale file returned, add sibling keys next to `cv_field_address`.
English values:

```
"cv_field_title": "Job title",
"cv_field_website": "Website",
"cv_field_linkedin": "LinkedIn"
```

German values (in the `de` locale file):

```
"cv_field_title": "Berufsbezeichnung",
"cv_field_website": "Website",
"cv_field_linkedin": "LinkedIn"
```

Match whatever nesting/format the file uses (JSON object vs. flat). If the repo
has more than two locales, add English text as the fallback for the others.

- [ ] **Step 5: Verify edit → save → reload round-trip (manual, real app)**

With `npx nx serve desktop --port 4201` running: in edit mode, fill Job title /
Website / LinkedIn, edit skills as `Languages: TypeScript, Angular` on one line
and `Data: SQL` on another, Save, navigate away and back, and confirm all fields
persist and the preview shows two skill rows.

- [ ] **Step 6: Full test + lint gate**

Run:

```bash
npx nx test desktop
npx nx test core
npx nx lint desktop
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts libs/i18n
git commit -m "feat: edit cv title, links and grouped skills"
```

---

## Self-Review

**Spec coverage (Phase 1 items #1-4):**

- Model: title/website/linkedin (Task 2), grouped skills (Tasks 2-3), inline emphasis runs (Task 1) — covered. `CvStyle.fontWeight` + per-section overrides are Phase 4, intentionally deferred.
- Skill (#2): Task 4 — covered.
- Builder (#3): Task 3 — covered.
- Preview template (#4): Tasks 5-6 — covered, style vars applied.
- Migration/backward-compat: `normalizeCvContent` (Task 2) applied on load (Task 5); additive parse contract keeps `onboarding-content.util` working (Task 3 Step 6).

**Type consistency:** `CvSkillGroup { label; values[] }`, `CvSkillsSection.groups`, `CvTextRun { text; bold }`, `buildContactLine(p, {includeBirthdate, includeMaritalStatus})`, `parseInlineEmphasis(string): CvTextRun[]`, `normalizeCvContent(CvContent): CvContent` — used identically across tasks.

**Known deferrals (not Phase 1):** WYSIWYG PDF export (Phase 2), structured DOCX (Phase 3), font-weight control + per-section overrides (Phase 4). Export still uses the old markdown→printpdf/docx path until Phase 2-3 — acceptable; the preview is the visible fix.

**Out-of-plan verification:** `cv-list` generation calls `buildCvContent`; its output is enriched automatically with no `cv-list` change required (verified: it passes `parseCvSkillResponse` output to `buildCvContent`). Confirm during Task 5 Step 4 that a freshly generated CV renders correctly.
