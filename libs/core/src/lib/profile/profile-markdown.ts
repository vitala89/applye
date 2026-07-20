export interface ProfileForm {
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  website: string;
  linkedin: string;
  experienceText: string;
  skills: string[];
  education: string;
  languages: string[];
  /** Everything the parser recognised as content but could not place in a
   * field: a stray tagline under the name, a third website, a `- Xing: …` line
   * the contact block has no slot for. Re-emitted verbatim under `## Notes`.
   *
   * This is the whole safety net. Parsing a legacy profile is classification,
   * and classification without an overflow bucket deletes whatever it cannot
   * name — which is the bug this file exists to fix, since the form rewrites
   * `fullMd` wholesale on the first keystroke. Nothing may be dropped on the
   * floor: if it has no field, it goes here. */
  notes: string;
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
  email: '',
  phone: '',
  website: '',
  linkedin: '',
  experienceText: '',
  skills: [],
  education: '',
  languages: [],
  notes: '',
  other: '',
};

/** The contact fields, in the order the `## Contact` section writes them.
 * The label is the serialized form; parsing matches it case-insensitively.
 *
 * Location lives here rather than on a `Title · Location` line because that
 * line is positional: with no title, the location slid into the title slot.
 * A label cannot slide. The legacy line is still read (see `parseProfileMd`),
 * just never written. */
const CONTACT_FIELDS: { key: ContactKey; label: string }[] = [
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
];

type ContactKey = 'location' | 'email' | 'phone' | 'website' | 'linkedin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d[\d\s()./-]{5,}$/;
const LINKEDIN_RE = /linkedin\.com/i;
/** The whole token must look like a URL — not merely contain something
 * dot-suffixed. An earlier cut matched any token ending in `.xx`, which ate
 * `Growth Lead @ acme.io` and `Senior Data Scientist, M.Sc` whole and left the
 * title empty. Hence: no spaces, and a lowercase host (`M.Sc` keeps its
 * capital and stays prose). Known and accepted: a header token that is exactly
 * `Node.js` still reads as a website — inside any longer title it is safe,
 * because the spaces disqualify the token. */
const URL_RE = /^(https?:\/\/|www\.)\S+$|^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/\S*)?$/;

