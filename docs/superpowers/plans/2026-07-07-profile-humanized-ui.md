# Profile Human-Friendly UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Profile page's raw Markdown textarea and raw JSON blob with a friendly structured form and a human-readable "How AI sees you" summary, without changing stored data or AI call contracts.

**Architecture:** Add two UI layers over unchanged persistence. A pure `profile-markdown.ts` util converts between `fullMd` (the stored source of truth) and a structured `ProfileForm`. A presentational `ScoringSummaryComponent` renders `scoringJson` as a completeness bar + strengths chips + actionable gaps. `profile.component.ts` keeps `fullMd` as its canonical signal (all downstream save/generate logic untouched) and treats the form as a two-way projection of it, with a Raw Markdown escape-hatch toggle.

**Tech Stack:** Angular standalone components + signals, TypeScript, Jest (via Nx), `@applye/i18n` translations.

## Global Constraints

- No database schema change. Stored fields stay: `fullMd`, `scoringJson`, `scoringHash`, `pitchMd`, `targetArchetypes`.
- No change to any AI call contract. `fullMd` remains the exact source fed to `profile-compress` and `pitch`.
- `parseProfileMd` MUST NOT throw and MUST NOT lose user text (unrecognized content preserved in `other`).
- `scoringJson` is stored wrapped in a ` ```json ` code fence — parsing MUST strip fences before `JSON.parse` and fall back gracefully on malformed input.
- New i18n keys MUST be added symmetrically to both the `en` (line ~190) and `de` (line ~1037) `profile:` blocks in `libs/i18n/src/lib/translations/translations.ts`.
- Round-trip guarantee `parseProfileMd(serializeProfileForm(x)) === x` holds when `x.name` is non-empty (the realistic case).

---

### Task 1: Pure `profile-markdown.ts` util (types, parse, serialize, completeness, missing fields)

**Files:**

- Create: `libs/core/src/lib/profile/profile-markdown.ts`
- Test: `libs/core/src/lib/profile/profile-markdown.spec.ts`
- Modify: `libs/core/src/index.ts` (add barrel export)

**Interfaces:**

- Produces:
  - `interface ProfileForm { name: string; title: string; location: string; experienceText: string; skills: string[]; education: string; languages: string[]; other: string; }`
  - `type ProfileFieldKey = 'title' | 'location' | 'experience' | 'skills' | 'education' | 'languages'`
  - `interface ScoringProfile { name?: string; title?: string; seniority?: string; location?: string; skills?: string[]; domains?: string[]; languages?: string[]; red_flags?: string[]; achievements?: string[]; years_exp?: number | null; education?: string | null; availability?: string | null; }`
  - `const EMPTY_FORM: ProfileForm`
  - `parseProfileMd(md: string): ProfileForm`
  - `serializeProfileForm(f: ProfileForm): string`
  - `profileCompleteness(f: ProfileForm): number`
  - `missingFields(f: ProfileForm): ProfileFieldKey[]`
  - `parseScoringJson(raw: string | null | undefined): ScoringProfile | null`

- [ ] **Step 1: Write the failing test**

Create `libs/core/src/lib/profile/profile-markdown.spec.ts`:

````ts
import {
  ProfileForm,
  EMPTY_FORM,
  parseProfileMd,
  serializeProfileForm,
  profileCompleteness,
  missingFields,
  parseScoringJson,
} from './profile-markdown';

const fullForm: ProfileForm = {
  name: 'Vitalii Kasap',
  title: 'Senior Frontend Engineer',
  location: 'Germany',
  experienceText: 'Led frontend for a 2M DAU platform.\nCut bundle size 40%.',
  skills: ['React', 'TypeScript', 'Angular'],
  education: 'BSc Computer Science',
  languages: ['English', 'German'],
  other: '',
};

describe('profile-markdown', () => {
  it('round-trips a full form through serialize→parse', () => {
    expect(parseProfileMd(serializeProfileForm(fullForm))).toEqual(fullForm);
  });

  it('returns EMPTY_FORM for empty input', () => {
    expect(parseProfileMd('')).toEqual(EMPTY_FORM);
    expect(parseProfileMd('   \n  ')).toEqual(EMPTY_FORM);
  });

  it('parses legacy freeform (name only, no headers) without losing text', () => {
    const form = parseProfileMd('Vitalii Kasap\nSenior Frontend Engineer · Germany');
    expect(form.name).toBe('Vitalii Kasap');
    expect(form.title).toBe('Senior Frontend Engineer');
    expect(form.location).toBe('Germany');
  });

  it('preserves unknown sections in other and re-appends on serialize', () => {
    const md = '# Jane\n\n## Skills\nGo\n\n## Awards\nBest dev 2025';
    const form = parseProfileMd(md);
    expect(form.skills).toEqual(['Go']);
    expect(form.other).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('Best dev 2025');
  });

  it('computes completeness from filled fields', () => {
    expect(profileCompleteness(EMPTY_FORM)).toBe(0);
    expect(profileCompleteness(fullForm)).toBe(100);
    const half = { ...EMPTY_FORM, title: 'Dev', location: 'EU', skills: ['Go'] };
    expect(profileCompleteness(half)).toBe(50);
  });

  it('lists missing field keys', () => {
    expect(missingFields(fullForm)).toEqual([]);
    expect(missingFields(EMPTY_FORM)).toEqual([
      'title',
      'location',
      'experience',
      'skills',
      'education',
      'languages',
    ]);
  });

  it('parses scoringJson wrapped in a ```json fence', () => {
    const raw = '```json\n{ "seniority": "senior", "skills": ["React"] }\n```';
    expect(parseScoringJson(raw)).toEqual({ seniority: 'senior', skills: ['React'] });
  });

  it('returns null for malformed or empty scoringJson', () => {
    expect(parseScoringJson('not json')).toBeNull();
    expect(parseScoringJson(null)).toBeNull();
    expect(parseScoringJson(undefined)).toBeNull();
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core -- --testPathPattern=profile-markdown`
Expected: FAIL — cannot find module `./profile-markdown`.

- [ ] **Step 3: Write minimal implementation**

Create `libs/core/src/lib/profile/profile-markdown.ts`:

````ts
export interface ProfileForm {
  name: string;
  title: string;
  location: string;
  experienceText: string;
  skills: string[];
  education: string;
  languages: string[];
  other: string;
}

export type ProfileFieldKey =
  | 'title'
  | 'location'
  | 'experience'
  | 'skills'
  | 'education'
  | 'languages';

export interface ScoringProfile {
  name?: string;
  title?: string;
  seniority?: string;
  location?: string;
  skills?: string[];
  domains?: string[];
  languages?: string[];
  red_flags?: string[];
  achievements?: string[];
  years_exp?: number | null;
  education?: string | null;
  availability?: string | null;
}

export const EMPTY_FORM: ProfileForm = {
  name: '',
  title: '',
  location: '',
  experienceText: '',
  skills: [],
  education: '',
  languages: [],
  other: '',
};

function splitList(body: string): string[] {
  return body
    .split(/[,\n]/)
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function parseProfileMd(md: string): ProfileForm {
  const form: ProfileForm = { ...EMPTY_FORM, skills: [], languages: [] };
  if (!md || !md.trim()) return form;

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const header: string[] = [];
  const sections: { heading: string; raw: string; body: string[] }[] = [];
  let current: { heading: string; raw: string; body: string[] } | null = null;

  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      current = { heading: m[1].toLowerCase(), raw: line, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      header.push(line);
    }
  }

  const headerLines = header.map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
  if (headerLines.length > 0) form.name = headerLines[0];
  if (headerLines.length > 1) {
    const rest = headerLines[1];
    const parts = rest.split('·').map((s) => s.trim());
    if (parts.length > 1) {
      form.title = parts[0];
      form.location = parts.slice(1).join(' · ');
    } else {
      form.title = rest;
    }
  }

  const other: string[] = [];
  for (const s of sections) {
    const body = s.body.join('\n').trim();
    if (s.heading === 'experience') form.experienceText = body;
    else if (s.heading === 'skills') form.skills = splitList(body);
    else if (s.heading === 'education') form.education = body;
    else if (s.heading === 'languages') form.languages = splitList(body);
    else other.push([s.raw, ...s.body].join('\n').trim());
  }
  form.other = other.join('\n\n').trim();
  return form;
}

export function serializeProfileForm(f: ProfileForm): string {
  const parts: string[] = [];
  const head = `# ${f.name}`.trimEnd();
  const titleLoc = [f.title, f.location].filter((s) => s.trim()).join(' · ');
  parts.push(titleLoc ? `${head}\n${titleLoc}` : head);
  if (f.experienceText.trim()) parts.push(`## Experience\n${f.experienceText.trim()}`);
  if (f.skills.length) parts.push(`## Skills\n${f.skills.join(', ')}`);
  if (f.education.trim()) parts.push(`## Education\n${f.education.trim()}`);
  if (f.languages.length) parts.push(`## Languages\n${f.languages.join(', ')}`);
  if (f.other.trim()) parts.push(f.other.trim());
  return parts.join('\n\n') + '\n';
}

const CHECKS: { key: ProfileFieldKey; filled: (f: ProfileForm) => boolean }[] = [
  { key: 'title', filled: (f) => !!f.title.trim() },
  { key: 'location', filled: (f) => !!f.location.trim() },
  { key: 'experience', filled: (f) => !!f.experienceText.trim() },
  { key: 'skills', filled: (f) => f.skills.length > 0 },
  { key: 'education', filled: (f) => !!f.education.trim() },
  { key: 'languages', filled: (f) => f.languages.length > 0 },
];

export function profileCompleteness(f: ProfileForm): number {
  const filled = CHECKS.filter((c) => c.filled(f)).length;
  return Math.round((filled / CHECKS.length) * 100);
}

export function missingFields(f: ProfileForm): ProfileFieldKey[] {
  return CHECKS.filter((c) => !c.filled(f)).map((c) => c.key);
}

export function parseScoringJson(raw: string | null | undefined): ScoringProfile | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === 'object' ? (obj as ScoringProfile) : null;
  } catch {
    return null;
  }
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core -- --testPathPattern=profile-markdown`
Expected: PASS (8 tests).

- [ ] **Step 5: Add barrel export**

In `libs/core/src/index.ts`, after the existing model exports, add:

```ts
export * from './lib/profile/profile-markdown';
```

- [ ] **Step 6: Verify build resolves the export**

Run: `npx nx test core`
Expected: PASS, no TS resolution errors.

- [ ] **Step 7: Commit**

```bash
git add libs/core/src/lib/profile/profile-markdown.ts libs/core/src/lib/profile/profile-markdown.spec.ts libs/core/src/index.ts
git commit -m "feat(profile): add profile-markdown parse/serialize util"
```

---

### Task 2: i18n keys (EN + DE)

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts` (en `profile:` block ~190, de `profile:` block ~1037)

