import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';

interface OpenMedia {
  kind: 'image' | 'video';
  src: string;
  alt: string;
  caption: string;
}

/**
 * Click-to-enlarge for the documentation's figures.
 *
 * The guide's screenshots are 2880x1800 files rendered into a column a third
 * that wide, so detail the text points at - a badge, a chip, a line in a
 * console - is legible in the file and not on the page. This opens the same
 * asset over a dimmed backdrop at whatever size the viewport allows.
 *
 * It binds by delegation on the docs column rather than by editing two dozen
 * figures: one listener, and any figure added later is covered without being
 * told about this. A video that carries its own `controls` is skipped, because
 * a click there belongs to the scrubber; the expand button on the figure is how
 * that one is opened.
 */
@Component({
  selector: 'app-media-lightbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open(); as media) {
      <!-- Clicking the backdrop dismisses, which is a mouse shortcut: Escape and
           the close button are the keyboard paths, and the button holds focus
           while the overlay is open. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
      <div
        class="lbx"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="media.caption || media.alt || 'Enlarged figure'"
        (click)="onBackdropClick($event)"
      >
        <button type="button" class="lbx__close" (click)="close()" aria-label="Close">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <figure class="lbx__figure">
          @if (media.kind === 'image') {
            <img class="lbx__media" [src]="media.src" [alt]="media.alt" />
          } @else {
            <video
              class="lbx__media"
              [src]="media.src"
              controls
              autoplay
              loop
              muted
              playsinline
            ></video>
          }
          @if (media.caption) {
            <figcaption class="lbx__caption">{{ media.caption }}</figcaption>
          }
        </figure>
      </div>
    }
  `,
})
export class MediaLightbox {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private lastFocused: HTMLElement | null = null;

  readonly open = signal<OpenMedia | null>(null);

  /**
   * Delegated on the document rather than on the docs column, because the
   * column's contents are replaced on every route change and this component
   * outlives them.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isBrowser || this.open()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const trigger = target.closest<HTMLElement>('.docs__zoom');
    const figure = (trigger ?? target).closest<HTMLElement>('.docs__media');
    if (!figure) return;

    const media = trigger
      ? figure.querySelector<HTMLElement>('img, video')
      : target.closest<HTMLElement>('img, video');
    if (!media) return;
    // A video with its own controls belongs to the scrubber; use the button.
    if (!trigger && media instanceof HTMLVideoElement && media.controls) return;

    event.preventDefault();
    this.lastFocused = this.doc.activeElement as HTMLElement | null;
    this.openFor(media, figure);
  }

  /** Dismisses only when the backdrop itself was hit, never the figure on it. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(null);
    this.doc.body.classList.remove('is-lightboxed');
    this.lastFocused?.focus?.();
    this.lastFocused = null;
  }

  private openFor(media: HTMLElement, figure: HTMLElement): void {
    const src = media.getAttribute('src') ?? '';
    if (!src) return;

    this.open.set({
      kind: media instanceof HTMLVideoElement ? 'video' : 'image',
      src,
      alt: media.getAttribute('alt') ?? media.getAttribute('aria-label') ?? '',
      caption: figure.querySelector('figcaption')?.textContent?.trim() ?? '',
    });
    // Stops the page behind the overlay from scrolling under the pointer.
    this.doc.body.classList.add('is-lightboxed');
    queueMicrotask(() => this.doc.querySelector<HTMLElement>('.lbx__close')?.focus());
  }
}
