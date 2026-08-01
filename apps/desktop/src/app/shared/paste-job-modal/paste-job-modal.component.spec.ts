import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UrlClassification } from '@applye/core';
import { DbService, JobSourceService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { PasteJobModalComponent } from './paste-job-modal.component';

/** The protected signals the tests read. TypeScript's `protected` is a
 * compile-time rule; the component's own behaviour is what is under test. */
type Internals = {
  tab: { (): 'link' | 'text'; set(v: 'link' | 'text'): void };
  linkUrl: { set(v: string): void };
  closedBoardName: () => string | null;
  isUnknownDomain: () => boolean;
  linkError: () => string;
  submitLink: () => Promise<void>;
};

describe('PasteJobModalComponent', () => {
  let modal: Internals;
  let classification: UrlClassification;
  let classifyFails: boolean;
  let pasted: string[];
  let navigated: unknown[][];

  beforeEach(() => {
    classification = { kind: 'allowed', source: 'greenhouse' };
    classifyFails = false;
    pasted = [];
    navigated = [];

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
        { provide: Router, useValue: { navigate: (c: unknown[]) => navigated.push(c) } },
      ],
    });

    modal = TestBed.createComponent(PasteJobModalComponent)
      .componentInstance as unknown as Internals;
    modal.linkUrl.set('https://example.com/jobs/1');
  });

  it('stays on the link tab when the board is closed, where the explanation is', async () => {
    // The warning and its "Open in browser" button render on the link tab. The
    // component used to switch to "Paste text" here, which put the answer on
    // the tab the user had just been moved off.
    classification = { kind: 'closed', boardName: 'LinkedIn' };

    await modal.submitLink();

    expect(modal.tab()).toBe('link');
    expect(modal.closedBoardName()).toBe('LinkedIn');
  });

  it('stays on the link tab for an unknown domain', async () => {
    classification = { kind: 'unknown' };

    await modal.submitLink();

    expect(modal.tab()).toBe('link');
    expect(modal.isUnknownDomain()).toBe(true);
  });

  it('stays on the link tab when the fetch itself fails', async () => {
    classifyFails = true;

    await modal.submitLink();

    expect(modal.tab()).toBe('link');
    expect(modal.linkError()).toContain('network down');
  });

  it('still fetches and opens the job when the URL is allowed', async () => {
    await modal.submitLink();

    expect(pasted).toEqual(['jd text']);
    expect(navigated).toEqual([['/jobs', 5]]);
  });
});
