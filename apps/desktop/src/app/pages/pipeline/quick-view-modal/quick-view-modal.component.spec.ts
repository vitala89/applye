import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PipelineCard } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
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
): Promise<ComponentFixture<QuickViewModalComponent>> {
  navigate.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [QuickViewModalComponent],
    providers: [
      {
        provide: DbService,
        useValue: {
          listInterviewStages: jest.fn().mockResolvedValue(stages),
          listApplicationComments: jest.fn().mockResolvedValue([]),
        },
      },
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
