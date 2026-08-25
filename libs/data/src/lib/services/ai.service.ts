import { Injectable } from '@angular/core';
import { AiMode, AiProvider, CliStatus } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/** Mirrors the Rust AiRequest. Stable `systemPrompt` is cacheable; `userPrompt` is dynamic. */
export interface AiRequest {
  mode: AiMode;
  provider: AiProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** The leading, per-job-stable part of the user turn - a skill's own
   * `RenderedSkill.userPromptCacheable`, forwarded verbatim. Anthropic marks it
   * as a `cache_control` breakpoint so repeated calls sharing it are not
   * re-billed for it; providers with no such concept simply see it folded back
   * into the same text a skill with nothing to share would have sent. */
  cacheablePrefix?: string;
  language?: string;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
  /**
   * Why the provider stopped generating, verbatim - `stop_reason` on Anthropic,
   * `finish_reason` on the OpenAI-compatible shape - or absent when the
   * provider did not say, which is every CLI-bridge answer.
   *
   * Passed through rather than normalised, because the vendors spell "I hit the
   * cap" differently. `isTruncatedStopReason` in `@applye/core` knows both
   * spellings and is the only place that should compare against them.
   */
  stopReason?: string | null;
}

export interface RenderedSkill {
  version: string;
  recommendedModel?: string;
  systemPrompt: string;
  userPrompt: string;
  /** The leading part of `userPrompt` a skill marked `[CACHE_END]`-stable
   * across repeated calls (e.g. resume-tailoring's three passes). Absent for
   * every skill with no such marker. */
  userPromptCacheable?: string;
}

/** Outcome of an assisted `npm install -g` of one of the CLIs. */
export interface CliInstallResult {
  ok: boolean;
  /** The exact command that ran, so the UI never describes it second-hand. */
  command: string;
  /** Outcome or failure reason. */
  message: string;
  /** npm is missing entirely, so the user needs Node.js first - the one
   * failure that cannot be fixed from inside Applye. */
  needsNode: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  /** The single AI entry point. The provider key is read from the OS keychain in Rust. */
  run(req: AiRequest): Promise<AiResponse> {
    return tauriInvoke<AiResponse>('ai_run', { req });
  }

  /**
   * Which CLI-bridge binaries are present and runnable. Runs `--version` on
   * each, so it is safe but not instant; call it when the CLI UI is shown.
   */
  probeClis(): Promise<CliStatus[]> {
    return tauriInvoke<CliStatus[]>('cli_probe');
  }

  /**
   * Installs a CLI with npm. The package name is chosen in Rust from a fixed
   * list keyed on the provider id, never passed from here, so there is no way
   * to install anything but the three official vendor CLIs.
   *
   * Installing does not sign the user in - the CLIs authenticate interactively
   * against the user's own account, which cannot happen from inside Applye.
   */
  installCli(provider: AiProvider): Promise<CliInstallResult> {
    return tauriInvoke<CliInstallResult>('cli_install', { provider });
  }

  /** Render a bundled markdown skill into a ready system/user prompt pair. */
  renderSkill(name: string, context: Record<string, string>): Promise<RenderedSkill> {
    return tauriInvoke<RenderedSkill>('skill_render', { name, context });
  }
}
