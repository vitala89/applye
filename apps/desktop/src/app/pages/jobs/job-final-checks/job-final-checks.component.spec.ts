import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobFinalChecksComponent } from './job-final-checks.component';
import { FinalCheckStatus, FinalChecks, FinalChecksService } from '@applye/application';
import { LinkedDocumentsService } from '@applye/application';

const CV = { id: 3, docType: 'cv' } as DocumentLibraryItem;

function checks(over: Partial<FinalChecks> = {}): FinalChecks {
  return { inputHash: 'h', ats: 'pass', hr: 'strong', fit: 'valid', notes: [], ...over };
}

function stubs() {
  const stored = signal<FinalChecks | null>(null);
  const outdated = signal(false);
  return {
    stored,
    outdated,
    finalChecks: {
      checks: stored,
      outdated,
      statusKey: (status: FinalCheckStatus) => `jobs.wizard.final_check_${status}`,
      needRetailor: (cv: DocumentLibraryItem | null) => {
        const current = stored();
        if (!current || outdated()) return false;
        return !!cv && (current.ats === 'needs_review' || current.fit === 'rescore');
      },
    },
    linkedDocs: { cv: signal<DocumentLibraryItem | null>(CV) },
  };
}

function setup(s: ReturnType<typeof stubs>, tailoring = false) {
  TestBed.configureTestingModule({
    imports: [JobFinalChecksComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: FinalChecksService, useValue: s.finalChecks },
      { provide: LinkedDocumentsService, useValue: s.linkedDocs },
    ],
  });
  const fixture = TestBed.createComponent(JobFinalChecksComponent);
  fixture.componentRef.setInput('tailoring', tailoring);
  fixture.detectChanges();
  return fixture;
}

function rows(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.final-checks__rows strong')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

describe('JobFinalChecksComponent', () => {
  /// Without a linked CV there is nothing to check against, so the run button
  /// is disabled and the card says why instead of failing on click.
  it('disables the run button until a CV is linked', () => {
    const s = stubs();
    s.linkedDocs.cv.set(null);
    const fixture = setup(s);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.final-checks__head button',
    );
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('jobs.wizard.final_checks_needs_cv');
  });

  /// An outdated result was computed against documents that have since moved.
  /// Showing its three verdicts would be a stale green tick, so every row reads
  /// "outdated" instead - the rule that made rowStatus worth extracting.
  it('reads every row as outdated once the documents move', () => {
    const s = stubs();
    s.stored.set(checks({ ats: 'pass', hr: 'strong', fit: 'valid' }));
    const fixture = setup(s);

    expect(rows(fixture)).toEqual([
      'jobs.wizard.final_check_pass',
      'jobs.wizard.final_check_strong',
      'jobs.wizard.final_check_valid',
    ]);

    s.outdated.set(true);
    fixture.detectChanges();

    expect(rows(fixture)).toEqual([
      'jobs.wizard.final_check_outdated',
      'jobs.wizard.final_check_outdated',
      'jobs.wizard.final_check_outdated',
    ]);
  });

  /// Never run reads as "not run" rather than blank, so the card is honest
  /// about the difference between a passing check and no check.
  it('reads unset verdicts as not run', () => {
    const fixture = setup(stubs());
    expect(rows(fixture)).toEqual([
      'jobs.wizard.final_check_not_run',
      'jobs.wizard.final_check_not_run',
      'jobs.wizard.final_check_not_run',
    ]);
  });

  /// All three actions continue into page orchestration - the checks need the
  /// job description text, the rescore spends tokens, and the re-tailor walks
  /// the wizard back to step 1. The card emits and decides nothing.
  it('emits its three actions instead of running them', () => {
    const s = stubs();
    s.stored.set(checks({ ats: 'needs_review', fit: 'rescore' }));
    const fixture = setup(s);
    const seen: string[] = [];
    fixture.componentInstance.runChecks.subscribe(() => seen.push('run'));
    fixture.componentInstance.rescore.subscribe(() => seen.push('rescore'));
    fixture.componentInstance.retailor.subscribe(() => seen.push('retailor'));

    fixture.nativeElement.querySelector('.final-checks__head button').click();
    fixture.nativeElement.querySelector('.btn--ghost').click();
    fixture.nativeElement.querySelector('.final-checks__retailor button').click();

    expect(seen).toEqual(['run', 'rescore', 'retailor']);
  });

  /// Offering a re-tailor on a result that is already stale would spend a full
  /// tailoring run to fix a verdict that has not been recomputed yet.
  it('withdraws the re-tailor offer while the result is outdated', () => {
    const s = stubs();
    s.stored.set(checks({ ats: 'needs_review' }));
    const fixture = setup(s);
    expect(fixture.nativeElement.querySelector('.final-checks__retailor')).not.toBeNull();

    s.outdated.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.final-checks__retailor')).toBeNull();
  });

  /// A run already in flight must not be started twice from this card.
  it('disables the re-tailor button while tailoring runs', () => {
    const s = stubs();
    s.stored.set(checks({ ats: 'needs_review' }));
    const fixture = setup(s, true);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.final-checks__retailor button',
    );
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('jobs.wizard.phase_running');
  });
});
