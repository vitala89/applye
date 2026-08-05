import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, Plus, X } from 'lucide-angular';
import { EMPTY_EXPERIENCE_ENTRY, ExperienceEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** The fields of an entry that hold a single string, i.e. everything but the
 * bullet list, which has its own add/remove/update. */
type ExperienceTextField = Exclude<keyof ExperienceEntry, 'bullets'>;

/**
 * Profile's work-experience section: a list of positions, each with a role,
 * company, location, dates and its own bullet list.
 *
 * It owns no state. The entries are an input and every edit is an output,
 * because the page holds the structured mirror AND folds it back into
 * `form().experienceText` - the string that actually reaches `fullMd`. Emitting
 * the whole list keeps that fold in one place on the page rather than splitting
 * it across the boundary; the same reason `profile-archetypes` emits a list.
 *
 * The shared vocabulary it renders - collapse-card, archetype-card, the inputs
 * and the buttons - is in `_profile-shell.scss`, emitted once under `.profile`.
 */
@Component({
  selector: 'app-profile-experience',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './profile-experience.component.html',
  styleUrl: './profile-experience.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileExperienceComponent {
  protected readonly t = inject(TranslateService).t;

  readonly entries = input.required<ExperienceEntry[]>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();
  readonly changed = output<ExperienceEntry[]>();

  protected readonly icons = {
    chevron: ChevronDown,
    plus: Plus,
    remove: X,
  };

  protected add(): void {
    this.changed.emit([...this.entries(), { ...EMPTY_EXPERIENCE_ENTRY, bullets: [] }]);
  }

  protected remove(index: number): void {
    this.changed.emit(this.entries().filter((_, i) => i !== index));
  }

  protected updateField(index: number, field: ExperienceTextField, value: string): void {
    this.changed.emit(this.entries().map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  }

  protected addBullet(index: number): void {
    this.changed.emit(
      this.entries().map((e, i) => (i === index ? { ...e, bullets: [...e.bullets, ''] } : e)),
    );
  }

  protected removeBullet(index: number, bulletIndex: number): void {
    this.changed.emit(
      this.entries().map((e, i) =>
        i === index ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== bulletIndex) } : e,
      ),
    );
  }

  protected updateBullet(index: number, bulletIndex: number, value: string): void {
    this.changed.emit(
      this.entries().map((e, i) =>
        i === index
          ? { ...e, bullets: e.bullets.map((b, bi) => (bi === bulletIndex ? value : b)) }
          : e,
      ),
    );
  }
}
