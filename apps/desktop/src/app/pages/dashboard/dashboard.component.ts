import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h2>Dashboard</h2>
      <p>Funnel analytics, activity, and counters — Phase 1+</p>
    </div>
  `,
  styles: [`
    .page-placeholder {
      h2 { font-family: var(--font-mono); font-size: var(--text-xl); margin-bottom: var(--space-3); color: var(--text-primary); }
      p { color: var(--text-secondary); font-size: var(--text-sm); }
    }
  `],
})
export class DashboardComponent {}
