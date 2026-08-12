import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HelpCircle, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { JobIdentityPromptService } from '@applye/application';

/**
 * Asks the user to name a job the rules and the AI step both failed to name.
 *
 * Mounted once at the shell beside `UnsavedJobPromptComponent`, the shape the
 * Paste Job modal and the unsaved-job prompt already use: the jobs page is over
 * its size budget, and the parse chain that raises this has nowhere to render.
 *
 * It holds no state of its own. The two drafts live on the service, because
 * seeding them is part of opening the dialog and doing it from a `computed`
 * here is what Angular rejects with NG0600.
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

  /** Only the fields that are actually in question are named in the message. */
  protected readonly message = computed(() => {
    const request = this.prompt.open();
    if (!request) return '';
    if (request.missingCompany && request.missingTitle) return this.t()('jobs.identity_ask_both');
    return request.missingCompany
      ? this.t()('jobs.identity_ask_company')
      : this.t()('jobs.identity_ask_title');
  });

  /**
   * Why the AI did not settle it, when that is worth saying. "The posting does
   * not name an employer" and "nothing read the posting" look identical on
   * screen and mean opposite things, so the second one is stated.
   */
  protected readonly aiNote = computed(() => {
    const outcome = this.prompt.open()?.aiOutcome;
    if (outcome === 'no-provider') return this.t()('jobs.identity_ai_off');
    if (outcome === 'failed') return this.t()('jobs.identity_ai_failed');
    return '';
  });

  /** The failure verbatim, when there was one. */
  protected readonly aiError = computed(() => this.prompt.open()?.aiError ?? '');

  protected onCompanyInput(event: Event): void {
    this.prompt.setCompany((event.target as HTMLInputElement).value);
  }

  protected onTitleInput(event: Event): void {
    this.prompt.setTitle((event.target as HTMLInputElement).value);
  }

  /** Escape and a backdrop click both mean "not now" - so, skip. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.prompt.skip();
  }
}
