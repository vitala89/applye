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
