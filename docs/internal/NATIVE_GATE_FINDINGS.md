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
   letter is paid for twice. **Instrumented on 2026-08-20 rather than fixed**: the failure now names
   its cause, and the parse asymmetry found underneath it is closed. The next occurrence is what
   settles it.
3. ~~**`B8`** - the job title is a fragment of the description.~~ **Fixed** in the deterministic
   extractor, see the entry below. Still owed a native re-parse of a hard-wrapped posting.
4. **`S1`** - two and a half minutes to a first document, half of it in the dual critique.
   **Blocked on one measurement, not on a decision**: reading the prompt disproved the hypothesis
   this file was carrying, and the numbers that replace it are already in `tailoring_cache`. The
   query is in the `S1` entry below. `S3`, found while reading it, is separate.
5. ~~**`B2`**~~ **fixed 2026-08-21** - and it is the one item in this file that **no check here can
   confirm**, so it is owed a native pass on station 4 before it counts. Then the print family
   ~~**`B4`**~~ and ~~**`B6`**~~ **fixed 2026-08-21**; ~~**`B5`**~~ **fixed as a side effect of `#511`,
   natively confirmed 2026-08-22** - see its entry below for the reasoning, since it was never touched
   directly. Then ~~**`B10`**~~ **fixed 2026-08-21**; **`B9`** is a finding that cannot be isolated
   from the repository and says below what would settle it.

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

**B2. A CV editor section shows an open chevron over an empty body. FIXED 2026-08-21.**
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

**Fixed, 2026-08-21, in the partial, for all six disclosures.** `.docedit-collapse` now collapses by
`height: 0` to `height: auto` with `interpolate-size: allow-keywords`, and `display: grid` is gone
with the `fr` units it existed for. Every one of the six call sites wraps its content in exactly one
child, so the container was a single-item grid and is now a plain block.

**The replacement was chosen for how it fails, not for how it looks.** Block layout with a height is
what every engine has implemented for decades, so the control is correct even where nothing animates;
`interpolate-size` then lets engines that support animating to a keyword ease it. The old technique
degraded into a **broken** control on one engine, this one degrades into an unanimated one.

**The narrowing recorded on the walk - "the Style card re-opens correctly" - was checked and does not
change the fix.** Both markups are structurally identical (`.docedit-collapse > div > content`), so
the difference is the content: the CV sections hold component hosts with their own editors, the Style
card holds plain fields. One disclosure happening not to break is weaker evidence than the technique
being unreliable in the engine, and the finding's own instruction was to fix once in the partial.

**`interpolate-size` is declared on the element, not on `:root`.** It is inherited, so a global
declaration would quietly enable keyword interpolation for every other transition in the app.

**What the suite can and cannot say.** `apps/desktop/src/disclosure-css.spec.ts` scans the partial
and fails if an `fr`-unit track transition returns, if the closed state stops clipping, if
`interpolate-size` goes global, or if reduced motion is dropped. **None of that is evidence the bug is
gone** - jsdom has no layout and the engine that broke is not in this repository. Station 4 is what
settles it, and the CV Style card, the cover-letter blocks, its body paragraphs and its recipient
block should be opened and closed twice each on the same pass, because they now share the changed
rule.

**Found while fixing, not fixed: the closed content stays in the tab order.** `overflow: hidden` hides
it visually and leaves it focusable, so a keyboard user tabs into a collapsed section. That was true
of the `fr` version too, so it is not a regression - it is a separate defect, and closing it means
`inert` or `aria-hidden` across six templates rather than one rule.

**B3. Cmd+P in the CV preview opens nothing.**
The print dialog never appears, so **check `C` "press Cmd+P directly in the CV preview" cannot be
performed at all** - and neither can the two properties it exists to assert (that the output shows
the last committed text with no inline control, and that the uncommitted draft is discarded rather
than saved). Export from the button works, so the print path itself is alive; it is the keyboard
entry point that is dead. Nothing else in the app is reached by Cmd+P, so a swallowed shortcut or a
missing handler is the place to look.

**B4. The exported PDF does not use the margins shown in the editor. FIXED 2026-08-21, second attempt.**
In the live preview the four margin values from the Style card are respected and the page looks
correct. Export to PDF - both to the print dialog's preview and to a saved file - and **page one
loses its margins**: the content sits closer to the paper edge than the editor showed.

This is the first half of check `C` "export the CV to PDF … margins in the output match the four
values in the Style card", and it **fails**. It also means the second half of that check - that a
second export in the same session wins over the first - cannot be judged yet, because the baseline
is already wrong.

