import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CvPreviewSelection } from '@applye/core';
import { CvPreviewEditModeService } from './cv-preview-edit-mode.service';
import { CvPreviewSelectionService } from './cv-preview-selection.service';

/** Mounts no component. The focus effect needs an injector, so there is a
 * TestBed - but nothing is rendered, and the DOM the effect queries is a bare
 * element built here. */
function make(initial: CvPreviewSelection | null = null) {
  const selection: WritableSignal<CvPreviewSelection | null> = signal(initial);
  const interactive = signal(true);
  const host = document.createElement('div');

  TestBed.configureTestingModule({
    providers: [CvPreviewSelectionService, CvPreviewEditModeService],
  });
  const sel = TestBed.inject(CvPreviewSelectionService);
  sel.bind({
    selection,
    interactive,
    t: signal((key: string) => key),
    emit: () => undefined,
  });
  const injector = TestBed.inject(Injector);
  const service = runInInjectionContext(injector, () => TestBed.inject(CvPreviewEditModeService));
  service.bind({ selection, interactive, host: () => host });
  return { service, selection, interactive, host };
}

describe('CvPreviewEditModeService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in view mode - selecting a leaf does not mount its editor', () => {
    const { service } = make({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
    expect(service.editing()).toBe(false);
    expect(service.isEditingLeaf('summary')).toBe(false);
  });

  it('enters edit mode only for the leaf that is actually selected', () => {
    const { service } = make({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
    service.startEditing();
    expect(service.isEditingLeaf('summary')).toBe(true);
    expect(service.isEditingLeaf('pd.fullName')).toBe(false);
  });

  it('does nothing with nothing selected', () => {
    const { service } = make();
    service.startEditing();
    expect(service.editing()).toBe(false);
  });

  it('drops back to view mode when the selection moves to another leaf', () => {
    const { service, selection } = make({
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    service.startEditing();
    expect(service.editing()).toBe(true);
    selection.set({ sectionKey: 'summary', part: 'body', elementPath: 'pd.fullName' });
    expect(service.editing()).toBe(false);
  });

  it('finishing an edit blurs the element and leaves edit mode', () => {
    const { service } = make({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
    service.startEditing();
    const el = document.createElement('input');
    const blur = jest.spyOn(el, 'blur');
    service.finishLeafEdit(el, 'summary', 'body');
    expect(blur).toHaveBeenCalled();
    expect(service.editing()).toBe(false);
  });
});
