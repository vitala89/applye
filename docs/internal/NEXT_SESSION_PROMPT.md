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

`main` is at `52edb637`. **No open pull requests.** Working tree clean.

Twenty-nine pull requests merged, #449-#477. The last six:

- **#472** `first-launch.component.ts` 419 to **38/400** - the view moved out of the class.
- **#473** the Pipeline quick view, 537 to **343/400**, two children.
- **#474** the dashboard's two list panels became one component, 506 to **360/400**.
- **#475** the tracker grid left the page, 433 to **207/400**.
- **#476** the pipeline card left the board, 456 to **269/400**.
- **#477** Discover re-judged, 475 to **393/400** - two dead selectors deleted, four keyframes
  relocated, the clear-feed dialog extracted.

The audit reads **4 files over budget**, down from 18 across twelve watches. Get the
current picture with `npm run quality:file-size:all` before planning anything - it is a report, not a
gate, and always exits zero.

## What is left, and what kind of thing each one is

**Every stylesheet that could be fixed by extracting a child has been, and Discover has been
re-judged.** Four items remain:

| File                              | Size    | What it needs                                     |
| --------------------------------- | ------- | ------------------------------------------------- |
| `_editor-shell.scss`              | 460/400 | **The only unblocked one. Do this first.**        |
| `cv-preview.component.html`       | 779/300 | The maintainer's decision through `aif-grilling`. |
| `libs/core/.../document.model.ts` | 504/400 | The same - it is a `libs/` public API.            |
| `db.service.ts`                   | 461/400 | The same, plus its recorded rule to re-confirm.   |

**`_editor-shell.scss` 460/400 is a global partial**, `@use`d once from `apps/desktop/src/styles.scss`
as `@use './app/pages/documents/editor-shell' as *`, and **eleven templates render `docedit-*`
classes**. Both document editors depend on it, including #465's two cards' controls. Splitting the
file by responsibility is a size pass; **changing what it emits is not**. `check-style-move` across
the partial and every consumer sheet must come back lossless, and because the partial is emitted
unwrapped into the global sheet, a mistake here shows on pages you did not touch.

**The three gated items are decisions, not approvals.** `AGENTS.md` routes a `libs/` public-API
change and any task with two readings through `aif-grilling`, and that means asking rather than
choosing. Bring all three questions in **one** round:

- **`cv-preview.component.html` 779/300** - it looks like nine `ng-template` atoms and is not: they
  speak one inline-editing protocol repeated per field. The real seam is the **17 near-identical
  `@if (isEditingLeaf(...))` pairs**. Largest file in the repository.
- **`document.model.ts` 504/400** - splitting it changes a `libs/core` public API.
- **`db.service.ts` 461/400** - the recorded rule is "cut into per-domain gateways when the ratchet
  refuses the next method added to it, not before". Ask whether that rule still stands, rather than
  assuming the maintainer's "do all the files" overrides it.

## The maintainer's decision, already taken

**The maintainer has chosen to finish the file-size work first, then walk the application by hand.**
Do not re-open that choice or re-recommend the gate - it is decided. They have also **authorised
fixing bugs found along the way** rather than only filing them.

What that means for you:

- Three of the four remaining files need their **decision**, not their approval. Do the unblocked one
  first, then bring all three questions in a single `aif-grilling` round.
- **`docs/internal/NATIVE_GATE_BACKLOG.md` holds 73 unticked checks across 14 sections.** They will
  drive these themselves once the refactor lands. **Six of the sections came from the recent splits**
  and are the only way to close them: **C4** the welcome screen's animation and reduced motion ·
  **C5** the quick view's copied `.btn-*`, `.qv__hint`, `.qv__error`, `.qv__link` · **C6** the
  dashboard's `:host` rule, its two `@keyframes dash-shimmer` copies and the changed skeleton widths ·
  **C7** the tracker grid's sticky columns, overflow and pinning · **C8** the pipeline card's
  drag-and-drop, which jsdom cannot exercise at all · **C9** Discover's four relocated keyframes and
  the clear-feed dialog's three cancel paths.
- Keep adding new pending checks to that file as you go, rather than restating them in watch entries.
- **The last deliverable of this whole stream is a walkable script** built from that backlog: what
  rows the database needs, which screens in which order, what to look at. Write it when the files are
  done. The maintainer drives it; you cannot.

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
anything is added to it. `_discover-controls.scss` is 352/400 and `discover.component.scss` 393/400
after #477 - real but not generous headroom on both.

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

**Check "who declares it", not "who uses it", before deleting or moving a keyframe.** Angular does not
scope keyframe names. The tracker had two declared in a page sheet that every consumer _also_
declared identically, so deletion was safe. Discover had two declared in a page sheet the page never
used, whose consumers declared **no** copy - deleting them would have silently stopped animations on
two other files. Same shape of finding, opposite answer, and only the declaration check tells them
apart.

**Validate the reachability audit against a known answer before believing a negative result.**
Compile the sheet so `&__x` resolves, flatten the selectors, and match each rightmost compound
against the vocabulary the page's _own_ template declares. Run against
`cv-detail.component.scss` at `f79c9b1e~1` it must flag the families #464 deleted. It has two known
limits: it **skips at-rules**, and it reads `[class]="fn(...)"` as dead - Discover's five
`.dv-console__line--*` modifiers are exactly that false positive and are alive.

**"Nothing happened" has to be asserted in the state where it would have happened.** A cancel button
wired to a destructive handler passed its test because the assertion did not drain the macrotask the
destructive path needs. Drain the same way the positive path does.

**A verdict recorded by an earlier session is evidence about that session, not about the file.**
Discover's "not worth it" was right about component extraction and wrong about the file, and only
measuring showed the difference. Re-judge rather than re-read.

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

The maintainer wants every remaining file resolved before they start the manual walk. In order:

1. **`_editor-shell.scss` 460/400 - split by responsibility without changing what it emits.** The
   only unblocked item. It is `@use`d once from `apps/desktop/src/styles.scss` and eleven templates
   render `docedit-*` classes, so the emitted CSS reaching every one of them must be identical:
   `check-style-move` across the partial and every consumer sheet, in one invocation, lossless. A
   mistake here shows on pages you did not touch, because the partial is emitted unwrapped into the
   global sheet.
2. **Then bring the three gated decisions in one `aif-grilling` round** - `cv-preview.component.html`
   779/300, `document.model.ts` 504/400 and `db.service.ts` 461/400. Ask, do not choose. Include
   whether `db.service.ts`'s recorded "not before the ratchet refuses" rule still stands.
3. **Fix the `cv-save-template-modal` unstyled buttons** described above. Authorised, small, and a
   real user-visible defect.
4. **Last, write the manual gate script.** Turn `NATIVE_GATE_BACKLOG.md`'s 73 checks into one
   walkable pass: the database rows each section needs, the screens in order, what to look at, and
   which checks wipe data so they go last. This is the deliverable that ends the stream.

Pick one thing at a time and finish it, including the Duty Watch handoff.
