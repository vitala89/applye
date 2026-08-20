/**
 * The stop reasons that mean "the answer is cut off", in both vendor
 * spellings: Anthropic reports `max_tokens`, the OpenAI-compatible shape
 * reports `length`.
 *
 * Kept as data next to the predicate rather than inlined into a comparison,
 * because the list grows every time a provider is added and a comparison
 * buried in a service is not where anyone looks for it.
 */
export const TRUNCATING_STOP_REASONS = ['max_tokens', 'length'] as const;

/**
 * Did the provider say it stopped because it ran out of room?
 *
 * The distinction this exists for is three-way, not two: **absent** means the
 * provider did not say (every CLI-bridge answer), a **non-truncating** value
 * means it finished on its own terms, and only a value in the list above means
 * the answer was cut off. Collapsing absent into "not truncated" would be a
 * lie of the kind that is impossible to notice - a CLI answer that really was
 * cut off would report a clean finish - so callers that need the difference
 * should read the raw value, and this predicate answers only the narrow
 * question its name asks.
 *
 * Case-insensitive and trimmed: the value crosses an IPC boundary from JSON
 * the app does not control.
 */
export function isTruncatedStopReason(stopReason: string | null | undefined): boolean {
  if (!stopReason) return false;
  const normalised = stopReason.trim().toLowerCase();
  return TRUNCATING_STOP_REASONS.some((r) => r === normalised);
}
