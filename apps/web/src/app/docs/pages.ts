import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceLink } from '../ui/source-link';

const CAREER_OPS = 'https://career-ops.org';

/* ---------------------------------------------------------------- Overview */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="overview">Overview</h1>
    <p class="docs__lede">
      The honest version of how Applye works. What runs as plain code, where the AI is allowed to
      judge, what stays on your machine, and what is still a TODO. Written for people who want to
      know what a tool does before they run it.
    </p>
    <section class="docs__section">
      <h2 id="what" class="docs__h2">What Applye is</h2>
      <p>
        Applye is a free, open-source, local-first desktop app for an AI-powered job search in 2026.
        It is inspired by the methodology of
        <a href="${CAREER_OPS}" target="_blank" rel="noopener">career-ops.org</a> (a CLI), rebuilt
        as a graphical desktop app so the same pipeline is usable without a terminal. You paste a
        job, it gives a blunt recruiter and ATS check, drafts a tailored CV you review, and tracks
        the role across a kanban. The AI advises; you decide and submit.
      </p>
    </section>
    <section class="docs__section">
      <h2 id="next" class="docs__h2">Where to start</h2>
      <p>
        New here? Read <a routerLink="/docs/requirements">Requirements</a> and
        <a routerLink="/docs/install">Install</a>. Want the scoring internals? See the
        <a routerLink="/methodology">methodology</a>.
      </p>
    </section>
  `,
})
export class Overview {}

/* ------------------------------------------------------------ Requirements */
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
})
export class Requirements {}

/* ----------------------------------------------------------------- Install */
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
})
export class Install {}

/* -------------------------------------------------------------------- Flow */
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
})
export class Flow {}

/* --------------------------------------------------------------- Judgement */
@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="judgement">Code vs LLM judgement</h1>
    <p class="docs__lede">
      The core rule: do not call AI where code suffices. Most of the pipeline is plain code at 0
      tokens; the model is invoked only where judgement is needed, and cached by input hash.
    </p>
    <section class="docs__section">
      <h2 id="split" class="docs__h2">What runs where</h2>
      <div class="docs__table" role="table" aria-label="Code vs AI">
        <div class="docs__trow docs__trow--head"><span>Task</span><span>Runs as</span></div>
        <div class="docs__trow">
          <span>Parse pasted job, dedupe</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Hard filter (location, visa, salary)</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Legitimacy tier (green / yellow / red)</span
          ><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>First-pass ATS check (fonts, links, formatting)</span
          ><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Overdue follow-up badges, analytics</span><span class="zero">code · 0 tokens</span>
        </div>
        <div class="docs__trow">
          <span>Recruiter rubric score</span><span class="ai">AI · low</span>
        </div>
        <div class="docs__trow">
          <span>Tailoring, cover letter, pitch</span><span class="ai">AI · on demand</span>
        </div>
      </div>
    </section>
    <section class="docs__section">
      <h2 id="cache" class="docs__h2">Caching</h2>
      <p class="docs__quote">
        Search is code, not AI. Code collects; AI evaluates. "Auto-search jobs by prompt" is a
        costly myth.
      </p>
    </section>
  `,
})
export class Judgement {}

/* ----------------------------------------------------------------- BringAi */
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
})
export class BringAi {}

/* ----------------------------------------------------------------- Scoring */
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
})
export class Scoring {}

/* ---------------------------------------------------------- Local markets */
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
})
export class LocalMarkets {}

/* ----------------------------------------------------------------- Privacy */
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
})
export class Privacy {}

/* ---------------------------------------------------------------- Legality */
@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="legality">Source legality</h1>
    <p class="docs__lede">Applye is a tool you point at jobs you are already looking at.</p>
    <section class="docs__section">
      <h2 id="how" class="docs__h2">No scraping</h2>
      <p>
        It does not scrape closed job boards, bypass logins, or harvest postings at scale. Discover
        reads machine-readable sources that are published for exactly this purpose - public JSON
        APIs such as Greenhouse, Lever and Ashby, plus RSS feeds and the built-in remote boards -
        never HTML scraped out from behind a login. So there is no terms-of-service violation and no
        anti-bot risk. Anything those sources do not cover, you paste in yourself.
      </p>
    </section>
  `,
})
export class Legality {}

/* --------------------------------------------------------- Data and backup */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="data">Your data: where it lives and how to move it</h1>
    <p class="docs__lede">
      Local-first is only a real promise if you can find, copy, and destroy your data yourself. Here
      is exactly where it is.
    </p>

    <section class="docs__section">
      <h2 id="files" class="docs__h2">What is on disk</h2>
      <ul class="docs__list">
        <li>
          <strong>applye.db</strong> - one SQLite file holding your profile, jobs, applications,
          documents, and every cached AI result. It runs in WAL mode, so you may also see
          <code>applye.db-wal</code> and <code>applye.db-shm</code> next to it.
        </li>
        <li>
          <strong>API keys</strong> - never in the database. They live in your operating system's
          keychain / credential manager, under the app identifier <code>dev.applye.app</code>.
        </li>
        <li>
          <strong>Exported documents</strong> - wherever you chose to save them in the native
          dialog. Applye does not keep a second copy.
        </li>
      </ul>
      <p>The database sits in the standard per-user app-data directory for your OS:</p>
      <ul class="docs__list">
        <li><strong>macOS</strong> - <code>~/Library/Application Support/dev.applye.app/</code></li>
        <li><strong>Windows</strong> - <code>%APPDATA%\\dev.applye.app\\</code></li>
        <li>
          <strong>Linux</strong> - <code>~/.local/share/dev.applye.app/</code> (or your
          <code>$XDG_DATA_HOME</code> equivalent)
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="backup" class="docs__h2">Backing up and moving machines</h2>
      <ol class="docs__list docs__list--ol">
        <li>Quit Applye, so the write-ahead log is checkpointed cleanly.</li>
        <li>Copy the whole app-data folder, not just the <code>.db</code> file.</li>
        <li>
          On the new machine, install Applye, launch it once so the folder exists, quit, and put the
          copy in place.
        </li>
        <li>
          Re-enter your API key: keychain entries deliberately do not travel with a file copy.
        </li>
      </ol>
      <p>
        That folder is also the whole answer to "what does a backup tool need to include". Any
        ordinary encrypted-backup setup covers Applye by covering that directory.
      </p>
    </section>

    <section class="docs__section">
      <h2 id="delete" class="docs__h2">Deleting everything</h2>
      <p>
        Settings has a two-step <strong>Delete all data</strong> action: it wipes the local database
        and removes your keys from the keychain. Deleting your data here is deleting a file - there
        is no server copy to request, chase, or wait 30 days for. If you prefer, delete the app-data
        folder by hand; the result is identical.
      </p>
      <p>
        What Applye cannot delete is data your AI provider retained on their side. That is governed
        by their terms, which is one reason
        <a routerLink="/docs/ai">bringing your own AI</a> is a deliberate choice rather than a
        hidden default.
      </p>
    </section>
  `,
})
export class DataAndBackup {}

/* --------------------------------------------------------- Troubleshooting */
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
})
export class Troubleshooting {}

/* ------------------------------------------------------------------ Status */
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
})
export class Status {}