**Interfaces:**

- Produces i18n keys consumed by Tasks 3 and 4: `profile.mode_form`, `profile.mode_raw`, `profile.field_name`, `profile.field_title`, `profile.field_location`, `profile.field_experience`, `profile.field_skills`, `profile.field_education`, `profile.field_languages`, `profile.skills_hint`, `profile.languages_hint`, `profile.ai_view_title`, `profile.strengths`, `profile.improve`, `profile.add_field`, `profile.completeness`, `profile.show_json`, `profile.ai_notes`, `profile.field_title_short`, `profile.field_location_short`, `profile.field_experience_short`, `profile.field_skills_short`, `profile.field_education_short`, `profile.field_languages_short`.

- [ ] **Step 1: Add keys to the EN `profile:` block**

In `libs/i18n/src/lib/translations/translations.ts`, inside the `en` `profile:` object (before its closing `},` near line 240), add:

```ts
    mode_form: 'Form',
    mode_raw: 'Raw Markdown',
    field_name: 'Name',
    field_title: 'Current role',
    field_location: 'Location',
    field_experience: 'Experience',
    field_skills: 'Skills',
    field_education: 'Education',
    field_languages: 'Languages',
    skills_hint: 'Comma-separated, e.g. React, TypeScript, Node',
    languages_hint: 'Comma-separated, e.g. English, German',
    ai_view_title: 'How AI sees you',
    strengths: 'Strengths',
    improve: 'What to improve — sharpens job matching',
    add_field: 'Add',
    completeness: 'Profile completeness',
    show_json: 'Show technical data (JSON)',
    ai_notes: 'AI notes',
    field_title_short: 'current role',
    field_location_short: 'location',
    field_experience_short: 'experience',
    field_skills_short: 'skills',
    field_education_short: 'education',
    field_languages_short: 'languages',
```

