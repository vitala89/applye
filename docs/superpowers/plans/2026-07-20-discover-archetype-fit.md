# Discover Archetype-Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match each discovered job to the user's best-fit target role (archetype), show a colored tier badge in the Discover feed + detail, feed tier into the deterministic score, and order the feed by tier - all client-side, 0 tokens.

**Architecture:** New pure tested helpers in `libs/core` (`archetypeWords`, `archetypeKeywordBag`, `matchArchetype`, `tierRank`). `discover.component` parses the real `Archetype[]`, badges each row by its best-matching archetype (name-gated, strongest tier wins), reuses that for the For-you split, sorts For-you by tier then recency, and adds a tier boost to `computeRawScore`. Badge UI mirrors the shipped comp-badge pattern.

**Tech Stack:** Angular 20 signals, TypeScript strict, Nx, Jest. `@applye/core` pure lib. i18n `translations.ts` (EN authoritative, DE parallel).

## Global Constraints

- Pure, deterministic core helpers; no AI, 0 tokens. Unit-tested.
- Badge never misleads: a match requires an archetype **name** keyword hit; the badge shows the **strongest tier** that matched (tie-break by coverage).
- i18n: add keys to EN + DE. ru/es/fr/uk inherit EN via `stub()`.
- Hyphen-only. No em dash (U+2014) / en dash (U+2013).
- Core test cmd: `npx nx test core`. Desktop: `npx nx test desktop`. Lint: `npx nx lint desktop` / `npx nx lint core`.
- Follow existing patterns; do not touch the compensation badge or Rust `archetypes.rs`.

---

### Task 1: Core archetype-match helpers

**Files:**

- Modify: `libs/core/src/lib/profile/archetype.ts` (append after line 56)
- Test: `libs/core/src/lib/profile/archetype.spec.ts` (append)

**Interfaces:**

- Consumes: `Archetype`, `ArchetypeFit` (already in this file).
- Produces:
  - `archetypeWords(phrase: string): string[]`
  - `archetypeKeywordBag(list: Archetype[]): string[]`
  - `tierRank(fit: ArchetypeFit): number` (primary 3, secondary 2, adjacent 1)
  - `interface ArchetypeMatch { name: string; fit: ArchetypeFit; coverage: number }`
  - `matchArchetype(text: string, list: Archetype[]): ArchetypeMatch | null`

- [ ] **Step 1: Write the failing tests** — append to `archetype.spec.ts`:

```ts
import { archetypeWords, archetypeKeywordBag, tierRank, matchArchetype } from './archetype';

describe('archetypeWords', () => {
  it('lowercases, drops <3-char words and stopwords, dedupes', () => {
    expect(archetypeWords('Senior Frontend Engineer and the FE')).toEqual([
      'senior',
      'frontend',
      'engineer',
    ]);
  });
  it('keeps +/# tokens of length >=3, drops <3-char tokens, [] for empty', () => {
    // "go" (2) dropped, "and" stopword dropped, "c++" (3) kept
    expect(archetypeWords('C++ and Go')).toEqual(['c++']);
    expect(archetypeWords('')).toEqual([]);
  });
});

describe('archetypeKeywordBag', () => {
  it('flattens name words across archetypes and dedupes', () => {
    const bag = archetypeKeywordBag([
      { name: 'Frontend Engineer', fit: 'primary', sellWhen: '' },
      { name: 'Backend Engineer', fit: 'secondary', sellWhen: '' },
    ]);
    expect(bag).toEqual(['frontend', 'engineer', 'backend']);
  });
});

describe('tierRank', () => {
  it('ranks primary > secondary > adjacent', () => {
    expect(tierRank('primary')).toBeGreaterThan(tierRank('secondary'));
    expect(tierRank('secondary')).toBeGreaterThan(tierRank('adjacent'));
  });
});

describe('matchArchetype', () => {
  const list: Archetype[] = [
    { name: 'Frontend Engineer', fit: 'secondary', sellWhen: 'react design systems' },
    { name: 'Staff Engineer', fit: 'primary', sellWhen: 'platform scale' },
    { name: 'Product Designer', fit: 'adjacent', sellWhen: '' },
  ];

  it('returns null when no archetype name hits (sellWhen alone never matches)', () => {
    expect(matchArchetype('React design systems specialist', list)).toBeNull();
  });

  it('returns null when there are no archetypes', () => {
    expect(matchArchetype('Frontend Engineer', [])).toBeNull();
  });

  it('picks the strongest tier when several names match', () => {
    // both "Frontend Engineer" (secondary) and "Staff Engineer" (primary) share "engineer"
    const m = matchArchetype('Staff Frontend Engineer', list);
    expect(m?.fit).toBe('primary');
    expect(m?.name).toBe('Staff Engineer');
  });

  it('within the same tier, higher coverage wins', () => {
    const same: Archetype[] = [
      { name: 'Frontend Engineer', fit: 'primary', sellWhen: '' }, // partial: only "engineer" hits -> 1/2
      { name: 'Senior Engineer', fit: 'primary', sellWhen: '' }, // full: both hit -> 2/2
    ];
    const m = matchArchetype('Senior Engineer role', same);
    expect(m?.name).toBe('Senior Engineer');
    expect(m?.coverage).toBe(1);
  });

  it('reports coverage in 0..1', () => {
    const m = matchArchetype('Product Designer at Acme', list);
    expect(m?.fit).toBe('adjacent');
    expect(m?.coverage).toBeGreaterThan(0);
    expect(m?.coverage).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test core --testPathPattern archetype`
