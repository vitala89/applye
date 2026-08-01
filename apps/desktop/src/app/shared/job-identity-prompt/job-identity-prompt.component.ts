import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HelpCircle, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { JobIdentityPromptService } from './job-identity-prompt.service';

/**
 * Asks the user to name a job the rules and the AI step both failed to name.
 *
 * Mounted once at the shell beside `UnsavedJobPromptComponent`, the shape the
 * Paste Job modal and the unsaved-job prompt already use: the jobs page is over
 * its size budget, and the parse chain that raises this has nowhere to render.
 */
@Component({
  selector: 'app-job-identity-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './job-identity-prompt.component.html',
  styleUrl: './job-identity-prompt.component.scss',
})
export class JobIdentityPromptComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly prompt = inject(JobIdentityPromptService);
  protected readonly askIcon = HelpCircle;

  protected readonly company = signal('');
  protected readonly title = signal('');
  /** The last request these drafts were seeded from, so a newly opened dialog
   * starts from what is known rather than from the previous job's answer. */
  private seeded: unknown = null;

  /**
   * Seeding on read rather than in an effect: the dialog is created once and
   * reopened many times, and a computed read from the template is the only
   * point that is guaranteed to run before the inputs are shown.
   */
  protected readonly request = computed(() => {
    const request = this.prompt.open();
    if (request && request !== this.seeded) {
      this.seeded = request;
      this.company.set(request.company);
      this.title.set(request.title);
    }
    return request;
  });

  /** Only the fields that are actually in question are named in the message. */
  protected readonly message = computed(() => {
    const request = this.request();
    if (!request) return '';
    if (request.missingCompany && request.missingTitle) return this.t()('jobs.identity_ask_both');
    return request.missingCompany
      ? this.t()('jobs.identity_ask_company')
      : this.t()('jobs.identity_ask_title');
  });

  protected onCompanyInput(event: Event): void {
    this.company.set((event.target as HTMLInputElement).value);
  }

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected save(): void {
    this.prompt.save({ company: this.company().trim(), title: this.title().trim() });
  }

  /** Escape and a backdrop click both mean "not now" - so, skip. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.prompt.skip();
  }
}
