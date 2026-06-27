import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellLayoutComponent } from './layout/shell-layout.component';

@Component({
  imports: [RouterOutlet, ShellLayoutComponent],
  selector: 'app-root',
  template: '<app-shell-layout><router-outlet /></app-shell-layout>',
  styles: [':host { display: block; height: 100%; }'],
})
export class App {
  readonly theme = signal<'dark' | 'light'>('dark');
}
