import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import type { CvExperienceEntry, CvExperienceSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { blankExperienceEntry } from '../../cv-content.util';

/** Entry field names editable via a plain text input (i.e. everything on a
 * `CvExperienceEntry` except the `bullets` array, which has its own nested
 * add/remove/edit methods below). */
type CvExperienceTextField = Exclude<keyof CvExperienceEntry, 'bullets'>;

/**
 * Editor arm for the `experience` CV section: a list of role/company entries,
 * each with its own bullet list. Behavior-preserving extraction from
 * `CvDetailComponent` - same fields, only the mutation model is now
 * immutable. This is the most nested arm: every edit (entry field, bullet
 * text, add/remove entry, add/remove bullet) emits a brand-new
 * `CvExperienceSection` - with brand-new `entries` and, for bullet-level
 * edits, a brand-new `bullets` array on the affected entry - via
 * `sectionChange`, instead of mutating `section.entries` (or any nested
 * entry/bullets array) in place. Bullet bold formatting is no longer
 * available here - it moved to the live preview's inline editor (see
 * `CvPreviewComponent.applyBulletBold`).
 */
@Component({
  selector: 'app-cv-experience-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-experience-editor.component.html',
  styleUrl: './cv-experience-editor.component.scss',
})
export class CvExperienceEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { plus: Plus, trash: Trash2, close: X };

  readonly section = input.required<CvExperienceSection>();
  readonly sectionChange = output<CvExperienceSection>();

  addEntry(): void {
    const entries = [...this.section().entries, blankExperienceEntry()];
    this.sectionChange.emit({ ...this.section(), entries });
  }

  removeEntry(index: number): void {
    const entries = this.section().entries.filter((_, i) => i !== index);
    this.sectionChange.emit({ ...this.section(), entries });
  }

  updateField(index: number, field: CvExperienceTextField, value: string): void {
    const entries = this.section().entries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    );
    this.sectionChange.emit({ ...this.section(), entries });
  }

  addBullet(entryIndex: number): void {
    const entries = this.section().entries.map((entry, ei) =>
      ei === entryIndex ? { ...entry, bullets: [...entry.bullets, ''] } : entry,
    );
    this.sectionChange.emit({ ...this.section(), entries });
  }

  removeBullet(entryIndex: number, bulletIndex: number): void {
    const entries = this.section().entries.map((entry, ei) =>
      ei === entryIndex
        ? { ...entry, bullets: entry.bullets.filter((_, bi) => bi !== bulletIndex) }
        : entry,
    );
    this.sectionChange.emit({ ...this.section(), entries });
  }

  updateBullet(entryIndex: number, bulletIndex: number, value: string): void {
    const entries = this.section().entries.map((entry, ei) =>
      ei === entryIndex
        ? {
            ...entry,
            bullets: entry.bullets.map((bullet, bi) => (bi === bulletIndex ? value : bullet)),
          }
        : entry,
    );
    this.sectionChange.emit({ ...this.section(), entries });
  }
}
