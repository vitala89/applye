import { Injectable } from '@angular/core';
import { AiMode, AiProvider } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/** Mirrors the Rust AiRequest. Stable `systemPrompt` is cacheable; `userPrompt` is dynamic. */
export interface AiRequest {
  mode: AiMode;
  provider: AiProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  language?: string;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
}

export interface RenderedSkill {
  version: string;
  recommendedModel?: string;
  systemPrompt: string;
  userPrompt: string;
}

/** One supported CLI-bridge binary and whether it is usable on this machine. */
export interface CliStatus {
  provider: AiProvider;
  command: string;
  label: string;
  /** A file with this name exists on the search path. */
  installed: boolean;
  path: string | null;
  /**
   * The binary exists **and** actually ran. `installed` alone is not enough:
   * these CLIs ship as npm wrappers that spawn a platform-specific binary, and
   * a partial install leaves the wrapper on the path with the binary missing -
   * which passes a file-existence check and then fails on the first real call.
   */
  working: boolean;
  /** Version the CLI printed, when it ran. */
  version: string | null;
  /** Why it did not run, when it did not. */
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  /** The single AI entry point. The provider key is read from the OS keychain in Rust. */
  run(req: AiRequest): Promise<AiResponse> {
    return tauriInvoke<AiResponse>('ai_run', { req });
  }

  /**
   * Which CLI-bridge binaries are present. A filesystem lookup only - nothing
   * is executed, so this is safe to call whenever Settings opens.
   */
  probeClis(): Promise<CliStatus[]> {
    return tauriInvoke<CliStatus[]>('cli_probe');
  }

  /** Render a bundled markdown skill into a ready system/user prompt pair. */
  renderSkill(name: string, context: Record<string, string>): Promise<RenderedSkill> {
    return tauriInvoke<RenderedSkill>('skill_render', { name, context });
  }
}
