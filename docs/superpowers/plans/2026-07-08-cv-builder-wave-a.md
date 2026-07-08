# CV Builder Wave A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the blockers that make the CV builder unusable: no name/personal-details section, cannot add experience/education entries, import fails on long CVs ("invalid JSON"), and profile fields not carried into the CV.

**Architecture:** `personal_details` is guaranteed by the builder (not the template). Entry/bullet editing gets real add/remove controls. The Rust AI output cap becomes configurable (default 8192) and the TS parser gains a truncation-repair fallback. Profile markdown carries the new identity fields and a "Pull from profile" action fills them.

**Tech Stack:** TypeScript, Angular (standalone, signals), Rust (Tauri, sqlx), Nx, Jest, cargo. No new dependencies.

## Global Constraints

- Branch: `feat/cv-default-template` (continues Phase 1). Never commit to `main`.
- Commit subjects: Conventional Commits, subject **lowercase** (commitlint rejects sentence/pascal/upper case). End the commit body with the repo `Co-Authored-By` trailer only if you add a body.
- **Do NOT edit any existing migration file** — `sqlx::migrate!` validates checksums; editing an applied migration breaks existing installs. New migrations only. Next free number is `0013` (`0012_onboarding_seen.sql` exists).
- `AiRequest` is serialized camelCase across the IPC boundary (Rust `#[serde(rename_all = "camelCase")]`). A new Rust field `max_tokens` ↔ TS `maxTokens`.
- Additive contract preserved from Phase 1: keep `CvParsedContent.skills`; `skillGroups` optional.
- Default AI output cap when unset: **8192**. CV generate/import/pull callers pass `maxTokens: 8192` explicitly.
- All user-facing UI strings via `libs/i18n` (single file `libs/i18n/src/lib/translations/translations.ts`, `en` + `de` blocks). Skill/content strings are data, not UI.
- Test commands: `npx nx test core`, `npx nx test desktop`, and Rust `cargo test` in `apps/desktop/src-tauri`. Target a TS file with `--testPathPattern=<substr>`.
- Style→export and per-section styling are OUT OF SCOPE (Waves B/C).

---

### Task 1: `personal_details` always present (F1)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (`buildCvContent`, `normalizeCvContent`)
- Create: `apps/desktop/src-tauri/migrations/0013_cv_templates_personal_details.sql`
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (extend)
- Test (Rust): `apps/desktop/src-tauri/src/commands/documents.rs` (add a migration-effect test near existing `cv_templates` tests)

**Interfaces:**

- Produces: `buildCvContent` always yields a `personal_details` section (first, order 0, when the template omits it); `normalizeCvContent` adds an empty `personal_details` when a stored CV lacks one.

- [ ] **Step 1: Write the failing TS tests (append to spec)**

