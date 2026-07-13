# CV Refactor Phase B — Lock the AI Content Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "AI writes content only, never style/theme" guarantee _structural at the parse boundary_ (not just enforced downstream), add regression coverage for the untested single-section AI-merge path, and document the content contract.

**Architecture:** A scout confirmed the pipeline is already content-only in practice — both prompts (`cv-import`, `cv-generate-baseline`) emit a style-free JSON schema, `CvParsedContent` has no style keys, `buildCvContent`/`sectionFor` build sections field-by-field (dropping unknown keys before persistence), and `styleJson`/`themeId` are written only from local UI signals. The residual soft spot: `parseCvSkillResponse` does `{...base, ...parsed}` — an un-whitelisted spread — so the content-only filter lives only downstream in `buildCvContent`. A future path that persisted `parsed` directly would bypass it. This phase moves the guarantee to the boundary (explicit field-pick) and locks it with tests. No behaviour change for well-formed AI output.

**Tech Stack:** TypeScript, Angular (Jest via `nx test desktop`), pure util layer (`cv-content.util.ts`), types in `@applye/core`.

## Global Constraints

- Scope is `apps/desktop/src/app/pages/documents/cv-content.util.ts` (+ its spec) and one new docs file only. No changes to `@applye/core` types, the skill prompt `.md` files' schemas, Rust, or dependencies.
- No behaviour change for valid AI output: for a well-formed `CvParsedContent` JSON, `parseCvSkillResponse` must return exactly what it returns today. Only unknown/extraneous keys change (they get stripped).
- Deep entry-level fields (rogue keys _inside_ an `experience`/`education` entry) stay filtered downstream by `sectionFor` — this phase hardens the top level + `personalDetails`; do not attempt deep per-entry schema validation here (YAGNI; `buildCvContent` already covers it).
- Commit subjects lowercase (commitlint: no sentence/start/pascal/upper case); Conventional Commit format; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Every commit passes repo pre-commit hooks (lint-staged: prettier + lint on staged files).

---

### Task 1: Harden `parseCvSkillResponse` at the boundary + regression tests

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` — replace the return object of `parseCvSkillResponse` (currently lines 297–302) with an explicit field-pick.
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` — add whitelist tests, an end-to-end contract test, and `mergeRegeneratedSection` regression tests.

**Interfaces:**

- Consumes: existing exports `parseCvSkillResponse(text: string): CvParsedContent`, `buildCvContent(parsed, template)`, `mergeRegeneratedSection(content, key, parsed, sourceHash)`, `emptyParsedContent()` (private), type `CvParsedContent` (`@applye/core`).
- Produces: `parseCvSkillResponse` returns a value assembled by explicit field selection — top-level keys are exactly the `CvParsedContent` members; `personalDetails` contains exactly its 7 fields. No new exported symbols.

- [ ] **Step 1: Write the failing whitelist + contract + merge tests**

Add to `cv-content.util.spec.ts` (inside the existing top-level `describe`, alongside the current `parseCvSkillResponse` tests). Import whatever isn't already imported at the top of the spec: `parseCvSkillResponse`, `buildCvContent`, `mergeRegeneratedSection` from `./cv-content.util`, and `CvContent` from `@applye/core`.

```ts
describe('parseCvSkillResponse — content-only boundary', () => {
  it('strips unknown top-level keys (style/theme/fontFamily) from AI JSON', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        summary: 'Hi',
        style: { fontFamily: 'Comic Sans', accentColorHex: '#ff0000' },
        theme: 2,
        themeId: 9,
        fontFamily: 'Arial',
      }),
    );
    expect(res.summary).toBe('Hi');
    expect(Object.keys(res).sort()).toEqual(
      [
        'education',
        'experience',
        'languages',
        'lowConfidenceNotes',
        'personalDetails',
        'skillGroups',
        'skills',
        'summary',
      ].sort(),
    );
    expect((res as Record<string, unknown>)['style']).toBeUndefined();
    expect((res as Record<string, unknown>)['theme']).toBeUndefined();
    expect((res as Record<string, unknown>)['themeId']).toBeUndefined();
    expect((res as Record<string, unknown>)['fontFamily']).toBeUndefined();
  });

  it('strips unknown keys nested inside personalDetails', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', fontFamily: 'Arial', accentColorHex: '#000' },
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(Object.keys(res.personalDetails).sort()).toEqual(
      ['address', 'email', 'fullName', 'linkedin', 'phone', 'title', 'website'].sort(),
    );
    expect((res.personalDetails as Record<string, unknown>)['fontFamily']).toBeUndefined();
    expect((res.personalDetails as Record<string, unknown>)['accentColorHex']).toBeUndefined();
  });

  it('preserves all valid content fields unchanged', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', email: 'a@b.c' },
        summary: 'S',
        experience: [
          { company: 'X', role: 'Y', startDate: '2020', endDate: '2021', bullets: ['b'] },
        ],
        skills: ['ts'],
        languages: [{ language: 'EN', level: 'C2' }],
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(res.personalDetails.email).toBe('a@b.c');
    expect(res.personalDetails.title).toBeNull();
    expect(res.summary).toBe('S');
    expect(res.experience).toHaveLength(1);
    expect(res.skills).toEqual(['ts']);
    expect(res.languages).toEqual([{ language: 'EN', level: 'C2' }]);
  });

  it('contract: a rogue style key in AI JSON never reaches a saved CvContent', () => {
    const parsed = parseCvSkillResponse(
      JSON.stringify({ summary: 'S', style: { fontFamily: 'Comic Sans' }, accentColorHex: '#f00' }),
    );
    const content = buildCvContent(parsed, null);
    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain('fontFamily');
    expect(serialized).not.toContain('accentColorHex');
    expect(serialized.toLowerCase()).not.toContain('comic sans');
  });
});

describe('mergeRegeneratedSection', () => {
  const baseContent: CvContent = {
    sections: [
      { key: 'personal_details', order: 0, visible: true, fullName: 'Ada' } as never,
      { key: 'summary', order: 1, visible: true, text: 'old summary' } as never,
      { key: 'experience', order: 2, visible: true, entries: [] } as never,
    ],
  };

  it('updates only the targeted section and stamps its sourceHash', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'new summary' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'hash-1');
    const summary = out.sections.find((s) => s.key === 'summary') as {
      text: string;
      sourceHash: string;
    };
    expect(summary.text).toBe('new summary');
    expect(summary.sourceHash).toBe('hash-1');
  });

  it('leaves non-targeted sections untouched (content, order, visible)', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'new summary' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'hash-1');
    const personal = out.sections.find((s) => s.key === 'personal_details') as {
      fullName: string;
      order: number;
    };
    const exp = out.sections.find((s) => s.key === 'experience') as {
      order: number;
      visible: boolean;
    };
    expect(personal.fullName).toBe('Ada');
    expect(personal.order).toBe(0);
    expect(exp.order).toBe(2);
    expect(exp.visible).toBe(true);
  });

  it('preserves the targeted section order and visible flag', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'x' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'h');
    const summary = out.sections.find((s) => s.key === 'summary') as {
      order: number;
      visible: boolean;
    };
    expect(summary.order).toBe(1);
    expect(summary.visible).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts 2>&1 | tail -30`
