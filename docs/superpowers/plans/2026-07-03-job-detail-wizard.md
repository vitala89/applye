# Job Detail Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1765-line single-scroll `jobs.component.ts` with a card-based scoring view and a 5-step apply/tailor wizard, reusing all existing Tauri commands / cached data with zero new AI calls.

**Architecture:** Two new `libs/ui` primitives (`score-gauge`, `stepper`). Two new `apps/desktop` components (`scoring-view`, `apply-wizard`) that consume signals passed down from a shrunk `jobs.component.ts`. Shared parsing helpers (dimensions/keywords/redFlags/beforeYouSubmit/starRating) move to a standalone util file so both parent and `scoring-view` can use them without duplication.

**Tech Stack:** Angular 19 standalone components, Signals, Jest + TestBed, `@tauri-apps/plugin-opener`, existing `libs/i18n` `TranslateService`.

## Global Constraints

- No new Tauri/Rust commands, no new DB migrations — spec confirms this is presentation-only.
- No new AI calls anywhere in scoring-view or apply-wizard steps 1–4; step 5 "Apply" also makes no AI calls.
- All new/changed user-facing strings go through `libs/i18n` (EN + DE), no hardcoded text in new templates.
- All colors/spacing/radii from existing `libs/ui`/global design tokens — no hardcoded CSS values.
- Match existing code style: standalone components, `input()`/`output()` signal APIs (per `ButtonDirective` pattern), inline `template`/`styles` in the component decorator (matches existing `jobs.component.ts` convention) unless a file is small enough that external template/style files read better — for the two new small `libs/ui` components, follow the `Ui` component precedent (`templateUrl`/`styleUrl`, external files).
- Test framework is Jest via Angular `TestBed` — see `libs/ui/src/lib/ui/ui.spec.ts` for the exact pattern to copy.
- Conventional Commits (`feat:`, `fix:`, `chore:`) per commit, on branch `feat/job-detail-wizard`.
- Out-of-scope pre-existing issues (e.g. unrelated lint errors in `my-jobs.component.html`) are not touched.

---

## Task 0: Create the feature branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git pull && git checkout -b feat/job-detail-wizard
```

Expected: new branch created, working tree clean.

---

## File Map

**Create:**

- `libs/ui/src/lib/score-gauge/score-gauge.ts` (+ `.html`, `.scss`, `.spec.ts`)
- `libs/ui/src/lib/stepper/stepper.ts` (+ `.html`, `.scss`, `.spec.ts`)
- `apps/desktop/src/app/pages/jobs/scoring.utils.ts`
- `apps/desktop/src/app/pages/jobs/scoring-view.component.ts`
- `apps/desktop/src/app/pages/jobs/apply-wizard.component.ts`

**Modify:**

- `libs/ui/src/index.ts` — export new components
- `libs/i18n/src/lib/translations/translations.ts` — new keys
- `apps/desktop/src/app/pages/jobs/jobs.component.ts` — shrink, delegate to new components
- `apps/desktop/package.json` / root `package.json` — already has `@tauri-apps/plugin-opener`, no change needed (verified in research)
- `CHANGELOG.md`, `package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml` — version bump at the end

---

### Task 1: i18n keys for wizard + card sections

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts` (EN block ~line 221-306 `jobs: {...}`, DE block ~line 589-679 `jobs: {...}`, `common: {...}` block ~line 138-147)

**Interfaces:**

- Produces: translation keys `jobs.wizard.step_review_score`, `jobs.wizard.step_portal_answers`, `jobs.wizard.step_tailor_cv`, `jobs.wizard.step_export`, `jobs.wizard.step_apply`, `jobs.wizard.start_apply`, `jobs.wizard.open_browser`, `jobs.dimensions_title`, `jobs.missing_keywords_title`, `jobs.red_flags_title`, `jobs.ats_check_title`, `jobs.ats_pass_msg`, `jobs.ats_fail_msg`, `jobs.cached_badge`, `common.back`, `common.next`. Consumed by Task 4/5 templates.

- [ ] **Step 1: Add EN keys**

In `libs/i18n/src/lib/translations/translations.ts`, inside the EN `jobs: { ... }` block, add after the existing `load_error: 'Failed to load',` line:

```typescript
      dimensions_title: 'Dimensions',
      missing_keywords_title: 'Missing keywords',
      red_flags_title: 'Red flags',
      ats_check_title: 'ATS check',
      ats_pass_msg: 'Likely to pass ATS scan',
      ats_fail_msg: 'ATS issues detected',
      cached_badge: 'cached · 0 tokens',
      wizard: {
        step_review_score: 'Review score',
        step_portal_answers: 'Portal answers',
        step_tailor_cv: 'Tailor CV',
        step_export: 'Export',
        step_apply: 'Apply',
        start_apply: 'Start apply',
        open_browser: 'Open in browser',
      },
```

