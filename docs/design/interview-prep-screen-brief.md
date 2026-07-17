# Interview Prep Screen - Cloud Design Brief

Handoff doc for Claude Design. Describes what the Interview Prep screens are, their
data, states, and interactions, plus the specific fixes and redesign we want, so a
designer can produce a visual + interaction redesign without reading the code.

## Product context

Applye is a privacy-first desktop job-search app (Tauri 2 + Angular, dark-first,
mono-accented). **Interview Prep** (top-level route `/interview-prep`) is where the
applicant tracks the interview process for each application: the sequence of
interview **stages** (HR screen, technical, system design, behavioral, final, other),
their dates, status, interviewer, language, and notes. It is the CRUD home for stages;
the Pipeline board and its quick-view only show a read-only summary and link here.

Two screens:

1. **List** (`/interview-prep`) - every application that has at least one stage,
   soonest-upcoming first.
2. **Detail** (`/interview-prep/:applicationId`) - the full stage manager for one
   application.

## Data model

```
applications (the user's application to a job)
  └─ interview_stages (ordered: stage_order, stage_type, stage_label, scheduled_at,
        status, stage_language, interviewer_name/role/email, notes)
        └─ interview_prep (per-stage AI prep content: format qa|star, questions…)  ← EXISTS in DB, NOT surfaced in the UI yet
```

A "row" on the list is an application that has ≥1 stage. Stages are user-defined and
unlimited - explicitly NOT a fixed template; the user adds as many as their real
process has, in any order, with any wording.

## Current layout

### List screen

- A plain table: **Company · Role · Current Stage · Status · Next Date**.
- Each row is clickable (opens the detail). Status shows as a colored "stage" badge.
- States: loading text, empty text ("No interviews yet"), populated table.
- No per-row actions (no delete).

### Detail screen

- A **back button**: a left-arrow icon **plus** the text "← Interview Prep".
- Header: company (mono, bold) + role.
- A `<ul>` of **stage rows**. Each row: order number, stage label, `type · date`
  (raw ISO date, e.g. `2026-07-24`), a **status `<select>`**, move-up / move-down
  arrows, an **edit** (pencil) button, a **delete** (trash) button.
- Editing a stage swaps that row for an **inline form** (type, label, date, language,
  interviewer name/role/email, notes) with Cancel / Save.
- At the **bottom, always visible**, a large **"Add stage" form** with the same eight
  fields laid out in a grid and an "Add stage" button.

## Problems to solve

1. **Double back arrow.** The back control renders an arrow icon _and_ a literal "←"
   in its label, so it reads "← ← Interview Prep". There must be exactly one arrow.
2. **The always-on "Add stage" form is visual noise.** A big eight-field form sits
   permanently at the bottom of every detail page, competing with the stage list and
   looking unfinished. Adding a stage should be an intentional action, not an
   ever-present form.
3. **Delete uses the browser's native `confirm()` dialog.** Inconsistent with the app
   (which uses its own styled confirmations). Deletes - of a stage, and of a list row -
   should use an in-app confirm ("Delete this stage? / Remove this interview? -
   Cancel / Delete"), not a system dialog.
4. **No delete on the list.** The list has no way to remove an interview from tracking.
5. **Raw, inconsistent dates.** The list formats dates ("24 Jul 2026"); the detail
   shows raw ISO ("2026-07-24"). Use one formatted style everywhere.
6. **"Interview Prep" does no prep.** The screen is really an interview _scheduler_.
   The DB already has an `interview_prep` table (per-stage Q&A / STAR content) that is
   never surfaced. The feature's namesake - AI-generated prep questions and answers per
   stage - is missing.

## Redesign directives

### A. List screen

- Keep the table (Company · Role · Current Stage · Status · Next Date) but add a
  **per-row actions affordance** (a "…" menu or a hover-revealed delete): **Remove from
  Interview Prep**, which deletes all stages for that application (confirm modal) and
  drops it from the list - the application/job itself stays in My Jobs and Pipeline.
- Design a real **empty state** (icon + guidance: "Applications with interview stages
  appear here. Add a stage from the Pipeline quick-view or a job.") and a **loading
  skeleton** (rows), matching the Job Tracker / Pipeline treatments.
- Consider a small header/summary (e.g. count of upcoming interviews, next date) for
  scanability.

### B. Detail screen

- **One back control** (single arrow + "Interview Prep").
- Redesign the **stage list** as a clean vertical list / timeline of the application's
  stages: order badge, stage label, type, **formatted** date, a **status** control
  (a colored badge that opens a small menu, not a bare native select), interviewer
  summary if present, and per-row **Edit / Delete** in a tidy actions cluster.
  Reordering: keep up/down, or design a drag handle.
- Replace the always-on add form with a **"+ Add stage" button** that opens a **modal**
  (or a slide-over panel) containing the stage form (type, label, date, language,
  interviewer name/role/email, notes) with Cancel / Add. **Edit** should reuse the same
  modal (pre-filled) for consistency, instead of swapping the row inline.
- **Delete** (stage) → in-app confirm modal, not `confirm()`.
- Design the modal itself: title ("New stage" / "Edit stage"), grouped fields, primary
  Add/Save + secondary Cancel, and validation (label required).

### C. Stretch - make it actually "prep" (flag for product, design if in scope)

- Per stage, a place to **generate and review AI prep** (likely-questions + STAR-style
  answer notes) using the existing `interview_prep` storage. Design an entry point
  ("Prepare for this stage") and a review surface (question cards, language-aware).
  This is the biggest opportunity to make the screen live up to its name; design it as
  a follow-up section on the stage (or a sub-view), even if engineering ships it later.

### D. Screen-level polish

- Loading, empty, and error states for both screens (skeletons, not bare text).
- Consistent date formatting, mono company anchor (matches Pipeline/Tracker), status
  badge colors shared with the Pipeline stage badges.

## Design system constraints (must follow)

- Dark-first; every color via semantic CSS variables in `libs/ui/tokens.css` (no raw hex).
- Buttons via the `appButton` directive (variants primary/secondary/ghost, sizes).
- Destructive actions: an in-app confirm (modal or inline two-step), `--danger` tokens -
  never the browser `confirm()`.
- Icons via `lucide-angular` (`<lucide-icon [img]="…">`), matching the rest of the app.
- Company / anchor text in the mono font; status badges reuse the Pipeline stage-badge
  style and `[data-status]` colors.
- All labels are i18n keys (`interview.*`, `status.*`, `common.*`, `actions.*`) - keep
  text translatable (en + de); propose new keys for any new UI (modal titles, list
  delete, prep section).
- Reduced-motion support for any animation.

## Out of scope for the designer (engineering handles)

- The `interview_stages` CRUD, the `interview_prep` AI generation + storage, and the
  list-row "remove all stages" command are backend/logic changes. Design the surfaces
  and states; engineering wires persistence and AI.

## Deliverables requested

1. Redesigned **List** (populated + empty + loading + row delete/confirm).
2. Redesigned **Detail** (single back, clean stage list/timeline, status badge-menu).
3. The **Add / Edit stage modal** (or slide-over) with grouped fields + validation.
4. In-app **delete confirm** modal (stage + list row).
5. (Stretch) the **per-stage AI prep** entry point + review surface.
6. New/changed i18n key list for anything added.
