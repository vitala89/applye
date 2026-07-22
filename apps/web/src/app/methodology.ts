import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceLink } from './ui/source-link';

interface MethSection {
  id: string;
  title: string;
}

@Component({
  selector: 'app-methodology',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './methodology.html',
})
export class Methodology {
  private readonly doc = inject(DOCUMENT);

  readonly careerOps = 'https://career-ops.org';

  readonly active = signal<string>('score');

  readonly sections: MethSection[] = [
    { id: 'score', title: 'The score' },
    { id: 'layer1', title: 'Layer 1: deterministic' },
    { id: 'ai', title: 'AI scoring layers' },
    { id: 'before', title: 'Before you submit' },
    { id: 'honesty', title: 'Honest about judgement' },
    { id: 'tokens', title: 'Token economy' },
    { id: 'boundary', title: 'The augmentation boundary' },
  ];

  constructor() {
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