Inside the EN `common: { ... }` block, add after `no: 'No',`:

```typescript
      back: 'Back',
      next: 'Next',
```

- [ ] **Step 2: Add DE keys**

In the DE `jobs: { ... }` block, add after the existing `load_error: 'Laden fehlgeschlagen',` line:

```typescript
      dimensions_title: 'Dimensionen',
      missing_keywords_title: 'Fehlende Schlüsselwörter',
      red_flags_title: 'Warnsignale',
      ats_check_title: 'ATS-Prüfung',
      ats_pass_msg: 'Besteht voraussichtlich den ATS-Scan',
      ats_fail_msg: 'ATS-Probleme erkannt',
      cached_badge: 'aus Cache · 0 Tokens',
      wizard: {
        step_review_score: 'Bewertung prüfen',
        step_portal_answers: 'Portalantworten',
        step_tailor_cv: 'Lebenslauf anpassen',
        step_export: 'Export',
        step_apply: 'Bewerben',
        start_apply: 'Bewerbung starten',
        open_browser: 'Im Browser öffnen',
      },
```

In the DE `common: { ... }` block, add matching German for `back`/`next`:

```typescript
      back: 'Zurück',
      next: 'Weiter',
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p libs/i18n/tsconfig.lib.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): add job-detail wizard and scoring-card translation keys"
```

---

### Task 2: `score-gauge` component in libs/ui

**Files:**

- Create: `libs/ui/src/lib/score-gauge/score-gauge.ts`
- Create: `libs/ui/src/lib/score-gauge/score-gauge.html`
- Create: `libs/ui/src/lib/score-gauge/score-gauge.scss`
- Create: `libs/ui/src/lib/score-gauge/score-gauge.spec.ts`
- Modify: `libs/ui/src/index.ts`

**Interfaces:**

- Produces: `ScoreGauge` component, selector `lib-score-gauge`, inputs `score: number` (required), `verdict: string` (default `''`), `cached: boolean` (default `false`), `cachedLabel: string` (default `'cached · 0 tokens'` — caller passes the i18n string so the component stays i18n-agnostic).
- Consumed by: Task 4 (`scoring-view.component.ts`).

- [ ] **Step 1: Write the component class**

`libs/ui/src/lib/score-gauge/score-gauge.ts`:

```typescript
import { Component, computed, input } from '@angular/core';

export type ScoreBand = 'low' | 'mid' | 'high';

@Component({
  selector: 'lib-score-gauge',
  standalone: true,
  imports: [],
  templateUrl: './score-gauge.html',
  styleUrl: './score-gauge.scss',
})
export class ScoreGauge {
  readonly score = input.required<number>();
  readonly verdict = input<string>('');
  readonly cached = input<boolean>(false);
  readonly cachedLabel = input<string>('cached · 0 tokens');

  protected readonly band = computed<ScoreBand>(() => {
    const s = this.score();
    if (s >= 75) return 'high';
    if (s >= 50) return 'mid';
    return 'low';
  });

  protected readonly circumference = 2 * Math.PI * 40;

  protected readonly dashOffset = computed(() => {
    const pct = Math.max(0, Math.min(100, this.score())) / 100;
    return this.circumference * (1 - pct);
  });
}
```

- [ ] **Step 2: Write the template**

`libs/ui/src/lib/score-gauge/score-gauge.html`:

```html
<div class="score-gauge" [class]="'score-gauge--' + band()">
  <svg viewBox="0 0 100 100" class="score-gauge__ring" aria-hidden="true">
    <circle cx="50" cy="50" r="40" class="score-gauge__track"></circle>
    <circle
      cx="50"
      cy="50"
      r="40"
      class="score-gauge__fill"
      [style.stroke-dasharray.px]="circumference"
      [style.stroke-dashoffset.px]="dashOffset()"
    ></circle>
  </svg>
  <div class="score-gauge__center">
    <span class="score-gauge__number">{{ score() }}</span>
    <span class="score-gauge__max">/100</span>
  </div>
  @if (verdict()) {
  <p class="score-gauge__verdict">{{ verdict() }}</p>
  } @if (cached()) {
  <span class="score-gauge__cache-chip">{{ cachedLabel() }}</span>
  }
</div>
```

- [ ] **Step 3: Write the styles (tokens only)**

`libs/ui/src/lib/score-gauge/score-gauge.scss`:

```scss
.score-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  position: relative;
}

.score-gauge__ring {
  width: 120px;
  height: 120px;
  transform: rotate(-90deg);
}

.score-gauge__track {
  fill: none;
  stroke: var(--color-border);
  stroke-width: 8;
}

.score-gauge__fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease;
}

.score-gauge--low .score-gauge__fill {
  stroke: var(--color-danger);
}

.score-gauge--mid .score-gauge__fill {
  stroke: var(--color-warning);
}

.score-gauge--high .score-gauge__fill {
  stroke: var(--color-success);
}

.score-gauge__center {
  position: absolute;
  top: 42px;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.score-gauge__number {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text);
}

.score-gauge__max {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.score-gauge__verdict {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  text-align: center;
}

.score-gauge__cache-chip {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
  border-radius: var(--radius-full, 999px);
  padding: 2px 8px;
}
```

