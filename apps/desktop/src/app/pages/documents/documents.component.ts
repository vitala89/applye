import { Component, inject } from '@angular/core';
import { FileText, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page-coming-soon">
      <div class="state-empty">
        <lucide-icon [img]="icons.empty" [size]="40" class="state-empty__icon" aria-hidden="true" />
        <p class="state-empty__msg">{{ t()('documents.coming_soon') }}</p>
      </div>
    </div>
  `,
})
export class DocumentsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { empty: FileText };
}
