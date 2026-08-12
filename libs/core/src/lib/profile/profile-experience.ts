/** Split out of `profile-markdown.ts` when it passed its 400-line budget.
 * One `## section` of the profile document, parsed and serialised. */

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
// The start/end separator as the serializer writes it: a SPACED hyphen (or
// en/em dash), or the words "to"/"bis". Spaces are REQUIRED so a bare hyphen
// inside an ISO date ("2020-01") is never mistaken for the range separator.
const EXP_RANGE_SEP = new RegExp(
  `\\s+(?:-|[${String.fromCharCode(0x2013, 0x2014)}]|to|bis)\\s+`,
  'i',
);
// A meta token is a date (range) when it carries a 4-digit year or an
// ongoing-marker word. "District 5" / "Berlin 10115" stay locations.
const DATE_LIKE_RE = /\b(?:19|20)\d{2}\b|present|current|now|heute|jetzt|aktuell/i;

function looksLikeDateRange(token: string): boolean {
  return DATE_LIKE_RE.test(token);
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
          const m = EXP_RANGE_SEP.exec(tok);
          const s = m ? tok.slice(0, m.index).trim() : tok.trim();
          const e = m ? tok.slice(m.index + m[0].length).trim() : '';
          current.startDate = s;
          current.endDate = /^(present|current|now|heute|jetzt|aktuell)$/i.test(e) ? '' : e;
        } else {
          current.location = current.location ? `${current.location} · ${tok}` : tok;
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
