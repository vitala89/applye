# CV Gap-Fill Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before generating a tailored CV, an AI step detects gaps against the specific job and gathers the missing facts through an agentic overlay dialog, feeding the answers into generation and optionally saving them to the profile.

**Architecture:** A new `cv-gap-analysis` AI skill returns targeted questions from the tailored CV text + job description. A standalone `CvGapDialog` overlay collects answers one at a time. `JobsComponent.createCvDraft` runs the analysis, shows the dialog when there are questions, appends the answered items to the `cv_text` fed into the existing `cv-import` path, and (optionally) appends them to the profile. Fail-open: any analysis error skips the dialog and generates as before.

**Tech Stack:** Angular (standalone components, signals), Rust/Tauri (skill loader), Jest (frontend), cargo test (Rust).

## Global Constraints

- No em dashes or en dashes anywhere (code, comments, strings, commits). Use `-`. (Copied verbatim from repo rule.)
- Commit subjects: Conventional Commits, subject must NOT be sentence/upper/pascal-case (lowercase start after `type(scope):`). commitlint enforces this.
- Every new user-facing string needs EN + DE entries in `libs/i18n/src/lib/translations/translations.ts` (ru/es/fr/uk inherit via `stub(en, ...)`).
- CV documents stay one-per-job (ADR-0003): `createCvDraft` already reuses `app.cvDocumentId ?? undefined`. Do not change that.
- Profile writes go through `db.upsertProfile` which is a whole-row replace: always carry forward `scoringJson`, `scoringHash`, `pitchMd`, `targetArchetypes` when writing `fullMd`, or they are NULLed (the #97 bug class).
- AI calls use `settings.economyModel`, and cache by `db.hashText(...)` input hash, matching the rest of `jobs.component.ts`.
- Feature is additive and fail-open: a failed/garbage gap analysis must never block CV generation.

---

## Task 1: Pure helpers (`parseCvGapResponse`, `buildAdditionalInfoBlock`)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (add types + two functions near the existing `parseCvSkillResponse` at ~line 409)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (add a describe block)

**Interfaces:**

- Consumes: existing `cleanJsonText`, `repairTruncatedJson` from the same file.
- Produces:
  - `export interface CvGapQuestion { id: string; category: 'skill' | 'experience' | 'language' | 'other'; question: string; hint: string | null; }`
  - `export interface CvGapAnswer { id: string; question: string; answer: string; }`
  - `export function parseCvGapResponse(text: string): CvGapQuestion[]`
  - `export function buildAdditionalInfoBlock(answers: CvGapAnswer[]): string`

- [ ] **Step 1: Write the failing tests**

Add to `cv-content.util.spec.ts` (import the new symbols at top of the existing import from `./cv-content.util`):

```ts
describe('parseCvGapResponse', () => {
  it('parses questions from valid JSON', () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: 'q1',
          category: 'skill',
          question: 'Do you know Kubernetes?',
          hint: 'The job asks for it',
        },
        { id: 'q2', category: 'language', question: 'German level?', hint: null },
      ],
    });
    expect(parseCvGapResponse(raw)).toEqual([
      {
        id: 'q1',
        category: 'skill',
        question: 'Do you know Kubernetes?',
        hint: 'The job asks for it',
      },
      { id: 'q2', category: 'language', question: 'German level?', hint: null },
    ]);
  });

  it('returns [] on garbage (fail-open)', () => {
    expect(parseCvGapResponse('not json at all')).toEqual([]);
    expect(parseCvGapResponse('{"questions": "oops"}')).toEqual([]);
  });

  it('caps at 5 questions', () => {
    const q = (n: number) => ({ id: `q${n}`, category: 'other', question: `Q${n}`, hint: null });
    const raw = JSON.stringify({ questions: [q(1), q(2), q(3), q(4), q(5), q(6), q(7)] });
    expect(parseCvGapResponse(raw)).toHaveLength(5);
  });

  it('defaults a missing/unknown category to "other" and a missing hint to null', () => {
    const raw = JSON.stringify({ questions: [{ id: 'q1', question: 'X' }] });
    expect(parseCvGapResponse(raw)).toEqual([
      { id: 'q1', category: 'other', question: 'X', hint: null },
    ]);
  });
});

describe('buildAdditionalInfoBlock', () => {
  it('builds a markdown block from answered items', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '2 years in production' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe(
      '## Additional information\n- Kubernetes?: 2 years in production\n- German level?: B2',
    );
  });

  it('drops empty/whitespace answers', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '  ' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe('## Additional information\n- German level?: B2');
  });

  it('returns "" when nothing is answered', () => {
    expect(buildAdditionalInfoBlock([{ id: 'q1', question: 'X', answer: '' }])).toBe('');
    expect(buildAdditionalInfoBlock([])).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: FAIL - `parseCvGapResponse`/`buildAdditionalInfoBlock` are not exported.

- [ ] **Step 3: Implement the helpers**

Add to `cv-content.util.ts` (after `parseCvSkillResponse`):

```ts
export interface CvGapQuestion {
  id: string;
  category: 'skill' | 'experience' | 'language' | 'other';
  question: string;
  hint: string | null;
}

export interface CvGapAnswer {
  id: string;
  question: string;
  answer: string;
}

const GAP_CATEGORIES = ['skill', 'experience', 'language', 'other'] as const;

/** Parses the `cv-gap-analysis` skill response into at most 5 questions.
 * Fail-open: any malformed output yields `[]` so a bad analysis never blocks
 * CV generation. */
export function parseCvGapResponse(text: string): CvGapQuestion[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(cleanJsonText(text));
  } catch {
    const repaired = repairTruncatedJson(cleanJsonText(text));
    if (repaired) {
      try {
        raw = JSON.parse(repaired);
      } catch {
        return [];
      }
    }
  }
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const out: CvGapQuestion[] = [];
  for (const item of list) {
    const q = item as Partial<CvGapQuestion>;
    if (typeof q?.id !== 'string' || typeof q?.question !== 'string') continue;
    const category = GAP_CATEGORIES.includes(q.category as never)
      ? (q.category as CvGapQuestion['category'])
      : 'other';
    out.push({
      id: q.id,
      category,
      question: q.question,
      hint: typeof q.hint === 'string' ? q.hint : null,
    });
    if (out.length === 5) break;
  }
  return out;
}

