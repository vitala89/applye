import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Copy, LucideAngularModule, Mail } from 'lucide-angular';
import { FOLLOWUP_LANGUAGES, FollowupDraftService, ToastService } from '@applye/application';
import { PipelineCard, SupportedLanguage } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * The follow-up email composer inside the quick view: language, the draft
 * action, and the four editable fields once a draft exists.
 *
 * **It injects `FollowupDraftService` rather than providing it, deliberately.**
 * The modal provides it, so the draft's lifetime stays the modal's rather than
 * this section's. That matters because the section is gated on `card().overdue`,
 * and a status change can flip that flag - providing the service here would
 * destroy a draft the user is still editing the moment the card refreshes.
 *
 * The aliases below exist because the template writes several of these back
 * through `ngModel`, so they stay the same writable signals rather than views of
 * them - the same reason they were aliases on the modal.
 */
@Component({
  selector: 'app-followup-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './followup-composer.component.html',
  styleUrl: './followup-composer.component.scss',
})
export class FollowupComposerComponent {
  private readonly followup = inject(FollowupDraftService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  readonly card = input.required<PipelineCard>();

  protected readonly icons = { mail: Mail, copy: Copy };
  protected readonly FOLLOWUP_LANGUAGES = FOLLOWUP_LANGUAGES;

  protected readonly followupLanguage = this.followup.language;
  protected readonly followupSubject = this.followup.subject;
  protected readonly followupBody = this.followup.body;
  protected readonly followupDrafting = this.followup.drafting;
  protected readonly followupFromCache = this.followup.fromCache;
  protected readonly followupError = this.followup.error;
  protected readonly followupCopied = this.followup.copied;
  protected readonly followupTo = this.followup.to;
  protected readonly followupCc = this.followup.cc;
  protected readonly followupHasDraft = this.followup.hasDraft;

  protected async draftFollowup(): Promise<void> {
    try {
      await this.followup.draft(this.card());
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  protected langName(language: SupportedLanguage): string {
    return this.followup.langName(language);
  }

  protected onFollowupLanguageChange(language: SupportedLanguage): void {
    this.followup.changeLanguage(language);
  }

  protected copyFollowup(): Promise<void> {
    return this.followup.copy();
  }

  protected openFollowupInMail(): Promise<void> {
    return this.followup.openInMail();
  }
}
