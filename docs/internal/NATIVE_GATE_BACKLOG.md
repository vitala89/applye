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
