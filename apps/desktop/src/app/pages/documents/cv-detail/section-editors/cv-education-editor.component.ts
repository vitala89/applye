import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import type { CvEducationEntry, CvEducationSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { blankEducationEntry } from '../../cv-content.util';

/**
 * Editor arm for the `education` CV section: a list of degree/institution/
 * date entries plus add/remove. Behavior-preserving extraction from
 * `CvDetailComponent` — same fields and buttons, only the mutation model is
 * now immutable: every edit emits a brand-new `CvEducationSection` via
 * `sectionChange` instead of mutating `section.entries` in place.
 */
@Component({
  selector: 'app-cv-education-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-education-editor.component.html',
  styleUrl: './cv-education-editor.component.scss',
})
export class CvEducationEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { plus: Plus, trash: Trash2 };

  readonly section = input.required<CvEducationSection>();
  readonly sectionChange = output<CvEducationSection>();

  addEntry(): void {
    const entries = [...this.section().entries, blankEducationEntry()];
    this.sectionChange.emit({ ...this.section(), entries });
  }

  removeEntry(index: number): void {
    const entries = this.section().entries.filter((_, i) => i !== index);
    this.sectionChange.emit({ ...this.section(), entries });
  }

  updateField(index: number, field: keyof CvEducationEntry, value: string): void {
    const entries = this.section().entries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    );
    this.sectionChange.emit({ ...this.section(), entries });
  }
}