function splitList(body: string): string[] {
  return body
    .split(/[,\n]/)
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

/** `_Senior Engineer_` / `*Senior Engineer*` → `Senior Engineer`. Onboarding
 * used to italicise the title line; the form must read it back as a title. */
function stripEmphasis(line: string): string {
  const m = /^_(.+)_$/.exec(line) ?? /^\*(.+)\*$/.exec(line);
  return m ? m[1].trim() : line;
}

function classifyContactToken(token: string): ContactKey {
  if (EMAIL_RE.test(token)) return 'email';
  if (LINKEDIN_RE.test(token)) return 'linkedin';
  if (PHONE_RE.test(token)) return 'phone';
  if (URL_RE.test(token)) return 'website';
  return 'location';
}

/** A middot-joined header line is a contact line as soon as one token is
 * unmistakably a contact (an address alone stays a location, so a legacy
 * `Title · Berlin` line is never mistaken for one). */
function isContactLine(line: string): boolean {
  return line.split(/\s+·\s+/).some((tok) => classifyContactToken(tok.trim()) !== 'location');
}

/** Legacy shape: onboarding wrote every contact into one middot-joined header
 * line (`email · phone · address · website · linkedin`), which the old parser
 * read as `Title · Location` — the phone landed in "Current role" and the
 * website and LinkedIn were dropped on the next save. Recover by classifying
 * each token instead of trusting its position, and spill whatever has no free
 * slot into `notes` rather than on the floor. */
function absorbContactLine(form: ProfileForm, line: string, notes: string[]): void {
  const prose: string[] = [];
  for (const raw of line.split(/\s+·\s+/)) {
    const token = raw.trim();
    if (!token) continue;
    const key = classifyContactToken(token);
    if (key === 'location') prose.push(token);
    else if (!form[key]) form[key] = token;
    else notes.push(token);
  }
  // A lone prose token beside real contacts is an address (`… · Nuremberg ·
  // …`). Two or more read the way the header always read: `Title · Location`.
  if (prose.length > 1 && !form.title) form.title = prose.shift() as string;
  if (prose.length && !form.location) form.location = prose.shift() as string;
  notes.push(...prose);
}

function parseContactSection(form: ProfileForm, body: string, notes: string[]): void {
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^[-*]\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/.exec(line);
    const field = m && CONTACT_FIELDS.find((c) => c.label.toLowerCase() === m[1].toLowerCase());
    // `- GitHub: …`, `- Personal website: …`, a free-text line: no slot, but
    // the user wrote it under a heading this app now invites them to edit.
    if (field) form[field.key] = m[2].trim();
    else notes.push(line);
  }
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

  const notes: string[] = [];
  let nameSeen = false;
  let titleSeen = false;
  for (const rawLine of header) {
    const heading = /^#/.test(rawLine.trim());
    const line = stripEmphasis(rawLine.replace(/^#+\s*/, '').trim());
    // A `#` line is the name slot even when it is empty — that is what stops a
    // nameless profile from promoting its title into the name on the next read.
    if (heading && !nameSeen) {
      nameSeen = true;
      form.name = line;
      continue;
    }
    if (!line) continue;
    if (isContactLine(line)) {
      absorbContactLine(form, line, notes);
      continue;
    }
    if (!nameSeen) {
      nameSeen = true;
      form.name = line;
      continue;
    }
    if (!titleSeen) {
      titleSeen = true;
      // Split on the spaced middot the serializer emits, so a title that itself
      // contains a bare "·" is not shredded into the location field.
      const parts = line.split(/\s+·\s+/).map((s) => s.trim());
      form.title = parts[0];
      const loc = parts.slice(1).join(' · ');
      if (loc) {
        if (form.location) notes.push(loc);
        else form.location = loc;
      }
      continue;
    }
    notes.push(line);
  }

  const other: string[] = [];
  for (const s of sections) {
    const body = s.body.join('\n').trim();
    if (s.heading === 'contact') parseContactSection(form, body, notes);
    else if (s.heading === 'notes') notes.push(body);
    else if (s.heading === 'experience') form.experienceText = body;
    else if (s.heading === 'skills') form.skills = splitList(body);
    else if (s.heading === 'education') form.education = body;
    else if (s.heading === 'languages') form.languages = splitList(body);
    else other.push([s.raw, ...s.body].join('\n').trim());
  }
  form.notes = notes.filter(Boolean).join('\n').trim();
  form.other = other.join('\n\n').trim();
  return form;
}

export function serializeProfileForm(f: ProfileForm): string {
  const parts: string[] = [];
  // Always emit the `#` line, even nameless: it holds the name slot open so a
  // re-read cannot mistake the title for the name.
  const headLines = [`# ${f.name}`.trimEnd()];
  if (f.title.trim()) headLines.push(f.title.trim());
  parts.push(headLines.join('\n'));
  const contact = CONTACT_FIELDS.filter((c) => f[c.key].trim()).map(
    (c) => `- ${c.label}: ${f[c.key].trim()}`,
  );
  if (contact.length) parts.push(`## Contact\n${contact.join('\n')}`);
  if (f.experienceText.trim()) parts.push(`## Experience\n${f.experienceText.trim()}`);
  if (f.skills.length) parts.push(`## Skills\n${f.skills.join(', ')}`);
  if (f.education.trim()) parts.push(`## Education\n${f.education.trim()}`);
  if (f.languages.length) parts.push(`## Languages\n${f.languages.join(', ')}`);
  // Under a heading, never as a bare block: a loose line here would be read
  // back as the body of whichever section happened to be serialized last.
  if (f.notes.trim()) parts.push(`## Notes\n${f.notes.trim()}`);
  if (f.other.trim()) parts.push(f.other.trim());
  return parts.join('\n\n') + '\n';
}

/** One education / certificate entry as edited in the structured profile UI.
 * Persisted inside the `## Education` markdown body (one line each), so
 * `ProfileForm.education` stays a plain string and nothing downstream needs a
 * new field. Degrees and certificates share this shape — the distinction is
 * just what the user types as `title`. */
export interface EducationEntry {
  /** Degree, programme, or certificate name (e.g. "BSc Computer Science",
   * "AWS Solutions Architect"). */
  title: string;
  /** Institution or provider (e.g. "MIT", "Coursera"). Optional. */
  institution: string;
  /** Free-text start, e.g. "2015" or "Sep 2015". Optional. */
  startDate: string;
  /** Free-text end, e.g. "2019"; empty means ongoing (renders "Present"). */
  endDate: string;
}

// en dash (U+2013) / em dash (U+2014) via char codes so no dash glyph appears
// in source (house rule: hyphen-only in the repo).
const EDU_RANGE_SEP = new RegExp(
  `\\s*(?:-|[${String.fromCharCode(0x2013, 0x2014)}]|to|bis)\\s*`,
  'i',
);

export const EMPTY_EDUCATION_ENTRY: EducationEntry = {
  title: '',
  institution: '',
  startDate: '',
  endDate: '',
};

/** Parses the `## Education` body into structured entries, one per non-empty
 * line. Lenient and lossless: a line that does not match the canonical
 * "Title, Institution (start - end)" shape keeps whatever it has (a legacy
 * free-text line becomes an entry with just a `title`), so nothing is dropped
 * when an older profile is opened in the structured editor. */
export function parseEducationEntries(education: string): EducationEntry[] {
  return (education || '')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      let startDate = '';
      let endDate = '';
      let head = line;
      const paren = /\(([^)]*)\)\s*$/.exec(line);
      if (paren) {
        head = line.slice(0, paren.index).trim();
        const range = paren[1].split(EDU_RANGE_SEP).map((s) => s.trim());
        startDate = range[0] ?? '';
        const rawEnd = range[1] ?? '';
        endDate = /^(present|current|now|heute|jetzt|aktuell)$/i.test(rawEnd) ? '' : rawEnd;
      }
      head = head.replace(/,\s*$/, '');
      const comma = head.lastIndexOf(', ');
      const title = comma >= 0 ? head.slice(0, comma).trim() : head;
      const institution = comma >= 0 ? head.slice(comma + 2).trim() : '';
      return { title, institution, startDate, endDate };
    });
}

