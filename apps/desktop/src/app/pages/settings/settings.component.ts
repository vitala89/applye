import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h2>Settings</h2>
      <p>AI mode, API key (keyring), language, export dir — Phase 1</p>
    </div>
  `,
  styles: [`
    .page-placeholder {
      h2 { font-family: var(--font-mono); font-size: var(--text-xl); margin-bottom: var(--space-3); color: var(--text-primary); }
      p { color: var(--text-secondary); font-size: var(--text-sm); }
    }
  `],
})
export class SettingsComponent {}
