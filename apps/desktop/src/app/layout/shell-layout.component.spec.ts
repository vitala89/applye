import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DbService, DocumentsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ShellLayoutComponent } from './shell-layout.component';
import { UPDATE_BACKEND, UpdaterService } from '../core/updater.service';

/**
 * The shell had no test at all, and the update badge was the proof: the
 * template referenced a member the component did not have, and only
 * `nx build desktop` caught it - `tsc --noEmit` does not type-check templates,
 * and nothing built this component. This spec is that missing gate, scoped to
 * the badge.
 */
describe('ShellLayoutComponent update badge', () => {
  let fixture: ComponentFixture<ShellLayoutComponent>;
  let updater: UpdaterService;

  function badge(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.nav-item__update');
  }

  beforeEach(async () => {
    const dbStub: Partial<DbService> = {
      getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
      getProfile: jest.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      imports: [ShellLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: DbService, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        TranslateService,
        {
          provide: UPDATE_BACKEND,
          useValue: { check: jest.fn().mockResolvedValue(null), relaunch: jest.fn() },
        },
      ],
    });

    updater = TestBed.inject(UpdaterService);
    fixture = TestBed.createComponent(ShellLayoutComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows no badge while the build is current', () => {
    expect(badge()).toBeNull();
  });

  it('badges Settings once an update is available', () => {
    updater.state.set('available');
    updater.newVersion.set('0.30.0');
    fixture.detectChanges();

    expect(badge()).not.toBeNull();
    expect(badge()?.textContent?.trim()).toBe('Update');
  });

  it('keeps the badge while the update installs', () => {
    updater.state.set('installing');
    fixture.detectChanges();

    expect(badge()).not.toBeNull();
  });

  it('shows no badge when the check failed', () => {
    updater.state.set('error');
    fixture.detectChanges();

    expect(badge()).toBeNull();
  });
});
