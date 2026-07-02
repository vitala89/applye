import { Component, inject } from '@angular/core';
import { LucideAngularModule, Target } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-interview-prep',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page-coming-soon">
      <div class="state-empty">
        <lucide-icon [img]="icons.empty" [size]="40" class="state-empty__icon" aria-hidden="true" />
        <p class="state-empty__msg">{{ t()('interview.coming_soon') }}</p>
      </div>
    </div>
  `,
})
export class InterviewPrepComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: Target };
}