**Fixed, 2026-08-21. The margins are content now, not a page property.** `@page` carries the paper
size and `margin: 0`; `.page-card` keeps in print the padding it already draws on screen, so the
inset is ordinary box layout rather than a paged-media feature the renderer has to honour. Same
reasoning as `B2` - chosen for how it fails.

**A previous session tried a zero page margin, hit scaled margins and a blank trailing page, and left
a test forbidding it.** That tripwire was real and is rewritten rather than stepped over. The
configuration it forbade is not this one: it kept the card at a **fixed page width and height in
pixels** and broke **after every card including the last**. A page-sized box printed onto a
full-bleed sheet is what the renderer scales, and a break after the final card is what emits the
empty page. The card is content-sized here (`width: auto`, `height: auto`) and only cards two onward
break before themselves.

**What decided it: both shipped configurations have now failed a native pass** - the zero-margin one
as recorded in that test, and the four-margin one as this finding. Keeping the current rule was not
the conservative option it looked like.

**The native pass of 2026-08-21 rejected that attempt, and the reason is dimensional rather than
incidental.** Page one came back correct and **page two lost its inset**: the print preview showed
`EDUCATION` and the bullet above it moved off page one, landing at the very top edge of page two,
where the on-screen preview had page one ending with `EDUCATION` and page two starting at `SKILLS`.

`paginate.util.ts` packs content into `pageHeightPx - marginTop - marginBottom`. A card carrying the
margins as **padding** is therefore **exactly one page tall**, whatever else is true of it. Printed
onto a sheet whose printable area is smaller than the paper by any amount at all, it overflows, and
`break-inside: avoid` moves a whole section onto a second page - which has no top inset, because
**padding belongs to a box and a margin belongs to every page it spans**. The old tripwire was right
about the outcome even though its stated reason described a different configuration.

**What was actually wrong was the pinning, and that is now removed at its cause.** The sheet was
`position: absolute` because `.shell` is `height: 100vh; overflow: hidden`, `.main` is
`overflow: hidden` and `.content` is the scrolling box - three clips a flowed sheet could not escape.
The print rules unclip all three and drop the sidebar and topbar with `display: none`, so the sheet
is an ordinary block at the top of the document, the `@page` margins own the inset again, and they
repeat on every page. The card goes back to `padding: 0`, which makes it shorter than the page area
and unable to overflow.

**The second attempt was also rejected, on 2026-08-21, and the symptom named the cause.** The
maintainer reported that on page one **the top inset was larger than the Style card asks for**, and
that page two still did not match. A top inset larger than the page margin is the signature of a flow
that starts lower than the page area does.

**`visibility: hidden` reveals without reclaiming.** The print stylesheet hid the whole app that way
and made the sheet visible again - but the property is _defined_ to preserve layout, so every hidden
sibling above the sheet kept its full height. While the sheet was pinned with `position: absolute`
this cost nothing, because a pinned box is out of flow. Unclipping the flow so the page margins could
reach every page is exactly what made that borrowed height real: the first page's inset became the
page margin **plus the height of the hidden editor column above the sheet**.

**`display: none` is what removes a box, and the sheet's ancestors have to be spared.** The CSS way to
say that is `:has()`, and it fails in the wrong direction - an engine that does not understand it
drops the whole rule and prints the entire application. So `markPrintPath` in `wysiwyg-print.ts`
walks from the sheet up to `<body>` marking each ancestor, both print paths call it, and the
stylesheet drops every child of a marked element that is not itself marked and is not the sheet. The
`visibility` pair stays underneath as the floor: if the marking ever fails to run, the page is hidden
rather than printed - the old bug rather than a much louder new one.

Five tests cover the marking, including the two that matter: that no sibling of the path is marked,
and that **nothing is marked when there is no sheet**, because blanking an export is worse than
failing one.

**Three attempts, and the cause was in a third place none of them looked.**

`export_pdf_wysiwyg_core` in `apps/desktop/src-tauri/src/commands/print.rs` reads the document's page
settings and puts them on `NSPrintInfo` - `setTopMargin`, `setRightMargin`, `setBottomMargin`,
`setLeftMargin`. **The print system already insets the page before any CSS is consulted.** A `@page`
margin on top of that is the same millimetres a second time.

The arithmetic matches the exports exactly. A4 with 20mm margins is a 257mm content box, which is the
971px `paginate.util.ts` packs a card into. Applied twice it is 217mm, or 820px - **151px short** -
and the four or five atoms that no longer fit are precisely the ones that appeared at the top of the
exported page two while the on-screen preview kept them on page one.

**Both halves arrived in the same commit** - `eb431567`, 2026-07-15 - so this path has never produced
correct margins. "It worked before the refactor" is a true memory of a different thing: `#466` moved
the print protocol without changing it, and no export had been measured against the Style card until
the walk of 2026-08-20.

