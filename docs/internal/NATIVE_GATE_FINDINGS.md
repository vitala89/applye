# Native gate walk - findings

What the manual walk of `NATIVE_GATE_SCRIPT.md` turned up that is **not** a tick in
`NATIVE_GATE_BACKLOG.md`: bugs to fix, behaviour the maintainer wants changed, performance
complaints, and AI-output quality problems.

The backlog records whether a check passed. **This file records what to do about it.** A failed check
appears in both: ticked as failed there, described here.

It is the work queue for after the walk. **A fixed item keeps its entry and gains a `Fixed` note**, so the reasoning that produced the fix stays next to the symptom that found it.

## Walk of 2026-08-20

Data: `tools/capture/seed.mjs` (13 jobs, 8 applications, 5 stages, 12 sources, 1 profile). Dev build.

**46 of 83 checks passed, 3 failed, 1 could not run, and the rest need something the walk could not
supply** - a system setting, a fresh profile, a data shape the seed does not produce, or a release
that does not exist. `NATIVE_GATE_BACKLOG.md` carries the per-section breakdown.

**Fix in this order**, because two of these cost the user money and the rest do not:

1. ~~**`B1`** - cancelling a tailor destroys the score and both generated documents.~~ **Fixed**,
   see the entry below. Still owed a native re-walk of station 3 check `A` item 7 and station 12.
2. **`B11`** - cover-letter generation fails on the first attempt and works on the second, so every
   letter is paid for twice.
3. **`B8`** - the job title is a fragment of the description, and it feeds the archetype screen, the
   score and the tailoring prompt.
4. **`S1`** - two and a half minutes to a first document, half of it in the dual critique.
5. **`B2`**, then the print family **`B4` `B5` `B6`**, then **`B9`** and **`B10`**.

`P1` and `P2` are one change and `P2` is already half-built. `P3`, `P4` and `P5` are decisions rather
than defects. `Q2` and `Q3` are evaluation work that should be sized before it is started.

### Bugs

**B1. Cancelling a re-tailor blanks the job detail, and the data is still there. FIXED 2026-08-20.**
Reproduce: open a job that has been tailored → **Retailor** → **Next** → **Cancel** / **Discard**.
The app returns to the job and the detail renders **empty**. Navigating away to the jobs list and
clicking the same job again brings **all of it back**.

