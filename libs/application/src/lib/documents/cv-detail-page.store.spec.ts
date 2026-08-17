import { CvDetailPageStore } from './cv-detail-page.store';

/**
 * **No `TestBed`, and that is the point.** ADR-0005 says a store that cannot be
 * tested without one has the wrong dependencies; this one injects nothing, so
 * `new` is enough. These behaviours used to be reachable only through a whole
 * `CvDetailComponent` fixture with four service stubs and a router.
 */
describe('CvDetailPageStore', () => {
  let store: CvDetailPageStore;

  beforeEach(() => {
    store = new CvDetailPageStore();
  });

  describe('defaults a freshly opened editor into', () => {
    it('Edit mode with the live panel open and nothing selected', () => {
      expect(store.previewMode()).toBe(false);
      expect(store.livePanelOpen()).toBe(true);
      expect(store.liveSelection()).toBeNull();
      expect(store.justSaved()).toBe(false);
    });

    it('every section expanded, and the Style card open', () => {
      expect(store.collapsedSections().size).toBe(0);
      expect(store.isSectionOpen('experience')).toBe(true);
      expect(store.styleOpen()).toBe(true);
    });
  });

  describe('the section accordion', () => {
    it('collapses and re-expands the section it is given', () => {
      store.toggleSectionCollapse('experience');
      expect(store.isSectionOpen('experience')).toBe(false);

      store.toggleSectionCollapse('experience');
      expect(store.isSectionOpen('experience')).toBe(true);
    });

    it('collapses only that section, leaving its siblings open', () => {
      store.toggleSectionCollapse('skills');

      expect(store.isSectionOpen('skills')).toBe(false);
      expect(store.isSectionOpen('experience')).toBe(true);
      expect(store.isSectionOpen('summary')).toBe(true);
      expect(store.collapsedSections().size).toBe(1);
    });

    it('holds several collapsed sections at once', () => {
      store.toggleSectionCollapse('skills');
      store.toggleSectionCollapse('education');

      expect(store.collapsedSections().size).toBe(2);
      expect(store.isSectionOpen('skills')).toBe(false);
      expect(store.isSectionOpen('education')).toBe(false);
    });

    /** The set is replaced rather than mutated, so an `OnPush` view driven by
     * the signal actually re-renders. Mutating in place would leave the same
     * reference and the accordion would not move. */
    it('replaces the set rather than mutating it in place', () => {
      const before = store.collapsedSections();
      store.toggleSectionCollapse('skills');

      expect(store.collapsedSections()).not.toBe(before);
      expect(before.size).toBe(0);
    });
  });

  describe('the rest of the screen state', () => {
    it('togglePreview flips between Edit and Preview', () => {
      store.togglePreview();
      expect(store.previewMode()).toBe(true);

      store.togglePreview();
      expect(store.previewMode()).toBe(false);
    });

    it('toggleStyleOpen collapses the Style card without touching the sections', () => {
      store.toggleSectionCollapse('skills');
      store.toggleStyleOpen();

      expect(store.styleOpen()).toBe(false);
      expect(store.collapsedSections().size).toBe(1);
    });

    /** Printing clears the selection so no inline editor chrome reaches the
     * snapshot. It must clear the selection and nothing else - dropping preview
     * mode here would print the section editors instead of the paper. */
    it('clearSelection drops the selection and leaves preview mode alone', () => {
      store.previewMode.set(true);
      store.liveSelection.set({ sectionKey: 'experience', part: 'title' });

      store.clearSelection();

      expect(store.liveSelection()).toBeNull();
      expect(store.previewMode()).toBe(true);
      expect(store.livePanelOpen()).toBe(true);
    });
  });
});