Expected: FAIL — `archetypeWords`/`matchArchetype`/etc. not exported.

- [ ] **Step 3: Implement the helpers** — append to `archetype.ts`:

```ts
const KEYWORD_STOPWORDS = ['and', 'or', 'the', 'with', 'for', 'of', 'in'];
const TIER_RANK: Record<ArchetypeFit, number> = { primary: 3, secondary: 2, adjacent: 1 };
const COV_CAP = 6;
const SELL_W = 0.05;
const SELL_CAP = 3;

export interface ArchetypeMatch {
  name: string;
  fit: ArchetypeFit;
  coverage: number;
}

/** Tokenize a phrase into meaningful lowercase words (>=3 chars, no stopwords, deduped). */
export function archetypeWords(phrase: string): string[] {
  const words: string[] = [];
  for (const raw of phrase.split(/[^\p{L}\p{N}+#]+/u)) {
    const w = raw.trim().toLowerCase();
    if (w.length >= 3 && !KEYWORD_STOPWORDS.includes(w) && !words.includes(w)) {
      words.push(w);
    }
  }
  return words;
}

/** Flattened, deduped name-word bag across all archetypes. */
export function archetypeKeywordBag(list: Archetype[]): string[] {
  const bag: string[] = [];
  for (const a of list) {
    for (const w of archetypeWords(a.name)) {
      if (!bag.includes(w)) bag.push(w);
    }
  }
  return bag;
}

/** Numeric tier weight: primary 3, secondary 2, adjacent 1. */
export function tierRank(fit: ArchetypeFit): number {
  return TIER_RANK[fit];
}

/**
 * Best-fit archetype for `text`. A candidate REQUIRES at least one archetype-name
 * word to appear in the text (sellWhen alone never matches). Winner = strongest
 * tier, then highest rank (name coverage + a light sellWhen bonus). Null = no match.
 */
export function matchArchetype(text: string, list: Archetype[]): ArchetypeMatch | null {
  const hay = text.toLowerCase();
  let best: ArchetypeMatch | null = null;
  let bestTier = -1;
  let bestRank = -1;
  for (const a of list) {
    const nameWords = archetypeWords(a.name);
    if (!nameWords.length) continue;
    const nameHits = nameWords.filter((w) => hay.includes(w)).length;
    if (nameHits === 0) continue;
    const coverage = Math.min(1, nameHits / Math.min(nameWords.length, COV_CAP));
    const sellHits = archetypeWords(a.sellWhen).filter((w) => hay.includes(w)).length;
    const rank = coverage + Math.min(sellHits, SELL_CAP) * SELL_W;
    const tier = TIER_RANK[a.fit];
    if (tier > bestTier || (tier === bestTier && rank > bestRank)) {
      bestTier = tier;
      bestRank = rank;
      best = { name: a.name, fit: a.fit, coverage };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test core --testPathPattern archetype`
Expected: PASS (all archetype specs green).

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/profile/archetype.ts libs/core/src/lib/profile/archetype.spec.ts
git commit -m "feat(core): per-archetype match helpers (name-gated, tier-ranked)"
```

---

### Task 2: Wire archetype matching + tier scoring into Discover

**Files:**

- Modify: `apps/desktop/src/app/pages/discover/discover.component.ts`

**Interfaces:**

- Consumes (Task 1): `parseArchetypes`, `archetypeKeywordBag`, `matchArchetype`, `tierRank`, `ArchetypeMatch`, `Archetype` from `@applye/core`.
- Produces (Task 3 uses): `archetypeBadge(row: FeedRow): ArchetypeMatch | null`, signal `archetypes`.

- [ ] **Step 1: Add imports.** In the `@applye/core` import group (ends line 42), add the new names alongside the existing `parseArchetypes`/`archetypeNames` imports:

```ts
  parseArchetypes,
  archetypeKeywordBag,
  matchArchetype,
  tierRank,
  type ArchetypeMatch,
  type Archetype,
