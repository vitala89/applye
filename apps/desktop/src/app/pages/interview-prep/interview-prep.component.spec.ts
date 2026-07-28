import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PipelineCard } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import { InterviewPrepComponent } from './interview-prep.component';

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
  TestBed.configureTestingModule({
    imports: [InterviewPrepComponent],
    providers: [
      { provide: DbService, useValue: { listPipelineCards: jest.fn().mockResolvedValue([CARD]) } },
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
    (fixture.nativeElement.querySelector('.ip__icon') as HTMLElement).click();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.menuId()).toBe(7);
  });

  it('offers a non-destructive action in the row menu, not only removal', async () => {
    const fixture = await createFixture();
    (fixture.nativeElement.querySelector('.ip__icon') as HTMLElement).click();
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.ip__pop-item') as NodeListOf<HTMLElement>,
    );
    expect(items.length).toBeGreaterThan(1);
    expect(items.some((el) => !el.classList.contains('ip__pop-item--danger'))).toBe(true);
  });

  it('navigates and closes the menu from the menu entry', async () => {
    const fixture = await createFixture();
    (fixture.nativeElement.querySelector('.ip__icon') as HTMLElement).click();
    fixture.detectChanges();
    const open = fixture.nativeElement.querySelector(
      '.ip__pop-item:not(.ip__pop-item--danger)',
    ) as HTMLElement;
    open.click();
    expect(navigate).toHaveBeenCalledWith(['/interview-prep', 7]);
    expect(fixture.componentInstance.menuId()).toBeNull();
  });
});
