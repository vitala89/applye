/**
 * Pure helpers for the AI mode/model pickers in Settings.
 *
 * These live outside the component because the mode switch has a sharp edge:
 * switching to CLI mode blanks the model fields on purpose ("let the CLI
 * choose"), and switching back has to put valid API model ids in again -
 * an empty model is sent to the provider verbatim and rejected.
 */

/** Sentinel for the "type a name myself" option in the CLI model dropdowns. */
export const CLI_MODEL_CUSTOM = '__custom__';

/**
 * What the CLI model dropdown should show for a stored value: the value when it
 * is a known name, the custom sentinel when it was typed by hand, and the empty
 * option ("let the CLI choose") when nothing is set.
 *
 * Derived rather than stored, so a settings row written before the picker
 * existed - or edited by hand - still displays correctly.
 */
export function cliModelSelectValue(stored: string, known: readonly string[]): string {
  if (!stored) return '';
  return known.includes(stored) ? stored : CLI_MODEL_CUSTOM;
}

/**
 * The model fields to write back when returning to API mode.
 *
 * Returns only the fields that actually need fixing, so a user who had picked
 * a valid non-default model keeps it. A blank field always needs fixing: it is
 * what CLI mode leaves behind, and it is not a valid API request.
 */
export function apiModelsToRestore(
  current: { defaultModel?: string; economyModel?: string } | null | undefined,
  defaults: { default: string; economy: string } | undefined,
  known: readonly string[],
): { defaultModel?: string; economyModel?: string } {
  if (!defaults) return {};
  const valid = (value: string | undefined) => !!value && known.includes(value);
  const patch: { defaultModel?: string; economyModel?: string } = {};
  if (!valid(current?.defaultModel)) patch.defaultModel = defaults.default;
  if (!valid(current?.economyModel)) patch.economyModel = defaults.economy;
  return patch;
}
