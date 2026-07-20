# Profile Structured Editor + AI Raw-Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Profile editor's Form mode edit Experience, Skills, and Languages as structured widgets (like the CV editor) in collapsible cards, and add an AI "parse free text -> preview -> apply" flow to Raw Markdown mode.

**Architecture:** Profile stays markdown-as-source-of-truth (`Profile.fullMd`). Add per-section parse/serialize helpers in `profile-markdown.ts` mirroring the existing Education helpers; the component keeps a structured signal per section, edits it immutably, and folds it back into the string/array fields of `ProfileForm`, which `serializeProfileForm` writes into `fullMd`. A new `profile-import` AI skill (modeled on `cv-import`) parses free text into JSON for a preview-then-apply flow.

**Tech Stack:** Angular 20 standalone signals, Nx monorepo, Jest, `@applye/core` (pure TS lib), `@applye/i18n`, lucide-angular icons, AI skills as markdown templates in `libs/skills`.

## Global Constraints

- Hyphen only in all output; never `-` (em dash U+2014) or `-` (en dash U+2013). Use `-`.
- Profile storage MUST remain `fullMd` markdown. No JSON migration. `ProfileForm` shape (`experienceText: string`, `skills: string[]`, `languages: string[]`, `education: string`) is unchanged.
- Do not touch the `profile-compress`, `pitch`, or scoring skills or their outputs.
- New AI skill recommended model: `claude-haiku-4-5`.
- All new user-facing strings go through `@applye/i18n` with EN + DE keys.
- Structured section editors are a UI-layer view folded back into existing `ProfileForm` fields (identical strategy to the existing Education editor).
- Lossless guarantee: nothing the parser cannot place may be dropped; `ProfileForm.notes` / `.other` buckets stay intact.

---

### Task 1: Experience parse/serialize helpers (core)

Round-trip `## Experience` markdown <-> structured `ExperienceEntry[]`. This is the trickiest helper: it must never lose legacy free-text experience.

**Files:**

- Modify: `libs/core/src/lib/profile/profile-markdown.ts` (add types + helpers after the Education helpers, ~line 337)
- Modify: `libs/core/src/index.ts` (export new symbols)
- Test: `libs/core/src/lib/profile/profile-markdown.spec.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `interface ExperienceEntry { role: string; company: string; location: string; startDate: string; endDate: string; bullets: string[]; }`
  - `const EMPTY_EXPERIENCE_ENTRY: ExperienceEntry`
  - `parseExperienceEntries(experienceText: string): ExperienceEntry[]`
  - `serializeExperienceEntries(entries: ExperienceEntry[]): string`

**Markdown shape** (body under `## Experience`, i.e. the string in `ProfileForm.experienceText`):

```
### {role} - {company}
{location} · {startDate} - {endDate}
- bullet one
- bullet two
```

- Header line starts with `### `. `role` and `company` split on the first `-` (space-hyphen-space); if no separator, the whole header is `role`, `company` empty.
- Optional meta line (next non-bullet line before the first bullet): split on `·` (spaced middot). A token matching a date range (`start - end` / `start`) fills dates; a non-date token fills `location`.
- `- ` / `* ` lines are bullets.
- Lenient fallback: text before the first `### ` header (a legacy free-text block) becomes ONE entry with `role` empty and the whole block as a single bullet, so nothing is dropped.

- [ ] **Step 1: Write the failing tests**

Add to `libs/core/src/lib/profile/profile-markdown.spec.ts`. First extend the import at the top of the file:

```typescript
import {
  parseExperienceEntries,
  serializeExperienceEntries,
  EMPTY_EXPERIENCE_ENTRY,
} from './profile-markdown';
```

Then add this describe block:

```typescript
describe('experience entries', () => {
  it('round-trips a full entry', () => {
    const md = [
      '### Senior Engineer - Acme',
      'Berlin · 2020 - 2023',
      '- Shipped the thing',
      '- Led the team',
    ].join('\n');
    const entries = parseExperienceEntries(md);
    expect(entries).toEqual([
      {
        role: 'Senior Engineer',
        company: 'Acme',
        location: 'Berlin',
        startDate: '2020',
        endDate: '2023',
        bullets: ['Shipped the thing', 'Led the team'],
      },
    ]);
    expect(parseExperienceEntries(serializeExperienceEntries(entries))).toEqual(entries);
  });

  it('treats an empty end date as ongoing', () => {
    const entry = { ...EMPTY_EXPERIENCE_ENTRY, role: 'Dev', company: 'Now', startDate: '2024' };
    const md = serializeExperienceEntries([entry]);
    expect(md).toContain('2024 - Present');
    // "Present" round-trips back to an empty endDate.
    expect(parseExperienceEntries(md)[0].endDate).toBe('');
  });

  it('keeps a legacy free-text block as a single bullet entry', () => {
    const entries = parseExperienceEntries('Did lots of things at various places.');
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe('');
    expect(entries[0].bullets).toEqual(['Did lots of things at various places.']);
  });

  it('parses a header with no company separator', () => {
    const entries = parseExperienceEntries('### Freelance Consultant\n- Client work');
    expect(entries[0]).toMatchObject({ role: 'Freelance Consultant', company: '' });
  });

  it('drops fully blank entries on serialize', () => {
    expect(serializeExperienceEntries([{ ...EMPTY_EXPERIENCE_ENTRY }])).toBe('');
  });

  it('returns [] for empty input', () => {
    expect(parseExperienceEntries('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: FAIL - `parseExperienceEntries is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

Add to `libs/core/src/lib/profile/profile-markdown.ts`, after `serializeEducationEntries` (before the `CHECKS` const):

```typescript
/** One work-experience position as edited in the structured profile UI.
 * Persisted inside the `## Experience` markdown body, so `ProfileForm.experienceText`
 * stays a plain string and nothing downstream changes. */
export interface ExperienceEntry {
  role: string;
  company: string;
  location: string;
  /** Free-text start, e.g. "2020" or "Jan 2020". */
  startDate: string;
  /** Free-text end; empty means ongoing (renders "Present"). */
  endDate: string;
  bullets: string[];
}

