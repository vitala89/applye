# Native gate backlog

Walkthroughs that are outstanding because no agent can run them.

`docs/governance/VALIDATION_MATRIX.md` requires a `npm run desktop:dev` pass for anything depending
on Tauri IPC, SQLite, the keychain, native dialogs, printing, the updater or native window behaviour,
and says in as many words that passing unit tests and a browser preview are not evidence. That gate
has now gone undriven across five pull requests, and the reason is mechanical rather than negligent:

- **Synthetic clicks do not reach the Tauri webview.** Hover produces a hover state; a click at the
  same coordinates does nothing. Reproduced against three separate targets, including the theme
  toggle.
- **Every path below needs real database rows.** Outside Tauri every `invoke` rejects, so a browser
  preview renders the empty states and nothing else.

So the work is the maintainer's, and this file exists because the alternative was worse: the same
checks were being restated as "next first action" in each new watch entry, one or two at a time,
which is how five pull requests passed without any of them being run. One list, ordered so the app
state each item needs is built by the item before it.

## How to use this file

**`docs/internal/NATIVE_GATE_SCRIPT.md` is the route.** It orders every check below into one sitting of **fifteen stations**, numbered 0 to 14 - what database rows each needs, which screens in which order, and what to look
at - with the two paid checks and the two destructive ones held to the end. Read it first and walk
it; this file is the list it walks, and the place to tick.

1. `pgrep -fl "tauri dev"` to confirm nothing is already running, then:

```bash
npm run desktop:dev
```

2. Work down a section in order. The ordering is deliberate - later items reuse the job, CV or
   application the earlier ones create.
3. Tick what passed, and **record what failed in `docs/internal/DUTY_WATCH.md` rather than here**.
   This file tracks what is unrun; the watch log tracks what was found.
4. Delete an item once it has been driven. A ticked item that stays here reads as outstanding on the
   next read.

**Two of these cost tokens and are marked.** Everything unmarked is free.

## A. Job detail, after the `ADR-0005` migration

`jobs.component.ts` went 977 to 371 lines across #448, #449, #450 and #451, and eight stores in
`libs/application/src/lib/jobs/` now own what the page used to. Nothing below has been driven in the
running app. The risk being checked is state that no longer lives where it used to: a store surviving
a navigation it should have been reset by, or two jobs sharing one.

- [ ] Open a job from the list. Its detail loads: title, company, description, the scoring card.
- [ ] Create a CV for it. The document appears in the library and in the job's own document list.
- [ ] Run the final checks. **(costs tokens if a tailoring run is triggered)**
- [ ] Mark the job applied. The card's status changes and the pipeline reflects it.
- [ ] **Switch between two jobs and confirm nothing bleeds.** Open job A, then job B, then A again:
      no document, score, draft or final-checks result from one appears under the other. This is the
      single most valuable item in this section - it is the failure mode the eight-store split
      creates and the one no jsdom test can see.
- [ ] Return from the document editor **with** a save. The job detail shows the saved document.
- [ ] Return from the document editor **without** a save. Nothing was written, and no draft is left
      pointing at a document that does not exist.
- [ ] Discard a tailoring. The draft goes and the job returns to its prior state.
- [ ] Update an application that is already marked applied. **The card holds its value, then
      reloads** - it must not blank between the write and the refresh.
- [ ] Delete a job. It leaves the list, the pipeline and the document associations.

## B. Discover, after the template split (#459)

Both items are layout-only and need the feed populated, so run a scan first. Neither is reachable in
a browser preview, because the filter bar and the detail screen only render once there are rows.

- [ ] The `.dv-filters` bar **sticks** while the feed scrolls under it.
- [ ] The detail grid **collapses at `max-width: 980px`**. Narrow the window past that point and the
      two-column detail becomes one column.

## C. The CV live-style panel, after its split (#462 and the template split)

**This section was reported as filed by #462's watch entry and was not.** The entry says the check
was "added to `docs/internal/NATIVE_GATE_BACKLOG.md` rather than restated here"; nothing was added.
It covers both pull requests now.

Every item needs a CV open in **Preview** mode with a live selection, so run section A's "create a
CV" step first. A browser preview cannot substitute: the document has to come from SQLite.

