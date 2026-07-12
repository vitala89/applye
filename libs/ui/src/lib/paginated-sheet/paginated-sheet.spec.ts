import { Component, signal, TemplateRef, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginatedSheetComponent, SheetAtom, SheetGeometry } from './paginated-sheet';

@Component({
  standalone: true,
  imports: [PaginatedSheetComponent],
  template: `
    <ng-template #box let-mode="$sheetRenderMode">
      <div class="box" style="height:400px" [attr.data-mode]="mode"></div>
    </ng-template>
    <lib-paginated-sheet [atoms]="atoms()" [geometry]="geometry" [captionFn]="captionFn" />
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

  describe('render-mode signal ($sheetRenderMode)', () => {
    it('marks the hidden measurement pass with render mode "measure"', () => {
      const c = fixture.componentInstance;
      c.atoms.set([{ id: 'a', tpl: c.box() }]);
      fixture.detectChanges();
      const measureBox = fixture.nativeElement.querySelector('.paginated-sheet__measure .box');
      expect(measureBox.getAttribute('data-mode')).toBe('measure');
    });

    it('marks visible page-card atoms with render mode "page"', () => {
      const c = fixture.componentInstance;
      c.atoms.set([{ id: 'a', tpl: c.box() }]);
      fixture.detectChanges();
      const pageBox = fixture.nativeElement.querySelector('.page-card .box');
      expect(pageBox.getAttribute('data-mode')).toBe('page');
    });

    it('rejects an atom ctx that already supplies the reserved $sheetRenderMode key', () => {
      const c = fixture.componentInstance;
      c.atoms.set([{ id: 'a', tpl: c.box(), ctx: { $sheetRenderMode: 'page' } as unknown }]);
      expect(() => fixture.detectChanges()).toThrow();
    });
  });

  describe('measurement pass inertness', () => {
    it('keeps the measurement root aria-hidden and inert', () => {
      const measureRoot = fixture.nativeElement.querySelector('.paginated-sheet__measure');
      expect(measureRoot.getAttribute('aria-hidden')).toBe('true');
      expect(measureRoot.hasAttribute('inert')).toBe(true);
    });
  });
});
