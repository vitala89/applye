import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="requirements">Requirements</h1>
    <p class="docs__lede">
      career-ops asks for a terminal, Node, and Git. Applye asks for none of that: it is a desktop
      application you install and open.
    </p>
    <section class="docs__section">
      <h2 id="need" class="docs__h2">What you need</h2>
      <ul class="docs__list">
        <li>A desktop OS: macOS, Windows, or Linux.</li>
        <li>
          One AI source: a direct API key for Anthropic Claude or DeepSeek, <em>or</em> a CLI
          subscription you already have (Claude Code or Codex). Optional until you ask for an AI
          action.
        </li>
        <li>No account. No terminal. No cloud service to sign up for.</li>
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Requirements {}
