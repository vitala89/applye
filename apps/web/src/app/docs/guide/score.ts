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
        <li>Click <strong>Score this job</strong>. One opt-in call runs; the result is cached.</li>
        <li>
          You get a <strong>percentage match</strong> gauge, a per-dimension breakdown, the
          <strong>keywords you are missing</strong>, <strong>red flags</strong> a screener would
          catch, and "before you submit" notes.
        </li>
      </ol>
      <figure class="docs__media">
        <img
          src="/guide/score-result.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The lower half of a scored job in Applye. A Language Requirements dimension scores 60
            per cent and explains that the role wants German B2 while the profile states B1. Below
            it, a missing-keywords panel shows one chip reading German B2 (candidate is B1), an ATS
            check reports the CV is likely to pass a scan, and three red flags list the language
            gap, an undisclosed notice period and achievements that do not evidence two of the job's
            specifics. A before-you-submit list turns each into an action, and a footer offers to
            tailor an application against the job."
        />
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideScore {}

/* ------------------------------------------------------------------ Tailor */
