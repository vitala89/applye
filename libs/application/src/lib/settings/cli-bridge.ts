import type { AiProvider } from '@applye/core';

/**
 * CLI bridge mode: which local CLI each provider id maps to.
 *
 * `openai` is Codex because the app's provider ids predate the CLI bridge; the
 * Rust adapter accepts both `openai` and `codex` for the same reason.
 *
 * Gemini CLI is deliberately absent: Google stopped it serving personal
 * accounts on 2026-06-18 (see `ai/cli.rs`). It is still a valid API-mode
 * provider, so the id itself stays in `AiProvider`.
 *
 * The labels are product names, not translated strings - which is why this
 * config can live below the app.
 */
export const CLI_PROVIDERS: readonly { id: AiProvider; label: string; command: string }[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'openai', label: 'Codex CLI', command: 'codex' },
];

/**
 * Model choices offered per CLI, so a user does not have to know the spelling.
 * Aliases are preferred over full model IDs wherever a CLI publishes them:
 * vendors rotate the IDs, and an alias keeps working across a model refresh.
 *
 * An empty value means "omit --model entirely and let the CLI choose", which is
 * the right default rather than a cop-out - the CLI is already signed in and
 * knows which models the user's subscription actually covers, and Applye does
 * not.
 *
 * IMPORTANT: which models a CLI will accept depends on the user's *plan*, not
 * just on what the vendor publishes. Codex on a ChatGPT account rejects
 * `gpt-5.6` and `gpt-5.3-codex` outright ("not supported when using Codex with
 * a ChatGPT account") even though both are in the public model list - and a
 * ChatGPT-account user is exactly who CLI bridge mode exists for. So this list
 * holds only names confirmed to work on a subscription, and the default stays
 * "let the CLI choose", which is the only option that is right for every plan.
 *
 * Tested live 2026-07-23 by invoking each CLI: codex accepted gpt-5.5, gpt-5.4
 * and gpt-5.4-mini on a ChatGPT account and refused gpt-5.6 / gpt-5.3-codex;
 * claude accepted the `sonnet` alias.
 */
export const CLI_MODELS: Record<string, string[]> = {
  claude: ['sonnet', 'opus', 'haiku'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
};

/** Whether a provider has a CLI at all. Switching to CLI mode on one that does
 * not would leave the user on a combination that can only fail at call time. */
export function hasCli(provider: string): boolean {
  return CLI_PROVIDERS.some((c) => c.id === provider);
}

/** Whether a provider has an API-mode path. The two arms `ai/api.rs` has, and
 * no more - the others are reachable only through their CLI. */
export function hasApi(provider: string): boolean {
  return provider === 'claude' || provider === 'deepseek';
}
