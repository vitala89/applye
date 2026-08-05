import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/**
 * One dropdown in Discover's filter toolbar: a trigger carrying the number of
 * active choices, a backdrop that closes on click and on Escape, the panel, and
 * a foot holding the Clear action.
 *
 * The three filters - Sources, Type and Locations - are this shell three times
 * over; only the panel body differs, and that arrives as projected content, so
 * every symbol it binds (`sourceChecked`, `toggleWork`, `regionState`, the rest)
 * stays in the page's own template scope and never crosses this boundary. What
 * is left is a label, a count, and the request to clear.
 *
 * Open state lives here because nothing outside the menu ever read it: the page
 * held three signals whose only consumers were the three markup blocks that
 * moved.
 */
@Component({
  selector: 'app-discover-filter-menu',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './discover-filter-menu.component.html',
  styleUrl: './discover-filter-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverFilterMenuComponent {
  protected readonly t = inject(TranslateService).t;

  readonly label = input.required<string>();
  /** Active choices in this filter; zero means "all", and hides the badge. */
  readonly count = input.required<number>();
  /** Small print pinned in the foot, shown whatever the count. Locations uses
   * it to explain how unmatched countries are grouped; the others have none. */
  readonly footNote = input('');

  readonly cleared = output<void>();

  protected readonly open = signal(false);

  protected readonly icons = { chevron: ChevronDown };
}
