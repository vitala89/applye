import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { InterviewStage } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { InterviewStagesStore } from '@applye/application';
import { InterviewPrepDetailComponent } from './interview-prep-detail.component';

const STAGE: InterviewStage = {
  id: 10,
  applicationId: 1,
  stageOrder: 1,
  stageType: 'hr_screen',
  stageLabel: 'Recruiter screen',
  status: 'scheduled',
};

function buildComponent(overrides: { db?: Partial<DbService> } = {}): {
  component: InterviewPrepDetailComponent;
  fixture: ComponentFixture<InterviewPrepDetailComponent>;
} {
  const dbStub: Partial<DbService> = {
    listPipelineCards: jest.fn().mockResolvedValue([
      {
        id: 1,
        jobId: 1,
        status: 'interview',
        overdue: false,
        company: 'Acme',
        title: 'Engineer',
      },
    ]),
    listInterviewStages: jest.fn().mockResolvedValue([STAGE]),
    ...overrides.db,
  };

  TestBed.configureTestingModule({
    imports: [InterviewPrepDetailComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      TranslateService,
      ToastService,
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => '1' } } },
      },
      { provide: Router, useValue: { navigate: jest.fn() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(InterviewPrepDetailComponent);
  // The page's state is a component-scoped store now (ADR-0005, amendment
  // thirty-eight); the assertions below are unchanged.
  return {
    component: fixture.componentInstance,
    store: fixture.debugElement.injector.get(InterviewStagesStore),
    fixture,
  };
}

describe('InterviewPrepDetailComponent', () => {
  it('loads the application and its stages', async () => {
    const { component, store, fixture } = buildComponent();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(store.application()?.company).toBe('Acme');
    expect(store.stages()).toEqual([STAGE]);
  });
});
