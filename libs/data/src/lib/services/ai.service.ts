import { Injectable } from '@angular/core';
import { tauriInvoke } from '../tauri.invoke';

export interface AiRequest {
  skill: string;
  context: Record<string, string>;
  model?: string;
}

export interface AiResponse {
  content: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  inputHash: string;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  /** Run an AI skill. Returns cached result if hash matches. */
  async run(req: AiRequest): Promise<AiResponse> {
    // TODO (Phase 1): implement ai_run Tauri command
    return tauriInvoke<AiResponse>('ai_run', { req });
  }
}
