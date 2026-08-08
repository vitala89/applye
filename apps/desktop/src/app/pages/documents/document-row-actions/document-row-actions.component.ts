import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Copy, Download, LucideAngularModule, Trash2 } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import type { ExportFormat } from '../../../shared/document-export.service';

/** The `<select>` hands back a `string`; this is the one place that decides
 * whether it is a format the app actually exports. An unknown value is
 * dropped rather than forwarded, which is what the old `$any(...)` at both
 * call sites could not do. */
function isExportFormat(value: string): value is ExportFormat {
  return value === 'pdf' || value === 'docx';
}

/**
 * The duplicate / export / delete controls at the end of a document row.
 *
 * `cv-list` and `cover-letter-list` rendered this **byte for byte identically**,
 * and `cover-letter-list` was reaching the rules for it through a Sass
 * `@import` of `cv-list.component.scss` - a dependency invisible in either
 * template, and one that broke the moment `cv-list`'s copy of `.icon-btn` was
 * deleted. One component, its own stylesheet, no import.
 *
 * It owns nothing. The row it belongs to is the caller's, so every action is an
 * output carrying the DOM event the caller needs to stop propagating - these
 * controls sit inside a clickable row.
 */
@Component({
  selector: 'app-document-row-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, ButtonDirective],
  templateUrl: './document-row-actions.component.html',
  styleUrl: './document-row-actions.component.scss',
})
export class DocumentRowActionsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** True while this row's export is in flight - the caller tracks which row,
   * because it owns the list. */
  readonly exportBusy = input(false);

  readonly duplicated = output<MouseEvent>();
  readonly deleted = output<MouseEvent>();
  /**
   * Typed as `ExportFormat` rather than `string`. Both call sites previously
   * read the value through `$any($event.target).value`, which erased the type
   * and let anything reach a handler that accepts `'docx' | 'pdf'`. Narrowing
   * it here is what made the compiler object when this markup was extracted -
   * the option list and the handler now have to agree.
   */
  readonly exported = output<{ format: ExportFormat; event: Event }>();

  protected readonly icons = { duplicate: Copy, export: Download, trash: Trash2 };

  /** The `<select>` is a one-shot menu rather than a bound control: it reports
   * the chosen format and resets, so re-picking the same one fires again. */
  protected onExport(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const format = select.value;
    select.value = '';
    if (isExportFormat(format)) this.exported.emit({ format, event });
  }
}
