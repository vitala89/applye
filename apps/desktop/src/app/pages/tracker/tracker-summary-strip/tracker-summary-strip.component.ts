import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Activity, Clock, Layers, LucideAngularModule } from 'lucide-angular';
import { TrackerRowsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';

/**
 * The three totals under the table: how many applications, what share replied,
 * and how long a reply takes on average.
 *
 * It reads `TrackerRowsStore.summary` directly - the store is provided on
 * `TrackerComponent`, so this resolves the same instance - and takes nothing
 * and emits nothing (ADR-0005, amendment twenty-two).
 */
@Component({
  selector: 'app-tracker-summary-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './tracker-summary-strip.component.html',
  styleUrl: './tracker-summary-strip.component.scss',
})
export class TrackerSummaryStripComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  private readonly rows = inject(TrackerRowsStore);
  protected readonly summary = this.rows.summary;

  protected readonly icons = { layers: Layers, activity: Activity, clock: Clock };
}
