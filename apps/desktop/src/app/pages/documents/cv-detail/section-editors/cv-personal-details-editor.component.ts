import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import type { CvPersonalDetailsSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** Plain-text-input fields on a `CvPersonalDetailsSection` — everything but
 * the section-envelope properties (`key`/`order`/`visible`/`sourceHash`). */
type CvPersonalDetailsField = Exclude<
  keyof CvPersonalDetailsSection,
  'key' | 'order' | 'visible' | 'sourceHash'
>;

/**
 * Editor arm for the `personal_details` CV section: name/title/contact
 * fields, the birthdate/marital-status field toggles + their ATS notes, and
 * the "pull from profile" action. Behavior-preserving extraction from
 * `CvDetailComponent` — same fields, same toggles, same notes, same button.
 *
 * Every field edit emits a brand-new `CvPersonalDetailsSection` via
 * `sectionChange` (immutable), matching the other extracted section
 * editors. The birthdate/marital-status toggles are booleans owned by the
 * parent (they also feed the parent's PDF-export field selection), so this
 * component only reflects their current value (`includeBirthdate`/
 * `includeMaritalStatus` inputs) and asks the parent to flip them
 * (`includeBirthdateChange`/`includeMaritalStatusChange` outputs) rather than
 * owning the state itself. The AI "pull from profile" call stays in the
 * parent (`AiService`/`DbService` access) — this component only emits
 * `pullProfile` and reflects the in-flight state via the `pulling` input.
 */
@Component({
  selector: 'app-cv-personal-details-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-personal-details-editor.component.html',
  styleUrl: './cv-personal-details-editor.component.scss',
})
export class CvPersonalDetailsEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { sparkles: Sparkles };

  readonly section = input.required<CvPersonalDetailsSection>();
  readonly includeBirthdate = input.required<boolean>();
  readonly includeMaritalStatus = input.required<boolean>();
  readonly atsNoteKeys = input.required<string[]>();
  readonly pulling = input.required<boolean>();

  readonly sectionChange = output<CvPersonalDetailsSection>();
  readonly includeBirthdateChange = output<boolean>();
  readonly includeMaritalStatusChange = output<boolean>();
  readonly pullProfile = output<void>();

  updateField(field: CvPersonalDetailsField, value: string): void {
    this.sectionChange.emit({ ...this.section(), [field]: value });
  }

  toggleBirthdate(): void {
    this.includeBirthdateChange.emit(!this.includeBirthdate());
  }

  toggleMaritalStatus(): void {
    this.includeMaritalStatusChange.emit(!this.includeMaritalStatus());
  }
}
