# Architecture Decision Record: an application layer owns page state, and the boundary is enforced

- **Status**: `accepted`
- **Date**: 2026-08-06

---

## Context

Applye's layering is real and already enforced. `eslint.config.mjs` carries `depConstraints` that fix
the direction of every dependency, `libs/core` is a genuine domain sink - a grep for `@angular/` and
`@tauri-apps/` across it returns **nothing** - and Tauri `invoke` is confined to `libs/data`. The
seven `@tauri-apps` imports in `apps/desktop` are `plugin-opener` and `plugin-clipboard-manager`:
shell actions, not data access. The boundary that matters holds.

What is missing is the ring between the app and the data gateway. There is no application layer, so
orchestration lives in components:

- **46 components inject `DbService` directly.** Exactly one store exists - `jobs.store.ts`, 66 lines,
  used in five places.
- `db.service.ts` is 461 lines over a 400 budget, with about 79 methods.
- **41 files are over their size budget**, and the pattern among the worst is the same: a page class
  is view, state and orchestration at once. `jobs.component.ts` is 1050 lines, `cv-preview` 1049,
  `cv-detail` 1019.

The lint rules are not being violated. `type:app → data` is in the allowlist, so a component injecting
`DbService` is exercising a right the rules grant it. `CODE_QUALITY.md` already says long workflows
belong in services or stores, but as advice without a gate, and it has lost 46 to 1.

The file-size campaign has now hit the wall this creates, twice and in the same way. Both times the
class shrank only while pure logic remained to extract, and both times it stopped when what was left
was state:

- **Profile** was stopped at 445/400 by an explicit maintainer decision through the grilling gate, in
  preference to building a `ProfileFormStore`. The remaining lines are one coherent lump of page
  state that no pure-function extraction reaches.
- **Discover** went 890 -> 730 across two cuts, `discover-location-selection.ts` and
  `discover-detail-scoring.ts`, and both were pure functions that had **no tests at all** because
  they were only ever exercised through a page. What remains is the scan pipeline and the detail
  loading path, and neither is a pure-function seam.

The campaign is treating a symptom. Continuing it without this decision means repeating the Profile
outcome page by page: extract what is pure, then stop and declare the rest permanent.

## Decision

**Introduce `libs/application`: the layer that owns page state and orchestrates services. A page
component renders and delegates; it does not hold the state of its own screen and does not reach the
data gateway.**

The unit is a **page store built on plain Angular signals**. `signal()`, `computed()`, and methods
that orchestrate. This follows `jobs.store.ts`, which already documents why it is not an NgRx
SignalStore: NgRx's peer range on `@angular/core` would gate every future Angular major on a release
of a library doing seventy lines of work. That reasoning is unchanged and now applies to the whole
layer.

**The boundary is enforced by lint, not by review.** A new tag `type:application` is added with

```
type:application → data, domain, util
```

and, **at the end of the migration and not before**, `type:data` is removed from `type:app`'s
allowlist. From that moment `@nx/enforce-module-boundaries` fails on any component that injects
`DbService` directly. Flipping it earlier would fail lint in 46 places at once, so until then the
rule is held by review - and that interval is the known weak point of this decision.

`libs/application` is tagged `scope:desktop`. This is forced, not chosen: `scope:shared` may only
depend on `scope:shared`, and the layer depends on `libs/data`, which is `scope:desktop`. It follows
that `apps/web` cannot see the layer, which is correct - it is a marketing site.

**Binding scope.** The rule binds new code from the moment it merges. Existing pages migrate **when
they are touched for another reason** - the same ratchet logic that works in this repository, and the
same trigger the file-size campaign already uses. The two therefore become **one stream of work**: a
page is taken, its state moves to stores, and its budgets converge as a consequence rather than as a
separate goal. Stylesheets and templates keep being cut by the existing method, which is unrelated to
this layer.

**A page store gets a 250-line budget**, its own category, tighter than the ordinary 400. A store is
the most likely thing to become the second god-object once the component stops being the first. This
has a consequence worth stating plainly, because it decides the shape of the work: since the ratchet
refuses a **new** file born over budget, `jobs.component.ts` at 1050 lines cannot move into one
store. It has to decompose into several, by responsibility. That is the point, not a side effect.

**`db.service.ts` stays as it is** and becomes internal to the layer. At roughly six lines per method
it is a mechanical mapping onto IPC, not complexity, and splitting it would touch imports in 46 files
for little gain - files the migration will rewrite anyway. It remains listed OVER and therefore can
never grow. It is cut into per-domain gateways when the ratchet refuses the next method added to it.

## Options Considered

- **A store colocated with each page in `apps/desktop`** (Pros: cheapest, nothing in `libs/` changes,
  works from day one, and `discover-sources.service.ts` is a precedent. Cons: **no boundary ever
  appears**. The rule would have exactly the force of the sentence already in `CODE_QUALITY.md`,
  which lost 46 to 1. Rejected for that reason alone.)