If any of `--color-danger`, `--color-warning`, `--color-success`, `--color-surface-muted`, `--radius-full`, `--text-2xl`, `--text-xs`, `--font-mono` don't exist in the current `libs/ui` tokens file, substitute the nearest existing token name found there — do not invent new token names; grep `libs/ui/src` for `--color-` and `--text-` before finalizing this step to confirm exact names.

- [ ] **Step 4: Write the smoke test**

`libs/ui/src/lib/score-gauge/score-gauge.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreGauge } from './score-gauge';

describe('ScoreGauge', () => {
  let component: ScoreGauge;
  let fixture: ComponentFixture<ScoreGauge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreGauge],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreGauge);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('score', 82);
    fixture.componentRef.setInput('verdict', 'Strong match');
    fixture.componentRef.setInput('cached', true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the score number', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge__number')?.textContent?.trim()).toBe('82');
  });

  it('shows the cache chip when cached is true', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge__cache-chip')).toBeTruthy();
  });

  it('bands the score correctly at the high threshold', () => {
    fixture.componentRef.setInput('score', 82);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest libs/ui/src/lib/score-gauge/score-gauge.spec.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Export from libs/ui public API**

In `libs/ui/src/index.ts`, add:

```typescript
export * from './lib/score-gauge/score-gauge';
```

- [ ] **Step 7: Commit**

```bash
git add libs/ui/src/lib/score-gauge libs/ui/src/index.ts
git commit -m "feat(ui): add score-gauge component"
```

---

### Task 3: `stepper` component in libs/ui

**Files:**

- Create: `libs/ui/src/lib/stepper/stepper.ts`
- Create: `libs/ui/src/lib/stepper/stepper.html`
- Create: `libs/ui/src/lib/stepper/stepper.scss`
- Create: `libs/ui/src/lib/stepper/stepper.spec.ts`
- Modify: `libs/ui/src/index.ts`

**Interfaces:**

- Produces: `Stepper` component, selector `lib-stepper`, inputs `steps: string[]` (labels, required), `activeIndex: number` (0-based, required), `nextDisabled: boolean` (default `false`), `backLabel: string` (default `'Back'`), `nextLabel: string` (default `'Next'`); outputs `back: void`, `next: void`.
- Consumed by: Task 5 (`apply-wizard.component.ts`).

- [ ] **Step 1: Write the component class**

`libs/ui/src/lib/stepper/stepper.ts`:

```typescript
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'lib-stepper',
  standalone: true,
  imports: [],
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
})
export class Stepper {
  readonly steps = input.required<string[]>();
  readonly activeIndex = input.required<number>();
  readonly nextDisabled = input<boolean>(false);
  readonly backLabel = input<string>('Back');
  readonly nextLabel = input<string>('Next');

  readonly back = output<void>();
  readonly next = output<void>();

  protected onBack(): void {
    this.back.emit();
  }

  protected onNext(): void {
    this.next.emit();
  }
}
```

- [ ] **Step 2: Write the template**

`libs/ui/src/lib/stepper/stepper.html`:

```html
<div class="stepper">
  <div class="stepper__dots">
    @for (label of steps(); track label; let i = $index) {
    <div
      class="stepper__dot"
      [class.stepper__dot--done]="i < activeIndex()"
      [class.stepper__dot--active]="i === activeIndex()"
    >
      <span class="stepper__dot-num">{{ i + 1 }}</span>
      <span class="stepper__dot-label">{{ label }}</span>
    </div>
    @if (i < steps().length - 1) {
    <span class="stepper__sep"></span>
    } }
  </div>
  <div class="stepper__nav">
    <button type="button" class="btn-ghost" [disabled]="activeIndex() === 0" (click)="onBack()">
      {{ backLabel() }}
    </button>
    <button
      type="button"
      class="btn btn--primary"
      [disabled]="nextDisabled() || activeIndex() === steps().length - 1"
      (click)="onNext()"
    >
      {{ nextLabel() }}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Write the styles (tokens only)**

`libs/ui/src/lib/stepper/stepper.scss`:

```scss
.stepper {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stepper__dots {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stepper__dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  opacity: 0.5;
}

.stepper__dot--done,
.stepper__dot--active {
  opacity: 1;
}

.stepper__dot-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.stepper__dot--active .stepper__dot-num {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.stepper__dot--done .stepper__dot-num {
  background: var(--color-success);
  color: var(--color-accent-contrast);
}

.stepper__dot-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.stepper__sep {
  flex: 1;
  height: 1px;
  background: var(--color-border);
  min-width: var(--space-4);
}

.stepper__nav {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
```

