# Next session prompt - Applye architecture migration

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye architecture migration. **The plan changed on 2026-08-06** - read `ADR-0005`
first, because it supersedes how the previous eight sessions worked.

Short version: the file-size campaign was treating a symptom. Page classes reach 700 to 1000 lines
because a page is view, state and orchestration at once, and extracting pure helpers does not bring
them back - Profile stopped at 445/400 by decision, Discover shrank only while pure logic remained
and then stopped too. So there is now an **application layer**: `libs/application`, page state in
signal stores, budget 250. The size campaign and the migration are **one stream of work** - take a
page, move its state into stores, and the budgets converge as a consequence.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent `docs/internal/DUTY_WATCH.md` entries. Then read, in
this order and in full:

1. **`docs/product/decisions/ADR-0005-application-layer-owns-page-state.md`** - the decision, the four
   rejected options and the reasons. Everything below is downstream of it.
2. **`docs/governance/CODE_QUALITY.md`**, section "Layers, and which one owns what".
3. **`libs/data/src/lib/stores/jobs.store.ts`** - 66 lines, the only existing store, and the shape to
   copy. Its header records why this is not an NgRx SignalStore; that reasoning is now layer-wide.

Four Duty Watch entries are still worth reading, because each records something that cost real time:

- **"three dead Discover row rules removed, and the `.dv-row` seam turns out not to need a hoist"** -
  how an inherited plan was wrong, and how that was settled by looking rather than by asking.
- **"Discover's feed row becomes a component, and the separator moves to the host"** - the
  host-element trap, headed off rather than hit.
- **"Discover's filter-toolbar controls are hoisted, and `.dv-geomenu` turns out to be three
  menus"** - the descendant-selector form of the same trap, and the audit that shrank a 35-symbol
  boundary to two inputs.
- **"Discover's deterministic scoring leaves the page, and two of its own comments turn out to be
  wrong"** - what writing tests for untested logic actually turns up.

## Where things stand

