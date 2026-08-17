import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SourceLink } from '../../ui/source-link';

@Component({
  standalone: true,
  imports: [SourceLink],
  template: `
    <h1 class="docs__h1" id="status">Status &amp; roadmap</h1>
    <p class="docs__lede">Applye is pre-launch. This page tracks shipped behaviour only.</p>
    <section class="docs__section">
      <h2 id="mvp" class="docs__h2">MVP</h2>
      <p>
        The MVP is the core loop: profile, paste, score, tailor, pipeline, interview prep, and the
        Agentur report. The full plan lives in the roadmap.
      </p>
      <p>
        <app-source-link
          variant="ghost"
          path="/blob/main/ROADMAP.md"
          label="Read the roadmap"
          soonLabel="Roadmap: coming soon"
        />
      </p>
      <p class="docs__todo">
        <span class="docs__todobadge">TODO</span> Deep-dive guides are written as features ship.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Status {}
