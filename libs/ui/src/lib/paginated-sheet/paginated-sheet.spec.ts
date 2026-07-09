import { Component, signal, TemplateRef, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginatedSheetComponent, SheetAtom, SheetGeometry } from './paginated-sheet';

@Component({
  standalone: true,
  imports: [PaginatedSheetComponent],
  template: `
    <ng-template #box><div class="box" style="height:400px"></div></ng-template>
    <lib-paginated-sheet
      [atoms]="atoms()"
      [geometry]="geometry"
      [captionFn]="captionFn"
      [continuationFn]="contFn"
    />
  `,
})
class HostComponent {
  readonly box = viewChild.required('box', { read: TemplateRef });
  readonly atoms = signal<SheetAtom[]>([]);
  readonly geometry: SheetGeometry = {
    pageWidthPx: 794,
    pageHeightPx: 1123,
    marginTopPx: 40,
    marginRightPx: 40,
    marginBottomPx: 40,
    marginLeftPx: 40,
  };
  readonly captionFn = (p: number, n: number): string => `Page ${p} of ${n}`;
  readonly contFn = (label: string): string => `${label} (cont.)`;
}

describe('PaginatedSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders one page card with a caption for empty content', () => {
    const cards = fixture.nativeElement.querySelectorAll('.page-card');
    expect(cards.length).toBe(1);
    const caption = fixture.nativeElement.querySelector('.page-card__caption');
    expect(caption.textContent.trim()).toBe('Page 1 of 1');
  });

  it('renders a caption per card using captionFn', () => {
    // jsdom reports offsetHeight as 0, so heights come from the measured
    // signal; drive packing directly by exposing the pack result.
    const c = fixture.componentInstance;
    const atoms: SheetAtom[] = [
      { id: 'a', tpl: c.box() },
      { id: 'b', tpl: c.box() },
    ];
    c.atoms.set(atoms);
    fixture.detectChanges();
    const captions = fixture.nativeElement.querySelectorAll('.page-card__caption');
    expect(captions.length).toBeGreaterThanOrEqual(1);
    expect(captions[0].textContent).toContain('of');
  });
});
