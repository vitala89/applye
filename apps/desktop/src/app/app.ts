import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';
import { UpdaterService } from './core/updater.service';

@Component({
  imports: [RouterOutlet, ShellLayoutComponent],
  selector: 'app-root',
  template: '<app-shell-layout><router-outlet /></app-shell-layout>',
  styles: [':host { display: block; height: 100%; }'],
})
export class App implements OnInit {
  private readonly updater = inject(UpdaterService);

  readonly theme = signal<'dark' | 'light'>('dark');

  ngOnInit(): void {
    // Fire-and-forget: offer an update if one exists; never blocks startup.
    void this.updater.checkForUpdates();
  }
}