**So none of the three attempts was the right configuration**, and the table is worth keeping:

| attempt          | `@page` | card padding | result                                     |
| ---------------- | ------- | ------------ | ------------------------------------------ |
| original         | margins | 0            | margins twice                              |
| first fix        | 0       | margins      | card exactly one page tall, page two flush |
| second and third | margins | 0            | margins twice again                        |
| **correct**      | **0**   | **0**        | the print system applies them once         |

**Fixed by removing the margins from the CSS**, which makes the **save-to-file** export exact -
`NSPrintInfo` carries the document's own margins there.

**The editor's Export button is a second path and is not fixed by this.** It calls `window.print()`,
so `NSPrintInfo` comes from the macOS dialog's defaults and the Style card's margins cannot reach it
at all. The maintainer's decision is to route that button through the same Rust export the Documents
list uses, which makes both paths exact and leaves one print path instead of two. **That is its own
change**: it replaces a print dialog with a save dialog, and the Rust path renders the **saved**
document, so the editor has to persist before exporting - and `cv-detail.component.ts` deliberately
does _not_ persist a half-typed draft on a raw Cmd+P, which is a rule the new path must not break.

**And that was still not it. The fifth reading is the one with numbers, taken from the exported files
themselves.**

Two exports of the same CV, one with 20mm margins and one with none:

|                   | 20mm export           | 0mm export    |
| ----------------- | --------------------- | ------------- |
| `/MediaBox`       | `0 0 595 842`         | `0 0 595 842` |
| clip box          | `56.69 56.69 481 728` | `0 0 595 841` |
| text matrix scale | `0.8000236`           | `0.8008075`   |

The clip box is `NSPrintInfo` doing exactly what it is told, twice - so the margins were never the
problem. **The scale did not move when the printable box changed by 40mm in each direction**, which
is what distinguishes a fixed CSS-px-to-point mapping from a shrink-to-fit, and it is the whole
diagnosis: WKWebView prints **0.8 points per CSS pixel**, or 90 pixels to the inch.

The previews modelled the page at `96 / 25.4` - the display convention, and the obvious choice. That
is **6.67% larger than the sheet**, and both consequences are visible in the exports:

- the measured column is 642.5px where the printable area is **602**, so text wraps differently in
  the export than in the preview;
- the paginator packs **971.3px** of content into a card where only **910.75px** can print, and the
  remainder is **clipped away**. On the 20mm export the last text baseline sits at `y = 47.07` with
  the clip floor at `56.69` - drawn below the visible box. **The exported PDF is missing text**,
  which is a different and worse defect than a wrong margin.

`PRINT_PX_PER_MM` in `libs/core/src/lib/cv/cv-page.util.ts` is `72 / 25.4 / 0.8`, and both previews
use it. An A4 sheet then maps to 595.3 x 841.9pt - exactly A4 - and the measured column and usable
height come out at 602.0 x 910.7px, which are the numbers the clip box carries.

**Measured on macOS, the only platform with a print path today.** A webview that maps pixels to
points differently would need this to become per-platform; the constant's comment says how to measure
it from an exported file.

**Why four attempts missed it.** Every one of them moved the margins between layers, because the
margins were what the eye noticed. The margins were correct from the second attempt onward. What was
wrong was the size of the page the preview believed in.

**Then the second path was closed, on the maintainer's own proposal.** The editor's Export button
called `window.print()` and raised the macOS print dialog, which owns its own `NSPrintInfo` - so the
Style card's margins could not reach an export made from there **at all**. The measurement showed it
plainly: the same document exported from the two buttons carried clip boxes of `0 0 595 841` from the
editor and `56.69 56.69 481 728` from the Documents list. Two buttons, one document, two answers.

Both editors now **save and then hand the document to the same export the Documents list uses**. One
print path, driven from Rust with the document's own margins.

**Saving first is a deliberate exception, not an oversight.** The hidden window renders the document
as it is stored, so an unsaved edit would simply be missing from the file. The rule on
`handleBeforePrint` still stands - a raw Cmd+P must never persist a half-typed draft, because the
user did not ask for a write - but pressing Export **is** asking for this document to become a file.

`printWithPageRule` and `pageRuleFor` are deleted: nothing called them once both editors moved.
`markPrintPath` stays, because the export windows still need it.

**Found while removing them, and not fixed here:** a raw Cmd+P in either editor sets no
`printing-cv` class and injects no page rule, so it prints the whole application - the sidebar, the
editor column and all. That was already true before this change; the Export button was the only thing
that ever set the class. It is a real defect and it belongs in its own entry rather than riding along
with this one.

**What to test next:** export a two-page CV from **either** button now, and compare the page break
with the editor. They should break in the same place, the two buttons should produce the same file,
and no text should be missing from the end of page one.

