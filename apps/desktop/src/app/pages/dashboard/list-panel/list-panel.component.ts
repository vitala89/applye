import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LucideAngularModule, type LucideIconData } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/** What either list draws for one row. The page resolves everything into text
 *  before it gets here - the monogram, the relative time, the status label and
 *  whether the interview is soon are all already decided. */
export interface ListPanelRow {
  /** Where the row goes, ready for the page's own `go()`. */
  route: string;
  monogram: string;
  role: string;
  company: string;
  /** Interviews only: the stage name, and whether it is inside the soon window. */
  badge?: string;
  badgeAccent?: boolean;
  /** Interviews only: the relative time the stage is scheduled for. */
  time?: string;
  /** Recent jobs only: the status label, and whether the job has been applied to. */
  pill?: string;
  pillActive?: boolean;
}

/** Which trailing element this panel draws. It is a property of the panel
 *  rather than of a row, because the loading skeleton has to draw a placeholder
 *  the right shape before there are any rows to look at. */
export type ListPanelTrailing = 'time' | 'pill';

/**
 * The dashboard's two list panels: a titled card with a link, a list of rows,
 * a loading skeleton and an empty state.
 *
 * **A view, with no view of the store.** `Upcoming interviews` and `Recent jobs`
 * were the same hundred lines of markup written twice, differing only in their
 * labels, their destinations and their trailing element. Everything that decides
 * *which* rows exist - the five-row cap, the claimed-only rule, the soon window
 * - stays on the page, which is also where the translations are.
 */
@Component({
  selector: 'app-dashboard-list-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './list-panel.component.html',
  styleUrl: './list-panel.component.scss',
})
export class ListPanelComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly title = input.required<string>();
  readonly linkLabel = input.required<string>();
  readonly loading = input(false);
  readonly rows = input.required<ListPanelRow[]>();
  readonly trailing = input.required<ListPanelTrailing>();

  readonly emptyIcon = input.required<LucideIconData>();
  readonly emptyTitle = input.required<string>();
  readonly emptyBody = input.required<string>();

  readonly linkClicked = output<void>();
  readonly rowClicked = output<ListPanelRow>();
}
