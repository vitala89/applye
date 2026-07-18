# Discover - Design Prompt

Design the **Discover** screen for **Applye**, a privacy-first desktop job-search app
(Tauri + Angular). Discover is where **new jobs come to the user** - the opposite of My Jobs
(the archive the user built) and the Dashboard (what to do right now). Discover answers
**"what is new for me today?"**: the app scans a set of legal job sources (public APIs, RSS
feeds, ATS career pages), pre-filters them locally with zero AI cost, and presents a fresh,
personal inbox of openings to triage in seconds.

Mental model: an **inbox, not a search engine**. The user does not type queries; their profile
(target roles, keywords, geo scope) IS the query. The app collects, the user decides:
**Save** (into My Jobs, where scoring/tailoring live) or **Dismiss** (gone forever). Every item
is either acted on or dismissed - the feed trends toward empty, and empty means "you are caught
up", which is a good feeling, not a dead end.

All collection is deterministic code - no AI reads the sources, nothing leaves the machine
except plain HTTP GETs to public job feeds. Say nothing that implies cloud magic.

## Brand / design system (non-negotiable)

- **"A terminal made beautiful."** Monochrome graphite canvas + exactly ONE accent: indigo.
- **Dark is the default/brand canvas; light is first-class.** Design both themes.
- **Two typefaces, two jobs.** JetBrains Mono = brand voice: headings, numbers, labels, badges,
  statuses, sources, dates, log lines. Inter (sans) = long-form reading only (job titles may be
  sans if they read better; everything meta around them is mono).
- **Indigo accent appears ONLY on:** primary actions, active/selected states, focus rings,
  match highlights, the scan-in-progress state, and brand marks. Everything else is graphite.
  Accent is never decoration.
- Cards: 8px radius, subtle border, flat elevation. Selects/inputs: 6px radius, sunken surface.
- Calm, precise, tool-like. Anti-references: SaaS-cream slop, playful-consumer bounce,
  gradients-as-decoration, emoji, infinite-scroll dopamine feeds, "job board" visual noise
  (logos everywhere, salary badges in 4 colors). No em/en dashes anywhere - plain hyphen only.

## The signature moment: the scan console (terminal-native)

This is the brand centerpiece of the screen. When the user hits **Scan**, do NOT show a spinner.
Show a live, mono, terminal-flavoured scan log - the app visibly doing the work, line by line:

```
> scan started · 4 sources · scope EU + remote
  remotive ........... 128 fetched · 117 filtered out · 11 new
  weworkremotely ..... 43 fetched · 40 filtered out · 3 new
  greenhouse:vercel .. 12 fetched · 12 filtered out · 0 new
  lever:figma ........ error: timeout · will retry next scan
> done in 6.2s · 14 new jobs · 0 tokens spent
```

Lines appear as sources complete; the active line gets the indigo accent (a subtle blinking
cursor or `...` progress is welcome, no bouncing dots). Failures are quiet mono lines, not red
alarms. When the scan finishes, the console collapses into a one-line **scan summary strip**
(`LAST SCAN 12:04 · 14 NEW · 183 FILTERED · 0 TOKENS`) that stays at the top of the feed. The
"0 tokens" note is a deliberate brand statement - collection is free, always show it.

Design both: the expanded console (during scan, and expandable afterwards from the summary
strip) and the collapsed strip. This console is deterministic log output - do not style it as an
AI chat or agent; there is no AI in the scan.

## Layout (top to bottom)

1. **Header row.** The shell renders the page title above you - do not add a duplicate `<h1>`.
   Right side: the primary **Scan** button (the ONE primary button on this screen) and a small
   mono caption with the last scan time (`LAST SCAN TODAY 12:04`). If a scan is running the
   button becomes a quiet "Scanning..." state (disabled, mono, subtle indigo pulse).

2. **Scan summary strip / console.** As described above. Collapsed strip by default; expands to
   the full log. First visit ever: no strip, the empty state (below) owns the screen.

3. **Filter row.** Small, quiet, mono controls that filter the feed locally (0 cost):
   - a text filter input (matches title/company),
   - a **Source** select (All sources / per source),
   - a **Geo** select reflecting the configured scope (e.g. All · Remote · Germany),
   - a **New / All** segmented control: New = not yet triaged (default), All = includes
     already-saved items (dimmed), never includes dismissed ones.
     Right-aligned: a ghost **Sources** button that opens the sources drawer.

