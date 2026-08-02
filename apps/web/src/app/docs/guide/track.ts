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
        <video
          src="/guide/pipeline-drag.mp4"
          width="1440"
          height="900"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          aria-label="A silent screen recording of the Pipeline board. A card is dragged out of the
            applied column and dropped into interview, and the quick-view modal opens on it: status
            now interview, the score beside it, priority and the stage log, with an empty date field
            and buttons to skip the interview stage or add it."
        ></video>
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
        <img
          src="/guide/tracker-report.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The report preview dialog. Controls across the top set the applicant name, the report
            format (Germany, Eigenbemühungen), the orientation (A4 portrait) and how columns fit,
            with buttons to save as PDF or CSV. A notice says two columns do not fit A4 portrait and
            are hidden. The preview below is the German document: Nachweise über
            Bewerbungsbemühungen, to be presented to the Agentur für Arbeit, with the applicant, the
            period, and five applications with German column headings and statuses."
        />
        <figcaption>The Eigenbemühungen report, previewed before saving.</figcaption>
      </figure>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideTrack {}

/* ------------------------------------------------ Interview Prep & Analytics */
