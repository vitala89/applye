import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';
import { FirstLaunchComponent, FirstLaunchDismiss } from './core/first-launch.component';
import { OnboardingComponent } from './core/onboarding/onboarding.component';
import { OnboardingService } from './core/onboarding/onboarding.service';
import { BootGateStore } from '@applye/application';
import { ToastContainerComponent } from './core/toast/toast-container.component';

/**
 * The routes the hidden PDF-export windows load. They are never linked from the
 * UI - Rust opens them - and the document is the entire point of the window.
 */
const PRINT_ROUTE_PREFIX = '/print/';

@Component({
  imports: [
    RouterOutlet,
    ShellLayoutComponent,
    FirstLaunchComponent,
    OnboardingComponent,
    ToastContainerComponent,
  ],
  selector: 'app-root',
  template: `
    @if (chromeless()) {
      <router-outlet />
    } @else {
      @if (showFirstLaunch()) {
        <app-first-launch (dismissed)="onFirstLaunchDismissed($event)" />
      } @else if (showOnboarding()) {
        <app-onboarding (completed)="onboarding.close()" />
      } @else {
        <app-shell-layout><router-outlet /></app-shell-layout>
      }
      <!-- Outside the three screens, as it always was: a toast raised during
           onboarding still has to reach the user. Inside the chromeless guard,
           because a toast painted into an exported PDF is not a toast. -->
      <app-toast-container />
    }
  `,
  styles: [':host { display: block; height: 100%; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BootGateStore],
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly updater = inject(UpdaterService);
  /** Which screen the app opens on. The rule is the store's; this component
   * only routes the answer (ADR-0005). */
  private readonly boot = inject(BootGateStore);
  readonly onboarding = inject(OnboardingService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);
  readonly showOnboarding = computed(() => this.onboarding.open());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * No sidebar, no header, no toasts: the window is a sheet of paper.
   *
   * The print routes used to render the full shell and the print stylesheet
   * hid it with `visibility: hidden`, which **paints nothing and occupies
   * everything**. Two defects came out of that. The document had to be lifted
   * to the page origin with `position: absolute` to escape the shell it was
   * sitting below, and the shell's own height stayed in the flow - so a report
   * that fitted on one page exported as two, the second blank (`B6`).
   *
   * Reading the URL rather than route data keeps this to one signal and no
   * `ActivatedRoute` traversal from the root; the three routes are literally
   * `print/*` and are declared in one place, `app.routes.ts`.
   */
  readonly chromeless = computed(() => this.url().startsWith(PRINT_ROUTE_PREFIX));

  async ngOnInit(): Promise<void> {
    // Fire-and-forget: the result reaches the user through the Settings badge
    // and the About block, never through a dialog over a window they just
    // opened. Never blocks startup.
    void this.updater.check();

    // `requestOpen` rather than a local signal: the same open state is written
    // by the dashboard banner and by Settings, so `OnboardingService` owns it.
    const screen = await this.boot.load();
    if (screen === 'first-launch') this.showFirstLaunch.set(true);
    else if (screen === 'onboarding') this.onboarding.requestOpen();
  }

  onFirstLaunchDismissed(intent: FirstLaunchDismiss): void {
    this.showFirstLaunch.set(false);
    // The welcome screen already persisted the flags; open the tour only when
    // the user asked for it. Skipping leaves the empty-profile banner to nudge.
    if (intent.startOnboarding) this.onboarding.requestOpen();
  }
}
