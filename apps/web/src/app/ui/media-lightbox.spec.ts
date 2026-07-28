import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaLightbox } from './media-lightbox';

/** Appends a docs figure to the page and returns it. */
function figure(inner: string): HTMLElement {
  const el = document.createElement('figure');
  el.className = 'docs__media';
  el.innerHTML = inner;
  document.body.appendChild(el);
  return el;
}

/** Queries within a root, failing the test rather than returning null. */
function pick(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`expected to find ${selector}`);
  return found;
}

function overlay(fixture: ComponentFixture<MediaLightbox>): HTMLElement | null {
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.lbx');
}

function openOverlay(fixture: ComponentFixture<MediaLightbox>): HTMLElement {
  const box = overlay(fixture);
  if (!box) throw new Error('expected the lightbox to be open');
  return box;
}

describe('MediaLightbox', () => {
  let fixture: ComponentFixture<MediaLightbox>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [MediaLightbox] });
    fixture = TestBed.createComponent(MediaLightbox);
    fixture.detectChanges();
  });

  it('opens on a click on a figure image, carrying its source and caption', () => {
    const fig = figure(
      '<img src="/guide/dashboard-full.png" alt="The dashboard" /><figcaption>Caption</figcaption>',
    );
    pick(fig, 'img').click();

    const box = openOverlay(fixture);
    expect(pick(box, 'img').getAttribute('src')).toBe('/guide/dashboard-full.png');
    expect(pick(box, 'img').getAttribute('alt')).toBe('The dashboard');
    expect(pick(box, '.lbx__caption').textContent?.trim()).toBe('Caption');
    // The page behind must not scroll under the overlay.
    expect(document.body.classList.contains('is-lightboxed')).toBe(true);
  });

  it('closes on Escape and releases the page', () => {
    pick(figure('<img src="/guide/a.png" alt="" />'), 'img').click();
    expect(overlay(fixture)).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlay(fixture)).toBeNull();
    expect(document.body.classList.contains('is-lightboxed')).toBe(false);
  });

  it('opens a silent looping video, which has no controls of its own to conflict with', () => {
    const fig = figure('<video src="/guide/paste-job.mp4" aria-label="A recording"></video>');
    pick(fig, 'video').click();

    expect(pick(openOverlay(fixture), 'video').getAttribute('src')).toBe('/guide/paste-job.mp4');
  });

  it('ignores a click on a video that carries its own controls', () => {
    const fig = figure('<video src="/guide/tour-walkthrough.mp4" controls></video>');
    pick(fig, 'video').click();
    expect(overlay(fixture)).toBeNull();
  });

  it('opens that video from the figure button instead', () => {
    const fig = figure(
      '<video src="/guide/tour-walkthrough.mp4" controls></video>' +
        '<button type="button" class="docs__zoom"><svg></svg></button>',
    );
    pick(fig, '.docs__zoom').click();

    expect(pick(openOverlay(fixture), 'video').getAttribute('src')).toBe(
      '/guide/tour-walkthrough.mp4',
    );
  });

  it('ignores clicks outside a figure', () => {
    const stray = document.createElement('img');
    stray.src = '/brand/applye-favicon.svg';
    document.body.appendChild(stray);
    stray.click();
    expect(overlay(fixture)).toBeNull();
  });
});
