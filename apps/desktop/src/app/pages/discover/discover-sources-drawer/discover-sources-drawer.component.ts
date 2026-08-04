import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DiscoverSource } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { parseGeoScopes } from '@applye/core';
import { AtsBoardType, DiscoverSourcesService } from '../discover-sources.service';
import { narrowBuiltinsByMarkets, toggled } from '../discover-sources.util';
import { ChevronDown, Info, Plus, Trash2, X } from 'lucide-angular';

/**
 * The Sources drawer: which boards and feeds a scan runs against, and the forms
 * for adding more.
 *
 * Extracted from the Discover page, which is the largest file in the project by
 * some distance - its stylesheet alone was 1915 lines against a 400 budget. A
 * consumer audit found this the cleanest seam available: of the twenty-five
 * symbols the drawer's markup names, twenty-three are used nowhere else on the
 * page.
 *
 * The list itself belongs to `DiscoverSourcesService`, which the page provides,
 * because both sides read it - the page scans over the enabled sources and
 * counts them, this drawer edits them. Everything left here is drawer-local
 * view state: which groups are collapsed, whether the add forms are open, and
 * whether the market narrowing is being overridden.
 */
@Component({
  selector: 'app-discover-sources-drawer',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './discover-sources-drawer.component.html',
  styleUrl: './discover-sources-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverSourcesDrawerComponent {
  private readonly i18n = inject(TranslateService);
  private readonly sourcesSvc = inject(DiscoverSourcesService);

  protected readonly t = this.i18n.t;
  /** Only what this drawer's markup names. */
  protected readonly icons = {
    chevron: ChevronDown,
    close: X,
    info: Info,
    plus: Plus,
    remove: Trash2,
  };

  /** The selected local markets, which narrow which built-ins are listed. */
  readonly markets = input.required<string[]>();
  /** The saved geo scope, read only to label what a scan currently covers. */
  readonly geoScope = input.required<string>();

  readonly closed = output<void>();

  protected readonly sources = this.sourcesSvc.all;
  protected readonly builtinSources = this.sourcesSvc.builtin;
  protected readonly companyBoards = this.sourcesSvc.companyBoards;
  protected readonly userSources = this.sourcesSvc.user;
  protected readonly sourcesTotal = this.sourcesSvc.total;
  protected readonly enabledCount = this.sourcesSvc.enabledCount;
  protected readonly sourcesFailing = this.sourcesSvc.failing;
  protected readonly resultLine = (source: DiscoverSource) => this.sourcesSvc.resultLine(source);

  /** "Show all sources" override for the market narrowing. */
  protected readonly showAllSources = signal(false);
  protected readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  // add forms
  protected readonly boardFormOpen = signal(false);
  protected readonly boardType = signal<AtsBoardType>('ats_greenhouse');
  protected readonly boardSlug = signal('');
  protected readonly rssUrl = signal('');
  protected readonly rssName = signal('');

  private readonly marketNarrowedBuiltins = computed(() =>
    narrowBuiltinsByMarkets(this.builtinSources(), this.markets()),
  );

  protected readonly visibleBuiltinSources = computed(() =>
    this.showAllSources() ? this.builtinSources() : this.marketNarrowedBuiltins(),
  );

  protected readonly hiddenBuiltinCount = computed(
    () => this.builtinSources().length - this.marketNarrowedBuiltins().length,
  );

  protected groupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }

  protected toggleSourceGroup(key: string): void {
    this.collapsedGroups.update((set) => toggled(set, key));
  }

  /** Enabled count within one source group, for its header badge. */
  protected activeCount(list: DiscoverSource[]): number {
    return list.filter((s) => s.isEnabled).length;
  }

  protected typeBadge(source: DiscoverSource): string {
    const type = source.type ?? '';
    if (type.startsWith('ats_')) return 'ATS';
    return type.toUpperCase();
  }

  /** Mirrors the two geo modes: local markets win when set, exactly as the
   * scan engine reads them, so this label always names what is really used. */
  protected scopeLabel(): string {
    const markets = this.markets();
    const keys = parseGeoScopes(this.geoScope());
    let label: string;
    if (markets.length) {
      label = markets.map((m) => this.t()('settings.local_market_' + m)).join(', ');
    } else if (keys.length) {
      label = keys.map((k) => this.t()('discover.region_' + k)).join(', ');
    } else {
      label = this.t()('settings.geo_worldwide');
    }
    return this.t()('discover.scope_label').replace('{scope}', label);
  }

  protected toggleSource(source: DiscoverSource): Promise<void> {
    return this.sourcesSvc.setEnabled(source);
  }

  protected async addBoard(): Promise<void> {
    if (await this.sourcesSvc.addBoard(this.boardType(), this.boardSlug())) {
      this.boardSlug.set('');
      this.boardFormOpen.set(false);
    }
  }

  protected async addRss(): Promise<void> {
    if (await this.sourcesSvc.addRss(this.rssUrl(), this.rssName())) {
      this.rssUrl.set('');
      this.rssName.set('');
    }
  }

  protected removeSource(source: DiscoverSource, event: Event): Promise<void> {
    event.stopPropagation();
    return this.sourcesSvc.remove(source);
  }
}
