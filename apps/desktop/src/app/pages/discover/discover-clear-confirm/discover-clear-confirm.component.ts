import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslateService } from '@applye/i18n';

/**
 * The confirmation in front of clearing the Discover feed - the one destructive
 * action on this page.
 *
 * **A view, and deliberately not the decision.** It reports which button was
 * pressed and nothing else: whether a wipe is running, whether the dialog closes
 * afterwards, and what a failure leaves on screen are all `DiscoverPageStore`'s,
 * which keeps the dialog open on failure so a wipe that did not happen cannot
 * look like one that did.
 *
 * The backdrop stays on the page. It is a different target with a different
 * handler - a click outside cancels - and keeping it there is what lets this
 * component stop a click on itself from reaching it.
 *
 * `.dv-btn` and its modifiers are not declared here: they come from
 * `_discover-controls.scss`, which `styles.scss` emits once globally, so they
 * reach this component without a copy.
 */
@Component({
  selector: 'app-discover-clear-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './discover-clear-confirm.component.html',
  styleUrl: './discover-clear-confirm.component.scss',
})
export class DiscoverClearConfirmComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** A wipe is in flight: both actions go inert so a second click cannot start
   *  a second one. */
  readonly busy = input(false);

  readonly cancelled = output<void>();
  readonly confirmed = output<void>();
}
