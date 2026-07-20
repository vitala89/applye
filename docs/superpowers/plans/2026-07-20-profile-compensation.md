# Profile Compensation + Salary Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured compensation target (min/max/currency/period) to the Profile form, persisted in the profile markdown, and use it to show an Above/In-range/Below-target badge against a job's advertised salary in Discovery detail and My Jobs.

**Architecture:** Profile stays markdown-as-source-of-truth. Four new scalar fields on `ProfileForm` + `parse/serializeCompensation` helpers round-trip a `## Compensation` section (same strategy as the Education helpers). Two new pure helpers in a separate `compensation.ts` module (`parseSalaryRange`, `compareCompensation`) drive the badge. No AI-skill changes.

**Tech Stack:** Angular 20 standalone signals, Nx monorepo, Jest, `@applye/core` (pure TS), `@applye/i18n`, lucide-angular.

## Global Constraints

- Hyphen `-` only in all source/output; never em dash (U+2014) or en dash (U+2013).
- Profile storage stays `fullMd` markdown. No JSON migration. Compensation is four scalar strings on `ProfileForm` folded into a `## Compensation` markdown section - identical strategy to the existing Education handling.
- Do not touch `profile-compress`, `pitch`, or scoring skills. The `## Compensation` section flows into `profile_md` unchanged.
- Currencies limited to `EUR` and `USD`. No currency conversion. When currencies are both known and differ, or either side does not parse, the comparison is `unknown` and NO badge shows - never a wrong badge.
- All new user-facing strings go through `@applye/i18n` with EN + DE keys.
- Comparison badge appears in Discovery detail + My Jobs only, not per Discovery feed row.

---

### Task 1: Compensation parse/serialize helpers + ProfileForm fields (core)

**Files:**

- Modify: `libs/core/src/lib/profile/profile-markdown.ts`
- Modify: `libs/core/src/index.ts` (only if it is not `export *` from profile-markdown - it is `export *`, so no change; verify)
- Test: `libs/core/src/lib/profile/profile-markdown.spec.ts`

**Interfaces:**

- Produces:
  - `interface CompensationTarget { min: string; max: string; currency: string; period: string }`
  - `const EMPTY_COMPENSATION: CompensationTarget`
  - `parseCompensation(body: string): CompensationTarget`
  - `serializeCompensation(c: CompensationTarget): string`
  - Four new `ProfileForm` fields: `compMin`, `compMax`, `compCurrency`, `compPeriod` (all `string`).

**Markdown shape** under `## Compensation` (single line): `85000 - 110000 EUR per year`.

- Numbers: first number = min, second (after a `-` / `to`) = max. A single number fills min only.
- Currency: a `EUR`/`USD`/`€`/`$` token -> `EUR`/`USD`.
- Period: `per year`/`/year`/`p.a.` -> `year`; `per month`/`/month` -> `month`.

- [ ] **Step 1: Write the failing tests**

Extend the imports in `profile-markdown.spec.ts` to add `parseCompensation`, `serializeCompensation`, `EMPTY_COMPENSATION`, then add:

