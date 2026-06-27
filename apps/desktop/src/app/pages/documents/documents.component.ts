import { Component } from '@angular/core';

@Component({
  selector: 'app-documents',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h2>Documents</h2>
      <p>CV, cover letter, exports — Phase 1+</p>
    </div>
  `,
  styles: [`
    .page-placeholder {
      h2 { font-family: var(--font-mono); font-size: var(--text-xl); margin-bottom: var(--space-3); color: var(--text-primary); }
      p { color: var(--text-secondary); font-size: var(--text-sm); }
    }
  `],
})
export class DocumentsComponent {}
