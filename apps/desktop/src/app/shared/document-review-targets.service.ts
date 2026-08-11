import { Injectable, inject, signal } from '@angular/core';
import { SupportedLanguage } from '@applye/core';
import { DocumentRegionTag, FinalChecksService } from './final-checks.service';

/**
 * Which market and which language the wizard's documents are written for.
 *
 * Both settings feed the final checks, the drafting prompts and the score
 * context, so they were page signals for as long as the review step was page
 * markup. They live here rather than travelling as inputs and outputs because
 * the page and the step both read *and* write them (ADR-0005): the page seeds
 * them from the application on load, and the step's two selects change them.
 *
 * Writing through `setRegion`/`setLanguage` is what keeps the staleness rule in
 * one place. Changing either invalidates a stored final-checks result, and that
 * rule used to be written twice - once in a page method and once inline in the
 * template, where the next reader had to notice it twice. Seeding on load uses
 * the plain signals instead, because a freshly restored result is not stale.
 */
@Injectable()
export class DocumentReviewTargetsService {
  private readonly finalChecks = inject(FinalChecksService);

  readonly region = signal<DocumentRegionTag>('generic');
  readonly language = signal<SupportedLanguage>('en');

  setRegion(region: DocumentRegionTag): void {
    this.region.set(region);
    this.staleFinalChecks();
  }

  setLanguage(language: SupportedLanguage): void {
    this.language.set(language);
    this.staleFinalChecks();
  }

  /** A stored result is the only thing worth flagging stale. */
  private staleFinalChecks(): void {
    this.finalChecks.outdated.set(!!this.finalChecks.checks());
  }
}
