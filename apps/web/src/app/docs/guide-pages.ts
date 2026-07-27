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
        <img
          src="/guide/onboarding.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The Applye onboarding wizard on step two of six, AI setup. Two cards offer either
            pasting an API key or bridging a CLI you already pay for, Claude Code or Codex. Below
            them, provider cards for Claude and DeepSeek, then a key field showing only a masked
            placeholder and a note that a key is already stored in the OS keychain. A warning across
            the bottom reads that this step can be skipped, but analysis, tailoring and interview
            prep stay disabled until a key is added, with a Skip button beside Back and Continue."
        />
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
        <img
          src="/guide/sidebar.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The Applye window in dark theme. The left sidebar lists Dashboard and Discover, then a
            Workspace group with My Jobs, Pipeline, Interview Prep, Job Tracker, Documents and
            Analytics, then a System group with Settings, and a local profile card pinned to the
            bottom. The Dashboard fills the rest: four counters reading four active applications,
            one upcoming interview, one overdue follow-up and one offer, an overdue follow-up card,
            a scheduled technical round and a list of recent jobs with their statuses."
        />
        <figcaption>Home: sidebar plus Dashboard.</figcaption>
      </figure>
    </section>
  `,
})
export class GuideTour {}

/* --------------------------------------------------------------- Dashboard */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="dashboard">The Dashboard</h1>
    <p class="docs__lede">
      The screen you land on. It answers one question - what needs you today - and nothing else. All
      of it is computed from your local database at 0 tokens.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">SCREENSHOT</span>
        <p>
          PLACEHOLDER: guide/dashboard-full.png - the Dashboard with all four KPI tiles populated,
          three or four "needs attention" cards of different kinds, and an upcoming interview in the
          right column. Dark theme, 1440px wide window.
        </p>
      </div>
      <figcaption>The Dashboard on a working day.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="kpis" class="docs__h2">The four counters</h2>
      <ul class="docs__list">
        <li><strong>Active applications</strong> - everything still alive in the pipeline.</li>
        <li><strong>Upcoming interviews</strong> - scheduled rounds ahead of today.</li>
        <li>
          <strong>Overdue follow-ups</strong> - applications past their follow-up date with no reply
          recorded.
        </li>
        <li><strong>Offers</strong> - the ones that made it all the way.</li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="attention" class="docs__h2">Needs attention</h2>
      <p>
        The queue below the counters is generated, not curated. Each card states the fact and offers
        exactly one action:
      </p>
      <ul class="docs__list">
        <li>
          <strong>Follow up with {{ '{' }}company{{ '}' }}</strong> - shows how many days overdue,
          and drafts a short follow-up you copy and send yourself.
        </li>
        <li>
          <strong>Resume tailoring</strong> - an apply-wizard session you left unfinished, reopened
          at the exact step you stopped on.
        </li>
        <li>
          <strong>Interview in N days</strong> - jumps into
          <a routerLink="/docs/guide/insights">interview prep</a> for that application.
        </li>
        <li>
          <strong>Score is stale</strong> - you edited your profile after this job was scored, so
          the old verdict no longer reflects your profile. Re-score deliberately, or ignore it.
        </li>
        <li>
          <strong>Elevator pitch is out of date</strong> - same idea, for the pitch on your profile.
        </li>
        <li>
          <strong>Profile N% complete</strong> - the missing fields, with a link to fill them in.
        </li>
      </ul>
      <p>
        When there is genuinely nothing to do, the queue says so instead of inventing busywork. On a
        fresh install it shows two onboarding cards instead: complete your profile, and add your
        first job.
      </p>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/dashboard-empty.png - the "You're all caught up" empty state, so the
            docs show both the busy and the quiet day.
          </p>
        </div>
        <figcaption>A quiet day says so.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="quick" class="docs__h2">Quick actions</h2>
      <p>
        <strong>Paste job</strong> starts <a routerLink="/docs/guide/add-job">adding a job</a> from
        anywhere, and <strong>Import CV</strong> seeds your
        <a routerLink="/docs/guide/profile">profile</a> from an existing PDF or DOCX rather than
        making you type it out.
      </p>
    </section>
  `,
})
export class GuideDashboard {}

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
      <p>
        The profile is a structured form: <strong>Experience</strong>, <strong>Skills</strong>,
        <strong>Languages</strong> and <strong>Education</strong> are separate sections with real
        fields, not one free-text box. Contact details (name, email, phone, location) flow straight
        into generated documents, so fill them once and correctly.
      </p>
      <p>
        Specifics beat adjectives everywhere in this form. "Cut p95 checkout latency from 900ms to
        260ms" is material a tailoring pass can reuse; "results-driven professional" is not.
      </p>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/profile-filled.png - the Profile page in Form mode: contact block,
            two experience entries expanded, the skills and languages sections visible.
          </p>
        </div>
        <figcaption>The structured profile form.</figcaption>
      </figure>
      <p>
        If you would rather not type it all: paste your existing CV text and hit
        <strong>Parse text</strong>. One AI call turns free text into structured fields and shows
        you a <em>Recognized profile</em> preview, with a "please double-check" list of anything it
        was unsure about. Nothing is written until you press <strong>Apply to form</strong>; you can
        discard the whole thing instead. Importing a PDF or DOCX CV outright is also possible from
        the Dashboard's Import CV action.
      </p>
    </section>

    <section class="docs__section">
      <h2 id="target-roles" class="docs__h2">Target roles (archetypes)</h2>
      <p>
        Up to five short descriptions of positions you would actually accept. Each one has three
        parts:
      </p>
      <ul class="docs__list">
        <li><strong>Role</strong> - the name, as concrete as you can make it.</li>
        <li>
          <strong>Fit</strong> - <em>primary</em>, <em>secondary</em>, or <em>adjacent</em>. This is
          the tier that shows up as a badge on every Discover row.
        </li>
        <li>
          <strong>When it fits</strong> - the situation in which you would pitch yourself as this.
        </li>
      </ul>
      <p>
        Target roles do real work at zero token cost: they flag off-target jobs before any AI is
        called, they feed the archetype-fit badges and the For-you ordering in
        <a routerLink="/docs/guide/discover">Discover</a>, and they seed Discover's default keyword
        filters. Matching is anchored on distinctive words, so a generic word like "engineer" alone
        never produces a match. With no target roles defined, no badge is shown at all rather than a
        guessed one.
      </p>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/profile-archetypes.png - the Target roles section with three cards:
            one primary, one secondary, one adjacent, each with its "when it fits" line filled in.
          </p>
        </div>
        <figcaption>Three target roles, three fit tiers.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="compensation" class="docs__h2">Compensation target</h2>
      <p>
        Set your target salary range (gross) and Applye compares every posting that states pay
        against it, showing one of three badges: <strong>Above your target</strong>,
        <strong>In your range</strong>, or <strong>Below your target</strong>. Postings with no
        stated salary say exactly that instead of guessing. The comparison is plain arithmetic - no
        AI, no tokens.
      </p>
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
            PLACEHOLDER: guide/discover-detail.png - the full-screen job detail: hero with the
            archetype-fit badge and salary badge, parsed JD blocks, keyword-fit ring sidebar.
          </p>
        </div>
        <figcaption>Discover's job detail with the fit ring.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="badges" class="docs__h2">3. Reading the badges</h2>
      <p>
        Every row and every detail hero carries badges that are computed by plain code from your
        profile - no model is asked, and nothing is invented:
      </p>
      <ul class="docs__list">
        <li>
          <strong>Archetype fit</strong> - <em>Primary role</em>, <em>Secondary role</em>, or
          <em>Adjacent role</em>, matched from the
          <a routerLink="/docs/guide/profile">target roles</a> in your profile. Feed rows match on
          the job title alone, so the badge appears before the full description is even loaded.
        </li>
        <li>
          <strong>Salary fit</strong> - above, within, or below the compensation range on your
          profile, and "salary not stated" when the posting says nothing.
        </li>
        <li><strong>NEW</strong> for first-seen postings, <strong>SAVED</strong> once saved.</li>
      </ul>
      <p>
        The <strong>For you</strong> section is ordered by that fit tier, and the tier feeds the
        deterministic 0-token score behind the ordering. If you have not defined any target roles,
        no badge is shown at all - an honest blank rather than a guess.
      </p>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/discover-badges.png - a close crop of three feed rows showing all
            three archetype tiers side by side, plus one salary badge and one NEW pill.
          </p>
        </div>
        <figcaption>Three tiers, at a glance.</figcaption>
      </figure>
    </section>
  `,
})
export class GuideDiscover {}

/* --------------------------------------------------------------- Documents */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="docs__h1" id="documents">Documents: your CV and cover-letter library</h1>
    <p class="docs__lede">
      Every CV and cover letter Applye touches lives here, in two tabs. This is a real editor, not
      an export folder: you can build a CV from scratch, import your existing one, restyle it
      section by section, and export a PDF that matches the preview exactly.
    </p>

    <figure class="docs__media">
      <div class="docs__mediabox">
        <span class="docs__mediatag">SCREENSHOT</span>
        <p>
          PLACEHOLDER: guide/documents-library.png - the Documents page on the CV tab with three or
          four CVs, one carrying the "Default" badge and one the "Tailored" badge.
        </p>
      </div>
      <figcaption>The library: CV tab and Cover Letter tab.</figcaption>
    </figure>

    <section class="docs__section">
      <h2 id="cvs" class="docs__h2">Getting a CV into the library</h2>
      <ul class="docs__list">
        <li>
          <strong>Import CV</strong> - pick a DOCX or PDF. It is read locally, then a single AI call
          detects the sections. You get a summary of what was found (experience entries, education,
          skills) plus a "double-check these" list of anything it was unsure about, before it is
          saved.
        </li>
        <li>
          <strong>Generate baseline</strong> - build a CV from your
          <a routerLink="/docs/guide/profile">profile</a> for a given market and role archetype. No
          job description needed.
        </li>
        <li>
          <strong>Tailored CVs</strong> - produced by the
          <a routerLink="/docs/guide/tailor">apply wizard</a> and filed here automatically, labelled
          by company and role.
        </li>
        <li><strong>Duplicate</strong> - fork any CV before an experiment you might regret.</li>
      </ul>
      <p>
        One CV carries the <strong>Default</strong> badge: that is the one used as the base when
        nothing else is specified. Drafts stay invisible until you export or mark the application as
        applied, so the library never fills up with half-finished attempts.
      </p>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">GIF</span>
          <p>
            PLACEHOLDER: guide/cv-import.gif - choosing a PDF, the "Reading and parsing…" state, the
            found-sections summary with the low-confidence list, then "Save to library".
          </p>
        </div>
        <figcaption>Import shows its work before saving.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="editor" class="docs__h2">The CV editor</h2>
      <p>A CV is a stack of sections you control individually:</p>
      <ul class="docs__list">
        <li>
          <strong>Sections</strong> - photo, personal details, summary, experience, education,
          skills, languages. Drag to reorder, or move a section up and down from its menu.
        </li>
        <li>
          <strong>Per-section style</strong> - each section can inherit the common style or override
          it, with a one-click reset back to common. This is how you get a dense skills block under
          an airy summary without fighting a template.
        </li>
        <li>
          <strong>Templates</strong> - start from a template, or save your current arrangement as
          your own named template for the next role.
        </li>
        <li>
          <strong>Photo</strong> - optional, with upload, crop, zoom, and left / centre / right
          placement. The editor warns you plainly: a photo is standard on German CVs, but ATS
          parsers in other markets can reject or misread it.
        </li>
        <li>
          <strong>Font warnings</strong> - pick a font an ATS may not read reliably and the editor
          says so, and names the safe alternatives.
        </li>
      </ul>
      <figure class="docs__media">
        <div class="docs__mediabox">
          <span class="docs__mediatag">SCREENSHOT</span>
          <p>
            PLACEHOLDER: guide/cv-editor.png - the CV detail view: section list on one side with a
            drag handle visible, live document preview on the other, one section showing its style
            override controls.
          </p>
        </div>
        <figcaption>Section-level control, with the preview alongside.</figcaption>
      </figure>
    </section>

    <section class="docs__section">
      <h2 id="cover-letters" class="docs__h2">Cover letters</h2>
      <p>
        The Cover Letter tab holds letters as structured fields rather than a blob of text:
        recipient, company, street, postal code, city, country, date, subject, greeting, numbered
        body paragraphs, closing, and signature. That is what makes a German
        <em>Anschreiben</em> come out with the right shape.
      </p>
      <ul class="docs__list">
        <li>
          <strong>Draft with AI</strong> writes the body from the job and your profile; regenerate
          any time, or edit a single paragraph by hand.
        </li>
        <li>A live word count keeps you honest about length.</li>
        <li>
          Letters generated by the apply wizard are linked to their application, so the job page can
          open the exact letter you sent.
        </li>
      </ul>
    </section>

    <section class="docs__section">
      <h2 id="export" class="docs__h2">Exporting</h2>
      <p>
        Export is <strong>PDF</strong>, and only PDF: the page you see in the preview is the page
        that gets written, down to the millimetre margins. One rendering engine means there is no
        second format that quietly disagrees with the preview about where a page breaks or how a
        photo sits.
      </p>
      <p>
        It goes through the native save dialog, so the file lands where you chose and nowhere else.
        Deleting a document removes it from the library and cannot be undone - there is no server
        copy to recover.
      </p>
    </section>
  `,
})
export class GuideDocuments {}

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
})
export class GuideSettings {}
