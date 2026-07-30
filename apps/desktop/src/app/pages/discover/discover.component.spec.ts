import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import type { DiscoverFeedItem, DiscoverSource } from '@applye/core';
import { ToastService } from '../../core/toast/toast.service';
import { DiscoverComponent } from './discover.component';

/** Sources is the only way to turn a feed on. It used to live in the filter
 * row, which is rendered only for a non-empty feed - so an empty Discover had
 * no way back to it. These tests pin that it survives every empty view. */

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

function feedItem(): DiscoverFeedItem {
  return {
    id: 10,
    company: 'Acme',
    title: 'Backend Engineer',
    location: 'Remote',
    source: 'Remotive',
    createdAt: '2026-07-26T15:20:00Z',
    discoverShownAt: null,
    jdPreview: 'We are hiring.',
    sourceUrl: 'https://example.test/jobs/10',
    saved: false,
  };
}

async function createFixture(
  sources: DiscoverSource[],
  feed: DiscoverFeedItem[],
): Promise<ComponentFixture<DiscoverComponent>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DiscoverComponent],
    providers: [
      provideRouter([]),
      {
        provide: DbService,
        useValue: {
          listSources: jest.fn().mockResolvedValue(sources),
          discoverFeed: jest.fn().mockResolvedValue(feed),
          getProfile: jest.fn().mockResolvedValue(null),
          getSettings: jest.fn().mockResolvedValue({
            uiLanguage: 'en',
            geoScope: 'worldwide',
            market: null,
            lastScanMarket: null,
          }),
        },
      },
      TranslateService,
      ToastService,
    ],
  });
  const fixture = TestBed.createComponent(DiscoverComponent);
  fixture.detectChanges();
  // Zoneless: the constructor's load() settles on the microtask queue, and
  // whenStable() alone can resolve before it does. Drain, then re-render.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** Every control that opens the sources drawer, by visible label. */
function drawerOpeners(fixture: ComponentFixture<DiscoverComponent>): string[] {
  const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const opened: string[] = [];
  for (const button of buttons) {
    const label = (button.textContent ?? '').trim();
    if (label === 'Sources' || label === 'Choose sources') opened.push(label);
  }
  return opened;
}

describe('Discover: the sources drawer is always reachable', () => {
  it('offers Sources when the feed is empty but sources have been scanned', async () => {
    const fixture = await createFixture([source()], []);

    expect(fixture.componentInstance['view']()).toBe('caughtup');
    expect(drawerOpeners(fixture)).toEqual(['Sources']);
  });

  it('offers Sources when sources are enabled but never scanned', async () => {
    const fixture = await createFixture([source({ lastScanAt: null })], []);

    expect(fixture.componentInstance['view']()).toBe('never');
    expect(drawerOpeners(fixture)).toEqual(['Sources']);
  });

  it('offers Sources once, not twice, when the feed has rows', async () => {
    const fixture = await createFixture([source()], [feedItem()]);

    expect(fixture.componentInstance['view']()).toBe('feed');
    expect(drawerOpeners(fixture)).toEqual(['Sources']);
  });

  it('offers the first-run CTA when nothing is enabled yet', async () => {
    const fixture = await createFixture([source({ isEnabled: false, lastScanAt: null })], []);

    expect(fixture.componentInstance['view']()).toBe('first');
    expect(drawerOpeners(fixture)).toEqual(['Choose sources']);
  });

  it('actually opens the drawer from the header control', async () => {
    const fixture = await createFixture([source()], []);
    const button: HTMLButtonElement | undefined = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((b) => ((b as HTMLButtonElement).textContent ?? '').trim() === 'Sources') as
      HTMLButtonElement | undefined;

    button?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['drawerOpen']()).toBe(true);
  });
});
