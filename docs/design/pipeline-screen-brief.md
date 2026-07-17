# Pipeline Screen - Cloud Design Brief

Handoff doc for Cloud Design. Describes what the Pipeline screen is, its data,
states, and interactions, so a designer can propose improvements without reading
the code.

## Product context

Applye is a privacy-first desktop job-search app (Tauri 2 + Angular, dark-first,
mono-accented). The **Pipeline** screen is the applicant's kanban board: it tracks
every _active_ job application through a funnel. It is one of the app's primary
screens (top-level route `/pipeline`).

A job becomes a Pipeline card only after the user commits to it (clicks **Create
application** in the Apply wizard, which sets status `applied`). Jobs that are only
`saved` do NOT appear here - they live on the **My Jobs** screen. So the Pipeline
is exclusively the post-apply lifecycle.

## Layout

Horizontal kanban, 5 fixed columns, left to right in funnel order:

| Column    | Accent          | Meaning                             |
| --------- | --------------- | ----------------------------------- |
| Applied   | blue `#3b82f6`  | Application sent, awaiting response |
| Interview | amber `#f59e0b` | In interview process (has stages)   |
| Offer     | green `#22c55e` | Offer received                      |
| Rejected  | red `#ef4444`   | Declined by employer                |
| Cancelled | grey `#6b7280`  | Withdrawn by user                   |

- Columns are fixed-width (240px), the board scrolls horizontally if it overflows.
- Each column header shows its localized label + a count badge.
- Empty columns show a dashed "Drop here" placeholder.
- Whole-board empty state: a kanban icon + "no applications yet" message.
- Loading state: three skeleton bars. Error state: message + Retry button.

## The card

Each card (draggable) shows:

- **Company** (mono font, bold, primary text) - the anchor line.
- **Role title** (smaller, secondary text).
- **Priority flag** (top-right corner) - only if set; colored low/medium/high.
- **Footer row**: match **score %** pill (color-coded high/mid/low), an **overdue**
  badge if a follow-up is past due, and a **date** (applied date, else last-updated).
- **Interview stage line** (Interview column only): a status dot + "Stage N · <label>"
  showing the current interview stage.

## Interactions

### 1. Drag between columns = change status

Dragging a card to another column writes the new application status (transactional:
also appends status history and recomputes the follow-up reminder date). Reordering
_within_ a column currently does nothing persistent (no manual sort is stored).

### 2. Drag INTO Interview = special flow

This is the one place the board does more than a status change. When a card lands in
**Interview** AND the application has zero interview stages yet, the quick-view modal
**auto-opens** pre-focused on a "log the first interview stage" mini-form. The user can
fill it (stage type, label, date) or skip. This is intentional: Interview is the only
status that has sub-structure (multiple stages), so we nudge the user to start logging
it. It never re-prompts once at least one stage exists.

### 3. Click a card = quick-view modal

A centered modal (currently backdrop + dialog) for fast triage without leaving the board.
Deliberately shallow - deep work (score, job description, tailoring, portal answers) stays
on the full job detail page. Modal contents, top to bottom:

- **Header**: company + role + close button.
- **Status** dropdown (same 5 statuses; no "saved" - you can't un-apply here).
- **Priority**: low / medium / high / none, as flag toggle buttons.
- **Interview stage** (Interview status only): either the quick-add mini-form (first
  stage) OR a summary line ("Stage N · label") + a "View all stages →" link that routes
  to the full Interview Prep screen.
- **Follow-up drafter** (only when the card is overdue): pick a language, click "Draft",
  an AI writes a follow-up email; user edits To/Cc/subject/body, then Copy or "Open in
  mail" (opens their own mail client via mailto: - Applye never sends anything).
- **Comments**: list of timestamped notes + a box to add one.
- **Footer**: "Open full details" (routes to job detail) + "Add comment".

## Related screens (links out)

- **Full job detail** (`/jobs/:id`) - deep view, from "Open full details".
- **Interview Prep** (`/interview-prep/:id`) - full multi-stage interview management,
  from "View all stages".
- **My Jobs** - where `saved` jobs live before they enter the pipeline.

## Design tokens available

Dark-first. Semantic CSS vars: `--surface-1/2/sunken`, `--text-primary/secondary/tertiary`,
`--border-subtle/default`, `--success/warning/danger` (+ `-tint` backgrounds), `--space-1..6`,
`--radius-md/lg/full`, `--font-mono`, per-column `--col-accent`.

## Known design pain points to solve (designer input wanted)

1. **Two different card-open surfaces feel inconsistent**: drag-into-interview auto-opens a
   modal; a normal click opens the same modal. The auto-open can feel abrupt.
2. **The quick-view modal is a long vertical stack** (status, priority, stage, follow-up,
   comments, footer) with weak visual grouping - needs hierarchy/sectioning.
3. **Follow-up drafter only appears when overdue** - discoverability is low; users may not
   know the feature exists.
4. **Interview stage progress is a single text line** - no visual sense of "stage 2 of 4"
   or a progress track.
5. **Cards are dense** - company, title, flag, score, overdue, date, stage all compete.
   Priority of information needs a designer's eye.
6. **Rejected / Cancelled columns** sit in the main flow at equal weight to active columns,
   even though they are terminal/archival. Should they be de-emphasized or collapsible?
7. **No column-level totals, no filtering, no search** on a board that can grow large.
8. **Empty within-column reorder** looks draggable but does not persist - either make it
   persist or disable it.
9. **Modal is centered, not a right-hand drawer** - a side panel might preserve board context
   better for a triage flow.

## What NOT to change

- The 5-status funnel model and their meanings.
- "saved" jobs stay off this board.
- Follow-up email stays user-sent (mailto), never auto-sent - privacy is a core value.
- Depth stays on the detail/interview-prep screens; the modal must remain lightweight.
