import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="local-markets">Local markets</h1>
    <p class="docs__lede">
      Applye works in any country: nothing in the core loop assumes one. What differs between
      markets is the paperwork around the application, and Applye handles that where it exists.
    </p>
    <section class="docs__section">
      <h2 id="everywhere" class="docs__h2">Everywhere</h2>
      <ul class="docs__list">
        <li>
          <strong>Documents in six languages</strong> for CVs, cover letters, and interview prep,
          matched to what the role expects rather than to where you live.
        </li>
        <li>
          <strong>Local conventions</strong> in the CV editor: photo or no photo, layout and date
          norms, and the ATS quirks that differ by market - each with a plain warning about the
          trade-off.
        </li>
        <li>
          <strong>Visa and work-permit awareness</strong>, including the EU Blue Card, for anyone
          applying across a border.
        </li>
        <li>
          <strong>GDPR-aligned by architecture.</strong> Your data never leaves the machine, which
          satisfies the strictest regime without a compliance setting to configure.
        </li>
      </ul>
    </section>
    <section class="docs__section">
      <h2 id="germany" class="docs__h2">Germany, in depth</h2>
      <p>
        The German market is covered furthest, because it is the one the author was searching in:
        the Job Tracker exports the official <em>Eigenbemühungen</em> report for the Agentur für
        Arbeit, in German and with a letterhead, straight from your tracked applications. The same
        report is available in an International (English) format for everyone else.
      </p>
      <p class="docs__todo">
        <span class="docs__todobadge">TODO</span> Other markets with their own paperwork are welcome
        as issues once the repository is public - the report exporter is built to take more formats.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalMarkets {}
