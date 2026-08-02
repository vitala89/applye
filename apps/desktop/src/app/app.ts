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
import { shouldAutoOpenOnboarding } from './core/onboarding/onboarding-gate.util';
import { DbService } from '@applye/data';
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
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);
  private readonly db = inject(DbService);
  readonly onboarding = inject(OnboardingService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);
  readonly showOnboarding = computed(() => this.onboarding.open());

  async ngOnInit(): Promise<void> {
    // Fire-and-forget: the result reaches the user through the Settings badge
    // and the About block, never through a dialog over a window they just
    // opened. Never blocks startup.
    void this.updater.check();
    try {
      const settings = await this.db.getSettings();
      this.showFirstLaunch.set(!settings.healthCheckSeen);
      if (settings.healthCheckSeen && shouldAutoOpenOnboarding(settings)) {
        this.onboarding.requestOpen();
      }
    } catch {
      // fail open - never block the app on a health-flag read error
    }
  }

  onFirstLaunchDismissed(intent: FirstLaunchDismiss): void {
    this.showFirstLaunch.set(false);
    // The welcome screen already persisted the flags; open the tour only when
    // the user asked for it. Skipping leaves the empty-profile banner to nudge.
    if (intent.startOnboarding) this.onboarding.requestOpen();
  }
}
