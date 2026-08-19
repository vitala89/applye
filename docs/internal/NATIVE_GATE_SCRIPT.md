# Native gate script

One walkable pass over every check in `docs/internal/NATIVE_GATE_BACKLOG.md`.

The backlog says **what** is unrun and **why** no agent can run it. This file says **in what order**,
**on what data**, and **what to look at** - so the 83 checks across sixteen sections become one
sitting of fifteen stations, numbered 0 to 14, instead of fifteen separate setups. Nothing here is
new: every item is a backlog item, named by its section so the two files stay in step.

**The two files have different jobs. Do not tick anything here.** Tick the backlog, and record what
_failed_ in `docs/internal/DUTY_WATCH.md`. This file is a route; it holds no state.

## Why the order is what it is

Three constraints decide it, and they are the whole design:

1. **The welcome screen needs a database that has never been written to.** It renders only while
   `settings.healthCheckSeen` is unset, so it has to be walked **before anything is seeded** - and
   its three launches each need their own fresh profile.
2. **Everything else needs real rows**, because outside Tauri every `invoke` rejects. One seed run
   produces the profile, eight jobs, their applications, interview stages and status history, and a
   Discover source. What the seed cannot produce - a CV, a cover letter, an archived tracker row -
   is produced by an earlier station for a later one.
3. **Two checks destroy data and two cost tokens.** Both groups are held to the end, so a wipe never
   costs you a re-seed mid-pass and the paid runs are a deliberate decision rather than a surprise.

Budget roughly **90 minutes** for stations 0 to 11, plus whatever you choose to spend at station 12.

## Before you start

```bash
pgrep -fl "tauri dev"
```

Nothing should print. Then take a copy of the database you actually use, because station 0 deletes
it and station 1 overwrites it.

**Copy it with `sqlite3`, not with `cp`.** The database runs in WAL mode, so recent writes live in
`applye.db-wal` and not in `applye.db` - copying the one file alone can hand you a backup that is
almost empty while the real data sits in the journal beside it. This is not hypothetical: it happened
on the 2026-08-20 walk, and produced a 4 KB "backup" of a 1.6 MB database.

```bash
sqlite3 ~/Library/"Application Support"/dev.applye.app/applye.db ".backup '$HOME/Desktop/applye-backup-$(date +%Y%m%d-%H%M).db'"
```

`.backup` checkpoints the journal into the copy, so the result is one self-contained file. Check the
size before trusting it - a backup far smaller than the original means the journal was not folded in.

Two commands you will use repeatedly:

```bash
rm -rf ~/Library/"Application Support"/dev.applye.app
```

```bash
npm run desktop:dev
```

Quit the app fully between launches. SQLite is in WAL mode, so a running app holds cached state and
will write it back over anything changed underneath it.

---

## Station 0. The empty database - three launches

Covers **C4** (5 checks). This is the only station that must run first, and the only one that needs
the app quit and the profile deleted between steps.

**0a. Fresh profile, full-height window.** Delete the profile, launch, and watch without touching
anything: the cursor flies in and taps the mark, the slash morphs into place, the accent bar rises,
the wordmark wipes left to right, then title, tagline, buttons, hint, divider, check label and health
panel arrive in sequence. Then wait: **the caret keeps blinking** after the title settles, and it is
the only thing still moving.
→ C4 "the whole choreography plays" · C4 "the blinking caret blinks".

**0b. Fresh profile, half-height window.** Delete the profile, resize the window to roughly half
screen height **before** launching, then launch. The vertical rhythm tightens and the health panel is
reachable **without a scrollbar**. Then click **"Start the tour"**: onboarding opens.
→ C4 "a short window compresses rather than scrolls" · C4 "both ways out work" (first half).

**0c. Fresh profile, reduced motion.** Turn on Reduce motion in macOS System Settings ›
Accessibility › Display. Delete the profile, launch: everything is on screen immediately, nothing
moves, and the caret is **gone** rather than static. Click **"set up on my own"**: it goes straight
to the app. Quit, relaunch on the same profile - **neither screen returns**. Turn Reduce motion back
off.
→ C4 "reduced motion stands the whole thing down" · C4 "both ways out work" (second half).