```ts
import { buildCvContent, normalizeCvContent } from './cv-content.util';
import type { CvContent, CvParsedContent, CvTemplate } from '@applye/core';

function parsedMin(): CvParsedContent {
  return {
    personalDetails: {
      fullName: 'Vitalii Kasap',
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

describe('buildCvContent personal_details guarantee', () => {
  it('forces personal_details first when the template omits it', () => {
    const template = {
      id: 1,
      sectionsJson: JSON.stringify(['summary', 'experience', 'skills']),
      includePhoto: false,
      includeBirthdate: false,
      includeMaritalStatus: false,
      isBuiltin: true,
    } as CvTemplate;
    const content = buildCvContent(parsedMin(), template);
    expect(content.sections[0].key).toBe('personal_details');
    expect(content.sections[0].order).toBe(0);
    const pd = content.sections[0] as Record<string, unknown>;
    expect(pd['fullName']).toBe('Vitalii Kasap');
    expect(content.sections.map((s) => s.key)).toEqual([
      'personal_details',
      'summary',
      'experience',
      'skills',
    ]);
  });

  it('keeps template order when personal_details is already present', () => {
    const template = {
      id: 1,
      sectionsJson: JSON.stringify(['personal_details', 'summary']),
      includePhoto: false,
      includeBirthdate: false,
      includeMaritalStatus: false,
      isBuiltin: true,
    } as CvTemplate;
    const content = buildCvContent(parsedMin(), template);
    expect(content.sections.map((s) => s.key)).toEqual(['personal_details', 'summary']);
  });
});

describe('normalizeCvContent personal_details', () => {
  it('adds an empty personal_details section when a stored CV lacks one', () => {
    const legacy = {
      sections: [{ key: 'summary', order: 0, visible: true, text: 'hi' }],
    } as unknown as CvContent;
    const out = normalizeCvContent(legacy);
    expect(out.sections.some((s) => s.key === 'personal_details')).toBe(true);
    const pd = out.sections.find((s) => s.key === 'personal_details') as Record<string, unknown>;
    expect(pd['fullName']).toBe('');
    expect(pd['order']).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: FAIL (template omitting personal_details drops it; normalize doesn't add it).

- [ ] **Step 3: Update `buildCvContent`**

Replace `buildCvContent` (currently ~lines 38-42) with:

```ts
export function buildCvContent(parsed: CvParsedContent, template: CvTemplate | null): CvContent {
  const order = templateSectionOrder(template);
  // personal_details is identity, not layout — guarantee it regardless of the
  // template's section list (some built-ins omit it). Force it first.
  const keys = order.includes('personal_details') ? order : ['personal_details', ...order];
  const sections: CvSection[] = keys.map((key, index) => sectionFor(key, index, parsed, template));
  return { sections };
}
```

- [ ] **Step 4: Update `normalizeCvContent`**

At the end of `normalizeCvContent` (after the skills-migration map, before `return`), add a personal_details guarantee. Replace the function's return with:

```ts
const hasPersonal = sections.some((s) => s.key === 'personal_details');
if (!hasPersonal) {
  const shifted = sections.map((s) => ({ ...s, order: s.order + 1 }));
  const personal: CvSection = { key: 'personal_details', order: 0, visible: true, fullName: '' };
  return { sections: [personal, ...shifted] };
}
return { sections };
```

(Keep the existing skills-migration logic that produces `sections` above this block.)

- [ ] **Step 5: Run TS tests to verify pass**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS.

- [ ] **Step 6: Create migration 0013**

`apps/desktop/src-tauri/migrations/0013_cv_templates_personal_details.sql`:

```sql
-- Built-in CV templates DE-ATS-modern / US / UK / generic were seeded (0011)
-- without `personal_details` in sections_json, so generated CVs had no name
-- section. Prepend it for the built-ins that lack it. Idempotent via the
-- NOT LIKE guard; never removes a section.
UPDATE cv_templates
SET sections_json = '["personal_details","summary","experience","education","skills","languages"]'
WHERE is_builtin = 1 AND name = 'DE-ATS-modern' AND sections_json NOT LIKE '%personal_details%';

UPDATE cv_templates
SET sections_json = json_insert(sections_json, '$[#]', 'personal_details')
WHERE is_builtin = 1 AND name IN ('US', 'UK', 'generic') AND sections_json NOT LIKE '%personal_details%';

-- The builder forces personal_details first regardless of position, so the
-- json_insert append above is sufficient for US/UK/generic; DE-ATS-modern is
-- set explicitly to keep its canonical order.
```

- [ ] **Step 7: Add a Rust test for the migration effect**

In `apps/desktop/src-tauri/src/commands/documents.rs`, inside the existing
`#[cfg(test)]` module (find where other `cv_templates` / migration tests build
an in-memory pool — reuse that helper if present; otherwise use the pattern
below). Add:

```rust
    #[tokio::test]
    async fn migration_0013_adds_personal_details_to_builtin_templates() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT name, sections_json FROM cv_templates WHERE is_builtin = 1")
                .fetch_all(&pool)
                .await
                .unwrap();
        for (name, sections) in &rows {
            assert!(
                sections.contains("personal_details"),
                "built-in template {name} still lacks personal_details: {sections}"
            );
        }
        // DE-traditional was already correct and must be unchanged (still has photo first).
        let de_trad = rows.iter().find(|(n, _)| n == "DE-traditional").unwrap();
        assert!(de_trad.1.starts_with("[\"photo\""));
    }
```

If the test module already has a `fn test_pool()`/`setup_db()` helper, use it
instead of the inline `connect` + `migrate!`.

