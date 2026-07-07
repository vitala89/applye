# Rich Archetypes (A1) + Profile 1A Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `targetArchetypes` from flat strings to `{name, fit, sellWhen}` objects (backward-compatible, no schema/Rust change) and restyle the Profile page per Claude Design option 1A (completeness-hero-first single column with lucide icons).

**Architecture:** A pure `@applye/core` util converts between the stored JSON string and a typed `Archetype[]`, tolerating the legacy `string[]` shape; consumers that need plain names go through `archetypeNames()` so the Rust filter and CV-tag are unchanged. The Profile page gains a `CompletenessHeroComponent` (owns the completeness ring + gap pills); `ScoringSummaryComponent` is trimmed to strengths + AI-notes + raw JSON to avoid duplication; the page is reordered hero → target roles → markdown profile → AI tools with lucide icons.

**Tech Stack:** Angular standalone + signals, TypeScript, Jest (via Nx), `@applye/i18n`, `lucide-angular` (already a dependency).

## Global Constraints

- No database schema change. `targetArchetypes` stays a JSON string column.
- No Rust change. `check_archetype_match` keeps receiving a JSON `string[]` of archetype **names**.
- `parseArchetypes` MUST NOT throw; malformed/empty → `[]`; accepts BOTH legacy `["str"]` and new `[{name,fit,sellWhen}]`; coerces missing/invalid `fit` → `'primary'`, missing `sellWhen` → `''`.
- `serializeArchetypes` drops entries whose trimmed `name` is blank.
- New i18n keys symmetric across the `en` (~line 190) and `de` (~line 1037) `profile:` blocks.
- No `sell_when`→AI-prompt wiring (slice A2, deferred). No `track`/`level`. No global sidebar restyle.
- Icons: `lucide-angular`, imported per component via `LucideAngularModule` + specific icon refs, rendered `<lucide-icon [img]="ref" [size]="N" aria-hidden="true" />`.
- Test commands: `npx nx test core -- --testPathPattern=archetype`; `npx nx test desktop -- --testPathPattern=<name>`; `npx nx test i18n`.

---

### Task 1: `archetype.ts` util (types, parse, serialize, names)

**Files:**

- Create: `libs/core/src/lib/profile/archetype.ts`
- Test: `libs/core/src/lib/profile/archetype.spec.ts`
- Modify: `libs/core/src/index.ts` (barrel export)

**Interfaces:**

- Produces:
  - `type ArchetypeFit = 'primary' | 'secondary' | 'adjacent'`
  - `interface Archetype { name: string; fit: ArchetypeFit; sellWhen: string; }`
  - `parseArchetypes(json: string | null | undefined): Archetype[]`
  - `serializeArchetypes(list: Archetype[]): string`
  - `archetypeNames(list: Archetype[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `libs/core/src/lib/profile/archetype.spec.ts`:

```ts
import { Archetype, parseArchetypes, serializeArchetypes, archetypeNames } from './archetype';

