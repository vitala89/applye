import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { AnalyticsService } from './analytics.service';
import { SourceSection } from './events';

/** What kind of interaction the tracked element represents. */
export type TrackKind = 'download' | 'outbound' | 'cta';

/**
 * Declarative click tracking for links and buttons.
 *
 * Keeping this a directive rather than a `(click)` handler per template means
 * the tracked surfaces are visible in the markup, the payload is built in one
 * place, and a component never has to inject analytics just to report a click:
 *
 * ```html
 * <a [href]="releases" appTrack="download" trackSection="hero">Download</a>
 * <a routerLink="/docs" appTrack="cta" trackId="read_docs" trackSection="hero">Docs</a>
 * ```
 *
 * The directive never blocks or delays navigation: it pushes the event and
 * returns. A click that is lost because the page unloaded first is an
 * acceptable loss - a link that feels slow is not.
 */
@Directive({
  selector: '[appTrack]',
  standalone: true,
})
export class Track {
  private readonly analytics = inject(AnalyticsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appTrack = input.required<TrackKind>();
  /** Where on the page this element sits. Required for downloads and CTAs. */
  readonly trackSection = input<SourceSection>('landing');
  /** Stable identifier for a CTA, e.g. `read_docs`. Ignored for links. */
  readonly trackId = input('');

  @HostListener('click')
  onClick(): void {
    const el = this.host.nativeElement;
    const url = el.getAttribute('href') ?? '';
    const text = (el.textContent ?? '').trim().slice(0, 100);

    switch (this.appTrack()) {
      case 'download':
        this.analytics.downloadClick(this.trackSection(), url);
        break;
      case 'outbound':
        this.analytics.outboundClick(url, text);
        break;
      case 'cta':
        this.analytics.ctaClick(this.trackId() || text, this.trackSection());
        break;
    }
  }
}
