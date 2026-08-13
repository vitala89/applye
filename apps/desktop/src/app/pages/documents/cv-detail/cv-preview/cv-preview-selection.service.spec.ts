import { signal, type WritableSignal } from '@angular/core';
import type { CvPreviewSelection } from '@applye/core';
import { CvPreviewSelectionService } from './cv-preview-selection.service';

/** The point of these tests is that they mount nothing. If the selection
 * protocol still needed the component, this file could not exist - and neither
 * could the atom child components it was extracted to unblock. */
function make(initial: CvPreviewSelection | null = null) {
  const selection: WritableSignal<CvPreviewSelection | null> = signal(initial);
  const interactive = signal(true);
  const emitted: (CvPreviewSelection | null)[] = [];
  const service = new CvPreviewSelectionService();
  service.bind({
    selection,
    interactive,
    t: signal((key: string) => key),
    emit: (next) => emitted.push(next),
  });
  return { service, selection, interactive, emitted };
}

describe('CvPreviewSelectionService', () => {
  describe('selectable', () => {
    it('is true only for an interactive page render', () => {
      const { service } = make();
      expect(service.selectable('page')).toBe(true);
    });

    it('is false during the measurement pass, so it can never emit', () => {
      const { service, emitted } = make();
      expect(service.selectable('measure')).toBe(false);
      service.selectPart('summary', 'body', 'measure');
      expect(emitted).toEqual([]);
    });

    it('is false when the preview is not interactive', () => {
      const { service, interactive } = make();
      interactive.set(false);
      expect(service.selectable('page')).toBe(false);
    });
  });

  describe('what is selected', () => {
    it('reports a whole-section selection only without an elementPath', () => {
      const { service } = make({ sectionKey: 'summary', part: 'body' });
      expect(service.isSectionSelected('summary')).toBe(true);
      expect(service.isSelected('summary', 'body')).toBe(true);
    });

    it('keeps isSelected true when a leaf inside the section is the target', () => {
      const { service } = make({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      expect(service.isSelected('summary', 'body')).toBe(true);
      expect(service.isSectionSelected('summary')).toBe(false);
      expect(service.isElementSelected('summary')).toBe(true);
    });
  });

  describe('emitting', () => {
    it('emits a new selection', () => {
      const { service, emitted } = make();
      service.selectPart('summary', 'body', 'page');
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body' }]);
    });

    it('does not re-emit the selection already held', () => {
      const { service, emitted } = make({ sectionKey: 'summary', part: 'body' });
      service.selectPart('summary', 'body', 'page');
      expect(emitted).toEqual([]);
    });

    it('re-emits when only the elementPath differs', () => {
      const { service, emitted } = make({ sectionKey: 'summary', part: 'body' });
      service.selectLeaf('summary', 'summary', 'page');
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body', elementPath: 'summary' }]);
    });

    it('stops propagation so a leaf click does not also select its section', () => {
      const { service } = make();
      const event = { stopPropagation: jest.fn() } as unknown as Event;
      service.selectLeaf('summary', 'summary', 'page', event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('keyboard activation', () => {
    it('prevents Space from scrolling and selects instead', () => {
      const { service, emitted } = make();
      const event = {
        target: { closest: () => null },
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as Event;
      service.onSelectKey(event, 'summary', 'body', 'page');
      expect(event.preventDefault).toHaveBeenCalled();
      expect(emitted).toHaveLength(1);
    });

    it('ignores a key event bubbling out of an inline editor', () => {
      const { service, emitted } = make();
      const event = {
        target: { closest: (s: string) => (s === '.cvpreview__leaf-editor' ? {} : null) },
        preventDefault: jest.fn(),
      } as unknown as Event;
      service.onSelectKey(event, 'summary', 'body', 'page');
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(emitted).toEqual([]);
    });
  });

  describe('background click', () => {
    it('clears the selection when genuine empty space is clicked', () => {
      const { service, emitted } = make({ sectionKey: 'summary', part: 'body' });
      service.clearOnBackgroundClick({ target: { closest: () => null } } as unknown as Event);
      expect(emitted).toEqual([null]);
    });

    it('does not clear when the click landed on a selectable host', () => {
      const { service, emitted } = make({ sectionKey: 'summary', part: 'body' });
      const event = { target: { closest: () => ({}) } } as unknown as Event;
      service.clearOnBackgroundClick(event);
      expect(emitted).toEqual([]);
    });

    it('does nothing with nothing selected', () => {
      const { service, emitted } = make();
      service.clearOnBackgroundClick({ target: { closest: () => null } } as unknown as Event);
      expect(emitted).toEqual([]);
    });
  });

  describe('labels', () => {
    it('names a section-level host by section and scope', () => {
      const { service } = make();
      expect(service.selectAriaLabel('summary', 'title')).toBe(
        'documents.cv_section_summary - documents.cv_style_group_titles',
      );
    });

    it('names a leaf host by its own field, not the generic body scope', () => {
      const { service } = make();
      expect(service.leafAriaLabel('experience', 'company')).toBe(
        'documents.cv_section_experience - documents.cv_field_company',
      );
    });
  });
});
