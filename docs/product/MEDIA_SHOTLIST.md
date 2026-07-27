# Media shot list for applye.dev

Every visual slot on the website, in one place. Each row is a dashed placeholder box that ships
today; dropping the real file into `apps/web/public/<path>` and swapping the box for an `<img>` or
`<video>` (keeping the `<figcaption>`) is all that is needed.

## Capture rules

Keep these identical across every shot, or the docs will look assembled from three different apps.

- **Theme**: dark theme for everything, since that is the app default and the site default. One
  light-theme shot is allowed on `guide/sidebar.png` if you want to show the toggle exists.
- **Window size**: 1440x900 logical pixels, captured at 2x (so 2880x1800 files). Do not capture a
  maximised 4K window - the UI density looks wrong when scaled down.
- **File format**: PNG for stills, MP4 (H.264) for video, GIF only where the file stays under
  ~3 MB, otherwise use a silent looping MP4.
- **Length**: GIF 5-12 s, short video 60-90 s, the tour video 2-3 min.
- **Content**: seed a demo profile and 6-10 realistic jobs. No real recruiter names, no real
  company contacts, no real email addresses, and no visible API key - the settings shot must show a
  redacted field.
- **Cropping**: full window including the sidebar for orientation shots; tight crops for detail
  shots (badges, dialogs), with at least 24 px of padding around the subject.
- **Naming**: exactly the file name in the table. The placeholder text in the code names it too.

## Still open

One guide slot. Everything else on the guide is captured; see "Already produced".

| Slot                      | Page                   | Type | What to capture                                                            |
| ------------------------- | ---------------------- | ---- | -------------------------------------------------------------------------- |
| `guide/discover-scan.mp4` | `/docs/guide/discover` | GIF  | Scan running: console lines per source, collapsing into the summary strip. |

**A take exists and was rejected, so re-shoot it deliberately.** Scanning the built-in sources
returns real openings from real German employers, and those companies and their job titles fill the
feed on screen. No frame in this documentation may carry a real employer, recruiter or contact. To
capture this honestly, scan only a user-added source pointing at a reserved example domain, or stop
the recording before results land and show the console alone.

## Priority 3 - marketing surfaces

| Slot                         | Page         | Type    | What to produce                                                             |
| ---------------------------- | ------------ | ------- | --------------------------------------------------------------------------- |
| `press/applye-press-kit.zip` | `/press`     | ARCHIVE | Wordmark SVGs (light and dark), app icon, 2-3 approved product screenshots. |
| `manifesto-signature.png`    | `/manifesto` | IMAGE   | Handwritten-style signature scan, transparent background.                   |
| Press logo strip             | `/press`     | SVG set | Greyscale outlet logos linked to the articles, once coverage exists.        |

## Already produced

All ten below were captured 2026-07-28 by the maintainer, on the seeded demo database, at 1440x900
logical. Stills are 2x; the recordings are 1x, which keeps them small and costs nothing visible
since a video is scaled to the column anyway.

**Every GIF slot shipped as a silent looping MP4 instead**, which the capture rules already allow as
the fallback above ~3 MB. They are marked up as `<video autoplay loop muted playsinline>`, so they
behave like the GIF the slot asked for. None of them carries narration.

- `guide/tour-walkthrough.mp4` - **shorter and narrower than the slot asked for, deliberately
  shipped anyway.** The slot wants a narrated 2-3 minute tour of every sidebar section; this is 18
  silent seconds of first run only: provider setup, the offer to read an existing CV, and the fields
  it pulled out for confirmation. It is honest about what it shows, but it is not yet the tour, and
  the docs page still promises one. Re-record before launch.
- `guide/tailor-wizard.mp4` - 36 s against a 60-90 s slot. Covers the three tailoring passes, the
  list of concrete changes, and Review documents. **Stops before Export & Apply**, so the native save
  dialog and the resulting PDF - the part the caption used to promise - are absent. The caption was
  changed to "From scored job to generated documents" rather than leave a claim the video does not
  support.
- `guide/paste-job.mp4` - 8 s, paste to parsed job. The parsed result lands with the legitimacy panel
  flagging two real signals on the seeded posting: no company name, and an implausibly wide salary
  range. Nothing was staged to produce them.
- `guide/cv-import.mp4` - 6 s, importing `tools/capture/mira-cv.html` converted to DOCX. See the CV
  source note below.
- `guide/pipeline-drag.mp4` - 3 s against a 5-12 s floor. The drag and the quick-view modal are both
  there, but it loops fast enough to read as a flicker. Worth re-recording with pauses.
- `guide/profile-regenerate.mp4` - 2.2 s, well under the floor and the weakest asset shipped. The
  scoring card is regenerated and fills in, but the pulse state the slot asks for is gone before a
  viewer can see it.
- `guide/documents-library.png` - **two documents, not the three or four the slot asks for, and no
  Default badge on either.** Shows a tailored CV named after its job with a "Linked to" line, and an
  imported CV under the applicant's name. Two further deviations, both because of how the app
  behaves: there is no "Tailored" badge anywhere in the app - `cv-list.component.html` renders only
  region, language and Default - and a tailored document is instead recognisable by its label and its
  linked-application line. Duplicating the imported CV twice and marking one Default would fill the
  list out; it is free, no AI call, and was simply not done.
- `guide/cv-editor.png` - the section stack with Personal details, Summary and Experience open, drag
  handles and per-section controls visible. **Two deviations from the slot, both because the app does
  not work the way the slot assumed:** the preview is a mode that replaces the editor, not a panel
  beside it (`cv-detail.component.html` renders `editor-col` or `preview-col`, never both), and there
  are no section-level style overrides at all - style is one document-wide block. The caption was
  changed from "with the preview alongside" to "one section at a time".
