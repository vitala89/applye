import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Track } from '../analytics/track.directive';
import { SourceSection } from '../analytics/events';
import { REPO, SOURCE_PUBLIC } from '../site';

/**
 * Renders a link into the source repository - or, while the repo is still
 * private, an honest "coming soon" pill in its place.
 *
 * The whole site routes its GitHub references through this component so that
 * flipping `SOURCE_PUBLIC` in `site.ts` is the only change needed on the day
 * the repository opens. No template hardcodes a repo URL.
 */
@Component({
  selector: 'app-source-link',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Track],
  template: `
    @if (isPublic) {
      <a
        [class]="linkClass()"
        [href]="href()"
        target="_blank"
        rel="noopener"
        appTrack="outbound"
        [trackSection]="section()"
      >
        @if (icon()) {
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path [attr.d]="githubPath" />
          </svg>
        }
        {{ label() }}
      </a>
    } @else {
      <span [class]="soonClass()" [attr.title]="soonTitle()">
        @if (icon()) {
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path [attr.d]="githubPath" />
          </svg>
        }
        {{ soonLabel() }}
      </span>
    }
  `,
})
export class SourceLink {
  /** Repo-relative suffix, e.g. `/blob/main/CONTRIBUTING.md`. Empty means the repo root. */
  readonly path = input('');
  /** Text shown once the repo is public. */
  readonly label = input('View source');
  /** Text shown while the repo is private. */
  readonly soonLabel = input('Source: coming soon');
  /** Visual treatment: inline prose link, ghost button, or primary button. */
  readonly variant = input<'link' | 'ghost' | 'primary'>('link');
  /** Prefix the label with the GitHub mark. */
  readonly icon = input(false);
  /** Where this link sits, so outbound clicks can be told apart in reports. */
  readonly section = input<SourceSection>('landing');

  readonly isPublic = SOURCE_PUBLIC;

  readonly githubPath =
    'M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.37.8 1.09.8 2.2v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z';

  readonly href = computed(() => `${REPO}${this.path()}`);

  readonly linkClass = computed(() => {
    switch (this.variant()) {
      case 'primary':
        return 'btn btn--primary';
      case 'ghost':
        return 'btn btn--ghost';
      default:
        return '';
    }
  });

  readonly soonClass = computed(() => {
    const base = 'soon-pill';
    switch (this.variant()) {
      case 'primary':
      case 'ghost':
        return `btn btn--ghost ${base} ${base}--btn`;
      default:
        return base;
    }
  });

  readonly soonTitle = computed(
    () => 'The repository is private while the pre-release audit runs. It opens soon.',
  );
}
