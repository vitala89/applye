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
      <img
        src="/guide/documents-library.png"
        width="2880"
        height="1800"
        loading="lazy"
        decoding="async"
        alt="The Documents page on the CV tab, with a Cover Letter tab beside it and Import CV and
          Generate baseline as the two ways in. Two documents are listed: a tailored CV named after
          the job it was written for, tagged generic and English, with a line underneath recording
          which application it is linked to; and an imported CV under the applicant's own name,
          tagged DE and English. Each row carries duplicate, export and delete controls."
      />
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
        <video
          src="/guide/cv-import.mp4"
          width="1440"
          height="900"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          aria-label="A silent screen recording. The Import your CV dialog opens over the Documents
            page, noting that a PDF or DOCX is parsed locally and that the parse can be reviewed
            section by section. It works, then reports that the CV was imported and saved to the
            library, and the new document appears in the list."
        ></video>
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
        <img
          src="/guide/cv-editor.png"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
          alt="The CV editor, scrolled to the section stack. Personal details is open with the
            applicant's name, title, email, phone, city and links, and a Pull from profile button
            above them. Summary follows, holding an editable paragraph. Experience follows that,
            with a role, employer, start year, an empty end date labelled blank equals present, and
            four bullet points, each removable. Every movable section carries a drag handle on the
            left and regenerate and reorder controls on the right."
        />
        <figcaption>Section-level control, one section at a time.</figcaption>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideDocuments {}

/* ------------------------------------------------------- Pipeline & Tracker */
