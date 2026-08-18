# Next session prompt

Copy everything below the line into a fresh session.

---

Continue the Applye file-size work. **No new features.** `ADR-0005` is finished - do not restart or
re-plan that campaign. Everything below is debt.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`. Read
`docs/architecture.md` too - the CSP rationale and the initial-bundle budget constrain the work
below.

## Where things stand

`main` is at `b846db8a`. **No open pull requests.** Working tree clean.

Twenty-eight pull requests merged, #449-#476. The last five were one session's:

- **#472** `first-launch.component.ts` 419 to **38/400** - the view moved out of the class.
- **#473** the Pipeline quick view, 537 to **343/400**, two children.
- **#474** the dashboard's two list panels became one component, 506 to **360/400**.
- **#475** the tracker grid left the page, 433 to **207/400**.
- **#476** the pipeline card left the board, 456 to **269/400**.

The audit reads **5 files over budget**, down from 18 across eleven watches. Get the current picture
with `npm run quality:file-size:all` before planning anything - it is a report, not a gate, and
always exits zero.

## The mechanical part of this campaign is finished

**Every stylesheet that could be fixed by extracting a child has been.** What is left is five items,
and **not one of them is a size pass**:

| File                              | Size    | Why it is still there                                                                                                                                                                                                                                            |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cv-preview.component.html`       | 779/300 | Looks like nine `ng-template` atoms and is not - they speak one inline-editing protocol repeated per field. The real seam is the **17 near-identical `@if (isEditingLeaf(...))` pairs**, which needs its own decision through `aif-grilling`. Largest file left. |
| `libs/core/.../document.model.ts` | 504/400 | A `libs/` public API change, so the grilling gate.                                                                                                                                                                                                               |
| `discover.component.scss`         | 475/400 | **The one open question - see below.**                                                                                                                                                                                                                           |
| `db.service.ts`                   | 461/400 | Cut into per-domain gateways when the ratchet refuses the next method added to it, not before.                                                                                                                                                                   |
| `_editor-shell.scss`              | 460/400 | The shared global partial both document editors depend on, load-bearing. Splitting it by responsibility is possible; changing what it emits is not a size pass.                                                                                                  |

**The one open question is `discover.component.scss` 475/400.** It was judged not worth it once, on
the grounds that what remains is the page's own chrome - header, console, strip, empty states,
confirm modal, skeleton - and that shrinking it means extracting components the template, at 281/300,
does not need. **That verdict predates five splits that measured what a child extraction actually
costs.** Judge it again with those numbers rather than inheriting the conclusion. If it still holds,
say so and stop - the honest next move is then not another size pass at all.

## The maintainer's decision, already taken

**The maintainer has chosen to finish the file-size work first, then drive the native gate by hand.**
Do not re-open that choice or re-recommend the gate - it is decided. They have also **authorised
fixing bugs found along the way** rather than only filing them.

What that means for you:

- **Three of the five remaining files still need their decision, not their approval.** `AGENTS.md`
  routes a `libs/` public-API change and any task with two readings through `aif-grilling`, and that
  is asking rather than choosing. Do the unblocked work first, then bring all three questions in one
  round so they answer once.
- **`docs/internal/NATIVE_GATE_BACKLOG.md` holds 66 unticked checks across 13 sections.** They will
  drive these themselves after the refactor lands. Your job at the end is to turn that file into one
  walkable script: what rows the database needs, which screens in which order, what to look at. Five
  of the sections came from the last session's splits:
  **C4** the welcome screen's animation and reduced motion · **C5** the quick view's copied
  `.btn-*`, `.qv__hint`, `.qv__error`, `.qv__link` · **C6** the dashboard's `:host` rule, its two
  `@keyframes dash-shimmer` copies and the changed skeleton widths · **C7** the tracker grid's sticky
  columns, overflow and pinning · **C8** the pipeline card's drag-and-drop, which jsdom cannot
  exercise at all.
- Keep adding new pending checks to that file as you go, rather than restating them in watch entries.

## One open bug, filed and not fixed

