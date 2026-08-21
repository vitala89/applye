import { TestBed } from '@angular/core/testing';
import { Application } from '@applye/core';
import { JobsGateway } from '@applye/data';
import { DocumentApplicationLockService } from './document-application-lock.service';

describe('DocumentApplicationLockService', () => {
  let svc: DocumentApplicationLockService;
  let apps: Application[];

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        DocumentApplicationLockService,
        { provide: JobsGateway, useValue: { listApplications: () => Promise.resolve(apps) } },
      ],
    });
    svc = TestBed.inject(DocumentApplicationLockService);
  };

  it('is unlocked when no application links the document', async () => {
    apps = [];
    setup();

    await svc.check('cv', 5);

    expect(svc.locked()).toBe(false);
  });

  it('is unlocked while the linking application is still saved', async () => {
    apps = [{ id: 1, cvDocumentId: 5, status: 'saved' } as Application];
    setup();

    await svc.check('cv', 5);

    expect(svc.locked()).toBe(false);
  });

  it('is locked once the linking application has left saved', async () => {
    apps = [{ id: 1, cvDocumentId: 5, status: 'applied' } as Application];
    setup();

    await svc.check('cv', 5);

    expect(svc.locked()).toBe(true);
  });

  it('checks the cover letter link, not the CV link', async () => {
    apps = [{ id: 1, cvDocumentId: 5, coverLetterDocumentId: 9, status: 'applied' } as Application];
    setup();

    await svc.check('cover_letter', 9);

    expect(svc.locked()).toBe(true);
  });

  it('does not lock an unrelated document that happens to share no id', async () => {
    apps = [{ id: 1, cvDocumentId: 5, status: 'applied' } as Application];
    setup();

    await svc.check('cv', 6);

    expect(svc.locked()).toBe(false);
  });
});
