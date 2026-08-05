import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  Bookmark,
  Building2,
  Check,
  Clock,
  LucideAngularModule,
  MapPin,
  Rss,
  X,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { type FeedRow, type RowArchetype } from '../discover-feed';

/**
 * One row of Discover's triage feed: the title with its "new", saved and
 * archetype markers, the company line, the source/location/age meta line, the
 * matched keywords, and the Save and Dismiss actions.
 *
 * The row is presentation only. Every label it shows is already resolved on the
 * page - `srcLabel`, `ago`, `rowArchetype` and `matchedKeywords` are shared with
 * the detail hero, which takes the same four - and the three things the user can
 * do here leave as outputs, because opening, saving and dismissing all mutate
 * feed state the page owns.
 */
@Component({
  selector: 'app-discover-feed-row',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './discover-feed-row.component.html',
  styleUrl: './discover-feed-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverFeedRowComponent {
  protected readonly t = inject(TranslateService).t;

  readonly row = input.required<FeedRow>();
  /** Already resolved on the page: the detail hero labels a row the same way. */
  readonly sourceLabel = input.required<string>();
  readonly posted = input.required<string>();
  readonly archetype = input.required<RowArchetype | null>();
  readonly matchedKeywords = input.required<string[]>();

  readonly openRequested = output<void>();
  readonly saveRequested = output<MouseEvent>();
  readonly dismissRequested = output<MouseEvent>();

  protected readonly icons = {
    check: Check,
    company: Building2,
    source: Rss,
    location: MapPin,
    time: Clock,
    save: Bookmark,
    close: X,
  };
}
