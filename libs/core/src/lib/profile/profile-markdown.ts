import { parseCompensation, serializeCompensation } from './compensation-target';
export interface ProfileForm {
  /** The display name: the `# H1` of the markdown and the CV document's title.
   * Stays canonical. `firstName` and `lastName` are the structured parts that
   * generated documents and job-board autofill need; they sit beside it rather
   * than replacing it, so nothing that reads the H1 has to change. */
  name: string;
  firstName: string;
  lastName: string;
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
  /** Structured compensation target, folded into a `## Compensation` markdown
   * section. All strings mirror the form inputs; empty means unset. */
  compMin: string;
  compMax: string;
  compCurrency: string;
  compPeriod: string;
  /** Everything the parser recognised as content but could not place in a
   * field: a stray tagline under the name, a third website, a `- Xing: …` line
   * the contact block has no slot for. Re-emitted verbatim under `## Notes`.
   *
   * This is the whole safety net. Parsing a legacy profile is classification,
   * and classification without an overflow bucket deletes whatever it cannot
   * name - which is the bug this file exists to fix, since the form rewrites
   * `fullMd` wholesale on the first keystroke. Nothing may be dropped on the
   * floor: if it has no field, it goes here. */
  notes: string;
  other: string;
}

export type ProfileFieldKey =
  'title' | 'location' | 'experience' | 'skills' | 'education' | 'languages';

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
  firstName: '',
  lastName: '',
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
  compMin: '',
  compMax: '',
  compCurrency: '',
  compPeriod: '',
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
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
];

type ContactKey =
  'firstName' | 'lastName' | 'location' | 'email' | 'phone' | 'website' | 'linkedin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d[\d\s()./-]{5,}$/;
const LINKEDIN_RE = /linkedin\.com/i;
/** The whole token must look like a URL - not merely contain something
 * dot-suffixed. An earlier cut matched any token ending in `.xx`, which ate
 * `Growth Lead @ acme.io` and `Senior Data Scientist, M.Sc` whole and left the
 * title empty. Hence: no spaces, and a lowercase host (`M.Sc` keeps its
 * capital and stays prose). Known and accepted: a header token that is exactly
 * `Node.js` still reads as a website - inside any longer title it is safe,
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
 * read as `Title · Location` - the phone landed in "Current role" and the
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
    // A `#` line is the name slot even when it is empty - that is what stops a
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
    else if (s.heading === 'compensation') {
      const c = parseCompensation(body);
      form.compMin = c.min;
      form.compMax = c.max;
      form.compCurrency = c.currency;
      form.compPeriod = c.period;
    } else other.push([s.raw, ...s.body].join('\n').trim());
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
  const comp = serializeCompensation({
    min: f.compMin,
    max: f.compMax,
    currency: f.compCurrency,
    period: f.compPeriod,
  });
  if (comp) parts.push(`## Compensation\n${comp}`);
  // Under a heading, never as a bare block: a loose line here would be read
  // back as the body of whichever section happened to be serialized last.
  if (f.notes.trim()) parts.push(`## Notes\n${f.notes.trim()}`);
  if (f.other.trim()) parts.push(f.other.trim());
  return parts.join('\n\n') + '\n';
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
  // The closing fence is matched without a leading `\s*` - that made the regex
  // quadratic on a long run of whitespace, and the `.trim()` below removes the
  // same whitespace anyway (CodeQL js/polynomial-redos).
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as ScoringProfile) : null;
  } catch {
    return null;
  }
}
