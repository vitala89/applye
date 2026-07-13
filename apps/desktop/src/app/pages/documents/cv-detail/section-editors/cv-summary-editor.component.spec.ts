import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvSummarySection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvSummaryEditorComponent } from './cv-summary-editor.component';

describe('CvSummaryEditorComponent', () => {
  let component: CvSummaryEditorComponent;
  let fixture: ComponentFixture<CvSummaryEditorComponent>;

  const section: CvSummarySection = { key: 'summary', order: 0, visible: true, text: 'Hello' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvSummaryEditorComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvSummaryEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
  });

  it('renders the section text in the textarea', () => {
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello');
  });

  it('onTextChange emits a new immutable section with the updated text', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.onTextChange('Updated summary');

    expect(emitted).toHaveBeenCalledWith({ ...section, text: 'Updated summary' });
    // Original section object is untouched.
    expect(section.text).toBe('Hello');
  });

  it('does not render a Bold button — bold formatting moved to the live preview', () => {
    expect(fixture.nativeElement.querySelector('.cvdetail__bold-btn')).toBeNull();
  });
});