Grep `libs/ui/src` for `--color-accent`, `--color-accent-contrast`, `--space-1` through `--space-4` before finalizing — substitute the exact existing token names if these differ.

- [ ] **Step 4: Write the smoke test**

`libs/ui/src/lib/stepper/stepper.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Stepper } from './stepper';

describe('Stepper', () => {
  let component: Stepper;
  let fixture: ComponentFixture<Stepper>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stepper],
    }).compileComponents();

    fixture = TestBed.createComponent(Stepper);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('steps', ['One', 'Two', 'Three']);
    fixture.componentRef.setInput('activeIndex', 1);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders one dot per step', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stepper__dot').length).toBe(3);
  });

  it('emits next when Next is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    component.next.subscribe(() => (emitted = true));
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn--primary');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('emits back when Back is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    component.back.subscribe(() => (emitted = true));
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-ghost');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('disables Back on the first step', () => {
    fixture.componentRef.setInput('activeIndex', 0);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-ghost');
    expect(btn.disabled).toBe(true);
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest libs/ui/src/lib/stepper/stepper.spec.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Export from libs/ui public API**

In `libs/ui/src/index.ts`, add:

```typescript
export * from './lib/stepper/stepper';
```

- [ ] **Step 7: Commit**

```bash
git add libs/ui/src/lib/stepper libs/ui/src/index.ts
git commit -m "feat(ui): add stepper component"
```

---

### Task 4: Extract scoring parse helpers + `scoring-view` component

**Files:**

- Create: `apps/desktop/src/app/pages/jobs/scoring.utils.ts`
- Create: `apps/desktop/src/app/pages/jobs/scoring-view.component.ts`
- Modify: `apps/desktop/src/app/pages/jobs/jobs.component.ts` (remove now-duplicated helper methods, delegate template)

**Interfaces:**

- Consumes: `ScoringCache`, `ScoreDimension` from `@applye/core`; `ScoreGauge` from `@applye/ui`; `TranslateService` from `@applye/i18n`.
- Produces: pure functions `parseDimensions(c: ScoringCache): ScoreDimension[]`, `parseMissingKeywords(c: ScoringCache): string[]`, `parseRedFlags(c: ScoringCache): string[]`, `parseBeforeYouSubmit(c: ScoringCache): string[]`, `starRating(score: number): string` from `scoring.utils.ts`. `ScoringView` component, selector `app-scoring-view`, inputs `cache: ScoringCache | null` (required, nullable), `fromCache: boolean` (default `false`), `atsPassIcon`/`atsFailIcon` inputs typed `any` matching the existing `lucide-angular` icon input pattern used in `jobs.component.ts` (`icons.atsPass`/`icons.atsFail`), consumed by Task 5 and Task 6.

- [ ] **Step 1: Write `scoring.utils.ts`**

`apps/desktop/src/app/pages/jobs/scoring.utils.ts`:

```typescript
import { ScoreDimension, ScoringCache } from '@applye/core';

