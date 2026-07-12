import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CvSummarySection } from '@applye/core';

/**
 * Editor arm for the `summary` CV section: a single plain-text textarea.
 * Behavior-preserving extraction from `CvDetailComponent` — the mutation
 * model is immutable: every edit emits a brand-new `CvSummarySection` via
 * `sectionChange` instead of mutating the section object in place.
 * Bold formatting is no longer available here — it moved to the live
 * preview's inline editor (see `CvPreviewComponent.applySummaryBold`).
 */
@Component({
  selector: 'app-cv-summary-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cv-summary-editor.component.html',
  styleUrl: './cv-summary-editor.component.scss',
})
export class CvSummaryEditorComponent {
  readonly section = input.required<CvSummarySection>();
  readonly sectionChange = output<CvSummarySection>();

  onTextChange(text: string): void {
    this.sectionChange.emit({ ...this.section(), text });
  }
}
