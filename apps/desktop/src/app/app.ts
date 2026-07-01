import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';
import { FirstLaunchComponent } from './core/first-launch.component';
import { DbService } from '@applye/data';

@Component({
  imports: [RouterOutlet, ShellLayoutComponent, FirstLaunchComponent],
  selector: 'app-root',
  template: `
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="showFirstLaunch.set(false)" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
  `,
  styles: [':host { display: block; height: 100%; }'],
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);
  private readonly db = inject(DbService);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly showFirstLaunch = signal(false);

  async ngOnInit(): Promise<void> {
    // Fire-and-forget: offer an update if one exists; never blocks startup.
    void this.updater.checkForUpdates();
    try {
      const settings = await this.db.getSettings();
      this.showFirstLaunch.set(!settings.healthCheckSeen);
    } catch {
      // fail open — never block the app on a health-flag read error
    }
  }
}
