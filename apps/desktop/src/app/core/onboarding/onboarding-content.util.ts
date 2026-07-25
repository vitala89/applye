import type {
  CvParsedContent,
  CvParsedEducationEntry,
  CvParsedLanguageEntry,
  CvTemplate,
  SupportedLanguage,
  UpsertDocumentLibraryItemInput,
} from '@applye/core';
import { serializeEducationEntries, serializeLanguageEntries } from '@applye/core';
import { buildCvContent } from '../../pages/documents/cv-content.util';

// structurally compatible subset of CvParsedContent
export interface ParsedCv {
  personalDetails?: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    nameSplitConfident?: boolean;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    linkedin?: string | null;
  } | null;
  summary?: string | null;
  experience?: { company: string; role: string; bullets?: string[] }[] | null;
  skills?: string[] | null;
  education?: CvParsedEducationEntry[] | null;
  languages?: CvParsedLanguageEntry[] | null;
}

/** Writes the exact shape `parseProfileMd` reads. These two used to disagree:
 * the title was italicised and every contact was crushed into one middot-joined
 * line, which the profile form read back as `Title · Location` - so the phone
 * showed up as the user's current role and the website and LinkedIn were gone
 * the first time they pressed Save. Keep the two in lockstep; the round-trip
 * test in `profile-markdown.spec.ts` is what holds them there. */
export function cvToProfileMarkdown(cv: ParsedCv): string {
  const out: string[] = [];
  const name = cv.personalDetails?.fullName?.trim();
  const title = cv.personalDetails?.title?.trim();
  if (title) out.push(title);
  // The labels and their order must match CONTACT_FIELDS in profile-markdown.ts:
  // this writer and parseProfileMd are held in lockstep only by the round-trip
  // test below it, so a label typo here silently drops the field on read.
  const contact = (
    [
      ['First name', cv.personalDetails?.firstName],
      ['Last name', cv.personalDetails?.lastName],
      ['Location', cv.personalDetails?.address],
      ['Email', cv.personalDetails?.email],
      ['Phone', cv.personalDetails?.phone],
      ['Website', cv.personalDetails?.website],
      ['LinkedIn', cv.personalDetails?.linkedin],
    ] as const
  )
    .filter(([, v]) => v?.trim())
    .map(([label, v]) => `- ${label}: ${v?.trim()}`);
  if (contact.length) out.push('', '## Contact', ...contact);
  if (cv.summary?.trim()) out.push('', '## Summary', cv.summary.trim());
  if (cv.experience?.length) {
    out.push('', '## Experience');
    for (const e of cv.experience) {
      // Role and company are joined with a spaced HYPHEN, exactly what
      // parseExperienceEntries splits the `### ` header on. The old em dash
      // never matched, so the profile editor read the whole "Role - Company"
      // string as the role and left Company empty.
      const head = [e.role?.trim(), e.company?.trim()].filter(Boolean).join(' - ');
      out.push('', `### ${head}`);
      for (const b of e.bullets ?? []) out.push(`- ${b}`);
    }
  }
  if (cv.skills?.length) out.push('', '## Skills', cv.skills.join(', '));
  if (cv.education?.length) {
    // Reuse the profile serializer so the body matches exactly what
    // `parseProfileMd` reads back (dropping "Present" for dateless entries).
    const eduBody = serializeEducationEntries(
      cv.education.map((e) => ({
        title: e.degree?.trim() ?? '',
        institution: e.institution?.trim() ?? '',
        startDate: e.startDate?.trim() ?? '',
        endDate: e.endDate?.trim() ?? '',
      })),
    );
    if (eduBody) out.push('', '## Education', eduBody);
  }
  if (cv.languages?.length) {
    const langs = serializeLanguageEntries(
      cv.languages.map((l) => ({
        language: l.language?.trim() ?? '',
        level: l.level?.trim() ?? '',
      })),
    );
    if (langs.length) out.push('', '## Languages', langs.join(', '));
  }
  // A parse that yielded nothing stays nothing: callers read an empty string as
  // "there is no profile to save", so a lone `#` here would write an empty
  // profile over a real one.
  if (!name && !out.length) return '';
  // Otherwise the `#` line is always written, even nameless - it holds the name
  // slot, and without it `parseProfileMd` reads the title as the user's name.
  return [`# ${name ?? ''}`.trimEnd(), ...out].join('\n').trim();
}