`cv-save-template-modal.component.scss` opens by stating `.btn-ghost` and `.btn-primary` are
"global, from `libs/ui`". **They are not.** `libs/ui/src/styles/_button.scss` declares the
`.btn--ghost` BEM family, a different vocabulary; only two component sheets declare the hyphenated
names and both are encapsulated; the only global match in the built sheet is `.profile .btn-ghost`,
nested where it reaches nothing. **The CV save-as-template dialog's two buttons render unstyled.**
`git log -S` shows the page's sheet never declared them, so it predates the #465 split. It is a small
fix and it is not a size pass - prefer the `libs/ui` `ButtonDirective` over growing a sheet.

## Pressure at the boundary

`tailoring.service.ts` is **exactly 250/250**: the next line added to it fails the gate.
`job-scoring.service.ts` is 249/250 and `job-identity-resolver.service.ts` 245/250.

Three test files are near the 600 budget and cannot take new cases:
`cv-live-style-panel.entry-rule.spec.ts` **598/600**, `cv-preview.styling.spec.ts` 586,
`cv-preview.editing.spec.ts` 571. New tests for those areas go in a new file.

`onboarding.component.scss` is 391/400 and its template 291/300 - the next page to go over if
anything is added to it.

## What the last session learned, which changes how you plan

**A surviving mutation is a question, not an answer.** Check that it changed what you meant before
concluding anything about coverage. Two of the last session's survivors were bad mutations: one
rewrote the first of two identical strings and hit the wrong element; one deleted a line that was
inert. Both cost a second run to find out - and both were still worth it, because the first exposed
four untested navigation targets and the second exposed a line that should be deleted. **A line no
mutation can break is inert rather than covered.**

**"X exists somewhere" is not a property when one component serves N call sites.** Count per call
site, in both directions. The dashboard's pill must belong to Recent jobs _and not to_ Upcoming
interviews; the pipeline's stage track to Interview and to no other column. This has now caught a
real leak twice.

**A count and the thing it counts must be asserted in the same state.** A column badge reading what
the column holds rather than what the filter leaves visible survived every other assertion.

**Restore a mutated file from a copy taken before mutating, never from `HEAD`.** `git checkout <file>`
on a feature branch restores the _pre-refactor_ file and makes meaningless runs look like emphatic
kills. This cost eleven confusing test failures once.

**A Sass variable is a dependency a selector-level check cannot see.** `check-style-move` compares
flattened selectors, so a `$var` declared at the top of a page sheet and read by a block you are
cutting out is a **crash inside `sass.dart.js`**, never a finding. Check the head of a sheet before
cutting from the middle of it.

**`quality:style-move` cannot see an inline-to-file move** - it reads `.scss` files, so rules that
lived in a `styles: []` array read as "0 lost, N gained", which is a run with nothing to compare
against rather than a clean bill. For those, diff the payload as a multiset instead.

**Angular does not scope `@keyframes` names.** A copy is a global declaration of the same name; two
copies are fine only while they stay identical, and that is a manual check.

**A component host element carries the parent's content attribute**, which is what lets a page rule
reach a child's host. That is load-bearing on the pipeline board: `.card` and `cdkDrag` sit on the
child's host precisely so `_drag.scss` and `CdkDropList`'s content-children lookup keep working.

**In a zoneless application `fixture.whenStable()` does not track a floating promise** started in a
constructor. Two awaited macrotasks settle it. Two pages needed this before anything rendered.

## Workflow notes that cost time repeatedly

**`npm run quality:file-size` reports "no changed source files to check" against an uncommitted or
already-committed tree.** That is not a pass. Use
`node tools/check-file-size-budgets.mjs --base origin/main` from the repository root.

**The Bash working directory persists between calls.** A `cd` into a subdirectory silently changes
where every later relative path resolves.

**Pull requests here are squash-merged**, and `origin/main` moves under you mid-session. When it
does: `git rebase --onto origin/main <old-parent>`, then **re-verify everything** - green before a
rebase means nothing after one. Only the four shared documents ever conflict: `CHANGELOG.md`,
`CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md`. When two branches are in flight,
**name your backlog section around the other branch's** so they do not collide.

