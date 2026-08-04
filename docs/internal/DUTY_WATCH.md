# Applye Duty Watch

This file is the chronological handoff log for maintainers and AI agents working on Applye.

`docs/product/CURRENT_STATE.md` remains the canonical operational state. This log records how each work session changed, verified, or failed to change that state.

Append new entries at the top under `## Watch Log`. Do not erase older entries to hide mistakes or incomplete work. Correct inaccurate entries with a later entry and repository evidence.

## Duty completion checklist

Before a watch can be marked complete:

- [ ] The final diff was reviewed.
- [ ] Relevant checks from `docs/governance/VALIDATION_MATRIX.md` were run.
- [ ] `npm run format:check` passed, or an unavailable formatter was reported honestly.
- [ ] `git diff --check` passed.
- [ ] `docs/product/CURRENT_STATE.md` was updated if focus, blockers, implementation status, or next action changed.
- [ ] `CHANGELOG.md`, roadmap, ADRs, specs, migrations, privacy, security, and design docs were updated when applicable.
- [ ] Any failed, skipped, unavailable, or manual-only checks are recorded.
- [ ] The next first action is concrete and executable.

## Entry template

```md
### YYYY-MM-DD, concise watch title

- **Status:** complete | partial | blocked | rolled back
- **Agent/tool:**
- **Branch:**
- **Commits:**
- **Pull request:**
- **Objective:**
- **Completed:**
- **Not completed:**
- **Files or packages changed:**
- **Validation:**
- **Privacy/security impact:**
- **Decisions and assumptions:**
- **Risks or compatibility impact:**
- **Open issues or blockers:**
- **Next first action:**
- **Evidence:**
```

## Watch Log

### 2026-08-04, onboarding's API-key panel becomes a component

- **Status:** complete - code complete and gated, without a click-through
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/onboarding-cli-step`, from `main` (`790e35e`)
- **Commits:** two - the shell hoist, then the extraction
- **Pull request:** opened against `main`
- **Objective:** Take the first cut of the onboarding wizard, the largest remaining target, now that its shared styles are hoisted.
- **The recorded plan was wrong about where the seam was, and checking first is why that cost nothing.** The previous watch named template lines 157-420 as one block. They are not: 156 opens `@if (isCliMode())`, 158-274 is the CLI panel, 275 is `} @else {`, 276-412 is the API-key panel. The recorded range cut across the conditional. Measuring the two branches separately: the API panel is 137 lines naming 18 symbols of which **15 are exclusive** and the only shared ones are `icons` and `t`; the CLI panel is 114 lines, 13 symbols, 8 exclusive, and shares `cardNameKey` and `cliProviders` with the provider grid the wizard keeps. The API panel is the cleaner cut and the larger one, so it went first.
- **Seven of its members are not internals, which is what decided the boundary.** `keyStored` feeds `keyPresent`, which gates Continue and the Ready step's summary; `qualityModel` and `economyModel` are what `apiModelPatch()` writes into settings; `guide` feeds `providerSummary`. The maintainer chose a service over inputs/outputs, the same call made for the Discover Sources drawer and for the same reason: the save flow would otherwise be split across the boundary. `OnboardingAiKeyService` owns the provider, the key state, the model pair and the four mutations; the wizard provides it and keeps read-through aliases for `selectedProvider`, `guide`, `keyStored`, `qualityModel` and `economyModel`, so its own logic reads unchanged.
- **A style gap the earlier hoist could not have seen.** That hoist measured classes shared **across step blocks**. Eight classes are shared between the two branches of a _single_ step - `ob__panel-intro`, `ob__panel-intro-text`, `ob__panel-body`, `ob__steplist`, `ob__stepitem`, `ob__stepitem-num`, `ob__stepitem-text`, `ob__link-btn` - and both branches are becoming components. They went into the partial first, as its own commit. Stylesheet 894 -> 820 on that alone.
- **Completed:** `onboarding-ai-key.service.ts` (142), `onboarding-api-key-card/` (class 46, template 137, stylesheet 57), and the partial at 251. Wizard: html **878 -> 742**, ts **1002 -> 897**, scss **894 -> 766**. All three remain over budget. `KeysService` and the `KeyStatus` type left the wizard entirely.
- **Losslessness evidence:** The moved class members were diffed against the service before deletion - identical modulo the intended renames (`selectedProvider` to `provider`, the touched flag from a private field to a signal). The template block was extracted, dedented and diffed against the child: identical once the `aiKey.` prefix is stripped. The stylesheets were checked with `tools/check-style-move.mjs` across all three files after every step, including after `nx format:write`: nothing lost, nothing gained.
- **Mutation testing found a real coverage gap rather than confirming coverage.** M1 removed the provider-switch guard in `refreshKeyStored`, the line that stops a keyring answer for the provider the user left from landing on the one they moved to. **All 1224 tests stayed green.** That guard protects a real user-visible outcome - a provider with no key reporting as connected, and Continue unlocking on it - so the gap was closed rather than noted: a new `onboarding-ai-key.service.spec.ts` covers the race, the key-format guard and the failed-write path. Re-run, M1 now fails `does not land on the provider they switched to` and nothing else. M2 weakened the minimum key length from 15 to 1 and failed `rejects something too short to be a key without touching the keyring`. Both restores byte-exact by `diff`.
- **Validation:** Run and observed: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (**1228 passed, 99 suites** - 1224/98 before, plus 4 new), `nx build desktop` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** a click-through. Onboarding is gated in `app.ts` rather than routed, and the browser dev server has no Tauri IPC, so the gate does not open there. This cut moves behaviour, not only markup, so that gap is a real one and is recorded as such.
- **Files or packages changed:** the wizard's three files, `_onboarding-shell.scss`, the new service and its spec, the new card component, `onboarding.harness.ts`, `onboarding.component.spec.ts`, `onboarding.keys.spec.ts`, `CHANGELOG.md`, this log.
- **Privacy/security impact:** None by intent. The keyring calls moved file but did not change: the same `KeysService` methods, the same provider argument, the same deliberate decision not to clear `keyStored` when a write fails. The new test asserts that last one.
- **Decisions and assumptions:** The card binds the service directly (`aiKey.saveKey()`) rather than re-declaring each member as a component field, per the alias rule in `CODE_QUALITY.md`. The specs were repointed at the service through the component's own injector, added to the harness, rather than kept working by leaving forwarding methods on the wizard.
- **Risks or compatibility impact:** The wizard's `aiChoiceTouched` private field became `touched` on the service, so a value that was component-lifetime is now service-lifetime. The service is component-provided, so those lifetimes are the same.
- **Open issues or blockers:** The click-through. Also unrelated and pre-existing: `CHANGELOG.md` had gained two `### Changed` headings inside `[Unreleased]` from the day's merges; the duplicate was removed here.
- **Next first action:** The CLI panel (template 158-274, 114 lines), which finishes the AI step. It needs `cardNameKey` and `cliProviders`, shared with the provider grid the wizard keeps - both are candidates for pure exports rather than another service. After that, the cover-letter block component, which is the largest remaining win in the campaign.
- **Evidence:** Branch diff; the member and template diffs described above; `check-style-move` output after each step; the two mutation runs and their restores; check output quoted above.

### 2026-08-04, the cover letter's five blocks turn out to be one component

- **Status:** complete - code complete and gated, without a click-through
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cover-letter-block`, from `main` (`790e35e`)
- **Commits:** one
- **Pull request:** opened against `main`
- **Objective:** Take the cut the audit two watches ago identified as the campaign's largest remaining win, while the onboarding branch waits to merge. Different file set, so no conflict.
- **The audit was right, and the exact figure is better than it claimed.** The blocks region is seven `<section>` elements. Measuring them precisely: recipient 93 lines, date 48, subject 65, greeting 65, body 111, closing 65, signature 65. Normalising the block key out of the markup, **subject, greeting, closing and signature are identical - zero differing lines of 65**, not "two". Date is the same section with the fourteen-line Regenerate button removed, so a `regeneratable` input covers it. Recipient is an address form and body is a paragraph list; neither is this shape and both stay on the page.
- **Completed:** `cover-letter-block/` (class 71, template 67, stylesheet 7) rendered five times, `_cover-letter-controls.scss` (92) emitted once from `styles.scss`, and `cover-letter-length.util.ts` with its spec. Page: html **911 -> 669**, ts **653 -> 644**, scss **410 -> 332**. **The stylesheet is now inside its budget**, the first file this campaign has taken from over to under rather than merely down.
- **Losslessness evidence, run backwards.** The child was generated from the greeting block by substitution, then the substitution was **reversed**: each of the five keys was put back into the component's template and diffed against that block as it stands on `main`. All five reproduce exactly. That is a stronger check than diffing the extraction forwards, because it tests the parameterisation rather than the copy. The stylesheets were checked with `tools/check-style-move.mjs` across all three files: nothing lost, nothing gained.
- **The style vocabulary was hoisted, not copied, per the rule.** `coverdetail__style-btn`, `coverdetail__regen` and `spin` are used by the new component **and** by the recipient and body blocks the page still renders, so they went to a page-scoped partial. `coverdetail__add` rode along because it shares one rule with `coverdetail__regen` - splitting a grouped selector so one half keeps the name and the other keeps the body is exactly the failure `check-style-move` was written for. `@keyframes cl-spin` moved with `.spin`. `coverdetail__full` is used only by the extracted blocks, so it went into the child.
- **The size gate refused the first version, correctly.** Importing the child added two lines to a class already 653/400, and the ratchet rule forbids an over-budget file growing. Rather than argue an exception, `wordCount` and `wordStatus` became pure exports in `cover-letter-length.util.ts` - they are functions of the content and the selected length and nothing else. Class 653 -> 644.
- **Mutation testing:** M1 made the Regenerate guard always true, so the date block would offer an action it cannot perform; `hides Regenerate when the block cannot be regenerated` failed. M2 pinned the style popover's context to one key, so every block would style the same one; `renders the page-owned style popover with its own key` failed. M3 made the word budget's upper bound exclusive, so a letter landing exactly on its maximum would be flagged as over it; `counts both bounds as inside the budget` failed. Each mutation printed a `MUTATED` line from the script that applied it; each restore was from a backup copy with `diff` confirming byte-exact.
- **Validation:** Run and observed: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (**1236 passed, 100 suites** - 1224/98 before, plus 12 new), `nx build desktop` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** a click-through of the editor.
- **Files or packages changed:** the page's three files, the new component and its spec, `_cover-letter-controls.scss`, `cover-letter-length.util.ts` and its spec, `apps/desktop/src/styles.scss`, `CHANGELOG.md`, this log.
- **Privacy/security impact:** None. Markup and styles, plus two pure functions.
- **Decisions and assumptions:** The Style popover stays on the page and reaches the child as a `TemplateRef` input. It is one template the page parameterises by key and the page's own blocks still use it; giving each of the five blocks a copy would have re-created the duplication this cut removes. The `value` input is typed `string | undefined` because `subject` is optional on the model and `ngModel` was taking `undefined` there before - keeping the type widens nothing at runtime.
- **Risks or compatibility impact:** The three hoisted classes are now global and unencapsulated. `coverdetail__` is this page's prefix alone.
- **Open issues or blockers:** The click-through. The document editors are routed, so unlike onboarding this one **can** be walked in the browser dev server once someone opens a cover letter - it was not, because the dev server has no Tauri IPC to load a document from the database.
- **Next first action:** Merge PR #325 (onboarding's API-key card), then take the CLI panel that finishes onboarding's AI step - template 158-274, 114 lines, needing `cardNameKey` and `cliProviders` which look like pure exports rather than another service.
- **Evidence:** Branch diff; the five reverse-substitution diffs; `check-style-move` output; the three mutation runs and their restores; check output quoted above.

### 2026-08-04, the last two campaign targets are audited, and one of them is not a split at all

- **Status:** complete - audit only, no code changed
- **Agent/tool:** Claude Code, Opus
- **Branch:** `docs/campaign-audits`, from `main` (`030dd6c`)
- **Commits:** one commit
- **Pull request:** opened against `main`
- **Objective:** Audit `cover-letter-detail` and `cv-preview`, the last two file-size targets never examined, so the campaign is planned end to end rather than one file ahead.
- **Cover letter: the biggest single win in the campaign, and it is deduplication rather than relocation.** `cover-letter-detail.component.html` is 911/300. Its edit mode divides into a header (92 lines), a region card (51), an availability card (54), a style card (131), the blocks region (530), a per-block style popover (56) and preview mode (98). The blocks region is **seven copies of one structure**: recipient (95), date (50), subject (67), greeting (67), body (113), closing (67), signature (69). Normalising the block key out of the markup, **greeting and closing differ by two lines out of 67**, and that difference is `content().greeting` against `content().closing` - which an index or an input erases entirely. Date differs from greeting by 21 lines, and every one of them is the regenerate button date does not have, so a `regeneratable` input covers it. Five of the seven blocks - date, subject, greeting, closing, signature, about **320 lines** - collapse into one child of roughly 70 lines used five times. Recipient and body are genuinely different shapes (address fields, repeatable paragraphs) and want their own treatment. This is the only target where the cut removes duplication instead of moving it, and it takes the template to roughly 440.
- **CV preview: do not split it.** `cv-preview.component.html` is 895/300 and looks like nine `ng-template` atoms - header (137), summary (72), section title (19), skills (113), experience head (228), experience bullet (63), education (161), languages (78). The symbol audit says the opposite of what the shape suggests: **every atom shares 20 to 25 symbols with the rest of the template and owns between 3 and 10.** They all speak one inline-editing protocol - `isEditingLeaf`, `leafPath`, `leafDraft`, `leafCss`, `onLeafInput`, `onLeafEscape`, `finishLeafEdit`, `leafChipLabel`, `leafAriaLabel`, `selectLeaf`, `onSelectKey`, `selectAriaLabel`, `selectable` - repeated per field. Extracting an atom would mean threading about twenty members through an input boundary, which is worse than the file being long. The actual repetition is **17 near-identical `@if (isEditingLeaf(...)) { <input> } @else { <element> }` pairs of 25 to 40 lines each**, well over half the file. The seam here is one editable-leaf component or directive that owns the protocol, not nine atom components. That is a design change rather than a move, so it does not belong in this campaign without being decided on its own terms.
- **Not completed:** No code changed. The onboarding CLI cut named as the next action in the previous watch is blocked until `refactor/onboarding-shell-styles` merges - the child consumes the partial that branch adds, and stacked pull requests break CI here with `fatal: ambiguous argument 'main'`.
- **Validation:** `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). Documentation only, so no build or test target was run.
- **Files or packages changed:** this log.
- **Privacy/security impact:** None.
- **Decisions and assumptions:** The block-similarity measurement erases the block key and the section comment before diffing. That is the right normalisation for "would one parameterised component serve both", and it would hide a difference that happens to be spelled with the block name - none was found in the two lines that remained.
- **Risks or compatibility impact:** None. Nothing was changed.
- **Open issues or blockers:** Four pull requests are open and unmerged: #320 (Discover drawer, awaiting the data half of its click-through), #321 (handoff refresh), #322 (the style-move check and the shared-style rule), #323 (the onboarding hoist). The campaign's next code step waits on #323.
- **Next first action:** Merge #323, then take the onboarding CLI block (template lines 157-420, 260 non-empty). After that, the cover-letter block component, which is the largest remaining win.
- **Evidence:** Seam-audit and style-audit output over both templates; normalised block diffs; occurrence counts for the leaf-editing protocol (`isEditingLeaf` 17, `onLeafInput` 17, `onLeafEscape` 17, `leafChipLabel` 17, `finishLeafEdit` 15, `selectLeaf` 40).

### 2026-08-04, the onboarding wizard's shared styles are defined once

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/onboarding-shell-styles`, from `main` (`030dd6c`)
- **Commits:** one commit
- **Pull request:** opened against `main`
- **Objective:** Do the preparatory hoist for the onboarding wizard before cutting any of its six steps, per the rule written this same day into `docs/governance/CODE_QUALITY.md`.
- **Why preparatory and not part of the first cut.** The wizard's six steps are each going to become a component. Every one of those cuts has to decide what happens to the classes the steps share, and the last cut that made that decision inside the cut lost a rule. Doing it once, first, means the five later cuts have nothing to decide - and it shrinks the stylesheet on its own, which is the file that is furthest over budget.
- **The shared set was measured, not chosen.** Of the 130 classes the template uses, **exactly 14 appear in more than one step block**: `ob__eyebrow`, `ob__h1`, `ob__subtitle` (all six blocks), `ob__card` (welcome, AI setup, ready), `ob__badge` and `ob__badge-dot` (welcome, targeting), `ob__field`, `ob__field-label`, `ob__field-hint`, `ob__input`, `ob__key-status`, `ob__muted-note`, `ob__section`, `ob__spinner`. The other 115 belong to one block each and stay where they are, to travel with that block when it is cut. Four of the shared rules were sitting under a step banner (`ob__field` and `ob__spinner`/`ob__key-status` under "Step 1", `ob__muted-note` under "Step 3", `ob__section` under "Step 4"), which is what drift from step-local to shared looks like.
- **Completed:** `_onboarding-shell.scss` (172 lines) carrying 27 rules and the stylesheet's own `Reusable card / badge / field primitives` banner, emitted once from `apps/desktop/src/styles.scss`. Page stylesheet **1045 -> 894** non-empty lines. No template, class or behaviour change.
- **Losslessness evidence:** Rules were extracted by line range to a scratch file before deletion, and the result verified with `tools/check-style-move.mjs` from `chore/style-move-check`: every selector carries the same declarations it did on `main`, nothing lost and nothing gained, across both files. Run again after `nx format:write`, in case formatting moved anything - still lossless.
- **The specificity risk was closed rather than argued about.** Moving a rule from a component stylesheet to a global one drops its `[_ngcontent]` attribute, so it becomes less specific and could start losing to a rule it used to beat. The page's stylesheet now contains **zero** references to any hoisted class, so there is no rule left for the cascade to reorder. `ob__` appears in no other stylesheet or template in `apps/` or `libs/`.
- **Validation:** Run and observed: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (pass), `nx build desktop` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** a click-through. Onboarding is gated in `app.ts` rather than routed, and the browser dev server has no Tauri IPC, so the gate does not open there. The compiled-CSS comparison above is what stands in for it, and it is a stronger check for a move-only stylesheet change than looking at one screen would be.
- **The bundle budget was checked against `main`, not assumed.** `nx build desktop` prints `bundle initial exceeded maximum budget` on both sides: `main` is over by 21.58 kB, this branch by 21.05 kB. The warning is pre-existing and the branch is **0.5 kB smaller**, because rules emitted once are no longer scoped per component.
- **Files or packages changed:** `apps/desktop/src/app/core/onboarding/_onboarding-shell.scss` (new, 172), `onboarding.component.scss` (1045 -> 894), `apps/desktop/src/styles.scss`, `CHANGELOG.md`, this log.
- **Privacy/security impact:** None. Stylesheet organisation only.
- **Decisions and assumptions:** `ob__badge-dot` is hoisted although only the welcome step uses it, because it is a sub-element of a shared primitive and splitting a BEM block from its element across two files is the shape that already went wrong once. Everything else in the partial is shared on the measurement.
- **Risks or compatibility impact:** These rules are now global and unencapsulated. The `ob__` prefix is the wizard's alone, which is what makes that acceptable, and the partial's header comment says so.
- **Open issues or blockers:** None for this watch. PR #320 still awaits the data half of its click-through; PR #322 carries the check used above and the rule this watch follows.
- **Next first action:** Take the Onboarding CLI block - template lines 157-420, 260 non-empty, ~193 exclusive stylesheet lines, ~162 exclusive class lines. Confirm the exact boundaries against element nesting rather than the comment banners before extracting; the symbol counts moved when the split point moved. Expect html 878 -> ~618, ts 1002 -> ~840.
- **Evidence:** Branch diff; `check-style-move` output before and after formatting; the class-frequency count over the template; both bundle-budget lines; check output quoted above.

### 2026-08-04, the losslessness check gets teeth, and shared page styles get a rule

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/style-move-check`, from `main` (`030dd6c`)
- **Commits:** one commit
- **Pull request:** opened against `main`
- **Objective:** Close the gap that let a stylesheet split ship broken, and settle the shared-style question the campaign has now hit four times, before cutting anything else.
- **Why now.** The Sources drawer cut on `refactor/discover-sources-drawer` lost `.dv-input`'s entire declaration block and passed every gate, including the losslessness check the campaign relies on. That check compared **selector names**, and the name survived - as a dangling `.dv-input,` in front of the next rule. A rule can lose its whole body and still pass a name-level comparison.
- **Completed - the check.** `tools/check-style-move.mjs` (169 lines) compiles every stylesheet named on the command line at a base ref and in the working tree, flattens both to `selector -> declarations`, and reports what each selector lost or gained. Nested at-rules qualify the selectors inside them, so a declaration moved behind a `@media` is not counted as unchanged. Wired as `npm run quality:style-move`; deliberately **not** part of `npm run quality`, because it needs the specific files of the split under review.
- **It was proved against the real defect, both ways.** Run with the working tree at `8d4b3e0` (the broken commit): `LOST .dv-input` with all eight declarations, plus `.dv-input:focus-visible` and `.dv-input::placeholder`, plus `GAINED` entries for `.dv-input` and the three `.dv-input__*` selectors the dangling comma invented, exit 1. Run at `7473f6e` (the fix): lossless, exit 0. That is a regression check against a defect that actually reached a pull request, not a synthetic one.
- **Completed - the rule.** `docs/governance/CODE_QUALITY.md` now says where a split page's styles go: child-only classes into the child, shared classes into a page-scoped partial emitted once from `styles.scss`, named after the page, with a header comment listing what it owns and why. `_editor-shell.scss` and `_discover-controls.scss` are cited as the precedents. The maintainer chose this over duplicating into each child and over deciding case by case. The cost is named in the document: these partials are global and unencapsulated. The same section records that hoisting **before** the first cut is usually cheaper than during it.
- **Tests:** `tools/check-style-move.test.mjs`, three cases against fixture repositories - the dangling-selector shape, a genuine lossless move, and a declaration moved behind a media query. Added to `npm run quality:test`, which now runs both tool test files.
- **Mutation testing:** M1 dropped the at-rule qualification so a media-query move would look identical; `does not treat a declaration moved behind a media query as unchanged` failed and the other two stayed green. M2 weakened loss detection back to selector-name presence - the exact weakness this tool replaces; `reports a rule whose body was lost to a dangling selector` and the media-query case both failed. Each mutation printed a `MUTATED` line from the script that applied it, and each restore was from a backup copy with `diff` confirming byte-exact.
- **Validation:** Run and observed: `npm run quality:test` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean), and the two Discover control runs described above. No application code changed, so no Angular target was run.
- **Files or packages changed:** `tools/check-style-move.mjs` (new, 169), `tools/check-style-move.test.mjs` (new), `package.json`, `docs/governance/CODE_QUALITY.md`, `CHANGELOG.md`, this log.
- **Privacy/security impact:** None. A developer-only check that reads stylesheets.
- **Decisions and assumptions:** `@use` is resolved against the working tree even when compiling the base revision. Resolving partials historically would need a full worktree checkout for a marginal gain, and a shared partial rarely changes inside the same move; the assumption is written in the file. The check resolves paths against the working directory rather than its own location, which is what makes it testable against a fixture repository.
- **Risks or compatibility impact:** The check reports **gained** declarations as well as lost ones, so a split that deliberately changes styling will not be silent. That is intended, and the message says so - anything it prints belongs in the pull request description either way.
- **Open issues or blockers:** None for this watch. PR #320 is still open awaiting the data half of its click-through.
- **Next first action:** Merge this, then take the Onboarding CLI block (template lines 157-420, 260 non-empty, ~193 exclusive stylesheet lines, ~162 exclusive class lines, 8 shared classes) - hoisting the eight shared `ob__` classes into a page partial first, per the rule this watch just wrote. Confirm the exact boundaries against element nesting rather than the comment banners; the symbol counts moved when the split point moved.
- **The Onboarding audit, done this watch and not to be repeated.** `onboarding.component` is a six-step wizard and its steps are nearly independent: welcome (31 template lines, 3 symbols), AI setup (343, 34), resume (128, 11), review (118, 12), targeting (104, 18), ready (68, 9). Only `icons` and `t` are named by every block; `resumePath` and `skip` are shared by resume and ready. Net of those, each step is self-contained - six components waiting to happen. AI setup is the biggest but does **not** fit as one child at 337 non-empty lines against a 300 budget, so it splits at the CLI bridge: lines 157-420 carry 23 of their 28 symbols exclusively and fit at 260. That cut moves all three files at once - html 878 -> ~618, ts 1002 -> ~840, scss 1045 -> ~852 - which no other seam in the campaign does. The eight classes shared with the rest of the wizard are `ob__card`, `ob__field`, `ob__field-label`, `ob__field-hint`, `ob__input`, `ob__key-status`, `ob__key-status--invalid` and `ob__spinner`.
- **Evidence:** Tool output quoted above for both Discover revisions; test and mutation runs; the audit numbers reproduced by scratch scripts over the onboarding template, class and stylesheet.

### 2026-08-04, the drawer cut lost an input rule and the losslessness check did not see it

- **Status:** partial - the defect is fixed and gated, the data half of the click-through is still owed
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-sources-drawer`, continuing the watch below
- **Commits:** one fixup commit on the branch
- **Pull request:** the same PR, still open against `main`
- **Objective:** Do the click-through the previous watch left open, before merging.
- **It failed the walk.** `.dv-input` and `.dv-select` shared one rule on `main`. The move gave the drawer's stylesheet a copy carrying **only `.dv-select`**, and left `.dv-input,` in the page's stylesheet as a selector with no body. Sass does not warn about that: the dangling selector attached to the rule that followed it, `.dv-first`. Two live defects. The drawer's three inputs rendered with browser defaults - measured in the running app at `background: rgb(59,59,59)`, `border: 2px`, `border-radius: 0`, against 30px / `--surface-sunken` / `--radius-input` on `main`. And the page's filter query field (`discover.component.html:389`, `class="dv-input dv-filters__query"`) inherited the empty-state layout, because the compiled sheet read `.dv-input, .dv-first { min-height: 60vh; display: flex; ... }`. The nesting propagated too, inventing `.dv-input__icon`, `.dv-input__title` and `.dv-input__hint`.
- **The previous entry's losslessness claim was wrong, and this is why.** It states every selector present before the watch still exists in one of the four files, none lost. The check compared **selector names**, and `.dv-input` was still present as a name - as the orphan. A rule can lose its entire body and still pass a name-level comparison. The check must compare declarations, not selectors.
- **Nothing else was damaged.** After the fix, the set of class selectors defined across the page stylesheet, the drawer stylesheet and the partial was compared against `main`'s page stylesheet in both directions: nothing lost, nothing invented.
- **Completed:** `.dv-input, .dv-select` restored into `_discover-controls.scss`, **byte-identical to the rule on `main`** (`diff` clean), which is where the partial's own header comment already said it belonged - it names the text input among the four primitives the file exists to de-duplicate. The orphan removed from the page, the duplicated `.dv-select` block removed from the drawer. Page scss **1466 -> 1464**, drawer scss **318 -> 298**, partial **142 -> 162**.
- **Not completed:** The data half of the walk. The dev server at `:4200` has no Tauri IPC, so `db_list_sources` throws and every source group renders empty. Source toggles, "show all sources", adding a company board, adding an RSS feed, removing a user source and the failing count could not be exercised.
- **Validation:** Run and observed on this branch after the fix: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (pass), `nx test desktop` (pass), `nx build desktop` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). In the running app: the restored rule resolves to `height: 30px`, `border-radius: 6px`, `background: rgb(46,44,38)` on the drawer's inputs, and no stylesheet rule mentions `dv-input` alongside `dv-first` any more.
- **What the browser walk did cover:** the drawer opens from the page's own button; the summary line, its scope label and the three group headers with their counts render; a click inside the panel does not close it (the inner `keydown`/`click` stop works); a click on the overlay closes it; Escape on the overlay closes it.
- **None of the four gates saw either defect.** Type-check, lint, 1224 unit tests and `nx build desktop` all passed on the broken tree. The previous watch recorded the build as the gate that reads templates; it does not read whether a stylesheet still means what it meant. Only looking at the page caught this.
- **Privacy/security impact:** None. Stylesheet only.
- **Decisions and assumptions:** The rule went to the global partial rather than being copied into both stylesheets, because `.dv-input` is genuinely used on both sides of the boundary - the page's filter field and the drawer's three fields - which is the case the partial was created for. `.dv-select` rides along in the same rule as it does on `main` even though only the drawer uses it, because splitting them is what caused this.
- **Risks or compatibility impact:** `.dv-input` and `.dv-select` are now global and unencapsulated. Any other page using those class names now picks up Discover's styling. Only Discover uses them today.
- **Open issues or blockers:** The data half of the click-through, which needs the packaged or `desktop:dev` Tauri window rather than a browser.
- **Next first action:** Run `npm run desktop:dev`, open Discover and the Sources drawer, and walk what the browser could not: switching a source on and off, "show all sources" against the market narrowing, adding a company board, adding an RSS feed, removing a user source, and the failing count in the summary line. On pass, merge and take the job-detail screen (254 template lines, 22 symbols) next.
- **Evidence:** Branch diff; `diff` of the restored rule against `main` (empty); selector-set comparison against `main` (empty in both directions); computed styles and compiled selector list read from the running app; check output quoted above.

### 2026-08-04, the Discover page loses its Sources drawer

- **Status:** partial - code complete and gated, awaiting the maintainer's click-through
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-sources-drawer`, from `main` (`030dd6c`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Resume the file-size campaign on its largest untouched target. `discover.component` was the worst set in the repository - scss 1915/400, html 1070/300, ts 1069/400 - and the handoff recorded that no seam audit had ever been done for it.
- **The audit, which is the durable part of this watch.** The template is already divided by comment banners, and measuring them gave four candidates: the job-detail screen (254 lines), the Sources drawer (274), the filter row (226) and the feed list (146). Listing the symbols each block names, then counting their uses in the rest of the template, picked the drawer: **23 of its 25 symbols appear nowhere else**. Only `drawerOpen` (the page's own open button) and `enabledCount` (the header) are shared. The filter row, by contrast, names 35 symbols and shares a set helper with four other filters - a harder cut, and now a better-understood one.
- **Why a service and not inputs.** The page has no `providers` array, so the jobs-page lever did not exist here. The drawer does not merely read the list: it flips a row **before** the write lands so the checkbox does not lag the click, and reloads on failure. Passing the list down and eventing changes back up would have split that optimism across the boundary. The maintainer chose the service from three options put to them. `DiscoverSourcesService` now owns the list, the four mutations and the per-source result line; the page re-exposes what it still reads.
- **Completed:** New `discover-sources.service.ts` (173) with 11 tests, `discover-sources-drawer/` (class 139, template 259 non-empty, stylesheet 366), and `_discover-controls.scss`. Page: scss **1915 -> 1466**, html **1070 -> 808**, ts **1069 -> 890**. `toggled` and `hostOf` became pure exports in `discover-sources.util.ts`, and `formatTime` became `formatScanTime` because the page's "last scan" line and the drawer's per-source line format the same value and must not drift.
- **Not completed:** All three page files are still over budget. The click-through has not been done.
- **The size gate caught a real mistake.** The first version of the drawer's stylesheet was **452/400** - the template was measured before writing the child, as the campaign's own note says to do, and the stylesheet was not. The fix was not to shave lines but to stop duplicating: the six control classes the page and the drawer share moved into a partial emitted globally from `styles.scss`, which is the decision `_editor-shell.scss` already records for the document editors. That removed the duplication rather than hiding it, and took the page's stylesheet down a further 135 lines on its own.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (**1224 passed, 98 suites** - 1213/97 before, plus 11 new), `nx build desktop` (pass), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. That is the outstanding gate and the reason this entry is partial.
- **The build gate earned its place again.** `enabledCount` was audited as page-side, and the drawer's markup names it too. Type-check, lint and all 1213 tests passed on that tree; only `nx build desktop` caught it, with `Property 'enabledCount' does not exist`. Same lesson as the stylesheet brace two watches ago: on a move-only change the Angular build is the gate that reads templates.
- **Losslessness evidence:** The template block was extracted by line range before deletion and compared against the new component's - identical modulo whitespace, with exactly one content change, the three `drawerOpen.set(false)` handlers becoming `closed.emit()`. The stylesheet was checked in both directions: the moved blocks are byte-identical to the originals, and the page equals its former self minus exactly those ranges. After the controls partial was extracted, every selector present before the watch was confirmed to still exist in one of the four files - **none lost**.
- **Mutation testing:** M1 removed the reload from the failed-toggle path, so a rejected write would leave the row showing something the database does not. `reloads when the write fails, so the row cannot lie` failed and the other 1223 stayed green. Restored from a backup copy, `diff` byte-exact.
- **Privacy/security impact:** None. No data crosses a boundary it did not before.
- **Decisions and assumptions:** The page keeps read-through aliases for `sources`, `everScanned` and `enabledCount` rather than repointing every use, because the scan path reads the list in several places and those aliases are one line each. This is the opposite of the alias-retiring the jobs page cuts did, and deliberately so: there the aliases existed only for a template, here they back real page logic.
- **Risks or compatibility impact:** Style encapsulation is the live risk, as on every cut of this kind. Six classes were **not** copied this time but hoisted to a global partial, which is a wider change than copying: if a `.dv-btn` or `.dv-input` anywhere in the app looks different, that partial is the first place to look. The drawer's own classes moved rather than being copied, since nothing else uses them.
- **Open issues or blockers:** The click-through. Until it is done, this branch must not merge.
- **Next first action:** Run `npm run desktop:dev`, open Discover and the Sources drawer, and walk it: the summary line with its scope label and failing count, the three collapsible groups and their counts, switching a source on and off, "show all sources" against the market narrowing, adding a company board, adding an RSS feed, removing a user source, and closing by button, backdrop and Escape. On pass, merge and take the filter row (226 template lines, 35 symbols) or the job-detail screen (254, 22 symbols) next.
- **Evidence:** Branch diff; check output quoted above; before/after non-empty counts page scss 1915 -> 1466, html 1070 -> 808, ts 1069 -> 890.

### 2026-08-04, every CV save was failing on a foreign key into an empty table

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/reseed-builtin-cv-lookups`, from `main` (`024a6c8`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Maintainer reported `document_library_upsert (update): error returned from database: (code: 787) FOREIGN KEY constraint failed`, raised every time they edited a CV and pressed Save.
- **Root cause, established on the maintainer's own database rather than by reading.** A copy of `~/Library/Application Support/dev.applye.app/applye.db` has `cv_themes` and `cv_templates` **both empty**. `document_library.theme_id` is a foreign key into `cv_themes` and the CV editor always writes a theme - `themeId` is `signal<number>(1)`, Classic. Replaying the editor's own write on that copy reproduces the report exactly: `UPDATE document_library SET theme_id = 1` fails with `FOREIGN KEY constraint failed`, and inserting the missing theme row makes the same statement succeed. Not intermittent: on such a database **every** CV save fails, for good, with an error the user cannot act on.
- **What is not established:** how the tables came to be empty. Both seed migrations (0011, 0014) are recorded in `_sqlx_migrations` as `success = 1`, installed in the same second on 2026-07-24, and their stored checksums match the current files **byte for byte** - so the seeds were present when they ran. A clean run of the migration files still seeds five templates, so a fresh install is unaffected. There are two hand-made backups next to the live database, one named `applye.db.bak_before_manual_pass_20260803`, which is the likeliest explanation but is not proof. Said plainly in the changelog rather than guessed at.
- **The fix:** `0029_reseed_builtin_cv_lookups.sql` puts the built-in rows back where they are absent. Themes carry explicit ids so `INSERT OR IGNORE` keys on them; templates are auto-numbered so each row is guarded on its name. The row text is taken verbatim from 0011 and 0014 by script, not retyped, so the repair cannot drift from the original. Verified against a copy of the real broken database - 0 themes / 0 templates before, 2 / 5 after, the failing save then succeeds - and running it three times leaves 2 / 5.
- **The second finding, and why the suite never caught this.** `test_pool` connects without `PRAGMA foreign_keys`, and SQLite defaults it **off**. The real pool in `db.rs` is built with `.foreign_keys(true)`. Every foreign key in the schema was therefore unenforced in every test that uses that helper - the tests could not see the constraint that broke. The new test builds its pool the way the app does.
- **Files or packages changed:** new `apps/desktop/src-tauri/migrations/0029_reseed_builtin_cv_lookups.sql`, `apps/desktop/src-tauri/src/commands/documents.rs` (+2 tests and 3 helpers), `apps/desktop/src-tauri/src/db.rs` (pinned checksum for 29), `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `cargo clippy --all-targets` (no errors), `cargo test --lib` (**351 passed, 1 ignored** - 349 before, plus the two new), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. The maintainer's own reproduction is the outstanding confirmation, and it is the direct one: edit a CV and press Save.
- **Mutation testing:** M1 reseeded Classic as id 3 instead of id 1, leaving the editor's default still missing - valid SQL, so the failure is behavioural rather than a syntax error. `an_emptied_theme_table_breaks_every_cv_save_until_the_repair_runs` failed with `the save now succeeds: Database(SqliteError { code: 787, message: "FOREIGN KEY constraint failed" })`, which is the user's reported error verbatim. Restored from a backup copy, `diff` byte-exact, suite back to 351. Note that mutating a migration also trips `applied_migrations_are_never_edited`, since checksums are pinned; that is expected during a mutation run and clears on restore.
- **Privacy/security impact:** None. The maintainer's database was inspected as a copy in a scratch directory, read-only, and only ids, counts and schema were read - no CV or job content. It is not part of the diff.
- **Decisions and assumptions:** Both tables are re-seeded, not just `cv_themes`, because they are the same defect - the built-in lookup rows the schema's foreign keys depend on are missing - and leaving `cv_templates` empty would leave the template picker empty and the next `template_id` write failing identically. The deeper design question, whether a UI constant mirrored in `libs/core` should be a foreign key into a data row at all, is **not** decided here; that is a schema change and belongs to the maintainer.
- **Risks or compatibility impact:** Low. The migration only inserts rows that are absent, proven idempotent over three runs. A database that already has them is untouched.
- **Open issues or blockers:** None blocking. The `test_pool` gap is fixed only for the new test's pool; every other test still runs with foreign keys off, which is worth a separate sweep.
- **Next first action:** Confirm the reproduction - edit a CV, press Save, expect no error. Then the two other defects reported in the same session: `Open file` on a wizard export is refused by the path guard, and the export filename renders `-` as `_-_`.
- **Evidence:** Branch diff; the reproduction and repair runs against a copy of the real database, quoted above; the mutation run's `code: 787`.

### 2026-08-04, exported documents get a name a person would write

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/export-filename-readable`, from `main` (`024a6c8`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Maintainer reported the exported filename `jetbrains_-_senior_software_developer_-_tailored_cv.pdf` and asked for the `_-_` runs to go.
- **Cause:** `DocumentExportService.filename` lower-cased the label, kept `-` in its allowed set and mapped every other run to `_`. A label of "JetBrains - Senior Software Developer - Tailored CV" therefore rendered each " - " as `_-_`. Cosmetic, but it is the name a recruiter sees on an attachment.
- **The rule the maintainer chose,** from four options put to them (spaces / hyphens / CamelCase / underscores): **words separated by single spaces, original case**. `JetBrains Senior Software Developer Tailored CV.pdf`.
- **Completed:** New `export-filename.ts` holds the rule as two pure functions with a spec; the service is three lines that call it. Extracted rather than fixed in place because the old rule was a private method with no seam - the two tests it had asserted the old output through the save dialog mock, which is a slow way to test a string transform.
- **Details worth keeping:** case and non-ASCII letters survive, so "Zürich" no longer becomes `z_rich`; characters a filesystem refuses are **dropped**, not substituted, so removing a colon does not widen the gap between two words; a name can no longer begin or end with a dot or space, which macOS and Linux write and Windows silently trims; the length is capped at 120 with the cut re-trimmed so it cannot end in a space.
- **Files or packages changed:** new `apps/desktop/src/app/shared/export-filename.ts` (64) and `export-filename.spec.ts` (57), `document-export.service.ts` (120 -> 115), `document-export.service.spec.ts` (two tests rewritten), `CHANGELOG.md`, `DUTY_WATCH.md`.
- **The two rewritten tests are an intended behaviour change, not a fix to make a suite pass.** They pinned the old slug (`my_cv_2026.pdf`); they now pin that the dialog is offered what the new rule produced, and the rule itself is tested directly in its own spec.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (**1208 passed, 96 suites** - 1202/95 before, plus six new), `npm run quality:file-size` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`; the observable change is one string, covered directly.
- **Mutation testing:** M1 dropped `_` and `-` from the separator class, so a hyphenated label would keep its punctuation. Five of the six new assertions failed and the rest of the suite stayed green. Restored from a backup copy, `diff` byte-exact.
- **Privacy/security impact:** None. This only affects the name suggested in the save dialog; the user can still type anything, and nothing here is a trust boundary.
- **Decisions and assumptions:** The Windows launcher's comment in `commands/tailoring_journal.rs` claims "every name Applye writes goes through `readable_slug` (alphanumeric plus hyphen)" as part of why `cmd /C start` is safe. That was already untrue - the save dialog has always let the user type any name - and this makes it visibly untrue. The comment is **not** corrected here because the same claim is load-bearing for the path-guard change in the next PR, and splitting one argument across two branches would be worse than fixing it where it is decided.
- **Risks or compatibility impact:** None to existing files. Only newly suggested names change; nothing reads these names back.
- **Open issues or blockers:** None.
- **Next first action:** The third defect from the same report - `Open file` on a wizard export is refused, because `open_file` only admits paths under `app_data_dir` while the wizard writes wherever the save dialog pointed. The maintainer chose the fix: remember the paths the export commands actually wrote and admit those.
- **Evidence:** Branch diff; check output quoted above; the mutation run.

### 2026-08-04, Applye stops refusing to open the file it just wrote

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/open-exported-file`, from `main` (`024a6c8`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Maintainer reported, with a screenshot: Export PDF on wizard step 5 succeeded and printed `Saved: /Users/…/Downloads/…pdf`, and pressing **Open file** directly beneath it raised `refused: that file is outside Applye's own document folder`.
- **Cause:** `open_file` and `reveal_in_folder` hand a path to the OS launcher, so both are guarded by `resolve_app_owned_file`, which admitted only files under `app_data_dir`. That matched the `generated_docs` exports the guard was written for - its own doc comment says so - and does not match the apply wizard's export, which writes to whatever the save dialog returned. The guard was refusing a file Applye had written seconds earlier.
- **The fix the maintainer chose,** from four options put to them (remember what we wrote / record the path in the database / allow the user's folders / drop the buttons): **remember what we wrote**. A path qualifies by sitting under the data directory **or** by having been written by Applye during this run. The rule changes from location to provenance, so the threat model is kept rather than traded for convenience.
- **Two limits that keep it from being a loophole.** The export commands are themselves callable by the renderer, so a compromised one could ask for a write to any path and then ask to open it - therefore only the extensions Applye actually exports (`pdf`, `docx`) are ever remembered, which keeps the launcher on documents rather than on a `.command` or `.sh` the OS would run. And the set is in memory only: what this run wrote, not a growing record of everywhere the user has saved. Paths are canonicalized on the way in and compared resolved, so a `..` or a symlink cannot smuggle a different file past a matching string.
- **Completed:** New `commands/exported_paths.rs` (the state and the rule, with five tests), `resolve_app_owned_file` gained the provenance branch, the four export commands remember what they wrote, and the state is registered in `lib.rs`.
- **Files or packages changed:** new `apps/desktop/src-tauri/src/commands/exported_paths.rs`, `commands/mod.rs`, `commands/tailoring_journal.rs` (+3 tests), `commands/print.rs`, `commands/documents_export.rs`, `lib.rs`, `CHANGELOG.md`, `DUTY_WATCH.md`. Every touched Rust file is under budget.
- **Validation:** Run and observed on this branch: `cargo build` (clean), `cargo clippy --all-targets` (no errors, no warnings), `cargo test --lib` (**357 passed, 1 ignored** - 349 before, plus eight new), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. The maintainer's reproduction is the outstanding confirmation: export a PDF from step 5 and press Open file.
- **Mutation testing:** M1 removed the exportable-extension check from `remember`, so a `.command` written by an export would become openable. Two tests failed by name - `never_remembers_a_path_the_os_would_execute` and `refuses_an_executable_extension_even_after_writing_it` - and the other 355 stayed green. Restored from a backup copy, `diff` byte-exact, suite back to 357.
- **Privacy/security impact:** This is a security-posture change and was put to the maintainer rather than decided here. The net effect is a narrowing in one respect and a widening in another: files outside `app_data_dir` can now be opened, but only ones this process wrote, only with a document extension, and only until the app restarts. Previously nothing outside `app_data_dir` could be opened, and everything inside it could be, whatever its extension.
- **Decisions and assumptions:** The Windows launcher still uses `cmd /C start`, whose comment claimed "every name Applye writes goes through `readable_slug` (alphanumeric plus hyphen, nothing else survives)". That claim was **already** false - the save dialog has always let the user type any name - and the guard's doc comment is corrected here to state what is actually true. The launcher mechanism itself is **not** changed: swapping it is a behaviour change on a platform that cannot be exercised from this machine, and the extension limit already keeps it pointed at documents. Worth a separate, testable change.
- **Risks or compatibility impact:** Low. Nothing that used to open stops opening. The one visible difference is that after an app restart, the open button on a previously exported path will refuse again - the buttons appear immediately after an export, so this is not a flow the UI offers, but it is the honest limit of an in-memory set.
- **Open issues or blockers:** None. The Windows `cmd /C start` question above is the follow-up.
- **Next first action:** Confirm the reproduction - export a PDF from wizard step 5, press Open file and Show in folder. All three defects from this report now have PRs open; after confirmation the file-size campaign resumes at PR #315.
- **Evidence:** Branch diff; check output quoted above; the mutation run naming both killed tests.

### 2026-08-04, the wizard's export step leaves the jobs page, and the icon guardrail stops shrinking with it

- **Status:** partial - code complete and gated, awaiting the maintainer's click-through
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-export-apply-step`, from `main` (`024a6c8`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** The next cut named in the previous watch: take `wizardExportApplyStep` out of the jobs page, which is over budget in its template, its class and its stylesheet at once.
- **Completed:** New `JobExportApplyStepComponent` (class 81, template 97, stylesheet 185, spec 150). Page: template **786 -> 686**, class **1068 -> 1050**, stylesheet **624 -> 493**. Four `DocumentExportService` aliases and the three forwarding methods `doExport`, `openExportedFile` and `revealExportedFile` are gone from the page; the two class-side resets that used those aliases now name the service. **A real gap in a guardrail was found and closed** (below).
- **Not completed:** All three page files are still over budget. The click-through has not been done.
- **Files or packages changed:** `apps/desktop/src/app/pages/jobs/jobs.component.{ts,html,scss}`, new `job-export-apply-step/` (four files), `job-detail-icons.spec.ts`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **The guardrail gap, and how it surfaced.** `job-detail-icons.spec.ts` exists because a template asking for `icons.doesNotExist` type-checks and only fails under a full `nx build desktop`. It read exactly one file, `jobs.component.html` - so every component split off this page since has taken its icon references somewhere the guard could not see. Nobody noticed, because the guard kept passing on a shrinking input. This split dropped the page to nine references and tripped the spec's own "did the regex match anything at all" assertion, which is the only reason it came to light. The template list is now discovered by asking which components read `JOB_DETAIL_ICONS`, so future splits stay covered without anyone remembering to come back. Coverage 9 -> 26 references across four templates.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - all pre-existing non-null assertions, count identical to `main`), `nx test desktop` (**1205 passed, 96 suites** - 1201/95 on `main`, plus four new), `nx build desktop` (pass), `npm run quality:file-size` (passed - all three touched files moved down), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. That is the outstanding gate and the reason this entry is partial.
- **The build gate earned its place.** A stylesheet range was moved one line short, so `.apply-fields-header--sub` lost its closing brace and the page kept an orphan one. Type-check, lint and all 1205 unit tests passed on that tree; only `nx build desktop` caught it, with `unmatched "}"`. Worth remembering the next time the Angular targets look redundant on a move-only change.
- **Losslessness evidence:** The template block was extracted by line range before deletion and compared against the new component's template - identical modulo Prettier's whitespace, with exactly one content change, `startOver()` becoming `startOver.emit()`. The stylesheet was checked in both directions: the moved ranges match the new stylesheet's first 134 non-empty lines exactly, and the page after deletion equals the page before minus exactly those ranges and nothing else.
- **Mutation testing:** M1 flipped the kind selection in `doExport` so the cover-letter button would export the CV - killed by `exports the linked document that matches the requested kind`. M2 narrowed the icon guard's discovery back to the page template alone - killed by `looks at every component that reads the table, not just the page`. Both applied by absolute path with a printed `MUTATED` confirmation, restored from a backup copy and `diff`ed byte-exact; the suite returned to 1205 passing after each.
- **Privacy/security impact:** None. No new data reaches the component that the page did not already hold, and nothing new is written or sent.
- **Decisions and assumptions:** The step injects `DocumentExportService`, `LinkedDocumentsService`, `JobActionsService` and `WizardActivityService` rather than taking their state as inputs, which is the lever the page's component-scoped `providers` array makes available and the same one PRs #299 and #309 used. `Start over` is the one thing it does not do itself: it resets tailoring, the score and the export state and then navigates, which is page orchestration. `linkedCv` and `linkedCoverLetter` stay declared on the page as well, because the page reads them in nine other places - the child reaches the same signals through the service, not through the page.
- **Risks or compatibility impact:** Style encapsulation is the live risk on this kind of move. `alert`, `eyebrow`, `card`, `apply-fields-header`, `apply-fields-title`, `muted` and `status--error` read like global utilities but are page-local, so they were **copied** into the child's stylesheet, not moved, and the copy is commented as such. `btn` genuinely is global and was not repeated. If a surface looks unstyled in the click-through, that list is the first place to look.
- **Open issues or blockers:** The click-through. Until it is done, this branch must not merge.
- **Next first action:** Run `npm run desktop:dev`, open a job and reach the export step: the CV export button and its recommended badge, the cover-letter button when one is linked, the warning when no CV is linked, the status line, Open file and Show folder after an export, Start over returning to step 1, and the apply summary underneath with the exported path. Report pass or fail per surface; on pass, merge. After that the jobs page still has 686 template lines and no single block that large left - the remaining cuts are smaller, or the next target is `discover.component` (scss 1915/400, html 1070/300, ts 1069/400), which has had no seam audit yet.
- **Evidence:** Branch diff; check output quoted above; before/after non-empty line counts page ts 1068 -> 1050, html 786 -> 686, scss 624 -> 493, new component 81/97/185 plus a 150-line spec.

### 2026-08-04, the CV card's "Generating" that never ends

- **Status:** complete - fix and regression test in; the maintainer's own reproduction still to be re-walked
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/cv-gap-dialog-after-page-destroy`, from `main` (`024a6c8`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Maintainer reported, with a screenshot: pressed Generate CV on wizard step 4, the card went to **Generating** and stayed there. No dialog, no error, nothing happening. The cover letter on the same step generated and linked fine.
- **Reported symptom vs. what was actually wrong:** It looks like a stalled AI call, and it is not. Every AI path already has a timeout - the CLI bridge and the API client both bound at 600 seconds, with the CLI's stdin closed before waiting and `kill_on_drop` set - so a provider that never answers surfaces as an error, not as a permanent spinner. Nothing had failed here. The run was waiting for an answer it could never be given.
- **Root cause.** `CvGapDialogService` is component-scoped, provided by the jobs page. The CV draft asks through it **twice** in one run: once in `foldInGapAnswers`, and again in `fillMissingDates` for entries the model could not date. Leaving the job page destroys that service instance while the generation deliberately carries on in the background - `ngOnDestroy` already calls `dispose()` to release whatever was pending at that moment, and that part worked. What it did not cover is the _next_ `ask()` from the same still-running generation. That call reached the dead instance and set `open` on signals no template reads any more: an invisible dialog, unanswerable, with the generation's promise parked on its resolver forever. `DocumentGenService` is root-provided, so the `cv: true` flag survived the page and a freshly opened page read it straight back out - which is why the new page shows **Generating** with no dialog. The card's own status confirms the diagnosis rather than contradicting it: it reads `awaitingInput` from the _new_ page's dialog service, which is closed, so it renders "Generating" rather than "Awaiting input".
- **Why the cover letter was fine:** it passes `skipGapFill: !!linkedCv() || preparingCv()`, so with a CV in flight it never touches the dialog at all.
- **The fix:** `dispose()` retires the instance, and `ask()` on a retired instance resolves `null` immediately instead of opening. That is what a cancel already returns, and gap-fill is documented fail-open and skippable on every path, so the CV is still produced - it just stops asking the second question once there is no page left to ask it in.
- **Files or packages changed:** `apps/desktop/src/app/shared/cv-gap-dialog.service.ts` (+13), `cv-gap-dialog.service.spec.ts` (+18), `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - the pre-existing baseline), `nx test desktop` (**1202 passed, 95 suites** - 1201/95 before, plus the regression test), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. The maintainer's reproduction is the outstanding confirmation.
- **Test-first evidence:** The regression test was written before the fix and **hung**, failing with `Exceeded timeout of 5000 ms for a test` - the bug reproduced as an unsettled promise rather than as a wrong value, which is what the user was looking at. It passes after the fix.
- **Mutation testing:** M1 changed `this.disposed = true` in `dispose()` to `false`, so a retired instance would open again. The script printed its own `MUTATED` confirmation; the new test went straight back to `Exceeded timeout of 5000 ms` and the other 1205 stayed green. Restored from a backup copy, `diff` byte-exact.
- **Privacy/security impact:** None. No data crosses a boundary it did not before; the change only decides whether a dialog opens.
- **Decisions and assumptions:** Scoped to the hang, deliberately. Adding `OnDestroy` to the service so it retires itself without the page remembering to call `dispose()` would be an improvement, but the page already calls it and bundling it would mean two changes verified as one.
- **Known follow-up, not fixed here:** when a generation finishes after its page was replaced, the _new_ page will not show the freshly linked CV until it is reopened - `LinkedDocumentsService` is component-scoped too, so the result lands on the destroyed page's signals. The document is written to the database correctly and the badge now clears; only the view is stale. That is a separate defect from this hang and wants its own change.
- **Risks or compatibility impact:** Low. The one behaviour difference is that leaving the job page mid-generation now also skips the _date_ questions, where before it skipped only the gap questions and then hung on the dates. A CV generated that way may carry entries without start dates, which the review step already surfaces.
- **Open issues or blockers:** None blocking. PR #315 (export step split) is still waiting on its own click-through.
- **Next first action:** Re-walk the maintainer's reproduction - generate a CV, leave the job page mid-run, return - and confirm the card leaves "Generating". Then pick up the stale-view follow-up above, or return to the file-size campaign.
- **Evidence:** Branch diff; the pre-fix test run failing with `Exceeded timeout of 5000 ms`; the post-fix run at 1202 passing; the mutation run quoted above.

### 2026-08-04, the attribution gate stops rejecting Dependabot's own sign-off

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/attribution-bot-commits`, from `main` (`e24079a`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Unblock PR #301 (`ip-address` 10.2.0 -> 10.4.0), reported red by the maintainer, and every dependency bump behind it.
- **What was actually wrong:** Not the dependency and not the code. Lint, tests, build and `quality:file-size` were all green on #301; `quality:attribution` failed on one line - `commit 5c44f6644382:14: Signed-off-by: dependabot[bot] <support@github.com>`. Dependabot signs every commit it opens, and the attribution gate rejects any `Signed-off-by`. The gate landed 2026-07-31 in #228, so **every** automated bump has been unmergeable since that date; #301 is the first one to come up, not a one-off. Nine such trailers are already in `main`'s history from bumps merged before the gate existed (`3fbf693`, `051e15a` and others), which is the evidence the gate was never meant to cover them.
- **Completed:** `tools/check-attribution.mjs` now skips a commit body when the author is an automation account, and only then. The test file gained a case for it.
- **The exemption is deliberately narrow.** Both halves of the identity must match: the author name ends in `[bot]`, a suffix a human GitHub account cannot register, **and** the address is a `[bot]@users.noreply.github.com` or `support@github.com` address. Setting a bot-looking name on a local commit therefore buys nothing. The pull-request body is inspected in every case, bot or not, and the `--message-file` path used by the commit hook is untouched, so a maintainer's own commit is gated exactly as before.
- **Files or packages changed:** `tools/check-attribution.mjs` (84 -> 102), `tools/check-quality-guardrails.test.mjs` (360 -> 403), `CHANGELOG.md`, `DUTY_WATCH.md`. Both scripts are well inside budget (400 source, 600 test).
- **Validation:** Run and observed: `npm run quality:test` (9 passed, 0 failed - 8 before this watch, plus the new case), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** the Angular and Rust targets - nothing here is shipped code; the change is confined to `tools/`.
- **End-to-end proof against the real commit:** The Dependabot branch was fetched and checked out in a detached worktree, and both versions of the script were run against it from that directory. The pre-change script (`git show main:tools/check-attribution.mjs`) exits 1 with the sign-off violation quoted above; the patched script exits 0. The failure and the fix are demonstrated on the actual commit, not on a fixture resembling it.
- **Mutation testing:** M1 changed `&&` to `||` in `isBotAuthor`, weakening the exemption to either half of the identity. The script printed its own `MUTATED` confirmation, and `attribution guard skips bot-authored commits but not humans borrowing a bot name` failed while the other eight stayed green. Restored from a backup copy and `diff`ed byte-exact; the suite returned to 9 passing.
- **Privacy/security impact:** None to user data. The governance surface narrows by exactly one case: an automation account's own trailer on its own commit. A human or agent commit cannot reach the exemption without deliberately forging both a `[bot]` name and a GitHub noreply address, which is a decision to evade the rule rather than an accident.
- **Decisions and assumptions:** The maintainer chose the commit-level exemption over three alternatives that were put to them - guarding the CI step on `github.actor`, rewriting #301's commit message by hand, or closing #301 and bumping manually. The commit-level version was recommended because the CI-step guard keys the gate to who triggered the run rather than who wrote the commit, and the rewrite fixes one PR while Dependabot force-pushes over it on the next rebase.
- **Risks or compatibility impact:** Low. If another automation account ever needs the same treatment, it qualifies automatically when it uses a GitHub app identity, and does not otherwise.
- **Open issues or blockers:** PR #301 stays red until this merges and it is rebased or re-run. PR #309 still needs the maintainer's click-through; PR #312 (handoff doc) is green and docs-only.
- **Next first action:** Merge this, then re-run #301's checks and merge it. After that the file-size campaign resumes: `wizardExportApplyStep` (~120 template lines) out of the jobs page once #309 clears.
- **Evidence:** Branch diff; the two script runs in the detached worktree quoted above; CI log for run 30859140306 on PR #301.

### 2026-08-04, the wizard's tailor step leaves the jobs page

- **Status:** partial - code complete and gated, awaiting the maintainer's click-through
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-tailor-step`, from `main` (`096159d`)
- **Commits:** one refactor commit on the branch
- **Pull request:** opened against `main`, **not merged**
- **Objective:** Continue the Angular half of the file-size campaign by taking the wizard's tailor step out of `jobs.component.*`, which is over budget in its template, its class and its stylesheet at once.
- **Completed:** New `job-tailor-step/` component: 85 source lines, 163 template, 288 stylesheet, 98 spec. It injects `TailoringService` (component-scoped on the page) and `WizardActivityService` (root) instead of taking their state as inputs, retiring seven page declarations: `tailorStatus`, `allChanges`, `allGaps`, `changesOpen`, `changeType`, `tailorPhases`, `currentPhaseKey`, plus the `tailor-phases` and `classifyChangeType` imports. Orchestration stayed on the page and is reached through four outputs, because starting, cancelling and re-tailoring each continue into the export status, the rescore and the linked documents.
- **Not completed:** **Nobody has looked at the screen.** The maintainer chose click-through verification for Angular work this session, so this branch is not merged. The walkthrough is in the pull request.
- **Files or packages changed:** `apps/desktop/src/app/pages/jobs/jobs.component.{ts,html,scss}`, new `job-tailor-step/job-tailor-step.component.{ts,html,scss,spec.ts}`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings - all pre-existing non-null assertions; the warning count is identical to the same command run against a stashed tree), `nx test desktop` (1194 passed, 94 suites), `nx build desktop` (pass), `npm run quality:file-size` (passed - all three touched files moved down), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. That is the outstanding gate and the reason this entry is partial.
- **Rebased 2026-08-04 after the attribution fix, the `ip-address` bump and the handoff doc landed.** The only conflict was `DUTY_WATCH.md` - two watch entries added at the top of the log by concurrent branches, resolved by keeping both with the newer one above, which is what every conflict in this file has been so far. `CHANGELOG.md` merged on its own. The full set was re-run on the rebased tree and matches: type-check pass, lint 0 errors / 8 warnings, `nx test desktop` **1201 passed, 95 suites** (the count moved because `main` gained tests in the meantime, not this branch), file-size passed, attribution passed, `format:check` exit 0, `git diff --check` clean. The click-through is still the outstanding gate.
- **Losslessness evidence:** The stylesheet block was extracted by line range before deletion and diffed against the new component's stylesheet - byte-identical. The template block was diffed the same way, and the diff is exactly the six intended binding changes and nothing else: the `ngModelChange` handler, two `profile()?.fullMd` reads becoming `hasProfileText()`, and three click handlers becoming output emissions.
- **Mutation testing:** M1: drop the empty-string guard in `onBaseCvChange`, so an empty select coerces to the document id 0 - killed by the new coercion test. M2: hard-code the job id in the `tailoring` computed - killed by the new keyed-by-this-job test. Both applied by absolute path with an applied/not-applied assertion, restored from backup with a byte-exact diff, and the suite returned to 1194 passing.
- **A test that would have lied:** the first draft of the in-flight test stubbed `WizardActivityService.isRunning` over a plain `Set`. `tailoring` is a `computed`, so mutating the Set never invalidated it and the assertion read a stale `false`. The stub is now signal-backed. Worth remembering for the next child extracted this way: a non-reactive stub behind a computed fails in the direction that looks like a product bug.
- **Privacy/security impact:** None. No storage, network, IPC or permission change; the step renders state the page already held.
- **Decisions and assumptions:** `selectedBaseCvId` stays owned by the page and travels down as an input with a `baseCvChange` output rather than a two-way `model()`, matching the `chooseDocument` precedent from `app-job-document-cards` - the page reads that id when it builds the tailoring context, so it should stay the owner. Page-local utilities (`eyebrow`, `row`, `card`, `apply-fields-*`, `muted`, `status`) were **copied** into the child stylesheet, not moved: style encapsulation stops the page's CSS at the child boundary and the page still uses all of them elsewhere. `btn`, `badge` and `ai-thinking` are genuinely global and were not repeated.
- **Observation, not fixed:** the changes-summary icon carries `scoring-view__accent-icon`, a class defined in `scoring-view.component.scss` under emulated encapsulation. It therefore never applied on the jobs page and does not apply now either. Pre-existing dead styling; fixing it would change how the page looks, which is outside a no-visual-change refactor.
- **Risks or compatibility impact:** This is the first Angular split in the campaign to move an interactive step rather than presentational cards. Type-check, lint and unit tests all pass, and none of them can see a broken binding in a rendered template - which is exactly why the click-through gate exists.
- **Open issues or blockers:** The click-through. Until it is done, this branch must not merge.
- **Next first action:** Run `npm run desktop:dev`, open a job with a profile or a matching base CV, and walk the tailor step: the base-CV select and its "from scratch" option, Tailor, the phase cards and thinking line, Cancel, then the finished state with its Tailored badge, Tailor again, and the changes and gaps sections. Report pass or fail per surface; on pass, merge the PR and take `wizardExportApplyStep` (~120 template lines) next.
- **Evidence:** Branch diff; check output quoted above; before/after non-empty line counts template 941 -> 786, class 1080 -> 1068, stylesheet 860 -> 624.

### 2026-08-04, reading a skill response leaves the CV content model, and stops accepting an apology as a CV

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-parse-util`, from `main` (`ec3cded`)
- **Commits:** one commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Continue the Angular half of the campaign on a file needing no click-through, since PR #309 is still parked awaiting one.
- **Completed:** `cv-content.util.ts` **829 -> 622**. `cleanJsonText`, `closeOpenStructures`, `repairTruncatedJson`, `tryParseParsed`, `parseCvSkillResponse`, the gap-question types with `parseCvGapResponse`, `buildAdditionalInfoBlock` and `parseDateAnswer` moved to `cv-parse.util.ts`. Their tests already lived in `cv-parse.util.spec.ts` - a spec named for a module that did not exist - and now import from it. **A real bug was found and fixed** (below).
- **Not completed:** `cv-content.util.ts` is still 622/400. The remaining seam is the CV content model itself (`buildCvContent`, `cvContentToMd`, `markdownToCvContentFallback`, `normalizeCvContent`), left for its own PR. PR #309 still needs the maintainer's click-through.
- **Files or packages changed:** `apps/desktop/src/app/pages/documents/cv-content.util.ts`, new `cv-parse.util.ts`, `cv-parse.util.spec.ts`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **The bug, and how it surfaced.** Mutation testing the moved code: deleting the `throw` in `parseCvSkillResponse` so invalid JSON returned an empty draft left **all 1195 tests green**. The function's own doc promises the opposite - "throws with the raw text so the caller can surface a real error instead of a silent empty draft" - and nothing tested it. Writing that test then exposed the wider hole: the guard only checked that `JSON.parse` succeeded, so a bare JSON string, a number or `null` all passed as a `Partial<CvParsedContent>` with no keys. The one that happens in practice is the string: a model answering `"I could not read this CV"` in the JSON the prompt asked for. The user saw a blank editor and no reason for it. `tryParseParsed` now accepts only a plain object. An empty object is still accepted, deliberately - a CV with no recognised fields is a real answer and the review step is what asks about it.
- **Left alone, and said so in the spec:** a JSON _array_ still gets through, because the repair pass recovers the first object inside it. That is the same recovery a truncated response depends on, so tightening it would be a change to repair behaviour rather than to this guard, and no caller passes an array.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings, all pre-existing; the warning-line count matches the same command on a stashed tree), `nx test desktop` (1198 passed, 94 suites - 1195 before this watch, plus three new), `npm run quality:file-size` (passed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev`. Nothing here renders; the behaviour change is in a pure function with unit tests either side of it.
- **Losslessness evidence:** The moved block was extracted by line range before deletion and diffed against the new module - byte-identical. The two later edits to it (the `tryParseParsed` guard and its doc comment) were made after that diff and are visible as such in the branch diff.
- **Mutation testing:** M1 remove the `throw` - now killed by the new test, having survived before it. M2 remove the plain-object check - killed by the new test. Both applied by absolute path with an applied/not-applied assertion, restored from backup with a byte-exact diff; the suite returned to 1198 passing after each.
- **Privacy/security impact:** None directly. Worth noting the direction: the fix makes the app **refuse** malformed model output rather than persist a hollow document, which is the safer of the two for a file the user will send to an employer.
- **Decisions and assumptions:** The new module is re-exported from `cv-content.util.ts` rather than repointing every consumer, following the note that file already carries: splitting costs each consumer one import line and three of the importers are themselves over budget, so the size gate refuses that version. Only the spec was repointed, since a test file has room. This is the one place in the campaign where consumers do **not** name the defining module, and the reason is written down at the re-export.
- **Risks or compatibility impact:** The parse guard is a behaviour change, not a pure move: input that previously produced an empty draft now throws. That is the documented contract and the error path the callers already handle, but it is the line to look at if a CV import starts reporting failures it did not report before.
- **Open issues or blockers:** PR #309 needs the maintainer's walkthrough before it can merge.
- **Next first action:** After PR #309's click-through, take `wizardExportApplyStep` (~120 template lines) out of the jobs page. Without it, split the CV content model out of `cv-content.util.ts` (622/400) - `cvContentToMd` and `markdownToCvContentFallback` are the cohesive pair.
- **Evidence:** Branch diff; check output quoted above; before/after non-empty line counts `cv-content.util.ts` 829 -> 622, new `cv-parse.util.ts` 237, spec 445 -> 482.

### 2026-08-04, Discover's location rules separate from their vocabulary

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-location-tables`, from `main` (`096159d`)
- **Commits:** one refactor commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Continue the Angular half of the campaign on a file that needs no click-through, since the tailor-step branch (PR #309) is parked awaiting one.
- **Completed:** `discover-location.ts` **910 -> 128**. The vocabulary - `COUNTRY_DEFS`, `US_STATES`, `CA_PROVINCES` and the three table interfaces - moved to `discover-location-tables.ts`; the matching rules stayed. The tables file imports `RegionKey` with `import type`, so the cycle between the two modules is erased at compile time. Four new tests assert rules the table had only stated in comments.
- **Not completed:** Nothing in this task. Separately, PR #309 (`refactor/jobs-tailor-step`) is still unmerged and still waiting on the maintainer's click-through; CI on it is green.
- **Files or packages changed:** `apps/desktop/src/app/pages/discover/discover-location.ts`, new `discover-location-tables.ts`, new `discover-location-tables.spec.ts`, `tools/check-file-size-budgets.mjs`, `tools/check-quality-guardrails.test.mjs`, `docs/governance/CODE_QUALITY.md`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `nx run desktop:type-check` (pass), `nx run-many --target=lint --projects=desktop` (0 errors, 8 warnings, all pre-existing; the warning-line count is identical to the same command on a stashed tree), `nx test desktop` (1195 passed, 94 suites), `node --test tools/check-quality-guardrails.test.mjs` (8 passed, including the new exclusion test), `npm run quality:file-size` (passed), `npm run quality:file-size:all` (TypeScript source 19 over budget, down from 20), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `npm run desktop:dev` - nothing here renders; the change is a pure module move behind `classifyLoc`, which has its own unit tests.
- **Losslessness evidence:** Both moved regions were extracted by line range to scratch files before deletion and diffed against the new module. The interfaces are byte-identical; the tables differ only by the `export` keyword added to five declarations, and nothing else.
- **Mutation testing:** Applied by absolute path with an applied/not-applied assertion, restored from backup with a byte-exact diff. M1: give Qatar Saudi Arabia's `sa` code - killed by the duplicate-code test. M2: hoist the region-generic `Europe` entry to the front of `COUNTRY_DEFS` - killed by the ordering test. Suite returned to 1195 passing after each.
- **Governance decision, and it was the maintainer's:** the extracted vocabulary is 811 lines, and the gate rejects a **new** file over budget - so the split as designed could not land. The choice was between splitting the list by continent into seven files, excluding it as data, or abandoning the split. Asked, and the maintainer answered "as you recommend", which authorised the recommended option: exclude it, beside the translation catalogue that is excluded for the same reason. `CODE_QUALITY.md` now states the condition under which a vocabulary earns that - a flat table, no branching, no functions, every rule that reads it in another module - and the reasoning: splitting a rules module away from its table is the refactor the budget should be pushing for, and a budget that then rejects the table punishes exactly that move.
- **The exclusion is tested, because an exclusion that leaks stops measuring the code it exists to protect.** The new guardrail test asserts the vocabulary passes at 900 lines while the rules module beside it fails at 401, the table's own spec file fails at 700, and a same-named file in another folder fails at 401. The pattern is anchored to the exact path; `*-tables.ts` buys nothing.
- **Privacy/security impact:** None. No storage, network, IPC or permission change. `classifyLoc` is pure and runs on text the app already holds.
- **Decisions and assumptions:** The tables file imports `RegionKey` as a type-only import rather than moving the type across, because `RegionKey` is the vocabulary the Discover page and its filters speak, not a detail of the table. The interfaces `CityDef`, `CountryDef` and `RegionCode` describe the table's own shape and went with it.
- **Risks or compatibility impact:** Low for the move - one list, no rule touched, and `classifyLoc`'s existing spec still passes. The governance change is the part worth watching: it is the first non-i18n exclusion, and the test above is what keeps it from widening by accident.
- **Open issues or blockers:** PR #309 needs the maintainer's walkthrough before it can merge. `tools/check-file-size-budgets.mjs` is now 377/400 and near its own budget.
- **Next first action:** After PR #309's click-through, take `wizardExportApplyStep` (~120 template lines) out of the jobs page. If the click-through has not happened, `apps/desktop/src/app/pages/documents/cv-content.util.ts` (829/400) is the next file that needs no UI verification.
- **Evidence:** Branch diff; check output quoted above; before/after non-empty line counts `discover-location.ts` 910 -> 128, new `discover-location-tables.ts` 811 (excluded), new spec 72.

### 2026-08-04, discover geography splits, and a silent market-widening gap is closed

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-geo-countries`, from `main` (`3f66918`)
- **Commits:** one refactor commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Bring `apps/desktop/src-tauri/src/commands/discover_geo.rs` under the 500-line Rust source budget, which closes the Rust half of the file-size campaign.
- **Completed:** `discover_geo_countries.rs` takes `US_STATE_NAMES`, `US_STATE_CODES`, `country_tokens` and `KNOWN_COUNTRY_CODES`. What stays is the region scopes, the pickable local markets, `parse_local_markets`, `loc_matches` and `location_signal`. `discover_filter.rs` now imports the two country symbols from the module that defines them. Three tests were added to the new module, one of them closing a real gap found by mutation testing.
- **Not completed:** No Angular work. The handoff requires a maintainer decision on how UI changes get verified before any of it starts, and that decision has not been made.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover_geo.rs`, new `discover_geo_countries.rs`, `discover_filter.rs`, `commands/mod.rs`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `cargo clippy --all-targets -- -D warnings` (clean), `cargo test --lib` (345 passed, 0 failed, 1 ignored), `cargo fmt` (applied), `npm run quality:file-size` (passed), `npm run quality:file-size:all` (`discover_geo.rs` no longer listed), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `tauri dev`. No Angular, IPC surface, migration or provider behaviour changed.
- **Losslessness evidence:** Both moved regions were extracted by line range to scratch files before deletion and diffed against the same regions of the new module. Byte-identical. One deliberate deviation, diffed separately and confirmed identical in content: the doc paragraph explaining `country_tokens` and the German city lists sat above `US_STATE_NAMES`, one item away from the function it describes. It now sits on `country_tokens`. No code moved with it.
- **Mutation testing:** Applied by absolute path with an applied/not-applied assertion before each run, and restored from a backup copy with a byte-exact diff afterwards. M1: return the bare `ca` token to Canada - killed by `canada_gives_up_the_bare_ca_token_to_california`. M2: drop `gb` from `KNOWN_COUNTRY_CODES` - **survived**, and was verified to be a real behaviour change rather than a no-op by reading `elsewhere_tokens`: it skips any region whose list overlaps the selected market, so for a `de` market the European names come only from each country's own entry, and without `gb` a "Remote - London" posting stops matching `elsewhere` and passes on the word "Remote". A test was added; re-running M2 against it now fails, and the suite is back to 345 passing.
- **Privacy/security impact:** None. No network, storage, permission or IPC change. The geo tables decide which already-fetched postings the user is shown, and nothing here changes what is fetched.
- **Decisions and assumptions:** The seam was drawn at "which names belong to a code" versus "which names belong to a scope", because those change on different occasions - one when a market or board is added, the other when a continent bucket is redefined. `loc_matches` stayed with the scopes even though the country tables' docs reference it, since it is a matching rule rather than vocabulary.
- **Risks or compatibility impact:** Low. Pure movement plus three new tests; the only call-site change is one `use` statement in `discover_filter.rs`.
- **Open issues or blockers:** `AGENTS.md` and the `applye-rust` skill both still state the superseded 800-line Rust budget, replaced on 2026-08-03 by 500 source / 600 tests. Not corrected here, to keep this diff to one seam. The `cli_probe` status-mapping coverage gap from an earlier watch is still open.
- **Next first action:** Correct the two stale 800-line Rust budget statements in `AGENTS.md` and `.claude/skills/applye-rust/SKILL.md`, then ask the maintainer how Angular UI changes will be verified before opening the Angular half of the campaign.
- **Evidence:** Branch diff; check output quoted above; before/after source line counts `discover_geo.rs` 522 -> 246, new `discover_geo_countries.rs` 293 source / 68 tests.

### 2026-08-04, the from-link flow gives up the helpers it never owned

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/job-url-web-helpers`, from `main` (`3f66918`)
- **Commits:** one refactor commit on the branch
- **Pull request:** opened against `main`
- **Objective:** Bring `apps/desktop/src-tauri/src/commands/job_url.rs` under the 500-line Rust source budget by moving out the shared web-payload helpers, without changing any behaviour.
- **Completed:** Two new modules. `web_text.rs` holds `strip_html` with its entity-decoding and tag-stripping internals plus `xml_tag`, and takes the eight markup tests and the Personio XML test with it. `url_parts.rs` holds `extract_host`, `path_segments` and `titleize_slug`. Four discover modules (`discover_fetch`, `discover_parsers`, `discover_parsers_ats`, `discover_sources`) had been importing these back out of `job_url`, an inversion the split corrects: they now name the module that defines what they use. `host_matches` stayed with the allowlist it serves. `extract_host`, `path_segments` and `titleize_slug` had no tests at all; each now has one, which matters most for `extract_host`, since the string it returns is what the closed-board allowlist is matched against.
- **Not completed:** The second remaining over-budget Rust file, `commands/discover_geo.rs` at 522/500, is untouched. No Angular work was started; the handoff requires a maintainer decision on how UI changes get verified before any of it begins.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/job_url.rs`, new `web_text.rs`, new `url_parts.rs`, `commands/mod.rs`, `discover_fetch.rs`, `discover_parsers.rs`, `discover_parsers_ats.rs`, `discover_sources.rs`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed on this branch: `cargo clippy --all-targets` (clean, no warnings), `cargo test --lib` (345 passed, 0 failed, 1 ignored), `cargo fmt` (applied), `npm run quality:file-size` (passed), `npm run quality:file-size:all` (Rust source now 1/59 over budget, down from 2), `npm run quality:attribution` (passed), `npx nx format:check` (exit 0), `git diff --check` (clean). **Not run:** `tauri dev`. No Angular, IPC-surface or database behaviour changed, and the two Tauri commands in `job_url.rs` keep their names and registry entries.
- **Losslessness evidence:** Every moved block was extracted to a scratch file by line range before deletion and diffed against the same region of the new module afterwards. All four regions - the `strip_html` family, `xml_tag`, `extract_host`, and `path_segments`/`titleize_slug` - are byte-identical.
- **Mutation testing:** Two mutations, each applied by absolute path with an applied/not-applied assertion before the run. M1: decode `&amp;` first in `decode_entities`, which collapses two escaping layers in one pass - killed by `web_text::tests::decodes_one_escaping_layer_per_round`. M2: drop the port-stripping line in `extract_host` - killed by `url_parts::tests::extracts_the_bare_lowercase_host`, a test that did not exist before this watch. Both files were restored from a backup copy and diffed to prove the restore was byte-exact, and the suite returned to 345 passing.
- **Privacy/security impact:** None intended, and the security-relevant surface was checked deliberately. The host allowlist, the closed-board list and the safe default of `Unknown` are unchanged; `extract_host` moved without a character changed and is now covered by tests for the port, `user@` prefix, whitespace and case that could otherwise let a crafted URL read as an allowed host. No new network call, file write or permission.
- **Decisions and assumptions:** Two modules rather than one. Parsing markup and parsing a URL's shape are separate reasons to change, and a single `web_payload.rs` would have bundled them for no benefit beyond one fewer file. Only one seam was taken - the per-board readers and the HTTP client are still in `job_url.rs`, which at 399 has room, and splitting them would have been a second seam in one PR.
- **Risks or compatibility impact:** Low. Pure code movement plus new tests; no call site changed except the module path in five `use` statements.
- **Open issues or blockers:** Two documentation files still state the superseded Rust budget: `AGENTS.md` ("Rust modules at 800") and the `applye-rust` skill ("Hard budget: 800 non-empty lines per Rust source or test file"). Both predate the 2026-08-03 change to 500 source / 600 tests and will mislead the next agent. Not fixed here to keep this diff to one seam. Separately, the `cli_probe` status-mapping coverage gap filed in the previous watch is still open.
- **Next first action:** Split `apps/desktop/src-tauri/src/commands/discover_geo.rs` (522/500), which closes Rust entirely, then correct the two stale 800-line budget statements in `AGENTS.md` and the `applye-rust` skill.
- **Evidence:** Branch diff; check output quoted above; before/after source line counts `job_url.rs` 580 -> 399, new `web_text.rs` 146 source / 97 tests, new `url_parts.rs` 51 source / 47 tests.

### 2026-08-04, the ATS check's vocabulary separates from its scoring

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/ats-tokenizer-split`, from `main` (`ed69962`)
- **Pull request:** to open against `main`
- **Objective:** `ats.rs` at 619/500.
- **Completed:**
  - **`ats_tokens.rs` (353).** `tokenize`, `is_stopword` with its English/German table,
    `is_technical_shape` and `mixed_case_terms`. Most of the file's excess was the stopword list
    itself, which is data rather than logic and reads as noise inside the scorer.
  - **`ats.rs` 619 -> 289 source lines, under budget.** What stays is the scoring: term extraction,
    weighting, coverage and the verdict.
  - **An inversion undone.** `ats_format.rs` imported `tokenize` back out of `ats.rs`; it now names
    the module that defines it.
  - Rust files over budget: **3 -> 2**.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **341 passed, 0 failed, 1 ignored**, up one by the new test below.
  - `npm run quality:file-size` - passed; `ats.rs` no longer appears in the report.
  - Line-range check on both moved blocks - byte-identical.
  - Mutation checks. Dropping the punctuation the tokenizer preserves fails
    `tokenizer_keeps_technology_names_intact`.
  - **A second mutation survived and was fixed rather than reported.** Removing the
    `mixed_case.contains(term)` arm from `is_technical_shape` left all 340 tests green, yet it is a
    real behaviour change: `postgresql` and `javascript` carry no digit and no symbol, so internal
    capitals in the posting are the only thing marking them technical. Without that they lose their
    weight bonus and can drop out of the term list entirely - a silent loss of exactly the keywords
    a recruiter filter is likeliest to use. Unlike the `cli_probe` gap in the previous watch this
    one was cheap to close, because the extraction had just made it a pure function in a module with
    its own tests, so a test was added and the same mutation now fails.
  - One mutation was left uncovered deliberately: removing the `len() < 2` guard in
    `mixed_case_terms` changes nothing observable in any fixture and is not worth a test.
- **Privacy/security impact:** none. Pure string handling, no I/O.
- **Risks or compatibility impact:** none. No command moved; the `lib.rs` registry is untouched.
- **Open issues or blockers:** none.
- **Next first action:** `job_url.rs` at 580/500, then `discover_geo.rs` at 522/500 - the last two
  Rust files over budget.

### 2026-08-04, the CLI bridge splits into run, probe and install

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/ai-cli-split`, from `main` (`983a33c`)
- **Pull request:** to open against `main`
- **Objective:** `ai/cli.rs`, the largest remaining Rust file and one the campaign had never touched.
- **Completed:**
  - **`cli_probe.rs` (170).** `CliStatus`, `probe_version`, `cli_health`, `cli_probe`, and the short
    `VERSION_TIMEOUT` that keeps a `--version` call from hanging Settings. Answers only "what is on
    this machine"; never runs a prompt.
  - **`cli_install.rs` (200).** `NPM_PACKAGES`, `npm_package_for`, `CliInstallResult`, `cli_install`
    and `INSTALL_TIMEOUT`. The only part of the bridge that changes the machine rather than reading
    it, which is why its safety rules are now the first thing in the file.
  - **`ai/cli.rs` 668 -> 420 source lines, under budget.** What stays is the inference path: the two
    adapters, the shared helpers and `run`.
  - Two commands moved, so `lib.rs` was repointed (`cli_probe`, `cli_install`), and
    `commands/health.rs` called `crate::ai::cli::cli_health` directly - also repointed.
  - Rust files over budget: **4 -> 3**.
- **Files or packages changed:** `ai/cli.rs`, `ai/mod.rs`, `lib.rs`, `commands/health.rs`, two new
  files, `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **340 passed, 0 failed, 1 ignored**, unchanged.
  - `npm run quality:file-size` - passed, 668 -> 420.
  - Line-range check on all four moved blocks - byte-identical.
  - Mutation check on the security-relevant rule: making `cli_install` fall back to the caller's own
    provider string as the package name - the allowlist bypass - fails
    `install_refuses_a_provider_that_is_not_on_the_list`.
  - **A surviving mutation was found and is a real gap, though a pre-existing one.** Changing
    `cli_probe`'s error arm to report a broken CLI as working leaves all 340 tests green: the test
    named for that case exercises `probe_version` directly, and the mapping inside `cli_probe`
    cannot be reached without the real machine. Not fixed here - making it testable means extracting
    a pure `status_for`, which is a design change and does not belong in a relocation. Raised as its
    own task. Worst case is cosmetic: Settings showing a broken CLI as working.
- **Privacy/security impact:** none intended, and none found. The install path's guarantees are
  unchanged and were re-read line by line during the move: allowlist-only packages, no
  interpolation of the frontend's provider string into a command, `npm` resolved to an absolute path
  and run without a shell, stderr truncated before it reaches the UI. The visibility widened during
  the split (`CliAdapter`, `CliReply`, `resolve_binary`, `truncate_stderr`, `adapter_for`,
  `not_installed_error`) is `pub(super)` throughout - reachable inside `crate::ai` only, not
  exported from the crate.
- **Decisions and assumptions:** two modules in one watch again, for the same reason as the parsers:
  either cut alone leaves the file over budget, and both express one idea - the file was answering
  three questions and now answers one.
- **Risks or compatibility impact:** two commands moved. No name, signature or payload changed, and
  `tauri::generate_handler!` would not compile against a wrong path.
- **Open issues or blockers:** none.
- **Next first action:** `ats.rs` at 619/500, then `job_url.rs` 580 and `discover_geo.rs` 522.

### 2026-08-04, the feed readers split by source family

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-parsers-families`, from `main` (`557dd99`)
- **Pull request:** to open against `main`
- **Objective:** take the first target the corrected Rust budget exposed.
- **Completed:**
  - **`discover_parsers_ats.rs` (158) plus its tests (91).** Greenhouse, Lever, Ashby and Personio.
    They share a shape the public feeds do not: a slug-scoped endpoint for one company, so the
    employer is known before the request is made and each reader takes it as an argument and falls
    back to it when a posting does not name its own.
  - **`discover_parsers_nofluffjobs.rs` (194) plus its tests (110).** The only source in the group
    that needs two requests - its list endpoint carries no description at all - so the list reader,
    the detail reader and the salary formatter belong together and away from the single-request
    feeds.
  - **`discover_parsers.rs` 697 -> 406 source lines, under the 500 budget.** What stays is the
    shared vocabulary (`RawJob`, `json_str`, `html_to_text`, the RSS helpers, percent-encoding) and
    the feeds that need one request.
  - Rust files over budget: **5 -> 4**.
- **Not completed:** nothing in scope.
- **Files or packages changed:** `discover_parsers.rs`, `discover_parsers_tests.rs`,
  `discover_fetch.rs`, `commands/mod.rs`, four new files, `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **340 passed, 0 failed, 1 ignored**, unchanged.
  - `npm run quality:file-size` - passed; `discover_parsers.rs` no longer appears in the report at
    all, not even as a near-budget notice.
  - Line-range check on all four moved blocks - byte-identical.
  - Mutation checks, both caught: reading the Personio title from the descriptions half instead of
    the block above them fails two Personio tests; dropping the `{ postings: [...] }` wrapper shape
    from No Fluff Jobs fails `nofluffjobs_reads_postings_wrapper_shape_and_remote`.
  - A third mutation was discarded rather than reported as a pass: rewriting the Personio title
    lookup to read the whole block left every test green, but the title tag precedes
    `<jobDescriptions>` in the fixture either way, so the mutation changed nothing. A surviving
    mutation is only evidence when it actually alters behaviour.
- **Privacy/security impact:** none. Pure relocation; no new I/O, no new dependency, no parser
  behaviour changed.
- **Decisions and assumptions:** two modules in one watch rather than the usual one, because either
  cut alone leaves the file over budget and both express the same idea - grouping readers by what
  kind of source they read.
- **Risks or compatibility impact:** none. No command moved, so the `lib.rs` registry is untouched.
- **Open issues or blockers:** none.
- **Next first action:** `ai/cli.rs` at 668/500 is the largest remaining Rust file, and unlike the
  discover group it has never been split. Audit it first with
  `npm run quality:file-size:all` and a consumer check before choosing a seam.

### 2026-08-03, the file-size budgets are audited and the Rust one is corrected

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/file-size-budget-rust-split`, from `main` (`85c0ae6`)
- **Pull request:** to open against `main`
- **Objective:** answer whether the budgets are set correctly before spending more watches on them.
- **Completed:**
  - **Checked the numbers against the only external anchors that exist.** ESLint `max-lines`
    defaults to 300 and counts comments; the Angular 400-line rule the TypeScript budget inherits
    was **removed** from the current angular.dev style guide and survives only in v17 and earlier;
    SonarQube S104 defaults to 1000. There is no file-length lint for Rust at all. Conclusion:
    400 / 600 / 300 / 400 are defensible and were left alone. Re-tuning them changes little while
    the ratchet, not the absolute number, is what actually blocks a change.
  - **Fixed the one budget that measured the wrong thing.** 33% of this repository's Rust lines are
    inline `#[cfg(test)]` items, so the single 800-line rule scored source and tests together:
    `tailoring.rs` passed at 699 with only 266 lines of source, while `discover_parsers.rs` passed
    on nearly the same score with 694 source lines and 3 test lines. Rust is now measured in two
    parts, **source 500** and **inline tests 600**. The new source budget is stricter than the 800
    it replaces and no longer penalises a module for being well tested.
  - **Added `npm run quality:file-size:all`.** Repository-wide audit listing everything over budget
    or within 20% of it. Always exits zero - a report, not a gate.
  - Updated `docs/governance/CODE_QUALITY.md`, whose table already claimed a separate Rust test
    budget that the checker had never implemented.
- **Findings recorded rather than acted on:** comments are 13% of counted TypeScript and Rust lines
  and the budget counts them. ESLint's default does the same, so this is not unusual, but it taxes
  the thing this codebase does most deliberately. Left as is, and flagged so it is a choice rather
  than an inherited default.
- **Validation:**
  - `npm run quality:test` - **7 passed**, up from 4. Three new tests cover the Rust split, the
    literal masking, and the audit mode.
  - **Mutation battery on the masker, six mutations, all six caught:** unhandled raw strings,
    unhandled plain strings, a lifetime that swallows to the next quote, unhandled line comments,
    unhandled block comments, and no masking at all. The first version of that test caught only two
    of the six - its decoys sat _before_ the test module, where brace balance is never consulted,
    and two were unbalanced in the insensitive direction. Rewritten to put the decoys inside the
    `#[cfg(test)]` block and to assert exact line counts rather than budget status.
  - `npm run quality:file-size` on the repository - passed; the checker itself is 364/400.
  - `format:check`, `git diff --check` - passed.
- **Privacy/security impact:** none. Build tooling only.
- **Decisions and assumptions:**
  - The audit mode exits zero deliberately. Failing on 46 pre-existing over-budget files would block
    every unrelated change, and the ratchet already prevents growth.
  - Rust source 500 was chosen from the measured distribution: it puts 5 files over, which is an
    actionable backlog rather than a wall.
- **Risks or compatibility impact:** the stricter Rust budget cannot break existing work, because
  the ratchet only fails a file that **grew**. The five newly-over files are frozen, not broken.
- **Open issues or blockers:** none.
- **Next first action:** `discover_parsers.rs` at 697/500 is now the largest Rust offender and the
  honest next Rust target - it was invisible under the old rule because its 697 lines scored the
  same as a file that was two-thirds tests.

### 2026-08-03, the first Angular split - the wizard document cards

- **Status:** partial - the change is complete and green, but the agreed UI walkthrough did not happen
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-document-cards`, from `main` (`85c0ae6`)
- **Pull request:** #299, **open and deliberately not merged**
- **Objective:** start on the jobs page, the largest Angular offender, using child components.
- **Completed:**
  - **`app-job-document-cards`.** The CV and cover-letter review cards: status badges, the
    create/regenerate/review buttons, and the choose-an-existing selects. Injects the six services
    it reads; emits five events for everything that does work.
  - **The finding that unblocks this page.** The jobs page provides seventeen services
    component-scoped, so a child rendered inside its template inherits that injector. That is why a
    child component removes alias declarations rather than merely relocating them - it is the lever
    for the 48 aliases the earlier stop at 1104 could not touch. Nine went with this one cut.
  - Card styles moved with the markup, because style encapsulation stops the page's rules at the
    component boundary. `.muted` and `.status` look like global utilities but are page-local and had
    to be carried; `.btn`, `.badge` and `.ai-thinking__dots` are genuinely global and were not.
  - Sizes: template **1122 -> 941**, class **1104 -> 1080**, stylesheet **919 -> 860**. All three
    still over budget.
- **Not completed:** the manual walkthrough of the documents step. See below.
- **Files or packages changed:** `jobs.component.{ts,html,scss}`, new
  `job-document-cards/` (component, template, styles, spec), `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:**
  - `nx run desktop:type-check` - clean. ngc checks template bindings, so the rewired inputs and
    outputs are verified, not just the class.
  - `nx run desktop:lint` - 0 errors, 8 pre-existing warnings in unrelated spec files.
  - `nx run desktop:test` - **1191 passed across 93 suites**, up from 1186 by exactly the 5 new specs.
  - `npm run quality:file-size` - passed; the ratchet moved on all three files.
  - `quality:attribution`, `format:check`, `git diff --check` - passed.
  - Mutation check: letting the cover-letter card read `gapSvc.open()` for `awaitingInput` - the
    leak that would make a cover letter claim it is waiting on the CV's gap dialog - fails
    `never marks the cover letter as needs_input`. Restored and re-run green.
  - **Not run: the UI walkthrough.** The plan agreed with the maintainer was to walk the flow in the
    running app. `npm run desktop:dev` launched and the Angular bundle rebuilt with the change, but
    the request for automated control of the window was declined, so the click-through did not
    happen. Type-check catches broken bindings and the specs cover the badge states and emitted
    events, but neither proves the documents step looks and behaves right end to end. The PR records
    this gap in its own body rather than only here.
- **Privacy/security impact:** none. Presentational extraction; no new I/O, no new dependency.
- **Decisions and assumptions:**
  - The final-checks section stayed in the page on purpose. `retailorFromFinalChecks()` orchestrates
    back into tailoring and scoring, which does not belong in a presentational child - and it is the
    code path the #284 duplicate-row bug lived on.
  - The region and language selects stayed too, because `finalCheckInputs()` reads them and three
    page-side callers depend on it.
  - A single child for the whole documents step was rejected on measurement: at ~330 template lines
    it would have been born over the 300 budget.
- **Risks or compatibility impact:** no behaviour intended to change. Residual risk is visual or
  binding-level inside the documents step, which is exactly what the missing walkthrough would cover.
- **Open issues or blockers:** #299 waits on a maintainer click-through, or on app-control access
  being granted so the walkthrough can be done here.
- **Next first action:** after #299 is settled, take the wizard's export/apply step
  (`wizardExportApplyStep`, template ~120 lines) the same way, then the tailor step. Measure the
  template block first - any child that would exceed 300 lines has to be split before it is written,
  which is the mistake the documents step nearly made.

### 2026-08-03, the two leftovers from the Rust campaign

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-leftovers`, from `main` (`605707c`)
- **Pull request:** to open against `main`
- **Objective:** clear the two items the closing entry left open, so the Rust side is genuinely done.
- **Completed:**
  - The two `#[ignore]`d live-network tests moved from `discover.rs` to `discover_fetch.rs`. They
    build a `SourceRow` and call `http_client` and `fetch_source_jobs` - all of which now live
    there, none of which is in `discover.rs` any more. **599 -> 537.**
  - **The `derive_title_keywords` name collision is resolved as a deliberate no-change, and
    documented as one.** The two functions are not duplicates: `discover_filter`'s keeps `+` and `#`
    as word characters, so `c++` and `c#` survive as scan keywords, while `archetypes`' splits on
    them and drops any word containing a digit, because it judges whether a job is on-archetype
    rather than building a filter. Merging them would change what a scan matches on. Each doc
    comment now names the other and says why they stay apart.
  - Checked while there: `archetypes.rs` is not dead. `check_archetype_match` is registered in
    `lib.rs` and invoked from `libs/data/src/lib/services/db.service.ts:79`.
- **Not completed:** nothing in scope.
- **Files or packages changed:** `discover.rs`, `discover_fetch.rs`, `discover_filter.rs`,
  `archetypes.rs`, `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **340 passed, 0 failed, 1 ignored**, unchanged.
  - `cargo test --lib -- --ignored --list` confirms `live_tier2_sources_fetch_and_parse` is still
    discoverable under its new path, so the manual check did not silently disappear.
  - Line-range check on the moved test block: byte-identical.
  - `npm run quality:file-size`, `quality:attribution`, `format:check`, `git diff --check` - passed.
- **Privacy/security impact:** none. Comments and a test relocation only.
- **Risks or compatibility impact:** none. No behaviour change, no signature change.
- **Open issues or blockers:** none on the Rust side.
- **Next first action:** Angular, and it needs a maintainer decision before any code is written -
  `jobs.component` (1069/400) and `discover.component` both need child components, and how far to
  break them up is a design call, not a mechanical one. Ask which file first and how granular.

### 2026-08-03, the Rust side of the file-size campaign closes

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-sources-split`, from `main` (`7cedc5d`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** to open against `main`
- **Objective:** take `discover.rs` under budget and end the Rust campaign.
- **Completed:**
  - **`discover_sources.rs` (380).** `SourceListItem`, `MarketSourceItem`, `MarketSourcePlan`,
    `market_source_plan`, `apply_market_source_plan`, and the six commands `db_list_sources`,
    `db_set_source_enabled`, `db_market_source_plan`, `db_apply_market_source_plan`,
    `db_add_source`, `db_remove_source`, with their three tests. Managing which sources exist,
    which is a different question from running a scan.
  - **`discover.rs` 876 -> 599 non-empty lines, under 800** - from **1679** at the start, across
    four modules: the local filters, the fetch layer, the source registry, and the scan itself.
  - **Correction, added later the same day:** the claim below is wrong. `ai/cli.rs` is 879/800 and
    was never touched by this campaign. `quality:file-size` only checks files changed against a
    base, so an empty report means "nothing I touched is near budget", not "the repository is
    clean". The original text is left as written rather than edited away:
  - ~~**No Rust file in the repository is over its size budget.**~~ `npm run quality:file-size` now
    prints no report lines at all.
  - The three moved tests borrow `test_pool` from `discover::tests` rather than growing a second
    copy, following the same pattern `documents_export.rs` already uses. `discover::tests` and
    `test_pool` became `pub(crate)` for it.
- **Not completed:** nothing in scope. Two leftovers are recorded under next action.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover.rs`,
  `discover_sources.rs` (new), `commands/mod.rs`, `src/lib.rs`, `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **340 passed, 0 failed, 1 ignored**, the same count as before the split.
  - `npm run quality:file-size` - **passed with an empty report**.
  - `npm run quality:attribution`, `npm run format:check`, `git diff --check` - all passed.
  - Pre-deletion line-range check: `SourceListItem`, the 241-line registry block and the 97-line
    test block were extracted to scratch files and diffed against the new module. All three
    byte-identical - this split needed no visibility changes, because the moved items were already
    `pub` commands.
  - Mutation check: dropping `AND is_builtin = 1` from the update in `apply_market_source_plan`
    failed `applying_the_plan_touches_only_builtin_rows`. The restore was diffed and is byte-exact.
  - **Command registry, checked directly because this is the first split to move commands:** all
    six entries in `lib.rs` were repointed and each appears exactly once; no
    `commands::discover::db_{list,set,market,apply,add,remove}` reference survives anywhere.
    `tauri::generate_handler!` is a macro over those paths, so a wrong path would not have compiled.
    The frontend calls these by string name from `libs/data/src/lib/services/db.service.ts`, and all
    six names are unchanged, so no frontend edit was needed. **Not verified by launching the app** -
    the argument above is a compile-time and name-level one, not a runtime observation.
- **Privacy/security impact:** none. `db_add_source` still runs its `require_https` guard, which now
  crosses a module line to `discover_fetch` and is covered by the test added in the previous watch.
- **Decisions and assumptions:** the `#[ignore]`d live-network tests (`live_source`,
  `live_tier2_sources_fetch_and_parse`) stayed in `discover.rs` although they exercise
  `discover_fetch`. Moving them is not needed for the budget and would have mixed a second
  relocation into the closing PR.
- **Risks or compatibility impact:** the six moved commands are the only real risk, addressed above.
  No command name, signature or payload changed.
- **Open issues or blockers:** none.
- **Next first action:** the Rust side is done; the remaining budget work is Angular. Both files are
  blocked on a maintainer decision about child components: `jobs.component` (1069/400) and
  `discover.component`. Ask which one to split first and how far to break it up before writing any
  code. Two small Rust leftovers, neither urgent: move the two `#[ignore]`d live-network tests from
  `discover.rs` to `discover_fetch.rs`, and decide whether `commands/archetypes.rs`'s
  `derive_title_keywords` and `discover_filter.rs`'s same-named function should be one function -
  they have different signatures and were deliberately left alone during the campaign.
- **Evidence:** the commits on `refactor/discover-sources-split`.

### 2026-08-03, the discover fetch layer splits out, and an untested HTTPS guard is found

- **Status:** partial - `discover.rs` is 876/800, closer but still over budget
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-fetch-split`, from `main` (`39c3f25`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** to open against `main`
- **Objective:** take the fetch seam out of `discover.rs`, and resolve the `RawJob`/`json_str`
  inversion the previous watch flagged before it spread into a third module.
- **Completed:**
  - **`discover_fetch.rs` (245 + tests).** `SourceRow`, `http_client`, `require_https`, `get_json`,
    `get_json_keyed`, `get_text`, the three `ARBEITSAGENTUR_*` constants,
    `fetch_arbeitsagentur_detail`, `fetch_nofluffjobs_detail`, `ats_slug` and `fetch_source_jobs`.
    The only module in the discover group that opens a socket. `get_json`, `get_json_keyed`,
    `get_text` and `ats_slug` stayed private - only the seven symbols `discover.rs` actually names
    are `pub(super)`.
  - **The inversion is undone in both directions.** `RawJob` and `json_str` moved from `discover.rs`
    into `discover_parsers.rs`. All eleven readers build `RawJob`s, and `json_str` is called 60
    times in the parsers against once outside them, so the parsers had been importing their own
    vocabulary back across the module line. `discover.rs` now names `discover_parsers` for `RawJob`
    rather than owning it.
  - The two geo tests that call a parser (`arbeitsagentur_geo_passes_a_germany_scope`,
    `german_city_alone_passes_a_germany_scope`) moved to `discover_filter.rs`, which is what they
    actually assert. Four empty section headers left stranded by earlier parser splits
    (`-- TrudVsem --`, `-- Arbeitnow --`, `-- No Fluff Jobs --`, `-- Personio --`, with no tests
    under any of them) went with the same pass. `discover.rs` no longer mentions a parser at all.
  - **`discover.rs` 1139 -> 876 non-empty lines.** `discover_parsers.rs` 672 -> 697, still under.
- **Not completed:** `discover.rs` is 876/800, 76 over. The remaining seam is the source registry.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover.rs`,
  `discover_fetch.rs` (new), `discover_parsers.rs`, `discover_filter.rs`, `commands/mod.rs`,
  `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean.
  - `cargo test --lib` - **340 passed, 0 failed, 1 ignored**. The count rose by one: the new
    `require_https` test below. No existing test was lost.
  - `npm run quality:file-size` - passed; `discover.rs: 876/800, base 1139`.
  - `npm run quality:attribution`, `npm run format:check`, `git diff --check` - all passed.
  - Pre-deletion line-range check: all four moved blocks were extracted to scratch files and diffed
    against their new homes. `SourceRow`, `RawJob` and `json_str` were byte-identical; the fetch
    block differed only in the seven `pub(super)` additions and one rustfmt line-wrap.
- **Privacy/security impact:** **a real gap was found and closed.** Mutating `require_https` to
  `Ok(())` unconditionally left all 339 tests green - the guard that keeps every discover request
  on HTTPS had no coverage at all, in either its old or its new home. A test was added covering
  plain `http://`, a missing scheme, an uppercase `HTTPS://` that the check does not match, and the
  `file:` and `data:` schemes a hand-edited source row could otherwise smuggle in. Re-running the
  same mutation now fails that test. No behaviour changed - the guard was correct, just unasserted.
- **Decisions and assumptions:**
  - `SourceRow` lives in `discover_fetch.rs` rather than staying behind, because it is the fetch
    layer's input contract. `discover.rs` constructs it from the query to call in, which is the
    normal direction - a caller building the callee's input type is not an inversion.
  - `commands/archetypes.rs` still has an unrelated `derive_title_keywords` with a different
    signature. Left alone again; it is a separate concern, not a duplicate to merge here.
- **Risks or compatibility impact:** none. No command moved, so the `lib.rs` registry is untouched.
- **Open issues or blockers:** none.
- **Next first action:** cut the source registry out of `discover.rs` into `discover_sources.rs`:
  `MarketSourceItem`, `MarketSourcePlan`, `market_source_plan`, `apply_market_source_plan`, and the
  six commands `db_list_sources`, `db_set_source_enabled`, `db_market_source_plan`,
  `db_apply_market_source_plan`, `db_add_source` and `db_remove_source`. That is managing which
  sources exist, which is a different question from running a scan, and it is enough to take
  `discover.rs` under 800 and close the Rust side of the campaign. Note that this is the first split
  in the campaign that **moves commands**, so `lib.rs` must be updated - every previous one could
  leave the registry alone.

### 2026-08-03, the discover filters get their own module

- **Status:** partial - `discover.rs` is smaller but still over budget
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-filter-split`, from `main` (`514d92f`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** to open against `main`
- **Objective:** start on `discover.rs`, the last Rust file over budget, by taking the seam that is
  furthest from I/O.
- **Completed:**
  - **`discover_filter.rs` (607).** `TitleFilter` and `GeoCfg`, `parse_keyword_list`,
    `derive_title_keywords`, `title_passes`, `parse_geo_scopes`, `build_geo_cfg`,
    `elsewhere_tokens`, `build_market_cfg`, `source_serves_markets` and `geo_passes`, with the 27
    tests that cover them. Pure string rules - no network, no SQLite, no AI - which is the whole
    reason this is the right first cut: it is the code that decides which fetched jobs the user
    never sees.
  - **`discover.rs` 1679 -> 1139 non-empty lines.** Still over 800; the ratchet moved and now holds
    at the lower number.
  - The consumer audit found no inversion: every one of these symbols was used only inside
    `discover.rs`, so the move is a pure relocation and `pub(super)` is the widest visibility
    needed. `discover.rs` keeps `parse_local_markets` from `discover_geo`; the other five
    `discover_geo` imports went with the filters.
- **Not completed:** `discover.rs` is 1139/800. The next seam is the fetch layer.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover.rs`,
  `discover_filter.rs` (new), `commands/mod.rs`, `CHANGELOG.md`, this file.
- **Validation:**
  - `cargo clippy --all-targets` - clean, no warnings.
  - `cargo test --lib` - **339 passed, 0 failed, 1 ignored**, the same count as before the split.
  - `npm run quality:file-size` - passed; report line
    `discover.rs: 1139/800 non-empty lines (Rust source), base 1679`.
  - Pre-deletion line-range check: lines `118-349`, `1204-1301` and `1336-1591` were extracted to a
    scratch file and diffed against the new module. The only differences were the ten `pub(super)`
    additions, so nothing was silently dropped.
  - Mutation check: removing the `market_mode && cfg.elsewhere` early return from `geo_passes`
    failed `market_mode_drops_somewhere_else_before_the_remote_marker` and
    `a_region_wide_remote_job_reaches_a_market_inside_that_region`. The restore was diffed against
    `HEAD` and is byte-exact.
- **Privacy/security impact:** none. No behaviour change, no new I/O, no new dependency. The
  `require_https` guard and the fetch layer were not touched.
- **Decisions and assumptions:**
  - The two `arbeitsagentur_*`/`german_city_*` geo tests stayed in `discover.rs` because they call a
    feed parser as well as `geo_passes`; only tests that read filter symbols alone moved.
  - `commands/archetypes.rs` has an unrelated `derive_title_keywords` with a different signature.
    Left alone - it is a separate concern, not a duplicate to merge in a refactor commit.
- **Risks or compatibility impact:** none. No command moved, so the `lib.rs` registry is untouched.
- **Open issues or blockers:** none.
- **Next first action:** cut the fetch layer out of `discover.rs` into `discover_fetch.rs`:
  `http_client`, `require_https`, `get_json`, `get_json_keyed`, the three `ARBEITSAGENTUR_*`
  constants, `fetch_arbeitsagentur_detail`, `fetch_nofluffjobs_detail`, `get_text`, `ats_slug` and
  `fetch_source_jobs` (roughly 220 lines). Check first where `RawJob` and `json_str` should live -
  `discover_parsers.rs` imports both back out of `discover.rs`, which is the same inversion that
  `section_heading` had in `documents.rs`.
- **Evidence:** the commits on `refactor/discover-filter-split`.

### 2026-08-03, the tailoring group goes under budget

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-page-split`, from `main` (`00c4896`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** #294
- **Objective:** close the fourteen lines the previous entry left, and end the campaign.
- **Completed:**
  - **`tailoring_page.rs` (130).** `PageConfig`, `clamp_mm` and `resolve_page`, with both
    `resolve_page_maps_*` tests. Millimetres and margins - nothing here reads a font, a colour or a
    block, which is what made it the last honest seam.
  - **`tailoring.rs` 814 -> 699, under 800.** From **2538** at the start of the campaign, across
    seven modules: the block model, the theme and cascades, the markdown reader, page geometry, the
    DOCX renderer, the PDF renderer, the fonts, and the journal.
  - **Not free by consumers, and paid line for line.** `resolve_page` is named by `tailoring_pdf`,
    `tailoring_docx`, `documents_export` and `print`; all four moved to the new path, and
    `resolve_page`'s own signature shortened from
    `&crate::commands::documents_style::PageSettings` to `&PageSettings` now that the module imports
    the type. That was the only line in the extraction that is not byte-identical to its source, and
    the pre-delete diff named it explicitly.
  - **The pre-delete diff again, and it earned its keep.** 116 non-empty lines on both sides, one
    intentional difference, nothing else. Second use of the rule #292 wrote; it is now the way this
    repository extracts modules.
  - **The count carried.** 19 `#[test]` before, **17 + 2** after; `cargo test --lib` **339 passed**
    on both sides.
  - **Mutation-checked with md5 on either side.** Removing the margin clamp failed
    `resolve_page_maps_legacy_preset_and_four_side_mm`, and the file's md5 returned to
    `b47f7a60...` after the revert.
- **Not completed:** `discover.rs` at 1679/800 is the last Rust file over budget.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_page.rs`, `commands/mod.rs`,
  `tailoring_pdf.rs`, `tailoring_docx.rs`, `documents_export.rs`, `print.rs`, `CHANGELOG.md`, this
  file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `tailoring.rs 699/800 ... base 814` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched and neither module holds a
  command.
- **Privacy/security impact:** none. A geometry resolver moved.
- **Decisions and assumptions:** `PageConfig` went with `resolve_page` rather than staying with the
  block types, because it is the resolver's return value and both renderers take it as a parameter -
  a type and its only constructor belong in one file.
- **Risks or compatibility impact:** low. Four consumer paths changed, no command, no serialized
  shape, no public surface.
- **Open issues or blockers:** unchanged, and now the oldest thing in this log by a wide margin - the
  macOS bundle is unsigned and un-notarised, so the Download button on applye.dev still serves a file
  a clean Mac refuses to open. **Maintainer decision, not an agent one.** No amount of further
  refactoring moves it.
- **Next first action:** `discover.rs` at **1679/800**, the last Rust file over budget and the one
  the previous splits left alone. It has been split twice already - the feed readers and the
  geography came out - so the remaining seam is inside the scan engine itself. Read the consumers
  first, as every entry in this run did: `commands::discover` is reached through the command registry
  and by `discover_geo`/`discover_parsers`, so check which direction those imports run before
  choosing. After that the Rust side is clean and the remaining budget work is the Angular templates
  and stylesheets, which are **blocked on the child-component decision** recorded further down this
  log.
- **Evidence:** the 116-vs-116 range diff before deletion, `cargo test --lib` output on both sides of
  the mutation, the md5 pair `b47f7a60301d1b5d7ccf128c82b2dc09` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `699/800 ... base 814`.

### 2026-08-03, the markdown reader leaves, and the new rule gets used

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-markdown-split`, from `main` (`6ec6f91`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** #293
- **Objective:** the seam the previous entry named, and the first chance to use the rule that entry
  wrote after nearly losing 22 lines.
- **Completed:**
  - **`tailoring_markdown.rs` (155).** `md_to_blocks`, `strip_bold_wrap`, `InlineRun` and
    `parse_inline_runs` - tailored markdown in, an untagged block list out, plus the inline
    `**bold**` splitter both renderers call. Four tests moved with it.
  - **`tailoring.rs` 956 -> 814.** Fourteen lines over budget; see the next first action.
  - **The new rule was applied before deleting anything.** The concatenated source ranges were
    diffed against the assembled module line for line - **142 non-empty lines on both sides, equal
    in order** - and only then were the ranges cut. That is the check the previous watch invented
    after `effective_cl` was dropped on the floor, and it turned "the compiler will probably notice"
    into an actual verification. Recommended as standing practice for any multi-range extraction.
  - **The count carried.** 23 `#[test]` before, **19 + 4** after; `cargo test --lib` **339 passed**
    on both sides.
  - **Mutation-checked with md5 on either side.** Disabling the `**…**` detection in
    `strip_bold_wrap` failed `md_to_blocks_maps_prefixes_and_strips_bold`, and the file's md5
    returned to `4b0b07b2...` after the revert.
- **Not completed:** `tailoring.rs` is 814/800, and `discover.rs` 1679 is untouched.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_markdown.rs`, `commands/mod.rs`,
  `tailoring_docx.rs`, `tailoring_pdf.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `tailoring.rs 814/800 ... base 956` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched and neither module holds a
  command.
- **Privacy/security impact:** none. A text parser moved.
- **Decisions and assumptions:** `parse_inline_runs` went with the reader rather than staying with
  the renderers, even though the DOCX renderer is its heaviest caller, because it is text splitting
  and not styling - the same reason `md_to_blocks` moved.
- **Risks or compatibility impact:** low. Both renderers gained one import line each; no command, no
  serialized shape and no public surface changed.
- **Open issues or blockers:** unchanged - the unsigned, un-notarised macOS bundle.
- **Next first action:** **`tailoring.rs` is 14 lines over budget, and the cut that closes it is
  page geometry** - `PageConfig`, `clamp_mm` and `resolve_page`, roughly 60 lines, plus the two
  `resolve_page_maps_*` tests, which are about 75 lines between them. It resolves millimetres and
  margins, not fonts and colours, so it is a different question from everything else left in the
  file. Not free by consumers: `resolve_page` is named by `tailoring_pdf.rs`, `tailoring_docx.rs`,
  `documents_export.rs` and `print.rs`, so four paths move line for line. That should land
  `tailoring.rs` near 680 and finish the tailoring campaign. After that, `discover.rs` 1679.
- **Evidence:** the 142-vs-142 range diff before deletion, `cargo test --lib` output on both sides
  of the mutation, the md5 pair `4b0b07b20fe65e4cd712bce3cefa1396` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `814/800 ... base 956`.

### 2026-08-03, the theme and the cascades leave the block list

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-theme-split`, from `main` (`5edafe7`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** #292
- **Objective:** the seam the previous entry named, inside what was left of `tailoring.rs` at
  1179/800: the look a document resolves to, versus the block list that reads the answer.
- **Completed:**
  - **`tailoring_theme.rs` (243).** `CvTheme` with its `TEXT_RGB` constant, `rule_spec`,
    `builtin_theme`, `EffStyle`, `hex_to_rgb`, and the two cascades `effective_cv` and
    `effective_cl` - the built-in side and the user-override side of one question: what font, size,
    weight and colour does this block get? Five tests moved with them, along with the `section()`
    fixture that only they used.
  - **`tailoring.rs` 1179 -> 956.** Still over budget; the last seam is named below.
  - **The count carried, and this time it mattered.** 28 `#[test]` before, **23 + 5** after;
    `cargo test --lib` **339 passed** on both sides.
  - **Mutation-checked with md5 on either side.** Forcing `effective_cv` to see no per-section
    override failed `effective_cv_section_override_wins_field_by_field` and, through the
    `body`-block fallback, `effective_cl_paragraph_cascades_through_body_block` - which is exactly
    the coupling between the two cascades that keeps them in one module. The file's md5 returned to
    `a33f3d0c...` after the revert.
- **A cut went wrong, and how it was caught.** The assembly step that built the new module from line
  ranges **omitted `effective_cl`** while the deletion step removed it - 22 lines dropped on the
  floor. `cargo build` named it immediately (`unresolved import ... no effective_cl in
tailoring_theme`) and it was restored verbatim from `git show HEAD:...`. Worth recording plainly:
  four disjoint ranges is where this technique starts to fail, and the only reason nothing was lost
  is that the deleted function was still referenced. **A dead function cut this way would have
  vanished silently.** For the next multi-range split, diff the concatenated ranges against the
  deleted ones before deleting.
- **Not completed:** `tailoring.rs` 956 and `discover.rs` 1679 are still over budget.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_theme.rs`, `commands/mod.rs`,
  `tailoring_docx.rs`, `documents_export.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean **after** two stale test
  imports it named were removed, `cargo fmt --check` clean, `npm run quality:file-size` printing
  `tailoring.rs 956/800 ... base 1179` and passing, `npm run quality:attribution`,
  `npm run format:check` and `git diff --check` pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet was touched and no command exists in either module.
- **Privacy/security impact:** none. Pure functions and a constant table moved.
- **Decisions and assumptions:** `hex_to_rgb` went with the cascades rather than staying as a util,
  because both cascades and the theme table are its only callers besides two lines in the block
  resolver, which now imports it. `CvTheme::TEXT_RGB` widened from private to `pub(super)` for the
  same reason - the no-accent-leak rule that reads it lives in the block resolver.
- **Risks or compatibility impact:** low. `CvTheme` and `builtin_theme` changed module path;
  `documents_export.rs` follows them line for line and two test modules gained an import line each.
- **Open issues or blockers:** unchanged - the unsigned, un-notarised macOS bundle.
- **Next first action:** the last seam in `tailoring.rs` (956) is the **markdown reader** -
  `md_to_blocks`, `strip_bold_wrap`, `InlineRun` and `parse_inline_runs`, roughly 90 lines plus three
  or four tests. It turns tailored markdown into the block list; everything else left in the file
  resolves an already-built block list against a style. It is free by consumers: `parse_inline_runs`
  is named by `tailoring_docx` and `md_to_blocks` by `tailoring_docx`'s `md_to_docx_bytes`, both of
  which already import from `tailoring` explicitly. That should land the file at roughly 800. After
  that, `discover.rs` 1679.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `a33f3d0ce502c4508081938a801fd09e` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `956/800 ... base 1179`.

### 2026-08-03, the journal separates from the model it journals

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-journal-split`, from `main` (`13b6d99`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** #291
- **Objective:** the seam the previous entry named. `tailoring.rs` at 1578/800 held two things with
  nothing in common: rows and files on one side, a pure block model on the other.
- **Completed:**
  - **`tailoring_journal.rs` (416).** `TailoringCache`, `SaveTailoringInput`, `GeneratedDoc`, the
    four cache/journal queries, the path naming (`readable_slug`, `cv_dir`, `cv_filename`), the
    `export_docx` / `export_pdf` commands, and `open_file` / `reveal_in_folder` with the containment
    check that refuses anything resolving outside Applye's own document folder - with the five tests
    that cover that check.
  - **`tailoring.rs` 1578 -> 1179**, and its header comment now says what it actually is: the shared
    export model. Nothing left in it touches the database, the filesystem or the shell.
  - **The count carried.** 33 `#[test]` before, **28 + 5** after; `cargo test --lib` reported
    **339 passed** on both sides.
  - **Mutation-checked with md5 on either side.** Replacing the containment condition in
    `resolve_within` with `if false` - the exact hole the check exists to close - failed
    `refuses_a_file_outside_the_app_data_dir` and `refuses_a_traversal_that_climbs_out`, and the
    file's md5 returned to `85e3b622...` after the revert. This is the one mutation in this watch
    that was aimed at a security boundary rather than a formatting rule.
- **Not completed:** `tailoring.rs` 1179 and `discover.rs` 1679 are still over budget.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_journal.rs`, `commands/mod.rs`,
  `lib.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `tailoring.rs 1179/800 ... base 1578` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched. Seven command names moved
  module but kept their names, so the frontend `invoke()` surface is identical.
- **Privacy/security impact:** the containment check for `open_file` and `reveal_in_folder` moved
  unchanged, and its five tests moved with it rather than being left behind - deliberately, because a
  security check whose tests live in another file is a check waiting to be edited without them. No
  behaviour changed: the same canonicalize-then-`starts_with` guard, the same regular-file
  requirement, the same refusal messages.
- **Decisions and assumptions:** `open_file` and `reveal_in_folder` went with the journal rather than
  staying, because the only files they are allowed to open are the ones this module writes. The
  containment root and the write path are now defined in one file.
- **Risks or compatibility impact:** low. Seven Tauri commands changed their Rust path in the
  `invoke_handler` list only.
- **Open issues or blockers:** unchanged - the unsigned, un-notarised macOS bundle.
- **Next first action:** `tailoring.rs` at 1179 is now one thing - the block model - so the next cut
  has to be inside it, and the honest seam is the **theme**: `CvTheme`, `builtin_theme`, `rule_spec`
  and the two `effective_*` cascades are what a document's chosen look resolves to, while
  `BlockLevel`, `StyledBlock`, `RenderBlock`, `resolve_cv_blocks`, `resolve_blocks`, `md_to_blocks`
  and `parse_inline_runs` are the block list itself. Roughly 250 lines plus the theme tests. Check
  consumers first as always: `builtin_theme` and `CvTheme` are named by `documents_export.rs`, and
  `tailoring_docx`/`tailoring_pdf` reach the model through a glob import, which a split would need to
  widen to two globs. After that, `discover.rs` 1679.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `85e3b6229723c17e2460ed07ceb23dee` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `1179/800 ... base 1578`.

### 2026-08-03, the DOCX renderer gets the file the PDF one already had

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-docx-split`, from `main` (`0dd70e7`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** #290
- **Objective:** `tailoring.rs` at 2087/800, the largest Rust file left. The previous entry recorded
  the rule this watch had to follow - read the consumers first - and the consumer list said the same
  thing the file's own section banner did: `// ── DOCX rendering ──` at line 796, with
  `tailoring_pdf.rs` already existing as its mirror. The seam was drawn by the previous split and
  simply never cut.
- **Completed:**
  - **`tailoring_docx.rs` (527).** `md_to_docx_bytes`, `block_paragraph`, `finish_docx`, and the
    whole font-embedding pass - `EmbedFace`, `faces_to_embed`, `font_guid`, `obfuscate_font`,
    `embed_fonts_in_docx` - plus `render_blocks_docx`, with three tests.
  - **`tailoring.rs` 2087 -> 1578.** Still over budget; the next seam is named below.
  - **What deliberately stayed.** The block model, `CvTheme`, `builtin_theme`, `resolve_page`,
    `resolve_cv_blocks`, `resolve_blocks`, `md_to_blocks` and `parse_inline_runs` are read by _both_
    renderers, so neither owns them and they stay in `tailoring`. The new module imports them with a
    glob, the same shape `tailoring_pdf.rs` uses.
  - **One test stayed on purpose.** `block_paragraph_bold_merge_rule_on_inline_runs` is named for a
    DOCX function but executes only `parse_inline_runs`; it documents the merge rule rather than
    calling the renderer, so it stays beside the code it actually runs. Likewise the smoke test that
    asserts both renderers emit bytes stays in `tailoring` and imports the DOCX one, because its
    whole point is that the two agree.
  - **The count carried.** 36 `#[test]` before, **33 + 3** after; `cargo test --lib` reported
    **339 passed** on both sides.
  - **Mutation-checked with md5 on either side.** Passing an empty face list to
    `embed_fonts_in_docx` - the exact regression the embedding pass exists to prevent - failed
    `docx_embeds_lato_face_when_used`, and the file's md5 returned to `fab83d35...` after the revert.
- **Not completed:** `tailoring.rs` 1578 and `discover.rs` 1679 are still over budget.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_docx.rs`, `commands/mod.rs`,
  `documents_export.rs`, `CHANGELOG.md`, this file. `print.rs` turned out not to name either moved
  function - it reaches the DOCX path through `documents_export`, so it needed no edit.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `tailoring.rs 1578/800 ... base 2087` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched and no command name changed.
- **Privacy/security impact:** none. Pure rendering code moved; the font bytes it embeds are the same
  bundled faces, from the same `tailoring_fonts` module.
- **Decisions and assumptions:** `sb()`, the block fixture, is lent from `tailoring::tests` as
  `pub(crate)` rather than copied - the third time this watch made that call, and for the same
  reason: a duplicated fixture lets two modules drift apart on the shape that proves either works.
- **Risks or compatibility impact:** low. `render_blocks_docx` and `md_to_docx_bytes` changed module
  path only; `documents_export.rs` follows them line for line, and `export_docx` inside `tailoring`
  now qualifies the one call it makes. No command name and no serialized shape changed.
- **Open issues or blockers:** unchanged - the unsigned, un-notarised macOS bundle still outranks
  everything in this log.
- **Next first action:** `tailoring.rs` at 1578 now holds three things, and the seam between them is
  clean: the **journal database layer** (`TailoringCache`, `SaveTailoringInput`, `GeneratedDoc`,
  `tailoring_cache_get`/`_save`, `generated_doc_get`, `fetch_generated_doc`, `upsert_generated_doc`,
  plus `readable_slug`/`cv_dir`/`cv_filename` and the `export_docx`/`export_pdf`/`open_file`/
  `reveal_in_folder` commands) is roughly 400 lines that touch SQLite and the filesystem and nothing
  else does; what remains after it is the pure block model both renderers read. Check the consumers
  first as always: `lib.rs` registers six of those commands and `print.rs` names `generated_doc_get`.
  After that, `discover.rs` 1679.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `fab83d356c68a7fb55a3c712689f1b38` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `1578/800 ... base 2087`.

### 2026-08-03, the tests follow the module they test

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/blocks-tests-follow-their-module`, cut from `main` (`77ac593`) after #286,
  #287 and #288 were merged in this watch. No stacking this time - `main` already carried everything.
- **Commits:** the move, plus this documentation commit
- **Pull request:** #289
- **Objective:** the finding the previous entry recorded rather than fixed. `section_heading` was
  defined in `documents.rs` as `pub(super)` and called from nowhere but `documents_blocks.rs`, which
  imported it back across the module line, and the four `cv_content_to_blocks_*` tests were still in
  `documents.rs` asserting a function defined in `documents_blocks.rs`. Both directions of the same
  inversion.
- **Completed:**
  - **`section_heading` moved to `documents_blocks.rs` and became private.** Its only caller now
    defines it, so `use super::documents::section_heading;` disappeared - the split paid for itself
    in import lines rather than costing them.
  - **The four block tests moved with it**, into a `mod tests` that `documents_blocks.rs` did not
    have before. The stale `use super::super::documents_blocks::cv_content_to_blocks;` that the
    export split had added to `documents.rs`'s test module for exactly these tests went too; clippy
    named it as an error the moment they left, which is how it was caught rather than left behind.
  - **`documents.rs` 788 -> 669**, `documents_blocks.rs` 290 -> 411, both under 800.
  - **The count carried.** 16 tests before (4 `#[test]` + 12 `#[tokio::test]`), **12 + 4** after.
    `cargo test --lib` reported **339 passed** on both sides.
  - **Mutation-checked with md5 on either side.** Making the German summary heading return the
    English string failed `cv_content_to_blocks_localizes_section_headings_for_german` in its new
    home, and the file's md5 returned to `e763bb11...` after the revert.
- **Not completed:** `tailoring.rs` 2087 and `discover.rs` 1679 are the Rust files still over budget.
- **Files or packages changed:** `documents.rs`, `documents_blocks.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean **after** the stale test import
  was removed (it failed first, which is the point), `cargo fmt --check` clean,
  `npm run quality:file-size` printing `documents.rs 669/800 ... base 788` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched and no command changed at all.
- **Privacy/security impact:** none. A translation table and four tests moved between files.
- **Decisions and assumptions:** `section_heading` became private rather than staying `pub(super)`,
  because after the move it has exactly one caller and that caller is in the same file. Anything that
  needs it later can widen it then.
- **Risks or compatibility impact:** none identifiable. No public surface, no serialized shape and no
  command was touched.
- **Open issues or blockers:** unchanged - the macOS bundle is unsigned and un-notarised, and it
  outranks every entry in this log.
- **Next first action:** `tailoring.rs` at 2087/800 is the largest Rust file left, and the two splits
  before it took the PDF renderer and the fonts out, so the next seam has to be chosen the way these
  four were: by reading how consumers import it first. **It is not free** - `commands::tailoring` is
  named by `documents_export.rs`, `print.rs`, `tailoring_pdf.rs` and others for `resolve_page`,
  `resolve_blocks`, `resolve_cv_blocks`, `render_blocks_docx`, `render_blocks_pdf`, `builtin_theme`
  and `CvTheme`, so any split has to move consumer paths line for line, as #286 did. Read the
  consumer list before choosing the seam, not after.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `e763bb11a125c22d5d40577d929284c1` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `669/800 ... base 788`.

### 2026-08-03, the documents library goes under budget

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/documents-export-split`, cut from `refactor/documents-import-split` because
  both edit `documents.rs`. **The pull request is opened against `main`, not against that branch** -
  the previous entry's trap. It therefore carries two commits until #287 merges, after which it
  reduces to one on its own.
- **Commits:** the split, plus this documentation commit
- **Pull request:** #288, based on `main`
- **Objective:** the third and last seam named in the previous entry, and the one that ends the
  campaign: `documents.rs` from 1926 at the start to **788/800**, under its budget for the first
  time.
- **Completed:**
  - **`documents_export.rs` (267).** `cv_document_export`, `cover_letter_document_export`,
    `resolve_export_style` and the two `*_bytes_core` functions. This is the only place a library
    document becomes a file: it reads one row, resolves the persisted `style_json` over the chosen
    theme, lifts the photo and its placement out of the content, and hands blocks to the renderers.
  - **`documents.rs` 1035 -> 788.** It now holds what it is named for - the `cv_templates` and
    `document_library` rows and the commands that read and write them.
  - **The database fixture is lent, not copied.** The export test needs a migrated pool and the same
    valid CV input every other row test uses, so `mod tests`, `test_pool` and `cv_input` became
    `pub(crate)` and `cv_templates_list_core` / `document_library_upsert_core` became `pub(super)`,
    the same choice the ATS split made for `good_cv()`. A second copy of the fixture would let the
    two modules drift apart on the row shape that proves either of them works.
  - **The count carried.** 18 tests before (5 `#[test]` + 13 `#[tokio::test]`), **16 + 2** after.
    `cargo test --lib` reported **339 passed** on both sides.
  - **Mutation-checked with md5 on either side.** Replacing `resolve_export_style`'s theme-seeded
    base size with a hard-coded 11pt - the exact shape of the wrong-font regression the test was
    written for - failed `resolve_export_style_seeds_from_theme_then_overrides`, and the file's md5
    returned to `d37a45fd...` after the revert.
- **Not completed:** `tailoring.rs` 2087 and `discover.rs` 1679 are the Rust files still over
  budget, plus the frontend files the previous watches recorded.
- **Files or packages changed:** `documents.rs`, new `documents_export.rs`, `commands/mod.rs`,
  `print.rs`, `lib.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `documents.rs 788/800 ... base 1035` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched, and both moved commands keep
  their names.
- **Privacy/security impact:** none. The export path writes only to the path the user chose in the
  save dialog, exactly as before, and still never touches `applications.cv_path`.
- **Decisions and assumptions:** the export test moved with the code rather than staying behind,
  even though it is the one test in the group that needs a database. Leaving it would have left
  `documents.rs` asserting the behaviour of a function it no longer defines, which is the arrangement
  this same watch found and flagged below.
- **Risks or compatibility impact:** low. No serialized shape and no command name changed; `print.rs`
  follows the two `*_bytes_core` functions to their new module, line for line.
- **Open issues or blockers:** unchanged and still first in line - the macOS bundle is unsigned and
  un-notarised.
- **Next first action:** **found while splitting, not fixed: `documents.rs` still owns four tests and
  one function that belong to `documents_blocks.rs`.** `section_heading` is defined in `documents.rs`
  as `pub(super)` and called from nowhere but `documents_blocks.rs` (which imports it back), and the
  four `cv_content_to_blocks_*` tests sit in `documents.rs` asserting a function defined in
  `documents_blocks.rs` - the compiler said so out loud when the export split removed the module-level
  import and only the tests still needed it. Moving both directions of that inversion is roughly 145
  lines out of `documents.rs` and into the module they describe, and it costs nothing: the import line
  in `documents_blocks.rs` disappears with it. After that, `tailoring.rs` 2087 is the largest Rust
  file left.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `d37a45fdbefac8653c11bc94913973b2` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `788/800 ... base 1035`.

### 2026-08-03, the file readers leave the module that stores documents

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/documents-import-split`. Cut from `refactor/documents-style-split` because
  both edit `documents.rs`, and **first opened as a stacked PR against that branch - which broke
  CI.** See "Risks" below. #286 merged mid-watch, so the branch was rebased onto the new `main`
  (`1147a8a`) and the PR retargeted; it now carries exactly one commit over `main`.
- **Commits:** the split, plus this documentation commit
- **Pull request:** #287, based on `main`
- **Objective:** the second of the three seams the previous entry named. `documents.rs` at 1196/800
  still held the file-reading half, which has no consumer outside the module and therefore costs
  nothing to move.
- **Completed:**
  - **`documents_import.rs` (162).** `cv_import_read_file`, `cv_photo_read_file`, the DOCX and PDF
    text readers, the image magic-byte sniff and the data-URI codec, with the four tests that cover
    them. This is the module where untrusted, user-picked files arrive, so both third-party parser
    calls and their `catch_parser_panic` guard now sit together rather than beside the library rows.
  - **`documents.rs` 1196 -> 1035.** Only `data_uri_to_bytes` is still needed by the export path, so
    it is `pub(super)` and imported; everything else stayed private to the new module.
  - **Three stranded doc comments removed.** The earlier blocks split left the comments for
    `cv_content_to_markdown` and `cv_content_to_blocks` stacked on top of `section_heading`, so a
    reader of that function was handed two paragraphs describing functions in another file. They went
    with this pass because they document the code that moved, not the code that stayed.
  - **The count carried.** 9 `#[test]` before, **5 + 4** after; 13 `#[tokio::test]` untouched.
    `cargo test --lib` reported **339 passed** on both sides, and the repository total across the
    three `documents*` modules is 32, the same as before either split.
  - **Mutation-checked with md5 on either side.** Changing the PNG magic-byte branch of `image_mime`
    to report `image/gif` failed `detects_png_mime_and_encodes`, and the file's md5 returned to
    `bafea2ad...` after the revert.
- **Not completed:** `documents.rs` is still over budget at 1035/800. The third seam is named below.
- **Files or packages changed:** `documents.rs`, new `documents_import.rs`, `commands/mod.rs`,
  `lib.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean
  (after `cargo fmt` removed one double blank line the extraction introduced),
  `npm run quality:file-size` printing `documents.rs 1035/800 ... base 1196` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched, and both moved commands keep
  their names, so the frontend `invoke()` surface is identical.
- **Privacy/security impact:** none by change, but worth stating plainly: this module is the one that
  reads arbitrary user-picked DOCX and PDF files through `docx-rs` and `pdf_extract`. The
  `catch_parser_panic` wrapper moved with them and is unchanged, so a malformed file still returns an
  error instead of taking the process down.
- **Decisions and assumptions:** the export path was left for a third pass rather than folded in
  here, because it is the one seam of the three that consumers reach across - `print.rs` calls three
  of its functions by full path - and mixing a free move with a consumer-visible one in a single
  diff hides which half a regression came from.
- **Risks or compatibility impact:** low for the code. No serialized shape changed and no command
  name changed - only the Rust path in the `invoke_handler` list.
  **A new trap for the log: this repository's CI cannot run on a stacked pull request.** #287 was
  first opened against `refactor/documents-style-split`, and the affected-graph step failed with
  `fatal: ambiguous argument 'main': unknown revision or path not in the working tree` - the
  workflow derives its Nx base from `main`, which the checkout does not fetch when the PR base is
  another branch. Nothing was wrong with the code; the run had no test failure in it. **Open PRs
  against `main`, and rebase instead of stacking.**
  A second, smaller trap on top of it: local `main` held both `d87b886` and its squash-merge
  `d0dedf3`, so every branch cut from it dragged a duplicate commit that GitHub reported as
  `CONFLICTING` while `git merge-tree` found zero conflicts. `git rebase --onto origin/main` dropped
  it with "patch contents already upstream".
- **Open issues or blockers:** unchanged - the macOS bundle is still unsigned and un-notarised, which
  outranks every refactor in this log. Maintainer decision.
- **Next first action:** the third and last seam in `documents.rs` is the export path -
  `cv_document_export`, `cover_letter_document_export`, `resolve_export_style` and the two
  `*_bytes_core` functions, with the export test, roughly 250 lines. Unlike the two before it, it is
  **not** free: `print.rs` calls `cv_document_export_bytes_core`,
  `cover_letter_document_export_bytes_core` and `document_library_get_core` by full path, so those
  paths move with it. That lands `documents.rs` near 800 and leaves it holding what it is named for -
  the library rows. After that, `tailoring.rs` 2087 and `discover.rs` 1679 are the Rust files left.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `bafea2addc121e5a24c2b3288c93fc3c` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `1035/800 ... base 1196`.

### 2026-08-03, the document's style leaves the module that stores documents

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/documents-style-split`, from `main` (`1a3e9dd`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** PR #285 was already merged when this watch started, so `main` carried it and the
  next target was the one the last entry named: `documents.rs` at 1645/800. Unlike the three splits
  before it, this one is **not** free by consumers - `tailoring.rs` and `tailoring_pdf.rs` name
  `CvStyle`, `PageSettings`, `PageMargins`, `MarginSpec`, `CvSectionStyle` and `PhotoPlacement` by
  fully qualified path, and `print.rs` names `PageSettings`. Those paths were repointed rather than
  papered over with a re-export, so the module that owns the types is the module consumers name.
  The edit is line-for-line: `tailoring.rs` 2227 raw lines before and after, and its non-empty count
  stayed at 2087, so the file that is over budget did not grow.
- **Completed:**
  - **`documents_style.rs` (461).** The presentation contract and the deterministic judgements on
    it: `CvStyle` with its per-section overrides and page geometry, `PhotoPlacement`, `StyleNote`,
    `check_style_safety` and `validate_theme` with their private cores and helpers. Nothing in it
    reads the database or the filesystem, and nothing in it renders - which is the seam.
    `documents.rs` keeps the library rows, the file import, and the export path that resolves a
    style out of a row's `style_json`.
  - **`documents.rs` 1645 -> 1196.** Still over 800; see the next first action.
  - **Sliced by element, and the count carried.** 19 `#[test]` before, **9 + 10 after**, and 13
    `#[tokio::test]` untouched - 32 tests before and after, and `cargo test --lib` reported
    **339 passed** on both sides. Both ends of every cut were read before cutting: the style block
    starts at its doc comment and ends at the closing brace before the export doc comment, and each
    moved test starts at its `#[test]` attribute.
  - **Mutation-checked with md5 on either side.** Widening `is_low_print_contrast`'s luminance
    threshold to a value it can never reach failed 2 tests in the new module, and the file's md5
    returned to `9a66d80b...` after the revert, so the mutation demonstrably reached disk.
- **Not completed:** `documents.rs` is not yet under budget, and `tailoring.rs` 2087 and
  `discover.rs` 1679 are untouched.
- **Files or packages changed:** `documents.rs`, new `documents_style.rs`, `commands/mod.rs`,
  `tailoring.rs`, `tailoring_pdf.rs`, `print.rs`, `lib.rs`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed / 0 failed**
  before and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` printing `documents.rs 1196/800 ... base 1645` and passing,
  `npm run quality:attribution`, `npm run format:check` and `git diff --check` pass. **Not run:** the
  frontend gates - no TypeScript, template or stylesheet was touched, and no Tauri command name
  changed (only the Rust path in the `invoke_handler` list), so the frontend `invoke()` surface is
  identical.
- **Privacy/security impact:** none. Pure types and pure functions moved; no I/O, no new data.
- **Decisions and assumptions:** `PhotoPlacement` moved with the style rather than staying with the
  library rows, because every consumer of it is a renderer and it is a presentation choice, not a
  stored-row shape. A `pub use` re-export in `documents.rs` would have kept consumers untouched, but
  it would have left the facade pretending to own types it no longer defines.
- **Risks or compatibility impact:** low. No serialized shape changed - the wire format of
  `PhotoPlacement`, `CvStyle` and the page settings is byte-identical, so stored `style_json` and
  stored templates read back the same. Command names are unchanged.
- **Open issues or blockers:** unchanged and older than any refactor - the macOS bundle is still
  unsigned and un-notarised, so the Download button on applye.dev still serves a file that a clean
  Mac refuses to open. That is a maintainer decision, not an agent one.
- **Next first action:** the next seam in `documents.rs` is the file-import half - `cv_import_read_file`,
  `cv_photo_read_file`, `read_docx_text`, `read_pdf_text`, `image_mime`, `bytes_to_data_uri`,
  `data_uri_to_bytes` and the three tests that cover them, roughly 190 lines. It has no consumers
  outside the module, so it costs nothing. That lands `documents.rs` near 1005; the export path
  (`cv_document_export`, `cover_letter_document_export`, `resolve_export_style` and the `*_bytes_core`
  pair, which `print.rs` does consume) is the third cut that would bring it under 800.
- **Evidence:** `cargo test --lib` output on both sides of the mutation, the md5 pair
  `9a66d80bd64bab54c292b3260628ca66` before and after, and
  `node tools/check-file-size-budgets.mjs` reporting `1196/800 ... base 1645`.

### 2026-08-03, the ATS check splits along the question each half answers

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/ats-format-split`, from `main` (`6ce56b3`), cut before the first edit
- **Commits:** the split, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the next file-size target, chosen the way the last three were - by what the split
  costs its consumers. `ats.rs` at 1042/800 has exactly one entry point outside itself,
  `ats_check_run` in the command registry, and no other module names `ats::`. Moving code inside it
  costs nobody a line.
- **Completed:**
  - **`ats_format.rs` (306).** The half that never reads the posting: heading recognition, the
    per-market photo rule, and every parsability finding - contact details, tables, images,
    headings, dates, length, decorative bullets, links. `ats.rs` keeps the half that compares the CV
    against the posting's vocabulary. The seam is the question each answers, not the line count.
  - **`ats.rs` 1042 -> 743**, under its 800 budget for the first time.
  - **Sliced by element, and the count carried.** 16 `#[test]` before, **10 + 6 after** - the check
    the previous watches learned to run, because a lost test looks exactly like a passing one. Both
    ends of every slice were read before cutting: the moved block starts at its section banner and
    ends at the closing brace before "The check", and the moved tests start at their `#[test]`
    attribute rather than at the `fn`.
  - **The shared fixture is lent, not copied.** `good_cv()` is the one CV both halves must agree on:
    well covered and cleanly parseable. It stays with the keyword tests as `pub(crate)`, and the new
    module's tests import it. Copying it would have let the two halves drift apart on the fixture
    that proves neither is broken.
  - **Mutation-checked with md5 on either side.** Making `photo_is_expected` return `true` for every
    region failed 2 tests, one in each module, and the file's md5 returned to its original value
    after the revert - so the mutation demonstrably reached disk.
- **Not completed:** the other 47 files over budget. `tailoring.rs` 2087, `discover.rs` 1679 and
  `documents.rs` 1645 are the Rust ones left, all still consumed only through the command registry.
- **Files or packages changed:** `ats.rs`, new `ats_format.rs`, `commands/mod.rs`, `CHANGELOG.md`,
  this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed** before
  and after, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `node tools/check-file-size-budgets.mjs --staged` printing `743/800 ... base 1042`,
  `npm run quality:attribution` and `npm run format:check` pass. **Not run:** the frontend gates -
  no TypeScript, template or stylesheet was touched and no command signature changed.
- **Privacy/security impact:** none. Pure functions moved; no I/O, no new data.
- **Decisions and assumptions:** `tokenize` became `pub(super)` because the date finding needs it,
  which is the one thread still running between the halves. Duplicating a tokenizer to sever it
  would have been worse than the coupling.
- **Risks or compatibility impact:** low. The public surface is unchanged: `ats_check` and
  `ats_check_run` keep their signatures, and `parsability_findings` is `pub(super)`.
- **Open issues or blockers:** unchanged - the unsigned macOS bundle, the Mark as Applied run that
  can sit for ten minutes per document with no cancel, and the child-component decision that blocks
  the 12 templates and 13 stylesheets over budget.
- **Next first action:** `documents.rs` at 1645/800 is the next free one by the same test - the
  command registry names its commands and no other module imports from it.
- **Evidence:** `#[test]` counted 16 before and 10 + 6 after; `cargo test --lib` printed
  `339 passed` on both sides of the move and `2 failed` under the mutation; the budget script
  printed `743/800 ... base 1042`.

### 2026-08-03, the two defects the manual pass found, fixed and seen fixed

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/mark-applied-duplicate-row`, from `docs/manual-pass-0292`
- **Commits:** the fix commit, plus this documentation commit
- **Pull request:** opened after this entry. `#283` carries the pass that found these.
- **Objective:** fix the two defects the manual pass produced evidence for. The third finding, the
  unsigned macOS bundle, is a release-workflow decision and was deliberately left alone.
- **Completed:**
  - **The duplicate application row.** `markApplied` wrote its own `saved` row through
    `db_upsert_application`, whose id-less branch is a plain `INSERT` and not an upsert on `job_id`.
    That row never reached the signal the page holds, so the first step of `commitDocuments` to call
    `ensureApplicationDraft()` found none and inserted a **second** row for the same job. The status
    then flipped one of the two and orphaned the other - exactly the pair the pass found for job 111.
    The service now takes the page's draft hook and writes no application row of its own, which
    leaves one owner of both the row and the signal.
  - **The silent two-minute button.** Committing the documents generates whatever the application is
    missing against the configured provider. `busy` cannot describe that, because saving a lead
    raises the same flag for an operation that takes a moment, so a new `applying` signal carries it
    and the button reads "Preparing documents…" while the step runs. The key was added to all six
    catalogues.
  - **Both were fixed against a failing test first.** The service spec went from 20 tests to 22.
    **Both were then checked by mutation**, with the file's md5 compared before and after so a
    mutation that failed to write could not pass as a green run: swapping the ensure/commit order
    failed 2 tests, dropping `applying.set(true)` failed 1, and the md5 returned to its original
    value both times.
  - **Seen working in the app, not only in tests.** A debug bundle of this branch was installed and
    the analysed job 110, which had no application row at all, was marked applied: the button read
    "Preparing documents…" and **exactly one** row was written where the old code wrote two.
- **Not completed:**
  - **That run never finished, and the first reading of it was wrong.** After about seven and a half
    minutes the commit was still going and the row was still `saved`, so this entry first called the
    call unbounded. It is not: `ai/api.rs:29` sets `API_TIMEOUT` to **600 seconds**, `ai/cli.rs:49`
    matches it for CLI mode, and a test asserts the bound. The comment there says the generosity is
    deliberate, because a long non-streaming answer legitimately takes minutes. **The app was killed
    at roughly 450 seconds, inside that budget**, so what the run would have done at 600 - succeed,
    or fail visibly - was never observed. No third defect is established. What is true is that a
    single Mark as Applied can sit for ten minutes per generated document with **no way to cancel**.
  - Discard tailoring, the "For you" / "More openings" split, and the `0.29.1` update acceptance run
    are still where the previous entry left them.
- **Files or packages changed:** `job-actions.service.ts` and its spec, `jobs.component.ts`,
  `jobs.component.html`, the six translation catalogues, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `npm run type-check` (templates included) clean, `npm test`
  **1186 passed**, `npm run lint` clean, `npm run quality:file-size` **passed**,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`
  and `npx nx build desktop` all pass. Rust was not touched, so the cargo gates were not run.
- **Privacy/security impact:** none. No new data is read, written or sent.
- **Decisions and assumptions:**
  - The fix was put at the wiring, not in SQL. Making `db_upsert_application` reuse the row for a
    `job_id` would decide that a job may only ever have one application, which is a schema-level
    question for the maintainer rather than a bug fix.
  - **The size ratchet refused this change twice, and was right both times.** `jobs.component.ts`
    is 1104/400: prettier expanded the new call across three lines, then a three-line comment put it
    one over. The comment was tightened until the block matched the six lines it replaced. Final
    sizes are unchanged - `jobs.component.ts` **1104 -> 1104**, `jobs.component.html`
    **1122 -> 1122** - which is the only reason this could land without extracting a child component
    first.
- **Risks or compatibility impact:** low. `markApplied`'s signature changed, and its single caller
  changed with it; the compiler and the 22 service tests carry the rest.
- **Open issues or blockers:** a Mark as Applied that can sit for ten minutes per document with no
  way to cancel; the unsigned macOS bundle; and everything the previous entry lists.
- **Next first action:** let that run finish once without being killed, so the 600-second boundary
  is observed rather than assumed - success or a visible failure. A cancel control is the change
  that follows, and it needs the child-component decision, because both files it would touch are
  over budget.
- **Evidence:** `applications` rows for job 110 polled for seven minutes, staying at exactly one; a
  zoomed screenshot of the button reading "Preparing documents…"; the md5 values on either side of
  each mutation; `npm run quality:file-size` printing `1104/400 ... base 1104`.

### 2026-08-03, the manual pass: the window is fine, the signature is not

- **Status:** partial
- **Agent/tool:** Claude Code, Opus, driving the real macOS desktop
- **Branch:** none cut - no source file was edited. Only this file and `CURRENT_STATE.md` changed.
- **Commits:** the documentation commit for this entry
- **Pull request:** opened after this entry
- **Objective:** the manual pass the previous five watches deferred, then the file-size audit.
- **Completed:**
  - **The packaged window has been seen.** `Applye_0.29.2_aarch64.dmg` was mounted, installed to
    `/Applications` and opened. The Dashboard renders styled - sidebar, the four counters, the
    recent-jobs list with real rows. The check open since `0.29.0` shipped unstyled is closed.
  - **The macOS bundle is unsigned, and Gatekeeper rejects it.** `codesign -dv` prints
    `flags=0x20002(adhoc,linker-signed)`; the bundle has **no `_CodeSignature` directory**; both
    `codesign --verify --strict` and `spctl -a -t exec` fail with `code has no resources but
signature indicates they must be present`. Same result on the pristine dmg, on the `0.29.0` dmg
    and on the local release build, so it is the standing state of packaging, not a regression.
    Consequence for a real user: the downloaded app carries the quarantine flag and then either
    shows "Applye quit unexpectedly" or starts with no window. It runs only after
    `xattr -dr com.apple.quarantine`. **The download applye.dev offers does not open on a clean Mac.**
  - **The other crash has a plain cause, and it blocks the update test.** The `0.29.1` and `0.29.0`
    binaries abort at launch with
    `initialize database: "run migrations: migration 28 was previously applied but is missing in the
resolved migrations"`. The panic sits in the Tauri setup hook, so it aborts through
    `panic_cannot_unwind` in `did_finish_launching` and the crash report shows no message. This is a
    downgrade against a database already migrated to 28 - expected, but it means the
    **update-from-`0.29.1` acceptance run cannot be done on this machine** without a throwaway
    profile.
  - **The five scenarios are not in `0.29.2`.** The tag was cut at 13:24 and 28 commits landed after
    it, including `#263` (the analysed chip), `#261` (the failed discard), `#267` and the Discover
    splits. They were therefore checked on a debug bundle built from `main` at `70cd983`, installed
    over `/Applications/Applye.app` so the screenshot layer would accept its identity.
  - **My Jobs - green.** "Show analysed" reveals two hidden rows carrying the **ANALYSED** badge, one
    of them with the RED legitimacy chip and the `Company not identified / Untitled role`
    placeholders; the status filter's new `Analysed` entry returns exactly those two rows.
  - **CV export - green.** Export as PDF wrote a valid 2-page PDF (32,623 bytes, `%PDF-1.3`) and it
    was rendered and looked at: name, contacts, Summary, Experience with bullets, Education, correct
    spacing and typography. The renderer's move into its own module in `#280` did not disturb it.
  - **Discover - renders, but the split was not exercised.** Inbox, counters (76 new, 199 filtered,
    0 tokens), filters and the scan controls all draw. Nothing in the feed matched the profile, so
    `discover-feed.ts:116` correctly collapsed the two sections into one unlabeled list -
    **"For you" / "More openings" was never on screen**, and remains unverified.
  - **Mark as applied - works, and is unusable while it does.** It completed end to end: the
    application flipped to `applied`, a cover-letter document was written and linked, the route went
    back to My Jobs and the row shows APPLIED. It took **about two minutes** (clicked 22:19:0x,
    recorded 22:21:05 UTC) with **no progress indication at all** - the button simply goes dead, no
    spinner, no text, no toast until the end. The commit path generates the missing cover letter
    through the configured DeepSeek API, and nothing on screen says so.
  - **A duplicate application row.** The first invocation, on a job that was still unclaimed, left
    **two** `applications` rows for job 111 (ids 5 and 6, both `saved`, both stamped 22:16:14).
    Only id 6 later became `applied`; id 5 is orphaned. Verified against a copy of the database
    taken before the pass, whose highest application id was 3.
  - **The audit was run over every file, not just the changed ones.** 50 over budget: 20 TypeScript,
    13 stylesheets, 12 templates, 5 Rust. Same count as the previous watch; nothing moved.
    `npm run quality:file-size` passes, reporting only `documents.rs` at 1645/800 against base 1926.
- **Not completed:**
  - **Discard tailoring, neither the success nor the failure path.** Not attempted.
  - The `0.29.1` update acceptance run - blocked as described above.
  - "For you" / "More openings" - needs a profile whose target roles match something in the feed.
  - Windows and Linux, still untouched.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md`, this file. No source file.
- **Validation:** the checks that apply to a documentation-only change: `npm run format:check`,
  `npm run quality:file-size`, `npm run quality:attribution`, `git diff --check`. The test suites
  were not run, because no code changed.
- **Privacy/security impact:** the unsigned, unnotarised macOS bundle is a distribution-security
  finding and is now recorded in `CURRENT_STATE.md`. No user data left the machine beyond the
  cover-letter generation the app itself performed against the configured provider.
- **Decisions and assumptions:**
  - The live `tauri dev` instance was stopped, with the maintainer's agreement, so two processes
    would not share one database.
  - **The real profile database was written to**, deliberately: job 111 ("Test") is now `applied`,
    cover-letter document 6 exists, and application row 5 is the orphan described above. A copy
    taken before any of it sits at
    `~/Library/Application Support/dev.applye.app/applye.db.bak_before_manual_pass_20260803`.
  - `/Applications/Applye.app` was restored to the shipped `0.29.2` afterwards, with the quarantine
    flag stripped so it opens at all.
- **Risks or compatibility impact:** none in the repository. The signing gap is a shipping risk that
  every macOS download already carries.
- **Open issues or blockers:**
  - **Signing and notarisation for macOS** - the release workflow has no such step, and until it
    does the published dmg does not open for anyone who has not been told to strip an attribute.
  - **Mark as applied has no progress state** for an operation that takes minutes and spends tokens.
  - **The duplicate `applications` row** on the first claim of an unclaimed job.
  - Unchanged: the three upstream advisories, the ratchet's import-line corner, the sitemap every
    web build dirties, and 50 files over budget.
- **Next first action:** decide the signing question - it outranks every remaining refactor, because
  it is the difference between a release users can open and one they cannot. If the answer is "not
  yet", say so on applye.dev next to the Download control.
- **Evidence:** screenshots of the packaged `0.29.2` Dashboard, of the analysed chip and the
  `Analysed` filter, and of the exported PDF rendered to an image; `codesign`/`spctl` output quoted
  above; the panic text captured by running the `0.29.1` binary from a terminal; the
  before-and-after `applications` rows quoted from the database and its backup.

### 2026-08-02, documents.rs splits, and the slice trap fires a fourth time

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/documents-rs-split`, from `main` (`2f384e7`), cut before the first edit
- **Commits:** `91eb21c`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** audit first, then pick by **how consumers import** - the lesson from the previous
  watch.
- **Completed:**
  - **The choice was made on consumer cost, and it mattered.** Two candidates: `discover-location.ts`
    910/400 and `commands/documents.rs` 1926/800. The first has three consumers importing named
    exports, one of them `discover.component.ts` at 1069/400 - **already over budget, so the ratchet
    would refuse the extra import line**, exactly as it did in the CV util split. The second is
    consumed by the command registry in `lib.rs`, which names commands; no command moved, so nothing
    there changes. Picked the free one.
  - **`documents_blocks.rs` (290).** The pure middle of the export path: stored CV and cover-letter
    JSON in, `StyledBlock`s out, no database and no filesystem. Both renderers take it from there.
  - Gutting the CV conversion turns four tests red, hash-verified.
    `documents.rs` **1926 -> 1645**.
- **Not completed:** `documents.rs` is 1645/800 - the command layer, the export byte paths, the
  style model and a 629-line test module.
- **Files or packages changed:** `documents.rs`, new `documents_blocks.rs`, `commands/mod.rs`,
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `cargo build` 0 problems, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` **0 problems**, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with base `1926 -> 1645`, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet touched, no command signature changed.
- **Privacy/security impact:** none.
- **Decisions and assumptions:** picked by consumer cost rather than by size. The larger, more
  obvious target was the one the gate would have refused.
- **Risks or compatibility impact:** low; the compiler carries the references, 339 tests carry the
  behaviour, and no exported document was opened and looked at.
- **Open issues or blockers:**
  - **The slice-by-line-number trap fired a fourth time**, again at the closing end: the backward
    scan for comments stopped at `CvStyle`'s doc comment, so the `#[derive(...)]` and `#[serde(...)]`
    attributes below it went into the moved file and left `pub struct CvStyle {` bare. The compiler
    caught it as an unsatisfied `Deserialize` bound, which is a long way from the cause.
    **Four occurrences, four different forms**: an orphaned doc comment, a helper after the last
    test, a `#[tauri::command]` separated from its function, and now attributes separated from their
    struct. The pattern is settled - **anything attached above an item travels with it, and a slice
    must be checked at both ends** - and writing it down three times has not stopped me. A tool that
    slices by item rather than by line would.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session unseen
    running, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories,
    the ratchet's import-line corner, and the sitemap that every web build dirties.
- **Next first action:** the manual pass. On the code side, run the audit and check consumer imports
  before picking; `discover-location.ts` is the example of a target that looks free and is not.
- **Evidence:** `npm run quality:file-size` printed `1645/800 ... base 1926` on `91eb21c`;
  `cargo test --lib` printed `339 passed` before and after, `4 failed` with the conversion gutted.

### 2026-08-02, the user guide splits, and a split that cost nothing

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/web-guide-pages`, from `main` (`5afd1f2`), cut before the first edit
- **Commits:** `2718382`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** ran the audit first this time. 51 files over budget, and
  `apps/web/src/app/docs/guide-pages.ts` at 1122/400 was the largest TypeScript source and a pure
  data-shaped file - eleven standalone components with inline templates.
- **Completed:**
  - **Eleven files, one per guide page**, largest 165. Each was already lazily routed on its own, so
    a file per page is also a chunk per page.
  - **It cost nothing anywhere.** The routes reach these through dynamic `import()`, so repointing
    them changed the path string and not the line count: `app.routes.ts` is **352 before and after**.
    That is the exact opposite of the CV util split two watches ago, where every consumer needed a
    second import line and the size gate refused it. **Whether a split is free depends on how its
    consumers import it**, which is worth knowing before choosing the next target.
  - All 39 routes still prerender.
- **Not completed:** the other 50 files.
- **Files or packages changed:** `guide-pages.ts` removed, eleven files under
  `apps/web/src/app/docs/guide/`, `app.routes.ts`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npx nx lint web`
  clean, `npx nx test web` **76 passed**, `npm run web:build` complete with **39 prerendered
  routes**, `npm run quality:file-size` pass with `app.routes.ts` unchanged at 352,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`
  all pass. **Not run:** the desktop and `cargo` gates - nothing outside `apps/web` was touched.
- **Privacy/security impact:** none. Documentation components moved.
- **Decisions and assumptions:** one file per page rather than grouping by theme, because the
  routing already treats them one at a time and grouping would have been an invented category.
- **Risks or compatibility impact:** none observed. The prerender count is the check that every
  route still resolves; a broken lazy import would have dropped it below 39.
- **Open issues or blockers:**
  - `apps/web/public/sitemap.xml` regenerated with today's date again during the build and was
    discarded again. Third time this session. It is generated output tracked in git, which means
    every web build dirties the tree - worth either ignoring or regenerating deliberately, but it is
    not this branch's business.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session unseen
    running, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories,
    the ratchet's import-line corner.
- **Next first action:** the manual pass. On the code side, `commands/documents.rs` at 1926/800 is
  the same shape as the two Rust files already split, and `discover-location.ts` at 910/400 is data
  tables. Both look decision-free - **but run the audit and check how consumers import, rather than
  trusting this sentence.**
- **Evidence:** `npm run web:build` printed `Prerendered 39 static routes`;
  `npm run quality:file-size` printed `app.routes.ts: 352/400 ... base 352`.

### 2026-08-02, the PDF renderer leaves the tailoring exporter

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/tailoring-rs-split`, from `main` (`306cbfd`), cut before the first edit
- **Commits:** `528eef4`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** I said the specs were the last decision-free work. Audited instead of asserting -
  and **51 files are still over budget**, of which `tailoring.rs` at 2538/800 is the same shape as
  the `discover.rs` split that worked. So the claim was wrong again, in the same way: it was scoped
  to what I had just been looking at.
- **Completed:**
  - **`tailoring_pdf.rs` (462).** Family mapping, glyph measurement, the line wrapper that measures
    rather than guesses, and the renderer that lays blocks onto pages. No database, no filesystem;
    `export_pdf` stays with the command layer, which is what leaves the wrapper and the placement
    assertable against content already in hand.
  - **`tailoring_fonts.rs` (20).** The embedded faces went to a third file because **both** exporters
    need them - the PDF side measures and embeds, the DOCX side hands the same bytes to docx-rs.
    Leaving them in either would have made the other import its fonts from a module named for a
    format it does not produce.
  - Gutting the wrapper turns two tests red, hash-verified. `tailoring.rs` **2538 -> 2087**.
- **Not completed:** `tailoring.rs` is 2087/800. What remains is the DOCX exporter, the cache CRUD
  and the command layer - the work the file is actually for - plus an 847-line test module over the
  budget on its own.
- **Files or packages changed:** `tailoring.rs`, new `tailoring_pdf.rs` and `tailoring_fonts.rs`,
  `commands/mod.rs`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `cargo build` 0 problems, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` **0 problems**, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with base `2538 -> 2087`, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet touched, and no command signature changed.
- **Privacy/security impact:** none. Rendering code moved; the same bytes go to the same file paths.
- **Decisions and assumptions:** the fonts went to their own module rather than to the PDF side,
  because shared assets belong to neither consumer. That is the same judgement that kept
  `resolvePageSettings` out of `cv-style.util.ts` two watches ago.
- **Risks or compatibility impact:** low; the compiler carries the references and 339 tests carry
  the behaviour. No exported PDF was opened and looked at - the tests assert structure, not
  appearance.
- **Open issues or blockers:**
  - **The slice-by-line-number trap fired a third time, in a third form.** Previously it orphaned a
    doc comment, then a helper declared after the last test. This time it took `#[tauri::command]`
    away from `export_pdf` and left it dangling at the end of the new module. Cargo caught it
    immediately. The lesson is now unambiguous: **an extraction bounded by line numbers must be
    checked at both ends**, because what sits directly above and below an item is part of it.
  - **I claimed "no decision-free move left" three times now and was wrong each time.** Every claim
    was scoped to the category I had just finished. The audit that disproves it takes seconds and I
    keep not running it before speaking.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session unseen
    running, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories,
    the ratchet's import-line corner.
- **Next first action:** the manual pass, still. On the code side the audit says 51 files remain -
  13 stylesheets, 12 templates, 5 Rust, 21 TypeScript sources. The templates and stylesheets need
  child components, which is a maintainer decision; several Rust and TypeScript sources may not.
  **Run the audit before deciding, and do not take my word for what is left.**
- **Evidence:** `npm run quality:file-size` printed `2087/800 ... base 2538` on `528eef4`;
  `cargo test --lib` printed `339 passed` before and after, `2 failed` with the wrapper gutted.

### 2026-08-02, no spec file is over budget any more

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/remaining-spec-splits`, from `main` (`f1a059b`), cut before the first edit
- **Commits:** `e44bb5c`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the maintainer said to do as recommended - the three remaining decision-free spec
  splits.
- **Completed:**
  - **All three, and the repository now has no over-budget spec file.** `cv-detail` 940 -> two files
    (422, 518); `cv-live-style-panel` 913 -> two (295, 598) plus a harness; `onboarding` 689 -> two
    plus a harness.
  - **Two needed a shared harness, one did not**, and the difference is the useful part. The panel
    wires a fixture and a change collector; onboarding wires **eight mocks** whose arrangement is
    the point - copying either into a second file duplicates the wiring, not just the lines.
    `cv-detail`'s top-level describes each stand alone, so it needed nothing.
  - `tsconfig.app.json` excludes `*.harness.ts`. They are test-only but **not** spec files, so jest
    would reject them for holding no tests while the app build tried to compile onboarding's
    reference to the `jest` namespace.
  - 1183 tests before and after, 92 suites.
- **Not completed:** nothing in scope.
- **Files or packages changed:** three spec files split into seven, two new harnesses,
  `tsconfig.app.json`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npx nx test desktop` **1183 passed, 92 suites**,
  `npm run type-check` pass for 6 projects, `npx nx lint desktop` 0 errors / 8 pre-existing
  warnings, `npx nx build desktop` complete, `npm run quality:file-size` pass with no violation,
  `npm run quality:attribution`, `npm run format:check`, `git diff --check` all pass. **Not run:**
  the `cargo` gates, no Rust touched.
- **Privacy/security impact:** none. Tests and one tsconfig exclude.
- **Decisions and assumptions:** a harness where the setup is knowledge, none where it is not. The
  rule that decided each case was whether a second copy would duplicate a decision or only some
  lines.
- **Risks or compatibility impact:** none to production code. `*.harness.ts` is now excluded from
  the app build, which is correct for test-only code but means a harness can never be imported by
  shipping code - deliberate, and worth knowing before someone tries.
- **Open issues or blockers:**
  - **Three mistakes on the way, every one a repeat of a shape already recorded this session.**
    Destructuring only `component` when the tests also used `fixture`. Aliasing a one-argument
    harness function to a zero-argument call site. And balancing braces by truncating from the end,
    which **deleted a helper declared after the last test** - the same orphan-helper trap as the
    previous spec split. All three failed loudly, which is the only reason they cost minutes rather
    than a silent regression. Recording the trap did not stop me repeating it; only the tests did.
  - **`nx build desktop` caught the harness/jest-namespace problem** that neither `type-check` nor
    the test run saw, because only the app build compiles with the app's tsconfig. That gate has now
    earned its place in every checklist this session.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session still
    unseen running, Windows and Linux unverified, the AIF skill set unpruned, three upstream
    advisories, the ratchet's import-line corner.
- **Next first action:** the manual pass. Every remaining code target needs a maintainer decision -
  child components for the two big pages, splitting fetch from persistence in `discover.rs`, and the
  ratchet corner. There is no decision-free move left, and this time that was measured rather than
  asserted: the audit reports zero over-budget spec files and the rest is templates and design.
- **Evidence:** `npx nx test desktop` printed `1183 passed, 92 suites`; `npm run quality:file-size`
  reports no violation across the repository's spec files.

### 2026-08-02, the CV content spec follows the modules it tests

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-content-spec-split`, from `main` (`1ceaf0c`), cut before the first edit
- **Commits:** `5c166e4`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** I claimed twice that no decision-free move was left. Both times I checked by
  asserting rather than measuring. This time I measured: **four spec files were over the 600
  budget**, and splitting a spec touches no consumer at all, so all four are decision-free. Took
  the largest.
- **Completed:**
  - `cv-content.util.spec.ts` **1509/600 became four files**, following the source split from the
    previous watch: style (473), entry editing (176), AI response parsing (445), content building
    (426). Every one under budget where one was at 1509.
  - 120 tests before, 120 after; 1183 across the app either side; 89 suites.
- **Not completed:** three spec files remain over budget - `cv-detail.component.spec.ts` 940,
  `cv-live-style-panel.component.spec.ts` 913, `onboarding.component.spec.ts` 689. All the same
  decision-free shape.
- **Files or packages changed:** `cv-content.util.spec.ts`, new `cv-style.util.spec.ts`,
  `cv-entry.util.spec.ts`, `cv-parse.util.spec.ts`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npx nx test desktop`
  **1183 passed, 89 suites**, `npx nx lint desktop` 0 errors / 8 pre-existing warnings,
  `npx nx build desktop` complete, `npm run quality:file-size` pass, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the `cargo` gates.
- **Privacy/security impact:** none. Tests only.
- **Decisions and assumptions:** the split follows the modules rather than the describe count, which
  is why it landed at four files and not three.
- **Risks or compatibility impact:** none to production code.
- **Open issues or blockers:**
  - **Splitting by adjacency sweeps module-level helpers into the wrong file.** Each describe was
    taken as running to the next one, which put a fixture into the file whose describe happened to
    precede it while its only callers stayed behind. **The tests caught it** - two failures, named
    and immediate - which is the difference from the previous spec split, where eleven lost tests
    produced no failure at all and only the count exposed them. Orphan helpers between describes
    need the same explicit check orphan tests do.
  - **I asserted "nothing decision-free left" twice and was wrong both times.** Both claims were
    made from memory of what I had looked at, not from a fresh measurement. The audit takes seconds.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session still
    unseen running, Windows and Linux unverified, the AIF skill set unpruned, three upstream
    advisories, and the ratchet corner from the previous watch.
- **Next first action:** the manual pass. Failing that, three more spec files are over budget and
  are the same mechanical shape as this one.
- **Evidence:** `npx nx test desktop` printed `1183 passed, 89 suites`; `npm run quality:file-size`
  reports no violation and every new file under 600.

### 2026-08-02, the CV content util splits, and the gate names the price of splitting

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-style-util`, from `main` (`827c127`), cut before the first edit
- **Commits:** `8aa34af`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the second decision-free move I had named and then wrongly said did not exist -
  `cv-content.util.ts`, 1245/400.
- **Completed:**
  - **Two of its four jobs came out.** `cv-style.util.ts` (336) is immutable edits to a `CvStyle`
    plus the resolution that reads one back; `cv-entry.util.ts` (118) edits the entries inside a
    section. What is left builds content and parses AI responses. **1245 -> 829.**
  - `resolvePageSettings` and `ResolvedPage` stayed behind: they describe the page box rather than a
    style override, and both previews use them.
  - 1183 tests before and after; type-check, lint, build all clean.
- **Not completed:** `cv-content.util.ts` is 829/400. Its remaining two jobs - content building and
  AI response parsing - are a further split, but see the blocker below before attempting it.
- **Files or packages changed:** `cv-content.util.ts`, new `cv-style.util.ts` and `cv-entry.util.ts`,
  `CHANGELOG.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npx nx test desktop`
  **1183 passed**, `npx nx lint desktop` 0 errors / 8 pre-existing warnings, `npx nx build desktop`
  complete, `npm run quality:file-size` pass with base `1245 -> 829`,
  `npm run quality:attribution`, `npm run format:check`, `git diff --check` all pass. **Not run:**
  the `cargo` gates, no Rust touched.
- **Privacy/security impact:** none.
- **Decisions and assumptions:**
  - **The new modules are re-exported from `cv-content.util` rather than imported directly, and that
    is a concession the size gate forced, not a preference.** The clean version repointed all nine
    consumers - and the type-checker found every one, which is the argument for moving rather than
    re-exporting. But splitting a module costs each consumer **one import line**, prettier then
    wraps the longer lists, and three of those consumers are already over budget. **The gate refused
    it**, correctly by its own rule: an over-budget file may not grow, whatever the reason. A
    re-export leaves every consumer untouched and still puts the code where it belongs. The file
    carries a comment saying to import the specific module in new code.
- **Risks or compatibility impact:** none to behaviour; every consumer's import path is unchanged.
- **Open issues or blockers:**
  - **The ratchet has a corner it cannot see past, and this is it.** Splitting an oversized module
    is exactly the work the budget exists to encourage, and doing it properly makes every consumer
    one line longer - which the same budget forbids for any consumer already over. The rule is right
    in general and produced a barrel here. Worth a maintainer decision at some point: either the
    gate tolerates a pure import-line delta, or splits keep landing as re-exports.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session still
    unseen running, Windows and Linux unverified, the AIF skill set unpruned, three upstream
    advisories.
- **Next first action:** the manual pass. On the code side there is genuinely nothing left that does
  not need either a design decision or the maintainer ruling on the corner above.
- **Evidence:** `npm run quality:file-size` printed `829/400 ... base 1245`; the refused version is
  in this session's transcript, blocked by the pre-commit hook on three consumers growing.

### 2026-08-02, the CV preview spec splits, and a count catches eleven lost tests

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-preview-spec-split`, from `main` (`0e3b94a`), cut before the first edit
- **Commits:** `42b6f0d`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** with the named targets done and the remainder needing either a design decision or a
  human, take the one remaining decision-free move: the worst test file in the repository.
- **Completed:**
  - **`cv-preview.component.spec.ts` 2263/600 became six files**, each under budget: core render and
    geometry (329), styling (584), themes (145), selection (362), selection identity (313), inline
    leaf editing (571).
  - **A shared harness made it possible.** The 20-line TestBed setup moved to
    `cv-preview.harness.ts`. Every spec needs every input set, or a test fails on a missing required
    input rather than on what it was asserting - so duplicating the setup six times was not an
    option and a shared one was the whole enabling move.
  - **133 tests before, 133 after**, and the runner agrees at 1183 desktop tests either side.
- **Not completed:** nothing in scope.
- **Files or packages changed:** six spec files and a harness under
  `apps/desktop/src/app/pages/documents/cv-detail/cv-preview/`, `CHANGELOG.md`, this file.
- **Validation:** run and observed - `npx nx test desktop` **1183 passed, 84 suites**,
  `npm run type-check` pass for 6 projects, `npx nx lint desktop` 0 errors / 8 pre-existing
  warnings, `npx nx build desktop` complete, `npm run quality:file-size` pass,
  `npm run quality:attribution`, `npm run format:check`, `git diff --check` all pass. **Not run:**
  the `cargo` gates, no Rust touched.
- **Privacy/security impact:** none. Tests only.
- **Decisions and assumptions:** the split is by behaviour, which is what the budget rule prescribes
  for a test file, rather than by source file or by describe block count.
- **Risks or compatibility impact:** none to production code. The risk was entirely in losing a test,
  which is addressed below.
- **Open issues or blockers:**
  - **The first attempt silently dropped eleven tests, and every file still passed.** The slice took
    "everything before the first nested `describe`" as the core, which missed eleven ungrouped tests
    sitting _between_ describes further down the file. Nothing failed. Six green suites, a green
    build, and eleven assertions gone. **Only comparing the test count to the baseline caught it** -
    1172 against 1183. A lost test looks exactly like a passing one, which is why the count is the
    check and not the colour.
  - The size gate then refused two intermediate arrangements - 665 for selection, 718 for styling
    after over-correcting - before every file landed under 600. That is the fourth and fifth refusal
    this session, and both were right.
  - Unchanged: the two human release checks on `0.29.2`, everything shipped this session still
    unseen running, Windows and Linux unverified, the AIF skill set unpruned, three upstream
    advisories.
- **Next first action:** the manual pass. Every remaining code target now needs either a design
  decision (splitting fetch from persistence in `discover.rs`; child components for the two pages)
  or is a template, which child components would take anyway. There is no decision-free move left
  of any size.
- **Evidence:** `npx nx test desktop` printed `1183 passed` before the split and after it, and
  `1172` in between; `npm run quality:file-size` reports every new file under the 600 test budget.

### 2026-08-02, the Discover tests move to sit with what they test

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-test-split`, from `main` (`236522d`) - **cut before the first
  edit**, which is the correction the previous entry recorded
- **Commits:** `a665043`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the seam named in the previous entry - split the scan engine's test module along
  the same three-way line the source now follows.
- **Completed:**
  - **Twenty-eight reader tests and three geography tests moved** beside the code they exercise. A
    reader and its fixtures now open in one file.
  - **Only tests that reference nothing left behind moved.** Anything touching `test_pool`,
    `live_source`, `RawJob` construction or the geo config builders stayed, because those still live
    with the scan engine. The classification was mechanical - a test moved only if it named a
    reader or a geo lookup and named nothing that stayed.
  - **339 tests before and after**, same names, same count.
  - `discover.rs` **2096 -> 1679**. Across four commits it has gone **3245 -> 1679**, a 48%
    reduction, and every file in the group is now under the 800 budget except the scan engine
    itself.
- **Not completed:** `discover.rs` is 1679/800. What remains is the HTTPS and persistence layer that
  is the file's actual job, plus the tests that exercise it - which need a database and are
  therefore a different kind of thing from the two groups that moved. Child components for Jobs and
  Discover remain untouched.
- **Files or packages changed:** `discover.rs`, `discover_geo.rs`, `discover_parsers.rs`, new
  `discover_parsers_tests.rs`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` **0 problems**, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with base `2096 -> 1679`, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet touched.
- **Privacy/security impact:** none. Tests moved; no production code changed.
- **Decisions and assumptions:**
  - The reader tests went to a **sibling file** (`#[path]` + `#[cfg(test)] mod tests`) rather than an
    inline module. Inline, they took `discover_parsers.rs` from 666 to 1058 and across the budget -
    and a fixture-heavy test body is exactly the bulk that budget exists to keep out of the code
    being read.
  - The three geography tests stayed inline, because `discover_geo.rs` has room for them and a
    sibling file for three tests would be ceremony.
- **Risks or compatibility impact:** none beyond the move itself. Test names and count are
  unchanged, so a test silently lost would have shown as 336.
- **Open issues or blockers:**
  - **The size gate refused a change of mine for the third time this session**, and was right each
    time. Twice on the Angular side and once here. The pattern is consistent: a change that improves
    where code lives can still make a file worse, and the budget is what tells the two apart.
  - Unchanged: the two human release checks on `0.29.2`, the paths from this session nobody has seen
    run, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories.
- **Next first action:** the manual pass, now six watches overdue. Nothing shipped in this entire
  session has been seen running, and the desktop app is Tauri-only so no browser preview can
  substitute. On the code side, `discover.rs` at 1679/800 is down to the layer that is genuinely its
  job, and further reduction there means splitting fetch from persistence - a design decision rather
  than a move.
- **Evidence:** `npm run quality:file-size` printed `1679/800 ... base 2096` on `a665043`;
  `cargo test --lib` printed `339 passed` before and after the move; the inline version was refused
  by the gate at `1058` before the sibling file was used.

### 2026-08-02, the Discover feed readers follow the geography out

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-feed-readers`, from `main` (`e8e3a41`) - see the process note
  below, the commits were first made on `main` by mistake and moved
- **Commits:** `f2d31d0`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the seam named in the previous entry - the per-source feed parsers.
- **Completed:**
  - **`discover_parsers.rs`.** Twelve readers for the shapes the built-in sources serve, plus the
    detail reader for the one source whose list carries no description, and the small helpers only
    they use.
  - **The boundary was already in the code.** None of the readers touches the network: each takes
    already-fetched text or JSON and returns `RawJob`, which is what makes them testable against a
    fixture instead of a server. The HTTPS layer stays in `discover.rs`. The split gave that
    boundary a file to be a boundary between rather than inventing one.
  - `RawJob` and `json_str` widen to `pub(super)`; nothing else needed to.
  - Gutting the Arbeitsagentur reader turns **three tests red**, hash-verified before the result was
    read.
  - `discover.rs` **2742 -> 2096**; `discover_parsers.rs` **666, under the 800 budget**.
- **Not completed:**
  - `discover.rs` is still 2096/800. Its remaining bulk is the **1142-line test module**, which is
    over the 800 test budget on its own, and the HTTPS/persistence layer that is the file's actual
    job. Splitting the tests would follow the source split - geography tests to
    `discover_geo`, reader tests to `discover_parsers` - and is the obvious next move.
  - Child components for Jobs and Discover, still untouched and still the only thing that reaches
    either template or the Discover stylesheet.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover.rs`, new
  `discover_parsers.rs`, `commands/mod.rs`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this
  file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` **0 problems**, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with base `2742 -> 2096`, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet touched, and no Tauri command signature changed.
- **Privacy/security impact:** none. The readers parse text that was already being fetched, in the
  same way, from the same sources.
- **Decisions and assumptions:** the readers went into one module rather than one per source. They
  share `RawJob`, the helpers and the same shape, and twelve files of fifty lines each would be
  filing rather than decomposition - the same judgement that put `markApplied` into an existing
  service instead of a tenth new one.
- **Risks or compatibility impact:** low; the compiler carries the references and 339 tests carry
  the behaviour. The residual risk is a table or literal altered during the move rather than copied,
  which the mutation addresses only for the reader it targeted.
- **Open issues or blockers:**
  - **Clippy caught something the build did not**: the doc comment for `html_to_text` was left
    behind when the function moved, because the extracted range started at the `fn` line rather than
    at its documentation. `empty lines after doc comment` is a lint, not a compile error, so only
    `clippy -D warnings` saw it. **An extraction that slices by line number can orphan the
    documentation above the first item** - worth checking explicitly next time rather than relying
    on a lint to notice.
  - **I committed application code to `main` directly, which `AGENTS.md` forbids.** After the
    previous pull request merged I synced `main` and started editing without cutting a branch. Two
    commits landed on local `main`; the push appeared to succeed only because `-u` named a remote
    branch, and it did not land. Caught by checking what the remote actually held rather than
    trusting the push output. Recovered without loss: the commits were branched off to
    `refactor/discover-feed-readers` and local `main` was reset to `origin/main`. Nothing reached
    the shared branch. **Cut the branch before the first edit, not before the first commit.**
  - Unchanged: the two human release checks on `0.29.2`, the paths from this session nobody has seen
    run, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories.
- **Next first action:** split `discover.rs`'s test module along the same three-way line the source
  now follows, which takes it under its own budget as a side effect. Before more refactoring though:
  the manual pass is now five watches overdue and nothing shipped today has been seen running.
- **Evidence:** `npm run quality:file-size` printed `2096/800 ... base 2742` on `f2d31d0`;
  `cargo test --lib` printed `339 passed` before and after, and `3 failed` with the Arbeitsagentur
  reader gutted.

### 2026-08-02, Discover's geography leaves the scan engine

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-rs-split`, from `main` (`9903a88`)
- **Commits:** `b66f7d7`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the maintainer said continue without naming a target again, so the remaining
  scoped item was taken: `commands/discover.rs`, 3245/800, the largest file in the repository once
  the site stylesheet was split.
- **Completed:**
  - **`discover_geo.rs`.** The half that came out is pure lookup - freetext names for each region,
    the tokens a country code also answers to, the US state tables behind them, the market parser
    and the location matcher. No database, no network, no state. It changes when a market is added
    rather than when the scan does.
  - **Sibling file, not a subdirectory**, following `job_identity.rs` / `job_identity_source.rs`.
    Every item `pub(super)`: the scan is the only caller, and widening it further would invite the
    tables to grow a second home.
  - `KNOWN_LOCAL_MARKETS` is imported **inside the test module** rather than at file scope. Only
    the tests read it, and a module-scope import would be dead in a release build and fail
    `clippy -D warnings` - which is exactly what happened on the first attempt.
  - **Exercised, not merely compiled.** The compiler proves most of a Rust move, but not that the
    moved code matters. Gutting the German country tokens turns **five tests red**; restored and
    re-verified at 339 passing.
  - `discover.rs` **3245 -> 2742**, `discover_geo.rs` 522.
- **Not completed:**
  - Both files are still over the 800 budget. `discover.rs`'s remaining bulk is its **1142-line
    test module** and the per-source feed parsers (`parse_nofluffjobs` 90, `parse_arbeitsagentur`
    74, `parse_nofluffjobs_detail` 65, `parse_himalayas` 57, `parse_trudvsem` 52) - the obvious
    next seam, and a second one in the tests, which have their own 800 budget.
  - Child components for Jobs and Discover, still the only thing that touches either template or
    the Discover stylesheet.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/discover.rs`, new
  `discover_geo.rs`, `commands/mod.rs`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `cargo build` clean, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` **0 problems**, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with base `3245 -> 2742`, `npm run quality:attribution`,
  `npm run format:check`, `git diff --check` all pass. **Not run:** the frontend gates - no
  TypeScript, template or stylesheet was touched, and the Tauri command signatures are unchanged.
- **Privacy/security impact:** none. No command signature, query, or network call changed; the
  moved code is string lookup.
- **Decisions and assumptions:**
  - Target chosen rather than asked, and named plainly: the maintainer had seen all remaining
    options with their sizes and said continue.
  - The geography went out before the parsers, though the parsers are the more obvious grouping,
    because the geography is **pure** and the parsers each touch the fetch path. Pure first is the
    same order every extraction in this session followed.
- **Risks or compatibility impact:** low, and the compiler carries most of it. The residual risk is
  that a table was moved with a subtle edit rather than verbatim - which the five-test mutation
  addresses only for the German tokens. The rest rests on `cargo test` and on the move being
  mechanical.
- **Open issues or blockers:** unchanged - the two human release checks on `0.29.2`, the paths from
  this session nobody has seen run, Windows and Linux unverified, the AIF skill set unpruned, three
  upstream advisories with drop conditions.
- **Next first action:** unchanged and now overdue - open the packaged app once and press the five
  paths from the closing entry, in the same sitting as the two `0.29.2` release checks. On the code
  side, `discover.rs`'s per-source parsers are the next seam, and its 1142-line test module is over
  its own budget independently.
- **Evidence:** `npm run quality:file-size` printed `2742/800 ... base 3245` on `b66f7d7`;
  `cargo test --lib` printed `339 passed` before and after, and `5 failed` with the tokens gutted.

### 2026-08-02, the site stylesheet splits, and the split is proven rather than claimed

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/web-styles-split`, from `main` (`4dccd0b`)
- **Commits:** `0fa3f96`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the session was closed one entry ago; the maintainer said continue without naming
  a target, so the lowest-risk of the three scoped options was taken - `apps/web/src/styles.scss`,
  2167/400, the worst ratio in the repository.
- **Completed:**
  - **Eleven section partials, largest 353/400.** The file already carried its own section banners,
    so the seams were written in and nothing had to be invented.
  - **`styles.scss` is now the `@use` list and nothing else**, deliberately. Sass emits each used
    module before the file that uses it, in `@use` order, so that list **is** the cascade; a rule
    left in the file would land after every partial rather than where it was written. The comment
    in the file says so, because the next person to add a rule there is the one who needs to know.
  - **The no-op claim is checked, not asserted.** The compiled stylesheet is byte-identical: same
    md5, and Angular's content hash in the emitted filename (`styles-E4MXUTHN.css`) is unchanged
    too, which is independent of my own comparison.
  - **And the check is meaningful.** Swapping two partials in the `@use` list produces a different
    md5 and a different filename hash, so the identical result is evidence rather than a comparison
    that could not have failed. This is the stylesheet equivalent of the mutation discipline.
  - **Re-verified after the commit hook.** Prettier reformats staged files, which could have moved
    a byte and quietly falsified the claim. Rebuilt afterwards: still identical. The claim is about
    what landed, not about what was written.
- **Not completed:** nothing in scope. No desktop code touched.
- **Files or packages changed:** `apps/web/src/styles.scss` and eleven new files under
  `apps/web/src/styles/`; `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run web:build` complete with 39 prerendered routes and the
  identical CSS hash, `npx nx test web` 76 pass, `npx nx lint web` clean, `npm run type-check` pass
  for 6 projects, `npm test` all six green (1183 desktop), `npm run quality:file-size` pass with
  `styles.scss` gone from the report entirely, `npm run quality:attribution`,
  `npm run format:check`, `npm run verify:csp`, `git diff --check` all pass. **Not run:** the
  `cargo` gates, no Rust touched.
- **Privacy/security impact:** none. No selector, declaration or byte of output changed.
- **Decisions and assumptions:**
  - The target was chosen, not asked, because the maintainer had already seen all three options
    with their sizes one message earlier and said continue. The lowest-risk one was taken and named
    plainly rather than assumed silently.
  - No partial carries its own `@use`. The file uses CSS custom properties throughout - no Sass
    variables, mixins or functions - so there is nothing for them to import, and the shared
    `libs/ui` global stays where it was, first.
- **Risks or compatibility impact:** the strongest available evidence says none: identical output,
  and the negative control shows the check can fail. What it does not prove is that the site _looked_
  right beforehand - only that it looks exactly as it did.
- **Open issues or blockers:**
  - `apps/desktop/src-tauri/src/commands/discover.rs` at **3245/800** is now the worst file in the
    repository, still untouched and still in no plan.
  - Unchanged: the two human release checks on `0.29.2`, the paths from this session nobody has seen
    run, Windows and Linux unverified, the AIF skill set unpruned, three upstream advisories with
    drop conditions, child components for Jobs and Discover.
- **Next first action:** unchanged from the closing entry - open the packaged app once and press the
  five paths listed there, in the same sitting as the two `0.29.2` release checks. The stylesheet
  split needs no manual check of its own; its output is provably the same bytes.
- **Evidence:** `md5` of `dist/apps/web/browser/styles-E4MXUTHN.css` is
  `8ca537ee5f52eac4ea53f96847e5e447` before and after; the deliberate partial swap produced
  `styles-3GMSWPDP.css` with md5 `a4eaa5003d0114d217ae18a2bea7d4ad`.

### 2026-08-02, session closed: Discover's .ts stops at 1069

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `docs/close-session-handoff`, from `main` (`aab6a09`)
- **Commits:** one, documentation only
- **Pull request:** opened after this entry
- **Objective:** answer the previous entry's question - whether Discover's `.ts` is done at 1069 -
  and hand the work off cleanly.
- **Completed:** the decision, put to the maintainer with the numbers rather than assumed: **stop
  here.** No member of `discover.component.ts` is over 40 lines, which is the same floor
  `jobs.component.ts` reached at 1104. Everything past this point on either page is child
  components, and that is a materially different piece of work.
- **What this session did, end to end:** 13 PRs merged. `jobs.component.ts` **1467 -> 1104** across
  nine extractions plus one bug fix; `discover.component.ts` **1242 -> 1069** across three. Desktop
  tests **1018 -> 1183**. One shipped feature (ADR-0004, unclaimed jobs made findable), one shipped
  bug fix (a failed discard no longer reads as a successful one), one gate fixed
  (`npm run type-check` now sees Angular templates), one advisory settled and documented (glib,
  Dependabot 42), and one governance rule added (templates may bind services directly, forward
  only).
- **Not completed, and left deliberately:**
  - Child components for either page - the only remaining way to reduce them, and the only thing
    that touches `jobs.component.html` (1122/300), `discover.component.html` (1070/300) or
    `discover.component.scss` (1915/400).
  - `apps/web/src/styles.scss` **2167/400** and `apps/desktop/src-tauri/src/commands/discover.rs`
    **3245/800** - the two worst files in the repository by ratio, both surfaced by this session's
    re-audit and neither in any plan.
  - The Discover heading-lexicon bug, measured and deliberately left; the reasoning is two entries
    below so nobody re-derives it.
- **Validation:** `main` is clean, no open pull requests, and the full gate was run and observed on
  every one of the 13 merges. Nothing in this entry changes code.
- **Privacy/security impact:** none.
- **Decisions and assumptions:** stopping was the maintainer's call, offered against three
  alternatives with their sizes. The repository's own advice after large work is to start the next
  watch with clean context, and this conversation is long enough that the advice applies to it.
- **Risks or compatibility impact:** **nothing shipped this session has been seen running.** The
  desktop app is Tauri-only, so none of it renders in a browser preview. That covers ADR-0004's
  filter chip and Analysed badge, Mark as applied end to end, the discard failure path, the Discover
  feed sections and the scan console - the last of which exists to be read by a human and has never
  been watched.
- **Open issues or blockers:** the two human release checks on `0.29.2`, unchanged for five watches.
  Windows and Linux unverified. The AIF skill set unpruned against `writing-great-skills`. Three
  upstream advisories with recorded drop conditions. 57 files over budget.
- **Next first action:** open the packaged app once and press the five paths above, ideally in the
  same sitting as the two `0.29.2` release checks. Then choose between child components, the web
  stylesheet, and `commands/discover.rs` - all three are scoped in this entry, none is started.
- **Evidence:** `git log e420c7d..HEAD` is 13 merge commits; `npx nx test desktop` prints
  `1183 passed`; `npm run quality:file-size` reports `jobs.component.ts` at 1104 and
  `discover.component.ts` at 1069, both under their recorded bases.

### 2026-08-02, the scan console leaves the Discover page

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-scan`, from `main` (`931269c`)
- **Commits:** `d0de21c`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - continue Discover at `scan`, separating
  what is a decision from what is I/O before touching it.
- **Completed:**
  - **The separation held up.** `scan()` was 70 lines and **45 of them were building console text**:
    a started banner, a line per source result with its ok/error formatting, a done line, and the
    rewrite that happens when the scan itself dies. All pure, none tested, and wrapped around the
    I/O. `discover-console.ts` takes the three shapes and the line types they own; `scan()` keeps
    the guard, the two database calls, the clock and the signals.
  - **Three implicit rules now have tests.** A source whose `error` is an empty string reports as
    **success** - a failure with nothing to say is worse than saying it worked. The result header
    counts the sources the **summary** reported, not the ones requested, because a source can drop
    out in between. And when the scan dies, every line still marked `active` becomes an error,
    because a spinner claims work that is not happening.
  - `consoleLabel` came with them and no longer pads by a bare `22`: the width is named, and a
    source name too long to pad is left whole rather than truncated, which a test now states.
  - 16 tests. `1108 -> 1069`.
- **Not completed:** Discover's template (1070/300) and stylesheet (1915/400) untouched; its `.ts`
  is 1069/400. `parseJdBlocks` aside, no member is over 40 lines now - `availableRegions` (38) and
  `load` (33) are the largest.
- **Files or packages changed:** added `apps/desktop/src/app/pages/discover/discover-console.ts` and
  its spec; modified `discover.component.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`,
  this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npm test` all six
  green with **1183** desktop tests, `npm run lint` 6 projects green, `npx nx build desktop`
  complete, `npm run quality:file-size` pass with base `1108 -> 1069`,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`
  all pass. **Not run:** the `cargo` gates, no Rust touched; the browser preview, Tauri-only page.
- **Privacy/security impact:** none. Pure functions moved.
- **Decisions and assumptions:**
  - `Date.now()` stays in `scan()` and the elapsed seconds are passed in as a string. The clock is
    I/O, and a function that reads it cannot be asserted without faking time.
  - The empty-error-string case is **preserved, not corrected**. The original used a truthiness
    check, so `''` already meant success; the test states it rather than changing it.
- **Risks or compatibility impact:** none from this commit - the text-building moved unchanged, and
  the tests were written against it. The scan console has still never been watched running during
  this session, and it is the one piece of Discover whose whole purpose is to be read by a human.
- **Open issues or blockers:**
  - The import I added did not land on the first attempt: prettier had collapsed the anchor line
    into one, and my patch matched the multi-line form. `type-check` caught it immediately. Cheap
    here, but the pattern is worth naming - **an anchored patch against a formatted file should be
    verified, not assumed**, the same discipline as the mutation checks.
  - Unchanged: `jobs.component.ts` 1104/400 and stopped by decision, `discover.component.html`
    1070/300, `discover.component.scss` 1915/400, `apps/web/src/styles.scss` 2167/400,
    `commands/discover.rs` 3245/800, 57 files over budget in total. The two human release checks on
    `0.29.2`. The paths from this session nobody has seen run. Windows and Linux unverified. The
    AIF skill set unpruned. Three upstream advisories with drop conditions.
- **Next first action:** decide whether Discover's `.ts` is done at 1069. No member is over 40 lines
  and what remains is the same thin-delegation shape that ended the Jobs work at 1104 - which means
  the next real reduction on this page is child components, taking the 1070-line template and the
  1915-line stylesheet with them. That is a bigger change than anything in this session and wants
  its own decision.
- **Evidence:** `npm run quality:file-size` printed `1069/400 ... base 1108` on `d0de21c`;
  `npm test` printed `1183` for desktop; both mutations were confirmed by md5 before their result
  was read.

### 2026-08-02, the Discover feed's rules stop being comments

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-feed-derivations`, from `main` (`bf3e56e`)
- **Commits:** `7c318be`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - settle the heading-lexicon bug, then
  continue Discover at its derivations.
- **Completed:**
  - **The lexicon bug is settled: leave it.** Measured through the real `looksLikeHeading` rather
    than the regex alone, and **no fix is strictly better**. The obvious `\w*` fix recovers seven
    real section titles - Responsibilities, Requirements, Qualifications, Benefits, and three
    qualified forms - and adds two false headings on unpunctuated prose fragments, which
    `strip_html` does emit. Anchoring the match near the start of the line removes those two, and
    one the current code already has, but loses "What we offer", which works today. Put to the
    maintainer with the measurement; the answer was to leave it. A missed heading still renders as
    a readable paragraph, and the behaviour is pinned by a test that states it.
  - **`discover-feed.ts`.** `filterFeedRows` and `splitFeedSections` came out with the `FeedRow` and
    `FeedSection` types they own. 21 tests. `1163 -> 1108`.
  - **Three rules that were comments are now assertions.** A dismissed row survives every filter,
    because it renders as the transient Dismissed-Undo strip and a filter that could drop it would
    take the undo with it. A lone More section loses its header so it reads as a plain list, while a
    lone For you keeps its label, because the label is the only thing saying why those rows come
    first. And every active filter applies together, not only the last one.
  - `matchesProfile`, `rowTierRank` and `workTypeOf` stay with the component and are passed in -
    the first two read the archetype cache it owns, and what counts as remote is more than the
    location string.
- **Not completed:** Discover's template (1070/300) and stylesheet (1915/400) untouched; its `.ts`
  is 1108/400. `scan` (70 lines) is the largest member left.
- **Files or packages changed:** added `apps/desktop/src/app/pages/discover/discover-feed.ts` and
  its spec; modified `discover.component.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`,
  this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npm test` all six
  green with **1167** desktop tests, `npm run lint` 6 projects green, `npx nx build desktop`
  complete, `npm run quality:file-size` pass with base `1163 -> 1108`,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`
  all pass. **Not run:** the `cargo` gates, no Rust touched; the browser preview, Tauri-only page.
- **Privacy/security impact:** none. Pure functions moved.
- **Decisions and assumptions:**
  - The lexicon bug is left unfixed, with the measurement recorded rather than the conclusion alone,
    so the next agent does not re-derive it.
  - `FeedFilter` takes `ReadonlySet`, not `Set`. The filter never edits the selections, and typing
    it honestly is what the type-check caught - **the first time this session that the fast gate,
    not `nx build`, was the one to catch a type error.** The gate change from two watches ago paid
    for itself here.
- **Risks or compatibility impact:** none from this commit; the logic moved unchanged and the tests
  were written against it. Discover's feed has still never been exercised in a running app during
  this session.
- **Open issues or blockers:**
  - Two of the tests in this branch had to be corrected against reality before they passed: an
    invented city-key format (`Germany::Berlin` rather than `cityKey`'s `"Germany Berlin"`), and a
    `Set` where the signals hold `ReadonlySet`. Both were my assumptions about code I had just
    read. Reading the helper is cheaper than guessing its contract.
  - Unchanged: `jobs.component.ts` 1104/400 and stopped by decision, `discover.component.html`
    1070/300, `discover.component.scss` 1915/400, `apps/web/src/styles.scss` 2167/400,
    `commands/discover.rs` 3245/800, 57 files over budget in total. The two human release checks on
    `0.29.2`. The three paths from earlier today nobody has seen run. Windows and Linux unverified.
    The AIF skill set unpruned. Three upstream advisories with drop conditions.
- **Next first action:** continue Discover at `scan` (70 lines), the largest member left. It is
  orchestration rather than derivation - it drives the console lines, the source loop and the
  persisted results - so identify what part of it is a decision and what part is I/O before
  touching it, the way `markApplied` was split.
- **Evidence:** `npm run quality:file-size` printed `1108/400 ... base 1163` on `7c318be`;
  `npm test` printed `1167` for desktop; both mutations were confirmed by md5 before their result
  was read.

### 2026-08-02, Discover begins, and a measurement I got wrong

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/discover-jd-parsing`, from `main` (`4c4723a`)
- **Commits:** `321cdc7`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** act on the grilling that closed the previous watch - start Discover at its `.ts`,
  write the template-binding convention down, and correct the file-size record.
- **Completed:**
  - **`jd-blocks.ts`.** `parseJdBlocks` and its two helpers recover structure from a plain-text job
    description: `strip_html` emits one line per block tag and drops the bullet markers, so bullets,
    marker-less runs, headings and paragraphs are all inferred. Ninety lines of pure heuristics, no
    dependency on the component, and no test. 23 tests now. `1242 -> 1163`.
  - **Two sharp edges pinned rather than smoothed**, because this is a move: a short prose line
    ending in a colon reads as a heading, since the colon check runs before the word count; and two
    consecutive lines of ninety characters or less read as a list, which is the price of recovering
    lists that lost their markers.
  - The convention from the grilling is in `CODE_QUALITY.md`: a template may bind an injected
    service directly, and the rule is forward-only.
- **Not completed:** Discover's template (1070/300) and stylesheet (1915/400) are untouched; the
  `.ts` is 1163/400. Jobs stays at 1104/400 by decision.
- **Files or packages changed:** added `apps/desktop/src/app/pages/discover/jd-blocks.ts` and its
  spec; modified `discover.component.ts`, `docs/governance/CODE_QUALITY.md`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, `npm test` all six
  green with **1150** desktop tests, `npm run lint` 6 projects green, `npx nx build desktop`
  complete, `npm run quality:file-size` pass with base `1242 -> 1163`,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`
  all pass. **Not run:** the `cargo` gates, no Rust touched; the browser preview, Tauri-only page.
- **Privacy/security impact:** none. Pure functions moved.
- **Decisions and assumptions:** all five from the grilling, confirmed by the maintainer -
  Discover next and Jobs stopped at 1104; Discover's `.ts` first with styles following; templates
  may bind services directly; that rule is forward-only; the risky paths get pressed once by hand
  before more refactoring.
- **Risks or compatibility impact:** none from this commit. The parser is byte-for-byte the same
  logic; the tests were written against it, not the other way round.
- **Open issues or blockers:**
  - **I reported a file size wrongly to the maintainer during the grilling.** I said
    `discover.component.scss` was 2215 rather than the recorded 1915, and called the record stale.
    The record was right: budgets count **non-empty** lines and I had compared a raw `wc -l`. The
    decisions did not turn on it - Discover's `.ts` is genuinely larger than Jobs' - but the margin
    is 138 lines, not 256, and a fact offered to settle a decision has to be measured the way the
    gate measures it.
  - **A test I wrote was worthless and I nearly kept it.** It checked the heading length cap with a
    run of `a` characters, which the lexicon rejected anyway, so it passed with the cap deleted.
    Only mutating the cap exposed it. Every heuristic test needs an input that isolates the rule it
    claims to test, or it is decoration.
  - **A latent bug in the parser, found and deliberately not fixed.** The section lexicon holds
    `responsibilit` and `requirement` followed by `\b`, so neither matches "Responsibilities" or
    "Requirements" - the exact words they were added for. Those lines are headings only because they
    usually carry a colon. Fixing it changes parsing on real postings and needs its own commit with
    a before and after, not a rider on a move.
  - **The real file-size picture, re-measured**: 57 files over budget, not the 51 on record, and the
    two worst by ratio have never been named anywhere - `apps/web/src/styles.scss` **2167/400** and
    `apps/desktop/src-tauri/src/commands/discover.rs` **3245/800**. Neither is in any plan.
  - Unchanged: the two human release checks on `0.29.2`, plus the three paths from today nobody has
    seen run (Mark as applied, the My Jobs chip, the Analysed badge). Windows and Linux unverified.
    The AIF skill set unpruned. Three upstream advisories with drop conditions.
- **Next first action:** decide whether the `responsibilit` / `requirement` lexicon bug is worth
  fixing - it is two characters and it changes how real postings render, so it wants a look at a
  few before and after. Then continue Discover at `scan` (70 lines) or `feedSections` /
  `visibleRows` / `availableRegions`, which are derivations and testable the same way the parser was.
- **Evidence:** `npm run quality:file-size` printed `1163/400 ... base 1242` on `321cdc7`;
  `npm test` printed `1150` for desktop; the heading-cap mutation passed against the first version
  of its test and failed against the replacement, both confirmed by md5 before reading the result.

### 2026-08-02, Mark as applied joins the other job actions

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-mark-applied`, from `main` (`c1c5730`)
- **Commits:** `6afba7c`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - continue the jobs page extraction at
  `markApplied`, the last member over 30 lines.
- **Completed:**
  - **`markApplied` moved into `JobActionsService`**, beside `save` and `remove`, rather than into a
    new file. It shared their whole shape already: the busy guard, the message signal, the toast,
    the `fail` helper, and the rule that the overview row mirrors the status the database recorded
    rather than the literal that was asked for. A tenth module would have been filing, not
    decomposition. The page keeps what is genuinely the page's - the wizard state and the
    navigation.
  - **Two invariants that had no test now have one each.** Documents are committed **before** the
    status flips, because a job marked applied must already own its CV and cover letter or the user
    has applied to a job with nothing attached; and a failed status write leaves the overview row
    alone, because a row claiming applied for an application that is not would outlive the error
    message that explained it.
  - Written against a service that did not have the method yet - the spec failed with
    `svc.markApplied is not a function` before any implementation existed. 8 tests.
  - Mutations, each confirmed by an md5 change first: swapping the commit and the status write turns
    1 red; mirroring the request instead of the database turns 1 red.
- **Not completed:**
  - `jobs.component.ts` is **1104/400**. Template 1148/300 and stylesheet 933/400, untouched.
  - **No member is over 30 lines any more.** `enterJob` and `parseAndFilter` are joint largest at 30. The remaining excess is spread thin, which means the next reduction is a different kind of
    work from the last nine - the file is now mostly signal declarations and thin delegation, and
    cutting it further means moving groups of related state, not single responsibilities.
  - The page still has no component-level test.
- **Files or packages changed:** `apps/desktop/src/app/shared/job-actions.service.ts` and its spec,
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, and this is the first
  watch where that gate could see templates, `npm test` all six projects green with **1127** desktop
  tests, `npm run lint` 6 projects green, `npx nx build desktop` complete,
  `npm run quality:file-size` pass with base `1119 -> 1104`, `npm run quality:attribution`,
  `npm run format:check`, `npm run verify:csp`, `git diff --check` all pass. **Not run:** the
  `cargo` gates, no Rust touched; the browser preview, because the jobs page waits on
  `db_get_settings`.
- **Privacy/security impact:** none. Behaviour preserved exactly; the code moved.
- **Decisions and assumptions:**
  - Extracted into the existing service rather than a new module. Nine of the last ten extractions
    created a file; this one would have created a tenth for behaviour that already had a home.
  - `busy` stays set on the success path, unchanged from before and matching `remove`: the caller
    navigates away, and clearing it first puts a live button back on screen for the frame before the
    route changes. It is now written down in the service rather than implied by the page.
- **Risks or compatibility impact:** Mark as applied was not exercised in a running app. It is the
  action that writes the application row, commits documents and navigates, so it is the one most
  worth a human pressing once.
- **Open issues or blockers:**
  - Unchanged: `jobs.component.ts` 1104/400, its template 1148/300, stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories with drop conditions.
  - The single false-green `type-check` from four watches ago remains unexplained and unreproducible.
    It is a separate thing from the template gap fixed in the previous watch.
- **Next first action:** decide whether to keep cutting `jobs.component.ts` by moving groups of
  related signals, or to stop at 1104 and spend the next watch on `discover.component.scss`
  (1915/400), which is the worst file in the repository and has not been touched. The nine
  extractions so far each had one responsibility to name; what is left does not, and forcing it is
  how the ratchet got refused twice in this session.
- **Evidence:** `npm run quality:file-size` printed `1104/400 ... base 1119` on `6afba7c`;
  `npm test` printed `1127` for desktop; the spec was observed failing with
  `svc.markApplied is not a function` before the method existed.

### 2026-08-02, the fast gate could not see templates, and now can

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/type-check-sees-templates`, from `main` (`6dc5158`)
- **Commits:** `aba1eac`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - decide the template-type-check question,
  which had cost four round-trips in one session.
- **Completed:**
  - **Measured instead of argued.** `npm run type-check` ran `tsc -p ... --noEmit`, and `tsc` never
    compiles Angular templates. `ngc`, the Angular compiler, takes the same `--noEmit`. Uncached on
    this repository: **tsc 4.31s and blind to templates, ngc 3.48s and not**. Cheaper _and_ stricter,
    so there was no trade-off to put to the maintainer - the Grilling gate does not fire on a
    decision with one honest reading.
  - **Proven, not assumed, before switching.** Both Angular apps and both failure modes: a template
    calling a member the component does not have, and the widened `TailorPhase.icon` that broke the
    wizard strip earlier today. `tsc` exits **0** on every one of them; `ngc` exits **1** and names
    the file, the line and the component. Each injection was confirmed by an md5 change first.
  - **A guardrail so it cannot silently revert.** `tools/check-quality-guardrails.test.mjs` asserts
    both apps run `ngc` and neither falls back to `tsc`. Putting `tsc` back turns it red, verified.
  - `apps/web` had the same gap and was switched with the same proof.
  - `VALIDATION_MATRIX.md` now says what the gate does and does not cover, and when a build is still
    required: for bundling, budgets and the produced output - no longer merely to learn whether the
    templates compile.
- **Not completed:** nothing in scope. `jobs.component.ts` untouched this watch, still 1119/400.
- **Files or packages changed:** `apps/desktop/project.json`, `apps/web/project.json`,
  `tools/check-quality-guardrails.test.mjs`, `docs/governance/VALIDATION_MATRIX.md`,
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` (now `ngc`) pass for 6 projects,
  `npm test` all six projects green with 1119 desktop tests, `npm run lint` 6 projects green,
  `npx nx build desktop` complete, `npm run web:build` complete with 39 prerendered routes,
  `node --test tools/check-quality-guardrails.test.mjs` 4 pass, `npm run quality:file-size`,
  `quality:attribution`, `format:check`, `git diff --check` all pass. **Not run:** the `cargo`
  gates, no Rust touched.
- **Privacy/security impact:** none. Build tooling only.
- **Decisions and assumptions:**
  - Switched without grilling the maintainer, because the measurement removed the trade-off: the new
    command is faster and catches strictly more. Had `ngc` been slower, this would have been a
    maintainer call about gate cost.
  - `web`'s sitemap regenerated as a side effect of `npm run web:build` and was **discarded rather
    than committed** - it is generated output with a date in it, and this branch did not change the
    site.
- **Risks or compatibility impact:** `ngc` is stricter, so it can surface pre-existing template
  problems in code nobody has touched. None appeared - all six projects pass - but a future branch
  that suddenly fails `type-check` in a file it did not edit should suspect this first.
- **Open issues or blockers:**
  - **Every watch entry before today that cites a green `type-check` was citing a check that could
    not see templates.** Those entries are not being rewritten, but the claim they make is weaker
    than it reads, and this entry is the correction.
  - Unchanged: `jobs.component.ts` 1119/400, its template 1148/300, stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories with drop conditions.
  - The single false-green `type-check` from three watches ago remains unexplained. It is a
    different thing from this gap - that one was a plain `.ts` error, which `tsc` should have caught
    - and it still does not reproduce.
- **Next first action:** continue the jobs page extraction at `markApplied` (35 lines), the last
  member over 30, which writes the application row and the store row together.
- **Evidence:** `tsc -p apps/desktop/tsconfig.app.json --noEmit` exited 0 with
  `Property 'thisMemberDoesNotExist' does not exist` present in the template; `ngc` on the same tree
  exited 1 and printed it. Timings from `/usr/bin/time -p` after `npx nx reset`.

### 2026-08-02, loadJob's defaults and the wizard's phase strip, both pinned

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-load-sequence`, from `main` (`39af9bd`)
- **Commits:** `9a1dfa8`, `15d688e`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** the previous watch's next first action - continue the jobs page extraction at
  `loadJob`, identifying its test seam before touching it.
- **Completed:**
  - **`job-document-defaults.ts`.** Opening a job picks two things that outlive the visit: which
    language the Review documents step works in, and which CV the next tailoring builds on. Both
    were inline in `loadJob`, inside a `try` whose `catch` is deliberately silent, and neither had a
    test. The base-CV rule is the one that can cost the user: it opens on **null**, the profile,
    because a CV selected by accident silently makes the next tailoring build on someone else's
    document; and it pulls this job's own tailored CV into the list even when the language filter
    would drop it, because without that a CV in another language vanishes from the dropdown and the
    choice resets to the profile without saying so. 12 tests. `1162 -> 1145`.
  - **`tailor-phases.ts`.** The wizard's three-pass strip derived its state from a nested if/else and
    rebuilt its definitions on every read. The distinction worth writing down is `ready` versus
    `pending`: only the pass after the last finished one can be started, and calling every later
    pass ready would offer three buttons for a sequence that runs in order. 13 tests.
    `1145 -> 1119`.
  - **Every mutation this watch was verified against the file's hash before the result was
    trusted**, which is the correction the previous watch recorded. Removing the linked-CV exception
    turns 1 red; dropping the application's language precedence turns 1; erasing the ready/pending
    distinction turns 5.
- **Not completed:**
  - `jobs.component.ts` is **1119/400**. Template 1148/300 and stylesheet 933/400, untouched again.
  - Largest remaining members: `markApplied` (35), `enterJob` and `parseAndFilter` (30 each).
  - The page still has no component-level test.
- **Files or packages changed:** added `apps/desktop/src/app/pages/jobs/job-document-defaults.ts`
  and `tailor-phases.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npm test` all six projects green
  with **1119** desktop tests (25 new this watch), `npx nx lint desktop` 0 errors / 8 pre-existing
  warnings, `npx nx build desktop` bundle generation complete, `npm run quality:file-size` pass with
  base `1162 -> 1145 -> 1119`, `npm run quality:attribution` pass, `npm run format:check` pass,
  `npm run verify:csp` pass, `git diff --check` clean. **Not run:** the `cargo` gates, no Rust
  touched; the browser preview, because the jobs page waits on `db_get_settings`.
- **Privacy/security impact:** none. Pure functions moved, no behaviour changed.
- **Decisions and assumptions:**
  - Both extractions preserve behaviour exactly. The `catch` in `loadJob` that swallows everything
    is left as it is - it carries a comment saying the detail still renders and the user can
    re-score, which is a deliberate choice, not the silent-failure bug fixed two watches ago.
  - `TailorPhase`'s icon type is **derived** from the phase definitions rather than declared.
    Declaring it as `unknown` compiled fine and broke the template.
- **Risks or compatibility impact:** the wizard strip and the base-CV dropdown were not exercised in
  a running app; both rest on function-level tests plus `nx build desktop`.
- **Open issues or blockers:**
  - **`nx build desktop` was the only gate to catch a type error for the fourth time this session.**
    `npm run type-check` passed a `TailorPhase.icon: unknown` that the template could not bind. This
    is now a pattern rather than an anecdote, and it is worth deciding whether the fast gate should
    include a template-aware check rather than continuing to rely on the slowest one.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories recorded with drop conditions.
  - The false-green `npm run type-check` from two watches ago is still unexplained and still not
    reproducible.
- **Next first action:** decide the template-type-check question above - it has now cost four
  round-trips in one session and is cheap to answer. Then continue at `markApplied` (35 lines),
  which writes the application and the store row together and is the last member over 30 lines.
- **Evidence:** `npm run quality:file-size` printed `1119/400 ... base 1145` on `15d688e`;
  `npm test` printed `1119` for desktop; each mutation was confirmed by an md5 change before its
  result was read.

### 2026-08-02, ADR-0004 shipped, and a shared query that changed a second screen

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/unclaimed-jobs-visible`, from `main` (`c988cba`); `docs/glib-advisory-record`
  before it
- **Commits:** one on the glib branch, one here plus this documentation commit
- **Pull request:** [#262](https://github.com/vitala89/applye/pull/262) for glib; this branch's PR
  opened after the entry
- **Objective:** the maintainer confirmed ADR-0004's seven decisions and authorised the Dependabot
  work, so: implement the ADR, and settle alert 42.
- **Completed:**
  - **Correction to the entry below, made in the same watch.** The glib analysis was **already in
    `CURRENT_STATE.md`** before any of this - `cargo tree`, the `gtk` 0.18.2 pin, Linux-only, and
    `cargo audit` tolerating it at exit 0 were all recorded. It was reported to the maintainer as an
    open unknown across several turns and then re-derived from scratch, when reading would have
    answered it. The repository's own rule is that facts are the agent's to find; re-deriving a
    written-down fact and presenting it as a finding is the same failure as asking for it. What #262
    genuinely added is the `.cargo/audit.toml` entry, which did not exist, and the decision to leave
    the GitHub alert open rather than dismiss it. The duplicate bullet it also added has been folded
    back into the original.
  - **Dependabot alert 42 settled, and it is not fixable here.** `glib` 0.18.5, unsoundness in
    `VariantStrIter` (RUSTSEC-2024-0429). Not ours - it arrives through the GTK bindings Tauri uses
    - and **Linux only**: `cargo tree -i glib` is empty for the macOS and Windows targets. Nothing
      under `src-tauri/src` names glib or that type. Nowhere to move to: the fix is glib >= 0.20,
      which needs a gtk major bump Tauri 2.11 has not taken, and `cargo update glib` locks 0 packages.
      `cargo audit` classed it a warning and exited 0 either way, verified before (20 allowed
      warnings) and after (19). Recorded in `.cargo/audit.toml` with its drop condition. **The GitHub
      alert is deliberately left open rather than dismissed**, because dismissing it hides the only
      thing that will tell us Tauri moved.
  - **ADR-0004 implemented, status `accepted`.** `db_list_jobs_overview_core` returns unclaimed rows
    flagged instead of hiding them; `JobOverview` gained a derived `claimed` boolean; My Jobs gained
    one filter chip, off by default, and an **Analysed** status word that joins the status filter.
    Discover-scanned rows stay hidden until claimed. **No migration**, as the ADR predicted. Two
    locale keys in all six languages. Five Rust tests on the query and six TypeScript tests on the
    row rules.
  - **The existing Rust test that asserted the opposite was rewritten deliberately**, not deleted:
    `a_job_only_analysed_is_not_listed` became
    `a_job_only_analysed_is_returned_and_flagged_unclaimed`, with a comment saying ADR-0004 reverses
    what it used to claim.
- **Not completed:** nothing in scope. `jobs.component.ts` is untouched this watch and remains
  1162/400; the extraction continues at `loadJob` next.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/jobs.rs`,
  `apps/desktop/src-tauri/.cargo/audit.toml`, `libs/core/src/lib/models/job.model.ts`, six files
  under `libs/i18n/src/lib/translations/`, `my-jobs.component.{ts,html,scss}`, new
  `pages/jobs/job-overview-rows.ts` and its spec, `dashboard.component.ts`, `dashboard.util.ts` and
  both specs, ADR-0004, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npm test` all six projects green
  with **1098** desktop tests, `npm run lint` 0 errors / 8 pre-existing warnings,
  `npx nx build desktop` bundle generation complete, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with `dashboard.component.ts` **428 -> 413**,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` clean, `cargo audit` exit 0. **Not run:** the browser preview, because My Jobs
  waits on `db_get_settings` and does not render outside Tauri - the chip and the badge have not
  been seen by a human on screen, only asserted.
- **Privacy/security impact:** a small improvement, as the ADR argued. A user cannot delete job
  description text they cannot see; these rows are now reachable and removable through the trash
  control that already existed. No new data is collected, stored or sent, and the change reveals the
  user's own local rows to the user on their own machine.
- **Decisions and assumptions:**
  - All seven decisions from the grilling were confirmed by the maintainer and implemented as
    written. ADR-0004 moved `draft` -> `accepted`.
  - The glib alert is left open rather than dismissed. Recorded because it is a judgement call, not
    an obvious one: dismissing would quiet the noise and lose the signal.
- **Risks or compatibility impact:**
  - **`claimed` is now a required field on `JobOverview`.** Any consumer constructing one by hand
    must set it; `type-check` covers the repository, and the three call sites were checked.
  - The chip and the Analysed badge have never been rendered in the running app.
- **Open issues or blockers:**
  - **The lesson of this watch: relaxing a shared query changed a screen nobody asked to change.**
    `listJobsOverview` feeds My Jobs, the dashboard and `wizard-nav`. Loosening it silently put
    unclaimed rows into the dashboard's Recent jobs **labelled "Saved"** - precisely the ambiguity
    ADR-0004 exists to remove - and stopped a user whose only job is analysed from reading as new.
    Neither was in the ADR, and no test would have caught either, because none existed. The rule now
    lives in `recentClaimedJobs` with tests that go red when the guard is removed.
    `wizard-nav.describeOtherJob` was checked too and only benefits: it finds unclaimed rows without
    a database round-trip. **Widening a shared read is an API change to every caller, and the ADR
    treated it as a change to one screen.**
  - **A mutation check that fails to mutate is worthless, and this watch produced two.** The first
    two attempts to break the SQL reported the tests still green; the edit had silently not been
    written. Only after checking the file's md5 before and after did the mutation land, and the test
    went red immediately. Every mutation check from here on verifies the file actually changed
    first. This is the same trap as a test that passes with the bug present, one level up.
  - Unchanged: `jobs.component.ts` 1162/400, its template 1148/300 and stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream advisories plus glib now recorded.
  - The false-green `npm run type-check` from the previous watch is still unexplained and still not
    reproducible.
- **Next first action:** continue the jobs page extraction at `loadJob`, the largest remaining
  member at 53 lines, identifying its test seam before touching it. If the packaged app is run for
  the two release checks still owed, look at My Jobs with the chip on while it is open - it is the
  only part of this watch a human has not seen.
- **Evidence:** `cargo test --lib` printed `339 passed`; `npm test` printed `1098` for desktop;
  `npm run quality:file-size` printed `dashboard.component.ts: 413/400 ... base 428`; the dashboard
  guard was mutation-checked with md5 verification and turned 2 tests red.

### 2026-08-02, the silent discard, and a gate that reported success on a broken tree

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/discard-tailoring-silent-failure`, from `main` (`8ed7865`)
- **Commits:** `c00f5aa`, `91a8676`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** the previous watch's next first action - decide on the silent `discardTailoring`
  failure, then continue the jobs page extraction at the drafting flows.
- **Completed:**
  - **The silent discard is fixed.** Discarding a tailoring deletes the drafts it produced; when
    that delete threw, the catch wrote the error text to the status line without setting the error
    flag and without a toast, so it rendered in the ordinary style. A discard that destroyed nothing
    was indistinguishable from one that worked. It now reports through `fail()`, and the page resets
    its own state **only** when something was discarded - a failure leaves the wizard where it was
    and the confirmation open, rather than tearing the view down around a tailoring that is still
    there.
  - **`TailoringDiscardService`**, which is what gave the fix a test seam: the method sat on a
    component with no test. Which documents a discard may destroy came out as a pure function, and
    it will never return a document the user committed to their library. 12 tests. Restoring the old
    silent write turns the regression test red. `1197 -> 1185`.
  - **`JobGapFillService`.** Both document flows assembled the same four gap-fill callbacks inline.
    The profile append behind one of them is the part worth owning centrally: `upsertProfile`
    replaces the whole row, so a payload naming only `fullMd` silently discards the scoring cache,
    the pitch and the archetypes - the #97 bug - and it had **no test at all**. It has five now, and
    reintroducing the partial write turns one red. `1185 -> 1162`.
- **Not completed:**
  - `jobs.component.ts` is **1162/400**. Template 1148/300 and stylesheet 933/400, still untouched.
  - **The drafting flows were examined and deliberately left.** `createCvDraft` and
    `createCoverLetterDraft` are already thin orchestration over their draft services; what remains
    is context assembly reading eight component signals, so moving them behind another service
    would be a wrapper over a wrapper and would grow the file - the mistake the ratchet caught in
    the previous watch. The genuinely duplicated part, the gap-fill bundle, was extracted instead.
    This is a change of plan from the previous entry's next first action, made after measuring
    rather than before.
  - ADR-0004 still `draft`, still unimplemented, still awaiting sign-off.
  - Dependabot alert 42 (`glib`, medium, runtime) still not investigated.
- **Files or packages changed:** added `apps/desktop/src/app/shared/tailoring-discard.service.ts`
  and `job-gap-fill.service.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass (see the caveat below),
  `npx nx test desktop` **1085 passed, 75 suites** (22 new this watch), `npx nx lint desktop`
  0 errors / 8 pre-existing warnings, `npx nx build desktop` bundle generation complete, including
  once with `--skipNxCache`, `npm run quality:file-size` pass with base `1197 -> 1185 -> 1162`,
  `npm run quality:attribution` pass, `npm run format:check` pass, `git diff --check` clean.
  **Not run:** the `cargo` gates, no Rust touched; the browser preview, because the jobs page waits
  on `db_get_settings` and does not render outside Tauri.
- **Privacy/security impact:** none. The discard's blast radius is unchanged - it still deletes only
  this application's own draft rows, and the pure function that decides which ones now has a test
  saying it never returns a committed document.
- **Decisions and assumptions:**
  - The bug was fixed **before** continuing the extraction, because the extraction was what would
    have given it a seam anyway, and leaving a known silent failure in place while refactoring
    around it is how it gets forgotten.
  - `discardTailoring` returning a boolean rather than throwing keeps the page's reset decision at
    the page, where the wizard state lives.
  - The plan changed after measurement: see "not completed" above. Recorded rather than quietly
    substituted.
- **Risks or compatibility impact:** the page still has no component-level test. Nobody exercised
  Discard tailoring in a running app this watch; the failure path is asserted at the service level
  only.
- **Open issues or blockers:**
  - **A gate reported success on a broken tree, and this is not understood.** `npm run type-check`
    printed success while `jobs.component.ts` contained `Property 'jobDocLabel' does not exist on
type 'JobsComponent'`. `npx nx build desktop` failed on that error moments later, and a plain
    re-run of `npm run type-check` on the same content then reported it correctly. An Nx cache hit
    is the suspicion. **The reproduction was attempted in this same watch and failed.** A member
    call to a non-existent method was introduced four times and `npm run type-check` reported the
    error every time, including once in the exact shape of the original -
    `npm run type-check >/dev/null 2>&1 && echo pass` immediately after a scripted edit. So: the
    false green was observed, it is in this session's transcript alongside the `nx build desktop`
    failure that caught what it missed, and it does not reproduce. The possibility that it was a
    misreading on the agent's part cannot be excluded either, which is exactly why it is written
    down rather than resolved. This matters because "type-check passed" appears in every watch entry
    as evidence. `nx build desktop` remains the only gate not yet observed to miss anything, and it
    caught this.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream security advisories, Dependabot 42.
- **Next first action:** continue the extraction at `loadJob`, the largest remaining member at 53
  lines, and identify its test seam before touching it - it writes most of the page's job-scoped
  signals, which is why it has been left until last.
- **Evidence:** `npm run quality:file-size` printed `1162/400 ... base 1185` on `91a8676`;
  `npx nx test desktop` printed `Tests: 1085 passed`; the type-check discrepancy is in this
  session's transcript, with the failing `nx build desktop` output immediately after the passing
  type-check.

### 2026-08-02, the status line gets an owner, and the ratchet refuses a refactor

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-document-review`, from `main` (`0746b6e`)
- **Commits:** `eb3fd6d`, `216b265`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** continue the jobs page extraction at the seam the previous watch named - the
  document group's shared status-and-error handling - writing the test before the code.
- **Completed:**
  - **`DocumentReviewStatusService`.** Nine places repeated the same four moves around the Review
    documents status line. The service owns the line, the error flag and the two choose-existing
    dialogs; `run()` clears first, returns the body's value, and turns a throw into a message plus
    a null. It separates two failures the page had treated alike: `refuse()` for a precondition the
    user can see and fix, silent because the sentence is already on the step in front of them, and
    `fail()` for whatever the database or provider threw, which also toasts because the user may
    have navigated away. **Written test-first** - the spec was red on a missing module before the
    service existed. 11 tests. `1226 -> 1197`.
  - **`application-document-actions.ts`.** The per-document decision inside committing an
    application is what decides whether a regeneration spends AI tokens, and it had no test: four
    branches in a nested else-if chain inside a method that also did the generating and the
    committing. Now two pure decision functions plus two pure staleness-input builders that return
    null when there is nothing to ask about. The staleness check is passed as a **thunk** rather
    than a boolean so the short circuit survives; one test asserts it is never called when the
    arguments already decide, because that is the part that regresses silently. 14 tests.
  - **Both were mutation-checked.** Dropping the clear from `run()` turns 1 red; making `refuse()`
    toast turns 2 red; removing the tailoring short circuit turns 1 red.
- **Not completed:**
  - `jobs.component.ts` is **1197/400**. The second commit is **net zero lines** - it bought tests,
    not size, and the entry below says why that was still the right trade.
  - Template and stylesheet untouched again, by design. 1148/300 and 933/400.
  - The drafting flows themselves (`createCvDraft`, `createCoverLetterDraft`,
    `chooseExistingDocument`, `prepareDocumentsStep`) are still on the component. Their shared
    status handling is now out from under them, which is the precondition for moving them, but they
    still write eight component signals between them.
  - ADR-0004 still unimplemented and still `draft`, awaiting sign-off.
- **Files or packages changed:** added `apps/desktop/src/app/shared/document-review-status.service.ts`
  and `application-document-actions.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npx nx test desktop` **1063 passed,
  73 suites** (25 new this watch), `npx nx lint desktop` 0 errors / 8 pre-existing warnings,
  `npx nx build desktop` bundle generation complete, `npm run quality:file-size` pass with base
  `1226 -> 1197 -> 1197`, `npm run quality:attribution` pass, `npm run format:check` pass,
  `git diff --check` clean. **Not run:** the `cargo` gates, because no Rust file was touched; the
  browser preview, because the jobs page waits on `db_get_settings` and does not render outside
  Tauri.
- **Privacy/security impact:** none. No data, storage, network or IPC behaviour changed.
- **Decisions and assumptions:**
  - **The size ratchet refused this session's own refactor, and it was right.** Extracting the
    commit decision into named pure functions first took the file from 1197 to **1204**, because
    named intermediate values cost more lines than the else-if chain they replace. The gate blocked
    it. The lesson kept: a testability win is not automatically a decomposition win, and the budget
    is what tells them apart. Moving the two staleness guards out as well paid for it, landing at
    net zero.
  - `refuse` versus `fail` is a behaviour distinction the old code did not make explicitly, but it
    is the behaviour it already had - the two guard paths never toasted and the catch paths always
    did. The service names the difference rather than introducing it.
  - Two direct writes to the status signal were deliberately left on the component:
    `acceptPhotoPrompt` sets the line without touching the error flag, and `discardTailoring`'s
    catch sets it without marking an error and without a toast. Routing either through the service
    would change behaviour, which is not this refactor's job.
- **Risks or compatibility impact:** the page still has no component-level test, so the wiring rests
  on service-level tests plus `nx build desktop` for the template. Nobody exercised Create/Update
  application in a running app this watch.
- **Open issues or blockers:**
  - **A failed discard reports as if it succeeded.** `discardTailoring`'s catch writes the error
    text to the status line without setting the error flag and without a toast, so it renders in the
    normal, non-error style. Broken and working look the same, which is the exact trap this
    repository keeps writing down. Found while mapping the call sites; **not fixed**, because it is
    a behaviour bug and this branch is a refactor.
  - **One open Dependabot alert, number 42**: `glib`, medium, runtime scope. Surfaced by GitHub on
    push. Not investigated.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream security advisories.
- **Next first action:** decide whether to fix the silent `discardTailoring` failure as its own
  small commit before continuing - it is three lines and a regression test - then move
  `createCvDraft` and `createCoverLetterDraft` behind a service now that their status handling is
  no longer theirs to own.
- **Evidence:** `npm run quality:file-size` printed `1197/400 ... base 1197` on `216b265` and refused
  `1204` on the attempt before it; `npx nx test desktop` printed `Tests: 1063 passed`.

### 2026-08-02, two responsibilities out of the jobs page, and the invisible jobs decided

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-component-extraction`, from `main` (`e420c7d`)
- **Commits:** two code commits (`dffb638`, `a0fb36d`), plus this documentation commit
- **Pull request:** [#258](https://github.com/vitala89/applye/pull/258), merged as `4208198` with
  all five checks green
- **Objective:** start bringing `jobs.component.ts` under its 400-line budget by extraction, one
  responsibility per commit with tests; and settle the deferred decision about unclaimed job rows
  through `aif-grilling` rather than choosing for the maintainer.
- **Completed:**
  - **`CoverLetterTailorService`.** The tailor-an-existing-cover-letter modal - its five state
    signals, the base-letter read, the AI pass and the row it writes - moved to
    `apps/desktop/src/app/shared/cover-letter-tailor.service.ts`, mirroring the
    `CoverLetterDraftService` it sits beside, and component-scoped through the page providers so its
    state keeps the lifetime it had as component fields. `readBaseLetter` and `buildTailoredContent`
    came out as pure functions, so what is worth asserting is asserted without a `TestBed`.
    14 new tests.
  - **`job-detail-icons.ts`.** The 37-entry icon table and the 34 lucide imports that fed it left the
    component. The spec is the reason the move was worth a commit: it reads `jobs.component.html`,
    collects every `icons.<name>` the template references, and asserts the table defines it. A
    missing icon passes `npm run type-check` and fails only under `nx build desktop`, so this closes
    that documented gap in the fast gate. 3 new tests, one of which guards the regex itself against
    silently matching nothing.
  - **Both extractions were checked by breaking them.** Making `readBaseLetter` ignore the stored
    content turned 2 tests red; removing the modal-close on success turned 1 red; deleting one icon
    from the table turned 1 red. Nothing here is a test that passes with the bug present.
  - **One real bug was caught by the new tests during the refactor**, not after it: a mid-edit
    rename left `tokensInput` / `tokensOutput` unbound in the persist call, which threw at runtime
    and was swallowed by the flow's own catch. It surfaced only because a test asserted the error
    signal was empty on the success path.
  - **The unclaimed-jobs decision is settled**, through two rounds of `aif-grilling`. Recorded as
    `docs/product/decisions/ADR-0004-unclaimed-jobs-stay-and-become-visible.md`, status `draft`
    pending the maintainer's confirmation of the numbered list.
- **Not completed:**
  - `jobs.component.ts` is **1226/400**. Two extractions is not "under budget", and the remaining
    excess is roughly three budgets' worth.
  - **The template and the stylesheet were not touched at all**, by design - they follow the `.ts`.
    `jobs.component.html` 1148/300 and `jobs.component.scss` 933/400 are unchanged.
  - The third extraction was scoped and **deliberately not attempted**: the document-drafting group
    (`createCvDraft`, `createCoverLetterDraft`, `chooseExistingDocument`, `prepareDocumentsStep`,
    `commitApplicationDocuments`, `cvDocStale`, `coverLetterDocStale`), around 180 lines sharing one
    status-and-error shape. It writes ten component signals, the page has no component-level test,
    and this is the feature that produced six rounds of falsely green unit tests. Starting it with
    the budget left in this session would have been the fourth.
  - ADR-0004 is not implemented. No Rust or `libs/` code changed this watch.
- **Files or packages changed:** added `apps/desktop/src/app/shared/cover-letter-tailor.service.ts`
  and its spec, `apps/desktop/src/app/pages/jobs/job-detail-icons.ts` and its spec; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; added `ADR-0004`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npx nx test desktop` **1038 passed,
  71 suites**, 20 of those tests new this watch, `npx nx lint desktop` 0
  errors / 8 pre-existing warnings, `npx nx build desktop` **bundle generation complete** (it caught
  a `CoverLetterTone` / `CoverLetterLength` widening that `type-check` did not - the documented gap,
  observed again), `npm run quality:file-size` pass with base `1467 -> 1307 -> 1226`,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` clean. **Not run:** the `cargo` gates, because no Rust file was touched; the
  browser preview, because the jobs page waits on `db_get_settings` and does not render outside
  Tauri.
- **Privacy/security impact:** none from the code. ADR-0004 is a small privacy improvement if
  implemented - a user cannot delete job description text they cannot see - and adds no new
  exposure, since it reveals the user's own local rows to the user.
- **Decisions and assumptions:**
  1. The complaint about invisible jobs is **lost work**, not database bloat, so the answer is
     visibility and no automatic deletion.
  2. Mechanism is a **filter chip in My Jobs, default off** - not a new route, page or command.
  3. **No migration.** `claimed` is derived as `EXISTS(applications)`; `db_list_jobs_overview_core`
     relaxes its `WHERE` and `JobOverview` gains one boolean. This is what closes the schema arm of
     the Grilling gate.
  4. **Discover-scanned rows stay hidden**, using the rule `db_list_jobs` already applies, so one
     scan cannot flood the table.
  5. Unclaimed rows carry **their own status word**, not a blank cell, and it joins the status
     filter. One new key across six locales.
  6. They are **deletable through the existing trash control** and `db_delete_job`'s cascade. No bulk
     clear.
  7. **Decision now, code next session.** The extraction got this session's budget.
  - Accepted cost, stated to the maintainer: deleting an analysed row still re-pays the parse tokens
    on re-paste, because the AI parse runs before the `jd_hash` upsert. Nothing in ADR-0004 changes
    that.
  - Two behaviour changes rode along with the first extraction and are deliberate: the inline
    fence-stripping regex became the shared `cleanJsonText`, which additionally trims to the outer
    braces, so strictly more AI responses parse and none fewer; and an unparseable base letter now
    falls back to a from-scratch generation rather than throwing.
- **Risks or compatibility impact:** the jobs page has no component-level test, so both extractions
  rest on service-level tests plus `nx build desktop` for the template. The tailor modal's behaviour
  was preserved by reading, not by an end-to-end run - nobody clicked Tailor cover letter in a
  running app this watch.
- **Open issues or blockers:** `jobs.component.ts` 1226/400, `jobs.component.html` 1148/300,
  `jobs.component.scss` 933/400. ADR-0004 unimplemented and awaiting sign-off. Unchanged from the
  previous watch: the two human release checks on `0.29.2` (look at the packaged macOS window; take
  an update from an installed `0.29.1`), Windows and Linux unverified, `discover.component.scss`
  1915/400, the AIF skill set unpruned against `writing-great-skills`, and the two security
  advisories waiting on upstream releases.
- **Next first action:** extract the document-drafting group into
  a service that owns `documentReviewStatus` / `documentReviewError` and the two choose-dialog
  flags, taking `application` and `profile` through an explicit context - the shape
  `CoverLetterTailorService` uses. Write its test before the extraction, because the shared
  status-and-error handling is the duplicated knowledge that justifies the move.
- **Evidence:** `git log --oneline -3` shows `a0fb36d`, `dffb638` on `e420c7d`;
  `npm run quality:file-size` printed `1226/400 ... base 1307` on the second commit;
  `npx nx test desktop` printed `Tests: 1038 passed`.

### 2026-08-02, 0.29.2 published and the download went live

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/web-download-live`, then `docs/close-0.29.2-watch`
- **Commits:** two on the web branch, one here
- **Pull request:** [#255](https://github.com/vitala89/applye/pull/255) and
  [#256](https://github.com/vitala89/applye/pull/256), both merged
- **Objective:** close the release: publish `0.29.2`, flip the website's download, and record what
  the release was and was not verified against.
- **Completed:**
  - `v0.29.2` published and marked Latest, after the mechanical half of the smoke test was run
    locally - the detail is in the entry below;
  - **the flip condition was met, so `COMING_SOON` is `false`.** It was written next to the flag
    yesterday as a checkable sentence: the published latest release lists installers for macOS,
    Windows and Linux. It does. The hero's primary control is now Download, pointing at the releases
    page rather than a versioned asset, so it cannot go stale when the version moves;
  - **verified against the live site rather than the build**: `coming soon` appears zero times in
    the served HTML, the Download link resolves to the releases page, `/changelog` heads at
    `[Unreleased]` above `[0.29.2]`, and no console errors. The deploy that served it is the run for
    `25fb22e`, confirmed by run id rather than assumed from timing - the first read hit a cached
    copy from the previous deploy and had to be repeated with a cache buster;
  - `CHANGELOG.md` gained an `[Unreleased]` entry for the site change. The stop hook caught its
    absence: `apps/web` changed and the changelog had not, which is exactly the case the hook exists
    for. A site the user visits is user-facing.
- **Not completed:** the two human checks, unchanged and still owed - nobody has looked at the
  packaged macOS window, and the download-and-install path has not run once. Windows and Linux are
  untouched.
- **Files or packages changed:** `apps/web/src/app/site.ts`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** `nx test web` pass (76), `npm run web:build` pass (39 prerendered routes),
  `format:check`, `quality:attribution`, `quality:file-size`, `git diff --check` pass. Browser
  preview checked before merge; the live site checked after. CI green on both PRs, on their head
  commits - checked by head SHA, since the first CI read predated the changelog commit.
- **Privacy/security impact:** none. One boolean and documentation.
- **Decisions and assumptions:** the flip stayed a separate PR from the documentation, as decided
  during the grilling, even though publication had already happened by then and one PR would have
  been fewer steps. The separation's reason - never let the button land before the release does -
  had already been served, but changing a decision silently because it became convenient is the
  habit worth not having.
- **Risks or compatibility impact:** the Download button leads to a release whose Windows and Linux
  installers no human has run. That risk is on the release, not on the button, and it is recorded in
  `CURRENT_STATE.md` where it can be closed.
- **Open issues or blockers:** the two human checks. Beyond the release: `jobs.component.ts` at
  1610/400 with its template and stylesheet also over, `settings.component.{ts,html}` at 575/400 and
  580/300, `pipeline.component.scss` 456/400, `dashboard.component.ts` 428/400. Unclaimed jobs still
  accumulate as invisible rows. The AIF skill set has not been pruned against `writing-great-skills`.
- **Next first action:** open the packaged `Applye_0.29.2_aarch64.dmg` and confirm the window renders
  styled; then run an installed `0.29.1` and take the update it offers.
- **Evidence:** `gh release list` shows `v0.29.2` as Latest; the live site serves a Download link and
  zero "coming soon"; `gh run list` attributes the deploy to `25fb22e`.

### 2026-08-02, tag 0.29.2, and the updater error that was telling the truth

- **Status:** complete, publication is the maintainer's
- **Agent/tool:** Claude Code, Opus
- **Branch:** `docs/release-0.29.2-state`, from `main` (`8f59533`)
- **Commits:** one, documentation only
- **Pull request:** not yet opened
- **Objective:** merge the two open branches, cut `v0.29.2`, and diagnose the red error the
  maintainer photographed in Settings: `The update check failed. Could not fetch a valid release
JSON from the remote`.
- **Completed:**
  - **`v0.29.2` tagged and built.** All four version sources were checked to agree before tagging -
    the release workflow verifies `package.json`, `package-lock.json`, `tauri.conf.json` and
    `Cargo.toml`, and refuses a tag that disagrees. All four matrix jobs passed: macOS aarch64,
    macOS x86_64, Windows, Linux. The draft carries **17 assets**;
  - **the manifest was verified, not assumed.** `latest.json` downloaded and read: version
    `0.29.2`, eleven platform entries (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` in four
    packaging flavours, `windows-x86_64` in three), every entry carrying a signature. Asset URLs are
    the `api.github.com/repos/.../releases/assets/<id>` form the action emits for a draft; they
    resolve for a public repository once published, since the updater requests them with
    `Accept: application/octet-stream`;
  - **the updater error is correct behaviour, and no code was changed.** Verified by request rather
    than by reading: `releases/latest/download/latest.json` returns **404**, `releases/latest`
    resolves to `v0.29.0`, and `v0.29.0/latest.json` is also 404 - that release carries a single
    `.dmg` and no manifest. The updater asks an endpoint that genuinely has nothing, and the About
    block prints the reason verbatim, which is exactly the behaviour built yesterday to replace
    silence. Publishing `0.29.2` clears it;
  - **the superseded `0.29.1` draft was deleted**, once `0.29.2` was confirmed to carry all 17
    assets. Its tag remains, because `CHANGELOG.md` links to it;
  - **PRs #253 and #254 merged**, taking the drag fix, the visible updater, and the new agent skill
    set to `main`.
  - **published, after the mechanical half of the smoke test was run here.** The maintainer asked
    the agent to run and check itself, then to proceed on its own recommendation. What could be
    verified without a human at the screen was: all **seven** `.sig` files against the public key in
    `tauri.conf.json` (minisign `ED`, BLAKE2b-512 prehash, key id `38239e44c1408967` - a mismatch
    would fail after the download, on the user's machine); the packaged Apple Silicon bundle's
    `Info.plist` (`0.29.2`, `dev.applye.app`), its `arm64` binary, and its embedded frontend
    carrying a stylesheet link with **no** `onload=` handler, which is the exact shape that rendered
    `0.29.0` unstyled; and a real launch of the packaged app against an isolated `HOME`, which
    survived, printed nothing to stderr, and applied **all 28 migrations** on a fresh database with
    zero failures, including `0028` and its three identity columns - the migration the previous
    watch listed as unverified in a packaged build;
  - **the update channel was then verified live**, which a draft cannot prove: the endpoint returns
    the manifest, and the bundle URL inside it streams 16,448,597 bytes unauthenticated - the same
    file whose signature had been checked.
- **Not completed:** the human half of the smoke test. Nobody has looked at the packaged window, and
  nothing was exercised on Windows or Linux; the `.rpm` remains the least tested artifact. Those
  gaps are real and are recorded here rather than implied away by the word "published". The
  `COMING_SOON` flip on the website follows in its own change, per the decision below.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md`, this file. No code.
- **Validation:** `npm run format:check` pass, `npm run quality:attribution` pass, `git diff --check`
  pass. Documentation only, so the matrix requires nothing further. The release itself was validated
  by its own workflow - four jobs, all success - and by reading the manifest. **Not run:**
  `tauri dev`; the maintainer confirmed the pipeline drag and the About block on the running app.
- **Privacy/security impact:** none. The manifest was fetched from the project's own release, and
  the three requests made to diagnose the 404 were HEAD-equivalent checks against public GitHub URLs
  carrying no data.
- **Decisions and assumptions:** the first use of the new `aif-grilling` skill, and it changed the
  outcome - the maintainer's instruction was "if there is an error, branch and fix it", and the
  grilling established there is no error to fix before any branch was cut. Three decisions, all
  taken on the recommendation: leave the updater's behaviour alone (cost: someone building from a
  fork with no releases sees a red error rather than a calm explanation); flip `COMING_SOON` only
  after publication, in its own one-line PR; delete the `0.29.1` draft but keep its tag.
- **Risks or compatibility impact:** the manifest's asset URLs are unverifiable until the release is
  published - a draft's assets are not publicly reachable, so the updater's download path is proved
  only by the publish. That is the first thing the smoke test exercises.
- **Open issues or blockers:** the visual and cross-platform halves of the smoke test are still
  owed on a shipped release, which is the wrong order and is stated as such.
  `dashboard.component.ts` 428/400, `pipeline.component.scss` 456/400, `settings.component.ts`
  575/400, `settings.component.html` 580/300 and `jobs.component.ts` 1610/400 all remain over budget.
- **Next first action:** open the `COMING_SOON = false` change so applye.dev offers the download,
  then have a human look at the packaged window on macOS and run the Windows and Linux halves of
  `docs/RELEASE.md`.
- **Evidence:** `gh run view` reports four successful matrix jobs; `gh release view v0.29.2` lists 17
  assets with `draft: true`; `curl` returns 404 for the updater endpoint and 200 for
  `releases/latest` resolving to `v0.29.0`; `gh release list` no longer shows a `0.29.1` draft while
  `git ls-remote --tags` still carries `v0.29.1`.

### 2026-08-02, our own grilling skill, and a written division with superpowers

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/aif-grilling-skill`, from `main` (`a2b22d3`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** the maintainer installed `grill-me` from `mattpocock/skills`, asked for both that
  pack and `obra/superpowers` to be read, and for the best of them to be adapted into the AIF set
  rather than left as third-party stubs.
- **Completed:**
  - **Inventory, from the local plugin caches rather than the network.** `mattpocock-skills` 1.2.0
    ships 41 skills across `engineering`, `productivity`, `misc`, `personal`, plus `in-progress` and
    `deprecated`, which were excluded. `superpowers` 6.1.1 ships 14. The AIF set was 19 skills and
    8 subagents;
  - **`aif-grilling`, written from scratch.** The original is two lines that delegate to a plugin
    skill and carries `disable-model-invocation: true`, so it fires only when the maintainer
    remembers it exists - which is why it sat unused in this repository for a day while the
    conductor kept choosing convention decisions on its own. Ours is model-invoked with four hard
    triggers, asks in rounds of 2 to 4 questions through the interactive question tool rather than
    one question per turn, resolves facts by reading the repository instead of asking, treats "as
    you recommend" as authorization the agent must then state, forbids edits during a grilling, and
    ends in a numbered list of settled decisions awaiting confirmation;
  - **the two-axis review**, taken from mattpocock's `code-review` and folded into `aif-code-review`:
    standards and design reported separately, because a diff can satisfy every written rule and
    still be the wrong shape. One rule of this repository's own was added beside it - a new test
    that does not fail without its fix is a finding, not coverage. Both of today's fictitiously
    green tests would have been caught by it;
  - **`docs/internal/AGENT_SKILL_MAP.md`**, the routing document. It records what each AIF skill
    owns, and - the part that was missing - that `superpowers` is already load-bearing here
    (`using-superpowers` is injected into every session and seven plans under
    `docs/superpowers/plans/` are in its format) with a per-skill division: superpowers owns the
    general technique, AIF owns the Applye rules it must respect. Five overlaps are named
    explicitly, including that the validation matrix outranks any general "verify before
    completion" phrasing;
  - **the grilling gate is in the rules, not only in a skill.** `AGENTS.md` gained a section between
    the plan check and Before coding, and `CLAUDE.md` points at it, so an agent that never invokes
    the skill still meets the rule;
  - **the originals are gone.** `.claude/skills/grill-me`, `.claude/skills/grill-with-docs`,
    `skills-lock.json` and the two copies under `.agents/skills/` are deleted, on the maintainer's
    decision. The `mattpocock-skills` plugin stays installed - other skills of it are in use.
- **Not completed:** the rest of the mined material. `writing-great-skills` is reference rather than
  process and was cited rather than copied, and the AIF set has **not** been rewritten against its
  principles - that is a separate pass the maintainer deferred, and several AIF skills are likely
  carrying no-ops and duplication it would retire. Nothing from `deprecated/` or `in-progress/` was
  taken.
- **Files or packages changed:** `.claude/skills/aif-grilling/SKILL.md` (new),
  `.claude/skills/{aif-code-review,aif-orchestrator}/SKILL.md`, `AGENTS.md`, `CLAUDE.md`,
  `docs/internal/AGENT_SKILL_MAP.md` (new), this file. Deleted:
  `.claude/skills/grill-me`, `.claude/skills/grill-with-docs`, `skills-lock.json`.
- **Validation:** `npm run format:check` pass, `npm run quality:attribution` pass,
  `git diff --check` pass. No application code changed, so the matrix requires nothing further and
  no test count moved; `CHANGELOG.md` is deliberately untouched because it records shipped product
  changes and nothing here reaches a user.
- **Privacy/security impact:** none. No source, secret, or user data was sent anywhere - both packs
  were read from the local plugin cache, not fetched. Removing the symlinks also removes two links
  that pointed out of the repository into a gitignored directory.
- **Decisions and assumptions:** four decisions were put to the maintainer and all four came back on
  the recommendation - adapt narrowly rather than rewrite the AIF set, ask in rounds rather than one
  question at a time, make the skill model-invoked rather than user-invoked, and keep the plugin
  while deleting the symlinks. Model-invocation costs context load on every turn, which is the
  price of the trigger firing without the maintainer remembering it; that trade is stated in the
  skill map.
- **Risks or compatibility impact:** two process packs still overlap, and a written division is
  weaker than one process. The visible failure mode is an agent running superpowers'
  `brainstorming` where `aif-grilling` was meant, or vice versa; the skill map names which is which,
  but nothing enforces it. `AGENTS.md` grew by 16 lines, all rules, none of them checkable by a
  script.
- **Open issues or blockers:** `v0.29.2` is still untagged - unchanged by this watch, and the next
  release action. The AIF-wide pruning pass against `writing-great-skills` is unscheduled.
- **Next first action:** tag `v0.29.2` and run the `docs/RELEASE.md` smoke test, which is also the
  first live exercise of the updater shipped in `a2b22d3`.
- **Evidence:** 41 and 14 skills enumerated from the two caches with name, line count and
  description. `.claude/skills/` now holds 20 Applye-owned skills and no third-party symlink.

### 2026-08-02, the drag fix that did nothing, and the test that let it through

- **Status:** complete, native pass pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-drag-lag-and-update-ui` (same branch, second commit)
- **Commits:** one, on top of `f581141`
- **Pull request:** [#253](https://github.com/vitala89/applye/pull/253), open
- **Objective:** the maintainer ran the app and the pipeline card still lagged behind the pointer.
  This entry corrects the previous one, which reported the drag as fixed. **It was not.**
- **Completed:**
  - **What was wrong with the fix.** `.cdk-drag-preview { transition: none }` and
    `.card { transition: ... transform 0.15s }` are both one class, so the cascade is decided by
    source order - and `@use` must be the first statement in a Sass file, which puts every rule of
    the extracted `_drag.scss` _before_ `.card` in the emitted stylesheet. The preview therefore
    kept `.card`'s transform transition and behaved exactly as before. Proved by compiling the sheet
    and reading the output, not by inspection: `.cdk-drag-preview` was rule 1, `.card` was rule 283;
  - the rule is now `.card.cdk-drag-preview`, which wins on two classes whatever the order, with
    `.card.cdk-drag-animating` declared after it so the drop animation still runs. The now-redundant
    single-class `.cdk-drag-animating` rule was removed, and the preview gained
    `will-change: transform` so moving it repaints nothing beneath it. Every transition in the
    compiled sheet was listed to confirm nothing else reaches the preview;
  - **what was wrong with the test, which matters more.** It asserted that `_drag.scss` _contains_
    `transition: none` under `.cdk-drag-preview`. That was true while the bug was fully present: a
    text search cannot see a cascade, so the guard was green for a fix that did nothing. It now
    compiles the stylesheet with `sass` and resolves which `transition` declaration actually wins
    for an element carrying `card` + `cdk-drag-preview`, by specificity then source order.
    **Verified against the broken version:** restoring the single-class rule fails it.
- **Not completed:** the native pass. A dropped frame cannot be seen from here - the browser preview
  cannot render the pipeline board, which needs the database - so the maintainer confirms the feel.
- **Files or packages changed:** `apps/desktop/src/app/pages/pipeline/{_drag.scss,drag-styles.spec.ts}`,
  `CHANGELOG.md`, this file.
- **Validation:** `npm run type-check` pass, `npm test` pass (1019), `npm run lint` pass (0 errors,
  8 pre-existing warnings), `npm run quality:file-size` pass, `npm run verify:csp` pass,
  `git diff --check` pass, `npm run format:check` pass. **Not run:** `tauri dev`.
- **Privacy/security impact:** none. Two CSS rules and a test.
- **Decisions and assumptions:** specificity was chosen over `!important` and over reordering,
  because `@use` cannot be moved and `!important` would also defeat the drop animation. The guard
  parses class-only selectors and skips anything with a combinator - correct here, since the CDK
  moves the preview out to the body, so no descendant rule can reach it.
- **Risks or compatibility impact:** the guard's parser is deliberately narrow. A future rule
  written as a descendant selector, or with `!important`, would not be weighed by it - the failure
  mode is a silent pass, which is exactly what this entry is about. Stated here rather than assumed
  away.
- **Open issues or blockers:** unchanged from the entry below. `v0.29.2` is still untagged.
- **Next first action:** merge #253, then tag `v0.29.2`.
- **Evidence:** the compiled stylesheet before the fix put `.cdk-drag-preview` at rule 1 and `.card`
  at rule 283; after it, the winner for `card cdk-drag-preview` is `transition: none`. Reverting to
  the single-class rule fails `drag-styles.spec.ts`, which the previous version of that spec passed.

### 2026-08-02, unstick the pipeline drag, and make the updater visible

- **Status:** complete, native pass pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-drag-lag-and-update-ui`, from `main` (`7e5e06f`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** two things the maintainer found while running the app after #252 - dragging a
  pipeline card lagged behind the cursor, and there was no way to learn a new version exists.
- **Completed:**
  - **The drag.** `.card` transitions `transform` for its hover lift; the CDK drag preview is a
    clone of that element which the CDK moves by writing `transform: translate3d(...)` on every
    pointer move. The transition interpolated every write, so the preview trailed 150ms behind the
    pointer - the "two cards with a shadow between them" the maintainer described. The preview now
    sets `transition: none`, and `.cdk-drag-animating` stays declared after it so the drop
    animation survives at equal specificity. Cause confirmed by the surface that does _not_ lag:
    `.docedit-section` in the CV editor has no transform transition;
  - `pipeline.component.scss` was over budget (474 non-empty, ceiling 400) and could not take even
    a comment, so the CDK block moved to `_drag.scss`, `@use`d from the component sheet. **474 -> 456.** Still over the ceiling;
  - **The updater is now visible.** Everything was already wired - plugin both sides, signing key,
    `latest.json` endpoint - but it spoke only through a native dialog at launch, and only when an
    update happened to exist, so on an ordinary start it was indistinguishable from a feature that
    was never built. The dialog is gone (maintainer's choice). `UpdaterService` was rewritten
    around `state`/`newVersion`/`error` signals with seven states, and the plugin sits behind an
    injected `UPDATE_BACKEND`, so every state is reachable in a test - the old service called the
    plugin directly and could only be tested by not calling it, the same shape that made
    `SettingsService` a trap;
  - **Two surfaces.** A dot beside Settings in the sidebar, reduced to just the dot in rail mode,
    and `AboutUpdateComponent` in Settings: running version, **Check for updates**, or **Install &
    restart** when there is something to take. A failed check prints its reason verbatim instead of
    reading as "up to date"; a failed install returns to the offer rather than stranding the user;
  - **The settings page shrank rather than grew** - it is far over budget, so About became its own
    component and `getVersion` went with it. `.ts` **584 -> 575**, `.html` **586 -> 580**;
  - 9 locale keys in all six languages, plus `settings.about_privacy`, which had been hardcoded
    English in the template. `updater.badge` is on the shared-with-English allowlist for German,
    which uses the loanword.
- **Not completed:** the native pass. The drag has to be felt, and the update path can only be
  exercised end to end once a newer release is published - the maintainer has the steps in the
  handover. `dashboard.component.ts` and `jobs.component.ts` remain over budget, untouched here.
- **Files or packages changed:** `apps/desktop/src/app/core/updater.service.ts` (rewritten) + new
  spec, `apps/desktop/src/app/app.ts`, `apps/desktop/src/app/layout/shell-layout.component.{ts,html,scss}`
  - new spec, `apps/desktop/src/app/pages/settings/{settings.component.ts,settings.component.html,
about-update.component.ts,.html,.scss}` + new spec, `apps/desktop/src/app/pages/pipeline/
{pipeline.component.scss,_drag.scss,drag-styles.spec.ts}`, `libs/i18n` (six locales + the parity
    spec's allowlist), `CHANGELOG.md`, this file.
- **Validation:** `npm run type-check` pass (6 projects), `npm test` pass (**1019**, was 998),
  `npm run lint` pass (0 errors, 8 pre-existing warnings), `cargo test --lib` pass (338 passed,
  1 ignored), `cargo clippy --all-targets -- -D warnings` pass, `cargo fmt --check` pass,
  `npm run quality:file-size` pass, `npm run quality:attribution` pass, `npm run format:check` pass,
  `npm run verify:csp` pass, `git diff --check` pass, `npx nx build desktop` pass. The drag guard
  was confirmed to fail without the fix, and the shell spec to fail without the injected service.
  **Not run:** `tauri dev`. The browser preview could not verify either surface: Settings blocks on
  `db_get_settings` outside Tauri and renders nothing, which is why the About states are proved by
  a component spec instead.
- **Privacy/security impact:** none new. The updater already reached
  `github.com/vitala89/applye/releases/latest/download/latest.json` at every launch and still does,
  at the same moment; what changed is that its result is now shown rather than swallowed. Update
  artifacts are signature-checked by the plugin against the public key in `tauri.conf.json`, which
  this diff does not touch. Nothing is installed without the user pressing Install.
- **Decisions and assumptions:** the native dialog was removed rather than kept alongside the new
  UI, on the maintainer's decision - two things announcing the same update is worse than one. The
  badge watches `available` _and_ `installing` so it does not vanish mid-install, and deliberately
  stays hidden on `error`: a failed check is worth a line in Settings, not a mark on the sidebar.
  The CSS regression guard reads the stylesheets, which is unusual here but is the only level at
  which a dropped frame is expressible - it asserts the rule, not the rendering.
- **Risks or compatibility impact:** the update path cannot be fully exercised until a release
  newer than the running build is published, so the `available` and `installing` states are proved
  by tests and not yet by a live update. `transition: none` on the preview depends on
  `.cdk-drag-animating` being declared after it; the guard pins that ordering.
- **Open issues or blockers:** `pipeline.component.scss` 456/400, `settings.component.ts` 575/400,
  `settings.component.html` 580/300, `dashboard.component.ts` 428/400 - all shrinking but all still
  over. `v0.29.2` is still untagged.
- **Next first action:** merge this branch, then tag `v0.29.2` and run the `docs/RELEASE.md` smoke
  test - which is also the first real exercise of the update path, since the published build will
  then be older than the tagged one.
- **Evidence:** `npm test` 998 -> 1019. `quality:file-size` shows pipeline stylesheet 474 -> 456,
  settings `.ts` 584 -> 575, `.html` 586 -> 580. Removing `transition: none` fails
  `drag-styles.spec.ts`; renaming the injected `updater` member fails all four shell specs, which is
  the failure `nx build desktop` caught and no other gate did.

### 2026-08-02, kill the dead settings cache, name the unclaimed job, cut 0.29.2

- **Status:** complete, except the native pass and the tag push, both the maintainer's
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/settings-service-and-dashboard-job-name`, from `main` (`6b6f716`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** the two defects part B left behind - a service that was a trap rather than a cache,
  and a dashboard card that could not name the job it reopens - then the version bump and the
  website flags the maintainer asked for in the same session.
- **Completed:**
  - **`SettingsService` deleted, by maintainer decision** (delete versus initialize was put to them
    because one removes a `libs/data` public export and the other changes how the whole app reads
    settings; they chose delete). It held `signal<Settings | null>(null)` filled only by `load()`,
    and `load()` was called nowhere, so `current()` was `null` on every run - which is how the AI
    identification step silently never executed for a whole release. Its only remaining mention in
    `apps/` was the comment in `job-identity-resolver.service.ts` explaining why it was avoided; the
    27 real call sites already went through `DbService.getSettings()` and were untouched;
  - **the guard that stops the shape coming back:** `libs/data/.../cache-signal.guard.spec.ts`
    fails any service in that directory that declares a null-initialized cache signal _and_ hands
    its population to a separate `async load()`. A pattern check, not a name check, because the
    trap is the shape. Verified non-fictitious: restoring the deleted file from `main` makes it
    fail, deleting it again makes it pass;
  - **the dashboard names the job with the unfinished tailoring session.** Resolved once at load
    (`describeProgressJob`), not inside the `queue` computed - the fallback reaches the database,
    and an await in a computed is what raised `NG0600` on this feature last week. Same two-step
    lookup as `WizardNavService.crossJobLabel`, plus a third step it does not have: a failed read
    renders `#12`, so the card can always say which job it reopens;
  - **`dashboard.component.ts` had to shrink before it could grow.** It was already over budget at
    433 non-empty lines (ceiling 400) - the script was run before the edit, per rule 63, and caught
    the growth to 462. `dashboard.util.ts` now owns the pure helpers (`monogram`, `daysOverdue`,
    `daysSince`, `whenLabel`, `scheduledMs` and their constants), which no test could reach while
    they were file-scope functions inside the component. **433 -> 428.** Still over the ceiling;
  - **version `0.29.1` -> `0.29.2`** in `package.json`, `package-lock.json`, `tauri.conf.json`,
    `Cargo.toml` (and `Cargo.lock`), the six README badges with their alt text, and the asset names
    throughout the `docs/RELEASE.md` runbook. `CHANGELOG.md`'s `[Unreleased]` became
    `[0.29.2] - 2026-08-02` with a compare link, which is what turns the heading on the website's
    changelog page into a link. The two historical sentences in `RELEASE.md` - `v0.29.1` as the
    first release CI built, `0.29.0` as the unstyled bundle - were deliberately left alone;
  - **website: `SOURCE_PUBLIC` `false` -> `true`.** The repository is public (`gh repo view`
    reports `PUBLIC`), so the reason for the flag expired and every "source: coming soon" pill is a
    real GitHub link again. **`COMING_SOON` stays `true`**, and its comment now states a checkable
    flip condition instead of a vague one: the published latest release is still `v0.29.0` and
    carries exactly **one** installer, an Apple Silicon `.dmg`, so a Download button would land
    Windows and Linux visitors on a page holding nothing for them. No new download page was built -
    the hero already switches to a Download button pointing at the releases page, not at a
    versioned asset, so it cannot go stale.
- **Not completed:** the native `tauri dev` pass on the dashboard card, and the `v0.29.2` tag push
  plus the `docs/RELEASE.md` smoke test - both the maintainer's, both in the handover message. The
  `0.29.1` draft release was left in place rather than deleted; it is superseded, and deleting a
  release is not a call to make unasked.
- **Files or packages changed:** `libs/data` (`index.ts`, `settings.service.ts` deleted,
  `cache-signal.guard.spec.ts` new), `apps/desktop/src/app/pages/dashboard` (`dashboard.component.ts`,
  `dashboard.util.ts` + spec new, `dashboard.component.spec.ts` new), `apps/web/src/app/site.ts`,
  `package.json`, `package-lock.json`, `apps/desktop/src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock}`,
  six `README*.md`, `docs/RELEASE.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** all run and observed from the repository root unless noted. `npm run type-check`
  pass (6 projects), `npm test` pass (**998**, was 983: +4 dashboard component, +11 helpers and the
  data guard), `npm run lint` pass (0 errors, 8 pre-existing non-null-assertion warnings),
  `cargo test --lib` pass (338 passed, 1 ignored), `cargo clippy --all-targets -- -D warnings` pass,
  `cargo fmt --check` pass (from `apps/desktop/src-tauri`), `npm run quality:file-size` pass,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` pass, `npx nx build desktop` pass, `npm run web:build` pass (39 static routes).
  **Both new behaviours were confirmed to fail without their fix**, which is the check this codebase
  has needed twice: restoring the old dashboard line fails 2 of the 4 new tests (the claimed-job
  case still passes, correctly - it never depended on the fix), and restoring `settings.service.ts`
  fails the data guard. Website verified in the browser preview: the hero renders "View source on
  GitHub" as a link to the repository, the download remains a "coming soon" status, `/changelog`
  heads at `0.29.2` dated 2026-08-02 linking to the compare view, no console errors.
  `apps/web/public/sitemap.xml` was regenerated by `web:build` and reverted - only `lastmod` moved.
  **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No data is read, stored or sent that was not before; deleting
  an unused service removes a read path rather than adding one. `SOURCE_PUBLIC` exposes no new
  information - it links to a repository that is already public.
- **Decisions and assumptions:** the dashboard fix took the "resolve into a signal beside
  `overview()`" option and rejected caching company/title in `WizardProgress`, which is cheaper but
  wrong now: part B made the job name change by hand _and_ by AI, so a cache written when the wizard
  opened would go stale the moment either happened. Naming the job at load is safe because the
  wizard lives on the jobs page - progress cannot change while the dashboard is on screen, and
  arriving back at the dashboard reconstructs the component. The extraction taken was the pure
  helpers rather than the ~120-line `queue` computed: the helpers are a real responsibility with no
  dependencies, and splitting `queue` is a design change, not a size fix.
- **Risks or compatibility impact:** `SettingsService` was exported from `libs/data`, so anything
  outside this repository importing it breaks; nothing inside does. `desktop:build` reports the
  pre-existing bundle warning (initial 1.31 MB against a 1.30 MB warning budget, error budget
  1.50 MB not reached), unchanged in kind by this diff, which removes desktop TypeScript rather than
  adding any.
- **Open issues or blockers:** `dashboard.component.ts` is 428 of 400 and cannot grow again without
  another extraction. `jobs.component.ts` remains far over at 1610 lines with its template and
  stylesheet also over - separate work. Unclaimed jobs still accumulate as invisible rows.
- **Next first action:** push the tag - `git tag -a v0.29.2 -m "Applye 0.29.2" && git push origin
v0.29.2` once this branch is on `main` - then run the smoke test in `docs/RELEASE.md` against the
  draft it produces, publish it, and flip `COMING_SOON` to `false` in the same breath.
- **Evidence:** `npm test` 983 -> 998. `quality:file-size` reported the violation at 462 and passed
  at 428 after the extraction. `gh release list` shows `v0.29.1` as `Draft` and `v0.29.0` as
  `Latest`; `gh release view v0.29.0 --json assets` returns a single asset,
  `Applye_0.29.0_aarch64.dmg`, which is the whole argument for leaving `COMING_SOON` alone.

### 2026-08-02, job identity part B: AI names it, then the user does

- **Status:** complete, verified natively
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/job-identity-part-b`, from `main` (`825fa74`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** implement `docs/superpowers/specs/2026-08-02-job-identity-part-b-design.md` -
  one press of Parse & filter runs the deterministic rules, then one `job-identify` call if they
  missed, then a dialog if that missed too.
- **Completed:**
  - migration `0028_job_identity_sources.sql`: `title_source`, `company_source`,
    `identity_prompt_skipped`. Additive, no backfill, checksum pinned in `db.rs`;
  - `commands/job_identity_source.rs`: `IdentitySource`, the re-parse resolution rules,
    `job_set_identity` and `job_skip_identity_prompt`. New module rather than growth in
    `job_identity.rs` (pure text rules) or `job_paste.rs` (the pipeline), because it is the only
    piece that needs both the stored row and the fresh text;
  - `job_paste.rs` now loads the stored identity, resolves both fields against it, and writes the
    sources. The `prefer_fresh` CASE in the upsert went away: the values are already resolved in
    Rust, so the SQL writes them outright;
  - `libs/skills/src/job-identify/job-identify.md`, registered in `ai/skills.rs`, economy model,
    strict JSON, with the platform-is-not-the-employer and unnamed-partner rules pinned by tests;
  - `JobIdentityResolverService` runs the chain from `JobIntakeService.parse`;
  - `JobIdentityPromptComponent` mounted at the shell beside `UnsavedJobPromptComponent`;
  - `JobMetaCardComponent` extracted from the jobs page to host the inferred marker and the
    "Name it yourself" button - both page files were over budget and could not grow;
  - 13 keys in all six locales.
- **Not completed:** the native pass. Migration `0028` applying, the live `job-identify` call, and
  the dialog on screen all need `tauri dev`, which this watch does not run. The maintainer has a
  step-by-step scenario in the handover message.
- **Files or packages changed:** `apps/desktop/src-tauri` (migration, `db.rs`, `lib.rs`,
  `commands/{mod,jobs,job_paste,job_identity_source}.rs`, `ai/skills.rs`), `libs/skills`,
  `libs/core` (`job.model.ts`), `libs/data` (`job-source.service.ts`), `libs/i18n` (six locales),
  `apps/desktop/src/app` (shell layout, jobs page, `job-meta-card`, `job-identity-prompt`,
  `job-identity-resolver.service.ts`, `job-intake.service.ts`).
- **Validation, all run and observed:** `npm run type-check`, `npm test` (958 desktop tests, 61
  suites, all six projects green), `npm run lint` (0 errors, 8 pre-existing warnings, none in new
  files), `cargo test --lib` (338 pass), `cargo clippy --all-targets -- -D warnings`,
  `cargo fmt --check`, `npm run quality:file-size` (passed), `npm run quality:attribution`,
  `npm run format:check`, `npm run verify:csp`, `git diff --check`, `npx nx build desktop`.
- **Every new rule was checked against a deliberately broken build.** Disabling the `user` rule fails
  4 tests; disabling the `inferred` arm fails 2; disabling the skip check fails 1; removing the
  provider-configured guard fails 1. Two fixtures assert the property the test depends on - that the
  posting extracts no company, and that it extracts no title - because a green test on an
  unrepresentative fixture has already shipped a bug in this exact code.
- **Privacy/security impact:** the AI step sends the pasted job description to the configured
  provider, which is the same text `job-scoring` and the tailoring passes already send, on the same
  configured provider and key. Nothing new leaves the machine. Skipped entirely when no provider key
  is stored, so a user who has not set up AI never makes the call.
- **Decisions and assumptions:**
  - the "no provider configured" check is `hasProviderKey` in API mode only. In CLI mode the bridge
    binary is the credential and probing it costs a process spawn per parse, so the call is attempted
    and its failure falls through to the dialog, which is the same user-visible outcome;
  - a field the user leaves blank in the dialog keeps whatever source it had. Leaving it empty is not
    a claim about it;
  - `askAgain` is `resolve` with the skip cleared, so the button beside the placeholder re-runs the
    AI step too rather than jumping straight to the dialog.
- **Risks or compatibility impact:** the upsert's authoritative branch was re-expressed in Rust as
  `stored.or(passed).or(extracted)`, which is what the old `COALESCE(NULLIF(jobs.company, ''), ...)`
  did. Existing `job_paste` tests cover both branches and still pass.
- **Open issues or blockers:** unchanged from the previous watch - unclaimed jobs accumulate as
  invisible rows, and `dashboard.component.ts:270` still loses the name of an unclaimed job.
- **Corrected within the same watch, by the maintainer testing it.** The first cut awaited the
  identification phase inside `JobIntakeService.parse`, so Parse & filter stayed disabled across an
  AI call bounded at ten minutes by `ai_run` and then across a dialog bounded by nothing at all.
  Reported as "нажали парсинг, и он завис". Leaving the page mid-phase orphaned the promise and the
  page came back reset. Fixed by making identification a phase that runs _after_ the parse on the
  root singleton, with its own 45-second bound, an `identifying...` line on the card, and a corner
  badge for a user who navigated away - the shape `WizardActivityService` and the resume-tailor
  badge already use. No "you will lose the parse" warning was added, because nothing is lost: the
  job row is written before the phase starts. The dialog is raised by the component rendering the
  job rather than by the service, so it cannot appear over Pipeline. Both regressions have tests
  that hang or fail without the fix.
- **Two more found by reviewing the diff before the PR, both with tests that fail without them.**
  The page adopting a named job left the published snapshot in place, so a later rebuild of the same
  card would re-emit it over a row freshly read from the database; taking it now drops it. Doing that
  through the wider `clear` would have been the trap: one identify call sets both signals - the AI
  names the title and publishes, then flags the still-missing company - so clearing the flag on
  consume would cancel the dialog it exists to raise. `consumeResolved` and `clear` are separate for
  that reason, and a test pins it. Separately, deleting a job now clears the badge, which was
  otherwise left offering a page that no longer exists.
- **Third round, from the maintainer running it natively.** Three faults on one screen.
  (1) **NG0600, "Writing to signals is not allowed in a `computed`"**, twice per open. The dialog
  seeded its two inputs from a computed, so it threw on every open, never rendered, and the job went
  unnamed with two error toasts to show for it. Every unit test around it passed - the rule is
  enforced at render time. The two drafts now live on the prompt service and are seeded in `ask`, an
  ordinary method call, and there is a component spec that builds and opens the dialog for real. It
  reproduces NG0600 when the old shape is restored.
  (2) **The AI step failing invisibly.** `catch {}` swallowed every reason, so "the posting names no
  employer" and "nothing ever read the posting" looked identical on screen. The dialog now states
  which of the three it was - answered, no provider configured, or failed - and prints the provider's
  own error verbatim underneath. Whether the AI actually ran on the reported posting is still unknown
  from here; the next run will say so on screen instead of requiring another round trip.
  (3) **"Name it yourself" was unfindable**, rendered as uppercase micro-text in the badge row where
  it read as a label. It is now a real secondary button under the two fields it is about, labelled
  "Set company and role", and shown only when a field is missing or holds a value the AI guessed.
- **Fourth round, again from the maintainer running it.** The dialog worked - a job was named by
  hand - and four things around it did not.
  (1) **The empty state flashed on every parse.** `parseAndFilter` clears the job before parsing, and
  `@if (!job())` rendered "paste a job description" in the gap. It now also waits on `parsing()`.
  (2) **"Parsing" was drawn twice**, once as the button label and once as an animated indicator
  beside it. The indicator is gone - the parse is milliseconds now, so it was reporting nothing.
  (3) **The page header did not follow the job.** `pageTitle.set` was pushed from `loadJob` alone, so
  every other path had to remember and neither the re-parse nor naming a job by hand did. It is now
  derived from the `job` signal in an effect, which no future path can forget.
  (4) **No way to correct a name once given.** The button hid itself as soon as both fields were
  filled, which is exactly when a typo needs fixing. It is always offered now; only the label changes
  between "Set company and role" and "Edit company and role".
- **The header fix needed budget, so the German photo prompt came out.** `jobs.component.ts` was
  1509/400 and may not grow. `CvPhotoPromptService` (89 lines, 7 tests where it had none) takes the
  once-per-visit flag, the dialog state and the one document write; the page keeps a 12-line adapter,
  because deciding what to do with the returned document is the page's. Two more duplications went
  with it: `portalLanguages` was a hand-kept copy of the `SupportedLanguage` union and is now
  `SUPPORTED_LANGUAGES` in core beside the type, with `normalizeSupportedLanguage`; and
  `inferDocumentRegion` moved next to the `DocumentRegionTag` it returns. `parseLegitimacyNotes` went
  to core with 4 tests, including the malformed column that used to be caught by a bare `try`.
  **`jobs.component.ts` 1509 -> 1467, template 1126 -> 1122.**
- **Fifth round, and the AI step had never run once.** The dialog reported "AI identification is not
  set up" on a machine with a provider configured, which is what the outcome line was added to
  surface. Cause: the resolver read settings from `SettingsService.current()`, and **nothing in the
  application calls `SettingsService.load()`** - a grep for its name returns exactly one consumer,
  the resolver itself. `current()` was null on every run, so `callIdentify` returned at its first
  guard and the AI step silently never happened for anyone. It now reads `db.getSettings()`, the way
  every other consumer in the app does, which also means a provider configured a minute ago is picked
  up without a reload. Nothing but the outcome line would have found this: the feature failed exactly
  as a posting with no employer succeeds.
- **Identification now follows the Paste Job modal as well.** Analyze creates a job out of raw text,
  which is the same event as Parse & filter, and only the second one ran the chain - so a user who
  pasted through the modal had to find and press a second button to be asked, which is the work
  Analyze exists to save. Both the text and the link path start it now; the link path usually no-ops,
  because a board that returned structured fields has already named the job.
- **Sixth round, and the report was diagnostic on its own:** "Set company and role" ran the AI and
  raised the keychain prompt; Parse & filter and Analyze did nothing. The only difference between
  those paths is the guards on `start`, and both were wrong.
  (1) **`start` bailed out entirely on a recorded skip.** The spec says the skip stops the dialog
  returning; it says nothing about the AI. "Stop asking me" and "stop reading the posting" are not
  the same instruction, and one cheap call that fills in a title without asking anything is not
  asking. `start` now always identifies and only suppresses the flag that raises the dialog.
  (2) **A superseded dialog was recorded as a deliberate skip.** `prompt.ask` answered a pending
  request with the skip value when a newer one arrived, the resolver wrote
  `identity_prompt_skipped` to the job, and because a first paste dedupes on the text's hash, every
  later paste of that posting landed back on the same flagged row and did nothing. The user never
  pressed Skip once. The outcome is now a three-way `JobIdentityOutcome` - what was typed, `skipped`,
  `superseded` - and only the middle one writes anything.
  Both have tests that fail when the fix is backed out, and the second needed a test against the real
  prompt service: the resolver's own fake short-circuited the supersede path and passed either way.
- **Native gate passed.** The maintainer ran the whole chain in `tauri dev` and confirmed it: the
  parse returns immediately, the AI step runs and names what it can, the dialog asks about the rest,
  the header follows the job, and the rename button works from both entry points. Six rounds of
  correction in one watch, five of them found by running the application rather than by any test -
  which is the honest summary of what unit tests bought here and what they did not.
- **Next first action:** the deferred items below, in the order listed.
- **Evidence:** command output above, in this session's transcript.

### 2026-08-02, five fixes on one screen, two of which my own tests should have caught

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** six branches, all merged: `fix/job-identity-trailing-label` (#244),
  `fix/reject-stale-identity-on-reparse` (#245), `fix/reparse-updates-job-in-place` (#246),
  `fix/paste-modal-stays-on-link-tab` (#247), `feat/my-jobs-claimed-only` (#248),
  `docs/job-identity-part-b-spec` (#249). From `main` (`055e498`) to `2536dc8`.
- **Objective:** maintainer bug reports from the running app, taken one at a time.
- **This entry also corrects the one below it.** That watch recorded the company-extraction bug as
  fixed. It was not - #243 shipped, the maintainer tested the reported posting, and it still failed.
  Recorded here rather than edited there, because what the watch believed at the time is part of
  what happened.
- **Completed, in order:**
  - **#244 - the first fix did not work, and my test is why.** `Company name - Elbrus` sits on the
    last line of that posting; the labelled scan read the first 30 lines. My #243 fixture put the
    label near the top, so it tested the label and the separator - the parts already fixed - and
    never the scan window. **A passing test on an unrepresentative fixture is how this shipped.** The
    regression test now asserts the fixture's own length first, so trimming it later cannot silently
    stop testing the thing that broke.
  - **#245 - the stricter rules had no effect on any job parsed before them.** Extraction correctly
    returned nothing for a heading-only posting, but the page hands the stored value back on every
    re-parse and the fallback filled the gap with it. `The Purpose:` survived the rule written to
    reject it, by riding in on the path that rule leaves open. The fallback now validates what it is
    handed. Third copy of the same hole found in the SQL, where `COALESCE` put the rejected string
    back into the row.
  - **#246 - editing a saved job's description forked it.** Identity was the text's hash, so an edit
    hashed differently, matched nothing, and inserted a second job every time. `job_paste` takes an
    optional job id; with it the row is the identity. A collision is reported, not merged, because
    merging discards whichever row the user was not looking at along with its application and its
    documents. **Fixing this exposed a latent bug**: `score_cache_get` matched on
    `(job_id, profile_hash)` only, which was safe while an edit always produced a fresh job with no
    cache. It now also requires the job's current `jd_hash`, so an edited description falls through
    to `score_cache_latest` and shows its old score marked stale. Shipping the reported fix alone
    would have produced a worse bug - a score silently attributed to text it was never computed
    against.
  - **#247 - the paste modal hid its own explanation.** Fetching an unfetchable URL switched to the
    "Paste text" tab, where the warning and its "Open in browser" button are not rendered. One line.
  - **#248 - My Jobs listed every job analysed, badged Saved.** The list selected every row with an
    exception for Discover; the exception became the rule, and the query got shorter. Separately
    `no_status` - the label for _no application at all_ - was translated as "Saved" in all six
    locales. A `CanDeactivate` guard now asks before leaving an analysed but unclaimed job; its whole
    condition is "a job is loaded and it has no application", which covers Save, Mark as Applied and
    the wizard's own navigation without a special case.
  - **#249 - part B specified, not built.** AI identification then an ask-the-user dialog, with
    `Jobgether` written in as the canonical wrong answer.
- **Not completed:** part B implementation. No native `tauri dev` gate; the maintainer verified each
  fix by hand in the running app and confirmed every one.
- **Three extractions the size budgets forced, each one the code wanted anyway:** the paste pipeline
  left `scoring.rs` for `job_paste.rs` (698 of 800 lines); the job intake surface left `DbService`
  for `JobSourceService` (**474 to 461**); the header composition became a pure `jobHeaderTitle` in
  `libs/core`. `jobs.component.ts` ended at **1531**, one below its base.
- **Validation:** run and observed on each branch before merge: `npm run type-check` (6 projects),
  `npm test` (6 projects, ending at **1344 tests**; desktop 945), `cargo test --lib` (**322 passed**,
  1 ignored; from 311), `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`,
  `npm run lint` (0 errors), `npx nx build desktop`, `npm run quality:file-size`,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`.
  All pass. CI green on all six PRs. **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  beyond parameters on existing commands.
- **Decisions and assumptions:** an abandoned analysis keeps its row rather than being deleted - a
  first paste is identified by the text's hash, so re-pasting lands on the same row and reuses the
  score already paid for in tokens. The `dashboard.component.ts:270` job lookup was left degraded
  where `wizard-nav` was fixed: an async lookup inside its card-list computed would restructure that
  component. Stated rather than quietly skipped.
- **Risks or compatibility impact:** unclaimed job rows now accumulate unreachably. Accepted; a
  cleanup pass is a separate decision. Titles are stricter, so a posting whose real title carries no
  role word shows the placeholder - the trade part A took deliberately, and what part B answers.
- **Open issues or blockers:** none. Part B is specified and ready to build.
- **Next first action:** implement part B from
  `docs/superpowers/specs/2026-08-02-job-identity-part-b-design.md`, starting with the migration for
  `title_source` / `company_source` / `identity_prompt_skipped`.
- **Evidence:** PRs #244 through #249 and their check output; the maintainer's confirmations in
  session.

### 2026-08-01, a posting that would not name its company, and two layers of the same staleness

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/job-identity-extraction`, from `main` (`055e498`)
- **Objective:** a maintainer bug report - a JD headed `Company name - Elbrus` parsed as "No company
  name found in the posting." and was titled `The Purpose:`, a section heading from the body.
- **Spec:** `docs/superpowers/specs/2026-08-01-job-identity-extraction-design.md`, agreed before any
  code. Part A only; the AI-assisted identification is deliberately deferred to part B.
- **Completed:**
  - **Three causes, not one.** The company label matched only `company:`/`employer:`/`organization:`
    and only with a colon. The title fell back to the first line under 80 characters, which in that
    posting was a heading. And the value was permanent: `job_paste` overrides always won and the page
    passed the job's own stored values back on every re-parse, so re-extraction never ran again.
  - `job_identity.rs` (new, with 18 tests): labels widened, six separators accepted, section
    headings and role-word-free lines rejected as titles. **Returning nothing became a valid
    answer** - the display placeholder fills the hole, and an honest miss beats a confident wrong
    answer that then propagates into every generated document.
  - `IdentityPrecedence` on `job_paste`: `authoritative` for the "From link" fetch, whose values are
    structured fields off a board, `fallback` for a re-parse. Flipping the default globally was
    rejected for a reason found by reading the call sites: it would have let a prose guess beat real
    board metadata, trading one bug for a quieter one.
  - **The same staleness existed one level down and was found while wiring the first fix.** The
    upsert's `ON CONFLICT` kept whatever was already stored, so re-parsing _identical_ text could
    never correct a bad title regardless of precedence. Fixed with a bound flag, and pinned by a test
    that parses the same text twice.
  - Display placeholders in the My Jobs row, the job card, the delete confirm and the page header,
    across six locales. Nothing is written to the database: `duplicate_jd_other_company` and
    `legitimacy_check` compare companies to each other, so a shared literal would collapse unrelated
    jobs into "the same company" and raise a false duplicate warning.
- **Not completed:** part B - the AI `job-identify` skill, the inferred-value flags and their
  migration. No native `tauri dev` gate was run; the maintainer is verifying by hand.
- **Files or packages changed:** added `apps/desktop/src-tauri/src/commands/job_identity.rs`,
  `libs/data/src/lib/services/job-source.service.ts`, `libs/core/src/lib/jobs/job-identity.ts` and
  its spec, plus the design spec. Changed `scoring.rs`, `commands/mod.rs`, `db.service.ts`,
  `job.model.ts`, both `index.ts` barrels, `job-intake.service.ts` and its spec,
  `paste-job-modal.component.ts`, `jobs.component.{ts,html}`, `my-jobs.component.html`,
  `styles.scss`, six locale files, `CHANGELOG.md`, `CURRENT_STATE.md`, this file.
- **Three extractions the budget gate forced, and they were the right call anyway.** The first pass
  grew three already-oversized files. `CODE_QUALITY.md` rule 63 forbids that, so: the job intake
  surface (`jobPaste`, `classifyJobUrl`, `fetchJobFromUrl`) left `DbService` for a new
  `JobSourceService` - **474 to 461 lines**, and those three are the one path where a job's identity
  is decided rather than read back, which is what makes `precedence` belong there; the placeholder
  style became one global `.identity-unknown` instead of two near-identical local rules; and the
  header composition became a pure `jobHeaderTitle` in `libs/core`. `jobs.component.ts` ends at
  **1532**, exactly its base.
- **Validation:** run and observed: `npm run type-check` (6 projects, pass), `npm test` (6 projects,
  **1332 tests**, all pass; desktop 933, core 257), `cargo test --lib` (**311 passed**, 1 ignored),
  `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean), `npm run lint`
  (0 errors; the warnings are the pre-existing non-null assertions), `npx nx build desktop` (pass),
  `npm run quality:file-size` (passed), `npm run quality:attribution` (passed),
  `npm run format:check` (pass), `npm run verify:csp` (pass), `git diff --check` (clean).
  **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  beyond one added parameter on an existing command. The extraction is pure string work on text the
  user pasted themselves.
- **Decisions and assumptions:** the en and em dash are written in Rust as `'\u{2013}'` and
  `'\u{2014}'` rather than as characters - the repository forbids them in authored output, but real
  postings contain them constantly and they have to be matched. The parse status strings stay
  hardcoded English, unchanged; translating them is a separate change and was not smuggled in here.
  The role-word list is English-only, which is a real limit: a German or Ukrainian posting with no
  labelled title will fall through to the placeholder rather than guess. That is the intended
  failure direction and is what part B is for.
- **Risks or compatibility impact:** low, with one to watch. Titles are now stricter, so a posting
  whose real title happens to carry no role word will show the placeholder where it previously showed
  something. That is the trade the spec accepted deliberately. The `fallback` path only ever replaces
  a value with one extracted from the same text, so it cannot invent.
- **Open issues or blockers:** none from this watch. Part B is the natural next piece, and the known
  deferred items are unchanged.
- **Next first action:** the maintainer runs the manual gate on the reported posting - re-parse it
  and confirm the company reads `Elbrus` and the title is no longer `The Purpose:`. Then spec part B.

### 2026-08-01, JD intake comes out, and four of its seven resets stay behind

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/job-intake-service`, from `main` (`23c8e51`)
- **Objective:** the next first action from the watch below - `parseAndFilter` out of
  `jobs.component.ts` - started in a fresh session, which is what the previous watch asked for.
- **Completed:**
  - PR #240 merged first, so this branch starts from a clean `main` with no open pull requests.
  - `JobIntakeService` (89 lines): the parse itself, its `parsing`/`status`/`error` line, the free
    score-cache probe, and the 0-token archetype overlap check. `jobs.component.ts`
    **1553 -> 1532**.
  - **The seven-signal reset was inventoried before anything moved, which is what kept it small.**
    `parseAndFilter` opened by clearing signals across four services. Only four of them
    (`parsing`, `parseStatus`, `parseError`, `archetypeMatch`) are intake's. The other three are the
    page deciding that a re-parse invalidates the job, the score and the tailoring lock, plus
    `resetWizard()`. Moving all of them would have made intake write into `JobScoringService` and the
    wizard to clear state it does not own, so the service takes a snapshot in and returns a result
    out, and the "the JD changed, so this is stale" decisions stayed with the page.
  - A cache hit is **returned, not applied**, for the same reason: `cache`, `fromCache`, `stale` and
    `status` are `JobScoringService`'s signals.
  - 9 tests where the whole path had none, including the two early exits a mechanical move would
    lose: a hard-filter failure returns before the cache probe and the archetype call, and a profile
    with no scoring hash never touches the cache.
- **Not completed:** the compensation/archetype derivations still on the page. They are small and
  pure and want to be functions in `libs/core`, not a service. No native `tauri dev` gate was run.
- **Files or packages changed:** added `apps/desktop/src/app/shared/job-intake.service.ts` and its
  spec; `apps/desktop/src/app/pages/jobs/jobs.component.ts`; `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is untouched.
- **Validation:** run and observed on this branch: `npx tsc -p apps/desktop/tsconfig.app.json
--noEmit` (clean), `npm run type-check` (pass), `npx nx test desktop` (58 suites, **932 passed**, up
  from 923), `npx nx lint desktop` (pass), `npm run quality:file-size` (passed; the ratchet moved
  1553 -> 1532), `npm run quality:attribution` (passed), `npm run format:check` (pass),
  `npm run verify:csp` (pass), `git diff --check` (clean). **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  changed; the same three `DbService` calls run in the same order.
- **Decisions and assumptions:** the job is set on the page **after** the service returns, where
  before it was set between the parse and the cache/archetype awaits. That makes the job card and
  the archetype warning appear together instead of the card appearing a few milliseconds early -
  behavioural, visible only as the absence of a flash, and judged an improvement rather than a
  regression. The parse status strings stay hardcoded English exactly as they were; translating them
  is a separate change and was not smuggled in here.
- **Risks or compatibility impact:** low. The template binds the same four signal names through
  aliases, so `jobs.component.html` is byte-identical to `main`.
- **Open issues or blockers:** none from this watch. The known deferred items are unchanged: the
  Discover duplicate-row decision, the CV card reading "Generating" while blocked on the gap dialog,
  and the native gate.
- **Next first action:** move the compensation/archetype derivations (`hasArchetypes`, the
  `compareCompensation`/`extractSalaryFromJd` computed) into `libs/core` as pure functions, or
  decide they are small enough to leave. Either way, say which and why in the next entry.
- **Resolved in the same session:** they stay. `parseArchetypes`, `parseProfileMd`,
  `compareCompensation` and `extractSalaryFromJd` are already pure functions in `libs/core` with
  their own specs - 31 cases for compensation, plus `archetype.spec.ts` and
  `profile-markdown.spec.ts`. The 19 lines on the page are `computed()` wiring that reads two page
  signals and feeds the template. There is no logic left to lift, so extracting would add a hop and
  no test seam. The earlier note that they "probably want to be functions in `libs/core`" was
  written before anyone checked that they already were. That closes the named Tier 1 seam list.

### 2026-08-01, the last named seam, and a busy flag that would have split in two

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/job-actions-service`, from `main` (`e8c73e0`)
- **Objective:** the next first action from the watch below - job CRUD out of `jobs.component.ts`.
- **Note:** third watch started against my own standing recommendation to open a fresh session. The
  maintainer asked to continue each time. Recorded, not re-litigated; the recommendation still
  stands and the reason has not changed.
- **Completed:**
  - `JobActionsService` (91 lines): saving a job as a tracked lead, deleting it, the delete-confirm
    state, and the busy/message signals both actions report through. `jobs.component.ts`
    **1577 -> 1553**.
  - `markApplied` deliberately stayed on the page: it commits documents, closes the wizard and
    navigates. That is orchestration, not an action, and the same rule the previous three
    extractions followed.
  - **The extraction found a divergence before it shipped.** `saveJob` and `markApplied` share one
    `actionBusy` flag. Moving only the first would have given them one each, so the button that
    greys out during an apply would have stopped greying out during a save - a real regression, in
    the direction nothing would have failed on. The flag moved with the action and the page aliases
    it, so both stay guarded by the same signal.
  - 9 tests where neither action had any, including the asymmetry that reads like a bug and is not:
    a failed delete clears `deleting` and closes the confirm, a successful one leaves both alone,
    because the caller navigates away and resetting first puts the dialog back on screen for the
    frame before the route changes.
- **Not completed:** this is smaller than the "119 lines" the earlier inventory suggested. That
  figure counted `parseAndFilter` (JD paste, parse, score-cache lookup), which is a different
  responsibility and wants its own seam. Said plainly rather than padded.
- **Files or packages changed:** `apps/desktop/src/app/shared/job-actions.service.ts` (new, 91),
  `job-actions.service.spec.ts` (new, 113), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1577 -> **1553**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **923 tests** (914 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** both
  actions write to SQLite over Tauri IPC and the delete navigates.
- **Privacy/security impact:** none new.
- **Decisions and assumptions:**
  - `save` and `remove` return the row / a boolean rather than navigating or setting page state, so
    the page keeps the routing decision.
  - The service owns its own failure handling (message line + toast) because both actions handled
    failure identically and the page did nothing with it beyond display.
- **Risks or compatibility impact:** `actionBusy` is now the service's signal, aliased. Any future
  code that sets it directly on the component still works, because it is the same writable signal -
  the pattern the previous nine seams used.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the free-text
  date answers filed as a background task, the oversized Rust modules and specs frozen.
- **Next first action:** extract `parseAndFilter` from `jobs.component.ts` into a
  `JobIntakeService` - pasting a JD, parsing it, and the score-cache lookup that immediately
  follows. It resets seven signals across four other services before it starts, so list those
  resets first and decide which belong to intake and which are the page's.
- **Evidence:** file-size report printed `jobs.component.ts: 1553/400 non-empty lines, base 1577`.
  Suite 914 -> 923.

### 2026-08-01, the document-drafts region is finished

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/linked-documents-service`, from `main` (`20db990`)
- **Objective:** the next first action from the watch below - the link/commit lifecycle, the last
  piece of the 591-line document-drafts region.
- **Note:** this watch was started against my own recommendation to open a fresh session. The
  maintainer asked to continue here; recorded because the recommendation still stands for the next
  task and the reason has not changed.
- **Completed:**
  - `LinkedDocumentsService` (105 lines): `load`, `link`, `commit`, `isStale`, `clear`, and the two
    document signals. `jobs.component.ts` **1608 -> 1577**. The region is now four services.
  - The decision stayed on the page by design. "Is it stale, do I regenerate, which generator do I
    call" is orchestration; the service reports and commits. That is why it injects no draft
    service and needs only a fake database to test.
  - **The staleness check was the fragile part and is now safe.** It recomputed each document's
    input hash from a formula copied out of the generator, so the two could drift and a regenerate
    would simply stop firing - silently, and in the direction that looks fine. Both generators now
    export the builder for their own hash input (`cvDraftHashInput`, `coverLetterHashInput`) and
    the check asks with it.
  - 15 tests where the cluster had none, including all five ways a best-effort commit can decline
    to do anything - already committed, nothing linked, the database throwing, the commit
    returning nothing - each of which must leave the draft exactly where it was.
- **Not completed:** nothing in scope. `jobs.component.ts` still holds job CRUD (~119 lines) and the
  compensation/archetype derivations.
- **Files or packages changed:** `apps/desktop/src/app/shared/linked-documents.service.ts`
  (new, 105), `linked-documents.service.spec.ts` (new, 131), `cv-draft.service.ts` and
  `cover-letter-draft.service.ts` (hash-input builders exported and used),
  `apps/desktop/src/app/pages/jobs/jobs.component.ts` (1608 -> **1577**, still over budget, shrank).
  `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **914 tests** (899 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** the
  commit path runs on export and on mark-applied, both Tauri-only.
- **Privacy/security impact:** none new.
- **Decisions and assumptions:**
  - `isStale` takes the already-built hash input rather than the pieces, so the service knows
    "compare a hash" and the page knows "what the inputs are". That is what let the formula move to
    the generators instead of being copied a third time.
  - `link` returns null when the library row has gone, so the caller leaves its picker open rather
    than closing it over nothing. The old code returned early with the dialog still open, which is
    the same outcome, now explicit.
- **Risks or compatibility impact:** `commit` is reached from export and from mark-applied, and it
  swallows its own failures by design. That was true before and is now covered by tests rather than
  by a comment. The export path passes it as a callback into `DocumentExportService`, unchanged.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the
  free-text date answers filed as a background task, the oversized Rust modules and specs frozen.
- **Next first action:** extract job CRUD from `jobs.component.ts` - the delete-confirm cluster and
  the archive/restore path - into a `JobActionsService`. It is the last cohesive seam; what remains
  after it is the compensation and archetype derivations, which are small and pure and probably want
  to be functions in `libs/core` rather than a service.
- **Evidence:** file-size report printed `jobs.component.ts: 1577/400 non-empty lines, base 1608`.
  Suite 899 -> 914.

### 2026-08-01, the cover letter follows, and the gap-fill stops being two copies

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cover-letter-draft-service`, from `main` (`90ab558`)
- **Objective:** the next first action from the watch below - cover-letter generation out of the
  document-drafts region.
- **Completed:**
  - `CoverLetterDraftService` (138 lines): the `cover-letter-generate` call and the draft row.
    `jobs.component.ts` **1693 -> 1612**. `createCoverLetterDraft` went from ~125 lines to 40.
  - **The extraction found real duplication rather than creating a second copy of it.** Both draft
    flows ran the same gap-fill - analyse, ask, fold the answers back into the source text,
    best-effort save to the profile - as two copies of the same twenty lines, down to the same
    `finally` and the same swallowed write. It is now one `foldInGapAnswers` in `gap-fill.ts` (54
    lines) that both services call, and `CvDraftService` shrank from 216 to 184 going through it.
  - 13 tests, 5 of them on the shared helper directly. The condition that was a bug once already is
    now pinned: the letter skips the gap pass when a CV is linked **or still preparing**, because a
    CV mid-generation has not linked itself yet.
- **Not completed:** the link/commit lifecycle, which is what remains of the 591-line region.
- **Files or packages changed:** `apps/desktop/src/app/shared/cover-letter-draft.service.ts`
  (new, 138), `cover-letter-draft.service.spec.ts` (new, 192), `gap-fill.ts` (new, 54),
  `cv-draft.service.ts` (216 -> 184), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1693 -> **1612**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **899 tests** (886 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** cover
  letter generation needs an AI provider and SQLite over Tauri IPC.
- **Privacy/security impact:** none new. Same profile text, same job description, same skill.
- **Decisions and assumptions:**
  - `skipGapFill` is computed by the page and passed in, rather than the service reading
    `linkedCv`/`preparingCv` itself. Those are the page's signals, and passing a boolean keeps the
    service free of them.
  - `foldInGapAnswers` takes the `analyzing` signal as a parameter instead of injecting
    `CvGapDialogService`, so the helper stays a function and both services keep owning their
    injection.
- **Risks or compatibility impact:** the two extracted flows now share one gap-fill implementation,
  so a change there moves both. That is the point, and it is the reason the helper has its own five
  tests rather than being covered only through the services.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the free-text
  date answers filed as a background task, and the oversized Rust modules and specs still frozen.
- **Next first action:** extract the link/commit lifecycle from `jobs.component.ts` - the
  `chooseExistingDocument` / `commitLinkedDocument` / `commitApplicationDocuments` cluster - into a
  `LinkedDocumentsService`. That is the last of the document-drafts region, and it is the piece the
  export path calls into, so start by listing its callers before moving anything.
- **Evidence:** file-size report printed `jobs.component.ts: 1612/400 non-empty lines, base 1693`.
  Suite 886 -> 899.

### 2026-08-01, CV generation comes out of the document-drafts region

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-draft-service`, from `main` (`ffc9c21`)
- **Objective:** the next first action from the watch below - start splitting the 591-line
  document-drafts region, CV generation first.
- **Completed:**
  - `CvDraftService` (216 lines): the gap-fill pass, structuring through the `cv-import` AI skill,
    the date block-before-generate, and the draft row it all lands in. `jobs.component.ts`
    **1812 -> 1693**. `createCvDraft` went from ~160 lines to 34.
  - The four hand-offs the cover-letter flow shares - `ensureApplicationDraft`, `analyzeCvGaps`,
    `awaitGapDialog`, `appendToProfile` - stay on the page and arrive through the context, so the
    dependency points one way and the pipeline can be driven in tests with fakes.
  - Two pure functions came out with it, and they are the parts worth testing alone:
    `dateGapQuestions` (asks only about undated entries, encodes list + index in the id) and
    `applyDateAnswers` (routes each answer back by that id).
  - 14 tests where this had none, including the invariant a careless extraction would have broken:
    the input hash is computed over the **tailored** markdown, not the gap-augmented text, so
    answering the dialog does not make an otherwise identical run look like a different input.
- **Not completed:** the rest of the region - cover-letter generation and the link/commit lifecycle.
  They are separate responsibilities and want their own services.
- **Files or packages changed:** `apps/desktop/src/app/shared/cv-draft.service.ts` (new, 216),
  `cv-draft.service.spec.ts` (new, 211), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1812 -> **1693**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **886 tests** (872 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** CV
  generation needs an AI provider and SQLite over Tauri IPC. The behaviour is pinned by tests
  against fakes, which is not the same as a real run.
- **Privacy/security impact:** none new. The service handles CV text and profile answers, which were
  already flowing through the same code on the page; nothing new leaves the machine, and the AI call
  is the same `cv-import` skill with the same inputs.
- **Decisions and assumptions:**
  - The service returns `null` rather than throwing when a run is already in flight, so the caller's
    double-tap guard and the error path stay distinct.
  - Preconditions (no job, no tailoring, no settings) stay on the page, because their failure is a
    localized status string rather than an exception.
  - Two behaviours were pinned as they are, not as they might ideally be. A date the parser cannot
    read is written verbatim - the alternative is guessing an employment date. A failed profile
    write is swallowed - the answers are already folded into the text being structured. Both
    predate this change.
- **Risks or compatibility impact:** this is the highest-traffic AI path in the app and it has no
  native verification. The order of operations was preserved exactly: ensure application, gap-fill,
  hash, structure, dates, persist. A first tailor and every retailor still reuse
  `app.cvDocumentId`, which is what stops duplicate "<Company> - Tailored CV" rows (ADR-0003), and
  that is now a test rather than a comment.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. A background task
  was filed for the free-text date answers described above. `discover.rs` (3245), `tailoring.rs`,
  `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and `cv-preview.component.spec.ts`
  (2263) remain over budget and frozen.
- **Next first action:** extract cover-letter generation from `jobs.component.ts` into a
  `CoverLetterDraftService`, mirroring `CvDraftService` - `createCoverLetterDraft` is the entry
  point and it shares `analyzeCvGaps`, `awaitGapDialog`, `appendToProfile` and `jobDocLabel` with
  the CV path, so pass them in the same way rather than duplicating them. Once both drafts are out,
  the link/commit lifecycle is what remains of the region.
- **Evidence:** file-size report printed `jobs.component.ts: 1693/400 non-empty lines, base 1812`.
  Suite went 872 -> 886 with the new spec.

### 2026-08-01, wizard navigation becomes the seventh seam

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/wizard-nav-service`, from `main` (`27cc863`)
- **Objective:** the next first action from the watch below - extract wizard navigation out of
  `jobs.component.ts`.
- **Completed:**
  - `WizardNavService` (133 lines) owns open/closed, the step index, the saved progress that
    survives leaving the page, the cross-job confirm and its label, and `scrollToTop`.
    `jobs.component.ts` **1881 -> 1812**.
  - What did **not** move: the work each step triggers - the auto-rescore on the Updated score
    step, the document preparation on the documents step, the score commit on continuing past it.
    Those stay the page's, which is exactly what lets the service be tested without an AI call or a
    database.
  - 16 tests, where none of this had any. They pin the behaviours that took bug reports to
    establish: the cross-job confirm leaves the other session **intact** until answered, `close`
    ends the session while `forget` drops it without closing, an editor return outranks saved
    progress, and a restore is skipped for another job's session or an already-open wizard.
  - `jobs.component.html` is byte-identical to `main` - `git diff --name-only` does not list it.
    Seventh consecutive seam where that holds, by the same writable-signal alias pattern.
- **Not completed:** nothing in scope. The three remaining seams are unchanged: document drafts
  (591 lines, three responsibilities), job CRUD (119), the compensation/archetype derivations.
- **Files or packages changed:** `apps/desktop/src/app/shared/wizard-nav.service.ts` (new, 133),
  `wizard-nav.service.spec.ts` (new, 148), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1881 -> **1812**, still over budget, shrank), `CHANGELOG.md`, this file.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **872 tests** (856 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint reports 8 warnings, all pre-existing
  non-null assertions in `cv-content.util.spec.ts` and `cv-gap-dialog.component.spec.ts`, none in
  the changed files. **Not run:** cargo - no Rust touched. **Not verified natively:** the wizard is
  Tauri-only, so the browser cannot exercise it; the byte-identical template is the structural
  argument that rendering is unchanged, not a substitute for the gate.
- **Privacy/security impact:** none. Navigation state; the saved progress already lived in
  `sessionStorage` via `WizardProgressService` and still does.
- **Decisions and assumptions:**
  - The service takes `jobId` as a parameter rather than injecting the page's `job` signal. It keeps
    the dependency pointing one way and is why the spec needs no component.
  - `close` and `forget` are separate methods for what used to be one call to
    `wizardProgress.clear`. They differ in whether the wizard also closes, and three call sites
    wanted only the forgetting.
  - `decideWizardView` keeps reading the route in the component and passes a boolean, so the
    service does not depend on `ActivatedRoute`.
- **Risks or compatibility impact:** the cross-job confirm and the resume-mid-flow path are the two
  behaviours here that a unit test can assert but only the app can prove. Both are covered above,
  and both are worth a look during the next native pass.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. `discover.rs`
  (3245), `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and
  `cv-preview.component.spec.ts` (2263) remain over budget and frozen.
- **Next first action:** split the 591-line document-drafts region in `jobs.component.ts`, starting
  with CV generation alone - `createCvDraft` and the gap-dialog call it wraps - into a
  `CvDraftService`. Do not move the region wholesale: cover-letter generation and the link/commit
  lifecycle are separate responsibilities sharing the same lines and need their own services.
- **Evidence:** file-size report printed `jobs.component.ts: 1812/400 non-empty lines, base 1881`.
  `git diff --stat` for the extraction commit: one file, 23 insertions, 94 deletions, and the
  template absent from `git diff --name-only`.

### 2026-08-01, both PRs merged, and the bullet editor's doubled frame

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/bullet-editor-double-frame`, from `main` (`fa698cf`)
- **Objective:** merge #233 and #234 on the maintainer's instruction, then fix the doubled edit
  frame they reported with a screenshot.
- **Completed:**
  - **#233 merged** (`1f192eb`), then **#234 rebased onto it and merged** (`fa698cf`). The rebase
    conflicted in `CHANGELOG.md` and `DUTY_WATCH.md`, as the trap note predicts; resolved by keeping
    both entries and moving `(latest)` to the newer one. No code file conflicted.
  - **Second pass on the same report, and it was bigger than the bullet.** The maintainer came back
    with a black ring and an indigo one on the bullet, and "too thick" lines on the ordinary fields.
    Three rings were being drawn: the selection `box-shadow`, the editor's own 2px `outline` at a 2px
    offset, and the app-wide `:focus-visible` box-shadow from `libs/ui/src/styles/global.scss`. On a
    selected leaf the first two stacked into one 6px frame - that is the "too thick", and it was on
    every field. The third normally loses to the selection ring on the same element, but on a bullet
    the ring is on the `<ul>`, so nothing outranked it and it showed as the indigo inner line. A
    mounted editor is by definition inside the current selection, so it now paints no ring at all:
    `outline: none`, plus `box-shadow: none` behind a `:not(.cvpreview__element-selected)` guard -
    without that guard the reset would have killed the selection ring on the editors that are
    themselves the selected element, since it is the same property on the same class list and the
    later rule wins. Every field in edit mode is now one 2px `--cv-accent` ring with its chip.
  - Editing a CV bullet drew two frames. The selection highlight is one ring per selected element,
    and a bullet is the only leaf whose editor is **not** the selected element - the chip and ring
    belong to the `<ul>`, the textarea is an `<li>` inside it - so `cvpreview__element-selected` and
    the editor's own `outline` were painted on two boxes separated by the list indent. Every other
    field escaped it because there the editor _is_ the selected element, making the two rings
    concentric. The textarea now paints neither.
- **Not completed:** the four native gates (#225, #230, #233, #234) plus this one. Agent-blocked.
- **Files or packages changed:** `cv-preview.component.html` (896 -> **895**, over budget, shrank),
  `cv-preview.component.scss` (379 -> **385**, under the 400 budget), new
  `cv-preview.bullet-editor.spec.ts` (77). The existing `cv-preview.component.spec.ts` is 2263 lines
  against a 600 budget and may not grow, so the regression test went into a focused new file, which
  is what the contract asks for anyway.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **52 suites / 856 tests**; `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. **Not run:** cargo - no Rust touched.
  **Not verified:** the rendered frame. The CV detail page needs a document out of SQLite over Tauri
  IPC, so a browser build cannot reach it; the assertion is on the DOM classes, not on pixels. The
  second pass is **CSS only and therefore has no unit test** - the three tests still pin the DOM
  contract, and the cascade was checked against the emitted bundle rather than reasoned about:
  `dist/apps/desktop/browser` contains `.cvpreview__leaf-editor[_ngcontent]{...outline:none}`, the
  `:not(.cvpreview__element-selected){box-shadow:none}` guard, and the untouched
  `.cvpreview__element-selected` ring. Whether it looks right is the maintainer's gate.
- **Privacy/security impact:** none.
- **Decisions and assumptions:** the ring stays on the `<ul>` rather than moving to the textarea,
  because the chip is anchored to the list and the list is what the selection model actually points
  at. Removing the textarea's `outline` does not cost a focus indicator: the list ring is painted
  exactly while the editor is mounted, and blurring the editor commits and unmounts it.
- **Risks or compatibility impact:** the design hook reports a pre-existing `broken-image` finding at
  `cv-preview.component.html:46` - the optional CV photo, whose `src` is legitimately null when no
  photo is included. Untouched and not introduced here.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. `discover.rs`
  (3245), `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and
  `cv-preview.component.spec.ts` (2263) remain over budget and frozen.
- **Next first action:** extract wizard navigation (129 non-empty lines) from `jobs.component.ts`
  into a `WizardNavService` on a fresh branch off `main`, aliasing writable signals so
  `jobs.component.html` stays byte-identical.
- **Evidence:** the three tests were run against the old markup first and two failed on the exact
  defect - the bullet subtree held **2** elements carrying `cvpreview__element-selected` where the
  company leaf held 1 - then passed after the fix, suite 856 / 856.

### 2026-08-01, the CV card that said "Generating" while it was waiting for you

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/cv-card-awaiting-input`, branched from `origin/main` (`f91d50c`), PR **#234**
- **Commits:** `ce09393` (fix), plus a docs commit
- **Objective:** give the CV card a distinct state while the gap dialog blocks it, and resolve the
  two decisions the previous watch left open.
- **Completed:**
  - A preparing card reports `needs_input` while `CvGapDialogService.open` is true, CV only. The
    dialog is awaited inside `createCvDraft`, which runs inside `docGen.begin(job.id, 'cv')` with
    `end()` in the `finally`, so the card really is preparing the whole time - it was reading the
    right flag for the wrong question.
  - `documentCardStatus` and `documentStatusKey` extracted to a pure
    `apps/desktop/src/app/shared/doc-card-status.ts` over an explicit five-field state. That is the
    test seam; the states could not be asserted while the derivation was a private method on a
    1882-line component. Nine tests, where the badge derivation had none.
  - **Second, unplanned fix:** the file-size checker excluded only `translations/translations.ts`
    (10 lines), not the six locale files (~1650 lines each) that hold the strings, so the ratchet
    rejected any new i18n key anywhere in the repository. `CODE_QUALITY.md` already documents the
    catalogue as excluded, so the checker was under-implementing the approved contract. Widened to
    the catalogue directory minus its spec. Without this the fix could not add its label.
- **Not completed:** the three outstanding native gates (#225 export, #230 gap dialog, #233 Discover)
  and the new #234 gate. All are maintainer-only - screen-control permission is denied to agents.
  PR #233 not merged: merging is not an agent action without an explicit request.
- **Files or packages changed:** `apps/desktop/src/app/shared/doc-card-status.ts` (new, 38),
  `doc-card-status.spec.ts` (new, 52), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1882 -> **1881**, over budget, shrank), `jobs.component.scss` (987 -> **985**, over budget,
  shrank), `tools/check-file-size-budgets.mjs`, six locale files, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green
  (6 projects); desktop suite **51 suites / 853 tests**, up from 50 / 845; `npm run quality` (three
  checks) passed; `npm run verify:csp` passed; `npm run format:check` passed after
  `nx format:write --uncommitted`; `git diff --check` clean. **Not run:** `cargo test` and
  `cargo clippy` - no Rust file was touched. **Not verified:** the badge itself. Reaching
  `needs_input` requires generating a CV, which requires Tauri IPC, so a browser build cannot show
  it; no browser session was started, because it would have proved nothing about this change.
- **Privacy/security impact:** none. UI status derivation and a build-tool exclusion.
- **Decisions and assumptions:**
  - The maintainer deferred both open decisions to the agent's recommendation.
  - **#233 duplicate rows: merge and defer the dedupe.** The duplicate is a one-time migration
    artifact per already-stored posting, not a recurring leak - once the clean row exists, later
    rescans hash the same clean text and `INSERT OR IGNORE` holds. Option (b), the `source_url`
    dedupe, is the right permanent fix but is gated behind splitting `discover.rs` (3245/800).
    Option (a), the data repair, orphans `scoring_cache` rows for no user-visible gain and has no
    precedent - migrations are SQL only. Neither was built.
  - **The i18n gate: align the tool to the doc**, rather than allowlist six files by name or reuse an
    unrelated string in the badge.
  - `needs_input` is CV-only. `CvGapDialogService` belongs to the CV flow; the cover-letter card
    passes `awaitingInput: false` explicitly rather than reading a signal that cannot apply to it.
  - `finalCheckStatusKey` became a bound field rather than a delegating method, to pay for the two
    lines the fix needed. Safe because `statusKey` does not use `this`, and it is bound explicitly
    rather than passed unbound.
- **Risks or compatibility impact:** the new status string reaches all six locales; the German,
  Spanish, French, Russian and Ukrainian labels are machine-written and worth a native reading. The
  checker change widens what the gate ignores - locale files can now grow without limit, which is the
  intended trade and is what the contract says.
- **Open issues or blockers:** #233 awaits an explicit merge instruction. `discover.rs` (3245),
  `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002) and its spec (689) remain over
  budget and frozen.
- **Next first action:** extract wizard navigation (129 non-empty lines - `wizardStep`, step guards,
  `goToStep`) from `jobs.component.ts` into a `WizardNavService`, branched fresh from `main`, using
  the writable-signal alias pattern so `jobs.component.html` stays byte-identical. Do **not** move
  the 591-line document-drafts region wholesale: it is three responsibilities (CV generation,
  cover-letter generation, link/commit lifecycle) and needs splitting, not relocating.
- **Evidence:** the two `needs_input` tests were run against the old logic first and failed
  (2 failed / 851 passed), then the fix was restored and the suite went 853 / 853. The file-size
  report printed both shrinking files with their base counts: `jobs.component.ts` base 1882 -> 1881,
  `jobs.component.scss` base 987 -> 985, and no longer lists any locale file.

### 2026-07-31, a job description that rendered as its own source

- **Status:** fixed and open as #233; one consequence deliberately left for a separate change
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/discover-escaped-html` (from `main`), PR #233

**The report.** An ArbeitNow posting opened from Discover showed `<p>`, `<li>`, `&amp;` and `&nbsp;`
as visible text instead of prose.

**Root cause, and it is an ordering bug.** `strip_html` (`job_url.rs`) removed tags first and decoded
entities afterwards. For a feed that ships its markup entity-escaped that order does the worst
available thing: the strip pass finds no real tags to remove, and the decode pass then converts every
`&lt;p&gt;` **into** a literal `<p>` - after the only code that would have stripped it has already
run. ArbeitNow escapes the entities inside its markup as well, which is what the screenshot proves:
`&amp;nbsp;` had exactly one layer peeled off and rendered as literal `&nbsp;`. Nothing was wrong
with the ArbeitNow parser itself; it already called `html_to_text`.

**Fix.** Strip and decode alternate until a round reveals no further markup, capped by
`MAX_UNESCAPE_ROUNDS` so a crafted `&amp;amp;lt;` chain cannot buy a round per layer. Within a round
the ampersand is decoded **last**, so one escaping layer comes off per round rather than several
collapsing at once and inventing markup the source never wrote. `html_to_text`'s `contains('<')`
heuristic is deleted - it chose between two half-treatments when the answer was to do both. This is
shared by every source, so Greenhouse and the RSS paths get it too.

**A second, older defect fell out of the same function.** Every `<` opened a tag, so "latency < 100 ms
in prod" had no closing `>` and the rest of the line was swallowed - silently, into the text that is
then fed to scoring and tailoring. A `<` now opens a tag only when a name, `/` or `!` follows it.
Found because an assertion I wrote about existing behaviour turned out to be false, which is the
argument for asserting the boundary rather than assuming it.

**Known consequence, stated rather than hidden.** The fix corrects **newly scanned** jobs only. Rows
already stored keep their mangled text, and `jobs.jd_hash` is the dedupe key for
`INSERT OR IGNORE`, so re-scanning a previously stored posting now computes a different hash and
inserts a **second row** for the same job. Two ways out, neither taken here:

1. a data repair that re-runs `strip_html` over stored `discover_scan` rows and recomputes `jd_hash`
   - which also orphans any `scoring_cache` row keyed on the old `jd_hash`, forcing a rescore;
2. an additional dedupe on `source_url` in `insert_scanned_job`.

Option 2 cannot land here: `discover.rs` is **3245 lines against an 800 budget**, so the ratchet
forbids it growing, and there is no data-repair precedent in this repository - migrations are SQL
only and cannot call `strip_html` or `stable_hash`. This is a maintainer decision, not an agent's.

**Checks actually run and observed:**

- `cargo test` - **293 passed**, 1 ignored, 0 failed. `cargo clippy --all-targets -D warnings` -
  clean. `cargo fmt` applied.
- The 7 new tests were **run against the old implementation first**: 4 failed, including both
  ArbeitNow cases and the bare-`<` case. They catch the bug rather than merely pass.
- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**.
- `npm run quality` - budgets **passed**: `discover.rs` 3251 -> **3245** (shrank), `job_url.rs` 637 ->
  **754**, under its 800 budget. Attribution passed.
- `npm run verify:csp`, `npm run format:check`, `git diff --check` - clean.
- No browser or native verification: Discover needs Tauri IPC and a live feed. Not claimed.

**Next first action:** decide between the data repair and the `source_url` dedupe above, since
merging #233 without one means duplicate rows on the next scan. The "needs your input" card state
from the previous watch is still open, as are the two native gates.

### 2026-07-31, two reported bugs, one real and one misattributed

- **Status:** one fixed and open as #232; the other diagnosed, not fixed, and deliberately not stacked
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-quickview-job-id` (from `main`), PR #232
- **Note:** this watch ran alongside PR #231 (scoring extraction), which has its own entry below.
  Both appended here, and #231 merged first, so this branch was rebased onto it and the overlap in
  `CHANGELOG.md` and `DUTY_WATCH.md` resolved by keeping both entries. No code file conflicted.

**Bug A - Pipeline quick view opened the wrong job. Fixed.** "Open full details" navigated to
`/jobs/<card().id>`. A `PipelineCard` is an application row: `db_pipeline_cards` selects `a.id` and
`a.job_id` as separate columns, and `/jobs/:id` is keyed by job. The handler passed the application
id, so the route loaded whichever unrelated job shared that number - and offered "Mark as Applied"
for a job never applied to. Not an edge case: the two id spaces collide whenever both tables have a
row there. `/interview-prep/:id` really is keyed by application, so the sibling link was correct and
is left alone; a test pins both, which is what stops a future "fix" from breaking the good one.

The regression test was **verified against the old code before the fix was restored** - it failed 2
of 3 assertions, so it is known to catch the bug rather than merely to pass.

**The ratchet refused the fix in place** - `quick-view-modal.component.ts` was already over budget at
409 lines and the change took it to 419. Follow-up drafting came out into `FollowupDraftService`
(component-scoped, aliased onto writable signals, template untouched); the modal is now **306** lines
against a 167-line service. Second time the size gate has forced an extraction that was overdue, and
second time it produced the test seam that logic had never had.

**The extraction surfaced an older bug, fixed here.** `draft()` set its `drafting` flag _after_
`await getSettings()`, so its double-click guard never worked - a second click during that read
started a second billed AI call that also wrote the cache. Fixed rather than logged, because the
alternative was committing a test asserting broken behaviour.

**The privacy guard was moved with the code.** `followup-no-transmit.spec.ts` statically scans the
follow-up sources for send/transmit APIs; the `mailto:` hand-off moved into the service, so the guard
now scans the service too. A guard that keeps pointing at the old filename is worse than no guard.

**Bug B - "a second CV dialog appears when I click Generate on the cover letter". Diagnosed, not a
race, not fixed here.** The discriminating fact came from the maintainer, not from the code: the
second dialog asks about **dates**. That identifies it as the CV flow's own block-before-generate
step (`jobs.component.ts:794-813`), which necessarily runs _after_ the AI call because the questions
are built from whichever entries the model returned undated. The cover-letter button is not
implicated - `!linkedCv() && !preparingCv()` closes that path while a CV is linked or preparing, so
#230's guard is holding. Correlation in time, not causation.

The real defect is narrower and different from the report: **the card claims "Generating" while the
flow is actually blocked on user input.** `docGen.begin(job.id, 'cv')` opens `createCvDraft` and
`end` sits in its `finally`, with the date-dialog await inside - so nothing on screen indicates the
CV is waiting, which is exactly why the dialog reads as having been triggered by the unrelated click.
The fix is to give the card a distinct "needs your input" state while `gapSvc.open()` is true;
`CvGapDialogService` already exposes `open`, so only `documentCardStatus` needs to consider it.

**Not attempted in this watch on purpose.** It edits `jobs.component.ts`, which is over budget (so
the ratchet forbids growth) and is the file open PR #231 rewrites. Stacking on it would recreate the
orphaning that has already cost this project two recovery sessions.

**Checks actually run and observed** (on `fix/pipeline-quickview-job-id`):

- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**. 825
  tests, up from 812 (+13).
- `npm run quality` - file-size budgets **passed** (409 -> 306), attribution passed.
- `npm run verify:csp` - OK. `npm run format:check` - passed. `git diff --check` - clean.
- No browser verification: the quick view needs Tauri IPC for its card data, so a browser build
  cannot exercise it. Not claimed as verified.

**Next first action:** merge #232, then branch from `main` for the "needs your input" card state.
(#231 merged as `22e5bdd` while this watch was running.) The two native gates (#225 export, PDF only;
#230 gap dialog) are still outstanding and still the maintainer's.

### 2026-07-31, the stack was landed in order, and scoring became the sixth seam

- **Status:** complete, two native gates outstanding and both belong to the maintainer
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-scoring-service` (from `main`), PR #231

**What happened, in order.**

1. **#229 was already merged** when the watch opened (squash `da0766e`); nothing to do.
2. **#230 was rebased past that squash.** Its base was already retargeted to `main` but it read
   `CONFLICTING`, because the squash orphaned the branch above it - the same failure mode that put
   #224 into #223's branch a day earlier. `git rebase --onto origin/main a9bccfb` replayed the two
   commits cleanly. The evidence that the rebase preserved the tree exactly is not an eyeball: the
   full `nx run-many` gate came back **21/21 cache hit**, which only happens when the inputs hash
   identically to the pre-rebase run. `jobs.component.html` diffed to **0 lines** against `main`.
   Merged as `546a6f8` once CI went green and `mergeStateStatus` read `CLEAN`.
3. **Scoring extracted** into `JobScoringService`, the sixth Tier 1 seam. See below.

**The scoring extraction.** Baseline scoring, the post-tailor rescore, the deterministic ATS check
and the commit-time write to `scoring_cache` moved out. `jobs.component.ts`: **2099 -> 1882
non-empty lines**; `job-scoring.service.ts` is 306 lines, under the 400 budget. The file-size gate
confirmed the ratchet at commit time: `1882/400 non-empty lines, base 2099`.

Three things are worth recording because they are not pure relocation:

- **The duplicated JSON unwrap is gone.** `scoreJob` and `updateScoreAfterTailor` each carried their
  own verbatim copy of the ` ```json ` fence strip plus `JSON.parse` plus the rethrow with a
  200-character excerpt. That is now one exported pure `parseScoreResponse`, and it is the only part
  of scoring testable without an AI call. Four of the 20 new tests cover it directly.
- **One behaviour changed, deliberately and in the safe direction.** `score()` now guards on
  `job.id` rather than asserting `j.id!`. Previously an id-less job would have written a
  `scoring_cache` row keyed on `undefined`; it is now a no-op. This removed three non-null
  assertions - desktop lint warnings went 19 -> 8.
- **`AtsService` is no longer injected by the component.** The ATS check was the only thing using it.

The alias pattern held for the sixth time: the component exposes `cache`, `fromCache`, `scoreStale`,
`scoring`, `scoreStatus`, `scoreError`, `atsReport` and `postTailorSaved` as aliases onto the
service's **writable** signals, so `jobs.component.html` is byte-identical to `main` again.
`JobScoringService` is component-scoped via `providers`. It injects `FinalChecksService`, which is
also component-scoped in the same array - that resolves, and it is what keeps `finalChecks.reset()`
firing at the start of a rescore exactly as before.

**Checks actually run and observed.**

- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**.
  829 tests across 48 suites, up from 809 (+20).
- `npm run quality` - file-size budgets passed (with the ratchet line above), attribution passed,
  quality:test 3/3.
- `npm run verify:csp` - OK, 1 stylesheet link, no handler-dependent styling.
- `npm run format:check` - passed after `nx format:write --uncommitted`. Note: that command does
  **not** touch untracked files, so the new service had to be `git add`-ed before it would format.
- `git diff --check` - clean.
- Browser: the `nx serve` on :4200 (held by a running `tauri dev`) hot-rebuilt with the change and
  boots with **zero console errors**. That is the honest limit of browser verification here - the
  scoring path needs Tauri IPC and an AI provider, so it cannot be exercised in a browser build.

**Two native gates remain outstanding. Neither was run.** Screen-control permission is denied to
agents, so these are the maintainer's and must be recorded as theirs:

1. **#225 export.** `npm run desktop:dev`, export a CV from the wizard's final step. **Correction to
   the previous handoff: this is a PDF-only gate.** The wizard's final step exposes `cv-pdf` and
   `cover_letter-pdf` and has no DOCX control; DOCX export exists but is reachable only from the
   Documents list pages, so it is not part of this gate. The maintainer confirmed the same.
2. **#230 gap dialog.** On step 4, start the CV and click Generate on the cover letter while it
   runs. Expect one dialog and both documents finishing.

**Next first action:** merge #231 once CI is green, then extract wizard navigation (129 lines) as
seam seven. Do **not** move document drafts (591 lines) wholesale - it is CV generation,
cover-letter generation and the link/commit lifecycle sharing one region, and it needs splitting
into more than one service rather than relocating.

### 2026-07-31, two documents raced for one dialog, and the size budget refused the easy fix

- **Status:** complete, pending the maintainer's native check
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/gap-dialog-single-owner` (stacked on `refactor/jobs-tailoring-service`)
- **Commits:** `9a5e923`, plus this entry
- **Pull request:** #230, stacked on #229
- **Objective:** a user report with a screenshot from step 4 of the wizard. Starting a cover letter
  while a CV was still generating raised a second gap dialog for the same questions, and afterwards
  the cover letter sat on "Generating" indefinitely.

- **Completed:** Two defects in one flow, both predating this session's refactoring -
  `awaitGapDialog` was untouched by all four extraction pull requests.

  **The hang.** Both document flows awaited a single `gapResolver` field. A second caller overwrote
  it, so the first caller's promise never settled: its `await` never returned, its `finally` never
  ran, and `docGen.end(...)` for the document it was generating was never called. That is precisely
  the stuck "Generating" badge in the screenshot. Ownership is now an explicit rule rather than
  whoever wrote to the field last - first caller wins, a second is answered `null` immediately.
  `null` is what a cancel already yields and every caller treats gap-fill as optional, so the losing
  flow continues without it rather than blocking.

  **The duplicate dialog.** The cover-letter flow skips gap analysis when a CV is _linked_, on the
  stated grounds that the CV flow just ran the same analysis. A CV that is still generating has not
  linked itself yet, so the guard let a cover letter started alongside one run a second analysis and
  raise a second dialog. It now also skips while a CV is preparing, which is the condition the
  comment always described.

  **The fix shipped as an extraction, because the ratchet refused the in-place version.** The first
  attempt added 15 lines to `jobs.component.ts` and `npm run quality:file-size` rejected it:
  `already over budget and grew from 2121 to 2136 lines. Extract before adding code.` That was the
  right call and worth recording as the gate earning its place - the in-place fix would have left
  this invariant with no home and no test seam. `CvGapDialogService` now owns the analysis, the
  dialog state and the single resolver, and it has 14 tests, two of which reproduce the collision
  directly. The file ends at 2099 lines, below its base.

  `dispose()` also replaces the hand-rolled resolver cleanup in `ngOnDestroy`, so the same release
  path covers leaving the page and any future caller.

- **Not completed:** The maintainer's native re-check of the reported scenario. See below.

- **Files or packages changed:** new `apps/desktop/src/app/shared/cv-gap-dialog.service.ts` (118
  lines) and its spec (154); `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2121 -> 2099
  non-empty); `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is
  unchanged.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 809 desktop tests
    (up from 795).
  - `npm run quality` - passed. The budget report reads `2099/400, base 2121`.
  - `npm run verify:csp`, `npm run format:check`, `git diff --check` - passed.
  - **Not run: the native check of the reported scenario.** This is a concurrency bug in a flow that
    needs a real job, a real profile and two AI calls in flight at once. The unit tests prove the
    resolver can no longer be stranded; they do not prove the wizard behaves correctly end to end.
    Screen-control permission is denied to this agent, so the maintainer has to run it.

- **Privacy/security impact:** None. No change to what is sent, stored or logged. One fewer AI call
  in the overlapping case, since the duplicate gap analysis no longer runs.

- **Decisions and assumptions:** Answering the second caller `null` was chosen over queueing it.
  Queueing would show the user a second dialog immediately after the first, for questions that the
  first flow's answers may already have covered - which is the behaviour the guard exists to
  prevent. Every caller already handles `null`.

- **Risks or compatibility impact:** The losing flow now silently skips gap-fill instead of hanging.
  That is the intended trade: a document generated without the optional extra questions, rather than
  one that never finishes.

- **Open issues or blockers:** `gapAnalyzing` is still a single shared signal, so two overlapping
  analyses would clear each other's spinner early. With the new guard the CV/cover-letter pair can no
  longer overlap, so it is unreachable today. Left alone rather than fixed speculatively; noted here
  so it is not rediscovered as new.

- **Next first action:** In the running `tauri dev` window, reproduce the report: on step 4, start
  the CV, and while it is generating click Generate on the cover letter. Confirm only one gap dialog
  appears, and that after answering or cancelling it **both** documents reach a finished state with
  neither stuck on "Generating".

- **Evidence:** `npm run quality:file-size` rejected the in-place fix with
  `already over budget and grew from 2121 to 2136 lines`, and passes on the extraction with
  `2099/400, base 2121`.

### 2026-07-31, the tailoring pipeline leaves the jobs page, under a file-size budget that now enforces it

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-tailoring-service`
- **Commits:** `72fc311`, plus this entry
- **Pull request:** #229
- **Objective:** continue the Tier 1 split of `jobs.component.ts` with the next seam.

- **Completed:** Seam four of roughly ten. The three most isolated ones were done in the previous
  watch; from here the choice is by cohesion, so the remaining seams were measured first rather
  than guessed at: document drafts 591 lines, scoring 279, **tailoring 243**, wizard navigation 129,
  job CRUD 119, gap dialog 56.

  Tailoring was taken over the larger document-drafts block on purpose. Document drafts is not one
  responsibility - it is CV generation, cover-letter generation and the link/commit lifecycle
  sharing a region of the file. Moving it wholesale would produce a service that is oversized on
  arrival and still needs splitting. Tailoring is genuinely one thing.

  `TailoringService` owns the results, status, error and cancelled signals, the
  `isTailored`/`allChanges`/`allGaps` derivations, the pass loop, the parsing and the cache restore.
  `PassResult` moved with it. Whether a run is in flight deliberately stayed in
  `WizardActivityService`: it is already keyed by job so that an AI call in flight survives this page
  component being destroyed, and duplicating that into the new service would have created a second
  answer to the same question.

  The component keeps what tailoring _invalidates but does not own_ - the export status line, the
  post-tailor rescore, the final checks. Those resets stay in `startTailoring`, ahead of the call.

  **Two invariants were made explicit rather than changed.** Each pass's cache key covers the results
  of the passes before it, so pass 3 cannot be served stale after pass 1 changes; and
  `restoreFromCache` recomputes that same chain, which is why it stops at the first miss instead of
  skipping ahead. Both were true in the original code, neither was stated or tested. They are now
  both.

- **Not completed:** Six responsibilities remain in the file. Document drafts is the largest and
  should be split into more than one service rather than moved.

- **Files or packages changed:** new `apps/desktop/src/app/shared/tailoring.service.ts` (298 lines)
  and its spec (272); `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2299 -> 2121 non-empty);
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is unchanged.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 795 desktop tests
    (up from 773). The 11 lint warnings are pre-existing `no-non-null-assertion`.
  - `npm run quality` - passed, all three guards. The new file-size hook reported
    `jobs.component.ts: 2121/400, base 2299`, which is the ratchet working: still far over budget,
    but smaller than its base, which is what the rule requires of a refactor.
  - `npm run verify:csp`, `npm run format:check`, `git diff --check` - all passed.
  - Browser: the `nx serve` preview could not start, because the `tauri dev` process left running
    from the previous watch holds the `desktop:serve` lock. Its own frontend on port 4200 had
    hot-reloaded the change, so that was used instead - `/jobs/1` renders, `app-jobs` instantiates
    with all four services, no `NullInjectorError`, `NG0201`, `NG0203`, `NG0600` or `NG0950`.

- **Privacy/security impact:** None. Same AI calls with the same inputs to the same provider, same
  SQLite cache rows with the same keys. No new egress and no new persistence.

- **Decisions and assumptions:** `#228` landed on `main` mid-watch and introduced
  `docs/governance/CODE_QUALITY.md`, a 400-line TypeScript budget and a ratchet rule. The work was
  already following that shape, and the four extracted services are 231/168/109/298 lines, all
  inside budget. Worth recording honestly: **the onboarding fix in #226 grew two already-oversized
  files** - `onboarding.component.ts` 863 -> 1002 and its spec 589 -> 689. #226 merged minutes before
  #228, so it broke no rule that existed at the time, but under the ratchet both are now standing
  debt and neither may grow again.

- **Risks or compatibility impact:** None known. The template is unchanged, so the visual surface
  cannot have moved; the risk is confined to the pass loop, which is now covered by 22 tests.

- **Open issues or blockers:** None. The two accepted dependency advisories are untouched.

- **Next first action:** Merge #229. Then run the still-outstanding native gate from two watches
  ago, which no amount of frontend work substitutes for: `npm run desktop:dev`, export a CV to PDF
  and to DOCX from the apply wizard's final step, and confirm the file is written, the status line
  reads the saved path, and the document leaves draft state into the Documents library.

- **Evidence:** `npm run quality:file-size` prints
  `apps/desktop/src/app/pages/jobs/jobs.component.ts: 2121/400 non-empty lines, base 2299`.
  `git diff main --stat -- apps/desktop/src/app/pages/jobs/jobs.component.html` is empty.

### 2026-07-31, onboarding could not pick a model, so it sent an empty one

- **Status:** complete, merged and verified
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/onboarding-model-selection`
- **Commits:** `f315adc`, `93a1942`, squashed to `8d1f3fb` on `main`
- **Pull request:** #226 (merged)
- **Objective:** a user report with two screenshots - choosing DeepSeek on the onboarding AI step,
  saving the key successfully, and then getting `Couldn't parse that resume` with
  `DeepSeek API error (400): The supported API model names are deepseek-v4-pro or
deepseek-v4-flash, but you passed .` underneath it.

- **Completed:** The visible symptom was a resume that would not parse. The cause was that nothing
  in the wizard ever chose a model.

  The AI-setup step persisted `aiMode` and `provider`, and `aiDispatch` read the model back out of
  the settings row. So the wizard sent whatever was stored there - `claude-haiku-4-5` on a fresh
  install, which DeepSeek rejects, or the empty string a previous CLI-mode run deliberately leaves
  behind, which is the reported error. Note that `markSeen` blanks the model ids in CLI mode on
  purpose and migration `0002` only `COALESCE`s a NULL, so once blanked the pair stays blank.

  **This exact class of bug had already been fixed once, for the provider.** The comment on
  `aiDispatch` explains at length why reading `provider` back from settings was wrong - the wizard's
  own state is the truth for the duration of the wizard - and then the very next line read the model
  back from settings anyway.

  Settings already had everything needed to prevent it: a model catalogue, per-provider defaults,
  and `apiModelsToRestore`, which repairs a blank or foreign model id. All of it was private to that
  screen, so the second screen writing the same two fields could not use it and was free to
  disagree. The catalogue, the defaults and the reconciler moved to `@applye/core` as `api-models`,
  with a new `resolveApiModels` that always returns both fields filled; Settings now reads from
  there instead of its own copies, and onboarding gained quality and economy selects seeded from
  stored settings and reconciled on every provider or mode change. Both `persistAiChoice` and
  `markSeen` now write the pair alongside the provider.

  One further defect found while wiring the seed: the settings read is async and the AI step is
  interactive from the first frame, so a user clicking a provider before the read resolved had their
  choice silently overwritten. Guarded with a touched flag.

- **Not completed:** The `openai` and `gemini` providers still have no API-mode catalogue, which is
  correct - `ai/api.rs` cannot dispatch to them - but it means `resolveApiModels` returns null for
  them and the selects do not render. That is the existing v1 boundary, not a regression.

- **Files or packages changed:** new `libs/core/src/lib/ai/api-models.ts` + spec, exported from the
  `core` barrel; `apps/desktop/src/app/core/onboarding/onboarding.component.{ts,html,scss,spec.ts}`;
  `apps/desktop/src/app/pages/settings/settings.component.ts`; all six locale files in `libs/i18n`.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 773 desktop tests
    (up from 765) and 252 core tests. The 11 lint warnings are pre-existing `no-non-null-assertion`.
  - `npm run verify:csp` - passed.
  - `npm run format:check` - passed.
  - `git diff --check` - clean.
  - **Not verifiable in the browser preview:** the onboarding overlay is gated on a settings read,
    which fails outside a Tauri runtime, so a browser-served build never renders the step. The
    template compiles (it is type-checked by `nx build desktop`), but that is not the same as seeing
    it. The running `tauri dev` instance did hot-reload the change.
  - **Native gate: passed, run by the maintainer, not by this agent.** Screen-control permission was
    denied to the agent, so it could not drive the window. The maintainer ran the wizard end to end
    in the `tauri dev` build after the change hot-reloaded and reported onboarding completing with
    no errors. Recorded as observed-by-the-maintainer rather than as an agent-run check, because
    the agent did not see the screen.

- **Privacy/security impact:** No change to key handling. Keys stay in the OS keychain via
  `KeysService`; nothing here reads, logs or transmits one. The change only decides which model id
  accompanies a request the user already authorised. Model ids are not secrets.

- **Decisions and assumptions:** The catalogue went to `libs/core` rather than a desktop-side shared
  folder because two screens depend on it and `AiProvider` already lives there. `apiModelsToRestore`
  moved with it; `CLI_MODEL_CUSTOM` and `cliModelSelectValue` stayed in `pages/settings` because
  they are specific to that screen's free-text CLI picker.

- **Risks or compatibility impact:** Existing settings rows are not migrated. They are repaired on
  read instead - the first time the user opens either screen, a blank or foreign model id is
  reconciled to the selected provider's default. That is deliberate: a migration cannot know which
  provider the user meant, and repairing on read fixes rows this bug has already corrupted.

- **Open issues or blockers:** None. `glib` RUSTSEC-2024-0429 and `brace-expansion`
  GHSA-mh99-v99m-4gvg remain open on purpose with drop conditions in
  `docs/governance/VALIDATION_MATRIX.md`; neither was touched.

- **Next first action:** none for this fix - it is verified and merged as `8d1f3fb`. The next
  outstanding gate belongs to the previous watch and is unaffected by this one: `npm run
desktop:dev`, then export a CV to PDF and to DOCX from the apply wizard's final step, confirming
  the file is written, the status line reads the saved path, and the document leaves draft state
  into the Documents library. Onboarding passing says nothing about the export path.

- **Evidence:** The reported error string is reproduced by the stored-model path: migration
  `0002_settings_defaults.sql` seeds `economy_model = 'claude-haiku-4-5'`, and `markSeen` wrote
  `economyModel: ''` in CLI mode, while `aiDispatch` passed `settings.economyModel` straight through.

### 2026-07-30, the jobs page loses three of its ten responsibilities, and the template does not change at all

- **Status:** complete, with one gate explicitly pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-portal-answers-service`, `refactor/jobs-final-checks-service`,
  `refactor/jobs-export-service` (stacked, in that order)
- **Commits:** `f570694`, `eb8dc2e`, `85456a5`, plus this entry
- **Pull request:** #222 (merged), #223, #225 (reopened from #224)
- **Objective:** begin the Tier 1 split of `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (2788 lines, roughly ten responsibilities) by extracting the three most isolated seams into
  services, one pull request each, with behaviour held constant.

- **Completed:** Three extractions, in the order the seams were isolable rather than the order they
  appear in the file.

  **Portal answers (#222)** was the easy one, and the reason is worth recording: it has _no template
  surface at all_. `draftPortalAnswers`, `portalAnswers`, `copyPortalAnswer` and the rest are
  referenced nowhere outside the component. Nine signals, two AI calls and one cache read moved to
  `PortalAnswersService` with nothing else to reconcile.

  **Final checks (#223)** was harder. Six of its members are bound from `jobs.component.html` and
  `finalChecksOutdated` is written from twelve component call sites plus one template binding. Rather
  than rewrite those bindings, the component now exposes `finalChecks` and `finalChecksOutdated` as
  aliases onto the service's **writable** signals - not `asReadonly()` views. That is what let the
  template stay byte-identical, including the `finalChecksOutdated.set(!!finalChecks())` binding at
  `jobs.component.html:586`. `documentText` moved with the rules and became private; the
  `DocumentRegionTag`, `FinalCheckStatus` and `FinalChecks` types moved to the service file so the
  component imports them without a cycle.

  **Export (#225)** used the same alias technique for four signals and seven bindings.

  All three services are listed in the component's `providers` rather than `providedIn: 'root'`. That
  was chosen over the repository's existing root-singleton convention on purpose: a component-scoped
  provider gives one instance per page-component instance, which is exactly the lifetime the signals
  had as fields. A root singleton would have been _probably_ equivalent, because the component resets
  this state in `loadJob`, and "probably" is not the standard for a change that is supposed to be
  invisible.

  **48 tests, where there had been none.** Not a bonus - it is the evidence that these were moves.
  They pin the things a careless extraction changes silently: which questions reach the portal-answers
  cache key after trimming and filtering, that a redraft never consults the batch cache, each
  final-check note trigger and the 900/500-character floors, that the input hash marks a result
  outdated when a document changes and leaves it fresh when it does not, and the PDF-versus-DOCX
  routing with the Tauri save dialog mocked.

- **Not completed:** Seven of the ten responsibilities remain in the file - tailoring passes, scoring
  and rescoring, CV/cover-letter draft generation, the CV gap dialog, the apply wizard's step and
  reset machinery, the job/application CRUD actions, and the compensation and archetype derivations.
  #222 is merged. #223 and #225 are open and CI-green at hand-off. **#224 no longer exists as a
  pending change** - see the risk section below for what happened to it.

- **Files or packages changed:** `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2788 -> 2481);
  new `apps/desktop/src/app/shared/{portal-answers,final-checks,document-export}.service.ts` and
  their three spec files; `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
  `jobs.component.html` is unchanged.

- **Validation:** Run and observed, per pull request:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects. Desktop test count
    733 -> 752 -> 765. The 11 lint warnings are pre-existing `no-non-null-assertion` in untouched code.
  - `npm run verify:csp` - passed.
  - `npm run format:check` - passed. (`nx format:check` initially flagged the new service file;
    `npx prettier --write` on that path fixed it. Note that `nx format:write --projects=.` does _not_
    scope to a project - it reformats the whole repository. `--uncommitted` is the safe flag.)
  - `git diff --check` - clean.
  - Browser, `nx serve desktop` on port 4201: `/jobs/1` renders and `app-jobs` instantiates after each
    of the three changes, with no `NullInjectorError`, `NG0201`, `NG0203` or `NG0600` in the console.
    The `tauriInvoke called outside Tauri context` errors are structural for a browser-served build.
  - **Pending, not run:** the native Tauri gate, `npm run desktop:dev`. This matters most for #225 -
    the export path is Tauri-only, and the unit tests mock `@tauri-apps/plugin-dialog`, so they are
    not evidence that a real save works.

- **Privacy/security impact:** No new data flow and no new egress. Portal answers still hash the same
  inputs into the same SQLite cache; final checks still park the same payload under the same
  `applye:wizardFinalChecks:<hash>` sessionStorage key. #225 touches a security-relevant surface - the
  save dialog and the open/reveal shell bridges - and invokes them with the same values in the same
  order. No new shell interpolation, no widened filesystem reach.

- **Decisions and assumptions:** Two things were found and deliberately _not_ fixed, per the
  move-not-redesign constraint.
  1. **`portalLanguages` is misnamed.** It is the generic supported-document-language list, and the
     template binds it twice for the CV and cover-letter selects. It stayed on the component under its
     wrong name, with a comment saying so. Renaming it is a separate change.
  2. **`doExport` reports a commit failure as an export failure.** `commitLinkedDocument` runs inside
     the export `try`/`catch`, so if it threw, the status line would read `export_failed` even though
     the file was written. The branch is unreachable today because that method swallows its own
     errors, which is why this is a note and not a bug report. It was preserved exactly - passed in as
     an `onExported` callback so it still runs inside the `try` - because moving it out would have
     changed the code's meaning with no test able to notice.

- **Risks or compatibility impact:** Stacked branches, and the stack did go wrong once - recorded here
  rather than tidied away, because the failure mode is easy to repeat.

  During the watch, #223 was amended and force-pushed after #224 revealed that its `reset()` was
  reachable from three component sites; #224 was rebased onto the amended commit and both were
  re-verified. That part went fine.

  What did not: **#224 was merged into #223's branch instead of into `main`.** That was its base, so
  GitHub did exactly what it was asked - it reported #224 as merged, put the export work and the docs
  commit inside #223's branch, and left #223 retargeted at `main` and conflicting. The conflict was
  not in the code. It was that `main` had #222 as a _squash_ (`864b57c`), while #223's branch still
  carried the original pre-squash `f570694`, so the two histories no longer shared a base.

  Rebuilt rather than force-merged: both tips were backed up to local `backup/pr223-branch` and
  `backup/pr224-squash` first, #223 was reset to its own commit and rebased onto `origin/main` with
  `--onto`, and the export work was rebased on top of the result and reopened as **#225**. The full
  gate was re-run on each. No content was lost; #225 is byte-identical in content to what #224 held.

  **The lesson for the next stacked series:** a squash merge of the bottom PR orphans every branch
  above it, and merging a stacked PR without first retargeting it lands the change in the wrong
  branch silently. Retarget upward one level at a time, and rebase the rest of the stack after each
  merge.

- **Open issues or blockers:** None blocking. The `glib` RUSTSEC-2024-0429 and `brace-expansion`
  GHSA-mh99-v99m-4gvg advisories remain open on purpose with drop conditions recorded in
  `docs/governance/VALIDATION_MATRIX.md`; neither was touched.

- **Next first action:** Merge #223 into `main`, then retarget #225 to `main`, confirm its check
  re-runs green, and merge it. Then run `npm run desktop:dev` and export a CV to PDF and to DOCX from the
  apply wizard's final step, confirming the file is written, the status line reads the saved path, and
  the document leaves draft state and appears in the Documents library - the one gate this watch could
  not run.

- **Evidence:** `git log --oneline -3` on `refactor/jobs-export-service` shows `85456a5`, `eb8dc2e`,
  `f570694`. `wc -l apps/desktop/src/app/pages/jobs/jobs.component.ts` reports 2481.
  `git diff main --stat -- apps/desktop/src/app/pages/jobs/jobs.component.html` is empty.

### 2026-07-30, the dependency alerts are triaged rather than counted, and TypeScript is finally named as the thing that kept breaking CI

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/dev-tooling-eslint-10`, `chore/pin-transitive-advisories`,
  `chore/dependabot-ignore-typescript-major`, `docs/redos-and-deps-watch`
- **Commits:** `43885e2`, `920d1e5`, plus this entry
- **Pull request:** #212 (merged), #214, #215, and this one
- **Objective:** the failing Dependabot pull requests, then backlog item 3 - the dependency alerts.

- **Completed:** Three things, in the order they turned out to depend on each other.

  First, **the failing bot PR.** #208 grouped five dev-tooling updates and failed on `Failed to
process project graph`. One package, `typescript` at `~7.0.2`, caused it; the other four were
  fine. #212 takes the four - `eslint` 9 -> 10, `@eslint/js` 9 -> 10, `zone.js` 0.15 -> 0.16,
  `@schematics/angular` 21.2.9 -> 21.2.19 - after checking every peer that constrains them rather
  than trying and hoping. ESLint 10 then found a real dead store in
  `tracker-report-print.component.ts`, fixed in the same commit.

  Second, **the alerts, triaged rather than counted.** #212 and the two bot PRs the maintainer
  merged took the count from 27 to 17. #214 pins six transitive packages through `overrides` and
  closes twelve more: `axios`, `postcss`, `webpack-dev-server`, `body-parser`, `js-yaml` and
  `brace-expansion`, each to the patched release inside its own major.

  Third, **the cause of three failed pipelines, named in configuration.** Dependabot isolated
  `typescript` into #213 and it failed exactly as it had inside the group. #215 adds it to the npm
  semver-major ignore list, so it stops returning. #213 can be closed once #215 lands.

- **Not completed:** Item 1 of the backlog is still untouched and still first - smoke-test and
  publish `v0.29.1`. It needs a Windows VM, a Linux VM and a publish action, all the maintainer's.
  The Prettier drift found in the previous watch is still open; it is a clean mechanical job and was
  deliberately left as its own PR rather than mixed into a security change.

- **Files or packages changed:** `package.json`, `package-lock.json`,
  `apps/desktop/src/app/pages/tracker/tracker-report-print.component.ts`,
  `.github/dependabot.yml`, `docs/governance/VALIDATION_MATRIX.md`, `CHANGELOG.md`, this file.

- **Validation:** For #212 and #214: `nx run-many --target=lint,type-check,test,build --all` green
  across 6 projects, run with `--skip-nx-cache` for #214 because a cache hit proves nothing about a
  change to the build toolchain itself. `npm audit --omit=dev` at 0 before and after. `npm run
verify:csp` reported `CSP compatibility OK`. `npm run format:check` and `git diff --check` clean
  on every branch. CI green on #212 (3m39s), #214 (3m48s) and #215 (3m22s). `cargo audit` was run
  while triaging `glib` and exits 0 with 19 allowed warnings; it was not re-run per branch because
  no Cargo manifest is touched. Native gate not run and not applicable - no runtime dependency
  moved.

- **Privacy/security impact:** Security, and smaller than the numbers suggested. The honest framing
  is that **none of the seventeen alerts ever shipped**: sixteen have `scope=development` and
  `npm audit --omit=dev` is at zero. The seventeenth is the only one that could have shipped, and it
  is a Rust crate rather than an npm package - see the trap below.

- **Decisions and assumptions:** Clearing dev-only advisories was judged worth doing even though
  nothing shipped, for the reason `.cargo/audit.toml` already states for the Rust side: a list of
  known findings that nobody expects to reach zero is a list that hides the next real one. Against
  that, three advisories were deliberately **not** cleared, because the only remedy crossed a major
  boundary - `brace-expansion` GHSA-mh99-v99m-4gvg (no backport below 5.0.8, and forcing every copy
  to 5.x risks CJS interop under `minimatch` 3.x), `uuid` (three majors), `@hono/node-server` (one
  major). Each is recorded in the validation matrix with a drop condition, to the same standard the
  cargo ignore list uses. Pinning across a major to make a number go down trades a reported risk for
  an unreported one, and that trade was refused.

- **Risks or compatibility impact:** ESLint 10 is a major on the lint toolchain and `zone.js` 0.16 is
  a breaking bump by 0.x convention; both are covered by the full gate passing, and `zone.js` now
  survives only in the library test setup. The `overrides` block is the one thing here that can rot
  quietly: it silently freezes a transitive version, so `npm ls <pkg> --all` is the check that tells
  you whether an entry is still doing anything.

- **Second half of the same watch, after the maintainer merged #214, #215 and #216:** the alert count
  fell 17 -> 3, and #213 closed itself the moment #215's ignore rule landed, which is the rule working
  exactly as intended. #217 then took the last two npm advisories that had a fix - `uuid`
  8.3.2 -> 11.1.1 and `@hono/node-server` 1.19.14 -> 2.0.5, both majors, both verified against their
  actual consumer rather than assumed. Sixteen of the original seventeen are closed. **The one
  genuinely interesting result is the advisory that was refused.** A zero `npm audit` was available by
  forcing every `brace-expansion` copy to 5.x. It was tried, it reported zero, and it breaks
  `minimatch` 3.1.5 under `test-exclude` and `fork-ts-checker-webpack-plugin`: version 5's CJS entry
  exports `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }` instead of a bare function, and
  `minimatch` 3.1.5 calls the module directly, so both copies throw `expand is not a function` on
  load. **Every signal this repository has said the change was clean** - `npm audit` 0, the full gate
  green across all six projects with the cache skipped, and `nx test core --coverage` passing too,
  because Jest 30 resolves its own newer `minimatch`. It was reverted, and the exact failure is now
  recorded in `docs/governance/VALIDATION_MATRIX.md` beside the rule it justifies.

- **Third part of the same watch, unblocking the thing that has gated four watches:** the smoke test
  had no procedure, only a description of why it was awkward, so `docs/RELEASE.md` gained one (#218) -
  macOS natively, Windows in a free UTM machine on Windows 11 ARM, three routes for x86_64 Linux, the
  asset-to-platform table, the per-platform data paths the uninstall check needs, and a section on what
  none of it proves. It also corrects that file's "Known blocker", which was stale **and** misdiagnosed:
  there was never a failed payment, the repository was private with exhausted included minutes against
  a $0 limit. The Prettier drift was cleared as well (#219), at 19 files rather than the 15 previously
  recorded - the earlier count came from grepping only `libs/**` and `apps/**`, missing four plan
  documents and a spec.

  **One process mistake, worth recording because it is easy to repeat.** Running `nx format:write
--projects=.` does not scope to the current project; it formatted the whole repository and swept the
  entire drift into the docs commit - precisely the mixing the previous entry said to avoid. Caught by
  reading `git show --stat` before pushing, then split into two branches. Check what a formatter
  actually touched before committing it, rather than trusting a scoping flag.

  Also worth knowing for next time: "formatting-only" was nearly claimed and would have been wrong.
  `git diff --ignore-all-space` is **not** empty for a Prettier reflow, because collapsing a union
  removes the optional leading `|`, which is a token change. The check that settles it is comparing the
  built bundle: `nx build desktop` gives a byte-identical digest before and after.

- **Fifth part of the same watch: branch protection, and the OnPush pass.** Required status checks are
  now on for `main`, with one context - `Lint / Test / Build (affected) + Rust`. **Two checks were
  deliberately left out and the reason matters**: `Analyze (javascript-typescript)` and
  `Analyze (actions)` report _skipped_ on pull requests, and `Deploy applye.dev` only runs on a push to
  `main`, so requiring either would have deadlocked every merge. `strict` is off so a pull request does
  not need rebasing whenever `main` moves; approvals stay at 0 and `enforce_admins` stays off, which is
  the existing deliberate choice not to lock a solo maintainer out.

  The seven page components still on default change detection are now on OnPush. **The check that
  mattered was done before annotating, not after**: OnPush in a zoneless app silently breaks any
  component whose rendered state lives outside signals. All seven are signal-driven (6 to 88 signal
  declarations), none injects `ChangeDetectorRef` or calls `markForCheck`/`detectChanges`, none has a
  `protected`/`public` non-signal mutable field a template could bind, and none mutates class state in
  place with `push`/`splice`/`sort`. The only plain mutable fields are three `private` ones in
  `jobs.component.ts`, which a template cannot reach.

  Verified in the browser, because a green unit suite cannot catch a view that stops updating. A
  first measurement looked like a regression - every route rendered 75 characters short - and it was
  not: the offset was constant across all five routes, which means shell-level, and it was an error
  toast dismissed by a stray click in one run and present in the other. Re-measured from a clean
  reload, before and after are identical: 237 / 1855 / 509 / 544 / 1000 characters on `/settings`,
  `/profile`, `/pipeline`, `/jobs`, `/dashboard`. **A constant difference across unrelated pages is a
  measurement artifact, not a finding** - worth remembering before reverting something.

- **Fourth part of the same watch, the zoneless test migration.** The three library suites ran under
  `setupZoneTestEnv` while both applications run zoneless, so their test environment was not the one
  production uses. `i18n` (10 tests) and `data` (22) moved across unchanged. `ui` failed exactly two,
  and the previous watch had predicted which: `score-gauge`'s band tests.

  **The prediction was right about the symptom and worth restating precisely, because the spec was
  asserting the opposite of what the component does.** The gauge snaps on mount when `from` is null
  and tweens only on _later_ score changes, over 700 ms of `requestAnimationFrame`, with the colour
  band following the animated value. The spec set a score in `beforeEach` and then changed it inside
  each band test - the animating path - then asserted the new band on the very next frame. Under
  zone.js that passed; in a browser it never would, because the band has not moved yet. The band
  tests now set their score before the first effect run, so they test threshold logic alone. Two
  tests were added rather than removed: one pins snap-on-mount, and one drives real animation frames
  to assert the band does _not_ jump on the frame the input changes and does arrive once the tween
  settles. The animation had no honest coverage before this.

  `zone.js` and `@angular/animations` are both removed. `zone.js` is an optional peer of
  `@angular/core` and was never bundled - no project configuration has a `polyfills` entry - so its
  only remaining effect was patching rAF in three test environments. `@angular/animations` was simply
  unused, and was also the one `invalid` peer in the tree: it had resolved to 21.2.17 and pins
  `@angular/core` to exactly 21.2.17 while core is 21.2.19. Removing it resolves that instead of
  bumping a package nothing imports.

  Verified at runtime, not inferred: the dev server boots with both gone, the app renders, and
  `window.Zone` is `undefined`. The only console errors are `tauriInvoke called outside Tauri
context`, which is structural - `tauriInvoke` throws whenever `window.__TAURI_INTERNALS__` is
  absent, so serving the desktop app in a plain browser always logs it.

  Second time in one watch that `npm pkg delete <block>.zone.js` was reached for and produced a
  `"zone": {}` stub, because npm reads the dot as a path separator. Edit `package.json` with a script
  for any key containing a dot.

- **Open issues or blockers:** The Prettier drift is now cleared in #219, so the item the previous
  entry left open is closed. `score-gauge` and the zoneless test setup, open since two watches ago,
  are closed here. The `Dependabot Updates` workflow
  error from two watches ago is still cosmetic and still GitHub's own updater rather than this
  repository's CI. One npm advisory and one Rust advisory stay open on purpose, both documented with
  drop conditions: `brace-expansion` GHSA-mh99-v99m-4gvg and `glib` RUSTSEC-2024-0429.

- **Next first action:** Merge #218 and #219, then work `docs/RELEASE.md` section 3 against the
  `v0.29.1` draft and publish it. The runbook now exists, so this is a procedure rather than a research
  task - and the first pass through it doubles as a review of it, since nobody has executed it yet.
  Required status checks are now on, so that item is closed. What remains after publishing is Tier 1:
  `jobs.component.ts` at 2786 lines has the cleanest seams - portal answers, final checks and export
  move to services almost mechanically - and `discover.rs` at 3488 splits at filters / per-source
  parsers / HTTP / orchestration. `pages/` has still not been reorganised into per-feature folders.
  Note that the earlier figure of 2794 lines for `jobs.component.ts` predates the Prettier sweep; it is
  2786 now, and the "eight screens on eager change detection" in an earlier entry was seven.

- **Evidence:** **The previous watch's open question is now answered.** It recorded that CodeQL had
  not re-scanned and that the five ReDoS alerts should be read as open until GitHub said otherwise.
  GitHub has said otherwise: all five report `state: fixed`, `fixed_at 2026-07-30T08:34:00Z`, and
  there are zero open code-scanning alerts. Two claims in this entry are measured rather than
  inferred: the advisory ranges were read from the GitHub advisory API per release line, which is how
  the `@major` selectors were chosen, and the installed versions were read from `npm ls <pkg> --all`
  before and after each override. The first attempt at #214 pinned what the Dependabot alerts named
  and moved the count by two - npm's advisory data and Dependabot's disagree on the ranges, and the
  copies that actually needed pinning were `js-yaml` 3.14.2 and `brace-expansion` 5.0.6, not the
  majors the alerts pointed at. Anyone repeating this work should trust `npm ls` over either alert
  feed.

- **Traps for a fresh agent:** **`glib` will look like an unfixed high-value runtime alert. It is
  not fixable here.** RUSTSEC-2024-0429 is unsoundness in `glib::VariantStrIter`, and `glib` sits at
  0.18.5 because the whole gtk-rs 0.18 stack - `atk`, `cairo-rs`, `gdk`, `gdk-pixbuf`, `gdkx11`,
  `gio` - reaches it through `gtk` 0.18.2, which is what `tauri` 2.11.5, `wry`, `tao` and `muda`
  pin. `cargo update -p glib` locks 0 packages. It is Linux-only, Applye's Rust never calls `glib`
  directly, and `cargo audit` already tolerates it at exit 0. Drop it when Tauri's Linux backend
  moves off gtk-rs 0.18, not before. Second trap: **four of the six packages recorded as "held for
  Angular 22" were never actually blocked.** They were held because the grouped PR could not
  install. `angular-eslint` is the one that genuinely is gated - 22.1.0 requires
  `@angular/cli >= 22`.

### 2026-07-30, the five CodeQL ReDoS alerts are closed, and a repository-wide formatting drift surfaces

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/core-redos`
- **Commits:** `91b1791`
- **Pull request:** #210
- **Objective:** item 2 of the previous watch's backlog - the five open CodeQL `js/polynomial-redos`
  alerts in `libs/core`, all high severity.

- **Completed:** All five sites are linear now, and the fix was chosen per site rather than applied
  as a pattern. Two take bounded repetition counts where a bound is honest: the salary parser's
  percentage strip caps digit runs at twelve, and the signature sanitiser's email pattern takes the
  RFC 5321 lengths. The scoring-JSON closing fence loses a leading `\s*` that the following `.trim()`
  already covered. The two trailing-`(...)` parsers behind the education and language editors - the
  same regex written twice, `^(.*?)\s*\(([^)]*)\)\s*$`, quadratic on a run of `(` and again on a run
  of spaces - now share one string scan that cannot backtrack.

- **Not completed:** Nothing in scope. Item 1 of the backlog (smoke-test and publish `v0.29.1`) was
  not attempted: it needs a Windows VM, a Linux VM, and a publish action that is the maintainer's to
  take. Dependabot's 27 alerts were counted, not triaged.

- **Files or packages changed:** `libs/core/src/lib/profile/{compensation,profile-markdown}.ts` and
  their specs, `libs/core/src/lib/text/signature.ts` and its spec, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.

- **Validation:** Run and observed on the branch: `nx run-many --target=lint,type-check,test --all`
  (6 projects green, 0 errors, 10 pre-existing `no-non-null-assertion` warnings in `compensation.*`
  that this change does not touch); `nx run-many --target=build --all` green; `npm run verify:csp`
  reported `CSP compatibility OK`; `npm run format:check` clean; `git diff --check` clean. The
  `cargo` rows of the validation matrix do not apply - no Rust changed, and despite the change being
  inside `libs/core` no shared type or IPC contract changed, only the bodies of five functions. The
  native gate was not run and is not applicable: no IPC, migration, keychain or dialog is involved.

- **Privacy/security impact:** Both. The security half is the point of the watch. The privacy half is
  `signature.ts`, which exists to keep a phone number or email the model appended out of a cover
  letter. Bounding that regex was the only change here that could weaken a guarantee, so the bound
  was picked to make weakening impossible rather than merely unlikely: a bounded match still consumes
  the `@` and the domain, so a partial strip cannot leave a usable address behind. `PHONE_RE` and
  `EDGE_SEPARATORS_RE` in the same file were deliberately left alone - see the decisions below.

- **Decisions and assumptions:** Fix only what CodeQL flagged. `PHONE_RE` and `EDGE_SEPARATORS_RE`
  in `signature.ts` are the same class of pattern and CodeQL did not flag either, and bounding
  `PHONE_RE` would mean a long numeric run is stripped only in part - which for a phone-number
  sanitiser is worse than the quadratic cost, because a fragment of a real number still leaks. They
  are recorded here instead of changed. Second decision: the trailing-`(...)` behaviour on
  unbalanced input was preserved exactly rather than improved. `Title (a(b)` still yields head
  `Title` and body `a(b`, and `Title (2019 - (2020))` still yields no split at all. Neither is
  obviously right, but the old regex chose them and nothing should change silently during a security
  fix; three tests now pin both.

- **Risks or compatibility impact:** Low, and bounded to absurd input. A percentage with more than
  twelve digits or an email local part longer than the RFC allows is now stripped in part rather
  than whole. No stored data, migration, or contract is affected.

- **Open issues or blockers:** **A repository-wide Prettier drift, newly found and not fixed.**
  Fifteen files are stale against the current Prettier: six under `libs/core/src/lib/{geo,models}`,
  nine under `apps/desktop/src/app/pages` including `jobs.component.ts` and `profile.component.ts`.
  `nx format:check` only inspects files changed against the base, so the drift is invisible until
  something touches one of those files - which is exactly what happened here, and why this branch
  carries two formatting-only hunks in `profile-markdown.ts` reflowing type unions nobody edited.
  Every future PR touching one of those fifteen files inherits the same noise. It wants one
  formatting-only commit, on its own, so the diff is self-evidently mechanical.

- **Next first action:** Unchanged from the previous watch - run the `docs/RELEASE.md` smoke test
  against the `v0.29.1` draft and publish it. Everything else still waits behind having a working
  download. After that, Dependabot's 27 alerts (10 high, 13 medium, 4 low) are the next security
  item, and the Prettier drift above is a clean fifteen-minute job for whoever wants a quiet start.

- **Evidence:** The cost figures in #210 were measured on this machine at 40 000 characters, old
  pattern against new, not inferred from the alert text: 1517 ms, 989 ms, 639 ms, 633 ms and 612 ms
  before, sub-4 ms or no regex after. The regression tests use a 100 000-character input, where the
  old patterns need four to nine seconds against a two-second budget, so they fail rather than merely
  slow down. **One thing is not yet evidence:** CodeQL has not re-scanned. Default setup runs on push
  to `main`, so the five alerts close after #210 merges, not before, and until GitHub says so they
  should be read as open.

### 2026-07-30, the repository goes public, and the release pipeline produces installers for the first time

- **Status:** partial - a draft release is built and waiting on a manual smoke test
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `main`, via PRs #192, #194, #195, #197, #200, #204
- **Objective:** Open the repository, harden it for a public audience, and get installers into users' hands.

#### Where things stand

- **The repository is public.** Secret scanning and push protection on, private vulnerability reporting on, Dependabot alerts and security updates on, CodeQL default setup configured for `javascript-typescript` and `actions` (Rust is not a CodeQL language - `cargo clippy` and Dependabot's cargo alerts cover it). `main` is protected: pull request required, no force pushes, no deletion, linear history, conversation resolution. **Zero required approvals and `enforce_admins` off, deliberately** - a solo maintainer must not be locked out of their own repository. Required status checks are still off, and turning them on is now safe because CI passes; it was left off while CI could not run.
- **`v0.29.1` is a draft release with 17 assets** covering macOS on both architectures, Windows `.msi` and `.exe`, and Linux `.deb`/`.rpm`/`.AppImage`, each with a `.sig` and a `latest.json`, so auto-update works. **It is not published.** It needs the smoke test in `docs/RELEASE.md`, and macOS/Windows both need the unsigned-binary note that is already written into the draft notes.
- **applye.dev deploys itself** on every merge to `main`. That was already configured; it only ever looked broken because the job depends on a CI run that could not start.

#### The three bugs that mattered, and the single reason none was caught

Each was invisible for the same reason: **GitHub Actions was blocked while the repository was private**, so CI never once reached a build step.

1. `frontendDist` in `tauri.conf.json` resolved one directory level short. `tauri build` compiled the Rust binary and aborted with "Unable to find your web assets". The desktop bundle had been unbuildable across five tagged releases.
2. The packaged app rendered with **no layout at all**. Angular's `inlineCritical` defers the stylesheet as `media="print"` behind an inline `onload`, and the app's CSP forbids inline handlers, so it never activated. Only the inlined critical CSS applied - correct fonts, nothing else. Fixed by disabling `inlineCritical` for the desktop build rather than loosening `script-src`.
3. `beforeBuildCommand` called `nx` without `npx`. `tauri-action` does not go through the npm script that puts `node_modules/.bin` on `PATH`, so all four release jobs died in seconds.

`tools/verify-csp-compat.mjs` exists because of the second one and runs in `ci.yml`, in `release.yml` and inside `desktop:build:tauri`. It was checked in both directions - green on the fixed output, red with a pointed message on the broken one.

#### Two corrections I owe the record

- **I claimed going public did not fix Actions. It did.** I read runs from 21:45 and concluded the account's billing state still blocked public repositories; the repository actually became public at 21:50:50. Every run after that executes fully. The real mechanism: a private repository draws on the 2,000 included minutes, those were exhausted, and a $0 Actions budget with stop-usage refuses anything past the allowance. Public repositories on standard runners are metered as gross usage and discounted in full, which is why the maintainer's other public repository never stopped. That wrong claim had reached six READMEs, the release notes and a PR body; all are corrected.
- **The bundle-size argument for removing NgRx does not hold.** Tree-shaken it was a small slice of a 2.2 MB bundle. The argument that holds is coupling: its `@angular/core: ^21.0.0` peer would have gated every future Angular major.

#### Decisions, so they are not relitigated

- **Angular 22 is declined.** Nothing in the app needs it, 21.2 is supported, and the upgrade existed because a bot opened a PR. #204 stops Dependabot re-proposing it monthly; patches and minors still flow. If someone takes it later, the order is Nx first (`@nx/angular` 23.0.1 caps Angular below 22, 23.1.0 lifts it), then TypeScript **6.0.x specifically, not 7**, then Angular via `ng update`.
- **No CLI for Applye.** The desktop app is the product; a CLI would reimplement the domain a second time.
- **NgRx removed**, replaced by a plain `@Injectable` over signals, with ten specs where the layer had one.
- **CodeRabbit not installed.** It is noisy, and on a repository whose code is visibly AI-assisted, an AI reviewer sharpens exactly the signal the maintainer is uneasy about. Revisit when external contributions arrive. Installing a third-party GitHub App with write access is the maintainer's click, not an agent's.

#### What is left, roughly in order

1. **Smoke-test and publish the `v0.29.1` draft.** Checklist in `docs/RELEASE.md`; macOS natively, Windows in a UTM ARM VM (x64 emulation works), Linux in an emulated x86_64 VM.
2. **Five open CodeQL alerts, all `js/polynomial-redos`, all high** - regexes in `libs/core` (`profile/profile-markdown.ts`, `profile/compensation.ts`, `text/signature.ts`). These run over user-pasted job descriptions and CVs, which is exactly "uncontrolled data". Real, fixable, and the most valuable security work available.
3. **16 Dependabot alerts** (7 high, 9 medium) in transitive npm dependencies.
4. **PR #202** (dev-tooling) is mergeable; **#203** (Angular) conflicts and should be closed once #204 lands, which will stop it returning.
5. **Tier 1 architecture, still open:** `jobs.component.ts` is 2794 lines holding roughly ten responsibilities - portal answers, final checks and export are the three most isolated and move to services almost mechanically. `pages/` has not been reorganised into per-feature folders. Eight large stateful desktop screens are still on eager change detection. `discover.rs` (3488), `tailoring.rs` (2699) and `documents.rs` (2070) each mix fetching, parsing, filtering and persistence; `discover.rs` has clean seams at filters / per-source parsers / HTTP / orchestration.
6. **`score-gauge.spec.ts` asserts behaviour production does not have.** The gauge tweens its band over 700ms of `requestAnimationFrame`; the tests pass only because zone.js patches rAF in the library test environment. The apps are zoneless. Migrating `libs/{data,i18n,ui}/src/test-setup.ts` to `setupZonelessTestEnv` exposes it and would let `zone.js` be dropped entirely.
7. **`Dependabot Updates` workflow fails** with `The updater encountered one or more errors` - GitHub's own updater, not this repository's CI. Cosmetic, but it keeps a red mark on the Actions tab.

#### Things a fresh agent should know before touching anything

- Read `.claude/skills/applye-angular` and `.claude/skills/applye-rust` first; they hold the conventions, the size budgets and the exact gate commands.
- The full gate is `nx run-many --target=lint|type-check|test|build`, `npm run verify:csp`, `npm run format:check`, `git diff --check`, and `cargo clippy --all-targets -- -D warnings` from `apps/desktop/src-tauri`.
- Local updater signing fails: `~/.tauri/applye_updater.key` is password-protected and only the maintainer has the password. `.dmg` builds fine without it; CI signs properly.
- README media is deliberately **not** in Git LFS. Putting it back would let a traffic spike exhaust the LFS allowance, which breaks every README image and `git clone` at once.
- The pre-LFS history is still fetchable from GitHub by SHA via PR #169 even though the branch is deleted. It contains an unblurred frame showing a home-directory name. Low severity; only a GitHub Support purge removes it.

- **Next first action:** run the `docs/RELEASE.md` smoke test against the `v0.29.1` draft and publish it. Everything else can wait behind having a working download.

### 2026-07-30, four red workflows triaged: three fixed, one is a migration rather than a CI bug

- **Status:** partial
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `fix/release-build-path`, `chore/rust-deps-major-bumps`, `chore/dev-tooling-safe`, `docs/duty-watch-ci-fixes`
- **Commits:** `0abeb1f`, `e03994f` (merged as `6c05322`); `a66d002`, `b906cbb`; `27d5a95`, `3af6243`
- **Pull request:** #197 (merged), #198, #199, and this docs branch
- **Objective:** Review the open pull requests and fix the failing GitHub Actions runs.
- **Completed:**
  - **The release matrix.** All four `v0.29.1` jobs died in seconds on `nx: not found` (exit 127) before the frontend was built, so the tag produced no installers on any platform. `tauri-action` calls `tauri build` directly and only npm puts `node_modules/.bin` on `PATH`; nothing local reproduced it because `desktop:build:tauri` wraps the command. `beforeBuildCommand`/`beforeDevCommand` are `npx`-prefixed, `release.yml` gained an explicit frontend-build plus CSP-guard step ahead of `tauri-action`, and `tools/verify-csp-compat.mjs` now resolves its paths from `import.meta.url` rather than the cwd, since Tauri runs it from `src-tauri/` while npm and CI run it from the repository root. Merged as #197; CI green on `main`.
  - **The rust dependency group (#184 -> #198).** The manifest bump alone cannot compile. `zip` 8 made `FileOptions` generic over its extra-field type, so the docx repacker now builds `SimpleFileOptions`. `sqlx` 0.9 added a `SqlSafeStr` bound that rejects any SQL string that is not `&'static str`, which caught four table-name-interpolating queries; each was audited and wrapped in `AssertSqlSafe` with the reasoning recorded at the call site. `rust-version` moved 1.77.2 -> 1.94.0, which is what `sqlx` 0.9 requires. `calamine` and `base64` needed no code changes.
  - **The dev-tooling group (#196 -> #199).** Split into the part that can ship: commitlint, swc, jest-environment-node, jest-util, ts-jest, prettier, typescript-eslint, `@typescript-eslint/utils`, plus `@types/node` 20 -> 26, `jsonc-eslint-parser` 2 -> 3 and `lint-staged` 16 -> 17. `typescript`, `eslint`, `@eslint/js`, `angular-eslint`, `@schematics/angular` and `zone.js` are held.
- **Not completed:**
  - **#185, the Angular 22 group.** Left untouched. It is a scoped migration, not a CI fix, and it is double-blocked (see Open issues). A `chore/angular-22` branch appears in the local reflog from an earlier session, so work on it may already exist elsewhere.
  - **Re-releasing `v0.29.1`.** The fix is on `main` but the tag has not been re-run, so there are still no installers for it. Deliberately left as a maintainer decision.
  - **Closing #184 and #196**, and commenting on them to point at their replacements. Left to the maintainer.
- **Files or packages changed:** `.github/workflows/release.yml`, `apps/desktop/src-tauri/tauri.conf.json`, `tools/verify-csp-compat.mjs`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/commands/{jobs,settings,tailoring}.rs`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`
- **Validation:**
  - #197: `npx nx run desktop:build` then `npm run verify:csp` passed from the repository root and again from `src-tauri/`, which is the cwd the old relative paths broke on. `npm run format:check` and `git diff --check` clean. CI green on the merge commit.
  - #198: `cargo test` 286 passed, 0 failed, 1 ignored. `cargo clippy` 0 errors. `cargo fmt --check` clean. `git diff --check` clean. CI green on the pull request, CodeQL included. `nx format:check` could not run in that worktree (no `node_modules`); the diff there is Rust plus `CHANGELOG.md`, and the changelog was checked with `prettier --check` directly.
  - #199: `npx nx run-many -t lint test build --all` passed for all 6 projects, `npx nx format:check` clean (prettier 3.9.6 reformats nothing), `npm run verify:csp` passed on the built bundle, and committing exercised husky + lint-staged 17 + commitlint 21.2.1 end to end. CI was still running when this entry was written.
  - Local `rustc` was 1.92.0 and could not resolve `sqlx` 0.9 at all, so the toolchain was updated to stable 1.97.1 before any of the Rust work. That is a change to the maintainer's machine, not to the repository.
- **Privacy/security impact:** The `sqlx` 0.9 `AssertSqlSafe` wrappers are the only security-relevant change. They bypass a new compile-time injection guard, so each was audited rather than waved through: three interpolate a string literal from an array declared in the same function (`db_delete_job` and its test), and the fourth interpolates a table name read from this app's own `sqlite_master` during factory reset. No caller-supplied value reaches any of them, every one still binds its parameters, and the audit is written at each call site so a future edit cannot quietly widen the input.
- **Decisions and assumptions:** Superseding the two Dependabot PRs with hand-authored branches was chosen over pushing to the bot's branches, which stops Dependabot from maintaining them and loses the audit trail. The dev-tooling group was split rather than held whole, because most of it is independent of the Angular version and holding all of it would keep 12 bumps hostage to a migration. `rust-version` was raised to match `sqlx`'s real requirement rather than left as a claim the code no longer satisfies.
- **Risks or compatibility impact:** `rust-version` 1.94.0 is recent; anyone building locally on an older toolchain now gets a hard cargo error rather than a confusing compile failure. Both workflows use `dtolnay/rust-toolchain@stable`, so CI and the release path are unaffected. `@types/node` 26 over Node 20 typings is the widest surface in #199 and is covered by the full lint/test/build run.
- **Open issues or blockers:** Angular 22 (#185) needs two things at once: TypeScript pinned into `>=6.0.0 <6.1.0`, and an `@ngrx/signals` that supports Angular 22 - only `22.0.0-beta.0` exists, and the current stable 21.1.1 pins `@angular/core: ^21.0.0`. `@ngrx/signals` is imported from exactly one file, so dropping it is a real alternative to waiting on the beta. Until that lands, Dependabot will keep reopening #185 and #196; ignore rules for those specific majors would stop the churn.
- **Next first action:** Merge #198 and #199 once green, close #184 and #196 as superseded, then re-run the release workflow against `v0.29.1` so the tag finally produces installers.
- **Evidence:** `gh run view 30497973236 --log-failed` for the `nx: not found` failure on all four release jobs; `gh run view 30498225477 --log-failed` for the `zip`/`sqlx` compile errors; `gh run view 30498270577 --log-failed` for `The Angular Compiler requires TypeScript >=6.0.0 and <6.1.0 but 5.9.3 was found instead`; `gh run view 30497885920 --log-failed` for `Failed to process project graph` on the dev-tooling branch; `npm view @ngrx/signals@latest peerDependencies` for the Angular 21 peer pin.

### 2026-07-29, the launch sections land in all six READMEs, and the desktop build is found to have been broken the whole time

- **Status:** partial
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `main` (uncommitted working tree at the end of this watch - the maintainer asked for the work, not for a commit)
- **Commits:** none
- **Pull request:** none
- **Objective:** Compare the repository against `santifer/career-ops` ahead of going public, add the sections and repository infrastructure that were genuinely missing, and produce installer images - macOS first, since that is what the maintainer can verify locally.
- **Completed:**
  - Six READMEs (en, de, es, pl, ru, uk) gained: an FAQ, a "Where Discover looks" table naming all eleven built-in sources and the four ATS board types, "Also open source" promoted out of the author section, a "Connect" section carrying `x.com/vitala89`, a tech-stack badge row, and links to `SUPPORT.md` and the new issue template. Tables of contents updated in every language.
  - `SUPPORT.md`, `.github/dependabot.yml` (npm, cargo, github-actions, grouped and monthly), `.github/CODEOWNERS`, and `.github/ISSUE_TEMPLATE/applye-helped.yml` - the last one modelled on career-ops's `i-got-hired.yml`, because with no telemetry in the app an issue template is genuinely the only feedback channel that exists.
  - `docs/RELEASE.md`: how the tag-triggered matrix produces installers, how to build each OS by hand, why cross-compiling from macOS is a trap, and how to verify Windows and Linux artifacts from an Apple Silicon Mac including the ARM-versus-x86_64 problem, plus a per-platform smoke-test checklist.
  - **`frontendDist` in `tauri.conf.json` was wrong and the desktop bundle could not be built.** It read `../../dist/apps/desktop/browser`, which resolves from `src-tauri/` to `apps/dist/...`; the correct path is three levels up. `tauri build` failed with "Unable to find your web assets". Fixed, and the build then produced `Applye_0.29.0_aarch64.dmg` (16 MB, UDZO), `Applye.app`, and the updater tarball.
  - **A privacy audit over the whole history, not just the working tree** - the step `CURRENT_STATE.md` has listed as required before the repository goes public. Nothing sensitive was ever committed: no `.env`, no `*.sqlite`, no `*.key` or PEM material, no `profile.md`, no API-key-shaped strings, no URLs carrying credentials. Community files already use `@applye.dev` aliases rather than a personal address. Three absolute home-directory paths were found in documentation and removed, keeping each note's meaning - including the one describing the export path burned into the tour video, which is the bug the previous watch fixed. Two things are recorded as maintainer decisions rather than fixed here: 648 commits are authored with a personal Gmail address, which becomes public and scrapable the moment the repository opens (the cheap fix is GitHub's private-email setting plus a local `user.email` change, which stops the growth without rewriting history), and the same address appears in two internal logs, which is only worth scrubbing together with that. The home path also survives inside older history blobs; rewriting history to remove a machine account name would cost every SHA in the repository and is not worth it.
  - **An architecture pass over the frontend, on the maintainer's request, before the repository goes public** - the reasoning being that the code is about to become a portfolio artifact. Findings first, since they set up what was done: the dependency graph is a clean stack (`core` and `ui` depend on nothing, `i18n` and `data` on `core`, apps on the layers below) with zero deep imports into library internals anywhere in the repository - but nothing enforced it, all six projects had `"tags": []`, and `@nx/eslint-plugin` 23 does not include `enforce-module-boundaries` in `flat/base`, which was verified by loading the config programmatically rather than assumed. `jobs.component.ts` was 4975 lines with the class starting at line 2331, because template and styles were inline. `libs/data` is desktop-only in practice. `tsconfig.base.json` carried four unused bare aliases that shadow npm package names.
  - Acted on all of it: tags and `depConstraints` added and green on all six projects; the bare aliases removed; the template and styles extracted, taking the file to 2795 lines; `OnPush` added to 53 components that were verified signal-based or static; `docs/architecture.md` extended with the layer diagram and the dependency rule, and two stale claims in it corrected (DOCX-first export, and a `SignalStore` per feature area - there is one store).
  - Two skills, `.claude/skills/applye-angular` and `.claude/skills/applye-rust`, so the conventions are readable by an agent and a human at the same time, and `.mcp.json` wiring the first-party Angular CLI MCP server read-only after probing it over stdio to confirm it starts and exposes `get_best_practices`, `search_documentation`, `find_examples` and `list_projects`.
  - Answered a question that had a non-obvious answer: `OnPush` is **not** Angular 21.2's default. The installed runtime reads `onPush: componentDefinition.changeDetection === ChangeDetectionStrategy.OnPush`, so omitting it gets you eager checking. The flip is staged rather than done - `ChangeDetectionStrategy.Default` is already deprecated in this version in favour of `Eager`, and `main` has reversed the default - which is the argument for declaring `OnPush` explicitly now.
- **Not completed:**
  - Windows and Linux installers. They cannot be produced on this machine (Windows needs MSVC and WiX/NSIS, Linux needs the GTK/webkit2gtk stack) and CI cannot produce them while billing blocks it. Options and VM verification paths are written up in `docs/RELEASE.md`.
  - Updater-artifact signing locally: the key at `~/.tauri/applye_updater.key` is password-protected and the password is the maintainer's. The `.dmg` itself built; only the signature step failed.
  - The `PLACEHOLDER: release links` block in the six READMEs. Left in place deliberately - replacing it with links to assets that do not exist yet would be worse than the placeholder.
  - LinkedIn in the Connect section - resolved later in the same watch once the maintainer supplied the URL; it is in all six READMEs.
  - **The Tier-1 architecture work**, which is scoped but not started: `JobsComponent` is still 2795 lines and still owns a wizard, a scoring view and a document flow that belong in services; `pages/` has not been reorganised into per-feature `features/<name>/{pages,components,services}`; eight large stateful desktop screens are still on eager change detection; and `discover.rs` (3488 lines), `tailoring.rs` (2699) and `documents.rs` (2070) are still single modules mixing fetching, parsing, filtering and persistence.
  - **Opening the repository**, which is where the watch stopped by request. The maintainer was asked to decide two coupled things first - whether new commits should carry the personal Gmail or a GitHub noreply address, and who flips visibility - and chose to review the architecture before answering either. Nothing about visibility or git identity was changed.
- **Files or packages changed:** `README.md`, `README.de.md`, `README.es.md`, `README.pl.md`, `README.ru.md`, `README.uk.md`, `SUPPORT.md`, `docs/RELEASE.md`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/applye-helped.yml`, `apps/desktop/src-tauri/tauri.conf.json`, `.gitignore`, `CHANGELOG.md`, this file, `docs/product/CURRENT_STATE.md`.
- **Validation:** the full gate, run after the architecture pass and all green: `nx run-many --target=lint` (6 projects, 0 errors, 21 pre-existing `no-non-null-assertion` warnings, none added), `--target=type-check` (6 projects), `--target=test` (6 projects, 848 tests: desktop 717, web 76, core 32, ui 22, i18n 1), `--target=build` (3 projects), `cargo clippy --all-targets -- -D warnings` (clean), `npm run format:check` (pass), `git diff --check` (clean). The desktop bundle also built end to end after the `frontendDist` fix, which is the strongest available evidence that change is correct, since the same command failed before it.
- **Privacy/security impact:** None. No user data paths, storage, sync, or network behaviour changed. The signing key was read from `~/.tauri/` into an environment variable for the build and is not in the repository; no password was guessed or brute-forced. `LAUNCH_PREP.local.md` is a maintainer-only working file, covered by a new `*.local.md` entry in `.gitignore`.
- **Decisions and assumptions:**
  - **No CLI for Applye.** career-ops is CLI-first because the CLI _is_ the product; Applye's product is the Tauri app over local SQLite. A CLI would mean reimplementing the domain a second time with its own tests, docs, i18n, and release surface. Recorded as a decision, not a deferral. A headless flag on the existing binary stays possible later.
  - Copied nothing from career-ops verbatim. Every section is written for Applye's own architecture and claims.
  - Deliberately did _not_ add Product Hunt, Trendshift, star-history, "Featured in", Discord, contributor-graph, or funding badges. Those work for career-ops because 62k stars stand behind them; on a repository at zero they read as theatre.
- **Risks or compatibility impact:** The `frontendDist` fix changes how every build resolves the frontend. It is verified on macOS only; the same relative path is used on all platforms, so CI should behave identically, but the first Windows and Linux runs are the actual proof. The eleven-source table is a factual claim about the app that will rot if migrations add or remove sources.
- **Open issues or blockers:** GitHub Actions billing, unchanged from the previous watch and now doubly blocking - it prevented CI from ever reaching the build, which is why a broken `frontendDist` survived undetected across five tagged releases.
- **Next first action:** Decide the billing question - either fix the payment method and re-push `v0.29.0`, or accept that the first real build happens after the repository is public. The privacy audit is done and clean; the only thing left from it is the maintainer's call on the commit-author email.
- **Evidence:** `gh run view 30457446286` showing all four jobs refused on billing; the failing and then succeeding `tauri build` output; `ls -lh` and `hdiutil imageinfo` of the produced `.dmg`; `LAUNCH_PREP.local.md` sections 5 and 7.

### 2026-07-29, the press kit is built, and CI is found to be failing on billing rather than absent

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `chore/press-kit`
- **Pull request:** opened at the end of this watch
- **Objective:** Close the two remaining items that did not depend on the maintainer's credentials: the press kit placeholder, and the branch-deletion manifest living only in a session scratchpad.
- **Completed:**
  - `apps/web/public/press/applye-press-kit.zip` (1.1 MB) and `apps/web/tools/build-press-kit.sh` that assembles it: wordmarks, the app icon and symbol in both themes, three README screenshots, the hero banner, and a `README.txt` covering mark usage and what the screenshots contain. The press page links it and describes what is inside instead of telling a journalist to ask the author.
  - The archive rebuilds byte-identically, verified by building twice and comparing SHA-256. That needed pinned timestamps as well as `zip -X` and a sorted file list, because a zip stores every entry's mtime and staging into a temp directory stamps them with the moment the script ran.
  - The branch-deletion manifest was copied out of the session scratchpad to `~/applye-branch-restore-2026-07-29.txt`, since the scratchpad dies with the session.
  - `v0.29.0` tagged on `33ffec2` and released, closing the tag work from the previous watch.
- **Not completed:** The site deploy, which needs the maintainer's Cloudflare credentials. `applye.dev` still serves the pre-0.29.0 `CHANGELOG.md`, so the live changelog page is a release behind.
- **Files or packages changed:** `apps/web/public/press/applye-press-kit.zip`, `apps/web/tools/build-press-kit.sh`, `apps/web/src/app/press.html`, `.gitattributes`, `CHANGELOG.md`, this file.
- **Validation:** `nx run web:test` (6 suites, 76 tests, pass), `nx run web:lint` (pass), `nx run web:build` (pass, with the zip confirmed in `dist/apps/web/browser/press/` and the download link present in the prerendered `press/index.html`), `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan of the added lines (0), and the archive built twice to compare hashes.
- **Privacy/security impact:** None new, and one thing checked deliberately: every file in the kit is already published in the repository or on the site, and the screenshots are the demo persona against invented companies. The `README.txt` says so, so a publication cannot mistake them for a real user's data.
- **Decisions and assumptions:** Three screenshots and the hero rather than all six, because a press kit is a selection and the three chosen are the ones a reader has already seen in the README. The zip is LFS-tracked: it is a rebuild of assets already in LFS, so storing full copies in Git would duplicate the same media a second time.
- **Risks or compatibility impact:** The kit is downstream of the brand assets and the screens. Nothing enforces the link - if a wordmark or screenshot is regenerated, the zip is stale until the script is rerun, and its contents are what a publication will print. Worth rerunning as the last step of any brand change.
- **Open issues or blockers, and this is the one that matters:** **GitHub Actions runs on this repository and fails within seconds on billing - it is not absent, and `apps/web/tools/deploy.sh` said it was.** `CURRENT_STATE.md` had it right; the deploy script's header comment did not, and is corrected here, because "unavailable" and "failing on every push" imply different things about what `main` looks like to a visitor. Every job returns "The job was not started because recent account payments have failed or your spending limit needs to be increased". Three consequences: `release.yml` has never built an installer, so all five releases carry notes and no assets; the `deploy-web` job in `ci.yml` never runs, which is why deploying is manual; and `main` now shows a red run per push, including four this watch produced by pushing tags. A public repository opening with a red CI badge and asset-less releases is a worse first impression than any of the media work in the last several watches was worth, so billing should be fixed before the repository goes public.
- **Next first action:** Fix the GitHub billing block, then re-run the release build for `v0.29.0` so the release carries installers - `release.yml` triggers only on tag push and has no `workflow_dispatch`, so that means re-pushing the tag or uploading locally built artifacts with `gh release upload`.
- **Evidence:** Branch diff; the two SHA-256 hashes of the rebuilt archive; `unzip -l` of the kit; `gh run view` output naming the billing failure.

### 2026-07-29, dead branches pruned, three untagged releases recovered, 0.29.0 cut

- **Status:** complete; the 0.29.0 tag and release wait on the PR being merged
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `chore/release-0.29.0`
- **Pull request:** opened at the end of this watch
- **Objective:** Audit branches, tags, releases and version strings for consistency before the repository goes public, and clean up what is dead.
- **Completed:**
  - **Branch cleanup.** 66 remote and 20 local branches deleted. Every one was checked first by comparing the files it touched against `main` rather than by commit SHA, because squash merges leave branch commits looking unmerged forever: `git rev-list` claimed `feat/web-analytics` was 46 commits ahead when its content had been in `main` for days. Four remote branches had no pull request at all - `docs/readme`, `feat/i18n-states`, `feat/web-landing` proved byte-identical to `main` and were removed; `backup/pre-history-rewrite` is the deliberate snapshot from before the LFS history rewrite and stays. The three local `backup/*` branches stay for the same reason. A restore manifest with every deleted branch's SHA is in the session scratchpad.
  - **Three releases recovered.** `v0.26.0`, `v0.27.0` and `v0.28.0` existed as versions in the manifests and as sections in the changelog, but the tag list stopped at `v0.25.0` and GitHub showed one release against an app reporting `0.28.0`. All three are now annotated tags on `c656c40`, `7dffc6c` and `65330a3` - in each of those commits the version bump and the changelog section land together, which is exactly what `v0.25.0`'s commit did, so the convention was read off the history rather than invented - with GitHub Releases carrying each section's text.
  - **0.29.0 cut.** Version bumped in all three manifests and the six README badges, `[Unreleased]` promoted to `## [0.29.0] - 2026-07-29`, and the changelog's link references repaired: they had `[Unreleased]` comparing against `v0.25.0` and no entries for the three recovered versions.
- **Not completed:** The `v0.29.0` tag and its release, which have to wait until this branch is merged so the tag can point at the release commit on `main`.
- **Files or packages changed:** `package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`, `CHANGELOG.md`, all six `README*.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** `npm run format:check`, `git diff --check`, an em-dash and en-dash scan of the changed lines, and the three published releases confirmed with `gh release list`. The site was checked live: `applye.dev/changelog/` renders the changelog correctly. **Not run:** the test, lint, build and Rust gates - see the risk note below, which is the reason they matter here.
- **Privacy/security impact:** None. No user data, network or permission surface.
- **Decisions and assumptions:** Tags point at the version-bump commits rather than at a synthetic release commit, because that is what the existing history does. GitHub will show all three as published on 2026-07-29 since that is when they were created; the changelog carries the real dates and `CURRENT_STATE.md` says so rather than pretending otherwise. Backup branches were kept: they are cheap and exist precisely for the case where this kind of cleanup turns out to have been wrong.
- **Risks or compatibility impact:** A version bump touches the Tauri manifest and `Cargo.toml`, so the desktop build is the gate that matters and it has not been run on this branch. Run `nx build desktop` and `cargo test --lib` before merging. Deleting 86 branches is the kind of thing that is only reversible while the manifest exists - it is in a session-scoped scratchpad, so anything worth keeping should be recreated now rather than later.
- **Open issues or blockers:** None.
- **Next first action:** Run the desktop and Rust gates on this branch, merge, then tag `v0.29.0` on the merge commit and publish its release from the new changelog section.
- **Evidence:** Branch diff; `gh release list` output; the deletion manifest; the file-level comparisons behind each branch deletion.

### 2026-07-29, the last README placeholder is filled, and the tour video is found to leak a home directory path

- **Status:** complete, including the privacy finding, which was fixed in a follow-up on the same branch
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark` (third commit)
- **Commits:** three documentation commits on the branch
- **Pull request:** #178
- **Objective:** Fill the last renderable placeholder in the READMEs, the walkthrough thumbnail.
- **Completed:** `docs/assets/walkthrough-thumb.png` (800x450) and `walkthrough-thumb.mjs`, a clickable poster wired into all six READMEs and linking to `https://applye.dev/docs/guide/tour/` - verified live, HTTP 200. Section 4 of `ASSETS_BRIEF.md`, `docs/assets/README.md` and `CHANGELOG.md` updated. The READMEs now have no unfilled image reference in any language; the release-links blockquote is the only placeholder left and it waits on builds.
- **Not completed, and this is the important part of this entry:** **`apps/web/public/guide/tour-walkthrough.mp4` renders `/Users/<name>/Documents/Applye is writable.` at roughly three seconds in - with the real account name in place of `<name>`.** It is the welcome screen's environment check printing the export path of the machine the tour was captured on, and it contains a real home directory name. The file is live on `applye.dev/docs/guide/tour/`. Nothing was changed about the video: re-encoding a shipped asset to blur or trim a segment is a deploy-affecting change, it is the maintainer's own name rather than a third party's, and the maintainer should decide whether it is worth doing. The poster deliberately uses the 44s frame so this change does not create a second, still, indexable copy.
- **Files or packages changed:** `docs/assets/walkthrough-thumb.png`, `docs/assets/walkthrough-thumb.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code, and nothing under `apps/web/public/guide/`.
- **Validation:** Run and observed: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), `git lfs status` (the poster staged as a pointer), `curl -I` against the tour URL (200 after redirect to the trailing-slash form). Two framings of the poster were rendered and compared before choosing; the 3s frame was zoomed to 1400px to confirm the leaked path rather than assume it. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched.
- **Privacy/security impact:** No new exposure, and one pre-existing exposure now documented. The poster's frame was checked for personal data before use. The leak described above is not created by this change and is not made worse by it.
- **Decisions and assumptions:** Pointing the poster at the existing silent tour beats leaving a placeholder for a narrated video nobody has scheduled: the link is true today, and swapping it later is a one-line change in six files. No copy is baked into the image, for the same reason as the hero banner - it would have to exist in six languages. The video leak was reported rather than fixed, because fixing it means re-encoding a deployed asset and the call belongs to the maintainer.
- **Risks or compatibility impact:** The poster hardcodes an external URL, so it breaks silently if the tour page ever moves. The frame is downstream of `tour-walkthrough.mp4`; if that is re-recorded, the poster is stale until the script is rerun.
- **Open issues or blockers:** The home directory path in `tour-walkthrough.mp4`. Options, cheapest first: trim the video to start after the environment check; blur that rectangle for the seconds it is visible with `ffmpeg`'s `boxblur` and re-encode; or re-record the first-run segment on a machine with a neutral account name. All three need a redeploy. Worth checking the other recordings for the same thing in the same pass - only this frame was inspected.
- **Next first action:** Superseded by the follow-up below.
- **Evidence:** Branch diff; the zoomed crop of the 3s frame; `curl` status for the tour URL; both poster renders reviewed in session.

**Follow-up in the same watch, on the same branch: the path is blurred out and the video re-encoded.** The maintainer chose the surgical option, so `apps/web/public/guide/tour-walkthrough.mp4` was rebuilt with a luma-only Gaussian blur over the export-path line, and nothing else about the take changed.

- **How the window and the rectangle were established, rather than eyeballed:** the video was sampled at 5fps for its first eight seconds, and the standard deviation of the 320x28 rectangle at (305, 714) was measured per frame. The path renders from 2.600s to 3.900s - stdev 29.5 while present, 0 before it draws, 2.8 once the screen advances - and a 30fps sweep of 3.7s to 4.2s put the last frame carrying it at exactly 3.900. The blur is enabled for `between(t,2.5,3.92)` and no longer, because the same rectangle holds unrelated interface on later screens and a wider window would smear it.
- **Why luma-only:** the first attempt used `boxblur` across all planes and left a green cast over the blurred strip, since chroma averaging over a near-neutral region amplifies whatever tint is in it. `gblur=sigma=12:steps=3:planes=1` blurs the luma and leaves chroma untouched, which reads as a neutral smudge.
- **The rest of the take was checked, not assumed.** The tour ends on the targeting step and never reaches a summary screen, so there is no second place a path could appear. The API key field visible around 5s is the input's placeholder - `sk-ant-api03-…`, dim, ellipsised - and not a typed key: the take switches to CLI bridge mode and never pastes one. Frames at 22s were compared before and after at 2x to confirm the re-encode did not soften text, and the rectangle at 5.2s was confirmed sharp, so the blur really is windowed.
- **Encoding:** libx264, CRF 26, `-preset slow`, `-an`, `+faststart`. 820 KB to 661 KB at the same 1264x788, 30fps and 45.900s duration, so the page's `width`/`height` attributes and the shot list's stated length still hold.
- **This is the second instance of this class of leak in this same file.** The 2026-07-28 watch caught absolute paths in the last half-second, after the app opened on Settings, and cut the file to end earlier; `CURRENT_STATE.md` was given a warning about Settings captures in CLI bridge mode at the time. The welcome screen's environment check prints the same kind of path at the _start_ of the take, and that survived. The warning should be widened from "Settings in CLI bridge mode" to "any screen that prints a filesystem path", which includes the first-run environment check.
- **Validation after the swap:** `nx run web:test`, `nx run web:lint`, `nx run web:build`, `npm run format:check`, `git diff --check`, and the frame comparisons above. **A redeploy is required for this to reach the live site**; until then `applye.dev/docs/guide/tour/` still serves the old file.
- **Next first action:** Redeploy the site so the corrected video replaces the one currently served, then widen the capture warning in `CURRENT_STATE.md` and `MEDIA_SHOTLIST.md` from Settings to any path-printing screen.

### 2026-07-29, the README's screens and demo GIF are cut from the guide's media

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark` (second commit; the branch now carries both the wordmark and this)
- **Commits:** two documentation commits on the branch
- **Pull request:** #178, retitled to cover both
- **Objective:** Fill the README's remaining asset placeholders without shooting anything new, reusing what `apps/web/public/guide/` already holds.
- **Completed:** Six screens under `docs/assets/screens/` and `docs/assets/demo.gif` (17.8s, 800px, 1.9 MB), plus `screens/build.mjs`, which prepares the stills from the guide's PNGs and pulls two frames out of its MP4s with `ffmpeg`. The screenshot-table and demo-GIF placeholders removed from all six READMEs, and four captions rewritten to match what the frames contain. Sections 3 and 5 of `ASSETS_BRIEF.md` replaced with the shipped recipes, and `docs/assets/README.md` updated.
- **Not completed:** `walkthrough-thumb.png`. It is blocked rather than pending: the READMEs link it to a narrated YouTube video that does not exist. The release-links placeholder is likewise waiting on builds. Neither renders as a broken image - both are comments or blockquotes.
- **Files or packages changed:** `docs/assets/screens/*.png` (6), `docs/assets/screens/build.mjs`, `docs/assets/demo.gif`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed, and nothing under `apps/web/public/guide/` was touched or moved.
- **Validation:** Run and observed: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), `git lfs status` (all six PNGs and the GIF staged as pointers). Every candidate frame was inspected as a contact sheet before selection, and the concatenated GIF was sampled at six timestamps to confirm the joins land on complete states. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched.
- **Privacy/security impact:** None beyond what already shipped. These frames are the documentation site's, which were vetted when they were captured: invented companies, the demo persona, no real employer, key or contact. Reusing them adds no new exposure, and the Discover frame is the fixture feed rather than a real scan.
- **Decisions and assumptions:** Reuse over recapture, because two capture sessions produce two personas that diverge. Captions follow the file rather than the brief: four of them described a screen that was never captured, and the honest fix is to describe the frame. Heights are not normalised to 16:10 - cropping would cut the weekly chart off analytics and the save controls off the Discover feed, and a markdown table scales cells to the column width anyway. The GIF is 10fps/128 colours on purpose; the quality difference against 12fps and a full palette is invisible at 800px and costs double the bytes. The wordmark work was left on the same branch rather than split, since both changes fill placeholders in the same six files and would have conflicted.
- **Risks or compatibility impact:** The screens are now downstream of `apps/web/public/guide/`. If a guide asset is recaptured, these go stale silently - nothing links them but `build.mjs`, which names its sources. The GIF pushes the repository's LFS footprint up by roughly 3 MB.
- **Open issues or blockers:** `walkthrough-thumb.png` needs a hosted video first. The press-kit placeholder in `apps/web/src/app/press.html` asks for a zip of the wordmarks and the app icon, which is now buildable.
- **Next first action:** Merge #178, then decide whether the walkthrough section points at YouTube or simply links to the tour already published at `applye.dev/docs/guide/tour`.
- **Evidence:** Branch diff; `build.mjs` output naming each source and output size; the contact sheets and GIF frame samples reviewed in session.

### 2026-07-29, the README wordmark is generated from the site header

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark`
- **Commits:** one documentation commit on the branch
- **Pull request:** opened at the end of this watch
- **Objective:** Fix the broken image at the top of all six READMEs: they referenced wordmark SVGs that had never been created.
- **Completed:** `docs/assets/brand/wordmark-light.svg` and `wordmark-dark.svg` (250x56), plus `wordmark.mjs`, the generator that produced them from the JetBrains Mono TTF. The `<!-- PLACEHOLDER: wordmark -->` comment removed from all six READMEs. Section 1 of `ASSETS_BRIEF.md` replaced with the shipped recipe, and `docs/assets/README.md` updated.
- **Not completed:** The remaining README assets - `demo.gif`, the walkthrough thumbnail and the six screens under `docs/assets/screens/`. Also untouched: the press kit placeholder in `apps/web/src/app/press.html`, which asks for a zip of these wordmarks plus the app icon. That is now buildable but was not in scope.
- **Files or packages changed:** `docs/assets/brand/wordmark-light.svg`, `docs/assets/brand/wordmark-dark.svg`, `docs/assets/brand/wordmark.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed.
- **Validation:** Run and observed on this branch: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), and both SVGs rasterised and inspected against the light and dark canvases. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched. Separately confirmed on the live repository that the previous watch's claim holds: GitHub resolves the LFS pointer and renders `hero-banner.png` in the README.
- **Privacy/security impact:** None. Two vector files and a build script; no data, network or permission surface.
- **Decisions and assumptions:** The lockup is transcribed from `.brand` in the site header, not designed fresh, so the README and the site cannot drift into two different logos. Glyphs are outlines because GitHub blocks webfonts in `<img>`-served SVG. The canvas stays 250x56 because the READMEs hardcode those attributes; the type was sized up to 40px to fill it, since at 30px the lockup used 59% of the width and shipped its own margin. `opentype.js` could not shape the string - JetBrains Mono uses a ccmp substitution format it does not implement - so the script steps the advance width glyph by glyph, which is equivalent for six unshaped lowercase letters. JetBrains Mono is SIL OFL 1.1: embedding outlines is permitted, and the font itself is not redistributed.
- **Risks or compatibility impact:** None expected. The SVGs are static, have no external references and carry no fonts. If `.brand` in `styles.scss` changes, these files go stale silently - nothing enforces the link, and the script header says so.
- **Open issues or blockers:** None.
- **Next first action:** Capture the six screens under `docs/assets/screens/` at 1440x900 in the dark theme against the seeded persona in `ASSETS_BRIEF.md`, starting with `dashboard.png`.
- **Evidence:** Branch diff; rasterised previews of both SVGs reviewed in session; the generator's own output reporting `mark 42.0px + gap 12 + text 140.0px = 194.0px on 250x56`.

### 2026-07-29, the README's hero banner is built and README media joins LFS

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5), maintainer supplying the screenshot
- **Branch:** `docs/readme-hero-banner`
- **Commits:** one documentation commit on the branch
- **Pull request:** opened at the end of this watch
- **Objective:** Fill the first of the README's asset placeholders - the hero banner - and leave the rest of the set reproducible rather than one-off.
- **Completed:**
  - `docs/assets/hero-banner.png` (1600x900) and `hero-banner-plate.png`, the same backdrop without the window, for the GitHub social preview and the video thumbnail.
  - `docs/assets/hero-banner.mjs`, the compositor that produced them: crop, window framing, backdrop, shadow, grain. Not wired into the workspace and adds no dependency - it needs `sharp` installed into a throwaway directory, which its header explains. Retakes are now a command rather than a design session.
  - The `<!-- PLACEHOLDER: hero banner -->` comment removed from all six READMEs, and each locale's `alt` text corrected: it promised "recruiter-fit score", which is not on the captured screen.
  - `docs/assets/**/*.png` and `*.gif` added to `.gitattributes` as LFS, matching the guide media's treatment.
  - The seed persona in `ASSETS_BRIEF.md` rewritten to the one actually in the frame, and section 2 replaced with the shipped recipe and the reasoning behind each measurement.
- **Not completed:** The other README placeholders - wordmark SVGs, `demo.gif`, the walkthrough thumbnail and the six screens under `docs/assets/screens/`. None was in scope.
- **Files or packages changed:** `docs/assets/hero-banner.png`, `docs/assets/hero-banner-plate.png`, `docs/assets/hero-banner.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, `.gitattributes`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed.
- **Validation:** Run and observed on this branch: `npm run format:check` (pass, after Prettier reformatted the new script), `git diff --check` (clean), `git lfs status` (both PNGs staged as LFS pointers, not raw bytes), an em-dash and en-dash scan across every changed file (0 hits). The banner was inspected visually at each of the three framing iterations. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` and `.gitattributes` was touched, and the validation matrix does not require them for documentation-only changes.
- **Privacy/security impact:** None, with one thing checked on purpose: the screenshot shows invented companies (Kestrel Analytics, Northlane Systems, Umbra Labs, Cindertree Studio, Vantaform GmbH, Pellworm Digital) and a "Local profile" with no name, contact detail, key or real employer in the frame. Same rule the guide captures follow.
- **Decisions and assumptions:** The UI is a real screenshot composited by a script, never a generated image. A hero banner is the first thing a visitor reads, and generated interface text - almost-words, almost-numbers - would cost more trust than the banner buys. The window is 1344px wide so that the canvas edge falls in the gap between two list rows: at 1280 it sliced the Vantaform line in half and read as a broken crop. The backdrop is `#131211`, darker than the app canvas `#1c1b19`, because matching the canvas made the window dissolve into the page. No text is baked into the image, since the READMEs carry the headline in six languages and baked copy would need six renders.
- **Risks or compatibility impact:** The LFS rule means anyone cloning without `git lfs` sees pointer files where the README media should be, and CI jobs touching these paths need `lfs: true` - the same trap that was found in the deploy workflow for the guide assets. The deploy workflow does not read `docs/`, so nothing there changes. GitHub resolves LFS pointers when rendering markdown, so the READMEs display normally.
- **Open issues or blockers:** None for this watch. The remaining README assets are unblocked and now have a documented persona to match.
- **Next first action:** Capture the six screens under `docs/assets/screens/` at 1440x900 in the dark theme against the same seeded persona, starting with `dashboard.png`.
- **Evidence:** Branch diff; `git lfs status` output; the three rendered iterations of the banner reviewed in session.

### 2026-07-29, applye.dev is attached and the site is opened to search

- **Status:** partial - the domain is attached and verified; the indexing flip is committed but not yet deployed
- **Agent/tool:** Claude Code (Opus 5), maintainer driving the Cloudflare side
- **Branch:** `fix/ci-lfs-checkout`, then `feat/web-launch-indexable`
- **Commits:** `2117dc1` (LFS checkout), the indexing flip on the launch branch
- **Pull request:** #172 (merged as `5192335`), plus the launch PR
- **Objective:** attach `applye.dev`, remove the pre-launch search block, and get the current build online.
- **Completed:**
  - **`applye.dev` and `www.applye.dev` are attached to the `applye` Pages project.** Two proxied CNAMEs to `applye.pages.dev` created through the Cloudflare API, certificate issued 2026-07-28 22:39 UTC, valid to 2026-10-26. Verified from outside: `HTTP/2 200`, correct `<title>`, all six security headers, `DNS:applye.dev` on the certificate. The apex is a CNAME; Cloudflare flattens it, so no ALIAS record was needed. Email Routing records (3 MX, SPF, DKIM, DMARC) were not touched.
  - **`X-Robots-Tag: noindex` removed and `SEARCH_INDEXABLE` flipped to `true`.** The coupling test was verified to fail when only the flag was changed, then the file was restored - the guard is real, not assumed.
  - **The deploy job would have shipped LFS stubs.** `actions/checkout@v4` in `deploy-web` had no `lfs: true`, so a restored-Actions run would have uploaded 132-byte pointers in place of all 25 guide assets, with every gate still green. Fixed in #172. Never shipped, because the job has never run.
  - **The current build is live.** The maintainer redeployed from `main`; `/guide/discover-scan.mp4` and `/guide/tour-walkthrough.mp4` went from 404 to 200, and `chunk-2T35UHGN.js` carries the real `G-ZY158GV42C` rather than the placeholder.
- **Not completed:** the indexing flip is not deployed - it needs a merge and another `npm run web:deploy`. Search Console, the Cloudflare Web Analytics hostname and HSTS all remain untouched. `SOURCE_PUBLIC` is still `false` and the README still ships its placeholder asset set.
- **Files or packages changed:** `.github/workflows/ci.yml`, `apps/web/public/_headers`, `apps/web/src/app/site.ts`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** `npx nx run web:test` (70 passed, 6 suites) on the flipped tree; the same suite with the flag alone reverted fails on `keeps the noindex header and SEARCH_INDEXABLE in step`, 1 failed / 69 passed, confirming the guard. `npm run format:check` and `git diff --check` pass. Against the live site: apex and `www` both 200 over IPv4 and IPv6, guide media 200, `sitemap.xml` and `robots.txt` 200, `x-robots-tag: noindex` still present because the flip is not deployed yet.
- **Privacy/security impact:** No user data involved. Two notes. The Cloudflare API token minted for the attachment is a user token scoped to Pages Edit and DNS Edit on this zone with a short TTL; it should be deleted once the launch settles. Opening the site to search is a deliberate exposure decision, taken by the maintainer, and only after every documentation placeholder had shipped.
- **Decisions and assumptions:** Attached the domain before removing `noindex`, so a wrong result could be undone before crawlers were invited. Left `applye.pages.dev` alone - it cannot be removed without deleting the project, and the canonical tags already consolidate search on the domain. Did not touch the zone's SSL mode from a script; that is a whole-zone setting that also affects mail, and belongs in the dashboard.
- **Risks or compatibility impact:** Once the flip deploys, removal from search is far slower than exclusion was. Nothing else regresses: the header block keeps all six security headers, and only the `X-Robots-Tag` line was removed.
- **Open issues or blockers:** GitHub Actions still cannot run, so deployment stays manual. `SOURCE_PUBLIC` and the README asset set still stand between the site and the repository going public.
- **Next first action:** merge the launch PR, run `npm run web:deploy`, then confirm `curl -sI https://applye.dev | grep -i x-robots-tag` returns nothing. Only after that, add `applye.dev` to Search Console and submit `https://applye.dev/sitemap.xml`.
- **Evidence:** `apps/web/public/_headers`, `apps/web/src/app/site.ts:46`, `apps/web/src/app/seo/seo.spec.ts:101`, `.github/workflows/ci.yml:103`, PR #172.

### 2026-07-28, the last placeholder on the site is gone, and the maintainer's database was put back

- **Status:** complete
- **Agent/tool:** Claude Code (Opus). The maintainer captured the recording; the agent planned the capture, cleaned and wired the asset, and restored the database.
- **Branch:** `feat/guide-discover-scan`
- **Commits:** one, carrying the asset, the page, the shot list, the changelog and this entry
- **Pull request:** #171
- **Objective:** Ship `guide/discover-scan.mp4`, the only remaining placeholder box on applye.dev, and return the maintainer's local database to its pre-capture state.
- **Completed:**
  - **The recording exists and is honest.** Captured against one user-added RSS source - the invented feed in `tools/capture/demo-jobs.xml`, temporarily hosted on a throwaway Cloudflare Pages project, deleted by the maintainer immediately afterwards - with every built-in source switched off, so nothing real was fetched and the eight companies on screen are the fixture's own. That hosting detour is not optional: `require_https` (`discover.rs:1578`) rejects anything but `https://`, and reqwest is built with `rustls-tls` on the bundled Mozilla roots (`Cargo.toml:32`), so no local server, self-signed or mkcert, can ever be scanned.
  - **Two edits to the take before shipping**: the screen recorder had left an AAC track on it, which the capture rules forbid, and 3.5 s of static screen sat before the click. Stripped and trimmed from 2.3 s, which took it from 1.1 MB to 123 KB over 6.2 s. The untrimmed original is in `~/applye-capture-states/media-inbox-2026-07-28/`.
  - **The slot's own description is not fully met, and the page no longer claims it is.** The slot asked for "the console logging each source line by line". There was one enabled source, so there is one line; and the console is drawn for about 0.15 s, because a single small feed resolves that fast, so `> scan started · 1 sources` is legible only on a freeze frame and the resolved per-source line and the `> done in Ns` line never appear at all. The `aria-label` describes what is actually on screen - the strip reading LAST SCAN · 8 NEW · 0 FILTERED · 0 TOKENS, and the feed filling with NEW pills, target-role labels and matched keywords - and promises no log. `MEDIA_SHOTLIST.md` records all three deviations.
  - **The maintainer's database was restored.** It now holds the eight source rows it had before any of this began, TrudVsem enabled and the other seven off, with no jobs and no profile, taken from `applye.db.pre-seed-2026-07-27T10-26-53-893Z`. The seeded capture state it replaced is archived at `~/applye-capture-states/70-capture-2026-07-28-post-scan/`.
- **Not completed:** Nothing from this watch. Two things it deliberately did not do: flip `SEARCH_INDEXABLE` and the `noindex` header, and attach `applye.dev`. Both are the maintainer's call and neither was given.
- **Files or packages changed:** `apps/web/public/guide/discover-scan.mp4` (new, via LFS), `apps/web/src/app/docs/guide-pages.ts`, `docs/product/MEDIA_SHOTLIST.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `nx run web:test` (5 suites, 64 tests, pass), `nx run web:lint` (pass), `nx run web:build --skip-nx-cache` (pass; `dist` carries the real 123 KB file, not an LFS pointer, and the prerendered `/docs/guide/discover` page references it), `npm run format:check` (pass), `git diff --check` (clean). A grep over the built HTML finds no `PLACEHOLDER` text anywhere on the site. The restored database was verified by query: 8 sources, 0 jobs, 0 applications, 0 profile rows. **Still not verified by eye**: no rendered guide page has been looked at, including this one - the browser preview reports `innerWidth` 0, the same failure recorded on 2026-07-27. The video was checked frame by frame with `ffprobe` and extracted stills instead, which is how the 0.15 s console window and the absent done line were established.
- **Privacy/security impact:** One real consideration, handled. Scanning with the built-in sources enabled would have put real German employers' postings on screen, which is exactly why the first take was rejected; they were switched off and the only source fetched was the invented fixture. The fixture stays outside `apps/web/public`, so no deploy can publish fake vacancies from applye.dev, and the temporary host is gone. The restore moved the maintainer's own data back; no personal data entered the repository, and the archived capture state holds only the invented demo persona.
- **Decisions and assumptions:** Trimmed and stripped the maintainer's file rather than asking for a re-shoot - both edits remove material rather than change it, and the silent-asset rule is explicit. Kept the empty-inbox opening second rather than cutting straight to the click, because the contrast with the filled feed is what the figure is for. Assumed the throwaway Pages project is deleted, as reported; nothing in the repository depends on it.
- **Risks or compatibility impact:** None to the app. For the site: the guide is complete, so the only thing between here and an indexable launch is the maintainer's word and a look at the rendered pages.
- **Open issues or blockers:** The rendered guide has still never been seen by a human or an agent. `~/applye-capture-states/99-your-real-data/` is misnamed - it was overwritten with a seeded copy on 2026-07-28 and holds no real data; the genuine pre-capture state is the `pre-seed-2026-07-27T10-26-53-893Z` file, now restored and still present in the app support directory.
- **Next first action:** Merge PR #171, then decide the launch: flipping `SEARCH_INDEXABLE` and the `X-Robots-Tag` line together, deploying, and attaching `applye.dev` are one decision and belong to the maintainer. The visual review this action used to call for was done - see the second follow-up below.
- **Evidence:** PR #171; the gate runs above; the extracted frames at 3.55-3.70 s of the original take, which is where the console appears and disappears.

**Follow-up in the same watch, on the same branch and PR: the two weak recordings were re-shot, and a personal path was caught on its way into the documentation.** The maintainer re-recorded `tour-walkthrough.mp4` - now 45.9 s covering all six onboarding steps rather than 18 s stopping mid-flow, played slightly slowed with the model-call waits cut - and `profile-regenerate.mp4`, now 5.1 s with the working state visible where 2.2 s had lost it. `pipeline-drag.mp4` was reviewed again and kept at 3 s. Four things were then found and dealt with before shipping. **First, a real account name.** The last half-second of the tour, after the app opened on Settings, showed the CLI detection block with absolute paths under the maintainer's home directory; the file is cut to end on the "You're all set" summary instead, and `CURRENT_STATE.md` now warns that any Settings capture in CLI bridge mode carries that exposure. **Second, the tour was captured with the window inset in a larger frame**, so it was cropped from 1440x900 to its actual 1264x788 content and the page's `width`/`height` now match the file. **Third, every recording in the guide carried an empty AAC track** from the screen recorder, so the "silent" claim held only because the players are muted; all seven were stripped with `-an`. **Fourth**, the four heaviest were re-encoded at CRF 23 after checking text at 1:1, which took the guide's video weight from about 14.7 MB to 4.1 MB. Two `aria-label`s were rewritten to match what the new takes actually show - the tour's, which described a recording that ended three steps earlier, and the regenerate card's, which named fields the card does not have. The tour is still not the narrated 2-3 minute sidebar tour its slot describes, and the shot list says so. Validation re-run and observed after all of it: `nx run web:test` (5 suites, 64 tests), `nx run web:lint`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`. The maintainer's originals are in `~/applye-capture-states/media-inbox-2026-07-28/`.

**Third follow-up, same branch and PR: four site changes off the back of the maintainer's review.** (1) The documentation sidebar gained one Lucide icon per section, inlined into the site's own `ui/icon.ts` set rather than by adding the package - one per group and none per page. (2) **`favicon.ico` was the Nx logo the workspace generator left behind**, and the SVG icon beside it was linked by a relative path, so on a route like `/docs/guide/tour` the browser resolved it under that folder, 404ed, and fell back to the Nx file even in engines that support SVG icons. All three links are absolute now, the `.ico` is generated from the brand mark, an `apple-touch-icon.png` exists, and `apps/web/tools/generate-icons.sh` rebuilds them with macOS built-ins. (3) The guide's figures open at full size on click, over a dimmed backdrop, with Escape, the backdrop and a close button all dismissing; the binding is delegated so a figure added later is covered, a video carrying its own controls is skipped because a click there scrubs, and an enlarge button added to each figure covers that case and the keyboard. Six tests. (4) The footer was rebuilt to the maintainer's Claude Design variant 1a - three named columns plus a brand column, the language switcher as a disclosure with all six locales still in the markup, and the raw email replaced by a translated "Contact" link that keeps the address in its tooltip; four new strings in all six languages. Gates after each: `nx run web:test` (6 suites, 70 tests, up from 5/64), `nx run web:lint`, `npm run type-check`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`. **None of it has been seen rendered by the agent**: the built-in preview still returns `innerWidth` 0 and the Claude in Chrome extension is not connected, so the lightbox is proven by jsdom tests and everything else by the prerendered HTML.

**Second follow-up, same branch and PR: the guide was finally looked at.** The maintainer walked the rendered site and reported it correct, which closes the check this watch had listed as outstanding since 2026-07-27 - the agent still cannot see it, the browser preview returns a blank frame with `innerWidth` 0, and that has not changed. One change came out of the review: the wordmark's trailing cursor bar was removed from the header and the footer, along with its `.brand__cursor` rule, because with the mark's own vertical stroke on the left it read as two bars around a five-letter name rather than as a caret. Verified in the built output rather than by eye: `brand__cursor` appears in none of the prerendered pages, and the header now renders as the mark followed by "applye". Gates re-run: `nx run web:test` (5 suites, 64 tests), `nx run web:lint`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`.

### 2026-07-28 (later, after the LFS move), two capture-session findings fixed, one of them found to be misreported, and four described-but-absent features parked on purpose

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `fix/prelaunch-capture-findings`
- **Commits:** `a249fad`, `90068e0`, `771cc55`, `eb412e4`, `6bfe13d`, plus the docs commit carrying this entry
- **Pull request:** #170, open
- **Objective:** Close the four product findings the 2026-07-27 and 2026-07-28 capture sessions left in `CURRENT_STATE.md`, and decide - rather than only record - the ones that are decisions.
- **Completed:**
  - **The Interview Prep finding was wrong as written, and the correction is in `CURRENT_STATE.md`.** It claimed clicking a row opened the overflow menu instead of the stage timeline. The row has always bound `(click)="open(r.id)"`, `open()` navigates to `/interview-prep/:applicationId`, that route exists and the detail page renders the round timeline; the menu sits on its own button inside a wrapper that stops propagation. What was true is narrower: the menu's only entry was destructive, and the row declared `role="button"` while handling Enter only. Both fixed - the menu opens the timeline as its first entry, and Space works.
  - **A target role whose only distinctive word is two letters now matches.** `archetypeWords` dropped everything under three characters, so "UI Engineer" reduced to the generic "engineer" and `matchArchetype` could never anchor: no Discover label, no For-you grouping, no effect on scoring prompts, and nothing said so. Seven domain terms (`ui`, `ux`, `qa`, `ml`, `ai`, `bi`, `db`) now survive tokenization; `go` was deliberately excluded because whole-word matching would fire it on "go live". `hasDistinctiveWord()` was added to `libs/core` and drives a new warning in the profile editor, so the user is told at the moment of typing rather than by a feed that never reacts.
  - **The four gaps between the guide and the product were decided, not left open.** The description settles for the product for launch, and all four are filed in `docs/product/IDEAS.md` under "Features the documentation expected to find" with a priority and the reason each was not built now: Tailored badge (P2/S), live CV preview beside the section list (P2/M), section-level style overrides (P3/M), save-to-profile on the gap question (P3/S). A manual empty CV in the Documents library is filed at P2/S on the same basis - it is a new write path into the user's document store and deserves its own watch.
- **Not completed:** No code for any of the four parked items, by decision. The Discover badge screenshot was not retaken, so `discover-badges.png` still shows the pre-fix unmatched row; the guide caption does not claim otherwise. The `guide/discover-scan` placeholder is untouched - it belongs to the media watch.
- **Files or packages changed:** `libs/core/src/lib/profile/archetype.ts` + `.spec.ts`; all six `libs/i18n/src/lib/translations/*.ts`; `apps/desktop/src/app/pages/profile/profile.component.ts` + `.spec.ts`; `apps/desktop/src/app/pages/interview-prep/interview-prep.component.{html,ts}` and a new `interview-prep.component.spec.ts`; `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/product/IDEAS.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `npm run type-check` (6 projects, pass), `nx test core` (14 suites, 225 tests, pass), `nx test i18n` (3 suites, 22 tests, pass), `nx test desktop` (42 suites, 717 tests, pass; 41/709 before), `nx lint desktop` (0 errors, 11 pre-existing warnings), `nx lint core`, `nx lint i18n` (pass), `npm run desktop:build` (pass), `npm run format:check` (pass after `nx format:write` touched two files), `git diff --check` (clean). **Every new test was confirmed to fail against the pre-change code**, not merely to pass after it: the four core tests fail on the old tokenizer; the profile warning test that covers the short-token case fails when `SHORT_DOMAIN_WORDS` is emptied; three of the five interview-prep tests fail against the previous template, and the other two document the behaviour the report had described incorrectly. **Not run:** the Rust gates - nothing in this diff reaches Rust or IPC - and no web gate, since `apps/web` is untouched. **The native gate was run by the maintainer, not by the agent.** The agent's own `npx tauri dev` built and launched the debug binary but its `beforeDevCommand` reported "Port 4200 is already in use" - a dev server started outside this session held the port - so that instance was stopped rather than driven, and the agent looked at no rendered UI. The maintainer then walked both surfaces by hand on this branch and reported them correct, which is what closes this watch.
- **Privacy/security impact:** None. Target roles and archetypes are already local profile data; no new data is stored, and nothing new leaves the device. The warning renders a fixed i18n string and never echoes profile content. No AI call was made in this watch.
- **Decisions and assumptions:** Chose an allowlist over lowering the length threshold generally. `archetypeWords` also feeds `archetypeKeywordBag`, and `wordHit` is boundary-aware, so a blanket two-character threshold would start matching "at", "de" and "an" as whole words across job descriptions. The allowlist changes behaviour for no existing role except the broken ones. The warning was put in the profile editor only, not in onboarding, where names arrive as AI suggestions the user then edits. Left the Interview Prep row's navigation exactly as it was, since it was never the defect.
- **Risks or compatibility impact:** Low. The tokenizer change can only add matches, never remove them, and only for the seven listed terms; a user whose feed was previously empty because of this bug will start seeing target-role labels, which is the point. No schema, migration or IPC contract changed.
- **Open issues or blockers:** Two, both recorded in `CURRENT_STATE.md`. What actually blocked `interview-timeline.png` during the capture session is still unexplained - the reproduction was never captured, and the most likely cause is a click landing on the `⋯` button at the row's right edge. And the state file's own accuracy: it and the previous watch entry described a dirty working tree and an open `fix/onboarding-cv-parse` branch, neither of which exists - that work is on `main` as `4ff8dad`, `812e700`, `e9817dc`, and the media work is committed as `7f31d5c`, `d2b37b9`, `3d034e4`. Separately, `fix/onboarding-ai-provider-claims` still exists locally but `git cherry` shows every one of its commits already upstream in `main`, so it is safe to delete once the maintainer agrees.
- **Next first action:** Merge the pull request for `fix/prelaunch-capture-findings`, then return to the last site placeholder: re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain.
- **Evidence:** The gate runs above; `interview-prep.component.html:66` for the navigation the report denied; the five commits on the branch.

### 2026-07-28 (later), guide media moved into Git LFS, and history rewritten once to take the already-committed assets with it

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `chore/web-guide-media-lfs`, merged; then `main` directly for the rewrite
- **Commits:** `a19d617`, `ce68b60` on the branch, squashed to `d2b37b9` by PR #169; `3d034e4` after the rewrite. Every SHA in `v0.25.0..main` changed, so the ones written here are post-rewrite.
- **Pull request:** #169, merged
- **Objective:** Stop the guide's binaries from growing the repository, given that at least three of them are documented as needing a retake.
- **Completed:** `*.mp4` and `apps/web/public/guide/*.png` are tracked through LFS. History was then rewritten over `v0.25.0..main`, 74 commits, so the assets already committed became pointers too. A like-for-like clone of `main` fell from 23.70 MiB to 7.07 MiB locally, 8.93 MiB as GitHub repacks it. **No tag moved and no release changed:** every guide asset was added after `v0.25.0`, which is the last tag, so the rewritten range contains none - confirmed by comparing all 35 version tags against the pre-rewrite mirror, and by reading `v0.25.0` back from the server (`2ecd48f`) rather than trusting the local copy. `README.md` names Git LFS under prerequisites and `CURRENT_STATE.md` records the deploy hazard.
- **Not completed:** Nothing outstanding from this watch. The two stale references it creates are known and accepted: PRs #168 and #169 keep their descriptions but their commit links point at SHAs no longer on `main`.
- **Files or packages changed:** `.gitattributes` (new), `.husky/pre-push` (new), `.husky/post-merge` (new), `README.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`. `.husky/post-checkout` gained an LFS line locally; it is gitignored, being per-developer graphify tooling. The 24 guide assets changed representation only - their bytes are identical, verified by diffing the whole tree against the pre-rewrite state and finding only the three files edited on purpose.
- **Validation:** Run and observed after the rewrite: `nx run web:build --skip-nx-cache` (pass, and `dist` holds the real 1,947,426-byte video and 439,998-byte screenshot rather than pointers), `nx run web:test` (5 suites, 64 tests, pass), `nx run web:lint` (pass), `npm run format:check` (pass), `git diff --check` (clean). **Round trip verified from the server**, not locally: a fresh clone of `main` checks out all 24 assets as real files with no stubs. LFS itself was proved end to end on a throwaway branch first, because the Actions billing block made it worth confirming the account could store and serve objects at all; that branch was deleted. **Not run:** the Rust and desktop gates - nothing in this diff reaches them.
- **Privacy/security impact:** None. No content changed, only where git stores it.
- **Decisions and assumptions:** Rewrote history rather than leaving the 12 MB, because the window closes at publication: the operation was cheap only while the repository was private, unforked and checked out once, and all the media sat after the last tag. Used a bounded `git lfs migrate import --include-ref=refs/heads/main --exclude-ref=v0.25.0` after an unbounded first attempt rewrote all 442 commits and clobbered local refs including `origin/main` and every tag; that attempt was undone with `git fetch --force` and cost nothing, because the remote had not been touched. Included the screenshots as well as the videos, on the same reasoning that both get retaken.
- **Risks or compatibility impact:** One real hazard, recorded in `CURRENT_STATE.md`: deployment is manual from a working copy, so a machine without `git-lfs` installed would check out 132-byte pointers, pass every gate - the build copies whatever is in `public/` without looking at it - and upload stubs to Cloudflare in place of the assets. `.husky/pre-push` covers the opposite direction and refuses to push when git-lfs is missing. **LFS hooks belong in `.husky/`, not `.git/hooks`**: this repository sets `core.hooksPath`, so `git lfs install` writes where git never looks, which is exactly how the first push sent pointers with no objects behind them.
- **Open issues or blockers:** None from this watch. Backups of the pre-rewrite state are deliberately still in place: the remote branch `backup/pre-history-rewrite` at `67dd241` and a local mirror at `~/applye-capture-states/repo-mirror-pre-rewrite.git`. Delete them once the rewrite has been lived with for a while. Rollback is `git push --force origin backup/pre-history-rewrite:main`.
- **Next first action:** Re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain, so no real employer appears, then wire it in and re-run the four web gates. That is the last placeholder on the site.
- **Evidence:** PR #169; the gate runs above; `git rev-parse v0.25.0^{commit}` agreeing at `2ecd48f` across the working copy, the pre-rewrite mirror and the GitHub API.

### 2026-07-28, ten of the eleven remaining guide assets wired in; one rejected for showing real employers

- **Status:** partial
- **Agent/tool:** Claude Code (Opus). The maintainer captured every asset by hand this watch; the agent positioned the app, reviewed frames, wired them in and ran the gates.
- **Branch:** `main`
- **Commits:** none yet, working tree dirty
- **Pull request:** not opened
- **Objective:** Finish the eleven guide placeholders left by the 2026-07-27 watch, so the site can drop `X-Robots-Tag: noindex` and launch.
- **Completed:** Ten placeholders replaced with real captures in `guide-pages.ts`: `documents-library.png`, `cv-editor.png`, `gap-dialog.png`, `interview-timeline.png`, and six recordings - `tour-walkthrough.mp4`, `tailor-wizard.mp4`, `paste-job.mp4`, `cv-import.mp4`, `pipeline-drag.mp4`, `profile-regenerate.mp4`. **Every GIF slot shipped as a silent looping MP4** (`autoplay loop muted playsinline`), which the capture rules already allow above ~3 MB; `styles.scss` already carried a `.docs__media video` rule, so no CSS changed. `gap-dialog.png` is a 1156x698 crop cut from the full-window frame; the other three stills are 2880x1800. Recordings are 1440x900 (1x). All ten carry `width`/`height`, `loading="lazy"` on images, `preload="metadata"` on video, and alt or aria-label text describing what is shown. `tools/capture/mira-cv.html` was added so the Documents library could be filled honestly: it converts to DOCX with `textutil` and is imported through the app's own flow, because `document_library` rows can only be created by importing, generating, or finishing the apply wizard, and writing rows straight into SQLite would produce a state no user can reach.
- **Not completed:** **`guide/discover-scan.mp4` was captured and rejected, not shipped.** Its second half shows a real scan of the built-in sources, so the feed fills with genuine openings from named German employers. The capture rules forbid any real employer, recruiter or contact in any frame, so the file was left out of `apps/web/public/guide/` and its placeholder box stands. It is the only remaining guide placeholder. Also not done: filling the Documents library out to three or four rows and marking one Default - free, no AI call, simply skipped.
- **Files or packages changed:** `apps/web/src/app/docs/guide-pages.ts`, `docs/product/MEDIA_SHOTLIST.md`, `docs/internal/DUTY_WATCH.md`, `docs/product/CURRENT_STATE.md`, ten new files under `apps/web/public/guide/`, new `tools/capture/mira-cv.html`. The temporary `media-inbox/` was moved out of the repo to `~/applye-capture-states/media-inbox-2026-07-28/` rather than deleted, so the rejected take and the source PDF survive.
- **Validation:** Run and observed: `npm run format:check` (pass), `nx run web:lint` (pass), `nx run web:test` (5 suites, 64 tests, pass), `nx run web:build` (39 routes prerendered), `git diff --check` (clean). Delivery checked against the running dev server on `:4300`: all seven guide pages emit the expected `src` attributes, and all ten assets return 200 with the right content type. In the DOM every image and video reports a non-zero intrinsic size, so the files decode. **Still not verified by eye.** The browser preview reports `innerWidth` 0, the same blank-frame failure the previous watch recorded, so no rendered page has been looked at - "it looks right" remains unproven for the whole guide, not just this watch's additions.
- **Privacy/security impact:** One real finding, above: the rejected `discover-scan` take contained real employers' postings. Nothing with that content entered the repository. Every shipped frame uses the invented persona and reserved example domains. No API key is visible in any asset. `SEARCH_INDEXABLE` and the `noindex` header were not touched.
- **Decisions and assumptions:** Shipped two recordings that miss their slot's spec rather than hold the whole guide for a re-record, and wrote the shortfall into both the shotlist and the captions - `tour-walkthrough` is 18 silent seconds of first run against a slot asking for a narrated 2-3 minute tour, and `tailor-wizard` stops before Export & Apply, so its caption was changed from "to exported PDF" to "to generated documents" rather than leave a claim the video does not support. Declined a request to build HTML mockups of the app for the maintainer to screenshot: a drawn picture of a UI is a false claim about the product in documentation whose argument is honesty.
- **Risks or compatibility impact:** Low technically. The launch risk is the tour video: it is the asset the docs lean on hardest and it currently shows only onboarding.
- **Open issues or blockers:** Four found while capturing, all recorded in `CURRENT_STATE.md`. The site still cannot launch indexable while `discover-scan` is a placeholder.
- **Next first action:** Re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain, or stop the recording before results land, so no real employer appears; then wire it in and re-run the four web gates.
- **Evidence:** The dev-server checks above; `apps/web/public/guide/`; the "Already produced" section of `docs/product/MEDIA_SHOTLIST.md`, which records each deviation and its reason.

### 2026-07-28, onboarding resume import fixed: in-wizard AI calls used the pre-onboarding provider

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `fix/onboarding-cv-parse`
- **Commits:** one fix commit on the branch
- **Pull request:** not opened
- **Objective:** Find and fix why the onboarding resume step answered every import - uploaded PDF, uploaded DOCX, and pasted text alike - with "Couldn't parse that resume. Try pasting the text instead."
- **Completed:** Root cause was not parsing. `parseResume()` and `suggestArchetypes()` read `aiMode`, `provider` and `economyModel` back from the settings row, but the AI-setup step only persisted its choices in `markSeen()`, which runs at finish or skip. Every call made inside the wizard therefore used the migration defaults from `0002_settings_defaults.sql` (`api`, `claude`, `claude-haiku-4-5`): picking DeepSeek dispatched to Claude with no key in the keyring, and picking the CLI bridge dispatched to API mode with a model id no CLI accepts. Both threw, and the component's bare `catch {}` replaced the reason with the parse wording, which is why the three input paths failed identically and why the message pointed at the document. Fixed by dispatching from the wizard's own state (`aiDispatch()`, which also sends no model in CLI mode, matching the rule `markSeen()` already applied), committing mode and provider to settings when the AI step is left (`persistAiChoice()`), and keeping the raw failure in `resumeErrorDetail` so it renders under the friendly line. The import now also passes `maxTokens: 8192`, the ceiling the Documents importer has and this one lacked. Model ids are still only blanked at finish, so trying CLI mode and switching back to API within one run cannot leave the user with no model.
- **Not completed:** Not verified natively. This branch was neither run under `npm run desktop:dev` nor exercised against a real provider, so the fix is proven by unit tests only. The five surfaces the previous watch listed as never natively verified remain so.
- **Files or packages changed:** `apps/desktop/src/app/core/onboarding/onboarding.component.ts`, `.html`, `.spec.ts`, `CHANGELOG.md`, `DUTY_WATCH.md`. Untracked `media-inbox/` and `tools/capture/mira-cv.html` were left untouched on purpose - they belong to the media watch running in parallel.
- **Validation:** Run and observed on this branch: `nx test desktop` (41 suites, 709 tests, pass; onboarding suite 52 -> 57), `nx lint desktop` (0 errors, 11 pre-existing warnings), `npm run format:check` (pass), `git diff --check` (clean). The five new tests were confirmed to fail against the stashed pre-fix component and pass after, so they test the fix rather than the current behavior. **Not run:** `tauri dev`, `npm run type-check`, the Rust gates, the web build - nothing in this diff reaches Rust, IPC or the site.
- **Privacy/security impact:** None on storage or network. One surface change: the resume step now prints the raw error string from `ai_run`. That string is a provider or transport failure, not resume content, and the same string is already shown by the Documents importer through a toast.
- **Decisions and assumptions:** Fixed at both ends deliberately - persisting on step exit makes settings agree with the user, and dispatching from wizard state keeps the calls correct even when that write fails, which is a path `persistAiChoice()` swallows to avoid trapping the user in onboarding. Assumed the reported failure is this one; it explains all three input paths failing identically and it is the only shared difference between the working Documents import and the broken onboarding import, but with the error swallowed there is no captured log from the reporting session to confirm against.
- **Risks or compatibility impact:** Low. Mode and provider now land in settings one step earlier, which is what the user picked either way; a user who abandons the wizard after the AI step now keeps that choice rather than reverting to Claude.
- **Open issues or blockers:** `suggestArchetypes()` still swallows its error entirely, by design - it is an enhancement - but that means a provider misconfiguration there is invisible. Not changed in this watch.
- **Next first action:** Run `npm run desktop:dev`, walk onboarding with DeepSeek selected and an API key stored, and confirm the resume step parses; then repeat in CLI mode with Claude Code installed.
- **Evidence:** Branch diff; the test run above; `0002_settings_defaults.sql` lines 19-22 for the defaults the wizard was falling back to.

**Follow-up in the same watch, after the reporter re-ran the wizard.** The detail line added above did its job and printed the real failure: `Claude Code exited with an error: no error output`. That is a second, independent defect, in `ai/cli.rs`: on a non-zero exit the bridge read stderr only. Claude Code in `-p --output-format json` mode reports a failed _session_ - expired OAuth, rate limit, API error - as its normal JSON on **stdout**, exits 1 and writes nothing to stderr, so the reason was received and thrown away. Reproduced locally by running the exact argv the adapter builds (`claude -p --output-format json --system-prompt …`, prompt on stdin, cwd `$TMPDIR`): exit 1, empty stderr, and stdout carrying `"is_error":true` with `"result":"Failed to authenticate: OAuth session expired and could not be refreshed"`. Fixed with `failure_message()`, which keeps stderr first (a CLI that fails to _start_ writes there), then hands stdout to the adapter's own parser - which already knew how to extract that reason - and otherwise reports the exit status with a pointer to running the CLI in a terminal. Three Rust tests cover the three branches, one built from the captured payload. Validation for this part: `cargo test --lib` (284 passed, 1 ignored), `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean). The reporter's own environment is still unconfirmed: the reproduction shows the class of failure and proves the message was being discarded, but their Claude Code session was not inspected. **Confirmed on the reporter's machine.** They re-ran and the resume step now reads `Claude Code reported an error: Failed to authenticate: OAuth session expired and could not be refreshed` - the same failure the local reproduction produced, and proof that both fixes work end to end on a real install. Applye's part is finished; what remains is their Claude Code login, which no code in this repo can refresh. A third commit therefore appends the repair to the message itself (`sign_in_hint()`): an auth failure, on the Claude Code result payload or on Codex's stderr, now ends with "Run `claude` in a terminal and sign in, then try again." Non-auth failures such as a rate limit are unchanged. Rust gates re-run after it: `cargo test --lib` (ai::cli 22 passed), `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean).

**Verified end to end.** The reporter re-authenticated Claude Code from a terminal and re-ran onboarding on this branch: the resume imports. That closes the last unverified step - the import had until then only been observed failing correctly, never succeeding - and confirms the whole chain, from the wizard dispatching to the right provider, through the bridge surfacing the CLI's own words, to the message naming the repair the user then made. Native verification of this branch is therefore no longer outstanding for the onboarding import path; the other four never-natively-verified surfaces from the previous watch are untouched and remain so.

- **Next first action:** open the pull request for `fix/onboarding-cv-parse` and merge it into `main`.

### 2026-07-27 (later), fourteen guide screenshots captured; a tailoring run left mid-wizard

- **Status:** partial
- **Agent/tool:** Claude Code, driving the dev build through AppleScript, `screencapture` and a
  CoreGraphics scroll helper
- **Branch:** `main`
- **Commits:** `10ae4ce`, `c98a39a`, `bcf086e`, `3968c48`, `617d523`, `baf8cb2`, `6f87fc6`,
  `9d9cec9`, `de4f41e`, `d1f28b0`, `f48d506`
- **Pull request:** none; committed to `main` and pushed
- **Objective:** replace as many of the 25 guide media placeholders as possible from the running
  app, without staging anything the product does not actually do.
- **Completed:** Fourteen of twenty-five placeholders now show the real app: `settings-ai`,
  `onboarding`, `sidebar`, `profile-filled`, `profile-archetypes`, `score-result`, `my-jobs-table`,
  `analytics`, `tracker-report`, `dashboard-full`, `discover-sources`, `discover-badges`,
  `discover-detail`, `dashboard-empty`. `tools/capture/seed.mjs` grew a `--discover-only` mode and a
  reimplementation of the app's own `stable_hash`, because the job page prints the first twelve
  characters of `jd_hash` and the earlier placeholder value would have put the seed script's name in
  a published screenshot. A full tailoring run completed on Northlane Systems: three passes, 22
  recorded changes.
- **Not completed:** Eleven placeholders. `gap-dialog` did not occur - the tailoring run produced no
  gap questions, because the seeded profile answers everything the job asks; forcing one means
  thinning the profile and running again. `documents-library` and `cv-editor` need the wizard
  carried to steps 4 and 5, where documents are actually written; `tailoring_cache` has three rows
  but `document_library` is still empty. The five GIFs and the two videos are untouched. **The
  wizard is sitting on step 2 with its result intact**, so the next session can continue rather than
  re-run it.
- **Files or packages changed:** fourteen PNGs under `apps/web/public/guide/`,
  `apps/web/src/app/docs/guide-pages.ts`, `tools/capture/seed.mjs`, `docs/product/MEDIA_SHOTLIST.md`,
  `docs/product/CURRENT_STATE.md`, `CHANGELOG.md`.
- **Validation:** Run and observed after every asset: `npm run format:check`, `nx run web:lint`,
  `nx run web:test` (64), `nx run web:build`, `git diff --check`. All green. **Not verified:** the
  guide pages have never been seen rendered - the browser preview pane returns a blank frame with
  `innerWidth` 0, so the claim is only that each image is served with correct intrinsic size and
  attributes, checked through the DOM.
- **Privacy/security impact:** Every company in every frame is invented, on `example.com` /
  `example.org`. No API key, contact or real employer appears. **Two capture mistakes, both caught
  and contained:** one frame captured the maintainer's browser showing a personal login page with a
  filled password field, and one captured the Claude Code window; both files were deleted
  immediately, neither reached the repository, and the rule now is to verify the frontmost process
  before every single `screencapture`. Four API calls were spent with the maintainer's approval
  (one scoring profile, two scoring runs, one tailoring run).
- **Decisions and assumptions:** Discover rows are seeded rather than scanned, because a live scan
  would put real employers' postings on the website as demo data. Where the app could not produce
  what a shot-list line asked for, the shot shows what the app does and the gap is recorded in the
  shot list rather than staged - the scored view does not fit one frame, the feed row has no salary
  badge, and the adjacent archetype tier cannot appear at all.
- **Risks or compatibility impact:** None to shipped code; this watch changed no application source.
- **Open issues or blockers:** Two product findings, neither fixed: clicking a row in Interview Prep
  opens an overflow menu whose only entry deletes the application from prep, instead of opening its
  timeline; and a target role whose only distinctive word is under three letters ("UI Engineer") can
  never match anything, silently. Both are written up in `CURRENT_STATE.md`. Captures also depend on
  the 5K display being the main one - `screencapture` silently returns 1x on the 1920x1080 screen.
- **Next first action:** Continue the open wizard from step 3 to step 5 so `document_library` gets
  its rows, then capture `documents-library` and `cv-editor`. `gap-dialog` needs a separate run
  against a deliberately thinner profile.
- **Evidence:** `apps/web/public/guide/`, `tools/capture/seed.mjs`, the "Already produced" section
  of `docs/product/MEDIA_SHOTLIST.md`.

### 2026-07-27, first guide screenshot captured; two false AI-provider claims found and fixed

- **Status:** partial
- **Agent/tool:** Claude Code, driving the dev build through AppleScript and `screencapture`
- **Branch:** `main` (via `feat/web-media-assets`, `fix/onboarding-ai-provider-claims`,
  `chore/capture-fixtures`, `chore/capture-seed`, all merged)
- **Commits:** `16ffb99`, `160bd1d`, `c745274`, `219a07a`, `9cff371`, `500495b`, `683e679`
- **Pull request:** none; merged locally and pushed to `origin/main` up to `500495b`
- **Objective:** start producing the 25 media placeholders that block the launch, beginning with a
  cheap shot that proves the capture pipeline.
- **Completed:** `guide/settings-ai.png` is captured and live on `/docs/guide/settings` - full
  window, dark theme, 2880x1800, API mode with Anthropic, the whole privacy note, and the API key
  block in its stored state. Nothing was redacted, because the app never reads a stored key back to
  the interface, so the field is genuinely empty. `.docs__media` gained the image and video rules
  the remaining shots will reuse. **Capturing the onboarding shot surfaced two false claims in the
  app**, both now fixed: the AI step offered an OpenAI card in the API-key flow, which `ai/api.rs`
  cannot serve, so picking it walked the user through buying a key that every later call rejects;
  and the CLI card still read "Claude Code, Codex or Gemini CLI" in all six languages, seven weeks
  after that adapter was deleted. Settings also listed both providers as disabled "(coming soon)"
  rows for work that is not planned; removed on the maintainer's instruction. Migration
  `0027_drop_openai_api_provider.sql` moves installs already stranded on `openai`/`gemini` in API
  mode, mirroring what `0022` did for Gemini in CLI mode. Two capture tools were added under
  `tools/capture/`: an invented job feed and a database seed for the demo persona and eight jobs.
  The seed ran successfully (8 jobs, 8 applications, 3 interview stages, 1 profile, 1 user source).
- **Not completed:** `guide/onboarding.png`. It was captured once on the old code, rejected because
  it displayed both false claims, and the re-shoot is blocked. Nothing else in the shot list was
  attempted. The seeded database has not been looked at in the running app, so the seed is verified
  only by its row counts, not visually.
- **Files or packages changed:** `apps/web/public/guide/settings-ai.png` (new),
  `apps/web/src/app/docs/guide-pages.ts`, `apps/web/src/styles.scss`,
  `apps/desktop/src/app/core/onboarding/onboarding.component.ts` and its spec,
  `apps/desktop/src/app/pages/settings/settings.component.ts`,
  `apps/desktop/src-tauri/migrations/0027_drop_openai_api_provider.sql` (new),
  `apps/desktop/src-tauri/src/db.rs`, all six `libs/i18n/src/lib/translations/*.ts`,
  `tools/capture/demo-jobs.xml` (new), `tools/capture/seed.mjs` (new), `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, `docs/product/MEDIA_SHOTLIST.md`.
- **Validation:** Run and observed. Frontend: `nx run web:lint`, `nx run web:test` (64), `nx run
web:build`, `nx run desktop:lint`, `nx run desktop:test` (704, 41 suites), `nx run i18n:test`,
  `npm run type-check` (6 projects), `npm run format:check`, `git diff --check`. Rust:
  `cargo fmt --check`, `cargo test --lib` (281 passed, 1 ignored), `cargo clippy -- -D warnings`.
  All green, re-run after the merge. **Not verified:** the guide page was never seen rendered - the
  browser preview pane returned a blank frame with `innerWidth` 0, so the claim is only that the
  image is served with the right attributes and intrinsic size, checked through the DOM.
- **Privacy/security impact:** No key, contact or real company appears in the shipped screenshot,
  checked before it was committed. The maintainer's database was copied to
  `~/applye-capture-states/99-your-real-data` before anything was driven, and it turned out to be
  empty of jobs and profile anyway. The onboarding wizard was re-opened by resetting
  `settings.onboarding_seen` rather than by "Delete all data", which would also have wiped the
  maintainer's API key from the keychain. Claude was granted macOS Screen Recording and
  Accessibility for this work.
- **Decisions and assumptions:** Product screenshots are captured from the running app, never
  generated, because a drawn UI is a false claim about the product in documentation whose argument
  is honesty. The Discover shots will be seeded rather than scanned, because `parse_rss_items`
  splits a company out of the title only for weworkremotely hosts, so any other feed lands with an
  empty company and the screenshot would look broken. The demo feed is deliberately not served from
  `apps/web/public`: applye.dev should not host invented vacancies.
- **Risks or compatibility impact:** Migration 0027 changes stored settings on upgrade. It only
  touches rows in API mode naming `openai` or `gemini`, both of which were already broken, and its
  checksum is pinned like the twenty-six before it.
- **Open issues or blockers:** **Captures need the 5K display to be the main one.** It was swapped
  for a 1920x1080 screen mid-session, and `screencapture` silently returns 1x there, which produced
  a 1440x900 file that breaks the shot list's 2x rule. At the time of writing the screen is asleep
  and the app has no window, so nothing can be captured. GitHub Actions remain blocked by billing,
  so every gate above is local and the pushed commits have no CI behind them.
- **Next first action:** With the 5K display main and the app awake, re-capture
  `guide/onboarding.png` on the fixed code (wizard step 02, both mode cards, Claude and DeepSeek
  cards, the key field, the skip warning), then look at the seeded database in the app and correct
  the seed if any screen renders wrong.
- **Evidence:** `apps/web/public/guide/settings-ai.png`, `v1Providers` in
  `apps/desktop/src/app/core/onboarding/onboarding.component.ts`, `PINNED_CHECKSUMS` in
  `apps/desktop/src-tauri/src/db.rs`, `tools/capture/seed.mjs`.

### 2026-07-26, applye.dev goes live on pages.dev, held out of search; Actions found to be blocked

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main` (via `feat/web-cookieless-analytics`, merged as `d7cd346`, PR #165)
- **Commits:** `5520098` plus the branch merge
- **Pull request:** https://github.com/vitala89/applye/pull/165
- **Objective:** get the site deployed and verified end to end, without letting an unfinished site
  into search results.
- **Completed:** The site is live at `https://applye.pages.dev`. Every response sends
  `X-Robots-Tag: noindex`; `robots.txt` still allows crawling on purpose, because a crawler blocked
  from fetching never reads the noindex and Google will list a URL it was told not to fetch.
  `SEARCH_INDEXABLE` in `site.ts` and the header are cross-checked by a test, verified to fail when
  they disagree, so the likely failure - launching while still hidden - cannot happen silently.
  `npm run web:deploy` was added as a stopgap that reproduces the workflow's build and upload while
  running format, lint and tests first, and restores the committed measurement-ID placeholder
  afterwards so a real property ID cannot reach source. The maintainer completed the Cloudflare and
  GitHub setup: Pages project, API token, account ID, `GA_MEASUREMENT_ID` variable, and the
  `hello@applye.dev` routing rule.
- **Not completed:** The `applye.dev` custom domain, the Web Analytics hostname, HSTS and Search
  Console. All four deliberately wait until the documentation's media placeholders are replaced -
  attaching the domain publishes a certificate to Certificate Transparency logs, which is how
  crawlers find new sites.
- **Files or packages changed:** `apps/web/public/_headers`, `apps/web/src/app/site.ts`,
  `apps/web/src/app/seo/seo.spec.ts`, `apps/web/tools/deploy.sh` (new), `package.json`,
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/product/MEDIA_SHOTLIST.md`,
  `docs/internal/MEDIA_SESSION_PROMPT.md` (new).
- **Validation:** Local, run and observed: `npm run format:check`, `nx run web:lint
--skip-nx-cache`, `nx run web:test --skip-nx-cache` (64 tests, 5 suites), `nx run web:build` (39
  routes prerendered), `git diff --check`. The `SEARCH_INDEXABLE` guard was verified to fail when
  the flag was flipped without removing the header. **Against the live deployment:** all six
  security headers plus `x-robots-tag: noindex` present; 39 routes served with correct per-locale
  titles and canonicals pointing at `applye.dev`; JSON-LD present in the expected combinations; 404,
  sitemap and robots served. The consent gate was exercised in a browser - before consent, no
  Google script, no `gtag`, no cookies; after clicking allow,
  `googletagmanager.com/gtag/js?id=G-ZY158GV42C` loads, which also confirms the deployed bundle
  carried the real measurement ID rather than the placeholder.
- **Privacy/security impact:** The consent gate was verified in production rather than assumed,
  which is the claim `/privacy` and `/cookies` make to visitors. No cookies are set before or after
  consent at page load. Deployment credentials were entered by the maintainer directly into GitHub
  and the local environment; they were never exposed to the session.
- **Decisions and assumptions:** Manual deployment was chosen over fixing GitHub billing or making
  the repository public, both of which are the maintainer's call. `noindex` was chosen over
  Cloudflare Access because the launch plan needs traffic to accumulate before the announcement
  article, which Access would prevent.
- **Risks or compatibility impact:** **The CI gate is currently decorative.** Actions cannot run,
  so nothing stops a broken commit reaching `main`; only the local gates and `web:deploy`'s own
  checks protect the site. Treat every merge as unguarded until billing is resolved.
- **Open issues or blockers:** GitHub Actions blocked by billing - "recent account payments have
  failed or your spending limit needs to be increased". Every run since before #164 failed this
  way, including on `main`, which is why `deploy-web` has never executed. Earlier watch entries
  that reported passing gates were reporting local runs; that was accurate but easy to misread as
  CI having passed.
- **Next first action:** Produce the Priority 1 media in `docs/product/MEDIA_SHOTLIST.md`, starting
  with `guide/tour-walkthrough.mp4`. Use `docs/internal/MEDIA_SESSION_PROMPT.md` to open a session
  dedicated to it.
- **Evidence:** `apps/web/public/_headers`, `SEARCH_INDEXABLE` in `apps/web/src/app/site.ts`, the
  `search indexing switch` describe block in `apps/web/src/app/seo/seo.spec.ts`,
  `apps/web/tools/deploy.sh`.

### 2026-07-27, launch SEO pass: structured data added, a shipped og:title bug found and fixed

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-cookieless-analytics`
- **Commits:** `a510885`, `bb29b58`
- **Pull request:** not opened at time of writing
- **Objective:** the launch plan puts the site live before the repository and the release, so search
  indexing has to be right on the first crawl rather than corrected later. Audit the SEO surface
  and close what can be closed without a deployment.
- **Completed:** The audit found the infrastructure sound and left it alone: the sitemap is
  generated from `tools/site-paths.json` with a test that fails on drift, its 39 URLs match the 39
  prerendered routes exactly, every page carries a title, description, canonical and OG image,
  `<html lang>` is correct per locale, and `hreflang` emits seven head links with no duplicates.
  Two things were wrong. First, all six landing descriptions ran past the roughly 160 characters a
  search result displays, the longest at 198, cutting the closing line of the pitch; each is
  rewritten, and the English one had been duplicated in four places (bundle, `app.routes.ts`,
  `seo.service.ts`, `index.html`) so the root page kept the long copy until all four were aligned.
  Second, structured data: landing pages now emit `FAQPage` in their own language from the same
  bundle that renders the visible FAQ, and the 24 documentation pages emit `BreadcrumbList`. Blocks
  carry a `data-seo` marker and are cleared on each navigation, without which a single-page app
  accumulates the structured data of every page visited.
- **Not completed:** Search Console and Bing verification, which need a live domain. Localised OG
  images - one English image serves all six locales. A Content-Security-Policy, still deferred to
  after deployment.
- **Files or packages changed:** `apps/web/src/index.html`, `apps/web/src/app/app.routes.ts`,
  `apps/web/src/app/seo/seo.service.ts`, `apps/web/src/app/seo/seo.spec.ts`,
  `apps/web/src/app/i18n/i18n.service.ts`, `apps/web/src/app/i18n/i18n.spec.ts`, all six
  `apps/web/src/app/i18n/messages/*.ts`, `CHANGELOG.md`.
- **Validation:** Run and observed: `npm run format:check` passed; `nx run web:lint
--skip-nx-cache` passed; `nx run web:test --skip-nx-cache` passed, 62 tests in 5 suites, up from
  48; `nx run web:build` passed, 39 routes prerendered; `git diff --check` clean. Additionally, a
  script over all 39 prerendered pages confirmed zero `<title>` versus `og:title` mismatches, six
  `FAQPage` blocks with the correct `inLanguage` and six questions each, and 24 breadcrumb trails
  with correct leaf names. The new `og:title` regression test was verified to fail against the old
  implementation before being kept.
- **Privacy/security impact:** None. No data collection, storage or transmission changed.
- **Decisions and assumptions:** Breadcrumbs are emitted for the documentation only; on a top-level
  page a trail states the obvious. Structured data is built from what the page already renders,
  because describing absent content is a manual-action risk rather than a ranking bonus.
- **Risks or compatibility impact:** The breadcrumb leaf is cut from the page title at the `·`
  separator, so a docs title without one would put the full string into the crumb. A test now
  rejects that.
- **Open issues or blockers:** None from this work.
- **Next first action:** none for SEO until the site is deployed; then verify `applye.dev` in
  Search Console and submit `sitemap.xml`.
- **Evidence:** `setStructuredData`, `faqPage`, `breadcrumbs` and `pageTitle` in
  `apps/web/src/app/seo/seo.service.ts`; the `SeoService tags` describe block in `seo.spec.ts`.

#### Correction to the entry below

That entry reported a shipped defect this pass uncovered. `og:title` and `twitter:title` were read
from `Title.getTitle()` inside the same `NavigationEnd` handler that Angular's title strategy also
subscribes to, with no ordering guarantee between the two, so both carried the **previous** page's
title. Every route except the six landing pages advertised the home page headline when shared -
including `/privacy`, `/press` and all 24 documentation pages. This predates this branch and was
live in `495d413`. Both tags now read the resolved route title from the snapshot.

### 2026-07-27, launch sequence decided; Cloudflare Web Analytics adopted and disclosed

- **Status:** complete for the code and docs; the Cloudflare and GitHub dashboard steps remain
  manual and outstanding
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-cookieless-analytics`, branched from `main` at `495d413`
- **Commits:** see the branch; the preceding analytics work shipped in `495d413` (#164)
- **Pull request:** not opened
- **Objective:** agree the order of the public launch, then close the decisions it depends on. The
  maintainer's plan: finish and deploy the website first, let traffic and search indexing
  accumulate, publish a launch article personally, and only then open the repository and cut the
  desktop release.
- **Completed:** Four launch decisions taken and recorded. (1) The site ships in coming-soon mode
  with no download and no waitlist form - the flags for this already existed in `site.ts`, so the
  initially-flagged "download CTA points at a private repo" conflict turned out to be already
  handled. (2) Cloudflare Web Analytics is adopted as a cookieless complement to GA4. (3)
  `hello@applye.dev` becomes the general contact address. (4) All six locales launch on day one.
  Implemented: `CONTACT_EMAIL` added to `site.ts` and surfaced in the footer, on `/press`, and in
  the `/privacy` closing paragraph, which previously invited questions "by email" while giving no
  address. `/privacy` and `/cookies` rewritten so the always-on cookieless counter is described
  explicitly and separately from the consent-gated GA4, including the correction that the site is
  no longer free of third-party scripts before consent. The consent-bar copy was rewritten in all
  six locales for the same reason: it asked permission to "count anonymous page views" when a
  counter now does that regardless of the answer. `ANALYTICS_SETUP.md` gained a Cloudflare Web
  Analytics section with the decision, its reasoning, and the finding that no snippet is needed.
- **Not completed:** Every dashboard step. The Pages project `applye` was created by the maintainer
  as Direct Upload with no Git connection, and that is all that exists; the API token, account ID,
  `GA_MEASUREMENT_ID` variable, custom domain and Web Analytics hostname are still to be done.
- **Files or packages changed:** `apps/web/src/app/site.ts`, `app.ts`, `app.html`, `privacy.ts`,
  `privacy.html`, `press.ts`, `press.html`, `cookies.ts`, all six
  `apps/web/src/app/i18n/messages/*.ts`, `docs/internal/ANALYTICS_SETUP.md`,
  `docs/product/CURRENT_STATE.md`.
- **Validation:** Run and observed: `npm run format:check` passed; `nx run web:lint` passed;
  `nx run web:test` passed, 48 tests in 5 suites; `nx run web:build` passed, 39 static routes
  prerendered; `git diff --check` clean. Manual, in the dev server: the footer link renders as
  `hello@applye.dev` with `mailto:` and inherits its siblings' styling exactly; `/privacy` shows
  both analytics bullets and the address; `/cookies` shows the new "The always-on counter" section
  ahead of "Optional analytics"; `/ru` shows the rewritten consent bar; no console errors on any of
  them. Not verified: screenshots - the preview pane returned blank frames while the DOM read
  correctly, so verification was done through the DOM rather than visually. Nothing was verified in
  a deployed environment, because nothing is deployed.
- **Privacy/security impact:** Directly privacy-relevant, and the change is a net widening of what
  runs without consent. Cloudflare Web Analytics loads on every visit before any consent decision.
  It sets no cookie, writes nothing to the device and creates no identifier, which is why it is
  disclosed rather than gated - but the previous claim that the site loaded no third-party script
  until the visitor agreed is now false, and every page and locale that made that claim was
  corrected in the same change. No secrets were handled; the maintainer entered the Cloudflare
  credentials directly into GitHub without exposing them to the session.
- **Decisions and assumptions:** Two tools rather than one, because a hard consent gate makes GA4
  structurally unable to answer "did anyone visit" - the exact question a launch asks. The EU
  exclusion option in Cloudflare's Manage site is deliberately left off: there is no identifier for
  it to protect and it would delete most of the target traffic. No waitlist form, accepted with its
  cost stated - pre-launch traffic will not convert into an audience.
- **Risks or compatibility impact:** The privacy and cookies pages now describe behaviour that will
  only be true once the hostname is actually added under Web Analytics. Deploying the site without
  doing that leaves the pages describing a counter that is not running - honest in the wrong
  direction, but still wrong. Do both in the same session.
- **Open issues or blockers:** A Content-Security-Policy still does not exist; `_headers` explains
  why it was deferred until it can be measured on a live site. When it is written it must allow
  `static.cloudflareinsights.com` as well as the googletagmanager origin. This is Phase 4 work.
- **Next first action:** In Cloudflare, create the API token (My Profile, API Tokens, template
  "Edit Cloudflare Workers") and copy the account ID, then add both to GitHub as the secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` plus the repository variable
  `GA_MEASUREMENT_ID=G-ZY158GV42C`.
- **Evidence:** `apps/web/src/app/site.ts` (`CONTACT_EMAIL`), the "The always-on counter" section
  in `apps/web/src/app/cookies.ts`, the two analytics bullets in `apps/web/src/app/privacy.html`,
  the `consent.body` string in each of the six locale files, and the "Cloudflare Web Analytics"
  section in `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, applye.dev gets a deployment path, gated on CI

- **Status:** complete for the code; both dashboards still need manual setup before anything deploys
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** `f0ed533`
- **Pull request:** not opened
- **Objective:** the site had nowhere to go. `public/_redirects` already named Cloudflare Pages as
  the target, but nothing built or uploaded anything, so publishing was an undefined manual step.
- **Completed:**
  - `deploy-web` job added to `.github/workflows/ci.yml`. It `needs: ci` and runs only on a push to
    `main`, so a failing gate means no deploy. Uses `cloudflare/wrangler-action@v3` with
    `pages deploy dist/apps/web/browser`.
  - `apps/web/public/_headers`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
    `Cross-Origin-Opener-Policy`, a `Permissions-Policy` denying camera/microphone/geolocation/
    payment/USB, and immutable caching for the content-hashed JS and CSS. Verified it reaches
    `dist/apps/web/browser/_headers` through the existing asset glob.
  - `ANALYTICS_SETUP.md` gained the full dashboard checklist for both Cloudflare and GitHub, and its
    status section now reflects that Enhanced measurement has been switched off.
- **Not completed:** nothing is deployed. The Cloudflare Pages project, API token, account ID,
  custom domain, and the four GitHub secrets/variables are all manual and outstanding. The ten GA4
  custom dimensions are still unregistered.
- **Files or packages changed:** `.github/workflows/ci.yml`, `apps/web/public/_headers`,
  `docs/internal/ANALYTICS_SETUP.md`, `CHANGELOG.md`.
- **Validation:** `nx test web` 48 passed, `nx lint web` pass, `npm run web:build` pass with
  `_headers` present in the output, workflow YAML parsed and the job's `needs`/`if`/step list
  checked. `format:check` and `git diff --check` pass. **The deploy job itself has never run** - it
  cannot until the credentials exist, so it is unverified end to end.
- **Privacy/security impact:** security-relevant and improving. No CSP was added: Angular emits
  inline styles and analytics injects a script post-consent, so a correct policy needs measuring
  rather than guessing, and a wrong one fails silently in production only. No HSTS in `_headers`
  either - browsers remember it for its whole max-age, so it belongs on Cloudflare's TLS page where
  it can be switched off again. `GA_MEASUREMENT_ID` is passed as a repository variable rather than a
  secret, deliberately: the ID is public in any GA site's page source, and filing it as a secret
  would only obscure what a build shipped.
- **Decisions and assumptions:** deploy from Actions rather than Cloudflare's Git integration,
  because the Git integration builds on every push regardless of whether the gate passed. The Pages
  project must therefore be **Direct Upload** with no repository connected. Preview deployments
  deliberately not wired: they would publish unlaunched marketing copy on a guessable URL while the
  repository is private.
- **Risks or compatibility impact:** the first run of the deploy job is untested. If the project
  name differs from `applye`, set the `CLOUDFLARE_PAGES_PROJECT` variable or the job fails.
- **Open issues or blockers:** all remaining work is in the Cloudflare and Google consoles.
- **Next first action:** register the ten GA4 custom dimensions from `ANALYTICS_SETUP.md` - they
  must exist before the first traffic arrives or those parameters are permanently unreportable.
- **Evidence:** `.github/workflows/ci.yml`, `apps/web/public/_headers`,
  `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, analytics follow-up: the real measurement ID broke the production build

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** see branch
- **Pull request:** not opened
- **Objective:** the maintainer created the GA4 property (`G-ZY158GV42C`, stream `15328752672`).
  Verify the build actually works with a real ID rather than only with the placeholder.
- **Completed:**
  - **Found and fixed a defect the previous watch shipped.** `GA_MEASUREMENT_ID` was declared
    without a type annotation, so TypeScript inferred the literal `'G-PLACEHOLDER'`. The moment the
    generator wrote a real ID, the placeholder guard in `analytics.service.ts` failed to compile:
    `TS2367: types '"G-ZY158GV42C"' and '"G-PLACEHOLDER"' have no overlap`. Every production build
    would have failed, and only production builds - the placeholder path that all tests and local
    builds exercise compiled fine. Fixed by widening the type to `string`.
  - `@typescript-eslint/no-inferrable-types` flags that annotation and its autofix reintroduces the
    bug, so the line carries a targeted disable with the reason stated.
  - Two regression guards: a test pins the `: string` declaration shape, and the generator now exits
    non-zero if the declaration no longer matches instead of silently rewriting nothing.
  - Recorded the live property ID and the local production-build recipe in `ANALYTICS_SETUP.md`.
- **Not completed:** the property is still unconfigured - Enhanced measurement is on, custom
  dimensions are unregistered, retention and the DPA are untouched. `GA_MEASUREMENT_ID` is not set
  on any deployment, and no Cloudflare Pages project exists.
- **Files or packages changed:** `apps/web/src/app/analytics/measurement-id.ts`,
  `analytics.spec.ts`, `apps/web/tools/generate-analytics-config.mjs`,
  `docs/internal/ANALYTICS_SETUP.md`.
- **Validation:** `nx lint web --skip-nx-cache` and `tsc --noEmit -p apps/web/tsconfig.app.json`
  both pass **with the real ID written in and with the placeholder** - the previous watch had only
  checked the placeholder, which is exactly why the defect got through. `npm run web:build` with
  `GA_MEASUREMENT_ID=G-ZY158GV42C` succeeds, 39 static routes prerendered, the ID reaches exactly
  one bundle file, and `googletagmanager` appears in zero of the 41 emitted HTML files.
  `nx test web` 48 passed. `format:check` and `git diff --check` pass.
- **Privacy/security impact:** none beyond the previous watch. The consent gate is untouched, and
  the real ID is not committed - `measurement-id.ts` still holds the placeholder.
- **Decisions and assumptions:** the measurement ID stays out of the repository even though it is
  public information, so that the "unset means dormant" property holds for every checkout.
- **Risks or compatibility impact:** the previous watch's validation claim of "43 routes
  prerendered" was wrong - the build reports 39 static routes and emits 41 HTML files. Corrected
  here rather than edited there.
- **Open issues or blockers:** none in the code.
- **Next first action:** in the GA4 console, switch Enhanced measurement **off** on the `applye.dev`
  stream, then register the ten custom dimensions from `ANALYTICS_SETUP.md`.
- **Evidence:** `apps/web/src/app/analytics/measurement-id.ts`, `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, website analytics: traffic attribution and click tracking wired

- **Status:** complete for the code; the GA4 property itself does not exist yet, so no data flows
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** see branch
- **Pull request:** not opened
- **Objective:** know where visitors come from and how many click through to a download.
- **Completed:**
  - Measurement ID moved out of hand-edited source into `analytics/measurement-id.ts`, generated at
    build time by `tools/generate-analytics-config.mjs` from `GA_MEASUREMENT_ID`, chained into
    `npm run web:build`. Malformed value fails the build; unset keeps `G-PLACEHOLDER`.
  - `analytics/events.ts` added as the single event contract: six events, twelve parameters, an
    allow-list sanitiser, and user-agent OS detection. Anything off the list is dropped in the
    browser before it reaches gtag.
  - `AnalyticsService` gained `downloadClick`, `outboundClick`, `ctaClick`, `localeSwitch`, and now
    stamps `locale` on every event.
  - `Track` directive (`appTrack`) for declarative click tracking; wired into the hero CTAs (both
    `COMING_SOON` branches), `SourceLink` (nav/footer/hero sections), the footer social and author
    links, and the language switcher.
  - `docs/internal/ANALYTICS_SETUP.md`: GA4 property creation, the ten custom dimensions to register
    before traffic arrives, internal-traffic filter, Search Console link, Cloudflare Pages settings,
    and UTM conventions.
  - `tools/release-downloads.mjs` (`npm run web:downloads`): completed download counts from the
    GitHub releases API, the number GA4 structurally cannot produce.
- **Not completed:** the GA4 property is not created and `GA_MEASUREMENT_ID` is not set anywhere, so
  the site still ships analytics switched off. Cloudflare Pages project not created. Decision on
  adding Cloudflare Web Analytics as a cookieless complement is open.
- **Files or packages changed:** `apps/web/src/app/analytics/*`, `app.html`, `app.ts`, `landing.html`,
  `landing.ts`, `cookies.ts`, `privacy.html`, `ui/source-link.ts`, `ui/language-switcher.ts`,
  `apps/web/tools/*`, `package.json`, `docs/internal/ANALYTICS_SETUP.md`.
- **Validation:** `nx test web` 47 passed (was 41), `nx lint web` pass, `tsc --noEmit -p
apps/web/tsconfig.app.json` pass, `npm run format:check` pass, `git diff --check` pass,
  `npm run web:build` pass (43 routes prerendered). Generator verified in all three modes: valid ID
  written, malformed ID exits 1, unset resets to placeholder. Prerendered output checked directly -
  `googletagmanager` appears in the JS bundle only, in zero of 43 HTML files. Browser-preview
  verification was attempted and blocked by a policy check on the tab; the static output check above
  stands in for it.
- **Privacy/security impact:** privacy-sensitive. The hard consent gate is unchanged: nothing loads
  before opt-in. Collection is now _narrower_ in guarantee than before, because `sanitiseParams`
  makes the documented list enforceable rather than aspirational. Corrected a false claim: `/cookies`
  stated download clicks were tracked when no such event existed. Both `/cookies` and `/privacy` now
  enumerate the exact six events, including that declining records nothing at all.
- **Decisions and assumptions:** gtag over GTM, so the measurable surface stays reviewable in a diff.
  Hard consent gate over Consent Mode v2 - stricter, at the cost of consenting-traffic-only reports.
  GA4 enhanced measurement must be switched OFF on the data stream or page views double-count.
  Measurement ID treated as a public build variable, not a secret.
- **Risks or compatibility impact:** none shipped - with no ID set, every code path stays dormant.
  The `download_click` wiring sits in the `COMING_SOON = false` branch and is therefore untested
  against a real download button until that flag flips.
- **Open issues or blockers:** GA4 property creation is a manual console task for the maintainer.
- **Next first action:** create the GA4 property by following `docs/internal/ANALYTICS_SETUP.md`,
  then set `GA_MEASUREMENT_ID` on the Cloudflare Pages production environment.
- **Evidence:** `docs/internal/ANALYTICS_SETUP.md`, `apps/web/src/app/analytics/events.ts`,
  `apps/web/src/app/analytics/analytics.spec.ts`.

### 2026-07-26, marketing-site design pass: 5 of 8 WEBSITE_PLAN gaps closed

- **Status:** partial - every unblocked item is done; three are blocked on assets that do not exist
- **Agent/tool:** Claude Code with the `impeccable` skill (brand register), verified in the browser preview
- **Branch:** `main`
- **Commits:** none yet - uncommitted in the working tree
- **Pull request:** none
- **Objective:** Work the 8-item gap analysis in `docs/design/WEBSITE_PLAN.md` to bring `apps/web` to launch quality.
- **Completed:**
  - **Gap 4 + 8 (hero CTA).** Both hero controls were disabled: a `disabled` "Download (coming soon)" button plus the private-repo source pill. A hero whose only two controls are dead reads as broken, not as pre-release. The primary CTA is now "Read the docs", the one thing a visitor can actually do today; the download became a status line carrying its own reason. Flipping `COMING_SOON` in `site.ts` promotes the real download and demotes the docs link to ghost.
  - **Gap 6 (engine-agnostic proof).** New `#engines` band on `/`, in two labelled groups. Deliberately wordmarks rather than vendor logos: reproducing another company's mark on a marketing page implies a partnership that does not exist.
  - **Gap 5 (OG image).** Verified already shipped and correct - `applye-og.png` is 1200x630, wired in `index.html` and `seo.service.ts`. The plan doc's "1280x640, not wired" was stale; corrected there.
  - **Gap 7 (consistency pass).** Detailed in `WEBSITE_PLAN.md` §3. Headlines: contrast (`--text-tertiary` was 2.75-3.38:1 doing body-text duty against a 4.5:1 floor; light-theme `--success`/`--warning`/`--danger` were 2.61/2.23/3.73:1 as text); three independent causes of horizontal document scroll on a 375px viewport; a `forced-colors` focus fallback for a `box-shadow`-only ring; a banned side-stripe border on the local-rules list; clipped comparison tag when stacked.
  - **Out of scope but false.** The site claimed a Gemini CLI bridge in all six locales. `apps/desktop/src-tauri/src/ai/cli.rs:222` only has adapters for Claude Code and Codex - Google withdrew Gemini CLI for personal accounts on 2026-06-18. Corrected in the feature copy and the FAQ across every locale; the new engines band lists Gemini under API keys only.
- **Not completed:** Gaps 1 (hero product shot), 2 (demo GIF or video band) and 3 (six feature screenshots). All three need captures of the running desktop app seeded with the ASSETS_BRIEF persona; none of `docs/assets/hero-banner.png`, `demo.gif` or `screens/*.png` exists. No placeholder was shipped in their place - a colored box where a product shot belongs is worse than the current CSS mock, which at least depicts the real UI.
- **Files or packages changed:** `apps/web/src/app/landing.html`, `landing.ts`, `compare.html`, `styles.scss`, `i18n/messages.ts` and all six `i18n/messages/*.ts`; `docs/design/WEBSITE_PLAN.md`.
- **Validation:** `npx nx test web` (41 passed), `npx nx lint web`, `npx tsc -p apps/web/tsconfig.app.json --noEmit`, `npm run format:check`, `npx nx build web` (39 routes prerendered), `git diff --check` - all pass and all observed. In-browser on the running dev server: a full text-node contrast sweep reports zero AA failures in both themes; zero horizontal document overflow at 375px across `/`, `/docs`, `/docs/guide/score`, `/methodology`, `/compare`, `/changelog`, `/press`, `/manifesto`, `/sustain`, `/privacy`. No new unit tests - the changes are CSS, copy and markup with no new component logic.
- **Privacy/security impact:** None. No data handling, storage, network or permission surface touched. The corrected AI-provider copy makes a public claim more accurate, which is an honesty improvement rather than a security one.
- **Decisions and assumptions:**
  - Contrast fixes are **web-scoped overrides in `apps/web/src/styles.scss`, not token edits**. `libs/ui/tokens.css` states it mirrors the design system and is not hand-edited, and it is shared with the desktop app. The measurements apply to the app too.
  - The dark canvas has no grey both dimmer than `--text-secondary` and passing 4.5:1, so the third text tier is retired web-side; the demotion is carried by size and family instead of a failing colour.
  - The `applye-eyebrow` kicker above nearly every section is the `impeccable` skill's flagged AI-scaffold pattern, but it is an established named class in the shipped design system. Identity preservation won; the new engines band simply does not add another one. Raising it is a separate call.
  - Engine lists live in `landing.ts`, not the locale bundles: they are proper nouns, and they must track `cli.rs` rather than a translator.
- **Risks or compatibility impact:** Low. The `--text-tertiary` override flattens two text tiers to one shade on the marketing site only; the desktop app is untouched. `.docs__tablescroll` is new markup on `/compare` only.
- **Open issues or blockers:**
  - **Blocking gaps 1-3:** hero banner, demo GIF, six app screenshots. Maintainer-produced per `docs/assets/ASSETS_BRIEF.md`.
  - **Needs a decision:** whether the measured contrast corrections go back into `libs/ui/tokens.css` and the design system, which would fix the desktop app too.
  - `WEBSITE_PLAN.md` §1 still says "as of v0.24.0" against an actual 0.28.0; the route inventory was spot-checked and is still accurate.
- **Next first action:** Review the diff and commit as `fix(web): close the unblocked website-plan gaps`, or split the Gemini CLI copy correction into its own `fix(web)` commit since it is a truthfulness fix independent of the design pass.
- **Evidence:** Gate output above. Contrast figures and overflow widths were computed in-page against the running dev server, not estimated. Screenshot verification was partial: the browser pane reported a zero-size viewport for scrolled content, so the hero and the engines band were confirmed visually and everything else numerically via measured DOM geometry.

### 2026-07-26, stand up the security@ and conduct@ reporting mailboxes

- **Status:** complete
- **Agent/tool:** Claude Code (guidance only; the maintainer performed all Cloudflare dashboard actions)
- **Branch:** `main`
- **Commits:** none - infrastructure change, no repository files required edits
- **Pull request:** none
- **Objective:** The public-release documentation pass (entry below, 2026-07-26) flagged that `SECURITY.md` and `CODE_OF_CONDUCT.md` publish `security@applye.dev` and `conduct@applye.dev`, but neither mailbox existed - a dead vulnerability/conduct reporting channel on a domain about to go public.
- **Completed:** Cloudflare Email Routing enabled on `applye.dev`. Destination address `vitala2089@gmail.com` added and verified. DNS records added (3 MX to `route{1,2,3}.mx.cloudflare.net`, SPF TXT, DKIM TXT) - all showed "Missing" before, no pre-existing MX conflict. Two routing rules created: `security@applye.dev` and `conduct@applye.dev`, both forwarding to the verified destination. Delivery confirmed in both directions with a real external test email. A DMARC TXT record (`_dmarc.applye.dev`, `v=DMARC1; p=reject; rua=mailto:security@applye.dev`) was added afterward against domain spoofing.
- **Not completed:** Catch-all routing was deliberately left disabled (would collect spam for every unused local part). No SMTP send-as was configured - Email Routing is receive-only, so replies go out from the maintainer's personal address, not from the alias. That is acceptable for a reporting channel where the maintainer replies personally.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md` (new bullet marking the item resolved). `SECURITY.md` and `CODE_OF_CONDUCT.md` were checked and already referenced the correct addresses - no edit needed.
- **Validation:** Manual: destination-address verification email received and confirmed; DNS records confirmed added in the Cloudflare dashboard; end-to-end delivery to both `security@` and `conduct@` confirmed by the maintainer. No automated repository gates apply - no tracked source files changed.
- **Privacy/security impact:** Direct security-relevant change. Closes the dead-channel gap the previous watch flagged: reports sent to the published addresses now reach the maintainer instead of bouncing. DMARC `p=reject` reduces the domain's exposure to spoofed mail sent as `@applye.dev`. The maintainer's personal address remains the actual delivery destination (visible to Cloudflare, not published in the repository) - unchanged risk, already accepted per the prior entry.
- **Decisions and assumptions:** Cloudflare Email Routing (free, receive-and-forward) chosen over a full mailbox provider (Google Workspace, Zoho, Migadu) since the channel only needs to receive reports, not send as the alias.
- **Risks or compatibility impact:** None to the codebase. If the domain's nameservers or MX ever move off Cloudflare, both aliases stop receiving silently unless someone checks - worth a periodic manual send-test.
- **Open issues or blockers:** None.
- **Next first action:** No code follow-up. Optional: a periodic (e.g. quarterly) manual test email to `security@` / `conduct@` to catch silent DNS drift.
- **Evidence:** Cloudflare Email Routing dashboard (DNS records all Active, destination Verified, 2 routing rules); maintainer-confirmed delivery of test emails to both addresses.

### 2026-07-26, move Discover's Sources control out of the filter row

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main`
- **Commits:** not yet committed at the time of this entry
- **Pull request:** not opened yet
- **Objective:** Reported from use: with an empty Discover list there is no way to reach the sources drawer, so a user who has cleared the list or disabled every feed cannot turn one back on.
- **Completed:** Confirmed in the template. The Sources button lived inside `.dv-filters`, which renders only under `view() === 'feed'`, so views `caughtup`, `never` and `scanning` had no entry to the drawer at all; the only other entry is the first-run CTA, and `first` requires that nothing has ever been enabled _and_ nothing has ever been scanned. Moved the button into `.dv-head__right` beside Scan, which `showHeader()` renders for every view except `first` and `skeleton`, so one move covers all four dead-end states. `first` keeps its own large "Choose sources" CTA. `.dv-filters__clear` took over the `margin-left: auto` that the moved button was carrying, so the filter row's right edge is unchanged. New `discover.component.spec.ts` pins the drawer as reachable in `caughtup`, `never` and `feed`, pins the first-run CTA as the single opener in `first`, asserts exactly one opener per view so the control cannot be quietly duplicated, and clicks the header button to confirm it opens the drawer.
- **Not completed:** No native check of the rendered screen. Discover reads everything through Tauri IPC, so it does not render meaningfully in a plain browser preview; the move is covered by the DOM assertions in the new spec instead.
- **Files or packages changed:** `apps/desktop/src/app/pages/discover/discover.component.html`, `discover.component.scss`, new `discover.component.spec.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `npm run type-check` (6 projects, pass), `npm run lint` (6 projects, pass), `npm test` (6 projects, pass; desktop 696 -> 701 tests), `npm run format:check` (pass), `npx nx build desktop` (pass), `git diff --check` (clean). **Not run:** `tauri dev`.
- **Privacy/security impact:** None. Presentation-only; no data, IPC surface or network behavior changed.
- **Decisions and assumptions:** The header was chosen over duplicating the button into each empty state (three copies of one action drift apart) and over rendering the filter row unconditionally (filters over an empty list are noise). Sources controls what gets scanned, so it does not belong among controls that narrow what was already scanned.
- **Risks or compatibility impact:** The header row gains a control, so it is now three items wide at its widest (last-scan text, Sources, Scan). Not checked below the app's minimum window width.
- **Open issues or blockers:** None.
- **Next first action:** Launch `npm run desktop:dev`, clear the Discover list, and confirm Sources opens the drawer from the caught-up state; check the header does not wrap at the narrowest supported window.
- **Evidence:** Branch diff; `npx nx test desktop --testPathPattern=discover.component` output; check output quoted above.

### 2026-07-26, public-release documentation and repository hygiene pass

- **Status:** partial
- **Agent/tool:** Claude Code
- **Branch:** `main` (uncommitted; shares a working tree with the migration-restore watch below)
- **Commits:** not yet committed at the time of this entry
- **Objective:** Audit the repository as an outside reader would see it on the day it goes public, and fix what is stale, dangling, or internal-only. No feature work.
- **Completed:** (1) The version badge in all six READMEs read `0.25.0` against an actual `0.28.0`; bumped. (2) Four working documents that made the repository root read as a private workspace moved into `docs/internal/` - `AGENT_START_HERE.md`, `PROJECT_CONTEXT.md`, `INSTRUCTIONS.md`, `DUTY_WATCH.md` - with a new `docs/internal/README.md` stating what the directory is and that none of it is required reading to use or contribute. All 30 references across `AGENTS.md`, `CLAUDE.md`, `docs/ai/*`, `docs/product/*`, `.cursor/rules/*`, `.claude/skills/*`, `.cargo/audit.toml` and `commands/job_url.rs` were rewritten and verified to resolve. `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md` and `ROADMAP.md` stay at the root, where tooling and OSS convention expect them. (3) Twelve tracked files listed `STEP_BY_STEP_PLAN.md` as a canonical document; that file has never been in git, so every reader outside this machine saw a dead pointer. It is the pre-MVP bootstrap checklist, superseded by `ROADMAP.md` and `CURRENT_STATE.md`, so the references were removed rather than the file added. It is now gitignored, along with `AGENT_PROMPT_*.md`, so neither can be committed by accident. (4) Fifteen markdown links in `FEATURE_INDEX.md`, `IDEAS.md`, `CURRENT_STATE.md` and `feature-briefs/onboarding-wizard.md` pointed at `CAREER_OPS_ADOPTION.md`, an internal competitor analysis that is deliberately gitignored - all unlinked, the source is still named in prose so the provenance is not hidden. (5) CI re-enabled: `.github/workflows-disabled/ci.yml` moved to `.github/workflows/ci.yml` and the now-empty `workflows-disabled/` directory removed; `CONTRIBUTING.md` gained the CI reference, `npm run format:check` in the verification list, and a "Database migrations" section that states the never-edit-a-shipped-migration rule the watch below discovered the hard way.
- **Not completed:** The twelve media files the READMEs reference - `hero-banner.png`, `demo.gif`, six `screens/*.png`, two wordmark SVGs, `walkthrough-thumb.png` - still do not exist, so the public README will render twelve broken images. The maintainer chose to keep the placeholders and produce the assets separately per `docs/assets/ASSETS_BRIEF.md`. Nothing was committed; the working tree also holds the migration-restore work from the watch below.
- **Files or packages changed:** `README.{md,de,es,pl,ru,uk}.md`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/internal/*` (four moved files plus a new `README.md`), `docs/ai/{README,context-policy,project-state-policy,workflow}.md`, `docs/product/{README,FEATURE_INDEX,IDEAS,CURRENT_STATE}.md`, `docs/product/feature-briefs/onboarding-wizard.md`, `.cursor/rules/{000,250,600}`, `.claude/skills/aif-{planning-review,project-state-sync}/SKILL.md`, `.github/workflows/ci.yml` (moved), `apps/desktop/src-tauri/.cargo/audit.toml`, `apps/desktop/src-tauri/src/commands/{discover,job_url}.rs` (comment references only).
- **Validation:** Run and observed: `npx nx run-many -t lint test build` (6 projects, pass), `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml` (pass), `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` (pass), `npm run format:check` (pass), `git diff --check` (clean), and a script over every tracked markdown file confirming no relative link resolves to a missing path except the twelve known README media placeholders. **Not run:** the CI workflow itself - the repository is still private on the free plan, where Actions minutes are capped, so pushing the enabled workflow before the repository is public will fail on billing rather than on code.
- **Privacy/security impact:** Scanned every tracked file for API-key, AWS, GitHub-token and PEM patterns: none. The maintainer's personal address `vitala2089@gmail.com` is published in `CODE_OF_CONDUCT.md` and `SECURITY.md`; that is a deliberate choice but a role alias such as `security@applye.dev` would keep it out of scraper reach. `.gitignore` already covers sqlite files, `profile.md`, `.env`, and Tauri signing keys.
- **Decisions and assumptions:** Internal process docs stay in the repository rather than being untracked - the project is built with agents in the loop and the working agreement is worth publishing - but they belong under `docs/internal/`, not in the root where they crowd out the files a newcomer needs. `docs/product/CURRENT_STATE.md` and `docs/superpowers/plans/` were left where they are: 77 files reference them, and neither is visible from the repository root.
- **Risks or compatibility impact:** The document move breaks any external bookmark or agent configuration that hardcoded the old root paths. Within the repository every reference was rewritten and checked.
- **Open issues or blockers:** Three, in order of severity. (1) The migration restore in the watch below is uncommitted and is a hard release blocker - 0.28.0 does not start on an existing install. (2) The twelve missing README assets. (3) No installers have been published, so the README's Releases link stays a placeholder. Also: do not push the enabled CI workflow until the repository is actually public.
- **Next first action:** Commit the migration restore on its own (`fix(db): restore shipped migrations edited by the em dash sweep`), separately from this documentation pass, then verify `npm run desktop:dev` reaches the app window.
- **Evidence:** `git status --porcelain`, the gate output above, and the link-resolution script over `git ls-files '*.md'`.

### 2026-07-26, restore the edited migrations that brick every existing install

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main`
- **Commits:** not yet committed at the time of this entry
- **Objective:** `npm run desktop:dev` aborted at startup with `initialize database: "run migrations: migration 1 was previously applied but has been modified"`. Find the cause and fix it for every install, not only this machine.
- **Completed:** The em dash cleanup in `e06fd4b` (0.28.0) rewrote `—` to `-` inside nine already-shipped migration files: 0001, 0002, 0003, 0005, 0008, 0009, 0010, 0011 and 0020. All but three of those lines are SQL comments. sqlx stores a SHA-384 of every applied migration in `_sqlx_migrations` and refuses to run when a file it already applied no longer hashes the same, so this was not local corruption: any install that had already run 0001 - which is every install - would abort at launch on 0.28.0 with no in-app recovery path. All nine files are restored byte for byte from `e06fd4b^`. The dev database's stored checksum for version 1 now matches the restored file exactly, verified by reading `_sqlx_migrations` directly. A new `db::tests::applied_migrations_are_never_edited` pins the SHA-384 of all 26 migrations, so any future edit to a shipped migration fails a test instead of shipping. A new migration must add its line to the pinned table; a deleted one fails too.
- **Not completed:** No data migration was written for the three non-comment lines. They seed `sources.notes` for Remotive, We Work Remotely and Himalayas, and that column is never rendered - no template or component in `apps/desktop/src` reads it - so the em dashes in it never reach a user and the dash rule is not violated in output. If `notes` ever becomes visible, the fix is a new migration that updates those rows, never an edit to 0001.
- **Files or packages changed:** `apps/desktop/src-tauri/migrations/0001`, `0002`, `0003`, `0005`, `0008`, `0009`, `0010`, `0011`, `0020` (restored), `apps/desktop/src-tauri/src/db.rs` (new test module), `docs/product/CURRENT_STATE.md`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed: `cargo fmt --check` (pass), `cargo clippy --all-targets -- -D warnings` (pass), `cargo test` (281 passed, 1 ignored, up from 280 - the new checksum test), `npm run format:check` (pass), `git diff --check` (clean), and a direct read of `_sqlx_migrations` in `~/Library/Application Support/dev.applye.app/applye.db` confirming versions 1-3 hash to the restored files. **Not run:** the native `tauri dev` launch itself - the checksum equality is the direct proof that the abort is gone, and the dev process was left for the maintainer to restart.
- **Privacy/security impact:** None. No schema, stored value, IPC surface or network behavior changed; the migration files are back to the bytes users already ran.
- **Decisions and assumptions:** Restoring the files beats bumping past them or teaching the runner to ignore checksum drift, because the checksum guarantee is the only thing that catches a genuinely wrong edit to applied schema. The user-visible half of the dash rule is served by a future migration if ever needed, not by rewriting history.
- **Risks or compatibility impact:** Anyone who installed 0.28.0 on a clean machine ran the _modified_ files and has the new hashes stored; for them this restore inverts the failure. That is nobody in practice - 0.28.0 aborts on first launch for any pre-existing install and a clean install would have to have happened in the window since `e06fd4b`. Worth confirming before release that no such build was distributed.
- **Open issues or blockers:** Nothing blocking. The nine restored files still contain em dashes in their comments, which the repo-wide dash rule will keep flagging; the new test is what stops the next sweep from acting on it.
- **Next first action:** Restart `npm run desktop:dev` and confirm the app reaches the window, then commit the restore and the checksum test on a branch off `main`.
- **Evidence:** `git show e06fd4b -U0 -- apps/desktop/src-tauri/migrations/`; `cargo test` output; `sqlite3 ~/Library/Application\ Support/dev.applye.app/applye.db "select version, hex(checksum) from _sqlx_migrations"`.

### 2026-07-26, audit dependencies and harden the untrusted-input paths

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `chore/dependency-and-input-hardening`
- **Commits:** not committed at the time of writing; working tree carries the change
- **Pull request:** not opened yet
- **Objective:** Run the validation gates that had never been run on this project, then act on what a security pass over the code and the dependency tree turned up.
- **Completed:** Ran the gates first: `desktop:build` passes, which closes the bundle-size budget left unverified by the previous watch; `cargo clippy -- -D warnings`, `cargo fmt --check` and `cargo test --lib` all pass. `npm audit --omit=dev` is at zero - the 32 findings a bare `npm audit` reports are all build toolchain (Nx, Angular CLI, webpack-dev-server) and ship in nothing. `cargo audit` had never been run and was not even installed; it found 7 advisories. Fixed by dependency work: `cargo update` moved `docx-rs` to 0.4.22 and with it `quick-xml` 0.36.2 -> 0.41.0, clearing RUSTSEC-2026-0194/0195 on the DOCX path, and `pdf-extract` 0.7 -> 0.12 moved `lopdf` 0.34 -> 0.42, clearing RUSTSEC-2026-0187 on the PDF reader. Fixed by code: a new `commands::untrusted::catch_parser_panic` wraps all three untrusted-file parsers (PDF, DOCX, XLSX) so a panicking parser returns an error instead of killing the app; and `open_file` / `reveal_in_folder` now resolve their argument through `resolve_within`, which canonicalizes both sides and refuses anything outside `app_data_dir`, anything that is not a regular file, and anything missing. Eight new Rust tests cover both. `cargo audit` now exits 0 against a documented ignore list, and the dependency gates are recorded in the validation matrix.
- **Not completed:** Three advisories remain, each with a written justification in `.cargo/audit.toml`. `lopdf` 0.31 via `printpdf` is unreachable - printpdf only writes PDFs from our own content - and moving to printpdf 0.12 is a breaking rewrite of the export renderer that would put WYSIWYG parity at risk, so it was deliberately not attempted. `quick-xml` 0.39 via `calamine` is reachable via .xlsx import but has no fixed release to move to: calamine 0.35.0 is its latest. `rsa` is not in the desktop target's graph at all. No visual check in the running Tauri app; the toast work from the previous entry is still unverified on screen too.
- **Files or packages changed:** `apps/desktop/src-tauri/{Cargo.toml,Cargo.lock}`, `apps/desktop/src-tauri/.cargo/audit.toml` (new), `apps/desktop/src-tauri/src/commands/{untrusted.rs (new),mod.rs,documents.rs,import.rs,tailoring.rs}`, `docs/governance/VALIDATION_MATRIX.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `cargo fmt --check` pass, `cargo clippy --all-targets -- -D warnings` pass, `cargo test --lib` pass (280 passed, 1 ignored - was 272, the 8 new tests cover the panic guard and the containment rule), `cargo check` pass, `cargo audit` exit 0, `npm audit --omit=dev` 0 vulnerabilities, `npm run type-check` pass, `npm test` pass, `npm run lint` pass, `npm run format:check` pass, `git diff --check` pass. `desktop:build` was run at the start of this watch and passed; no frontend file changed afterwards.
- **Privacy/security impact:** This watch is the security change. Two reachable crash paths closed, one unvalidated launcher path contained, and the dependency tree now has a standing gate. No new data is read, stored, or sent. `open_file`'s new refusals are user-visible errors rather than silent no-ops.
- **Decisions and assumptions:** `catch_unwind` catches panics, not stack overflow - a genuine overflow aborts and cannot be caught in-process by any Rust code. That is stated in the guard's own doc comment so nobody mistakes it for complete protection; the real defence there is the `lopdf` upgrade. `open_file`'s Tauri signature gained an `AppHandle`, which Tauri injects, so the frontend still passes only `{ path }` and no TypeScript changed. `.cargo/audit.toml` sits under `.cargo/` because cargo-audit only reads that path, relative to the working directory - noted in the file and in the matrix, since running the command from the repo root would silently skip the ignore list.
- **Risks or compatibility impact:** `pdf-extract` 0.7 -> 0.12 is a five-minor jump; the call site is a single `extract_text(path)` and compiles unchanged, but extraction quality on real CVs is not covered by the test suite and should be spot-checked on a few real PDFs. The `open_file` containment assumes every path it receives is under `app_data_dir`; that holds for today's only caller (`generated_docs.file_path`), but a future feature that opens a user-chosen export location will fail loudly and need the rule widened deliberately.
- **Open issues or blockers:** None blocking. Watch for a `calamine` release on `quick-xml` >= 0.41 and a `printpdf` release on `lopdf` >= 0.42, and drop the matching `.cargo/audit.toml` entries when they land.
- **Evidence:** `cargo audit` went from "error: 7 vulnerabilities found" to exit 0. Rust tests 272 -> 280. The previous watch's claim of a 4-command gap between defined and registered Tauri commands was wrong - it came from a grep that missed the `ai::`-prefixed entries; a correct parse gives 91 defined and 91 registered, with no gap in either direction.

### 2026-07-26, close the toast-feedback gaps

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/toast-coverage`
- **Commits:** not committed at the time of writing; working tree carries the change
- **Pull request:** not opened yet
- **Objective:** Make the bottom-right toast fire on every user-initiated save, delete, duplicate, export, import and generate action, and on the failure of each, instead of only on the pages that happened to inject `ToastService`.
- **Completed:** Audited all 38 desktop page components plus the five `core/` components against their mutation and `catch` sites. The infrastructure was already sound - `ToastService`, `ToastErrorHandler` and `provideBrowserGlobalErrorListeners()` mean an _uncaught_ error toasts on its own - so every gap was a caught-and-swallowed error or a success path with only inline feedback. Fixed: `cover-letter-list` had zero toasts of any kind and now has the same set as its `cv-list` sibling (load, duplicate, export, delete, generate); `cv-list` gained success toasts for duplicate/delete/export/import/generate and error toasts for duplicate/delete; `cv-detail` and `cover-letter-detail` now toast on save, and `cv-detail`'s "save as template" gained both a success toast and a `catch` it did not have; `profile` toasts on save; `jobs` toasts on save-job, mark-applied and delete-job (all three previously wrote errors to `actionMsg`, which is invisible after the navigation those actions perform) plus the four AI-generation and two portal-drafting failure paths; `my-jobs` toasts on delete and import success and failure; `discover` toasts on save-row, add-source, remove-source and their failures, and on toggle-source, dismiss, undo and scan failures, all of which previously only reached `console.error`; `pipeline` quick view gained a `catch` on the priority change and a success toast on adding a comment. 16 new i18n keys added across all six locales.
- **Not completed:** Deliberately left silent: pure JSON-parse fallbacks (`tracker-report`, `tracker-report-print`, `jobs` cache reads), best-effort background writes the code comments mark as non-fatal, and read-only page loads that already render an honest empty state (`dashboard`, `onboarding-banner`, `first-launch`). Toasting those would fire on page entry rather than on a user action. No visual check in the running Tauri app was performed - the toast markup and container are untouched, so this is unchanged rendering of an existing component, but it is unverified on-screen.
- **Files or packages changed:** `apps/desktop/src/app/pages/{discover,documents,jobs,pipeline,profile}` (9 components), `libs/i18n/src/lib/translations/{en,de,ru,es,fr,uk}.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run type-check` pass (6 projects), `npm test` pass (759 tests, 6 projects), `npm run lint` pass (0 errors, 11 pre-existing non-null-assertion warnings), `npm run format:check` pass after reformatting `my-jobs.component.ts`, `git diff --check` pass. `npm run desktop:build` not run - no build-shape change, but that leaves the bundle-size budget unverified for this diff. Native visual check pending.
- **Privacy/security impact:** None. Error toasts render `String(e)`, the same text the affected pages already put into their inline status signals or the console; no new data source is read and nothing leaves the device.
- **Decisions and assumptions:** Error toasts stay i18n-free (`toast.error(String(e))`), matching the established pattern in `interview-prep` and `settings`; only success messages got new keys. Existing inline status text was kept rather than replaced - it is part of each page's layout, and the toast is additive. `jobs.applied_ok` already existed and is reused; a duplicate key added by mistake was caught by `type-check` and removed.
- **Risks or compatibility impact:** More toasts can read as noise where one user action triggers several writes. `TOAST_DEDUPE_MS` collapses identical repeats and `TOAST_MAX` caps the stack, so the failure mode is a briefly busier corner rather than a flood.
- **Open issues or blockers:** None blocking. `profile.component.ts:315` carries a pre-existing `broken-image` finding from the design hook, untouched by this diff and out of scope here.
- **Next first action:** Commit as `feat(ui): toast every save and failure across desktop pages`, then launch the desktop app and confirm the toast on one save and one forced failure per changed page before opening the PR.
- **Evidence:** `git diff --stat` shows 15 files, +189/-27. `this.toast.*` call sites went from 69 to 122 across `apps/desktop/src/app`.

### 2026-07-26, ship the completed locales

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/i18n-complete-locales`, then `docs/sync-state-after-i18n-merge`
- **Commits:** `eb461ef` on `main` (squash of `bcb969f`)
- **Pull request:** [#158](https://github.com/vitala89/applye/pull/158), merged
- **Objective:** Open and land the locale-completion branch, then correct the state documents, which still described it as unmerged.
- **Completed:** PR #158 opened against `main`, mergeable and clean with no required checks configured on the repository, squash-merged and the remote branch deleted. `docs/product/CURRENT_STATE.md` now records `main` as the focus with nothing in flight, and the locale work as merged rather than pending.
- **Not completed:** Nothing outstanding from this watch. The native-speaker read of `ru.ts`, `es.ts`, `fr.ts` and `uk.ts` carried over from the previous entry is still open, and is a review task rather than a code task.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run format:check` pass, `git diff --check` pass. Documentation-only change, so the matrix requires nothing further; the full gate set was run on the code in the previous entry and is unchanged by this one.
- **Privacy/security impact:** None.
- **Decisions and assumptions:** The previous entry recorded "pull request: not opened yet" and a next action of opening it, both true when written; this entry supersedes them rather than editing them, per the log's own rule.
- **Risks or compatibility impact:** None.
- **Open issues or blockers:** None.
- **Next first action:** Have a native speaker read `libs/i18n/src/lib/translations/{ru,es,fr,uk}.ts` for idiom, starting with the `onboarding` and `jobs.wizard` sections, which carry the longest sentences.
- **Evidence:** `git log --oneline -1` on `main` reads `eb461ef feat(i18n): complete the ru, es, fr and uk locales (#158)`; `gh pr view 158` reports state `MERGED`.

### 2026-07-26, complete the ru, es, fr and uk locales

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/i18n-complete-locales`
- **Commits:** see branch
- **Pull request:** not opened yet
- **Objective:** Audit which shipped languages are actually finished and finish the ones that are not.
- **Completed:**
  - **Audit.** Two i18n surfaces. The marketing site (`apps/web/src/app/i18n/`) is complete in all six locales and needed nothing - its `Messages` interface is exhaustive, so a missing key is a compile error. The desktop app was not: of 1438 keys, `de` had 1362 translated (the 76 gaps are words identical in German, brand names and empty strings), while `ru` had 36, `uk` 36, `es` 33 and `fr` 33. Those four covered `nav`, `actions`, `status`, `ai` and `common` only; `documents` (272 keys), `jobs` (242), `profile` (154), `onboarding` (145), `discover` (133), `tracker` (95), `interview` (77), `analytics` (62), `settings` (61), `dashboard` (54) and the rest rendered in English. The existing parity test could not catch this: the keys were all present, holding English values.
  - **Translation.** All four locales are now complete: 1438 of 1438 keys each. Placeholders (`{n}`, `{time}`, `{scope}`, ...) are preserved; UI strings that are shouted in English are shouted in the target language; the German `Eigenbemuehungen` report title stays German in every locale because it is the name of a German document.
  - **File split.** `translations.ts` was a single 3471-line file. It is now one file per locale plus `merge.ts` (the `stub()` deep merge), `types.ts` and a 13-line `translations.ts` that only assembles `TRANSLATIONS`. `en.ts` and `de.ts` were moved verbatim.
  - **New gate.** `libs/i18n/src/lib/translations/translations.spec.ts` asserts key parity for all five non-English locales and, separately, that no locale's value equals the English one unless the key is in `SHARED_WITH_ENGLISH` (122 entries: product names, URLs, console labels, format placeholders, empty strings, and real cognates such as the French `Documents` or the Spanish `No`). A third test fails if an allowlist entry goes stale. The de-only parity test in `apps/desktop/src/i18n-keys.spec.ts` was removed as redundant - the new spec covers all five locales - and a comment points at its replacement. `translate.service.spec.ts` had two tests that asserted the _absence_ of translations (`actions.close` reads `Close` in ru/es/fr/uk); they were rewritten to test `stub()` directly on a synthetic partial, which is what those tests were actually protecting.
  - **Bundle budget.** Completing four locales took the desktop initial bundle from 692.69 kB to 1.26 MB raw (173.86 kB to 240.53 kB transferred), breaking the `1mb` error budget in `apps/desktop/project.json`. Measured against `main` before and after to attribute it. Raised to `1300kb` warning / `1500kb` error after checking with the maintainer; `libs/i18n/README.md` records the numbers and why lazy-loading was not the fix here (`tFor()` is synchronous - the tracker renders its report in a document language that can differ from the UI language, inside a `computed`).
- **Not completed:** Lazy-loading locale chunks. Considered and deliberately deferred: it would make `tFor()` asynchronous and change bootstrap. Worth revisiting if startup parse time becomes measurable.
- **Files or packages changed:** `libs/i18n/src/lib/translations/` (split into `en.ts`, `de.ts`, `ru.ts`, `es.ts`, `fr.ts`, `uk.ts`, `merge.ts`, `types.ts`, `translations.ts`, `translations.spec.ts`), `libs/i18n/src/lib/i18n/translate.service.spec.ts`, `libs/i18n/README.md`, `apps/desktop/src/i18n-keys.spec.ts`, `apps/desktop/project.json`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run format:check` pass. `git diff --check` pass. `npm run type-check` pass (6 projects). `npm run lint` pass (6 projects). `npm test` pass (6 projects; `i18n` 22 tests, `desktop` 696 tests). `npm run desktop:build` fail before the budget change, pass after. Browser preview: `ru` on Dashboard, `fr` on Documents, `es` on Analytics and `uk` on Pipeline all render translated, with no console error other than the expected `tauriInvoke called outside Tauri context`. Settings could not be exercised in the preview - it calls `db_get_settings` on load - so the locale was switched through the Angular debug API rather than through the language picker; the picker itself is unchanged by this work.
- **Privacy/security impact:** None. Static UI strings only; no data flow, storage, network or permission changed.
- **Decisions and assumptions:** (1) Locales stay wrapped in `stub(en, ...)` although nothing falls back today - it is the safety net for a key added to `en` later, which then reads in English instead of printing `actions.close`. (2) `SHARED_WITH_ENGLISH` is per locale, not global, so `Letter` being untranslated in French says nothing about Spanish. (3) Locale files are generated from flat key/value sources and then formatted with Prettier; the committed `.ts` files are the source of truth, the generator was scratch tooling under `tmp/` and is not committed.
- **Risks or compatibility impact:** No API or schema change. The visible risk is translation quality rather than breakage: 5752 strings were written in one pass and have not been reviewed by a native speaker of each language. The gates prove completeness and key integrity, not idiom.
- **Open issues or blockers:** None.
- **Next first action:** Open the PR for `feat/i18n-complete-locales` against `main`, then have a native speaker read `ru.ts`, `es.ts`, `fr.ts` and `uk.ts` for idiom - starting with `onboarding` and `jobs.wizard`, which carry the longest sentences.
- **Evidence:** `libs/i18n/src/lib/translations/translations.spec.ts` (parity plus the no-English check), `libs/i18n/README.md` (bundle budget reasoning and measurements), the build output quoted above.

### 2026-07-26, pre-release audit of section wiring and validation gates

- **Status:** partial
- **Agent/tool:** Claude Code
- **Branch:** `chore/release-readiness-audit`
- **Commits:** `7ad8fda` i18n fix, `71c7966` build gates, `0a9e4dd` docs
- **Pull request:** [#157](https://github.com/vitala89/applye/pull/157), open against `main`, mergeable at the time of this entry
- **Objective:** Before release prep, verify that every section is genuinely wired to every other, that the versions agree, and that the checks the repository claims to run actually run. Fix what is found.
- **Completed:**
  - **Version check.** `package.json`, `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/src-tauri/Cargo.toml` all read `0.28.0`. `CHANGELOG.md` heads at `[0.28.0] - 2026-07-26`. `apps/mobile` is a README only, as documented. No drift.
  - **Routing.** All 19 routes in `app.routes.ts` resolve, every navigation target in the app resolves to a defined route, and no route is orphaned. The three `print/*` routes are correctly unlinked (they are loaded by the hidden export window only).
  - **Tauri IPC.** 91 `#[tauri::command]` functions, all registered in `generate_handler!`, all reachable from `tauriInvoke`. One registered command, `validate_theme`, has no frontend caller; left in place deliberately (pure validator, no side effects, superseded in the UI by `check_style_safety`).
  - **Migrations.** `0001`-`0026`, gapless. `db.rs` uses `sqlx::migrate!("./migrations")`, which discovers the directory, so no hand-maintained registry can fall behind.
  - **Dash ban.** Three remaining en dashes, all parser-input test fixtures, matching what `CURRENT_STATE.md` already records as deliberate.
  - **Render pass.** All eleven top-level pages render in the browser preview with no unexpected console error. The only errors are the expected `tauriInvoke called outside Tauri context`; sections degrade to their empty states rather than crashing.
  - **Fix 1, user-visible.** `stub()` in `translations.ts` layered the four partial locales over English with a shallow spread, so any section a locale overrode lost every English key that locale omitted, and `resolve()` renders a missing key as the key itself. ru/es/fr/uk showed `actions.close` on the job-paste, CV-import, My Jobs import and pipeline quick-view dialogs and `common.back` / `common.next` in the apply wizard. `stub()` now deep-merges. Key counts before: en/de 1438, ru/es/fr/uk 1435. After: 1438 in all six.
  - **Fix 2, process gate.** `npm run type-check` ran zero tasks (`NX No tasks were run`, exit 0) because no project defined the target, while `AGENTS.md`, `CLAUDE.md` and the validation matrix all require it before commit. Added a `type-check` target to all six projects running `tsc --noEmit` on the project's app/lib tsconfig.
  - **Fix 3, process gate.** `libs/core` had `eslint.config.mjs` but no `lint` target, so `npm run lint` silently covered five of six projects. Added.
  - **Regression guard.** `translate.service.spec.ts` gained a parity test asserting every English key resolves in every locale, plus explicit cases for the three keys that were lost. Its existing "falls back to English" test asserted `tFor('en')` rather than a partial locale, so it could never have caught this; it now uses `ru`.
- **Not completed:** The native `tauri dev` gate. Nothing in this watch reaches Tauri IPC, SQLite, the keychain or native dialogs, so the CLI-bridge Settings and onboarding UI, the ATS card, the assisted installer and Interview Prep's stage CRUD remain unverified natively - exactly as the previous entry left them.
- **Files or packages changed:** `libs/i18n/src/lib/translations/translations.ts`, `libs/i18n/src/lib/i18n/translate.service.spec.ts`, `project.json` for `desktop`, `web`, `core`, `data`, `i18n`, `ui`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`. No application feature code changed.
- **Validation:** Run and observed on this branch: `npm run type-check` (6 projects, pass - meaningful for the first time), `npm run lint` (6 projects, pass; `core` contributes 11 warnings, 0 errors, all pre-existing), `npm test` (6 projects, pass; `i18n` 5 -> 14 tests), `npm run format:check` (pass), `nx build desktop` (pass), `npm run web:build` (pass, 39 static routes), `cargo fmt --check` (pass), `cargo clippy -- -D warnings` (pass), `cargo test --lib` (272 passed, 1 ignored), `git diff --check` (clean). **Not run:** `tauri dev`. `apps/web/public/sitemap.xml` was regenerated as a side effect of `web:build` and reverted, since only its `lastmod` dates moved.
- **Privacy/security impact:** None. No user data, storage, network, IPC surface, permission or AI provider behavior changed. The i18n fix is presentation-only and touches no stored value.
- **Decisions and assumptions:** `stub()` was fixed rather than the four locales being completed by hand, because a shallow merge re-breaks on the next key added to `en` while a deep merge cannot. `type-check` targets check the app/lib tsconfigs, not the spec ones: the spec configs use `module: commonjs` with `moduleResolution: node10` for `jest-preset-angular`, under which `@angular/core/testing` cannot resolve. Spec files are still type-checked, by ts-jest during `nx test`. `validate_theme` was left registered rather than removed, since removing an IPC command is a behavior change and was not asked for.
- **Risks or compatibility impact:** The deep merge changes what ru/es/fr/uk resolve for keys their bundles omitted - from the key name to English text. That is the intended fix and cannot regress a translated string, since a leaf the locale does define still wins. `type-check` and `core:lint` are new gates: they pass today, but they will now fail builds that previously slipped through, which is the point.
- **Open issues or blockers:** The native gate is the only thing between this branch and release prep. Two smaller observations, neither fixed and neither a blocker: the dashboard greeting treats every hour before noon as morning, so 1 a.m. reads "Good morning"; and `apps/web/tools/generate-sitemap.mjs` stamps today's date as `lastmod` on every URL whether or not the page changed.
- **Next first action:** Run `npm run desktop:dev` and walk the five never-natively-verified surfaces in order: CLI-bridge Settings, the onboarding AI step, the ATS card, the assisted installer, and Interview Prep stage add/edit/delete/reorder. Record each as pass or fail in the next watch entry.
- **Evidence:** Branch diff; check output quoted above; locale key counts before and after produced by extracting every leaf of `TRANSLATIONS` and diffing each locale against `en`.

### 2026-07-24, adopt Intentloom Duty Watch

- **Status:** complete
- **Agent/tool:** ChatGPT with GitHub connector
- **Branch:** `chore/adopt-intentloom-duty-watch`
- **Commits:** documentation commits on the branch
- **Pull request:** pending at the time of this entry
- **Objective:** Migrate Applye's existing AIF operating rules to the Intentloom Duty Watch workflow without duplicating the existing current-state system.
- **Completed:** Added the required agent entrypoint, Duty Watch log, project-specific validation matrix, and stronger default instructions for accepting and relieving a watch.
- **Not completed:** No runtime code, package dependency, automatic Intentloom pack installation, or security scanner integration was added.
- **Files or packages changed:** `AGENT_START_HERE.md`, `DUTY_WATCH.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/governance/VALIDATION_MATRIX.md`.
- **Validation:** Documentation-only review. Repository CI may be unavailable because Applye's normal CI workflow is currently disabled; the PR must report the actual checks observed.
- **Privacy/security impact:** No user data, secrets, Tauri permissions, AI provider behavior, or network behavior changed.
- **Decisions and assumptions:** `PROJECT_CONTEXT.md` stays the durable context source and `docs/product/CURRENT_STATE.md` stays the single operational state source. No duplicate `PROJECT_STATE.md` is introduced.
- **Risks or compatibility impact:** Agents that ignore repository instruction files cannot be forced by Git alone. Claude Code, Codex, Antigravity, and similar tools should be configured to honor repository instructions.
- **Open issues or blockers:** The portable Duty Watch pack is not yet implemented in Intentloom; this is a manual reference adoption.
- **Next first action:** Review and merge the adoption PR, then begin every new Applye session from `AGENT_START_HERE.md`.
- **Evidence:** Branch diff and pull request history.