So nothing was deleted - the screen dropped its state and did not re-read. **This is the failure
that `A` item 7 exists to catch** ("the card holds its value and then reloads - it must not blank
between the write and the refresh"), and it is the one check of station 3 that failed. Look at what
the discard path does to the store that owns the job-detail screen: it most likely clears and never
re-loads, where the list route re-loads on entry.

**Station 12 showed the blank screen is the smaller half of this bug.** Cancelling the tailor also
destroys work that was paid for:

- **the score is gone.** The job comes back offering **Score this job** again, and a later re-tailor
  spends a fresh `Update score` call re-deriving what had already been computed;
- **the generated documents are gone.** On the next run's **Review documents** step, the CV and the
  cover letter both read **Missing**, and both have to be generated again.

That is real money and several minutes per cancel, and it makes **check `A` "discard a tailoring"
fail**: the job does not return to its prior state, it returns to a state before any work was done at
all. Whatever the discard path is unwinding, it is unwinding past its own transaction - it should
drop the in-flight pass and nothing else.

Fix this before `B4`, `B5` and `B6`: they are cosmetic and this one costs the user tokens.

**Fixed, 2026-08-20.** Two defects sharing one symptom, and the diagnosis in the paragraph above was
right on both counts.

- _The blank screen._ `JobActionsStore.discardTailoring` called `resetJobScopedState()` and stopped.
  `enterJob` does not re-read when the route still points at the id it already loaded, so nothing
  reloaded until the user left for My Jobs and came back. It now awaits `lifecycle.loadJob(id)`, the
  same thing `updateApplication` was already doing.
- _The destroyed documents._ `TailoringDiscardService` deleted every linked document with
  `isApplicationDraft` set, with no notion of which pass produced it - and a job tailored once but
  never exported keeps both documents in draft, so cancelling the **second** pass deleted the
  **first** pass's work. `document_library_delete` unlinks then deletes, so it was permanent. A new
  `TailoringPassDraftsService` records a draft as the pass's at the single place one is created, and
  the discard may destroy nothing else. `ADR-0003` amendment one carries the reasoning.

The score reappearing as **Score this job** was the blank screen, not a third deletion:
`TailorScoreService` only ever held the in-memory post-tailor rescore, and the baseline in
`scoring_cache` was never touched.

**Not covered by the suite**: the native re-walk of station 3 check `A` item 7 and station 12. The
regression tests pin both halves at the store seam, which is where the loss became observable, but
the walk is what saw the symptom.

**B2. A CV editor section shows an open chevron over an empty body.**
Seen in the **CV editor's section accordion**. In the reported screen `EDUCATION` has its chevron
turned right (closed) with no body, which is correct, while `SKILLS` and `LANGUAGES` have the chevron
turned **down** - the open position - and show nothing under it.

**Confirmed by the maintainer: the section had content, was open, closed correctly on the first
click, and then would not re-open** - only the chevron changed. So the entries exist and the body is
being held at zero height.

**The cause is the disclosure animation, and it is a WebKit problem.**
`apps/desktop/src/app/pages/documents/editor-shell/_disclosure.scss` opens and closes with an
`fr`-unit grid transition:

```scss
.docedit-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--dur-base) var(--ease-out);
}
.docedit-collapse--closed {
  grid-template-rows: 0fr;
}
```

Everything else about the mechanism is sound: `CvDetailPageStore.toggleSectionCollapse` only adds or
removes the key, the body stays in the DOM, and the child carries the `overflow: hidden; min-height:
0` the technique requires. **The `0fr → 1fr` transition is the part WebKit does not honour** - it
collapses, and then does not come back. Tauri renders in WKWebView on macOS, while every automated
check runs in jsdom or Chrome, which is exactly why nothing caught it.

**This is not local to the CV sections.** `_disclosure.scss` is the editor shell's shared partial, so
every disclosure built on `.docedit-collapse` is suspect - the CV Style card, and the cover-letter
editor's blocks. Check those before fixing, and fix once in the partial.

A fix has to stop relying on animating an `fr` value: animate `max-height`, or use
`interpolate-size: allow-keywords` with `height: auto` where the engine supports it, or drop the
animation for a plain show/hide. Whatever is chosen, **it cannot be verified in jsdom** - it needs
another native pass on this same station.

**B3. Cmd+P in the CV preview opens nothing.**
The print dialog never appears, so **check `C` "press Cmd+P directly in the CV preview" cannot be
performed at all** - and neither can the two properties it exists to assert (that the output shows
the last committed text with no inline control, and that the uncommitted draft is discarded rather
than saved). Export from the button works, so the print path itself is alive; it is the keyboard
entry point that is dead. Nothing else in the app is reached by Cmd+P, so a swallowed shortcut or a
missing handler is the place to look.

**B4. The exported PDF does not use the margins shown in the editor.**
In the live preview the four margin values from the Style card are respected and the page looks
correct. Export to PDF - both to the print dialog's preview and to a saved file - and **page one
loses its margins**: the content sits closer to the paper edge than the editor showed.

This is the first half of check `C` "export the CV to PDF … margins in the output match the four
values in the Style card", and it **fails**. It also means the second half of that check - that a
second export in the same session wins over the first - cannot be judged yet, because the baseline
is already wrong.

**B5. `LANGUAGES` is indented and narrowed on the second page of the export.**
On the exported page two, `EDUCATION` starts at the left margin with its rule running the full
width, and `LANGUAGES` directly below it starts roughly a third of the way in, with a rule that stops
early. The two sections use the same section-title treatment, so one of them is being laid out inside
a container it should not be in - most likely the last section inherits a wrapper when it lands after
a page break.

Visible only in the export; the on-screen preview is correct, which is why no screen check caught it.

**B6. The tracker export produces a trailing blank page.**
Export the Job Tracker report when the content fits on **one** page: the saved file has **two**, the
second empty. The first page itself is correct.

Same family as `B4` and `B5` - the print stylesheet, not the screen - so all three are worth fixing
in one pass over the print path. A stray trailing element with a page-break, or a container whose
height is rounded up past the page box, is the usual cause.

**B7. The script's own database handling was unsafe, and it cost the walk its data twice.**
Not a defect in the app - a defect in `NATIVE_GATE_SCRIPT.md`, fixed in the same session it was
found. Recorded because it is the reason two stations had to be redone.

The database runs in **WAL mode**, and the script treated `applye.db` as if it were the whole
database in three places:

1. **The pre-flight backup** used `cp` on `applye.db` alone. Recent writes were in `applye.db-wal`,
   so the "backup" came out at **4 KB against a 1.6 MB database**. It now uses `sqlite3 .backup`,
   which folds the journal in, with an instruction to check the size before trusting it.
2. **Station 11** hid `applye.db` and left `-wal` and `-shm` in place. The app made a fresh empty
   database and a **new** journal; moving the original back put a good file under a foreign journal,
   SQLite replayed it, and the app came up empty with the data apparently lost. It now moves all
   three and clears what the app created before restoring.
3. **Station 13's restore** copied `~/Desktop/applye-backup-*.db` by **glob**. The wildcard expands
   alphabetically, so a later or accidental backup silently wins - and in this walk a 4 KB empty one
   sorted after the good one. It now names the file explicitly and removes the journal first.

Nothing was lost in the end: the data was recovered by deleting the mismatched journal. **The general
rule, worth keeping past this walk: a WAL database is three files, and any instruction that names
only one of them is wrong.**

**And a fourth, worse than the other three: station 11's scenario could never have worked.** It asked
for the database to be moved aside so the stage read would fail - but with no database the app builds
an empty one, so there is no application to open the panel on and **nothing to observe**. The station
was written from the intent rather than from a run.

The station now renames `interview_stages` instead, which is the state the check actually describes:
the application is there, the stage read fails, and the question - does the panel offer the quick-add
form when it should not - can be asked. **Check `D` "the interview stage panel" is therefore still
unrun**, and it is a regression check for a real bug, so it should not be left that way.

**B8. The job title is a truncated sentence from the description.**
On a scanned Vantaform GmbH listing, both the job card and the `FIT SCORING` card show
`Roughly 70% frontend, 30% Node services. An internal logistics tool used by 300` - a fragment of the
body text, cut mid-sentence, where the **role title** belongs. The company and location resolve
correctly, so it is the title field alone that is wrong.

**This is `Q2` caught in the act**, and it is worse than a cosmetic slip: the title feeds the
archetype screen, the score and the tailoring prompt, so every one of them is reasoning about a
sentence fragment instead of a job title. The oversized heading in the scoring card is what made it
visible; the heading style itself looks deliberate, and **the defect is the value put into it**, not
its size.

**B9. The wizard's footer padding is inconsistent.**
The row holding **Back**, **Cancel** and **Continue** sometimes has bottom padding and sometimes has
none - it varies between steps rather than between screens sizes. One step's layout is missing what
its neighbours have.

**B10. The in-progress spinner wobbles.**
Leave a tailoring run and move to another section: the "still running" chip appears with a circular
progress icon, and the circle does not rotate around its own centre - it visibly wanders. A transform
origin that is not the icon's centre, or a rotation applied to a box larger than the glyph.

**B11. Generating a cover letter fails on the first attempt and works on the second.**
Reported as recurring, not a one-off: the first **Generate cover letter** cuts off, and pressing
generate again produces the letter normally. CV generation on the same run did not do this.

Two attempts means the user pays twice, and a failure that clears itself on retry is the kind that
never gets diagnosed because the retry always works. **Worth capturing the provider error on the
failed attempt** rather than guessing - the difference between a timeout, a truncated response and a
schema rejection decides the fix.

### Behaviour the maintainer wants changed

**P1. Creating an application must not mark it `applied` by itself.**
Today the tailor flow's **Create application** step writes the status as `applied` immediately. That
is wrong: the user has not applied yet. Applying happens **on the employer's site** - they fill the
form there, submit it, and only then come back and say so here.

Wanted: the application is created and saved as **tailored**, and the user presses **Apply**
themselves when they have actually applied.

**P2. `applied` is a terminal state for editing.**
Once the user has pressed Apply, the submission is out of their hands, so the app should stop
offering to change what was sent:

- editing the application is closed;
- the **Retailor** button is disabled.

Both follow from the same reasoning - there is nothing useful to change about a document that has
already been submitted, and offering it invites the user to think the sent version changed.

**Half of this already exists**, which makes it a smaller job than it reads. An applied job shows
`Applied - description is locked` and the description is indeed read-only. What is still offered is
**Retailor**, and it runs - the walk re-tailored an applied job without resistance. So the mechanism
and the wording are in place; the gap is one button.

P1 and P2 are one change: without P1 the state is reached by accident, and P2 is what makes reaching
it meaningful.

**P4. Moving a card back out of Interview leaves its interview stages with nowhere to live.**
Drag a card into **Interview**, create its stages, then drag it back to **Applied**. The stages
survive - which is deliberate, and `C8`'s own check asserts it for the move to Offer, so that data is
not lost when a card moves. But the Applied column says nothing about them, and Interview Prep still
holds a stage set for a job that is no longer at interview.

Three ways out, and the choice is the maintainer's:

1. **Drop the stages** when the card leaves Interview. Simplest, and loses work the user did.
2. **Keep them and mark the card** - Applied shows that this job already has interview preparation
   recorded, so the user can go back to it or clear it deliberately.
3. **Keep them and ask** at the moment of the move: keep or discard.

Option 2 fits the rest of the app, which never deletes user work silently, and it is the only one
that makes the Interview Prep entry explicable rather than orphaned. **Not decided; recorded so the
next pass does not rediscover it.**

**P5. What the Job Tracker should show once the job behind a row is deleted.**
The maintainer's proposal: keep the row as an archive entry, and make the company link explain
itself - open the job when it still exists, and say "this job no longer exists, it was deleted" when
it does not, leaving the user to remove the row deliberately if they want it gone.

The instinct is right - **a submitted application is a record of something the user did**, and
deleting the listing should not erase the fact that they applied. But the proposal as stated works
against the current schema rather than with it. `deleteJob` is a **hard delete**: it removes the job
and every dependent row - applications, scoring, tailoring, interview data - which is exactly what
the walk confirmed on station 13, where the deleted job left the tracker and the pipeline together.
Keeping the row means letting an application outlive its job, and then **every screen that joins the
two has to render the orphan**: the tracker, the pipeline, analytics, the document library.

**The cheaper shape with the same outcome is to archive the job instead of deleting it.** One flag,
one filter on the lists, and nothing else changes: the tracker row keeps a real job to point at, the
company link keeps working, history and analytics stay honest, and a genuine delete remains available
for the case the user actually means it - "remove this and everything about it".

That also answers the question the proposal leaves open, which is what the tracker should _do_ with
an orphan row it can no longer explain. With archiving there is never an orphan.

**Not decided - this changes a schema and belongs to the maintainer.** Recorded with the reasoning so
the choice is between two designs rather than between a design and a blank.

**P3. The tracker grid does not say which cells are editable, and the walk stopped on it.**
The maintainer asked whether it is a bug that some optional columns cannot be edited inline. **It is
not** - `ApplicationTrackerFieldsInput` accepts exactly `contactName`, `contactRole`,
`contactChannel`, `nextAction`, `nextActionAt`, `salaryRange`, `notes` and the custom-column blob.
Everything else in the grid is a **projection**: company, title and location belong to the job, and
status and its dates to the application, each edited where it actually lives - status through its own
control rather than as text in a cell.

So the boundary is right and the interface does not explain it. If the person who wrote the rule had
to check the model to remember it, a user has no chance. **This is a design question rather than a
defect**: should a read-only cell look read-only - no hover affordance, no caret - or should the grid
say once, somewhere, that only the tracker's own fields are editable? Adding a custom column works
and edits correctly, which is the part that had to keep working.

### Performance

**S1. The tailoring run is too slow, and the `dual critic` pass is the worst of it.**
Slow enough to be the first thing reported about the flow. Needs measuring before it is optimised -
where the wall-clock actually goes, per pass, rather than a guess at the prompt size.

**S2. "How the tailoring changed" is slow for the same reason** and should be looked at with S1
rather than separately.

**Measured on the 2026-08-20 walk**, which is what S1 was missing:

| step                     | wall clock |
| ------------------------ | ---------- |
| first tailoring pass     | ~60 s      |
| **dual critique**        | **~60 s**  |
| building                 | faster     |
| update score             | ~20 s      |
| generate CV (from empty) | ~30 s      |

So a full run is **two and a half minutes or more before the user sees a document**, and the dual
critique is half of it. That makes the critique the first thing to look at: whether it needs two
passes at full document length, whether it can run against a diff, and whether it can overlap the
build instead of blocking it.

**The cache is doing its job** and is not part of this problem: re-running the same tailoring with
nothing changed returned from cache, with no provider call.

### AI output quality

**Q1. The generated CV flattens Skills into one line.**
It produced a single `Skills` heading with `TypeScript, Angular, React.js, Node.js, Playwright` run
together. It should group them by category - languages, frameworks, system design, testing, and so
on - which is both the standard CV shape and what the section is structured for.

This is a prompt problem rather than a rendering one: the section supports groups, and the model did
not produce them.

**Confirmed on station 6, and worth recording because it settles the question.** A different CV in
the same walk exported with its skills **properly grouped** - `Programming Languages`,
`Frameworks & Libraries`, `Runtime & Tooling`, `Testing & Quality`, `Frontend Architecture`, each
with its own list. So the section, the model and the renderer are all capable of grouped output, and
Q1 is a **generation consistency** problem: sometimes grouped, sometimes flattened into one line.
Fixing it means constraining the prompt or the schema, not building the feature.

**Q2. The job-description parser needs its accuracy measured, not eyeballed.**
Discover's scan, its sources and saving all work; what is unverified is **how well the description is
actually extracted** from a real listing - whether the body arrives whole, whether boilerplate,
cookie banners and "about us" blocks come with it, and whether anything is truncated.

This cannot be settled by looking at one listing. It needs a small fixed set of saved real pages, an
expected extraction for each, and a check that runs against them - otherwise every future prompt or
selector change is a guess. **Everything downstream depends on it**: the score, the archetype screen
and the tailoring all read this text, so a parser that quietly drops half a description degrades all
three while looking fine on screen.

**Q3. The match score has to be shown to be honest.**
The concern is the score claiming a good match where there is not one. Same shape of problem as Q2
and it inherits Q2's risk - a score computed over a badly-parsed description is wrong for reasons
that have nothing to do with the scoring.

What is missing is a **reference set**: a handful of jobs with a human verdict attached - clearly a
fit, clearly not, borderline - and a check that the score orders them the way a person would. Absolute
numbers matter less than the ordering and than the score not being confidently wrong at the extremes.

Both are **evaluation work rather than bug fixes**, and both should be sized before being started.

## What passed on the same walk

Recorded here because they are the counter-evidence, and because two of them are checks that no
automated test can make:

- The job detail loads with its score card, and the tailor flow's **Review documents** step produced
  a usable document.
- **No data leaks between jobs.** Opening one job after another shows no document, score or draft
  belonging to the other. This is the check the script calls the most valuable in the pass, and it
  passed.
- The Pipeline reflects the application correctly.
- Re-opening the document editor and leaving without saving writes nothing and leaves no draft
  pointing at a document that does not exist.
- **Station 4 passed in full** - all six `C` checks plus `C11`. Every section editor is styled, the
  section drag works, the Settings card's region select is sized to its content rather than stretched,
  the Style card's controls are not browser defaults, the save-as-template dialog behaves and **its two
  buttons render as a ghost and a primary** (the paint that #482 fixed and that nothing else checks),
  and the photo section draws its 3:4 thumbnail with placement chips.
- **The Style card collapses and re-opens correctly**, which narrows `B2`: the `0fr → 1fr` transition
  is not failing everywhere `_disclosure.scss` is used, so the fix belongs to the section accordion
  rather than to the shared partial. Worth re-checking the cover-letter blocks before concluding.
