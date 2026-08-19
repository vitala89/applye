import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import type { CvPersonalDetailsSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** Plain-text-input fields on a `CvPersonalDetailsSection` - everything but
 * the section-envelope properties (`key`/`order`/`visible`/`sourceHash`). */
type CvPersonalDetailsField = Exclude<
  keyof CvPersonalDetailsSection,
  'key' | 'order' | 'visible' | 'sourceHash'
>;

/**
 * Editor arm for the `personal_details` CV section: name/title/contact
 * fields and the "pull from profile" action. Behavior-preserving extraction
 * from `CvDetailComponent` - same fields, same button.
 *
 * The birthdate/marital-status toggle chips and their ATS notes live in the
 * parent's fixed top card (before the collapsible sections loop), NOT here -
 * that card is always visible regardless of section collapse state, whereas
 * this editor only renders while the `personal_details` section is expanded.
 * Moving the toggles/notes into this component would hide them whenever the
 * user collapses the section, which regressed prior always-visible behavior
 * (see the fix that restored them to the parent). This component still
 * needs to know whether birthdate/marital-status are included so it can
 * gate rendering of their value inputs, hence the read-only
 * `includeBirthdate`/`includeMaritalStatus` inputs - but it does not own or
 * mutate that state, so it has no corresponding change outputs.
 *
 * Every field edit emits a brand-new `CvPersonalDetailsSection` via
 * `sectionChange` (immutable), matching the other extracted section
 * editors. The AI "pull from profile" call stays in the parent
 * (`AiService`/data-gateway access) - this component only emits
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
  readonly pulling = input.required<boolean>();

  readonly sectionChange = output<CvPersonalDetailsSection>();
  readonly pullProfile = output<void>();

  updateField(field: CvPersonalDetailsField, value: string): void {
    this.sectionChange.emit({ ...this.section(), [field]: value });
  }
}
