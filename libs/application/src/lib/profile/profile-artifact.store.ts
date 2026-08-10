import { Injectable, type Signal, type WritableSignal, inject, signal } from '@angular/core';
import { AiService } from '@applye/data';
import {
  type ProfileArtifact,
  artifactCached,
  artifactPatch,
  artifactPrompt,
} from './profile-artifact.util';
import { ProfileStore } from './profile.store';

/** How many tokens one generation cost, for the page to report. */
export interface ArtifactTokens {
  input: number;
  output: number;
}

/**
 * What a generation attempt did. Every one of these is a different sentence on
 * screen, and none of them is a sentence here.
 *
 * - `empty` - nothing to generate from; a refusal, so `error` stays clear.
 * - `cached` - this exact markdown was already analysed; also a refusal.
 * - `generated` - the row was written; `tokens` says what it cost.
 * - `failed` - `error` carries what went wrong.
 */
export type ArtifactOutcome = 'empty' | 'cached' | 'generated' | 'failed';

/**
 * The profile's two AI artefacts: the scoring profile and the pitch.
 *
 * Scoring and the pitch ran as two copies of one sequence until they drifted.
 * What differs - the skill and its language, how the cache is keyed, and which
 * columns the write owns - is in `profile-artifact.util.ts` as pure functions;
 * what is left here is the sequence, which is identical for both.
 *
 * **This store does not write the profile row itself.** It hands its patch to
 * `ProfileStore.persist`, which owns the row and `savedMdHash` together. A hash
 * that lags the row it describes is what makes the scoring chip report a stale
 * artefact as cached, and splitting the flow across two stores is exactly the
 * situation where a second writer would appear.
 */
@Injectable()
export class ProfileArtifactStore {
  private readonly ai = inject(AiService);
  private readonly store = inject(ProfileStore);

  private readonly state: Record<
    ProfileArtifact,
    {
      busy: WritableSignal<boolean>;
      error: WritableSignal<string>;
      tokens: WritableSignal<ArtifactTokens | null>;
    }
  > = {
    scoring: {
      busy: signal(false),
      error: signal(''),
      tokens: signal<ArtifactTokens | null>(null),
    },
    pitch: { busy: signal(false), error: signal(''), tokens: signal<ArtifactTokens | null>(null) },
  };

  busy(kind: ProfileArtifact): boolean {
    return this.state[kind].busy();
  }

  error(kind: ProfileArtifact): string {
    return this.state[kind].error();
  }

  tokens(kind: ProfileArtifact): ArtifactTokens | null {
    return this.state[kind].tokens();
  }

  /** For a template that wants the signal rather than the value. */
  busySignal(kind: ProfileArtifact): Signal<boolean> {
    return this.state[kind].busy.asReadonly();
  }

  /**
   * Generates one artefact from the saved markdown and writes it to the row.
   *
   * Never rejects. Returns which of the four things happened; the page says it.
   */
  async generate(kind: ProfileArtifact): Promise<ArtifactOutcome> {
    const ui = this.state[kind];

    // Captured before any await: this is the text the artefact is generated
    // from, so it is also the text the row and the artefact's hash must
    // describe. Reading fullMd() again after the AI call would persist markdown
    // nothing analysed.
    const mdAtStart = this.store.editor.fullMd();
    const md = mdAtStart.trim();
    if (!md) return 'empty';

    const p = this.store.profile();
    const s = this.store.settings();
    if (!s) return 'empty';

    ui.error.set('');

    // Inside the guard rather than before it: hashing is IPC and can fail, and
    // the page has no catch. The original called it bare, so a failed hash
    // rejected out of the generate handler with nothing shown - preserved here
    // would have made the "never rejects" contract above false.
    let hash: string;
    try {
      hash = await this.store.hashText(md);
    } catch (e) {
      ui.error.set(String(e));
      return 'failed';
    }
    if (artifactCached(kind, p, hash)) return 'cached';

    ui.busy.set(true);
    ui.tokens.set(null);
    try {
      const prompt = artifactPrompt(kind, md, s);
      const rendered = await this.ai.renderSkill(prompt.skill, prompt.vars);
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: prompt.language,
      });
      await this.store.persist(artifactPatch(kind, p, mdAtStart, res.text, hash), hash);
      ui.tokens.set({ input: res.tokensInput, output: res.tokensOutput });
      return 'generated';
    } catch (e) {
      ui.error.set(String(e));
      return 'failed';
    } finally {
      ui.busy.set(false);
    }
  }
}
