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
        <img
          src="/guide/profile-filled.png"
          width="1758"
          height="2304"
          loading="lazy"
          decoding="async"
          alt="The profile form filled in. A contact block holds the name shown on generated
            documents, first and last name, current role, location, email, phone, website and
            LinkedIn. Below it the Experience section is expanded with two positions, each carrying
            a role, company, location, a date range and bullets written as measurable outcomes:
            rebuilding a console used by 12,000 accounts, cutting a bundle from 1.9 MB to 640 KB,
            cutting CI from 22 to 7 minutes. Collapsed Skills and Languages rows sit at the bottom,
            showing twelve skills and three languages."
        />
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
        <img
          src="/guide/profile-archetypes.png"
          width="1856"
          height="1336"
          loading="lazy"
          decoding="async"
          alt="The Target roles section of the profile, holding three roles. Senior Frontend Engineer
            is marked Primary and fits when the role owns a product surface end to end. Frontend
            Platform Engineer is Secondary and fits a team running a design system or a monorepo. UI
            Engineer is Adjacent and fits when the work is closer to craft than architecture and the
            pay band still clears the target. A note above says the roles flag off-target jobs
            before any scoring call, at zero tokens."
        />
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
        <video
          src="/guide/profile-regenerate.mp4"
          width="1440"
          height="900"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          aria-label="A silent screen recording of the Profile page. The scoring profile card is
            regenerated: it reads 'Compressing profile' while it works, then fills in with what the
            app caches for scoring - the name and seniority line, a row of strengths, and the notes
            the model made about what the profile does not say - above a footer reading cached, 0
            tokens, with the token counts of the run that produced it."
        ></video>
        <figcaption>Regenerating the scoring profile.</figcaption>
      </figure>
      <p>
        You can also <strong>import a CV as a PDF</strong> (Dashboard quick action) to seed the
        profile instead of typing from scratch. AI setup itself lives in
        <a routerLink="/docs/guide/settings">Settings</a>.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideProfile {}

/* ----------------------------------------------------------- Add first job */
