import { TestBed } from '@angular/core/testing';
import { UrlClassification } from '@applye/core';
import { DbService, JobSourceService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { JobIdentityResolverService } from './job-identity-resolver.service';
import { PasteJobStore, looksLikeJobDescription } from './paste-job.store';

describe('PasteJobStore', () => {
  let store: PasteJobStore;
  let classification: UrlClassification;
  let classifyFails: boolean;
  let pasted: string[];
  let identified: number[];

  beforeEach(() => {
    classification = { kind: 'allowed', source: 'greenhouse' };
    classifyFails = false;
    pasted = [];
    identified = [];

    const source = {
      classifyJobUrl: () =>
        classifyFails ? Promise.reject(new Error('network down')) : Promise.resolve(classification),
      fetchJobFromUrl: () =>
        Promise.resolve({ title: 'Backend Engineer', company: 'Acme', jdText: 'jd text' }),
      jobPaste: (jdText: string) => {
        pasted.push(jdText);
        return Promise.resolve({ id: 5 });
      },
    };

    TestBed.configureTestingModule({
      providers: [
        TranslateService,
        { provide: DbService, useValue: {} },
        { provide: JobSourceService, useValue: source },
        {
          provide: JobIdentityResolverService,
          useValue: { start: (j: { id: number }) => identified.push(j.id) },
        },
      ],
    });

    store = TestBed.inject(PasteJobStore);
    store.linkUrl.set('https://example.com/jobs/1');
  });

  afterEach(() => TestBed.resetTestingModule());

  it('stays on the link tab when the board is closed, where the explanation is', async () => {
    // The warning and its "Open in browser" button render on the link tab. This
    // used to switch to "Paste text", which put the answer on the tab the user
    // had just been moved off.
    classification = { kind: 'closed', boardName: 'LinkedIn' };

    expect(await store.submitLink()).toBeNull();
    expect(store.tab()).toBe('link');
    expect(store.closedBoardName()).toBe('LinkedIn');
  });

  it('stays on the link tab for an unknown domain', async () => {
    classification = { kind: 'unknown' };

    expect(await store.submitLink()).toBeNull();
    expect(store.tab()).toBe('link');
    expect(store.isUnknownDomain()).toBe(true);
  });

  it('stays on the link tab when the fetch itself fails', async () => {
    classifyFails = true;

    expect(await store.submitLink()).toBeNull();
    expect(store.tab()).toBe('link');
    expect(store.linkError()).toContain('network down');
  });

  it('fetches and creates the job when the URL is allowed, and reports its id', async () => {
    expect(await store.submitLink()).toBe(5);
    expect(pasted).toEqual(['jd text']);
  });

  it('starts the identification chain on Analyze, not only on Parse and filter', async () => {
    // Otherwise a user who pasted a posting the rules could not read has to
    // find a second button and press it to be asked - which is what the
    // Analyze button was supposed to save them.
    store.tab.set('text');
    store.textValue.set('a posting that names nobody');

    expect(await store.submitText()).toBe(5);
    expect(pasted).toEqual(['a posting that names nobody']);
    expect(identified).toEqual([5]);
  });

  it('starts it for a job fetched from a link too', async () => {
    await store.submitLink();

    expect(identified).toEqual([5]);
  });

  describe('the clipboard offer', () => {
    const POSTING = `${'We are looking for a backend engineer. '.repeat(10)} responsibilities and requirements follow.`;

    it('offers text that reads like a posting', () => {
      store.offerClipboardText(POSTING);

      expect(store.clipboardOffer()).toBe(POSTING);
    });

    it('offers nothing for short text, and nothing at all for no text', () => {
      store.offerClipboardText('responsibilities requirements');
      expect(store.clipboardOffer()).toBe('');

      store.offerClipboardText(null);
      expect(store.clipboardOffer()).toBe('');
    });

    it('never auto-fills - the user moves it into the text tab', () => {
      store.offerClipboardText(POSTING);
      expect(store.textValue()).toBe('');

      store.useClipboardText();

      expect(store.textValue()).toBe(POSTING);
      expect(store.tab()).toBe('text');
      expect(store.clipboardOffer()).toBe('');
    });
  });

  describe('looksLikeJobDescription', () => {
    it('needs length and at least two posting-shaped keywords', () => {
      const long = 'x'.repeat(400);

      expect(looksLikeJobDescription(`${long} responsibilities requirements`)).toBe(true);
      expect(looksLikeJobDescription(`${long} responsibilities`)).toBe(false);
      expect(looksLikeJobDescription('responsibilities requirements')).toBe(false);
    });
  });
});
