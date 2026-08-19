import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { provideRouter } from '@angular/router';
import { PipelineCard } from '@applye/core';
import {
  AiService,
  DbService,
  DocumentsGateway,
  InterviewGateway,
  JobsGateway,
} from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { PipelineComponent } from './pipeline.component';

/**
 * **Written before the card was extracted, deliberately.** The only spec this
 * page had compiles its stylesheet to check one cascade; nothing had ever
 * rendered the board. Everything here asserts against the rendered DOM rather
 * than against which component drew it, so the same assertions hold before and
 * after `app-pipeline-card` exists.
 *
 * **Cards are counted inside their own column.** Five columns draw the same card
 * markup, and "a stage track exists somewhere on the board" passes while every
 * column has grown one - the track belongs to Interview and to nothing else.
 */
const TODAY = new Date().toISOString();

/** Yields to the macrotask queue so the constructor's load can settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function card(partial: Partial<PipelineCard> = {}): PipelineCard {
  return {
    id: 1,
    jobId: 11,
    company: 'Acme Corporation',
    title: 'Backend Engineer',
    status: 'applied',
    overdue: false,
    appliedAt: TODAY,
    updatedAt: TODAY,
    score: 78,
    ...partial,
  } as PipelineCard;
}

describe('PipelineComponent board', () => {
  let fixture: ComponentFixture<PipelineComponent>;

  async function mount(cards: PipelineCard[] = [card()]): Promise<void> {
    TestBed.resetTestingModule();
    // One stub, two tokens: the interview stages come from `InterviewGateway`
    // now, and the rest of this stub is still `DbService`'s - those domains
    // have not moved.
    const dbStub = {
      listPipelineCards: jest.fn().mockResolvedValue(cards),
      listInterviewStages: jest.fn().mockResolvedValue([]),
      setApplicationStatus: jest.fn().mockResolvedValue(undefined),
      listApplicationComments: jest.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      imports: [PipelineComponent],
      providers: [
        provideRouter([]),
        { provide: DbService, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: InterviewGateway, useValue: dbStub },
        { provide: AiService, useValue: { renderSkill: jest.fn(), run: jest.fn() } },
        TranslateService,
        ToastService,
      ],
    });
    fixture = TestBed.createComponent(PipelineComponent);
    fixture.detectChanges();
    await flush();
    await flush();
    fixture.detectChanges();
  }

  const all = (s: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(s));
  const one = (s: string): HTMLElement | null => fixture.nativeElement.querySelector(s);
  const text = (s: string): string => (one(s)?.textContent ?? '').trim();

  /** The open (non-rail) columns, in board order: applied, interview, offer. */
  const columns = (): HTMLElement[] => all('.board .col');
  const inColumn = (i: number, selector: string): HTMLElement[] =>
    Array.from(columns()[i].querySelectorAll(selector));

  describe('the board layout', () => {
    it('opens three columns and collapses the two terminal ones into rails', async () => {
      await mount();

      expect(columns().length).toBe(3);
      expect(all('.board .rail').length).toBe(2);
      expect(all('.col__list').length).toBe(3);
    });

    it('counts the cards in each column head', async () => {
      await mount([card({ id: 1 }), card({ id: 2 }), card({ id: 3, status: 'offer' })]);

      expect(inColumn(0, '.col__badge')[0].textContent?.trim()).toBe('2');
      expect(inColumn(1, '.col__badge')[0].textContent?.trim()).toBe('0');
      expect(inColumn(2, '.col__badge')[0].textContent?.trim()).toBe('1');
    });

    it('says the column is a drop target when it has no cards', async () => {
      await mount([card()]);

      expect(inColumn(0, '.col__empty').length).toBe(0);
      expect(inColumn(1, '.col__empty').length).toBe(1);
      expect(inColumn(2, '.col__empty').length).toBe(1);
    });
  });

  describe('a card', () => {
    it('draws the monogram, company and role', async () => {
      await mount();

      expect(all('.card').length).toBe(1);
      expect(text('.card__mono')).toBe('AC');
      expect(text('.card__company')).toBe('Acme Corporation');
      expect(text('.card__role')).toBe('Backend Engineer');
    });

    it('falls back to a dash rather than an empty line', async () => {
      await mount([card({ company: undefined, title: undefined })]);

      expect(text('.card__company')).toBe('-');
      expect(text('.card__role')).toBe('-');
    });

    /** The flag, the location and the ATS badge are each conditional, and each
     *  has a silent fallback - so both halves are counted. */
    it('shows the priority flag only for a card that has one', async () => {
      await mount([card({ priority: 'high' }), card({ id: 2, priority: null })]);

      expect(all('.card__flag').length).toBe(1);
      expect(one('.card__flag')?.getAttribute('data-priority')).toBe('high');
    });

    it('shows the location only when the card has one', async () => {
      await mount([card({ location: 'Berlin' }), card({ id: 2 })]);

      expect(all('.card__loc').length).toBe(1);
      expect(text('.card__loc')).toContain('Berlin');
    });

    it('shows the ATS score, or says there is none', async () => {
      await mount([card({ score: 91 })]);
      expect(all('.card__ats').length).toBe(1);
      expect(text('.card__ats-val')).toBe('91');
      expect(all('.card__noscore').length).toBe(0);

      await mount([card({ score: null })]);
      expect(all('.card__ats').length).toBe(0);
      expect(all('.card__noscore').length).toBe(1);
    });

    /** An overdue card takes a different foot entirely, not merely a colour. */
    it('marks an overdue follow-up apart from an ordinary date', async () => {
      await mount([card({ overdue: true, followUpAt: TODAY })]);
      expect(all('.card__due--over').length).toBe(1);

      await mount([card({ overdue: false })]);
      expect(all('.card__due').length).toBe(1);
      expect(all('.card__due--over').length).toBe(0);
    });

    /**
     * The card's box and its `cdkDrag` sit on the host element, and the drag
     * placeholder reaches `CdkDrag` through `<ng-content>`. Both are invisible
     * to a DOM query - a structural directive renders nothing until a drag
     * starts, and jsdom cannot drag - so this asserts the wiring the CDK
     * actually resolved. It is the check that the projection works.
     */
    it('registers each card with the drop list, placeholder and all', async () => {
      await mount([card({ id: 1 }), card({ id: 2 })]);

      const drags = fixture.debugElement.queryAll(By.directive(CdkDrag));
      expect(drags.length).toBe(2);
      for (const drag of drags) {
        expect((drag.nativeElement as HTMLElement).tagName.toLowerCase()).toBe('app-pipeline-card');
        expect((drag.nativeElement as HTMLElement).classList.contains('card')).toBe(true);
        // `_placeholderTemplate` is what `CdkDrag` fills from its content child.
        // Empty means the projected `*cdkDragPlaceholder` never reached it, and
        // the drag would fall back to a clone of the whole card.
        expect(drag.injector.get(CdkDrag)['_placeholderTemplate']).toBeTruthy();
        // And each card belongs to a drop list rather than being a loose
        // draggable: `CdkDropList` finds its items through content children, so
        // a `cdkDrag` inside the child's own view would not have been found.
        expect(drag.injector.get(CdkDrag).dropContainer).toBeInstanceOf(CdkDropList);
      }
    });

    it('opens the quick view when the card is clicked', async () => {
      await mount();
      expect(all('app-quick-view-modal').length).toBe(0);

      (one('.card') as HTMLElement).click();
      await flush();
      fixture.detectChanges();

      expect(all('app-quick-view-modal').length).toBe(1);
    });
  });

  describe('the interview stage track', () => {
    const staged = (partial: Partial<PipelineCard> = {}): PipelineCard =>
      card({
        id: 9,
        status: 'interview',
        currentStageOrder: 2,
        currentStageStatus: 'scheduled',
        currentStageLabel: 'Technical round',
        currentStageTotal: 3,
        ...partial,
      } as Partial<PipelineCard>);

    /** The track belongs to the Interview column. Counted per column, because
     *  one component drawing five columns' cards is exactly where it leaks. */
    it('draws the track in the interview column and in no other', async () => {
      await mount([staged(), card({ id: 1, currentStageOrder: 2 } as Partial<PipelineCard>)]);

      expect(inColumn(1, '.card__track').length).toBe(1);
      expect(inColumn(0, '.card__track').length).toBe(0);
      expect(inColumn(2, '.card__track').length).toBe(0);
      expect(all('.card__track').length).toBe(1);
    });

    it('names the stage and counts it against the total', async () => {
      await mount([staged()]);

      expect(text('.card__track-label')).toBe('Technical round');
      expect(text('.card__track-count').replace(/\s+/g, '')).toBe('2/3');
      expect(one('.card__track-dot')?.getAttribute('data-status')).toBe('scheduled');
    });

    /** One segment per stage, filled up to the current one. */
    it('fills the segments up to the current stage', async () => {
      await mount([staged()]);

      const segments = all('.card__seg');
      expect(segments.length).toBe(3);
      expect(segments.filter((s) => s.classList.contains('is-filled')).length).toBe(2);
      expect(segments[2].classList.contains('is-filled')).toBe(false);
    });

    it('draws no track for an interview card with no stage recorded', async () => {
      await mount([staged({ currentStageOrder: undefined } as Partial<PipelineCard>)]);

      expect(all('.card__track').length).toBe(0);
      expect(all('.card').length).toBe(1);
    });
  });

  describe('the summary strip', () => {
    it('counts the active cards, and the overdue ones only when there are any', async () => {
      await mount([card(), card({ id: 2, overdue: true, followUpAt: TODAY })]);
      expect(text('.strip__stat')).toContain('2');
      expect(all('.strip__overdue').length).toBe(1);

      await mount([card()]);
      expect(all('.strip__overdue').length).toBe(0);
    });

    /** Searching narrows the board and says how many matched; the match count
     *  is absent until there is a search to report on. */
    it('filters the cards and reports the match count', async () => {
      await mount([card({ company: 'Acme Corporation' }), card({ id: 2, company: 'Globex' })]);
      expect(all('.card').length).toBe(2);
      expect(all('.strip__match').length).toBe(0);

      const input = one('.strip__search input') as HTMLInputElement;
      input.value = 'Globex';
      input.dispatchEvent(new Event('input'));
      await flush();
      fixture.detectChanges();

      expect(all('.card').length).toBe(1);
      expect(text('.card__company')).toBe('Globex');
      expect(all('.strip__match').length).toBe(1);
      expect(text('.strip__match')).toContain('1');
      // The column badge follows the filter, rather than counting what the
      // column holds - otherwise a search leaves a count nothing on screen adds
      // up to.
      expect(inColumn(0, '.col__badge')[0].textContent?.trim()).toBe('1');
    });
  });

  describe('the states around the board', () => {
    it('says the board is empty when there is nothing on it', async () => {
      await mount([]);

      expect(all('.card').length).toBe(0);
      expect(all('.state-empty').length).toBe(1);
    });

    it('reports a failed read with a retry rather than an empty board', async () => {
      TestBed.resetTestingModule();
      // One stub, two tokens: the interview stages come from `InterviewGateway`
      // now, and the rest of this stub is still `DbService`'s - those domains
      // have not moved.
      const dbStub2 = {
        listPipelineCards: jest.fn().mockRejectedValue(new Error('db gone')),
        listInterviewStages: jest.fn().mockResolvedValue([]),
      };
      TestBed.configureTestingModule({
        imports: [PipelineComponent],
        providers: [
          provideRouter([]),
          { provide: DbService, useValue: dbStub2 },
          { provide: JobsGateway, useValue: dbStub2 },
          { provide: DocumentsGateway, useValue: dbStub2 },
          { provide: InterviewGateway, useValue: dbStub2 },
          { provide: AiService, useValue: {} },
          TranslateService,
          ToastService,
        ],
      });
      fixture = TestBed.createComponent(PipelineComponent);
      fixture.detectChanges();
      await flush();
      await flush();
      fixture.detectChanges();

      expect(all('.state-error').length).toBe(1);
      expect(text('.state-error__msg')).toContain('db gone');
      expect(all('.board').length).toBe(0);
    });
  });
});