**Confirmed natively, 2026-08-21.** Exported the same two-page tailored CV from both buttons in one
running session and read the resulting files: identical `/MediaBox 0 0 595 842`, identical clip box
`56.69292 56.69292 481 728` on every page (20mm on all sides, matching the Style card), identical text
scale `0.8000236`. Both files are 2 pages. `B4` is closed. One loose end found while checking: the
editor's Export button still opens the native macOS print sheet rather than the direct save dialog the
Documents-list button uses - a UI difference from what this entry describes, though the exported
geometry is exact from either path.

**B5. `LANGUAGES` is indented and narrowed on the second page of the export. FIXED, natively
confirmed 2026-08-22 - fixed as a side effect of `#511`, not by a dedicated change.**
On the exported page two, `EDUCATION` started at the left margin with its rule running the full
width, and `LANGUAGES` directly below it started roughly a third of the way in, with a rule that
stopped early. Filed 2026-08-20, months before `#511` ("page-card width in print reuses the measured
column, not auto") shipped. `#511`'s own root cause was `.page-card` printing at `width: auto`,
letting WKWebView re-derive the printable width itself - a second, independent computation that could
disagree with `contentWidthPx()` by a sub-pixel amount and reflow a boundary line. That is exactly the
class of defect this finding's symptom matches: a card landing right after a forced page break getting
a narrower, differently-computed box than the cards before it. No code path today can reproduce the
described mechanism - `.page-card`/`.page-card__atom` are uniform block-flow with no per-section or
per-position width variance, and `#511` pinned every page-card's width identically via
`width: var(--pc-content-width) !important`. The maintainer confirmed on a real multi-page export with
LANGUAGES on page two that it now renders correctly, full width, matching `EDUCATION`. Never touched
directly in the five `B4`-family sessions that preceded `#511` - each deliberately excluded it
("`B5` is deliberately not in the change") for lack of a way to see a laid-out exported page.

**B6. The tracker export produces a trailing blank page. FIXED 2026-08-21.**
Export the Job Tracker report when the content fits on **one** page: the saved file has **two**, the
second empty. The first page itself is correct.

Same family as `B4` and `B5` - the print stylesheet, not the screen - so all three are worth fixing
in one pass over the print path. A stray trailing element with a page-break, or a container whose
height is rounded up past the page box, is the usual cause.

**Fixed, 2026-08-21, and the cause was neither of those.** `app.ts` had no branch for the print
routes, so `print/cv/:id`, `print/cover-letter/:id` and `print/tracker-report` rendered **the whole
app shell**, and the print stylesheet only set `visibility: hidden` on it - which paints nothing and
**occupies everything**. In the hidden export window the document was therefore laid out below a
full-height shell, so a report that fitted on one page exported as two, the second blank.

Two things follow from the same root. The shell is why the report needed `position: absolute` to
reach the page origin at all; with no shell it is a plain block and the document is exactly as tall
as its content. And it is the second candidate cause of `B4`, since an absolutely positioned box in
paged media does not resolve against the page area the way a flowed one does.

The print routes render the outlet alone now - no sidebar, no header, no toasts. `app.spec.ts` pins
all three routes, the two near-misses (`/printer`, `/jobs/print`), that the boot gate cannot raise a
welcome screen over an export, and that toasts still reach the user on the screens that are not the
shell - the last of which was a regression caught in the writing rather than in review.

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

**B8. The job title is a truncated sentence from the description. FIXED 2026-08-20.**
On a scanned Vantaform GmbH listing, both the job card and the `FIT SCORING` card show
`Roughly 70% frontend, 30% Node services. An internal logistics tool used by 300` - a fragment of the
body text, cut mid-sentence, where the **role title** belongs. The company and location resolve
correctly, so it is the title field alone that is wrong.

**This is `Q2` caught in the act**, and it is worse than a cosmetic slip: the title feeds the
archetype screen, the score and the tailoring prompt, so every one of them is reasoning about a
sentence fragment instead of a job title. The oversized heading in the scoring card is what made it
visible; the heading style itself looks deliberate, and **the defect is the value put into it**, not
its size.

**Fixed, 2026-08-20, and the cause is not truncation at all.** Nothing cut that sentence: a scanned
posting is hard-wrapped at about eighty columns, so a fragment of a sentence _is_ a line of the
document. `extract_title` in `apps/desktop/src-tauri/src/commands/job_identity.rs` takes the first
body line under 80 characters that is not a section heading and carries a role word. **The reported
fragment is 79 characters** - one under the cut, which is why it and not some other line - and it
carried exactly one role word, `frontend`.

Two changes, both in the deterministic pass:

- **`ROLE_WORDS` was a list of role nouns with thirteen domain words mixed in** - `frontend`,
  `backend`, `mobile`, `web`, `data`, `product`, `sales`, `support`, `security` and friends - which
  are ordinary English and appear in the prose of a posting constantly. They are gone. Nothing is
  lost, because the titles they appear in carry a role noun anyway: `Frontend Engineer` on
  `engineer`, `Data Scientist` on `scientist`, `Head of Data` on `head`. A test walks all thirteen
  and asserts none of them qualifies a line alone; another walks the same words inside real titles
  and asserts every one still passes.
- **A candidate that reads as a sentence is refused**: it ends with a full stop, quotes a percentage,
  opens with a word no title opens with, runs past ten words, or ends one sentence and starts another
  on the same line. Five independent signals rather than one clever test, and **the reported fragment
  is caught by three of them plus the role-word rule**, so the fix does not depend on any one being
  right about every posting in the world.

**The labelled pass is untouched.** `Job title: ...` is an explicit statement of what the value is;
position is the only evidence the second pass has, and it is the pass that needed the strictness.

**Strictness here is cheap, which is why it was the right lever.** Returning `None` is already a
supported outcome: the AI step runs on an empty title and the identity dialog follows. What that
also means is that **this fix cannot be confirmed by a unit test alone** - the walk should re-parse a
hard-wrapped posting and check that the placeholder, then `job-identify`, then the dialog produce a
real role.

**One thing was found and deliberately left.** A wrong deterministic title is permanent:
`job-identity-resolver.service.ts` fills a title only when it is empty, so the AI never gets a turn
to correct one. Making a positional guess a weaker provenance that the AI may overwrite is a
behaviour change of its own, and it needs its own decision rather than riding along here.

**B9. The wizard's footer padding is inconsistent. CLOSED, 2026-08-23 - not an issue at full screen.**
Tried to catch it live on 2026-08-22: the maintainer described it verbally but could not reproduce it
on demand, no screenshot captured. On 2026-08-23, running maximized/full screen, the maintainer
confirmed the footer looks correct - no inconsistency observed. Consistent with this entry's own
"possibly already fixed" note: several layout-affecting changes landed the same week
(`#511`-`#516`, the P1/P2/B12 native-lock UI). Re-open only if it recurs, and only with a screenshot
or the two differing step names - a description alone did not converge twice.

**B9 (original, kept for the mechanism reasoning below). NOT REPRODUCIBLE FROM THE REPOSITORY.**
The row holding **Back**, **Cancel** and **Continue** sometimes has bottom padding and sometimes has
none - it varies between steps rather than between screens sizes. One step's layout is missing what
its neighbours have.

**Looked for on 2026-08-21 and not found, which is worth recording as precisely as a fix.** Three
things were checked and none of them is the cause:

- **There is exactly one footer.** `apply-wizard.component.ts` renders a single
  `<footer class="apply-wizard__footer">` outside the step switch, so Back, Cancel and Continue are
  the same element on every step. No step component renders an action row of its own.
- **That footer has no bottom padding at all** - `padding-top` and `border-top` only - so there is no
  value that could vary.
- **The obvious alternative was already handled, months before the walk.** The shell's content area
  carries a deliberately larger bottom padding (48px) plus `scroll-padding-block-end`, added in #156
  on 2026-07-26 precisely so the last element on any page keeps a consistent gap. So "the page ran out
  of room on a long step" is not it either.

**What would settle it**, and it is cheap to capture on the next pass: **which two steps differ**, and
the computed `padding-bottom` of `.apply-wizard__footer` and of its scrolling ancestor on each of
them. A screenshot of both steps at the same window height would do as well.

Guessing a padding onto the footer was considered and rejected: with no identified cause it is a
change nothing here can judge, in the one area where a wrong guess adds a second inconsistency rather
than removing the first.

**B10. The in-progress spinner wobbles. FIXED 2026-08-21.**
Leave a tailoring run and move to another section: the "still running" chip appears with a circular
progress icon, and the circle does not rotate around its own centre - it visibly wanders. A transform
origin that is not the icon's centre, or a rotation applied to a box larger than the glyph.

**Fixed, 2026-08-21. The second guess was right, and the repository had already measured the
mechanism once.** The animation sits on the `<lucide-icon>` **wrapper**, which is a line box and
therefore reserves descender space below the baseline - about **1.84px at this font size, whatever
the icon measures**, as `libs/ui/src/styles/_button.scss` records from the time an 18px icon rendered
28 x 29.84 in a button. So a 16px glyph was rotating about the centre of a 17.84px box, roughly
0.92px off its own centre, once every 900ms. The wrapper is a flex box now, which blockifies the
inline `<svg>` so the box is the glyph.

**Three places had it, not one**: the resume-tailoring chip that was reported, the job-identity badge,
and the factory-reset button. All three are fixed. **The onboarding spinner deliberately is not** - it
is a bordered `<span>` with an explicit 14px square, so its box already is the circle it draws, and
`spinner-css.spec.ts` asserts that rather than leaving the omission to memory.

**The guard is a guard, not evidence.** jsdom has no layout, so the spec scans the stylesheets for the
box; whether the circle now turns on its centre is a thing only a screen can say.

**B12. Create Application generates a cover letter the user never asked for.**
Reported on the native pass of 2026-08-21, and it is also the answer to "why did Create Application
think for so long". On the Review-documents step the user pressed **Generate CV** only, deliberately
skipping the cover letter, and continued. The final **Create Application** button then generated the
cover letter itself, which is where the wait came from.

**This is the code doing what it was written to do, which is why it needs a decision rather than a
patch.** `JobActionsStore.markApplied` calls `JobDocumentsStore.commit(tailoredMd, true)`, and that
method asks `decideCoverLetterAction({ linked: !!this.coverLetter(), ... })` - with nothing linked the
answer is "create", so `createCoverLetter()` runs. The comment above it says so plainly: the commit
"generates any missing CV / cover letter".

The maintainer's position is that a document the user skipped must stay skipped: not generating it is
the whole meaning of not pressing the button, and generating it silently spends tokens and minutes on
something that was declined. It belongs with `P1` and `P2`, because all three are about what
**Create Application** is allowed to do.

**B11. Generating a cover letter fails on the first attempt and works on the second.**
Reported as recurring, not a one-off: the first **Generate cover letter** cuts off, and pressing
generate again produces the letter normally. CV generation on the same run did not do this.

Two attempts means the user pays twice, and a failure that clears itself on retry is the kind that
never gets diagnosed because the retry always works. **Worth capturing the provider error on the
failed attempt** rather than guessing - the difference between a timeout, a truncated response and a
schema rejection decides the fix.

**Worked on 2026-08-20, and the honest status is "the next occurrence is diagnosable", not "fixed".**
The bug cannot be reproduced without a real provider call, so nothing here proves the cause. What the
code did settle is why nobody could tell:

- **One feature carried three strictnesses of parse.** `parseCvSkillResponse` cleans the answer,
  parses it, and **repairs a truncated one** before giving up. `parseCoverLetterResponse` - the
  editor's path - parses and rejects an array or a bare scalar, but does not repair. The wizard's
  **Generate cover letter** did neither: a raw `JSON.parse(cleanJsonText(...))` with a cast. That
  ordering is the whole of "the CV on the same run did not do this": the CV sits on the most defended
  parse in the repository and the failing button sat on the least.
- **The message the user got could not distinguish the three causes this file says decide the fix.**
  `JSON.parse` throws `Unexpected end of JSON input` and nothing else - not the answer it choked on -
  and `DocumentReviewStatusService.fail` shows exactly that string. A timeout, a truncated response
  and a schema rejection all arrived as one sentence.
- **Both providers already say why they stopped, and the app threw it away.** Anthropic reports
  `stop_reason`, the OpenAI-compatible shape reports `finish_reason`, both in the same JSON body
  `ai/api.rs` already parses for `usage`. `AiResponse` now carries it, and a parse failure names it:
  a capped answer says so and says a retry is likely to work, a clean stop says the answer was not
  cut short, and a CLI answer - which reports nothing - says nothing rather than claiming a clean
  finish.

**What was deliberately not done.** Truncation is not repaired for a letter the way it is for a CV: a
CV's sections are visibly listed, so a short one announces itself, while a letter reads as continuous
prose and a repaired one would present its missing paragraphs as finished. And a capped answer that
happens to parse is still kept - the stop reason explains a failure rather than overruling a success,
which is what the CV path already does.

**So the next native run should capture the message**, which will now name the cause. If it reads
"stopped at its output token limit", the fix is the cap or the prompt; if it names a clean stop, the
model is answering with something that is not the JSON asked for and the skill is the place to look.

### Behaviour the maintainer wants changed

**P1/P2/B12. FIXED 2026-08-21, as one change.** `JobActionsService.markApplied` split in two:
`createApplication` (ensures the row, commits documents, never writes `status`) and `apply` (writes
only the status transition, no documents). The wizard's "Create Application" button now calls the
former and leaves the job `saved`; the summary screen's existing `canMarkApplied`-gated button
(`job-detail-actions`) is repointed at the latter and is the one place "Apply" lives - it was already
the right slot, just doing too much. `decideCoverLetterAction`'s `!linked` branch now answers `keep`
instead of `create` (`B12`): a cover letter the user skipped in Review stays skipped, matching the CV
rule's own precondition. Retailor (`scoring-view`'s CTA) is disabled with a `title`/`aria-label`
explanation once `jobLocked` (`status !== 'saved'`) - Retailor was already unreachable in the wizard
footer for the same jobs, this closes the summary-screen entry point. CV and cover-letter editors gained
a `DocumentApplicationLockService` (component-scoped, reverse-looks-up `listApplications()` for a match
on `cvDocumentId`/`coverLetterDocumentId`): once the linked application has left `saved`, the editor
forces Preview and hides Edit/Save/Draft, regardless of how it was opened - Documents list, My Jobs, or
the wizard. **Delete was not added to the editor** - it already works from the Documents list regardless
of lock state, and building a second delete entry point was judged out of scope for this change; flagged
if the maintainer wants it.

