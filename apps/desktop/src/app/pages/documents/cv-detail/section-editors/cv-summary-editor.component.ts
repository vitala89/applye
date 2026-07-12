import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CvSummarySection } from '@applye/core';
import { toggleBoldWrap } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Editor arm for the `summary` CV section: a single bold-capable textarea.
 * Behavior-preserving extraction from `CvDetailComponent` — the field and its
 * Bold button/Cmd+B shortcut are unchanged, only the mutation model is now
 * immutable: every edit emits a brand-new `CvSummarySection` via
 * `sectionChange` instead of mutating the section object in place.
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
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly section = input.required<CvSummarySection>();
  readonly sectionChange = output<CvSummarySection>();

  onTextChange(text: string): void {
    this.sectionChange.emit({ ...this.section(), text });
  }

  /** Wrap/unwrap **bold** around the field's current selection, emit the
   * updated section, then restore the caret. Bound to the Bold button and
   * Cmd/Ctrl+B. */
  applyBold(el: HTMLTextAreaElement): void {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const r = toggleBoldWrap(el.value, start, end);
    this.sectionChange.emit({ ...this.section(), text: r.text });
    queueMicrotask(() => {
      el.value = r.text;
      el.setSelectionRange(r.selStart, r.selEnd);
      el.focus();
    });
  }

  /** Cmd/Ctrl+B handler for the summary textarea — delegates to `applyBold`
   * and prevents the browser's native bold shortcut. */
  onBoldKeydown(event: KeyboardEvent, el: HTMLTextAreaElement): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.applyBold(el);
    }
  }
}
