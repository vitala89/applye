import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentExportService, ExportFormat } from '../../../shared/document-export.service';
import { ReviewDocumentKind } from '@applye/application';
import { JobActionsService } from '../../../shared/job-actions.service';
import { LinkedDocumentsService } from '@applye/application';
import { WizardActivityService } from '@applye/application';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/**
 * The wizard's export-and-apply step: the two export buttons with their status
 * line, the open/reveal actions for whatever was last written, and the apply
 * summary underneath.
 *
 * Extracted from the jobs page, which is over budget in its template, its class
 * and its stylesheet at once. Everything it renders comes from services the
 * page provides component-scoped, so it injects them directly rather than
 * taking them as inputs - which is what retires the four `exportSvc` aliases
 * and the three one-line forwarding methods the page kept only so its template
 * could name them.
 *
 * `Start over` is emitted, not handled. It resets the tailoring, the score and
 * the export state and then moves the wizard back to step 1, which is page
 * orchestration this step knows nothing about.
 */
@Component({
  selector: 'app-job-export-apply-step',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './job-export-apply-step.component.html',
  styleUrl: './job-export-apply-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobExportApplyStepComponent {
  private readonly i18n = inject(TranslateService);
  private readonly exportSvc = inject(DocumentExportService);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly jobActions = inject(JobActionsService);
  private readonly activity = inject(WizardActivityService);

  protected readonly t = this.i18n.t;
  protected readonly icons = JOB_DETAIL_ICONS;

  readonly job = input.required<Job | null>();

  /** Resetting the wizard and navigating back to step 1 is the page's. */
  readonly startOver = output<void>();

  protected readonly exporting = this.exportSvc.exporting;
  protected readonly exportStatus = this.exportSvc.status;
  protected readonly exportError = this.exportSvc.error;
  protected readonly lastExport = this.exportSvc.lastExport;
  protected readonly linkedCv = this.linkedDocs.cv;
  protected readonly linkedCoverLetter = this.linkedDocs.coverLetter;
  protected readonly actionMsg = this.jobActions.message;

  /** A tailoring run in flight hides the export half: the documents it is
   * rewriting are the ones the buttons would write out. */
  protected readonly tailoring = computed(() =>
    this.activity.isRunning(this.job()?.id ?? -1, 'tailoring'),
  );

  protected doExport(kind: ReviewDocumentKind, format: ExportFormat): Promise<void> {
    return this.exportSvc.run(
      kind,
      format,
      kind === 'cv' ? this.linkedCv() : this.linkedCoverLetter(),
      (committed) => this.linkedDocs.commit(committed),
    );
  }

  protected openExportedFile(path: string): void {
    this.exportSvc.openFile(path);
  }

  protected revealExportedFile(path: string): void {
    this.exportSvc.revealFile(path);
  }
}
