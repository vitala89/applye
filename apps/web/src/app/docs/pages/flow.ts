import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="flow">The core flow</h1>
    <p class="docs__lede">
      The daily loop mirrors a three-pass methodology. Code does the cheap work first.
    </p>
    <section class="docs__section">
      <h2 id="steps" class="docs__h2">Paste to submit</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          <strong>You paste</strong> a job (text or URL). The app never auto-fetches from closed
          boards.
        </li>
        <li>
          <strong>Code parses and hard-filters</strong> (0 tokens): location, salary, contract,
          visa.
        </li>
        <li><strong>Legitimacy check</strong> assigns a green / yellow / red tier.</li>
        <li>
          <strong>The AI acts as a blunt recruiter:</strong> rubric score, missing keywords, red
          flags, ATS pass, and "before you submit" notes.
        </li>
        <li>
          <strong>The AI offers to tailor:</strong> XYZ rewrite, then a dual critique, then a build.
        </li>
        <li>
          <strong>You review, edit, export, and submit manually.</strong> The app never clicks
          "apply" for you.
        </li>
      </ol>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Flow {}
