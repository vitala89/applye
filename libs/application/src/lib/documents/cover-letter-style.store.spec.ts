import { TestBed } from '@angular/core/testing';
import type { StyleNote } from '@applye/core';
import { COVER_LETTER_STYLE_DEFAULT } from '@applye/core';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterStyleStore } from './cover-letter-style.store';

function note(kind: StyleNote['kind'], detail: string): StyleNote {
  return { kind, detail } as StyleNote;
}

function createStore(notes: StyleNote[] = []) {
  const db = { checkStyleSafety: jest.fn().mockResolvedValue(notes) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CoverLetterStyleStore,
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(CoverLetterStyleStore), db };
}

/** Lets the debounced check fire and its promise settle. */
async function settle(ms = 500): Promise<void> {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

describe('CoverLetterStyleStore', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('starts on the default style with no warnings', () => {
    const { store } = createStore();
    expect(store.style()).toEqual(COVER_LETTER_STYLE_DEFAULT);
    expect(store.styleNotes()).toEqual([]);
    expect(store.hasAnyCustomStyle()).toBe(false);
  });

  describe('hydrate', () => {
    it('merges a stored style over the default, so a new field gets its default', async () => {
      const { store } = createStore();
      store.hydrate(JSON.stringify({ fontSizePt: 13 }));
      await settle();

      expect(store.style().fontSizePt).toBe(13);
      expect(store.style().fontFamily).toBe(COVER_LETTER_STYLE_DEFAULT.fontFamily);
    });

    it('starts on the default when the letter has never been styled', async () => {
      const { store } = createStore();
      store.hydrate(null);
      await settle();

      expect(store.style()).toEqual(COVER_LETTER_STYLE_DEFAULT);
    });

    // Asymmetric: the store already holds a style. Hydrating a fresh store
    // cannot tell "throw" from "reset", and an unreadable document must not
    // silently present a default-styled letter over a stored one.
    it('throws on malformed JSON rather than replacing a stored style', () => {
      const { store } = createStore();
      store.hydrate(JSON.stringify({ fontSizePt: 13 }));

      expect(() => store.hydrate('{not json')).toThrow();
      expect(store.style().fontSizePt).toBe(13);
    });

    it('checks safety on load, without waiting for the debounce', async () => {
      const { store, db } = createStore();
      store.hydrate(null);
      await Promise.resolve();

      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });
  });

  describe('the debounced safety check', () => {
    it('collapses a burst of edits into one round trip', async () => {
      const { store, db } = createStore();
      store.updateStyle({ fontSizePt: 11 });
      store.updateStyle({ fontSizePt: 12 });
      store.updateStyle({ fontSizePt: 13 });

      expect(db.checkStyleSafety).not.toHaveBeenCalled();
      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });

    it('checks the style as it finally stood', async () => {
      const { store, db } = createStore();
      store.updateStyle({ fontSizePt: 11 });
      store.updateStyle({ fontSizePt: 13 });
      await settle();

      expect(JSON.parse(db.checkStyleSafety.mock.calls[0][0]).fontSizePt).toBe(13);
    });

    it('collapses duplicate warnings before showing them', async () => {
      const { store } = createStore([
        note('weight_unavailable_risk', '300'),
        note('weight_unavailable_risk', '300'),
        note('font_ats_risk', 'Papyrus'),
      ]);
      store.updateStyle({ fontWeight: 300 });
      await settle();

      expect(store.styleNotes()).toEqual([
        note('weight_unavailable_risk', '300'),
        note('font_ats_risk', 'Papyrus'),
      ]);
    });

    // A full reset rewrites the whole style at once rather than arriving as a
    // burst, and a pending debounced check would re-check a style that no
    // longer exists.
    it('checks immediately on a full reset, and drops the pending check', async () => {
      const { store, db } = createStore();
      store.updateStyle({ fontSizePt: 13 });
      store.resetAllStyles();
      await Promise.resolve();

      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
      expect(JSON.parse(db.checkStyleSafety.mock.calls[0][0])).toEqual(COVER_LETTER_STYLE_DEFAULT);

      await settle();
      expect(db.checkStyleSafety).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-block and per-paragraph overrides', () => {
    it('sets, reads and resets one override', async () => {
      const { store } = createStore();

      store.setSectionStyle('greeting', { fontSizePt: 14 });
      expect(store.sectionOverride('greeting')).toEqual({ fontSizePt: 14 });
      expect(store.hasCustomStyle('greeting')).toBe(true);

      store.resetSectionStyle('greeting');
      expect(store.sectionOverride('greeting')).toBeUndefined();
      expect(store.hasCustomStyle('greeting')).toBe(false);
      await settle();
    });

    it('merges into an existing override rather than replacing it', async () => {
      const { store } = createStore();
      store.setSectionStyle('body_0', { fontSizePt: 14 });
      store.setSectionStyle('body_0', { fontWeight: 700 });

      expect(store.sectionOverride('body_0')).toEqual({ fontSizePt: 14, fontWeight: 700 });
      await settle();
    });

    it('leaves the other overrides alone', async () => {
      const { store } = createStore();
      store.setSectionStyle('greeting', { fontSizePt: 14 });
      store.setSectionStyle('closing', { fontSizePt: 9 });

      store.resetSectionStyle('greeting');

      expect(store.sectionOverride('closing')).toEqual({ fontSizePt: 9 });
      await settle();
    });

    // Asymmetric on the two ways an override can be "empty": absent entirely,
    // and present with every field cleared. Both must read as no custom style,
    // or the "Custom" badge lights up on a block the user has reset.
    it('reads an all-undefined override as no custom style', async () => {
      const { store } = createStore();
      store.setSectionStyle('greeting', { fontSizePt: undefined });

      expect(store.hasCustomStyle('greeting')).toBe(false);
      expect(store.hasCustomStyle('never-touched')).toBe(false);
      expect(store.hasAnyCustomStyle()).toBe(false);
      await settle();
    });

    it('reports any custom style across every block', async () => {
      const { store } = createStore();
      expect(store.hasAnyCustomStyle()).toBe(false);

      store.setSectionStyle('body_2', { fontWeight: 700 });
      expect(store.hasAnyCustomStyle()).toBe(true);

      store.resetSectionStyle('body_2');
      expect(store.hasAnyCustomStyle()).toBe(false);
      await settle();
    });

    it('clears every override on a full reset', async () => {
      const { store } = createStore();
      store.setSectionStyle('greeting', { fontSizePt: 14 });
      store.updateStyle({ fontSizePt: 13 });

      store.resetAllStyles();

      expect(store.style()).toEqual(COVER_LETTER_STYLE_DEFAULT);
      expect(store.hasAnyCustomStyle()).toBe(false);
      await settle();
    });
  });

  describe('reindexAfterParagraphRemoved', () => {
    it('shifts paragraph overrides down and leaves block overrides alone', async () => {
      const { store } = createStore();
      store.setSectionStyle('greeting', { fontSizePt: 9 });
      store.setSectionStyle('body_0', { fontSizePt: 10 });
      store.setSectionStyle('body_1', { fontSizePt: 11 });
      store.setSectionStyle('body_2', { fontSizePt: 12 });

      store.reindexAfterParagraphRemoved(0, 2);

      expect(store.sectionOverride('greeting')).toEqual({ fontSizePt: 9 });
      expect(store.sectionOverride('body_0')).toEqual({ fontSizePt: 11 });
      expect(store.sectionOverride('body_1')).toEqual({ fontSizePt: 12 });
      expect(store.sectionOverride('body_2')).toBeUndefined();
      await settle();
    });

    it('does nothing when the letter has no overrides at all', async () => {
      const { store } = createStore();
      store.reindexAfterParagraphRemoved(0, 2);
      expect(store.style()).toEqual(COVER_LETTER_STYLE_DEFAULT);
      await settle();
    });

    // The overrides move, but no style VALUE changes - the same warnings still
    // apply, so re-running the check would be a round trip for nothing.
    it('does not re-run the safety check', async () => {
      const { store, db } = createStore();
      store.setSectionStyle('body_1', { fontSizePt: 11 });
      await settle();
      db.checkStyleSafety.mockClear();

      store.reindexAfterParagraphRemoved(0, 1);
      await settle();

      expect(db.checkStyleSafety).not.toHaveBeenCalled();
    });
  });
});