## Station 1. Seed

Quit the app.

```bash
node tools/capture/seed.mjs --i-know-this-wipes-the-db
```

Then launch and leave it running for the rest of the pass. You now have the demo persona, eight jobs
(two at interview with stages, one at offer, one applied, the rest saved), status history, and one
Discover source.

## Station 2. Dashboard

Covers **C6** (6 checks). The seed already gives a scheduled future stage and a claimed job.

Open the Dashboard and look at the two list panels side by side: **both fill their columns**, neither
collapsed. Read their trailing elements - **Upcoming interviews shows a stage badge and a time,
Recent jobs shows a status pill, and neither shows the other's**. The stage inside the next 48 hours
takes the **accent** badge treatment while a later one does not.

Then reload the page (navigate away and back) and watch the load: **KPI tiles, queue cards and both
list panels shimmer on the same beat**. Look at the jobs skeleton's placeholder bars specifically -
their widths changed from 52%/28% to 50%/30%, and the question is only whether that is noticeable.

Finally turn Reduce motion on in System Settings and reload: **no shimmer anywhere on the dashboard**.
Turn it back off.
→ C6, all six.

## Station 3. Jobs and job detail

Covers **A** (7 of 10; the paid and destructive ones are stations 12 and 13).

In order, because each step leaves what the next one needs:

1. Open a job from the list. The detail loads: title, company, description, the scoring card.
2. **Create a CV for it.** It appears in the document library and in the job's own document list.
   Every CV station below uses this document, so make it a real one - accept the generated content
   and keep it.
3. **Open job A, then job B, then A again.** No document, score, draft or final-checks result from
   one appears under the other. **This is the most valuable check in the pass** - it is the failure
   mode the eight-store split creates, and no jsdom test can see it.
4. Mark a job applied. The card's status changes and the Pipeline reflects it.
5. Open the document editor from the job, save, and come back: the job detail shows the saved
   document.
6. Open it again, change something, leave **without** saving: nothing was written, and no draft is
   left pointing at a document that does not exist.
7. Update an application that is already marked applied. **The card holds its value and then
   reloads** - it must not blank between the write and the refresh.

→ A items 1, 2, 4, 5, 6, 7, 9.

## Station 4. CV editor, Edit mode

Covers **C** (6 of 15) and **C11** (1). Uses the CV from station 3.

Open the CV in **Edit** mode and look at each section in turn - Personal details (the two-column grid
and the "pull from profile" button), Experience (entry frames, bullet rows with their dot and remove
button, add/remove), Education (the same frames), Skills (group labels, chips, the dashed "add skill"
input), Languages (rows and the add button). **Anything that reads as unstyled - a bare input, a
button with no frame, a chip with no background - is a rule that was load-bearing after all.**

**Drag a section** by its handle. The drag preview and the placeholder both look right; CDK moves the
preview into a body-level overlay, which is the one case the static check could not settle.

Then the four cards:

- **Settings card.** The region select is a normal control **sized to its content, not stretched
  across the row**. The "is default" checkbox draws its box and fills when active.
- **Style card.** Theme select, page-size select and the four margin inputs all look like styled
  controls rather than native browser defaults. Collapse and expand the card.
- **Save-as-template dialog**, from the header. The name field is a styled input; the backdrop dims;
  Escape closes it; confirm is disabled until the name is non-blank. **And the two buttons look like
  buttons** - Cancel a ghost, Save the primary one, matching every other dialog. They were rendering
  browser-default until #482, and this is the only check on the paint.
- **Photo section.** With a profile photo: a 3:4 rounded thumbnail and three placement chips, one
  active. Without: only the "add in profile" button and its hint.
  → C "open the CV editor in Edit mode" · C "drag a section" · C's four card checks · C11.

## Station 5. CV preview and the live-style panel

Covers **C** (5 of 15) and **C10** (7). Switch the same CV to **Preview** mode.

