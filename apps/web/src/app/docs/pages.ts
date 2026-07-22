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
          One AI source: a direct API key, <em>or</em> a CLI subscription you already have (Claude
          Code, Codex, or Gemini CLI). Optional until you ask for an AI action.
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
          <strong>CLI bridge:</strong> use a Claude Code, Codex, or Gemini CLI subscription you
          already pay for. Zero extra API tokens.
        </li>
        <li>
          <strong>Direct API:</strong> paste your own API key. A token counter is shown so cost is
          visible.
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

/* ------------------------------------------------------------------ German */
@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="german">German market</h1>
    <p class="docs__lede">
      The DACH job search has rules other tools ignore. Applye treats them as first-class.
    </p>
    <section class="docs__section">
      <h2 id="features" class="docs__h2">What is built for it</h2>
      <ul class="docs__list">
        <li>
          <strong>Agentur für Arbeit:</strong> generate an Eigenbemühungen report of your documented
          efforts.
        </li>
        <li>
          <strong>German-language output</strong> for CVs, letters, and prep when a role demands it.
        </li>
        <li><strong>Visa &amp; Blue-Card awareness</strong> in guidance.</li>
        <li><strong>GDPR-aligned</strong> data handling by default.</li>
      </ul>
    </section>
  `,
})
export class German {}

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
        It does not scrape closed job boards, bypass logins, or harvest postings at scale. You paste
        in roles you found. Where automated sources exist, they use public JSON APIs (for example
        Greenhouse, Lever, Ashby), not HTML scraping, so there is no terms-of-service violation and
        no anti-bot risk.
      </p>
    </section>
  `,
})
export class Legality {}

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
