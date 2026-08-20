import { TestBed } from '@angular/core/testing';
import { TailoringPassDraftsService } from './tailoring-pass-drafts.service';

describe('TailoringPassDraftsService', () => {
  let svc: TailoringPassDraftsService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [TailoringPassDraftsService] });
    svc = TestBed.inject(TailoringPassDraftsService);
  });

  it('starts owning nothing', () => {
    expect(svc.ids(7)).toEqual([]);
  });

  it('records the rows this pass created, in order', () => {
    svc.record(7, 11);
    svc.record(7, 22);

    expect(svc.ids(7)).toEqual([11, 22]);
  });

  it('records a row once, however often the pass re-links it', () => {
    svc.record(7, 11);
    svc.record(7, 11);

    expect(svc.ids(7)).toEqual([11]);
  });

  it('owns nothing for a job whose pass is not the one running', () => {
    svc.record(7, 11);

    expect(svc.ids(9)).toEqual([]);
  });

  it('owns nothing when asked without a job', () => {
    svc.record(7, 11);

    expect(svc.ids(null)).toEqual([]);
  });

  // Only one pass runs at a time - the cross-job confirm refuses a second - so
  // the previous job's ids stop being anyone's to delete.
  it('starts a fresh record when the pass moves to another job', () => {
    svc.record(7, 11);
    svc.record(9, 33);

    expect(svc.ids(9)).toEqual([33]);
    expect(svc.ids(7)).toEqual([]);
  });

  it('clears only when the record belongs to the job that ended', () => {
    svc.record(7, 11);

    svc.clear(9);
    expect(svc.ids(7)).toEqual([11]);

    svc.clear(7);
    expect(svc.ids(7)).toEqual([]);
  });

  it('clears unconditionally with no job', () => {
    svc.record(7, 11);

    svc.clear();

    expect(svc.ids(7)).toEqual([]);
  });

  // The discard service is component-scoped, so the record has to outlive the
  // page component - stepping into the document editor destroys it, and an
  // in-memory record would widen the next discard back out to everything.
  it('survives a new instance within the same session', () => {
    svc.record(7, 11);

    const revived = new TailoringPassDraftsService();

    expect(revived.ids(7)).toEqual([11]);
  });

  it('reads a corrupted record as no record at all', () => {
    sessionStorage.setItem('applye:tailoringPassDrafts', '{ not json');

    expect(new TailoringPassDraftsService().ids(7)).toEqual([]);
  });

  it('reads a record with the wrong shape as no record at all', () => {
    sessionStorage.setItem('applye:tailoringPassDrafts', JSON.stringify({ jobId: 7 }));

    expect(new TailoringPassDraftsService().ids(7)).toEqual([]);
  });
});
