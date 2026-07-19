import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/*
 * User guide - step-by-step, screen by screen, honest to what ships today.
 *
 * MEDIA PLACEHOLDERS: every <figure class="docs__media"> below is a stub. The
 * .docs__mediatag says what kind of asset goes there (SCREENSHOT / GIF / VIDEO)
 * and the text says exactly what to capture. Drop the real asset into
 * apps/web/public/guide/ and replace the placeholder box with an <img> or a
 * video embed, keeping the <figcaption>.
 */

/* -------------------------------------------------------- First run & tour */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="tour">First run &amp; quick tour</h1>
    <p class="docs__lede">
      What happens the first time you open Applye, and what every item in the sidebar does. Three
      minutes, no account, nothing leaves your machine.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">VIDEO</span>
        <p>
          PLACEHOLDER: guide/tour-walkthrough - a 2-3 minute narrated walkthrough: first launch,
          onboarding, one paste-to-tailor loop, one look at each sidebar section. This is the single
          most important asset on the docs.
        </p>
      </div>
      <figcaption>The full tour in one take.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="first-run" class="docs__h2">First launch</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          Open the app. A local SQLite database is created on your machine - that is the whole
          "signup".
        </li>
        <li>
          The onboarding wizard walks you through the basics, including the optional AI setup with
          provider cards. You can skip AI entirely - every 0-token feature works without it.
        </li>
        <li>
          Everything chosen here can be changed later in
          <a routerLink="/docs/guide/settings">Settings</a>.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/onboarding.png - the onboarding wizard on the AI-provider step,
            showing the provider cards and the option to skip.
          </p>
        </div>
        <figcaption>Onboarding: AI is optional, and says so.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="sidebar" class="docs__h2">The sidebar, top to bottom</h2>
      <ul class="docs__list">
        <li>
          <strong>Dashboard</strong> - counters, a "needs attention" queue, upcoming interviews,
          quick actions.
        </li>
        <li><strong>Discover</strong> - scan legal job feeds and triage what comes back.</li>
        <li>
          <strong>My Jobs</strong> - every job you pasted or saved, with scoring and tailoring per
          job.
        </li>
        <li>
          <strong>Pipeline</strong> - the kanban of active applications (applied / interview /
          offer).
        </li>
        <li>
          <strong>Interview Prep</strong> - a stage timeline per application you are interviewing
          for.
        </li>
        <li>
          <strong>Job Tracker</strong> - the table view of everything, with the exportable report.
        </li>
        <li><strong>Analytics</strong> - how your search is actually going, computed locally.</li>
        <li><strong>Documents</strong> - the library of exported CVs and cover letters.</li>
        <li><strong>Profile</strong> - the data all scoring and tailoring compares against.</li>
        <li><strong>Settings</strong> - AI, language, theme, job-search scope, data reset.</li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/sidebar.png - the full app window with the sidebar visible and the
            Dashboard open, dark theme.
          </p>
        </div>
        <figcaption>Home: sidebar plus Dashboard.</figcaption>
      </figure>
    </section>
  `,
})
export class GuideTour {}

/* ----------------------------------------------------------------- Profile */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="profile">Set up your profile</h1>
    <p class="docs__lede">
      The profile is the yardstick: every score and every tailored CV is measured against it. Fill
      it once, honestly; update it as your search teaches you things.
    </p>

    <section class="docs__section">
      <h2 id="fill" class="docs__h2">What to fill in</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          <strong>Contact details</strong> - name, email, phone, location; these flow into generated
          documents.
        </li>
        <li>
          <strong>Experience</strong> - free text, Markdown supported (the label says so in the
          app). This is the raw material tailoring works from, so specifics beat adjectives.
        </li>
        <li>
          <strong>Target roles</strong> - each card is a role name, a fit note, and when to pitch
          it. Discover also derives its default keyword filters from these.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/profile-filled.png - the Profile page with contact block, experience
            field, and two target-role cards visible.
          </p>
        </div>
        <figcaption>A filled profile with target-role cards.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="ai-tools" class="docs__h2">The two AI tools on this page</h2>
      <ul class="docs__list">
        <li>
          <strong>Scoring profile</strong> - an AI-condensed version of your profile used by the
          recruiter check. A freshness chip tells you when it is stale (you edited your profile
          after generating it); hit Regenerate to update. Jobs scored against an old version get a
          "score is stale" prompt on the Dashboard.
        </li>
        <li>
          <strong>Pitch</strong> - a short self-presentation draft you can regenerate and reuse.
        </li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">GIF</span>
          <p>
            PLACEHOLDER: guide/profile-regenerate.gif - clicking Regenerate on the scoring card: the
            pulse indicator while it runs, then the freshness chip turning current.
          </p>
        </div>
        <figcaption>Regenerating the scoring profile.</figcaption>
      </figure>
      <p>
        You can also <strong>import a CV as a PDF</strong> (Dashboard quick action) to seed the
        profile instead of typing from scratch. AI setup itself lives in
        <a routerLink="/docs/guide/settings">Settings</a>.
      </p>
    </section>
  `,
})
export class GuideProfile {}

