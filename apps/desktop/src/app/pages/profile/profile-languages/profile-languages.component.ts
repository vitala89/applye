import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, Plus, X } from 'lucide-angular';
import { EMPTY_LANGUAGE_ENTRY, LanguageEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** CEFR levels, plus the empty option for "not stated". Displayed verbatim -
 * the labels are language codes, not translated strings - except the blank,
 * which gets a translated placeholder. */
const LANGUAGE_LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

/**
 * Profile's languages section: a list of languages, each with a CEFR level.
 *
 * It owns no state. The entries are an input and every edit is an output,
 * because the page holds the structured mirror and folds it back into
 * `form().languages` - the string that reaches `fullMd`. Same arrangement as
 * `profile-experience`, for the same reason: that fold belongs where the rest
 * of the form lives.
 *
 * The shared vocabulary it renders - the collapse-card shell, the input, the
 * select and the buttons - is in `_profile-shell.scss`, emitted once under
 * `.profile`.
 */
@Component({
  selector: 'app-profile-languages',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './profile-languages.component.html',
  styleUrl: './profile-languages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileLanguagesComponent {
  protected readonly t = inject(TranslateService).t;

  readonly entries = input.required<LanguageEntry[]>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();
  readonly changed = output<LanguageEntry[]>();

  protected readonly levels = LANGUAGE_LEVELS;

  protected readonly icons = {
    chevron: ChevronDown,
    plus: Plus,
    remove: X,
  };

  protected add(): void {
    this.changed.emit([...this.entries(), { ...EMPTY_LANGUAGE_ENTRY }]);
  }

  protected remove(index: number): void {
    this.changed.emit(this.entries().filter((_, i) => i !== index));
  }

  protected updateField(index: number, field: keyof LanguageEntry, value: string): void {
    this.changed.emit(this.entries().map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
}
