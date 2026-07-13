import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, X } from 'lucide-angular';
import type { CvSkillsSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Editor arm for the `skills` CV section: labeled skill groups, each a chip
 * list of values, plus add/remove for both groups and individual chips.
 * Behavior-preserving extraction from `CvDetailComponent` — same fields and
 * buttons, only the mutation model is now immutable: every edit emits a
 * brand-new `CvSkillsSection` via `sectionChange` instead of mutating
 * `section.groups` in place.
 */
@Component({
  selector: 'app-cv-skills-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-skills-editor.component.html',
  styleUrl: './cv-skills-editor.component.scss',
})
export class CvSkillsEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { plus: Plus, close: X };

  readonly section = input.required<CvSkillsSection>();
  readonly sectionChange = output<CvSkillsSection>();

  setGroupLabel(groupIndex: number, label: string): void {
    const groups = this.section().groups.map((g, i) => (i === groupIndex ? { ...g, label } : g));
    this.sectionChange.emit({ ...this.section(), groups });
  }

  addGroup(): void {
    const groups = [...this.section().groups, { label: 'Skills', values: [] }];
    this.sectionChange.emit({ ...this.section(), groups });
  }

  removeGroup(groupIndex: number): void {
    const groups = this.section().groups.filter((_, i) => i !== groupIndex);
    this.sectionChange.emit({ ...this.section(), groups });
  }

  /** Adds the trimmed input value as a skill chip on Enter, then clears the
   * input. Ignores empty values and duplicates within the group. */
  addSkill(groupIndex: number, event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;
    const group = this.section().groups[groupIndex];
    if (!group) return;
    input.value = '';
    if (group.values.includes(value)) return;
    const groups = this.section().groups.map((g, i) =>
      i === groupIndex ? { ...g, values: [...g.values, value] } : g,
    );
    this.sectionChange.emit({ ...this.section(), groups });
  }

  removeSkill(groupIndex: number, valueIndex: number): void {
    const groups = this.section().groups.map((g, i) =>
      i === groupIndex ? { ...g, values: g.values.filter((_, vi) => vi !== valueIndex) } : g,
    );
    this.sectionChange.emit({ ...this.section(), groups });
  }
}
