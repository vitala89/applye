import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { HelpCircle, Loader2, LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { JobIdentityResolverService } from '../job-identity-resolver.service';

/**
 * Corner badge for the identification phase, in the shape the resume-tailor
 * badge already uses: work that outlives the page it started on is reported in
 * the corner rather than by freezing the page.
 *
 * It covers the two things a user who walked away needs to know - that a job is
 * being named, and that one is waiting to be named by them - and gives the way
 * back in one click. Nothing here can be cancelled, because nothing is at
 * stake: the job row was written before this phase started.
 */
@Component({
  selector: 'app-job-identity-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './job-identity-badge.component.html',
  styleUrl: './job-identity-badge.component.scss',
})
export class JobIdentityBadgeComponent {
  private readonly i18n = inject(TranslateService);
  private readonly identity = inject(JobIdentityResolverService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly icons = { loader: Loader2, ask: HelpCircle };

  /** Lifted clear of the resume-tailor badge when that one is also showing. */
  readonly stacked = input(false);

  /** The URL as a signal, so the badge disappears the moment the user arrives
   * on the job it is about. `router.url` alone is a plain read and would leave
   * the badge on screen behind the page it points at. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly running = computed(() => this.identity.identifyingJobId() !== null);

  /** The job the badge is about: one being named, or one waiting to be. */
  private readonly subject = computed(
    () => this.identity.identifyingJobId() ?? this.identity.needsNameJobId(),
  );

  /**
   * Shown only when the user is somewhere else. On the job's own page the card
   * says it is identifying and the dialog opens by itself, so a corner badge
   * about the thing already on screen would be noise.
   */
  protected readonly visible = computed(() => {
    const jobId = this.subject();
    return jobId !== null && this.url() !== `/jobs/${jobId}`;
  });

  protected go(): void {
    const jobId = this.subject();
    if (jobId !== null) void this.router.navigate(['/jobs', jobId]);
  }
}