describe('archetype', () => {
  it('wraps legacy string[] into objects with defaults', () => {
    expect(parseArchetypes('["Senior FE","Staff FE"]')).toEqual([
      { name: 'Senior FE', fit: 'primary', sellWhen: '' },
      { name: 'Staff FE', fit: 'primary', sellWhen: '' },
    ]);
  });

  it('round-trips the object shape', () => {
    const list: Archetype[] = [
      { name: 'Senior AI Eng', fit: 'secondary', sellWhen: 'JD wants agents' },
    ];
    expect(parseArchetypes(serializeArchetypes(list))).toEqual(list);
  });

  it('accepts a mixed legacy+object array', () => {
    const out = parseArchetypes('["Legacy",{"name":"New","fit":"adjacent","sellWhen":"x"}]');
    expect(out).toEqual([
      { name: 'Legacy', fit: 'primary', sellWhen: '' },
      { name: 'New', fit: 'adjacent', sellWhen: 'x' },
    ]);
  });

  it('coerces missing/invalid fit to primary and missing sellWhen to empty', () => {
    const out = parseArchetypes('[{"name":"A"},{"name":"B","fit":"weird"}]');
    expect(out).toEqual([
      { name: 'A', fit: 'primary', sellWhen: '' },
      { name: 'B', fit: 'primary', sellWhen: '' },
    ]);
  });

  it('returns [] for malformed, empty, or non-array input; skips nameless entries', () => {
    expect(parseArchetypes('not json')).toEqual([]);
    expect(parseArchetypes('')).toEqual([]);
    expect(parseArchetypes(null)).toEqual([]);
    expect(parseArchetypes(undefined)).toEqual([]);
    expect(parseArchetypes('{"name":"x"}')).toEqual([]); // object, not array
    expect(parseArchetypes('[{"fit":"primary"},{"name":"  "}]')).toEqual([]); // no usable names
  });

  it('serializeArchetypes drops blank-name entries and trims', () => {
    const json = serializeArchetypes([
      { name: '  Keep ', fit: 'primary', sellWhen: 'y' },
      { name: '   ', fit: 'primary', sellWhen: '' },
    ]);
    expect(JSON.parse(json)).toEqual([{ name: 'Keep', fit: 'primary', sellWhen: 'y' }]);
  });

  it('archetypeNames returns trimmed non-empty names', () => {
    expect(
      archetypeNames([
        { name: ' A ', fit: 'primary', sellWhen: '' },
        { name: '', fit: 'primary', sellWhen: '' },
      ]),
    ).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core -- --testPathPattern=archetype`
Expected: FAIL — cannot find module `./archetype`.

- [ ] **Step 3: Write minimal implementation**

Create `libs/core/src/lib/profile/archetype.ts`:

```ts
export type ArchetypeFit = 'primary' | 'secondary' | 'adjacent';

export interface Archetype {
  name: string;
  fit: ArchetypeFit;
  sellWhen: string;
}

const FITS: readonly ArchetypeFit[] = ['primary', 'secondary', 'adjacent'];

function coerceFit(v: unknown): ArchetypeFit {
  return typeof v === 'string' && (FITS as readonly string[]).includes(v)
    ? (v as ArchetypeFit)
    : 'primary';
}

function coerceEntry(entry: unknown): Archetype | null {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name, fit: 'primary', sellWhen: '' } : null;
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    const name = typeof o['name'] === 'string' ? o['name'].trim() : '';
    if (!name) return null;
    return {
      name,
      fit: coerceFit(o['fit']),
      sellWhen: typeof o['sellWhen'] === 'string' ? o['sellWhen'] : '',
    };
  }
  return null;
}

export function parseArchetypes(json: string | null | undefined): Archetype[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(coerceEntry).filter((a): a is Archetype => a !== null);
}

export function serializeArchetypes(list: Archetype[]): string {
  const cleaned = list
    .map((a) => ({ name: a.name.trim(), fit: a.fit, sellWhen: a.sellWhen }))
    .filter((a) => a.name.length > 0);
  return JSON.stringify(cleaned);
}

export function archetypeNames(list: Archetype[]): string[] {
  return list.map((a) => a.name.trim()).filter((n) => n.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core -- --testPathPattern=archetype`
Expected: PASS (7 tests).

- [ ] **Step 5: Add barrel export**

In `libs/core/src/index.ts`, after the existing `profile-markdown` export, add:

```ts
export * from './lib/profile/archetype';
```

- [ ] **Step 6: Verify the core lib is green**

Run: `npx nx test core`
Expected: PASS, no TS resolution errors.

- [ ] **Step 7: Commit**

```bash
git add libs/core/src/lib/profile/archetype.ts libs/core/src/lib/profile/archetype.spec.ts libs/core/src/index.ts
git commit -m "feat(archetypes): add archetype parse/serialize/names util"
```

---

### Task 2: i18n keys (EN + DE)

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts` (en `profile:` ~190, de `profile:` ~1037)

**Interfaces:**

- Produces keys consumed by Tasks 3, 4, 6: `profile.archetype_name`, `profile.archetype_fit`, `profile.fit_primary`, `profile.fit_secondary`, `profile.fit_adjacent`, `profile.archetype_sell_when`, `profile.archetype_sell_when_hint`, `profile.hero_improve`, `profile.hero_left`, `profile.hero_complete`.

- [ ] **Step 1: Add EN keys**

In the `en` `profile:` object (before its closing `},` near line 240), add:

```ts
    archetype_name: 'Role',
    archetype_fit: 'Fit',
    fit_primary: 'Primary',
    fit_secondary: 'Secondary',
    fit_adjacent: 'Adjacent',
    archetype_sell_when: 'When it fits',
    archetype_sell_when_hint: 'When does this role match a job? — gives the AI context',
    hero_improve: 'Complete to sharpen matching',
    hero_left: '{n} left',
    hero_complete: 'Profile complete — AI matching is at full strength.',
```

- [ ] **Step 2: Add DE keys**

In the `de` `profile:` object (before its closing `},` near line 1037), add:

```ts
    archetype_name: 'Rolle',
    archetype_fit: 'Passung',
    fit_primary: 'Primär',
    fit_secondary: 'Sekundär',
    fit_adjacent: 'Angrenzend',
    archetype_sell_when: 'Wann es passt',
    archetype_sell_when_hint: 'Wann passt diese Rolle zu einem Job? — gibt der KI Kontext',
    hero_improve: 'Vervollständigen für besseres Matching',
    hero_left: 'noch {n}',
    hero_complete: 'Profil vollständig — KI-Matching läuft mit voller Stärke.',
```

- [ ] **Step 3: Verify**

Run: `npx nx test i18n`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): add rich-archetype and completeness-hero keys (en, de)"
```

---

### Task 3: Rich archetype editor cards + keep consumers working

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts` (archetype signal + editor section + save)
- Modify: `apps/desktop/src/app/pages/jobs/jobs.component.ts` (name extraction for filter + `hasArchetypes`)
- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts` (tag derivation)
- Modify: `apps/desktop/src/app/core/onboarding/onboarding.component.ts` (wrap skill output on save)

**Interfaces:**

- Consumes from Task 1: `Archetype`, `ArchetypeFit`, `parseArchetypes`, `serializeArchetypes`, `archetypeNames`.
- Consumes from Task 2: `profile.archetype_*`, `profile.fit_*` keys.

- [ ] **Step 1: Update imports and the archetype signal in profile.component.ts**

Add to the `@applye/core` import in `apps/desktop/src/app/pages/profile/profile.component.ts`:
`Archetype, ArchetypeFit, parseArchetypes, serializeArchetypes` (alongside the existing profile-markdown imports).

Change the signal (currently `readonly archetypes = signal<string[]>([]);` at ~line 786) to:

```ts
  readonly archetypes = signal<Archetype[]>([]);
```

Replace the existing `parseArchetypes` **private method** on the component (the one at ~line 940 doing `JSON.parse(json||'[]')`) — delete it; the component now uses the imported `parseArchetypes` from `@applye/core`.

Update `archetypesDirty` (~line 803) to compare via serialize:

```ts
  readonly archetypesDirty = computed(
    () =>
      serializeArchetypes(this.archetypes()) !==
      serializeArchetypes(parseArchetypes(this.profile()?.targetArchetypes)),
  );
```

Update the load line (~820) to:

```ts
this.archetypes.set(parseArchetypes(p?.targetArchetypes));
```

Replace `addArchetype`/`removeArchetype`/`updateArchetype` (~890-902) with:

```ts
  addArchetype(): void {
    if (this.archetypes().length >= 5) return;
    this.archetypes.update((a) => [...a, { name: '', fit: 'primary', sellWhen: '' }]);
  }

  removeArchetype(index: number): void {
    this.archetypes.update((a) => a.filter((_, i) => i !== index));
  }

  updateArchetype(index: number, patch: Partial<Archetype>): void {
    this.archetypes.update((a) => a.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
```

Update `save()` (~915) archetype line to:

```ts
        targetArchetypes: serializeArchetypes(this.archetypes()),
```

- [ ] **Step 2: Replace the archetype editor template block**

Read the current archetype `<section>` (the `@for (a of archetypes()...)` block, ~lines 103-124). Replace the list/row markup with archetype cards:

```html
@if (archetypes().length > 0) {
<div class="archetype-list">
  @for (a of archetypes(); track $index) {
  <div class="archetype-card">
    <div class="archetype-card__top">
      <input
        class="archetype-input"
        type="text"
        [ngModel]="a.name"
        (ngModelChange)="updateArchetype($index, { name: $event })"
        [placeholder]="t()('profile.archetype_placeholder')"
        [attr.aria-label]="t()('profile.archetype_name')"
      />
      <select
        class="archetype-fit"
        [ngModel]="a.fit"
        (ngModelChange)="updateArchetype($index, { fit: $event })"
        [attr.aria-label]="t()('profile.archetype_fit')"
      >
        <option value="primary">{{ t()('profile.fit_primary') }}</option>
        <option value="secondary">{{ t()('profile.fit_secondary') }}</option>
        <option value="adjacent">{{ t()('profile.fit_adjacent') }}</option>
      </select>
      <button
        class="btn-icon"
        type="button"
        (click)="removeArchetype($index)"
        [attr.aria-label]="t()('profile.remove_archetype')"
      >
        ×
      </button>
    </div>
    <label class="archetype-card__label">{{ t()('profile.archetype_sell_when') }}</label>
    <textarea
      class="archetype-sell"
      [ngModel]="a.sellWhen"
      (ngModelChange)="updateArchetype($index, { sellWhen: $event })"
      [placeholder]="t()('profile.archetype_sell_when_hint')"
    ></textarea>
  </div>
  }
</div>
}
```

- [ ] **Step 3: Add archetype-card styles**

Append to the component `styles` (near the existing `.archetype-list`/`.archetype-row` rules ~656):

```css
.archetype-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
}
.archetype-card__top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.archetype-card__top .archetype-input {
  flex: 1;
}
.archetype-fit {
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-primary);
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
}
.archetype-card__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.archetype-sell {
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  resize: vertical;
}
```

- [ ] **Step 4: Update jobs.component.ts consumers**

In `apps/desktop/src/app/pages/jobs/jobs.component.ts`, add to the `@applye/core` import: `parseArchetypes, archetypeNames`.

At the `checkArchetypeMatch(...)` call (~line 3258), change the archetypes argument to pass names JSON:

```ts
      p?.targetArchetypes
        ? JSON.stringify(archetypeNames(parseArchetypes(p.targetArchetypes)))
        : undefined,
```

Replace `hasArchetypes()` (~line 3517) body with:

```ts
  hasArchetypes(): boolean {
    return parseArchetypes(this.profile()?.targetArchetypes).length > 0;
  }
```

- [ ] **Step 5: Fix cv-list tag derivation**

In `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts`, add `parseArchetypes, archetypeNames` to the `@applye/core` import. Replace the legacy derivation (~line 299) `(profile?.targetArchetypes ?? '').split(',')[0]?.trim() ?? ''` with:

```ts
this.generateArchetypeTag.set(archetypeNames(parseArchetypes(profile?.targetArchetypes))[0] ?? '');
```

- [ ] **Step 6: Wrap onboarding save**

In `apps/desktop/src/app/core/onboarding/onboarding.component.ts`, add `serializeArchetypes, parseArchetypes` to the `@applye/core` import. At the save (`targetArchetypes: JSON.stringify(this.archetypes())`, ~line 429), change to wrap the string list through the legacy parse path so it stores objects:

```ts
      targetArchetypes: serializeArchetypes(parseArchetypes(JSON.stringify(this.archetypes()))),
```

- [ ] **Step 7: Run the desktop suite**

Run: `npx nx test desktop`
Expected: PASS (existing profile/jobs specs still green; if a spec asserted the old `string[]` archetype shape, update it to the object shape as part of this task).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts apps/desktop/src/app/pages/jobs/jobs.component.ts apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts apps/desktop/src/app/core/onboarding/onboarding.component.ts
git commit -m "feat(archetypes): rich archetype cards + name-based consumers"
```

---

### Task 4: `CompletenessHeroComponent`

**Files:**

- Create: `apps/desktop/src/app/pages/profile/completeness-hero.component.ts`
- Test: `apps/desktop/src/app/pages/profile/completeness-hero.component.spec.ts`

**Interfaces:**

- Consumes from Task 1/`@applye/core`: `ProfileFieldKey`.
- Consumes from Task 2: `profile.hero_*`, `profile.field_*_short`, `profile.completeness` keys.
- Produces:
  - Selector `app-completeness-hero`.
  - Inputs: `completeness: number`, `gaps: ProfileFieldKey[]`, `name: string`, `subtitle: string`.
  - Output: `addField: EventEmitter<ProfileFieldKey>`.
  - Public members for tests: `ringDash` (computed string `"<len> <circumference>"`), `onAdd(key)`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/app/pages/profile/completeness-hero.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { CompletenessHeroComponent } from './completeness-hero.component';

function setup(completeness: number, gaps: string[]) {
  TestBed.configureTestingModule({
    imports: [CompletenessHeroComponent],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture: ComponentFixture<CompletenessHeroComponent> =
    TestBed.createComponent(CompletenessHeroComponent);
  fixture.componentRef.setInput('completeness', completeness);
  fixture.componentRef.setInput('gaps', gaps);
  fixture.componentRef.setInput('name', 'Vitalii');
  fixture.componentRef.setInput('subtitle', 'senior · Germany');
  fixture.detectChanges();
  return fixture;
}

describe('CompletenessHeroComponent', () => {
  it('encodes completeness in the ring dash (0 and 100 differ)', () => {
    expect(setup(0, ['title']).componentInstance.ringDash()).not.toBe(
      setup(100, []).componentInstance.ringDash(),
    );
  });

  it('renders one gap pill per gap', () => {
    const f = setup(50, ['title', 'skills']);
    const pills = f.nativeElement.querySelectorAll('.hero__gap');
    expect(pills.length).toBe(2);
  });

  it('emits addField when a gap pill is clicked', () => {
    const f = setup(50, ['skills']);
    const emitted: string[] = [];
    f.componentInstance.addField.subscribe((k) => emitted.push(k));
    f.componentInstance.onAdd('skills');
    expect(emitted).toEqual(['skills']);
  });

  it('shows the done state when there are no gaps', () => {
    const f = setup(100, []);
    expect(f.nativeElement.querySelector('.hero__done')).toBeTruthy();
    expect(f.nativeElement.querySelector('.hero__gap')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop -- --testPathPattern=completeness-hero`
Expected: FAIL — cannot find module `./completeness-hero.component`.

- [ ] **Step 3: Write the component**

Create `apps/desktop/src/app/pages/profile/completeness-hero.component.ts`:

```ts
import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { ProfileFieldKey } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { LucideAngularModule, Plus, BadgeCheck } from 'lucide-angular';

const RADIUS = 44;
const CIRC = 2 * Math.PI * RADIUS;

@Component({
  selector: 'app-completeness-hero',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="hero">
      <div class="hero__ring">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            stroke="var(--surface-sunken)"
            stroke-width="8"
          />
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            stroke="var(--accent)"
            stroke-width="8"
            stroke-linecap="round"
            [attr.stroke-dasharray]="ringDash()"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <span class="hero__pct">{{ completeness() }}<span class="hero__pct-sign">%</span></span>
      </div>

      <div class="hero__body">
        <div class="hero__name">{{ name() }}</div>
        <div class="hero__sub">{{ subtitle() }}</div>

        @if (gaps().length > 0) {
          <div class="hero__improve">
            <span class="hero__improve-label">
              {{ t()('profile.hero_improve') }} ·
              {{ t()('profile.hero_left').replace('{n}', String(gaps().length)) }}
            </span>
            <div class="hero__gaps">
              @for (g of gaps(); track g) {
                <button type="button" class="hero__gap" (click)="onAdd(g)">
                  <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                  {{ t()('profile.field_' + g + '_short') }}
                </button>
              }
            </div>
          </div>
        } @else {
          <div class="hero__done">
            <lucide-icon [img]="doneIcon" [size]="16" aria-hidden="true" />
            {{ t()('profile.hero_complete') }}
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .hero {
        display: flex;
        align-items: center;
        gap: var(--space-5);
        padding: var(--space-5);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
      }
      .hero__ring {
        position: relative;
        flex-shrink: 0;
        width: 96px;
        height: 96px;
      }
      .hero__pct {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .hero__pct-sign {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .hero__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
      }
      .hero__name {
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .hero__sub {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .hero__improve {
        margin-top: var(--space-2);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .hero__improve-label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .hero__gaps {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .hero__gap {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-3);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
        cursor: pointer;
      }
      .hero__gap:hover {
        color: var(--text-accent);
        border-color: var(--accent);
      }
      .hero__done {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-2);
        font-size: var(--text-sm);
        color: var(--ok, var(--accent));
      }
    `,
  ],
})
export class CompletenessHeroComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly String = String;
  protected readonly plusIcon = Plus;
  protected readonly doneIcon = BadgeCheck;

  readonly completeness = input(0);
  readonly gaps = input<ProfileFieldKey[]>([]);
  readonly name = input('');
  readonly subtitle = input('');

  @Output() readonly addField = new EventEmitter<ProfileFieldKey>();

  readonly ringDash = computed(() => {
    const filled = (this.completeness() / 100) * CIRC;
    return `${filled} ${CIRC}`;
  });

  onAdd(key: ProfileFieldKey): void {
    this.addField.emit(key);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop -- --testPathPattern=completeness-hero`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/profile/completeness-hero.component.ts apps/desktop/src/app/pages/profile/completeness-hero.component.spec.ts
git commit -m "feat(profile): add CompletenessHeroComponent"
```

---

### Task 5: Trim `ScoringSummaryComponent` (drop completeness + gaps)

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/scoring-summary.component.ts`
- Modify: `apps/desktop/src/app/pages/profile/scoring-summary.component.spec.ts`

**Interfaces:**

- After this task, `ScoringSummaryComponent` inputs: `scoringJson: string | null` only (the `form` input is removed). Output `addField` and members `completeness`, `gaps`, `onAdd` are removed. Kept members: `scoring`, `strengths`, `aiNotes`, `metaLine`, `prettyJson`, `showJson`.

- [ ] **Step 1: Update the spec to the reduced surface**

Read `scoring-summary.component.spec.ts`. Remove the test "computes completeness and gaps from the form, not the JSON" and the "emits addField" test. Change `setup` to only set the `scoringJson` input (drop the `form` input and its import). Keep the strengths test and the malformed-JSON fallback test. Adjust `metaLine`'s expectation: it now derives location from the scoring JSON only. Save the file.

- [ ] **Step 2: Run the spec to see it fail against the current component**

Run: `npx nx test desktop -- --testPathPattern=scoring-summary`
Expected: FAIL — the component still declares the removed `form` input / `addField` output referenced nowhere, or the trimmed spec references members you are about to remove. (If it happens to pass, proceed — Step 3 still removes dead surface.)

- [ ] **Step 3: Remove the completeness/gaps surface from the component**

In `scoring-summary.component.ts`:

- Remove the `form` input, the `addField` `@Output`, and the `completeness`, `gaps`, `onAdd` members.
- Remove the imports of `profileCompleteness`, `missingFields`, `ProfileForm`, `ProfileFieldKey`, and `EMPTY_FORM` if now unused (keep `parseScoringJson`, `ScoringProfile`).
- Update `metaLine` to derive from the scoring profile only:

```ts
  readonly metaLine = computed(() => {
    const s = this.scoring();
    return [s?.seniority, s?.location, ...(s?.domains ?? [])].filter(Boolean).join(' · ');
  });
```

- In the template, delete the completeness bar block (`.summary__bar-row` + `.summary__bar`) and the gaps block (`.summary__label` for improve + `.summary__gaps` `@for`/`@switch`). Keep the header, strengths chips, AI-notes list, and the raw-JSON toggle. Remove now-unused `.summary__bar*`, `.summary__gap*` styles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop -- --testPathPattern=scoring-summary`
Expected: PASS (reduced test set).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/profile/scoring-summary.component.ts apps/desktop/src/app/pages/profile/scoring-summary.component.spec.ts
git commit -m "refactor(profile): trim ScoringSummary to strengths + notes + raw JSON"
```

---

### Task 6: Profile page 1A layout integration

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes from Task 4: `<app-completeness-hero [completeness] [gaps] [name] [subtitle] (addField)>`.
- Consumes from Task 5: `<app-scoring-summary [scoringJson]>` (no `form`/`addField`).
- Consumes from `@applye/core`: `profileCompleteness`, `missingFields`, `parseScoringJson`.

- [ ] **Step 1: Add hero inputs/computeds to profile.component.ts**

Add to the `@applye/core` import: `profileCompleteness, missingFields, parseScoringJson`. Import the hero component:

```ts
import { CompletenessHeroComponent } from './completeness-hero.component';
```

Add `CompletenessHeroComponent` to the `imports` array (and keep `ScoringSummaryComponent`).

Add computeds near the other profile computeds:

```ts
  readonly completeness = computed(() => profileCompleteness(this.form()));
  readonly gaps = computed(() => missingFields(this.form()));
  readonly heroSubtitle = computed(() => {
    const s = parseScoringJson(this.profile()?.scoringJson ?? null);
    const f = this.form();
    return [s?.seniority, f.location || s?.location, ...(s?.domains ?? [])]
      .filter(Boolean)
      .join(' · ');
  });
```

- [ ] **Step 2: Place the hero at the top and reorder sections**

Read the current profile template. Immediately inside `<div class="profile">`, after the `<header>` block, insert the hero as the first section:

```html
<app-completeness-hero
  [completeness]="completeness()"
  [gaps]="gaps()"
  [name]="form().name"
  [subtitle]="heroSubtitle()"
  (addField)="focusField($event)"
/>
```

Confirm the section order below the hero is: target roles → markdown profile → AI tools. (These sections already exist; move the target-roles `<section>` above the markdown-profile `<section>` only if it is not already — per the merged file it already precedes markdown profile, so no move is needed. Do not reorder if already correct.)

- [ ] **Step 3: Update the scoring-summary embed (drop removed inputs)**

Find the `<app-scoring-summary ...>` embed (~line 361). Remove the `[form]` and `(addField)` bindings so it reads:

```html
@if (profile()?.scoringJson) {
<app-scoring-summary [scoringJson]="profile()?.scoringJson ?? null" />
}
```

- [ ] **Step 4: Swap the hand-rolled info glyph for a lucide icon (page chrome)**

Add to the top imports: `import { LucideAngularModule, Info } from 'lucide-angular';`, add `LucideAngularModule` to `imports`, and add `protected readonly infoIcon = Info;` to the class. Replace the inline `<svg class="info__glyph" ...>…</svg>` occurrences in the template with:

```html
<lucide-icon [img]="infoIcon" [size]="14" class="info__glyph" aria-hidden="true" />
```

(Leave the surrounding `.info`/`.info__tip` tooltip structure and styles intact.)

- [ ] **Step 5: Run the profile suite**

Run: `npx nx test desktop -- --testPathPattern=profile`
Expected: PASS (profile.component + completeness-hero + scoring-summary).

- [ ] **Step 6: Preview verification (controller-run)**

The controller verifies in the browser preview after review (do not start a dev server here): hero shows the ring + gap pills; clicking a pill focuses the matching form field; archetype cards render with fit select + sell_when; ScoringSummary shows strengths + notes only (no duplicate completeness bar); Form/Raw toggle still works.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): 1A layout — completeness hero, reordered sections, lucide icons"
```

---

## Self-Review Notes

- **Spec coverage:** archetype util + backward-compat migration (Task 1); i18n en+de (Task 2); rich archetype cards + name-based consumers, Rust untouched, cv-list bug fix, onboarding wrap (Task 3); completeness hero owning completeness+gaps (Task 4); ScoringSummary reduction to avoid duplication (Task 5); 1A page order + hero wire + lucide icons, sidebar excluded (Task 6). A2 and B/C/D/E remain out of scope. All spec sections covered.
- **Type consistency:** `Archetype`, `ArchetypeFit`, `parseArchetypes`, `serializeArchetypes`, `archetypeNames`, `ProfileFieldKey`, `profileCompleteness`, `missingFields`, `parseScoringJson` names are identical across tasks. Hero I/O (`completeness`, `gaps`, `name`, `subtitle`, `addField`, `ringDash`, `onAdd`) match between Task 4 and Task 6. ScoringSummary reduced surface (Task 5) matches its Task 6 embed.
- **Known follow-ups (Minor):** the hero subtitle uses form + scoring seniority/domain; if both are empty the subtitle is blank (acceptable). The `field_*_short` i18n keys already exist from the merged Profile UI.

```

```
