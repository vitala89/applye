import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgStyle } from '@angular/common';
import type { CvLanguagesSection } from '@applye/core';
import { leafPath, sectionLabelKey } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewEditingService } from '../cv-preview-editing.service';
import { CvPreviewStyleService } from '../cv-preview-style.service';
import { CvPreviewSelectionService } from '../cv-preview-selection.service';
import { CvPreviewEditModeService } from '../cv-preview-edit-mode.service';

/**
 * The CV preview's languages atom: the section title and one pipe-separated
 * line of languages, each selectable and inline-editable.
 *
 * Same shape as `CvPreviewHeaderComponent`, for the same reasons - see its
 * class comment for why an atom can be a child at all, and its stylesheet for
 * why the host is `display: contents`. All four preview services come from
 * `CvPreviewComponent` through the `ng-template`'s declaration injector; the
 * two inputs are data and render mode, nothing else.
 */
@Component({
  selector: 'app-cv-preview-languages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  templateUrl: './cv-preview-languages.component.html',
  styleUrl: './cv-preview-languages.component.scss',
})
export class CvPreviewLanguagesComponent {
  protected readonly edit = inject(CvPreviewEditingService);
  protected readonly css = inject(CvPreviewStyleService);
  protected readonly sel = inject(CvPreviewSelectionService);
  protected readonly mode = inject(CvPreviewEditModeService);
  protected readonly t = inject(TranslateService).t;

  readonly section = input.required<CvLanguagesSection>();
  /** Which pass is rendering - `'measure'` or `'page'`. Forwarded from the
   * outlet context's `$sheetRenderMode`; every interactive affordance is gated
   * on it through `sel.selectable`, so the measurement pass stays inert. */
  readonly renderMode = input.required<unknown>();

  protected readonly leafPath = leafPath;
  protected readonly sectionLabelKey = sectionLabelKey;

  /** Bound once here rather than at every template call site - see the header
   * component's own `selectable`. */
  protected selectable(): boolean {
    return this.sel.selectable(this.renderMode());
  }
}
