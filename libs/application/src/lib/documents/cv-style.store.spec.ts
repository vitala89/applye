import { TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT, effectiveSectionStyle, type StyleNote } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { CvStyleStore } from './cv-style.store';

class DbStub {
  checkStyleSafety = jest.fn<Promise<StyleNote[]>, [string]>().mockResolvedValue([]);
}

describe('CvStyleStore', () => {
  let store: CvStyleStore;
  let db: DbStub;

  beforeEach(() => {
    jest.useFakeTimers();
    db = new DbStub();
    TestBed.configureTestingModule({
      providers: [
        CvStyleStore,
        { provide: DbService, useValue: db },
        { provide: DocumentsGateway, useValue: db },
      ],
    });
    store = TestBed.inject(CvStyleStore);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Lets the debounce fire and the awaited check settle. */
  const settle = async (): Promise<void> => {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  };

  describe('hydrate', () => {
    it('seeds from the theme when the document has never been styled', async () => {
      await store.hydrate(2, null);
      expect(store.themeId()).toBe(2);
      expect(store.activeTheme().name).toBe('Aurora');
      expect(store.style()).toEqual(store.themeBaseStyle());
      expect(store.hasAnyCustomStyle()).toBe(false);
    });

    it('layers the stored style over the theme seed, not over the raw default', async () => {
      await store.hydrate(2, JSON.stringify({ fontSizePt: 17 }));
      const seeded = store.themeBaseStyle();
      expect(store.style().fontSizePt).toBe(17);
      // The theme's own font survives - the stored slice only overrode the size.
      expect(store.style().fontFamily).toBe(seeded.fontFamily);
    });

    it('defaults a missing themeId to Classic', async () => {
      await store.hydrate(null, null);
      expect(store.themeId()).toBe(1);
    });

    it('checks style safety once, without waiting for the debounce', async () => {
      await store.hydrate(1, null);
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });

    it('rejects rather than silently keeping the default on malformed JSON', async () => {
      await expect(store.hydrate(1, '{not json')).rejects.toThrow();
    });
  });

  describe('the safety check', () => {
    it('collapses duplicate (kind, detail) notes but keeps distinct ones', async () => {
      db.checkStyleSafety.mockResolvedValue([
        { kind: 'font_ats_risk', detail: 'Zapfino' },
        { kind: 'font_ats_risk', detail: 'Zapfino' },
        // Same kind, different detail: a distinct warning, must survive.
        { kind: 'font_ats_risk', detail: 'Papyrus' },
        // Same detail, different kind: also distinct.
        { kind: 'size_out_of_range', detail: 'Papyrus' },
      ] as StyleNote[]);
      await store.hydrate(1, null);
      expect(store.styleNotes()).toEqual([
        { kind: 'font_ats_risk', detail: 'Zapfino' },
        { kind: 'font_ats_risk', detail: 'Papyrus' },
        { kind: 'size_out_of_range', detail: 'Papyrus' },
      ]);
    });

    it('debounces a burst of edits into one call', async () => {
      store.updateStyle({ fontSizePt: 12 });
      store.updateStyle({ fontSizePt: 13 });
      store.updateStyle({ fontSizePt: 14 });
      expect(db.checkStyleSafety).not.toHaveBeenCalled();
      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
      expect(JSON.parse(db.checkStyleSafety.mock.calls[0][0]).fontSizePt).toBe(14);
    });

    it('checks a theme switch immediately and drops the pending debounced check', async () => {
      store.updateStyle({ fontSizePt: 12 });
      store.selectTheme(2);
      await Promise.resolve();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
      // The dropped timer must not fire a second, now-stale check.
      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });

    it('checks a full reset immediately and drops the pending debounced check', async () => {
      store.updateStyle({ fontSizePt: 12 });
      store.resetAllStyles();
      await Promise.resolve();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });
  });

  describe('theme and reset', () => {
    it('selectTheme reseeds the base tokens but keeps overrides and page geometry', () => {
      store.applyStyle({
        ...CV_STYLE_DEFAULT,
        page: { size: 'letter', margin: { top: 5, right: 6, bottom: 7, left: 8 } },
        titleStyle: { fontFamily: 'Georgia' },
        sectionStyles: { skills: { colorHex: '#123456' } },
      });
      store.selectTheme(2);
      expect(store.style().fontFamily).toBe(store.themeBaseStyle().fontFamily);
      expect(store.style().titleStyle).toEqual({ fontFamily: 'Georgia' });
      expect(store.style().sectionStyles?.skills?.colorHex).toBe('#123456');
      expect(store.style().page?.size).toBe('letter');
    });

    it('resetAllStyles drops overrides but keeps page geometry', () => {
      store.applyStyle({
        ...CV_STYLE_DEFAULT,
        page: { size: 'letter', margin: { top: 5, right: 6, bottom: 7, left: 8 } },
        titleStyle: { fontFamily: 'Georgia' },
        sectionStyles: { skills: { colorHex: '#123456' } },
        elementStyles: { 'exp.0': { colorHex: '#654321' } },
      });
      store.resetAllStyles();
      expect(store.style().titleStyle).toBeUndefined();
      expect(store.style().sectionStyles).toBeUndefined();
      expect(store.style().elementStyles).toBeUndefined();
      expect(store.style().page?.size).toBe('letter');
      expect(store.hasAnyCustomStyle()).toBe(false);
    });

    it('resetAllStyles returns to the ACTIVE theme, not the built-in default', () => {
      store.selectTheme(2);
      const aurora = store.themeBaseStyle();
      store.updateStyle({ fontFamily: 'Comic Sans MS' });
      store.resetAllStyles();
      expect(store.style().fontFamily).toBe(aurora.fontFamily);
      expect(store.style().fontFamily).not.toBe(CV_STYLE_DEFAULT.fontFamily);
    });
  });

  describe('hasAnyCustomStyle', () => {
    it('is false on a pristine theme and true for each document-wide field', () => {
      expect(store.hasAnyCustomStyle()).toBe(false);
      // Asymmetric on purpose: each field is asserted on its own, from a clean
      // baseline, so a comparison that reads the wrong property fails on that
      // property alone rather than being masked by a sibling already differing.
      const fields = [
        { fontFamily: 'Open Sans' },
        { fontSizePt: 22 },
        { fontWeight: 700 as const },
        { accentColorHex: '#010203' },
        { bodyColorHex: '#204060' },
        { titleBorder: 'dotted' as const },
        { titleRuleWidthPt: 2 },
        { titleRuleColorHex: '#010203' },
        { titleStyle: { fontFamily: 'Georgia' } },
      ];
      for (const patch of fields) {
        store.updateStyle(patch);
        expect(store.hasAnyCustomStyle()).toBe(true);
        store.resetAllStyles();
        expect(store.hasAnyCustomStyle()).toBe(false);
      }
    });

    it('is true for a per-section override and for a per-element one alone', () => {
      store.applyStyle({ ...CV_STYLE_DEFAULT, sectionStyles: { skills: { colorHex: '#123456' } } });
      expect(store.hasAnyCustomStyle()).toBe(true);
      store.applyStyle({
        ...CV_STYLE_DEFAULT,
        elementStyles: { 'exp.0': { colorHex: '#123456' } },
      });
      expect(store.hasAnyCustomStyle()).toBe(true);
    });

    it('ignores page geometry, which resetAllStyles deliberately preserves', () => {
      store.updateStyle({
        page: { size: 'letter', margin: { top: 5, right: 5, bottom: 5, left: 5 } },
      });
      expect(store.hasAnyCustomStyle()).toBe(false);
    });

    it('treats an all-undefined override tree as not custom', () => {
      store.applyStyle({
        ...CV_STYLE_DEFAULT,
        sectionStyles: { skills: { colorHex: undefined, title: { fontFamily: undefined } } },
        elementStyles: { 'exp.0': { colorHex: undefined } },
      });
      expect(store.hasAnyCustomStyle()).toBe(false);
    });
  });

  describe('writes', () => {
    it('updateStyle merges rather than replacing', () => {
      store.updateStyle({ fontFamily: 'Open Sans' });
      store.updateStyle({ fontSizePt: 13 });
      expect(store.style().fontFamily).toBe('Open Sans');
      expect(store.style().fontSizePt).toBe(13);
    });

    it('updateTitleStyle deep-merges into an existing title style', () => {
      store.updateTitleStyle({ fontFamily: 'Georgia' });
      store.updateTitleStyle({ fontSizePt: 15 });
      expect(store.style().titleStyle).toEqual({ fontFamily: 'Georgia', fontSizePt: 15 });
    });
  });
  /** Moved here from `cv-detail.style.spec.ts` with the methods themselves
   * (ADR-0005, amendment sixty-four). They were always tests of this store's
   * behaviour; what they used to need was a whole `CvDetailComponent` fixture to
   * reach it, and the page's versions were the same assertions one indirection
   * removed. What stayed on the page is the scope routing, which is the page's
   * own composition rather than this store's. */
  describe('per-section overrides', () => {
    it('setSectionStyle writes an override and re-emits', () => {
      store.setSectionStyle('experience', { fontWeight: 700 });
      expect(store.style().sectionStyles?.experience?.fontWeight).toBe(700);
      expect(effectiveSectionStyle(store.style(), 'experience').fontWeight).toBe(700);
    });

    it('keeps the override minimal rather than writing every key', () => {
      store.setSectionStyle('summary', { lineHeight: 1.6 });
      expect(store.style().sectionStyles?.summary).toEqual({ lineHeight: 1.6 });
      expect(effectiveSectionStyle(store.style(), 'summary').lineHeight).toBe(1.6);
    });

    it('resetSectionStyle clears the override back to inherit', () => {
      store.setSectionStyle('experience', { fontSizePt: 13, colorHex: '#0a5' });
      store.resetSectionStyle('experience');
      expect(store.style().sectionStyles?.experience).toBeUndefined();
      expect(effectiveSectionStyle(store.style(), 'experience').colorHex).toBe(
        store.style().accentColorHex,
      );
    });

    it('resetSectionStyle removes only the selected section, leaving siblings intact', () => {
      store.setSectionStyle('summary', { fontWeight: 700 });
      store.setSectionStyle('skills', { colorHex: '#123456' });

      store.resetSectionStyle('summary');

      expect(store.style().sectionStyles?.summary).toBeUndefined();
      expect(store.style().sectionStyles?.skills).toEqual({ colorHex: '#123456' });
    });

    it('setSectionTitleStyle deep-merges rather than replacing the title object', () => {
      store.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
      store.setSectionTitleStyle('skills', { fontSizePt: 15 });
      expect(store.style().sectionStyles?.skills?.title).toEqual({
        fontFamily: 'Arial',
        fontSizePt: 15,
      });
    });

    it('debounces the ATS re-check like every other write, rather than checking per patch', async () => {
      db.checkStyleSafety.mockClear();
      store.setSectionStyle('summary', { fontSizePt: 13 });
      store.setSectionStyle('skills', { fontSizePt: 14 });
      expect(db.checkStyleSafety).not.toHaveBeenCalled();
      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });
  });
});
