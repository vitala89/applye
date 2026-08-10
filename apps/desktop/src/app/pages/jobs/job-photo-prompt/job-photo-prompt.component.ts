import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { CvPhotoPromptService } from '../cv-photo-prompt.service';

/**
 * German-market photo prompt. A photo is conventional on a German CV and
 * unusual elsewhere, so this is raised only when the CV's market is set to
 * Germany, and only once per visit to a job.
 *
 * Whether it is open, and whether it is busy, belong to `CvPhotoPromptService`.
 * Whether the profile already has a photo is the page's - it decides which of
 * the two confirm labels applies - and accepting is the page's too, because it
 * writes the photo onto the document being prepared.
 */
@Component({
  selector: 'app-job-photo-prompt',
  standalone: true,
  templateUrl: './job-photo-prompt.component.html',
  styleUrl: './job-photo-prompt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobPhotoPromptComponent {
  protected readonly photoPrompt = inject(CvPhotoPromptService);
  protected readonly t = inject(TranslateService).t;

  /** Null when the profile carries no photo yet: the confirm then offers to
   * add one first rather than claiming it will attach one. */
  readonly profilePhoto = input<string | null>(null);

  readonly accepted = output<void>();
}
