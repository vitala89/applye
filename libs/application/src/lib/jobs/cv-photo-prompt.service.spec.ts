import { TestBed } from '@angular/core/testing';
import { DocumentLibraryItem } from '@applye/core';
import { DocumentsGateway, JobsGateway, ApplicationsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CvPhotoPromptService } from './cv-photo-prompt.service';

describe('CvPhotoPromptService', () => {
  let svc: CvPhotoPromptService;
  let upserts: Partial<DocumentLibraryItem>[];
  let upsertFails: boolean;

  const CV = { id: 4, contentJson: '{"sections":[]}' } as DocumentLibraryItem;

  beforeEach(() => {
    upserts = [];
    upsertFails = false;

    const db = {
      documentLibraryUpsert: (doc: Partial<DocumentLibraryItem>) => {
        if (upsertFails) return Promise.reject(new Error('disk on fire'));
        upserts.push(doc);
        return Promise.resolve({ ...CV, ...doc } as DocumentLibraryItem);
      },
    };

    TestBed.configureTestingModule({
      providers: [
        CvPhotoPromptService,
        TranslateService,
        { provide: JobsGateway, useValue: db },
        { provide: ApplicationsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
      ],
    });
    svc = TestBed.inject(CvPhotoPromptService);
  });

  it('raises the prompt when the market becomes German', () => {
    svc.onRegionChosen('de');

    expect(svc.open()).toBe(true);
  });

  it('stays quiet for every other market', () => {
    for (const region of ['us', 'uk', 'generic'] as const) svc.onRegionChosen(region);

    expect(svc.open()).toBe(false);
  });

  it('asks once per visit, not once per switch back to German', () => {
    // Asked again on every toggle it would be nagging, which is the whole
    // reason this is tied to the moment the market changes at all.
    svc.onRegionChosen('de');
    svc.dismiss();
    svc.onRegionChosen('us');
    svc.onRegionChosen('de');

    expect(svc.open()).toBe(false);
  });

  it('writes the photo into the linked CV and returns it', async () => {
    const outcome = await svc.accept('data:image/jpeg;base64,xxx', CV);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBe(4);
    expect(outcome).toEqual({ kind: 'updated', document: expect.objectContaining({ id: 4 }) });
    expect(svc.open()).toBe(false);
    expect(svc.busy()).toBe(false);
  });

  it('sends the user to the profile when there is no photo yet', async () => {
    // Cropped once on the profile and reused, rather than re-uploaded per
    // application.
    const outcome = await svc.accept(null, CV);

    expect(outcome).toEqual({ kind: 'open-profile' });
    expect(upserts).toEqual([]);
  });

  it('writes nothing when no CV exists yet', async () => {
    // The photo is on the profile and the region is set, so the CV picks it up
    // when it is created. There is nothing to patch.
    const outcome = await svc.accept('data:image/jpeg;base64,xxx', null);

    expect(upserts).toEqual([]);
    expect(outcome).toEqual({ kind: 'none' });
    expect(svc.open()).toBe(false);
  });

  it('reports a failed write and clears busy', async () => {
    upsertFails = true;

    const outcome = await svc.accept('data:image/jpeg;base64,xxx', CV);

    expect(outcome).toEqual({ kind: 'none' });
    expect(svc.status()).toContain('disk on fire');
    expect(svc.busy()).toBe(false);
  });
});
