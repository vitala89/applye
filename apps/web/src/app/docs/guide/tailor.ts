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
      <video
        src="/guide/tailor-wizard.mp4"
        width="1440"
        height="900"
        controls
        muted
        playsinline
        preload="metadata"
        aria-label="A silent screen recording of the apply wizard on a scored job. Step two runs
          three passes in turn - rewrite, HR critique, build - then lists every change it made, each
          one a concrete rewrite of a CV bullet rather than a summary. Step four opens Review
          documents, with the generated CV and cover letter side by side and the final ATS, HR
          critique and fit checks still unrun."
      ></video>
      <figcaption>From scored job to generated documents.</figcaption>
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
        <img
          src="/guide/gap-dialog.png"
          width="1156"
          height="698"
          loading="lazy"
          decoding="async"
          alt="The gap-fill dialog, question one of two. It asks how the applicant typically handles
            tight deadlines and unplanned release pressure, and states plainly why it is asking: the
            job emphasises stress-resistance and willingness to work beyond standard hours. Below is
            an empty answer box reading Type your answer, or Skip, with a Skip button beside Next."
        />
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideTailor {}

/* ---------------------------------------------------------------- Discover */