`main` is at `a08c318`, clean, **no open PRs.** Seven merged last session (#349-#355).

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped. A file missing from the diff-scoped report means "not changed", **not** "now under
budget".

### What the last session moved

| file set   |                       before |           after |
| ---------- | ---------------------------: | --------------: |
| `discover` | html 636 / ts 884 / scss 938 | **484/730/704** |

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

## The plan

### The rules you are working to

- **A page component renders and delegates.** It does not hold the state of its own screen and does
  not inject `DbService`. Screen state goes to a signal store in `libs/application`.
- **Plain `signal()` and `computed()`.** Never NgRx - `jobs.store.ts` records why.
- **A store's budget is 250 lines**, its own category in `tools/check-file-size-budgets.mjs`, and the
  ratchet **refuses a new file born over budget**. This is the single most important planning fact:
  `jobs.component.ts` at 1050 lines cannot move into one store. It decomposes into several, by
  responsibility. That is the goal, not a side effect.
- **A store must be testable without a `TestBed`.** If it is not, its dependencies are wrong.
- **A store orchestrates; it does not calculate.** Pure rules stay in `libs/core` or in a page-local
  pure module - `discover-location-selection.ts` and `discover-detail-scoring.ts` are the pattern.
- **Lint does not enforce the boundary yet.** `type:data` is still in `type:app`'s allowlist. Do not
  add a new direct `DbService` injection because lint stayed quiet.
- **Changing the shape of the layer goes through `aif-grilling`.** The layer is a `libs/` public API.

### Step 1 - create `libs/application` with its first real store

`libs/application` **does not exist yet**, deliberately: an empty library is a claim without a
payload. Create it in the same pull request as the first store that has something to hold.

- `nx g @nx/angular:library` under `libs/application`, tags **`type:application`** and
  **`scope:desktop`**. The scope is forced, not chosen: `scope:shared` may only depend on
  `scope:shared`, and this layer depends on `libs/data`, which is `scope:desktop`.
- The `depConstraints` entry for `type:application` is already in `eslint.config.mjs`. Confirm the
  tags land by running lint - a wrong tag fails there and nowhere else.
- Path alias `@applye/application` in `tsconfig.base.json`, matching the others.

**The first store is Discover's**, and it is the recommended start for three reasons: the page is
already half-decomposed so the diff stays readable, both remaining seams in it are stateful and
therefore exactly what the layer is for, and its pure logic is already out and tested, so nothing
needs to move twice.

`discover.component.ts` is 730/400. Two candidates inside it, and **neither has been audited**:

- **The detail loading path** - `openDetail`, `loadDetail`, `detailBlocks`, `detailSalary`,
  `detailSkills`, `detailScore`, `detailRow`. Self-contained, and it already calls the pure
  `discover-detail-scoring.ts`. **Recommended first**: smallest surface, clearest ownership.
- **The scan pipeline** - `scan`, the console lines, the per-source results. Larger and more
  I/O-shaped. `discover-console.ts` and `discover-sources.service.ts` already exist beside it.

**Before choosing the detail path, read the standing follow-up below about component-scoped services
outliving their page.** A `LinkedDocumentsService` result already lands on a destroyed page's signals
today; a component-scoped store would inherit that failure mode exactly.

### Step 2 onwards - one page per pull request, in this order

Ranked by what the migration buys, not by raw line count:

| page                  |   ts | html | scss | why here                                         |
| --------------------- | ---: | ---: | ---: | ------------------------------------------------ |
| `discover`            |  730 |  484 |  704 | half-migrated, pure logic already out            |
| `jobs`                | 1050 |  686 |  493 | worst class in the repo; needs several stores    |
| `cv-detail`           | 1019 |  492 |  665 | pairs with `cv-preview` below                    |
| `tracker`             |  667 |  557 |  893 | stylesheet is the worst part, cut it the old way |
| `onboarding`          |  738 |  514 |  642 | four wizard steps still inline                   |
| `cv-live-style-panel` |  704 |  467 |  336 |                                                  |
| `settings`            |  575 |  580 |  362 |                                                  |

Each pull request: **one page, its stores, its tests, and the budgets it moves.** Stylesheets and
templates keep being cut by the existing method, which is unrelated to the layer and can travel in
the same pull request or its own.

### Step 3 - close the boundary

When **no component injects `DbService`**, remove `type:data` from `type:app`'s allowlist in
`eslint.config.mjs`. From that point the rule fails the build instead of the review. Until then it is
held by review, and that interval is the known weak point of `ADR-0005` - say so rather than assuming
the rule is already enforced.

Check progress with:

```bash
grep -rln "inject(DbService)" apps/desktop/src --include="*.ts" | grep -v spec | wc -l
```

**46 at the time of writing.**

### What is explicitly not in the plan

- **`db.service.ts` (461/400, ~79 methods) stays as it is** and becomes internal to the layer. Six
  lines per method is a mechanical mapping onto IPC, not complexity, and splitting it would touch
  imports in 46 files the migration will rewrite anyway. It cannot grow. It is cut into per-domain
  gateways **when the ratchet refuses the next method added to it**, and not before.
- **`libs/core/.../analytics.ts` (665/400)** is the only `libs/` file over budget. Changing its shape
  is a public API decision and goes through the grilling gate.
- **`cv-preview.component.html` (895/300) is blocked by decision.** It looks like nine `ng-template`
  atoms and is not: all of them speak one inline-editing protocol (`isEditingLeaf`, `leafPath`,
  `leafDraft`, `onLeafInput`, `finishLeafEdit`, `selectLeaf`, …) repeated per field. The real seam is
  **17 near-identical `@if (isEditingLeaf(...)) { <input> } @else { <element> }` pairs** - one
  editable-leaf component or directive owning the protocol. That is a design change needing its own
  decision, and it is **not** what the application layer solves.
- **Profile is finished at 445/400.** Settled through the grilling gate; the remaining lines are one
  lump of page state. **It is now a migration candidate rather than a closed file** - a
  `ProfileFormStore` is exactly what `ADR-0005` sanctions - but it is not urgent and it is not first.
  Two seams inside it stay rejected on their own merits: the compensation block (template already
  under budget, so a move only grows the class) and the section-mirror collapse (a shared
  `syncSections()` re-serializes the other two, and `serialize(parse(x))` is not identity for
  hand-typed raw markdown).

### Calibration carried over from the component work

Profile's AI Tools shipped with **eleven** inputs, accepted because they are flat scalars read once
each. **Content projection changes that arithmetic entirely** - Discover's filter menu replaced three
dropdowns whose combined markup named 35 symbols with a component taking **two inputs and one
output**, because projected markup compiles in the page's own template scope and its symbols never
cross the boundary. Before declaring a boundary too wide, ask whether the wide part can be projected.

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