/** Assembles the answered gap items into a markdown block appended to the CV
 * text before parsing. Empty answers are dropped; returns '' when nothing was
 * answered so callers can skip the append entirely. */
export function buildAdditionalInfoBlock(answers: CvGapAnswer[]): string {
  const lines = answers
    .filter((a) => a.answer.trim().length > 0)
    .map((a) => `- ${a.question}: ${a.answer.trim()}`);
  return lines.length ? `## Additional information\n${lines.join('\n')}` : '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: PASS (all new tests green, existing tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat(documents): parse cv-gap questions and build the additional-info block"
```

---

## Task 2: `cv-gap-analysis` AI skill (Rust registration)

**Files:**

- Create: `libs/skills/src/cv-gap-analysis/cv-gap-analysis.md`
- Modify: `apps/desktop/src-tauri/src/ai/skills.rs` (add a match arm in `skill_source`, add the name to the `every_registered_skill_renders` test list)

**Interfaces:**

- Produces: a skill named `cv-gap-analysis`, renderable via `render("cv-gap-analysis", ctx)`; consumed by `ai.renderSkill('cv-gap-analysis', { cv_text, job_description, language })` in Task 4.

- [ ] **Step 1: Create the skill file**

Create `libs/skills/src/cv-gap-analysis/cv-gap-analysis.md`:

```markdown
---
version: 1
description: >
  Compares a candidate's tailored CV text against a specific job description
  and returns targeted follow-up questions about information the CV is missing
  or leaves vague relative to what the job asks for (specific technologies,
  concrete experience, language levels). It asks - it never answers or invents
  facts. Returns an empty list when the CV already evidences what the job
  needs. One AI call, cached by the input hash.
inputs:
  - name: cv_text
    description: The candidate's current tailored CV, as markdown/plain text.
  - name: job_description
    description: The target job's description text.
  - name: language
    description: Output language for the question text (e.g. en, de).
output_format: valid JSON only - no markdown, no preamble
recommended_model: claude-haiku-4-5
---

[SYSTEM]
You compare a candidate's CV against a specific job and surface the gaps: things the job clearly asks for that the CV does not evidence. You produce short follow-up QUESTIONS to the candidate so they can supply the missing facts. You never answer the questions yourself, never invent experience, and never restate what the CV already covers.

Rules:

- Output ONLY valid JSON. No markdown fences, no commentary, no preamble.
- Shape: {"questions": [{"id": string, "category": "skill" | "experience" | "language" | "other", "question": string, "hint": string | null}]}.
- At most 5 questions. Fewer is better. Return {"questions": []} when the CV already covers what the job asks for.
- Each question must map to something the JOB asks for that the CV does NOT already show. Do not ask about things already in the CV.
- "category": "skill" for a technology/tool/framework, "language" for spoken-language proficiency, "experience" for concrete experience/scope/impact, "other" otherwise.
- "question" is one short, plain question in {{language}} (e.g. "The role needs Kubernetes - do you have hands-on experience, and how long?").
- "hint" is an optional one-line note on why it matters (or null).
- "id" is a short stable slug (e.g. "kubernetes", "german-level").

[USER]
JOB DESCRIPTION:
{{job_description}}

CANDIDATE CV:
{{cv_text}}

Return the JSON now.
```

- [ ] **Step 2: Register the skill and extend the render test**

In `apps/desktop/src-tauri/src/ai/skills.rs`, add to `skill_source`'s match (after the `cover-letter-tailor` arm):

```rust
        "cv-gap-analysis" => Some(include_str!(
            "../../../../../libs/skills/src/cv-gap-analysis/cv-gap-analysis.md"
        )),
```

And add `"cv-gap-analysis"` to the array in the `every_registered_skill_renders` test:

```rust
        for name in [
            "cv-import",
            "onboarding-archetypes",
            "cv-generate-baseline",
            "cover-letter-generate",
            "cover-letter-tailor",
            "cv-gap-analysis",
        ] {
```

- [ ] **Step 3: Run the Rust skill tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml skills`
Expected: PASS, including `every_registered_skill_renders` (proves the new skill file loads and parses).

- [ ] **Step 4: Commit**

```bash
git add libs/skills/src/cv-gap-analysis/cv-gap-analysis.md apps/desktop/src-tauri/src/ai/skills.rs
git commit -m "feat(skills): add cv-gap-analysis skill and register it"
```

---

## Task 3: `CvGapDialog` overlay component

**Files:**

- Create: `apps/desktop/src/app/pages/jobs/cv-gap-dialog.component.ts`
- Create: `apps/desktop/src/app/pages/jobs/cv-gap-dialog.component.spec.ts`

**Interfaces:**

- Consumes: `CvGapQuestion`, `CvGapAnswer` from `../documents/cv-content.util`.
- Produces: standalone component `CvGapDialog`, selector `app-cv-gap-dialog`.
  - Inputs: `questions = input.required<CvGapQuestion[]>()`, `analyzing = input<boolean>(false)`.
  - Outputs: `submit = output<{ answers: CvGapAnswer[]; saveToProfile: boolean }>()`, `cancel = output<void>()`.

- [ ] **Step 1: Write the failing component test**

Create `cv-gap-dialog.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CvGapDialog } from './cv-gap-dialog.component';
import { TranslateService } from '@applye/i18n';
import type { CvGapQuestion } from '../documents/cv-content.util';

function setup(questions: CvGapQuestion[], analyzing = false) {
  TestBed.configureTestingModule({
    imports: [CvGapDialog],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture = TestBed.createComponent(CvGapDialog);
  fixture.componentRef.setInput('questions', questions);
  fixture.componentRef.setInput('analyzing', analyzing);
  fixture.detectChanges();
  return fixture;
}

const QS: CvGapQuestion[] = [
  { id: 'q1', category: 'skill', question: 'Kubernetes?', hint: null },
  { id: 'q2', category: 'language', question: 'German level?', hint: null },
];

describe('CvGapDialog', () => {
  it('collects answers and emits them with saveToProfile on submit', () => {
    const fixture = setup(QS);
    const cmp = fixture.componentInstance as unknown as {
      setAnswer: (t: string) => void;
      next: () => void;
      toggleSaveToProfile: (v: boolean) => void;
      doSubmit: () => void;
    };
    let emitted: { answers: unknown[]; saveToProfile: boolean } | null = null;
    fixture.componentInstance.submit.subscribe((e) => (emitted = e));

    cmp.setAnswer('2 years');
    cmp.next(); // -> q2
    cmp.setAnswer('B2');
    cmp.next(); // -> review
    cmp.toggleSaveToProfile(true);
    cmp.doSubmit();

    expect(emitted).toEqual({
      answers: [
        { id: 'q1', question: 'Kubernetes?', answer: '2 years' },
        { id: 'q2', question: 'German level?', answer: 'B2' },
      ],
      saveToProfile: true,
    });
  });

  it('records an empty answer when a question is skipped', () => {
    const fixture = setup(QS);
    const cmp = fixture.componentInstance as unknown as {
      skip: () => void;
      setAnswer: (t: string) => void;
      next: () => void;
      doSubmit: () => void;
    };
    let emitted: { answers: { answer: string }[] } | null = null;
    fixture.componentInstance.submit.subscribe((e) => (emitted = e));

    cmp.skip(); // q1 -> ''
    cmp.setAnswer('B2');
    cmp.next(); // q2 -> review
    cmp.doSubmit();

    expect(emitted!.answers).toEqual([
      { id: 'q1', question: 'Kubernetes?', answer: '' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-gap-dialog.component.spec.ts`
Expected: FAIL - `CvGapDialog` does not exist.

- [ ] **Step 3: Implement the component**

Create `cv-gap-dialog.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@applye/i18n';
import type { CvGapAnswer, CvGapQuestion } from '../documents/cv-content.util';

@Component({
  selector: 'app-cv-gap-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gap-dialog" role="dialog" aria-modal="true">
      <div class="gap-dialog__panel">
        @if (analyzing()) {
          <div class="gap-dialog__analyzing">
            <span class="ai-thinking__dots" aria-hidden="true"
              ><span></span><span></span><span></span
            ></span>
            <p>{{ t()('jobs.gap.analyzing') }}</p>
          </div>
        } @else if (atReview()) {
          <div class="gap-dialog__review">
            <h4>{{ t()('jobs.gap.review_title') }}</h4>
            <label class="gap-dialog__save">
              <input
                type="checkbox"
                [ngModel]="saveToProfile()"
                (ngModelChange)="toggleSaveToProfile($event)"
              />
              {{ t()('jobs.gap.save_to_profile') }}
            </label>
            <div class="gap-dialog__actions">
              <button class="btn btn--secondary btn--md" type="button" (click)="cancel.emit()">
                {{ t()('actions.cancel') }}
              </button>
              <button class="btn btn--primary btn--md" type="button" (click)="doSubmit()">
                {{ t()('jobs.gap.generate') }}
              </button>
            </div>
          </div>
        } @else if (current(); as q) {
          <div class="gap-dialog__question">
            <span class="eyebrow"
              >{{ t()('jobs.gap.question_of') }} {{ index() + 1 }}/{{ questions().length }}</span
            >
            <h4>{{ q.question }}</h4>
            @if (q.hint) {
              <p class="muted">{{ q.hint }}</p>
            }
            <textarea
              class="gap-dialog__input"
              rows="3"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              [placeholder]="t()('jobs.gap.answer_placeholder')"
            ></textarea>
            <div class="gap-dialog__actions">
              <button class="btn btn--ghost btn--md" type="button" (click)="skip()">
                {{ t()('jobs.gap.skip') }}
              </button>
              <button class="btn btn--primary btn--md" type="button" (click)="next()">
                {{ t()('jobs.gap.next') }}
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .gap-dialog {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--bg-app) 70%, transparent);
      }
      .gap-dialog__panel {
        width: min(520px, 92vw);
        padding: var(--space-6, 20px);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card, 8px);
        box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 25%));
      }
      .gap-dialog__analyzing {
        display: flex;
        align-items: center;
        gap: var(--space-3, 8px);
      }
      .gap-dialog__input {
        width: 100%;
        margin: var(--space-3, 8px) 0;
        padding: var(--space-3, 8px);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input, 6px);
        background: var(--surface-sunken);
        color: var(--text-primary);
        font-family: var(--font-sans, sans-serif);
      }
      .gap-dialog__save {
        display: flex;
        align-items: center;
        gap: var(--space-2, 6px);
        margin: var(--space-4, 12px) 0;
      }
      .gap-dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3, 8px);
      }
    `,
  ],
})
export class CvGapDialog {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly questions = input.required<CvGapQuestion[]>();
  readonly analyzing = input<boolean>(false);

