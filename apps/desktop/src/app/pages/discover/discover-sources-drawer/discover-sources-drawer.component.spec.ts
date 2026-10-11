import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DiscoverSourcesStore, SourceWriteResult } from '@applye/application';
import type { DiscoverSource } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { DiscoverSourcesDrawerComponent } from './discover-sources-drawer.component';

/**
 * The drawer is where every sources notification is raised: the store reports
 * what a write did and says nothing itself, because `libs/application` may not
 * reach the app's `ToastService` (ADR-0005). These tests pin the three outcomes
 * apart - announced success, announced failure, and the refused write that must
 * stay silent - since nothing else would notice a form clearing on a no-op.
 */

/** The protected members these tests drive, and the two forms they clear. */
interface DrawerInternals {
  toggleSource(source: DiscoverSource): Promise<void>;
  addBoard(): Promise<void>;
  addRss(): Promise<void>;
  removeSource(source: DiscoverSource, event: Event): Promise<void>;
  boardSlug: { set(v: string): void; (): string };
  boardFormOpen: { (): boolean };
  rssUrl: { set(v: string): void; (): string };
  rssName: { set(v: string): void; (): string };
}

function source(over: Partial<DiscoverSource> = {}): DiscoverSource {
  return { id: 1, name: 'WWR', isEnabled: true, isBuiltin: true, ...over } as DiscoverSource;
}

function createFixture(result: SourceWriteResult) {
  const store = {
    all: () => [],
    builtin: () => [],
    companyBoards: () => [],
    user: () => [],
    total: () => 0,
    enabledCount: () => 0,
    failing: () => 0,
    resultLine: () => ({ text: '', error: false }),
    setEnabled: jest.fn(async () => result),
    addBoard: jest.fn(async () => result),
    addRss: jest.fn(async () => result),
    remove: jest.fn(async () => result),
  };
  const toast = { success: jest.fn(), error: jest.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DiscoverSourcesDrawerComponent],
    providers: [
      provideRouter([]),
      // The key rather than the copy: these tests are about which message is
      // raised, and asserting on English text would make a wording change a
      // test failure.
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: DiscoverSourcesStore, useValue: store },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture: ComponentFixture<DiscoverSourcesDrawerComponent> = TestBed.createComponent(
    DiscoverSourcesDrawerComponent,
  );
  fixture.componentRef.setInput('markets', []);
  fixture.componentRef.setInput('geoScope', 'worldwide');
  fixture.detectChanges();
  const drawer = fixture.componentInstance as unknown as DrawerInternals;
  return { fixture, drawer, store, toast };
}

describe('DiscoverSourcesDrawerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /// `RouterLink` stayed on the page when this drawer was extracted, so the
  /// scope label rendered a literal `routerLink` attribute and navigated
  /// nowhere. An href is the only visible difference between the two states.
  it('links the scope label to Settings', () => {
    const { fixture } = createFixture({ ok: true });
    const link: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.dv-srcsummary__scope');
    expect(link?.getAttribute('href')).toBe('/settings');
  });
});

describe('DiscoverSourcesDrawerComponent notifications', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('announces an added board and clears the form', async () => {
    const { drawer, toast } = createFixture({ ok: true });
    drawer.boardSlug.set('acme');

    await drawer.addBoard();

    expect(toast.success).toHaveBeenCalledWith('discover.source_added');
    expect(toast.error).not.toHaveBeenCalled();
    expect(drawer.boardSlug()).toBe('');
    expect(drawer.boardFormOpen()).toBe(false);
  });

  it('announces an added feed and clears both of its fields', async () => {
    const { drawer, toast } = createFixture({ ok: true });
    drawer.rssUrl.set('https://jobs.example.com/feed.xml');
    drawer.rssName.set('Example');

    await drawer.addRss();

    expect(toast.success).toHaveBeenCalledWith('discover.source_added');
    expect(drawer.rssUrl()).toBe('');
    expect(drawer.rssName()).toBe('');
  });

  it('announces a removal', async () => {
    const { drawer, toast } = createFixture({ ok: true });

    await drawer.removeSource(source(), new Event('click'));

    expect(toast.success).toHaveBeenCalledWith('discover.source_removed');
  });

  /// A toggle that worked is visible in the checkbox it flipped, so it says
  /// nothing. Only the two writes the user initiates deliberately get a message.
  it('says nothing when a toggle succeeds', async () => {
    const { drawer, toast } = createFixture({ ok: true });

    await drawer.toggleSource(source());

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the store error text for every failed write', async () => {
    const { drawer, toast } = createFixture({ ok: false, error: 'Error: locked' });
    drawer.boardSlug.set('acme');

    await drawer.toggleSource(source());
    await drawer.addBoard();
    await drawer.removeSource(source(), new Event('click'));

    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(toast.error).toHaveBeenLastCalledWith('Error: locked');
    expect(toast.success).not.toHaveBeenCalled();
  });

  /// The empty-input case: nothing was attempted, so there is nothing to say and
  /// the form must keep what the user typed.
  it('stays silent and keeps the form when a write is refused', async () => {
    const { drawer, toast } = createFixture({ ok: false });
    drawer.boardSlug.set('kept');
    drawer.rssUrl.set('kept');

    await drawer.addBoard();
    await drawer.addRss();

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(drawer.boardSlug()).toBe('kept');
    expect(drawer.rssUrl()).toBe('kept');
  });
});
