# applye.dev website plan & design handoff

Goal: bring the marketing site to launch quality for the public open-source release, matching the
polish of the inspiration site (career-ops.org) while staying true to Applye's own positioning
(desktop, local-first, German/EU market, augmentation-not-automation).

This doc is the bridge between "what exists" and the per-page briefs you hand to **Claude Design**
(or the `frontend-design` / `impeccable` skills). It does not rebuild anything - the site is already
substantial.

---

## 1. What already exists (as of v0.24.0)

Routes in `apps/web/src/app/app.routes.ts`:

- `/` **Landing** - hero (CSS app mock), "gap we fill" 3-way comparison, What is Applye, Features,
  German market, Principles strip, Trust/Open-source, When-to-use vs What-it-is-not, FAQ.
- `/methodology` - how the recruiter check works.
- `/manifesto` - the augmentation manifesto.
- `/compare` - Applye vs alternatives.
- `/press` - press kit.
- `/sustain` - sustainability / funding.
- `/privacy` - privacy page.
- `/docs/*` - ~20 pages: overview, an 8-step guide (tour, profile, add-job, score, tailor, discover,
  track, insights, settings), requirements, install, flow, judgement, ai, scoring, german, privacy,
  legality, status.
- `/changelog`, `/blog`.

Design source of truth already in-repo: `design-system/MASTER.md`, `design-system/pages/`,
`docs/design/*-prompt.md` (per-screen briefs for the app), brand SVGs in
`apps/web/public/brand/`, global tokens in `apps/web/src/styles.scss`.

**Takeaway:** structure and copy are strong. The gap is _visual proof and finish_ - real product
imagery, a hero that isn't a CSS mock, and a consistent design pass - not new information
architecture.

---

## 2. career-ops.org review - what to borrow, what to skip

What they do well (worth matching):

- **A real hero image** of the product, not a diagram - immediate "this is a real thing".
- **One-line, high-contrast value prop** + two clear CTAs ("Run it now" / "View source").
- **A `--describe` block**: a single dense paragraph that says exactly what it is, for whom, with
  concrete numbers (listings scanned, applications, interviews, one offer).
- **A copy-paste "try it" moment** (`npx ... init`) - a single obvious first action.
- **Engine-agnostic logo row** (the CLIs it works with) - signals openness.
- **A signed manifesto** as a linked, human anchor.

What to skip or defer for Applye:

- **"Featured in" press logos** - only add once real coverage exists; never fake it (also a
  LEGAL/honesty rule).
- **Star-count bragging / trendshift badges** - add after the repo is public and has traction.
- **Terminal-first framing** - Applye's whole wedge is _not_ being terminal-only. Lead with the GUI.

Positioning line to keep front and center (already in the repo): **"career-ops gives developers a
CLI. Applye gives everyone a desktop."**

---

## 3. Gap analysis -> what to change

| #   | Gap                                         | Where                  | Fix                                                                                                                                     |
| --- | ------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hero is a CSS mock, not a real product shot | `/` hero               | Swap in `hero-banner.png` (see ASSETS_BRIEF). Keep the CSS mock as the dark-mode fallback/decoration.                                   |
| 2   | No moving proof of the loop                 | `/` below hero         | Embed `demo.gif` or the walkthrough video (YouTube) in a "See it work" band.                                                            |
| 3   | Features are text-only                      | `/` features + `/docs` | Add the six real `screens/*.png` beside their feature copy.                                                                             |
| 4   | No single obvious first action              | `/` hero CTA           | Until installers ship, primary CTA = "Read the docs" / "Build from source"; secondary = GitHub. Swap to real download links at release. |
| 5   | No social preview / OG image                | site meta              | Generate the 1280x640 OG image (ASSETS_BRIEF §6) and wire `<meta og:image>`.                                                            |
| 6   | Engine-agnostic proof is only in prose      | `/` or `/docs/ai`      | Add a small provider/CLI logo row (Anthropic, OpenAI, Gemini, DeepSeek; Claude Code, Codex, Gemini CLI).                                |
| 7   | Consistency pass not yet run                | all pages              | Run one design QA pass for spacing, type scale, dark/light parity, focus states, mobile.                                                |
| 8   | Download buttons say "coming soon"          | `/` hero               | Keep until installers exist; make sure the state is obviously intentional, not broken.                                                  |

