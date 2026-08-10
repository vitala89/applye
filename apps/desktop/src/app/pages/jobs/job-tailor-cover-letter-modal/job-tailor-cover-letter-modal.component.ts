import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentLibraryItem, SUPPORTED_LANGUAGES } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CoverLetterTailorService } from '../../../shared/cover-letter-tailor.service';

/**
 * "Tailor an existing cover letter to this job": pick one from the library,
 * pick an output language, run it.
 *
 * The selection, the language, the open flag, the in-flight flag and the error
 * are all `CoverLetterTailorService`'s already, so this injects it. The list of
 * cover letters is the page's - it loads and caches it - so it arrives as an
 * input. Running is the page's too: it navigates to the document afterwards.
 */
@Component({
  selector: 'app-job-tailor-cover-letter-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './job-tailor-cover-letter-modal.component.html',
  styleUrl: './job-tailor-cover-letter-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobTailorCoverLetterModalComponent {
  protected readonly tailor = inject(CoverLetterTailorService);
  protected readonly t = inject(TranslateService).t;

  /** Supported document languages, for the output-language select. */
  protected readonly languages = SUPPORTED_LANGUAGES;

  readonly coverLetters = input<DocumentLibraryItem[]>([]);

  readonly confirmed = output<void>();
}
