import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, MoreHorizontal, X } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/**
 * The last cell of a tracker row: save/cancel while the row is being edited,
 * and the kebab that opens its menu otherwise.
 *
 * `menuToggled` emits the **trigger element**, not the event. The page anchors
 * the popup to the trigger's bounding box, and it used to read that from
 * `event.currentTarget` - which is only set while the event is being
 * dispatched. Emitting it across a component boundary would have kept working
 * by accident, because an output fires synchronously inside the handler, and
 * broken the day anything deferred it. The element is what the caller actually
 * needs, so that is what crosses (ADR-0005, amendment twenty-two).
 */
@Component({
  selector: 'app-tracker-row-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, LucideAngularModule],
  templateUrl: './tracker-row-actions.component.html',
  styleUrl: './tracker-row-actions.component.scss',
})
export class TrackerRowActionsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly editing = input(false);
  readonly saving = input(false);
  readonly menuOpen = input(false);

  readonly saved = output<void>();
  readonly cancelled = output<void>();
  /** The kebab itself, for the caller to anchor the popup to. */
  readonly menuToggled = output<HTMLElement>();

  protected readonly icons = {
    check: Check,
    close: X,
    menu: MoreHorizontal,
  };

  protected onMenu(event: MouseEvent): void {
    this.menuToggled.emit(event.currentTarget as HTMLElement);
  }
}
