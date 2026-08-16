import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ArrowUpRight, LucideAngularModule } from 'lucide-angular';
import { type ArchetypeFit, type CompensationVerdict, compareCompensation } from '@applye/core';
import {
  type FeedRow,
  DiscoverDetailStore,
  DiscoverPageStore,
  DiscoverProfileContextStore,
  DiscoverRowMatchStore,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { DiscoverDetailHeroComponent } from '../discover-detail-hero/discover-detail-hero.component';
import { DiscoverDetailScoreComponent } from '../discover-detail-score/discover-detail-score.component';

/**
 * The full-screen job detail: the hero, the parsed description and the score
 * panel beside it.
 *
 * Most of what it renders it reads from the stores the Discover page provides,
 * the way `app-discover-filters-bar` does. The five inputs are the exception,
 * and they are deliberate: `sourceLabel`, `posted`, `archetype` and `tip` are
 * computed by page methods that the **feed rows also use**, and the feed rows
 * stay on the page. Recomputing them here would duplicate four locale-dependent
 * helpers rather than share them.
 */
@Component({
  selector: 'app-discover-detail-screen',
  standalone: true,
  imports: [LucideAngularModule, DiscoverDetailHeroComponent, DiscoverDetailScoreComponent],
  templateUrl: './discover-detail-screen.component.html',
  styleUrl: './discover-detail-screen.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverDetailScreenComponent {
  readonly row = input.required<FeedRow>();
  readonly sourceLabel = input<string>('');
  readonly posted = input<string>('');
  readonly archetype = input<{ fit: ArchetypeFit; label: string } | null>(null);
  readonly tip = input<string>('');

  readonly saveRequested = output<Event>();
  readonly rescoreRequested = output<Event>();

  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly detail = inject(DiscoverDetailStore);
  protected readonly context = inject(DiscoverProfileContextStore);
  protected readonly match = inject(DiscoverRowMatchStore);
  protected readonly page = inject(DiscoverPageStore);

  protected readonly icons = { external: ArrowUpRight };

  /**
   * Open the posting on the board it came from. The click also sits inside the
   * row's own target, so the event stops here.
   */
  protected async openOriginal(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (row.sourceUrl) await openUrl(row.sourceUrl);
  }

  /** Salary-fit verdict for the open job against the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.context.compTarget(), this.detail.salary()),
  );
}
