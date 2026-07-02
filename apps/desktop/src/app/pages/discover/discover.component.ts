import { Component, inject } from '@angular/core';
import { Compass, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

// Stub: the curated job-discovery feed is built in Phase 7.
@Component({
  selector: 'app-discover',
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
export class DiscoverComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly icons = { empty: Compass };
}
