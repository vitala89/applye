# docs/assets - media referenced by the READMEs

Inventory. Every path below is referenced from `README*.md`, and all but one is filled. Each is built
by the script sitting beside it - [`hero-banner.mjs`](hero-banner.mjs),
[`brand/wordmark.mjs`](brand/wordmark.mjs), [`screens/build.mjs`](screens/build.mjs) - so a retake is
a command rather than a design session, and the reasoning behind each one lives in
[`ASSETS_BRIEF.md`](ASSETS_BRIEF.md).

Nothing here was captured for the README. The six screens and the demo GIF are prepared from the
media the documentation site already ships under `apps/web/public/guide/`, because a second set of
captures would drift from the first.

| File                       | What to capture                                                                     | Size       |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| `brand/wordmark-light.svg` | **Shipped.** Wordmark for light backgrounds, built by `brand/wordmark.mjs`          | 250x56     |
| `brand/wordmark-dark.svg`  | **Shipped.** The same lockup inked for dark backgrounds                             | 250x56     |
| `hero-banner.png`          | **Shipped.** Dashboard on the brand backdrop, built by `hero-banner.mjs`            | 1600x900   |
| `hero-banner-plate.png`    | **Shipped.** The same backdrop without the window, for the social preview and thumb | 1600x900   |
| `demo.gif`                 | **Shipped.** The core loop, cut from three of the guide's recordings                | 800px wide |
| `walkthrough-thumb.png`    | **Shipped.** Clickable poster for the first-run tour on applye.dev                  | 800x450    |
| `screens/dashboard.png`    | **Shipped.** Counters, needs-attention and the next interview                       | 1440x900   |
| `screens/discover.png`     | **Shipped.** The feed grouped by target roles                                       | 1440x736   |
| `screens/job-detail.png`   | **Shipped.** Missing keywords, the ATS check and the red flags                      | 1440x900   |
| `screens/tailoring.png`    | **Shipped.** The tailoring wizard's review step                                     | 1440x900   |
| `screens/pipeline.png`     | **Shipped.** Applied / interview / offer, mid-drag                                  | 1440x900   |
| `screens/analytics.png`    | **Shipped.** Counters, the funnel and weekly volume                                 | 1440x1108  |

Every file in this inventory now exists. The only placeholder left anywhere in the READMEs is the
release links, which waits on installable builds and renders as a blockquote rather than a broken
image.
