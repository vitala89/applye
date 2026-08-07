import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import type { CoverLetterAddress } from '@applye/core';
import { CoverLetterContentStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import type { TemplateRef } from '@angular/core';

/** The recipient address is one block among seven, and this is the key the
 * editor's one-at-a-time style popover knows it by. */
const STYLE_KEY = 'recipient';

/**
 * The recipient address block: the six DIN 5008 address fields, the collapse
 * head they sit under, and the style button that opens the shared popover.
 *
 * **Its collapse and its popover state stay on the page**, taken as inputs and
 * returned as outputs, because both are one-at-a-time across the whole editor -
 * the same contract `CoverLetterBlockComponent` already uses for the five text
 * blocks. What it does own is the address itself, which it writes straight into
 * `CoverLetterContentStore`: the store is provided on the page, so this resolves
 * the same instance through the element injector.
 */
@Component({
  selector: 'app-cover-letter-recipient-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, NgTemplateOutlet],
  templateUrl: './cover-letter-recipient-block.component.html',
  styleUrl: './cover-letter-recipient-block.component.scss',
})
export class CoverLetterRecipientBlockComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly letter = inject(CoverLetterContentStore);

  readonly open = input(true);
  readonly styleOpen = input(false);
  readonly customStyle = input(false);
  /** The editor's single style-popover template, stamped with this block's key
   * when the page reports it open. */
  readonly stylePopover = input.required<TemplateRef<{ $implicit: string }>>();

  readonly toggled = output<void>();
  readonly styleToggled = output<string>();

  protected readonly icons = { chevron: ChevronDown };
  protected readonly styleKey = STYLE_KEY;
  protected readonly content = this.letter.content;

  updateAddress(field: keyof CoverLetterAddress, value: string): void {
    this.letter.updateAddress(field, value);
  }
}
