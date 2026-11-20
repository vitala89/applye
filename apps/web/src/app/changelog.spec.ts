import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Changelog } from './changelog';

const recentUrl = '/changelog-data/recent.json';
const archiveUrl = '/changelog-data/archive.json';
const latest = {
  version: '0.29.4',
  date: '2026-08-26',
  notesPath: '/blob/main/CHANGELOG.md#0294---2026-08-26',
  highlights: ['Fixed a macOS launch failure.'],
};
const older = {
  version: '0.29.1',
  date: '2026-07-30',
  notesPath: '/blob/main/CHANGELOG.md#0291---2026-07-30',
};

function json(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}

async function settle(fixture: ComponentFixture<Changelog>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
}

function toggle(fixture: ComponentFixture<Changelog>, open: boolean): void {
  const disclosure = (fixture.nativeElement as HTMLElement).querySelector('details')!;
  disclosure.open = open;
  disclosure.dispatchEvent(new Event('toggle'));
}

describe('Changelog', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn<Promise<Response>, [string]>();

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function render(): Promise<ComponentFixture<Changelog>> {
    const fixture = TestBed.createComponent(Changelog);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  it('shows recent highlights and makes the archive request only on first expansion', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ hasArchive: true, releases: [latest] }))
      .mockResolvedValueOnce(json([older]));
    const fixture = await render();
    const page = fixture.nativeElement as HTMLElement;

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([recentUrl]);
    expect(page.querySelector('details')?.open).toBe(false);
    expect(page.textContent).toContain(latest.highlights[0]);
    expect(page.querySelector('h2 a')?.getAttribute('href')).toContain(latest.notesPath);
    expect(page.textContent).not.toContain(older.version);

    toggle(fixture, true);
    await settle(fixture);
    expect(page.querySelector('details')?.textContent).toContain(older.version);
    expect(page.querySelector('details a')?.getAttribute('href')).toContain(older.notesPath);

    toggle(fixture, false);
    toggle(fixture, true);
    await settle(fixture);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([recentUrl, archiveUrl]);
  });

  it('deduplicates the request across rapid close and reopen, then allows retry after a failure', async () => {
    let replyToArchive!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(json({ hasArchive: true, releases: [latest] }))
      .mockReturnValueOnce(new Promise((resolve) => (replyToArchive = resolve)))
      .mockResolvedValueOnce(json([older]));
    const fixture = await render();
    const page = fixture.nativeElement as HTMLElement;

    toggle(fixture, true);
    toggle(fixture, false);
    toggle(fixture, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    replyToArchive({ ok: false, status: 404 } as Response);
    await settle(fixture);
    expect(page.querySelector('h2')?.textContent).toContain(latest.version);
    expect(page.querySelector('details [role="status"]')?.textContent).toContain('Could not load');

    page.querySelector<HTMLButtonElement>('details button')?.click();
    await settle(fixture);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([recentUrl, archiveUrl, archiveUrl]);
    expect(page.querySelector('details')?.textContent).toContain(older.version);
  });

  it('offers a full changelog link and retry when initial data is invalid', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ releases: null }))
      .mockResolvedValueOnce(json({ hasArchive: false, releases: [latest] }));
    const fixture = await render();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('a[href="/CHANGELOG.md"]')).not.toBeNull();
    page.querySelector<HTMLButtonElement>('button')?.click();
    await settle(fixture);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([recentUrl, recentUrl]);
    expect(page.querySelector('details')).toBeNull();
    expect(page.querySelector('h2')?.textContent).toContain(latest.version);
  });
});