```

(Do not duplicate `parseArchetypes` if it is already imported — merge into the existing entry.)

- [ ] **Step 2: Add the `archetypes` signal.** Right after `private readonly profileKeywords = signal<string[]>([]);` (line 217) add:

```ts
  private readonly archetypes = signal<Archetype[]>([]);
```

- [ ] **Step 3: Populate both signals in `load()`.** Replace line 589
      `this.profileKeywords.set(this.deriveKeywords(profile?.targetArchetypes));`
      with:

```ts
const arch = parseArchetypes(profile?.targetArchetypes);
this.archetypes.set(arch);
this.profileKeywords.set(archetypeKeywordBag(arch));
```

- [ ] **Step 4: Delete the dead `deriveKeywords` method** (lines 1217-1237, the `/** Mirror of the Rust derive_title_keywords ... */` block). It is now unused and was the source of the `[object Object]` bug.

- [ ] **Step 5: Add `archetypeBadge` + tier helper.** Add these methods near `matchesProfile` (after line 404):

```ts
  /** Best-fit archetype for a feed row (title only; JD not loaded in the feed). */
  protected archetypeBadge(row: FeedRow): ArchetypeMatch | null {
    return matchArchetype(row.title ?? '', this.archetypes());
  }

  private rowTierRank(row: FeedRow): number {
    const m = this.archetypeBadge(row);
    return m ? tierRank(m.fit) : 0;
  }
```

- [ ] **Step 6: Redefine `matchesProfile` to reuse the badge.** Replace the body of `matchesProfile` (lines 399-404) with:

```ts
  protected matchesProfile(row: FeedRow): boolean {
    return this.archetypeBadge(row) !== null;
  }