- **Stores inside `libs/data`** (Pros: no new tag, `jobs.store.ts` is already there. Cons: the IPC
  gateway and the orchestration share one library, so lint can never distinguish "a component called
  a facade" from "a component called `DbService`" - both are `type:data` and both are permitted.)
- **A stateless facade service** (Pros: smallest change. Cons: does not address the diagnosis. Page
  state stays in the component, and page state is precisely why those classes are 700 to 1000 lines.)
- **NgRx SignalStore** (Rejected, consistent with `jobs.store.ts`: a peer range on `@angular/core`
  that gates Angular upgrades, for behaviour `signal()` and `computed()` already provide.)
- **Migrating all 46 injection sites up front** (Rejected: weeks of work and a high regression risk on
  a codebase whose UI cannot be walked in a browser without Tauri IPC, so the only available evidence
  would be tests and backwards diffs.)

---

## Implications & Consequences

### Consequences

- Page components become renderers with inputs, outputs and delegation. That is what makes the
  remaining over-budget page classes tractable at all - the Profile and Discover outcomes above are
  what happens without it.
- Orchestration becomes testable without a `TestBed`, in the same way `discover-location-selection.ts`
  and `discover-detail-scoring.ts` became testable. Both gained tests for logic that had none.
- More files, and one more concept in the rules. The 250-line budget makes this deliberate: a page
  decomposes into several named responsibilities rather than one relocated lump.
- **There is a window where the rule is unenforced.** Between merging this and flipping the allowlist,
  only review stops a new direct `DbService` injection. Shortening that window is the reason the
  migration is bound to work already happening rather than scheduled separately.
- `libs/application` is a new public API surface. Changing its shape is a maintainer decision and goes
  through the grilling gate, exactly like `libs/core`.

### Privacy / Security Impact

None. No data crosses a new boundary, no storage or network behaviour changes, and `invoke` stays
confined to `libs/data`. The layer moves orchestration between files inside the same process.

### Reversibility

High, and cheaply. Nothing is generated, no schema moves, and no dependency is added. Reverting means
deleting the tag constraint and inlining stores back into their components - mechanical, type-checked,
and coverable by the tests written along the way. The one-way part is the allowlist flip at the end,
and even that is a two-line revert in `eslint.config.mjs`.

---

## Amendment, 2026-08-06: page-local pure modules move to `libs/core`

Discovered while building the first store, and general rather than specific to it.

**A library cannot import from an app.** So moving page state into `libs/application` drags the
page-local pure modules that state calls along with it - and the rule this ADR introduced ("a store
orchestrates, it does not calculate; pure rules live in `libs/core` or in a page-local pure module")
leaves those modules with nowhere to go.

**Decision: they move to `libs/core`, each as its own maintainer decision through the grilling gate.**
The alternative considered was letting `libs/application` hold pure modules beside its stores, which
would have meant amending the calculation rule on its second day; and a per-module "is it domain?"
judgement, which relitigates the same argument every time.

First application: `discover-detail-scoring.ts` became `libs/core/src/lib/jobs/job-scoring.ts` and
`jd-blocks.ts` became `jobs/jd-blocks.ts`, both beside `job-identity.ts`. Their 40 tests moved intact.

The cost is real and accepted: `libs/core`'s public API grows with each page migrated, and each
growth is a gate. The benefit is that the calculation rule stays true and `libs/core` keeps meaning
"the domain", rather than the layer accumulating a second, quieter domain of its own.

## Amendment, 2026-08-06 (second): only domain goes to `libs/core`

The first amendment sent every page-local pure module a store needs to `libs/core`. The second store
found the case where that is wrong.

`discover-console.ts` builds the scan console's lines: source names lowercased and dot-padded to a
22-character column, plus tone names that become CSS classes. It is pure, and a store needs it - but
it is **about how a widget looks**, and `libs/core` is the domain.

**Decision: the destination depends on what the module is about, not on whether it is pure.** A
domain rule goes to `libs/core` through the gate. A pure module that formats for one store goes
beside that store in `libs/application`. `discover-console.ts` became
`libs/application/src/lib/discover/scan-console.ts`.

Rejected: sending it to `libs/core` anyway, for the sake of one rule with no exceptions. The cost was
concrete - the domain library would gain a module about column alignment, and precedent would send
every similar module after it. Also rejected: leaving it in the app and having the page build the
lines, which would have kept `consoleLines` and `consoleExpanded` as page state, which is the thing
this ADR removes.

The cost accepted: "domain or format" is a judgement, and it is now made per module rather than by
rule. That is the second time in two days this ADR's calculation rule needed qualifying, which is
itself worth noticing.

## Amendment, 2026-08-06 (third): the layer never notifies the user

The first two amendments settled where a store's pure modules live. This one settles the other
direction: what a store does when the user needs to be told something.

`DiscoverSourcesService` was the last file under `pages/discover/` still injecting `DbService`, and it
**raises seven toasts**. `ToastService` lives in `apps/desktop/src/app/core/toast/`, so it is app-level
by construction, and `type:application` deliberately cannot depend on `type:ui` either. A store that
notified would make the whole layer depend on the app.

**Decision: nothing in `libs/application` notifies. A member returns its outcome and the component
decides whether and how to say it.** This is what all four Discover stores already did; it is now the
rule rather than four coincidences. The `type:data` allowlist flip stays the end state.

**Three outcomes, not two.** `string | null` - the convention `feed.save`, `feed.setDismissed` and
`scan.run` use - is not enough for a write that can refuse its own input: `null` would mean both
"created" and "nothing to do", and the caller would clear a form the user was still filling in. Writes
with that shape return `{ ok: boolean; error?: string }`, joining `clear()`'s existing
`{ removed } | { error }`. Two shapes in the layer, chosen by whether refusal is possible.

Options rejected:

- **A notification port in `libs/application`** - an injection token the app implements. It would have
  let a moved service keep its behaviour byte-for-byte, at the cost of a new public API on the layer
  and a second way to tell the user things.
- **Moving `ToastService` into a library.** Technically clean: its only dependency is
  `TranslateService`, which is `type:util`. Rejected because "the app owns telling the user" would stop
  being true, for a service the layer should not need.
- **A rule that notifying services stay in the app**, abandoning the allowlist flip. Rejected: it
  would leave ADR-0005's enforcement follow-up permanently open.

**What the audit found, which changed the size of the problem.** The handoff assumed this was the shape
of the last mile on every page. It is not: of the 19 non-component services that inject `DbService`,
**four notify** - `discover-sources` (7 calls), `job-actions` (4), `portal-answers` (2),
`cover-letter-tailor` (1) - and the other 15 raise nothing. The three remaining convert when their own
pages are migrated.

**And a planning fact worth recording, because it decides the shape of the next pages.** The 250-line
budget matches `/^libs\/application\/.*\.ts$/`, not only `*.store.ts`. Five services that must
eventually move are 251 to 326 lines - `cover-letter-tailor` 326, `tailoring` 326, `job-scoring` 319,
`job-identity-resolver` 268, `portal-answers` 251 - so they **decompose by responsibility when they
move** and do not relocate intact. That is the rule already stated for `jobs.component.ts`, confirmed
to apply to services too rather than only to stores.

## Amendment, 2026-08-06 (fourth): the allowlist flip was the wrong mechanism, and the migration order was wrong

Three corrections, all found by measuring rather than by reasoning, and all of them change what happens
next.

### The enforcement mechanism

This ADR said the boundary would be enforced by removing `type:data` from `type:app`'s allowlist "once
no component injects `DbService`". **Those two things are not the same rule.** `depConstraints` keys on
the **project** tag, so the flip bans the gateway from every file in `apps/desktop` - including the 18
`shared/*` services, which are not components and which the ADR never proposed to move. The flip was
therefore unreachable for a reason that had nothing to do with pages.

**Decision: a `no-restricted-syntax` rule scoped to `*.component.ts` files says what this ADR meant, and
it is an error as of now.** `COMPONENTS_STILL_USING_THE_GATEWAY` in `eslint.config.mjs` lists the 26
components that still inject `DbService`; a component not on that list fails the build. The list only
shrinks - each migrated page deletes its own line - and when it is empty the rule goes with it. This
closes the window this ADR called its own known weak point, years before the full flip could have.

The `type:data` allowlist entry stays, and now leaves only when the app's `shared/*` services have moved
too. That is a real remaining goal, but it is no longer what gates the page rule.

Rejected: a warning instead of an error - which is what `CODE_QUALITY.md` already was when it lost 46 to
1; and scoping the rule to already-migrated directories, which says nothing about a brand-new page
created somewhere else, the case the rule most needs to catch.

### The migration order

The handoff ranked the remaining pages by line count. Ranked instead by **dependency shape** - what the
migration can actually move - the order inverts:

| page                  | lines | `db.` calls | app services |
| --------------------- | ----: | ----------: | -----------: |
| `jobs`                |  1050 |           9 |       **22** |
| `cv-detail`           |  1019 |      **14** |            1 |
| `onboarding`          |   738 |          12 |            5 |
| `tracker`             |   667 |          11 |            1 |
| `cover-letter-detail` |   644 |          10 |            1 |
| `settings`            |   575 |           6 |            3 |
| `cv-preview`          |  1049 |       **0** |            0 |
| `cv-live-style-panel` |   704 |       **0** |            0 |

**`jobs` is the worst candidate, not the best.** Its 1050 lines are orchestration over 21 app-level
`shared/*` services across 150-odd use sites, against 9 gateway calls. A store in `libs/application`
**cannot inject any of them** - a library cannot import from an app - so the page's state cannot move
until the services do, and five of those are 251 to 326 lines and must decompose on the way
(`cover-letter-tailor` 326, `tailoring` 326, `job-scoring` 319, `job-identity-resolver` 268,
`portal-answers` 251). **Decision: `jobs` is deferred until its services migrate**, and this paragraph
is the reason, so the next session does not read the line count and start there.

**`cv-preview` and `cv-live-style-panel` reach the gateway zero times.** Their size is view and
interaction state, so this ADR does not reach them at all; `cv-preview`'s real seam is the
inline-editing protocol already recorded as blocked by decision.

**Decision: `cv-detail` is next** - 1019 lines, 14 gateway calls, one app service. Discover's exact
shape, so the method that just worked four times applies unchanged.

### How `cv-detail` decomposes

Three stores, one per pull request: **`CvDocumentStore`** (load, save, sections, reorder, lock,
regenerate, pull-from-profile), **`CvStyleStore`** (style, themes, templates), **`CvPhotoStore`** (photo
source and placement, the birthdate and marital-status toggles). Preview mode, live selection and the
return-to-wizard routing **stay page state**: they are view concerns, and the live-selection protocol is
what `cv-preview`'s blocked redesign will have to settle - migrating it now would prejudge that.

The style cluster is about 380 lines on its own, over a store's budget before it is written. **The
`CvStyle` cascade rules - how a scope change propagates through titles and entries - become a pure
module in `libs/core` as a new `cv/` directory**, beside `jobs/` and `profile/`. They are the semantics
of a `libs/core` model rather than formatting for one widget, which is the "domain or format" test from
amendment two; this paragraph is the `libs/core` public-API gate that amendment one requires.

## Amendment, 2026-08-07 (fifth): the `CvStyle` cascade is not domain, and a store need not own its own edits

Amendment four ended by sending the `CvStyle` cascade rules to `libs/core` as a new `cv/` directory,
and called that paragraph the public-API gate. **Reading the code before writing it reversed the
decision**, through the grilling gate that same paragraph required. Two facts settled it, and neither
was visible from the line count:

**The cascade's only input is a widget's wire format.** `applyTitleScopeChange`, `applyToAllTitles`,
`applyToAllEntries` and `applyBodyScopeChange` take `CvStylePanelChange` - the object
`CvLiveStylePanelComponent` emits - and nothing else. Amendment two's "domain or format" test puts
that on the format side: promoting it would have exported one panel's emission shape as `libs/core`
vocabulary, and dragged `CvPreviewSelection` and nine `apps/desktop` import sites with it.

**The eight helpers it delegates to were already a pure module, in the app.**
`cv-style.util.ts` (355 lines) imports only `@applye/core`, is re-exported through `cv-content.util.ts`,
and also serves the cover-letter editor. Moving the cascade to `libs/core` meant moving that file
wholesale - cover-letter helpers included - or splitting a module whose own header states why its
functions belong together.

**Decision: the cascade is `apps/desktop/src/app/pages/documents/cv-style-scope.util.ts`**, one pure
`routeCvStyleChange(style, selection, change) => CvStyle`, beside `cv-style.util.ts`. No `libs/core`
change. The page shrinks by the same amount either way - the routing leaves the class regardless; only
its library changes.

### What that implies for a store, generally

`type:application` may depend on `type:data`, `type:domain` and `type:util` - never on the app. So a
store **cannot call an app-local pure helper**, and this one does not: `CvStyleStore` holds `style`,
`themeId`, `styleNotes`, the theme baseline and the debounced `checkStyleSafety`, while every immutable
`CvStyle` transform stays in `apps/desktop`. The page composes a next style with those helpers and
commits it through `applyStyle`.

**A store owns state, not necessarily the code that edits it.** That is a weaker claim than this ADR
started with, and it is the honest one whenever the edit helpers are shared with a component or another
page. It also caught page geometry: `currentMargin`/`setMarginSide`/`setPageSize` clamp through the
app-local `resolvePageSettings`, so they stay on the page too.

Two further corrections to amendment four's decomposition:

- **The save-template trio is not style.** `openSaveTemplate`/`cancelSaveTemplate`/`confirmSaveTemplate`
  never read `style`; they write `cvTemplateUpsert` from sections, region tag and the photo store's
  flags. They belong to `CvDocumentStore`, PR 3.
- **`CvRegenerationStore` is confirmed as a fourth PR**, since the document cluster measures ~310 lines
  before `regenerateSection` and `pullFromProfile` are counted.

`cv-detail.component.ts` is **709/400** after this PR, from 962.

## Amendment, 2026-08-07 (sixth): what a store does with the app-local code it cannot import

Amendment five said a store owns state, not necessarily the code that edits it, and left open what to
do when the store genuinely needs that code rather than merely the result. `CvDocumentStore` hit it
immediately: its `load` must run `normalizeCvContent`, which lives in `apps/desktop`.

**The store takes it as a parameter.** `load(id, normalize: CvContentNormalizer)` - a named function
type on the store's own public surface. The page supplies the app-local implementation. This is the
third shape the campaign now has for the same constraint, and they are not interchangeable:

| The store needs                         | Shape                                 | Example                               |
| --------------------------------------- | ------------------------------------- | ------------------------------------- |
| a value the app computed                | the page computes and calls a setter  | `applyStyle(routeCvStyleChange(...))` |
| to be told what a sibling store decided | the sibling returns, the owner writes | `photo.sectionsForSave(sections)`     |
| to call app code mid-operation          | the caller passes the function in     | `load(id, normalizeCvContent)`        |

Prefer them in that order. A parameter is the most powerful and the least visible: it makes the store
depend on behaviour it cannot see, so it is worth reaching for only when the call has to happen inside
an operation the store owns.

**Amendment three, restated as it applies to a write:** `save` and `confirmSaveTemplate` return their
result and let a gateway failure throw. The toast, the transient "Saved" tick and the apply-wizard
hand-back stay on the page. A store that both writes and notifies would put the user-facing string in
the layer that has no `TranslateService`, which is how the rule earns its keep rather than being style.

### Correction to amendment five's follow-on

Amendment five's Duty Watch entry said `CvDocumentStore` would empty `cv-detail`'s entry in
`COMPONENTS_STILL_USING_THE_GATEWAY`. **It does not.** `regenerateSection` and `pullFromProfile` still
call `getProfile`, `getSettings` and `hashText` directly, so the page keeps `inject(DbService)` until
`CvRegenerationStore` lands. The allowlist shrinks at PR 4, not PR 3.

`cv-detail.component.ts` is **589/400** after this PR, from 709.

## Amendment, 2026-08-07 (seventh): `cv-detail` is done, and the first allowlist line comes out

Four pull requests, **1019 -> 517** against a 400 budget, and
`cv-detail.component.ts` is the first entry ever deleted from
`COMPONENTS_STILL_USING_THE_GATEWAY`: **26 -> 25**. Verified in both directions rather than assumed -
re-adding an `inject(DbService)` to the page now fails `nx lint` with the rule's own message, and the
file was restored byte-exact afterwards.

`CvRegenerationStore` reuses amendment six's parameter shape, and generalizes it: the two app-local
functions it needs mid-call are grouped into a named `CvRegenerationCodec` rather than passed
individually. When a store needs more than one, the interface is the readable form - it gives the
dependency a name the store's own documentation can refer to.

**A store raises typed errors, it does not phrase them.** `CvNoProfileError` carries no user-facing
text; the page catches it and picks the wording. This is the missing half of amendment three: "the
layer never notifies" was easy to honour for a success path and needed saying for a failure one, since
the obvious alternative - throwing `new Error(t('...'))` - puts the localized string in the layer that
has no `TranslateService`.

**One behaviour deliberately changed, rather than moved.** `pullFromProfile` used to assign the seven
contact fields **onto** the existing personal-details section and then re-set the sections array to
force a re-render. That works only because the array reference changed: the section object itself
stayed identical, so anything comparing sections by identity - an `OnPush` child taking one as an
input, a `track` expression - could not see the edit. `mergePersonalDetails` returns a new section, as
the rest of the section handling already does. Called out here because it is a change in behaviour
inside a refactor, which is exactly the kind of thing that should not pass silently.

### What remains

The next pages are `tracker` (667/400) and `cover-letter-detail` (644/400), which share Discover's
shape. `jobs` stays deferred until its `shared/*` services move.

## Amendment, 2026-08-07 (eighth): the layer may translate a document, and derived view state is not view state

`tracker` was measured before it was planned, and two of the positions this ADR had settled turned out
to be answers to a question the page does not ask. Both went through the grilling gate.

### `TranslateService` is not `ToastService`

Amendment three said "nothing in `libs/application` notifies", and amendment seven added "a store raises
typed errors, it does not phrase them" - the second one supported by the observation that the layer "has
no `TranslateService`". That observation was true and is not a rule. **`libs/i18n` is tagged
`type:util`**, so `type:application → data, domain, util` already permits it; the reason amendment three
gave applies to `ToastService` alone, which is app-local by construction.

The distinction the two rules were reaching for is **who the text is for**. A toast and an error message
are the layer speaking to the user, and the app owns that. The tracker's Eigenbemuehungen report is a
**document the layer renders**, and its language is deliberately not the UI language:
`reportT = tFor(reportMarket() === 'de' ? 'de' : 'en')` prints a German sheet out of an English app.

**Decision: a store may inject `TranslateService` for text that goes into a document it produces. It
still may not notify, and still may not phrase an error.** Without this, `buildCsv`, `buildReportText`,
`csvCell` and `periodLabel` - about 150 lines with no tests - either stay on a 708-line page or reach
the layer through a codec for a dependency lint already allows.

Rejected: a `TrackerReportCodec` carrying `{ t, tFor }`, which is amendment seven's shape applied where
the constraint it exists for is absent; and leaving the report on the page, which is the Profile outcome.

Consequence, stated plainly: "the layer never speaks to the user" now carries the qualifier "except in a
document it renders", and the qualifier has to be checked per store rather than assumed.

### Column visibility is not view state

The handoff into this phase recorded `colState` as view state that stays on the page, by analogy with
`livePanelOpen` and `collapsedSections` on `cv-detail`. The analogy does not hold. `colState` merges
with the **gateway-loaded** `customCols()` into `visibleColumns()`, and five derived values hang off
that: the grid header, the grid cells, the column panel, `reportColumns()` and `reportFitInfo()`, ending
in the CSV and the PDF. `livePanelOpen` derives nothing and loads nothing.

**Decision: state that is half-loaded from the gateway and feeds a derived chain belongs to a store,
whatever it looks like from the outside.** `TrackerColumnsStore` owns `columnState`, the custom columns
and `visibleColumns`; the page keeps `showCols`, the panel's open flag, which really is view state.

**The store holds no `TranslateService` even so**, which is the first rule above declining to apply: a
column's _label_ is UI text in the grid and report text on the sheet, so the same column list is
labelled twice, by two callers, in two languages. `colLabel` and `reportColLabel` stay on the page.

### Two things found by mutation testing, both worth recording

- **A migration silently changed behaviour, and a symmetric fixture hid it.** The page's `load()` catch
  only ever emptied `rows`; the first draft of `TrackerColumnsStore.load()` emptied the custom columns
  too. Every fixture loaded into an already-empty store, where "keep what you have" and "reset to `[]`"
  agree, so the mutant crossing them survived. The page reloads its columns after **every row save**, so
  the difference is a failed reload deleting columns the user still has. Fixed, and the regression test
  loads a non-empty list before the failing reload.
- **`essentialKeys` was dead**, referenced only by its own declaration, and `reportColumns` contained
  `c.custom ? (c.type ?? 'text') : (c.type ?? 'text')` - a ternary with identical branches. Both went.

`tracker.component.ts` is **536/400** after PR 1, from 667. `COMPONENTS_STILL_USING_THE_GATEWAY` is
unchanged at 25: the page still injects `DbService` for rows, settings, the row editor and the two
exports. It loses its entry at PR 4, and `tracker-report-print.component.ts` loses its own at PR 2.

## Amendment, 2026-08-07 (ninth): a second window is a second caller, and a surviving mutant sometimes means the code is redundant

PR 2 moved the tracker's rows, its toolbar filters and the archive and delete writes into
`TrackerRowsStore`, and took `tracker-report-print.component.ts` off the gateway in the same pull
request. `tracker.component.ts` is **487/400**, from 536.

### Why the print route shipped with the rows store rather than on its own

The hidden Tauri window that renders the PDF **loads its own rows**: it is a separate window with only
query parameters to go on, so it cannot be handed the page's list. That is why it carried a verbatim
copy of `rangeStart`, `daysBetween`, the report-row filter and sort, and the summary arithmetic - four
rules, duplicated, with **no test on either copy**. Two definitions of "the last three months" are how
the sheet and the screen come to disagree about what was exported.

`tracker-rows.ts` is now the single definition and has two real callers the day it lands, which is the
argument for extracting it. Shipping the two stores apart would have created a module with one caller
and left the duplication claim asserted rather than demonstrated.

**`TrackerPrintStore` is deliberately thin.** Reading query parameters, waiting on `document.fonts`
and tagging `<body>` for the print stylesheet are browser work and stay on the component; only the two
gateway calls moved. A store is not the place a component's DOM timing goes just because it is nearby.

### `loadError` exists because `null` was answering two questions

`TrackerRowsStore.load` first returned `Settings | null`, and the page defaulted the report market from
it. That conflated **a database with no settings row** - where the market should default to
international - with **a read that failed**, where the page had always left the market alone. One
`null` cannot answer both, so the store raises `loadError` alongside `settings()`. Worth recording
because it is the second time in two pull requests that a store's return shape quietly lost a
distinction the page depended on; the first was amendment eight's failed-reload case.

The same care caught a smaller one on the way: `confirmRemove`'s "this row has no job" guard sits
**before** its `try`, so `finally` never runs and the delete confirmation stays open. Moving the check
into the store alone would have started closing it. The page keeps its own guard, and a comment says
which question each one answers.

### The ratchet caught the migration growing a template it never edited

Prefixing fifteen bindings with `rows.` pushed four of them past the print width, prettier re-wrapped
them, and `tracker.component.html` went **557 -> 569** without a single element changing. The template
is 557/300, so the ratchet refused the commit - correctly: an over-budget file may not grow, and
"it was only formatting" is exactly the argument that would let one grow forever.

**The fix is four read-only aliases on the page** - `summary`, `segment`, `range`, `statusFilter` -
following the `t = this.i18n.t` device the same class already used. They alias and hold nothing;
`segment.set(...)` writes straight through. The template is byte-neutral at 557 and the page absorbs
the 15 lines (472 -> 487, still far under the 536 it started at).

Recorded because it will recur on every page whose template is over budget: **a store field name
becomes part of every binding's width**, and a phase that has scoped template work out has to stay
byte-neutral rather than borrow against the phase that will do it.

### Two mutants survive by design, and that is a third outcome

Amendment eight recorded that a surviving mutant is a claim about the fixtures. PR 2 found the other
case: **a mutant can survive because the code it removes genuinely cannot change the result.**

- **`Number.isFinite(days)` in `daysBetweenDates`.** The only non-finite value reachable is `NaN` -
  date arithmetic is bounded, so `Infinity` never arises - and `NaN >= 0` is already false. It is kept
  because "reject a non-number" is the intent, and `>= 0` only implements that through a property of
  `NaN` the reader has to know.
- **`.slice()` in `reportTrackerRows`.** `.filter()` already returned a fresh array. It is kept because
  it becomes load-bearing the moment the filter is made conditional, which is a one-line edit away, and
  `.sort()` mutates in place.

Both now say so in their own doc comments, so the next reader does not repeat the investigation. The
other 22 mutants die. **The distinction that matters: investigate first, then decide - the same
evidence supported deleting `essentialKeys` in PR 1 and keeping both of these.**

The two mutants that were real gaps are worth naming, because both fixtures looked asymmetric and were
not. `remove` filters the list by `id` while deleting by `jobId`, and a **one-row** fixture cannot tell
those apart - it took two rows against one job. And the print store's period test asserted the narrowed
rows but not the narrowed summary, so summarizing before narrowing passed.

## Amendment, 2026-08-07 (tenth): the reload is passed in, and a defensive copy is not the same as a redundant one

PR 3 moved the inline row editor into `TrackerRowEditorStore`. `tracker.component.ts` is **444/400**,
from 487.

### Why `save` takes the reload as a parameter

`saveEdit` ended with `await this.load()` - **the page's** load, which refreshes the columns and the
report market alongside the rows, and which this library cannot see. Three shapes were available
(amendment six); the parameter is the third and least preferred, and it is right here for a reason the
first two do not reach:

`saving` has to stay true for the **whole** operation, reload included, which is what keeps the save
button disabled while the grid repopulates. Returning to the page and letting it reload would clear
`saving` first. The reload therefore has to happen inside the operation the store owns, which is
exactly amendment six's stated criterion for the parameter shape.

One function, so it is a plain parameter with a named type - `TrackerEditReload` - rather than
amendment seven's interface, which is for two or more.

### A defensive copy and a redundant one, one line apart

Two mutants survive, both in `start`, and they are **not the same finding**:

- **`this.draft.set({ ...row })`.** `row` belongs to `TrackerRowsStore`'s list. Nothing edits the draft
  in place today - `setValue` spreads on every write - so removing the copy changes nothing now. It is
  one careless line from being load-bearing, and the thing it would corrupt is the list the grid
  renders. **Defensive; kept.**
- **`this.draftCustom.set({ ...trackerCustomValues(row) })`.** `trackerCustomValues` allocates a fresh
  object on every call, so this copies a value nobody else holds, and no plausible edit changes that.
  **Redundant; kept only so the pair reads as one rule rather than as an oversight.**

Recorded because "a surviving mutant means the fixtures are wrong, the code is dead, or the code is
unobservable-but-worth-keeping" now has a fourth case: **unobservable, not worth keeping on its own
merits, and kept for the readability of the code around it.** That is a weaker reason than the others
and should be spent rarely; it is written in the source so the next reader does not re-derive it.

The other 18 mutants die, including the four that matter most: sending an emptied field as `''` rather
than clearing it, writing a blank status over a real one, comparing the status against the draft
instead of the stored row, and dropping the re-entry guard.

## Amendment, 2026-08-07 (eleventh): `tracker` is done, under budget, and amendment eight is spent

Four pull requests, **667 -> 304 against a 400 budget**, and `tracker.component.ts` is the **first page
in this campaign to finish under its budget rather than by decision**. `cv-detail` stopped at 517/400
with preview mode and live selection left on it; `tracker` had no equivalent residue, because
everything it held was either state or a document rule.

`COMPONENTS_STILL_USING_THE_GATEWAY` is **23**: `tracker-report-print.component.ts` came off at PR 2
and `tracker.component.ts` at PR 4, both verified in both directions.

### This is the pull request amendment eight was written for

`TrackerReportStore` injects `TranslateService`, and it is the only store in the layer that does. The
Eigenbemuehungen sheet is a **document**, and its language follows the chosen market rather than the
UI - `tFor('de')` prints a German sheet out of an English app. Without amendment eight, `buildCsv`,
`buildReportText`, `csvCell`, `periodLabel` and the report's column labels - about 150 lines - either
stayed on the page or reached the layer through a codec for a dependency lint already allowed.

The **fit note beside them stays on the page**, and that is the boundary drawn sharply: it names the
overflowing columns in the **UI** language, because it is dialog chrome rather than part of the sheet.
One column list, labelled twice, in two languages, by two callers.

### Risk changed the shape of the tests, not just their number

This cluster produces a document the user submits to the Agentur fuer Arbeit. A wrong column, period
or total is a real-world consequence, so the triage scored risk 2 for the first time in the phase and
the tests assert **exact output** rather than shape: the CSV is compared byte for byte, including its
metadata block, its blank separator line, RFC 4180 quote doubling and one-based row numbering; the
plain-text fallback is compared as a whole sheet, padding included. **28 of 28 mutants die**, among
them quotes not doubled, fields not wrapped, rows numbered from zero, the two orientation budgets
swapped, and the summary's total and response rate crossed.

`generatedOn` is a parameter rather than a clock read, which is what makes byte-for-byte comparison
possible at all. That was not a testability concession: the same inputs producing the same document is
a property worth having in a document that gets regenerated and re-submitted.

### A presentational component may depend on the layer

`ReportColumn`, `ReportMarket`, `ReportMode` and `reportFit` moved out of `tracker-report.component.ts`
into `libs/application/src/lib/tracker/tracker-report.ts`, because a store cannot import from the app.
They are formatting for one screen rather than domain vocabulary, so amendment two's test keeps them
out of `libs/core`.

The consequence is new and worth stating: **`TrackerReportComponent` now imports from
`@applye/application`**, which is the first time a purely presentational component depends on the
layer. It is allowed - `type:app -> type:application` - and it is the natural home for a wire format
that a store produces and a component renders.

### The Save dialog is passed in, for the same reason the reload was

`exportPdf(chooseSavePath)` takes the native dialog as a callback. The Tauri dialog plugin is a shell
action and belongs to the app, and `exporting` has to stay true **while the dialog is open** or the
buttons re-enable underneath it. That is amendment six's third shape used twice in two pull requests,
each time because a flag had to span a call the app owns.

### The template alias device, used a second time

Prefixing eleven export bindings with `report.` re-wrapped four of them and pushed the template from
557 to 562. Five more read-only aliases keep it byte-neutral. Recorded in amendment nine as something
that would recur on every over-budget template; it recurred in the next pull request but one.

## Amendment, 2026-08-07 (twelfth): `cover-letter-detail` shares almost nothing with `cv-detail`

The handoff into this phase warned "resist copying the CV stores - the shapes rhyme, the types do not".
Measured before planning, the overlap is smaller still, and the grilling gate settled it on evidence
rather than on the warning:

- **`CoverLetterStyle` and `CvStyle` are different types.** The cover letter has five fields and a
  `page`; the CV has those plus `titleStyle`, `titleBorder`, `titleRuleWidthPt` and `bodyColorHex`, all
  driven by a theme. **Cover letters have no themes at all**, and `CvStyleStore`'s 166 lines are mostly
  theme machinery - `activeTheme`, `themeBaseStyle`, `themeTitleRule`, `themeEntryRule`, `selectTheme`.
- Their `sectionStyles` differ **structurally**: the CV's is a closed `Partial<Record<CvSectionKey, …>>`,
  the cover letter's an open `Record<string, …>` because it must key `body_<i>`. Generalizing would
  widen the CV's type and cost it the exhaustiveness it has now.
- **The genuinely shared code is about fifteen lines**: the debounced `checkStyleSafety` and the dedupe
  of `(kind, detail)` pairs.

**Decision: only that is extracted**, as `document-style-safety.ts`, in this phase's style pull request.
Four cover-letter stores are built fresh against the cover-letter types. Recorded because "these two
pages look alike" is a claim that survives right up until someone reads both, and this ADR should carry
the reading rather than the impression.

### Removing a dead branch can make a live mutant unobservable

`reindexParagraphStyleKeys` - thirteen lines lifted off the page, keeping `body_<i>` style overrides
pointing at the right paragraph after one is deleted - carried an `else { delete next[to] }`.

Mutation testing said it never fires, and the invariant says why: before the first iteration
`body_<removedAt>` has just been deleted, and every iteration leaves `body_<i>` absent, either by moving
it down or because it was already absent. **The destination is vacant by construction.** The branch was
removed and the invariant written into the doc comment, where it is more use than the branch was.

**Then a previously-lethal mutant survived.** Starting the loop at `removedAt` rather than
`removedAt + 1` used to destroy the override _below_ the removal, through that very `else`. Without it
the extra iteration is a no-op, so the mutation is genuinely unobservable - **the code lost a way to be
wrong, and the mutant retired with it.** A fifth reading of a surviving mutant, and the only cheerful
one: sometimes the score drops because the code got better.

### The empty-fixture trap, for the third time

`hydrate` was first written to swallow a `JSON.parse` failure and open an empty letter. The page threw,
and its `load` caught that into `loadError`. The difference matters: an empty editor over a letter that
is still on disk is **one Save away from replacing it with nothing**.

Every fixture hydrated an already-empty store, where "reset to empty" and "leave it alone" agree, so
both mutants crossing them survived. `CvStyleStore.hydrate` already documented the right contract -
"throws on malformed JSON; the caller's load already reports a document it cannot read" - and the cover
letter now matches it.

That is the third pull request in this campaign where an empty-fixture symmetry hid a real change:
`TrackerColumnsStore` clearing custom columns on a failed reload, `TrackerRowsStore`'s `null` answering
two questions, and now this. **Worth naming as a rule: whenever a store has a reset path, the fixture
must arrive non-empty.**

## Amendment, 2026-08-07 (thirteenth): share the invariant, not the record shape

The document pull request had one open question the twelfth amendment did not answer: the CV and the
cover letter both write through `documentLibraryUpsert`, so is the _row_ the thing the two editors
share, even though their styles are not?

**Partly, and the split is worth stating because it is not where it looks.**

- **The default-flag rule is shared**, and moves into `document-record.ts` as `siblingsToUndefault`;
  `cvSiblingsToUndefault` delegates to it and keeps its name, because deleting a `libs/` export is a
  public-API change and this one buys nothing. The rule is worth sharing precisely because it is an
  invariant rather than a shape: "default is per region, and a row never displaces itself" fails
  silently, leaving the library with two defaults for one region until a later save picks the wrong
  one.
- **The upsert builders stay apart.** A CV row carries `templateId` and `themeId`; a letter carries
  neither. A merged builder would take both as optional and stop telling the reader which fields a
  given document type actually writes - which is the one thing a record builder exists to say.
  `buildCoverLetterUpsert` omits `templateId`, `themeId` and `isApplicationDraft`, and each omission
  has a test that fails if it reappears.

The rule this gives the remaining migrations: **extract the invariant, duplicate the shape.** An
invariant that is wrong in one copy is invisible; a shape that differs in one copy is read.

### A guard whose mutant only shows on the second call

`load`'s missing-document guard survived mutation on the first pass, and the reason is worth keeping.
Removing it does not change the first load at all: the null row throws one line later and lands in the
same `catch`, so `loadError` is `true` and `doc` is `null` either way.

**The difference only exists on a second load.** With the guard, a load that finds nothing leaves the
document already on screen in place; without it, `doc` is cleared to null before the throw. Every
fixture called `load` exactly once, where the two agree.

This is the empty-fixture trap in a new coat - a _single-call_ fixture, where a guard that protects
prior state has no prior state to protect. **The rule generalizes: whenever a method guards state it
did not just set, the fixture must call it twice.**

## Amendment, 2026-08-07 (fourteenth): the residue of a migrated page is its template

`cover-letter-detail` finishes at **405/400**, and unlike Profile's 445 this number has a named
cause rather than a decision behind it.

**21 of those lines are read-only aliases** - `content`, `tone`, `loading`, `doc`, `drafting` and the
rest - each one a single assignment forwarding to the store that now owns it. They exist because the
template is **669/300**, the ratchet refuses to let an over-budget file grow, and prefixing forty-odd
bindings with `letter.` re-wraps lines and adds more than it removes. Delete them and the class is
**384/400**.

So the rule the four-page campaign has actually produced: **a page class converges once its state
moves, and what is left over is the template's problem, not the class's.** `tracker` reached 304
because its template was already inside budget; `cv-detail` stopped at 517 for the same reason this
one stops at 405, one size larger. Cutting the templates is the next phase, and it is what closes
both.

### Two mutants, one fixture blind spot

`applyCoverLetterDraft` carries the user's tone, length and three availability answers over a fresh
draft rather than taking them from the model. `applyCoverLetterBlock` keeps the other paragraphs'
cache hashes when one paragraph is regenerated. Both had mutants that survived the first pass, and
both for the same reason: **the fixture did not carry the field**, so "keep what was there" and "take
what arrived" produced identical output.

This is the empty-fixture trap in its third distinct shape. The first was a store with a reset path
and an already-empty fixture; the second, in the document pull request, a guard protecting prior state
with a fixture that called `load` once. This one is narrower and more common than either: **a merge
function tested with a partial input.** The rule that covers all three: _the fixture must be able to
tell the two branches apart_ - non-empty for a reset, called twice for a guard, fully populated on
both sides for a merge.

### A limit documented rather than fixed

The per-block cache hash is `[profile, jd, language, section, tone, length, ...answers].join('|')`, so
two different tuples collide if a field contains a `|` - a profile with a markdown table, for
instance. A collision skips a regeneration the user asked for.

**Left as-is deliberately.** Changing the separator changes every hash, which invalidates every one
already stored in every user's database and forces a full regeneration of every letter and CV. The
fields come from unrelated sources, so the collision is theoretical. It is recorded in a test that
asserts the collision rather than in a comment that could go stale, and `regenerationHashInput` for
CVs has the same shape and the same reasoning.

## Amendment, 2026-08-08 (fifteenth): amendment fourteen misread its own residue

Amendment fourteen, written a day earlier, said `cover-letter-detail`'s five lines over budget were
the 21 read-only aliases, and that only cutting the template would remove them. **The arithmetic was
right and the conclusion was wrong.**

Extracting the Style card and the per-block style popover into `cover-letter-style-card/` and
`cover-letter-style-popover/` took the class to **337/400 - under budget - with all 21 aliases still
in place.** What was actually left in the page was not a template workaround; it was a second
responsibility that had never been named, hiding in plain sight because it was markup rather than
state. The layer migration moved everything that talked to the gateway and stopped there, and
"everything else is the template's problem" was the wrong inference from that.

**The correction worth carrying forward:** when a migrated page is still over budget, look for a
responsibility before blaming the template. The four store extractions asked "what state does this
own?"; this one asked "what _panels_ does this own?", and the second question had an answer the first
could not reach.

The template is still 669 -> **491/300**, so the original point stands in weaker form: the template
is the remaining problem, and it is a bigger one than the class ever was.

### Where the styles went, and why the check matters

The moved markup carried `.coverdetail__style-pop`, `.coverdetail__style-field`,
`.coverdetail__style-label`, `.coverdetail__style-reset`, `.coverdetail__custom-badge` and
`.coverdetail__spacer` with it. Angular scopes a component's compiled CSS, so rules left on the page
would simply not reach a child extracted out of it - the failure that rendered this editor unstyled
once before.

All six moved into `_cover-letter-controls.scss`, which `styles.scss` already emits globally for
exactly this reason, and `npm run quality:style-move --base main` reports **lossless**: every selector
carries the declarations it carried before. `.coverdetail__spacer` moved even though the page still
uses it, because it is now read from two components and a duplicated copy is a rule that can drift.

## Amendment, 2026-08-08 (sixteenth): the fourth CSS trap, and the one the check cannot see

Extracting the recipient address block turned up a failure mode the previous three did not, and
`quality:style-move` **passes on it**.

The page styles its form controls with

```scss
.coverdetail input:not([type='checkbox']):not([type='color']),
.coverdetail select,
.coverdetail textarea { ... }
```

a descendant selector rooted at the page's own element. Angular's emulated encapsulation stamps that
with the page's content attribute, so it matches nothing inside a child component. Moving the six
address inputs out would have rendered them as **browser defaults** - no background, no border, no
padding - while every gate stayed green.

**`quality:style-move` cannot catch this by construction.** It compares the declarations each
selector carries before and after. `.coverdetail input` still exists and still carries all nine
declarations, so the check reports lossless. What changed is not the rule but _what the rule can
reach_, and a declaration-level diff has no way to see that.

**The rule this adds to "Splitting a page: where its shared styles go":** the classes the moved markup
names are only half the audit. Also list every **descendant or element selector rooted at the page**
that matched something inside the moved region - `.page input`, `.page select`, bare `textarea` - and
carry an equivalent into the child. Those are invisible in the markup, which is exactly why they get
missed.

Here the rule is **copied rather than moved**, because the page still needs it for the controls it
kept, and the copy is keyed on `.coverdetail__field input` so it stays inside the child's own scope.
`quality:style-move` reports the two gained selectors, and the tool's own closing line asks for
exactly that to be named in the pull request.

### And a check on the three extractions already merged

`cover-letter-style-card/` and `cover-letter-style-popover/` (amendment fifteen) were audited against
this and are **clean**, which is luck as much as judgement: the card's controls sit inside
`.docedit-style-grid`, and `_editor-shell.scss` styles them globally with a complete control rule -
background, border, radius, colour, font, padding, width, outline and focus - so losing the
`.coverdetail` layer cost them nothing. The popover's controls are styled by
`.coverdetail__style-pop select, .coverdetail__style-pop input`, which that pull request had already
moved into the global partial.

**A visual check is still owed on all of it**, and cannot be run without Tauri IPC.

## Amendment, 2026-08-08 (seventeenth): the shared class that was never one rule

The body-paragraphs cut was blocked for two pull requests on `.icon-btn`, recorded twice as
"generic vocabulary already duplicated across four component stylesheets". **The count was right and
the word "duplicated" was wrong**, and the difference decided the outcome:

| stylesheet            | box                  | border                | colour             | modifiers                                   |
| --------------------- | -------------------- | --------------------- | ------------------ | ------------------------------------------- |
| `cv-list`, `my-jobs`  | 28px, `padding: 0`   | `var(--border-width)` | `--text-tertiary`  | `--danger` + a border colour                |
| `cv-detail`           | 28px, `padding: 0`   | `var(--border-width)` | `--text-tertiary`  | `:disabled`, `--active`                     |
| `cover-letter-detail` | **32px**, no padding | **`1px`**             | `--text-secondary` | `--danger` colour only, plus a `transition` |

Four files define the **name**; three define different **rules**. So "extract it into a global
partial" was never a deduplication - it was a three-way reconciliation in which two other pages
change size or colour. That is a visible change to two screens, arriving inside a template refactor,
and `quality:style-move` would have reported it as lossless because each selector keeps its own
declarations in its own file.

**The decision, taken through the grilling gate:** the block carries a locally-named
`.clb__icon-btn`, the way `interview-prep-detail` already carries `.ipd__icon-btn`. It is not a fifth
copy of a shared name - it is a scoped rule that cannot collide with the other four or drift into
them, and the page keeps its own `.icon-btn` for the header button that still uses it.

**And the correction that outlives the decision:** `libs/ui` already ships this primitive.
`ButtonSize` includes `'icon'` and `ButtonVariant` includes `'danger'`; `global.scss` emits
`.btn--icon` and `.btn--danger`, and `.btn--ghost` is near-identical to every `.icon-btn` above. Four
page stylesheets reimplemented a design-system component, and nobody noticed while writing the
fourth. Folding them onto `appButton size="icon"` is the real fix, is **its own change**, and needs a
rendered check - which is exactly why it was not smuggled into a template cut.

### A dead class, found by the same audit - and a claim that was wrong

`.icon-btn--active` was bound on the page's Edit/Preview button, which is an `appButton`; no rule of
that name is reachable there, so the toggle never showed an active state. Fixed here, by switching
the button's own `variant`.

**This amendment originally reported a second one, and it was false.** It said the bare `.spin` on
the regenerate icons was "defined nowhere in the app". It is defined in
`_cover-letter-controls.scss`, which is the global partial this very campaign created. The error came
from a `grep` piped through `head`: the match existed and was cut off, and **absence was read from a
truncated output**. This is the same failure the campaign already recorded once - a gate grepped for
the wrong thing and its silence taken as a pass - arriving from the third direction now. The rule
generalises past gates: _a search that can be truncated cannot prove a negative._ Count the matches
or read them all, or do not claim "nowhere".

What the audit direction is still worth keeping: **it finds classes that are missing a rule as
readily as rules that are missing a class**, and nothing in the build reports a class that resolves
to nothing. `.icon-btn--active` was real.

### The amendment's own retrospective audit missed a component

Amendment sixteen closed by checking the components already merged and calling them clean. It named
`cover-letter-style-card/` and `cover-letter-style-popover/`. **`cover-letter-block/` was extracted in
the same pull request and was not checked**, and it is the one that was broken: it carried
`.coverdetail__full { width: 100% }` and left behind the nine declarations `.coverdetail input:not(...)`
supplied. Its five fields - date, subject, greeting, closing, signature - rendered as browser-default
inputs for two days, through four subsequent pull requests, every gate green.

It was found by **the maintainer opening the app**, which is the check this campaign has been
deferring since the first extraction. Two lessons, and the second is the expensive one:

1. A retrospective audit has to enumerate the components from the diff, not from memory of the
   pull-request description. Two of three were listed; the third was simply forgotten.
2. **`quality:style-move` cannot fail on this and neither can any other gate here.** The only
   instrument that detects it is a rendered screen. Six extractions shipped without one; the first
   time one was run, it found a two-day-old visual regression in the first minute.

### The carry, for the third time - and the first hard evidence it works

The moved region contained a `<textarea>`, reached by `.coverdetail textarea` and its `:focus`. Nine
declarations, and **nothing global styles a bare `textarea`** anywhere in this app - unlike the
settings card, which needed nothing because `_editor-shell.scss` already covered its controls. So the
copy was mandatory, and the paragraphs would otherwise have rendered as browser defaults with every
gate green.

`quality:style-move` reports 2 lost and 5 gained, and all seven are named in the pull request. The new
evidence is below the check: the compiled bundle carries
`.coverdetail__textarea[_ngcontent-%COMP%]` and `.clb__icon-btn[_ngcontent-%COMP%]` in the **child's**
chunk, which is the first time this campaign has confirmed at the compiled-CSS level that a carried
rule actually reaches the element it was carried for. It is still not a rendered check.

**The visual debt is now six extractions deep and remains unpaid.** A `tauri dev` build was started
twice this session; the binary ran and stayed alive, but no window could be captured, so nothing was
seen. The check is owed to the maintainer as a written walkthrough rather than claimed.

## Amendment, 2026-08-08 (eighteenth): the design system bends to the pages, once

Amendment seventeen recorded that four page stylesheets had reimplemented `libs/ui`'s
`appButton size="icon"`. Folding them onto it raised the question seventeen deferred: **whose look
wins?** `.btn--icon` was padding-driven with `--radius-card`; the four copies were fixed squares with
`--radius-input`.

**The design system was pinned to the pages, not the other way round.** `.btn--icon` becomes a
28px-minimum square at `--radius-input`, so the fold is a deletion rather than a restyle. That is
defensible precisely because it is cheap to check: `size="icon"` had **exactly one consumer** in the
whole app before this. Had it been used in twenty places, the answer would have gone the other way.

Two visual deltas were accepted rather than hidden, and both are named in the pull request: the
topbar theme toggle (that single consumer, an 18px icon) goes 34px to 28px, and `.btn--ghost` is
`--text-secondary` where `.icon-btn` was `--text-tertiary`. The cover-letter back button goes 32 to
28 to join the other three, and `.clb__icon-btn` moved with it so that editor stays internally
consistent.

`min-width`/`min-height` rather than `width`/`height`, so a larger icon grows the box instead of
overflowing it. Every call site in the app uses 13-16px, which lands inside 28 either way.

### The ratchet refused the sweep, and it was right

Converting `class="icon-btn"` to `appButton` + `variant` + `size` costs **+2 lines per button**, and
three already-over-budget files grew: `cv-detail.component.html` 492 to 499,
`cv-list.component.html` 311 to 315, `global.scss` 415 to 426. The file-size gate blocked the commit.

**This is the ratchet working as designed**, and the response was extraction rather than an
exception. What it produced is better than the sweep alone:

- **`libs/ui/src/styles/_button.scss`** - the button vocabulary out of `global.scss`, which drops
  **415 to 345**. Loaded from `global.scss` rather than each app's `styles.scss`, because both
  `apps/desktop` and `apps/web` consume it and neither should have to know the file exists.
- **`document-row-actions/`** - the duplicate/export/delete controls, rendered **byte for byte
  identically** by `cv-list` and `cover-letter-list`. `cv-list.component.html` drops **311 to 283**,
  under budget for the first time.
- **`cv-section-actions/`** - the Regenerate and reorder controls in a CV section head.
  `cv-detail.component.html` drops **492 to 466**, its `.scss` 665 to 640, its `.ts` 515 to 512.

Every one of those was a real seam that existed before the sweep and would have been found later, or
not at all. **The gate that blocked the change is what located them.**

### Three things the sweep exposed that no gate had

- **A Sass `@import` hid a cross-page dependency.** `cover-letter-list.component.scss` imports
  `cv-list.component.scss` wholesale, so `cover-letter-list` was styled by rules named in neither of
  its own files - and broke the instant `cv-list`'s `.icon-btn` was deleted. The shared component
  removes the need for that import to carry row styling at all.
- **`$any(...)` was hiding a type hole.** Both lists read the export format as
  `$any($event.target).value` and passed it to a handler typed `'docx' | 'pdf'`. Extracting the
  markup made the compiler object, because an output has to declare what it emits. There is a type
  guard now, and an unrecognised value is dropped rather than forwarded.
- **`.spinning` was page-scoped with exactly one user**, which moved into the child - amendment
  sixteen's audit catching its fourth instance, this time as a move rather than a copy.

### And a near-miss worth recording, again

The first type-check run after the extraction was grepped with `Successfully|error TS`. It matched
**neither**, printed nothing, and read as clean. It was not: two `TS2345` errors from the `$any`
hole above. This is the third time in this campaign that a grep has failed to distinguish success
from failure, in three different shapes - a truncated `head`, a pattern matching neither line, and a
stale `cd` changing a test run's scope. **Read the gate's own verdict line. A filter that can miss
both outcomes is not a check.**

## Amendment, 2026-08-09 (nineteenth): the rendered check ran, and the fold was wrong in two places

Amendment eighteen closed by saying the fold needed a rendered check before anything else in the area
was authored. It was merged before one happened. The check has now been run, against the Angular dev
server the running `tauri dev` already serves on `localhost:4200`, and it found **two defects and a
miscount**. None of the three is reachable from type-check, lint, the suite, either build, or
`quality:style-move`; all five were green on all of it.

### The square was not square

The topbar toggle measured **28.00 x 29.84**.

`<lucide-icon>` is a flex item, so it is a block box, and the `<svg>` inside it is `display: inline`
with `vertical-align: baseline`. That makes the wrapper a **line box**, which reserves descender
space below the baseline - **1.84px** at this font size, independent of what the icon measures. So
the wrapper is `icon + 1.84`, and the button is `icon + 1.84 + 8 padding + 2 border`.

Measured on the live page, before the fix:

| icon | box           |
| ---- | ------------- |
| 13   | 28.00 x 28.00 |
| 16   | 28.00 x 28.00 |
| 17   | 28.00 x 28.84 |
| 18   | 28.00 x 29.84 |

**Eight of the nine call sites were saved by the 28px minimum, and the ninth is the topbar toggle**,
the single pre-existing consumer this whole amendment was written around. A 16px icon clears 28 by
**0.16px**, so two more sites are one font-size change away from the same defect.

And the stylesheet said so itself. The comment amendment eighteen shipped reads "every call site in
the app uses a 13-16px icon". Counted rather than recalled: `14 x4, 15 x2, 16 x2, 18 x1`. **The
sentence was written from the four pages being folded and never checked against the consumer that
already existed.**

`.btn--icon svg { display: block }` takes the icon out of the line box. Every size is square again,
and `min-width`/`min-height` now genuinely do what the amendment claimed - a 24px icon gives a 34x34
square rather than a 34x35.84 rectangle.

### `variant="danger"` coloured at rest, and nothing said so

All four `.icon-btn--danger` rules were `:hover`-only reds. `.btn--danger` colours at rest. The fold
swapped one for the other on three pages, and the pull request declared two visual deltas, neither of
which was this one.

The effect is bigger than the button: a document row's three controls went from **one tone to
three** - `--text-secondary` for duplicate, `--text-tertiary` for export, `--danger` for delete.

**The tie-break is the one amendment eighteen already used, and it points the other way here.** That
amendment bent the design system to the pages because `size="icon"` had exactly one consumer. Counted
here: `variant="danger"` had **zero** before the fold created two. The four page rules are the shape
with evidence behind them; the variant was an untested claim that had never been rendered. So
`.btn--danger` is quiet at rest and red on hover.

**The boundary is written into the rule**, because it will not hold forever: this is right for an
icon in a row of icons and wrong for a standalone destructive text button, which should read as
destructive before it is pointed at. That case needs its own filled variant, not a change back.

### The control the directive could not reach

`.cvlist__export` is a `<label>` wrapping an invisible `<select>`, and `[appButton]`'s selector is
`button[appButton]`. So it did not follow its neighbours to `--text-secondary` and sat a shade
darker between them. It is hand-matched now, and that hand-matching is the standing cost of the
control not being a button - a third rule that has to be kept in step by hand.

### And the count was wrong again, in the same shape as amendment seventeen

Amendment eighteen's audit grepped for the string `icon-btn`. **The copies that do not carry that
string were invisible to it.** `_ip-shared.scss:49` defines `.ip__icon` - 28px, transparent border,
`--text-tertiary`, plus an `.is-open` state - which is byte-for-byte the `cv-list`/`cv-detail` shape,
and it is used by **both** interview-prep pages.

Counted, not recalled: after the fold the desktop app still holds **four** 28px square icon rules,
not the one the handoff recorded.

| rule              | where                                          | sites |
| ----------------- | ---------------------------------------------- | ----- |
| `.ipd__icon-btn`  | `interview-prep-detail`                        | 4     |
| `.ip__icon`       | `_ip-shared.scss`, both `interview-prep` pages | 2     |
| `.clb__icon-btn`  | `cover-letter-body-paragraphs`                 | 1     |
| `.cvlist__export` | `document-row-actions` - a `<label>`           | 1     |

This is amendment seventeen's lesson arriving from a fourth direction. Seventeen said a search that
can be truncated cannot prove a negative. Eighteen's search was not truncated - it was **searching
for a name when the thing being counted is a shape**, and three of the four survivors carry different
names on purpose.

### The fifth copy folded, and the host element behaved this time

`.ipd__icon-btn` is gone. Its base was an **exact** `variant="secondary"` - same 28px box, same
`--border-default` border, same `--text-secondary`, same hover pair - which is why the fold is a
deletion and not a reconciliation; only `:disabled` differed, 0.35 against the design system's 0.5,
and that is the single accepted delta. The danger modifier maps onto `variant="danger"` **because of
the change above**: had `.btn--danger` still coloured at rest, this fold would have been a second
visible regression rather than a deletion.

The ratchet refused it, as it refused the last one, and located the seam again: the template was
311/300, the fold costs +2 lines per button, so `interview-stage-actions/` came out of it -
**311 -> 274**, stylesheet 363 -> 346. The narrow cut of the four buttons rather than the whole
`.ipd__actions` cluster, and deliberately: the cluster contains `.ip__pop`, which lives in
`_ip-shared.scss` and reaches the page through a `@use` that a child component would not inherit.
That is amendment sixteen's trap, seen in advance for once instead of after merge.

**One thing this repository has now been bitten by twice was checked first**: the four buttons are
direct children of a flex row, so a host element between them would have collapsed them into a block
stack - the shape that cost Profile its paired-field row. `:host { display: contents }` keeps them
flex items. Measured on the rendered page: host `display: contents`, twelve buttons all 28.00x28.00,
all `--text-secondary` on `--border-default`, first row's up and last row's down disabled at 0.5, and
delete red with a `--danger-tint` fill only under the pointer. The spec asserts the half jsdom can
see - that this component adds no wrapper of its own - and says in a comment that the other half is
not assertable there.

### What this costs, and what it buys

Six extractions shipped without a rendered check, and the first one run found a two-day-old
regression. A seventh shipped without one, and the first one run found two more. **Both times the
instrument was a screen and nothing else came close.** The rule stated in the previous handoff stands
and is now paid for twice: nothing in this area merges without a rendered check.

The cheap part is that the check does not need Tauri. The Angular dev server the desktop app is built
from serves at `localhost:4200`, renders every shell, style and geometry, and only fails on
`tauriInvoke`, which costs the data-driven screens and nothing else. Every measurement above came
from it.

## Amendment twenty: the state was already in the markup

`.ip__icon` was the sixth page-local icon button and the first whose fold was not obvious. Its box
was the design system's to the pixel - 28px, `--radius-input`, centred - but three things were not:
`--text-tertiary` at rest where ghost is `--text-secondary`, a `border-color` ring on hover that
ghost has no border to show, and an `.is-open` class the design system has no concept of. The
checklist entry written for it named only the third. Four readings were on the table, one of which
was a new variant in `libs/ui`, so the decision went through the grilling gate rather than being
chosen at the keyboard.

**What settled it was reading the markup.** The trigger bound `[class.is-open]` and
`[attr.aria-expanded]` to the same signal, one line apart - and so did `tracker`'s. The class was
a duplicate of state the element already had to carry to be usable at all, and the duplicate was the
half doing the styling while the half a screen reader reads did nothing. `.btn--ghost[aria-expanded='true']`
takes the state from the attribute, which deletes the class from two pages and adds no name to the
button's public vocabulary - a smaller change than the variant, and one with a reason that is not
aesthetic.

Two guards, both checked rather than assumed. **No `appButton` in the app carries `aria-expanded`
today** - all 27 occurrences are page-local classes or `role="button"` elements - so the rule cannot
reach a button that does not want it. And it is scoped to `.btn--ghost` rather than to `.btn`,
because two page copies is the whole of the evidence: amendment nineteen was written precisely
because `.btn--danger` generalised past its evidence and was wrong at both sites that later adopted
it.

The hover ring was ruled drift and dropped. It entered with the file in #116 and was never revisited,
and `.jt-icon` in `tracker` - identical in box, radius, rest colour, hover pair, open state and
disabled treatment - never had one. Removing it makes the two pages agree rather than making one of
them odd.

**The rendered check, in both themes:** 28.00 x 28.00 at rest and open, radius 6px unchanged, the
open trigger at `--surface-hover`/`--text-primary` while its neighbour stays `--text-secondary`, no
`.is-open` in the DOM, and the modal's close button - an **18px** icon, the exact size that measured
28 x 29.84 before amendment nineteen - square. What the instrument could not produce is `:hover`
itself; its two declarations are the same two the open state renders, and they were measured there.
A test pins the `aria-expanded` binding, because dropping it breaks nothing that fails - the menu
still opens, it just stops looking open.

**`tracker` was deliberately left out**, and the reason is worth recording because it looked like the
same fold from a distance. `.jt-icon`'s six sites are four shapes: three plain 28px, one at 24px via
`--sm`, one at **30x30 with radius 7** reached through a `.jt-menu .jt-icon` descendant selector -
amendment sixteen's trap - and one accent fill on `--text-accent` (indigo-400) with a hardcoded
`#fff`, where the design system's primary is `--accent` (indigo-600) with `--accent-fg`. Its template
is **573 against a budget of 300**, so the fold cannot add a line to it without an extraction first.
That is a separate decision and a separate cut, and folding it blind would have been four undeclared
visual changes.

## Amendment twenty-one: the stores made the cut free

`tracker` is the page this ADR migrated first and finished under budget - 667 to 304 in the class.
Its **template** was never touched, and it stood at **557 against 300** with a stylesheet at 893
against 400. That is what blocks the `.jt-icon` fold: the gate refuses to let an over-budget file
grow, and the fold costs two lines per button.

The extraction turned out cheap for a reason worth recording, because it is this ADR's own machinery
paying back. `TrackerColumnsStore`, `TrackerRowsStore`, `TrackerRowEditorStore` and
`TrackerReportStore` are declared in `TrackerComponent`'s `providers`, so **a child rendered inside
its template resolves the same instances through the injector**. The export dialog therefore takes
no data inputs at all - it injects the three stores it needs and emits `closed`. A page whose state
lives in stores can be cut anywhere; a page holding its own state cannot, and that difference is the
whole argument of this ADR restated as arithmetic.

Four things moved out with the markup - `today()`, `fitNoteText()` and the two export writes -
because each is dialog chrome. Their comments had said they lived on the page because "the page
closes the dialog and picks the wording"; the dialog does both now. Five aliases went with them:
`applicantName`, `reportMarket`, `landscape`, `reportMode` and `exporting` existed **only** because
the template was at budget and `report.` in front of eleven bindings re-wrapped four of them. The
extraction removed the pressure that created them, which is the tidier half of the same trade.

**Three rules were copied rather than moved, and the third is a trap this campaign had not met yet.**
`.jt-tbtn` is copied because the page declares `.jt__tbtn, .jt-tbtn` together and the toolbar still
uses the other half. `.jt-icon` is copied and deliberately temporary - five call sites remain, and
the fold deletes every copy at once. The third is `@media (prefers-reduced-motion: reduce) { * }`:
the page writes it with a bare `*`, and emulated encapsulation rewrites that to
`*[_ngcontent-page]`, so it stops at the page's own elements. **A dialog extracted without a copy
keeps animating for a user who asked it not to**, and no gate in this repository can see that - not
lint, not the suite, not `quality:style-move`, which compares declarations per selector and would
have read this move as lossless either way. It reads lossless here too, and that is now known to be
a weaker statement than it looks: the audit proves nothing was dropped, not that everything still
reaches what it styled.

Result: template **557 -> 463**, stylesheet **893 -> 792**. Both still over budget, and three cuts
remain before the fold - the column drawer, the row-actions popup, and the row's actions cell, which
together carry the other five `.jt-icon` sites.

## Amendment twenty-two: four more cuts, and the descendant selector that behaved

Amendment twenty-one took the export dialog out and left the template at 463/300. Four more cuts
finish the job: the column drawer, the row menu, the row's action cell and the summary strip.
**Template 557 -> 278, stylesheet 893 -> 455.**

**Three of the five needed no inputs.** The drawer, the dialog and the summary strip each inject the
stores they read, because those are declared in `TrackerComponent`'s `providers` and resolve through
the injector. The row's action cell takes three and emits three, and the row menu takes four and
emits six - those two render page state rather than store state, and that is exactly the difference
this ADR predicts.

**The row menu's delete confirmation deliberately stayed on the page.** It looked like the obvious
thing to move: nothing else reads it. But the page resets it when a _different_ row's menu opens, and
the component is reused rather than recreated across that change, so a child owning the flag would
carry one row's half-confirmed delete to the next row. The extraction keeps a destructive action
provably identical instead of saving two bindings.

**`.jt-menu .jt-icon` is the first descendant selector in this campaign to survive a move**, and it is
worth understanding why, because four components have now been shaped by the version that does not.
The kebab is 30x30 at radius 7 only because of that rule. It travelled because `.jt-menu` is _inside_
the extracted markup - the ancestor came along. Amendment sixteen's `.ip__pop` case failed because
the ancestor lived in a shared partial the child reached through a `@use` it would not inherit. The
rule is therefore not "descendant selectors break on extraction"; it is **"a descendant selector
survives exactly when its ancestor is inside the cut"**, which is checkable in advance.

Two other traps were paid. The `prefers-reduced-motion` rule is written with a bare `*`, which
encapsulation rewrites to `*[_ngcontent-page]`; every animating child needed its own copy or it would
have kept animating for a user who asked it not to. And `toggleMenu` anchored the popup by reading
`event.currentTarget`, which is only set while an event is dispatching - emitting it across a
component boundary would have kept working by accident, because outputs fire synchronously inside the
handler, and broken the day anything deferred it. The cell emits the trigger **element**, which is
what the caller actually wanted.

`quality:style-move` reads lossless across all six stylesheets. Nine icons and two aliases died with
the markup that used them; one of them, `ok: CircleCheck`, had already been dead on `main` and was
found only because the extraction made the list short enough to read.

What is still owed: `tracker.component.scss` is 455 against 400. It is no longer what blocks anything

- the fold now touches the five children, not the page - but it is over, and the next thing to touch
  it must cut rather than add.

## Amendment twenty-three: the first fold that leaves nothing behind

`.jt-icon` was the last page-local icon button, and the most divergent: six sites in four shapes.
All six are `appButton size="icon"` now, and **no local rule survives** - the first fold in this
campaign whose result is a pure deletion rather than a deletion plus a residue.

Four visual changes, each decided at the gate rather than discovered afterwards:

| Shape                           | Was                                                      | Now                                                      |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| kebab, via `.jt-menu .jt-icon`  | 30x30, radius 7                                          | 28x28, radius 6                                          |
| `--sm`, drawer's delete-custom  | 24x24                                                    | 28x28                                                    |
| `--primary`, save-while-editing | `--text-accent` (indigo-400), `#fff`, `brightness(1.08)` | `--accent` (indigo-600), `--accent-fg`, `--accent-hover` |
| any disabled control            | `cursor: default`                                        | the system's `not-allowed`                               |

The kebab's `.is-open` class went the way `interview-prep`'s did in amendment twenty:
`.btn--ghost[aria-expanded='true']` reads the attribute the trigger already had to carry to be usable.
That rule shipped with one consumer and the risk was written down at the time; it has three now, and
the shape of the risk - a rule generalised past its evidence - never materialised, because the
evidence was the markup rather than a guess about future callers.

`quality:style-move` reads **8 lost, 0 gained**. The 0 is the interesting half: every previous fold
in this campaign left a local rule behind to reconcile something, and each of those became a thing a
later reader had to explain. This one leaves nothing to explain.

**And a correction worth keeping, because it cost a real investigation.** The open kebab measured a
transparent background on every read, while an identical clone appended to `document.body` measured
`--surface-hover`. The cascade was checked, the token was checked on the element itself, every
matching rule was enumerated - all correct. The cause was the instrument: `.btn` carries a 140ms
`background` transition, and each measurement was catching it at t=0. With `transition: none` set
inline the value resolves exactly as the rule says. **`getComputedStyle` is not a free instrument on
a transitioning property**, which is a real limit on the rendered check this campaign relies on: it
reads geometry and colour honestly only for properties that are not mid-animation. Nothing was wrong
with the styling, and the hour spent proving that was the price of not shipping on an assumption.

## Amendment twenty-four: the expired reason, and the one that had not replaced it

`.clb__icon-btn` in `cover-letter-body-paragraphs/` was the last page-local icon button, and the only
one whose checklist entry framed itself as a question rather than a task: the local name was chosen in
amendment seventeen **because** folding it then meant a visible change - `.btn--danger` coloured at
rest - and amendment nineteen took that away. So the reason had expired. What the entry could not say
is whether a different reason had taken its place, and that is not answerable from the history.

**The measurement answered it, and it disagreed with the comment sitting above the rule.** That
comment said the button "keeps its local name, which was decided separately", and named its 28px box
as the thing that had been reconciled. Every property in the rest state was already the design
system's to the pixel: 28px box, `--radius-input`, a 1px transparent border, `--text-secondary`,
the same 140ms `background` transition. `--space-2` is 4px, the icon is 13px, so `4 + 13 + 4 = 21`
and `min-width: 28px` decides the box - the fold cannot move it. The only property that differed was
**hover**: local paints `--surface-hover` with a red icon, the design system paints `--danger-tint`
with a `--danger` ring.

**What settled the decision was `git show` rather than the argument.** `.ipd__icon-btn--danger:hover`,
one of the four rules amendment eighteen folded, read `background: var(--danger-tint); border-color:
var(--danger); color: var(--danger)` - the design system's danger hover verbatim. The variant was
pinned to those pages, which means this button was not holding a considered local look; it was the
**one destructive icon in the application that disagreed with every other one**. Three readings went
to the gate anyway - fold, keep, or fold behind a local override - because "the recorded reason
expired" justifies re-opening the question and not any particular answer to it. The maintainer chose
the fold and the hover change with it.

Result: `appButton variant="danger" size="icon"`, twenty lines of SCSS deleted, `quality:style-move`
**3 lost, 0 gained**. Two pure deletions in a row, and the campaign's last one - no page-local icon
button remains anywhere in the application.

**A method note on the rendered check, because this is the first time hover itself was measured.**
Amendment twenty could not produce `:hover` and settled for measuring the same two declarations in the
open state; amendment twenty-three proved a computed read is dishonest on a transitioning property.
Neither problem is solved by cloning the element and copying declarations onto it - that proves the
copy works. What does work: find the design system's own `.btn--danger:hover:not(:disabled)` rule in
the CSSOM, rewrite its `selectorText` to a probe class, add the class, measure, then put the selector
back. The real declarations run through the real cascade with real token resolution, and with
`transition: none` set inline the values resolve immediately. Both themes:

|       | rest                                                                  | hover                                                                   |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| dark  | 28.00 x 28.00, r6, transparent, `rgb(154,150,140)`, svg `block` 13x13 | `rgba(224,86,86,0.14)`, ring and icon `rgb(240,122,122)`, box unchanged |
| light | 28.00 x 28.00, r6, transparent, `rgb(90,90,99)`                       | `rgba(224,86,86,0.1)`, ring and icon `rgb(224,86,86)`, box unchanged    |

The box does not reflow on hover because the rest border was already `1px solid transparent` - the
ring changes colour into space the layout had already reserved. A test pins `btn`, `btn--danger` and
`btn--icon` on the delete button, on amendment twenty's reasoning: dropping either attribute breaks
nothing that fails, since the button still deletes and only stops looking like the thing it is.

## Amendment twenty-five: the smallest state this layer has owned, and a free entry

With the icon-button campaign closed, the allowlist is the work again. Ranking the 22 remaining
entries by **how much gateway each actually uses** - rather than by whether it injects one - turned up
something the count had been hiding: `paste-job-modal.component.ts` injects `DbService` and never
calls it. The field was the only occurrence of `db` in the file. So one of the 22 was not a migration
at all, and the allowlist had been overstating the remaining work since the entry was written. Three
lines deleted, 22 -> 21, no behaviour touched.

The first real migration is deliberately the smallest: `onboarding-banner.component.ts`, 69 lines,
one gateway read pair, deciding one boolean. `OnboardingBannerStore` owns `visible`, `load()` and
`dismiss()`. **One boolean is the smallest state this layer has owned, and the size is not the point

- the read is.** The banner had to call `getSettings` and `getProfile` to decide whether to show, so
  the component held the gateway; moving the boolean is what removes the reason it did.

**One consequence was forced rather than chosen, and it is worth naming because the next migration
will meet it too.** `shouldShowOnboardingBanner` lived in the app's `onboarding-gate.util.ts`, and a
store in `libs/application` **cannot import from the app** - the dependency arrow forbids it. So the
predicate either came down with the store or got reimplemented beside it. It came down, together with
`shouldAutoOpenOnboarding` and their shared spec, as one unit: splitting the file would have left one
gate concept with two homes and a spec cut in half. `app.ts` imports `shouldAutoOpenOnboarding` from
`@applye/application` now, which the layering allows.

`OnboardingService` deliberately stayed in the app, and so did the half of `finishSetup` that uses it.
The store hides the nudge; the component asks the shell to reopen the wizard. That is amendment
three's boundary applied to a new case - a store does not navigate, does not toast, and does not know
about the app's shared signals.

Five tests cover the store, including the one behaviour that had no test anywhere before: a failed
read **hides** the banner rather than rejecting. The component swallowed the error already; nothing
pinned it, and it is the kind of decision that gets re-litigated as a bug later. A banner is not worth
an error state, and nagging a user whose profile may well be complete is the worse of the two
failures.

**Rendered check**, because green gates missed a two-day regression in this campaign once. The banner
renders 976 x 48 at radius 8 on `--surface-2`, `role="status"`, its two `appButton` controls at
`btn--primary btn--sm` and `btn--ghost btn--sm`. Dismiss clears the signal and removes the element;
**Finish setup opened the wizard end to end** - the overlay replaced the dashboard, which is the half
that stayed on the component working across the new boundary.

Allowlist **22 -> 20** in one pull request.

## Amendment twenty-six: two more, and the rendered check earned its keep again

`health-check-panel` and `stage-quick-add` were the next two cheapest entries by call site - one
gateway call each, 156 and 83 lines. Both migrated in one pull request, allowlist **20 -> 18**.

**`HealthCheckStore` got its own `health/` area rather than joining `onboarding/`.** The panel has
two homes, the first-launch screen and Settings, and naming the area for either one is wrong at the
other. `run` takes the label for its failure row as an argument, because this layer holds no
translations - and the failure stays a `fail` row rather than an error state, which is the behaviour
the component already had. A check that cannot answer has told the user something true.

**`StageQuickAddStore` took the whole form, not only the write.** The alternative was a thin store
exposing `create()` with the three draft fields left on the component, and it was rejected at the
gate for a reason this ADR has already written down once: `busy` and `error` are "what is in flight",
so that split would leave one screen's state with two owners. What did **not** move is the toast.
`submit` returns the stage or `null` and leaves `error` set; the component decides what the user is
told. Refusing and failing stay distinguishable - a refusal, meaning an empty label or a save already
running, leaves `error` empty and says nothing, which is why the component checks it before toasting.

Twelve tests across the two stores, on behaviour that had none: neither component had a spec.

**The rendered check found a defect again, and this time not in the migration.** Driving the panel
through its states showed all three status icons computing the same colour, `rgb(244,242,237)`. The
`[class]="'health-item__icon health-item__icon--' + i.status"` binding lands nothing: the rendered
`<lucide-icon>` has an **empty `classList`**, so `--ok` green, `--warn` amber and `--fail` red have
never applied. `git diff main` on that file touches no line of the binding, so it is pre-existing and
was filed separately rather than fixed here - the likely cause is `lucide-angular`'s own host `class`
binding winning, which would make the same pattern inert at every other call site too. Three
consecutive rendered checks have now each found something no gate reports.

What the check could **not** honestly measure: `stage-quick-add`'s geometry. Reaching its form needs
a card forced into the pipeline's `selectedCard`, and the synthetic card collapses the modal above it

- `.modal` measured 2px wide. Its behaviour was verified end to end instead, including that a failed
  write sets `error` in the store and is toasted by the component, and the numbers are not reported
  because they would be measuring the harness.

## Amendment twenty-seven: moving the state is what exposed the duplicate

`cv-print` and `cover-letter-print` are the hidden windows the WYSIWYG PDF export loads. Two gateway
calls each: read the document, then tell Rust the snapshot may be taken. Allowlist **18 -> 16**.

**The interesting part was not the migration.** Both components carried a `signalReady()` that was
**byte-identical** - the same fonts wait, the same two settle ticks, the same
`document.body.classList.add('printing-cv')`, down to the same comment. Nothing made that visible
while each file was 100 lines of load-and-render; moving the load out left the duplicate as the only
thing remaining in each, which is a general property worth naming: **extracting state exposes
duplication that size was hiding.**

It became `awaitPrintSettle()`, one function, and it deliberately **did not** go into
`libs/application` beside the stores. Every line of it touches the DOM - `document.fonts`,
`document.body` - and this layer owns state, not view timing. Putting it there would have been the
first DOM access in the application layer, and a precedent much easier to set than to withdraw. The
gateway call stayed in the stores as `notifyReady()`, so the component's whole job is now: read the
id, load, settle, notify.

`normalizeCvContent` is **passed to** `CvPrintStore.load` rather than imported by it, following the
precedent `CvDocumentStore` documents at its own `CvContentNormalizer` type. Moving it down instead
would mean moving a 652-line util that 25 files import - a separate job with its own decision, and
not one to make in passing.

Both stores return `false` for a missing row rather than throwing, which keeps the behaviour the
components had: the window stays blank and the Rust side times out. Printing a default letter would
hand the user a PDF they did not ask for.

Sixteen tests across the two stores and two on the settle - that the body is marked printable, and
that a `document.fonts.ready` which never resolves is given up on rather than hanging the export.
The existing print-component spec asserted signals that had moved; it reads them through the
component's own injector now, because these stores are component-scoped.

**Rendered check**, and this route can be checked more honestly than the last one: both print routes
render at **793.7 x 1143.9** - A4 at 96dpi, 210mm exactly - fed from their stores, with the
components down to `route` plus a store and no `db`. The cover letter rendered `09.08.2026` from
`language: 'de'`, which is the specific drift its comment warns about: the export must be fed the
language the editor showed. `document.body` measures 0 because a print route has no shell layout,
which is what a print window is.

## Amendment twenty-eight: the first state this layer could not take

`profile-photo` was the first migration where the answer to "how much moves" was decided by a
constraint rather than by preference. Allowlist **16 -> 15**.

`uri` is a `linkedSignal` seeded from a **required input**. An input belongs to the component that
declares it, so a store cannot derive one - and this ADR has no interest in pretending otherwise. The
alternatives were both worse than the constraint: reproducing the link with a `seed()` method and an
effect is more machinery than the thing it replaces, and it introduces a re-seed ordering question
that does not exist today. So `ProfilePhotoStore` owns `saving`, `cropSourceUri`, `error` and the two
gateway calls, and the component keeps the value it renders together with the optimistic
set-and-revert around it.

**The `saving` guard is deliberately in both**, which reads like duplication and is not. The store's
copy protects the gateway from any caller. The component's copy protects the optimistic write: without
it a second click would show the new photo _before_ the store refused to write it, and the revert
would then put back a value the first save is still in the middle of replacing. The two guards defend
different things, and the comment says so at the site.

The store also does not choose between the "saved" and "removed" wordings. Those are translations,
translations are the app's, and the same boundary has now been drawn three times - against
`OnboardingService`, against the quick-add toast, and here.

Nine tests, including that a refused second write never reaches the gateway, and that a file the
backend cannot read leaves the crop modal closed rather than opening a crop over nothing. The
component spec reached into `cropSourceUri`; it reads the store through the component's own injector
now, assertions unchanged - the second time this campaign has had to do that, and the pattern is
settled: **a component-scoped store is reached through `fixture.debugElement.injector`.**

**Rendered check**, and it repeated amendment twenty-three's lesson from a new direction. The thumb
measured **2px wide** on the first read, which looked like a broken frame; the card was mid-collapse
and the read caught the transition. The computed style is authoritative and says **90 x 120,
`object-fit: cover`, radius 8** with the image loaded at its natural 80 x 80. Everything else held:
"Upload photo" in the empty state, "Replace photo"/"Remove photo" with one set, the summary reading
"Photo added", both actions disabled from the **store's** `saving`, and the crop modal opening and
closing off the **store's** `cropSourceUri`. `getBoundingClientRect` is no more free of animation
than `getComputedStyle` is.

## Amendment twenty-nine: the first whole page since the campaign resumed

`interview-prep` is a list page rather than a single flow: cards, three computeds over them, a row
menu, a delete confirmation, three gateway calls. Allowlist **15 -> 14**.

**The menu and the confirmation moved with the data, and that is not a reversal of amendment
twenty-two.** That amendment kept `tracker`'s delete confirmation on the page for a specific
mechanical reason: its row component is reused rather than recreated as the selection changes, so a
child owning the flag would carry one row's half-confirmed delete to the next row. This is a page.
There is one of it, it is destroyed on navigation, and the reason does not reach here. A rule and its
reason are different things, and it is the reason that travels.

**`stats` returns `nextAt` as the stored ISO string, and `formatDate` stayed on the component.**
Formatting is presentation and locale-dependent, and this layer refuses translations for the same
reason it refuses toasts. Moving the formatter down would also have carried a hardcoded `en-GB` into
`libs/application` - which brings up the finding below.

**A defect found while reading, filed rather than fixed:** `en-GB` is hardcoded at **five** call
sites - `pipeline`, `quick-view-modal` twice, `interview-prep` and its detail page - while the app
ships six locales. Five of them render dates in a format their user did not ask for. Fixing it means
touching four files this migration otherwise does not, and it needs a rendered check per locale, so it
is its own pull request.

**One regression was caught in the draft rather than in review**, and it is the kind worth recording
because the gates would not have seen it. The first version of the store swallowed both failures with
a bare `catch { return false }`. That compiles, passes lint, and would have downgraded the page's
toast from the actual error text to whatever generic wording the component invented. The store keeps
an `error` signal, like `StageQuickAddStore` and `ProfilePhotoStore` before it, and refusing stays
distinguishable from failing by whether it is set. Three stores now share that contract; it is the
campaign's settled shape for "the store knows what went wrong, the app decides what is said".

Twelve tests, including three that pin decisions rather than mechanics: unscheduled rows sink below
scheduled ones, because a date the user has not set should not outrank one they have; a removed row is
cleared in place rather than by reloading, because a reload would re-sort every other row under the
user while they are looking at it; and a **failed** delete leaves the row in the list, because the
list must not lie about what was removed.

**Rendered check.** Four cards in, three rows out - the stageless one is Pipeline's, not this page's -
sorted 01 Sept before 10 Sept with the unscheduled row last showing `·`. Stats read 3 and 3, and the
next date rendered `01 Sept 2026` from the store's raw `nextAt`, which is the split working in the
one place it is visible. The row menu opened with `aria-expanded="true"` and its trigger at
`rgb(42,41,39)`, so amendment twenty's `.btn--ghost[aria-expanded='true']` rule still holds after the
state moved. The danger entry closed the menu and opened the confirmation in one step; cancel closed
it; and a live delete against no Tauri left all three rows in place, cleared `removing`, and toasted
the real error - the path the swallowed-catch draft would have broken.

## Amendment thirty: the first store whose data is not a signal

`pipeline` is the riskiest thing this campaign has moved: a Kanban board with drag-and-drop, a status
write, a modal that mutates the same cards, and an archive. Allowlist **14 -> 13**.

**Its `cards` is a mutable `Record<status, PipelineCard[]>`, not a signal, and it moved in that shape
on purpose.** CDK's `transferArrayItem` and `moveItemInArray` mutate the arrays they are handed; the
drop handler undoes a failed move by calling `transferArrayItem` back the other way. Rebuilding that
around immutable updates is a change to the board's core interaction, with its own risk and its own
verification - and bundling it into a migration is exactly how a refactor turns into an outage. So
this is the first store here whose principal data is not a signal, which is worth stating plainly
rather than leaving for a reader to discover. The signal conversion remains available as its own
decision, with a real test suite now standing behind it.

**The revert stayed on the component.** It is CDK's operation on CDK's event, and the store has no
business knowing what a `CdkDragDrop` is: the store reports whether the write succeeded, the page puts
the card back. That is the same division the photo flow drew - the layer that owns the optimistic
value owns undoing it.

Four pure functions moved beside the store rather than onto it - `companyInitials`, `stageTotal`,
`stageSegments`, `scoreClass` - the way `tracker-columns` already sits beside its store. Two of them
encode rules rather than formatting: a progress track must never be shorter than the stage the card
has already reached, and an unscored card must not read as a low-scoring one. As plain functions they
are testable without constructing a component, which is the whole argument for the placement.
`formatDate` stayed on the page, locale-dependent, defect already filed.

**A comment was corrected in passing, because it was wrong about its own mechanism.** It said the
mutable model works "under default change detection". The component has been `OnPush` since it was
written. The model renders because `OnPush` marks a component dirty on its own event handlers - which
is a different fact with a different failure mode: state mutated outside an event handler would not
render, and the comment as written would have told the next reader it was safe.

Twenty-eight tests across the store and the pure module. Two pin the decisions that matter most: a
failed status write leaves the card untouched, so the board cannot show a move the database refused;
and a failed stage check returns `false`, because that check gates a prompt that **writes**, and
re-prompting an application that already has stages is worse than not prompting.

**Rendered check, the most thorough this campaign has run, because this was the most to get wrong.**
Three active columns, two collapsed rails, the archive revealing on toggle. `AC`/`GL`/`IS`/`UM` from
the extracted initials, the three score bands, search narrowing to one card and the strip reading
`1 match`. Then both drop paths: a **failed** write moved the card to `offer`, put it back in
`applied` at index 0 with the order intact and `status` untouched; and a **successful** one, against a
stubbed IPC, moved a card to `interview`, mirrored `followUpAt` from the written row, derived
`overdue` **true** from it, recounted the total, and opened the quick-view with that card selected -
the one write path outside Interview Prep, intact across the new boundary.

## Amendment thirty-one: a second reason not to hold the card

`quick-view-modal` finishes the pipeline pair: five gateway calls, four outputs, comments, a stage
stepper and three writes. Allowlist **13 -> 12**.

**The card stayed on the component for two reasons, and the second is new.** The first is amendment
twenty-eight's: it is a required input, and an input belongs to the component that declares it. The
second is specific to this pair - **the board mutates those card objects by reference** when a status
or priority changes, so a copy held in the store would be one the store could not keep in sync, and
the two would disagree silently. Every method takes the id it needs. `showQuickAdd` and
`promptDismissed` stayed with it, because the gate reads `card().status`.

**`pickCurrentStage` was the most valuable thing here, and it had no test.** Its comment says it
mirrors the SQL in `db_pipeline_cards` exactly, which is a real claim with a real failure mode: if
the two drift, the modal's headline and the board's card footer disagree about the same application,
and that reads as data corruption rather than as a bug in a predicate. It is in
`interview-stage-view.ts` beside the store now, with `sortStages` and the three stepper predicates,
and seven tests - including the case the SQL exists for: rejected and cancelled stages are ignored
while anything is still open, but a fully closed funnel still shows the furthest it got.

**Two duplicates were folded rather than moved.** The modal's own `initials()` and `scoreClass()`
were second copies of the functions extracted for the board one amendment ago, and the comment on the
first said "matching the board card" - a claim kept true by hand. They call the shared functions now,
so the claim is structural rather than aspirational. This is the payoff of the previous amendment's
placement decision arriving one pull request later than the decision itself.

Twenty-four tests across the store and the stage module. Three pin decisions: a failed comment write
**keeps what the user typed**, because retyping a comment because the database blinked is the worst
outcome available; a space-only comment never reaches the gateway; and an unset priority compares
equal to `null`, so clicking "none" on a card that never had one is not a write.

**Rendered check.** `AC` and `score--high` rendered through the _shared_ functions, which is the
dedup visible on screen. The stepper drew `HR screen` reached and done, `Technical` reached and
current, `Final` neither, with the counter at `2/3`. Then the three write paths: a failed comment kept
`Worth keeping` in the box and showed the error; a successful one cleared the box and appended; and
the status write emitted the **whole row** to the board - `appliedAt` and `followUpAt` included - which
is the contract the board's `applyModalStatus` depends on.

## Amendment thirty-two: the clearest case yet for where the boundary runs

`dashboard` has five gateway calls and a dozen derivations, and the interesting question was not what
moves but **what must not**. Allowlist **12 -> 11**.

**The action queue stayed on the component.** Each of its items carries a lucide icon, translated
strings, and a `run` closure that navigates or opens a modal - view, i18n and routing, which is three
of the things this layer has refused every time it was asked. It would have been easy to move behind
a disguise: take a label function and an icon map as arguments, the way `recentClaimedJobs` already
takes its label. That disguise is the thing to name, because it will be offered again: passing view
concerns in as parameters does not make them stop being view concerns. The store supplies the facts,
the page builds the cards. `greetingTitle` and the recent-jobs rows stayed for the same reason.

What did move is everything translation-free: the cards, the overview, the profile, the two values
resolved at load because they reach the database, the four KPIs, the new-user test and the
upcoming-interview rows.

`dashboard.util.ts` moved down **whole**, spec included. It was already pure, and `recentClaimedJobs`
already took its label function as a parameter - the same shape `CvPrintStore` takes its normalizer.
Splitting a 104-line file and its spec to hand three helpers to the store is exactly what was rejected
for the onboarding gate util in amendment twenty-five.

**`monogram` is deliberately not folded onto `companyInitials`, and the code now says so.** It is the
third copy of the same idea, and the campaign has folded two duplicates already - but these two differ:
they agree on every real company name and disagree only on the empty one, where the board draws `-`
and the dashboard draws `?`. Folding would change what the dashboard renders, with nothing behind the
change but tidiness. **They are two rules that look alike, not one rule written twice**, and the
comment exists so the next reader does not fold them blind. That is the counterweight to amendment
thirty-one, which folded two copies that really were one rule.

Thirteen store tests. Three pin decisions: a failed load leaves the page empty rather than
half-populated, because a half-populated dashboard under-reports how much needs attention; unclaimed
jobs do not count towards new-user detection, since `listJobsOverview` returns them and the dashboard
is not the filter that shows them; and an unfinished session on an analysed-but-unsaved job still
names the job it reopens rather than rendering an empty tail.

**Rendered check, and the deliberate non-fold is the thing it proved.** KPIs read 4 active, 2
interviews, 1 overdue, 1 offer. The upcoming list drew `GL` at `5h` marked soon, and the
empty-company row drew **`?`** - which is the difference the decision preserved, visible on screen
rather than only asserted in a comment. The queue still built its three items with icons, translated
copy and working actions while reading store data, and the greeting still translated.

The component fell **449 -> 314** lines as a side effect.

## References

- **Links**: `jobs.store.ts` (the precedent, including the recorded refusal of NgRx);
  `eslint.config.mjs` `depConstraints`; `docs/governance/CODE_QUALITY.md`;
  the 2026-08-05 Duty Watch entry stopping Profile at 445/400; the 2026-08-06 entries for
  `discover-location-selection.ts` and `discover-detail-scoring.ts`.
- **Follow-up Tasks**:
  - [x] Add `type:application` and its constraint to `eslint.config.mjs`
  - [x] Add the 250-line store budget category to `tools/check-file-size-budgets.mjs`
  - [x] Create `libs/application` together with its first real store, not empty - `DiscoverDetailStore`
  - [x] Enforce "a component does not reach the gateway" by lint - `no-restricted-syntax` on
        `*.component.ts` with the shrinking `COMPONENTS_STILL_USING_THE_GATEWAY` allowlist (amendment four)
  - [ ] Migrate pages as they are touched, one page per pull request; `cv-detail` **done** (four PRs,
        1019 -> 517), `tracker` **done** (four PRs, 667 -> 304, the first page to finish **under**
        budget), `cover-letter-detail` **done** (eight PRs, class 644 -> 333 and template 669 -> 222,
        both under budget; six components out, amendments fourteen to seventeen), `jobs` deferred
  - [x] Fold the four `.icon-btn` copies onto `libs/ui`'s `appButton size="icon"` (amendment
        eighteen). **The rendered check has now been run and it failed**: the box was 28 x 29.84
        rather than square, and `variant="danger"` coloured at rest where all four rules it replaced
        were `:hover`-only. Both fixed in amendment nineteen.
  - [ ] ~~`.ipd__icon-btn` is the last page-local icon button~~ - **wrong, there are four**;
        amendment eighteen's audit grepped for the name `icon-btn` and missed every copy carrying a
        different one. See the table in amendment nineteen.
  - [x] Fold `interview-prep-detail`'s `.ipd__icon-btn` (4 sites) - **done**, and the ratchet forced
        `interview-stage-actions/` out of it, taking the template **311 -> 274** and the stylesheet
        363 -> 346. The narrow cut, because the wider `.ipd__actions` cluster contains `.ip__pop`
        from `_ip-shared.scss` and would have tripped amendment sixteen. `:disabled` moves 0.35 to
        the design system's 0.5, and is the only visual difference; **checked on a rendered screen**
        before merge, including the danger hover.
  - [x] Fold `.ip__icon` in `_ip-shared.scss` (2 sites, both `interview-prep` pages) - **done, and
        the local rule this entry predicted was not needed**. The `.is-open` state went to
        `.btn--ghost[aria-expanded='true']` in `libs/ui`, because the trigger already bound the
        attribute to the same signal; the rule is scoped to ghost on amendment nineteen's reasoning,
        and no `appButton` in the app carries `aria-expanded`, so it reaches nothing else. Two
        accepted visible deltas: `--text-tertiary` -> `--text-secondary`, and the hover ring dropped
        as drift. **Checked on a rendered screen** in both themes (amendment twenty).
  - [x] Cut `tracker.component.html` under its 300-line budget before folding `.jt-icon` - **done in
        five cuts**: `tracker-export-modal/`, `tracker-column-drawer/`, `tracker-row-menu/`,
        `tracker-row-actions/` and `tracker-summary-strip/`. Template **557 -> 278**, stylesheet
        **893 -> 455** (amendments twenty-one and twenty-two).
  - [ ] `tracker.component.scss` is **455/400** and no longer blocks anything, but it is over: the
        next change to touch it cuts rather than adds.
  - [x] Fold `tracker`'s `.jt-icon` - **done**, and it left nothing local behind (amendment
        twenty-three). Four declared visual changes: kebab 30x30/r7 -> 28x28/r6, `--sm` 24 -> 28,
        the save fill indigo-400 -> indigo-600, and disabled controls to the system's `not-allowed`.
        `quality:style-move` reads 8 lost, 0 gained. Superseded detail, kept for the record:
        all six sites live in `tracker-row-actions/` (three) and `tracker-column-drawer/` (two) and
        `tracker-export-modal/` (one), each of which carries its own copy of the rule. **Six sites in
        four shapes**:
        28px, 24px via `--sm`, 30x30 with radius 7 through a `.jt-menu .jt-icon` descendant
        selector, and an accent fill on `--text-accent` (indigo-400) with a hardcoded `#fff` against
        the system's `--accent` (indigo-600) and `--accent-fg`. Needs its own grilling round. The
        `.jt-icon` copies the extractions leave behind all die in that one pull request.
  - [x] Decide what `.clb__icon-btn` in `cover-letter-body-paragraphs/` is for now that
        `.btn--danger` is quiet at rest again - the local name was chosen (amendment seventeen)
        precisely because folding it then meant a visible change, and that reason may have expired.
        **It had, and nothing had replaced it: folded** onto `appButton variant="danger" size="icon"`
        (amendment twenty-four). Rest state and geometry were already identical on every property;
        the one accepted visible change is hover, from a neutral `--surface-hover` plate to the
        system's `--danger-tint` plate and `--danger` ring - which is what the four rules amendment
        eighteen folded had rendered all along, so this was the last destructive icon in the app that
        disagreed with the others. `quality:style-move` reads 3 lost, 0 gained. **No page-local icon
        button remains anywhere in the application; the campaign is closed.**
  - [x] ~~Remove or define the bare `.spin` class; it resolves to nothing~~ - **the claim was wrong**,
        it is defined in `_cover-letter-controls.scss` (amendment seventeen). It did have a real bug:
        it wobbled, because `<lucide-icon>` is `display: inline`. Fixed.
  - [x] **Pay the visual debt** - the maintainer ran the editor and it found a two-day-old regression
        in `cover-letter-block/` on the first pass (amendment seventeen)
  - [ ] Keep paying it: **no further extraction in this area merges without a rendered check**, since
        the only defect class that matters here is invisible to every gate
  - [ ] Empty `COMPONENTS_STILL_USING_THE_GATEWAY` (**11** entries; first deleted 2026-08-07,
        then delete the rule with it. Two went in amendment twenty-five: `onboarding-banner` migrated
        to `OnboardingBannerStore`, and `paste-job-modal` turned out to be injecting the gateway
        without ever calling it - so the count had been overstating the work by one)
  - [ ] Move the app's `shared/*` services into `libs/application`, decomposing the five over 250 lines
  - [ ] Remove `type:data` from `type:app`'s allowlist once those services have moved too
  - [ ] Cut `db.service.ts` into per-domain gateways when the ratchet refuses the next method