**Native re-test, 2026-08-23: P1/P2/B12 confirmed correct, and three more gaps in the same lock found
and fixed - see [`PR #528`](https://github.com/vitala89/applye/pull/528), natively re-verified
2026-08-23.** The maintainer exercised the documented repro (CV-only generation, Create Application,
confirm Retailor disabled and both editors read-only) and confirmed all three hold. Separately caught
one unrelated bug and two more instances of the same lock gap while doing it:

- **Not this lock at all - a wiring bug.** Pressing **Apply** on a job's detail actions did nothing.
  `job-detail-actions.component.ts` emits `applyRequested`; `jobs.component.html` listened for
  `(markAppliedRequested)`, an event the component never had. Angular does not raise a template-compile
  error for an unknown output binding - it silently treats it as a native DOM event - so `type-check`
  and `build` never caught it. Fixed by listening for `(applyRequested)`.
- **The CV preview stayed interactive after the toolbar locked.** `cv-detail.component.html` hardcoded
  `[interactive]="true"` on `app-cv-preview`, so a locked document's Edit/Save/preview-toggle correctly
  disappeared, but clicking the rendered CV still opened the live style panel and could start inline
  text editing - same as an unlocked document. Fixed by `[interactive]="!locked()"`; the selection and
  edit-mode services were already gated on `interactive`, so the one binding closes both paths.
- **Score/Rescore never read the lock at all.** Both buttons (the main Score/Rescore button and the
  stale-score Rescore button) were disabled only by `scoring()`. Fixed by adding
  `|| actions.jobLocked()` to both - the same signal already disabling Retailor.
- **The job meta card's "Name it"/"Edit it" company+role button was deliberately built to never close
  off**, per its own comment - correct while the job was still editable, wrong once it is locked, since
  the posted identity is what was actually applied with. Added a `locked` input wired to
  `actions.jobLocked()` and disabled the button on it.

Regression tests added for the Apply wiring, the CV-preview lock, and the Name-it lock
(`job-meta-card.component.spec.ts` did not exist at all before this). **Score/Rescore's lock has no
test, and neither does the Apply-button wiring itself - `jobs.component.ts` (1076 lines) has no spec
file**, a gap left for its own task rather than building a full harness for it here. **Native pass
completed 2026-08-23**: the maintainer clicked Apply on a job and confirmed the wizard opens/marks
applied, then locked a job and confirmed the CV live style panel, Score/Rescore, and Name it/Edit it
are all inert. All four `PR #528` fixes hold.

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

**Specified further by the maintainer on 2026-08-21**, and the shape is now concrete:

- **Create Application saves the application; it does not apply.** The status is the tailored/saved
  one, and an **Apply** button appears for the user to press themselves - after they have actually
  submitted the employer's form on the employer's site.
- **Applied is terminal for everything, not only the description.** Retailor is **disabled**, not
  merely unhelpful. Editing the application is closed.
- **The documents go read-only.** For an applied job the CV and the cover letter can be read and
  deleted, and not edited: the version that was sent is the version that exists.
- **`B12` belongs to the same change.** A document the user skipped must stay skipped, so the commit
  that runs behind Create Application must stop generating a missing cover letter on its own.

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

**Read against the prompt on 2026-08-20, and the first hypothesis above is wrong.**

`libs/skills/src/resume-tailoring/resume-tailoring.md` is one skill run three times with a `pass`
input. Pass 2's declared output is
`{"pass":2,"result_md":"## Recruiter\n<3-5 points>\n\n## Hiring Manager\n<3-5 points>"}` - **six to
ten bullet points, not a document.** So "whether it needs two passes at full document length" is
already answered on the output side, and "whether it can run against a diff" has almost no output to
trim.

**The measured ordering is the real lead, and it is anomalous.** Pass 3 produces a complete tailored
CV - by far the largest output of the three - and was measured **faster** than pass 2, which produces
the smallest. Wall clock therefore does not track output length here, which rules out "it writes too
much" as the cause and leaves three candidates: the size of the **input**, the model spending
reasoning tokens for a short answer, or something outside the call.

**Nor can the passes be overlapped.** Pass 3 takes `pass2_result` as an input, so the critique cannot
run beside the build; that option is closed by the prompt's own data flow rather than by a benchmark.

**What pass 2 does carry at full length is its input:** `profile_md`, `job_description`,
`scoring_json` and `pass1_result`, all of them in the `[USER]` turn.

**The numbers that settle this are already recorded.** `tailoring_cache` (migration `0005`) stores
`pass`, `model_used`, `tokens_input` and `tokens_output` for every pass of every job, so the walk's
own runs can be read back without re-running anything:

```sql
SELECT pass, model_used, tokens_input, tokens_output
  FROM tailoring_cache
 WHERE job_id = (SELECT job_id FROM tailoring_cache ORDER BY created_at DESC LIMIT 1)
 ORDER BY pass;
```

If `tokens_input` is flat across the three passes and `tokens_output` for pass 2 is small, the time is
going into reasoning rather than into text, and the lever is the model or the instruction - not the
length. If `tokens_input` dominates, the lever is what pass 2 is given.

**Queried 2026-08-23, read-only, against the most recent job in `tailoring_cache`:**

| pass | model_used        | tokens_input | tokens_output |
| ---- | ----------------- | ------------ | ------------- |
| 1    | `deepseek-v4-pro` | 1852         | 3451          |
| 2    | `deepseek-v4-pro` | 2141         | 2207          |
| 3    | `deepseek-v4-pro` | 2641         | 4562          |

**Neither hypothesis above matches.** `tokens_input` is not flat - it grows each pass (1852 → 2141 → 2641) - but stays modest, well short of dominating the wall clock on its own. The actual anomaly is on
the output side: pass 2's own schema declares its output as **six to ten bullet points**
(`{"pass":2,"result_md":"## Recruiter\n<3-5 points>\n\n## Hiring Manager\n<3-5 points>"}`), which
should run to a few hundred tokens at most. It measured **2207 output tokens** - in the same range as
pass 1 and pass 3, which both produce full documents. **The model is not honouring the compact format
pass 2's own prompt asks for**, and that oversized, unconstrained output is the more likely source of
the ~60s wall clock than input size or reasoning overhead. Sizing a fix (tightening the pass 2 prompt
to enforce the declared shape, or capping its output tokens) is a prompt change to
`libs/skills/src/resume-tailoring/resume-tailoring.md` and is left for its own task, since it changes
AI-output behaviour and needs its own decision.

**A separate, smaller lever tried 2026-08-24 without touching the prompt: pass 2 now runs on the
economy model tier rather than quality.** A broader AI-request audit found model selection is global
per call site (`settings.defaultModel` / `settings.economyModel`), not per-pass, so all three tailoring
passes shared the quality tier regardless of task. `TailoringService.runPass` now picks `economyModel`
for pass 2 only - the other two levers the audit surfaced (wiring the dead `recommended_model`
frontmatter, or threading `cache_control` through `AiRequest` so the stable `[USER]`-turn blocks cache
everywhere, not just `[SYSTEM]`) are bigger changes and were not taken here; the latter touches a
`libs/core` public contract and needs its own `aif-grilling` round. **Natively confirmed 2026-08-25,
merged as [`PR #531`](https://github.com/vitala89/applye/pull/531)**: the maintainer reports pass 2
runs a bit faster on the economy tier. Not re-measured against the `S1` wall-clock table with numbers -
a qualitative "somewhat better," not a re-run of the timed table - and the maintainer's own read is that
the remaining latency may be provider/model-dependent rather than something this repository controls
further without the bigger levers below.

**S3. The profile and the job description are re-sent, uncached, on all three passes.**
Found while reading S1 and recorded separately because it is a token-cost defect rather than a
latency one, and closing it is an architecture decision.

`anthropic_run` in `apps/desktop/src-tauri/src/ai/api.rs` puts `cache_control: {"type":"ephemeral"}`
on the `system` block and nothing else. A skill's `[SYSTEM]` section is its static instructions, so
**the cached prefix is the small half**: the profile and the job description live in `[USER]` and are
billed at full input price three times per tailoring run, plus again on every other skill call for
the same job.

Fixing it means deciding where a skill puts its per-job block, which changes the skill file format,
`skills.rs`, and every skill that has one. That is its own decision with its own grilling - not a
rider on S1 - and it should be sized against the `tokens_input` numbers above, which say exactly what
the repetition costs.

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
