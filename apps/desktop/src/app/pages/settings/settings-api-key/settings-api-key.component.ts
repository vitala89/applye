import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, KeyRound, LucideAngularModule, RefreshCw, Trash2 } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/**
 * The provider API key: the field, and the two things that can be done with it.
 *
 * **This component never sees a stored key.** The keychain is write-only from
 * the app's side, which is why the field stays empty when one is stored and the
 * placeholder says so rather than showing a masked value it does not have.
 * What the user types is emitted and then cleared by the page on success; it is
 * never persisted here, logged, or put in a `[value]` binding that would
 * survive in the DOM.
 *
 * Rendered only in API mode - CLI bridge mode stores no key at all.
 */
@Component({
  selector: 'app-settings-api-key',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './settings-api-key.component.html',
  styleUrl: './settings-api-key.component.scss',
})
export class SettingsApiKeyComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** Named in the field's label, so the user can see which key they are typing. */
  readonly provider = input.required<string>();
  readonly stored = input(false);
  readonly busy = input(false);
  /** What the user has typed. Owned by the page, so clearing it on a
   * successful save is one write rather than a message back down here. */
  readonly draft = input('');

  readonly draftChanged = output<string>();
  readonly saveRequested = output<void>();
  readonly removeRequested = output<void>();

  protected readonly icons = {
    stored: Check,
    saveKey: KeyRound,
    replace: RefreshCw,
    remove: Trash2,
  };
}
