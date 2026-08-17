import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { PhotoPlacement } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/**
 * Editor arm for the `photo` CV section: the thumbnail, the link into the
 * profile where the one reusable photo is uploaded and cropped, and the
 * placement chips.
 *
 * **It exists because it was the odd one out.** The page's `@switch` over
 * `section.key` dispatches to a component for all six other sections and
 * inlined this one, which is also why the photo's classes were the only
 * `.cvdetail__*` rules left in the page stylesheet after the editors took
 * theirs.
 *
 * The image itself is never owned here - it is the profile's, and the only
 * action is `manageRequested`, which the page routes to `/profile`. Placement
 * is a read-only input plus a change output, like every sibling editor: the
 * store that owns it is provided by the page.
 */
@Component({
  selector: 'app-cv-photo-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  templateUrl: './cv-photo-editor.component.html',
  styleUrl: './cv-photo-editor.component.scss',
})
export class CvPhotoEditorComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** The profile photo as a `data:` URI, or null when the profile has none. */
  readonly dataUri = input<string | null>(null);
  readonly placement = input.required<PhotoPlacement>();
  readonly placementOptions =
    input.required<readonly { value: PhotoPlacement; labelKey: string }[]>();

  /** The user wants to add or change the image, which happens in the profile. */
  readonly manageRequested = output<void>();
  readonly placementChange = output<PhotoPlacement>();
}
