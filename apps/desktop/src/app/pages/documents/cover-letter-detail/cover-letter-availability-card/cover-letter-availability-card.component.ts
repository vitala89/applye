import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CoverLetterContentStore,
  CoverLetterDocumentStore,
  type CoverLetterTextField,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';

/**
 * The availability card: the four answers a German posting routinely asks a
 * letter to state - earliest start, salary expectation, notice period, and the
 * `Anlagen` line naming what travels with the application.
 *
 * They are part of the letter, so they are written straight into
 * `CoverLetterContentStore`. The region comes from `CoverLetterDocumentStore`
 * and only decides whether the DE hint is shown; the fields themselves are
 * offered for every region, because a posting anywhere may ask for them.
 */
@Component({
  selector: 'app-cover-letter-availability-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cover-letter-availability-card.component.html',
  styleUrl: './cover-letter-availability-card.component.scss',
})
export class CoverLetterAvailabilityCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  private readonly letter = inject(CoverLetterContentStore);
  private readonly docs = inject(CoverLetterDocumentStore);

  protected readonly regionTag = this.docs.regionTag;
  protected readonly earliestStart = this.letter.earliestStart;
  protected readonly salaryExpectation = this.letter.salaryExpectation;
  protected readonly noticePeriod = this.letter.noticePeriod;
  protected readonly attachments = this.letter.attachments;

  updateField(field: CoverLetterTextField, value: string): void {
    this.letter.updateField(field, value);
  }
}