- [ ] **Step 8: Run Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test migration_0013 && cargo test cv_templates`
Expected: PASS (new test + existing template tests).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts apps/desktop/src-tauri/migrations/0013_cv_templates_personal_details.sql apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "fix: always include personal details section in generated cv"
```

---

### Task 2: Add/remove experience & education entries + bullets (F2)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (edit-mode experience/education cases)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (button styling if needed)
- Modify: i18n `libs/i18n/src/lib/translations/translations.ts` (en + de)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (pure entry-factory helpers) OR a small component-free unit — see Step 1.

**Interfaces:**

- Produces: component methods `addEntry(section)`, `removeEntry(section, i)`, `addBullet(entry)`, `removeBullet(entry, i)`; pure factories `blankExperienceEntry()`, `blankEducationEntry()` in `cv-content.util.ts`.

- [ ] **Step 1: Write failing tests for the pure factories (append to cv-content.util.spec.ts)**

```ts
import { blankEducationEntry, blankExperienceEntry } from './cv-content.util';

describe('blank entry factories', () => {
  it('creates an empty experience entry with an empty bullet', () => {
    expect(blankExperienceEntry()).toEqual({
      company: '',
      role: '',
      startDate: '',
      endDate: '',
      location: '',
      bullets: [''],
    });
  });
  it('creates an empty education entry', () => {
    expect(blankEducationEntry()).toEqual({
      institution: '',
      degree: '',
      startDate: '',
      endDate: '',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: FAIL (factories not exported).

- [ ] **Step 3: Add the factories to `cv-content.util.ts`**

```ts
import type { CvEducationEntry, CvExperienceEntry } from '@applye/core';

export function blankExperienceEntry(): CvExperienceEntry {
  return { company: '', role: '', startDate: '', endDate: '', location: '', bullets: [''] };
}

export function blankEducationEntry(): CvEducationEntry {
  return { institution: '', degree: '', startDate: '', endDate: '' };
}
```

(Add `CvEducationEntry`/`CvExperienceEntry` to the existing `@applye/core` import if not already present.)

- [ ] **Step 4: Run to verify pass**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS.

- [ ] **Step 5: Add component methods to `cv-detail.component.ts`**

Add `blankExperienceEntry`/`blankEducationEntry` to the `../cv-content.util` import, and add methods (near `onSkillsChange`):

```ts
  addEntry(section: Extract<CvSection, { key: 'experience' | 'education' }>): void {
    if (section.key === 'experience') section.entries.push(blankExperienceEntry());
    else section.entries.push(blankEducationEntry());
    this.sections.set([...this.sections()]);
  }

  removeEntry(section: Extract<CvSection, { key: 'experience' | 'education' }>, index: number): void {
    section.entries.splice(index, 1);
    this.sections.set([...this.sections()]);
  }

  addBullet(entry: { bullets: string[] }): void {
    entry.bullets.push('');
    this.sections.set([...this.sections()]);
  }

  removeBullet(entry: { bullets: string[] }, index: number): void {
    entry.bullets.splice(index, 1);
    this.sections.set([...this.sections()]);
  }
