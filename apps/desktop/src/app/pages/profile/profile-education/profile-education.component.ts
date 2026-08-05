import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, Plus, X } from 'lucide-angular';
import { EMPTY_EDUCATION_ENTRY, EducationEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Profile's education section: a list of qualifications, each with a title, an
 * institution and a date range.
 *
 * It owns no state. The entries are an input and every edit is an output,
 * because the page holds the structured mirror and folds it back into
 * `form().education` - the string that reaches `fullMd`. Same arrangement as
 * `profile-experience` and `profile-languages`, for the same reason.
 *
 * It has **no stylesheet of its own**: every class it renders is shared with
 * Profile's other sections and already lives in `_profile-shell.scss`, emitted
 * once under `.profile`.
 */
@Component({
  selector: 'app-profile-education',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './profile-education.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEducationComponent {
  protected readonly t = inject(TranslateService).t;

  readonly entries = input.required<EducationEntry[]>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();
  readonly changed = output<EducationEntry[]>();

  protected readonly icons = {
    chevron: ChevronDown,
    plus: Plus,
    remove: X,
  };

  protected add(): void {
    this.changed.emit([...this.entries(), { ...EMPTY_EDUCATION_ENTRY }]);
  }

  protected remove(index: number): void {
    this.changed.emit(this.entries().filter((_, i) => i !== index));
  }

  protected updateField(index: number, field: keyof EducationEntry, value: string): void {
    this.changed.emit(this.entries().map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  }
}
