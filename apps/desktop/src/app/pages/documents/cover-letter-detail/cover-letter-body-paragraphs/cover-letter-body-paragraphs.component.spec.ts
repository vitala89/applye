import { Component, TemplateRef, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoverLetterContentStore, CoverLetterStyleStore } from '@applye/application';
import { CoverLetterBodyParagraphsComponent } from './cover-letter-body-paragraphs.component';

@Component({
  standalone: true,
  imports: [CoverLetterBodyParagraphsComponent],
  template: `
    <ng-template #popover let-key>
      <span class="popover-marker">{{ key }}</span>
    </ng-template>
    <app-cover-letter-body-paragraphs
      [open]="open"
      [openStyleKey]="openStyleKey"
      [regeneratingBlock]="regeneratingBlock"
      [stylePopover]="popover"
      (toggled)="toggled = toggled + 1"
      (styleToggled)="styleKey = $event"
      (regenerated)="regeneratedIndex = $event"
      (paragraphRemoved)="removedIndex = $event"
    />
  `,
})
class HostComponent {
  @ViewChild('popover', { static: true }) popover!: TemplateRef<{ $implicit: string }>;
  open = true;
  openStyleKey: string | null = null;
  regeneratingBlock: string | null = null;
  toggled = 0;
  styleKey: string | null = null;
  regeneratedIndex: number | null = null;
  removedIndex: number | null = null;
}

describe('CoverLetterBodyParagraphsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let letter: CoverLetterContentStore;
  let styles: CoverLetterStyleStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [CoverLetterContentStore, CoverLetterStyleStore],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    letter = TestBed.inject(CoverLetterContentStore);
    styles = TestBed.inject(CoverLetterStyleStore);
    letter.content.update((c) => ({ ...c, bodyParagraphs: ['First para', 'Second para'] }));
    fixture.detectChanges();
  });

  function textareas(): HTMLTextAreaElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('textarea'));
  }

  function paragraphActions(index: number): HTMLElement[] {
    const rows = fixture.nativeElement.querySelectorAll('.coverdetail__paragraph-actions');
    return Array.from((rows[index] as HTMLElement).querySelectorAll('button'));
  }

  /**
   * On the page these textareas were styled by `.coverdetail textarea` - a
   * descendant selector rooted at the page element, which Angular's
   * encapsulation stops at a child boundary - and **nothing global styles a
   * bare `textarea`**, so losing it would have rendered every paragraph as a
   * browser-default box. This component carries its own copy keyed on
   * `.coverdetail__textarea`, and this test fails if the markup stops matching
   * the class its stylesheet targets.
   *
   * jsdom performs no layout and does not resolve custom properties, so the
   * *rendering* still cannot be asserted here - only that the element is inside
   * the class the rule names. A visual check is still owed (ADR-0005,
   * amendment sixteen).
   */
  it('keeps every paragraph textarea inside the class its stylesheet targets', () => {
    const boxes = textareas();
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.classList).toContain('coverdetail__textarea');
    }
  });

  it('writes paragraph text straight into the content store', () => {
    const [first] = textareas();
    first.value = 'Rewritten';
    first.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(letter.content().bodyParagraphs).toEqual(['Rewritten', 'Second para']);
  });

  it('adds a paragraph itself, because the content store is the only owner involved', () => {
    (fixture.nativeElement.querySelector('.coverdetail__add') as HTMLElement).click();
    fixture.detectChanges();

    expect(letter.content().bodyParagraphs).toHaveLength(3);
    expect(textareas()).toHaveLength(3);
  });

  /** Removal touches the content store, the page's open-popover key and the
   * `body_<i>` style overrides above it, so the page orchestrates it and this
   * component only reports the index. */
  it('reports a removal instead of performing one', () => {
    const [, , remove] = paragraphActions(1);
    remove.click();

    expect(host.removedIndex).toBe(1);
    expect(letter.content().bodyParagraphs).toHaveLength(2);
  });

  it('reports a regeneration by paragraph index', () => {
    const [, regenerate] = paragraphActions(0);
    regenerate.click();
    expect(host.regeneratedIndex).toBe(0);
  });

  it('disables only the paragraph the page reports as regenerating', () => {
    host.regeneratingBlock = 'body_1';
    fixture.detectChanges();

    expect((paragraphActions(0)[1] as HTMLButtonElement).disabled).toBe(false);
    expect((paragraphActions(1)[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a collapse toggle instead of collapsing itself', () => {
    (fixture.nativeElement.querySelector('.docedit-section__toggle') as HTMLElement).click();
    expect(host.toggled).toBe(1);
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

  it('shows the paragraph count', () => {
    expect(fixture.nativeElement.querySelector('.coverdetail__count')?.textContent?.trim()).toBe(
      '2',
    );
  });

  /** The section head and every paragraph compete for one popover, which is why
   * this component takes the key rather than a resolved boolean. */
  it('reports the section key from the head and a paragraph key from a row', () => {
    (fixture.nativeElement.querySelector('.coverdetail__style-btn') as HTMLElement).click();
    expect(host.styleKey).toBe('body');

    paragraphActions(1)[0].click();
    expect(host.styleKey).toBe('body_1');
  });

  function popoverMarkers(): (string | null)[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.popover-marker') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent);
  }

  it('stamps no popover while the page reports none open', () => {
    expect(popoverMarkers()).toEqual([]);
  });

  it('stamps the section popover with the section key', () => {
    host.openStyleKey = 'body';
    fixture.detectChanges();
    expect(popoverMarkers()).toEqual(['body']);
  });

  /** One popover, N+1 possible owners: only the row the page named gets it. */
  it('stamps a paragraph popover with that paragraph key alone', () => {
    host.openStyleKey = 'body_1';
    fixture.detectChanges();
    expect(popoverMarkers()).toEqual(['body_1']);
  });

  it('marks the style button of whichever row carries an override', () => {
    styles.setSectionStyle('body_1', { fontSizePt: 13 });
    fixture.detectChanges();

    expect(paragraphActions(0)[0].classList).not.toContain('coverdetail__style-btn--custom');
    expect(paragraphActions(1)[0].classList).toContain('coverdetail__style-btn--custom');
  });
});
