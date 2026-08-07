import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import { CoverLetterStyleStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';

/**
 * The per-block style override popover: font, size, colour and weight for one
 * block or one body paragraph, plus its reset.
 *
 * **Rendered through the page's `#stylePopover` template, not directly.**
 * `CoverLetterBlockComponent` takes a `TemplateRef` and stamps it where the
 * block's own markup wants it, so the page keeps a one-line `ng-template` that
 * instantiates this component with the key it was handed. Turning that contract
 * into a component input would change `cover-letter-block`'s API for no gain.
 *
 * It injects `CoverLetterStyleStore` rather than taking inputs and emitting
 * outputs: the store is provided on the page, so every child of it resolves the
 * same instance through the element injector, and a popover that only reads and
 * writes style has nothing else to say to its parent.
 */
@Component({
  selector: 'app-cover-letter-style-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cover-letter-style-popover.component.html',
})
export class CoverLetterStylePopoverComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly styles = inject(CoverLetterStyleStore);

  /** Which block or paragraph this popover edits - a `CoverLetterBlockKey`, or
   * `body_<i>` for a paragraph. */
  readonly styleKey = input.required<string>();

  protected readonly fontOptions = CV_ATS_SAFE_FONTS;
  protected readonly style = this.styles.style;
}
