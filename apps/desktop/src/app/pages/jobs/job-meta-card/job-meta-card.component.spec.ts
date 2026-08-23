import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobIdentityResolverService } from '@applye/application';
import { JobMetaCardComponent } from './job-meta-card.component';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    company: 'Acme',
    title: 'Engineer',
    jdHash: 'abc123',
    ...overrides,
  } as Job;
}

function identityStub() {
  return {
    identifyingJobId: signal<number | null>(null),
    needsNameJobId: signal<number | null>(null),
    resolved: signal<Job | null>(null),
    consumeResolved: jest.fn(),
    ask: jest.fn(),
    askAgain: jest.fn().mockResolvedValue(job()),
  };
}

function setup(s: ReturnType<typeof identityStub>) {
  TestBed.configureTestingModule({
    imports: [JobMetaCardComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: JobIdentityResolverService, useValue: s },
    ],
  });
  const fixture = TestBed.createComponent(JobMetaCardComponent);
  fixture.componentRef.setInput('job', job());
  fixture.detectChanges();
  return fixture;
}

function nameItButton(fixture: ReturnType<typeof setup>): HTMLButtonElement | undefined {
  return Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
    (b as HTMLButtonElement).classList.contains('job-meta__name-it'),
  ) as HTMLButtonElement | undefined;
}

describe('JobMetaCardComponent locked (P2)', () => {
  it('offers Name it/Edit it while the job is not locked', () => {
    const fixture = setup(identityStub());

    expect(nameItButton(fixture)?.disabled).toBe(false);
  });

  it('disables Name it/Edit it once the job is locked, so a wrong AI guess cannot be renamed post-apply', () => {
    const fixture = setup(identityStub());
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();

    expect(nameItButton(fixture)?.disabled).toBe(true);
  });
});
