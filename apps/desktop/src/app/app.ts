import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';
import { FirstLaunchComponent, FirstLaunchDismiss } from './core/first-launch.component';
import { OnboardingComponent } from './core/onboarding/onboarding.component';
import { OnboardingService } from './core/onboarding/onboarding.service';
import { BootGateStore } from '@applye/application';
import { ToastContainerComponent } from './core/toast/toast-container.component';

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
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="onFirstLaunchDismissed($event)" />
    } @else if (showOnboarding()) {
      <app-onboarding (completed)="onboarding.close()" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
    <app-toast-container />
  `,
  styles: [':host { display: block; height: 100%; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BootGateStore],
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);
  /** Which screen the app opens on. The rule is the store's; this component
   * only routes the answer (ADR-0005). */
  private readonly boot = inject(BootGateStore);
  readonly onboarding = inject(OnboardingService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);
  readonly showOnboarding = computed(() => this.onboarding.open());

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
