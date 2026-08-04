# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. Rust is finished and stays at zero. Angular is what
remains: **43 files over budget.**

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent `docs/internal/DUTY_WATCH.md` entries. The
2026-08-04 entries are this campaign's own history. Three are worth reading in full before touching
anything:

- **"the drawer cut lost an input rule and the losslessness check did not see it"** - the failure
  that shaped everything after it.
- **"the losslessness check gets teeth, and shared page styles get a rule"** - the two decisions
  that came out of it, both now enforced.
- **"the cover letter's five blocks turn out to be one component"** - the best-shaped cut so far,
  and the template for finding another like it.

## Where things stand

`main` is at `664d8f2`, clean, **no open PRs.** Eight merged in the previous session (#320-#327).

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped and whose clean report means only "nothing I touched is near budget". That distinction
has already produced one false all-clear in `CURRENT_STATE.md`.

### What the previous session moved

| file set               |                          before |                                after |
| ---------------------- | ------------------------------: | -----------------------------------: |
| `discover.component`   | scss 1915 / html 1070 / ts 1069 |                 **1464 / 808 / 890** |
| `onboarding.component` |  html 878 / ts 1002 / scss 1045 |                  **628 / 797 / 718** |
| `cover-letter-detail`  |    html 911 / ts 653 / scss 410 | **669 / 644 / 332** (scss now under) |

`cover-letter-detail.component.scss` is the first file the campaign has taken from over budget to
under, rather than merely down.

## Two rules are now enforced, not optional

**1. Prove a stylesheet move by declarations, not selectors.**

```bash
npm run quality:style-move -- --base main <page.scss> <child.scss> <partial.scss>
```

This exists because a cut split `.dv-input, .dv-select` so the child kept only `.dv-select` and the
page kept `.dv-input,` with no body - which Sass silently attached to the next rule. Three inputs
rendered unstyled and a filter field inherited a 60vh empty-state layout. Type-check, lint, 1224
tests and `nx build desktop` all passed on it. The old check compared selector _names_, and the name
survived. Run this after every stylesheet move and again after `nx format:write`.

**2. Shared page styles go to a page-scoped partial, emitted once from `styles.scss`.**

Written into `docs/governance/CODE_QUALITY.md` under "Splitting a page: where its shared styles go".
Child-only classes into the child; classes both sides use into the partial; never copied. Four exist
now: `_editor-shell.scss`, `_discover-controls.scss`, `_onboarding-shell.scss`,
`_cover-letter-controls.scss`. Hoisting **before** the first cut of a page is cheaper than during it.

## The method, which has held for every cut

1. **Consumer audit before choosing a seam.** For each candidate block, list the symbols its markup
   names and count their uses elsewhere in the file. This is the step that makes everything after it
   cheap.
2. **Measure the block before writing the child - template _and_ stylesheet.** A stylesheet that was
   not measured produced a child at 452/400 that the size gate refused.
3. **Then audit the _class_ side.** A member the markup owns exclusively may still be read by the
   page's own logic. That is what decides service-vs-inputs, and it has been wrong-footed twice by
   looking only at the template.
4. **Extract by line range to a scratch file first, then diff after deleting** - in both directions.
   Better still, where the child is parameterised, **diff backwards**: substitute each key back in
   and check it reproduces the original. That tests the parameterisation, not the copy.
5. **Mutation-test the moved logic.** Break one real rule, confirm a _named_ test fails, restore from
   a backup copy and `diff` to prove byte-exactness. This has now found two genuine coverage gaps in
   moved code, not just confirmed coverage.
6. Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop`,
   `nx test desktop`, **`nx build desktop`**, `npm run quality:file-size`,
   `npm run quality:attribution`, `npx nx format:check`, `git diff --check`.
7. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`.

## Traps that have actually fired

- **`nx build desktop` is the gate that reads templates**, and even it does not read whether a
  stylesheet still _means_ what it meant. Only opening the page caught that one.
- **A mutation run from the wrong directory looks exactly like a passing one.** Print a `MUTATED`
  confirmation from the script itself.
- **Never restore a mutated file with `git checkout` if it is untracked** - it silently fails. Copy
  from a backup and `diff`.
- **The file-size ratchet will refuse a cut that adds an import to an over-budget class.** That is
  correct. Extract something real - `wordCount`/`wordStatus` became pure exports for exactly this -
  rather than arguing an exception.
- A long-running branch always conflicts in `CHANGELOG.md` and `DUTY_WATCH.md`. Always pure
  additions on both sides: keep both, newest on top. Watch for two `### Changed` headings appearing
  in one release section - that happened and had to be tidied.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml` with a new date. Discard it.
- The correct format command is `npx nx format:write`, not `npm run format:write`.
- Open PRs against `main` only. Stacked PRs break CI with `fatal: ambiguous argument 'main'`.
- **A new migration that lives only on a branch bricks the dev app when you switch away from it.**
  sqlx refuses to start with `migration N was previously applied but is missing in the resolved
migrations`, surfacing as a macOS crash dialog. Merge a migration early, or stay on its branch.

## Verification, and what is honestly owed

Angular UI changes here are verified by walking the flow in the running app. A broken template
binding passes type-check, lint and unit tests, and this campaign has been bitten by exactly that.

**The browser dev server at `:4200` has no Tauri IPC.** `db_list_sources`, `db_pipeline_cards` and
the CLI probe all throw there, so any screen whose data comes from the database renders empty. It is
still useful for markup, styling, open/close behaviour and computed CSS - that is how the `.dv-input`
regression was found - but it cannot exercise data paths.

**Three cuts have shipped without a click-through and it is written down in each:**

- Discover's Sources drawer: the maintainer accepted the risk explicitly. Source toggles, "show all
  sources", add board, add RSS, remove source and the failing count were never walked.
- Onboarding's two AI panels: onboarding is gated in `app.ts` rather than routed, so the browser
  never opens it at all. The CLI probe and install touch the user's machine.
- The cover letter's five blocks: routed, so it _can_ be walked in a browser once a letter is open -
  it just needs a database.

If you get access to the packaged or `desktop:dev` app, walking those three is worth more than the
next cut.

## What to take next

### Ready to cut, audited, no decisions outstanding

**Onboarding's four remaining steps.** The wizard is six step blocks and the audit found only `icons`
and `t` shared by all of them (`resumePath` and `skip` shared by resume and ready). Its shared styles
are already hoisted, so these should be mechanical: resume (128 template lines, 11 symbols, 7
exclusive), review (118 / 12 / 10), targeting (104 / 18 / 16), ready (68 / 9 / 5), welcome (31 / 3 /
1). Check the class side for each - the AI step's two panels both needed services because the wizard
read their state back.

**The cover letter's last two blocks.** Recipient (93 lines, an address form) and body (111 lines, a
repeatable paragraph list). Neither is the shape the five text blocks were, so each is its own
component. `_cover-letter-controls.scss` already carries what they share with `cover-letter-block`.

**Discover's job-detail screen.** 254 template lines, 22 symbols, gated on `detailRow()` - an
entirely separate screen. Its helpers (`ago`, `initials`, `srcLabel`, `ringDash`, `tipText`,
`archBadgeLabel`) are shared with the feed list and want to become pure exports; four of six already
are pure, and `ago` needs its `now` injected to be testable at all. The filter row (226 lines, 35
symbols) is the harder cut and comes after.

### Blocked on a hoist that is no longer a decision

**Profile** (`html 1037/300`, `scss 733/400`, `ts 772/400`). Its five editor sub-sections are
candidate children - experience 133, languages 126, education 93, skills 59, parse preview 53 - plus
AI Tools 162, target roles 113, photo 65, header 54.

Target roles _looks_ like a perfect seam and is not: its five symbols are used nowhere else and it
was successfully extracted once, but **23 of its 29 classes are still used by the page** and that
branch was discarded. `collapse-card`, `section`, `info`, `status`, `chevron`, `btn-dashed` and
`btn-ghost` are the shared vocabulary of all five sections, and the skills section reuses
`archetype-card`, `archetype-input` and `archetype-list`.

**This was a decision when it was first hit. It is not one any more** - `CODE_QUALITY.md` now says
what to do. Hoist that vocabulary into `_profile-shell.scss` as its own PR, verify with
`quality:style-move`, then all five section cuts become cheap.

### Do NOT split this one

**`cv-preview.component.html`** (895/300) looks like nine `ng-template` atoms and is not. Every atom
shares 20 to 25 symbols with the rest of the template and owns between 3 and 10; they all speak one
inline-editing protocol (`isEditingLeaf`, `leafPath`, `leafDraft`, `leafCss`, `onLeafInput`,
`onLeafEscape`, `finishLeafEdit`, `selectLeaf`, `onSelectKey`, `selectable`) repeated per field.
Extracting an atom means threading about twenty members through an input boundary, which is worse
than the file being long.

The real repetition is **17 near-identical `@if (isEditingLeaf(...)) { <input> } @else { <element> }`
pairs of 25 to 40 lines each**, over half the file. The seam is one editable-leaf component or
directive owning the protocol. That is a design change, not a move, and it needs its own decision
before anyone starts.

### Unaudited

`jobs.component.ts` (1050/400), `cv-detail.component.ts` (1019/400), `tracker.component` (scss 893,
ts 667, html 557), `settings.component.html` (580/300), `cv-live-style-panel.component.ts` (704/400).
None has had a seam audit.

## Open follow-ups, not part of the campaign

Both were found while fixing user-reported bugs and deliberately left out of those PRs:

- **A CV that finishes generating after its page was replaced does not appear until the page is
  reopened.** `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed
  page's signals. The document is written correctly and the badge clears; only the view is stale.
- **A database newer than the running app aborts instead of explaining itself.** The unwrap in
  `lib.rs:36` runs inside tao's `did_finish_launching`, a non-unwinding context, so it becomes an
  abort with a full backtrace and a macOS crash dialog. Real for a user who reinstalls an older
  release.

Also outstanding and unrelated: GitHub reports **9 vulnerabilities on the default branch** (1 high,
8 moderate).

## Housekeeping

A `npm run desktop:dev` process has been running across several sessions. Check with
`pgrep -fl "tauri dev"` and stop it if it is not wanted - note that it serves whatever branch the
working tree is on, so it is only showing what you think it is showing if you checked.
