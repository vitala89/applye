# Applye media production brief

Everything the README and site need, with a ready-to-run prompt or capture recipe per asset. The
terse path/size inventory lives in [`README.md`](README.md) in this folder; this file is the "how to
actually make each one" companion.

**Brand basics to keep consistent across every asset**

- Primary accent: `#4F5BFF` (indigo). Secondary/tech-cyan: `#24C8DB`.
- Dark is the brand default; always produce a dark variant, add light where noted.
- Wordmark text: `Applye`. Tone: calm, engineered, privacy-first. Not playful, not corporate-cold.
- Tagline lockup (when text is on the asset): **"Drafting is automated. Submitting is not."**
- Never show real personal data. Use the seed persona below in every screenshot.

**Seed persona (use in all screenshots so they tell one coherent story)**

This is the persona already captured in `hero-banner.png`. The remaining screens have to match it
line for line, or the six screenshots stop reading as one session.

- Role target: `Senior Frontend Engineer` · Location: `Berlin, DE (EU remote)` · Profile: `Local profile`
- Companies: `Kestrel Analytics`, `Northlane Systems`, `Umbra Labs`, `Cindertree Studio`,
  `Vantaform GmbH`, `Pellworm Digital`
- Dashboard counters: 4 active applications, 1 upcoming interview, 1 overdue follow-up, 1 offer.
- Needs attention: follow-up with `Kestrel Analytics` 4 days overdue; technical-round interview with
  `Northlane Systems` in 22h; a stale score on `Northlane Systems`.
- Recent jobs: `Umbra Labs` saved, `Cindertree Studio` saved, `Vantaform GmbH` saved,
  `Pellworm Digital` at interview.

---

## 1. Wordmark - `brand/wordmark-light.svg`, `brand/wordmark-dark.svg` (~250x56)

There are already brand SVGs in `apps/web/public/brand/` (icon + symbol). The wordmark is the
lockup of the symbol + the word "Applye". Two options:

**Option A - assemble from existing brand (preferred, free, on-brand):** open
`apps/web/public/brand/applye-symbol-dark.svg` and set the word "Applye" beside it in the site's
display font, export at 250x56 for dark and light. Hand this to Claude Design / the design step.

**Option B - generate a fresh wordmark.** Prompt for an image/logo tool:

> A minimalist horizontal wordmark logo reading "Applye" in a modern geometric sans-serif, medium
> weight, tight letter-spacing. To the left, a small abstract mark suggesting a checkmark merging
> with a document corner. Indigo `#4F5BFF` on transparent background. Flat vector, no gradients, no
> shadows, high contrast, crisp edges. Provide one version for light backgrounds (dark text) and one
> for dark backgrounds (near-white text). SVG-style, 250x56 aspect.

---

## 2. Hero banner - `hero-banner.png` (~1600x900, shown at 800 wide)

**Shipped.** Built deterministically by [`hero-banner.mjs`](hero-banner.mjs) in this folder, not by
an image generator: the UI is a real screenshot and must never be redrawn, because generated
interface text is the fastest way to lose a reader's trust on a repository's first screen.

To retake it:

1. Launch the desktop app in **dark theme** at a 16:10 window, seeded with the persona above.
2. Open the **Dashboard** and capture at 2x (2880x1800).
3. Run `hero-banner.mjs` per the instructions in its header.

What the script does, and why each part is there:

- **Crops the bottom 7%** of the shot. The dashboard's lower-left is empty at this data volume, and
  empty space in a hero reads as an empty product.
- **Backdrop `#131211`**, deliberately darker than the app canvas `#1c1b19`. Matching the canvas
  makes the window dissolve into the page; the hairline `#45423a` and the inner top highlight are
  what actually separate it.
- **Indigo `#4F5BFF` glow** at 18% behind the upper third, a 5% cyan `#24C8DB` wash lower right, a
  32px grid at 3% fading outward, a corner vignette and 2% grain against banding.
- **Window 1344px wide at y=170**, bleeding 49px off the bottom edge. The width is tuned so the
  canvas edge lands in the gap between two list rows: a half-sliced line of text reads as a broken
  crop, a clean gap reads as "there is more below".
- **No text on the image.** The READMEs supply the headline and tagline in markdown across six
  languages; baked-in copy would have to be produced six times and would not be selectable or
  translatable.

