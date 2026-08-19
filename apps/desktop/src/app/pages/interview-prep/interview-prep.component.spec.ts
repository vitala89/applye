import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PipelineCard } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { InterviewPrepStore } from '@applye/application';
import { InterviewPrepComponent } from './interview-prep.component';

/** The list, the row menu and the delete confirmation are `InterviewPrepStore`'s
 * since ADR-0005 amendment twenty-nine, and the store is component-scoped - so
 * it comes from the component's own injector. */
const storeOf = (fixture: {
  debugElement: { injector: { get: (t: unknown) => InterviewPrepStore } };
}): InterviewPrepStore => fixture.debugElement.injector.get(InterviewPrepStore);

const CARD: PipelineCard = {
  id: 7,
  company: 'Northlane',
  title: 'UI Engineer',
  currentStageOrder: 2,
  currentStageLabel: 'Technical round',
  currentStageStatus: 'scheduled',
  currentStageScheduledAt: '2026-08-01T10:00:00Z',
} as PipelineCard;

const navigate = jest.fn();

async function createFixture(): Promise<ComponentFixture<InterviewPrepComponent>> {
  navigate.mockClear();
  TestBed.resetTestingModule();
  // One stub, two tokens - the style check comes from `DocumentsGateway` now.
  const dbStub = { listPipelineCards: jest.fn().mockResolvedValue([CARD]) };
  TestBed.configureTestingModule({
    imports: [InterviewPrepComponent],
    providers: [
      { provide: DbService, useValue: dbStub },
      { provide: DocumentsGateway, useValue: dbStub },
      { provide: Router, useValue: { navigate } },
      TranslateService,
      ToastService,
    ],
  });
  const fixture = TestBed.createComponent(InterviewPrepComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('InterviewPrepComponent row actions', () => {
  it('opens the stage timeline when the row itself is clicked', async () => {
    const fixture = await createFixture();
    const row = fixture.nativeElement.querySelector('.ip__row') as HTMLElement;
    row.click();
    expect(navigate).toHaveBeenCalledWith(['/interview-prep', 7]);
  });

  it('opens the stage timeline on Space as well as Enter, since the row is a button', async () => {
    const fixture = await createFixture();
    const row = fixture.nativeElement.querySelector('.ip__row') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('does not navigate when the row menu button is clicked', async () => {
    const fixture = await createFixture();
    (fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(storeOf(fixture).menuId()).toBe(7);
  });

  it('offers a non-destructive action in the row menu, not only removal', async () => {
    const fixture = await createFixture();
    (fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLElement).click();
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.ip__pop-item') as NodeListOf<HTMLElement>,
    );
    expect(items.length).toBeGreaterThan(1);
    expect(items.some((el) => !el.classList.contains('ip__pop-item--danger'))).toBe(true);
  });

  it('navigates and closes the menu from the menu entry', async () => {
    const fixture = await createFixture();
    (fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLElement).click();
    fixture.detectChanges();
    const open = fixture.nativeElement.querySelector(
      '.ip__pop-item:not(.ip__pop-item--danger)',
    ) as HTMLElement;
    open.click();
    expect(navigate).toHaveBeenCalledWith(['/interview-prep', 7]);
    expect(storeOf(fixture).menuId()).toBeNull();
  });

  // The lit look of an open trigger hangs entirely off this attribute now:
  // `.btn--ghost[aria-expanded='true']` in `libs/ui` is the rule, and the
  // `.is-open` class it replaced is gone (ADR-0005, amendment twenty). If the
  // binding is ever dropped the button still works and still opens the menu,
  // so nothing fails - it just stops looking open. That is invisible to
  // type-check, lint and every other test here, which is why it has one.
  it('reports the open menu through aria-expanded, which is what styles it', async () => {
    const fixture = await createFixture();
    const trigger = fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});
