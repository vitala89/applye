import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PipelineCard } from '@applye/core';
import { AiService, DbService, DocumentsGateway, InterviewGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { QuickViewModalComponent } from './quick-view-modal.component';

/**
 * The reported bug: opening a Pipeline card's quick view and clicking "Open
 * full details" landed on an unrelated job, which then offered "Mark as
 * Applied" for a job the user had never applied to. A `PipelineCard` is an
 * application row - its `id` is the application's, and `/jobs/:id` is keyed by
 * job. The two numbers collide silently whenever both tables have a row there.
 */
const CARD: PipelineCard = {
  id: 7,
  jobId: 42,
  status: 'applied',
  overdue: false,
  company: 'Northlane',
  title: 'UI Engineer',
} as PipelineCard;

const navigate = jest.fn();

const STAGE = {
  id: 1,
  applicationId: 7,
  stageOrder: 1,
  stageLabel: 'Technical round',
  status: 'scheduled',
} as never;

async function createFixture(
  card: PipelineCard,
  stages: unknown[] = [],
  stagesRejectWith?: Error,
): Promise<ComponentFixture<QuickViewModalComponent>> {
  navigate.mockClear();
  TestBed.resetTestingModule();
  // One stub, two tokens: the interview stages come from `InterviewGateway`
  // now, and the rest of this stub is still `DbService`'s - those domains
  // have not moved.
  const dbStub = {
    listInterviewStages: stagesRejectWith
      ? jest.fn().mockRejectedValue(stagesRejectWith)
      : jest.fn().mockResolvedValue(stages),
    listApplicationComments: jest.fn().mockResolvedValue([]),
  };
  TestBed.configureTestingModule({
    imports: [QuickViewModalComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      { provide: DocumentsGateway, useValue: dbStub },
      { provide: InterviewGateway, useValue: dbStub },
      { provide: AiService, useValue: { renderSkill: jest.fn(), run: jest.fn() } },
      { provide: Router, useValue: { navigate } },
      TranslateService,
      ToastService,
    ],
  });
  const fixture = TestBed.createComponent(QuickViewModalComponent);
  fixture.componentRef.setInput('card', card);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function clickOpenFullDetails(fixture: ComponentFixture<QuickViewModalComponent>): void {
  const button = Array.from(
    fixture.nativeElement.querySelectorAll('.qv__footer button'),
  )[0] as HTMLElement;
  button.click();
}

describe('QuickViewModalComponent navigation', () => {
  it('opens /jobs with the JOB id, not the application id', async () => {
    const fixture = await createFixture(CARD);
    clickOpenFullDetails(fixture);
    expect(navigate).toHaveBeenCalledWith(['/jobs', 42]);
    expect(navigate).not.toHaveBeenCalledWith(['/jobs', 7]);
  });

  it('does not navigate when the application has no job attached', async () => {
    const fixture = await createFixture({ ...CARD, jobId: undefined });
    clickOpenFullDetails(fixture);
    expect(navigate).not.toHaveBeenCalled();
  });

  // The sibling link is the control case: `/interview-prep/:id` really is keyed
  // by application, so the same `card().id` that was wrong above is right here.
  it('still opens the stage timeline with the APPLICATION id', async () => {
    const fixture = await createFixture({ ...CARD, status: 'interview' }, [STAGE]);
    const viewAll = fixture.nativeElement.querySelector('.qv__link') as HTMLElement;
    expect(viewAll).toBeTruthy();
    viewAll.click();
    expect(navigate).toHaveBeenCalledWith(['/interview-prep', 7]);
  });
});

/**
 * A failed stage read leaves both `stages` empty and `stageSummary` null, and
 * `showQuickAdd` read that null as "this application has 0 stages". So a failed
 * read did not merely draw a wrong empty state - it offered the user the form to
 * log the FIRST interview stage for an application that may already have
 * several, and accepting would have written a duplicate. The rejection itself
 * escaped as a bare global toast from `provideBrowserGlobalErrorListeners`,
 * describing an event the panel was contradicting.
 *
 * An unknown is not a zero. These are jsdom assertions over the rendered
 * branch, not a check of how it looks on a real screen; that one is still open.
 */
describe('QuickViewModalComponent stage read failure', () => {
  const FAILED = new Error('db gone');

  it('does not offer to log the first stage when the read never came back', async () => {
    const fixture = await createFixture({ ...CARD, status: 'interview' }, [], FAILED);

    expect(fixture.nativeElement.querySelector('app-stage-quick-add')).toBeNull();
  });

  it('says the read failed instead of claiming the interview has no stages', async () => {
    const fixture = await createFixture({ ...CARD, status: 'interview' }, [], FAILED);

    const hint = fixture.nativeElement.querySelector('.ui-error-text') as HTMLElement;
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('db gone');
    expect(fixture.nativeElement.textContent).not.toContain('quickview_stage_none');
  });

  it('raises the failure as a toast as well, with the panel', async () => {
    const fixture = await createFixture({ ...CARD, status: 'interview' }, [], FAILED);
    const toasts = TestBed.inject(ToastService).toasts();

    expect(toasts.some((t) => t.kind === 'error' && t.message.includes('db gone'))).toBe(true);
    expect(fixture.nativeElement.querySelector('.ui-error-text')).toBeTruthy();
  });

  /** The control case: a read that came back empty really does mean 0 stages,
   * and the quick-add form is the designed behaviour there. */
  it('still offers the quick-add form when the read succeeds with no stages', async () => {
    const fixture = await createFixture({ ...CARD, status: 'interview' }, []);

    expect(fixture.nativeElement.querySelector('app-stage-quick-add')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ui-error-text')).toBeNull();
  });
});
