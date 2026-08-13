import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgStyle } from '@angular/common';
import type { CvPersonalDetailsSection, PhotoPlacement } from '@applye/core';
import { buildContactLine, leafPath, sectionLabelKey } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewEditingService } from '../cv-preview-editing.service';
import { CvPreviewStyleService } from '../cv-preview-style.service';
import { CvPreviewSelectionService } from '../cv-preview-selection.service';
import { CvPreviewEditModeService } from '../cv-preview-edit-mode.service';

/**
 * The CV preview's header atom: name, title, optional photo, and the contact
 * line - selectable and inline-editable like every other atom.
 *
 * The first of the eight atom templates to leave `cv-preview.component.html`
 * (895/300). It stays reachable as an `ng-template` there, four lines long,
 * because `<lib-paginated-sheet>` takes a `TemplateRef` and not a component:
 * the wrapper forwards the outlet context to this component's inputs.
 *
 * **It injects nothing it is given, and is given nothing it can inject.** All
 * four preview services are provided by `CvPreviewComponent`, and Angular
 * resolves them here through the `ng-template`'s DECLARATION injector rather
 * than the paginator's insertion point - which is why this component can exist
 * at all. A 2026-08-04 decision recorded that no atom could become a child
 * while the selection and edit-mode protocols lived on the component class,
 * because the boundary would have been ~20 inputs against a campaign precedent
 * of eleven; #439 and #440 are what discharged it. Six inputs remain, all data.
 *
 * The host is `display: contents` (see the stylesheet, which explains why).
 */
@Component({
  selector: 'app-cv-preview-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  templateUrl: './cv-preview-header.component.html',
  styleUrl: './cv-preview-header.component.scss',
})
export class CvPreviewHeaderComponent {
  protected readonly edit = inject(CvPreviewEditingService);
  protected readonly css = inject(CvPreviewStyleService);
  protected readonly sel = inject(CvPreviewSelectionService);
  protected readonly mode = inject(CvPreviewEditModeService);
  protected readonly t = inject(TranslateService).t;

  readonly section = input.required<CvPersonalDetailsSection>();
  readonly photoUri = input<string | null>(null);
  readonly placement = input.required<PhotoPlacement>();
  /** Which pass is rendering - `'measure'` or `'page'`. Forwarded from the
   * outlet context's `$sheetRenderMode`; every interactive affordance below is
   * gated on it through `sel.selectable`, so the hidden measurement pass stays
   * inert and geometry-identical. */
  readonly renderMode = input.required<unknown>();
  readonly includeBirthdate = input.required<boolean>();
  readonly includeMaritalStatus = input.required<boolean>();

  protected readonly leafPath = leafPath;
  protected readonly sectionLabelKey = sectionLabelKey;

  /** The render-mode gate, bound once here rather than at 30 template call
   * sites: `sel.selectable(renderMode())` is 26 columns before anything else
   * on the line, and the bindings below already sit close to the 100-column
   * limit that shaped this whole extraction. */
  protected selectable(): boolean {
    return this.sel.selectable(this.renderMode());
  }

  protected contactLine(): string {
    return buildContactLine(this.section(), {
      includeBirthdate: this.includeBirthdate(),
      includeMaritalStatus: this.includeMaritalStatus(),
    });
  }
}
