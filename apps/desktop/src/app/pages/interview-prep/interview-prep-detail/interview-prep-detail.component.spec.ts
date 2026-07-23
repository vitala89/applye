import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { InterviewPrep, InterviewStage } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { InterviewPrepDetailComponent } from './interview-prep-detail.component';

const STAGE: InterviewStage = {
  id: 10,
  applicationId: 1,
  stageOrder: 1,
  stageType: 'hr_screen',
  stageLabel: 'Recruiter screen',
  status: 'scheduled',
};

const BEHAVIORAL_STAGE: InterviewStage = {
  ...STAGE,
  id: 11,
  stageType: 'behavioral',
  stageLabel: 'Behavioral round',
};

function buildComponent(overrides: { db?: Partial<DbService>; ai?: Partial<AiService> }): {
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
    listInterviewStages: jest.fn().mockResolvedValue([STAGE, BEHAVIORAL_STAGE]),
    getJob: jest.fn().mockResolvedValue({ id: 1, jdText: 'Build things.' }),
    getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: '# Profile' }),
    getSettings: jest
      .fn()
      .mockResolvedValue({ aiMode: 'api', provider: 'anthropic', defaultModel: 'claude-sonnet-5' }),
    listInterviewPrep: jest.fn().mockResolvedValue([]),
    saveInterviewPrepBatch: jest.fn(),
    hashText: jest.fn().mockImplementation(async (s: string) => `hash:${s.length}`),
    ...overrides.db,
  };
  const aiStub: Partial<AiService> = {
    renderSkill: jest.fn(),
    run: jest.fn(),
    ...overrides.ai,
  };

  TestBed.configureTestingModule({
    imports: [InterviewPrepDetailComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      { provide: AiService, useValue: aiStub },
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
  return { component: fixture.componentInstance, fixture };
}

describe('InterviewPrepDetailComponent — AI prep generation', () => {
  it('routes hr_screen to interview-hr as qa, behavioral to star-r as star', async () => {
    const { component, fixture } = buildComponent({});
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['formatFor']('hr_screen')).toBe('qa');
    expect(component['formatFor']('technical')).toBe('qa');
    expect(component['formatFor']('system_design')).toBe('qa');
    expect(component['formatFor']('behavioral')).toBe('star');
    expect(component['formatFor']('final')).toBe('qa');
  });

  it('togglePrep loads cached cards once and toggles the open panel', async () => {
    const cached: InterviewPrep[] = [
      {
        id: 1,
        stageId: STAGE.id,
        format: 'qa',
        language: 'en',
        question: 'Why this role?',
        answer: 'Because...',
        inputHash: 'h1',
        modelUsed: 'claude-sonnet-5',
        createdAt: '2026-01-01',
      },
    ];
    const listInterviewPrep = jest.fn().mockResolvedValue(cached);
    const { component, fixture } = buildComponent({ db: { listInterviewPrep } });
    fixture.detectChanges();
    await fixture.whenStable();

    await component['togglePrep'](STAGE);
    expect(component['prepOpenId']()).toBe(STAGE.id);
    expect(component['cardsFor'](STAGE.id)).toEqual(cached);
    expect(listInterviewPrep).toHaveBeenCalledTimes(1);

    // second open of the same stage does not re-fetch
    await component['togglePrep'](STAGE);
    expect(component['prepOpenId']()).toBeNull();
    await component['togglePrep'](STAGE);
    expect(listInterviewPrep).toHaveBeenCalledTimes(1);
  });

  it('generatePrep calls the qa skill, saves the batch, and appends results', async () => {
    const renderSkill = jest.fn().mockResolvedValue({
      version: '1',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    });
    const run = jest.fn().mockResolvedValue({
      text: JSON.stringify([{ question: 'Q1', answer: 'A1' }]),
      tokensInput: 10,
      tokensOutput: 5,
      cachedTokens: 0,
    });
    const saved: InterviewPrep[] = [
      {
        id: 5,
        stageId: STAGE.id,
        format: 'qa',
        language: 'en',
        question: 'Q1',
        answer: 'A1',
        inputHash: 'hash:new',
        modelUsed: 'claude-sonnet-5',
        createdAt: '2026-01-01',
      },
    ];
    const saveInterviewPrepBatch = jest.fn().mockResolvedValue(saved);

    const { component, fixture } = buildComponent({
      ai: { renderSkill, run },
      db: { saveInterviewPrepBatch },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component['generatePrep'](STAGE);

    expect(renderSkill).toHaveBeenCalledWith(
      'interview-hr',
      expect.objectContaining({ job_description: 'Build things.', existing_questions: '' }),
    );
    expect(saveInterviewPrepBatch).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: STAGE.id, format: 'qa' }),
    );
    expect(component['cardsFor'](STAGE.id)).toEqual(saved);
  });

  it('generatePrep for a behavioral stage calls star-r and maps STAR+R fields', async () => {
    const renderSkill = jest
      .fn()
      .mockResolvedValue({ version: '1', systemPrompt: 's', userPrompt: 'u' });
    const run = jest.fn().mockResolvedValue({
      text: JSON.stringify([
        {
          title: 'Conflict resolution',
          situation: 'Sit',
          task: 'Task',
          action: 'Act',
          result: 'Res',
          reflection: 'Refl',
        },
      ]),
      tokensInput: 10,
      tokensOutput: 5,
      cachedTokens: 0,
    });
    const saveInterviewPrepBatch = jest.fn().mockResolvedValue([]);

    const { component, fixture } = buildComponent({
      ai: { renderSkill, run },
      db: { saveInterviewPrepBatch },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component['generatePrep'](BEHAVIORAL_STAGE);

    expect(renderSkill).toHaveBeenCalledWith('star-r', expect.any(Object));
    expect(saveInterviewPrepBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'star',
        cards: [
          expect.objectContaining({
            question: 'Conflict resolution',
            starSituation: 'Sit',
            starReflection: 'Refl',
          }),
        ],
      }),
    );
  });

  it('generatePrep skips the AI call when the computed hash already exists on a loaded card', async () => {
    const existing: InterviewPrep[] = [
      {
        id: 1,
        stageId: STAGE.id,
        format: 'qa',
        language: 'en',
        question: 'Q1',
        answer: 'A1',
        inputHash: 'hash:0',
        modelUsed: 'claude-sonnet-5',
        createdAt: '2026-01-01',
      },
    ];
    const hashText = jest.fn().mockResolvedValue('hash:0');
    const renderSkill = jest.fn();
    const { component, fixture } = buildComponent({
      db: { hashText, listInterviewPrep: jest.fn().mockResolvedValue(existing) },
      ai: { renderSkill },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component['togglePrep'](STAGE);
    await component['generatePrep'](STAGE);

    expect(renderSkill).not.toHaveBeenCalled();
  });
});
