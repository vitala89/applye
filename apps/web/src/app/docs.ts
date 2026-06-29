import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO } from './site';

interface DocSection {
  id: string;
  title: string;
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './docs.html',
})
export class Docs {
  private readonly doc = inject(DOCUMENT);

  readonly repo = REPO;
  readonly roadmap = `${REPO}/blob/main/ROADMAP.md`;
  readonly careerOps = 'https://career-ops.org';

  readonly active = signal<string>('overview');

  readonly sections: DocSection[] = [
    { id: 'overview', title: 'What Applye is' },
    { id: 'requirements', title: 'Requirements' },
    { id: 'install', title: 'Install & setup' },
    { id: 'ai', title: 'Bring your own AI' },
    { id: 'methodology', title: 'Methodology: the core flow' },
    { id: 'judgement', title: 'Code vs LLM judgement' },
    { id: 'scoring', title: 'Reading the recruiter check' },
    { id: 'transparency', title: 'Transparency' },
    { id: 'privacy', title: 'Privacy & your data' },
    { id: 'legality', title: 'Source legality' },
    { id: 'german', title: 'German market' },
    { id: 'audience', title: 'Who it is for' },
    { id: 'status', title: 'Status & roadmap' },
  ];

  constructor() {
    // Scrollspy is browser-only; afterNextRender keeps it out of prerender.
    afterNextRender(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) this.active.set(e.target.id);
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
      );
      for (const s of this.sections) {
        const el = this.doc.getElementById(s.id);
        if (el) observer.observe(el);
      }
    });
  }
}