- `guide/gap-dialog.png` - a tight crop, 1156x698, cut from the full-window frame. Question one of
  two, with the reason it is being asked. **The save-to-profile toggle is not on this dialog**; it
  lives on a separate confirmation dialog after the last question, so the slot's description of one
  screen covers two. Shipping only the question was a deliberate choice.
- `guide/interview-timeline.png` - three stages in three different states: screening passed,
  technical scheduled, final awaiting scheduling. Reach this page from My Jobs, not from Interview
  Prep: in Interview Prep a row click opens a menu whose only entry deletes the application, a defect
  recorded in `CURRENT_STATE.md`.
- CV source for the import: `tools/capture/mira-cv.html`, converted with
  `textutil -convert docx`. It exists because the Documents library cannot be seeded - the only ways
  a row reaches `document_library` are importing a file, generating a baseline, or finishing the
  apply wizard, and the first two are AI calls. Writing rows straight into the database would put it
  in a state no user could reach. The content is the same invented person as `PROFILE_MD` in
  `seed.mjs`, word for word where they overlap.

- `guide/dashboard-empty.png` - captured 2026-07-27. The quiet state was produced by clearing the
  actual reasons for each card - the follow-up date, the imminent interview, the cached scores -
  on a database snapshot taken first, then restoring it. Nothing about the screen was mocked, and
  the busy state it was taken from is intact.
- `guide/discover-detail.png` - captured 2026-07-27 on a seeded opening. This is where the salary
  reading lives ("in your range"), which the feed row does not carry, and where the keyword-fit
  ring appears. The job reads SAVED because opening it from the feed saved it, which is the app's
  own behaviour and was left as it happened.
- `guide/discover-badges.png` - captured 2026-07-27 from seeded Discover rows of invented companies,
  never from a live scan, so no real employer's posting is used as demo data. **Two deviations from
  the original line, both because of how the app behaves:** the feed row has no salary badge at all
  (salary appears on the detail screen), and the adjacent tier cannot be shown - `archetypeWords`
  drops words under three letters, so a target role called "UI Engineer" keeps only the generic
  word "engineer" and can never match. The shot shows primary, secondary and an unmatched row.
- `guide/discover-sources.png` - captured 2026-07-27. The visible last-scan line belongs to a
  built-in source that was genuinely scanned; the seeded user feed reads NEVER SCANNED because its
  URL is a reserved example domain that was never fetched. Nothing was faked to make it say
  otherwise.
- `guide/dashboard-full.png` - captured 2026-07-27. Getting three different card kinds on screen
  took real state, not staging: the seeded interview was moved inside the 48-hour window the card
  needs, and the profile was edited and its scoring profile regenerated, which is what genuinely
  stales an existing score.
- `guide/tracker-report.png` - captured 2026-07-27 in the Germany (Eigenbemuehungen) format, with
  the applicant name filled in so the document reads as a real one.
- `guide/analytics.png` - captured 2026-07-27, a crop of the content column holding the four
  counters, the funnel and the weekly chart. Needed a taller window than the 1440x900 standard,
  since the three do not fit a 900-point viewport; the width, which is what fixes layout, is
  unchanged.
- `guide/my-jobs-table.png` - captured 2026-07-27, after two real scoring runs so the score column
  is not uniformly empty. Shows all five statuses and all three legitimacy tiers.
- `guide/score-result.png` - captured 2026-07-27 from a real scoring run against the seeded profile
  (Vantaform GmbH, 72 per cent). **Known limitation, not a capture error:** the result is taller than
  a 1440x900 window, so the percentage gauge and the red flags cannot appear in one frame. The shot
  keeps the half that is harder to guess - the missing-keyword chips, the ATS check and the red
  flags. If the gauge should also be shown, the page needs a second figure rather than a wider crop.
- `guide/profile-filled.png` - captured 2026-07-27, a tall crop of the form column: contact block,
  both experience entries expanded, and the collapsed Skills and Languages rows.
- `guide/profile-archetypes.png` - captured 2026-07-27, a tight crop of the Target roles panel with
  one role per fit tier.
- `guide/sidebar.png` - captured 2026-07-27 on the seeded demo database (`tools/capture/seed.mjs`),
  Dashboard open so the sidebar is shown against a working screen rather than an empty one.
- `guide/onboarding.png` - captured 2026-07-27, wizard step 02 of 06. Shot after the provider lists
  were corrected: an earlier capture showed an OpenAI card in the API-key flow and a CLI card naming
  Gemini CLI, both of which the app cannot serve, so it was discarded rather than published.
- `guide/settings-ai.png` - captured 2026-07-27 from the dev build at 1440x900 logical / 2880x1800
  actual, dark theme. API mode, Claude (Anthropic) provider, the full privacy note, and the API key
  block in its "stored in the keychain, field stays empty" state, so no key is visible and nothing
  had to be redacted by hand.
- `og/applye-og.png` - the 1200x630 Open Graph card. Regenerate with `npm run web:og` after editing
  `og/applye-og.svg`; the script uses macOS built-ins only.
- `brand/*.svg` - wordmark and icon in light and dark variants.

## Non-media placeholders still open

These are configuration, not assets, and live in `apps/web/src/app/site.ts`:

- `GA_MEASUREMENT_ID` - stays `G-PLACEHOLDER` in source **on purpose**; the real ID is injected at
  build time from an environment variable, and analytics is confirmed live on the deployed site.
  Nothing to do here.
- `SOURCE_PUBLIC` - `false` while the repository is private; flipping it turns every
  "coming soon" pill back into a GitHub link.
- `DISCORD`, `LINKEDIN`, `X_TWITTER` - empty; each footer icon appears only once its URL is set.
- `SPONSORS` - points at the profile page until GitHub Sponsors is enabled.
