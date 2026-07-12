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

  function makeTextarea(value: string, start: number, end: number): HTMLTextAreaElement {
    const el = document.createElement('textarea');
    el.value = value;
    el.setSelectionRange = jest.fn();
    el.focus = jest.fn();
    Object.defineProperty(el, 'selectionStart', { value: start, configurable: true });
    Object.defineProperty(el, 'selectionEnd', { value: end, configurable: true });
    return el;
  }

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

  it('applyBold wraps the selection in ** and emits the updated section', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const el = makeTextarea('Led a big refactor', 6, 9);

    component.applyBold(el);

    expect(emitted).toHaveBeenCalledWith({ ...section, text: 'Led a **big** refactor' });
  });

  it('onBoldKeydown triggers applyBold on Cmd/Ctrl+B and prevents default', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const el = makeTextarea('Led a big refactor', 6, 9);
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true });
    const preventDefault = jest.spyOn(event, 'preventDefault');

    component.onBoldKeydown(event, el);

    expect(preventDefault).toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledWith({ ...section, text: 'Led a **big** refactor' });
  });

  it('onBoldKeydown ignores plain keystrokes', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const el = makeTextarea('Led a big refactor', 6, 9);
    const event = new KeyboardEvent('keydown', { key: 'b' });

    component.onBoldKeydown(event, el);

    expect(emitted).not.toHaveBeenCalled();
  });
});
