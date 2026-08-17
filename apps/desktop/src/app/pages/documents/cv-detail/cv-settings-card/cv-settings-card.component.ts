import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/**
 * The CV editor's always-visible settings card: the region the CV targets,
 * whether it is the default for that region, the three content toggles, and the
 * ATS notes those choices produce.
 *
 * Named to match `cover-letter-settings-card`, which is the same card on the
 * other editor and also carries its own `regionTags`.
 *
 * **It stays outside the collapsible section list on purpose.** The
 * birthdate/marital-status toggles gate fields inside the `personal_details`
 * editor, and an earlier version put them in that editor - which hid them
 * whenever the user collapsed the section. `cv-personal-details-editor`'s own
 * header records that regression; this component is where they live instead.
 *
 * The notes arrive as translation keys rather than sentences because they are
 * keys all the way down - `cvFieldAtsNoteKeys` returns keys, and the page has
 * nothing to interpolate into them. The Style card's notes differ: those carry
 * a `{value}` the page substitutes, so it passes finished strings there.
 */
@Component({
  selector: 'app-cv-settings-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-settings-card.component.html',
  styleUrl: './cv-settings-card.component.scss',
})
export class CvSettingsCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { check: Check };

  private readonly regionTags = ['de', 'us', 'uk', 'generic'];

  /** `DE - Germany` and so on; the label is locale-dependent, the tag is not. */
  protected readonly regionOptions = computed(() =>
    this.regionTags.map((tag) => ({
      tag,
      label: `${tag.toUpperCase()} - ${this.t()(`documents.cv_region_${tag}`)}`,
    })),
  );

  readonly regionTag = input.required<string>();
  readonly isDefault = input<boolean>(false);
  readonly includePhoto = input<boolean>(false);
  readonly includeBirthdate = input<boolean>(false);
  readonly includeMaritalStatus = input<boolean>(false);
  /** Translation keys, not sentences - see the class comment. */
  readonly atsNoteKeys = input<readonly string[]>([]);

  readonly regionTagChange = output<string>();
  readonly defaultToggled = output<void>();
  /** Separate from the other two toggles: switching the photo on has to create
   * a photo section, which only the page's stores can do. */
  readonly photoToggled = output<void>();
  readonly birthdateToggled = output<void>();
  readonly maritalStatusToggled = output<void>();
}