```

- [ ] **Step 7: Sort the For-you section by tier then recency.** In the `feedSections` computed, replace line 416
      `const forYou = rows.filter((r) => this.matchesProfile(r));`
      with:

```ts
const forYou = rows
  .filter((r) => this.matchesProfile(r))
  .sort((a, b) => {
    const d = this.rowTierRank(b) - this.rowTierRank(a);
    if (d !== 0) return d;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
```

- [ ] **Step 8: Add the tier boost to `computeRawScore`.** In `computeRawScore` (line 775), after the `skillBonus` line add a tier boost from the open detail row's badge, and fold it into `score`:

```ts
const skillBonus = Math.min(this.detailSkills().length, 6) * 3;
const detail = this.detailRow();
const badge = detail ? this.archetypeBadge(detail) : null;
const tierBoost = badge ? { primary: 12, secondary: 6, adjacent: 0 }[badge.fit] : 0;
const score = Math.round(30 + coverage * 55 + skillBonus + tierBoost);
```

(Remove the old `const score = Math.round(30 + coverage * 55 + skillBonus);` line.)

- [ ] **Step 9: Typecheck + lint.**

Run: `npx nx lint desktop`
Expected: PASS (0 errors; pre-existing warnings OK). No `deriveKeywords`/unused-symbol errors.

- [ ] **Step 10: Run desktop tests.**

Run: `npx nx test desktop`
Expected: PASS (suite stays green).

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/app/pages/discover/discover.component.ts
git commit -m "feat(discover): per-archetype badge match, tier sort + score boost"
```

---

### Task 3: Badge UI + i18n

**Files:**

- Modify: `apps/desktop/src/app/pages/discover/discover.component.ts` (add `archBadgeLabel` + import `ArchetypeFit`)
- Modify: `apps/desktop/src/app/pages/discover/discover.component.html`
- Modify: `apps/desktop/src/app/pages/discover/discover.component.scss`
- Modify: `libs/i18n/src/lib/translations/translations.ts` (EN + DE)

**Interfaces:**

- Consumes (Task 2): `archetypeBadge(row)`, `ArchetypeMatch`.

- [ ] **Step 1: Add i18n keys (EN).** In `translations.ts`, inside the EN `discover: { ... }` object, next to the existing feed labels (e.g. near `for_you` / `more_openings`), add:

```ts
    arch_primary: 'Primary role',
    arch_secondary: 'Secondary role',
    arch_adjacent: 'Adjacent role',
```

- [ ] **Step 2: Add i18n keys (DE).** In the DE `discover: { ... }` object, add the parallel keys:

```ts
    arch_primary: 'Primäre Rolle',
    arch_secondary: 'Sekundäre Rolle',
    arch_adjacent: 'Angrenzende Rolle',
```

- [ ] **Step 3: Add `archBadgeLabel` + `ArchetypeFit` import.** In `discover.component.ts`, add `type ArchetypeFit` to the `@applye/core` import group, then add this method next to `compBadgeLabel` (after line 754):

```ts
  /** i18n label for an archetype tier badge. */
  protected archBadgeLabel(fit: ArchetypeFit): string {
    return this.t()('discover.arch_' + fit);
  }
```

- [ ] **Step 4: Render the badge in the feed row.** In `discover.component.html`, inside the `dv-row__titleline` block, after the `@if (row.saved) { ... }` badge (after line 689) add:

```html
@if (archetypeBadge(row); as m) {
<span class="dv-arch-badge dv-arch-badge--{{ m.fit }}"> {{ archBadgeLabel(m.fit) }} </span>
}
```

- [ ] **Step 5: Render the badge in the detail hero.** In the detail header, after the `<h2 class="dv-detail__title">{{ drow.title }}</h2>` line (line 33) add:

```html
@if (archetypeBadge(drow); as m) {
<span class="dv-arch-badge dv-arch-badge--{{ m.fit }}"> {{ archBadgeLabel(m.fit) }} </span>
}
```

- [ ] **Step 6: Add badge styles.** In `discover.component.scss`, after the `.dv-comp-badge--muted { ... }` block (line 2127) add:

```scss
.dv-arch-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-badge);
  white-space: nowrap;
}
.dv-arch-badge--primary {
  color: var(--accent);
  background: var(--surface-sunken);
}
.dv-arch-badge--secondary {
  color: var(--text-secondary);
  background: var(--surface-sunken);
}
.dv-arch-badge--adjacent {
  color: var(--text-tertiary);
  background: var(--surface-sunken);
}
```

- [ ] **Step 7: Verify i18n parity.**

Run: `npx nx test i18n`
Expected: PASS (EN/DE key parity check stays green).

- [ ] **Step 8: Lint + build the desktop app (AOT catches template/type errors).**

Run: `npx nx lint desktop && npx nx build desktop`
Expected: PASS. If `--accent` / `--text-secondary` / `--radius-badge` are not defined tokens, substitute the nearest existing token used by `.dv-comp-badge` (check `design-system/` tokens) rather than inventing values.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/pages/discover/discover.component.ts apps/desktop/src/app/pages/discover/discover.component.html apps/desktop/src/app/pages/discover/discover.component.scss libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(discover): archetype tier badge UI + EN/DE i18n"
```

---

### Task 4: Verification + docs sync

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Full green sweep.**

Run: `npx nx test core && npx nx test desktop && npx nx test i18n && npx nx lint desktop && npx nx lint core`
Expected: all PASS. Fix any regression before continuing.

- [ ] **Step 2: Update `CHANGELOG.md`.** Under the `[Unreleased]` section, add:

```markdown
### Added

- Discover: target-role (archetype) fit badges. Each job in the feed and detail now shows the strongest matching archetype tier (Primary / Secondary / Adjacent); the For-you section is ordered by tier, and tier feeds the deterministic 0-token score. sellWhen acts as a light tie-break signal.

### Fixed

- Discover: profile archetypes were serialized as objects but read as `[object Object]`, collapsing all target-role matching to a single junk keyword. Matching now parses the real archetype list.
```

- [ ] **Step 3: Sync `docs/product/CURRENT_STATE.md`.** The header block is stale (says focus `fix/cv-dates-coverletter-padding`, omits PR #135/#136). Update the "Current branch / focus" bullet to describe `feat/discover-archetype-fit` (this feature), and note that `main` already carries PR #135 (structured profile editor) and PR #136 (compensation target + salary-fit badge). Keep it one concise paragraph consistent with the existing style.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs(discover): changelog + state sync for archetype-fit"
```

---

## Notes for the whole-branch review

- Confirm the honesty invariant end-to-end: a row with no archetype-name hit shows **no** badge; a row where Primary + Adjacent both match shows **Primary**.
- Confirm `matchArchetype` is called on title-only for feed rows (JD not loaded) and that `computeRawScore` still returns `null` when the profile has no archetypes.
- Live Tauri gate (manual, cannot run here): scan real jobs, eyeball the three badge colors, the For-you tier ordering, and the detail-hero badge.
