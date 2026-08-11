/**
 * Reading what an AI skill actually returned.
 *
 * Every function here takes untrusted model output and has to end with either a
 * usable value or a real error - never a silent empty draft, which is the
 * failure the user cannot tell from "the model had nothing to say". Fences are
 * stripped, a response truncated mid-value is repaired when it can be, and
 * invalid JSON throws with the raw text so the caller can show it.
 *
 * Split out of `cv-content.util.ts`, which was 829 lines against a 400 budget
 * and held this next to the CV content model itself. The two change on
 * different occasions: this file changes when a model starts wrapping its
 * answer a new way, the content model when the CV gains a field. Its tests were
 * already named `cv-parse.util.spec.ts`, a file that had been testing a module
 * that did not exist yet.
 */

import { CoverLetterContent, CvParsedContent } from '../models/document.model';
import { splitDisplayName } from '../profile/split-display-name';

/** Parses a skill response (JSON, possibly fenced) that is either a single
 * object (`cv-import`/`cv-generate-baseline`/cover-letter skills) or a JSON
 * array (interview-prep skills, which return a list of cards). Throws with
 * the raw text on invalid JSON so the caller can surface a real error
 * instead of a silent empty draft. */
export function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const braceIdx = cleaned.indexOf('{');
  const bracketIdx = cleaned.indexOf('[');
  const isArray = bracketIdx !== -1 && (braceIdx === -1 || bracketIdx < braceIdx);
  const startIdx = isArray ? bracketIdx : braceIdx;
  const endIdx = isArray ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  if (cleaned.startsWith('`')) cleaned = cleaned.substring(1);
  if (cleaned.endsWith('`')) cleaned = cleaned.substring(0, cleaned.length - 1);
  return cleaned.trim();
}

/** Closes any open string and open braces/brackets of `s`, or returns null if
 * `s` ends on a separator/colon that cannot be closed into valid JSON. */
function closeOpenStructures(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (!stack.length) return null;
      stack.pop();
    }
  }
  let out = s.replace(/\s+$/, '');
  if (!inStr && /[,:]$/.test(out)) return null; // dangling separator outside a string
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Best-effort recovery of a JSON object from a response truncated mid-value
 * (an output-token cap cutting the model off). Trims from the end to the
 * longest prefix that becomes valid once open strings/brackets are closed.
 * Pure, never throws, bounded to the input length. Returns a parseable JSON
 * string or null. */
export function repairTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const body = raw.slice(start);
  try {
    JSON.parse(body);
    return body;
  } catch {
    // fall through to trim-and-close
  }
  for (let end = body.length; end > 0; end--) {
    const closed = closeOpenStructures(body.slice(0, end));
    if (closed === null) continue;
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      // keep trimming
    }
  }
  return null;
}

/**
 * `JSON.parse` succeeds on plenty of things that are not a CV: an array, a
 * number, and - the one that actually happens - a bare JSON string, which is
 * what a model produces when it answers `"I could not read this CV"` in the
 * JSON the prompt asked for. Every one of those used to sail through as a
 * `Partial<CvParsedContent>` with no keys, and the caller wrote an empty draft
 * that the user cannot tell apart from a CV the model found nothing in. Only a
 * plain object counts; anything else is treated as unparsed, which sends it to
 * the repair pass and then to the throw.
 */
function tryParseParsed(s: string): Partial<CvParsedContent> | null {
  try {
    const value: unknown = JSON.parse(s);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as Partial<CvParsedContent>;
  } catch {
    return null;
  }
}