Expected: the two whitelist tests and the contract test FAIL (today `parseCvSkillResponse` spreads `...parsed`, so `style`/`theme`/`fontFamily` survive → `Object.keys` includes them). The `mergeRegeneratedSection` tests should PASS already (that function is correct; these lock its behaviour). If a `mergeRegeneratedSection` test fails, the section-shape sample is wrong — fix the sample, not the source.

- [ ] **Step 3: Implement the explicit field-pick in `parseCvSkillResponse`**

In `cv-content.util.ts`, replace the current return block (lines ~297–302):

```ts
const base = emptyParsedContent();
return {
  ...base,
  ...parsed,
  personalDetails: { ...base.personalDetails, ...(parsed.personalDetails ?? {}) },
};
```

with an explicit whitelist (never spreads `...parsed`, so unknown keys cannot survive):

```ts
const p = parsed.personalDetails ?? {};
return {
  personalDetails: {
    fullName: p.fullName ?? null,
    title: p.title ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    address: p.address ?? null,
    website: p.website ?? null,
    linkedin: p.linkedin ?? null,
  },
  summary: parsed.summary ?? null,
  experience: parsed.experience ?? [],
  education: parsed.education ?? [],
  skills: parsed.skills ?? [],
  skillGroups: parsed.skillGroups,
  languages: parsed.languages ?? [],
  lowConfidenceNotes: parsed.lowConfidenceNotes ?? [],
};
```

Note: `emptyParsedContent()` is no longer referenced by this function. If no other code uses it (check with grep — it is `function emptyParsedContent`, file-private), leave it in place only if still referenced; otherwise delete the now-dead helper. Verify before deleting.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts 2>&1 | tail -30`
Expected: all new tests PASS, and the pre-existing `parseCvSkillResponse`/`repairTruncatedJson`/`buildCvContent`/`normalizeCvContent` tests still PASS (no regression). If `emptyParsedContent` was deleted, no `no-unused-vars`/TS error remains.

- [ ] **Step 5: Full desktop test + typecheck**

Run: `npx nx test desktop 2>&1 | tail -12 && npx nx build desktop 2>&1 | tail -8`
Expected: all suites PASS; build clean (only pre-existing warnings).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "refactor(documents): whitelist ai parse output to content-only fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Document the AI content contract

**Files:**

- Create: `docs/product/ai-cv-content-contract.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the contract doc**

Create `docs/product/ai-cv-content-contract.md` with this content:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/product/ai-cv-content-contract.md
git commit -m "docs(documents): add ai cv content contract note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verification gate

**Files:** none — verification only.

- [ ] **Step 1: Confirm the boundary is whitelist-based**

Run: `grep -nA14 "export function parseCvSkillResponse" apps/desktop/src/app/pages/documents/cv-content.util.ts`
Expected: the function body contains no `...parsed` spread; each field is assigned explicitly.

- [ ] **Step 2: Full desktop suite green**

Run: `npx nx test desktop 2>&1 | tail -12`
Expected: all suites PASS (including the new whitelist + contract + `mergeRegeneratedSection` tests).

- [ ] **Step 3: No commit** — verification only. Phase B complete.

## Self-Review

- **Spec coverage:** Spec Phase B = "document + guard content-only AI import/generate; `normalizeCvContent` validation; confirm skills emit `CvContent` only." Scout confirmed skills already emit content-only, so the "confirm" is satisfied (documented in Task 2). "Guard" = Task 1 boundary whitelist + contract test. "Document" = Task 2. `normalizeCvContent` needs no change — scout confirmed it is migration-only and style-free; no task touches it (correctly).
- **Placeholder scan:** No TBD/TODO. Every code and test step shows complete content. Step 3's `emptyParsedContent` deletion is conditional with an explicit "verify before deleting" instruction (not a placeholder — a real branch).
- **Type consistency:** `parseCvSkillResponse(text): CvParsedContent`, `buildCvContent(parsed, null)`, `mergeRegeneratedSection(content, key, parsed, sourceHash)` used consistently across Task 1 tests and match their definitions in `cv-content.util.ts`. Test section samples cast via `as never`/`as` because the discriminated-union members require all fields — acceptable in tests to build minimal fixtures.
