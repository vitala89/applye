import { Component } from '@angular/core';

@Component({
  selector: 'app-interview-prep',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h2>Interview Prep</h2>
      <p>Stages, Q&A cards, STAR+R, pitch generator — Phase 2</p>
    </div>
  `,
  styles: [`
    .page-placeholder {
      h2 { font-family: var(--font-mono); font-size: var(--text-xl); margin-bottom: var(--space-3); color: var(--text-primary); }
      p { color: var(--text-secondary); font-size: var(--text-sm); }
    }
  `],
})
export class InterviewPrepComponent {}
