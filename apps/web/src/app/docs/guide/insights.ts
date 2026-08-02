import { ChangeDetectionStrategy, Component } from '@angular/core';

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
        <img
          src="/guide/interview-timeline.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="One application's interview timeline: three stages, one upcoming. A numbered rail
            runs down the left. Stage one, a screening call with HR held in July, is marked passed.
            Stage two, a technical round in August, is scheduled. Stage three, the final
            conversation, has no date and is awaiting scheduling. Each row can be reordered, edited
            or deleted, and Add stage sits above them."
        />
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
        <img
          src="/guide/analytics.png"
          width="2360"
          height="1816"
          loading="lazy"
          decoding="async"
          alt="The Analytics screen over the last 90 days. Four counters read five applications sent,
            a 60 per cent response rate, three interviews and one offer. An application funnel below
            them steps from eight saved to five applied, three interviewing and one offer, with the
            conversion between each pair on the right and a leakage row showing one rejection. A
            weekly chart of applications over time runs along the bottom."
        />
        <figcaption>Your search, measured locally.</figcaption>
      </figure>
      <p>
        With few applications it shows honest raw counts instead of misleading percentages; no
        external benchmarks, ever.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideInsights {}

/* ---------------------------------------------------------------- Settings */
