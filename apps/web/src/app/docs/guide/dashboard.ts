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
      <img
        src="/guide/dashboard-full.png"
        width="2880"
        height="1800"
        loading="lazy"
        decoding="async"
        alt="The Dashboard on a working day. Four counters read four active applications, one
          upcoming interview, one overdue follow-up and one offer. Three needs-attention cards of
          different kinds follow: a follow-up with Kestrel Analytics four days overdue offering to
          draft a nudge, an interview with Northlane Systems in 22 hours offering preparation, and a
          score that went stale because the profile changed after it was generated. Below them sit
          the upcoming interview and a list of recent jobs with their statuses."
      />
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
        <img
          src="/guide/dashboard-empty.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The same Dashboard on a quiet day. The counters still read four active applications,
            one upcoming interview and one offer, but overdue follow-ups is zero and the attention
            queue has been replaced by a single panel: You're all caught up, nothing needs your
            attention right now, paste a new job description when you're ready for the next one. The
            upcoming interview and the recent jobs list carry on below."
        />
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideDashboard {}

/* ----------------------------------------------------------------- Profile */