/* ----------------------------------------------------------- Add first job */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="add-job">Add your first job</h1>
    <p class="docs__lede">
      Copy a job description you are already looking at, paste it in, and let deterministic code do
      the filing. Zero tokens, works offline.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">GIF</span>
        <p>
          PLACEHOLDER: guide/paste-job.gif - copying a JD from a browser, clicking "Paste job" in My
          Jobs, and the parsed result appearing (company, title, salary detected, legitimacy tier).
        </p>
      </div>
      <figcaption>Paste to parsed job in a few seconds.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="steps" class="docs__h2">Steps</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          Open <strong>My Jobs</strong> and click <strong>Paste job</strong> (also on the
          Dashboard).
        </li>
        <li>Paste the job description text, or a job URL.</li>
        <li>
          Code extracts company, title, salary, language, and location - no AI involved. Salary
          detection understands plain formats like "80k EUR" too.
        </li>
        <li>
          The <strong>legitimacy check</strong> assigns a green / yellow / red tier from ghost-job
          and scam signals (vague company, no salary mention, urgency language, and similar), with
          notes on what it saw.
        </li>
        <li>The job lands in the My Jobs table; click the row to open its detail page.</li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/my-jobs-table.png - the My Jobs table with a few jobs, showing the
            legitimacy tiers and statuses.
          </p>
        </div>
        <figcaption>My Jobs: the working list.</figcaption>
      </figure>
      <p>
        Duplicate pastes are recognized by content hash and never create a second row. Next:
        <a routerLink="/docs/guide/score">score the role</a>.
      </p>
    </section>
  `,
})
export class GuideAddJob {}

/* ------------------------------------------------------------------- Score */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="score">Score a role</h1>
    <p class="docs__lede">
      The recruiter check is the first AI feature you will meet: a blunt read of the role against
      your profile, before you spend an evening on it.
    </p>

    <section class="docs__section">
      <h2 id="run" class="docs__h2">Running the check</h2>
      <ol class="docs__list docs__list--ol">
        <li>Open the job's detail page from My Jobs.</li>
        <li>Click <strong>Score with AI</strong>. One opt-in call runs; the result is cached.</li>
        <li>
          You get a <strong>percentage match</strong> gauge, a per-dimension breakdown, the
          <strong>keywords you are missing</strong>, <strong>red flags</strong> a screener would
          catch, and "before you submit" notes.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/score-result.png - a scored job: the percentage gauge, dimension
            breakdown, missing keywords chips, and red flags list.
          </p>
        </div>
        <figcaption>A scored role, honest verdict included.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="reading" class="docs__h2">Reading it</h2>
      <p>
        Identical inputs never pay twice: the score is cached by job and profile hash. If you later
        edit your profile and regenerate the scoring profile, affected jobs are flagged stale so you
        can re-score deliberately. How the rubric works is documented in
        <a routerLink="/methodology">the methodology</a>; how to interpret bands is in
        <a routerLink="/docs/scoring">Reading the recruiter check</a>.
      </p>
    </section>
  `,
})
export class GuideScore {}