```typescript
describe('compensation', () => {
  it('round-trips a full compensation line', () => {
    const c = { min: '85000', max: '110000', currency: 'EUR', period: 'year' };
    expect(serializeCompensation(c)).toBe('85000 - 110000 EUR per year');
    expect(parseCompensation(serializeCompensation(c))).toEqual(c);
  });

  it('parses a min-only value', () => {
    expect(parseCompensation('90000 USD per year')).toEqual({
      min: '90000',
      max: '',
      currency: 'USD',
      period: 'year',
    });
  });

  it('parses numbers without a currency or period', () => {
    expect(parseCompensation('85000 - 110000')).toEqual({
      min: '85000',
      max: '110000',
      currency: '',
      period: '',
    });
  });

  it('parses currency symbols and month period', () => {
    expect(parseCompensation('5000 EUR per month')).toEqual({
      min: '5000',
      max: '',
      currency: 'EUR',
      period: 'month',
    });
  });

  it('serializes partial values without stray separators', () => {
    expect(serializeCompensation({ min: '80000', max: '', currency: 'EUR', period: '' })).toBe(
      '80000 EUR',
    );
    expect(serializeCompensation({ min: '', max: '', currency: 'USD', period: 'year' })).toBe(
      'USD per year',
    );
  });

  it('serializes fully-empty compensation to an empty string', () => {
    expect(serializeCompensation({ ...EMPTY_COMPENSATION })).toBe('');
  });
});

describe('compensation in profile markdown', () => {
  it('round-trips a Compensation section through parse/serialize', () => {
    const md = '# Jane\n\n## Compensation\n85000 - 110000 EUR per year\n';
    const form = parseProfileMd(md);
    expect(form.compMin).toBe('85000');
    expect(form.compMax).toBe('110000');
    expect(form.compCurrency).toBe('EUR');
    expect(form.compPeriod).toBe('year');
    expect(serializeProfileForm(form)).toContain('## Compensation\n85000 - 110000 EUR per year');
  });

  it('omits the Compensation section when unset', () => {
    const form = parseProfileMd('# Jane\n');
    expect(serializeProfileForm(form)).not.toContain('## Compensation');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: FAIL - `parseCompensation is not a function`.

- [ ] **Step 3: Implement**

In `profile-markdown.ts`:

(a) Add the four fields to the `ProfileForm` interface (after `languages: string[];`, before `notes`):

```typescript
/** Structured compensation target, folded into a `## Compensation` markdown
 * section. All strings mirror the form inputs; empty means unset. */
compMin: string;
compMax: string;
compCurrency: string;
compPeriod: string;
```

(b) Add them to `EMPTY_FORM` (after `languages: [],`):

```typescript
  compMin: '',
  compMax: '',
  compCurrency: '',
  compPeriod: '',
```

(c) Add the interface + helpers (near the Education helpers, before the `CHECKS` const):

```typescript
/** Structured compensation target as edited in the profile UI. Persisted in the
 * `## Compensation` markdown body so `ProfileForm` stays markdown-backed. */
export interface CompensationTarget {
  min: string;
  max: string;
  currency: string;
  period: string;
}

export const EMPTY_COMPENSATION: CompensationTarget = {
  min: '',
  max: '',
  currency: '',
  period: '',
};

/** Parses the `## Compensation` body (e.g. "85000 - 110000 EUR per year") into a
 * structured target. Lenient: numbers, currency, and period are each optional.
 * Numbers are extracted positionally (first = min, second = max), so no explicit
 * range-separator regex is needed. */
