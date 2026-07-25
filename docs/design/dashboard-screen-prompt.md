# Dashboard (Home) - Design Prompt

Design the **Dashboard** screen for **Applye**, a privacy-first desktop job-search app
(Tauri + Angular). This is the app's landing route - the first thing the user sees each
session. Its single job: answer **"what do I do right now?"** It is an action hub, NOT an
analytics screen (a separate Analytics page owns funnels, conversion rates, and trend charts -
do not put charts or time-series here).

## Brand / design system (non-negotiable)

- **"A terminal made beautiful."** Monochrome graphite canvas + exactly ONE accent: indigo.
- **Dark is the default/brand canvas; light is first-class.** Design both themes.
- **Two typefaces, two jobs.** JetBrains Mono = brand voice: headings, all numbers, metrics,
  labels, badges, statuses, scores. Inter (sans) = long-form reading only.
- **Indigo accent appears ONLY on:** primary actions, active/selected states, focus rings,
  scores, AI status, brand marks. Everywhere else: graphite. Accent is never decoration.
- Cards: 8px radius, subtle border, flat elevation. Buttons: 8px radius, mono medium label,
  one primary per view. Inputs/selects: 6px radius, sunken surface.
- Calm, precise, tool-like. Anti-references: SaaS-cream slop, playful-consumer bounce,
  gradients-as-decoration, emoji. No em/en dashes anywhere - use a plain hyphen.

## Layout (top to bottom, priority = attention)

1. **Onboarding banner slot** - a dismissible band at the very top (only shown pre-onboarding).
   Reserve the slot; design the empty (post-onboarding) case as absent, no gap.

2. **Greeting + KPI row.** A short mono greeting line, then a row of **4 stat tiles**:
   - Active applications
   - Upcoming interviews
   - Overdue follow-ups ← this one carries a warning tint when > 0
   - Offers
     Each tile: big mono number, small mono uppercase label, whole tile is a link to the relevant
     page. Tiles wrap gracefully on a narrow window (auto-fit grid).

3. **Needs attention - the action queue (the hero block).** A vertical list of action cards,
   most urgent first. Each card: a leading status icon, a one-line mono title + short sans
   context line, and ONE primary action button on the right. Card types to design:
   - Overdue follow-up → button "Draft follow-up"
   - Unfinished tailoring session → button "Resume"
   - Interview within 48h → button "Prep"
   - Stale AI scoring / pitch → button "Regenerate"
   - Low profile completeness → button "Complete profile"
     Design the **empty state** too: a calm, centered "You're all caught up" with a muted icon -
     this must feel like a reward, not a blank.

4. **Upcoming interviews.** A compact timeline / list of the next few interviews:
   company monogram · role · stage label (mono badge) · date. Row links to interview prep.
   Show a skeleton state and an empty state.

5. **Recent jobs.** A short list of recently added applications (company · role · status pill)
   for quick continue. Links into the job detail.

6. **Quick actions bar.** A row of secondary/ghost buttons: "Paste job", "New tailoring",
   "Import CV". Persistent, low-emphasis.

## States to deliver

For every data block: **loaded**, **skeleton/loading**, and **empty**. The empty dashboard of a
brand-new user (post-onboarding, no jobs yet) should still feel intentional: KPI tiles at 0,
the action queue prompting "Complete your profile" and "Add your first job".

## Do NOT include

Trend charts, conversion funnels, response-rate graphs, score distributions, time-series of any
kind - those belong to the Analytics page. Keep the dashboard about _today and next actions_.
