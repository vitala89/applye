import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/*
 * One page of the user guide. Split out of guide-pages.ts, which held all ten
 * at 1122 lines against a 400 budget. Each is lazily routed on its own, so a
 * file per page is also a chunk per page.
 *
 * MEDIA: every <figure class="docs__media"> holds a real capture from the
 * running desktop app. Product shots are captured, never drawn - a picture of a
 * UI that does not match the shipped app is a false claim about the product, in
 * documentation whose whole argument is that this project is honest.
 */

/* ---------------------------------------------------------------- Settings */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="settings">Settings: AI, language, data</h1>
    <p class="docs__lede">
      Everything configurable lives here, including the only switch that ever lets data leave your
      machine: your own AI connection.
    </p>

    <section class="docs__section">
      <h2 id="ai" class="docs__h2">Connect your AI (optional)</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          <strong>API mode</strong> - paste your own key for Anthropic Claude or DeepSeek. Keys are
          stored in the OS keychain, never in the database or logs.
        </li>
        <li>
          <strong>CLI mode</strong> - bridge a coding CLI you already subscribe to, Claude Code or
          Codex, instead of paying per token. This is how OpenAI models are reached: through Codex,
          not through an API key.
        </li>
        <li>
          A privacy note under every cloud provider states plainly what an API call sends (the job
          text and relevant profile fields) - see <a routerLink="/docs/guide/score">scoring</a> for
          when calls happen.
        </li>
      </ol>
      <figure class="docs__media">
        <img
          src="/guide/settings-ai.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="Applye Settings in dark theme. AI mode is set to API (direct) with Claude (Anthropic)
            as the provider. A privacy note states that in API mode the job description and profile
            text are sent to Anthropic's servers, that the key is stored in the OS keychain and
            never written to the database or logs, and that nothing is sent until an action is
            triggered. Below it the API key section reads Stored in your OS keychain and the key
            field is empty apart from a masked placeholder."
        />
        <figcaption>AI settings with the privacy note.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="rest" class="docs__h2">The rest</h2>
      <ul class="docs__list">
        <li>
          <strong>Language</strong> - UI and default document language, each shown in its own name:
          English, Deutsch, Русский, Español, Français, Українська.
        </li>
        <li>
          <strong>Appearance</strong> - dark (the default) or light, also toggleable from the top
          bar.
        </li>
        <li>
          <strong>Job search</strong> - the geographic scope Discover filters by (worldwide / Europe
          / USA / Asia).
        </li>
        <li>
          <strong>Delete all data</strong> - the factory reset. A two-step confirm wipes the local
          database and removes keys from the keychain. Deleting your data is deleting a file; there
          is no server copy to chase.
        </li>
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideSettings {}
