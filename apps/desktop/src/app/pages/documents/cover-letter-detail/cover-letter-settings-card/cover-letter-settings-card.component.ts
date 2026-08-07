import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule } from 'lucide-angular';
import type { CoverLetterLength, CoverLetterTone } from '@applye/core';
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES } from '@applye/core';
import { CoverLetterContentStore, CoverLetterDocumentStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';

/**
 * The settings card: which region the letter is filed under, whether it is that
 * region's default, and the tone and length the AI writes to.
 *
 * The four controls belong to two different owners and the card writes to both
 * directly - region and the default flag are row fields on
 * `CoverLetterDocumentStore`, tone and length are part of the letter on
 * `CoverLetterContentStore`. Both are provided on the page, so this resolves the
 * same instances through the element injector.
 */
@Component({
  selector: 'app-cover-letter-settings-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cover-letter-settings-card.component.html',
  styleUrl: './cover-letter-settings-card.component.scss',
})
export class CoverLetterSettingsCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  private readonly docs = inject(CoverLetterDocumentStore);
  private readonly letter = inject(CoverLetterContentStore);

  protected readonly icons = { check: Check };
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];
  protected readonly toneOptions = COVER_LETTER_TONES;
  protected readonly lengthOptions = COVER_LETTER_LENGTHS;

  protected readonly regionTag = this.docs.regionTag;
  protected readonly isDefault = this.docs.isDefault;
  protected readonly tone = this.letter.tone;
  protected readonly length = this.letter.length;

  setTone(tone: CoverLetterTone): void {
    this.letter.setTone(tone);
  }

  setLength(length: CoverLetterLength): void {
    this.letter.setLength(length);
  }
}
