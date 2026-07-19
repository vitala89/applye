# Discover "Sources" Panel - Redesign Brief

Handoff doc for a future design/implementation session. Describes what the
Sources panel is, its data, states, and interactions, plus a concrete redesign
direction - so it can be reworked without re-deriving the code.

## Product context

Applye is a privacy-first desktop job-search app (Tauri 2 + Angular, dark-first,
mono-accented; register = **product**, the tool disappears into the task). The
**Discover** screen scans job sources on demand ("Scan" button, 0 tokens) and
lists new openings. **Sources** is the drawer where the user manages _where those
openings come from_: enable/disable built-in feeds, add company ATS boards, and
add their own RSS feeds.

It opens from the "Sources" button in the Discover toolbar and from the feed
footer ("Adjust filters" is separate - that is the Locations/Type popover, not
this drawer). Component: `apps/desktop/src/app/pages/discover/discover.component.*`
(drawer markup around the `dv-drawer` block; styles `dv-drawer__*`, `dv-src`,
`dv-switch`).

## The problem to solve

The drawer is a single scroll of three stacked, flat vertical lists:

1. **Built-in sources** - Remotive (API), We Work Remotely (RSS), Himalayas (API).
2. **Company boards (ATS)** - Greenhouse / Lever / Ashby boards the user adds by slug.
3. **Your sources** - arbitrary RSS URLs the user adds.

Each list only grows. With a handful of built-ins, a few company boards, and
several personal RSS feeds, the drawer becomes a long undifferentiated column of
near-identical rows. Problems:

- **No overview.** You cannot see at a glance how many sources are on, which are
  failing, or when they last ran, without scrolling the whole column.
- **Weak hierarchy.** All three groups use the same row and the same section
  label weight; the eye has nothing to anchor on. Company boards and personal
  RSS look identical despite behaving differently.
- **Add-forms interrupt the list.** The "add company board" form and the "add
  RSS" form are inline between/after lists, so adding a source shifts everything.
- **Scope is buried.** The active geographic scope (e.g. "SCOPE: EUROPE") sits in
  the footer as a static line with an "Edit in Settings" link; it is a key filter
  on what scanning returns but reads as an afterthought.
- **State is thin.** Each row shows one result line ("0 NEW · 12:28 PM" or an
  error). There is no compact health signal (idle / running / error) and no way
  to act on a failing source beyond toggling it.

## Current data model (per source row)

A `DiscoverSource` row carries roughly:

- `id`, `name` (display), `kind` (`api` / `rss` / `ats_greenhouse` / `ats_lever`
  / `ats_ashby`), and whether it is built-in vs user-added.
- `isEnabled` (drives the toggle switch).
- Last-run result surfaced by `resultLine(s)`: a text like `"0 NEW · 12:28 PM"`,
  `"IDLE · off"`, or an error string (`resultLine(s).error` true → red).
- `typeBadge(s)` renders the small type chip (API / RSS / ATS).

Actions available: `toggleSource(s)`, `removeSource(s)` (user-added + company
boards only; built-ins cannot be removed), `addBoard()` (type select + slug
input), add-RSS (URL input). Scope is read from Settings (`geoScope`), shown via
`scopeLabel()`.

## States each source row must express

Keep all of these - the redesign must not drop any:

- **Enabled / disabled** (the switch; disabled sources are dimmed but still listed).
- **Result / health**: idle-never-run, last-run summary ("N new · time"), and
  **error** (feed unreachable, bad slug, malformed RSS) as a distinct, legible
  state - not just red text.
- **Type**: API / RSS / ATS(provider) as a compact chip.
- **Removable vs permanent**: built-ins have no remove control; user + board
  sources do.
- Standard interactive states on every control (default, hover, focus, active,
  disabled) per the product register.

## Redesign direction (proposed, not prescriptive)

Aim: a calm, scannable control surface that stays legible as the source count
grows. Concrete moves that fit the dark-first, mono-accent system:

1. **Header summary bar.** At the top of the drawer body, a single quiet row:
   "`N of M sources active`", plus a compact health pill if any source errored
   ("1 failing"). Move **scope** here as a real, tappable control (chip/segment)
   rather than a footer afterthought - it belongs with "where jobs come from".
   Still deep-links to Settings for the full scope editor.

2. **Segment the three groups without three long columns.** Options, pick one and
   commit:
   - **Segmented control / tabs** across the top (Built-in · Boards · Yours) with
     a count on each, showing one group at a time. Best when lists are long.
   - **Collapsible groups** (accordion) with a persistent count + active-count in
     each group header, default-expanded for the group with failures. Keeps
     everything on one scroll but adds hierarchy and lets the user collapse noise.
     Prefer the approach that keeps the _add_ affordance and the _list_ from
     fighting for the same vertical space.

3. **One consistent source row, denser and more scannable.** Left: name + type
   chip. Middle: a compact health line (a status dot - idle/ok/error - + "N new ·
   relative time", e.g. "2h ago" not a wall-clock only). Right: overflow/remove +
   the toggle. The toggle stays the primary right-edge affordance (muscle memory).
   Failing sources get a subtle full-row treatment (tinted background or an
   inline "Retry" affordance), **not** a left side-stripe (banned).

4. **Add-source as a deliberate action, not an inline form in the flow.** A single
   "Add source" entry that reveals a focused form (choose RSS URL or a company
   board provider+slug) in a way that does not reflow the list above it - e.g. a
   pinned footer action that expands a compact panel, or a small inline
   disclosure at the end of the relevant group. Validate slug/URL inline with a
   real error state.

5. **Empty and first-run states that teach.** "Your sources" empty state should
   explain what a personal RSS feed buys the user (privacy-preserving, your own
   boards) with one example, not a bare gap. Built-ins all-off should hint that
   scanning will return nothing.

## Design-system anchors (use these, don't invent)

- Tokens: `--surface-1`, `--surface-sunken`, `--border-subtle`, `--text-primary
/-secondary/-tertiary`, `--text-accent`, `--font-mono`, `--tracking-wide/-wider`,
  `--radius-card`, `--space-*`, `--dur-base`, `--ease-standard`. Semantic
  danger/warning/success tints for health states.
- Existing components to reuse: the `dv-switch` toggle, `dv-iconbtn` (+ `--sm`),
  `dv-btn`/`dv-btn--secondary`, `dv-input`, `dv-select`, the type chip
  (`dv-src__type`). Match the row rhythm already used by the feed list and the
  Locations popover so the drawer feels part of the same instrument.
- Motion 150-250ms, state-conveying only; every animation needs a
  `prefers-reduced-motion` fallback. Toggle, group expand/collapse, and form
  reveal are the only things that should move.

## Guardrails (brand-critical)

- Dark-first, mono-accented, calm. No cream/SaaS slop, no gradient text, no
  decorative glass, no left side-stripes, no eyebrow kickers.
- Privacy is visible: keep the "0 tokens" / local-first framing where scanning
  cost is implied. Never imply data leaves the device.
- The drawer is a modal `role="dialog"`; keep Escape-to-close, focus trapping,
  and a clear close affordance. Do not reinvent the toggle or standard controls.

## Acceptance for the implementation session

- Three source groups remain fully manageable (enable/disable, add, remove where
  allowed) with clearer hierarchy and a health/summary overview.
- No regression in states: type chip, last-run/error line, removable vs
  permanent, and all control states are present.
- Scope is surfaced as a first-class control at the top, still editable in
  Settings.
- i18n: any new copy added to both `en` and `de` blocks in
  `libs/i18n/src/lib/translations/translations.ts` (keys under `discover.*`),
  parity test green.
- Uses existing tokens/components; AOT build + `discover` unit tests + i18n
  parity all pass.
