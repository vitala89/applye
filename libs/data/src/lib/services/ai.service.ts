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

/** One supported CLI-bridge binary and whether it is installed on this machine. */
export interface CliStatus {
  provider: AiProvider;
  command: string;
  label: string;
  installed: boolean;
  path: string | null;
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
