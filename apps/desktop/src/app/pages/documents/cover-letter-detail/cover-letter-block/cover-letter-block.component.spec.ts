import { Component, TemplateRef, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { CoverLetterBlockComponent, CoverLetterTextBlockKey } from './cover-letter-block.component';

@Component({
  standalone: true,
  imports: [CoverLetterBlockComponent],
  template: `
    <ng-template #popover let-key>
      <span class="popover-marker">{{ key }}</span>
    </ng-template>
    <app-cover-letter-block
      [key]="key"
      [value]="value"
      [open]="open"
      [styleOpen]="styleOpen"
      [customStyle]="false"
      [regenerating]="false"
      [regeneratable]="regeneratable"
      [stylePopover]="popover"
      (toggled)="toggled = toggled + 1"
      (regenerated)="regenerated = regenerated + 1"
      (valueChanged)="changed = $event"
    />
  `,
})
class HostComponent {
  @ViewChild('popover', { static: true }) popover!: TemplateRef<{ $implicit: string }>;
  key: CoverLetterTextBlockKey = 'greeting';
  value: string | undefined = 'Dear Ms Weber,';
  open = true;
  styleOpen = false;
  regeneratable = true;
  toggled = 0;
  regenerated = 0;
  changed: string | null = null;
}

describe('CoverLetterBlockComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [TranslateService],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const html = () => fixture.nativeElement.innerHTML as string;

  /// The five blocks differ only by key, so the label has to be derived from it
  /// rather than passed in - a per-block label input would let two blocks show
  /// the same heading.
  it('derives its heading from the block key', () => {
    const title = () =>
      fixture.nativeElement.querySelector('.docedit-section__title').textContent.trim();

    expect(title()).toBe('Greeting');

    host.key = 'signature';
    fixture.detectChanges();

    expect(title()).toBe('Signature');
  });

  /// The date block is a formatted value, not prose, so there is nothing for
  /// the model to rewrite. It is the one block without this action.
  it('hides Regenerate when the block cannot be regenerated', () => {
    expect(html()).toContain('coverdetail__regen');

    host.regeneratable = false;
    fixture.detectChanges();

    expect(html()).not.toContain('coverdetail__regen');
  });

  it('renders the page-owned style popover with its own key', () => {
    host.key = 'closing';
    host.styleOpen = true;
    fixture.detectChanges();

    expect(html()).toContain('popover-marker');
    expect(fixture.nativeElement.querySelector('.popover-marker').textContent.trim()).toBe(
      'closing',
    );
  });

  it('keeps the popover out of the DOM while it is closed', () => {
    expect(html()).not.toContain('popover-marker');
  });

  it('reports a collapse toggle instead of collapsing itself', () => {
    fixture.nativeElement.querySelector('.docedit-section__toggle').click();

    expect(host.toggled).toBe(1);
    // The block does not own `open`, so nothing changed until the page says so.
    expect(fixture.nativeElement.querySelector('.docedit-collapse--closed')).toBeNull();
  });

  it('emits the edited text rather than writing it back itself', () => {
    const input = fixture.nativeElement.querySelector('input');
    input.value = 'Kind regards,';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.changed).toBe('Kind regards,');
    expect(host.value).toBe('Dear Ms Weber,');
  });
});
