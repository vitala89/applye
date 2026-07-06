import type { AiProvider } from '@applye/core';

export interface ProviderGuide {
  provider: AiProvider;
  /** i18n key for the provider display name. */
  nameKey: string;
  /** Where the user creates a key; opened via openUrl(). */
  consoleUrl: string;
  /** Ordered i18n keys for the numbered setup steps. */
  stepKeys: string[];
  /** Optional external tutorial video; opened via openUrl(). */
  helpVideoUrl?: string;
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
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    stepKeys: STEP_KEYS('claude'),
  },
  openai: {
    provider: 'openai',
    nameKey: 'onboarding.ai.openai.name',
    consoleUrl: 'https://platform.openai.com/api-keys',
    stepKeys: STEP_KEYS('openai'),
  },
  deepseek: {
    provider: 'deepseek',
    nameKey: 'onboarding.ai.deepseek.name',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    stepKeys: STEP_KEYS('deepseek'),
  },
};

const GENERIC_GUIDE = (provider: AiProvider): ProviderGuide => ({
  provider,
  nameKey: 'onboarding.ai.generic.name',
  consoleUrl: 'https://applye.dev/docs/ai-setup',
  stepKeys: STEP_KEYS('generic'),
});

export function guideForProvider(provider: AiProvider): ProviderGuide {
  return PROVIDER_GUIDES[provider] ?? GENERIC_GUIDE(provider);
}
