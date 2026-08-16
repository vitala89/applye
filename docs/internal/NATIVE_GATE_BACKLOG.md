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

## C. Carried from the fallback audit

Both were named as the next action on 2026-08-14 and neither has been run.

- [ ] **The interview stage panel.** An application with no stages offers the quick-add form; an
      application whose stage read _failed_ shows the failure and does **not** offer the form. The
      second half is the bug that was fixed - accepting the form there would have written a duplicate
      first stage - and it is free to check by opening the panel with the database available and then
      unavailable.
- [ ] **The ATS line.** **(costs a full tailoring run plus a rescore)** This is why it has not been
      spent unasked.

## D. Release

- [ ] Let an installed `0.29.1` offer the `0.29.2` update, so the download-and-install path is
      exercised once end to end. Everything else about the release is verified; the signature chain
      and the manifest were checked mechanically, but no update has been _taken_.

Not listed, because it is done: the packaged macOS window has been seen rendering styled from the
`0.29.2` dmg.
