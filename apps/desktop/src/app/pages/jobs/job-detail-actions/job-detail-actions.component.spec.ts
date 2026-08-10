import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Application } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobDetailActionsComponent } from './job-detail-actions.component';
import { JobActionsService } from '../../../shared/job-actions.service';

function stubs() {
  return {
    busy: signal(false),
    applying: signal(false),
    deleting: signal(false),
    message: signal(''),
  };
}

function setup(s: ReturnType<typeof stubs>) {
  TestBed.configureTestingModule({
    imports: [JobDetailActionsComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: JobActionsService, useValue: s },
    ],
  });
  const fixture = TestBed.createComponent(JobDetailActionsComponent);
  fixture.detectChanges();
  return fixture;
}

function buttons(fixture: ReturnType<typeof setup>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('button'));
}

describe('JobDetailActionsComponent', () => {
  it('offers Save while there is no application, and asks the page to do it', () => {
    const s = stubs();
    const fixture = setup(s);
    const emitted: string[] = [];
    fixture.componentInstance.saveRequested.subscribe(() => emitted.push('save'));

    const save = buttons(fixture).find((b) => b.textContent?.includes('jobs.save_job'));
    save?.click();

    // The row asks; saving writes page state and is not a toolbar's business.
    expect(emitted).toEqual(['save']);
  });

  it('shows the read-only status badge instead of Mark Applied once it is unavailable', () => {
    const s = stubs();
    const fixture = setup(s);
    fixture.componentRef.setInput('application', { status: 'applied' } as Application);
    fixture.componentRef.setInput('canMarkApplied', false);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('status.applied');
    expect(text).not.toContain('jobs.mark_applied');
    // Save is gone too: there is an application now.
    expect(buttons(fixture).some((b) => b.textContent?.includes('jobs.save_job'))).toBe(false);
  });

  it('hands the page the document id rather than opening the document itself', () => {
    const s = stubs();
    const fixture = setup(s);
    const ids: number[] = [];
    fixture.componentInstance.cvRequested.subscribe((id) => ids.push(id));
    fixture.componentRef.setInput('application', {
      status: 'applied',
      cvDocumentId: 42,
    } as Application);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.detail-actions__doc').click();

    expect(ids).toEqual([42]);
  });

  /// Both flags disable Delete: a second click during either one would start a
  /// second removal of a job that is already going.
  it('disables Delete while any action is in flight', () => {
    const s = stubs();
    const fixture = setup(s);
    const del = () =>
      buttons(fixture).find((b) => b.textContent?.includes('jobs.delete_action'))
        ?.disabled as boolean;

    expect(del()).toBe(false);
    s.busy.set(true);
    fixture.detectChanges();
    expect(del()).toBe(true);

    s.busy.set(false);
    s.deleting.set(true);
    fixture.detectChanges();
    expect(del()).toBe(true);
  });

  it('shows the action message only once there is one', () => {
    const s = stubs();
    const fixture = setup(s);
    expect(fixture.nativeElement.querySelector('.detail-actions__msg')).toBeNull();

    s.message.set('Saved.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.detail-actions__msg').textContent).toContain(
      'Saved.',
    );
  });
});
