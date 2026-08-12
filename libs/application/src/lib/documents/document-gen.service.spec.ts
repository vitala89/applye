import { TestBed } from '@angular/core/testing';
import { DocumentGenService } from './document-gen.service';

describe('DocumentGenService', () => {
  function make(): DocumentGenService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(DocumentGenService);
  }

  it('tracks CV and cover letter independently (concurrent)', () => {
    const s = make();
    s.begin(7, 'cv');
    s.begin(7, 'cover_letter');
    expect(s.isPreparing(7, 'cv')).toBe(true);
    expect(s.isPreparing(7, 'cover_letter')).toBe(true);
    expect(s.anyPreparing(7)).toBe(true);
    expect(s.busy()).toBe(true);
  });

  it('ending one kind leaves the other running', () => {
    const s = make();
    s.begin(7, 'cv');
    s.begin(7, 'cover_letter');
    s.end(7, 'cv');
    expect(s.isPreparing(7, 'cv')).toBe(false);
    expect(s.isPreparing(7, 'cover_letter')).toBe(true);
    expect(s.anyPreparing(7)).toBe(true);
  });

  it('drops the slot once nothing is generating', () => {
    const s = make();
    s.begin(7, 'cv');
    s.end(7, 'cv');
    expect(s.anyPreparing(7)).toBe(false);
    expect(s.busy()).toBe(false);
  });

  it('is scoped per job', () => {
    const s = make();
    s.begin(7, 'cv');
    expect(s.isPreparing(8, 'cv')).toBe(false);
    expect(s.anyPreparing(8)).toBe(false);
  });

  it('begin() for a second job replaces the slot', () => {
    const s = make();
    s.begin(7, 'cv');
    s.begin(8, 'cover_letter');
    expect(s.anyPreparing(7)).toBe(false);
    expect(s.isPreparing(8, 'cover_letter')).toBe(true);
  });

  it('clear(jobId) only clears the matching job', () => {
    const s = make();
    s.begin(7, 'cv');
    s.clear(8);
    expect(s.isPreparing(7, 'cv')).toBe(true);
    s.clear(7);
    expect(s.anyPreparing(7)).toBe(false);
  });
});