The class split (#462) moved the cascade rules out; the template split moved the controls into
`app-cv-style-text-group` and `app-cv-style-line-group`. What no jsdom test sees is **rendering**:
jsdom has no layout and no cascade, so a shared class that failed to reach a child would still pass
every assertion in the suite.

- [ ] **The groups are styled.** Select a body field. The Text group's head, its chevron, and every
      labelled control look exactly as they did - the group's vocabulary is emitted from
      `styles.scss` now rather than from the panel's own stylesheet, and a class that failed to reach
      a child renders as an unstyled control rather than as an error.
- [ ] **The controls fill their row.** Each select and number input spans the panel's width and each
      colour swatch is the small fixed square. These rules re-keyed from `.cvlive__fields` to
      `.cvlive__field`; a mismatch shows as full-width colour pickers.
- [ ] **The group heads still toggle**, and the chevron rotates. Open and collapse both groups.
- [ ] **The Line group differs by selection, which is the split's one real risk.** On an experience
      entry head the line select offers **Inherit**; on a plain field (a bullet) it does **not**, and
      its first option is None. Both are covered by tests, but only against jsdom.
- [ ] **An edit still lands on the right target.** With APPLY TO on "This element", change the line
      style and confirm the paper redraws that element only - not the section divider.

The stylesheet deletion needs one pass of its own, in **Edit** mode rather than Preview. 321 lines
were removed on the reasoning that Angular's view encapsulation made them unreachable, and each
section editor already carries its own copy. That was checked declaration by declaration and by
`quality:style-move`, but both are static: if the reasoning is wrong anywhere, the symptom is an
unstyled control, which no test in this repository can see.

- [ ] **Open the CV editor in Edit mode and look at each section.** Personal details (the two-column
      grid and the "pull from profile" button), Experience (entry frames, bullet rows with their dot
      and remove button, add/remove buttons), Education (the same frames), Skills (group labels,
      chips, the dashed "add skill" input), Languages (rows and the add button). Anything that reads
      as unstyled - a bare input, a button with no frame, a chip with no background - is a rule that
      was load-bearing after all.
- [ ] **Drag a section.** The drag preview and the placeholder are the one case the static check
      could not settle: CDK applies `.cdk-drag-preview` at runtime and moves the preview into a
      body-level overlay, so an encapsulated rule may never have reached it. Left in place rather
      than removed on a guess.

The template split into four cards needs the same Edit-mode look, for the same reason: markup crossed
an encapsulation boundary and jsdom has no cascade. The controls are the part to look at, because the
page's `.cvdetail select` rule no longer reaches any of them and the reasoning that they need no
replacement - `_editor-shell.scss` styles them globally - is a static argument.

- [ ] **The settings card.** The region select is a normal control sized to its content, **not**
      stretched across the row: `.docedit-meta-row select` sets `width: auto` on purpose, and
      restating the page's `width: 100%` here was the mistake that was avoided rather than made. The
      "is default" checkbox draws its box and fills it when active.
- [ ] **The Style card.** The theme select, the page-size select and the four margin inputs all look
      like the styled controls they were, not native browser defaults. Collapse and expand the card.
- [ ] **The save-as-template dialog.** Open it from the header. The name field is a styled input
      (this one **did** need its rule restated, because no `.docedit-*` rule covers a dialog), the
      backdrop dims, Escape closes it, and confirm is disabled until the name is non-blank.
- [ ] **The photo section.** With a profile photo present: the thumbnail is a 3:4 rounded frame, and
      the three placement chips show one active. Without one: only the "add in profile" button and its
      hint.

The print protocol now lives in one module for both editors, and printing is a native path the gate
exists for: `window.print` is overridden by Tauri's webview plugin on macOS, and jsdom implements
none of it, so the unit tests stub it out entirely.

- [ ] **Export the CV to PDF from Preview mode.** The margins in the output match the four values in
      the Style card, the page is the selected size, and no editor chrome, caret, selection outline or
      side panel appears. Then export a **second** time in the same session: a fresh `<style>` per
      export would accumulate, and the second export's margins must win.
- [ ] **Export the cover letter to PDF.** Same check. It now runs the same code as the CV, which it
      did not before.
- [ ] **Press Cmd/Ctrl+P directly in the CV preview with a leaf selected.** The printed output shows
      the last-committed text with no inline control, and the uncommitted draft is discarded rather
      than saved. This is the `beforeprint` handler, and it is CV-only on purpose - the cover-letter
      preview has no inline editing.
- [ ] **After any export, the app looks normal again.** The `printing-cv` class is cleared on
      `afterprint`; if that event never fires the class lingers, which is harmless only because every
      rule using it sits inside `@media print`. Worth one look on a real print dialog cancel.

## C2. The tracker, after the dead-rule deletion

Three rule families were deleted from `tracker.component.scss` on the argument that Angular's view
scoping meant they could never match. The static proof is strong - the sheet was compiled with Sass
and every flattened selector matched against the markup the page declares - but it cannot see a class
written at runtime, and it cannot see which of two identical global `@keyframes` the browser picks.
Both checks are free and need only the tracker to have rows.

- [ ] **The tracker page renders unchanged.** Open Tracker with at least one application. The title
      row, the toolbar buttons, the segmented period control, the table and the status pills all look
      as they did. `.jt__title` is the rule most worth a second look - it was deleted as matching
      nothing, so a heading that suddenly renders at the default font size is what a wrong call looks
      like.
- [ ] **The export dialog still has styled toolbar buttons.** Open the tracker's export dialog. Its
      buttons keep their border, mono type and hover state, and the primary one is still accent-filled.
      This is the `.jt-tbtn` deletion: the dialog's own copy is supposed to be what styles it.
- [ ] **The three animations still play.** The export dialog and the column drawer fade-and-rise on
      open (`jtIn`); a row's action menu pops (`jtPop`); the loading skeleton bars pulse (`jtPulse`).
      The first two are the keyframe deletion - the page's copies are gone and the children's
      identical ones must be what runs.

## C3. Analytics, after the split into three child components

The page's markup crossed an encapsulation boundary in three places and one class
family became a global partial. jsdom has no layout and no cascade, so a rule that
failed to reach a child still passes every assertion in the suite - the symptom is
an unstyled control, not an error. Needs applications in the database; run
section A's steps first.

- [ ] **The six bar lists all look the same as each other.** Open Analytics with a
      populated pipeline. Funnel, match-score distribution, score vs outcome, time
      to response, pipeline aging and locations each render name, bar and value at
      the same size and spacing. One component draws all six now; a rule that
      failed to reach it shows as bare text with no bar.
- [ ] **Only the funnel shows a conversion percentage**, and score vs outcome shows
      its "N applications" caption **without** one. The two halves gate separately
      and a unit test can only check the DOM, not the layout of the column.
- [ ] **The KPI tiles animate while loading.** Switch period on a slow database, or
      reopen the page: the four placeholder tiles shimmer. Those boxes are styled
      from `_analytics-skeleton.scss`, a **global** partial - the one thing here
      that could regress another page rather than this one.
- [ ] **Nothing else on any other page changed.** The partial is emitted unwrapped
      into the global sheet. `ana-` was verified unique by grep, but a glance at
      Dashboard, Jobs and Settings costs nothing and is the only check that would
      catch a collision.
- [ ] **The trend plot still draws both lines.** With follow-ups logged in the
      period, the chart shows the accent applications line and the grey follow-ups
      line, with the tick labels beneath.

## C4. The welcome screen, after its view moved out of the class

The template and the animation stylesheet moved from `styles: []` and `template:`
into sibling files. The rules are byte-identical and Angular compiles both forms
the same way, so nothing here is expected to have changed - but **nobody has ever
watched this sequence run**, jsdom has neither layout nor animation, and this is
the one screen a user sees exactly once, on a database that has never been
written to. A regression here is invisible until it is a first impression.
Needs a **fresh profile**: an empty database with `healthCheckSeen` unset, which
is the only state that renders this screen.

- [ ] **The whole choreography plays, in order.** Launch with a fresh profile: the
      cursor flies in and taps the mark, the slash morphs into place, the accent
      bar rises, the wordmark wipes in left to right, then the title, tagline,
      buttons, hint, divider, check label and health panel arrive in sequence. A
      `@keyframes` name that failed to survive the move shows as an element that
      is simply present at rest, with no error anywhere.
- [ ] **The blinking caret blinks**, after the title has settled, and keeps
      blinking. It is the only infinite animation on the screen.
- [ ] **Reduced motion stands the whole thing down.** With "Reduce motion" on in
      macOS System Settings, relaunch on a fresh profile: everything is on screen
      immediately, nothing moves, and the caret is **gone** rather than static.
      This is one `[data-anim]` selector inside a media query - the single rule
      whose loss would be silent in every automated check.
- [ ] **A short window compresses rather than scrolls.** Resize to roughly half
      height before launching: the vertical rhythm tightens and the health panel
      is still reachable without a scrollbar. Every vertical step is a `clamp` on
      `vh`, which no test can exercise.
- [ ] **Both ways out work and are recorded.** "Start the tour" opens onboarding;
      "set up on my own" goes straight to the app, and neither screen returns on
      the next launch. The unit spec covers the two gateway writes; this covers
      that the app actually routes on them.

## C5. The Pipeline quick view, after the stepper and composer came out

Two blocks left the modal for children, and four rules are now second copies
rather than moves - `.qv__link`, `.qv__hint`, `.qv__error`, `.btn-ghost` and
`.btn-primary`. A copy that drifts, or one that was needed and not made, shows as
an unstyled control and never as an error: jsdom has no cascade, and
`quality:style-move` compares the union of the sheets, so it cannot see which
side of the boundary a rule ended up on. Needs applications in the database, one
of them **overdue** and one **in interview with stages**; run section A first.

- [ ] **The interview stepper looks unchanged.** Open the quick view on an
      application at interview with several stages: the rail draws a filled track
      up to the current stage, a check in each passed dot, a pip in the current
      one, the current label in accent, and the counter in the head reading
      position over total. All of that is now the child's stylesheet.
- [ ] **The view-all link still looks like a link in all three branches.** It is
      drawn by the child inside the stepper foot and by the modal in the
      failed-read and no-stages-yet branches - two copies of the same rule, and
      the one check that would catch them drifting apart.
- [ ] **The follow-up composer's controls match the modal's own.** On an overdue
      card: the language select, both recipient inputs, the subject and the body
      share the sunken background, the border, the radius and the focus ring with
      the status select and the comment box above them. Those four are one
      grouped selector in the child now and the other two stayed on the modal, so
      this is the check that the grouping kept them identical.
- [ ] **Both composer buttons are styled.** "Draft" is a ghost button and "Open in
      mail" a filled one, matching the modal's own footer pair. `.btn-ghost` and
      `.btn-primary` are copies in the child - and there is no global rule for
      either name to fall back on, which is what makes an omission here silent.
- [ ] **A draft survives a status change.** Draft a follow-up on an overdue card,
      then change the status in the same modal. The composer may disappear if the
      card stops being overdue; reopening it must still show the draft rather
      than an empty form. This is the reason `FollowupDraftService` stayed
      provided on the modal, and nothing automated can exercise it.

## C6. The dashboard's two list panels, after they became one component

The two panels are one component with two call sites now, and three rules cross
the new boundary: `.badge` and the `.sk` shimmer are second copies, and
`@keyframes dash-shimmer` is a **global** declaration made twice under the same
name. A copy that drifts shows as an unstyled or unanimated element and never as
an error. Needs a database with at least one scheduled future interview stage and
one claimed job; run section A's steps first.

- [ ] **Both panels sit side by side and fill their columns.** The host element
      is the grid item now rather than the `.panel` div, with `:host { display:
block }` added to make that work. A missed host rule collapses a column,
      which is the most visible thing on this page and invisible to every test
      here.
- [ ] **Interviews show a stage badge and a time; recent jobs show a status
      pill.** Neither shows the other's. The unit tests count this per panel, but
      only a real screen shows the two trailing elements are still laid out where
      they were.
- [ ] **The accent badge still reads as accented.** Schedule a stage inside the
      next 48 hours: its badge takes the accent treatment while a later one does
      not. `.badge` is a copy in the child and the page keeps its own for queue
      cards, so this is where a drift between them would first show.
- [ ] **Both skeletons shimmer, on the same beat.** Open the dashboard on a slow
      database: the KPI tiles, the queue cards and both list panels all animate.
      The panels' shimmer is a second `@keyframes dash-shimmer`; if the two
      definitions ever diverge, the two halves of the page animate differently.
- [ ] **Reduced motion stops all of it.** With "Reduce motion" on, no shimmer
      anywhere on the dashboard. That rule is now declared twice as well.
- [ ] **The jobs skeleton looks unchanged.** Its placeholder widths moved from
      52%/28% to 50%/30% when the two panels merged. This is the one deliberate
      visual change in the split, and the only check on whether it is noticeable.

## C7. The tracker grid, after it left the page

The whole table is a child now, and the two sticky-column offsets went with it.
Sticky positioning, horizontal overflow and column pinning are exactly what jsdom
has no model of: the suite renders every cell and can prove none of them stays
put while the grid scrolls sideways. Needs tracker rows in the database, one of
them archived; run section A's steps first.

- [ ] **The index and the pinned column still stick.** Scroll the grid
      horizontally: the row number and the pinned column stay against the left
      edge while everything else moves under them. `$idx` and `$pin` moved into
      the child's sheet, and they are the only two values that decide this.
- [ ] **The header stays put vertically.** Scroll down a long list: the column
      headings remain visible above the rows.
- [ ] **The row menu still escapes the grid.** Open a row's kebab menu near the
      bottom or right edge: the popup is drawn whole rather than clipped by the
      scroll container. It is rendered at the page root for that reason, and it
      now crosses a component boundary to get there.
- [ ] **Scrolling the grid closes an open row menu**, and the menu does not
      linger detached from its row. The unit test asserts the wiring; only a real
      scroll shows the popup actually goes.
- [ ] **Editing a row in place still fits.** Open a row for editing: the inputs
      sit inside their cells without changing the row height or pushing the
      pinned columns out of alignment.
- [ ] **Nothing in the grid animates.** The page's reduced-motion rule was left
      behind deliberately, on the finding that no grid rule declares a transition
      or an animation. Any movement seen here - a hover fade, a row transition -
      means that finding was wrong and the rule has to be copied into the child.

## C8. The pipeline card, after it left the board

The card's insides are a child now, but `.card` and `cdkDrag` stayed on the page,
on that child's host element. **Drag-and-drop is the whole risk here and jsdom
cannot drag at all** - the suite can prove each card is a registered draggable
with its placeholder resolved, and nothing beyond that. Needs applications on the
board, at least one at Interview with a scheduled stage. Run section A first.

- [ ] **A card can still be dragged between columns.** Pick one up in Applied and
      drop it in Interview: the status changes and the card stays where it was
      dropped. This is the single check that would catch `cdkDrag` no longer
      being content of its drop list, which every automated check here misses.
- [ ] **The dragged card sits under the pointer rather than trailing it.** This is
      the bug `_drag.scss` and `drag-styles.spec.ts` exist for, and the `.card`
      rule it depends on now lives on a component host rather than on an
      `<article>`. Drag slowly across the board: no echo, no lag.
- [ ] **The drop animation still runs**, and the gap the card leaves behind shows
      the dashed placeholder at the right size while the drag is in progress.
- [ ] **The other cards reflow around the gap.** `.col__list.cdk-drop-list-dragging
.card` reaches from the page's drop list into the host element; if the
      selector stopped matching, the other cards would jump rather than slide.
- [ ] **A card still looks like a card.** Hover one: the lift, the border and the
      shadow are the page's `.card` rule, while everything inside it is now the
      child's sheet - the seam a screen would show as a card whose box and
      contents disagree.
- [ ] **The interview stage track shows in the Interview column only.** An
      application that moved on to Offer keeps its stage data; the track must not
      follow it there. Counted in the suite, but only per rendered column.

## C9. Discover, after the keyframe relocation and the dialog extraction

Four keyframes moved out of the page sheet and two dead rules were deleted.
**Keyframe names are global, so a relocation is invisible to every check here** -
the animation either plays or it silently does not, and jsdom has neither. Needs
at least one enabled source and a feed with rows; the clear-feed check wipes the
feed, so do it last.

- [ ] **The scan console's cursor still blinks** while a scan is running, and the
      scanning button still pulses. `dv-blink` stayed on the page and `dv-pulse`
      moved to the global partial - if the move went wrong, the button is simply
      static and nothing errors.
- [ ] **The skeleton still shimmers** while the feed loads. `dv-shimmer` moved
      with `dv-pulse`; same failure mode.
- [ ] **The sources drawer still slides in** rather than appearing. `dv-slidein`
      moved into the drawer's own sheet, and the drawer was its only consumer.
- [ ] **The filter menu and the full job detail still fade in.** `dv-fade` has
      three consumers across two children and the page, and now lives in the
      partial that reaches all of them.
- [ ] **The clear-feed dialog still pops in**, centred, over a dimmed backdrop.
      `dv-popin` travelled into the extracted component with the only rule that
      used it.
- [ ] **The dialog still cancels three ways and wipes one.** Escape, the Cancel
      button and a click on the backdrop all close it without wiping; only the
      red button wipes. The suite covers all four, but the backdrop is a large
      target next to a destructive action and is worth seeing.
- [ ] **The feed footer still reads correctly.** Two rules under it were deleted
      as unreachable - `.dv-footer__actions` and `.dv-footer__confirm`. Nothing
      renders them, so nothing should change; this is the check on that claim.

## C10. The CV preview, after the six atoms became child components

Six of the eight atom templates left `cv-preview.component.html` and each now
declares its own markup. **Angular's emulated encapsulation binds a rule to the
component that DECLARES the markup**, and the paginated sheet measures each
atom's natural height off the wrapper it renders into - so a wrong host box or a
missing `@use` changes the printed layout with every automated check still
green. jsdom has neither layout nor pagination, and the reachability audit only
proves the rules exist in the child's compiled sheet, not that the page looks
right. Needs a CV with several experience entries (enough to cross a page
break), education, skills and languages.

- [ ] **The CV still paginates where it did.** Open a CV long enough to run to a
      second page, and check the page break falls between the same entries as
      before. Six `:host { display: contents }` declarations are the only thing
      keeping each child's host out of the measured box.
- [ ] **Every section title still reads as one.** Uppercase, letter-spaced, with
      its underline rule running straight edge to edge rather than curving in at
      the corners. Four components now declare that rule from one partial.
- [ ] **The experience head still lays out as one line.** Company, industry and
      location on the left, dates on the right, with Aurora's thin rule under
      it - and education, which shares the same partial, showing **no** rule.
- [ ] **Bullets still hang under their entry** with the list indent, and a long
      entry still splits head-from-bullets across a page break.
- [ ] **Selecting a leaf still rings exactly one element**, and the inline editor
      that replaces it sits at the text's own width rather than stretching the
      whole column. Four atoms `@use` that sizing rule from one partial.
- [ ] **Click-a-word bold still works in the summary and in a bullet**, and
      nowhere else. The rewrite moved to `CvPreviewEditingService`; the two
      atoms are the only callers.
- [ ] **Skills rows and the languages line still read at their normal weights**
      and separators, with the printed PDF matching the on-screen sheet.

## C11. The CV save-as-template dialog, after its buttons were fixed

One check, and it is the whole of the bug: the dialog's two buttons were
rendering unstyled and no automated gate could see it, because a class name that
matches nothing fails silently. The suite now asserts the design-system classes
are present, which is a claim about the DOM, not about the paint.

- [ ] **The Save-as-template dialog's buttons look like buttons.** CV editor,
      Save as template: Cancel reads as a ghost button and Save as the primary
      one, both matching every other dialog in the app - not as unstyled
      browser-default buttons. Type a name and confirm Save enables.

## D. Carried from the fallback audit

Both were named as the next action on 2026-08-14 and neither has been run.

- [ ] **The interview stage panel.** An application with no stages offers the quick-add form; an
      application whose stage read _failed_ shows the failure and does **not** offer the form. The
      second half is the bug that was fixed - accepting the form there would have written a duplicate
      first stage - and it is free to check by opening the panel with the database available and then
      unavailable.
- [ ] **The ATS line.** **(costs a full tailoring run plus a rescore)** This is why it has not been
      spent unasked.

## E. Release

- [ ] Let an installed `0.29.1` offer the `0.29.2` update, so the download-and-install path is
      exercised once end to end. Everything else about the release is verified; the signature chain
      and the manifest were checked mechanically, but no update has been _taken_.

Not listed, because it is done: the packaged macOS window has been seen rendering styled from the
`0.29.2` dmg.
