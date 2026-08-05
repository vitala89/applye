import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ChevronDown, LucideAngularModule, X } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/**
 * Profile's skills section: a chip list with a free-text field that turns what
 * you type into a chip on Enter.
 *
 * It owns no state. The skills are an input and every edit is an output,
 * because they live directly in `form().skills` on the page - there is no
 * structured mirror here, unlike experience, languages and education. The page
 * writes the emitted list through `updateField`, which is what folds it into
 * `fullMd`.
 */
@Component({
  selector: 'app-profile-skills',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './profile-skills.component.html',
  styleUrl: './profile-skills.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSkillsComponent {
  protected readonly t = inject(TranslateService).t;

  readonly skills = input.required<string[]>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();
  readonly changed = output<string[]>();

  protected readonly icons = {
    chevron: ChevronDown,
    remove: X,
  };

  /**
   * Enter turns the field's text into a chip. The field is cleared even when
   * the skill is a duplicate, because leaving the text sitting there reads as
   * "that did not work" when in fact the skill is already in the list.
   */
  protected addChip(event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    if (this.skills().includes(value)) return;
    this.changed.emit([...this.skills(), value]);
  }

  protected removeChip(index: number): void {
    this.changed.emit(this.skills().filter((_, i) => i !== index));
  }
}
