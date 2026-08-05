# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. Rust is finished and stays at zero. Angular is what
remains: **42 files over budget** - 19 TypeScript, 12 templates, 11 stylesheets.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent `docs/internal/DUTY_WATCH.md` entries. The 2026-08-05
entries are this campaign's own history. Four are worth reading in full before touching anything:

- **"Profile's shared styles are hoisted, and the hoist turned out to be a decision"** - the previous
  handoff said it was mechanical; it was not, and why.
- **"Profile's education section is extracted, with no stylesheet of its own"** - what the hoist
  bought, demonstrated.
- **"Profile's work-experience section is extracted, and a mutation finds a real gap"** - a mutation
  that survived, and what was wrong with the test.
- **"Profile's contact block becomes one field rendered nine times"** - the best-shaped cut of the
  session, plus two ways the losslessness check can be run wrongly.

## Where things stand

`main` is at `d98c214`, clean, **no open PRs.** Ten merged in the previous session (#329-#338).

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped. A file missing from the diff-scoped report means "not changed", **not** "now under
budget"; that misread nearly reached a changelog entry.

### What the previous session moved

| file set               |                        before |                                      after |
| ---------------------- | ----------------------------: | -----------------------------------------: |
| `profile.component`    | html 1037 / ts 772 / scss 733 | **409 / 628 / 379** (stylesheet now under) |
| `onboarding.component` |  html 628 / ts 797 / scss 718 |                        **514 / 738 / 642** |

`profile.component.scss` is the second file the campaign has taken from over budget to under, after
`cover-letter-detail.component.scss`. Profile now has **nine** child components and two util files.

The repository count went 43 -> 42, which badly understates ten merged PRs: every new component is
within budget and so never appears in the report. Judge progress by the files you touched, not by the
total.

## Rules that are enforced, not optional

**1. Prove a stylesheet move by declarations, not selectors.**

```bash
npm run quality:style-move -- --base origin/main <every stylesheet the rules may have moved between>
```

Three ways to run this wrongly, all hit last session:

- **Leaving a stylesheet off the list.** Run with two of Profile's eight, it reported 39 lost
  selectors. They were only missing from the arguments. List the page, the partial, and every child
  created by every earlier cut.
- **`--base main` uses the _local_ `main` ref, which `git fetch` does not move.** It sat at the
  session-start commit for a whole session. Use `origin/main`, or sync local `main` first. (It is
  currently synced.)
- **`--page-scope` is for a base that predates the wrapper.** It strips the ancestor from the after
  side only. Equal numbers lost and gained is the signature of passing it against a base that already
  has the wrapper - which `origin/main` now does for Profile.

**2. Shared page styles go to a page-scoped partial, emitted once from `styles.scss`.** Five exist:
`_editor-shell.scss`, `_discover-controls.scss`, `_onboarding-shell.scss`,
`_cover-letter-controls.scss`, `_profile-shell.scss`.

**3. A page whose class names are generic wraps its partial in the page root.** `_profile-shell.scss`
is `.profile { ... }` around everything it owns, because seven of Profile's shared names (`eyebrow`,
`muted`, `status`, `status--error`, `section`, `field`, `btn-ghost`) are already defined with
different values by eight other stylesheets. Prefixing is still preferable where the names are already
distinctive. Both rules are in `CODE_QUALITY.md`.

**4. When a class moves, its modifiers move with it.** `.status` and `.status--warn` both set `color`;
while they share a file source order decides, split across a global partial and a component stylesheet
the winner becomes style-injection order.

## The method, which has held for every cut

1. **Consumer audit before choosing a seam.** For each candidate block, list the symbols its markup
   names and count their uses elsewhere.
