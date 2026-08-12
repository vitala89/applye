import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DbService, JobSourceService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { JobIdentityResolverService, PasteJobStore } from '@applye/application';
import { PasteJobModalComponent } from './paste-job-modal.component';

/**
 * Creating a job is `PasteJobStore`'s and is tested there. What is left here is
 * the half the modal owns: a successful submit closes it and opens the job, and
 * a refused one leaves the user where the explanation is.
 */
type Internals = {
  submitLink: () => Promise<void>;
  submitText: () => Promise<void>;
};

describe('PasteJobModalComponent', () => {
  let modal: Internals;
  let navigated: unknown[][];
  let jobId: number | null;

  beforeEach(() => {
    navigated = [];
    jobId = 5;

    TestBed.configureTestingModule({
      providers: [
        TranslateService,
        { provide: DbService, useValue: {} },
        { provide: JobSourceService, useValue: {} },
        { provide: JobIdentityResolverService, useValue: { start: () => undefined } },
        { provide: Router, useValue: { navigate: (c: unknown[]) => navigated.push(c) } },
      ],
    });

    const store = TestBed.inject(PasteJobStore);
    jest.spyOn(store, 'submitLink').mockImplementation(() => Promise.resolve(jobId));
    jest.spyOn(store, 'submitText').mockImplementation(() => Promise.resolve(jobId));

    modal = TestBed.createComponent(PasteJobModalComponent)
      .componentInstance as unknown as Internals;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('opens the job the link produced', async () => {
    await modal.submitLink();

    expect(navigated).toEqual([['/jobs', 5]]);
  });

  it('opens the job the pasted text produced', async () => {
    await modal.submitText();

    expect(navigated).toEqual([['/jobs', 5]]);
  });

  /** A refusal is not a failure to navigate away from: the reason, and the
   * "Open in browser" button that is the way forward, are on the tab the user
   * is already looking at. */
  it('stays put when nothing was created', async () => {
    jobId = null;

    await modal.submitLink();
    await modal.submitText();

    expect(navigated).toEqual([]);
  });
});