- [ ] **Step 2: Add the same keys (German values) to the DE `profile:` block**

In the `de` `profile:` object (~line 1037, before its closing `},`), add:

```ts
    mode_form: 'Formular',
    mode_raw: 'Raw-Markdown',
    field_name: 'Name',
    field_title: 'Aktuelle Rolle',
    field_location: 'Standort',
    field_experience: 'Erfahrung',
    field_skills: 'Fähigkeiten',
    field_education: 'Ausbildung',
    field_languages: 'Sprachen',
    skills_hint: 'Kommagetrennt, z. B. React, TypeScript, Node',
    languages_hint: 'Kommagetrennt, z. B. Englisch, Deutsch',
    ai_view_title: 'So sieht dich die KI',
    strengths: 'Stärken',
    improve: 'Was du verbessern kannst — schärft das Job-Matching',
    add_field: 'Hinzufügen',
    completeness: 'Profil-Vollständigkeit',
    show_json: 'Technische Daten anzeigen (JSON)',
    ai_notes: 'KI-Hinweise',
    field_title_short: 'aktuelle Rolle',
    field_location_short: 'Standort',
    field_experience_short: 'Erfahrung',
    field_skills_short: 'Fähigkeiten',
    field_education_short: 'Ausbildung',
    field_languages_short: 'Sprachen',
```