export function parseCompensation(body: string): CompensationTarget {
  const text = (body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { ...EMPTY_COMPENSATION };
  const currency = /(?:\bEUR\b|€)/i.test(text) ? 'EUR' : /(?:\bUSD\b|\$)/i.test(text) ? 'USD' : '';
  const period = /(?:per\s+month|\/\s*month|p\.?m\.?)/i.test(text)
    ? 'month'
    : /(?:per\s+year|\/\s*year|per\s+annum|p\.?a\.?|annually)/i.test(text)
      ? 'year'
      : '';
  // Strip currency/period words so only the numeric range remains.
  const numsPart = text
    .replace(/\bEUR\b|\bUSD\b|€|\$/gi, ' ')
    .replace(/per\s+(year|month|annum)|annually|p\.?a\.?|p\.?m\.?|\/\s*(year|month)/gi, ' ');
  const nums = numsPart.match(/\d[\d.,]*\d|\d/g) ?? [];
  const norm = (n: string) => n.replace(/[.,](?=\d{3}\b)/g, '');
  const min = nums[0] ? norm(nums[0]) : '';
  const max = nums[1] ? norm(nums[1]) : '';
  return { min, max, currency, period };
}

// The `String.fromCharCode(0x2013, 0x2014)` idiom for en/em dashes is available
// if a range separator is ever needed here; the positional numeric extraction
// above does not need it, so no such const is declared (avoids an unused-var lint).

/** Inverse of parseCompensation. Emits only the parts that are set; a fully
 * empty target serializes to ''. */
export function serializeCompensation(c: CompensationTarget): string {
  const min = c.min.trim();
  const max = c.max.trim();
  const currency = c.currency.trim();
  const period = c.period.trim();
  const parts: string[] = [];
  if (min && max) parts.push(`${min} - ${max}`);
  else if (min) parts.push(min);
  else if (max) parts.push(max);
  if (currency) parts.push(currency);
  if (period) parts.push(`per ${period}`);
  return parts.join(' ').trim();
}
```

(d) In `parseProfileMd`, in the section loop (the `for (const s of sections)` block, alongside `else if (s.heading === 'education') ...`), add:

```typescript
    else if (s.heading === 'compensation') {
      const c = parseCompensation(body);
      form.compMin = c.min;
      form.compMax = c.max;
      form.compCurrency = c.currency;
      form.compPeriod = c.period;
    }
```

(e) In `serializeProfileForm`, after the languages emission and before the `notes` emission, add:

```typescript
const comp = serializeCompensation({
  min: f.compMin,
  max: f.compMax,
  currency: f.compCurrency,
  period: f.compPeriod,
});
if (comp) parts.push(`## Compensation\n${comp}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test core --testFile=profile-markdown.spec.ts`
Expected: PASS (new compensation tests + existing tests green). If a pre-existing test asserts the exact `EMPTY_FORM` shape or a serialize output, update it to include the new fields/section only where the new fields are actually set.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/profile/profile-markdown.ts libs/core/src/lib/profile/profile-markdown.spec.ts
git commit -m "feat(core): compensation target field + markdown round-trip"
```

---

### Task 2: Salary parse + compare helpers (core)

**Files:**

- Create: `libs/core/src/lib/profile/compensation.ts`
- Modify: `libs/core/src/index.ts` (export the new module - check how sibling modules are exported and match; if the barrel uses `export *` per-file, add `export * from './lib/profile/compensation';`)
- Test: `libs/core/src/lib/profile/compensation.spec.ts`

**Interfaces:**

- Produces:
  - `interface ParsedSalary { min: number | null; max: number | null; currency: string }`
  - `parseSalaryRange(text: string | null | undefined): ParsedSalary | null`
  - `type CompensationVerdict = 'above' | 'within' | 'below' | 'unknown'`
  - `compareCompensation(target: { min: string; max: string; currency: string }, jobSalary: string | null | undefined): CompensationVerdict`

- [ ] **Step 1: Write the failing tests**

Create `libs/core/src/lib/profile/compensation.spec.ts`:

```typescript
import { parseSalaryRange, compareCompensation } from './compensation';

describe('parseSalaryRange', () => {
  it('parses a k-notation range with a currency symbol', () => {
    expect(parseSalaryRange('€80k - 100k')).toEqual({ min: 80000, max: 100000, currency: 'EUR' });
  });

  it('parses a plain range with a code', () => {
    expect(parseSalaryRange('80000 to 100000 EUR')).toEqual({
      min: 80000,
      max: 100000,
      currency: 'EUR',
    });
  });

  it('parses a single value (fills both bounds)', () => {
    expect(parseSalaryRange('$120,000')).toEqual({ min: 120000, max: 120000, currency: 'USD' });
  });

  it('parses k-notation single value', () => {
    expect(parseSalaryRange('90k USD')).toEqual({ min: 90000, max: 90000, currency: 'USD' });
  });

  it('returns null when no number is present', () => {
    expect(parseSalaryRange('Competitive')).toBeNull();
    expect(parseSalaryRange('')).toBeNull();
    expect(parseSalaryRange(null)).toBeNull();
  });
});

describe('compareCompensation', () => {
  const target = { min: '85000', max: '110000', currency: 'EUR' };

  it('is within when ranges overlap', () => {
    expect(compareCompensation(target, '90k - 105k EUR')).toBe('within');
  });

  it('is above when the job pays over the target max', () => {
    expect(compareCompensation(target, '120000 - 140000 EUR')).toBe('above');
  });

  it('is below when the job pays under the target min', () => {
    expect(compareCompensation(target, '60k - 70k EUR')).toBe('below');
  });

  it('is unknown when currencies differ', () => {
    expect(compareCompensation(target, '$120,000')).toBe('unknown');
  });

  it('is unknown when the job salary does not parse', () => {
    expect(compareCompensation(target, 'Competitive')).toBe('unknown');
  });

  it('is unknown when the target has no numbers', () => {
    expect(compareCompensation({ min: '', max: '', currency: 'EUR' }, '90k EUR')).toBe('unknown');
  });

  it('treats a single-bound target as a point', () => {
    expect(compareCompensation({ min: '100000', max: '', currency: 'EUR' }, '80k EUR')).toBe(
      'below',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test core --testFile=compensation.spec.ts`
Expected: FAIL - cannot find module `./compensation`.

- [ ] **Step 3: Implement**

Create `libs/core/src/lib/profile/compensation.ts`:

```typescript
/** Salary parsed from a job's free-text `salaryRange`. `currency` is '' when the
 * text carries no recognisable currency. */
export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string;
}

export type CompensationVerdict = 'above' | 'within' | 'below' | 'unknown';

function detectCurrency(text: string): string {
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  return '';
}

/** Expands one numeric token to a number, honouring a trailing k/K (thousands)
 * and stripping thousands separators. "80k" -> 80000, "120,000" -> 120000. */
function toNumber(token: string): number | null {
  const m = /^(\d[\d.,]*\d|\d)\s*([kK])?$/.exec(token.trim());
  if (!m) return null;
  const digits = m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, '');
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

/** Parses a free-text salary ("€80k - 100k", "$120,000", "90-110k EUR") into a
 * numeric range + currency. Returns null when no number is found. A single
 * value fills both bounds. k-notation and thousands separators are handled. */
export function parseSalaryRange(text: string | null | undefined): ParsedSalary | null {
  if (!text) return null;
  const currency = detectCurrency(text);
  // Grab number-with-optional-k tokens in order.
  const tokens = text.match(/\d[\d.,]*\d\s*[kK]?|\d\s*[kK]?/g) ?? [];
  const nums = tokens.map(toNumber).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  return { min, max, currency };
}

/** Compares a profile compensation target against a job's advertised salary.
 * Returns 'unknown' (no badge) whenever a wrong verdict is possible: the target
 * has no number, the job salary does not parse, or the currencies are both known
 * and differ. Otherwise 'below'/'above'/'within' by numeric range overlap. */
export function compareCompensation(
  target: { min: string; max: string; currency: string },
  jobSalary: string | null | undefined,
): CompensationVerdict {
  const tMinRaw = Number(target.min.replace(/[^\d]/g, ''));
  const tMaxRaw = Number(target.max.replace(/[^\d]/g, ''));
  const tMin = Number.isFinite(tMinRaw) && target.min.trim() ? tMinRaw : null;
  const tMax = Number.isFinite(tMaxRaw) && target.max.trim() ? tMaxRaw : null;
  if (tMin === null && tMax === null) return 'unknown';
  const lo = tMin ?? tMax!;
  const hi = tMax ?? tMin!;

  const job = parseSalaryRange(jobSalary);
  if (!job || (job.min === null && job.max === null)) return 'unknown';
  const tc = (target.currency || '').trim().toUpperCase();
  if (tc && job.currency && tc !== job.currency) return 'unknown';
  const jMin = job.min ?? job.max!;
  const jMax = job.max ?? job.min!;

  if (jMax < lo) return 'below';
  if (jMin > hi) return 'above';
  return 'within';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test core --testFile=compensation.spec.ts`
Expected: PASS. Then `npx nx test core` once to confirm the whole core suite is green.

- [ ] **Step 5: Verify the barrel export**

Run: `grep -n "compensation\|export \*" libs/core/src/index.ts`. If the barrel re-exports each profile module explicitly, add `export * from './lib/profile/compensation';`. If it already `export *`s the whole `profile` folder or index, confirm the new symbols resolve: `npx tsc -p libs/core/tsconfig.lib.json --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/profile/compensation.ts libs/core/src/lib/profile/compensation.spec.ts libs/core/src/index.ts
git commit -m "feat(core): parseSalaryRange + compareCompensation helpers"
```

---

### Task 3: i18n keys

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts` (add to BOTH the `en` and `de` profile blocks; ru/es/fr/uk inherit `en` via `stub()` so they need no edits).

- [ ] **Step 1: Add keys**

Add these to the `en` profile block and the `de` profile block (find them by the existing `section_experience` key), matching indentation/quote/trailing-comma style:

```
profile.section_compensation   = "Compensation"          | DE "Vergütung"
profile.comp_hint              = "Your target salary range. Used to flag how a job's pay compares." | DE "Deine Zielgehaltsspanne. Zeigt, wie die Bezahlung einer Stelle dazu steht."
profile.comp_min               = "Min"                    | DE "Min"
profile.comp_max               = "Max"                    | DE "Max"
profile.comp_currency          = "Currency"               | DE "Währung"
profile.comp_period            = "Period"                 | DE "Zeitraum"
profile.comp_period_year       = "per year"               | DE "pro Jahr"
profile.comp_period_month      = "per month"              | DE "pro Monat"
comp.badge_above               = "Above your target"      | DE "Über deinem Ziel"
comp.badge_within              = "In your range"          | DE "In deiner Spanne"
comp.badge_below               = "Below your target"      | DE "Unter deinem Ziel"
```

`comp.*` badge keys are used by Discovery + My Jobs. Place them in a sensible top-level `comp` block (or under an existing shared block) consistent with how other cross-page keys are organized in this file; if unsure, add a `comp: { ... }` object to both `en` and `de` at the same nesting level as `profile`.

- [ ] **Step 2: Verify**

Run: `npx nx test i18n` and `npx tsc -p libs/i18n/tsconfig.lib.json --noEmit`. Confirm the keys resolve, no duplicates.
`grep -n "section_compensation\|badge_above" libs/i18n/src/lib/translations/translations.ts` should show each key twice (en + de).

- [ ] **Step 3: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): compensation field + salary badge keys"
```

---

### Task 4: Compensation form block in the profile component

**Files:**

- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`

**Interfaces:**

- Consumes: `ProfileForm.compMin/compMax/compCurrency/compPeriod` (Task 1) via the existing `updateField`.
- Produces: a compensation UI block; no new methods needed beyond `updateField`.

- [ ] **Step 1: Add the template block**

Add a compact block inside the Form-mode `form-cards` container, after the skills/languages field-row and before the collapsible sections (or wherever the basic scalar fields end). Use `updateField` directly - these are scalars like name/email:

```html
<div class="field field--full" id="field-compensation">
  <div class="field__label-row">
    <span class="field__label">{{ t()('profile.section_compensation') }}</span>
    <span class="field__hint field__hint--inline">{{ t()('profile.comp_hint') }}</span>
  </div>
  <div class="comp-row">
    <input
      class="field__input"
      type="number"
      inputmode="numeric"
      [ngModel]="form().compMin"
      (ngModelChange)="updateField('compMin', $event)"
      [placeholder]="t()('profile.comp_min')"
      [attr.aria-label]="t()('profile.comp_min')"
    />
    <span class="comp-sep">-</span>
    <input
      class="field__input"
      type="number"
      inputmode="numeric"
      [ngModel]="form().compMax"
      (ngModelChange)="updateField('compMax', $event)"
      [placeholder]="t()('profile.comp_max')"
      [attr.aria-label]="t()('profile.comp_max')"
    />
    <select
      class="field__input comp-select"
      [ngModel]="form().compCurrency"
      (ngModelChange)="updateField('compCurrency', $event)"
      [attr.aria-label]="t()('profile.comp_currency')"
    >
      <option value="">-</option>
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
    </select>
    <select
      class="field__input comp-select"
      [ngModel]="form().compPeriod"
      (ngModelChange)="updateField('compPeriod', $event)"
      [attr.aria-label]="t()('profile.comp_period')"
    >
      <option value="">-</option>
      <option value="year">{{ t()('profile.comp_period_year') }}</option>
      <option value="month">{{ t()('profile.comp_period_month') }}</option>
    </select>
  </div>
</div>
```

Add styles to the component `styles` array:

```css
.comp-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.comp-row .field__input {
  width: auto;
  flex: 1;
  min-width: 90px;
}
.comp-select {
  flex: 0 0 auto;
  min-width: 110px;
}
.comp-sep {
  color: var(--text-tertiary);
}
```

Note: `updateField` already funnels through `syncMdFromForm`, so the `## Compensation` section is written to `fullMd` on every edit, and `parseProfileMd` re-seeds the fields on load / leave-raw automatically (they are plain form fields, no signal). No `ngOnInit`/`toggleRawMode` change is needed.

- [ ] **Step 2: Verify**

Run:

```bash
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts
npx nx build desktop --configuration=development
```

Expected: eslint 0 errors; AOT build exit 0, "Application bundle generation complete".

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/app/pages/profile/profile.component.ts
git commit -m "feat(profile): compensation target form block"
```

---

### Task 5: Compensation badge in Discovery detail

**Files:**

- Modify: `apps/desktop/src/app/pages/discover/discover.component.ts`
- Modify: `apps/desktop/src/app/pages/discover/discover.component.html`
- Modify: `apps/desktop/src/app/pages/discover/discover.component.scss`

**Interfaces:**

- Consumes: `parseProfileMd` (already used in discover to derive keywords - the profile is already loaded), `compareCompensation` + `CompensationVerdict` (Task 2).
- Produces: a `compVerdict()` computed/signal + badge markup near the detail score.

- [ ] **Step 1: Load the profile compensation target**

In `discover.component.ts`, the profile is already loaded (`this.deriveKeywords(profile?.targetArchetypes)` in the load path near line 554). Where that profile is read, also parse and store the compensation target:

```typescript
import { parseProfileMd, compareCompensation, type CompensationVerdict } from '@applye/core';
```

Add a signal:

```typescript
/** Profile compensation target (min/max/currency), parsed from the saved profile
 * markdown; empty strings when the user has set no target. */
private readonly compTarget = signal<{ min: string; max: string; currency: string }>({
  min: '', max: '', currency: '',
});
```

In the same block that reads `profile` for keywords, set it:

```typescript
const cf = parseProfileMd(profile?.fullMd ?? '');
this.compTarget.set({ min: cf.compMin, max: cf.compMax, currency: cf.compCurrency });
```

- [ ] **Step 2: Compute the verdict for the open detail job**

The open job is identified by `detailId()`; the feed row carries `salaryRange`. Add:

```typescript
/** Salary-fit verdict for the open detail job vs the profile target; 'unknown'
 * (rendered as no badge) unless both the target and the job salary parse. */
protected readonly compVerdict = computed<CompensationVerdict>(() => {
  const id = this.detailId();
  if (id === null) return 'unknown';
  const row = this.feed().find((r) => r.id === id);
  return compareCompensation(this.compTarget(), row?.salaryRange ?? null);
});
```

(Confirm `FeedRow`/`DiscoverFeedItem` exposes `salaryRange` and `id`; `job.model.ts` shows `salaryRange?: string | null`. If the feed item does not carry `salaryRange`, use the field it does carry for the job's advertised salary; if none exists on the feed item, note this as DONE_WITH_CONCERNS - the badge then only works in My Jobs, Task 6.)

- [ ] **Step 3: Render the badge in the detail template**

In `discover.component.html`, near the score head block (around the `dv-detail__scorehead` at line ~122), add, guarded so nothing renders for `unknown`:

```html
@if (compVerdict() !== 'unknown') {
<span
  class="dv-comp-badge"
  [class.dv-comp-badge--good]="compVerdict() !== 'below'"
  [class.dv-comp-badge--warn]="compVerdict() === 'below'"
>
  {{ t()('comp.badge_' + compVerdict()) }}
</span>
}
```

Add to `discover.component.scss`:

```scss
.dv-comp-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-badge);
  white-space: nowrap;
}
.dv-comp-badge--good {
  color: var(--success);
  background: var(--success-tint, var(--surface-sunken));
}
.dv-comp-badge--warn {
  color: var(--warning);
  background: var(--warning-tint, var(--surface-sunken));
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npx eslint apps/desktop/src/app/pages/discover/discover.component.ts
npx nx build desktop --configuration=development
```

Expected: eslint 0 errors; AOT build exit 0. (The `t()('comp.badge_' + compVerdict())` dynamic key is fine at runtime; if the i18n typing rejects a computed key, use an explicit map: `compVerdict() === 'above' ? t()('comp.badge_above') : ...`.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/discover/discover.component.ts apps/desktop/src/app/pages/discover/discover.component.html apps/desktop/src/app/pages/discover/discover.component.scss
git commit -m "feat(discover): salary-fit badge in job detail"
```

---

### Task 6: Compensation badge in My Jobs

**Files:**

- Modify: `apps/desktop/src/app/pages/jobs/my-jobs.component.ts` (+ its template/styles, inline or separate - match the file's structure)

**Interfaces:**

- Consumes: `parseProfileMd`, `compareCompensation` (Task 2); My Jobs already loads jobs with `salaryRange`.

- [ ] **Step 1: Load the target + compute per-job verdict**

In `my-jobs.component.ts`, load the profile once (mirror how it loads other data; if it already injects `DbService`, call `getProfile()`), parse the compensation target, and expose a helper:

```typescript
import { parseProfileMd, compareCompensation, type CompensationVerdict } from '@applye/core';
```

```typescript
private readonly compTarget = signal<{ min: string; max: string; currency: string }>({
  min: '', max: '', currency: '',
});
// in the load path, after fetching the profile:
const cf = parseProfileMd(profile?.fullMd ?? '');
this.compTarget.set({ min: cf.compMin, max: cf.compMax, currency: cf.compCurrency });

protected compVerdict(salaryRange: string | null | undefined): CompensationVerdict {
  return compareCompensation(this.compTarget(), salaryRange ?? null);
}
```

- [ ] **Step 2: Render the badge beside each job's salaryRange**

Where the template shows `salaryRange`, add (only when not unknown):

```html
@if (compVerdict(job.salaryRange) !== 'unknown') {
<span
  class="comp-badge"
  [class.comp-badge--good]="compVerdict(job.salaryRange) !== 'below'"
  [class.comp-badge--warn]="compVerdict(job.salaryRange) === 'below'"
>
  {{ t()('comp.badge_' + compVerdict(job.salaryRange)) }}
</span>
}
```

Add matching `.comp-badge` styles (same colors as Task 5) to this component's styles. If calling `compVerdict(...)` three times per row reads poorly, compute it into a local via `@let v = compVerdict(job.salaryRange);` (Angular 20 `@let`) and reuse `v`.

- [ ] **Step 3: Verify**

Run:

```bash
npx eslint apps/desktop/src/app/pages/jobs/my-jobs.component.ts
npx nx build desktop --configuration=development
```

Expected: eslint 0 errors; AOT build exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/pages/jobs/my-jobs.component.ts
git commit -m "feat(jobs): salary-fit badge in my jobs"
```

---

### Task 7: Full verification + docs + PR

**Files:**

- Modify: `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Run the suites**

Run:

```bash
npx nx test core
npx nx test desktop
npx eslint apps/desktop/src/app/pages/profile/profile.component.ts apps/desktop/src/app/pages/discover/discover.component.ts apps/desktop/src/app/pages/jobs/my-jobs.component.ts libs/core/src/lib/profile/compensation.ts libs/core/src/lib/profile/profile-markdown.ts
npx nx build desktop --configuration=development
```

Expected: all green; 0 eslint errors on the listed files.

- [ ] **Step 2: CHANGELOG**

Under `## [Unreleased]` (create if absent):

```markdown
### Added

- Profile editor: compensation target (min / max / currency / period) in Form mode.
- Discovery and My Jobs: a salary-fit badge (Above / In range / Below target) comparing a job's advertised salary to your compensation target.
```

- [ ] **Step 3: CURRENT_STATE.md**

Add a one-line summary of the compensation target + salary-fit badge to the appropriate section, matching the doc's format.

- [ ] **Step 4: Commit + push + PR**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs(profile): changelog + state sync for compensation feature"
git push -u origin feat/profile-compensation
gh pr create --base main --title "feat(profile): compensation target + salary-fit badge" --body "..."
```

PR body: the two outcomes, the pure core helpers + test coverage, markdown-source-of-truth preserved, `unknown`-means-no-badge safety, and the known period/currency limitations.

---

## Notes for the implementer

- The profile component uses an inline template + styles array (single `profile.component.ts`) - no separate `.html`/`.scss`. Discovery and My Jobs use SEPARATE `.html`/`.scss` files - edit those.
- `updateField(key, value)` is the single funnel that rewrites `fullMd` from `form()`. The compensation fields are plain scalars, so they need no signal and no explicit seeding (unlike experience/languages).
- `compareCompensation` must NEVER show a wrong badge: any ambiguity returns `unknown`. When in doubt in the UI, guard on `!== 'unknown'`.
- Verify the actual field name the Discovery feed item / My Jobs row uses for the advertised salary (`salaryRange`) before wiring the badge; if a view lacks it, report it rather than inventing a field.