/** Folds the user-edited compensation range into the profile markdown so it
 * survives `saveProfile()`. The heading MUST be `## Compensation` (not
 * `## Compensation Target`): `parseProfileMd` only reads `compensation`, so the
 * old heading meant the target was written but never shown back in the profile.
 * Pass a body `serializeCompensation` produced so the round-trip holds.
 * Pure/no-op on blank input. */
export function appendCompensation(md: string, compBody: string): string {
  const body = compBody.trim();
  if (!body) return md;
  return `${md}\n\n## Compensation\n${body}`.trim();
}

/** The wizard has no region selector - a first-run flow pays for every extra
 * choice in drop-off - so the starting region template follows the UI
 * language. Documents stays the place to switch template afterwards. */
export function regionTagForUiLanguage(uiLanguage: string | null | undefined): string {
  return uiLanguage?.toLowerCase().startsWith('de') ? 'de' : 'generic';
}

/** Same fallback chain the Documents import uses: exact region match, else
 * whatever the seeded list offers first, else no template at all (in which
 * case `buildCvContent` falls back to the default section order). */
export function pickCvTemplate(templates: CvTemplate[], regionTag: string): CvTemplate | null {
  return templates.find((tpl) => tpl.regionTag === regionTag) ?? templates[0] ?? null;
}

export interface OnboardingCvOverrides {
  /** The review step edits the parts, never the display name. The display name
   * is composed from them only when the user actually edited one - see
   * `applyContactOverrides`. */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  /** The display name exactly as the resume carried it. Kept as-is unless the
   * user edited a part, so a family-name-first name is not reordered. */
  parsedFullName: string;
  /** The review step's `nameEdited` signal: true once the user touched either
   * name field. */
  nameEdited: boolean;
}

/** The review step seeds its inputs from the parse, so a blank field means the
 * user *deleted* what we parsed - not "supplied nothing". Both artifacts the
 * wizard writes (profile markdown and CV document) resolve the review fields
 * through here, so a phone cleared for privacy cannot survive in one of them. */
export function applyContactOverrides(overrides: OnboardingCvOverrides): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
} {
  const firstName = overrides.firstName.trim();
  const lastName = overrides.lastName.trim();
  // Composing unconditionally reorders every family-name-first name: the review
  // step asks the user to confirm `Kim Minjun` split into Minjun/Kim, they agree
  // without editing, and the profile H1 would come back "Minjun Kim". So the
  // composition only applies once the user actually edited a part; otherwise the
  // resume's own display name stands, and the composition is only a fallback for
  // a parse that carried no display name at all.
  const composed = [firstName, lastName].filter(Boolean).join(' ');
  const parsedFullName = overrides.parsedFullName.trim();
  return {
    fullName: (overrides.nameEdited ? composed : parsedFullName || composed) || null,
    firstName: firstName || null,
    lastName: lastName || null,
    email: overrides.email.trim() || null,
    phone: overrides.phone.trim() || null,
    address: overrides.address.trim() || null,
  };
}

export interface OnboardingCvInputArgs {
  parsed: CvParsedContent;
  /** The review step's edited contact fields. They replace the parsed values
   * outright - including when blank, see `applyContactOverrides`. */
  overrides: OnboardingCvOverrides;
  templates: CvTemplate[];
  regionTag: string;
  language: SupportedLanguage;
  fallbackLabel: string;
  /** Present only for the upload path; the paste path has no source file to
   * hash. Drives the Documents import's duplicate guard. */
  inputHash?: string;
}

/** Turns the resume the wizard already parsed into a real CV document, so the
 * user leaves onboarding with an editable CV instead of re-importing the same
 * file in Documents. Mirrors the shape `cv-list`'s `confirmImport` writes. */
