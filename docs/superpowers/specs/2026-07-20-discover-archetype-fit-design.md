# Discover <-> Target-role (archetype) fit - design

Branch: `feat/discover-archetype-fit` (cut from `main` at `0a397ab`).

## Goal

Make Discovery archetype-aware: match each discovered job to the user's best-fit
target role (archetype), show a colored tier badge in the feed, feed tier into the
deterministic score, and order the feed by tier. Stay inside the existing 0-token
client-side scoring path. Never mislead: a badge appears only on a real match, and
its tier is the strongest archetype that actually matched.

## Background / current state

- `Archetype { name; fit: 'primary'|'secondary'|'adjacent'; sellWhen }`, stored as a
  JSON array in `Profile.targetArchetypes` (`archetype.ts`, helpers `parseArchetypes`
  / `serializeArchetypes` / `archetypeNames`).
- Discover today collapses all archetypes into one flat keyword bag
  (`deriveKeywords`, discover.component.ts:1218) and scores flat keyword coverage
  (`computeRawScore`, :775). For-you/More split via `matchesProfile` (:399).
- **Latent bug (fixed here):** since PR #135 `targetArchetypes` holds objects, but
  `deriveKeywords` does `JSON.parse(...).map(String)` -> `"[object Object]"`, so the
  only derived keyword is `"object"`. Client For-you matching + raw score are
  effectively broken. Parsing real archetypes fixes this.
- Rust `derive_title_keywords` / `check_archetype_match` (archetypes.rs) also assume a
  `Vec<String>`; they are out of scope (not wired to the feed UI). No Rust change.

## Decisions (approved)

1. **Match location:** client-side, pure tested core helpers. 0 tokens, no DB/persist,
   no Rust. Consistent with `computeRawScore`.
2. **Tie-break:** highest tier, then coverage. Badge = strongest archetype that
   matched. Never Adjacent when a Primary also matched.
3. **sellWhen:** light secondary signal. Its words boost coverage/score slightly but
   never create a match on their own - the archetype **name** must hit for a badge.
4. **Feed order:** keep the For-you / More sections; inside For-you order Primary >
   Secondary > Adjacent, then newest.

## Core helpers (`libs/core/src/lib/profile/archetype.ts`, pure + unit-tested)

```ts
export interface ArchetypeMatch {
  name: string; // archetype name that won
  fit: ArchetypeFit; // its tier
  coverage: number; // 0..1 name-keyword coverage (for tie-break / UI honesty)
}

// Tokenize a phrase into meaningful lowercase words:
// split on non [\p{L}\p{N}+#], drop <3 chars and stopwords, dedupe.
export function archetypeWords(phrase: string): string[];

// Aggregate name-word bag across all archetypes (replaces the buggy deriveKeywords;
// used for For-you membership fallback + matched-keyword chips).
export function archetypeKeywordBag(list: Archetype[]): string[];

// Best-fit match of `text` (lowercased internally) against the user's archetypes.
// Rules:
//   - nameHits  = # of name words present in text.
//   - A match REQUIRES nameHits >= 1 (name gate). No name hit => not a candidate.
//   - coverage  = nameHits / min(nameWords.length, COV_CAP=6).
//   - sellHits  = # of sellWhen words present in text (light signal).
//   - rankScore = coverage + min(sellHits, 3) * SELL_W(0.05)  // tie-break only
//   - Winner: max TIER_RANK(primary3/secondary2/adjacent1), then max rankScore.
//   - Returns null when no archetype's name hits.
export function matchArchetype(text: string, list: Archetype[]): ArchetypeMatch | null;
```

Constants: `TIER_RANK = {primary:3, secondary:2, adjacent:1}`, `COV_CAP = 6`,
`SELL_W = 0.05`, `SELL_CAP = 3`. Stopword list mirrors the existing
`KEYWORD_STOPWORDS` (kept in core so client + tests agree).

## Discover wiring (`discover.component.ts` / `.html` / `.scss`)

- Replace `deriveKeywords(...)` with `archetypeKeywordBag(parseArchetypes(...))` -
  fixes the `[object Object]` bug; `profileKeywords` now holds real name words.
- Keep the parsed `Archetype[]` in a new signal `archetypes` (from `parseArchetypes`)
  so per-row matching has tier/sellWhen.
- `archetypeBadge(row): ArchetypeMatch | null` = `matchArchetype(row.title, archetypes())`.
  Feed rows only have the title (JD not loaded), consistent with `matchesProfile`.
- **For-you membership** becomes "has an archetype badge" (`archetypeBadge(row) != null`);
  `matchesProfile` reuses `archetypeBadge`. Honest and unifies section + badge.
- **Sort:** inside the For-you section, order by `TIER_RANK(fit)` desc, then
  `createdAt` desc. More section keeps recency order. Add a pure
  `compareByTierThenRecency` helper (kept trivial/local or in core if tested).
- **Score:** `computeRawScore` gains a tier boost from the open job's badge:
  `primary +12, secondary +6, adjacent +0` (from `badge.fit`). Clamp stays `20..97`.
  Still null when no archetypes. Deterministic. sellWhen's influence on score is
  indirect: it only affects which archetype wins the tie-break, hence which tier
  boost applies - it adds no separate score term (`matchArchetype` returns tier +
  coverage, not raw sellHits).
- **Badge UI:** a `<span class="dv-arch-badge dv-arch-badge--{fit}">` in the feed
  row title line (next to New/Saved, ~html:681) and in the detail hero title
  (~html:33). Three colors: primary (accent/strong), secondary (mid), adjacent
  (muted). Mirrors the comp-badge class pattern.

## i18n (`translations.ts`, EN + DE; ru/es/fr/uk inherit EN via stub)

New keys under `discover`:

- `arch_primary` -> EN "Primary role" / DE "Primäre Rolle"
- `arch_secondary` -> EN "Secondary role" / DE "Sekundäre Rolle"
- `arch_adjacent` -> EN "Adjacent role" / DE "Angrenzende Rolle"

`archBadgeLabel(fit)` maps fit -> key (mirrors `compBadgeLabel`).

## Testing

- **Core (`archetype.spec.ts`)**: `archetypeWords` tokenizing/stopwords/dedupe;
  `matchArchetype` - name gate (sellWhen alone => null), tie-break highest tier,
  tie-break coverage within same tier, no archetypes => null, coverage math.
- **Desktop**: keep green; add a focused test for `archetypeBadge`/sort ordering if
  the component exposes a testable seam (else rely on core + manual Tauri gate).

## Invariants

- Pure tested core helpers; no AI, 0 tokens; deterministic.
- Badge never misleads: name-gated match, strongest-tier wins.
- i18n EN + DE. Hyphen-only (no em/en dash).
- CHANGELOG + CURRENT_STATE synced on the way out (CURRENT_STATE is currently stale -
  fix its header to `main`/PR #136 state as part of the sync).

## Out of scope

- Rust scan-time matching / persistence / migration.
- Reworking the compensation badge (PR #136) or the aggregate skill dictionary.
- Multi-badge (showing more than one archetype per row).
