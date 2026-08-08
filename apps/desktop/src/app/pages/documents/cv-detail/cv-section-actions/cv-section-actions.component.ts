import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ChevronDown, ChevronUp, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/**
 * The Regenerate / move-up / move-down controls in a CV section head.
 *
 * It owns nothing and decides nothing: which controls are offered, and whether
 * each is disabled, are the page's answers about the section list as a whole -
 * a section can only move up past an unlocked neighbour, and only the page
 * knows the neighbour. Passing booleans rather than the section and its index
 * keeps that reasoning in one place instead of splitting it across a boundary.
 */
@Component({
  selector: 'app-cv-section-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, ButtonDirective],
  templateUrl: './cv-section-actions.component.html',
  styleUrl: './cv-section-actions.component.scss',
})
export class CvSectionActionsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** Locked sections cannot be reordered, so they show no move controls. */
  readonly movable = input(true);
  readonly regeneratable = input(false);
  /** Any regeneration in flight disables the button, not just this section's -
   * the page runs them one at a time. */
  readonly regenerateDisabled = input(false);
  /** True while *this* section is the one regenerating, which is what spins. */
  readonly regenerating = input(false);
  readonly moveUpDisabled = input(false);
  readonly moveDownDisabled = input(false);

  readonly regenerated = output<void>();
  readonly movedUp = output<void>();
  readonly movedDown = output<void>();

  protected readonly icons = { regenerate: RefreshCw, moveUp: ChevronUp, moveDown: ChevronDown };
}