/** Serializes structured entries back into the `## Education` body: one
 * "- Title, Institution (start - end)" line each. Inverse of
 * `parseEducationEntries` for well-formed entries; fully blank entries are
 * dropped. */
export function serializeEducationEntries(entries: EducationEntry[]): string {
  return entries
    .map((e) => {
      const head = [e.title.trim(), e.institution.trim()].filter(Boolean).join(', ');
      const start = e.startDate.trim();
      const end = e.endDate.trim();
      let range = '';
      if (start && end) range = ` (${start} - ${end})`;
      else if (start) range = ` (${start} - Present)`;
      else if (end) range = ` (${end})`;
      return `${head}${range}`.trim();
    })
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join('\n');
}

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
const EXP_RANGE_SEP = new RegExp(
  `\\s*(?:-|[${String.fromCharCode(0x2013, 0x2014)}]|to|bis)\\s*`,
  'i',
);
const DATE_TOKEN_RE = /\d/; // a date token contains at least one digit

function looksLikeDateRange(token: string): boolean {
  return DATE_TOKEN_RE.test(token);
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
          const [s, e] = tok.split(EXP_RANGE_SEP).map((x) => x.trim());
          current.startDate = s ?? '';
          current.endDate = /^(present|current|now|heute|jetzt|aktuell)$/i.test(e ?? '')
            ? ''
            : (e ?? '');
        } else if (!current.location) {
          current.location = tok;
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
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as ScoringProfile) : null;
  } catch {
    return null;
  }
}
