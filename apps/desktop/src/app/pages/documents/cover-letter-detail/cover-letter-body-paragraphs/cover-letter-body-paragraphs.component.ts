import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, Plus, RefreshCw, Trash2 } from 'lucide-angular';
import {
  CoverLetterContentStore,
  CoverLetterStyleStore,
  paragraphStyleKey,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import type { TemplateRef } from '@angular/core';

/** The body is one block among seven, and this is the key the editor's
 * one-at-a-time style popover knows the section itself by. Its paragraphs use
 * `body_<i>`, which `paragraphStyleKey` builds. */
const STYLE_KEY = 'body';

/**
 * The body-paragraphs block: the collapsible section, its paragraph count, the
 * per-paragraph Style/Regenerate/Delete row, and the Add button.
 *
 * **Its collapse and its popover state stay on the page**, taken as inputs and
 * returned as outputs, because both are one-at-a-time across the whole editor -
 * the same contract `CoverLetterBlockComponent` and the recipient block already
 * use. Unlike those two it takes `openStyleKey` rather than a resolved boolean,
 * because a section head and N paragraphs compete for one popover and only the
 * key can tell them apart.
 *
 * What it owns is the paragraph text, which it writes straight into
 * `CoverLetterContentStore`. **Removal and regeneration stay outputs**: removal
 * touches three owners and is orchestrated on the page, and regeneration runs
 * through the page's AI error handling.
 */
@Component({
  selector: 'app-cover-letter-body-paragraphs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, NgTemplateOutlet],
  templateUrl: './cover-letter-body-paragraphs.component.html',
  styleUrl: './cover-letter-body-paragraphs.component.scss',
})
export class CoverLetterBodyParagraphsComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly letter = inject(CoverLetterContentStore);
  private readonly styles = inject(CoverLetterStyleStore);

  readonly open = input(true);
  /** Which Style popover the editor has open, if any - the section's own key or
   * one paragraph's. Null when none is. */
  readonly openStyleKey = input<string | null>(null);
  /** The block currently being regenerated, as the AI store reports it:
   * `body_<i>` while a paragraph is in flight. */
  readonly regeneratingBlock = input<string | null>(null);
  /** The editor's single style-popover template, stamped with the key of
   * whichever row reports it open. */
  readonly stylePopover = input.required<TemplateRef<{ $implicit: string }>>();

  readonly toggled = output<void>();
  readonly styleToggled = output<string>();
  readonly regenerated = output<number>();
  readonly paragraphRemoved = output<number>();

  protected readonly icons = {
    chevron: ChevronDown,
    regenerate: RefreshCw,
    plus: Plus,
    trash: Trash2,
  };
  protected readonly styleKey = STYLE_KEY;
  protected readonly content = this.letter.content;

  /** Style-override key for a body paragraph. */
  paragraphStyleKey(index: number): string {
    return paragraphStyleKey(index);
  }

  hasCustomStyle(key: string): boolean {
    return this.styles.hasCustomStyle(key);
  }

  isRegenerating(index: number): boolean {
    return this.regeneratingBlock() === `${STYLE_KEY}_${index}`;
  }

  updateParagraph(index: number, value: string): void {
    this.letter.updateParagraph(index, value);
  }

  addParagraph(): void {
    this.letter.addParagraph();
  }
}
