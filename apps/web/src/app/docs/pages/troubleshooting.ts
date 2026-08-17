import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="troubleshooting">Troubleshooting &amp; FAQ</h1>
    <p class="docs__lede">
      The questions that come up most, answered without marketing. If your problem is not here, it
      belongs in an issue once the repository is public.
    </p>

    <section class="docs__section">
      <h2 id="ai-issues" class="docs__h2">AI actions</h2>
      <ul class="docs__list">
        <li>
          <strong>Every AI button is disabled.</strong> No AI source is connected yet. Open
          <a routerLink="/docs/guide/settings">Settings</a> and add an API key or bridge a CLI. All
          0-token features keep working without one.
        </li>
        <li>
          <strong>The provider rejects my key.</strong> Keys are provider-specific: an OpenAI key
          will not authenticate against Anthropic. Check that the key is active and has credit, then
          use the test-prompt button to confirm the connection rather than guessing from a failed
          scoring run.
        </li>
        <li>
          <strong>CLI mode does nothing.</strong> The bridged CLI must be installed, on your PATH,
          and already logged in. Applye shells out to the tool you already use; it does not manage
          that tool's session for you.
        </li>
        <li>
          <strong>Scoring returns nothing useful.</strong> Usually the job text was truncated at
          paste time, or the profile is too thin to compare against. Both are visible: re-open the
          job to check the parsed description, and check the profile-completeness card on the
          Dashboard.
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="cost" class="docs__h2">Cost and repeated calls</h2>
      <ul class="docs__list">
        <li>
          <strong>Why did re-opening a job cost nothing?</strong> Results are cached against a hash
          of the job text and your scoring profile. Identical inputs never pay twice, and cached
          results are labelled as such.
        </li>
        <li>
          <strong>Why is a job suddenly marked stale?</strong> You edited your profile after that
          job was scored. Nothing re-runs automatically; you decide whether the change is worth a
          fresh call.
        </li>
        <li>
          <strong>How much does a real search cost?</strong> Cents, not a subscription - because
          parsing, filtering, legitimacy tiers, badges, and analytics are all plain code. See
          <a routerLink="/docs/judgement">code vs LLM judgement</a>.
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="discover-issues" class="docs__h2">Discover</h2>
      <ul class="docs__list">
        <li>
          <strong>A scan returned nothing.</strong> Your keyword filters (derived from target roles)
          and geographic scope are applied locally, and the summary strip reports how many results
          were filtered out. Widen the scope in Settings, or edit the per-source keywords.
        </li>
        <li>
          <strong>No fit badges appear.</strong> You have no target roles defined. Applye shows no
          badge rather than a guessed one - add them in
          <a routerLink="/docs/guide/profile">your profile</a>.
        </li>
        <li>
          <strong>Why is LinkedIn / Indeed / StepStone missing?</strong> Deliberate. Applye reads
          public APIs and feeds only, and does not scrape closed boards or bypass logins. See
          <a routerLink="/docs/legality">source legality</a>.
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="docs-issues" class="docs__h2">Documents and export</h2>
      <ul class="docs__list">
        <li>
          <strong>Where is the DOCX export?</strong> Gone, deliberately. A second rendering engine
          meant two documents that disagreed with the preview and with each other; the WYSIWYG PDF
          is now the single supported export. The editor still warns about fonts and photos that ATS
          parsers handle badly, which is what the DOCX was really being used for. Importing a DOCX
          CV still works.
        </li>
        <li>
          <strong>My tailored CV is not in the library.</strong> Drafts stay hidden until you export
          them or mark the application as applied. Finish the wizard and it appears, labelled by
          company and role.
        </li>
        <li>
          <strong>I lost an unfinished tailoring session.</strong> You did not - the Dashboard's
          "Resume tailoring" card reopens it at the exact step.
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="general" class="docs__h2">General</h2>
      <ul class="docs__list">
        <li>
          <strong>Will it apply for me?</strong> No, and it never will. That is the line the whole
          product is built around - see <a routerLink="/manifesto">the manifesto</a>.
        </li>
        <li>
          <strong>Where is my data?</strong> One local file, documented in
          <a routerLink="/docs/data">your data</a>.
        </li>
        <li>
          <strong>Is there an account or a paid tier?</strong> Neither. The only thing you might pay
          for is your own AI usage, billed by your provider.
        </li>
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Troubleshooting {}
