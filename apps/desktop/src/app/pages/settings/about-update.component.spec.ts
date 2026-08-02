import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { AboutUpdateComponent } from './about-update.component';
import { UPDATE_BACKEND, UpdaterService, type PendingUpdate } from '../../core/updater.service';

/**
 * The About block is the only place the update is visible outside the sidebar
 * badge, and the settings page cannot be exercised in a browser preview - it
 * blocks on `db_get_settings`. So the states are proved here, by building the
 * component against the real `UpdaterService` and a fake backend.
 */
describe('AboutUpdateComponent', () => {
  let fixture: ComponentFixture<AboutUpdateComponent>;
  let updater: UpdaterService;
  let check: jest.Mock;
  let install: jest.Mock;

  function text(): string {
    // textContent, not innerText: jsdom does not implement innerText.
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function buttons(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).map((b) =>
      ((b as HTMLElement).textContent ?? '').trim(),
    );
  }

  beforeEach(async () => {
    install = jest.fn().mockResolvedValue(undefined);
    check = jest.fn().mockResolvedValue(null);

    TestBed.configureTestingModule({
      imports: [AboutUpdateComponent],
      providers: [
        TranslateService,
        {
          provide: UPDATE_BACKEND,
          useValue: { check, relaunch: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    });

    updater = TestBed.inject(UpdaterService);
    fixture = TestBed.createComponent(AboutUpdateComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers a check before anything has run', () => {
    expect(buttons()).toEqual(['Check for updates']);
  });

  it('says the build is current when the check finds nothing', async () => {
    await updater.check();
    fixture.detectChanges();

    expect(text()).toContain('You are on the latest version.');
    expect(buttons()).toEqual(['Check for updates']);
  });

  // The point of the feature: the version on offer is named, and the button
  // that takes it replaces the one that looks for it.
  it('names the new version and offers to install it', async () => {
    check.mockResolvedValue({ version: '0.30.0', install } as PendingUpdate);
    await updater.check();
    fixture.detectChanges();

    expect(text()).toContain('Update available: 0.30.0');
    expect(buttons()).toEqual(['Install & restart']);
  });

  // A check that dies must say so - silence reads as "you are up to date".
  it('shows the failure and its reason rather than nothing', async () => {
    check.mockRejectedValue(new Error('network unreachable'));
    await updater.check();
    fixture.detectChanges();

    expect(text()).toContain('The update check failed.');
    expect(text()).toContain('network unreachable');
  });

  it('hides the control entirely outside the desktop app', async () => {
    // The default backend raises `UpdaterUnavailableError`; the fake stands in
    // for it through the service's own state.
    updater.state.set('unavailable');
    fixture.detectChanges();

    expect(buttons()).toEqual([]);
    expect(text()).toContain('Updates are handled by the desktop app.');
  });
});
