import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DbService, DiscoverGateway, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import type { DiscoverFeedItem, DiscoverSource } from '@applye/core';
import { ToastService } from '@applye/application';
import { DiscoverComponent } from './discover.component';

/**
 * **Written before the clear-feed dialog was extracted, deliberately.** Discover
 * has a spec, but it covers the sources drawer and the archetype badge - nothing
 * had ever opened the confirmation that wipes the feed. Every assertion here is
 * against the rendered DOM, so the same ones hold before and after
 * `app-discover-clear-confirm` exists.
 *
 * **The dialog is a destructive action behind a confirmation**, which is the one
 * thing on this page where a wrong branch loses the user's data: the cancel and
 * the confirm are counted apart, and each is asserted to call its own handler.
 */
function source(over: Partial<DiscoverSource> = {}): DiscoverSource {
  return {
    id: 1,
    name: 'Remotive',
    type: 'api',
    url: 'https://example.test/jobs',
    slug: 'remotive',
    isBuiltin: true,
    isEnabled: true,
    geoTagsJson: null,
    legalityNote: null,
    lastScanAt: '2026-07-26T15:20:00Z',
    lastScanJson: null,
    ...over,
  };
}

function feedItem(id = 10): DiscoverFeedItem {
  return {
    id,
    company: 'Acme',
    title: 'Backend Engineer',
    location: 'Remote',
    source: 'Remotive',
    createdAt: '2026-07-26T15:20:00Z',
    discoverShownAt: null,
    jdPreview: 'We are hiring.',
    sourceUrl: 'https://example.test/jobs/' + id,
    saved: false,
  };
}

describe('Discover: the clear-feed confirmation', () => {
  let fixture: ComponentFixture<DiscoverComponent>;
  let clearFeed: jest.Mock;

  async function mount(): Promise<void> {
    clearFeed = jest.fn().mockResolvedValue(undefined);
    const db = {
      listSources: jest.fn().mockResolvedValue([source()]),
      discoverFeed: jest.fn().mockResolvedValue([feedItem(10), feedItem(11)]),
      getProfile: jest.fn().mockResolvedValue(null),
      getSettings: jest.fn().mockResolvedValue({
        uiLanguage: 'en',
        geoScope: 'worldwide',
        market: null,
        lastScanMarket: null,
      }),
      discoverClear: clearFeed,
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DiscoverComponent],
      providers: [
        provideRouter([]),
        // One stub, two tokens. The page's stores read sources and the feed
        // through `DiscoverGateway` now, and still read the profile and the
        // settings through `DbService` - neither domain has moved yet.
        { provide: DbService, useValue: db },
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
        { provide: DiscoverGateway, useValue: db },
        TranslateService,
        ToastService,
      ],
    });
    fixture = TestBed.createComponent(DiscoverComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const all = (s: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(s));
  const one = (s: string): HTMLElement | null => fixture.nativeElement.querySelector(s);

  /** Opens the dialog through the page's own state, rather than by hunting for
   *  whichever control happens to raise it. */
  async function open(): Promise<void> {
    fixture.componentInstance['page'].askClearFeed();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('stays closed until it is asked for', async () => {
    await mount();

    expect(all('.dv-confirm').length).toBe(0);
  });

  it('opens as a modal dialog with a title, a body and two actions', async () => {
    await mount();
    await open();

    const dialog = one('.dv-confirm');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBeTruthy();
    expect(all('.dv-confirm__title').length).toBe(1);
    expect(all('.dv-confirm__body').length).toBe(1);
    expect(all('.dv-confirm__actions button').length).toBe(2);
  });

  /** The destructive one is marked as destructive, and it is the second - the
   *  order is what a user's muscle memory relies on. */
  it('marks the destructive action apart from the cancel', async () => {
    await mount();
    await open();

    const buttons = all('.dv-confirm__actions button');
    expect(buttons[0].classList.contains('dv-btn--secondary')).toBe(true);
    expect(buttons[1].classList.contains('dv-btn--danger')).toBe(true);
    expect(all('.dv-confirm__actions .dv-btn--danger').length).toBe(1);
  });

  it('cancelling closes it and wipes nothing', async () => {
    await mount();
    await open();

    (all('.dv-confirm__actions button')[0] as HTMLElement).click();
    // Drained the same way the confirm path is, so "nothing was wiped" is
    // asserted in the state where a wipe would already have happened. Without
    // this the assertion passes for a cancel wired to the destructive handler.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(all('.dv-confirm').length).toBe(0);
    expect(clearFeed).not.toHaveBeenCalled();
  });

  /** Clicking outside the dialog cancels. It is a separate handler from the
   *  cancel button, on a much larger target, and pointing it at the destructive
   *  path would wipe the feed on a misdirected click. */
  it('clicking the backdrop closes it and wipes nothing', async () => {
    await mount();
    await open();

    (one('.dv-overlay') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(all('.dv-confirm').length).toBe(0);
    expect(clearFeed).not.toHaveBeenCalled();
  });

  /** ...and a click that lands on the dialog itself must not reach it. */
  it('clicking inside the dialog does not close it', async () => {
    await mount();
    await open();

    (one('.dv-confirm') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(all('.dv-confirm').length).toBe(1);
    expect(clearFeed).not.toHaveBeenCalled();
  });

  it('confirming wipes the feed', async () => {
    await mount();
    await open();

    (all('.dv-confirm__actions button')[1] as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(clearFeed).toHaveBeenCalledTimes(1);
  });

  /** Both buttons go disabled while the wipe is running, so a second click
   *  cannot start a second one. */
  it('disables both actions while the wipe is in flight', async () => {
    await mount();
    await open();

    fixture.componentInstance['page'].clearing.set(true);
    fixture.detectChanges();

    const buttons = all('.dv-confirm__actions button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
