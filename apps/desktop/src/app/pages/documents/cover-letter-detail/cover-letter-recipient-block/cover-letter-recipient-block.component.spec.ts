import { Component, TemplateRef, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoverLetterContentStore } from '@applye/application';
import { CoverLetterRecipientBlockComponent } from './cover-letter-recipient-block.component';

@Component({
  standalone: true,
  imports: [CoverLetterRecipientBlockComponent],
  template: `
    <ng-template #popover let-key>
      <span class="popover-marker">{{ key }}</span>
    </ng-template>
    <app-cover-letter-recipient-block
      [open]="open"
      [styleOpen]="styleOpen"
      [customStyle]="customStyle"
      [stylePopover]="popover"
      (toggled)="toggled = toggled + 1"
      (styleToggled)="styleKey = $event"
    />
  `,
})
class HostComponent {
  @ViewChild('popover', { static: true }) popover!: TemplateRef<{ $implicit: string }>;
  open = true;
  styleOpen = false;
  customStyle = false;
  toggled = 0;
  styleKey: string | null = null;
}

describe('CoverLetterRecipientBlockComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let letter: CoverLetterContentStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [CoverLetterContentStore],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    letter = TestBed.inject(CoverLetterContentStore);
    fixture.detectChanges();
  });

  function inputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.coverdetail__field input'));
  }

  /**
   * The six inputs were styled by `.coverdetail input:not(...)` while they lived
   * on the page - a descendant selector rooted at the page element, which
   * Angular's encapsulation stops at a child boundary. This block therefore
   * carries its own copy keyed on `.coverdetail__field input`, and this test is
   * what fails if the markup stops matching it.
   *
   * jsdom performs no layout and does not resolve custom properties, so the
   * *rendering* still cannot be asserted here - only that every input is inside
   * the class the stylesheet targets. A visual check is still owed.
   */
  it('keeps all six address inputs inside the class its stylesheet targets', () => {
    expect(inputs()).toHaveLength(6);
    expect(fixture.nativeElement.querySelectorAll('.coverdetail__grid')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.coverdetail__field--wide')).toHaveLength(2);
  });

  it('writes each field into the content store under its own key', () => {
    const [recipientName, company, street, postalCode, city, country] = inputs();
    for (const [el, value] of [
      [recipientName, 'Ms Weber'],
      [company, 'ACME GmbH'],
      [street, 'Hauptstr. 1'],
      [postalCode, '10115'],
      [city, 'Berlin'],
      [country, 'Germany'],
    ] as const) {
      el.value = value;
      el.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();

    expect(letter.content().address).toEqual({
      recipientName: 'Ms Weber',
      company: 'ACME GmbH',
      street: 'Hauptstr. 1',
      postalCode: '10115',
      city: 'Berlin',
      country: 'Germany',
    });
  });

  it('reports a collapse toggle instead of collapsing itself', () => {
    (fixture.nativeElement.querySelector('.docedit-section__toggle') as HTMLElement).click();
    expect(host.toggled).toBe(1);
    // Still open: the page owns the state, and the host did not change it.
    expect(
      fixture.nativeElement
        .querySelector('.docedit-collapse')
        ?.classList.contains('docedit-collapse--closed'),
    ).toBe(false);
  });

  it('renders closed when the page says so', () => {
    host.open = false;
    fixture.detectChanges();
    expect(
      fixture.nativeElement
        .querySelector('.docedit-collapse')
        ?.classList.contains('docedit-collapse--closed'),
    ).toBe(true);
  });

  it('reports its own key when the style button is pressed', () => {
    (fixture.nativeElement.querySelector('.coverdetail__style-btn') as HTMLElement).click();
    expect(host.styleKey).toBe('recipient');
  });

  it('stamps the page popover with its key, only while the page says it is open', () => {
    expect(fixture.nativeElement.querySelector('.popover-marker')).toBeNull();
    host.styleOpen = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.popover-marker')?.textContent).toBe('recipient');
  });

  it('marks the style button when the block carries an override', () => {
    const btn = fixture.nativeElement.querySelector('.coverdetail__style-btn') as HTMLElement;
    expect(btn.classList).not.toContain('coverdetail__style-btn--custom');
    host.customStyle = true;
    fixture.detectChanges();
    expect(btn.classList).toContain('coverdetail__style-btn--custom');
  });
});
