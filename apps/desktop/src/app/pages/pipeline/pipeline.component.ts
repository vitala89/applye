import { Component } from '@angular/core';

@Component({
  selector: 'app-pipeline',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h2>Pipeline</h2>
      <p>Kanban board (Angular CDK Drag & Drop) — Phase 1+</p>
      <p style="margin-top: 8px; font-size: 12px; color: var(--text-tertiary)">
        Columns: Saved → Applied → Interview → Offer / Rejected
      </p>
    </div>
  `,
  styles: [`
    .page-placeholder {
      h2 { font-family: var(--font-mono); font-size: var(--text-xl); margin-bottom: var(--space-3); color: var(--text-primary); }
      p { color: var(--text-secondary); font-size: var(--text-sm); }
    }
  `],
})
export class PipelineComponent {}
