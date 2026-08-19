import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DbService, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { WizardProgressService } from '@applye/application';
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';
import { DashboardComponent } from './dashboard.component';

/**
 * **Written before the two list panels were split, deliberately.** The sibling
 * spec covers the resume card and the claimed-jobs rule, and touches neither
 * list. Everything here asserts against the rendered DOM rather than against
 * which component rendered it, so the same assertions hold before and after
 * `Upcoming interviews` and `Recent jobs` become one component with two call
 * sites.
 *
 * **The counts are per panel, not per page.** One component serving two call
 * sites is exactly the shape where "a pill exists somewhere" passes while the
 * interviews panel has grown a pill it should never draw, so every trailing
 * element is counted inside its own panel.
 */
const HOUR = 3_600_000;

/** A pipeline card with a scheduled interview stage in the future - the only
 *  shape that reaches the upcoming list. */
function interviewCard(partial: Record<string, unknown> = {}) {
  return {
    id: 1,
    company: 'Acme Corporation',
    title: 'Backend Engineer',
    status: 'interview',
    overdue: false,
    currentStageStatus: 'scheduled',
    currentStageLabel: 'Technical round',
    currentStageScheduledAt: new Date(Date.now() + 72 * HOUR).toISOString(),
    ...partial,
  };
}

function claimedJob(partial: Record<string, unknown> = {}) {
  return {
    id: 12,
    title: 'Platform Engineer',
    company: 'Globex',
    status: 'saved',
    claimed: true,
    ...partial,
  };
}

