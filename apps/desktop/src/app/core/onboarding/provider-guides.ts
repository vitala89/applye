import type { AiProvider } from '@applye/core';

export interface ProviderGuide {
  provider: AiProvider;
  /** i18n key for the provider display name. */
  nameKey: string;
  /** i18n key for the short vendor/product subtitle shown under the name. */
  vendorKey: string;
  /** Single decorative glyph shown on the provider selector card. Not
   * user-facing copy - purely visual, so it is not translated. Fallback for
   * providers without a brand mark in `iconUrl`. */
  glyph: string;
  /** Path to the provider's official brand mark (served from /public), used
   * on the selector card instead of `glyph` when present. OpenAI has none
   * here: their logo isn't in third-party redistributable icon sets (see
   * simple-icons, which dropped it), so it falls back to the glyph. */
  iconUrl?: string;
  /** Prefix hint shown as the key input's placeholder (e.g. "sk-ant-api03-"). */
  keyPrefix: string;
  /** Where the user creates a key; opened via openUrl(). */
  consoleUrl: string;
  /** i18n key for the short console hostname label (e.g. "console.anthropic.com"). */
  consoleLabelKey: string;
  /** Ordered i18n keys for the numbered setup steps. */
  stepKeys: string[];
  /** Optional external tutorial video; opened via openUrl(). */
  helpVideoUrl?: string;
  /** i18n key for the name to show in CLI bridge mode, where the product is
   * the CLI rather than the API - "Claude Code", not "Claude". Falls back to
   * `nameKey` for a provider with no CLI. */
  cliNameKey?: string;
}

const STEP_KEYS = (p: string): string[] => [
  `onboarding.ai.${p}.step1`,
  `onboarding.ai.${p}.step2`,
  `onboarding.ai.${p}.step3`,
  `onboarding.ai.${p}.step4`,
];

export const PROVIDER_GUIDES: Partial<Record<AiProvider, ProviderGuide>> = {
  claude: {
    provider: 'claude',
    nameKey: 'onboarding.ai.claude.name',
    vendorKey: 'onboarding.ai.claude.vendor',
    glyph: '✦',
    iconUrl: '/provider-icons/claude.svg',
    keyPrefix: 'sk-ant-api03-',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    consoleLabelKey: 'onboarding.ai.claude.console_label',
    stepKeys: STEP_KEYS('claude'),
    cliNameKey: 'onboarding.ai.cli.claude_name',
  },
  openai: {
    provider: 'openai',
    nameKey: 'onboarding.ai.openai.name',
    vendorKey: 'onboarding.ai.openai.vendor',
    glyph: '⌾',
    keyPrefix: 'sk-proj-',
    consoleUrl: 'https://platform.openai.com/api-keys',
    consoleLabelKey: 'onboarding.ai.openai.console_label',
    stepKeys: STEP_KEYS('openai'),
    cliNameKey: 'onboarding.ai.cli.openai_name',
  },
  // Gemini is CLI-only for now: there is no Gemini branch in API mode yet, so
  // this guide exists to name the card in CLI bridge mode. The key-flow fields
  // point at the real console so it degrades sensibly if API mode ever lands.
  gemini: {
    provider: 'gemini',
    nameKey: 'onboarding.ai.gemini.name',
    vendorKey: 'onboarding.ai.gemini.vendor',
    glyph: '✧',
    keyPrefix: '',
    consoleUrl: 'https://aistudio.google.com/apikey',
    consoleLabelKey: 'onboarding.ai.gemini.console_label',
    stepKeys: STEP_KEYS('generic'),
  },
  deepseek: {
    provider: 'deepseek',
    nameKey: 'onboarding.ai.deepseek.name',
    vendorKey: 'onboarding.ai.deepseek.vendor',
    glyph: '◈',
    iconUrl: '/provider-icons/deepseek.svg',
    keyPrefix: 'sk-',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    consoleLabelKey: 'onboarding.ai.deepseek.console_label',
    stepKeys: STEP_KEYS('deepseek'),
  },
};

const GENERIC_GUIDE = (provider: AiProvider): ProviderGuide => ({
  provider,
  nameKey: 'onboarding.ai.generic.name',
  vendorKey: 'onboarding.ai.generic.vendor',
  glyph: '◆',
  keyPrefix: '',
  consoleUrl: 'https://applye.dev/docs/ai-setup',
  consoleLabelKey: 'onboarding.ai.generic.console_label',
  stepKeys: STEP_KEYS('generic'),
});

export function guideForProvider(provider: AiProvider): ProviderGuide {
  return PROVIDER_GUIDES[provider] ?? GENERIC_GUIDE(provider);
}