```

(The `this.sections.set([...])` re-emits the signal so the OnPush view updates.)

- [ ] **Step 6: Add the edit-mode UI**

In `cv-detail.component.html`, the edit-mode `@case ('experience')` block: after
the `@for (entry ...)` loop that renders each entry, add a remove button inside
each entry and an add-entry button after the loop, plus bullet add/remove. Replace
the experience `@case` body with:

```html
@case ('experience') { @for (entry of $any(section).entries; track $index) {
<div class="cvdetail__entry">
  <div class="cvdetail__entry-bar">
    <button
      class="icon-btn"
      type="button"
      [attr.aria-label]="t()('documents.cv_remove_entry')"
      (click)="removeEntry($any(section), $index)"
    >
      ×
    </button>
  </div>
  <div class="cvdetail__grid">
    <input
      type="text"
      [ngModel]="entry.role"
      (ngModelChange)="entry.role = $event"
      [placeholder]="t()('documents.cv_field_role')"
    />
    <input
      type="text"
      [ngModel]="entry.company"
      (ngModelChange)="entry.company = $event"
      [placeholder]="t()('documents.cv_field_company')"
    />
    <input
      type="text"
      [ngModel]="entry.startDate"
      (ngModelChange)="entry.startDate = $event"
      [placeholder]="t()('documents.cv_field_start_date')"
    />
    <input
      type="text"
      [ngModel]="entry.endDate"
      (ngModelChange)="entry.endDate = $event"
      [placeholder]="t()('documents.cv_field_end_date')"
    />
  </div>
  @for (bullet of entry.bullets; track $index) {
  <div class="cvdetail__bullet-row">
    <input
      type="text"
      [ngModel]="bullet"
      (ngModelChange)="entry.bullets[$index] = $event"
      [placeholder]="t()('documents.cv_field_bullet')"
    />
    <button
      class="icon-btn"
      type="button"
      [attr.aria-label]="t()('documents.cv_remove_bullet')"
      (click)="removeBullet(entry, $index)"
    >
      ×
    </button>
  </div>
  }
  <button appButton variant="secondary" size="sm" type="button" (click)="addBullet(entry)">
    {{ t()('documents.cv_add_bullet') }}
  </button>
</div>
}
<button appButton variant="secondary" size="sm" type="button" (click)="addEntry($any(section))">
  {{ t()('documents.cv_add_experience') }}
</button>
}
```

Replace the education `@case` body with:

```html
@case ('education') { @for (entry of $any(section).entries; track $index) {
<div class="cvdetail__entry">
  <div class="cvdetail__entry-bar">
    <button
      class="icon-btn"
      type="button"
      [attr.aria-label]="t()('documents.cv_remove_entry')"
      (click)="removeEntry($any(section), $index)"
    >
      ×
    </button>
  </div>
  <div class="cvdetail__grid">
    <input
      type="text"
      [ngModel]="entry.degree"
      (ngModelChange)="entry.degree = $event"
      [placeholder]="t()('documents.cv_field_degree')"
    />
    <input
      type="text"
      [ngModel]="entry.institution"
      (ngModelChange)="entry.institution = $event"
      [placeholder]="t()('documents.cv_field_institution')"
    />
    <input
      type="text"
      [ngModel]="entry.startDate"
      (ngModelChange)="entry.startDate = $event"
      [placeholder]="t()('documents.cv_field_start_date')"
    />
    <input
      type="text"
      [ngModel]="entry.endDate"
      (ngModelChange)="entry.endDate = $event"
      [placeholder]="t()('documents.cv_field_end_date')"
    />
  </div>
</div>
}
<button appButton variant="secondary" size="sm" type="button" (click)="addEntry($any(section))">
  {{ t()('documents.cv_add_education') }}
</button>
}
```

Note: the experience bullets were previously a single newline-joined textarea;
this replaces it with per-bullet inputs so bullets can be added/removed
individually. Confirm `ButtonDirective` (`appButton`) is already imported in the
component (it is — used in the header).

- [ ] **Step 7: Add i18n keys**

In `libs/i18n/src/lib/translations/translations.ts`, add to BOTH the `en` and
`de` `documents` blocks (find `cv_field_role` as an anchor):

English:

```
"cv_add_experience": "+ Add experience",
"cv_add_education": "+ Add education",
"cv_add_bullet": "+ Add bullet",
"cv_remove_entry": "Remove entry",
"cv_remove_bullet": "Remove bullet",
"cv_field_bullet": "Achievement / responsibility"
```

German:

```
"cv_add_experience": "+ Erfahrung hinzufügen",
"cv_add_education": "+ Ausbildung hinzufügen",
"cv_add_bullet": "+ Punkt hinzufügen",
"cv_remove_entry": "Eintrag entfernen",
"cv_remove_bullet": "Punkt entfernen",
"cv_field_bullet": "Leistung / Aufgabe"
```

- [ ] **Step 8: Minimal SCSS for the new rows**

Append to `cv-detail.component.scss`:

```scss
.cvdetail__entry-bar {
  display: flex;
  justify-content: flex-end;
}
.cvdetail__bullet-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.cvdetail__bullet-row input {
  flex: 1;
}
```

- [ ] **Step 9: Verify build + tests + lint**

Run: `npx nx test desktop --testPathPattern=cv-content.util` and `npx nx lint desktop`
Expected: PASS / no new lint errors on changed files.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts libs/i18n
git commit -m "feat: add and remove cv experience, education and bullet entries"
```

