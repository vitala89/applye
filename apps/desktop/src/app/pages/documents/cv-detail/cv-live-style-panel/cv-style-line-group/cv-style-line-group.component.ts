import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';

/**
 * The live-style panel's collapsible LINE group: a border-style select, and -
 * while a line is drawn - its width and colour.
 *
 * **It renders the three line groups; it does not unify them.** A section body
 * rule, a per-element underline and a section-title rule reach this component
 * through three separate call sites, and every rule that distinguishes them
 * stays in `CvLiveStylePanelComponent`:
 *
 * - `showInherit` is the parent's `isEntrySelection()` for an element (only an
 *   experience entry inherits a line when unset - a plain leaf must not be
 *   offered Inherit), and a plain `true` for the section and title rules.
 * - `showRule` is `hasElementLine()` for an element and `border !== 'none'` for
 *   the other two, which differ: `''` (Inherit) keeps the width/colour rows on
 *   a section rule and hides them on a leaf that draws nothing.
 *
 * Collapsing those into a predicate computed here would re-derive cascade
 * semantics away from `cv-style-panel-cascade.ts` and its specs - the same
 * mistake as "deduplicating" that module into `libs/core`. This component is a
 * view: values in, edits out.
 */
@Component({
  selector: 'app-cv-style-line-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-style-line-group.component.html',
  styleUrl: './cv-style-line-group.component.scss',
})
export class CvStyleLineGroupComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { chevron: ChevronDown };

  readonly open = input<boolean>(false);

  /** Select model: `''` Inherit, `'none'`, or a `CvBorderStyle`. */
  readonly border = input<string>('');
  /** Whether the Inherit option is offered at all. */
  readonly showInherit = input<boolean>(false);
  /** Whether a line is currently drawn, and so whether the width and colour
   * rows are shown. Resolved by the parent - see the class comment. */
  readonly showRule = input<boolean>(false);
  readonly ruleWidth = input<number | null>(null);
  /** Always a concrete hex: `<input type="color">` has no empty value, so the
   * parent resolves Inherit to what the line actually renders at. */
  readonly ruleColor = input<string>('');

  readonly toggled = output<void>();
  readonly borderChange = output<string>();
  readonly widthChange = output<string | number | null>();
  readonly colorChange = output<string>();
}
