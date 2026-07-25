# Analytics - Design Prompt

Design the **Analytics** screen for **Applye**, a privacy-first desktop job-search app
(Tauri + Angular). This is the counterpart to the Dashboard: where the Dashboard answers
**"what do I do right now?"**, Analytics answers **"how is my job search actually going?"** It is
a reflection/insight screen - the user comes here to understand their own funnel, momentum, and
conversion, not to take an immediate action.

All data is the user's own, stored locally in SQLite. There is NO market benchmark, no peer
comparison, no external data - every number is derived from this user's applications. Say nothing
the local data cannot support.

## Brand / design system (non-negotiable)

- **"A terminal made beautiful."** Monochrome graphite canvas + exactly ONE accent: indigo.
- **Dark is the default/brand canvas; light is first-class.** Design both themes.
- **Two typefaces, two jobs.** JetBrains Mono = brand voice: headings, all numbers, metrics,
  labels, badges, statuses, scores, axis ticks. Inter (sans) = long-form reading only (the rare
  explanatory sentence).
- **Indigo accent appears ONLY on:** primary actions, active/selected states, focus rings, scores,
  AI status, brand marks, and the single "current/primary" series in a visual. Everything else -
  every bar, every gridline, every secondary series - is graphite. Accent is never decoration.
- Cards: 8px radius, subtle border, flat elevation. Selects: 6px radius, sunken surface.
- Calm, precise, tool-like. Anti-references: SaaS-cream slop, playful-consumer bounce,
  gradients-as-decoration, emoji, glossy dashboards. No em/en dashes anywhere - plain hyphen only.

## Visualization language: terminal-native, NOT a chart library

This is the most important constraint. Do **not** design glossy chart-library visuals (no drop
shadows, no rounded gradient bars, no pie charts, no 3D, no tooltip bubbles with arrows). Build
every visual from the existing token system as flat, precise, terminal-flavoured primitives:

- **Bars** = flat rectangles, graphite fill, indigo only for the highlighted/primary bar. Value
  printed in mono at the end of the bar, not floating in a tooltip.
- **Funnel** = a vertical stack of horizontal bars, each narrower than the one above, with the
  count and the step-to-step conversion % in mono beside it. Reads like a report, not a graphic.
- **Line / trend** = a thin single-weight line (indigo) on a faint graphite gridline, mono axis
  ticks, no area fill or a very flat one. Points are optional small ticks, not glossy dots.
- **Sparklines / mini-bars** inside KPI tiles = tiny, unlabeled, graphite.

Think "a beautifully typeset analytics report in a terminal", not "a BI dashboard".

## Global period selector (top of screen)

A single segmented control at the top - **Last 30 days / Last 90 days / All time** - in the mono
label style, sunken surface, indigo for the active segment. It filters **every** block on the
screen. Show the active range as a small mono caption near the page title (e.g. `LAST 90 DAYS ·
34 APPLICATIONS`). This is the only global control.

## Layout (top to bottom)

1. **Header row.** Page title (the shell already renders it - do not add a duplicate `<h1>`; design
   assuming the title bar is above you), the period selector on the right, and the active-range
   mono caption.

2. **Headline KPI row - 4 stat tiles.** Big mono number + small mono uppercase label, each with an
   optional tiny graphite sparkline underneath:
   - Applications sent (in period)
   - Response rate (reached any interview stage / applied)
   - Interview rate or active interviews
   - Offers
     Each tile shows a small mono delta vs the previous equivalent period when it can (e.g. `+6 vs
prev 30d`); when there is no prior period, omit the delta rather than showing 0.

3. **The application funnel (hero block).** The centerpiece. A vertical funnel:
   `Saved → Applied → Interviewing → Offer`, each stage a horizontal bar scaled to its count, with
   the absolute count and the conversion % from the previous stage in mono. Rejected / Cancelled
   shown as a muted "leakage" figure to the side or beneath (not as a funnel stage). This block
   earns the most vertical space and is where the indigo accent leads the eye down the funnel.

4. **Applications over time.** A terminal-native trend: applications sent per week (or per day for
   30d, per week for 90d, per month for all-time - the bucket follows the period). Thin indigo line
   or a row of flat graphite bars, mono axis. Optionally overlay follow-ups-done as a second, muted
   series to show effort vs output. Keep it one calm visual, not a busy multi-line chart.

## States to deliver (every block)

- **Loaded** - real data.
- **Skeleton / loading.**
- **Empty (no applications yet)** - the most important state to get right. A brand-new user has
  nothing to analyse. Design a single calm, centered empty state for the whole screen: a muted icon,
  a mono line like "No data to analyse yet", one sans sentence ("Add and apply to jobs and your
  funnel will appear here"), and a ghost link to add a job. Do NOT render empty funnels/axes.
- **Low-data / thin state** - the honest in-between: e.g. 3 applications, 0 interviews. Percentages
  would be misleading (a single interview = 100%). Design how a block reads when counts are tiny:
  prefer showing raw counts and a muted "not enough data for a rate yet" note over a loud 0% or
  100%. This state matters as much as the loaded one.

## Explicitly OUT of scope for v1 (do not design these yet)

Match-score distribution, score-vs-outcome, top companies/locations, salary analytics,
time-to-response, and pipeline aging are all deferred to a later Analytics iteration. Keep v1 to the
spine above: period selector + KPI row + funnel + applications-over-time. Leave visual room below
the fold for these to be added later, but do not draw placeholders for them.

## Do NOT include

Anything that implies external/market data ("you're in the top 10% of applicants", salary
benchmarks, "average time-to-hire in your field"). Any action hub content (action queue, upcoming
interviews list, quick actions) - that is the Dashboard's job. No exportable report here (the Job
Tracker owns report export). Keep Analytics about the user understanding their own numbers.
