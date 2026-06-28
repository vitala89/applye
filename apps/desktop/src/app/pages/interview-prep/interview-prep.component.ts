import { Component, inject } from '@angular/core';
import { LucideAngularModule, Target } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-interview-prep',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page-coming-soon">
      <h2>{{ t()('interview.title') }}</h2>
      <div class="state-empty">
        <lucide-icon [img]="icons.empty" [size]="40" class="state-empty__icon" aria-hidden="true" />
        <p class="state-empty__msg">{{ t()('interview.coming_soon') }}</p>
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
export class InterviewPrepComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: Target };
}
