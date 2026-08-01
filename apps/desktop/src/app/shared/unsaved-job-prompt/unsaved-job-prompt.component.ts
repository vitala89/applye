import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AlertTriangle, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { UnsavedJobPromptService } from './unsaved-job-prompt.service';

/**
 * Asks before leaving a job that was analysed and never saved.
 *
 * Mounted once at the shell, like the Paste Job modal, because a route guard
 * has nowhere to render and the jobs page is at its size budget.
 */
@Component({
  selector: 'app-unsaved-job-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './unsaved-job-prompt.component.html',
  styleUrl: './unsaved-job-prompt.component.scss',
})
export class UnsavedJobPromptComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly prompt = inject(UnsavedJobPromptService);
  protected readonly warningIcon = AlertTriangle;

  /** Escape and a backdrop click both mean "I did not decide" - so, stay. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.prompt.stay();
  }
}
