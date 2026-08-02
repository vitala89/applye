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
      <video
        src="/guide/paste-job.mp4"
        width="1440"
        height="900"
        autoplay
        loop
        muted
        playsinline
        preload="metadata"
        aria-label="A silent screen recording. The Paste Job dialog opens over the Dashboard, a job
          description is pasted in and analysed, and the app lands on the parsed job: title, a
          location line, employment type, and a legitimacy panel that has passed the hard filter but
          flags two suspicious signals - no company name in the posting, and a salary range wide
          enough to be implausible."
      ></video>
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
        <img
          src="/guide/my-jobs-table.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The My Jobs table listing eight roles with columns for company, role, score, status,
            legitimacy, date added and source. Two rows carry a score, 72 and 82, and the rest read
            Not scored. Statuses run from saved through applied, interview, offer and rejected. One
            posting is flagged red and two amber in the legitimacy column, while the rest show a
            neutral dot. Filters for status, legitimacy and a minimum score sit above the table."
        />
        <figcaption>My Jobs: the working list.</figcaption>
      </figure>
      <p>
        Duplicate pastes are recognized by content hash and never create a second row. Next:
        <a routerLink="/docs/guide/score">score the role</a>.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideAddJob {}

/* ------------------------------------------------------------------- Score */