/* ------------------------------------------------------------------ Tailor */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="tailor">Tailor the CV and export a PDF</h1>
    <p class="docs__lede">
      The apply wizard takes a scored job and produces documents you actually reviewed. It ends with
      a PDF and a tracked application - never with an automatic submission.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">VIDEO</span>
        <p>
          PLACEHOLDER: guide/tailor-wizard - a 60-90s capture of the whole wizard: Tailor pass
          running, the gap-fill question dialog, Review documents, Export &amp; Apply with the
          native save dialog and the resulting PDF.
        </p>
      </div>
      <figcaption>From scored job to exported PDF.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="steps" class="docs__h2">The wizard, step by step</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          <strong>Tailor</strong> - pick the base (your profile, or the job's existing tailored CV)
          and run the multi-pass adaptation: an XYZ rewrite, a dual critique, a clean build. A
          Cancel button stops it between passes.
        </li>
        <li>
          <strong>Gap questions</strong> - before generating, the AI may ask up to five targeted
          questions about things the job needs and your CV does not show (a language level, a
          framework). Answer or skip each; optionally save answers to your profile. Honesty rule: it
          asks you instead of inventing.
        </li>
        <li>
          <strong>Review documents</strong> - generate the tailored CV and, if you want one, the
          cover letter. "Review" opens the rendered document first; edit anything. Documents stay
          drafts, invisible in the library, until you export or mark applied.
        </li>
        <li>
          <strong>Updated score / final checks</strong> - see the fit after tailoring, run the final
          check.
        </li>
        <li>
          <strong>Export &amp; Apply</strong> - save the <strong>PDF</strong> via the native save
          dialog, then <strong>Create application</strong> (or Update, on a re-tailor). You open the
          posting and submit yourself; Applye records the application and files the documents into
          the <strong>Documents</strong> library, labelled by company and role.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/gap-dialog.png - the gap-fill dialog mid-flow: one question, answer
            field, Skip button, save-to-profile toggle.
          </p>
        </div>
        <figcaption>The wizard asks; it does not invent.</figcaption>
      </figure>
      <p>
        One document per job: regenerating updates the same library entry instead of stacking
        duplicates. An unfinished wizard session is remembered - a "Finish tailoring" button brings
        you back to the exact step. Next:
        <a routerLink="/docs/guide/track">track the application</a>.
      </p>
    </section>
  `,
})
export class GuideTailor {}

/* ---------------------------------------------------------------- Discover */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="discover">Discover: let jobs come to you</h1>
    <p class="docs__lede">
      Discover scans legal, machine-readable sources with plain code - public APIs and feeds only, 0
      tokens, nothing leaves your machine except HTTPS requests to the feeds themselves.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">GIF</span>
        <p>
          PLACEHOLDER: guide/discover-scan.gif - clicking Scan: the terminal-style console logging
          each source line by line, collapsing into the summary strip (LAST SCAN · N NEW · N
          FILTERED · 0 TOKENS).
        </p>
      </div>
      <figcaption>A scan run, live.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="sources" class="docs__h2">1. Choose sources</h2>
      <ul class="docs__list">
        <li>
          <strong>Built-ins</strong> - Remotive, We Work Remotely, Himalayas; toggle them in the
          Sources panel.
        </li>
        <li>
          <strong>Company ATS boards</strong> - add a Greenhouse, Lever, or Ashby board by its
          company slug.
        </li>
        <li><strong>Your own RSS feeds</strong> - any https feed you trust.</li>
        <li>
          Closed boards (LinkedIn, Indeed, StepStone) are deliberately not scanned - that is a
          product stance, see <a routerLink="/docs/legality">source legality</a>.
        </li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/discover-sources.png - the Sources drawer: built-in toggles, the
            add-ATS-board form, an added RSS feed with its last-scan line.
          </p>
        </div>
        <figcaption>The Sources drawer.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="triage" class="docs__h2">2. Scan and triage</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          Hit <strong>Scan</strong>. Everything fetched is filtered locally: title keywords (derived
          from your target roles until you customize them per source), your geographic scope, and
          dedupe against jobs you already have.
        </li>
        <li>
          Triage the feed: each row shows role, company, source, location, age, matched keywords,
          and a NEW pill. Filter by text, source, work type (remote / hybrid / onsite), and a region
          - country - city location tree built from what the scan actually found.
        </li>
        <li>
          Click a row for the <strong>full-screen detail</strong>: the parsed description, a
          keyword-fit ring (deterministic, 0 tokens), and "Score with AI" if you want the real
          recruiter check.
        </li>
        <li>
          <strong>Save</strong> moves the job into My Jobs; <strong>Dismiss</strong> hides it
          forever (with an inline Undo). <strong>Apply now</strong> opens the original posting in
          your browser - submitting stays yours.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/discover-detail.png - the full-screen job detail: hero with match
            chip, parsed JD blocks, keyword-fit ring sidebar.
          </p>
        </div>
        <figcaption>Discover's job detail with the fit ring.</figcaption>
      </figure>
    </section>
  `,
})
export class GuideDiscover {}

