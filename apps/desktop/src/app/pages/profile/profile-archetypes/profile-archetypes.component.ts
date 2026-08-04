import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, Info, LucideAngularModule, Plus, Target, X } from 'lucide-angular';
import { Archetype, hasDistinctiveWord } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** The most target roles a profile may carry. Beyond this the list stops
 * describing a focus and starts describing a job search with none. */
const MAX_ARCHETYPES = 5;

/**
 * Profile's target-roles section: up to five role archetypes, each with a fit
 * and a note on when to pitch yourself as it.
 *
 * It owns no state. The list is an input and every edit is an output, because
 * the page seeds the roles from the profile row, computes `dirty` from them and
 * writes them back on save - the same arrangement `cover-letter-block` uses,
 * and the opposite of the onboarding panels, where the child owned state the
 * wizard only read back.
 *
 * Its shared vocabulary - the section, collapse-card, archetype-card, status
 * and button classes - lives in `_profile-shell.scss`, which is emitted once
 * under `.profile`. Only the five classes no other section uses are here.
 */
@Component({
  selector: 'app-profile-archetypes',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './profile-archetypes.component.html',
  styleUrl: './profile-archetypes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileArchetypesComponent {
  protected readonly t = inject(TranslateService).t;

  readonly archetypes = input.required<Archetype[]>();
  readonly open = input.required<boolean>();

  readonly toggled = output<void>();
  readonly changed = output<Archetype[]>();

  protected readonly maxArchetypes = MAX_ARCHETYPES;

  protected readonly icons = {
    chevron: ChevronDown,
    info: Info,
    plus: Plus,
    remove: X,
    target: Target,
  };

  /**
   * A name built only from seniority and role-family words ("Senior Engineer")
   * never anchors a match, so Discover shows no badge, For-you does not group
   * it and scoring prompts ignore it. Warn while the user types instead of
   * leaving them with a feed that quietly never reacts.
   */
  protected isMatchable(name: string): boolean {
    return hasDistinctiveWord(name);
  }

  protected add(): void {
    if (this.archetypes().length >= MAX_ARCHETYPES) return;
    this.changed.emit([...this.archetypes(), { name: '', fit: 'primary', sellWhen: '' }]);
  }

  protected remove(index: number): void {
    this.changed.emit(this.archetypes().filter((_, i) => i !== index));
  }

  protected update(index: number, patch: Partial<Archetype>): void {
    this.changed.emit(this.archetypes().map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
}