---

### Task 3: Truncation-repair for AI JSON (F3 — TS half)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (`repairTruncatedJson`, `parseCvSkillResponse`)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (extend)

**Interfaces:**

- Produces: `repairTruncatedJson(raw: string): string | null`; `parseCvSkillResponse` uses it as a fallback before throwing.

- [ ] **Step 1: Write failing tests (append)**

```ts
import { parseCvSkillResponse, repairTruncatedJson } from './cv-content.util';

describe('repairTruncatedJson', () => {
  it('returns already-valid JSON unchanged (parseable)', () => {
    const s = '{"a":1,"b":[2,3]}';
    expect(JSON.parse(repairTruncatedJson(s)!)).toEqual({ a: 1, b: [2, 3] });
  });
  it('recovers a value truncated mid-string', () => {
    const truncated = '{"fullName":"VITALII KASAP","summary":"Senior Frontend Engineer specializ';
    const repaired = repairTruncatedJson(truncated)!;
    const obj = JSON.parse(repaired);
    expect(obj.fullName).toBe('VITALII KASAP');
    expect(typeof obj.summary).toBe('string');
  });
  it('recovers a truncated array of objects', () => {
    const truncated = '{"experience":[{"company":"A","role":"Dev"},{"company":"B","role":"Le';
    const obj = JSON.parse(repairTruncatedJson(truncated)!);
    expect(obj.experience[0]).toEqual({ company: 'A', role: 'Dev' });
    expect(Array.isArray(obj.experience)).toBe(true);
  });
  it('returns null when there is no JSON object at all', () => {
    expect(repairTruncatedJson('totally not json')).toBeNull();
  });
});

describe('parseCvSkillResponse repair fallback', () => {
  it('recovers personalDetails from a truncated response', () => {
    const truncated =
      '{"personalDetails":{"fullName":"VITALII KASAP","email":null,"phone":"+49","address":"Nuremberg"},"summary":"Senior Frontend Software Engineer (7+ years) specializ';
    const out = parseCvSkillResponse(truncated);
    expect(out.personalDetails.fullName).toBe('VITALII KASAP');
    expect(out.personalDetails.address).toBe('Nuremberg');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: FAIL (`repairTruncatedJson` not exported; parse throws on truncated).

- [ ] **Step 3: Implement `repairTruncatedJson` + a `closeOpenStructures` helper**

Add to `cv-content.util.ts`:

```ts
/** Closes any open string and open braces/brackets of `s`, or returns null if
 * `s` ends on a separator/colon that cannot be closed into valid JSON. */
function closeOpenStructures(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (!stack.length) return null;
      stack.pop();
    }
  }
  let out = s.replace(/\s+$/, '');
  if (/[,:]$/.test(out)) return null; // dangling separator — caller trims further
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Best-effort recovery of a JSON object from a response truncated mid-value
 * (an output-token cap cutting the model off). Trims from the end to the
 * longest prefix that becomes valid once open strings/brackets are closed.
 * Pure, never throws, bounded to the input length. Returns a parseable JSON
 * string or null. */
export function repairTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const body = raw.slice(start);
  try {
    JSON.parse(body);
    return body;
  } catch {
    // fall through to trim-and-close
  }
  for (let end = body.length; end > 0; end--) {
    const closed = closeOpenStructures(body.slice(0, end));
    if (closed === null) continue;
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      // keep trimming
    }
  }
  return null;
}
```

- [ ] **Step 4: Wire repair into `parseCvSkillResponse`**

Replace `parseCvSkillResponse` with:

```ts
function tryParseParsed(s: string): Partial<CvParsedContent> | null {
  try {
    return JSON.parse(s) as Partial<CvParsedContent>;
  } catch {
    return null;
  }
}

