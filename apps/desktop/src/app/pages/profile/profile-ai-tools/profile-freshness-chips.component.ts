import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Check, CircleDot, LucideAngularModule, TriangleAlert } from 'lucide-angular';
import { ScoringState } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * Whether a cached AI artefact still describes the profile it was generated
 * from, plus whatever the last attempt to regenerate it had to say.
 *
 * Both AI tool cards ended their foot with the same eighteen lines - three
 * mutually exclusive chips and a status line - differing only in which hint
 * they showed. Rendered twice from here instead.
 *
 * `none` renders nothing on purpose: an artefact that does not exist yet is not
 * stale, and the Generate button beside this already says so.
 */
@Component({
  selector: 'app-profile-freshness-chips',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './profile-freshness-chips.component.html',
  styleUrl: './profile-freshness-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileFreshnessChipsComponent {
  protected readonly t = inject(TranslateService).t;

  readonly state = input.required<ScoringState>();
  /** Translation key for the line shown beside the stale chip. */
  readonly staleHintKey = input.required<string>();
  /** Translation key for the line shown beside the unsaved chip. */
  readonly unsavedHintKey = input.required<string>();
  readonly status = input.required<string>();
  readonly error = input.required<boolean>();

  protected readonly icons = {
    check: Check,
    stale: TriangleAlert,
    unsaved: CircleDot,
  };
}