export function parseDimensions(c: ScoringCache): ScoreDimension[] {
  try {
    return JSON.parse(c.dimensionsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseMissingKeywords(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.missingKeywordsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseRedFlags(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.redFlagsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseBeforeYouSubmit(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.beforeYouSubmitJson ?? '[]');
  } catch {
    return [];
  }
}

export function starRating(score: number): string {
  return ((score / 100) * 4 + 1).toFixed(1);
}
```

- [ ] **Step 2: Write a unit test for the utils**

Create `apps/desktop/src/app/pages/jobs/scoring.utils.spec.ts`:

```typescript
import { ScoringCache } from '@applye/core';
import {
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
  starRating,
} from './scoring.utils';

function makeCache(overrides: Partial<ScoringCache> = {}): ScoringCache {
  return {
    id: 1,
    jobId: 1,
    profileHash: 'h',
    jdHash: 'h',
    score: 80,
    ...overrides,
  } as ScoringCache;
}

describe('scoring.utils', () => {
  it('parses dimensions JSON', () => {
    const c = makeCache({ dimensionsJson: JSON.stringify([{ name: 'Skills', score: 8 }]) });
    expect(parseDimensions(c)).toEqual([{ name: 'Skills', score: 8 }]);
  });

  it('returns empty array on invalid dimensions JSON', () => {
    const c = makeCache({ dimensionsJson: 'not json' });
    expect(parseDimensions(c)).toEqual([]);
  });

  it('parses missing keywords', () => {
    const c = makeCache({ missingKeywordsJson: JSON.stringify(['Kubernetes']) });
    expect(parseMissingKeywords(c)).toEqual(['Kubernetes']);
  });

  it('parses red flags', () => {
    const c = makeCache({ redFlagsJson: JSON.stringify(['No salary listed']) });
    expect(parseRedFlags(c)).toEqual(['No salary listed']);
  });

  it('parses before-you-submit notes', () => {
    const c = makeCache({ beforeYouSubmitJson: JSON.stringify(['Deadline in 3 days']) });
    expect(parseBeforeYouSubmit(c)).toEqual(['Deadline in 3 days']);
  });

  it('computes star rating from score', () => {
    expect(starRating(100)).toBe('5.0');
    expect(starRating(0)).toBe('1.0');
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx jest apps/desktop/src/app/pages/jobs/scoring.utils.spec.ts`
Expected: 6 tests pass.

- [ ] **Step 4: Write `scoring-view.component.ts`**

`apps/desktop/src/app/pages/jobs/scoring-view.component.ts` — ports the exact markup currently at `jobs.component.ts:166-264` (gauge card, before-you-submit, dimensions, missing keywords, red flags, ATS card), rewired onto `ScoreGauge` for the header card and onto the new i18n keys for previously-hardcoded strings:

```typescript
import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoreGauge } from '@applye/ui';
import { inject } from '@angular/core';
import {
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
} from './scoring.utils';

@Component({
  selector: 'app-scoring-view',
  standalone: true,
  imports: [LucideAngularModule, ScoreGauge],
  template: `
    @if (cache(); as c) {
      <section class="section">
        <div class="card">
          <lib-score-gauge
            [score]="c.score"
            [cached]="fromCache()"
            [cachedLabel]="t()('jobs.cached_badge')"
          />
          @if (c.summary) {
            <p class="summary">{{ c.summary }}</p>
          }
        </div>

        @if (parseBeforeYouSubmit(c).length) {
          <details class="card before-submit" open>
            <summary class="eyebrow">{{ t()('jobs.before_you_submit') }}</summary>
            <ul class="before-submit__list">
              @for (note of parseBeforeYouSubmit(c); track note) {
                <li>{{ note }}</li>
              }
            </ul>
          </details>
        }

        @if (parseDimensions(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.dimensions_title') }}</h4>
            <div class="dim-table">
              @for (d of parseDimensions(c); track d.name) {
                <div class="dim-row">
                  <span class="dim-name">{{ d.name }}</span>
                  <span class="dim-score">{{ d.score }}/10</span>
                  <div class="dim-bar-wrap">
                    <div class="dim-bar" [style.width.%]="d.score * 10"></div>
                  </div>
                  @if (d.comment) {
                    <span class="dim-comment">{{ d.comment }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (parseMissingKeywords(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.missing_keywords_title') }}</h4>
            <div class="chips">
              @for (kw of parseMissingKeywords(c); track kw) {
                <span class="chip">{{ kw }}</span>
              }
            </div>
          </div>
        }

        @if (parseRedFlags(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.red_flags_title') }}</h4>
            <ul class="red-flags">
              @for (flag of parseRedFlags(c); track flag) {
                <li class="red-flag">{{ flag }}</li>
              }
            </ul>
          </div>
        }

        <div class="card">
          <h4 class="eyebrow">{{ t()('jobs.ats_check_title') }}</h4>
          <div
            class="ats-pass"
            [class.ats-pass--ok]="c.atsPass"
            [class.ats-pass--warn]="!c.atsPass"
          >
            <lucide-icon
              [img]="c.atsPass ? atsPassIcon() : atsFailIcon()"
              [size]="16"
              aria-hidden="true"
            />
            {{ c.atsPass ? t()('jobs.ats_pass_msg') : t()('jobs.ats_fail_msg') }}
          </div>
          @if (c.atsNotes) {
            <p class="muted" style="margin-top: var(--space-2)">{{ c.atsNotes }}</p>
          }
        </div>
      </section>
    }
  `,
})
export class ScoringView {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly atsPassIcon = input.required<unknown>();
  readonly atsFailIcon = input.required<unknown>();

  protected readonly parseDimensions = parseDimensions;
  protected readonly parseMissingKeywords = parseMissingKeywords;
  protected readonly parseRedFlags = parseRedFlags;
  protected readonly parseBeforeYouSubmit = parseBeforeYouSubmit;
}
```

Note: `lucide-icon`'s `[img]` input type in this codebase is whatever `lucide-angular`'s `LucideIconData` type is — check the exact type used in the existing `icons` object in `jobs.component.ts:1041-1051` (imported from `lucide-angular`) and use that exact type instead of `unknown` for `atsPassIcon`/`atsFailIcon` if `unknown` causes a template type error.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/desktop/tsconfig.app.json`
Expected: no errors (fix the icon type per the note above if it fails).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/scoring.utils.ts apps/desktop/src/app/pages/jobs/scoring.utils.spec.ts apps/desktop/src/app/pages/jobs/scoring-view.component.ts
git commit -m "feat(jobs): extract scoring-view component and scoring.utils"
```

---

### Task 5: `apply-wizard` component (5 steps)

**Files:**

- Create: `apps/desktop/src/app/pages/jobs/apply-wizard.component.ts`

**Interfaces:**

- Consumes: `Stepper`, `ScoreGauge` from `@applye/ui`; `ScoringView` from Task 4; all the existing signals it needs are passed in as inputs (see below) rather than re-injecting `DbService` for scoring/tailoring/portal logic that already lives in the parent — this keeps a single source of truth and avoids duplicating cache-read logic.
- Produces: `ApplyWizard` component, selector `app-apply-wizard`, output `close: void` (parent closes the wizard and returns to the summary view).

This wizard is a thin **presentational shell**: it owns only `activeStep: signal<number>` (0-4) and renders the existing step content via `@Input()`-projected data plus `@Output()` events that the parent (`jobs.component.ts`) already has handlers for (`startTailoring`, `runNextPass`, `resetWizard`, `doExport`, `openExportedFile`, `revealExportedFile`, `draftPortalAnswers`, `copyPortalAnswer`, `redraftPortalAnswer`, `markApplied`, etc. — all pre-existing methods on `JobsComponent`, unchanged). Because Angular content projection of `@if`/`@for` blocks between parent and child is awkward with plain `@Input()`s for this much markup, this task uses **inputs for data + outputs for actions**, listing every one explicitly so Task 6 wires them one-to-one with zero renamed methods.

- [ ] **Step 1: Write `apply-wizard.component.ts`**

```typescript
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Application, Job, Profile, ScoringCache, SupportedLanguage } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { Stepper } from '@applye/ui';
import { ScoringView } from './scoring-view.component';

interface PassResult {
  pass: number;
  resultMd: string;
  changes: string[];
  gaps: string[];
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, Stepper, ScoringView],
  template: `
    <div class="apply-wizard">
      <lib-stepper
        [steps]="stepLabels()"
        [activeIndex]="activeStep()"
        [backLabel]="t()('common.back')"
        [nextLabel]="t()('common.next')"
        (back)="goBack()"
        (next)="goNext()"
      />

      @switch (activeStep()) {
        @case (0) {
          <app-scoring-view
            [cache]="cache()"
            [fromCache]="fromCache()"
            [atsPassIcon]="atsPassIcon()"
            [atsFailIcon]="atsFailIcon()"
          />
        }
        @case (1) {
          <ng-content select="[wizardPortalStep]" />
        }
        @case (2) {
          <ng-content select="[wizardTailorStep]" />
        }
        @case (3) {
          <ng-content select="[wizardExportStep]" />
        }
        @case (4) {
          <ng-content select="[wizardApplyStep]" />
        }
      }
    </div>
  `,
})
export class ApplyWizard {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly atsPassIcon = input.required<unknown>();
  readonly atsFailIcon = input.required<unknown>();

  readonly activeStep = signal(0);

  protected readonly stepLabels = computed(() => [
    this.t()('jobs.wizard.step_review_score'),
    this.t()('jobs.wizard.step_portal_answers'),
    this.t()('jobs.wizard.step_tailor_cv'),
    this.t()('jobs.wizard.step_export'),
    this.t()('jobs.wizard.step_apply'),
  ]);

  protected goBack(): void {
    this.activeStep.update((n) => Math.max(0, n - 1));
  }

  protected goNext(): void {
    this.activeStep.update((n) => Math.min(4, n + 1));
  }
}
```

This uses `<ng-content select="...">` slots rather than re-declaring every portal/tailor/export/apply input — the parent template places the existing (moved, unmodified) markup blocks inside `<app-apply-wizard>` tagged with the matching attribute, so `JobsComponent`'s existing methods and signals keep working with **zero renames**. This is simpler and lower-risk than threading ~15 inputs/outputs for markup that isn't changing logic, and matches the "surgical changes" project rule (touch only what you must).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/desktop/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/apply-wizard.component.ts
git commit -m "feat(jobs): add apply-wizard shell component with content-projected steps"
```

---

### Task 6: Wire `jobs.component.ts` to the new components

**Files:**

- Modify: `apps/desktop/src/app/pages/jobs/jobs.component.ts`

**Interfaces:**

- Consumes: `ScoringView` (Task 4), `ApplyWizard` (Task 5), `parseDimensions`/`parseMissingKeywords`/`parseRedFlags`/`parseBeforeYouSubmit`/`starRating` (Task 4's `scoring.utils.ts`), `openUrl` from `@tauri-apps/plugin-opener`.

- [ ] **Step 1: Update imports**

At the top of `jobs.component.ts`, add:

```typescript
import { openUrl } from '@tauri-apps/plugin-opener';
import { ScoringView } from './scoring-view.component';
import { ApplyWizard } from './apply-wizard.component';
```

Remove the now-unused imports that only served the deleted inline markup (verify with `tsc --noEmit` after Step 5 below which ones, if any, become unused — likely none, since `LucideAngularModule` and icons are still used elsewhere in the file for the portal/tailor sections).

- [ ] **Step 2: Add `imports` array entries**

In the `@Component({ imports: [...] })` array, add `ScoringView, ApplyWizard`.

- [ ] **Step 3: Add a `wizardOpen` signal and `Start apply` gating**

Add near the other signals (after `readonly fromCache = signal(false);`):

```typescript
readonly wizardOpen = signal(false);
```

- [ ] **Step 4: Replace the scoring-display template block (current lines 166-264) with the condensed summary + wizard entry point**

Replace the existing block from `@if (cache(); as c) {` (line 166) through the closing `</div>` of the ATS card (line 264) with:

```html
@if (cache(); as c) {
<section class="section">
  @if (!wizardOpen()) {
  <app-scoring-view
    [cache]="cache()"
    [fromCache]="fromCache()"
    [atsPassIcon]="icons.atsPass"
    [atsFailIcon]="icons.atsFail"
  />
  <div class="cta">
    <button class="btn btn--primary" (click)="wizardOpen.set(true)">
      {{ t()('jobs.wizard.start_apply') }}
    </button>
  </div>
  } @else {
  <app-apply-wizard
    [cache]="cache()"
    [fromCache]="fromCache()"
    [atsPassIcon]="icons.atsPass"
    [atsFailIcon]="icons.atsFail"
  >
    <div wizardPortalStep>
      <!-- existing portal-answers markup, currently jobs.component.ts:280-401, moved here verbatim -->
    </div>
    <div wizardTailorStep>
      <!-- existing tailoring wizard markup, currently jobs.component.ts:403-508 (minus the wizard-steps
               indicator block at 421-440, which is now redundant with lib-stepper and must be deleted, not moved),
               moved here verbatim -->
    </div>
    <div wizardExportStep>
      <!-- existing export markup, currently jobs.component.ts:510-550, moved here verbatim -->
    </div>
    <div wizardApplyStep>
      <!-- new Task 6 Step 6 content goes here -->
    </div>
  </app-apply-wizard>
  }
</section>
}
```

The legitimacy-warning block (original lines 266-278) stays where it is in the parent template, outside both branches, since it must be visible regardless of wizard state — move it to sit directly after the `@if (cache(); as c) { <section...> }` opening, before the `@if (!wizardOpen())`.

- [ ] **Step 5: Delete the now-dead helper methods from the class body**

Remove `dimensions()`, `missingKeywords()`, `redFlags()`, `beforeYouSubmit()`, `starRating()` (lines 1499-1541 in the original file) — these are replaced by the imported `scoring.utils.ts` functions used inside `ScoringView`. Keep `legitimacyNotes()` and `hasArchetypes()` — they're still used elsewhere in the parent template (legitimacy warning, archetype gating).

Add the import at the top of the class-body-adjacent import block:

```typescript
import {
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
  starRating,
} from './scoring.utils';
```

(Only import the ones still referenced directly in the parent template, if any remain after the move — if `parseDimensions` etc. are no longer called from the parent template at all post-move, don't import them; `ScoringView` calls them internally.)

- [ ] **Step 6: Write the Apply step (step 5) content**

Inside `<div wizardApplyStep>`, add new markup (new i18n keys already exist from Task 1):

```html
<div wizardApplyStep>
  <div class="card">
    <h4 class="eyebrow">{{ t()('jobs.wizard.step_apply') }}</h4>
    @if (job()?.applyUrl) {
    <div class="row">
      <button class="btn" type="button" (click)="copyToClipboard(job()!.applyUrl!)">
        <lucide-icon [img]="icons.copy" [size]="14" aria-hidden="true" />
        {{ t()('jobs.portal_copy') }}
      </button>
      <button class="btn btn--primary" type="button" (click)="openApplyUrl()">
        {{ t()('jobs.wizard.open_browser') }}
      </button>
    </div>
    }
    <div class="cta">
      <button class="btn-ghost" [disabled]="actionBusy()" (click)="markApplied()">
        {{ t()('jobs.mark_applied') }}
      </button>
      @if (actionMsg()) {
      <span class="detail-actions__msg">{{ actionMsg() }}</span>
      }
    </div>
  </div>
</div>
```

Check `Job` (from `@applye/core`) for the exact field name of the job posting URL (`applyUrl` is a placeholder guess — grep `libs/core/src/lib/models/job.model.ts` for a URL field, e.g. it may be `sourceUrl` or `url`; use whatever field actually exists, and if none exists, drop the copy/open-browser buttons from this step entirely and keep only Mark Applied, noting the gap in the commit message rather than inventing a field).

Add these two new methods to the `JobsComponent` class body, near `openExportedFile`/`revealExportedFile`:

```typescript
async openApplyUrl(): Promise<void> {
  const url = this.job()?.applyUrl;
  if (!url) return;
  await openUrl(url);
}

async copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
```

(Again, replace `applyUrl` with the confirmed real field name from the grep above.)

- [ ] **Step 7: Delete the old `wizard-steps` indicator block**

Inside the moved tailoring markup (`wizardTailorStep`), delete the `<div class="wizard-steps">...</div>` block (original lines 421-440) — `lib-stepper` now owns step indication at the wizard level. Keep everything else in that section (`@for (r of tailorResults(); ...)` and the "start tailoring" CTA) unchanged.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/desktop/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 9: Verify lint on changed files only**

Run: `npx eslint apps/desktop/src/app/pages/jobs/jobs.component.ts apps/desktop/src/app/pages/jobs/apply-wizard.component.ts apps/desktop/src/app/pages/jobs/scoring-view.component.ts --max-warnings=0`
Expected: no new errors introduced (pre-existing warnings/errors in `my-jobs.component.html` are out of scope and untouched).

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/jobs.component.ts
git commit -m "refactor(jobs): wire scoring-view and apply-wizard into job detail screen"
```

---

### Task 7: Live verification (Tauri dev)

**Files:** none (manual verification task)

- [ ] **Step 1: Start the dev server**

Run: `npm run desktop:dev`

- [ ] **Step 2: Open a job with an existing cached score**

Navigate to a job detail (`/jobs/:id`) that already has a `scoring_cache` row. Confirm:

- The card scoring view renders (gauge, dimension cards, missing-keyword chips, red-flags list, ATS card).
- The "cached · 0 tokens" chip is visible on the gauge.
- No network/AI call fires (check no new tokens logged, `fromCache()` is `true`).

- [ ] **Step 3: Step through the wizard**

Click "Start apply". Confirm:

- Step 1 shows the same scoring view, condensed.
- Next/Back navigate steps 1→5 without a long page scroll (each step swaps content, stepper stays visible).
- Step 2 portal-answers flow works exactly as before (draft, copy, redraft).
- Step 3 tailoring 3-pass flow works exactly as before (XYZ → critique → build), now without the redundant inline step dots.
- Step 4 export produces a DOCX and PDF file (check file exists at the reported path).
- Step 5 shows copy/open-browser buttons (if `applyUrl`-equivalent field exists) and Mark Applied.

- [ ] **Step 4: Mark Applied**

Click Mark Applied. Confirm via a DB check (e.g. `sqlite3` on the dev DB, or the Pipeline screen) that `applications.status` is `applied` and a `status_history` row was written with today's date.

- [ ] **Step 5: Theme check**

Toggle dark mode (existing app setting). Confirm the gauge, stepper, and all new cards render with correct contrast — no hardcoded colors bleeding through.

- [ ] **Step 6: Record verification result**

No commit for this task — it's a manual gate. If any check fails, fix in the relevant task's files and re-run affected unit tests before re-verifying live.

---

### Task 8: Changelog + version bump

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Determine current version**

Run: `node -p "require('./package.json').version"`
Note the result, e.g. `0.16.3`. This is a new feature → bump minor: `0.17.0`.

- [ ] **Step 2: Update CHANGELOG.md**

Read today's date from the system (`date +%F`), and add a new section at the top of the `## [Unreleased]`-or-equivalent area (match the existing heading format used for `0.16.3`):

```markdown
## [0.17.0] - 2026-07-03

### Added

- Job Detail screen redesigned: card-based scoring view (gauge, dimension cards, missing-keyword chips, red-flags, ATS check) replaces the long scroll.
- 5-step apply/tailor wizard (Review score → Portal answers → Tailor CV → Export → Apply) with Back/Next navigation, one step visible at a time.
- Apply step adds copy-to-clipboard and "Open in browser" (via system default browser) alongside the existing Mark Applied action.
```

- [ ] **Step 3: Bump version in all three files**

`package.json`: `"version": "0.17.0"`
`apps/desktop/src-tauri/tauri.conf.json`: `"version": "0.17.0"`
`apps/desktop/src-tauri/Cargo.toml`: `version = "0.17.0"`

- [ ] **Step 4: Verify Cargo.lock picks up the bump**

Run: `cd apps/desktop/src-tauri && cargo check 2>&1 | tail -5 && cd -`
Expected: no errors; `Cargo.lock` updates the `applye-desktop` entry version (not `rfd` or other unrelated crates).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "chore(release): v0.17.0 — job detail card view and apply wizard"
```

---

## Definition of Done

- All unit tests added in Tasks 2-4 pass (`npx jest libs/ui/src/lib/score-gauge libs/ui/src/lib/stepper apps/desktop/src/app/pages/jobs/scoring.utils.spec.ts`).
- `npx tsc --noEmit` clean for both touched projects.
- Task 7 live verification fully passed (all 6 steps).
- No new Rust commands, no new DB migrations, no new AI calls anywhere in the diff (grep the diff for `ai.run(` / `ai.renderSkill(` outside of the untouched `scoreJob`/`runTailorPass`/`draftPortalAnswers` methods, which must be unchanged).
- CHANGELOG + version bumped (Task 8).