2. **Then audit the _class_ side, and let ownership pick the boundary.** This is the step that decides
   everything, and the repository already answers it:
   - The **page** owns the state and the child only edits it -> **inputs and outputs**
     (`cover-letter-block`, all of Profile's sections).
   - The **child** owns state the page reads back -> **a component-provided service** (the onboarding
     panels, the Review step, the Discover drawer).

   Getting this backwards splits a save path across the boundary.

3. **Measure the block before writing the child - template _and_ stylesheet.**
4. **Diff backwards.** Where the child is parameterised, substitute each key back in and check it
   reproduces the original. That tests the parameterisation, not the copy.
5. **Mutation-test the moved logic**, and pick mutations that are _invisible to the eye_: crossing two
   near-identical blocks, writing every item instead of the addressed one. Print a `MUTATED`
   confirmation from the script itself, restore from a backup copy, and `diff` to prove byte-exactness.
   One mutation last session **survived** and exposed a real gap: the test drove entries carrying a
   single bullet each, where "write the addressed bullet" and "write every bullet" are the same result.
6. Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop`,
   `nx test desktop`, **`nx build desktop`**, `npm run quality:file-size`,
   `npm run quality:attribution`, `npx nx format:check`, `git diff --check`.
7. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against `main`.

## Traps that have actually fired

- **Commit before switching branches.** A cut developed on an uncommitted tree was destroyed by
  `git checkout -B <branch> origin/main` - page edits and both doc entries gone, only the untracked new
  component directory survived. Cost a full redo.
- **The file-size ratchet will refuse a template-only cut**, because adding the import and the
  `imports:` entry still grows an over-budget class by two lines. That is correct. Extract something
  real: last session it produced five dead icon fields in one PR and `profile-parse.util.ts` in
  another - and that util put tests on a rule that had none.
- **`[ngModel]` writes the value in a microtask.** A spec asserting on `input.value` right after
  `detectChanges()` fails; `await fixture.whenStable()` first.
- **Dead CSS inside a grouped selector.** `.output-block, .json-block` - `json-block` was used nowhere.
  Deleting it is right; carrying it into a new file is not. `quality:style-move` reports it, and that
  report belongs in the PR body rather than being suppressed.
- A long-running branch always conflicts in `CHANGELOG.md` and `DUTY_WATCH.md`. Pure additions on both
  sides: keep both, newest on top. Watch for two `### Changed` headings in one release section.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml`. Use `nx build web` directly.
- The correct format command is `npx nx format:write`.
- Open PRs against `main` only. Develop the next cut locally on top of the open branch, then rebuild it
  from `main` after the merge: `git checkout -B <new> origin/main && git checkout <old-branch> -- <paths>`
  works cleanly **if the old branch is committed**.
- **A new migration that lives only on a branch bricks the dev app when you switch away from it.**

## Verification - this improved a lot, use it

**Profile is routed, so the browser dev server can drive it.** That is a real change from the previous
handoff, which had only unwalked cuts to report. Every Profile cut last session was walked, and two of
them caught things no gate would have:

- the `stopPropagation` guard on an info tip inside a clickable card head still working after a move;
- a component with **no stylesheet at all** still rendering correctly from the page partial.

How: `preview_start` with `{url: "http://localhost:4200/profile"}`, then `javascript_tool` to click,
type (`dispatchEvent(new Event('input', {bubbles: true}))`) and read `getComputedStyle`. The strongest
check available is the **round trip through the markdown**: edit a field, click the raw/markdown mode
button, and read the `<textarea>` - if the edit reached `fullMd` then the child's output, the page's
handler and the serializer all ran. Leaving raw mode parses it back, which checks the other direction.

Caveats: the browser has **no Tauri IPC**, so the profile never loads and `fullMd` starts empty (both
AI Generate buttons are correctly disabled for that reason). Measure computed styles on a fresh
element query - reading one captured before a re-render silently returns empty strings.

**Still unwalked, and each says so in its own entry:** Discover's Sources drawer, onboarding's two AI
panels and its Review step, the cover letter's five blocks. Onboarding is gated in `app.ts` rather than
routed, so the browser never opens it at all.

## What to take next

### Profile, what is left

The class at **628/400** is now the harder number and is no longer a template problem: what remains on
it is the two AI call methods, the load/save path and the parse pipeline's orchestration. The template
at **409/300** has three blocks left:

- **the photo card** (~65 lines) - probably the best next cut, and the only remaining one that is
  class-side as well as template-side: it owns its own upload, crop and persist flow and could take a
  service with it, which is the shape that will move the class meaningfully;
- **the raw-mode editor and parse preview** (~90 lines) - the parse mapping already moved out to
  `profile-parse.util.ts`, so what is left is markup plus `parseRawText`;
- **the compensation block** (~52 lines) - owns `comp-row`, `comp-sep`, `comp-select`,
  `field__label-row`, `field__hint--inline`, plus the contextual override `.comp-row .field__input`
  which is **still on the page stylesheet and must travel with it**.

### Elsewhere, unaudited and ranked by size

`discover.component.scss` (1464/400) is the largest file in the project; its template (808) and class
(890) were cut once already, the stylesheet never. `jobs.component.ts` (1050),
`cv-detail.component.ts` (1019), `tracker.component` (scss 893, ts 667, html 557),
`settings.component` (html 580, ts 575), `cv-live-style-panel.component.ts` (704).
`onboarding.component.ts` is 738 with four wizard steps still inline - welcome, resume, targeting and
ready - and its shared styles are already hoisted, so those stay cheap.

### Do NOT split this one

**`cv-preview.component.html`** (895/300) looks like nine `ng-template` atoms and is not. They all
speak one inline-editing protocol (`isEditingLeaf`, `leafPath`, `leafDraft`, `onLeafInput`,
`finishLeafEdit`, `selectLeaf`, …) repeated per field, so extracting an atom means threading about
twenty members through a boundary. The real seam is **17 near-identical
`@if (isEditingLeaf(...)) { <input> } @else { <element> }` pairs** - one editable-leaf component or
directive owning the protocol. That is a design change, not a move, and it needs its own decision.

For calibration on boundary width: Profile's AI Tools shipped with **eleven** inputs and was judged
acceptable because they are flat scalars read once each, not a protocol threaded per field. That is
the widest boundary the campaign has accepted, and it is now the precedent.

## Open follow-ups, not part of the campaign

- **A CV that finishes generating after its page was replaced does not appear until the page is
  reopened.** `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed page's
  signals. The document is written correctly; only the view is stale.
- **A database newer than the running app aborts instead of explaining itself.** The unwrap in
  `lib.rs:36` runs inside tao's `did_finish_launching`, a non-unwinding context, so it becomes an abort
  with a macOS crash dialog. Real for a user who reinstalls an older release.
- **Dependabot: 1 open alert** (moderate), `glib` RUSTSEC-2024-0429. Not fixable here - it arrives
  through the whole gtk-rs 0.18 stack under `wry`/`webkit2gtk`, which Tauri pins, and it is Linux-only.
  It has an entry in `.cargo/audit.toml` with its drop condition and is **deliberately left open rather
  than dismissed**, because it is the thing that will tell us Tauri moved. The other sixteen (nine
  Dependabot alerts plus seven only `npm audit` saw) were closed in #330; all were development scope,
  and `npm audit` now reports zero.

## Housekeeping

A `npm run desktop:dev` process has been running across several sessions (PID 43739 at last check). It
holds the nx `desktop:serve` lock, so `preview_start` on another port blocks behind it - but it also
serves `localhost:4200` from whatever branch the working tree is on, which is what made every
walk-through above possible. Check with `pgrep -fl "tauri dev"`. If you stop it, start your own server
before trying to verify anything in the browser.
