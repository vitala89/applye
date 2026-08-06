# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. Rust is finished and stays at zero. Angular is what
remains: **41 files over budget** - 19 TypeScript, 11 templates, 11 stylesheets.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent `docs/internal/DUTY_WATCH.md` entries. The
2026-08-06 entries are the last session; the 2026-08-05 ones are the session before it. Four are
worth reading in full, because each records something that cost real time to learn:

- **"three dead Discover row rules removed, and the `.dv-row` seam turns out not to need a hoist"** -
  how an inherited plan was wrong, and how that was settled by looking rather than by asking.
- **"Discover's feed row becomes a component, and the separator moves to the host"** - the
  host-element trap, headed off rather than hit.
- **"Discover's filter-toolbar controls are hoisted, and `.dv-geomenu` turns out to be three
  menus"** - the descendant-selector form of the same trap, and the audit that shrank a 35-symbol
  boundary to two inputs.
- **"Discover's location filter tree leaves the page and gets its first tests"** - the first cut into
  a class that had not moved all campaign.

## Where things stand

`main` is at `2558822`, clean, **no open PRs.** Five merged last session (#349-#353).

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped. A file missing from the diff-scoped report means "not changed", **not** "now under
budget".

### What the last session moved

| file set   |                       before |           after |
| ---------- | ---------------------------: | --------------: |
| `discover` | html 636 / ts 884 / scss 938 | **484/802/704** |

Across the whole Discover phase, eight PRs: **808 / 890 / 1464 -> 484 / 802 / 704**. Tests 1397 -> 1442. Repository count 41 -> 41, which as always understates the work: every new child component and
util is within budget and never appears.

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
- **It does not apply at all when you deliberately change declarations.** A contrast fix, a dead-rule
  removal, or moving a separator onto a host is not a move; say so rather than running it and
  explaining the noise.

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
     raw editor took `parsing`, the status pair, the preview and the AI call; the filter menu took
     three `*MenuOpen` signals whose only readers were the markup that moved).
3. **Measure the block before writing the child - template _and_ stylesheet.** A new file born over
   budget is refused: Discover's whole detail screen was 458 stylesheet lines and had to be cut in
   two (sidebar, then hero).
4. **Diff backwards.** Substitute each input back and check it reproduces the original
   token-for-token. Normalise whitespace and comments; **BSD `sed` on macOS has no `\b`**, which
   silently makes half your substitutions no-ops. **Prettier will move a `>` onto the previous line**
   when a shorter binding now fits the print width - that delta is expected and is not a change.
5. **Mutation-test the moved logic**, choosing mutations invisible to the eye: crossing two
   near-identical branches, addressing the wrong one of a pair, inverting a tri-state, keeping four
   labels distinct while swapping two of them. Print `MUTATED` from the script, **assert each pattern
   matched exactly once before applying**, restore from a backup, and `diff` to prove byte-exactness.
   **A mutation that fails to apply proves nothing** - one perl replacement mangled itself into
   `-e -e`, the tests failed on garbage, and it was nearly counted as a kill.
6. Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop`,
   `nx test desktop`, **`nx build desktop`**, `npm run quality:file-size`,
   `npm run quality:attribution`, `npx nx format:check`, `git diff --check`.
7. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`.

## The host-element trap, which has now fired three times

**A component host between a rule and its target breaks the rule, and no gate sees it.** Three
distinct shapes so far, all real:

