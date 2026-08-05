import { ProfileForm, splitDisplayName } from '@applye/core';

/**
 * Fills the first/last parts from the display name for profiles that predate
 * those fields.
 *
 * This is deliberately not inside `parseProfileMd`: the parser stays a faithful
 * reader of what the markdown says, so its round-trip identity test keeps its
 * meaning. Nothing is written back on read alone - the backfilled values reach
 * disk on the user's next save.
 *
 * Only when there is nothing to lose: a profile that already carries either
 * part is left exactly as it is, because the stored split is the user's and a
 * re-derived one would overwrite, for example, a two-word surname they fixed
 * by hand.
 */
export function withBackfilledNameParts(form: ProfileForm): ProfileForm {
  if (form.firstName.trim() || form.lastName.trim() || !form.name.trim()) return form;
  const { firstName, lastName } = splitDisplayName(form.name);
  return { ...form, firstName, lastName };
}

/**
 * Keeps the display name following the first/last parts until the user takes it
 * over. Apply on a first-name or last-name edit only; `next` is `previous` with
 * that edit already made.
 *
 * The name is recomposed only while it still reads exactly as the previous
 * parts composed. A name typed by hand - in the display-name field or in raw
 * markdown - is deliberate and must survive later part edits.
 *
 * Two conditions carry the rest of the behaviour:
 *
 * - the composed name must be non-empty, so clearing both parts does not wipe a
 *   name the user still wants on their documents;
 * - an emptied display name counts as untouched, so a name the user *cleared*
 *   (rather than hand-set to something else) re-adopts the parts on the next
 *   part edit instead of freezing on a blank.
 */
export function withComposedName(previous: ProfileForm, next: ProfileForm): ProfileForm {
  const compose = (f: ProfileForm) =>
    [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(' ');
  const composed = compose(next);
  const wasFollowing = previous.name.trim() === compose(previous) || previous.name.trim() === '';
  return composed && wasFollowing ? { ...next, name: composed } : next;
}
