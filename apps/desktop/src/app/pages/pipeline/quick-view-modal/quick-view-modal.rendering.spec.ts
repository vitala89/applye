import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { InterviewStage, PipelineCard } from '@applye/core';
import {
  AiService,
  DbService,
  DocumentsGateway,
  InterviewGateway,
  JobsGateway,
  SystemGateway,
} from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { FollowupDraftService, ToastService } from '@applye/application';
import { QuickViewModalComponent } from './quick-view-modal.component';

/**
 * **Written before the modal was split, deliberately.** The sibling spec covers
 * two reported bugs - the job/application id collision and the failed stage read
 * - and neither touches what the two largest blocks of this modal actually draw.
 * Everything here asserts against the rendered DOM rather than against which
 * component rendered it, so the same assertions hold before and after the
 * interview stepper and the follow-up composer move into children.
 *
 * The counts matter as much as the presence checks. This modal is about to have
 * children with more than one call site for the same vocabulary, and "a step dot
 * exists somewhere" cannot see a stepper that draws the current pip on every row
 * instead of on one.
 */
const CARD: PipelineCard = {
  id: 7,
  jobId: 42,
  status: 'applied',
  overdue: false,
  company: 'Northlane',
  title: 'UI Engineer',
  score: 78,
  priority: 'high',
} as PipelineCard;

function stage(partial: Partial<InterviewStage>): InterviewStage {
  return {
    id: 1,
    applicationId: 7,
    stageOrder: 1,
    stageLabel: 'Phone screen',
    status: 'passed',
    scheduledAt: null,
    ...partial,
  } as InterviewStage;
}

/**
 * Three stages in the shape the stepper is built for: one passed, one current,
 * one the funnel has not reached. The last is `cancelled` on purpose -
 * `pickCurrentStage` takes the highest-ordered stage that is neither rejected
 * nor cancelled, so leaving it open would make the third stage the current one
 * and collapse the three states this stepper exists to tell apart.
 */
const STAGES: InterviewStage[] = [
  stage({ id: 1, stageOrder: 1, stageLabel: 'Phone screen', status: 'passed' }),
  stage({
    id: 2,
    stageOrder: 2,
    stageLabel: 'Technical round',
    status: 'scheduled',
    scheduledAt: '2026-09-03T10:00:00.000Z',
  }),
  stage({ id: 3, stageOrder: 3, stageLabel: 'Final', status: 'cancelled' }),
];

