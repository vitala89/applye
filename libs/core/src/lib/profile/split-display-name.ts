/** The result of guessing where a display name splits.
 *
 * `confident` is true only for an unambiguous two-token name. Middle names,
 * compound surnames and patronymics all produce three or more tokens and all
 * split differently, so the honest answer there is to ask the user rather than
 * to pick one convention and be quietly wrong for everyone else. */
export interface DisplayNameParts {
  firstName: string;
  lastName: string;
  confident: boolean;
}

/** Guesses a first/last split from a single display name.
 *
 * This is the only place in the app that guesses. Every other caller either
 * takes what the AI extracted or takes what the user typed. Keep it that way:
 * a second splitter is a second set of rules to disagree with this one. */
export function splitDisplayName(fullName: string): DisplayNameParts {
  const tokens = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { firstName: '', lastName: '', confident: false };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '', confident: false };
  const lastName = tokens[tokens.length - 1];
  const firstName = tokens.slice(0, -1).join(' ');
  return { firstName, lastName, confident: tokens.length === 2 };
}