export function parseCvSkillResponse(text: string): CvParsedContent {
  const raw = cleanJsonText(text);
  let parsed = tryParseParsed(raw);
  if (!parsed) {
    const repaired = repairTruncatedJson(raw);
    if (repaired) parsed = tryParseParsed(repaired);
  }
  if (!parsed) {
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

- [ ] **Step 5: Run to verify pass**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS (all repair + parse tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "fix: repair truncated ai json before failing cv parse"
```

---

### Task 4: Configurable AI output cap (F3 — Rust + wiring)

**Files:**

- Modify: `apps/desktop/src-tauri/src/ai/mod.rs` (`AiRequest.max_tokens`)
- Modify: `apps/desktop/src-tauri/src/ai/api.rs` (use `req.max_tokens`, default 8192, both paths)
- Modify: `libs/data/src/lib/services/ai.service.ts` (TS `AiRequest.maxTokens`)
- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts` (import + generate callers pass 8192)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`regenerateSection` caller passes 8192)
- Test (Rust): `apps/desktop/src-tauri/src/ai/api.rs` (`#[cfg(test)]`)

**Interfaces:**

- Consumes: nothing new.
- Produces: `AiRequest` carries optional `maxTokens`/`max_tokens`; default 8192 applied in Rust.

- [ ] **Step 1: Add the Rust field**

In `apps/desktop/src-tauri/src/ai/mod.rs`, add to `AiRequest` (after `language`):

```rust
    #[serde(default)]
    pub max_tokens: Option<u32>,
```

- [ ] **Step 2: Use it in both provider paths (write a test first)**

Add a test to `apps/desktop/src-tauri/src/ai/api.rs` `#[cfg(test)]` that pins the
default-vs-override resolution. Extract the cap into a tiny helper so it's unit
testable without a network call:

```rust
// near the top of api.rs, replace `const MAX_TOKENS: u32 = 2048;` with:
const DEFAULT_MAX_TOKENS: u32 = 8192;

fn resolve_max_tokens(req: &AiRequest) -> u32 {
    req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS)
}
```

Test:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{AiMode, AiRequest};

    fn req(max: Option<u32>) -> AiRequest {
        AiRequest {
            mode: AiMode::Api,
            provider: "claude".into(),
            model: "m".into(),
            system_prompt: "s".into(),
            user_prompt: "u".into(),
            language: None,
            max_tokens: max,
        }
    }

    #[test]
    fn default_cap_is_8192_when_unset() {
        assert_eq!(resolve_max_tokens(&req(None)), 8192);
    }

    #[test]
    fn cap_honors_explicit_override() {
        assert_eq!(resolve_max_tokens(&req(Some(4096))), 4096);
    }
}
```

Then in `anthropic_run` change `"max_tokens": MAX_TOKENS,` to
`"max_tokens": resolve_max_tokens(req),` and likewise in
`openai_compatible_run`. Remove the old `const MAX_TOKENS`.

- [ ] **Step 3: Run the Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test resolve_max_tokens || cargo test max_tokens`
Expected: PASS (both cap tests).

- [ ] **Step 4: Add the TS field**

In `libs/data/src/lib/services/ai.service.ts`, add to the `AiRequest` interface
(after `language?`):

```ts
  maxTokens?: number;
```

- [ ] **Step 5: Pass 8192 from the CV callers**

In `cv-list.component.ts`, both `this.ai.run({ … })` calls (import ~line 225,
generate ~line 360) add `maxTokens: 8192,` to the request object.

In `cv-detail.component.ts`, the `regenerateSection` `this.ai.run({ … })` call
adds `maxTokens: 8192,`.

- [ ] **Step 6: Verify TS builds + Rust compiles**

Run: `npx nx test desktop --testPathPattern=cv-content.util` (sanity that desktop still compiles) and `cd apps/desktop/src-tauri && cargo build`.
Expected: PASS / builds clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/ai/mod.rs apps/desktop/src-tauri/src/ai/api.rs libs/data/src/lib/services/ai.service.ts apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts
git commit -m "fix: make ai output token cap configurable at 8192 for cv flows"
```

---

### Task 5: Sync `cv-import` skill schema (F3 — schema drift)

**Files:**

- Modify: `libs/skills/src/cv-import/cv-import.md`
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (fixture round-trip)

**Interfaces:**

- Produces: `cv-import` emits the enriched shape (title/website/linkedin, `skillGroups`, flat `skills`), parsed by `parseCvSkillResponse` → `buildCvContent`.

- [ ] **Step 1: Update the rules**

In `cv-import.md`, replace the `personalDetails.fullName` rule (line 26) and the
`skills` rule (line 30) so they read:

```md
- personalDetails.fullName is required if findable (usually the top line); title (the role line under the name, e.g. "Senior Frontend Software Engineer"), email, phone, address, website, linkedin are null if absent. Extract, never invent.
- skills: also group them into labelled categories (Languages, Frameworks, Build Tools, Data, Cloud & DevOps, Quality, etc.) in `skillGroups` when the CV presents them that way; always also emit the flat `skills` array (all skills, ungrouped).
```

- [ ] **Step 2: Update the output schema block**

Replace the schema (lines 35-43) with:

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

- [ ] **Step 3: Add a fixture round-trip test (append to spec)**

```ts
describe('cv-import output → content', () => {
  it('parses the enriched import shape into a full CvContent', () => {
    const sample = JSON.stringify({
      personalDetails: {
        fullName: 'VITALII KASAP',
        title: 'Senior Frontend Software Engineer',
        email: null,
        phone: '+49 171 206 4899',
        address: 'Nuremberg, Germany',
        website: 'vitaliikasap.com',
        linkedin: 'linkedin.com/in/vitaliikasap',
      },
      summary: 'Senior Frontend Engineer with 5+ years.',
      experience: [
        {
          company: 'Celonis',
          role: 'Senior FE Engineer',
          startDate: 'Jan 2026',
          endDate: 'Jun 2026',
          location: 'Munich',
          bullets: ['Led Performance Spectrum to GA'],
        },
      ],
      education: [],
      skills: ['TypeScript'],
      skillGroups: [{ label: 'Languages', values: ['TypeScript'] }],
      languages: [{ language: 'English', level: 'C1' }],
      lowConfidenceNotes: [],
    });
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    expect(pd['fullName']).toBe('VITALII KASAP');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
  });
});
```

(`buildCvContent`, `parseCvSkillResponse`, `CvTemplate` are already imported in the spec from earlier tasks.)

- [ ] **Step 4: Run**

Run: `npx nx test desktop --testPathPattern=cv-content.util`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/skills/src/cv-import/cv-import.md apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "fix: sync cv-import schema with enriched cv fields"
```

---

### Task 6: Profile → CV (F4)

**Files:**

- Modify: `apps/desktop/src/app/core/onboarding/onboarding-content.util.ts` (`ParsedCv`, `cvToProfileMarkdown`)
- Test: `apps/desktop/src/app/core/onboarding/onboarding-content.util.spec.ts` (extend)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`pullFromProfile`)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (button)
- Modify: i18n `translations.ts` (en + de)