The script also emits `hero-banner-plate.png`, the same backdrop with the shadow but no window, for
the GitHub social preview and the video thumbnail.

---

## 3. Demo GIF - `demo.gif` (800px wide, 30-45s, loops)

The core loop in one silent, captioned take. Shot list (record at 1440x900 dark theme, then crop/
scale to 800 wide, keep under ~8 MB):

1. **0-6s** Paste a job description into the paste pipeline; parsed company/title/salary chips appear.
2. **6-14s** Legitimacy check resolves, then click **Recruiter check** - score ring fills, missing
   keywords and one red flag render.
3. **14-26s** Open **CV tailoring**; scroll the diff-style review; hit **Export PDF**.
4. **26-36s** Drag the role across the **pipeline kanban** (Applied -> Interview).
5. **36-42s** Land back on the **Dashboard** showing the updated pipeline + a follow-up due.

Add short lower-third captions per step ("Paste", "Recruiter check", "Tailor", "Track"). Keep the
cursor visible and movements slow enough to read. Tools: macOS screen record + Gifski, or
`ffmpeg` + `gifsicle`.

---

## 4. Walkthrough video - `walkthrough-thumb.png` (800px wide) + hosted video (2-3 min)

Record a narrated 2-3 minute walkthrough, upload to YouTube (unlisted or public), and drop a
clickable thumbnail into the README.

**Narration script (beats):**

1. **Hook (0:00-0:20)** "Companies use AI to filter you. Applye is the desktop that answers back -
   local, private, and it never applies for you." Show the dashboard.
2. **Add a role (0:20-0:50)** Paste a JD; explain the offline legitimacy check ("zero tokens").
3. **Recruiter check (0:50-1:20)** Run the opt-in AI read; walk through score, missing keywords, red
   flags, verdict. Stress "opt-in, your key, your call."
4. **Tailor & export (1:20-1:55)** Show the line-by-line CV review and PDF export; note "you review
   every change; it never fabricates experience."
5. **Track & prep (1:55-2:30)** Move the role across the kanban, show follow-ups and the interview
   timeline, then analytics computed locally.
6. **Close (2:30-3:00)** "No account, no telemetry, bring your own AI. Open source. Link in the
   description." Show the applye.dev URL and the GitHub repo.

**Thumbnail prompt / recipe:** the dashboard screenshot on the indigo hero backdrop, big bold text
"See Applye in 3 minutes", a play triangle centered, tagline small at the bottom. 800px wide, 16:9.

---

## 5. Screenshots - `screens/*.png` (1440x900, light + dark)

Capture each at 1440x900 with the seed persona. Dark is the default; also capture light where quick.
For every shot: hide any real API keys, use the persona data, keep the window chrome clean.

| File             | Screen & exact state to stage                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dashboard.png`  | Dashboard with pipeline health tiles, "follow-ups due" list (1-2 items), recent activity feed populated.            |
| `discover.png`   | Discover feed: 5-6 role cards, visible **match scores** (62-91%), the keyword + geography filter panel open.        |
| `job-detail.png` | Job detail after a recruiter check: score ring, missing-keywords chips, at least one red flag, verdict text.        |
| `tailoring.png`  | CV tailoring mid-review: the diff-style before/after with a few accepted and one pending change, Export PDF button. |
| `pipeline.png`   | Pipeline kanban with Applied / Interview / Offer columns populated per the persona; one card mid-drag if possible.  |
| `analytics.png`  | Analytics: funnel conversion chart + pipeline-aging view, all from the seeded data.                                 |

After capturing, replace the corresponding placeholder cells in `README*.md` (all language variants
reference the same paths, so one capture serves every translation).

---

## 6. Optional, if you want parity with career-ops later

- `press/` press logos ("Featured in") - only once there is real coverage; do not fake it.
- A live star-history chart badge - add after the repo is public and has stars.
- Social preview image (GitHub repo Settings -> Social preview, 1280x640): reuse the hero backdrop
  with the wordmark + tagline centered.

---

### Where each asset is referenced

- READMEs (`README.md` + `.es/.de/.ru/.pl/.uk`): wordmark, hero, demo GIF, walkthrough thumb, all six
  screens.
- Site (`apps/web`): hero, screenshots, and any press logos are wired on the landing page - see
  `docs/design/WEBSITE_PLAN.md` for the page-by-page design handoff.
