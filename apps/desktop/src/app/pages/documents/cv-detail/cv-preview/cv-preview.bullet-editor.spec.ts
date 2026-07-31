import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPreviewComponent } from './cv-preview.component';

/**
 * The selection highlight is one ring per selected element. A bullet is the one
 * leaf whose editor is NOT the selected element - the chip and the ring belong
 * to the `<ul>`, and the textarea sits inside it - so painting the highlight on
 * both drew two boxes at different offsets instead of one.
 */
describe('CvPreviewComponent bullet editor highlight', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  const SECTIONS = [
    {
      key: 'experience',
      order: 0,
      visible: true,
      entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One'] }],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvPreviewComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvPreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
    fixture.componentRef.setInput('themeId', 1);
    fixture.componentRef.setInput('includePhoto', false);
    fixture.componentRef.setInput('photoDataUri', null);
    fixture.componentRef.setInput('photoPlacement', 'above_left');
    fixture.componentRef.setInput('includeBirthdate', false);
    fixture.componentRef.setInput('includeMaritalStatus', false);
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', SECTIONS);
  });

  function editLeaf(elementPath: string): HTMLElement {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath,
    });
    component.startEditing();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('paints the highlight once while a bullet is being edited', () => {
    const root = editLeaf('exp.0.bullet.0');
    const list = root.querySelector('.page-card ul.cvpreview__bullets');

    expect(root.querySelector('.page-card textarea.cvpreview__bullet-editor')).toBeTruthy();
    expect(list?.classList.contains('cvpreview__element-selected')).toBe(true);
    expect(root.querySelectorAll('.page-card .cvpreview__element-selected').length).toBe(1);
  });

  it('leaves the highlight off the bullet textarea itself, which is not the selected element', () => {
    const root = editLeaf('exp.0.bullet.0');
    const editor = root.querySelector('.page-card textarea.cvpreview__bullet-editor');

    expect(editor?.classList.contains('cvpreview__element-selected')).toBe(false);
  });

  it('still paints it once for a leaf whose editor IS the selected element', () => {
    const root = editLeaf('exp.0.company');

    expect(root.querySelector('.page-card input.cvpreview__entry-company')).toBeTruthy();
    expect(root.querySelectorAll('.page-card .cvpreview__element-selected').length).toBe(1);
  });
});