export const EMPTY_EXPERIENCE_ENTRY: ExperienceEntry = {
  role: '',
  company: '',
  location: '',
  startDate: '',
  endDate: '',
  bullets: [],
};

// A meta line's date token: "2020 - 2023", "Jan 2020 - Present", or a lone "2020".
// The dash is a plain hyphen (house rule) but we also accept en/em dashes read
// from legacy content via char codes so no dash glyph appears in source.
const EXP_RANGE_SEP = new RegExp(
  `\\s*(?:-|[${String.fromCharCode(0x2013, 0x2014)}]|to|bis)\\s*`,
  'i',
);
const DATE_TOKEN_RE = /\d/; // a date token contains at least one digit

function looksLikeDateRange(token: string): boolean {
  return DATE_TOKEN_RE.test(token);
}

/** Parses the `## Experience` body into structured positions. Lenient and
 * lossless: any text before the first `### ` header becomes one bullet-only
 * entry so a legacy free-text profile is never dropped. */
export function parseExperienceEntries(experienceText: string): ExperienceEntry[] {
  const text = (experienceText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const entries: ExperienceEntry[] = [];
  let preamble: string[] = [];
  let current: ExperienceEntry | null = null;
  let metaConsumed = false;

  const flushPreamble = () => {
    const block = preamble.join('\n').trim();
    if (block) {
      entries.push({ ...EMPTY_EXPERIENCE_ENTRY, bullets: [block] });
    }
    preamble = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const header = /^###\s+(.*)$/.exec(line);
    if (header) {
      flushPreamble();
      if (current) entries.push(current);
      const head = header[1].trim();
      const sep = head.indexOf(' - ');
      current = {
        ...EMPTY_EXPERIENCE_ENTRY,
        role: sep >= 0 ? head.slice(0, sep).trim() : head,
        company: sep >= 0 ? head.slice(sep + 3).trim() : '',
        bullets: [],
      };
      metaConsumed = false;
      continue;
    }
    if (!current) {
      preamble.push(raw);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      metaConsumed = true;
      if (bullet[1].trim()) current.bullets.push(bullet[1].trim());
      continue;
    }
    if (!line) continue;
    if (!metaConsumed) {
      metaConsumed = true;
      for (const rawTok of line.split(/\s+·\s+/)) {
        const tok = rawTok.trim();
        if (!tok) continue;
        if (looksLikeDateRange(tok)) {
          const [s, e] = tok.split(EXP_RANGE_SEP).map((x) => x.trim());
          current.startDate = s ?? '';
          current.endDate = /^(present|current|now|heute|jetzt|aktuell)$/i.test(e ?? '')
            ? ''
            : (e ?? '');
        } else if (!current.location) {
          current.location = tok;
        }
      }
      continue;
    }
    // A stray non-bullet line after the meta line: keep it as a bullet so
    // nothing is lost.
    current.bullets.push(line);
  }
  flushPreamble();
  if (current) entries.push(current);
  return entries;
}

/** Serializes structured positions back into the `## Experience` body. Inverse
 * of `parseExperienceEntries` for well-formed entries; fully blank entries are
 * dropped. */
export function serializeExperienceEntries(entries: ExperienceEntry[]): string {
  return entries
    .map((e) => {
      const role = e.role.trim();
      const company = e.company.trim();
      const hasContent =
        role ||
        company ||
        e.location.trim() ||
        e.startDate.trim() ||
        e.endDate.trim() ||
        e.bullets.some((b) => b.trim());
      if (!hasContent) return '';
      const head = [role, company].filter(Boolean).join(' - ');
      const meta: string[] = [];
      if (e.location.trim()) meta.push(e.location.trim());
      const start = e.startDate.trim();
      const end = e.endDate.trim();
      if (start && end) meta.push(`${start} - ${end}`);
      else if (start) meta.push(`${start} - Present`);
      else if (end) meta.push(end);
      const out: string[] = [];
      if (head) out.push(`### ${head}`);
      if (meta.length) out.push(meta.join(' · '));
      for (const b of e.bullets) {
        if (b.trim()) out.push(`- ${b.trim()}`);
      }
      return out.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}
```

Then add to `libs/core/src/index.ts` wherever the profile-markdown symbols are re-exported (find the existing `parseEducationEntries` export line and extend the same block):

```typescript
export {
  // ...existing profile-markdown exports...
  parseExperienceEntries,
  serializeExperienceEntries,
  EMPTY_EXPERIENCE_ENTRY,
  type ExperienceEntry,
} from './lib/profile/profile-markdown';
```

(If the barrel uses `export *`, no change is needed - verify first with `grep -n "profile-markdown" libs/core/src/index.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: PASS (all new experience tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/profile/profile-markdown.ts libs/core/src/lib/profile/profile-markdown.spec.ts libs/core/src/index.ts
git commit -m "feat(core): experience parse/serialize helpers for structured profile"
```

---

### Task 2: Language parse/serialize helpers (core)

Structured `LanguageEntry[]` view over the existing `## Languages` string list.

**Files:**

- Modify: `libs/core/src/lib/profile/profile-markdown.ts`
- Modify: `libs/core/src/index.ts` (if not `export *`)
- Test: `libs/core/src/lib/profile/profile-markdown.spec.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `interface LanguageEntry { language: string; level: string; }`
  - `const EMPTY_LANGUAGE_ENTRY: LanguageEntry`
  - `parseLanguageEntries(languages: readonly string[]): LanguageEntry[]`
  - `serializeLanguageEntries(entries: LanguageEntry[]): string[]`

**Shape:** each item in `ProfileForm.languages` (a `string[]`) is `"English (C1)"` or bare `"English"`. The parenthesized suffix is the level.

- [ ] **Step 1: Write the failing tests**

Extend the spec import to add `parseLanguageEntries`, `serializeLanguageEntries`, `EMPTY_LANGUAGE_ENTRY`, then add:

```typescript
describe('language entries', () => {
  it('parses "Language (Level)" items', () => {
    expect(parseLanguageEntries(['English (C1)', 'German (B2)'])).toEqual([
      { language: 'English', level: 'C1' },
      { language: 'German', level: 'B2' },
    ]);
  });

  it('parses a bare language with no level', () => {
    expect(parseLanguageEntries(['English'])).toEqual([{ language: 'English', level: '' }]);
  });

  it('round-trips', () => {
    const entries = [
      { language: 'English', level: 'Native' },
      { language: 'Spanish', level: '' },
    ];
    expect(parseLanguageEntries(serializeLanguageEntries(entries))).toEqual(entries);
  });

  it('serializes level only when present and drops blank rows', () => {
    expect(
      serializeLanguageEntries([
        { language: 'French', level: 'A2' },
        { language: 'Polish', level: '' },
        { language: '', level: 'C1' },
      ]),
    ).toEqual(['French (A2)', 'Polish']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: FAIL - `parseLanguageEntries is not a function`.

- [ ] **Step 3: Implement**

Add to `profile-markdown.ts` after the experience helpers:

```typescript
/** A language + proficiency level, as edited in the structured profile UI. A
 * view over the plain `## Languages` string list, so `ProfileForm.languages`
 * stays `string[]` and the serializer / profile-compress are untouched. */
export interface LanguageEntry {
  language: string;
  /** CEFR level or free text ("C1", "Native"); empty means unspecified. */
  level: string;
}

export const EMPTY_LANGUAGE_ENTRY: LanguageEntry = { language: '', level: '' };

/** "English (C1)" -> { language: 'English', level: 'C1' }; "English" -> level ''. */
export function parseLanguageEntries(languages: readonly string[]): LanguageEntry[] {
  return (languages || [])
    .map((raw) => (raw || '').trim())
    .filter(Boolean)
    .map((item) => {
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(item);
      if (m) return { language: m[1].trim(), level: m[2].trim() };
      return { language: item, level: '' };
    });
}

/** Inverse of parseLanguageEntries. Blank rows (no language) are dropped;
 * a row with a language but no level serializes bare. */
export function serializeLanguageEntries(entries: LanguageEntry[]): string[] {
  return entries
    .map((e) => {
      const lang = e.language.trim();
      if (!lang) return '';
      const level = e.level.trim();
      return level ? `${lang} (${level})` : lang;
    })
    .filter(Boolean);
}
```

Extend the barrel export in `libs/core/src/index.ts` if needed (same rule as Task 1).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/profile/profile-markdown.ts libs/core/src/lib/profile/profile-markdown.spec.ts libs/core/src/index.ts
git commit -m "feat(core): language+level parse/serialize helpers for structured profile"
```

---

### Task 3: i18n keys for structured sections + raw-parse

All new user-facing strings, added before the component work so templates can reference them.

**Files:**

- Modify: the EN and DE translation sources under `libs/i18n/` (find with `grep -rl "profile.field_experience" libs/i18n/src`).

**Interfaces:**

- Produces the i18n keys consumed by Tasks 4-8. Exact keys below.

- [ ] **Step 1: Add keys**

Locate the profile key block (same file that has `profile.field_experience`, `profile.add_education`, etc.). Add these EN values and their DE translations in the matching file:

```
profile.section_experience      = "Experience"        | DE "Berufserfahrung"
profile.add_experience          = "+ Add position"    | DE "+ Position hinzufügen"
profile.remove_experience       = "Remove position"   | DE "Position entfernen"
profile.exp_role                = "Role"               | DE "Position"
profile.exp_company             = "Company"            | DE "Unternehmen"
profile.exp_location            = "Location"           | DE "Ort"
profile.exp_start               = "Start"              | DE "Beginn"
profile.exp_end                 = "End"                | DE "Ende"
profile.exp_end_hint            = "Leave empty if ongoing" | DE "Leer lassen, wenn laufend"
profile.exp_add_bullet          = "+ Add bullet"       | DE "+ Punkt hinzufügen"
profile.exp_remove_bullet       = "Remove bullet"      | DE "Punkt entfernen"
profile.exp_bullet_hint         = "Achievement or responsibility" | DE "Erfolg oder Aufgabe"
profile.section_skills          = "Skills"             | DE "Fähigkeiten"
profile.skills_add_hint         = "Type a skill and press Enter" | DE "Fähigkeit eingeben und Enter drücken"
profile.remove_skill            = "Remove skill"       | DE "Fähigkeit entfernen"
profile.section_languages       = "Languages"          | DE "Sprachen"
profile.add_language            = "+ Add language"      | DE "+ Sprache hinzufügen"
profile.remove_language         = "Remove language"     | DE "Sprache entfernen"
profile.lang_name               = "Language"            | DE "Sprache"
profile.lang_level              = "Level"               | DE "Niveau"
profile.lang_level_none         = "No level"            | DE "Kein Niveau"
profile.summary_positions       = "{count} positions"   | DE "{count} Positionen"
profile.summary_skills          = "{count} skills"       | DE "{count} Fähigkeiten"
profile.summary_languages       = "{count} languages"    | DE "{count} Sprachen"
profile.summary_education        = "{count} entries"      | DE "{count} Einträge"
profile.summary_empty           = "Empty"                | DE "Leer"
profile.raw_parse_btn           = "Parse text"           | DE "Text auswerten"
profile.raw_parsing             = "Parsing..."           | DE "Wird ausgewertet..."
profile.raw_parse_desc          = "Let AI turn free text into structured fields." | DE "KI wandelt Freitext in strukturierte Felder um."
profile.parse_preview_title     = "Recognized profile"   | DE "Erkanntes Profil"
profile.parse_apply_btn         = "Apply to form"        | DE "In Formular übernehmen"
profile.parse_discard_btn       = "Discard"              | DE "Verwerfen"
profile.parse_notes_title       = "Please double-check"  | DE "Bitte prüfen"
profile.parse_failed            = "Could not parse the text. Try adding clearer structure." | DE "Text konnte nicht ausgewertet werden. Bitte klarer strukturieren."
profile.parse_empty_hint        = "Type or paste some text first." | DE "Erst Text eingeben oder einfügen."
```

Match the exact format the file uses (JSON, TS object, etc.).

- [ ] **Step 2: Verify keys resolve**

Run: `npx nx build i18n` (or the repo's i18n typecheck/build). Confirm no missing-key or duplicate-key errors.

- [ ] **Step 3: Commit**

```bash
git add libs/i18n
git commit -m "i18n(profile): keys for structured sections and raw-parse flow"
```

---

### Task 4: Structured Experience editor in the profile component

Replace the single `## Experience` textarea with a card list of positions.

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: `ExperienceEntry`, `EMPTY_EXPERIENCE_ENTRY`, `parseExperienceEntries`, `serializeExperienceEntries` (Task 1).
- Produces: an `experienceEntries` signal + CRUD methods mirroring the Education ones.

- [ ] **Step 1: Add imports, signal, and CRUD methods**

Extend the `@applye/core` import to include `ExperienceEntry`, `EMPTY_EXPERIENCE_ENTRY`, `parseExperienceEntries`, `serializeExperienceEntries`.

Add the signal near `educationEntries`:

```typescript
readonly experienceEntries = signal<ExperienceEntry[]>([]);
```

Add CRUD methods next to the education methods:

```typescript
addExperience(): void {
  this.experienceEntries.update((list) => [...list, { ...EMPTY_EXPERIENCE_ENTRY, bullets: [] }]);
  this.syncExperience();
}
removeExperience(index: number): void {
  this.experienceEntries.update((list) => list.filter((_, i) => i !== index));
  this.syncExperience();
}
updateExperienceField(
  index: number,
  field: Exclude<keyof ExperienceEntry, 'bullets'>,
  value: string,
): void {
  this.experienceEntries.update((list) =>
    list.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
  );
  this.syncExperience();
}
addExperienceBullet(index: number): void {
  this.experienceEntries.update((list) =>
    list.map((e, i) => (i === index ? { ...e, bullets: [...e.bullets, ''] } : e)),
  );
  this.syncExperience();
}
removeExperienceBullet(index: number, bulletIndex: number): void {
  this.experienceEntries.update((list) =>
    list.map((e, i) =>
      i === index ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== bulletIndex) } : e,
    ),
  );
  this.syncExperience();
}
updateExperienceBullet(index: number, bulletIndex: number, value: string): void {
  this.experienceEntries.update((list) =>
    list.map((e, i) =>
      i === index
        ? { ...e, bullets: e.bullets.map((b, bi) => (bi === bulletIndex ? value : b)) }
        : e,
    ),
  );
  this.syncExperience();
}
private syncExperience(): void {
  this.updateField('experienceText', serializeExperienceEntries(this.experienceEntries()));
}
```

- [ ] **Step 2: Seed the signal on load and when leaving raw mode**

In `ngOnInit`, after `this.educationEntries.set(...)`:

```typescript
this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
```

In `toggleRawMode`, inside the `if (this.rawMode())` branch after the education re-seed:

```typescript
this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
```

- [ ] **Step 3: Replace the experience textarea in the template**

Find the experience `<div class="field">...<textarea id="field-experience" ...></textarea></div>` block (around lines 321-337). Replace it with a card list matching the education UI:

```html
<div class="field field--full" id="field-experience">
  <div class="field__label-row">
    <span class="field__label">{{ t()('profile.section_experience') }}</span>
    <span class="field__hint field__hint--inline">{{ t()('profile.experience_hint') }}</span>
  </div>
  @if (experienceEntries().length > 0) {
  <div class="archetype-list">
    @for (e of experienceEntries(); track ei; let ei = $index) {
    <div class="archetype-card">
      <div class="archetype-card__top">
        <input
          class="archetype-input"
          type="text"
          [ngModel]="e.role"
          (ngModelChange)="updateExperienceField(ei, 'role', $event)"
          [placeholder]="t()('profile.exp_role')"
          [attr.aria-label]="t()('profile.exp_role')"
        />
        <input
          class="archetype-input"
          type="text"
          [ngModel]="e.company"
          (ngModelChange)="updateExperienceField(ei, 'company', $event)"
          [placeholder]="t()('profile.exp_company')"
          [attr.aria-label]="t()('profile.exp_company')"
        />
        <button
          class="btn-ghost"
          type="button"
          (click)="removeExperience(ei)"
          [attr.aria-label]="t()('profile.remove_experience')"
        >
          <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
        </button>
      </div>
      <div class="archetype-card__top">
        <input
          class="archetype-input"
          type="text"
          [ngModel]="e.location"
          (ngModelChange)="updateExperienceField(ei, 'location', $event)"
          [placeholder]="t()('profile.exp_location')"
          [attr.aria-label]="t()('profile.exp_location')"
        />
        <input
          class="archetype-input"
          type="text"
          [ngModel]="e.startDate"
          (ngModelChange)="updateExperienceField(ei, 'startDate', $event)"
          [placeholder]="t()('profile.exp_start')"
          [attr.aria-label]="t()('profile.exp_start')"
        />
        <input
          class="archetype-input"
          type="text"
          [ngModel]="e.endDate"
          (ngModelChange)="updateExperienceField(ei, 'endDate', $event)"
          [placeholder]="t()('profile.exp_end')"
          [attr.aria-label]="t()('profile.exp_end')"
        />
      </div>
      <div class="exp-bullets">
        @for (b of e.bullets; track bi; let bi = $index) {
        <div class="exp-bullet-row">
          <input
            class="archetype-input"
            type="text"
            [ngModel]="b"
            (ngModelChange)="updateExperienceBullet(ei, bi, $event)"
            [placeholder]="t()('profile.exp_bullet_hint')"
            [attr.aria-label]="t()('profile.exp_bullet_hint')"
          />
          <button
            class="btn-ghost"
            type="button"
            (click)="removeExperienceBullet(ei, bi)"
            [attr.aria-label]="t()('profile.exp_remove_bullet')"
          >
            <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
          </button>
        </div>
        }
        <button class="btn-dashed" type="button" (click)="addExperienceBullet(ei)">
          <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
          {{ t()('profile.exp_add_bullet') }}
        </button>
      </div>
    </div>
    }
  </div>
  }
  <button class="btn-dashed" type="button" (click)="addExperience()">
    <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
    {{ t()('profile.add_experience') }}
  </button>
</div>
```

Note the nested `@for` aliases the outer index as `ei` (`let ei = $index`) and the inner as `bi` (`let bi = $index`) so the bullet handlers get the correct entry AND bullet index (a bare `$index` in the inner loop would shadow the outer one - the bug this aliasing avoids).

Add styles to the component `styles` array:

```css
.exp-bullets {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-left: var(--space-4);
}
.exp-bullet-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Typecheck + lint the component**

Run:

```bash
npx tsc -p apps/desktop/tsconfig.app.json --noEmit
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
```

Expected: no errors (warnings acceptable).

- [ ] **Step 5: Verify in the app**

Start the desktop preview, open Profile, add a position, fill fields + bullets, toggle to Raw Markdown, confirm the `## Experience` section round-trips (role - company header, meta line, bullets), toggle back.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): structured experience editor in form mode"
```

---

### Task 5: Skills chip editor in the profile component

Replace the comma-separated skills input with type+Enter chips.

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: `form().skills` (existing `string[]`).
- Produces: `addSkillChip(event)`, `removeSkillChip(index)`.

- [ ] **Step 1: Add methods**

```typescript
addSkillChip(event: Event): void {
  event.preventDefault();
  const input = event.target as HTMLInputElement;
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  if (this.form().skills.includes(value)) return;
  this.updateField('skills', [...this.form().skills, value]);
}
removeSkillChip(index: number): void {
  this.updateField('skills', this.form().skills.filter((_, i) => i !== index));
}
```

- [ ] **Step 2: Replace the skills input in the template**

Find the skills `<div class="field">` inside the `field-row` (around lines 339-352). Replace the skills half with:

```html
<div class="field">
  <label class="field__label" for="field-skills">{{ t()('profile.field_skills') }}</label>
  <div class="chip-input">
    @for (s of form().skills; track $index) {
    <span class="skill-chip">
      {{ s }}
      <button
        type="button"
        class="skill-chip__x"
        (click)="removeSkillChip($index)"
        [attr.aria-label]="t()('profile.remove_skill')"
      >
        <lucide-icon [img]="removeIcon" [size]="12" aria-hidden="true" />
      </button>
    </span>
    }
    <input
      id="field-skills"
      class="chip-input__field"
      type="text"
      (keydown.enter)="addSkillChip($event)"
      [placeholder]="t()('profile.skills_add_hint')"
    />
  </div>
</div>
```

Add styles:

```css
.chip-input {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  min-height: 38px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
}
.chip-input__field {
  flex: 1;
  min-width: 120px;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-primary);
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-badge);
}
.skill-chip__x {
  display: inline-flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
}
.skill-chip__x:hover {
  color: var(--danger);
}
```

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
```

Expected: no errors.

- [ ] **Step 4: Verify in the app**

Open Profile, type a skill + Enter (adds chip), add a duplicate (ignored), remove a chip, confirm Raw Markdown `## Skills` line updates.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): chip-style skills editor in form mode"
```

---

### Task 6: Language + level editor in the profile component

Replace the comma-separated languages input with language+level rows.

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: `LanguageEntry`, `EMPTY_LANGUAGE_ENTRY`, `parseLanguageEntries`, `serializeLanguageEntries` (Task 2).
- Produces: `languageEntries` signal + CRUD.

- [ ] **Step 1: Imports, signal, CRUD, levels list**

Extend the `@applye/core` import with the language symbols. Add:

```typescript
readonly languageEntries = signal<LanguageEntry[]>([]);
protected readonly languageLevels = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

addLanguage(): void {
  this.languageEntries.update((list) => [...list, { ...EMPTY_LANGUAGE_ENTRY }]);
  this.syncLanguages();
}
removeLanguage(index: number): void {
  this.languageEntries.update((list) => list.filter((_, i) => i !== index));
  this.syncLanguages();
}
updateLanguageField(index: number, field: keyof LanguageEntry, value: string): void {
  this.languageEntries.update((list) =>
    list.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
  );
  this.syncLanguages();
}
private syncLanguages(): void {
  this.updateField('languages', serializeLanguageEntries(this.languageEntries()));
}
```

Remove the now-unused `updateLanguages(value: string)` method (the old comma handler).

- [ ] **Step 2: Seed on load and leave-raw**

In `ngOnInit` after the experience seed:

```typescript
this.languageEntries.set(parseLanguageEntries(this.form().languages));
```

In `toggleRawMode` leaving-raw branch, alongside the other re-seeds:

```typescript
this.languageEntries.set(parseLanguageEntries(this.form().languages));
```

- [ ] **Step 3: Replace the languages input in the template**

Replace the languages half of the `field-row` (around lines 353-365) with:

```html
<div class="field">
  <span class="field__label">{{ t()('profile.section_languages') }}</span>
  @if (languageEntries().length > 0) {
  <div class="lang-list">
    @for (l of languageEntries(); track $index) {
    <div class="lang-row">
      <input
        class="archetype-input"
        type="text"
        [ngModel]="l.language"
        (ngModelChange)="updateLanguageField($index, 'language', $event)"
        [placeholder]="t()('profile.lang_name')"
        [attr.aria-label]="t()('profile.lang_name')"
      />
      <select
        class="archetype-fit"
        [ngModel]="l.level"
        (ngModelChange)="updateLanguageField($index, 'level', $event)"
        [attr.aria-label]="t()('profile.lang_level')"
      >
        @for (lvl of languageLevels; track lvl) {
        <option [value]="lvl">{{ lvl || t()('profile.lang_level_none') }}</option>
        }
      </select>
      <button
        class="btn-ghost"
        type="button"
        (click)="removeLanguage($index)"
        [attr.aria-label]="t()('profile.remove_language')"
      >
        <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
      </button>
    </div>
    }
  </div>
  }
  <button class="btn-dashed" type="button" (click)="addLanguage()">
    <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
    {{ t()('profile.add_language') }}
  </button>
</div>
```

Add styles:

```css
.lang-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.lang-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Typecheck + lint**

Run:

```bash
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
```

Expected: no errors. If eslint flags the removed `updateLanguages` as unused elsewhere, confirm no template still references it.

- [ ] **Step 5: Verify in the app**

Add a language, pick a level, confirm Raw Markdown shows `## Languages\n- English (C1)`; a legacy comma profile (`English, German`) loads as rows with empty levels.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): language+level editor in form mode"
```

---

### Task 7: Collapsible section shells

Wrap Experience / Skills / Languages / Education form sections in collapsible cards.

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: the four section signals + `form()`.
- Produces: `sectionOpen` state + `toggleSection(key)` + summary computeds.

- [ ] **Step 1: Add open-state signal and helpers**

```typescript
readonly sectionOpen = signal<Record<'experience' | 'skills' | 'languages' | 'education', boolean>>({
  experience: true,
  skills: true,
  languages: true,
  education: true,
});
toggleSection(key: 'experience' | 'skills' | 'languages' | 'education'): void {
  this.sectionOpen.update((s) => ({ ...s, [key]: !s[key] }));
}
/** Collapse a section on load/seed when it already has content; leave empty
 * sections expanded so they invite filling. */
private seedSectionOpen(): void {
  this.sectionOpen.set({
    experience: this.experienceEntries().length === 0,
    skills: this.form().skills.length === 0,
    languages: this.languageEntries().length === 0,
    education: this.educationEntries().length === 0,
  });
}
```

Call `this.seedSectionOpen();` at the end of `ngOnInit` (after all four signals are seeded) and at the end of the leave-raw branch in `toggleRawMode`.

- [ ] **Step 2: Wrap each section in a collapsible card**

For each of the four sections, wrap the section body in a header + conditional body. Pattern (shown for Experience; apply the same shape to Skills, Languages, Education with their own key and summary):

```html
<div class="collapse-card">
  <div
    class="collapse-card__head"
    role="button"
    tabindex="0"
    [attr.aria-expanded]="sectionOpen().experience"
    (click)="toggleSection('experience')"
    (keydown.enter)="toggleSection('experience')"
    (keydown.space)="toggleSection('experience'); $event.preventDefault()"
  >
    <span class="collapse-card__title">{{ t()('profile.section_experience') }}</span>
    <span class="collapse-card__summary">
      {{ experienceEntries().length ? t()('profile.summary_positions').replace('{count}',
      experienceEntries().length + '') : t()('profile.summary_empty') }}
    </span>
    <lucide-icon
      [img]="chevronIcon"
      [size]="17"
      class="chevron"
      [class.chevron--open]="sectionOpen().experience"
      aria-hidden="true"
    />
  </div>
  @if (sectionOpen().experience) {
  <div class="collapse-card__body">
    <!-- existing Experience field block from Task 4 -->
  </div>
  }
</div>
```

Summaries per section:

- skills: `profile.summary_skills` with `form().skills.length`
- languages: `profile.summary_languages` with `languageEntries().length`
- education: `profile.summary_education` with `educationEntries().length`

Add styles:

```css
.collapse-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
  background: var(--surface-1);
  overflow: hidden;
}
.collapse-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
}
.collapse-card__title {
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  font-size: var(--text-sm);
}
.collapse-card__summary {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.collapse-card__body {
  padding: 0 var(--space-4) var(--space-4);
}
```

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
```

Expected: no errors (the head has keydown handlers, so the click-a11y rule is satisfied - mirror the AI Tools toggle exactly).

- [ ] **Step 4: Verify in the app**

Confirm sections collapse/expand, chevron rotates, summary counts update live, and an empty section starts expanded while a filled one starts collapsed.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): collapsible form sections with summary chips"
```

---

### Task 8: profile-import AI skill

Free text -> structured profile JSON, modeled on cv-import.

**Files:**

- Create: `libs/skills/src/profile-import/profile-import.md`

**Interfaces:**

- Produces: an AI skill named `profile-import` renderable via `AiService.renderSkill('profile-import', { profile_text, language })`, returning JSON with fields: `name`, `title`, `location`, `email`, `phone`, `website`, `linkedin`, `experience[]` (`{ role, company, location, startDate, endDate, bullets[] }`), `skills[]`, `languages[]` (`{ language, level }`), `education[]` (`{ title, institution, startDate, endDate }`), `lowConfidenceNotes[]`.

- [ ] **Step 1: Confirm skill registration mechanism**

Run: `grep -rn "cv-import" libs/skills/src/index.ts apps/desktop/src-tauri/src 2>/dev/null | head`
Determine whether skills are auto-discovered by folder or listed in a registry. If listed, note the file to edit in Step 2.

- [ ] **Step 2: Create the skill file**

Create `libs/skills/src/profile-import/profile-import.md`:

```markdown
---
version: 1
description: >
  Parses free-text profile input (pasted resume text, a LinkedIn "about"
  blurb, or loosely structured notes) into structured profile fields:
  name, title, contacts, experience, skills, languages, education. Structure
  detection only - no rewriting, no invented content. The user previews and
  fixes the parse before it fills the form. One AI call, cached by input hash.
inputs:
  - name: profile_text
    description: Free text the user typed or pasted into the raw profile editor.
  - name: language
    description: Output language for any note text (e.g. en, de).
output_format: valid JSON only - no markdown, no preamble
recommended_model: claude-haiku-4-5
---

[SYSTEM]
You parse free-text profile input into structured fields. You do not rewrite, improve, invent, or judge content - you extract what is actually there. If a field is missing, use null (or an empty array) rather than guessing.

Rules:

- Output ONLY valid JSON. No markdown fences, no commentary, no preamble.
- name is the person's full name (usually the top line). title is the current role line if present. location, email, phone, website, linkedin: extract if present, else null. Never invent.
- experience: one entry per job, in source order. role and company from the heading; location and dates (startDate/endDate) as written. If ongoing ("Present"/"Current"/"heute"), set endDate to null and STILL capture startDate. bullets are the literal responsibility/achievement lines under that role, one string each. Never merge two jobs.
- skills: a flat array of individual skills. Do not group.
- languages: array of { language, level } pairs; level is whatever text was used ("C1", "native", "fluent") or null - do not normalize.
- education: one entry per degree/certificate, in source order, as { title, institution, startDate, endDate }.
- Repair mangled ligatures only inside a word and only when unambiguous ("SoCware" -> "Software", "Microso+" -> "Microsoft"); never touch legitimate tokens (C++, C#, ES6+, .NET). If you repaired any, add one lowConfidenceNotes entry saying so.
- lowConfidenceNotes: short plain-language notes (in {{language}}) about anything ambiguous, so the user knows what to double-check. Empty array if nothing was ambiguous.

Output schema (all top-level fields required; nested fields may be null per the rules):
{
"name": "string or null",
"title": "string or null",
"location": "string or null",
"email": "string or null",
"phone": "string or null",
"website": "string or null",
"linkedin": "string or null",
"experience": [ { "role": "string", "company": "string", "location": "string or null", "startDate": "string or null", "endDate": "string or null", "bullets": ["string"] } ],
"skills": ["string"],
"languages": [ { "language": "string", "level": "string or null" } ],
"education": [ { "title": "string", "institution": "string or null", "startDate": "string or null", "endDate": "string or null" } ],
"lowConfidenceNotes": ["string"]
}

[USER]
Parse this profile text into structured fields. Output language for lowConfidenceNotes: {{language}}.

Profile text:
{{profile_text}}
```

If Step 1 found a registry, add `profile-import` to it.

- [ ] **Step 3: Verify the skill loads**

Run: `npx nx build skills` (or the repo's skills build). Confirm no schema/registration error. If there is a skills test that snapshots the registry, update it.

- [ ] **Step 4: Commit**

```bash
git add libs/skills/src/profile-import
git commit -m "feat(skills): profile-import - free text to structured profile JSON"
```

---

### Task 9: Raw-mode parse -> preview -> apply flow

Wire the AI skill into the component with an inline preview and an apply action.

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: `profile-import` skill (Task 8); `AiService.run`; `parseScoringJson`-style tolerant JSON parsing; all section signals + `updateField`.
- Produces: `parsing` / `parsePreview` signals, `parseRawText()`, `applyParsedProfile()`, `discardParse()`.

- [ ] **Step 1: Add a tolerant parse type + state**

Add an interface near the top of the component file (outside the class):

```typescript
interface ParsedProfile {
  name?: string | null;
  title?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  experience?: {
    role?: string;
    company?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    bullets?: string[];
  }[];
  skills?: string[];
  languages?: { language?: string; level?: string | null }[];
  education?: {
    title?: string;
    institution?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }[];
  lowConfidenceNotes?: string[];
}
```

Add signals:

```typescript
readonly parsing = signal(false);
readonly parsePreview = signal<ParsedProfile | null>(null);
readonly parseStatus = signal('');
readonly parseError = signal(false);
protected readonly sparklesIcon = Sparkles; // already imported for scoring
```

- [ ] **Step 2: Implement parseRawText**

Reuse the tolerant fence-stripping from `parseScoringJson` (import it or inline). Add:

````typescript
async parseRawText(): Promise<void> {
  const text = this.fullMd().trim();
  if (!text) {
    this.parseStatus.set(this.t()('profile.parse_empty_hint'));
    return;
  }
  const s = this.settings();
  if (!s) return;
  this.parsing.set(true);
  this.parseStatus.set('');
  this.parseError.set(false);
  try {
    const lang = s.defaultDocLanguage ?? 'en';
    const rendered = await this.ai.renderSkill('profile-import', {
      profile_text: text,
      language: lang,
    });
    const res = await this.ai.run({
      mode: s.aiMode,
      provider: s.provider,
      model: s.economyModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: lang,
    });
    const parsed = this.extractParsed(res.text);
    if (!parsed) {
      this.parseStatus.set(this.t()('profile.parse_failed'));
      this.parseError.set(true);
      return;
    }
    this.parsePreview.set(parsed);
  } catch (e) {
    this.parseStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
    this.parseError.set(true);
    this.toast.error(this.t()('profile.parse_failed'));
  } finally {
    this.parsing.set(false);
  }
}

private extractParsed(raw: string): ParsedProfile | null {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as ParsedProfile) : null;
  } catch {
    return null;
  }
}
````

- [ ] **Step 3: Implement applyParsedProfile + discardParse**

Map the AI's `null`-able fields onto `ProfileForm` and the section signals, then switch to Form mode. Dates: the AI returns `endDate: null` for ongoing; convert to `''`.

```typescript
applyParsedProfile(): void {
  const p = this.parsePreview();
  if (!p) return;
  const str = (v: string | null | undefined) => (v ?? '').trim();

  this.form.update((f) => ({
    ...f,
    name: str(p.name) || f.name,
    title: str(p.title) || f.title,
    location: str(p.location) || f.location,
    email: str(p.email) || f.email,
    phone: str(p.phone) || f.phone,
    website: str(p.website) || f.website,
    linkedin: str(p.linkedin) || f.linkedin,
  }));

  this.experienceEntries.set(
    (p.experience ?? []).map((e) => ({
      role: str(e.role),
      company: str(e.company),
      location: str(e.location),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      bullets: (e.bullets ?? []).map((b) => b.trim()).filter(Boolean),
    })),
  );
  this.languageEntries.set(
    (p.languages ?? [])
      .map((l) => ({ language: str(l.language), level: str(l.level) }))
      .filter((l) => l.language),
  );
  this.educationEntries.set(
    (p.education ?? []).map((e) => ({
      title: str(e.title),
      institution: str(e.institution),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
    })),
  );

  // Fold section signals + scalar fields back into fullMd via updateField.
  this.updateField('skills', (p.skills ?? []).map((sk) => sk.trim()).filter(Boolean));
  this.syncExperience();
  this.syncLanguages();
  this.syncEducation();
  this.syncMdFromForm();

  this.parsePreview.set(null);
  this.seedSectionOpen();
  this.rawMode.set(false); // switch to Form tab
}

discardParse(): void {
  this.parsePreview.set(null);
  this.parseStatus.set('');
}
```

Note: `updateField('skills', ...)` already calls `syncMdFromForm()`; the explicit section syncs above each call `updateField` too. The final `syncMdFromForm()` is a belt-and-braces resync. Verify no double-write bug (each `updateField` fully rewrites `fullMd` from `form()`, so order is: set signals -> fold each into form -> serialize; the last write wins and is correct).

- [ ] **Step 4: Add the button + preview panel to the raw-mode template**

In the `@else` (raw mode) branch, after the `<div class="scaffold">...`, before closing `editor-panel`:

```html
<div class="raw-parse">
  <button
    appButton
    variant="secondary"
    size="md"
    [disabled]="parsing() || !fullMd().trim()"
    (click)="parseRawText()"
  >
    <lucide-icon [img]="sparklesIcon" [size]="15" aria-hidden="true" />
    {{ parsing() ? t()('profile.raw_parsing') : t()('profile.raw_parse_btn') }}
  </button>
  <span class="field__hint">{{ t()('profile.raw_parse_desc') }}</span>
  @if (parseStatus()) {
  <span class="status" [class.status--error]="parseError()">{{ parseStatus() }}</span>
  }
</div>

@if (parsePreview(); as pv) {
<div class="parse-preview">
  <p class="parse-preview__title">{{ t()('profile.parse_preview_title') }}</p>
  <div class="parse-preview__grid">
    @if (pv.name) { <span>{{ pv.name }}</span> } @if (pv.title) { <span>{{ pv.title }}</span> } @if
    (pv.location) { <span>{{ pv.location }}</span> } @if (pv.email) { <span>{{ pv.email }}</span> }
    @if (pv.phone) { <span>{{ pv.phone }}</span> } @if (pv.linkedin) {
    <span>{{ pv.linkedin }}</span> }
  </div>
  <p class="muted">
    {{ (pv.experience?.length || 0) }} · {{ (pv.skills?.length || 0) }} · {{ (pv.languages?.length
    || 0) }} · {{ (pv.education?.length || 0) }}
  </p>
  @if (pv.lowConfidenceNotes?.length) {
  <div class="parse-preview__notes">
    <span class="parse-preview__notes-title">{{ t()('profile.parse_notes_title') }}</span>
    @for (n of pv.lowConfidenceNotes; track $index) { <span>{{ n }}</span> }
  </div>
  }
  <div class="parse-preview__actions">
    <button appButton variant="primary" size="sm" (click)="applyParsedProfile()">
      {{ t()('profile.parse_apply_btn') }}
    </button>
    <button appButton variant="secondary" size="sm" (click)="discardParse()">
      {{ t()('profile.parse_discard_btn') }}
    </button>
  </div>
</div>
}
```

Add styles:

```css
.raw-parse {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.parse-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
}
.parse-preview__title {
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  margin: 0;
}
.parse-preview__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.parse-preview__notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  font-size: var(--text-xs);
  color: var(--warning);
  background: var(--warning-tint);
  border-radius: var(--radius-input);
}
.parse-preview__notes-title {
  font-weight: var(--weight-medium);
}
.parse-preview__actions {
  display: flex;
  gap: var(--space-3);
}
```

- [ ] **Step 5: Typecheck + lint**

Run:

```bash
npx tsc -p apps/desktop/tsconfig.app.json --noEmit
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
```

Expected: no errors.

- [ ] **Step 6: Verify in the app**

Switch to Raw Markdown, paste a free-text CV blurb, click Parse text, confirm the preview panel shows recognized fields + notes, click Apply to form, confirm the form fields + Experience/Skills/Languages/Education populate and the tab switches to Form. Save, reload, confirm persistence.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): AI parse-preview-apply flow in raw markdown mode"
```

---

### Task 10: Full verification + docs sync

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Run the full relevant suites**

Run:

```bash
npx nx test core
npx nx test desktop
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts libs/core/src/lib/profile/profile-markdown.ts
```

Expected: all green; profile + core files 0 eslint errors.

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` (create it if absent, above the latest released version):

```markdown
### Added

- Profile editor: structured Experience (role, company, dates, bullets), chip-style Skills, and Language + level editors in Form mode, each in a collapsible section.
- Profile editor: AI "Parse text" in Raw Markdown mode - turns free text into structured fields via a preview-then-apply flow (new `profile-import` skill).
```

- [ ] **Step 3: Sync CURRENT_STATE.md**

Add a one-line summary of the structured profile editor + raw-parse feature to the appropriate section of `docs/product/CURRENT_STATE.md` (match the doc's existing format; note it landed post-0.25.0 on `main`).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs(profile): changelog + state sync for structured editor"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/profile-structured-editor
gh pr create --title "feat(profile): structured form editor + AI raw-parse" --body "..."
```

PR body: summarize the two outcomes, note markdown-source-of-truth is preserved, list the new core helpers + AI skill, and the test coverage.

---

## Notes for the implementer

- The profile component uses an inline template (single large `profile.component.ts`). All template edits are inside the `template:` backtick string; all style edits are inside the `styles:` array. There is no separate `.html` / `.scss`.
- The Education editor (already in the component) is the reference pattern for every structured section - match its markup classes (`archetype-card`, `archetype-input`, `btn-ghost`, `btn-dashed`) so the visual language stays consistent.
- `updateField(key, value)` is the single funnel that rewrites `fullMd` from `form()`. Every section's `sync*` method routes through it, so `fullMd` is always consistent with the form after any edit.
- Do not add a11y-only click handlers without keydown - the repo's `@angular-eslint/template/click-events-have-key-events` rule is enforced; mirror the AI Tools card toggle exactly (it has enter/space handlers).

```

```
