import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="privacy">Privacy &amp; transparency</h1>
    <p class="docs__lede">
      Nothing is collected. The design is GDPR-aligned because your data never leaves the device.
    </p>
    <section class="docs__section">
      <h2 id="data" class="docs__h2">Your data</h2>
      <p>
        Everything lives in a local SQLite database on your machine. No cloud, no account, no
        telemetry, no usage history. Delete the file and it is gone.
      </p>
    </section>
    <section class="docs__section">
      <h2 id="transparency" class="docs__h2">Transparency</h2>
      <ul class="docs__list">
        <li>Output is structured: a short rationale by default, full breakdown only on request.</li>
        <li>Every result is cached in a local table. Re-opening a job costs 0 tokens.</li>
        <li>In Direct API mode a token counter shows what each action costs.</li>
        <li>The AI never auto-applies. Every output is a proposal you accept, edit, or discard.</li>
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Privacy {}
