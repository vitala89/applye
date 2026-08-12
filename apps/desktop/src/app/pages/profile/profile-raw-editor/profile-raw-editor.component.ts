import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { ButtonDirective } from '@applye/ui';
import { Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ParsedProfile, ProfileImportStore } from '@applye/application';

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
  // Component-scoped: a preview belongs to the editor that produced it and
  // must not outlive it.
  providers: [ProfileImportStore],
})
export class ProfileRawEditorComponent {
  protected readonly store = inject(ProfileImportStore);
  protected readonly t = inject(TranslateService).t;

  readonly markdown = input.required<string>();
  readonly settings = input.required<Settings | null>();

  readonly markdownChanged = output<string>();
  readonly applied = output<ParsedProfile>();

  protected readonly icons = { sparkles: Sparkles };

  /** The page owns the markdown, so the store is handed it rather than reading
   * it; everything the parse produces is the store's. */
  protected parse(): Promise<void> {
    return this.store.parse(this.markdown(), this.settings());
  }

  protected apply(): void {
    const parsed = this.store.take();
    if (parsed) this.applied.emit(parsed);
  }

  protected discard(): void {
    this.store.discard();
  }
}
