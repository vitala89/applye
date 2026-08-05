import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  Bookmark,
  Building2,
  Check,
  ChevronLeft,
  LucideAngularModule,
  MapPin,
  Rss,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { type FeedRow } from '../discover-feed';
import { DetailVerdict } from '../discover-detail-score/discover-detail-score.component';

/** The archetype badge as the page resolved it: the tier and its label. */
export interface HeroArchetype {
  fit: string;
  label: string;
}

/**
 * The header of Discover's job-detail screen: the back link, the company mark,
 * the source and age line, the match chip, the title, the archetype badge, the
 * company and location row, the matched keywords, and Save.
 *
 * Everything shown is resolved on the page, because the feed needs the same
 * answers for every row it lists - `srcLabel`, `ago`, `archetypeBadge` and
 * `matchedKeywords` are all shared with it, and `detailScore` / `detailVerdict`
 * are shared with the sidebar. So they arrive as inputs and the two things the
 * user can do here leave as outputs.
 *
 * `initials` came along because the hero is the only place that renders it.
 */
@Component({
  selector: 'app-discover-detail-hero',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './discover-detail-hero.component.html',
  styleUrl: './discover-detail-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverDetailHeroComponent {
  protected readonly t = inject(TranslateService).t;

  readonly row = input.required<FeedRow>();
  /** Already resolved on the page: the feed labels every row the same way. */
  readonly sourceLabel = input.required<string>();
  readonly posted = input.required<string>();

  readonly score = input.required<number | null>();
  readonly verdict = input.required<DetailVerdict>();
  readonly archetype = input.required<HeroArchetype | null>();
  readonly matchedKeywords = input.required<string[]>();

  readonly backRequested = output<void>();
  readonly saveRequested = output<MouseEvent>();

  protected readonly icons = {
    back: ChevronLeft,
    source: Rss,
    company: Building2,
    location: MapPin,
    save: Bookmark,
    check: Check,
  };

  /** Up to two initials for the company mark; '?' when there is no company. */
  protected initials(company: string | null): string {
    const words = (company ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  }
}
