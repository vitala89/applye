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

/** Whole-word (boundary-aware) test for a lowercase keyword in lowercase text.
 * Mirrors the discover skill-detector so short/symbol tokens (c++, c#) match
 * as whole words, not substrings (so "data" does not hit "database"). */
export function wordHit(haystackLower: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystackLower);
}

/**
 * Best-fit archetype for `text`. A candidate REQUIRES at least one archetype-name
 * word to appear in the text (sellWhen alone never matches). Winner - strongest
 * tier, then highest rank (name coverage + a light sellWhen bonus). Null - no match.
 */
export function matchArchetype(text: string, list: Archetype[]): ArchetypeMatch | null {
  const hay = text.toLowerCase();
  let best: ArchetypeMatch | null = null;
  let bestTier = -1;
  let bestRank = -1;
  for (const a of list) {
    const nameWords = archetypeWords(a.name);
    if (!nameWords.length) continue;
    const nameHits = nameWords.filter((w) => wordHit(hay, w)).length;
    if (nameHits === 0) continue;
    const coverage = Math.min(1, nameHits / Math.min(nameWords.length, COV_CAP));
    const sellHits = archetypeWords(a.sellWhen).filter((w) => wordHit(hay, w)).length;
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
