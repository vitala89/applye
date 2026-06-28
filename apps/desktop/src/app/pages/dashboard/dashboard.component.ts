import { Component, inject } from '@angular/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="page-coming-soon">
      <h2>{{ t()('dashboard.title') }}</h2>
      <div class="state-empty">
        <span class="state-empty__icon">📊</span>
        <p class="state-empty__msg">{{ t()('dashboard.coming_soon') }}</p>
      </div>
    </div>
  `,
  styles: [
    `
      .page-coming-soon {
        h2 {
          font-family: var(--font-mono);
          font-size: var(--text-xl);
          margin-bottom: var(--space-5);
          color: var(--text-primary);
        }
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
}
