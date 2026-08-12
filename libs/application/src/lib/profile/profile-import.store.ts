import { Injectable, inject, signal } from '@angular/core';
import { Settings } from '@applye/core';
import { AiService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ParsedProfile } from './profile-parse.util';
import { ToastService } from '../shell/toast.service';

/**
 * The `profile-import` parse behind Profile's raw-markdown editor: whether a
 * call is in flight, what it had to say, and the reviewable result.
 *
 * The markdown itself is **not** here. It is `fullMd`, which the save path, the
 * dirty check and both AI calls read, so it stays on the page and arrives as an
 * argument. Nothing outside the editor reads the parse state, which is why the
 * whole pipeline sits in one store and the page only ever sees the result.
 *
 * Component-scoped through the editor's `providers`, so a preview does not
 * outlive the editor that produced it.
 */
@Injectable()
export class ProfileImportStore {
  private readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;

  readonly parsing = signal(false);
  readonly status = signal('');
  readonly error = signal(false);
  readonly preview = signal<ParsedProfile | null>(null);

  /**
   * Runs the `profile-import` skill against the raw markdown and stashes the
   * tolerant result in `preview` for the user to review - never applies
   * automatically.
   */
  async parse(markdown: string, settings: Settings | null): Promise<void> {
    const text = markdown.trim();
    if (!text) {
      this.status.set(this.t()('profile.parse_empty_hint'));
      return;
    }
    if (!settings) return;
    this.parsing.set(true);
    this.status.set('');
    this.error.set(false);
    try {
      const lang = settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('profile-import', {
        profile_text: text,
        language: lang,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });
      const parsed = extractParsedProfile(res.text);
      if (!parsed) {
        this.status.set(this.t()('profile.parse_failed'));
        this.error.set(true);
        return;
      }
      this.preview.set(parsed);
    } catch (e) {
      this.status.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.error.set(true);
      this.toast.error(this.t()('profile.parse_failed'));
    } finally {
      this.parsing.set(false);
    }
  }

  /**
   * Hands the preview over and clears it in the same step: the page switches to
   * the Form tab, and a preview left behind would reappear the next time raw
   * mode opens. Returns null when there is nothing to hand over.
   */
  take(): ParsedProfile | null {
    const p = this.preview();
    if (!p) return null;
    this.preview.set(null);
    return p;
  }

  discard(): void {
    this.preview.set(null);
    this.status.set('');
  }
}

/**
 * Same tolerant fence-stripping as `parseScoringJson`: strips ```json fences,
 * parses, and returns null on anything that is not a JSON object - never
 * throws, so a bad AI response just fails the parse instead of clearing the
 * form.
 */
export function extractParsedProfile(raw: string): ParsedProfile | null {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as ParsedProfile) : null;
  } catch {
    return null;
  }
}
