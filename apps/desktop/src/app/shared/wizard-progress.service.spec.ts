import { TestBed } from '@angular/core/testing';
import { WizardProgressService } from './wizard-progress.service';

const STORAGE_KEY = 'applye:wizardProgress';

describe('WizardProgressService', () => {
  function make(): WizardProgressService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(WizardProgressService);
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('records progress in the signal and sessionStorage', () => {
    const service = make();
    service.set(7, 3);
    expect(service.progress()).toEqual({ jobId: 7, step: 3 });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      jobId: 7,
      step: 3,
    });
  });

  it('overwrites the prior step for the same session', () => {
    const service = make();
    service.set(7, 1);
    service.set(7, 4);
    expect(service.progress()).toEqual({ jobId: 7, step: 4 });
  });

  it('hydrates from sessionStorage on construction', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: 9, step: 2 }));
    const service = make();
    expect(service.progress()).toEqual({ jobId: 9, step: 2 });
  });

  it('ignores malformed stored progress', () => {
    sessionStorage.setItem(STORAGE_KEY, '{ not json');
    expect(make().progress()).toBeNull();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: 'x' }));
    expect(make().progress()).toBeNull();
  });

  it('clear() wipes signal and storage', () => {
    const service = make();
    service.set(7, 3);
    service.clear();
    expect(service.progress()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clear(jobId) only clears the matching job', () => {
    const service = make();
    service.set(7, 3);
    service.clear(8);
    expect(service.progress()).toEqual({ jobId: 7, step: 3 });
    service.clear(7);
    expect(service.progress()).toBeNull();
  });
});
