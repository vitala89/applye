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
      <video
        src="/guide/tour-walkthrough.mp4"
        width="1264"
        height="788"
        controls
        muted
        playsinline
        preload="metadata"
        aria-label="A silent screen recording of the whole first run, all six steps: the welcome
          screen, the AI setup that offers either a pasted API key or a CLI you already pay for,
          bringing in a resume by upload or pasted text or skipping it, the review screen showing
          the name, contact details, experience and skills that were pulled out of that resume, the
          targeting screen where suggested roles and a compensation range are confirmed, and the
          summary of what finishing will save on the device."
      ></video>
      <figcaption>First launch, start to finish.</figcaption>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideTour {}

/* --------------------------------------------------------------- Dashboard */
