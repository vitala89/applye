import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, RefreshCw, TriangleAlert } from 'lucide-angular';
import type { AiProvider } from '@applye/core';
import type { CliStatus } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Which local CLIs are installed, and what to do about the ones that are not.
 *
 * **Three states, not two.** A CLI can be absent, present-and-working, or
 * present-and-broken - the npm wrappers spawn a platform binary that a partial
 * install can leave missing, so a file check calls it healthy and the first
 * real call fails. The broken row is louder than the missing one for that
 * reason: the user believes it is installed, and until this row said otherwise
 * nothing on screen disagreed.
 *
 * The privacy note travels with this component rather than with the provider
 * picker, because it is the CLI-mode note: it describes what this list is
 * showing, and it is wrong for API mode.
 */
@Component({
  selector: 'app-settings-cli-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './settings-cli-status.component.html',
  styleUrl: './settings-cli-status.component.scss',
})
export class SettingsCliStatusComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly statuses = input.required<readonly CliStatus[]>();
  readonly probing = input(false);
  /** The provider currently installing, so only that row shows progress. */
  readonly installing = input<AiProvider | null>(null);

  readonly installRequested = output<AiProvider>();
  readonly recheckRequested = output<void>();

  protected readonly icons = {
    stored: Check,
    missing: TriangleAlert,
    replace: RefreshCw,
  };
}
