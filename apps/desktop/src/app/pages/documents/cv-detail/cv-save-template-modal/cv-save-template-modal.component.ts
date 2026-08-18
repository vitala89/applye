import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/**
 * "Save as template" dialog for the CV editor: one name field, cancel, confirm.
 *
 * The page decides whether it is mounted at all (`@if (saveTemplateOpen())`),
 * so this component has no open/closed input - it exists while it is shown. The
 * write and its toast stay on the page, which is where `CvDocumentStore` and the
 * failure wording live; `confirmed` is the only thing that leaves here.
 *
 * `.modal*` is deliberately kept encapsulated rather than shared. Those names
 * are generic and already defined by eight other component stylesheets with
 * their own values, so a global partial is the one form of reuse that would be
 * unsafe here - encapsulation is what makes a copy correct instead of risky.
 *
 * The two buttons are the opposite case and were the opposite mistake. They
 * carried `.btn-ghost` and `.btn-primary`, which **nothing declares** - the
 * design system's family is `.btn--ghost`, and a class that matches nothing
 * fails silently. They use `ButtonDirective` now, which is the one place those
 * class names are written.
 */
@Component({
  selector: 'app-cv-save-template-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective],
  templateUrl: './cv-save-template-modal.component.html',
  styleUrl: './cv-save-template-modal.component.scss',
})
export class CvSaveTemplateModalComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly name = input<string>('');
  readonly saving = input<boolean>(false);

  readonly nameChange = output<string>();
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();
}