describe('DashboardComponent list panels', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let navigate: jest.Mock;

  async function mount(
    cards: Record<string, unknown>[] = [],
    jobs: Record<string, unknown>[] = [],
  ): Promise<void> {
    sessionStorage.clear();
    navigate = jest.fn();
    TestBed.resetTestingModule();
    // One stub, two tokens - `SystemGateway` now serves the shared
    // operations, and the rest of this stub is still `DbService`'s.
    const dbStub = {
      listPipelineCards: jest.fn().mockResolvedValue(cards),
      listJobsOverview: jest.fn().mockResolvedValue(jobs),
      getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: '# Someone' }),
      hashText: jest.fn().mockResolvedValue('hash'),
      getJob: jest.fn().mockResolvedValue(null),
    };
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DbService, useValue: dbStub },
        { provide: SystemGateway, useValue: dbStub },
        { provide: PasteJobModalService, useValue: { open: jest.fn() } },
        TranslateService,
        WizardProgressService,
      ],
    });
    fixture = TestBed.createComponent(DashboardComponent);
    // `go()` routes by URL, so that is the seam - not `navigate`.
    TestBed.inject(Router).navigateByUrl = navigate;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The two panels in the order the page lays them out: interviews, then jobs. */
  const panels = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.cols .panel'));
  const inPanel = (i: number, selector: string): HTMLElement[] =>
    Array.from(panels()[i].querySelectorAll(selector));
  const textIn = (i: number, selector: string): string =>
    (panels()[i].querySelector(selector)?.textContent ?? '').trim();

  it('lays out exactly two list panels, each with a title and a link', async () => {
    await mount([interviewCard()], [claimedJob()]);

    expect(panels().length).toBe(2);
    for (const i of [0, 1]) {
      expect(inPanel(i, '.panel__title').length).toBe(1);
      expect(inPanel(i, '.panel__link').length).toBe(1);
    }
    expect(textIn(0, '.panel__title')).not.toBe(textIn(1, '.panel__title'));
  });

  it('draws one row per interview, with monogram, role and company', async () => {
    await mount([interviewCard(), interviewCard({ id: 2, company: 'Globex Inc', title: 'SRE' })]);

    expect(inPanel(0, '.prow').length).toBe(2);
    expect(textIn(0, '.prow__mono')).toBe('AC');
    expect(textIn(0, '.prow__role')).toBe('Backend Engineer');
    expect(textIn(0, '.prow__company')).toBe('Acme Corporation');
  });

  /**
   * The trailing element is the only real difference between the two panels,
   * and it is what a shared component is most likely to leak across. Counted in
   * both directions, in both panels.
   */
  it('gives interviews a stage badge and a time, and never a status pill', async () => {
    await mount([interviewCard()], [claimedJob()]);

    expect(inPanel(0, '.badge').length).toBe(1);
    expect(textIn(0, '.badge')).toBe('Technical round');
    expect(inPanel(0, '.prow__time').length).toBe(1);
    expect(inPanel(0, '.pill').length).toBe(0);
  });

  it('gives recent jobs a status pill, and never a badge or a time', async () => {
    await mount([interviewCard()], [claimedJob()]);

    expect(inPanel(1, '.prow').length).toBe(1);
    expect(inPanel(1, '.pill').length).toBe(1);
    expect(inPanel(1, '.badge').length).toBe(0);
    expect(inPanel(1, '.prow__time').length).toBe(0);
  });

  /** Inside the 48-hour window the badge is accented; outside it is not. The
   *  page resolves that into a boolean before the row is drawn. */
  it('accents the badge only for an interview that is soon', async () => {
    await mount([
      interviewCard({ currentStageScheduledAt: new Date(Date.now() + 3 * HOUR).toISOString() }),
    ]);
    expect(inPanel(0, '.badge--accent').length).toBe(1);

    await mount([interviewCard()]);
    expect(inPanel(0, '.badge').length).toBe(1);
    expect(inPanel(0, '.badge--accent').length).toBe(0);
  });

  /** The applied pill carries a dot; every other status does not. */
  it('marks an applied job with a dotted pill and nothing else with one', async () => {
    await mount([], [claimedJob({ status: 'applied' })]);
    expect(inPanel(1, '.pill--applied').length).toBe(1);
    expect(inPanel(1, '.pill__dot').length).toBe(1);

    await mount([], [claimedJob({ status: 'saved' })]);
    expect(inPanel(1, '.pill').length).toBe(1);
    expect(inPanel(1, '.pill--applied').length).toBe(0);
    expect(inPanel(1, '.pill__dot').length).toBe(0);
  });

  it('opens the interview from its row and the job from its own', async () => {
    await mount([interviewCard({ id: 5 })], [claimedJob({ id: 9 })]);

    (inPanel(0, '.prow')[0] as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('/interview-prep/5');

    (inPanel(1, '.prow')[0] as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('/jobs/9');
  });

  /** Each panel's link goes somewhere different, which is the whole reason it
   *  is a per-call-site value rather than a constant in the panel. */
  it('sends each panel link to its own destination', async () => {
    await mount([interviewCard()], [claimedJob()]);

    (inPanel(0, '.panel__link')[0] as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('/interview-prep');

    (inPanel(1, '.panel__link')[0] as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('/pipeline');
  });

  /** The empty states are per panel and say different things - the branch a
   *  split is most likely to collapse into one. */
  it('gives each panel its own empty state when it has nothing to show', async () => {
    await mount([], []);

    for (const i of [0, 1]) {
      expect(inPanel(i, '.panel__empty').length).toBe(1);
      expect(inPanel(i, '.panel__empty-icon').length).toBe(1);
      expect(inPanel(i, '.prow').length).toBe(0);
    }
    expect(textIn(0, '.panel__empty-title')).not.toBe(textIn(1, '.panel__empty-title'));
    expect(textIn(0, '.panel__empty-body')).not.toBe(textIn(1, '.panel__empty-body'));
  });

  it('shows one panel populated while the other is empty', async () => {
    await mount([interviewCard()], []);

    expect(inPanel(0, '.prow').length).toBe(1);
    expect(inPanel(0, '.panel__empty').length).toBe(0);
    expect(inPanel(1, '.prow').length).toBe(0);
    expect(inPanel(1, '.panel__empty').length).toBe(1);
  });

  it('caps the interview list at five rows', async () => {
    const cards = Array.from({ length: 7 }, (_, i) =>
      interviewCard({
        id: i + 1,
        currentStageScheduledAt: new Date(Date.now() + (i + 2) * 24 * HOUR).toISOString(),
      }),
    );
    await mount(cards);

    expect(inPanel(0, '.prow').length).toBe(5);
  });
});

describe('DashboardComponent KPI tiles and queue', () => {
  let fixture: ComponentFixture<DashboardComponent>;

  async function mount(cards: Record<string, unknown>[] = []): Promise<void> {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    // One stub, two tokens - `SystemGateway` now serves the shared
    // operations, and the rest of this stub is still `DbService`'s.
    const dbStub2 = {
      listPipelineCards: jest.fn().mockResolvedValue(cards),
      listJobsOverview: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: '# Someone' }),
      hashText: jest.fn().mockResolvedValue('hash'),
      getJob: jest.fn().mockResolvedValue(null),
    };
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DbService, useValue: dbStub2 },
        { provide: SystemGateway, useValue: dbStub2 },
        { provide: PasteJobModalService, useValue: { open: jest.fn() } },
        TranslateService,
        WizardProgressService,
      ],
    });
    fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const q = (s: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(s));

  /** Each tile is a shortcut, and the four go to three different places. A
   *  mutation that pointed one at the wrong screen was invisible until this
   *  existed. */
  it('sends each KPI tile to its own screen', async () => {
    await mount([interviewCard()]);
    const navigate = jest.fn();
    TestBed.inject(Router).navigateByUrl = navigate;

    q('.tile').forEach((tile) => tile.click());

    expect(navigate.mock.calls.map((c) => c[0])).toEqual([
      '/tracker',
      '/interview-prep',
      '/pipeline',
      '/tracker',
    ]);
  });

  it('draws four KPI tiles, and warns on the overdue one only', async () => {
    await mount([interviewCard({ overdue: true })]);

    expect(q('.tile').length).toBe(4);
    expect(q('.tile--warn').length).toBe(1);
    expect(q('.tile--warn')[0].textContent).toContain('1');
  });

  it('does not warn when nothing is overdue', async () => {
    await mount([interviewCard()]);

    expect(q('.tile').length).toBe(4);
    expect(q('.tile--warn').length).toBe(0);
  });

  /** The quick actions are three buttons that are not queue cards, and they
   *  share `.qbtn` with the queue - so counting them apart matters. */
  it('offers three quick actions outside the queue', async () => {
    await mount([]);

    expect(q('.quick .qbtn').length).toBe(3);
    expect(q('.quick .qbtn--secondary').length).toBe(3);
  });

  /** With nothing in the database at all the page is looking at a new user, and
   *  the queue it draws is the onboarding one rather than the caught-up state. */
  it('shows the new-user queue rather than caught up on an empty database', async () => {
    await mount([]);

    expect(q('.caught').length).toBe(0);
    expect(q('.qcard').length).toBeGreaterThan(0);
  });
});