First make the document long enough to run to a second page - add experience entries until it does.
Keep education, skills and languages populated.

**Pagination and layout:**

- **The page break falls between the same entries it used to.** Six `:host { display: contents }`
  declarations are all that keep each atom's host out of the measured box.
- **Every section title reads as one**: uppercase, letter-spaced, its underline running straight edge
  to edge rather than curving in at the corners.
- **The experience head is one line** - company, industry and location left, dates right, with
  Aurora's thin rule under it - and **education shows no rule**, though it shares the same partial.
- **Bullets hang under their entry** with the list indent, and a long entry splits head-from-bullets
  across the break.
- **Skills rows and the languages line** read at their normal weights and separators.

**Selection and editing:**

- Click a leaf: **exactly one element is ringed**, and the inline editor that replaces it sits at the
  text's own width rather than stretching the column.
- **Click a word in the summary, and a word in a bullet**: both toggle bold. Nowhere else does.
- With a body field selected, look at the **live-style panel**: the Text group's head, chevron and
  every labelled control are styled; each select and number input **spans the panel's width** while
  each colour swatch stays a small fixed square. Both group heads toggle and their chevrons rotate.
- **The Line group differs by selection** - on an experience entry head the line select offers
  **Inherit**; on a bullet it does **not**, and its first option is None.
- With APPLY TO on **"This element"**, change the line style: the paper redraws **that element only**,
  not the section divider.
  → C10 all seven · C's five panel checks.

## Station 6. Printing

Covers **C** (4 of 15). Still on the CV from station 5. Create a cover letter first if none exists.

- **Export the CV to PDF from Preview mode.** Margins in the output match the four values in the
  Style card, the page is the selected size, and **no editor chrome, caret, selection outline or side
  panel** appears. Then export a **second time in the same session** - the second export's margins
  must win, because a fresh `<style>` per export would accumulate.
- **Export the cover letter to PDF.** Same check; it runs the same code as the CV now, which it did
  not before.
- **Press Cmd+P directly in the CV preview with a leaf selected.** The output shows the
  last-committed text with no inline control, and the uncommitted draft is discarded rather than
  saved. CV-only on purpose.
- **Cancel a print dialog, then look at the app.** It is normal again - `printing-cv` is cleared on
  `afterprint`.
  → C's four print checks.

## Station 7. Tracker

Covers **C2** (3) and **C7** (6). Archive one row first - later checks want one present.

**The page:** the title row, toolbar buttons, segmented period control, table and status pills look
as they did. **`.jt__title` is the one to look hardest at** - it was deleted as matching nothing, so a
heading suddenly at default font size is what a wrong call looks like. Open the **export dialog**: its
toolbar buttons keep their border, mono type and hover state, and the primary one is still
accent-filled.

**The animations:** the export dialog and the column drawer fade-and-rise on open; a row's action menu
pops; the loading skeleton bars pulse.

**The grid:**

- **Scroll sideways.** The row number and the pinned column stay against the left edge while
  everything else moves under them.
- **Scroll down a long list.** The column headings stay visible.
- **Open a row's kebab menu near the bottom or right edge.** The popup draws whole rather than being
  clipped by the scroll container.
- **Scroll the grid with that menu open.** It closes, and does not linger detached from its row.
- **Edit a row in place.** The inputs sit inside their cells without changing row height or pushing
  the pinned columns out of alignment.
- **Watch for any movement at all in the grid.** There should be none - no hover fade, no row
  transition. The page's reduced-motion rule was deliberately left behind on the finding that no grid
  rule declares one; movement here means that finding was wrong.
  → C2 all three · C7 all six.

## Station 8. Pipeline

Covers **C8** (6) and **C5** (5). The seed gives an application at Interview with stages; you need one
**overdue** for the composer, so set a follow-up date in the past on another card first.

**The board:**

- **Drag a card from Applied to Interview.** The status changes and the card stays where it was
  dropped. **This is the single check that catches `cdkDrag` no longer being content of its drop
  list**, which every automated check misses.