async function mount(
  card: Partial<PipelineCard> = {},
  stages: InterviewStage[] = [],
): Promise<ComponentFixture<QuickViewModalComponent>> {
  TestBed.resetTestingModule();
  // One stub, two tokens: the interview stages come from `InterviewGateway`
  // now, and the rest of this stub is still `DbService`'s - those domains
  // have not moved.
  const dbStub = {
    listInterviewStages: jest.fn().mockResolvedValue(stages),
    listApplicationComments: jest.fn().mockResolvedValue([]),
  };
  TestBed.configureTestingModule({
    imports: [QuickViewModalComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      { provide: JobsGateway, useValue: dbStub },
      { provide: DocumentsGateway, useValue: dbStub },
      { provide: SystemGateway, useValue: dbStub },
      { provide: InterviewGateway, useValue: dbStub },
      { provide: AiService, useValue: { renderSkill: jest.fn(), run: jest.fn() } },
      { provide: Router, useValue: { navigate: jest.fn() } },
      TranslateService,
      ToastService,
    ],
  });
  const fixture = TestBed.createComponent(QuickViewModalComponent);
  fixture.componentRef.setInput('card', { ...CARD, ...card });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const all = (f: ComponentFixture<unknown>, s: string): HTMLElement[] =>
  Array.from(f.nativeElement.querySelectorAll(s));
const one = (f: ComponentFixture<unknown>, s: string): HTMLElement | null =>
  f.nativeElement.querySelector(s);
const textOf = (f: ComponentFixture<unknown>, s: string): string =>
  (one(f, s)?.textContent ?? '').trim();

describe('QuickViewModalComponent header and triage row', () => {
  it('draws the monogram, company, title and the ATS score band', async () => {
    const fixture = await mount();

    expect(textOf(fixture, '.qv__mono')).toBe('NO');
    expect(textOf(fixture, '.qv__company')).toBe('Northlane');
    expect(textOf(fixture, '.qv__title')).toBe('UI Engineer');
    expect(one(fixture, '.qv__ats-value')).not.toBeNull();
    expect(textOf(fixture, '.qv__ats-value b')).toBe('78');
    expect(textOf(fixture, '.qv__ats-max')).toBe('/100');
  });

  /** The band is a class rather than a colour here, but it is the only thing
   *  that distinguishes a strong match from a weak one on this screen. */
  it('bands the score, and drops the whole block when there is no score', async () => {
    const strong = await mount({ score: 91 });
    expect(one(strong, '.qv__ats-value')?.className).not.toBe('');

    const none = await mount({ score: null });
    expect(one(none, '.qv__ats')).toBeNull();
    expect(one(none, '.qv__status-field')).not.toBeNull();
  });

  it('offers every status in the select, with the card current', async () => {
    const fixture = await mount({ status: 'interview' });
    const select = one(fixture, '#qv-status') as HTMLSelectElement;

    expect(all(fixture, '#qv-status option').length).toBe(5);
    expect(select.value).toBe('interview');
  });

  /** Four priority buttons: three levels and "none", with exactly one active. */
  it('marks exactly one priority active', async () => {
    const fixture = await mount({ priority: 'high' });
    const buttons = all(fixture, '.qv__priority-btn');

    expect(buttons.length).toBe(4);
    expect(buttons.filter((b) => b.classList.contains('is-active')).length).toBe(1);
    expect(buttons[2].getAttribute('data-priority')).toBe('high');
    expect(buttons[2].classList.contains('is-active')).toBe(true);

    const cleared = await mount({ priority: null });
    const none = all(cleared, '.qv__priority-btn').at(-1) as HTMLElement;
    expect(none.classList.contains('qv__priority-btn--none')).toBe(true);
    expect(none.classList.contains('is-active')).toBe(true);
  });
});

describe('QuickViewModalComponent interview stepper', () => {
  it('draws one step per stage, and only shows the section on an interview', async () => {
    const applied = await mount({ status: 'applied' }, STAGES);
    expect(one(applied, '.qv__stepper-box')).toBeNull();

    const fixture = await mount({ status: 'interview' }, STAGES);
    expect(all(fixture, '.qv__step').length).toBe(3);
    expect(all(fixture, '.qv__step-label').map((l) => l.textContent?.trim())).toEqual([
      'Phone screen',
      'Technical round',
      'Final',
    ]);
  });

  /** The three dot states are the whole point of the stepper, and each belongs
   *  to a different row - counting them is what a per-row mutation cannot pass. */
  it('gives done, current and upcoming their own dot state, one row each', async () => {
    const fixture = await mount({ status: 'interview' }, STAGES);
    const dots = all(fixture, '.qv__step-dot');

    expect(dots.length).toBe(3);
    expect(dots.filter((d) => d.classList.contains('is-done')).length).toBe(1);
    expect(dots.filter((d) => d.classList.contains('is-current')).length).toBe(1);
    expect(dots[0].classList.contains('is-done')).toBe(true);
    expect(dots[1].classList.contains('is-current')).toBe(true);
    expect(dots[2].className).not.toContain('is-');

    expect(all(fixture, '.qv__step-pip').length).toBe(1);
    expect(dots[1].querySelector('.qv__step-pip')).not.toBeNull();
    expect(all(fixture, '.qv__step-label.is-current').length).toBe(1);
    expect(all(fixture, '.qv__step.is-reached').length).toBe(2);
  });

  it('counts the current stage against the total in the head', async () => {
    const fixture = await mount({ status: 'interview' }, STAGES);

    expect(textOf(fixture, '.qv__stage-counter')).toBe('2/3');
  });

  /** The scheduled date is a chip, and it is absent rather than blank when the
   *  current stage has no date. */
  it('shows the current stage label, and its date only when it has one', async () => {
    const dated = await mount({ status: 'interview' }, STAGES);
    expect(textOf(dated, '.qv__stage-current-label')).toBe('Technical round');
    expect(all(dated, '.qv__stage-chip').length).toBe(1);
    expect(textOf(dated, '.qv__stage-chip')).toContain('03 Sep');

    const undated = await mount({ status: 'interview' }, [
      stage({ id: 1, stageOrder: 1, status: 'scheduled', scheduledAt: null }),
    ]);
    expect(all(undated, '.qv__stage-chip').length).toBe(0);
    expect(one(undated, '.qv__stage-current-label')).not.toBeNull();
  });

  /** One link out of the stepper, in its foot - not one per step. */
  it('offers a single view-all link from the populated stepper', async () => {
    const fixture = await mount({ status: 'interview' }, STAGES);

    expect(all(fixture, '.qv__link').length).toBe(1);
    expect(one(fixture, '.qv__stepper-foot .qv__link')).not.toBeNull();
  });
});

describe('QuickViewModalComponent follow-up composer', () => {
  const overdue = { status: 'applied' as const, overdue: true };

  /** The composer is gated on the card being overdue, and nothing else. */
  it('appears only on an overdue card', async () => {
    const onTime = await mount({ overdue: false });
    expect(one(onTime, '.qv__lang-select')).toBeNull();
    expect(one(onTime, '.qv__due-badge')).toBeNull();

    const late = await mount(overdue);
    expect(one(late, '.qv__due-badge')).not.toBeNull();
    expect(one(late, '.qv__lang-select')).not.toBeNull();
  });

  /** The composer takes the card as an input now, and the only thing that reads
   *  it is the draft call - so nothing else on screen can show it was wired
   *  wrong. Asserting which card was drafted for is what makes that input real. */
  it('drafts for the card the modal is showing', async () => {
    const fixture = await mount(overdue);
    const followup = fixture.debugElement.injector.get(FollowupDraftService);
    const draft = jest.spyOn(followup, 'draft').mockResolvedValue();

    (one(fixture, '.qv__followup-row .btn-ghost') as HTMLElement).click();
    await fixture.whenStable();

    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft.mock.calls[0][0]).toMatchObject({ id: 7, company: 'Northlane' });
  });

  it('offers the six draft languages and the privacy note before any draft', async () => {
    const fixture = await mount(overdue);

    expect(all(fixture, '.qv__lang-select option').length).toBe(6);
    expect(one(fixture, '.qv__followup-note')).not.toBeNull();
    expect(one(fixture, '.qv__followup-subject')).toBeNull();
    expect(one(fixture, '.qv__followup-body')).toBeNull();
  });

  /** Once a draft exists the note is replaced by the four editable fields, and
   *  the two recipient inputs are two rather than one. */
  it('swaps the note for the draft fields once there is a draft', async () => {
    const fixture = await mount(overdue);
    const followup = fixture.debugElement.injector.get(FollowupDraftService);

    followup.subject.set('Following up on UI Engineer');
    followup.body.set('Hello,');
    followup.to.set('hiring@example.com');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(one(fixture, '.qv__followup-note')).toBeNull();
    expect(all(fixture, '.qv__followup-recipient').length).toBe(2);
    expect((one(fixture, '.qv__followup-recipient') as HTMLInputElement).value).toBe(
      'hiring@example.com',
    );
    expect((one(fixture, '.qv__followup-subject') as HTMLInputElement).value).toBe(
      'Following up on UI Engineer',
    );
    expect((one(fixture, '.qv__followup-body') as HTMLTextAreaElement).value).toBe('Hello,');
  });

  it('says a draft came from the cache, and only then', async () => {
    const fixture = await mount(overdue);
    const followup = fixture.debugElement.injector.get(FollowupDraftService);

    followup.subject.set('Re: UI Engineer');
    fixture.detectChanges();
    const before = all(fixture, '.qv__hint').length;

    followup.fromCache.set(true);
    fixture.detectChanges();

    expect(all(fixture, '.qv__hint').length).toBe(before + 1);
  });

  /** A failed draft states the failure instead of showing empty fields. */
  it('shows the error instead of the draft when drafting failed', async () => {
    const fixture = await mount(overdue);
    const followup = fixture.debugElement.injector.get(FollowupDraftService);

    followup.subject.set('Re: UI Engineer');
    followup.error.set('no api key');
    fixture.detectChanges();

    expect(textOf(fixture, '.qv__error')).toBe('no api key');
    expect(one(fixture, '.qv__followup-subject')).toBeNull();
    expect(one(fixture, '.qv__followup-note')).toBeNull();
  });
});

describe('QuickViewModalComponent comments and footer', () => {
  it('says the list is empty rather than drawing nothing', async () => {
    const fixture = await mount();

    expect(all(fixture, '.qv__comment').length).toBe(0);
    expect(one(fixture, '.qv__comments .qv__hint')).not.toBeNull();
    expect(one(fixture, '.qv__comment-input')).not.toBeNull();
  });

  /** Adding a comment is disabled until there is something to add - the only
   *  guard between the button and an empty row. */
  it('keeps the add button disabled while the box is empty', async () => {
    const fixture = await mount();
    const add = all(fixture, '.qv__footer button')[1] as HTMLButtonElement;

    expect(add.disabled).toBe(true);

    const box = one(fixture, '.qv__comment-input') as HTMLTextAreaElement;
    box.value = 'called back';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(add.disabled).toBe(false);
  });
});