  readonly submit = output<{ answers: CvGapAnswer[]; saveToProfile: boolean }>();
  readonly cancel = output<void>();

  protected readonly index = signal(0);
  protected readonly draft = signal('');
  protected readonly saveToProfile = signal(false);
  private readonly collected = signal<CvGapAnswer[]>([]);

  protected readonly atReview = computed(() => this.index() >= this.questions().length);
  protected readonly current = computed(() => this.questions()[this.index()] ?? null);

  /** Test seam: set the current draft answer. */
  setAnswer(text: string): void {
    this.draft.set(text);
  }

  next(): void {
    this.record(this.draft().trim());
  }

  skip(): void {
    this.record('');
  }

  private record(answer: string): void {
    const q = this.current();
    if (!q) return;
    this.collected.update((list) => [...list, { id: q.id, question: q.question, answer }]);
    this.draft.set('');
    this.index.update((i) => i + 1);
  }

  toggleSaveToProfile(value: boolean): void {
    this.saveToProfile.set(value);
  }

  doSubmit(): void {
    this.submit.emit({ answers: this.collected(), saveToProfile: this.saveToProfile() });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=cv-gap-dialog.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/cv-gap-dialog.component.ts apps/desktop/src/app/pages/jobs/cv-gap-dialog.component.spec.ts
git commit -m "feat(jobs): add cv gap-fill dialog component"
```

---

## Task 4: Wire the gap flow into `createCvDraft` + i18n

**Files:**

- Modify: `apps/desktop/src/app/pages/jobs/jobs.component.ts` (imports, signals, `createCvDraft`, template: render `<app-cv-gap-dialog>`)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (EN + DE `jobs.gap.*`)

**Interfaces:**

- Consumes: `parseCvGapResponse`, `buildAdditionalInfoBlock`, `CvGapAnswer` (Task 1), `CvGapDialog` (Task 3), skill `cv-gap-analysis` (Task 2).
- Produces: nothing downstream; end of feature.

- [ ] **Step 1: Add i18n strings (EN + DE)**

In `translations.ts`, inside the EN `jobs` object (near the `wizard` block), add a `gap` group:

```ts
    gap: {
      analyzing: 'Checking your CV against this job...',
      question_of: 'Question',
      answer_placeholder: 'Type your answer, or Skip',
      hint: '',
      skip: 'Skip',
      next: 'Next',
      review_title: 'Add these to your CV?',
      save_to_profile: 'Also save these answers to my profile',
      generate: 'Generate CV',
    },
```

And the DE equivalent in the German `jobs` object:

```ts
    gap: {
      analyzing: 'Wir gleichen Ihren Lebenslauf mit dieser Stelle ab...',
      question_of: 'Frage',
      answer_placeholder: 'Antwort eingeben oder überspringen',
      hint: '',
      skip: 'Überspringen',
      next: 'Weiter',
      review_title: 'Diese in den Lebenslauf aufnehmen?',
      save_to_profile: 'Antworten auch in meinem Profil speichern',
      generate: 'Lebenslauf erstellen',
    },
```

(Remove the unused `hint` key if the i18n parity test flags empty strings; keep only keys the template reads: analyzing, question_of, answer_placeholder, skip, next, review_title, save_to_profile, generate.)

- [ ] **Step 2: Add imports and signals to `JobsComponent`**

In `jobs.component.ts` imports, add to the `@applye/core`/util imports:

```ts
import {
  buildCvContent,
  buildAdditionalInfoBlock,
  cleanJsonText,
  cvContentToMd,
  parseCvGapResponse,
  parseCvSkillResponse,
  type CvGapAnswer,
  type CvGapQuestion,
} from '../documents/cv-content.util';
import { CvGapDialog } from './cv-gap-dialog.component';
```

Add `CvGapDialog` to the component's `imports: [...]` array.

Add signals near the other document signals (after `documentPreparing`):

```ts
  readonly gapAnalyzing = signal(false);
  readonly gapDialogOpen = signal(false);
  readonly gapQuestions = signal<CvGapQuestion[]>([]);
  private gapResolver: ((result: { answers: CvGapAnswer[]; saveToProfile: boolean } | null) => void) | null = null;
```

- [ ] **Step 3: Add the gap-analysis + dialog-await helpers**

Add these methods to `JobsComponent` (near `createCvDraft`):

```ts
  /** Runs the gap-analysis skill for the current job/CV. Fail-open: returns []
   * on any error so a bad analysis never blocks generation. */
  private async analyzeCvGaps(cvText: string): Promise<CvGapQuestion[]> {
    const job = this.job();
    const settings = this.settings();
    if (!job?.id || !settings) return [];
    try {
      const language = this.documentReviewLanguage();
      const rendered = await this.ai.renderSkill('cv-gap-analysis', {
        cv_text: cvText,
        job_description: job.jdText ?? '',
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      return parseCvGapResponse(res.text);
    } catch {
      return [];
    }
  }

  /** Opens the gap dialog and resolves when the user submits or cancels. */
  private awaitGapDialog(questions: CvGapQuestion[]): Promise<{ answers: CvGapAnswer[]; saveToProfile: boolean } | null> {
    this.gapQuestions.set(questions);
    this.gapDialogOpen.set(true);
    return new Promise((resolve) => {
      this.gapResolver = resolve;
    });
  }

  onGapSubmit(result: { answers: CvGapAnswer[]; saveToProfile: boolean }): void {
    this.gapDialogOpen.set(false);
    this.gapResolver?.(result);
    this.gapResolver = null;
  }

  onGapCancel(): void {
    this.gapDialogOpen.set(false);
    this.gapResolver?.(null);
    this.gapResolver = null;
  }

  /** Appends the answered gap items to the profile fullMd. Whole-row-replace
   * safe: carries every other profile field forward (the #97 lesson). */
  private async appendToProfile(block: string): Promise<void> {
    const p = this.profile();
    if (!p || !block) return;
    const updated = await this.db.upsertProfile({
      fullMd: `${p.fullMd}\n\n${block}`,
      scoringJson: p.scoringJson,
      scoringHash: p.scoringHash,
      pitchMd: p.pitchMd,
      targetArchetypes: p.targetArchetypes,
    });
    this.profile.set(updated);
  }
```

- [ ] **Step 4: Insert the gap step into `createCvDraft`**

In `createCvDraft`, after computing `const language = this.documentReviewLanguage();` and BEFORE the `renderSkill('cv-import', ...)` call, insert:

```ts
// Agentic gap-fill: ask about info the job wants that the CV lacks, then
// fold the answers into the text we structure. Fail-open and skippable.
this.gapAnalyzing.set(true);
let additionalInfo = '';
try {
  const questions = await this.analyzeCvGaps(tailoredMd);
  this.gapAnalyzing.set(false);
  if (questions.length) {
    const result = await this.awaitGapDialog(questions);
    if (result) {
      additionalInfo = buildAdditionalInfoBlock(result.answers);
      if (result.saveToProfile && additionalInfo) {
        await this.appendToProfile(additionalInfo);
      }
    }
  }
} finally {
  this.gapAnalyzing.set(false);
}
const cvSourceText = additionalInfo ? `${tailoredMd}\n\n${additionalInfo}` : tailoredMd;
```

Then change the existing `cv-import` render call to use `cvSourceText`:

```ts
const rendered = await this.ai.renderSkill('cv-import', {
  cv_text: cvSourceText,
  language,
});
```

(Leave the rest of `createCvDraft` - the `ai.run`, `parseCvSkillResponse`, `buildCvContent`, upsert - unchanged.)

- [ ] **Step 5: Render the dialog + analyzing overlay in the template**

In the CV card of the Review Documents step (near the `documentPreparing() === 'cv'` spinner), add the dialog at the end of the wizard documents step block (before its closing `</div>`), so it overlays when open:

```html
@if (gapDialogOpen() || gapAnalyzing()) {
<app-cv-gap-dialog
  [questions]="gapQuestions()"
  [analyzing]="gapAnalyzing()"
  (submit)="onGapSubmit($event)"
  (cancel)="onGapCancel()"
/>
}
```

- [ ] **Step 6: Build and run the full desktop suite**

Run: `npx nx build desktop`
Expected: SUCCESS (template + types compile).

Run: `npx nx test desktop`
Expected: PASS (all suites, including the new specs from Tasks 1 and 3, plus i18n parity).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/jobs.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(jobs): run cv gap-fill before generating a tailored cv"
```

---

## Task 5: Verification, docs, PR

**Files:**

- Modify: `CHANGELOG.md` ([Unreleased] > Added), `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Lint**

Run: `npx nx lint desktop --skip-nx-cache`
Expected: no NEW problems in touched files (the 5 pre-existing `my-jobs.component.html` errors remain).

- [ ] **Step 2: Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml skills`
Expected: PASS.

- [ ] **Step 3: CHANGELOG + state sync**

Add to `CHANGELOG.md` `[Unreleased] > Added`:

```markdown
- **The CV generator asks about what the job needs and your CV is missing.** Before it writes a tailored CV, it now checks the job against your CV and, if there are gaps (a technology, concrete experience, a language level), asks you a few quick questions. Answer the ones you can, skip the rest, and optionally save the answers to your profile so it does not ask again.
```

Update `docs/product/CURRENT_STATE.md` current-branch line + last-updated to describe the gap-fill agent (skill + dialog + createCvDraft wiring; fail-open; CV-only).

- [ ] **Step 4: Commit docs**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs: changelog + state sync for cv gap-fill agent"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/cv-gap-fill-agent
gh pr create --title "feat(jobs): cv gap-fill agent before generation" --body "..."
```

Manual Tauri gate (needs backend, note in PR): on Create/Regenerate CV, the analyzing overlay appears; when the job needs something the CV lacks, questions show one at a time; answers appear in the generated CV; "save to profile" persists them; a job that already covers the role skips straight to generation.

---

## Self-Review Notes

- **Spec coverage:** skill (Task 2), dialog (Task 3), pure helpers (Task 1), wiring + save-to-profile + fail-open (Task 4), i18n (Task 4), tests (Tasks 1/2/3), caching note (economyModel used; hash-cache is inherited from the surrounding pattern - if `ai.run` does not auto-cache gap analysis, that is acceptable for MVP since the call is cheap and only fires on explicit Create/Regenerate).
- **Type consistency:** `CvGapQuestion`/`CvGapAnswer` defined in Task 1, consumed unchanged in Tasks 3-4; dialog output shape `{ answers, saveToProfile }` matches `awaitGapDialog`/`onGapSubmit`.
- **Placeholder scan:** PR body `"..."` is the only intentional fill-at-time-of-PR; all code steps carry complete code.
