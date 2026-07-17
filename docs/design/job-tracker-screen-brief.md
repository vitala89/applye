# Job Tracker Screen - Cloud Design Brief

Handoff doc for Claude Design. Describes what the Job Tracker screen is, its data,
states, and interactions, plus the specific redesign we want, so a designer can
propose and produce a visual + interaction redesign without reading the code.

## Product context

Applye is a privacy-first desktop job-search app (Tauri 2 + Angular, dark-first,
mono-accented). The **Job Tracker** (top-level route `/tracker`) is a spreadsheet-style
table of every job application the user has made. Its primary real-world purpose is
to produce the German Agentur fuer Arbeit **"Eigenbemuehungen" / "Nachweise ueber
Bewerbungsbemuehungen"** report (proof-of-job-search) as a PDF, and a CSV for the
user's own spreadsheet. Secondary purpose: a dense at-a-glance grid the user edits
inline (contact, next action, salary, notes).

### How the data relates (important, drives the delete UX)

A tracker row is **not** an independent record. It is a live SQL view:

```
jobs (the posting: company, title, tech stack, location, blue-card eligibility)
  └─ applications (the user's application: status, contact, notes, next action, salary, method)
        └─ status_history / interview_stages (dates)
```

One tracker row = one **application** joined to its **job**. Columns sourced from the
job (company, title, tech stack, location, blue-card) are inherently **read-only** here -
they belong to the posting. Columns sourced from the application (contact, next action,
salary, notes) are **user-editable**. Deleting the job on the My Jobs screen hard-deletes
the application and its row disappears from the tracker. There is currently no way to
delete or archive a row from within the tracker itself.

## Current layout (what exists today)

- **Header**: subtitle line + an "Applicant name" text input + export buttons
  (`Export PDF`, optional German-labeled export when UI language is German, `Export Excel`).
- **Filter row**: a date-range `<select>` (This month / Last 3 months / All time), a
  status `<select>`, and a "Columns" toggle button that opens a checkbox panel listing
  all 19 columns.
- **Table**: one leading `#` index column + up to 19 data columns:
  company, role/title, tech stack, location, source URL (link), contact name*, contact
  role*, contact channel*, method, date applied, interview #1 date, follow-up #2 date,
  status (badge), next action*, next action date* (date input), salary range*, contract
  type, blue-card eligible (yes/no), EOR provider, notes*. (`*` = editable.)
- **Summary footer**: total applications, response rate %, average days to response.
- States: loading text, empty-state text, populated table.

## The problems to solve (design + UX)

1. **Too many columns, all shown at once.** 19 columns render by default; the table
   overflows horizontally and reads as a wall of data. We want a small set of
   **essential default columns** visible, the rest **hidden but toggleable**, and the
   ability for the user to **add their own custom columns**.

2. **No edit affordance.** Editable cells are always-on raw `<input>`s mixed into a
   read grid, so the user can't tell what's editable and the grid looks like a form.
   We want a clear read state with an **edit control (pencil icon)** that switches a
   row (or cell) into edit mode, then saves.

3. **Dead-end rows.** The join to the job exists but there's no way to jump from a
   tracker row back to the job / application (My Jobs quick-view). Company or role
   should be a **link back to the job**.

4. **No delete / archive in the tracker.** Deletion only happens on My Jobs and
   silently removes the tracker row. Users expect to manage rows here too, and for the
   official report they may want to **keep a row for the record even after they stop
   working it**. Product decision for you to design around: support **"Remove"**
   (deletes the underlying application, with confirm - same effect as My Jobs delete)
   **and a soft "Archive"** state (row hidden from the active grid but retained and
   still included in the exported report). Archived rows need a way to be shown again.

5. **Export is invisible and unconfigurable.** PDF and CSV are written silently to a
   fixed folder (`~/Documents/Applye/reports/`) and only a toast shows the path. No
   preview, no choice of location, no chance to review before generating. We want a
   **preview step** and a **"choose where to save" dialog**.

6. **"Export Excel" is actually CSV.** The button says Excel but produces a `.csv`.
   Either present it honestly ("Export CSV / spreadsheet") or design for a true `.xlsx`.

7. **Plain report output.** The PDF is monospace padded text - legible but visually
   bare for an official document. The report deserves a proper letterhead-style layout
   (title, applicant, period, generated date, clean table, summary line).

