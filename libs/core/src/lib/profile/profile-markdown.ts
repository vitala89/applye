export interface ProfileForm {
  name: string;
  title: string;
  location: string;
  experienceText: string;
  skills: string[];
  education: string;
  languages: string[];
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
  title: '',
  location: '',
  experienceText: '',
  skills: [],
  education: '',
  languages: [],
  other: '',
};

function splitList(body: string): string[] {
  return body
    .split(/[,\n]/)
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
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

  const headerLines = header.map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
  if (headerLines.length > 0) form.name = headerLines[0];
  if (headerLines.length > 1) {
    const rest = headerLines[1];
    const parts = rest.split('·').map((s) => s.trim());
    if (parts.length > 1) {
      form.title = parts[0];
      form.location = parts.slice(1).join(' · ');
    } else {
      form.title = rest;
    }
  }

  const other: string[] = [];
  for (const s of sections) {
    const body = s.body.join('\n').trim();
    if (s.heading === 'experience') form.experienceText = body;
    else if (s.heading === 'skills') form.skills = splitList(body);
    else if (s.heading === 'education') form.education = body;
    else if (s.heading === 'languages') form.languages = splitList(body);
    else other.push([s.raw, ...s.body].join('\n').trim());
  }
  form.other = other.join('\n\n').trim();
  return form;
}

export function serializeProfileForm(f: ProfileForm): string {
  const parts: string[] = [];
  const head = `# ${f.name}`.trimEnd();
  const titleLoc = [f.title, f.location].filter((s) => s.trim()).join(' · ');
  parts.push(titleLoc ? `${head}\n${titleLoc}` : head);
  if (f.experienceText.trim()) parts.push(`## Experience\n${f.experienceText.trim()}`);
  if (f.skills.length) parts.push(`## Skills\n${f.skills.join(', ')}`);
  if (f.education.trim()) parts.push(`## Education\n${f.education.trim()}`);
  if (f.languages.length) parts.push(`## Languages\n${f.languages.join(', ')}`);
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
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === 'object' ? (obj as ScoringProfile) : null;
  } catch {
    return null;
  }
}