**Interfaces:**

- Consumes: existing `regenerateSection` skill-run pattern.
- Produces: profile markdown carries title/website/linkedin; a "Pull from profile" action fills `personal_details`.

- [ ] **Step 1: Write failing test for `cvToProfileMarkdown` (append to onboarding spec)**

```ts
describe('cvToProfileMarkdown identity fields', () => {
  it('emits title, website and linkedin when present', () => {
    const md = cvToProfileMarkdown({
      personalDetails: {
        fullName: 'Vitalii Kasap',
        title: 'Senior Frontend Software Engineer',
        email: 'v@x.io',
        phone: '+49',
        address: 'Nuremberg',
        website: 'vitaliikasap.com',
        linkedin: 'linkedin.com/in/vitaliikasap',
      },
      summary: 'Engineer.',
      experience: [],
      skills: [],
    });
    expect(md).toContain('# Vitalii Kasap');
    expect(md).toContain('Senior Frontend Software Engineer');
    expect(md).toContain('vitaliikasap.com');
    expect(md).toContain('linkedin.com/in/vitaliikasap');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx nx test desktop --testPathPattern=onboarding-content.util`
Expected: FAIL (type + output missing the fields).

- [ ] **Step 3: Extend `ParsedCv` + `cvToProfileMarkdown`**

In `onboarding-content.util.ts`, extend the `ParsedCv.personalDetails` shape:

```ts
  personalDetails?: {
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    linkedin?: string | null;
  } | null;
```

And update `cvToProfileMarkdown` name/contact block:

```ts
const name = cv.personalDetails?.fullName?.trim();
if (name) out.push(`# ${name}`);
const title = cv.personalDetails?.title?.trim();
if (title) out.push(`_${title}_`);
const contact = [
  cv.personalDetails?.email,
  cv.personalDetails?.phone,
  cv.personalDetails?.address,
  cv.personalDetails?.website,
  cv.personalDetails?.linkedin,
]
  .filter(Boolean)
  .join(' · ');
if (contact) out.push(contact);
```

- [ ] **Step 4: Run to verify pass**

Run: `npx nx test desktop --testPathPattern=onboarding-content.util`
Expected: PASS.

- [ ] **Step 5: Add `pullFromProfile` to `cv-detail.component.ts`**

Mirror `regenerateSection` but target the personal-details fields. Add a signal
`readonly pullingProfile = signal(false);` and the method:

```ts
  async pullFromProfile(): Promise<void> {
    if (this.pullingProfile()) return;
    const personal = this.personalDetailsSection();
    if (!personal) return;
    this.pullingProfile.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));
      const language = this.doc()?.language ?? settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: profile.scoringJson ?? '{}',
        region_tag: this.regionTag(),
        archetype_tag: this.doc()?.archetypeTag ?? 'generalist',
        language,
        section: 'personalDetails',
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);
      const p = parsed.personalDetails;
      personal.fullName = p.fullName ?? personal.fullName;
      personal.title = p.title ?? personal.title;
      personal.email = p.email ?? personal.email;
      personal.phone = p.phone ?? personal.phone;
      personal.address = p.address ?? personal.address;
      personal.website = p.website ?? personal.website;
      personal.linkedin = p.linkedin ?? personal.linkedin;
      this.sections.set([...this.sections()]);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.pullingProfile.set(false);
    }
  }
```

(`personalDetailsSection()` already exists in the component.)

- [ ] **Step 6: Add the button to the personal-details edit card**

In `cv-detail.component.html`, inside the edit-mode `@case ('personal_details')`
block, before the `cvdetail__grid`, add:

```html
<button
  appButton
  variant="secondary"
  size="sm"
  type="button"
  [disabled]="pullingProfile()"
  (click)="pullFromProfile()"
>
  {{ pullingProfile() ? t()('common.loading') : t()('documents.cv_pull_from_profile') }}
</button>
```

- [ ] **Step 7: Add i18n keys**

In `translations.ts`, add to en + de `documents` blocks:

English: `"cv_pull_from_profile": "Pull from profile"`
German: `"cv_pull_from_profile": "Aus Profil übernehmen"`

- [ ] **Step 8: Verify tests + lint**

Run: `npx nx test desktop` and `npx nx lint desktop`
Expected: PASS / no new lint errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/core/onboarding apps/desktop/src/app/pages/documents/cv-detail libs/i18n
git commit -m "feat: carry identity fields into profile and pull them into cv"
```

---

## Self-Review

**Spec coverage:** F1 (Task 1: builder guarantee + normalizer + migration 0013), F2 (Task 2: add/remove entries+bullets), F3 (Task 3: repair; Task 4: configurable cap; Task 5: schema sync), F4 (Task 6: profile fields + pull action). All spec items mapped.

**Type consistency:** `blankExperienceEntry()`/`blankEducationEntry()`, `repairTruncatedJson(string): string | null`, `AiRequest.maxTokens`/`max_tokens`, `pullFromProfile()`, `personalDetailsSection()` — used consistently.

**Constraints honored:** new migration `0013` only (0011 untouched — checksum safety); `maxTokens` camelCase across IPC; i18n en+de; additive `skillGroups`; no export/style work (Waves B/C).

**Known follow-ups (not this wave):** experience bullets moved from a joined textarea to per-bullet inputs — confirm during Task 2 manual check that existing multi-bullet entries still render one input per bullet. Migration test uses an in-memory pool; if the crate lacks `sqlx` `sqlite::memory:` test support, adapt to the existing db-test helper.
