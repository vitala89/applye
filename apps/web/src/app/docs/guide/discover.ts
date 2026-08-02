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
      <video
        src="/guide/discover-scan.mp4"
        width="1440"
        height="900"
        autoplay
        loop
        muted
        playsinline
        preload="metadata"
        aria-label="A silent screen recording. Discover shows an empty inbox, Scan is pressed, and
          the scan console appears for a moment with the line 'scan started · 1 sources' above the
          source being read. The console then collapses into the summary strip - LAST SCAN, 8 NEW, 0
          FILTERED, 0 TOKENS - and the feed fills with eight openings, each carrying a NEW pill, a
          target-role label and the keywords that matched."
      ></video>
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
        <img
          src="/guide/discover-sources.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The Sources drawer open over the Discover inbox. Built-in sources are listed with a
            toggle each, most idle and off, one enabled and showing its last scan: 96 new at 5:20 PM.
            Below them a company boards section offers to add an ATS board, then a user-added RSS
            feed with its own toggle, and a form to add another source by URL and name. A note under
            the form states that Applye only reads public, machine-readable feeds and never signs in
            or scrapes closed boards."
        />
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
        <img
          src="/guide/discover-detail.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="A Discover opening opened full screen. The header shows the feed it came from, an 89
            per cent match chip, the role, a Primary role badge, the company, the location and the
            matched words. The description is broken into readable blocks. A sidebar scores the raw
            keyword fit at 89 with the note that the saved profile already lines up and no tailoring
            is needed, marks the compensation as in your range, and lists the source, location and
            posting date. An Apply now button is captioned: Applye opens the original posting in
            your browser, it never submits anything on your behalf."
        />
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
        <img
          src="/guide/discover-badges.png"
          width="2360"
          height="1206"
          loading="lazy"
          decoding="async"
          alt="Four rows of the Discover feed. Under a For you heading, two roles are labelled
            Primary role and one Web Platform Engineer is labelled Secondary role; each row carries
            a NEW pill, the feed it came from, its location, and the words that matched. Below, a
            More openings heading holds a row with no role label, which is how the feed shows an
            opening that did not match any target role."
        />
        <figcaption>Three tiers, at a glance.</figcaption>
      </figure>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideDiscover {}

/* --------------------------------------------------------------- Documents */
