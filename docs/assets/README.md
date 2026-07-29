# docs/assets - media referenced by the READMEs

Inventory. Every path below is already referenced from `README*.md`; drop the real capture in and it
lights up. `hero-banner.png` is done - it is built by [`hero-banner.mjs`](hero-banner.mjs) from a
screenshot of the running app, and the recipe for the rest lives in
[`ASSETS_BRIEF.md`](ASSETS_BRIEF.md).

| File                       | What to capture                                                                         | Size       |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| `brand/wordmark-light.svg` | Applye wordmark for light backgrounds                                                   | ~250x56    |
| `brand/wordmark-dark.svg`  | Applye wordmark for dark backgrounds                                                    | ~250x56    |
| `hero-banner.png`          | **Shipped.** Dashboard on the brand backdrop, built by `hero-banner.mjs`                | 1600x900   |
| `hero-banner-plate.png`    | **Shipped.** The same backdrop without the window, for the social preview and thumb     | 1600x900   |
| `demo.gif`                 | 30-45s capture of the core loop: paste JD -> recruiter check -> tailored CV -> pipeline | 800px wide |
| `walkthrough-thumb.png`    | Thumbnail linking to the 2-3 min narrated video walkthrough                             | 800px wide |
| `screens/dashboard.png`    | Dashboard: pipeline health + follow-ups due                                             | 1440x900   |
| `screens/discover.png`     | Discover feed with match scores and filters                                             | 1440x900   |
| `screens/job-detail.png`   | Job detail: score ring, missing keywords, red flags                                     | 1440x900   |
| `screens/tailoring.png`    | CV tailoring diff-style review                                                          | 1440x900   |
| `screens/pipeline.png`     | Pipeline kanban: applied / interview / offer                                            | 1440x900   |
| `screens/analytics.png`    | Analytics: funnel + pipeline aging                                                      | 1440x900   |

Capture screens in both light and dark themes where possible; dark is the brand default.
