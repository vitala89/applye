import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentRowActionsComponent } from './document-row-actions.component';

@Component({
  standalone: true,
  imports: [DocumentRowActionsComponent],
  template: `
    <app-document-row-actions
      [exportBusy]="exportBusy()"
      (duplicated)="duplicated = duplicated + 1"
      (deleted)="deleted = deleted + 1"
      (exported)="exported.push($event.format)"
    />
  `,
})
class HostComponent {
  readonly exportBusy = signal(false);
  duplicated = 0;
  deleted = 0;
  exported: string[] = [];
}

describe('DocumentRowActionsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function select(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select');
  }

  function choose(value: string): void {
    const el = select();
    el.value = value;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('reports duplicate and delete instead of acting on a row it does not own', () => {
    const [duplicate, remove] = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    );
    duplicate.click();
    remove.click();
    expect([host.duplicated, host.deleted]).toEqual([1, 1]);
  });

  it('reports the chosen export format', () => {
    choose('pdf');
    expect(host.exported).toEqual(['pdf']);
  });

  /** The control is a one-shot menu, not a bound value: it resets so that
   * picking the same format twice in a row fires twice. */
  it('resets after a choice so the same format can be picked again', () => {
    choose('pdf');
    expect(select().value).toBe('');
    choose('pdf');
    expect(host.exported).toEqual(['pdf', 'pdf']);
  });

  /**
   * Both call sites previously read this through `$any($event.target).value`,
   * which erased the type and let any string reach a handler accepting
   * `'docx' | 'pdf'`. The guard is here now, so an unrecognised value is
   * dropped rather than forwarded.
   */
  it('drops a value that is not an export format', () => {
    choose('');
    expect(host.exported).toEqual([]);
  });

  it('disables the export control while this row is exporting', () => {
    expect(select().disabled).toBe(false);
    host.exportBusy.set(true);
    fixture.detectChanges();
    expect(select().disabled).toBe(true);
  });

  /**
   * These controls sit inside a row that is itself clickable, so opening the
   * export menu must not also open the document behind it. The ancestor
   * listener is attached here rather than in the host template, because a
   * `(click)` on a plain element is an accessibility lint error - the real row
   * is a proper interactive element, and this test only needs something that
   * observes the bubble.
   */
  it('keeps a click on the export control from reaching the row', () => {
    let reachedRow = 0;
    fixture.nativeElement.addEventListener('click', () => (reachedRow += 1));

    select().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reachedRow).toBe(0);

    // The listener does fire for a click that is not stopped, so the assertion
    // above is not passing because nothing was listening.
    fixture.nativeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reachedRow).toBe(1);
  });
});
