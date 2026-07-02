import { Component, inject } from '@angular/core';
import { BarChart3, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

// Stub: the analytics dashboard is built in a later phase.
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page-coming-soon">
      <div class="state-empty">
        <lucide-icon [img]="icons.empty" [size]="40" class="state-empty__icon" aria-hidden="true" />
        <p class="state-empty__msg">{{ t()('common.coming_soon') }}</p>
      </div>
    </div>
  `,
})
export class AnalyticsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly icons = { empty: BarChart3 };
}
