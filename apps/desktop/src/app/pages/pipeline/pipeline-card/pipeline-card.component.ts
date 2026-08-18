import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Clock, Flag, LucideAngularModule, MapPin, TriangleAlert } from 'lucide-angular';
import { companyInitials, scoreClass, stageSegments, stageTotal } from '@applye/application';
import { PipelineCard } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * What a Kanban card draws: the company lockup, the priority flag, the location,
 * the interview stage track and the foot with the ATS score and the follow-up
 * date.
 *
 * **The `.card` box itself is deliberately NOT here.** It stays on the page, on
 * this component's own host element, because three rules in `_drag.scss` depend
 * on it being a page-declared class: `.card.cdk-drag-preview` has to match the
 * clone the CDK appends outside every component view, `.card.cdk-drag-animating`
 * has to beat it at equal specificity by coming later in the same file, and
 * `.col__list.cdk-drop-list-dragging .card` reaches from the drop list into the
 * card. `drag-styles.spec.ts` compiles the page sheet and asserts that cascade,
 * so moving `.card` would move the thing that test is about.
 *
 * `cdkDrag` stays on the host for the same reason and one more: `CdkDropList`
 * finds its draggables through content children, and a `cdkDrag` inside this
 * component's own view would not be content of the list.
 *
 * **There is no `<ng-content>` here, and that was measured rather than assumed.**
 * The drag placeholder is declared between this component's tags, so it looks
 * like projected content - but `*cdkDragPlaceholder` is a structural directive
 * that renders nothing at its declaration site. `CdkDrag` finds it as a content
 * child, keeps the `TemplateRef`, and instantiates it itself when a drag starts.
 * An `<ng-content>` was written here first and deleting it changed nothing at
 * all, which is what says it was never load-bearing.
 */
@Component({
  selector: 'app-pipeline-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './pipeline-card.component.html',
  styleUrl: './pipeline-card.component.scss',
})
export class PipelineCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly card = input.required<PipelineCard>();

  /**
   * Whether this card's column draws the interview stage track. A property of
   * the column rather than of the card: an application can carry a stage after
   * it has moved on to Offer, and the track belongs to Interview.
   */
  readonly showTrack = input(false);

  /** Pure card drawing, from `libs/application`. */
  protected readonly initials = companyInitials;
  protected readonly segments = stageSegments;
  protected readonly stageTotal = stageTotal;
  protected readonly scoreClass = scoreClass;
  protected readonly placeholder = '-';

  protected readonly icons = { flag: Flag, pin: MapPin, alert: TriangleAlert, clock: Clock };

  /** Presentation, and therefore the view's: locale-dependent, and the
   * application layer holds no locales. */
  protected formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}
