import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Application,
  DocumentLibraryItem,
  Job,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  type CvGapAnswer,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvGapDialogService } from '@applye/application';
import { DocumentReviewTargetsService } from '@applye/application';
import { DocumentRegionTag } from '@applye/application';

import { CvGapDialog } from '../cv-gap-dialog.component';
import { CvPhotoPromptService } from '@applye/application';
import {
  ChooseDocumentRequest,
  JobDocumentCardsComponent,
} from '../job-document-cards/job-document-cards.component';
import { JobFinalChecksComponent } from '../job-final-checks/job-final-checks.component';

/**
 * The wizard's review-documents step: the market and language selects, the two
 * document cards, the final-checks card, and the CV-gap dialog either card can
 * raise.
 *
 * Extracted from the jobs page, which is over budget in its template and its
 * class at once. The two selects write through `DocumentReviewTargetsService`
 * and the gap dialog reads `CvGapDialogService`, both provided component-scoped
 * by the page - which is what retires the page's `documentReviewRegion`,
 * `documentReviewLanguage`, `documentRegionTags`, `portalLanguages`,
 * `regionLabel`, `nativeLang`, `onRegionChange`, `gapAnalyzing`,
 * `gapDialogOpen` and `gapQuestions` declarations.
 *
 * The library rows arrive as inputs: nothing this step can inject holds them,
 * because the page loads them from the document library on open.
 *
 * Every action continues into page orchestration - navigation into the document
 * editor, drafting, linking, the tailoring pipeline - so this step forwards and
 * decides nothing.
 */
@Component({
  selector: 'app-job-documents-step',
  standalone: true,
  imports: [FormsModule, CvGapDialog, JobDocumentCardsComponent, JobFinalChecksComponent],
  templateUrl: './job-documents-step.component.html',
  styleUrl: './job-documents-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDocumentsStepComponent {
  private readonly i18n = inject(TranslateService);
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly gapSvc = inject(CvGapDialogService);
  /** German-market photo prompt: raised by the region picker, rendered by the
   * page, so this step only tells the service the region changed. */
  private readonly photoPrompt = inject(CvPhotoPromptService);

  protected readonly t = this.i18n.t;
  protected readonly regionTags: DocumentRegionTag[] = ['de', 'us', 'uk', 'generic'];
  protected readonly languages = SUPPORTED_LANGUAGES;

  readonly job = input.required<Job | null>();
  readonly application = input.required<Application | null>();
  readonly matchingCvs = input.required<DocumentLibraryItem[]>();
  readonly coverLetters = input.required<DocumentLibraryItem[]>();
  readonly finalTailoredCvMd = input.required<string>();
  readonly tailoring = input.required<boolean>();

  readonly openCv = output<number>();
  readonly openCoverLetter = output<number>();
  readonly createCv = output<void>();
  readonly createCoverLetter = output<void>();
  readonly chooseDocument = output<ChooseDocumentRequest>();
  readonly runChecks = output<void>();
  readonly rescore = output<void>();
  readonly retailor = output<void>();
  readonly gapSubmit = output<{ answers: CvGapAnswer[]; saveToProfile: boolean }>();
  readonly gapCancel = output<void>();

  protected readonly region = this.targets.region;
  protected readonly language = this.targets.language;
  protected readonly gapAnalyzing = this.gapSvc.analyzing;
  protected readonly gapDialogOpen = this.gapSvc.open;
  protected readonly gapQuestions = this.gapSvc.questions;
  protected readonly gapKind = this.gapSvc.kind;

  /** Country name for a CV region tag ("Germany", not "DE") - the picker names
   * the market the CV is written for, and a bare code does not read as one. */
  protected regionLabel(region: DocumentRegionTag): string {
    return this.t()(`documents.cv_region_${region}`);
  }

  /** Endonym for a document language ("Deutsch", not "DE"), matching Settings. */
  protected nativeLang(language: SupportedLanguage): string {
    return LANGUAGE_NATIVE_NAMES[language];
  }

  /** Keep the final checks honest, then let the photo prompt decide whether
   * this market is worth raising it for. */
  protected onRegionChange(region: DocumentRegionTag): void {
    this.targets.setRegion(region);
    this.photoPrompt.onRegionChosen(region);
  }

  protected onLanguageChange(language: SupportedLanguage): void {
    this.targets.setLanguage(language);
  }
}