- [ ] **Step 3: Verify i18n build/tests pass**

Run: `npx nx test i18n`
Expected: PASS (translations compile, no TS errors).

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): add profile form and AI-view keys (en, de)"
```

---

### Task 3: `ScoringSummaryComponent` (human-readable AI view)

**Files:**

- Create: `apps/desktop/src/app/pages/profile/scoring-summary.component.ts`
- Test: `apps/desktop/src/app/pages/profile/scoring-summary.component.spec.ts`

**Interfaces:**

- Consumes from Task 1: `ProfileForm`, `ProfileFieldKey`, `ScoringProfile`, `parseScoringJson`, `profileCompleteness`, `missingFields`.
- Consumes from Task 2: the `profile.*` i18n keys.
- Produces:
  - Selector `app-scoring-summary`.
  - Inputs: `scoringJson: string | null`, `form: ProfileForm`.
  - Output: `addField: EventEmitter<ProfileFieldKey>`.
  - Public members used by tests: `scoring` (computed `ScoringProfile | null`), `strengths` (computed `string[]`), `completeness` (computed `number`), `gaps` (computed `ProfileFieldKey[]`), `showJson` (signal), `prettyJson` (computed `string`).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/app/pages/profile/scoring-summary.component.spec.ts`:

````ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY_FORM, ProfileForm } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoringSummaryComponent } from './scoring-summary.component';

const form: ProfileForm = {
  ...EMPTY_FORM,
  name: 'Vitalii',
  title: 'Senior FE',
  location: 'Germany',
  skills: ['React'],
};