1. **`flex: 1` on a child** (PR #341). Extraction put a host between `.field-row` and `.field`, so
   the flex item became the host while `flex: 1` stayed inert on the element inside. Paired fields
   collapsed to content width - 173.5px each in an 846px row.
2. **`.dv-feed > :last-child { border-bottom: none }`** (PR #350). The host absorbs the match while
   the border sits on `.dv-row` inside the child, drawing a stray line under the last row. Fixed by
   moving the separator to the child's `:host`. **`quality:style-move` would not have caught it** -
   no declaration would have been lost.
3. **`.dv-filters .dv-btn { height: 30px; ... }`** (PR #351). A **descendant** selector: emulated
   encapsulation stamps the page's `_ngcontent` attribute on the selector's **subject**, so a button
   rendered by a child keeps `.dv-btn`'s defaults and the toolbar silently splits into three heights.
   Fixed by hoisting the rule, as its own PR, before the cut.

**And the mirror image, from PR #352:** markup that is **projected** keeps the _page's_ encapsulation
attribute, so its rules must **stay** on the page. `__item`, `__expand`, `__region` and `__hint` are
still in `discover.component.scss` for exactly that reason. Markup that moves needs its rules global;
markup that is projected needs them to stay.

**Before any cut, list every rule whose target is about to sit inside a component host** - anything
setting `flex`, `grid-column`, `align-self`, a direct-child width, or matching by descendant or by
`>`.

## Other traps that have actually fired

- **The ratchet refuses a template-only cut** on an over-budget class, because the import and the
  `imports:` entry still add lines. Extract something real alongside it - the feed row paid for its
  import by deleting the four page icons it took with it - or find that the import block itself is
  the problem: `type X` pushed one import past the print width into four lines, and letting the
  helper type its own return (TypeScript is structural) collapsed it back to one.
- **Never write a lucide icon identity from memory.** The page states it. Two were wrong in one
  session (`Rss` not `Radio`, `ChevronLeft` not `ArrowLeft`) and one nearly was (`Check` not
  `CheckCircle2`). Nothing fails - the wrong glyph just renders.
- **A helper you add to the page while extracting a child is as untested as anything else new.**
- **Calling a TestBed fixture factory twice in one test** reconfigures an already-created TestBed and
  throws. Put `TestBed.resetTestingModule()` at the **top of the factory** rather than making each
  caller remember it.
- **`@angular-eslint` rejects a bare `<label>` in a test host** (`label-has-associated-control`). Use
  a `div` when the projected node is only a marker.
- **A CSS extraction script can corrupt silently.** One scanner reset its skip flag at `depth === 1`
  - true immediately after a rule's opening brace - and captured each rule's opening line while
    leaving the body behind. Verify brace balance before writing, and let `quality:style-move` be the
    proof.
- **`[ngModel]` writes in a microtask.** `await fixture.whenStable()` before asserting on
  `input.value`. Separately, an async `ngOnInit` is not tracked under zoneless: `whenStable()` can
  resolve while the page is still on its loading branch. Flush a macrotask
  (`await new Promise(r => setTimeout(r, 0))`).
- **Commit before switching branches.** `git checkout -B <branch> origin/main` destroyed a full cut
  once. And **do not rebase a branch whose commits are already squashed into `main`** - it conflicts
  on `CHANGELOG.md` every time. Branch fresh from `origin/main` and `git stash pop` instead.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml`. Use `nx build web`.
- The correct format command is `npx nx format:write`. New untracked files sometimes need
  `npx prettier --write <path>` directly. **`nx format:check` prints the offending file and still
  exits 0 inside a `&&` chain** - read its output, do not trust the exit code alone.
- A long-running branch always conflicts in `CHANGELOG.md` and `DUTY_WATCH.md`. Pure additions both
  sides: keep both, newest on top, and check for two `### Changed` headings in one release section.

## Verification - know what it can and cannot reach

**Profile is routed and can be driven.** `preview_start` with
`{url: "http://localhost:4200/profile"}`, then `javascript_tool` to click, type
(`dispatchEvent(new Event('input', {bubbles: true}))`) and read `getComputedStyle`. The strongest
check is the **round trip through the markdown**: edit a field, switch to raw mode, read the
`<textarea>`; leaving raw mode parses it back.

**The browser has no Tauri IPC**, and that is a hard limit, not a gap to apologise for:

- Profile never loads, so `fullMd` starts empty and both AI buttons are correctly disabled.
- **Discover has no sources, so the feed is empty.** Neither the detail screen nor the filter row
  (which lives inside `view() === 'feed'`) can be reached at all. Every Discover cut has therefore
  been verified by the declaration check and the backwards diff rather than by walking. For a pure
  move those are the stronger evidence anyway - say that plainly instead of implying a walk happened.
- Onboarding is gated in `app.ts` rather than routed, so the browser never opens it.

**jsdom resolves `display` from a `:host` rule but returns empty strings for every border longhand.**
So a separator moved onto a host cannot be unit-tested; the block-level host can, and is.

Measure computed styles on a **fresh element query**; one captured before a re-render silently
returns empty strings. And if `window.innerWidth` is 0, the pane is backgrounded - take a screenshot
to force it visible before trusting any geometry.

## What to take next

### `discover.component.ts`, 802/400 - audited, not implemented

The class finally started moving last session (877 -> 802) after four PRs of markup and styles. Its
sections, by size:

| lines | section                                                               |
| ----: | --------------------------------------------------------------------- |
|   210 | `derived` - computed signals                                          |
|    90 | `state` - signals and the constructor effect                          |
|    82 | `triage` - `openDetail`, `loadDetail`, `detectSkills`, `rowArchetype` |
|    57 | `detail misc` - `tipText`, `rescore`, `saveRow`, `dismissRow`         |
|    36 | `scan`, and 36 more in `clear inbox`                                  |

**The recommended next cut is `discover-detail-scoring.ts`,** and it is the same shape as the
location-tree cut that just worked:

- `SKILL_DICT` (**47 lines** of module constant), `detectSkills` (11) and `computeRawScore` (12) -
  about **72 lines**, all deterministic, all pure.
- **None of it has a single test.** A grep over every spec in the page's directory finds no reference
  to either function.
- `detectSkills(jd)` is already pure. `computeRawScore(hay)` reads three signals - `profileKeywords`,
  `detailSkills`, and `detailRow` through `archetypeBadge` - so as a pure function it takes
  `(hay, keywords, skillCount, fit)`. The tier boost table (`primary +12, secondary +6, adjacent +0`)
  and the `Math.max(20, Math.min(97, …))` clamp are exactly the kind of rule a mutation test earns
  its keep on. So is `detectSkills`'s two-branch matcher: short or symbol-carrying tokens (`go`,
  `c#`, `.net`) match whole-word against the **raw** JD, everything else substring-matches the
  lowercased copy.
- **Not in `libs/`**, for the same reason `profile-name.util.ts` and `discover-location-selection.ts`
  are not: nothing outside this page needs it, and a `libs/` public API change is a maintainer
  decision that goes through the grilling gate rather than riding a refactor.

After that, the two larger candidates, neither audited: the **scan pipeline** (`scan`, the console
lines, the per-source results - the more I/O-shaped) and the **detail loading path** (`openDetail`,
`loadDetail`, `detailBlocks`, `detailSalary` - the more self-contained, and a candidate for a
component-scoped service; note the open follow-up below about component-scoped services outliving
their page).

`discover.component.scss` at 704/400 has **no large family left** - the biggest are `.dv-console`
(60), `.dv-detail` (51) and `.dv-skel`. `discover.component.html` is 484/300.

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

For calibration on boundary width: Profile's AI Tools shipped with **eleven** inputs and was judged
acceptable because they are flat scalars read once each. **Content projection changes this
calculation entirely** - the Discover filter menu replaced three dropdowns whose combined markup
named 35 symbols with a component taking **two inputs and one output**, because projected markup
compiles in the page's own template scope and its symbols never cross the boundary. Before declaring
a boundary too wide, ask whether the wide part can be projected.

## When to stop and ask

`CLAUDE.md` puts a decision behind the `aif-grilling` skill when it changes a `libs/` public API, a
database schema, the privacy or security posture, or when the task has two readings leading to
different work. That gate has fired once and was worth it: looking up the facts first produced an
option nobody had listed (Profile was no longer among the worst files, so "stop here and go where the
lines actually are" beat both "build a store" and "grant an exception").

**Settle facts yourself before asking.** The ratchet's exclusion mechanism, existing store
precedents, Discover's prefix count, and - the clearest case - whether `.dv-geomenu` was one menu or
three were all lookups, not questions. The inherited plan said it needed a service-owned boundary;
reading the template showed it was the same dropdown three times, and the answer became a shell with
`<ng-content>`.

## Open follow-ups, not part of the campaign

- **Audit the earlier extractions for the host-element trap.** PR #341 fixed one live regression;
  PRs #350 and #351 headed off two more. Only Profile's rows and Discover's feed row and filter row
  have been checked. Every other cut this campaign has made deserves the same look: any rule setting
  `flex`, `grid-column`, `align-self` or a direct-child width, and any rule matching by descendant or
  `>`, whose target is now inside a component host.
- **Projected content is created with the page's view even while it is hidden.** Measured on the
  filter menu: zero `.dv-geomenu__item` elements in the DOM while closed, but the bodies' bindings
  evaluating anyway. Harmless there - every one is a pure read over a feed-bounded list - but worth
  knowing before projecting anything expensive.
- **A CV that finishes generating after its page was replaced does not appear until reopened.**
  `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed page's signals.
  The document is written correctly; only the view is stale. **Relevant if the Discover detail path
  becomes a component-scoped service.**
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
