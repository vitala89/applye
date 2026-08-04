import { AiProvider } from '@applye/core';
import { guideForProvider } from './provider-guides';

/** Provider ids that have a usable CLI. `openai` is Codex - the app's provider
 * ids predate the CLI bridge. DeepSeek has no CLI and is API-only. Gemini is
 * absent on purpose: Google stopped Gemini CLI serving personal accounts on
 * 2026-06-18, so it cannot serve this mode (see ai/cli.rs). */
export const CLI_PROVIDERS: readonly AiProvider[] = ['claude', 'openai'];

/** npm package and terminal command per CLI, for the setup instructions. */
export const CLI_SETUP_INFO: Record<string, { pkg: string; cmd: string }> = {
  claude: { pkg: '@anthropic-ai/claude-code', cmd: 'claude' },
  openai: { pkg: '@openai/codex', cmd: 'codex' },
};

/**
 * Card title for a provider: the CLI's name in CLI mode ("Claude Code"), the
 * vendor's in API mode ("Claude").
 *
 * `cliMode` is a parameter rather than something read from a signal, because
 * both the wizard's provider grid and the CLI panel's setup card ask this - and
 * the panel already knows the answer is CLI mode.
 */
export function cardNameKey(provider: AiProvider, cliMode: boolean): string {
  const guide = guideForProvider(provider);
  return (cliMode && guide.cliNameKey) || guide.nameKey;
}
