import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="scoring">Reading the recruiter check</h1>
    <p class="docs__lede">
      The score is deliberately blunt: how an HR screener actually reads, not encouragement.
    </p>
    <section class="docs__section">
      <h2 id="parts" class="docs__h2">What you get</h2>
      <ul class="docs__list">
        <li><strong>Rubric score</strong> with point-by-point deductions, not a vibe.</li>
        <li><strong>Top missing keywords</strong> the posting expects and your profile lacks.</li>
        <li><strong>Hiring-manager red flags</strong> a screener would catch.</li>
        <li><strong>ATS pass</strong> on formatting that breaks parsers.</li>
        <li>
          <strong>Before you submit:</strong> salary missing prompts comp research; portfolio
          required; deadline noted.
        </li>
      </ul>
      <p>
        For the full layer-by-layer breakdown, see the
        <a routerLink="/methodology">methodology page</a>.
      </p>
      <p class="docs__todo">
        <span class="docs__todobadge">TODO</span> Exact rubric weights and band thresholds live in
        the scoring skill files, not published as fixed numbers here. We do not invent precision we
        cannot stand behind.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scoring {}
