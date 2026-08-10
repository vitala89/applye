import { Injectable, inject, signal } from '@angular/core';
import type { Settings } from '@applye/core';
import { AiService } from '@applye/data';

/** Which of the two configured models the test should use. */
export type TestTier = 'economy' | 'quality';

/** What one test round-trip cost. */
export interface TestTokens {
  in: number;
  out: number;
  cached: number;
}

const PING_SKILL = 'ping';
const PING_MESSAGE = 'Reply OK if you can read this.';

/**
 * "Send a test prompt" - the one place the whole AI path is exercised end to
 * end before the user trusts it with a real document.
 *
 * The tier is held here rather than in the settings row on purpose: there is no
 * persisted tier field, and adding one would make a debugging control into a
 * stored preference (the Phase 1 schema note, still true).
 */
@Injectable()
export class ConnectionTestStore {
  private readonly ai = inject(AiService);

  readonly tier = signal<TestTier>('economy');
  readonly testing = signal(false);
  readonly reply = signal<string | null>(null);
  readonly tokens = signal<TestTokens | null>(null);
  readonly error = signal('');

  /** `null` when a test is already in flight. Never rejects. */
  async run(settings: Settings): Promise<boolean | null> {
    this.error.set('');
    if (this.testing()) return null;
    this.testing.set(true);
    this.reply.set(null);
    this.tokens.set(null);
    try {
      const rendered = await this.ai.renderSkill(PING_SKILL, { message: PING_MESSAGE });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: this.tier() === 'quality' ? settings.defaultModel : settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: settings.defaultDocLanguage,
      });
      this.reply.set(res.text);
      this.tokens.set({ in: res.tokensInput, out: res.tokensOutput, cached: res.cachedTokens });
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.testing.set(false);
    }
  }
}
