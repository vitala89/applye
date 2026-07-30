/**
 * Deterministic cover-letter signature sanitiser.
 *
 * The sign-off line under the closing is the sender's NAME only. The AI skill
 * (`cover-letter-generate`) is instructed never to append contact details, but
 * LLMs do not obey that reliably, so a model that returns
 * "Vitalii Kasap +38 097 000 00 00" or "Jane Doe · jane@doe.io" would leak a
 * phone number / email into the signature block. This strips any contact
 * detail (phone, email, URL) the model may have appended, leaving the name.
 *
 * Prompt rules are best-effort; this is the guarantee.
 */

// Matches an email address anywhere in the text. The runs are bounded to the
// RFC 5321 limits (64-character local part, 255-character domain, 63-character
// final label): unbounded `[^\s@]+` is quadratic on a long run of non-'@'
// characters, and this text comes from a model response (CodeQL
// js/polynomial-redos). A local part longer than the RFC allows is not a real
// address, and the part that does get stripped still takes the '@' and the
// domain with it, so no usable address survives.
const EMAIL_RE = /[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}/g;

// Matches a URL / www host.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

// Matches a phone-like run: an optional leading "+", then at least 7 characters
// made of digits and common phone separators (space, dash, dot, parens, slash).
// The 7-digit floor keeps short numerics that legitimately appear in names
// (rare, but e.g. a suffix) from being over-stripped while catching real
// numbers like "+38 097 000 00 00" or "(555) 010-0100".
const PHONE_RE = /\+?\s*\(?\d[\d\s().\-/]{5,}\d/g;

// Leading/trailing separators left after removing a contact chunk
// (e.g. "Jane Doe · " → "Jane Doe", "| Jane Doe" → "Jane Doe").
const EDGE_SEPARATORS_RE = /^[\s·,;|/\\\---]+|[\s·,;|/\\\---]+$/g;

/**
 * Reduce a model-produced signature to the sender's name only.
 *
 * - Keeps the first non-empty line (the name); contact details are usually
 *   pushed onto later lines.
 * - Strips any email / URL / phone run inside that line.
 * - Trims dangling separators (·, |, commas, dashes) left behind.
 *
 * Returns an empty string only if the input had no name-like content.
 */
export function sanitizeSignature(raw: string | null | undefined): string {
  if (!raw) return '';

  // Prefer the first line that still has letters after contact detail is
  // stripped - that is the name. Fall back to the whole string collapsed.
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = stripContactDetail(line);
    if (/\p{L}/u.test(cleaned)) return cleaned;
  }
  return stripContactDetail(raw.replace(/\r?\n/g, ' '));
}

function stripContactDetail(s: string): string {
  return s
    .replace(EMAIL_RE, '')
    .replace(URL_RE, '')
    .replace(PHONE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(EDGE_SEPARATORS_RE, '')
    .trim();
}
