import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="ai">Bring your own AI</h1>
    <p class="docs__lede">
      Two modes, one abstraction. You choose; nothing is hardcoded to a single vendor.
    </p>
    <section class="docs__section">
      <h2 id="modes" class="docs__h2">Two modes</h2>
      <ul class="docs__list">
        <li>
          <strong>CLI bridge:</strong> use a Claude Code or Codex subscription you already pay for.
          Zero extra API tokens. Codex is also the only route to OpenAI models.
        </li>
        <li>
          <strong>Direct API:</strong> paste your own Anthropic Claude or DeepSeek key. A token
          counter is shown so cost is visible.
        </li>
      </ul>
    </section>
    <section class="docs__section">
      <h2 id="tiering" class="docs__h2">Model tiering</h2>
      <p>
        A cheap model handles routine work (rough scoring, screen questions); a stronger model is
        used for tailoring. Economy is the default for routine calls.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BringAi {}
