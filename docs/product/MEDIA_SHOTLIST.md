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

## Priority 1 - needed for launch

| Slot                          | Page                    | Type       | What to capture                                                                                                                                    |
| ----------------------------- | ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide/tour-walkthrough.mp4`  | `/docs/guide/tour`      | VIDEO      | Narrated 2-3 min: first launch, onboarding, one paste-to-tailor loop, a look at each sidebar section. The single most important asset on the site. |
| `guide/paste-job.gif`         | `/docs/guide/add-job`   | GIF        | Copy a JD, click Paste job, parsed result appears (company, title, salary, legitimacy tier).                                                       |
| `guide/tailor-wizard.mp4`     | `/docs/guide/tailor`    | VIDEO      | 60-90 s: tailor pass, gap-fill dialog, review documents, export and apply with the native save dialog.                                             |
| `guide/documents-library.png` | `/docs/guide/documents` | SCREENSHOT | CV tab with 3-4 CVs, one "Default" badge, one "Tailored" badge.                                                                                    |

## Priority 2 - fills out the guide

| Slot                           | Page                    | Type       | What to capture                                                                             |
| ------------------------------ | ----------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `guide/profile-regenerate.gif` | `/docs/guide/profile`   | GIF        | Regenerate on the scoring card: pulse while running, freshness chip turning current.        |
| `guide/gap-dialog.png`         | `/docs/guide/tailor`    | SCREENSHOT | Gap-fill dialog: one question, answer field, Skip, save-to-profile toggle.                  |
| `guide/discover-scan.gif`      | `/docs/guide/discover`  | GIF        | Scan running: console lines per source, collapsing into the summary strip.                  |
| `guide/cv-import.gif`          | `/docs/guide/documents` | GIF        | Choose a PDF, parsing state, found-sections summary with the low-confidence list, save.     |
| `guide/cv-editor.png`          | `/docs/guide/documents` | SCREENSHOT | Section list with a drag handle, live preview, one section showing style overrides.         |
| `guide/pipeline-drag.gif`      | `/docs/guide/track`     | GIF        | Drag a card applied to interview, status pill updates, quick-view modal opens.              |
| `guide/interview-timeline.png` | `/docs/guide/insights`  | SCREENSHOT | Three stage cards (screening done, technical upcoming, final planned) on the timeline rail. |

## Priority 3 - marketing surfaces

| Slot                         | Page         | Type    | What to produce                                                             |
| ---------------------------- | ------------ | ------- | --------------------------------------------------------------------------- |
| `press/applye-press-kit.zip` | `/press`     | ARCHIVE | Wordmark SVGs (light and dark), app icon, 2-3 approved product screenshots. |
| `manifesto-signature.png`    | `/manifesto` | IMAGE   | Handwritten-style signature scan, transparent background.                   |
| Press logo strip             | `/press`     | SVG set | Greyscale outlet logos linked to the articles, once coverage exists.        |

## Already produced

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
