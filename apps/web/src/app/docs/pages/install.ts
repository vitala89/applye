import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="install">Install &amp; setup</h1>
    <p class="docs__lede">Setup is meant to take about three minutes, not fifteen.</p>
    <section class="docs__section">
      <h2 id="steps" class="docs__h2">Steps</h2>
      <ol class="docs__list docs__list--ol">
        <li>Download the build for your OS from the release page (public at launch).</li>
        <li>Open the app. Your local database is created on first run.</li>
        <li>Fill in your profile once (this is what scoring compares against).</li>
        <li>Optionally connect an AI source in Settings when you want AI actions.</li>
      </ol>
      <p class="docs__todo">
        <span class="docs__todobadge">TODO</span> Per-OS install steps and signed-build notes land
        with the first public release. The repo is private until launch.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Install {}
