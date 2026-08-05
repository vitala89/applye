import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@applye/i18n';

/**
 * One labelled text field of Profile's contact block.
 *
 * The block was nine of these written out: a `field` wrapper, a `field__label`
 * bound to the input by id, and a `field__input` bound to one property of
 * `form()`. They differed only in the key, the value, the input type and
 * whether they carried a placeholder.
 *
 * `key` is the dash form (`first-name`), which gives both the element id
 * (`field-first-name`) and the translation key (`profile.field_first_name`).
 * That pairing is not cosmetic: `focusField` scrolls to `field-<key>` when the
 * completeness hero reports a field missing, so the id has to keep its shape.
 *
 * It owns no state and has **no stylesheet**: `field`, `field__label` and
 * `field__input` are shared with the rest of the page and live in
 * `_profile-shell.scss`, emitted once under `.profile`.
 */
@Component({
  selector: 'app-profile-text-field',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-text-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTextFieldComponent {
  protected readonly t = inject(TranslateService).t;

  /** Dash form, e.g. `first-name`. Drives the id and the label key. */
  readonly key = input.required<string>();
  readonly value = input.required<string>();
  readonly type = input<'text' | 'email' | 'tel'>('text');
  /** Translation key for a placeholder, or nothing for no placeholder. */
  readonly placeholderKey = input<string | null>(null);

  readonly changed = output<string>();

  protected readonly fieldId = computed(() => `field-${this.key()}`);
  protected readonly labelKey = computed(() => `profile.field_${this.key().replace(/-/g, '_')}`);

  /** Null rather than an empty string, so a field without one renders no
   * `placeholder` attribute at all rather than an empty one. */
  protected readonly placeholder = computed(() => {
    const key = this.placeholderKey();
    return key ? this.t()(key) : null;
  });
}
