import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { DashboardStore } from '@applye/application';
import { DashboardComponent } from './dashboard.component';

/** The dashboard's data and its translation-free derivations are
 * `DashboardStore`'s since ADR-0005 amendment thirty-two, and the store is
 * component-scoped - so it comes from the component's own injector. The queue,
 * the greeting and the recent rows stay on the component, because they carry
 * icons, translations and navigation. */
const storeOf = (fixture: {
  debugElement: { injector: { get: (t: unknown) => DashboardStore } };
}): DashboardStore => fixture.debugElement.injector.get(DashboardStore);
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';
import { WizardProgressService } from '@applye/application';

/**
 * The resume card must name the job it reopens.
 *
 * `listJobsOverview()` returns only the jobs the user claimed, so a session
 * started on an analysed-but-unsaved job has no row there and the card rendered
 * "Resume tailoring for" with nothing after it. These tests build the real
 * component and read the rendered card, because the bug lives in the wiring
 * between an async lookup and a synchronous `computed` - the place a stubbed
 * unit test cannot see.
 *
 * `WizardProgressService` is the real service, driven through its own `set()`.
 */
describe('DashboardComponent resume card', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let getJob: jest.Mock;

  const CLAIMED = {
    id: 7,
    title: 'Backend Engineer',
    company: 'Acme',
    status: 'saved',
    claimed: true,
  };

  async function build(): Promise<void> {
    fixture = TestBed.createComponent(DashboardComponent);
    // The component loads from its constructor, so let that settle before reading the DOM.
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function cardTitles(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.qcard__title')).map((el) =>
      ((el as HTMLElement).textContent ?? '').trim(),
    );
  }

  function resumeTitle(): string {
    return cardTitles().find((t) => t.startsWith('Resume tailoring for')) ?? '';
  }

  beforeEach(() => {
    sessionStorage.clear();
    getJob = jest.fn().mockResolvedValue({ id: 12, title: 'Platform Engineer', company: 'Globex' });

    const dbStub: Partial<DbService> = {
      listPipelineCards: jest.fn().mockResolvedValue([]),
      listJobsOverview: jest.fn().mockResolvedValue([CLAIMED]),
      getProfile: jest
        .fn()
        .mockResolvedValue({ id: 1, fullMd: '# Someone', updatedAt: '2026-08-02' }),
      hashText: jest.fn().mockResolvedValue('hash'),
      getJob,
    };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DbService, useValue: dbStub },
        { provide: PasteJobModalService, useValue: { open: jest.fn() } },
        TranslateService,
        WizardProgressService,
      ],
    });
  });

  it('names a claimed job from the overview list, without reading the database', async () => {
    TestBed.inject(WizardProgressService).set(CLAIMED.id, 2);
    await build();

    expect(resumeTitle()).toBe('Resume tailoring for Acme');
    expect(getJob).not.toHaveBeenCalled();
  });

  // The regression: job 12 is analysed but unclaimed, so it is absent from the
  // overview list and the card used to render a bare caption.
  it('names an unclaimed job by reading it directly', async () => {
    TestBed.inject(WizardProgressService).set(12, 1);
    await build();

    expect(getJob).toHaveBeenCalledWith(12);
    expect(resumeTitle()).toBe('Resume tailoring for Globex');
  });

  it('falls back to the job id when the job cannot be read at all', async () => {
    getJob.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(WizardProgressService).set(12, 1);
    await build();

    expect(resumeTitle()).toBe('Resume tailoring for #12');
  });

  // ADR-0004 relaxed `listJobsOverview` so unclaimed rows come back flagged,
  // for My Jobs to offer behind a filter. The dashboard is not that filter, and
  // an unclaimed row here would appear in Recent jobs labelled "Saved" - the
  // exact ambiguity the ADR exists to remove.
  it('keeps unclaimed jobs out of Recent jobs', async () => {
    (TestBed.inject(DbService).listJobsOverview as jest.Mock).mockResolvedValue([
      { ...CLAIMED, claimed: true },
      { id: 99, title: 'Ghost Role', company: 'Nowhere Inc', status: null, claimed: false },
    ]);
    await build();

    expect(fixture.nativeElement.textContent).toContain('Acme');
    expect(fixture.nativeElement.textContent).not.toContain('Nowhere Inc');
  });

  it('still reads as a new user when every job is merely analysed', async () => {
    (TestBed.inject(DbService).listJobsOverview as jest.Mock).mockResolvedValue([
      { id: 99, title: 'Ghost Role', company: 'Nowhere Inc', status: null, claimed: false },
    ]);
    (TestBed.inject(DbService).getProfile as jest.Mock).mockResolvedValue({ id: 1, fullMd: '' });
    await build();

    expect(storeOf(fixture).isNewUser()).toBe(true);
  });

  it('shows no resume card when no tailoring session is in flight', async () => {
    await build();

    expect(resumeTitle()).toBe('');
    expect(getJob).not.toHaveBeenCalled();
  });
});
