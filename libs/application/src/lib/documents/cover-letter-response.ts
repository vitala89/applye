import { CoverLetterContent, isTruncatedStopReason, parseCoverLetterResponse } from '@applye/core';
import { AiResponse } from '@applye/data';

/**
 * Reading a cover-letter skill's answer with the provider's own account of why
 * it stopped attached to any failure.
 *
 * The two draft flows - the wizard's **Generate cover letter** and **tailor an
 * existing letter** - each did `JSON.parse(cleanJsonText(res.text))` and cast
 * the result. Three things were wrong with that, and the third is what made
 * `B11` undiagnosable:
 *
 * 1. an array or a bare string parses fine and casts into a letter with no
 *    fields, which the user reads as a model that had nothing to say;
 * 2. the editor path next door had already been hardened against exactly that
 *    (`parseCoverLetterResponse`), so one feature carried two strictnesses;
 * 3. the error that reached the status line was a bare
 *    `SyntaxError: Unexpected end of JSON input` - no raw answer, no provider
 *    context - so a truncated answer, a schema rejection and a timeout were
 *    one indistinguishable message, and the three need three different fixes.
 *
 * **The stop reason explains a failure; it does not overrule a success.** An
 * answer that parsed is kept even when the provider says it stopped at the
 * cap, which is what `parseCvSkillResponse` does today - the two paths stop
 * diverging rather than diverging in a new direction. Deciding that a capped
 * answer is a failure regardless is a behaviour change of its own.
 *
 * Truncation is deliberately **not** repaired here. `parseCvSkillResponse`
 * repairs a cut-off CV because its sections are visibly listed, so a short one
 * announces itself; a letter reads as continuous prose and a repaired one
 * would present its missing paragraphs as a finished document.
 */
export function parseCoverLetterFromResponse(res: AiResponse): Partial<CoverLetterContent> {
  try {
    return parseCoverLetterResponse(res.text);
  } catch (cause) {
    throw new Error(`${String(cause)}${stopReasonSuffix(res.stopReason)}`, { cause });
  }
}

/**
 * What the provider said about why it stopped, as a sentence appended to the
 * parse failure - and nothing at all when it said nothing, because a CLI-bridge
 * answer reports no reason and an invented one would read as confirmation that
 * the answer was complete.
 */
function stopReasonSuffix(stopReason: string | null | undefined): string {
  if (!stopReason) return '';
  if (isTruncatedStopReason(stopReason)) {
    return ` The provider stopped at its output token limit (stop reason "${stopReason}"), so the answer is cut off rather than malformed - generating again is likely to succeed.`;
  }
  return ` The provider reported stop reason "${stopReason}", so the answer was not cut short.`;
}
