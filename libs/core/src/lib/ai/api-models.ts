import { AiProvider } from '../types/common.types';

/**
 * The API-mode model catalogue, and the rules for keeping a settings row
 * pointing at a model the selected provider will actually accept.
 *
 * This lives in `core` rather than next to the Settings screen because two
 * screens write these fields - Settings and the onboarding wizard - and they
 * were allowed to disagree. Onboarding never touched the model ids at all, so
 * choosing DeepSeek there left the Claude defaults (or, after a CLI-mode run,
 * an empty string) in place and every wizard AI call was rejected by DeepSeek
 * with `The supported API model names are deepseek-v4-pro or deepseek-v4-flash,
 * but you passed .`
 *
 * An empty model is not a "use the default" signal in API mode: it is sent to
 * the provider verbatim and rejected. Only CLI mode may leave these blank, and
 * only because a CLI picks its own default.
 */

const CLAUDE_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

// Current DeepSeek model IDs. Verified against api-docs.deepseek.com (2026-06):
// v4-pro for quality, v4-flash for the economy tier. OpenAI-compatible API.
const DEEPSEEK_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash'] as const;

/** Model ids each API-mode provider accepts, quality tier listed first. */
export const API_MODELS: Partial<Record<AiProvider, readonly string[]>> = {
  claude: CLAUDE_MODELS,
  deepseek: DEEPSEEK_MODELS,
};

/** Per-provider quality (`default`) and economy model picks. */
export const PROVIDER_MODEL_DEFAULTS: Partial<
  Record<AiProvider, { default: string; economy: string }>
> = {
  claude: { default: 'claude-opus-4-8', economy: 'claude-haiku-4-5' },
  deepseek: { default: 'deepseek-v4-pro', economy: 'deepseek-v4-flash' },
};

/** The models offered for `provider`, or an empty list for one API mode cannot
 * dispatch to. */
export function apiModelsFor(provider: AiProvider | string | null | undefined): readonly string[] {
  return API_MODELS[provider as AiProvider] ?? [];
}

/** The quality/economy pair for `provider`, or `undefined` when API mode has no
 * catalogue for it. */
export function providerModelDefaults(
  provider: AiProvider | string | null | undefined,
): { default: string; economy: string } | undefined {
  return PROVIDER_MODEL_DEFAULTS[provider as AiProvider];
}

/**
 * The model fields to write back so they are valid for `provider`.
 *
 * Returns only the fields that actually need fixing, so a user who picked a
 * valid non-default model keeps it. A blank field always needs fixing: it is
 * what CLI mode leaves behind, and it is not a valid API request. A field
 * holding another provider's id needs fixing for the same reason - it is the
 * shape the onboarding bug produced.
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

/**
 * The quality/economy pair to persist for `provider`, given whatever is stored
 * now. Always returns both fields, so a caller writing a fresh settings row
 * cannot leave one of them empty.
 */
export function resolveApiModels(
  provider: AiProvider | string | null | undefined,
  current?: { defaultModel?: string; economyModel?: string } | null,
): { defaultModel: string; economyModel: string } | null {
  const defaults = providerModelDefaults(provider);
  if (!defaults) return null;
  const patch = apiModelsToRestore(current, defaults, apiModelsFor(provider));
  return {
    defaultModel: patch.defaultModel ?? current?.defaultModel ?? defaults.default,
    economyModel: patch.economyModel ?? current?.economyModel ?? defaults.economy,
  };
}
