import { TestBed } from '@angular/core/testing';
import { WizardProgressService } from './wizard-progress.service';

describe('WizardProgressService', () => {
  function make(): WizardProgressService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(WizardProgressService);
  }

  it('records progress in the signal', () => {
    const service = make();
    service.set(7, 3);
    expect(service.progress()).toEqual({ jobId: 7, step: 3 });
  });

  it('overwrites the prior step for the same session', () => {
    const service = make();
    service.set(7, 1);
    service.set(7, 4);
    expect(service.progress()).toEqual({ jobId: 7, step: 4 });
  });

  it('hydrates a value the desktop read back', () => {
    const service = make();
    service.hydrate({ jobId: 9, step: 2 });
    expect(service.progress()).toEqual({ jobId: 9, step: 2 });
  });

  it('clear() wipes the signal', () => {
    const service = make();
    service.set(7, 3);
    service.clear();
    expect(service.progress()).toBeNull();
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
