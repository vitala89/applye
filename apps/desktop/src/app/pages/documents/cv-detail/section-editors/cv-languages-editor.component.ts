import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, X } from 'lucide-angular';
import type { CvLanguageEntry, CvLanguagesSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Editor arm for the `languages` CV section: a flat list of language/level
 * rows plus add/remove. Behavior-preserving extraction from
 * `CvDetailComponent` — same fields and buttons, only the mutation model is
 * now immutable: every edit emits a brand-new `CvLanguagesSection` via
 * `sectionChange` instead of mutating `section.items` in place.
 */
@Component({
  selector: 'app-cv-languages-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-languages-editor.component.html',
  styleUrl: './cv-languages-editor.component.scss',
})
export class CvLanguagesEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { plus: Plus, close: X };

  /** CEFR levels plus an empty option — a language may be listed with no
   * level (e.g. just "English"), which some CV conventions prefer. */
  protected readonly languageLevels = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

  readonly section = input.required<CvLanguagesSection>();
  readonly sectionChange = output<CvLanguagesSection>();

  addLanguage(): void {
    const items = [...this.section().items, { language: '', level: '' }];
    this.sectionChange.emit({ ...this.section(), items });
  }

  removeLanguage(index: number): void {
    const items = this.section().items.filter((_, i) => i !== index);
    this.sectionChange.emit({ ...this.section(), items });
  }

  updateField(index: number, field: keyof CvLanguageEntry, value: string): void {
    const items = this.section().items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    );
    this.sectionChange.emit({ ...this.section(), items });
  }
}
