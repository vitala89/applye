/**
 * Discover's deterministic scoring: which technologies a posting names, and how
 * well it fits the profile. No AI and no tokens - this is what the detail
 * screen can show before the user asks for anything.
 *
 * Pure by construction. `computeRawScore` used to read three signals off the
 * page (`profileKeywords`, `detailSkills`, and the open row's archetype), which
 * hid an ordering dependency: the skills have to be detected before the score
 * is computed, or the bonus is taken from the previous job. As arguments that
 * dependency is visible in the call.
 */

import { type ArchetypeFit } from '@applye/core';

/**
 * The dictionary the "skills found in posting" chips are matched against.
 *
 * Static and deliberately small: this is the zero-token half of Discover, and a
 * name only earns a place here if a job posting naming it tells the user
 * something the title did not.
 */
export const SKILL_DICT = [
  'Angular',
  'React',
  'Vue',
  'Svelte',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Python',
  'Rust',
  'Go',
  'Java',
  'Kotlin',
  'Swift',
  'C#',
  '.NET',
  'PHP',
  'Ruby',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'SQLite',
  'MongoDB',
  'Redis',
  'GraphQL',
  'REST',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'Terraform',
  'CI/CD',
  'Git',
  'RxJS',
  'NgRx',
  'Nx',
  'Tauri',
  'Electron',
  'Tailwind',
  'SCSS',
  'HTML',
  'CSS',
  'Jest',
  'Cypress',
  'Playwright',
];

/**
 * The technologies a posting names, capped at ten.
 *
 * Two matching rules, and the distinction matters. A short or symbol-carrying
 * token (`Go`, `C#`, `.NET`) matches only as a whole word, and against the
 * **raw** text rather than a lowercased copy, so "going" and "django" do not
 * count as Go. Everything longer substring-matches, which is what lets "React"
 * find "ReactJS".
 */
export function detectSkills(jd: string): string[] {
  const hay = jd.toLowerCase();
  return SKILL_DICT.filter((skill) => {
    const needle = skill.toLowerCase();
    if (needle.length <= 3 || /[^a-z]/.test(needle)) {
      // short or symbol-carrying tokens ("go", "c#", ".net") match whole-word
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(jd);
    }
    return hay.includes(needle);
  }).slice(0, 10);
}

/** How much each archetype tier is worth to the raw score. */
const TIER_BOOST: Record<ArchetypeFit, number> = { primary: 12, secondary: 6, adjacent: 0 };

/**
 * Raw keyword-fit score, deterministic and explainable (no AI, 0 tokens):
 * coverage of the profile's derived keywords over title+JD, a small bonus per
 * detected skill, plus a tier boost from the job's best-fit archetype.
 *
 * Null when the profile has no keywords yet - not zero, because "we cannot say"
 * and "a bad match" are different things and the UI renders them differently.
 *
 * The coverage *denominator* saturates at ten keywords, so a profile listing
 * forty does not need forty hits to score well. The numerator does not saturate
 * with it - matching more than ten puts coverage above 1 - so the 20..97 clamp
 * is what bounds the top, not the formula. Which is fine, and deliberate: a
 * posting the user opened is never a flat zero, and nothing deterministic
 * claims a perfect fit.
 */
export function computeRawScore(
  hayRaw: string,
  keywords: readonly string[],
  skills: readonly string[],
  fit: ArchetypeFit | null,
): number | null {
  if (!keywords.length) return null;
  const hay = hayRaw.toLowerCase();
  const matched = keywords.filter((kw) => hay.includes(kw)).length;
  const coverage = matched / Math.min(keywords.length, 10);
  const skillBonus = Math.min(skills.length, 6) * 3;
  const tierBoost = fit ? TIER_BOOST[fit] : 0;
  const score = Math.round(30 + coverage * 55 + skillBonus + tierBoost);
  return Math.max(20, Math.min(97, score));
}
