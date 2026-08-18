import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgStyle } from '@angular/common';
import type { CvSummarySection, CvTextRun } from '@applye/core';
import { leafPath, parseInlineEmphasis, sectionLabelKey, wordTokens } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewEditingService } from '../cv-preview-editing.service';
import { CvPreviewStyleService } from '../cv-preview-style.service';
import { CvPreviewSelectionService } from '../cv-preview-selection.service';
import { CvPreviewEditModeService } from '../cv-preview-edit-mode.service';

/**
 * The CV preview's summary atom: the section title and the summary body,
 * selectable, inline-editable, and click-a-word-to-bold when selected.
 *
 * Same shape as `CvPreviewHeaderComponent`, for the same reasons - see its
 * class comment for why an atom can be a child at all, and its stylesheet for
 * why the host is `display: contents`. All four preview services come from
 * `CvPreviewComponent` through the `ng-template`'s declaration injector.
 */
@Component({
  selector: 'app-cv-preview-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  templateUrl: './cv-preview-summary.component.html',
  styleUrl: './cv-preview-summary.component.scss',
})
export class CvPreviewSummaryComponent {
  protected readonly edit = inject(CvPreviewEditingService);
  protected readonly css = inject(CvPreviewStyleService);
  protected readonly sel = inject(CvPreviewSelectionService);
  protected readonly mode = inject(CvPreviewEditModeService);
  protected readonly t = inject(TranslateService).t;

  readonly section = input.required<CvSummarySection>();

  /** Which pass is rendering - `'measure'` or `'page'`. Forwarded from the
   * outlet context's `$sheetRenderMode`; every interactive affordance is gated
   * on it through `sel.selectable`, so the measurement pass stays inert. */
  readonly renderMode = input.required<unknown>();

  protected readonly leafPath = leafPath;
  protected readonly sectionLabelKey = sectionLabelKey;

  /** Split a summary/bullet line into clickable word tokens - rendered only for
   * the SELECTED body leaf, so clicking a word toggles its bold. */
  protected readonly wordTokens = wordTokens;

  protected runs(text: string): CvTextRun[] {
    return parseInlineEmphasis(text);
  }

  /** Bound once here rather than at every template call site - see the header
   * component's own `selectable`. */
  protected selectable(): boolean {
    return this.sel.selectable(this.renderMode());
  }

  /** Toggle bold for one word of the summary body. The rewrite itself belongs
   * to `CvPreviewEditingService`, which owns the emit sink; this stops the
   * click from also re-selecting the leaf underneath. */
  protected toggleWord(wordIndex: number, event: Event): void {
    event.stopPropagation();
    this.edit.toggleSummaryWord(this.section(), wordIndex);
  }
}
