import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { ButtonDirective } from '@applye/ui';
import { AiService } from '@applye/data';
import { Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { ParsedProfile } from '../profile-parse.util';

/**
 * Profile's raw-markdown editor: the textarea, the scaffold hint, and the
 * `profile-import` parse with its reviewable preview.
 *
 * The markdown itself stays on the page - it is `fullMd`, which the save path,
 * the dirty check and both AI calls all read - so it arrives as an input and
 * every keystroke leaves as an output.
 *
 * The parse does not. Nothing outside this component reads `parsing`, the
 * status pair or the preview, and the page needs only the result: its
 * `applyParsedProfile` takes the parsed object, folds it into the form and the
 * four section signals, and switches back to the Form tab. So the whole
 * pipeline lives here and emits once, on apply.
 */
@Component({
  selector: 'app-profile-raw-editor',
  standalone: true,
  imports: [FormsModule, ButtonDirective, LucideAngularModule],
  templateUrl: './profile-raw-editor.component.html',
  styleUrl: './profile-raw-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRawEditorComponent {
  private readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(TranslateService).t;

  readonly markdown = input.required<string>();
  readonly settings = input.required<Settings | null>();

  readonly markdownChanged = output<string>();
  readonly applied = output<ParsedProfile>();

  protected readonly parsing = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal(false);
  protected readonly preview = signal<ParsedProfile | null>(null);

  protected readonly icons = { sparkles: Sparkles };

  /** Runs the `profile-import` skill against the raw markdown and stashes the
   * tolerant result in `preview` for the user to review - never applies
   * automatically. */
  protected async parse(): Promise<void> {
    const text = this.markdown().trim();
    if (!text) {
      this.status.set(this.t()('profile.parse_empty_hint'));
      return;
    }
    const s = this.settings();
    if (!s) return;
    this.parsing.set(true);
    this.status.set('');
    this.error.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('profile-import', {
        profile_text: text,
        language: lang,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });
      const parsed = this.extractParsed(res.text);
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

  /** Same tolerant fence-stripping as `parseScoringJson`: strips ```json fences,
   * parses, and returns null on anything that is not a JSON object - never
   * throws, so a bad AI response just fails the parse instead of clearing the form. */
  private extractParsed(raw: string): ParsedProfile | null {
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

  /** Clears the preview as it hands it over: the page switches to the Form tab,
   * and a preview left behind would reappear the next time raw mode opens. */
  protected apply(): void {
    const p = this.preview();
    if (!p) return;
    this.preview.set(null);
    this.applied.emit(p);
  }

  protected discard(): void {
    this.preview.set(null);
    this.status.set('');
  }
}
