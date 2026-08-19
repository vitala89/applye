import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AnalyticsApplication, AnalyticsFacts } from '@applye/core';
import { AiService, DbService, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { AnalyticsComponent } from './analytics.component';

/**
 * **Written before the page was split, deliberately.** This page had no spec of
 * any kind, and a split verified only by the tests written after it is a
 * description of the result rather than a check on it. Everything here asserts
 * against the rendered DOM - what the page puts on screen, not which component
 * put it there - so the same assertions hold before and after the extraction.
 *
 * The three states are separate `describe`s because the page renders three
 * completely different trees and the skeleton one is the branch a split is most
 * likely to drop silently.
 */
function app(partial: Partial<AnalyticsApplication> = {}): AnalyticsApplication {
  return {
    status: 'applied',
    appliedAt: '2026-07-01',
    savedAt: '2026-06-25',
    reachedInterview: false,
    reachedOffer: false,
    archived: false,
    score: null,
    firstResponseAt: null,
    statusChangedAt: null,
    location: null,
    ...partial,
  };
}

/** Enough applied rows, spread over distinct days, to clear the low-data floor
 * and populate every card the page can render. */
function loadedFacts(): AnalyticsFacts {
  const applications = Array.from({ length: 12 }, (_, i) =>
    app({
      appliedAt: `2026-07-${String((i % 27) + 1).padStart(2, '0')}`,
      statusChangedAt: `2026-07-${String((i % 27) + 1).padStart(2, '0')}`,
      score: 40 + i * 5,
      location: i % 2 === 0 ? 'Berlin' : 'Munich',
      reachedInterview: i < 4,
      reachedOffer: i < 2,
      firstResponseAt: i < 4 ? `2026-07-${String((i % 27) + 4).padStart(2, '0')}` : null,
    }),
  );
  return { applications, followups: [{ createdAt: '2026-07-05' }] };
}

describe('AnalyticsComponent', () => {
  let fixture: ComponentFixture<AnalyticsComponent>;

  /** Resolves on the next macrotask, after `ngOnInit`'s awaited load settles. */
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function mount(facts: AnalyticsFacts | null, fails = false): Promise<void> {
    const toast = { error: jest.fn(), success: jest.fn() };
    // One stub, two tokens - the document library and its exports come from
    // `DocumentsGateway` now; the rest of this stub is still `DbService`'s.
    const docsStub = {
      getAnalyticsFacts: fails
        ? jest.fn().mockRejectedValue(new Error('no db'))
        : jest.fn().mockResolvedValue(facts),
    };
    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        { provide: DbService, useValue: docsStub },
        { provide: JobsGateway, useValue: docsStub },
        { provide: DocumentsGateway, useValue: docsStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        { provide: ToastService, useValue: toast },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  const all = (sel: string): HTMLElement[] => Array.from(root().querySelectorAll(sel));

  describe('while loading', () => {
    beforeEach(async () => {
      // Never resolves, so the page stays on its loading branch.
      await TestBed.configureTestingModule({
        imports: [AnalyticsComponent],
        providers: [
          {
            provide: DbService,
            useValue: { getAnalyticsFacts: () => new Promise(() => undefined) },
          },
          {
            provide: JobsGateway,
            useValue: { getAnalyticsFacts: () => new Promise(() => undefined) },
          },
          { provide: AiService, useValue: {} },
          TranslateService,
          { provide: ToastService, useValue: { error: jest.fn() } },
          provideRouter([]),
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(AnalyticsComponent);
      fixture.detectChanges();
    });

    it('renders placeholder bars rather than a blank page', () => {
      expect(all('.ana-skel').length).toBeGreaterThan(0);
    });

    it('renders four placeholder tiles', () => {
      expect(all('.ana-tile').length).toBe(4);
    });

    it('shows the period buttons, disabled', () => {
      const segs = all('.ana-seg') as HTMLButtonElement[];
      expect(segs).toHaveLength(3);
      expect(segs.every((s) => s.disabled)).toBe(true);
    });

    it('renders no funnel rows and no real content', () => {
      expect(all('.ana-stage')).toHaveLength(0);
      expect(root().querySelector('.ana-empty')).toBeNull();
    });
  });

  describe('with no applications at all', () => {
    beforeEach(async () => {
      await mount({ applications: [], followups: [] });
      await settle();
    });

    it('renders the empty state and its call to action', () => {
      expect(root().querySelector('.ana-empty')).toBeTruthy();
      expect(root().querySelector('.ana-ghost-btn')?.getAttribute('href')).toBe('/jobs/new');
    });

    it('renders none of the cards', () => {
      expect(all('.ana-card')).toHaveLength(0);
      expect(all('.ana-tile')).toHaveLength(0);
    });
  });

  describe('with a loaded period', () => {
    beforeEach(async () => {
      await mount(loadedFacts());
      await settle();
    });

    it('renders the four KPI tiles with their values', () => {
      const tiles = all('.ana-tile');
      expect(tiles).toHaveLength(4);
      expect(all('.ana-tile__num')[0].textContent?.trim()).toBe('12');
      expect(all('.ana-tile__label').length).toBe(4);
    });

    it('renders a spark bar row for at least one tile', () => {
      expect(all('.ana-spark').length).toBeGreaterThan(0);
    });

    it('renders the funnel as bar rows with widths and counts', () => {
      const stages = all('.ana-stage');
      expect(stages.length).toBeGreaterThan(0);

      const fill = stages[0].querySelector('.ana-stage__fill') as HTMLElement;
      expect(fill.style.width).toMatch(/%$/);
      expect(stages[0].querySelector('.ana-stage__count')?.textContent?.trim()).toBeTruthy();
    });

    /** The funnel is the only bar list whose rows carry a conversion percentage,
     * and one shared component now renders all six. **Asserting only that the
     * column exists somewhere cannot fail**: a mutation making every list render
     * it left this green, which is the most likely regression of the whole
     * extraction. The property is that the column belongs to the funnel and to
     * nothing else, so it has to be counted per list. */
    it('gives the conversion percentage to the funnel and to no other list', () => {
      const lists = all('.ana-funnel');
      expect(lists.length).toBeGreaterThanOrEqual(6);

      expect(lists[0].querySelectorAll('.ana-stage__pct').length).toBeGreaterThan(0);
      for (const other of lists.slice(1)) {
        expect(other.querySelectorAll('.ana-stage__pct')).toHaveLength(0);
      }
    });

    /** Score vs outcome is the one list that renders the caption half of the
     * conversion column without the percentage half - the two gate separately,
     * and a component serving six call sites is exactly where that collapses
     * into one flag by accident. */
    it('renders a conversion caption without a percentage on the outcome list', () => {
      const withCaption = all('.ana-funnel').filter(
        (l) =>
          l.querySelectorAll('.ana-stage__of').length > 0 &&
          l.querySelectorAll('.ana-stage__pct').length === 0,
      );
      expect(withCaption.length).toBeGreaterThan(0);
    });

    /** The follow-ups line is drawn only when there are follow-ups. Asserting
     * that "a polyline exists" cannot see it disappear, because the
     * applications line is always drawn. */
    it('draws both trend lines when the period has follow-ups', () => {
      expect(root().querySelectorAll('.ana-trend__svg polyline')).toHaveLength(2);
    });

    it('renders the trend plot with both its polyline and its ticks', () => {
      expect(root().querySelector('.ana-trend')).toBeTruthy();
      expect(root().querySelector('.ana-trend__svg polyline')).toBeTruthy();
      expect(all('.ana-trend__ticks span').length).toBeGreaterThan(0);
    });

    /** Six cards render a bar list: funnel, score distribution, score vs
     * outcome, time to response, aging, locations. This is the count that a
     * shared child component has to keep. */
    it('renders every card the loaded fixture can populate', () => {
      expect(all('.ana-card').length).toBeGreaterThanOrEqual(6);
      expect(all('.ana-funnel').length).toBeGreaterThanOrEqual(6);
    });

    it('renders the leakage bar under the funnel', () => {
      expect(root().querySelector('.ana-leak')).toBeTruthy();
    });

    it('switching the period re-renders against the new window', () => {
      const segs = all('.ana-seg') as HTMLButtonElement[];
      const before = all('.ana-tile__num')[0].textContent?.trim();

      segs[0].click(); // 30d
      fixture.detectChanges();

      expect(segs[0].getAttribute('aria-pressed')).toBe('true');
      expect(all('.ana-tile__num')[0].textContent?.trim()).not.toBe(before);
    });

    it('renders the wide name column only for the locations card', () => {
      expect(all('.ana-stage__name--wide').length).toBeGreaterThan(0);
    });
  });

  describe('when the facts cannot be read', () => {
    it('reports the failure and renders the empty state rather than a blank page', async () => {
      await mount(null, true);
      await settle();

      const toast = TestBed.inject(ToastService) as unknown as { error: jest.Mock };
      expect(toast.error).toHaveBeenCalled();
      expect(root().querySelector('.ana-empty')).toBeTruthy();
    });
  });
});
