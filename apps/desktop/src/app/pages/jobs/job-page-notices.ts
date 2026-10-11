import { Injectable, effect, inject } from '@angular/core';
import {
  CoverLetterTailorService,
  CvGapDialogService,
  DocumentReviewStatusService,
  JobDetailLifecycleStore,
  JobDetailStore,
  PortalAnswersService,
  TailoringService,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';

/**
 * Toasts the job screen's buried failures. The stores record them; this is
 * the only place on the page that decides to say so. A null or empty value
 * is the resting state and stays quiet.
 */
@Injectable()
export class JobPageNotices {
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;
  private readonly review = inject(DocumentReviewStatusService);
  private readonly detail = inject(JobDetailStore);
  private readonly lifecycle = inject(JobDetailLifecycleStore);
  private readonly tailoring = inject(TailoringService);
  private readonly portal = inject(PortalAnswersService);
  private readonly gap = inject(CvGapDialogService);
  private readonly letters = inject(CoverLetterTailorService);

  constructor() {
    effect(() => {
      const message = this.review.unexpectedFailure();
      if (message) this.toast.error(message);
    });
    effect(() => {
      const message = this.detail.loadError();
      if (message) this.toast.error(message);
    });
    effect(() => {
      const message = this.lifecycle.partialLoadError();
      if (message) this.toast.error(message);
    });
    effect(() => {
      const warning = this.tailoring.baselineWarning();
      if (warning) this.toast.warning(warning);
    });
    effect(() => {
      if (!this.portal.error()) return;
      const status = this.portal.status();
      if (status) this.toast.error(status);
    });
    effect(() => {
      const error = this.gap.analyzeError();
      if (error) this.toast.warning(`${this.t()('jobs.gap_analysis_unavailable')} ${error}`);
    });
    effect(() => {
      const error = this.letters.error();
      if (error) this.toast.error(error);
    });
  }
}
