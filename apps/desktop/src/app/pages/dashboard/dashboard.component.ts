import { Component, inject } from '@angular/core';
import { LayoutDashboard, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page-coming-soon">
      <div class="state-empty">
        <lucide-icon [img]="icons.empty" [size]="40" class="state-empty__icon" aria-hidden="true" />
        <p class="state-empty__msg">{{ t()('dashboard.coming_soon') }}</p>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: LayoutDashboard };
}