/* ------------------------------------------------------- Pipeline & Tracker */
@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="track">Track: Pipeline, Tracker, follow-ups</h1>
    <p class="docs__lede">
      Two views of the same truth: the Pipeline kanban for what is moving, the Job Tracker table for
      the full record - including the report you may need for the Agentur für Arbeit.
    </p>

    <section class="docs__section">
      <h2 id="pipeline" class="docs__h2">Pipeline (kanban)</h2>
      <ul class="docs__list">
        <li>
          Active applications move across <strong>applied / interview / offer</strong> by drag and
          drop; every status change is dated automatically.
        </li>
        <li>
          Rejected and cancelled collapse into side rails so the board stays about what is alive;
          expand them any time.
        </li>
        <li>A summary strip shows active count, overdue count, and a search box.</li>
        <li>
          Click a card for the <strong>quick view</strong>: status, match score, the interview stage
          stepper, and - when an application is overdue - a <strong>follow-up draft</strong>
          you can copy. Applye never sends mail.
        </li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">GIF</span>
          <p>
            PLACEHOLDER: guide/pipeline-drag.gif - dragging a card from applied to interview, the
            status pill updating, then opening the quick-view modal.
          </p>
        </div>
        <figcaption>The board in motion.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="tracker" class="docs__h2">Job Tracker (table)</h2>
      <ul class="docs__list">
        <li>
          Six essential columns by default; the other fourteen plus
          <strong>your own custom columns</strong> live in the Columns drawer.
        </li>
        <li>Rows are read-only until you hit Edit - then the row itself becomes the form.</li>
        <li>Archive keeps old applications out of the active view but inside the report.</li>
      </ul>
      <h3 id="report" class="docs__h3">The exportable report</h3>
      <ol class="docs__list docs__list--ol">
        <li>Click <strong>Export report</strong> - a preview opens first, always.</li>
        <li>
          Pick the format: <strong>Germany</strong> (the official Eigenbemühungen document, in
          German, with letterhead) or <strong>International</strong> (English).
        </li>
        <li>Pick A4 portrait or landscape, and whether extra columns are cut to fit or wrapped.</li>
        <li>
          <strong>Save as PDF</strong> (exactly what the preview shows) or
          <strong>Save as CSV</strong>, via the native save dialog.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/tracker-report.png - the report preview modal in Germany format:
            letterhead, applicant, period, table - with the format and orientation controls visible.
          </p>
        </div>
        <figcaption>The Eigenbemühungen report, previewed before saving.</figcaption>
      </figure>
    </section>
  `,
})
export class GuideTrack {}

/* ------------------------------------------------ Interview Prep & Analytics */
@Component({
  standalone: true,
  template: `
    <h1 class="docs__h1" id="insights">Interview Prep &amp; Analytics</h1>
    <p class="docs__lede">
      Keep every interview round in one timeline, and let your own data tell you how the search is
      going. Both screens are 0-token: plain code over your local database.
    </p>

    <section class="docs__section">
      <h2 id="prep" class="docs__h2">Interview Prep</h2>
      <ol class="docs__list docs__list--ol">
        <li>
          The list shows every application you are interviewing for, with the next date on top.
        </li>
        <li>
          Open one for the <strong>stage timeline</strong>: each round is a card with its type,
          date, interviewer, notes, and a colour-coded status you change in place.
        </li>
        <li>
          Add or edit stages in a small modal; reorder them; remove an application from prep without
          touching the job itself.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/interview-timeline.png - a detail page with three stage cards
            (screening done, technical upcoming, final planned) on the timeline rail.
          </p>
        </div>
        <figcaption>One application, every round.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="analytics" class="docs__h2">Analytics</h2>
      <p>Pick a period (30 days / 90 days / all time) and read:</p>
      <ul class="docs__list">
        <li>
          <strong>Four counters</strong> - applications, response rate, interviews, offers, each
          with a trend vs the previous period.
        </li>
        <li>
          <strong>The funnel</strong> - saved to applied to interviewing to offer, with conversion
          at each step and rejections tracked as leakage.
        </li>
        <li>
          <strong>Applications over time</strong> - your volume, with follow-up activity overlaid.
        </li>
        <li>
          <strong>Match-score distribution</strong> and <strong>score vs outcome</strong> - are you
          applying to well-matched roles, and do higher-fit ones actually get further?
        </li>
        <li>
          <strong>Time to response</strong>, <strong>pipeline aging</strong> (stalled past 14 days
          gets flagged), and <strong>where you are applying</strong>.
        </li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/analytics.png - the Analytics screen with counters, funnel, and the
            over-time chart visible in one frame.
          </p>
        </div>
        <figcaption>Your search, measured locally.</figcaption>
      </figure>
      <p>
        With few applications it shows honest raw counts instead of misleading percentages; no
        external benchmarks, ever.
      </p>
    </section>
  `,
})
export class GuideInsights {}

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
          <strong>API mode</strong> - paste your own key for Anthropic Claude, OpenAI, Google
          Gemini, or DeepSeek. Keys are stored in the OS keychain, never in the database or logs.
        </li>
        <li>
          <strong>CLI mode</strong> - bridge a coding CLI you already subscribe to (Claude Code,
          Codex, Gemini CLI) instead of paying per token.
        </li>
        <li>
          A privacy note under every cloud provider states plainly what an API call sends (the job
          text and relevant profile fields) - see <a routerLink="/docs/guide/score">scoring</a> for
          when calls happen.
        </li>
      </ol>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/settings-ai.png - the AI section with a provider selected, the key
            field (redacted), and the privacy note visible.
          </p>
        </div>
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
})
export class GuideSettings {}