export function buildOnboardingCvInput(
  args: OnboardingCvInputArgs,
): UpsertDocumentLibraryItemInput {
  const { parsed, overrides, templates, regionTag, language, fallbackLabel, inputHash } = args;
  const template = pickCvTemplate(templates, regionTag);
  const merged: CvParsedContent = {
    ...parsed,
    personalDetails: { ...parsed.personalDetails, ...applyContactOverrides(overrides) },
  };
  return {
    docType: 'cv',
    source: 'uploaded',
    label: merged.personalDetails.fullName?.trim() || fallbackLabel,
    contentJson: JSON.stringify(buildCvContent(merged, template)),
    templateId: template?.id,
    // Follow the template actually chosen, not the one requested: when the
    // exact-region lookup misses, the row must not claim a region its template
    // does not have.
    regionTag: template?.regionTag ?? regionTag,
    language,
    inputHash,
  };
}

/** Mirrors the Documents import's duplicate guard: the same source file, once.
 * Only the upload path can be guarded - pasted text carries no hash, so
 * deliberately re-running the wizard and pasting the same resume writes a
 * second CV. Accepted: re-entry is an explicit action from Settings, and
 * Documents can delete the extra. */
export function hasCvForInputHash(
  existing: { source: string; inputHash?: string }[],
  inputHash: string | undefined,
): boolean {
  if (!inputHash) return false;
  return existing.some((item) => item.source === 'uploaded' && item.inputHash === inputHash);
}

export function parseArchetypesSkillResponse(text: string): {
  archetypes: string[];
  compRange: string | null;
} {
  const empty = { archetypes: [] as string[], compRange: null as string | null };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const obj = JSON.parse(match[0]) as { archetypes?: unknown; compRange?: unknown };
    const archetypes = Array.isArray(obj.archetypes)
      ? obj.archetypes.filter((x): x is string => typeof x === 'string')
      : [];
    const compRange = typeof obj.compRange === 'string' ? obj.compRange : null;
    return { archetypes, compRange };
  } catch {
    return empty;
  }
}

export interface CompRange {
  currency: string;
  min: number;
  max: number;
}

const DEFAULT_COMP_RANGE: CompRange = { currency: 'USD', min: 80, max: 120 };

/** Best-effort extraction of a currency + two numbers from a free-text AI
 * suggestion (e.g. "EUR 90-120K", or "$140k" and "$190k" separated by any dash
 * character the model chose) so the two numeric
 * min/max inputs can be pre-filled. Never throws; falls back to a sane
 * default range when nothing parseable is found. */
export function parseCompRange(text: string | null | undefined): CompRange {
  if (!text) return { ...DEFAULT_COMP_RANGE };
  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length < 1) return { ...DEFAULT_COMP_RANGE };
  const min = parseInt(numbers[0], 10);
  const max = numbers.length > 1 ? parseInt(numbers[1], 10) : min;
  const currencyMatch = text.match(/[A-Z]{3}|\$|€|£/);
  const currency = currencyMatch ? currencyMatch[0] : DEFAULT_COMP_RANGE.currency;
  return { currency, min, max: max >= min ? max : min };
}

/** Renders a min/max compensation range back into the free-text format
 * `appendCompensation` expects. Pure inverse of `parseCompRange` for the
 * common case (does not need to round-trip exactly). */
export function formatCompRange(range: CompRange): string {
  const symbol = range.currency.length === 1 ? range.currency : `${range.currency} `;
  return `${symbol}${range.min}K - ${symbol}${range.max}K`;
}

export const CURRENCY_OPTIONS = ['USD', 'EUR'] as const;
export type CurrencyOption = (typeof CURRENCY_OPTIONS)[number];

/** Maps a free-text/symbol currency (from an AI suggestion or a stray
 * parse) onto one of the app's selectable currency codes, so the currency
 * dropdown always has a matching option selected. Defaults to USD for
 * anything not yet supported (e.g. GBP) rather than leaving the select
 * with no match. */
export function normalizeCurrency(raw: string): CurrencyOption {
  const upper = raw.trim().toUpperCase();
  if (upper === '€' || upper === 'EUR') return 'EUR';
  if (upper === '$' || upper === 'USD') return 'USD';
  return 'USD';
}