- **Drag slowly across the board.** The card sits **under the pointer**, not trailing it - no echo,
  no lag.
- **The drop animation runs**, and the gap left behind shows the dashed placeholder at the right size
  during the drag.
- **The other cards slide around the gap** rather than jumping.
- **Hover a card.** The lift, border and shadow are the page's rule while the insides are the child's
  - a seam would show as a card whose box and contents disagree.
- **The interview stage track appears in the Interview column only.** Move an application on to Offer:
  it keeps its stage data, and the track must not follow it there.

**The quick view**, opened on the application at interview with several stages:

- **The stepper**: a filled track up to the current stage, a check in each passed dot, a pip in the
  current one, the current label in accent, and the head counter reading position over total.
- **The view-all link looks like a link in all three branches** - inside the stepper foot, and in the
  failed-read and no-stages-yet branches. Two copies of one rule; this is what catches them drifting.
- On the **overdue** card: the composer's language select, both recipient inputs, subject and body
  **share the sunken background, border, radius and focus ring** with the status select and comment
  box above them.
- **Both composer buttons are styled** - "Draft" a ghost, "Open in mail" filled. There is no global
  rule for either name to fall back on, which is what makes an omission silent.
- **Draft a follow-up, then change the status in the same modal.** The composer may disappear if the
  card stops being overdue; reopening must still show **the draft** rather than an empty form.
  → C8 all six · C5 all five.

## Station 9. Analytics

Covers **C3** (5). Needs the populated pipeline you now have.

**The six bar lists render identically to each other** - funnel, match-score distribution, score vs
outcome, time to response, pipeline aging and locations each show name, bar and value at the same size
and spacing. One component draws all six; a rule that failed to reach it shows as bare text with no
bar. **Only the funnel shows a conversion percentage**, and score vs outcome shows its "N
applications" caption **without** one.

Switch period, or reopen the page: **the four KPI placeholder tiles shimmer**. Those come from a
**global** partial, so before leaving, **glance at Dashboard, Jobs and Settings** - the one check that
would catch that partial colliding with something on another page.

With follow-ups logged in the period, **the trend plot draws both lines** - accent applications, grey
follow-ups - with tick labels beneath.
→ C3 all five.

## Station 10. Discover

Covers **B** (2) and **C9** (6 of 7). Run a scan first; the feed has to have rows.

While the scan runs: **the console's cursor blinks and the scanning button pulses**. While the feed
loads: **the skeleton shimmers**. Then:

- **The `.dv-filters` bar sticks** while the feed scrolls under it.
- **Narrow the window past 980px**: the two-column detail collapses to one.
- **Open the sources drawer**: it **slides in** rather than appearing.
- **Open the filter menu, then a full job detail**: both **fade in**.
- **Open the clear-feed dialog**: it **pops in**, centred, over a dimmed backdrop. Close it with
  Escape for now - the wipe is station 13.
- **Read the feed footer.** Two rules under it were deleted as unreachable; nothing should look
  different, and this is the check on that claim.
  → B both · C9's first five plus the footer.

## Station 11. The interview stage panel

Covers **D** (1 of 2). Free, and it is a real bug's regression check.

Open an application with **no stages**: the quick-add form is offered. Then make the stage read
**fail** - quit the app, move the database aside, relaunch, and open the panel:

**Hiding the whole database does not produce this state, and the instruction to do so was wrong.**
With no database the app makes an empty one, so there is no application to open the panel on - the
check cannot run at all. That is how the 2026-08-20 walk lost two stations to it.

What the check needs is an application that **exists** while the stage read **fails**. Rename the one
table, with the app quit:

```bash
sqlite3 ~/Library/"Application Support"/dev.applye.app/applye.db "ALTER TABLE interview_stages RENAME TO interview_stages_hidden;"
```

The panel shows **the failure and does not offer the form**. Accepting the form there would have
written a duplicate first stage, which is the bug that was fixed. Put it back:

Quit the app, then put the table back:

```bash
sqlite3 ~/Library/"Application Support"/dev.applye.app/applye.db "ALTER TABLE interview_stages_hidden RENAME TO interview_stages;"
```

→ D "the interview stage panel".

## Station 12. The paid checks - decide before you start

Three checks cost provider tokens. **They are here so the decision is deliberate**, and skipping them
is a legitimate outcome; say so in the watch entry rather than leaving them looking done.

- **Run the final checks on a job.** → A "run the final checks".
- **Run a tailoring, then discard it.** The draft goes and the job returns to its prior state. →
  A "discard a tailoring".
- **The ATS line.** Costs a full tailoring run plus a rescore. → D "the ATS line".
- **Re-run the tailoring you just paid for, with nothing changed.** It returns without a provider
  call - the cache is being hit through `DraftsGateway` now. → C12 "a tailoring pass is served from
  cache".

**And one free check that belongs with station 8**, where the composer already is: draft a follow-up
on the overdue card, close the quick view, reopen it - **the draft is still there**. → C12 "a
follow-up draft survives and is re-read".

## Station 13. Destructive - last, and in this order

Both wipe data the earlier stations depended on.

- **Discover's clear-feed dialog.** Open it and cancel **three ways** - Escape, the Cancel button, and
  a click on the backdrop - confirming each time that the feed is still there. **The backdrop is the
  one worth seeing**: it is a large target next to a destructive action. Then press the red button:
  the feed is wiped. → C9 "the dialog still cancels three ways and wipes one".
- **Delete a job.** It leaves the list, the Pipeline **and** the document associations. → A "delete a
  job".

Restore your own database when the pass is over:

Quit the app first. **Name the backup file explicitly rather than using a glob** - the wildcard
expands in alphabetical order, so a later, smaller or accidental backup wins over the one you want,
and you overwrite good data with it. Delete the journal too, or SQLite replays the walk's writes over
the file you just restored.

```bash
rm -f ~/Library/"Application Support"/dev.applye.app/applye.db* && cp -v ~/Desktop/applye-backup-<the-one-you-made>.db ~/Library/"Application Support"/dev.applye.app/applye.db
```

## Station 14. Release - separate machine state

Covers **E** (1). Not part of the sitting above: it needs an **installed** build, not a dev one.

**This station cannot run as originally written, and it is nobody's fault but the release history.**
It said to install `0.29.1` and let it offer `0.29.2`. That draft release was deleted as superseded -
only its tag remains - so there is nothing to install, and the copy that exists locally is the broken
build that would not open, which is why it was superseded in the first place.

**Deferred to the next release, deliberately.** When `0.29.3` ships, install the published `0.29.2`,
launch it, and **let it offer the `0.29.3` update**. Take the update. The signature chain and the
manifest have both been verified mechanically; what has never happened is an update being _taken_,
and that is the whole point of the check.

Doing it this way is also a better test than the original: it upgrades **from a release that is
actually published**, which is the path a real user is on. → E.

## Coverage

Every backlog check has exactly one station. If a section grows, add its items to the station that
already owns that screen rather than to the end of this file.

| Section | Checks | Station                                          |
| ------- | -----: | ------------------------------------------------ |
| A       |     10 | 3 (seven) · 12 (two paid) · 13 (one destructive) |
| B       |      2 | 10                                               |
| C       |     15 | 4 (six) · 5 (five) · 6 (four)                    |
| C2      |      3 | 7                                                |
| C3      |      5 | 9                                                |
| C4      |      5 | 0                                                |
| C5      |      5 | 8                                                |
| C6      |      6 | 2                                                |
| C7      |      6 | 7                                                |
| C8      |      6 | 8                                                |
| C9      |      7 | 10 (six) · 13 (one destructive)                  |
| C10     |      7 | 5                                                |
| C11     |      1 | 4                                                |
| C12     |      2 | 12 (one paid) · 8 (one free)                     |
| D       |      2 | 11 (one) · 12 (one paid)                         |
| E       |      1 | 14                                               |
| **83**  |        |                                                  |
