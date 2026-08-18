import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgStyle } from '@angular/common';
import type { CvExperienceSection, CvSectionKey, CvTextRun } from '@applye/core';
import { leafPath, parseInlineEmphasis, wordTokens } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewEditingService } from '../cv-preview-editing.service';
import { CvPreviewStyleService } from '../cv-preview-style.service';
import { CvPreviewSelectionService } from '../cv-preview-selection.service';
import { CvPreviewEditModeService } from '../cv-preview-edit-mode.service';

/**
 * The CV preview's experience-bullet atom: one `<ul>` per bullet, selectable,
 * inline-editable, and click-a-word-to-bold when selected.
 *
 * Same shape as `CvPreviewHeaderComponent`, for the same reasons - see its
 * class comment for why an atom can be a child at all, and its stylesheet for
 * why the host is `display: contents`. All four preview services come from
 * `CvPreviewComponent` through the `ng-template`'s declaration injector.
 */
@Component({
  selector: 'app-cv-preview-exp-bullet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  templateUrl: './cv-preview-exp-bullet.component.html',
  styleUrl: './cv-preview-exp-bullet.component.scss',
})
export class CvPreviewExpBulletComponent {
  protected readonly edit = inject(CvPreviewEditingService);
  protected readonly css = inject(CvPreviewStyleService);
  protected readonly sel = inject(CvPreviewSelectionService);
  protected readonly mode = inject(CvPreviewEditModeService);
  protected readonly t = inject(TranslateService).t;

  readonly bullet = input.required<string>();
  readonly section = input.required<CvExperienceSection>();
  readonly key = input.required<CvSectionKey>();
  readonly i = input.required<number>();
  readonly b = input.required<number>();

  /** Which pass is rendering - `'measure'` or `'page'`. Forwarded from the
   * outlet context's `$sheetRenderMode`; every interactive affordance is gated
   * on it through `sel.selectable`, so the measurement pass stays inert. */
  readonly renderMode = input.required<unknown>();

  protected readonly leafPath = leafPath;

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

  /** Toggle bold for one word of this bullet - see the summary atom's own
   * `toggleWord` for why the rewrite lives on the editing service. */
  protected toggleWord(wordIndex: number, event: Event): void {
    event.stopPropagation();
    this.edit.toggleBulletWord(this.section(), this.i(), this.b(), wordIndex);
  }
}
