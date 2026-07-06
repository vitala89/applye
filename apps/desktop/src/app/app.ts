import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';
import { FirstLaunchComponent } from './core/first-launch.component';
import { OnboardingComponent } from './core/onboarding/onboarding.component';
import { OnboardingService } from './core/onboarding/onboarding.service';
import { shouldAutoOpenOnboarding } from './core/onboarding/onboarding-gate.util';
import { DbService } from '@applye/data';

@Component({
  imports: [RouterOutlet, ShellLayoutComponent, FirstLaunchComponent, OnboardingComponent],
  selector: 'app-root',
  template: `
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="onFirstLaunchDismissed()" />
    } @else if (showOnboarding()) {
      <app-onboarding (completed)="onboarding.close()" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
  `,
  styles: [':host { display: block; height: 100%; }'],
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);
  private readonly db = inject(DbService);
  readonly onboarding = inject(OnboardingService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);
  readonly showOnboarding = computed(() => this.onboarding.open());

  async ngOnInit(): Promise<void> {
    // Fire-and-forget: offer an update if one exists; never blocks startup.
    void this.updater.checkForUpdates();
    try {
      const settings = await this.db.getSettings();
      this.showFirstLaunch.set(!settings.healthCheckSeen);
      if (settings.healthCheckSeen && shouldAutoOpenOnboarding(settings)) {
        this.onboarding.requestOpen();
      }
    } catch {
      // fail open — never block the app on a health-flag read error
    }
  }

  async onFirstLaunchDismissed(): Promise<void> {
    this.showFirstLaunch.set(false);
    try {
      const settings = await this.db.getSettings();
      if (shouldAutoOpenOnboarding(settings)) this.onboarding.requestOpen();
    } catch {
      // fail open
    }
  }
}
