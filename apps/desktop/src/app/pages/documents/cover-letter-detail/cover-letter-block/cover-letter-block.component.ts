import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { CoverLetterBlockKey } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** The blocks that are one collapsible section around one text field. The
 * recipient block is an address form and the body block is a paragraph list,
 * so neither is this shape. */
export type CoverLetterTextBlockKey = Extract<
  CoverLetterBlockKey,
  'date' | 'subject' | 'greeting' | 'closing' | 'signature'
>;

/**
 * One collapsible cover-letter block: its title, its Style and Regenerate
 * actions, and the single text field it edits.
 *
 * The editor rendered this five times. Normalising the block key out of the
 * markup showed subject, greeting, closing and signature to be **identical**,
 * line for line, and date to be the same thing without a Regenerate button -
 * 308 template lines that were one component written five times.
 *
 * It owns no state. Everything it shows is an input and every change is an
 * output, because the letter's content, its per-block styles and the
 * regeneration in flight all belong to the page, which reads them for the
 * preview, the word count and the save.
 */
@Component({
  selector: 'app-cover-letter-block',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, NgTemplateOutlet],
  templateUrl: './cover-letter-block.component.html',
  styleUrl: './cover-letter-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverLetterBlockComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly key = input.required<CoverLetterTextBlockKey>();
  /** `subject` is optional on the model, and `ngModel` took `undefined` here
   * before the extraction. Keeping the type widens nothing at runtime. */
  readonly value = input.required<string | undefined>();
  readonly open = input.required<boolean>();
  readonly styleOpen = input.required<boolean>();
  readonly customStyle = input.required<boolean>();
  readonly regenerating = input.required<boolean>();
  /** The date is a formatted value rather than prose, so there is nothing for
   * the model to write - that block is the one without this action. */
  readonly regeneratable = input(true);
  /** The Style popover is one template the page parameterises by key, so it
   * stays on the page and is rendered here through its `TemplateRef`. Moving
   * it would have given each of the five blocks its own copy. */
  readonly stylePopover = input.required<TemplateRef<{ $implicit: string }>>();

  readonly toggled = output<void>();
  readonly styleToggled = output<void>();
  readonly regenerated = output<void>();
  readonly valueChanged = output<string>();

  protected readonly labelKey = computed(() => `documents.cover_letter_field_${this.key()}`);

  protected readonly icons = {
    chevron: ChevronDown,
    regenerate: RefreshCw,
  };
}
