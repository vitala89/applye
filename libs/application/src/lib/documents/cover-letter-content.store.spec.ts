import { TestBed } from '@angular/core/testing';
import { COVER_LETTER_LENGTH_DEFAULT, COVER_LETTER_TONE_DEFAULT } from '@applye/core';
import { CoverLetterContentStore } from './cover-letter-content.store';

function createStore() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [CoverLetterContentStore] });
  return TestBed.inject(CoverLetterContentStore);
}

describe('CoverLetterContentStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts on an empty letter with the default tone and length', () => {
    const store = createStore();

    expect(store.content().bodyParagraphs).toEqual([]);
    expect(store.tone()).toBe(COVER_LETTER_TONE_DEFAULT);
    expect(store.length()).toBe(COVER_LETTER_LENGTH_DEFAULT);
  });

  describe('hydrate', () => {
    it('takes the letter off a stored document', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'Sehr geehrte', bodyParagraphs: ['one'] }));

      expect(store.content().greeting).toBe('Sehr geehrte');
      expect(store.content().bodyParagraphs).toEqual(['one']);
    });

    // A letter saved before tone and length existed must open on the defaults,
    // not on undefined - the AI call reads both.
    it('defaults tone and length after parsing, not before', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'Hi' }));

      expect(store.tone()).toBe(COVER_LETTER_TONE_DEFAULT);
      expect(store.length()).toBe(COVER_LETTER_LENGTH_DEFAULT);
    });

    it('keeps a stored tone and length rather than overwriting them', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ tone: 'Friendly', length: 'Detailed' }));

      expect(store.tone()).toBe('Friendly');
      expect(store.length()).toBe('Detailed');
    });

    // Asymmetric: the store already holds a letter. Hydrating an EMPTY store
    // cannot tell "reset to empty" from "leave it alone" - they agree - and
    // that is exactly the fixture that would let a load quietly keep the
    // previous document's text.
    it('resets to an empty letter when the row has no content yet', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'previous', bodyParagraphs: ['old'] }));

      store.hydrate(null);

      expect(store.content().greeting).toBe('');
      expect(store.content().bodyParagraphs).toEqual([]);
      expect(store.tone()).toBe(COVER_LETTER_TONE_DEFAULT);
    });

    // The two are NOT alike. Absent content is a row nothing has been written
    // into; malformed content is a letter that exists and cannot be read, and
    // showing an empty editor over it is one Save away from replacing it with
    // nothing. The caller's load reports the unreadable document instead -
    // the same contract CvStyleStore.hydrate documents.
    it('throws on malformed content rather than opening an empty editor over it', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'still on disk' }));

      expect(() => store.hydrate('{not json')).toThrow();
      expect(store.content().greeting).toBe('still on disk');
    });

    it('replaces a previously hydrated letter rather than merging into it', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'first', subject: 'kept?' }));
      store.hydrate(JSON.stringify({ greeting: 'second' }));

      expect(store.content().greeting).toBe('second');
      expect(store.content().subject).toBeUndefined();
    });
  });

  describe('the application answers', () => {
    it('reads absent answers as empty strings', () => {
      const store = createStore();

      expect(store.earliestStart()).toBe('');
      expect(store.salaryExpectation()).toBe('');
      expect(store.noticePeriod()).toBe('');
      expect(store.attachments()).toBe('');
    });

    // Asymmetric on the three: each set to a different value, so a getter
    // reading the wrong field is visible. Identical values would hide it.
    it('reads each answer off its own field', () => {
      const store = createStore();
      store.hydrate(
        JSON.stringify({
          earliestStart: 'ab sofort',
          salaryExpectation: '75.000 EUR',
          noticePeriod: '3 Monate',
          attachments: 'Lebenslauf',
        }),
      );

      expect(store.earliestStart()).toBe('ab sofort');
      expect(store.salaryExpectation()).toBe('75.000 EUR');
      expect(store.noticePeriod()).toBe('3 Monate');
      expect(store.attachments()).toBe('Lebenslauf');
    });

    it('hands the AI skill the three answers under its own names', () => {
      const store = createStore();
      store.hydrate(
        JSON.stringify({
          earliestStart: 'ab sofort',
          salaryExpectation: '75.000 EUR',
          noticePeriod: '3 Monate',
        }),
      );

      expect(store.applicationDetails()).toEqual({
        earliest_start: 'ab sofort',
        salary_expectation: '75.000 EUR',
        notice_period: '3 Monate',
      });
    });

    it('hands the skill empty strings rather than undefined', () => {
      expect(createStore().applicationDetails()).toEqual({
        earliest_start: '',
        salary_expectation: '',
        notice_period: '',
      });
    });
  });

  describe('the word budget', () => {
    it('counts only the body paragraphs', () => {
      const store = createStore();
      store.hydrate(
        JSON.stringify({
          greeting: 'these words do not count',
          signature: 'nor these',
          bodyParagraphs: ['one two three', 'four five'],
        }),
      );

      expect(store.wordCount()).toBe(5);
    });

    // Asymmetric on the three budgets against ONE body. 250 words is over
    // Concise (120-200), inside Standard (200-320) and under Detailed
    // (320-450), so every branch is reached by changing only the length. A
    // three-word fixture reads "under" for all three and cannot show that the
    // selected length is consulted at all.
    it('measures the same body against whichever length is selected', () => {
      const store = createStore();
      store.hydrate(
        JSON.stringify({ bodyParagraphs: [Array(250).fill('word').join(' ')], length: 'Standard' }),
      );
      expect(store.wordCount()).toBe(250);
      expect(store.wordStatus()).toBe('ok');

      store.setLength('Concise');
      expect(store.wordStatus()).toBe('over');

      store.setLength('Detailed');
      expect(store.wordStatus()).toBe('under');
    });

    it('recounts as paragraphs are edited', () => {
      const store = createStore();
      store.addParagraph();
      store.updateParagraph(0, 'one two');
      expect(store.wordCount()).toBe(2);

      store.updateParagraph(0, 'one');
      expect(store.wordCount()).toBe(1);
    });
  });

  describe('editing', () => {
    it('sets the tone and the length without disturbing the letter', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'kept' }));

      store.setTone('Confident');
      store.setLength('Concise');

      expect(store.tone()).toBe('Confident');
      expect(store.length()).toBe('Concise');
      expect(store.content().greeting).toBe('kept');
    });

    it('writes an address field and a text field to their own places', () => {
      const store = createStore();

      store.updateAddress('company', 'Aiven');
      store.updateField('subject', 'Bewerbung');

      expect(store.content().address).toEqual({ company: 'Aiven' });
      expect(store.content().subject).toBe('Bewerbung');
    });

    it('adds, edits and removes paragraphs', () => {
      const store = createStore();

      store.addParagraph();
      store.addParagraph();
      store.updateParagraph(0, 'first');
      store.updateParagraph(1, 'second');

      expect(store.content().bodyParagraphs).toEqual(['first', 'second']);

      store.removeParagraph(0);
      expect(store.content().bodyParagraphs).toEqual(['second']);
    });

    // The caller has to reindex the body_<i> style overrides above the removal
    // and needs the new length to do it. Returning the count is what lets the
    // style stay in another store.
    it('reports how many paragraphs are left after a removal', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ bodyParagraphs: ['a', 'b', 'c'] }));

      expect(store.removeParagraph(1)).toBe(2);
      expect(store.removeParagraph(0)).toBe(1);
      expect(store.removeParagraph(0)).toBe(0);
    });

    it('replaces the whole letter through set, for an AI draft', () => {
      const store = createStore();
      store.hydrate(JSON.stringify({ greeting: 'old' }));

      store.set({ ...store.content(), greeting: 'drafted', bodyParagraphs: ['x'] });

      expect(store.content().greeting).toBe('drafted');
      expect(store.content().bodyParagraphs).toEqual(['x']);
    });
  });
});