function setup(scoringJson: string | null, f: ProfileForm = form) {
  TestBed.configureTestingModule({
    imports: [ScoringSummaryComponent],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture: ComponentFixture<ScoringSummaryComponent> =
    TestBed.createComponent(ScoringSummaryComponent);
  fixture.componentRef.setInput('scoringJson', scoringJson);
  fixture.componentRef.setInput('form', f);
  fixture.detectChanges();
  return fixture;
}

describe('ScoringSummaryComponent', () => {
  it('derives strengths from parsed scoring skills + domains + seniority', () => {
    const f = setup(
      '```json\n{"seniority":"senior","skills":["React","TS"],"domains":["Frontend"]}\n```',
    );
    const c = f.componentInstance;
    expect(c.strengths).toEqual(['senior', 'React', 'TS', 'Frontend']);
  });

  it('computes completeness and gaps from the form, not the JSON', () => {
    const f = setup('```json\n{}\n```');
    const c = f.componentInstance;
    expect(c.completeness).toBe(profileFilledPercent());
    expect(c.gaps).toEqual(['experience', 'education', 'languages']);
  });

  it('falls back to raw JSON display when scoringJson is malformed', () => {
    const f = setup('not-json');
    const c = f.componentInstance;
    expect(c.scoring).toBeNull();
    expect(c.prettyJson).toBe('not-json');
  });

  it('emits addField when a gap add-link is clicked', () => {
    const f = setup('```json\n{}\n```');
    const c = f.componentInstance;
    const emitted: string[] = [];
    c.addField.subscribe((k) => emitted.push(k));
    c.onAdd('experience');
    expect(emitted).toEqual(['experience']);
  });
});

// form has title, location, skills filled (3 of 6) → 50%
function profileFilledPercent(): number {
  return 50;
}
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop -- --testPathPattern=scoring-summary`
Expected: FAIL — cannot find module `./scoring-summary.component`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/src/app/pages/profile/scoring-summary.component.ts`:

```ts
import { Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import {
  ProfileFieldKey,
  ProfileForm,
  parseScoringJson,
  profileCompleteness,
  missingFields,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-scoring-summary',
  standalone: true,
  template: `
    <div class="summary">
      <div class="summary__head">
        <span class="summary__name">{{ scoring()?.name || form().name }}</span>
        <span class="summary__meta">{{ metaLine() }}</span>
      </div>

      <div class="summary__bar-row">
        <span>{{ t()('profile.completeness') }}</span>
        <b>{{ completeness() }}%</b>
      </div>
      <div class="summary__bar"><i [style.width.%]="completeness()"></i></div>

      @if (strengths().length) {
        <p class="summary__label">{{ t()('profile.strengths') }}</p>
        <div class="summary__chips">
          @for (s of strengths(); track $index) {
            <span class="summary__chip">{{ s }}</span>
          }
        </div>
      }

      @if (gaps().length) {
        <p class="summary__label">{{ t()('profile.improve') }}</p>
        <ul class="summary__gaps">
          @for (g of gaps(); track g) {
            <li class="summary__gap">
              <span class="summary__gap-icon" aria-hidden="true">⚠</span>
              <span>{{ t()('profile.field_' + g + '_short') }}</span>
              <button type="button" class="summary__add" (click)="onAdd(g)">
                {{ t()('profile.add_field') }}
              </button>
            </li>
          }
        </ul>
      }

      @if (aiNotes().length) {
        <p class="summary__label">{{ t()('profile.ai_notes') }}</p>
        <ul class="summary__notes">
          @for (n of aiNotes(); track $index) {
            <li>{{ n }}</li>
          }
        </ul>
      }

      <button type="button" class="summary__toggle" (click)="showJson.set(!showJson())">
        {{ showJson() ? '▾' : '▸' }} {{ t()('profile.show_json') }}
      </button>
      @if (showJson()) {
        <pre class="summary__json">{{ prettyJson() }}</pre>
      }
    </div>
  `,
  styles: [
    `
      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-4);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
      }
      .summary__name {
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .summary__meta {
        display: block;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .summary__bar-row {
        display: flex;
        justify-content: space-between;
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-top: var(--space-3);
      }
      .summary__bar {
        height: 7px;
        background: var(--surface-2);
        border-radius: var(--radius-full);
        overflow: hidden;
      }
      .summary__bar > i {
        display: block;
        height: 100%;
        background: var(--accent);
      }
      .summary__label {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
        margin: var(--space-3) 0 var(--space-1);
      }
      .summary__chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .summary__chip {
        padding: var(--space-1) var(--space-3);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
      }
      .summary__gaps,
      .summary__notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .summary__gap {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--warning);
      }
      .summary__notes li {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .summary__add {
        margin-left: auto;
        font-size: var(--text-xs);
        color: var(--accent);
        background: none;
        border: none;
        cursor: pointer;
      }
      .summary__toggle {
        align-self: flex-start;
        margin-top: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .summary__json {
        margin: 0;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.6;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
})
export class ScoringSummaryComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly scoringJson = input<string | null>(null);
  readonly form = input.required<ProfileForm>();
  @Output() readonly addField = new EventEmitter<ProfileFieldKey>();

  readonly showJson = signal(false);

  readonly scoring = computed(() => parseScoringJson(this.scoringJson()));
  readonly completeness = computed(() => profileCompleteness(this.form()));
  readonly gaps = computed(() => missingFields(this.form()));

  readonly strengths = computed(() => {
    const s = this.scoring();
    if (!s) return [];
    const out: string[] = [];
    if (s.seniority) out.push(s.seniority);
    out.push(...(s.skills ?? []), ...(s.domains ?? []));
    return out;
  });

  readonly aiNotes = computed(() => this.scoring()?.red_flags ?? []);

  readonly metaLine = computed(() => {
    const s = this.scoring();
    const f = this.form();
    return [s?.seniority, s?.location || f.location, ...(s?.domains ?? [])]
      .filter(Boolean)
      .join(' · ');
  });

  readonly prettyJson = computed(() => {
    const raw = this.scoringJson();
    if (!raw) return '';
    const parsed = this.scoring();
    return parsed ? JSON.stringify(parsed, null, 2) : raw;
  });

  onAdd(key: ProfileFieldKey): void {
    this.addField.emit(key);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop -- --testPathPattern=scoring-summary`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/profile/scoring-summary.component.ts apps/desktop/src/app/pages/profile/scoring-summary.component.spec.ts
git commit -m "feat(profile): add ScoringSummaryComponent AI view"
```

---

### Task 4: Integrate structured form + Raw toggle + summary into `ProfileComponent`

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`
- Test: `apps/desktop/src/app/pages/profile/profile.component.spec.ts` (create if absent)

**Interfaces:**

- Consumes from Task 1: `ProfileForm`, `EMPTY_FORM`, `ProfileFieldKey`, `parseProfileMd`, `serializeProfileForm`.
- Consumes from Task 3: `ScoringSummaryComponent` (`app-scoring-summary`).
- Consumes from Task 2: new `profile.*` i18n keys.
- Design contract: `fullMd` stays the single canonical signal feeding `dirty`, `save`, `generateScoringProfile`, `generatePitch` (all unchanged). The `form` signal is a projection kept in sync via `syncMdFromForm()`.

- [ ] **Step 1: Write the failing test**

Create/replace `apps/desktop/src/app/pages/profile/profile.component.spec.ts`:

```ts
import { serializeProfileForm, parseProfileMd, EMPTY_FORM } from '@applye/core';

describe('ProfileComponent form/md sync (unit-level contract)', () => {
  it('form → md → form is stable for a filled form', () => {
    const form = {
      ...EMPTY_FORM,
      name: 'Jane',
      title: 'Dev',
      location: 'EU',
      skills: ['Go'],
    };
    expect(parseProfileMd(serializeProfileForm(form))).toEqual(form);
  });

  it('toggling to raw and back preserves an unknown section', () => {
    const md = '# Jane\nDev · EU\n\n## Awards\nPrize';
    const roundTripped = serializeProfileForm(parseProfileMd(md));
    expect(roundTripped).toContain('## Awards');
    expect(roundTripped).toContain('Prize');
  });
});
```

(A full component TestBed spec is optional; this contract test guards the sync invariant the integration relies on.)

- [ ] **Step 2: Run test to verify it fails or passes trivially, then wire the component**

Run: `npx nx test desktop -- --testPathPattern=profile.component`
Expected: PASS (these assert the Task 1 util contract the integration depends on). If FAIL, Task 1 is incomplete — fix before continuing.

- [ ] **Step 3: Add imports and form state to `profile.component.ts`**

Update the top imports:

```ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from '@applye/ui';
import { AiService, DbService } from '@applye/data';
import {
  Profile,
  Settings,
  ProfileForm,
  ProfileFieldKey,
  EMPTY_FORM,
  parseProfileMd,
  serializeProfileForm,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ScoringSummaryComponent } from './scoring-summary.component';
```

Add `ScoringSummaryComponent` to the `imports` array:

```ts
  imports: [FormsModule, ButtonDirective, ScoringSummaryComponent],
```

In the class body, add form state after `readonly fullMd = signal('');`:

```ts
  readonly rawMode = signal(false);
  readonly form = signal<ProfileForm>({ ...EMPTY_FORM });

  private syncMdFromForm(): void {
    this.fullMd.set(serializeProfileForm(this.form()));
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.syncMdFromForm();
  }

  updateSkills(value: string): void {
    this.updateField(
      'skills',
      value.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }

  updateLanguages(value: string): void {
    this.updateField(
      'languages',
      value.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }

  toggleRawMode(): void {
    if (this.rawMode()) {
      // leaving raw → re-parse edited markdown back into fields
      this.form.set(parseProfileMd(this.fullMd()));
    } else {
      this.syncMdFromForm();
    }
    this.rawMode.update((v) => !v);
  }

  focusField(key: ProfileFieldKey): void {
    const el = document.getElementById('field-' + key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement | null)?.focus?.();
  }
```

- [ ] **Step 4: Populate the form on load**

In `ngOnInit`, after `this.fullMd.set(p?.fullMd ?? '');`, add:

```ts
this.form.set(parseProfileMd(p?.fullMd ?? ''));
```

- [ ] **Step 5: Replace the Markdown editor `<section>` (lines ~124-144) with the form + raw toggle**

Replace the entire "Editor" section block with:

```html
<!-- Editor -->
<section class="section">
  <div class="editor-head">
    <h3 class="eyebrow">{{ t()('profile.section_markdown') }}</h3>
    <div class="mode-toggle" role="tablist">
      <button
        type="button"
        class="mode-btn"
        [class.mode-btn--on]="!rawMode()"
        (click)="rawMode() && toggleRawMode()"
      >
        {{ t()('profile.mode_form') }}
      </button>
      <button
        type="button"
        class="mode-btn"
        [class.mode-btn--on]="rawMode()"
        (click)="!rawMode() && toggleRawMode()"
      >
        {{ t()('profile.mode_raw') }}
      </button>
    </div>
  </div>

  @if (!rawMode()) {
  <div class="form-cards">
    <div class="form-card">
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
      <div class="field-row">
        <div class="field">
          <label class="field__label" for="field-title">{{ t()('profile.field_title') }}</label>
          <input
            id="field-title"
            class="field__input"
            type="text"
            [ngModel]="form().title"
            (ngModelChange)="updateField('title', $event)"
          />
        </div>
        <div class="field">
          <label class="field__label" for="field-location"
            >{{ t()('profile.field_location') }}</label
          >
          <input
            id="field-location"
            class="field__input"
            type="text"
            [ngModel]="form().location"
            (ngModelChange)="updateField('location', $event)"
          />
        </div>
      </div>
    </div>

    <div class="form-card">
      <div class="field">
        <label class="field__label" for="field-experience"
          >{{ t()('profile.field_experience') }}</label
        >
        <textarea
          id="field-experience"
          class="field__input field__input--area"
          [ngModel]="form().experienceText"
          (ngModelChange)="updateField('experienceText', $event)"
        ></textarea>
      </div>
    </div>

    <div class="form-card">
      <div class="field">
        <label class="field__label" for="field-skills">{{ t()('profile.field_skills') }}</label>
        <input
          id="field-skills"
          class="field__input"
          type="text"
          [ngModel]="form().skills.join(', ')"
          (ngModelChange)="updateSkills($event)"
          [placeholder]="t()('profile.skills_hint')"
        />
      </div>
      <div class="field">
        <label class="field__label" for="field-education"
          >{{ t()('profile.field_education') }}</label
        >
        <input
          id="field-education"
          class="field__input"
          type="text"
          [ngModel]="form().education"
          (ngModelChange)="updateField('education', $event)"
        />
      </div>
      <div class="field">
        <label class="field__label" for="field-languages"
          >{{ t()('profile.field_languages') }}</label
        >
        <input
          id="field-languages"
          class="field__input"
          type="text"
          [ngModel]="form().languages.join(', ')"
          (ngModelChange)="updateLanguages($event)"
          [placeholder]="t()('profile.languages_hint')"
        />
      </div>
    </div>
  </div>
  } @else {
  <div class="editor-panel">
    <div class="scaffold">
      <span class="scaffold__label">{{ t()('profile.scaffold_label') }}</span>
      <span class="scaffold__line"># Name · Title · Location</span>
      <span class="scaffold__line">## Experience · Skills · Education · Languages</span>
    </div>
    <textarea
      class="editor"
      [ngModel]="fullMd()"
      (ngModelChange)="fullMd.set($event)"
      spellcheck="false"
    ></textarea>
  </div>
  } @if (dirty()) {
  <p class="unsaved-hint">{{ t()('profile.unsaved') }}</p>
  }
</section>
```

- [ ] **Step 6: Replace the scoring JSON `<pre>` (line ~231-233) with the summary component**

Replace:

```html
@if (profile()?.scoringJson) {
<pre class="json-block">{{ scoringJsonPretty() }}</pre>
}
```

with:

```html
@if (profile()?.scoringJson) {
<app-scoring-summary
  [scoringJson]="profile()?.scoringJson ?? null"
  [form]="form()"
  (addField)="focusField($event)"
/>
}
```

- [ ] **Step 7: Add styles for the form cards and mode toggle**

Append to the component `styles` string (before the closing backtick):

```css
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.mode-toggle {
  display: inline-flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--surface-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-badge);
}
.mode-btn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  background: none;
  border: none;
  border-radius: var(--radius-badge);
  cursor: pointer;
}
.mode-btn--on {
  color: var(--text-primary);
  background: var(--surface-2);
}
.form-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 72ch;
}
.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.field-row {
  display: flex;
  gap: var(--space-3);
}
.field-row .field {
  flex: 1;
}
.field__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.field__input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-primary);
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
}
.field__input--area {
  min-height: 160px;
  line-height: 1.6;
  resize: vertical;
}
```

- [ ] **Step 8: Run the profile tests and the full desktop suite**

Run: `npx nx test desktop -- --testPathPattern="profile"`
Expected: PASS (profile.component contract + scoring-summary).

- [ ] **Step 9: Verify the app builds and renders (preview)**

Run the desktop dev server via the preview workflow, open the Profile page, and confirm:

- Form fields show parsed profile content; typing updates completeness live.
- Toggling to Raw Markdown shows the serialized MD; toggling back preserves edits.
- After Generate, the AI view shows strengths chips + gaps + `Show technical data (JSON)` toggle instead of a raw JSON blob.
- Save persists (reload shows saved content).

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts apps/desktop/src/app/pages/profile/profile.component.spec.ts
git commit -m "feat(profile): structured form editor, raw toggle, AI summary view"
```

---

## Self-Review Notes

- **Spec coverage:** structured form ↔ MD (Task 1 + 4), Raw escape hatch (Task 4), summary variant A with completeness/strengths/gaps (Task 3), local completeness (Task 1/3), tolerant scoringJson parse incl. fences (Task 1), decomposition into util + presentational component (Tasks 1, 3), i18n en+de (Task 2), tests for round-trip/malformed/completeness (Tasks 1, 3, 4). All covered.
- **Type consistency:** `ProfileForm`, `ProfileFieldKey`, `ScoringProfile`, `parseScoringJson`, `profileCompleteness`, `missingFields`, `serializeProfileForm`, `parseProfileMd` names are identical across Tasks 1, 3, 4.
- **Known limitation (documented):** round-trip is guaranteed for `name` non-empty; a form with an empty name but set title/location can misassign on re-parse — acceptable for v1 since name is the first-entered field.

```

```