## Redesign directives (what we want you to design)

### A. Column system

- Pick **~6-8 essential default columns**. Proposed defaults: Company, Role, Status,
  Date applied, Next action, Next action date. (Contact and notes are useful but heavy;
  treat as optional-on.)
- Redesign the **column manager**: current defaults, an "optional columns" list to
  reveal, and an **"+ Add custom column"** action. Custom columns need: a name, a type
  (text / date / number / yes-no / single-select), and inline editing like the built-in
  editable fields. Design the add-column UI and how a custom column appears in the
  header (distinguishable from built-ins, removable/renamable).
- When more columns are enabled than fit, the table scrolls horizontally with the
  first column(s) (index + Company) **pinned/sticky** so context isn't lost.

### B. Cell editing

- Design a clear **read vs edit** distinction. Read cells look like text. A **pencil
  affordance** (per-row on hover, or a row-level "Edit" toggle) switches editable cells
  into inputs; a **Save / Cancel** pair commits or reverts. Non-editable (job-derived)
  cells must visibly read as locked (subtle, e.g. muted, no pencil).
- Editing must feel light - inline, no modal for simple text fields. Dates use a date
  picker. Show a subtle saved confirmation (the app has a toast system).

### C. Row link + row actions

- **Company** (or role) links back to the job / opens the My Jobs quick-view.
- Each row gets an **actions affordance** (kebab or hover row-end): **Edit**, **Archive**,
  **Remove** (destructive, needs confirm - reuse the app's inline two-step confirm
  pattern, not a browser dialog; there is a `--danger` token set).
- Design the **Archived** presentation: an "Archived" filter/segment or a muted row
  treatment, plus how the user restores a row.

### D. Export flow

- Replace silent-save with: **Preview → Save**. Design a **report preview** (a modal or
  a dedicated preview surface) showing the letterhead layout the PDF will produce:
  report title, applicant name, selected period, generated date, the table (only the
  report's official columns: #, date applied, company, role, method, status, contact,
  location, last update, notes), and the summary (total / response rate / avg days).
- The preview has **Save as PDF** and **Save as CSV/spreadsheet** actions that open a
  native save dialog (user picks location + filename). Relabel "Excel" honestly.
- Design the **letterhead / official-report** visual for the PDF itself (this is a
  document a German job-seeker submits to a government office - it should look clean,
  neutral, and printable on A4).

### E. Screen-level polish

- Header: reconcile the "Applicant name" field, filters, column manager, and export
  into a coherent toolbar (right now they are split across two rows with mixed intent).
  Applicant name is only used for the report - consider moving it into the export/preview
  flow rather than the always-visible header.
- Redesign **loading** (skeleton rows like the Pipeline board, not a bare text line),
  **empty** (icon + guidance: "applications you make will appear here"), and the
  **summary footer** (currently three plain spans - make it read as a stats strip).
- Respect the existing design system: dark-first, semantic tokens in `libs/ui/tokens.css`,
  `ButtonDirective` variants (primary/secondary), `--danger` tokens for destructive
  actions, mono font for the company anchor line (matches the Pipeline card).

## Design system constraints (must follow)

- Dark-first; every color via semantic CSS variables in `libs/ui/tokens.css` (no raw hex).
- Buttons via `appButton` with `variant` (primary/secondary) + `size`.
- Destructive actions: inline two-step confirm (no modal `confirm()`), `--danger` tokens.
- Company/anchor text in the mono font, consistent with the Pipeline board card.
- All labels are i18n keys (`tracker.*`, `status.*`, `common.*`) - keep text
  translatable; propose new keys for any new UI (e.g. custom-column dialog, archive).
- Reduced-motion support for any animation (the app already honors it elsewhere).

## Out of scope for the designer (engineering will handle)

- The SQL view, the `tracker_custom_fields` storage table, the archive flag column,
  the native save dialog wiring, and the real `.xlsx` writer are backend changes.
  Design the surfaces and states; engineering builds the persistence.

## Deliverables requested

1. Redesigned Job Tracker screen (default + all-columns-on + editing + archived states).
2. Column manager with the "+ Add custom column" flow.
3. Row actions (edit / archive / remove-with-confirm).
4. Export preview surface + the official PDF letterhead layout.
5. Loading, empty, and summary-strip treatments.
6. New/changed i18n key list for anything you add.
