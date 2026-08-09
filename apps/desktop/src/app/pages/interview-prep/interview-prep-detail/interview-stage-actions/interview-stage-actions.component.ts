import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule, Pencil, Trash2 } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/**
 * The move-up / move-down / edit / delete controls on one interview stage.
 *
 * It owns nothing and decides nothing. Whether a stage can move is a fact
 * about its position in the list, which only the page knows, so the page
 * passes the two answers rather than the stage and its index - the same shape
 * `cv-section-actions` uses, and for the same reason: the reasoning about the
 * list stays in one place instead of being split across a boundary.
 *
 * Extracted because folding `.ipd__icon-btn` onto `appButton` costs +2 lines
 * per button and the page's template was already 311 against a budget of 300.
 * The file-size ratchet refusing the fold is what located this seam
 * (ADR-0005, amendments eighteen and nineteen).
 */
@Component({
  selector: 'app-interview-stage-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, ButtonDirective],
  templateUrl: './interview-stage-actions.component.html',
  styleUrl: './interview-stage-actions.component.scss',
})
export class InterviewStageActionsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly moveUpDisabled = input(false);
  readonly moveDownDisabled = input(false);

  readonly movedUp = output<void>();
  readonly movedDown = output<void>();
  readonly edited = output<void>();
  readonly deleted = output<void>();

  protected readonly icons = {
    up: ArrowUp,
    down: ArrowDown,
    edit: Pencil,
    delete: Trash2,
  };
}