4. **The feed (hero).** A vertical list of job rows - rows, not fat cards; density matters, a
   good scan yields 10-40 items and the user triages them in one sitting. Each row:
   - **Title** (the largest text in the row) + **company** beside/below it.
   - Mono meta line: source badge (`REMOTIVE`, `GH:VERCEL`), location/remote tag, posted-ago
     (`2H AGO`, `3D AGO`).
   - **Matched keywords** as small mono chips (the title-filter keywords that let this job
     through, e.g. `ANGULAR` `SENIOR`) - this is the "why am I seeing this" explanation and the
     only place indigo may tint the row content.
   - Row actions, always visible (not hover-only): primary-quiet **Save** and ghost **Dismiss**.
     Save moves it into My Jobs (row gets a `SAVED` badge and dims, or slides out - pick one,
     keep it calm). Dismiss removes it immediately - no confirm, but allow a brief inline
     single-item "Dismissed · Undo" affordance.
   - Clicking the row body expands an inline preview (first lines of the description, plain
     sans text, a mono link to the original posting) - no navigation away, triage stays fast.
   - NEW items carry a subtle mono `NEW` marker; items seen in a previous session lose it
     (visited-state, graphite).

5. **Feed footer.** A quiet mono line after the last row: `14 SHOWN · 183 FILTERED OUT BY YOUR
KEYWORDS` with a ghost link "Adjust filters" (opens the sources drawer). Honesty about what
   was hidden builds trust in the pre-filter.

## Sources drawer (right-side panel)

A right-side drawer (same pattern as the Job Tracker columns drawer) managing where jobs come
from. Sections:

- **Built-in sources** - the shipped Tier-2 feeds (Remotive, We Work Remotely, Himalayas):
  name, type badge (`RSS` / `API`), toggle.
- **Company boards (ATS)** - Greenhouse / Lever / Ashby public boards by company slug: a list
  of `GH:VERCEL`-style entries with toggles, plus an "Add company" affordance (pick ATS type +
  slug).
- **Your sources** - user-added RSS feeds: URL input + name. Each user-added source shows a
  small mono legality note area (the UI steers toward legal, machine-readable sources).
- Each source row: enabled toggle, last-scan result in mono (`11 NEW · 12:04` or `ERROR ·
TIMEOUT`), and a kebab (edit / remove for non-builtin).
- Drawer footer: the geo scope summary (`SCOPE: EU + REMOTE`) with a link to Settings where the
  scope is configured - the drawer shows it, Settings owns it.

## States to deliver (every block)

- **First run / no sources enabled** - the most important state. The screen is a single calm,
  centered setup moment: muted compass icon, a mono line ("No sources yet"), one sans sentence
  ("Enable a job source and Applye will collect new openings for you - locally, for free"),
  and ONE primary button ("Choose sources") opening the drawer. Do not show an empty feed
  chrome, filter row, or scan strip.
- **Sources enabled, never scanned** - the feed area shows a single quiet prompt with the
  primary Scan button ("Run your first scan").
- **Scanning** - the live console (see above); the feed below stays visible (old items) but
  slightly dimmed; new rows appear when the scan completes, marked `NEW`.
- **Caught up** - scan ran, zero new (or user triaged everything): a small centered mono state
  "You are caught up" + last-scan caption + ghost "Scan again". Deliberately rewarding, not
  apologetic.
- **Partial source errors** - the feed still renders; failing sources are reported only in the
  summary strip/console and the drawer (`ERROR · TIMEOUT`), never as a page-level alert.
- **Skeleton / loading** for the initial data load.

## Explicitly OUT of scope for v1 (do not design these yet)

- **The agent command bar** - a future v2 where the user types an intent ("remote staff
  frontend roles in EU fintech") and an AI agent visibly plans, runs steps, and streams found
  jobs, Claude-Code-style. The v1 scan console deliberately establishes the visual language
  (mono log lines, step-by-step progress) that this v2 feature will later inherit - keep the
  console design generic enough to grow into it, but do not design the input bar, agent steps,
  or AI states now.
- Match scores in the feed (scoring runs after Save, in My Jobs - the feed shows keyword
  matches, not AI scores).
- Notifications / min-score alerts, scheduled background scans, digest emails.
- Salary parsing/badges, company logos, dedup-merge UI.

## Do NOT include

Anything that implies the app searches closed boards (LinkedIn, Indeed, StepStone) - it legally
cannot and this is a product stance, not a gap. No infinite scroll, no pagination-as-engagement;
the feed is finite and triage-able by design. No AI chrome on the scan (no sparkles, no "AI is
searching..."): collection is dumb, fast, free code and the design should be proud of that. No
global "mark all as read" that silently dismisses jobs - Dismiss is always a per-row decision
(bulk select is fine if explicit).