**`docs/internal/DUTY_WATCH.md` conflicts on every concurrent merge** - entries are appended at the
top. Keep both, newest first, then `prettier --write` the file.

**Audit removed lines with `git diff origin/main | grep -E '^-([^-]|$)'` before pushing**, comparing
indentation-stripped multisets both ways. The naive `^-[^-]` pattern silently skips deleted markdown
bullets.

**The pre-commit hook catches orphaned imports an earlier lint run predated.** The tracker split
orphaned five; the type-check did not see them. Do not treat an earlier green lint as covering later
edits, which is also why `--skip-nx-cache` is mandatory.

**`nx build desktop` is the gate for bundling and budgets.** `npm run type-check` runs `ngc --noEmit`
and does see templates, but only the build catches budget regressions. Use `nx build web` for the web
app, never `npm run web:build`, which regenerates `apps/web/public/sitemap.xml`.

**`libs/application` is imported by the eagerly-loaded shell, and 18 routes are `loadComponent`.**
Moving a lazily-routed page's code down a layer moves it into the chunk every launch fetches.

**The web app's initial bundle is 4.25 kB over its 500 kB budget on `main`.** Pre-existing, recorded
in `CURRENT_STATE.md`, not yours to fix.

## Standing items you cannot close

**Dependabot is at one open alert**, `glib` RUSTSEC-2024-0429 - Linux-only, through the gtk-rs stack
Tauri pins, deliberately left open as the signal that Tauri has moved. `npm audit --omit=dev` reads 0. The five remaining npm advisories are one chain, `image-size` -> `less` -> build tooling, whose
only npm-suggested remedy is a semver-major **downgrade** of `@angular-devkit/build-angular`; the
repository contains zero `.less` files and both apps set `inlineStyleLanguage: scss`, so the parser
never runs. Do not "fix" it.

No `npm run desktop:dev` process should be running - check with `pgrep -fl "tauri dev"`.

## Gates before commit

`nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop --skip-nx-cache`,
`nx test desktop`, `nx test application` (only when a library changed), `nx build desktop`,
`cargo check` in `src-tauri` when anything under it or in `capabilities/` changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.
Add `check-style-move.mjs` whenever markup moves between components or a rule moves between sheets -
run the page sheet and every child sheet in **one** invocation, with `--base origin/main` and never
`--base main`, which a fetch does not move. Skip it honestly when no stylesheet changed.

## What to do first

The maintainer wants every remaining file resolved before they start the manual gate. In order:

1. **`discover.component.scss` 475/400 - judge it again, then act on the judgement.** It was declined
   once on the grounds that what remains is the page's own chrome and that shrinking it means
   extracting components the template, at 281/300, does not need. **That verdict predates five splits
   that measured what a child extraction actually costs.** Re-judge with those numbers. If a seam
   exists, take it; if it genuinely does not, say so with the reason and record the file as settled
   by decision rather than leaving it looking unexamined.
2. **`_editor-shell.scss` 460/400 - split by responsibility without changing what it emits.** It is a
   global partial `@use`d once from `styles.scss` and both document editors depend on it, including
   #465's two cards' controls. Splitting the file is a size pass; changing the emitted CSS is not, so
   `check-style-move` across every consumer must come back lossless.
3. **Then bring the three gated decisions in one `aif-grilling` round**: `cv-preview.component.html`
   779/300 (the seventeen `@if (isEditingLeaf(...))` pairs), `document.model.ts` 504/400 (a `libs/`
   public API) and `db.service.ts` 461/400 (per-domain gateways, whose recorded rule is "when the
   ratchet refuses the next method, not before" - so ask whether that rule still stands).
4. **Fix the `cv-save-template-modal` unstyled buttons** described above. Authorised.
5. **Last, write the manual gate script.** Turn `NATIVE_GATE_BACKLOG.md` into one walkable pass: the
   database rows each section needs, the screens in order, what to look at. The maintainer drives it;
   you cannot.

Pick one thing at a time and finish it, including the Duty Watch handoff.
