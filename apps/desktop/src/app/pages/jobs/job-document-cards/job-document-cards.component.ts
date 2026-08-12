import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Application, DocumentLibraryItem, Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentGenService, ReviewDocumentKind } from '@applye/application';
import { CvGapDialogService } from '@applye/application';
import { FinalChecksService } from '@applye/application';
import { LinkedDocumentsService } from '@applye/application';
import { DocumentReviewStatusService } from '@applye/application';
import { documentCardStatus, documentStatusKey } from '@applye/application';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/** What the choose-existing selects ask the page to link. */
export interface ChooseDocumentRequest {
  kind: ReviewDocumentKind;
  id: number | null;
}

/**
 * The CV and cover-letter review cards in the wizard's documents step: each
 * one's status badge, its create/regenerate/review buttons, and the
 * choose-an-existing-document select underneath.
 *
 * Extracted from the jobs page, which is over budget in both the template and
 * the class. Everything the cards render comes from services the page already
 * provides component-scoped, so this injects them directly rather than taking
 * them as inputs - which is what removes the nine alias declarations the page
 * only kept so its template could name them.
 *
 * Deliberately does no work of its own. Creating a draft, opening the editor
 * and linking a chosen document all stay on the page, because each of them
 * continues into flows the cards know nothing about; the cards emit and the
 * page decides.
 */
@Component({
  selector: 'app-job-document-cards',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './job-document-cards.component.html',
  styleUrl: './job-document-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDocumentCardsComponent {
  private readonly i18n = inject(TranslateService);
  private readonly docGen = inject(DocumentGenService);
  private readonly gapSvc = inject(CvGapDialogService);
  private readonly finalChecksSvc = inject(FinalChecksService);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);

  protected readonly t = this.i18n.t;
  protected readonly icons = JOB_DETAIL_ICONS;
  protected readonly documentStatusKey = documentStatusKey;

  readonly job = input.required<Job | null>();
  readonly application = input.required<Application | null>();
  readonly matchingCvs = input.required<DocumentLibraryItem[]>();
  readonly coverLetters = input.required<DocumentLibraryItem[]>();
  /** Empty until a tailoring pass has produced a CV, which is what the create
   * and regenerate buttons need before they can do anything. */
  readonly finalTailoredCvMd = input.required<string>();

  readonly openCv = output<number>();
  readonly openCoverLetter = output<number>();
  readonly createCv = output<void>();
  readonly createCoverLetter = output<void>();
  readonly chooseDocument = output<ChooseDocumentRequest>();

  protected readonly linkedCv = this.linkedDocs.cv;
  protected readonly linkedCoverLetter = this.linkedDocs.coverLetter;
  protected readonly chooseCvOpen = this.reviewStatus.chooseCvOpen;
  protected readonly chooseCoverLetterOpen = this.reviewStatus.chooseCoverLetterOpen;
  protected readonly documentReviewStatus = this.reviewStatus.status;
  protected readonly documentReviewError = this.reviewStatus.error;

  private readonly jobId = computed(() => this.job()?.id ?? -1);
  protected readonly preparingCv = computed(() => this.docGen.isPreparing(this.jobId(), 'cv'));
  protected readonly preparingCoverLetter = computed(() =>
    this.docGen.isPreparing(this.jobId(), 'cover_letter'),
  );

  private readonly finalCheckState = computed(() => ({
    hasCheckedInput: !!this.finalChecksSvc.checks()?.inputHash,
    outdated: this.finalChecksSvc.outdated(),
  }));

  protected readonly cvReviewStatus = computed(() =>
    documentCardStatus({
      ...this.finalCheckState(),
      preparing: this.preparingCv(),
      awaitingInput: this.gapSvc.open(),
      linked: !!this.linkedCv(),
    }),
  );

  protected readonly coverLetterReviewStatus = computed(() =>
    documentCardStatus({
      ...this.finalCheckState(),
      preparing: this.preparingCoverLetter(),
      awaitingInput: false,
      linked: !!this.linkedCoverLetter(),
    }),
  );
}