export function parseCvSkillResponse(text: string): CvParsedContent {
  const raw = cleanJsonText(text);
  let parsed = tryParseParsed(raw);
  if (!parsed) {
    const repaired = repairTruncatedJson(raw);
    if (repaired) parsed = tryParseParsed(repaired);
  }
  if (!parsed) {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  const p: Partial<CvParsedContent['personalDetails']> = parsed.personalDetails ?? {};
  // The AI is asked for the split, but a provider that ignores the new keys
  // must not leave the fields empty: a derived split is better than none, and
  // `nameSplitConfident` is what tells the review step to ask about it.
  // `||` rather than `??` on the parts: models routinely answer "nothing here"
  // with `""`, and an empty string that survives here reaches the write path as
  // a name that overwrites the parsed display name with nothing.
  const derived = splitDisplayName(p.fullName ?? '');
  return {
    personalDetails: {
      fullName: p.fullName ?? null,
      firstName:
        (typeof p.firstName === 'string' ? p.firstName.trim() : '') || derived.firstName || null,
      lastName:
        (typeof p.lastName === 'string' ? p.lastName.trim() : '') || derived.lastName || null,
      // Only a real boolean is trusted, so an explicit `false` still wins over
      // the derived guess while a stray string or null falls back to it.
      nameSplitConfident:
        typeof p.nameSplitConfident === 'boolean' ? p.nameSplitConfident : derived.confident,
      title: p.title ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      address: p.address ?? null,
      website: p.website ?? null,
      linkedin: p.linkedin ?? null,
    },
    summary: parsed.summary ?? null,
    experience: parsed.experience ?? [],
    education: parsed.education ?? [],
    skills: parsed.skills ?? [],
    skillGroups: parsed.skillGroups,
    languages: parsed.languages ?? [],
    lowConfidenceNotes: parsed.lowConfidenceNotes ?? [],
  };
}

/**
 * Reads a cover-letter skill's answer. The letter is applied field by field by
 * the caller, so an answer that fills only some blocks is legitimate and the
 * result is deliberately partial.
 *
 * **It throws rather than returning an empty letter.** `CoverLetterGenerateStore`
 * turns that throw into its `bad-json` outcome, which is the sentence the user
 * reads; a silent `{}` would populate the editor with nothing and look like a
 * model that had nothing to say.
 *
 * A truncated answer is **not** repaired here, unlike `parseCvSkillResponse`.
 * That is the behaviour the page's own parse had before this function existed,
 * and changing it would change what the user sees on a cut-off answer - a
 * decision of its own, not a rider on moving the parse into this layer.
 */
export function parseCoverLetterResponse(text: string): Partial<CoverLetterContent> {
  const value: unknown = JSON.parse(cleanJsonText(text));
  // An array or a bare scalar parses fine and then lies its way through the
  // cast, reaching the editor as a letter with no fields rather than as the
  // failure it is.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  return value as Partial<CoverLetterContent>;
}

export interface CvGapQuestion {
  id: string;
  category: 'skill' | 'experience' | 'language' | 'other';
  question: string;
  hint: string | null;
}

export interface CvGapAnswer {
  id: string;
  question: string;
  answer: string;
}

const GAP_CATEGORIES = ['skill', 'experience', 'language', 'other'] as const;

/** Parses the `cv-gap-analysis` skill response into at most 5 questions.
 * Fail-open: any malformed output yields `[]` so a bad analysis never blocks
 * CV generation. */
export function parseCvGapResponse(text: string): CvGapQuestion[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(cleanJsonText(text));
  } catch {
    const repaired = repairTruncatedJson(cleanJsonText(text));
    if (repaired) {
      try {
        raw = JSON.parse(repaired);
      } catch {
        return [];
      }
    }
  }
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const out: CvGapQuestion[] = [];
  for (const item of list) {
    const q = item as Partial<CvGapQuestion>;
    if (typeof q?.id !== 'string' || typeof q?.question !== 'string') continue;
    const category = GAP_CATEGORIES.includes(q.category as never)
      ? (q.category as CvGapQuestion['category'])
      : 'other';
    out.push({
      id: q.id,
      category,
      question: q.question,
      hint: typeof q.hint === 'string' ? q.hint : null,
    });
    if (out.length === 5) break;
  }
  return out;
}

/** Assembles the answered gap items into a markdown block appended to the CV
 * text before parsing. Empty answers are dropped; returns '' when nothing was
 * answered so callers can skip the append entirely. */
export function buildAdditionalInfoBlock(answers: CvGapAnswer[]): string {
  const lines = answers
    .filter((a) => a.answer.trim().length > 0)
    .map((a) => `- ${a.question}: ${a.answer.trim()}`);
  return lines.length ? `## Additional information\n${lines.join('\n')}` : '';
}

/** Parses a free-text employment-date answer into a `{ startDate, endDate }`
 * pair. Accepts the ranges the date-gap dialog hints at: "Jan 2021 - Present",
 * "2019 to 2021", en/em-dash ranges ("2019" glyph "2021"), plus a lone start
 * ("March 2020"). A "present"/"current" (and common DE synonyms) or a missing
 * second half leaves `endDate` empty, which the CV renders as "Present". Pure
 * and fail-soft: an unparseable answer returns the whole string as `startDate`,
 * never throws. A plain hyphen only splits when spaced (so an internal
 * "01-2021" is preserved), while a dash glyph splits with or without spaces. */
export function parseDateAnswer(answer: string): { startDate: string; endDate: string } {
  const text = (answer ?? '').trim();
  if (!text) return { startDate: '', endDate: '' };
  // en dash (U+2013) / em dash (U+2014) built from char codes so no dash glyph
  // ever appears in source (house rule: hyphen-only in the repo).
  const dashes = String.fromCharCode(0x2013, 0x2014);
  const sep = new RegExp(`(?:\\s+-\\s+|\\s*[${dashes}]\\s*|\\s+(?:to|bis|until)\\s+)`, 'i');
  const parts = text.split(sep);
  const startDate = (parts[0] ?? '').trim();
  const endRaw = (parts[1] ?? '').trim();
  const isPresent = /^(present|current|now|ongoing|heute|jetzt|aktuell)$/i.test(endRaw);
  return { startDate, endDate: isPresent ? '' : endRaw };
}
