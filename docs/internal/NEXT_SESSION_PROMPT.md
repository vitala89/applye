# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. Rust is finished and stays at zero. Angular is what
remains: **41 files over budget** - 19 TypeScript, 11 templates, 11 stylesheets.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent `docs/internal/DUTY_WATCH.md` entries. The
2026-08-05 entries are this campaign's history. Five are worth reading in full before touching
anything, because each records something that cost real time to learn:

- **"the contact-field extraction had broken the row layout, and nothing had caught it"** - the
  failure mode component extraction has that no gate here sees.
- **"Profile's two AI generators become one, and the crossing mutation survives"** - what survives
  when you collapse two near-identical methods.
- **"the display-name rules leave the Profile class, and the next step needs a decision"** - two
  candidate seams audited and _rejected_, with reasons.
- **"Discover's shared row vocabulary is hoisted"** - why the hoist has to come before the cut, and
  an extraction script caught corrupting CSS.
- **"Discover's detail hero leaves, and the ratchet refuses the first attempt"** - icons written
  from memory, and a helper added during an extraction that had no test.

## Where things stand

`main` is at `52e59e9`, clean, **no open PRs.** Eight merged last session (#340-#347).

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped. A file missing from the diff-scoped report means "not changed", **not** "now under
budget".

### What the last session moved

| file set   |                        before |                                   after |
| ---------- | ----------------------------: | --------------------------------------: |
| `profile`  |  html 409 / ts 628 / scss 231 | **270 / 445 / 124** (html + scss under) |
| `discover` | html 808 / ts 890 / scss 1464 |                     **636 / 884 / 938** |

Tests 1311 -> 1397. Repository count 42 -> 41, which as always understates the work: every new child
component is within budget and never appears.

## Profile is finished. Do not reopen it.

The class stops at **445/400** and that is a **settled decision through the grilling gate**, not an
omission. The remaining lines are one coherent lump of page state - `ngOnInit`, `save`,
`persistProfile`, `refreshSavedMdHash`, the form and its three section mirrors - that no further
pure-function extraction reaches. The maintainer chose this over building a `ProfileFormStore`.

No ratchet exclusion was added: the file stays listed OVER and can never grow, which is the
enforcement that matters.

Two seams were audited and **rejected**, with reasons that still hold:

- **The compensation block.** Template is under budget at 270/300, so a template-only move buys
  nothing and still adds two lines to an over-budget class.
- **The section-mirror collapse.** A shared `syncSections()` called from any one change handler
  would re-serialize the other two, and `serialize(parse(x))` is **not identity** for text the user
  typed by hand in raw mode.

## Rules that are enforced, not optional

**1. Prove a stylesheet move by declarations, not selectors.**

```bash
npm run quality:style-move -- --base origin/main <every stylesheet the rules may have moved between>
```

Four ways to run this wrongly, all hit for real:

- **Leaving a stylesheet off the list.** List the page, the partial, and every child from every
  earlier cut.
- **`--base main` uses the _local_ ref, which `git fetch` does not move.** Use `origin/main`.
- **`--page-scope` is for a base that predates a wrapper.** It strips an ancestor from the **after**
  side only. Equal numbers lost and gained is the signature of passing it wrongly.
- **It does not apply at all when you deliberately change declarations.** A contrast fix or a new
  `min-width` is not a move; say so rather than running it and explaining the noise.

**2. Shared page styles go to a page-scoped partial, emitted once from `styles.scss`.** Five exist:
`_editor-shell.scss`, `_discover-controls.scss`, `_onboarding-shell.scss`,
`_cover-letter-controls.scss`, `_profile-shell.scss`.

**3. A page whose class names are generic wraps its partial in the page root; a page whose names are
already distinctive does not.** Profile needed `.profile { ... }` because seven of its shared names
collide with eight other stylesheets. **Discover needs no wrapper** - 33 of its 34 top-level
selectors already carry `dv-`. Count before assuming.

**4. When a class moves, its modifiers move with it** - but know why. The rule bites on
**same-specificity** modifiers, where source order decides while they share a file and
style-injection order decides once they do not. A **contextual descendant** like
`.dv-detail__heromain .dv-arch-badge` at (0,2,0) against a base at (0,1,0) is decided by specificity
and is safe either way. Check the specificity rather than applying the rule blindly.

## The method, which has held for every cut

1. **Consumer audit before choosing a seam.** For each candidate block, list the symbols and classes
   its markup names and count their uses elsewhere. Zero elsewhere means it can move.
2. **Then audit the _class_ side, and let ownership pick the boundary.**
   - The **page** owns state the child only edits -> **inputs and outputs**.
   - The **child** owns state nothing else reads -> **the child owns the whole pipeline** (Profile's
     raw editor took `parsing`, the status pair, the preview and the AI call, and emits once).
3. **Measure the block before writing the child - template _and_ stylesheet.** A new file born over
   budget is refused: Discover's whole detail screen was 458 stylesheet lines and had to be cut in
   two (sidebar, then hero).
4. **Diff backwards.** Substitute each input back and check it reproduces the original
   token-for-token. Normalise whitespace and comments; **BSD `sed` on macOS has no `\b`**, which
   silently makes half your substitutions no-ops.
5. **Mutation-test the moved logic**, choosing mutations invisible to the eye: crossing two
   near-identical branches, addressing the wrong one of a pair, keeping four labels distinct while
   swapping two of them. Print `MUTATED` from the script, restore from a backup, `diff` to prove
   byte-exactness. **A mutation that fails to apply proves nothing** - one perl replacement mangled
   itself into `-e -e`, the tests failed on garbage, and it was nearly counted as a kill.
6. Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop`,
   `nx test desktop`, **`nx build desktop`**, `npm run quality:file-size`,
   `npm run quality:attribution`, `npx nx format:check`, `git diff --check`.
7. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`.

## Traps that have actually fired

- **The ratchet refuses a template-only cut** on an over-budget class, because the import and the
  `imports:` entry still add lines. Extract something real alongside it - or find that the import
  block itself is the problem: `type X` pushed one import past the print width into four lines, and
  letting the helper type its own return (TypeScript is structural) collapsed it back to one.
- **Never write a lucide icon identity from memory.** The page states it. Two were wrong last
  session (`Rss` not `Radio`, `ChevronLeft` not `ArrowLeft`) and one nearly was (`Check` not
  `CheckCircle2`). Nothing fails - the wrong glyph just renders.
- **A helper you add to the page while extracting a child is as untested as anything else new.**
  `heroArchetype` survived its mutation because it had no test at all.
- **A component's compiled styles never reach another component's template.** Check what shared
  classes a candidate child renders **before** cutting; hoist them first, as its own PR.
- **Commit before switching branches.** `git checkout -B <branch> origin/main` destroyed a full cut
  once.
- **`[ngModel]` writes in a microtask.** `await fixture.whenStable()` before asserting on
  `input.value`. Separately, an async `ngOnInit` is not tracked under zoneless: `whenStable()` can
  resolve while the page is still on its loading branch. Flush a macrotask
  (`await new Promise(r => setTimeout(r, 0))`).
- **Calling a TestBed fixture factory twice in one test** reconfigures an already-created TestBed and
  throws. One fixture per test, or `TestBed.resetTestingModule()` between.
- **A CSS extraction script can corrupt silently.** One scanner reset its skip flag at `depth === 1`
  - true immediately after a rule's opening brace - and captured each rule's opening line while
    leaving the body behind. Verify brace balance before writing, and let `quality:style-move` be the
    proof.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml`. Use `nx build web`.
- The correct format command is `npx nx format:write`. New untracked files sometimes need
  `npx prettier --write <path>` directly.
- A long-running branch always conflicts in `CHANGELOG.md` and `DUTY_WATCH.md`. Pure additions both
  sides: keep both, newest on top, and check for two `### Changed` headings in one release section.

## Verification - know what it can and cannot reach

**Profile is routed and can be driven.** `preview_start` with
`{url: "http://localhost:4200/profile"}`, then `javascript_tool` to click, type
(`dispatchEvent(new Event('input', {bubbles: true}))`) and read `getComputedStyle`. The strongest
check is the **round trip through the markdown**: edit a field, switch to raw mode, read the
`<textarea>`; leaving raw mode parses it back. Both directions were verified this way last session.

**The browser has no Tauri IPC**, and that is a hard limit, not a gap to apologise for:

- Profile never loads, so `fullMd` starts empty and both AI buttons are correctly disabled.
- **Discover has no sources, so the feed is empty and the detail screen cannot be reached at all.**
  All three Discover cuts were therefore verified by the declaration check and the backwards diff
  rather than by walking. For a pure move those are the stronger evidence anyway - say that plainly
  instead of implying a walk happened.
- Onboarding is gated in `app.ts` rather than routed, so the browser never opens it.

Measure computed styles on a **fresh element query**; one captured before a re-render silently
returns empty strings. And if `window.innerWidth` is 0, the pane is backgrounded - take a screenshot
to force it visible before trusting any geometry.

## What to take next

### Discover, what is left

`discover.component.scss` is **938/400**, down from 1464. `.dv-detail` is now only the grid, main,
loading and actions shells. The largest families left:

- **`.dv-row` (233 lines) is not the clean seam it looks like.** Its classes are rendered by the
  detail screen's main body **and** the feed. It needs the same hoist-then-cut treatment the hero
  did: hoist the shared vocabulary as its own PR, then extract.
- **`.dv-geomenu` (107 lines)** is the location filter menu. Its markup surface measured **35
  symbols** - far wider than any boundary this campaign has accepted (the record is eleven, Profile's
  AI Tools). It needs a real ownership audit, and a service-owned boundary is the likely answer.

`discover.component.ts` at 884 and `discover.component.html` at 636 both still need work; the class
has barely moved all campaign (890 -> 884) because every Discover cut so far has been markup and
styles.

### Elsewhere, unaudited and ranked by size

`jobs.component.ts` (1050) with its template (686), `cv-detail.component.ts` (1019),
`tracker.component` (scss 893, ts 667, html 557), `onboarding.component.ts` (738, four wizard steps
still inline, shared styles already hoisted so those stay cheap),
`cv-live-style-panel.component.ts` (704), `libs/core/.../analytics.ts` (665 - the only `libs/` file
on the list, so changing its shape is a **public API decision** and goes through the grilling gate).

### Do NOT split this one

**`cv-preview.component.html`** (895/300) looks like nine `ng-template` atoms and is not. They all
speak one inline-editing protocol (`isEditingLeaf`, `leafPath`, `leafDraft`, `onLeafInput`,
`finishLeafEdit`, `selectLeaf`, …) repeated per field, so extracting an atom means threading about
twenty members through a boundary. The real seam is **17 near-identical
`@if (isEditingLeaf(...)) { <input> } @else { <element> }` pairs** - one editable-leaf component or
directive owning the protocol. That is a design change, not a move, and it needs its own decision.

For calibration: Profile's AI Tools shipped with **eleven** inputs and was judged acceptable because
they are flat scalars read once each, not a protocol threaded per field. That is the widest boundary
the campaign has accepted.

## When to stop and ask

`CLAUDE.md` puts a decision behind the `aif-grilling` skill when it changes a `libs/` public API, a
database schema, the privacy or security posture, or when the task has two readings leading to
different work. That gate fired once last session and was worth it: looking up the facts first
produced an option nobody had listed (Profile was no longer among the worst files, so "stop here and
go where the lines actually are" beat both "build a store" and "grant an exception").

Settle **facts** yourself before asking - the ratchet's exclusion mechanism, existing store
precedents and Discover's prefix count were all lookups, not questions.

## Open follow-ups, not part of the campaign

- **The same host-element trap may exist in other extractions.** PR #341 fixed a live layout
  regression: a `flex: 1` rule kept matching `.field` after extraction put a component host between
  it and the flex container, so paired fields collapsed to content width (173.5px each in an 846px
  row). Type-check, lint, tests, build, `quality:file-size` and `quality:style-move` all passed on it
  - correctly, since no declaration was lost and no selector changed. Only Profile's rows were
    audited. Every other cut this campaign has made deserves the same check: any rule setting `flex`,
    `grid-column`, `align-self` or a direct-child width whose target is now inside a component host.
- **A CV that finishes generating after its page was replaced does not appear until reopened.**
  `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed page's signals.
  The document is written correctly; only the view is stale.
- **A database newer than the running app aborts instead of explaining itself.** The unwrap in
  `lib.rs:36` runs inside tao's `did_finish_launching`, a non-unwinding context, so it becomes an
  abort with a macOS crash dialog. Real for a user who reinstalls an older release.
- **Dependabot: 1 open alert** (moderate), `glib` RUSTSEC-2024-0429. Not fixable here - it arrives
  through the gtk-rs 0.18 stack under `wry`/`webkit2gtk`, which Tauri pins, and it is Linux-only. It
  has an entry in `.cargo/audit.toml` and is **deliberately left open rather than dismissed**,
  because it is the thing that will tell us Tauri moved.

## Housekeeping

A `npm run desktop:dev` process has been running across several sessions (PID 43739 at last check).
It holds the nx `desktop:serve` lock, so `preview_start` on another port blocks behind it - but it
also serves `localhost:4200` from whatever branch the working tree is on, which is what makes every
walk-through possible. Check with `pgrep -fl "tauri dev"`. If you stop it, start your own server
before trying to verify anything in the browser.
