import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import {
  CompensationVerdict,
  Job,
  compareCompensation,
  extractSalaryFromJd,
  parseProfileMd,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobIdentityResolverService } from '../../../shared/job-identity-resolver.service';

/**
 * The parsed job's own header: who it is with, what the role is, its filter and
 * legitimacy badges, and the salary-fit chip.
 *
 * Extracted from the jobs page, which is over its size budget in both the
 * template and the class and so cannot host the identity work part B adds -
 * the inferred marker and the "Name it yourself" button. It owns the salary
 * comparison too, because that block sits inside the same card and reads the
 * same two inputs.
 */
@Component({
  selector: 'app-job-meta-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-meta-card.component.html',
  styleUrl: './job-meta-card.component.scss',
})
export class JobMetaCardComponent {
  private readonly i18n = inject(TranslateService);
  private readonly identity = inject(JobIdentityResolverService);
  protected readonly t = this.i18n.t;

  readonly job = input.required<Job>();
  readonly profileMd = input('');
  readonly jdText = input('');
  readonly hasArchetypes = input(false);
  readonly archetypeMatch = input<boolean | null>(null);

  /** The job as it stands after the user named it, for the page to adopt. */
  readonly identityChanged = output<Job>();

  /** True when the value shown was named by the AI rather than read from the
   * posting, so the card can say so instead of quoting it. */
  protected readonly companyInferred = computed(
    () => !!this.job().company && this.job().companySource === 'inferred',
  );

  protected readonly titleInferred = computed(
    () => !!this.job().title && this.job().titleSource === 'inferred',
  );

  /** True while the AI step is naming this job. Shown on the card so a user who
   * stayed can see the phase is running, without the Parse button pretending
   * the parse itself is still going. */
  protected readonly identifying = computed(
    () => this.identity.identifyingJobId() === this.job().id,
  );

  constructor() {
    // The identification phase outlives this component, so its results arrive
    // asynchronously and possibly after a round trip through another page.
    effect(() => {
      const resolved = this.identity.resolved();
      if (resolved && resolved.id === this.job().id) this.identityChanged.emit(resolved);
    });

    // The dialog is raised here rather than by the service, because being
    // rendered is what proves the user is still looking at this job. Someone
    // who moved on to Pipeline meets the corner badge instead of a modal.
    effect(() => {
      if (this.identity.needsNameJobId() === this.job().id) void this.ask();
    });
  }

  private async ask(): Promise<void> {
    this.identityChanged.emit(await this.identity.ask(this.job()));
  }

  /** The way back after a Skip, and the way in for a value the user disagrees
   * with. Always offered - naming a job is never closed off. Unlike the
   * automatic path this gives the AI another turn first, because the posting or
   * the configured provider may have changed since. */
  protected async nameIt(): Promise<void> {
    this.identityChanged.emit(await this.identity.askAgain(this.job()));
  }

  protected readonly compTarget = computed(() => {
    const cf = parseProfileMd(this.profileMd());
    return { min: cf.compMin, max: cf.compMax, currency: cf.compCurrency, period: cf.compPeriod };
  });

  protected readonly hasCompTarget = computed(
    () => !!(this.compTarget().min || this.compTarget().max),
  );

  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.compTarget(), extractSalaryFromJd(this.jdText())),
  );

  protected compBadgeLabel(): string {
    const v = this.compVerdict();
    if (v === 'above') return this.t()('comp.badge_above');
    if (v === 'within') return this.t()('comp.badge_within');
    if (v === 'below') return this.t()('comp.badge_below');
    return this.t()('comp.not_stated');
  }
}