Non-goals for this phase: new routes, a site-wide i18n switcher (site stays English at launch; the
_app_ is multilingual), a blog content backlog.

---

## 4. Page-by-page design briefs (hand each to Claude Design)

Each brief is scoped so a design pass can be run independently. Prereqs marked **[needs asset]** are
blocked on `docs/assets/ASSETS_BRIEF.md`.

### 4.1 Landing `/` - **highest priority**

- Replace hero CSS mock with `hero-banner.png` on the indigo backdrop; keep tagline "Drafting is
  automated. Submitting is not." and the two CTAs. **[needs asset: hero]**
- Add a "See it work" band directly under the hero with `demo.gif` or the video embed. **[needs
  asset: demo/video]**
- In the Features section, pair each feature with its real screenshot (dashboard, discover,
  job-detail, tailoring, pipeline, analytics). **[needs asset: screens]**
- Add the provider/CLI logo strip in or near the "bring your own AI" area.
- QA: dark is default; verify light theme, mobile stacking, and that the "gap we fill" comparison
  reads cleanly on small screens.

### 4.2 `/docs` overview + guide - **high priority**

- The 8-step guide pages should each carry the matching screenshot inline (they map 1:1 to the
  `screens/*.png` set). **[needs asset: screens]**
- Ensure the docs left-nav, sticky header, and three-zone layout are consistent across all ~20 pages.
- Add "next / previous" affordances between guide steps if not present.

### 4.3 `/methodology` and `/scoring` - **medium**

- These explain the recruiter check. Add the `job-detail.png` score-ring shot and a small labeled
  diagram of the five-signal read. Keep it honest: heuristic + opt-in AI, not magic.

### 4.4 `/manifesto` - **medium**

- Make it the emotional anchor career-ops's manifesto is. Strong typographic treatment, a signature/
  author line linking to vitaliikasap.com. No imagery needed; it's a text piece.

### 4.5 `/compare` - **medium**

- Turn the "Cloud SaaS vs CLI vs Applye" story into a clean comparison table + the positioning line.
  Be fair to career-ops (it's the inspiration and an ally, not a competitor to dunk on).

### 4.6 `/privacy` and `/docs/legality` - **medium**

- Align both with the new `LEGAL_DISCLAIMER.md`. Cross-link them. Emphasize: no server, no telemetry,
  data local, AI calls go direct to your provider.

### 4.7 `/press` and `/sustain` - **low**

- `/press`: wire the press kit to real downloadable assets (logo pack, screenshots, one-liner, boiler
  plate) once assets exist. Do not add "featured in" logos yet.
- `/sustain`: keep honest and simple (how to support: star, contribute, sponsor if/when set up).

### 4.8 Global - **do once, applies everywhere**

- Set the OG/social preview image and per-page `<title>`/description meta. **[needs asset: OG image]**
- Favicon is present (`apps/web/public/favicon.ico` + brand SVGs); confirm dark/light.
- Accessibility QA: color contrast on `#4F5BFF`, visible focus rings, keyboard nav, reduced-motion
  for the demo band.

---

## 5. How to run the design phase

1. **Finish assets first.** Items marked **[needs asset]** are blocked on `ASSETS_BRIEF.md`. Hero,
   demo, and the six screenshots unblock the highest-priority pages.
2. **Confirm tokens.** Point the design step at `apps/web/src/styles.scss` and
   `design-system/MASTER.md` so it uses existing tokens (accent `#4F5BFF`, cyan `#24C8DB`, dark
   default) instead of inventing new ones.
3. **Drive page by page** with Claude Design (`mcp__claude-design`) or the `frontend-design` /
   `impeccable` skill, starting with the Landing brief (§4.1). Feed it the brief + the real assets +
   the current component (`apps/web/src/app/landing.html` / `.scss`).
4. **Verify in-browser** after each page (preview server + screenshot) before moving on.
5. **One consistency pass** at the end across all routes (spacing, type scale, mobile, dark/light,
   focus states).

## 6. Suggested order of execution

1. Produce hero + demo + 6 screenshots (`ASSETS_BRIEF.md`).
2. Landing `/` design pass (§4.1).
3. Docs guide screenshots (§4.2).
4. Methodology/scoring, manifesto, compare (§4.3-4.5).
5. Privacy/legality alignment with the new legal doc (§4.6).
6. Global meta + OG image + accessibility pass (§4.8).
7. Press/sustain polish (§4.7) - last, lowest stakes.
