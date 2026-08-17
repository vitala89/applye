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

## Amendment thirty-three: one call, and the dead state behind it

`shell-layout` had a single gateway call, which made it look like the cheapest entry left. The call
itself was small. What it was carrying was not. Allowlist **11 -> 10**.

**Half the call was feeding state nothing read.** `ngOnInit` read the settings row and did two things
with it: applied `uiLanguage`, and set an `aiMode` signal. `aiMode` was written and never read - not
in the template, not in any other file, only in the spec's `getSettings` mock. `git log -S` named the
commit that introduced it, `af4a90a fix(sidebar): de-animate AI status indicator, show real mode`, and
the indicator it fed left the template afterwards. It is **deleted, not moved**. A migration that
moves dead state publishes it in the layer's public API and then owes it a test; the grep that finds
it costs one command, and it is worth running on every remaining entry.

**The store does not apply the locale, and that is the whole shape of the decision.** With `aiMode`
gone, the only value the database supplies is `uiLanguage`, and its only use is `i18n.setLocale` - a
side effect this layer has refused since the first migration. Three shapes were on the table: the
store exposes the preference and the shell applies it; the shell stops owning locale bootstrap at all,
since `settings.component.ts` already calls `setLocale` itself; or the store takes the setter as an
argument, the way `CvPrintStore` takes its normalizer. The third is the disguise amendment
thirty-two named, offered again in a smaller package, and it was refused again for the same reason:
passing a side effect in as a parameter does not make it state. The first was taken.

**`sidebarCollapsed` moved, and it is the first `localStorage` access in `libs/application`.** The
alternative reading was that browser storage belongs with the DOM exclusions - `document.fonts`,
`document.body` - that this layer has kept out. It does not: a rail preference is screen state that
happens to outlive the session, and the store reads it at construction, which is what makes it correct
at first paint rather than a frame later. A storage token was considered and rejected: a new symbol in
the layer's public API to abstract one boolean is not a trade worth making. `globalThis.localStorage?`
stays optional-chained, so a non-browser environment falls through to the default rather than throwing.

**`load()` returns a boolean and keeps an `error` signal that nothing reads.** The shell says nothing
on a failed settings read - it keeps `en` and dark, and always has. Recording the failure anyway costs
one signal and keeps the refusal-versus-failure distinction testable, which is rule three of the
contract; the alternative, a `void` load, would have made a failed read indistinguishable from a
successful one inside the layer.

Nothing else moved, and the list is longer than what did: the resume affordance is computed from three
of the app's own services, the page title and active route come from the router, the two activity-key
maps are translations, the traffic-light inset is a platform probe, and the theme is the app's
`ThemeService`.

**The component spec needed no change at all** - the first time in this campaign. It stubs `DbService`
at the `TestBed` level, and the component-scoped store resolves it through the same injector chain, so
the badge spec kept its stub and its assertions untouched. Eight store tests are the only addition;
`application` goes 706/49 to **714/50** while `desktop` stays at **1493/130**.

**Rendered check, and the absence of Tauri did the work.** In the browser the settings read fails,
which is the failure path for free: `error` carried the real message, `uiLanguage` stayed null, the
shell kept English, and the console stayed empty - the silence is deliberate, not a swallowed bug. The
rail then measured **240 -> 64** with labels hidden and icons kept, and back; `localStorage` read `1`
then `0`. **The first width reading was wrong and looked right**: 240 in all three states, taken
mid-transition, exactly the trap amendments twenty-three and twenty-eight describe, and the sidebar's
own `width 0.14s` is what caused it. Setting `transition: none` before measuring produced the real
numbers. A reload with the preference set drew the rail at first paint.

The component fell **232 -> 203** lines; the store is 67.

## Amendment thirty-four: the page where almost nothing was allowed to move

`analytics` is the first entry whose domain math was **already** in `libs/core`. `computeAnalytics`
has lived there with its own spec since the feature shipped, so the store's whole job is to own its
two inputs - the facts and the period - and hand back the `AnalyticsView`. Allowlist **10 -> 9**.

**Ten computeds stayed on the page, and that is the correct outcome, not a shortfall.** `tiles`,
`stages`, `leakage`, `scoreDist`, `scoreOutcome`, `timeToResponse`, `aging`, `locations`, `caption`
and `segments` all turn view data into words: KPI labels, stage names, bucket captions, the leakage
sentence, outcome group names. A migration is not measured by how much moves. Here the honest split
puts about 200 lines of translation on the page and 80 in the store, and a bigger store would only
have been a store that translates.

**`now` is stamped at load instead of read inside the view.** The page called
`computeAnalytics(f, period, new Date())` **inside a computed**, so the window boundary was re-read
on every recompute - including every period switch. Nothing visible fails from that, which is why it
survived: a 30d window measured a few seconds later than the 90d one it is compared against is not
something a gate, a test or a screenshot can catch. `DashboardStore` had already answered this
question the other way, and two stores disagreeing about what "now" means is worse than either
answer. A store test asserts `now` is unchanged across two period switches, which is the assertion
that fails if it ever goes back.

**`analytics-view.ts` takes the sparkline geometry.** The `pts()` closure inside `trend` was the only
arithmetic on the page that is neither domain math nor translation, and it was untestable without
instantiating the component. It is now `polylinePoints(values, yMax)` and `areaPoints(line)`, seven
tests, including that two series scale against a **shared** `yMax` so the followups line stays
comparable with the applications line. The Intl date formatting stays on the page - it depends on the
active locale, and locale is the page's.

One deliberate difference from the code it replaces: `polylinePoints` guards `yMax === 0`, which the
original did not. It is unreachable, because `computeAnalytics` floors `yMax` at 1 - but the function
is now callable without that guarantee, and the failure mode without the guard is `NaN` inside a
`points` attribute, which renders as nothing rather than as an error. The guard is documented as a
guard, not as a fix.

**Rendered check, in three parts, because the missing Tauri context only covers one of them.** The
failure path came free: `error` held the real message, empty facts were installed, the empty state
rendered rather than a blank page, and the page's own toast read `Could not load analytics` - the
store silent, the page speaking, which is the split the contract asks for. The toast was **absent
from the first DOM read**, the one-cycle lag this campaign has now hit twice. Then facts were pushed
straight into the store's signal to check the geometry with data: 13 points spanning x=0 to x=100,
monotonic, y between the 3 top inset and the 39 baseline, five peaks at the inset, the area closing
on the baseline, and the DOM `polyline` carrying exactly the computed string. Last, the decision
itself: `now` read identical across `90d -> 30d -> all`, while the buckets changed from 13 weekly to
30 daily and the KPI moved 5 -> 3 -> 5.

The component fell **297 -> 268** lines; the store is 80 and the geometry module 49. The template is
**426/300** and untouched - pre-existing debt the ratchet allows because it did not grow, and the
next change that touches it must cut.

## Amendment thirty-five: a store with no state, which is the honest answer

`first-launch` is 439 lines and looked like the hardest of the one-call tier. It is not: **417 of
those lines are the inline template and its keyframes**, and the class is 22 - one `updateSettings`
write and an `output`. There is no screen state to move, because the screen has none. Allowlist
**9 -> 8**.

**So the store holds nothing, and the amendment says so rather than dressing it up.** The lint rule
is about the gateway, not about signals: a component may not reach the database, and this one did.
`FirstLaunchStore` takes the call, and inventing state for it to hold would have been worse than
leaving it small. Two alternatives were weighed and refused. Folding the write into
`HealthCheckStore` conflates the check with the flags, and that store's own doc records why it sits
in its own area - its panel has two homes, and Settings would inherit a method that means nothing
there. A shared flags store that `onboarding` could reuse when it migrates is designed for a caller
that does not exist yet; this campaign rejected that shape twice already, for the onboarding gate
util and for the dashboard helpers.

**The deliberate silence is the interesting part.** The original swallowed a failed write with a
comment - never trap the user on this screen - and that is still exactly right. The store records
the failure in `error` and returns `false`; the page ignores the return value, with the comment moved
to the ignoring rather than deleted. Refusal-versus-failure stays testable inside the layer while
the screen's behaviour is unchanged.

Two facts found by reading, worth carrying:

- **`app.ts` injects the gateway and the lint rule does not see it**, because the rule matches
  `*.component.ts` and that file is `app.ts`. The allowlist has been undercounting the work by one
  the whole campaign. Not fixed here - it is not this migration's job - but the checklist below now
  names it.
- `onboarding.component.ts` writes `onboardingSeen` too, and is still on the allowlist. If its
  migration wants to share this write, that is the moment to decide it, with the second caller in
  hand rather than imagined.

**Rendered check, and a fourth animation trap - a new one.** The first screenshot came back
**entirely blank** while the DOM held the right text. The cause is not the app: `document.hidden` is
**true** in the preview tab, so the compositor never advances CSS animations - `currentTime` stayed
at 0 through a 4.8-second wait. Every element on this screen starts at `opacity: 0` under
`animation-fill-mode: both`, so a screen that renders perfectly well photographs as nothing.
`document.getAnimations().forEach(a => { a.currentTime = 6000; a.pause() })` produces the true end
state, and it is better than faking `prefers-reduced-motion` because it exercises the real keyframes.
This is the same family as amendments twenty-three and twenty-eight - a value read while an animation
is mid-flight - but the previous two produced a _plausible wrong number_, and this one produces a
blank frame that reads as a broken screen. Both failure modes are worth knowing.

With the animations pinned, everything renders: lockup, title with the caret, tagline, both CTAs,
hint, divider, and the health panel. The failed check draws as **one `fail` row with a "Re-run check"
control**, which is `HealthCheckStore`'s documented "a failed check is a result, not an error state"
(amendment twenty-six) visible on screen.

The behaviour that matters was driven deliberately, not observed in passing: with the write failing
for real, `dismiss` returned false, `error` held the message, `dismissed` still emitted
`{ startOnboarding: false }`, and the component unmounted. **The user leaves the screen even when the
preference cannot be saved** - which is the whole point of the silence.

The component fell **426 -> 419** non-empty lines, still over its 400 budget and still allowed
because it shrank. The store is 43.

## Amendment thirty-six: one page, two features, two stores

`my-jobs` is the first multi-call entry, and the first page that was plainly **two features in one
class**: a sortable table over the local job overview, and the tracklist import wizard - eight
signals, an AI call, JSON parsing and a three-step flow. Allowlist **8 -> 7**.

**Two stores, not one.** A single store would have opened at roughly the 250 budget, and the table -
which is read-only and costs nothing - would have carried a dependency on `AiService` it never uses.
`MyJobsStore` is 127 lines, `TracklistImportStore` 167. The split is by feature, not by size: they
share no state, and neither reads the other.

**The rows stayed in `libs/data`.** `JobsStore` is the shared cache two screens read, and a copy in
`libs/application` would be a second copy that could disagree with the first. The new store injects
it and holds only what is true of _this_ screen. This is the first store here that depends on another
store rather than on `DbService` directly, and it is the right direction: `application -> data`.

**`isEmpty` is new, and it is a real distinction rather than a convenience.** The empty state asked
`!jobsStore.overview().length`, which is "no jobs at all". Filtering to nothing is a different screen,
and a user with 200 jobs and a typo in the search box must not be told they have none. Moving the
state forced the question to be named; a passthrough would have hidden it.

**Two things deliberately did not move, and both are precedents being applied rather than set.** The
file dialog stays on the page: no file under `libs/` imports a Tauri plugin, and `ProfilePhotoStore`
settled the shape already - the page picks a path, the store takes it from there, so `detect(path)`
is the whole seam. And the two English sentences stay on the page, because they are text: the stores
publish `total`, `willAdd`, `duplicates`, `skipped` and the result, and the page writes the words.
They are **still hardcoded English next to a correctly translated toast**, unchanged by this
migration and now filed as a defect. Moving them was not an option - a store that writes user-facing
sentences is the thing this layer has refused since amendment one.

`tracklist-import.ts` takes the pure parts: the code-fence strip, the parse that throws with a
**truncated** excerpt of what came back, and the snake_case mapping. All three were previously
unreachable without instantiating the component. The truncation is worth keeping deliberately - a
parse failure with no sample is unactionable, and the whole response can be thousands of tokens.

`job-overview-rows.{ts,spec.ts}` moved whole, `git mv`, the same way `dashboard.util.ts` did.

**The test counts reconcile exactly, which is the check that the move lost nothing**: `desktop`
1493 -> **1487**, six tests and one suite out; `application` 733 -> **768**, the same six back plus 29
new.

**Rendered check, driven through the real controls rather than the signals wherever one existed.**
The default view drew `[2, 1, 4]` - newest first, with the unclaimed row hidden per ADR-0004. The
"Show analysed" checkbox brought it back as a fourth row with its dashed `ANALYSED` chip; the status
filter selected that pseudo-status like any other; a padded, wrong-case search matched; a minimum
score of 0 excluded the **unscored** row rather than treating null as zero; and clicking the Score
header twice sorted 44/82/91 up and down. Then the two write paths, both failing for real without
Tauri: a failed delete **kept the confirmation open** - closing it would claim the row was gone while
it is still there - and the page raised the real message while the store stayed silent; a failed
detect stayed on the pick step with the error recorded; and `confirm()` with nothing ticked returned
`null`, which is a refusal and says nothing.

The component fell **334 -> 140** lines. The template **grew 275 -> 285** non-empty lines, still under
its 300 budget: the `table.` and `importer.` prefixes make expressions long enough that prettier wraps
them. Worth naming, because every remaining migration will pay the same few lines, and a template
already at its budget will need a cut to absorb them.

## Amendment thirty-seven: the page this ADR stopped once, and a split decided by measurement

`profile` is the page this ADR stopped at 445/400 by decision, with the note that extracting pure
helpers had not brought it back. It now has three stores. Allowlist **7 -> 6**.

**The split was decided twice, and the second time by a number.** The grilling gate chose two stores -
`ProfileStore` and `ProfileArtifactStore` - partly on an estimate of mine that `ProfileStore` would
land at 200-220 lines. It landed at **324 against a 250 budget**, and the file-size gate refused it.
The estimate was wrong by about a hundred lines, so the decision had been made on bad information and
was put back to the maintainer with the real number. The third store, `ProfileFormStore`, is that
correction. The seam it exposed is a good one and was not visible from the outside: **what is saved**
and **what is being typed** are different things, and the dependency runs one way - `ProfileStore`
reads the editor to decide whether the page is dirty; the editor knows nothing about the row.

Sizes after: editor 140, `ProfileStore` **218/250**, artefacts 127, and the page **483 -> 171**.

**One writer survived the split, deliberately.** `persist` maintains `savedMdHash` alongside the row,
and the comment on it records that every writer which maintained the hash by hand eventually forgot
to. Splitting artefact generation into its own store is exactly the situation where a second writer
appears, so `ProfileArtifactStore` computes its patch and hands it to `ProfileStore.persist`. A store
test asserts the hash advances with the row, and the pre-existing wiring spec - eighteen tests on this
invariant - still passes unchanged apart from where it reads state.

**No status sentence moved, and that reshaped the code rather than just relocating it.** `saveStatus`,
`scoreStatus` and `pitchStatus` are translated text assembled from a date, token counts or an error.
The stores publish outcomes instead: `lastSavedAt`, `error`, `tokens`, and a four-value artefact
result - `empty`, `cached`, `generated`, `failed` - of which two are refusals that say their piece in
the status line and never toast. The page turns each into its sentence. The old `artifactUi` record,
which addressed three signals by artefact kind, is gone; what replaced it is a `switch` on the
outcome.

**A translation-key map now sits in the layer**, `ARTIFACT_CACHED_KEY`, because it is part of
`profile-artifact.util.ts` which had to move whole. The layer never resolves it - the page does. It is
named here rather than quietly accepted: splitting a file to keep two constants out would be the
churn amendment twenty-five rejected, but a key map is text, and if more of them accumulate the rule
needs restating rather than eroding.

**A real defect, found on the rendered screen and fixed here.** `generate` documents that it never
rejects, but `hashText` was called **outside** the guard - preserved faithfully from the original. In
the browser, where hashing genuinely fails, it rejected out of the page's click handler and nothing
appeared at all. It now records the failure and returns `failed` like any other, with a test. This is
the fourth defect this campaign found by exercising a page rather than by any gate, and the first
found because a doc comment I had just written turned out not to describe the code under it.

**Rendered check.** Load failure first, free from the missing Tauri context: the store held the raw
message and the page composed the translated `Failed to load: …`. Then with a row pushed in: hero
`Senior · Fintech` joined by the page from the store's facts, completeness 33%, one experience row and
the skills parsed, both artefacts `fresh`. Editing a field made the page dirty and moved scoring to
`unsaved`; editing **only** an archetype made it dirty while `mdDirty` stayed false and scoring stayed
`fresh` - the distinction the whole freshness rule rests on, visible rather than asserted. A failed
generation wrote to the **scoring** line and left the pitch line empty, which is the crossing
regression the wiring spec exists to catch, and a failed save wrote its own sentence.

Test counts: `desktop` 1487 -> **1451** (three util specs out), `application` 768 -> **823** (those
36 back, plus 19 new).

## Amendment thirty-eight: the densest entry, and a refusal that kept someone else's error

`interview-prep-detail` had the highest call density left - eight gateway calls in 332 lines, across
load, create, update, delete and a reorder that writes twice. Allowlist **6 -> 5**.

**The store came to 256 against a 250 budget, and the fix was canon rather than an exception.**
`StageFormValue`, its empty value, and the mapping that turns blank strings into **absent** fields
belong beside the store as pure functions (rule five), not on it. Extracting `interview-stage-form.ts`
took the store to **217** and made the one genuinely testable transformation testable without a
component. That the extraction also solved the budget is a coincidence worth naming: the same move
was correct on its own terms, which is the only reason it was not a dodge.

**Refusal and failure are separated all the way through**, and this page has five refusals: a blank
label, a status equal to the one already set, a reorder past either end, a save already running, and
a delete with nothing targeted. All return `null` and say nothing; a blank label lights its own field
instead, which needs no toast. Only a gateway failure returns `false` with `error` filled.

**A contract gap, found on the rendered screen.** The refusal paths returned **before** clearing
`error`, so a refusal following a failed load left the load's message standing. Nothing displayed it -
the page reads `error` only when it gets `false` - so no gate, test or screenshot would have caught
it, and it was visible only because the browser had just failed a load for real and the next thing
tried was a refusal. `error` is cleared before the refusal checks now, with a test that fails on the
old order. This is the second time in two migrations that a store's documented contract turned out to
be true only in the common ordering; the lesson is that "refusal leaves `error` empty" has to mean
_clears it_, not _does not set it_.

**The reorder keeps its pessimism.** Nothing moves on screen until both writes return, so a failed
swap leaves the timeline exactly as it was rather than showing an order the database does not have -
the opposite choice from the Kanban board, which moves first and rolls back (amendment thirty). Both
are right for their surface: a board drag is direct manipulation the user is already watching, an
arrow click is not.

`fmtDate` stayed on the page with its hardcoded `en-GB`. It is one of the five filed sites, and a
migration is not where that gets fixed.

**Rendered check.** The timeline drew two stages with their numbers, status chips, interviewer lines
and `2 stages · 1 upcoming`. All five refusals returned `null`; the blank label lit the field and left
`error` clear - the fix verified where it was found. A failed save kept the modal open, recorded the
error and toasted it; a failed reorder left the order `[1, 2]` untouched. Console clean.

The component fell **332 -> 132** lines; the store is 218 and the form module 45. Counts: `desktop`
unchanged at **1451 / 126**, `application` 823 -> **844 / 63**.

## Amendment thirty-nine: two stores in one folder that answer differently, on purpose

`cover-letter-list` is a document library plus a generate-from-AI modal - the same two-feature shape
as My Jobs, and it split the same way. Allowlist **5 -> 4**.

**The interesting decision is a deliberate inconsistency.** `CoverLetterAiStore` already lives in this
folder and **throws** `CoverLetterNoProfileError`; the new `CoverLetterGenerateStore` returns
`'busy' | 'no-profile' | 'bad-json' | 'generated' | 'failed'` and never rejects. Two stores in one
directory now answer differently, which a reader will notice, and it was chosen rather than drifted
into: a missing profile is a **refusal**, not a failure - the user has not done something yet - and
raising an exception for it is what amendment three argued against. Converting the neighbour was
offered and refused as a second migration riding inside this one; it moves when it is touched.

Three things the layer already had, reused rather than re-decided: the codec is **passed in** because
`cleanJsonText` lives in `apps/desktop` (amendment six), the skill name and the generic job-description
placeholder come from `cover-letter-generation.ts` rather than being retyped, and the save dialog stays
on the page because no file under `libs/` imports a Tauri plugin.

**Every label stayed with the page**, and there are three: the copy's name (two translation keys), the
generated document's name (a company plus a key, or a key plus a region tag), and the linked-job line.
The stores publish `linkedJobFacts` and `selectedCompany`; the page composes all three. This is the
fourth migration where the honest split leaves more lines on the page than in the store, and that
continues to be the right answer rather than a shortfall.

**One deliberate behaviour change**, small and named: `suggestCoverLetterFilename` used to collapse a
label of pure punctuation to an empty stem and suggest a file called `.pdf` - hidden and nameless on
most systems. It falls back to `cover-letter` now, with a test. Hyphens still survive, because they are
already safe, and a test pins that too so the next reader does not "fix" it.

**Rendered check, including the AI path under a temporary `__TAURI_INTERNALS__` stub** - installed in
the console, used, and deleted in the same call, never committed. All four outcomes were exercised
against the real code path: `no-profile` refused with `error` clear, `bad-json` recorded a 100-character
excerpt and left the modal open, `generated` returned id 77 with the modal closed and the label written
exactly as the page composed it, and `failed` had already been seen when the profile read itself threw.
Without the stub the store correctly reports a failed **read** as `failed` rather than as `no-profile`,
which is the distinction the outcome type exists for.

The list itself drew both documents, the linked `Acme · Backend Engineer` line on the attached one and
the untitled fallback on the other. The only console error was from a route I mistyped while driving
the check - `/documents/cover-letters` does not exist - not from the page.

The component fell **283 -> 127** lines; the stores are 140 and 156, the filename module 19.

## Amendment forty: three stores, and a refusal that pays for itself

`cv-list` is the same document-library shape as `cover-letter-list`, with a third feature bolted on -
importing a CV the user already has. Allowlist **4 -> 3**. The component fell **386 -> 180**; the
stores are 150, 152 and 189, all inside the 250 budget without a pure module being needed.

**Three stores rather than two, decided before writing any of them.** The library, the import flow and
the baseline generator are three concerns, and the two-store reading - import and generate share a
modal-config shape, so fold them - was rejected on the estimate: it lands at 230 to 260 lines, at or
over budget, and this campaign has already been wrong about a store's size twice in the optimistic
direction. The split cost three files and three specs and bought three stores nobody has to argue
about later.

**The screen loads once.** `CvListStore` holds the templates and both job lists, and the other two
stores take them as method arguments. The alternative - each store fetching what it needs - was
refused for a reason that is not performance: two stores holding independently-fetched template lists
can disagree after a change, and nothing on screen would say which one is stale.

**`CvGenerateStore` owns the job link.** Generating a CV against a tracked job writes
`upsertApplication` in the same call rather than leaving the page to do it afterwards. This is the
first store in the campaign to own a write that is not "its own" data, and the reason is the failure
mode: a forgotten second step produces an unlinked CV that looks exactly like a linked one, so the
mistake is invisible until someone goes looking for it. Three tests pin it, including the case where
the job has no application row yet and there is deliberately nothing to attach to.

**`CvImportStore` answers `'existing'` from the hash, before the model is called.** Re-picking a file
already in the library costs one file read rather than a second paid parse. The store needs the
document list to decide, which is one more argument, and that was the cheaper of the two readings:
the alternative splits the flow into read-file, decide, then parse, turning one store call into two
for no gain.

**The codec is passed in, and `cv-parse.util.ts` was left where it is.** It qualifies for the
"move down whole with its spec" branch - it is pure and imports only `@applye/core` - and it was still
refused, because rewiring its six importers pulls `onboarding.component.ts` and `cv-draft.service.ts`
into a page migration, and both are themselves pending. `cv-content.util.ts` never had the option:
596 lines against a 400 budget, 40 files touching it, and already split once because the size gate
refused the merged version.

**`suggestCvFilename` moved** to `cv-filename.ts` beside its cover-letter twin, with the six tests it
never had. `cv-content.util.ts` fell 621 -> 596 as a side effect, which is what the ratchet wants from
a file that was touched.

**One dead signal deleted.** `generateStep` was written twice and read in no file, including the
template - the same shape as the dead `aiMode` in amendment thirty-five, found by the same grep, which
has now paid for itself twice.

**One outcome that maps to the same sentence, kept anyway.** `bad-json` and `failed` both toast the
store's `error` on this page, because `parseCvSkillResponse` already produces a specific message and
inventing a second English string would have added to a debt this campaign is already carrying. The
outcomes stay apart because "the model lied" and "the database refused" are different problems for the
next caller, even where this page has nothing different to say about them.

**Rendered check, list and both modals.** Without Tauri the load fails correctly: `loadError` set, the
error text carried, and the page toasting it - and `openGenerate` still opens its modal on unreadable
defaults while reporting, which is the behaviour the store's `start` was written for. Under a
temporary `__TAURI_INTERNALS__` stub, installed in the console and deleted in the same call, the list
drew both documents with `Acme · Engineer` on the linked one; generate returned id 42, closed the
modal and wrote `db_upsert_application`; import answered `existing` with id 9 and no `ai_run` call on
a known hash, then `parsed` -> preview -> `saved` -> the done panel on a fresh one.

**One thing to be honest about:** the template went 283 -> **285** after prettier, on a 300 budget.
The gate passed and the touched set is strongly negative overall (component -206, `cv-content.util.ts`
-25), but the ratchet's own words are that a touched file shrinks. The two lines are prettier wrapping
the delete modal's buttons now that their bindings carry a `list.` prefix. The next change to this
template cuts.

## Amendment forty-one: the extraction the gate demanded before the migration

Settings is the next entry on the allowlist, and its template stopped the migration before it
started. `settings.component.html` was **580 against a 300 budget**, and
`check-file-size-budgets.mjs` fails an already-over-budget file that grows **at all**. Rebinding a
page to stores grows its template - `cv-list`'s went 283 to 285 for exactly that reason one
migration earlier, and passed only because it was under budget. This one is not. So the extraction
is its own pull request, and **the allowlist does not move in it**.

That sequencing was not a preference discovered while writing; it was read out of the gate before
any file was touched. The alternative offered - migrate first and accept the growth - fails the
build, which is the gate doing its job.

**Five components, each on a boundary the migration already needs**: `settings-ai-provider`,
`settings-cli-status`, `settings-api-key`, `settings-geo-target`, `settings-danger-zone`. Cutting on
the future store boundaries means the next pull request is state movement with no second reshaping;
cutting to the minimum that fits the budget would have left the reshaping for the harder change.

**The section wrapper stays on the page.** `<section class="section"><h3 class="eyebrow">` was not
moved into the children, which keeps two rules out of the shared partial and - the reason that
matters - keeps every child host inside a `.section` where nothing lays it out. A host that becomes
the flex item is what cost Profile its paired-field row.

**One shared partial, `_settings-form.scss`, and its header names its six consumers.** Angular scopes
a component's styles to its own template, so `.field`, `.cap`, `.hint`, the `input`/`select` block,
the toggle and the confirm block all stop reaching the moment their markup moves. This is the same
construct amendments sixteen, twenty-one and twenty-two each hit from a different direction, and the
mitigation is the only one available: write the consumer list down, because no template shows it.

**Two things the move had to reproduce rather than inherit.**

1. `.section` is a flex column with `gap: var(--space-5)`, and that gap separated blocks that are now
   one child's content. Collapsing them into a single host would have removed every gap inside it.
   Each host declares the column itself, and it was **measured on screen**: the section reports 16px,
   the host reports 16px, and the four blocks inside the provider component sit 16px apart.
2. The CLI status list belongs **between** the provider picker and the model row, and a sibling
   component cannot sit there. The picker takes it through `<ng-content>` instead of forwarding four
   inputs it does not otherwise care about; the rendered order is
   `label.field, label.field, app-settings-cli-status, div.row, p.hint, div.field`, which is the
   order it had.

**One thing that nearly became a silent behaviour change.** The danger zone's confirmation flag
looked like child-local state, and it is not: a _failed_ reset closes the confirmation as well as
clearing the running flag, and a child-local boolean cannot be closed from the page. It stays an
input, with a test.

**A function was refused as an input.** `modelSelectValue(stored)` would have been the smallest
change; it is two resolved strings instead. Handing a component a function to call is how view logic
crosses a boundary while looking like data - amendments thirty-two and thirty-seven, in the other
direction.

**Dead CSS deleted:** `.about`, `.about__name`, `.about__version`. `about-update` carries its own
copies in its own scoped stylesheet, so the page's had reached nothing since that component existed.
They are the 3 selectors `quality:style-move` reports lost; the 1 gained is the host column above.
The rendered check confirms the About block still draws.

**A measurement of mine was wrong before it was right, and the tool was the reason.** The first
light-theme reading said `select` kept its dark background while `.cap` changed - which would have
been a real regression in the shared partial. It was the amendment twenty-three trap: `select`
carries `transition: background`, and a property mid-transition reports the interpolated value.
Re-measured with `transition: none` set inline, it reads `rgb(244, 244, 242)` with a
`rgb(214, 214, 218)` border - correct. `--text-tertiary` resolves to `#726e64` in both themes, so the
hint was never wrong either. Nothing was broken; the instrument was.

Template **580 -> 214**, stylesheet **362 -> 71** plus the 164-line partial. The screen had **no spec
at all**; it has 30 tests. The class is 575 -> 564 and stays over budget, which the migration is what
fixes.

## Amendment forty-two: the screen the extraction had already made easy

Settings is out. Allowlist **3 -> 2**, and the class fell **564 -> 277**, under its 400 budget for
the first time. That number is the point of amendment forty-one: the seams were already cut, so this
change is state movement and nothing else. The five section components and their 30 tests were not
touched at all.

**Five stores**, each on a seam the extraction had drawn: `SettingsStore` (128), `GeoTargetStore`
(128), `CliBridgeStore` (114), `ProviderKeyStore` (76), `ConnectionTestStore` (57). No pure module
had to come out to fit any of them.

**The children stayed pure view, and that was a decision rather than an omission.** A store provided
by a page is injectable by its children, so all five could have taken their own and shed their input
surface. They did not, for two reasons: it would have meant rewriting assertions written the day
before, and five presentational components would have become DI-coupled to one screen. The page
stays a wiring hub, which is most of why 277 rather than 180.

**One copy of the settings row.** `GeoTargetStore` injects `SettingsStore` and reads the record from
it - the first store in this campaign to depend on another. The alternative, its own copy of the two
encoded fields, is how two halves of a screen come to disagree about what the next save will write.

**Three things stayed on the page**, all for the same reason: `i18n.setLocale` after patching
`uiLanguage`, every toast, and `window.location.reload()` after a reset. The store wipes the database
and the keychain; dropping every component's in-memory state is a DOM action, and no file under
`libs/` touches the window.

**The credential path moved, and the shape it moved into is the point.** `ProviderKeyStore` has
`refresh`, `save` and `remove` and **no read path at all** - `stored` is a yes/no answer, never the
key. The draft is cleared the instant a save succeeds and deliberately _kept_ when one fails, because
making the user retype a long key over a transient keychain error would be its own bug. A failed
`hasProviderKey` answers "no" rather than leaving the previous provider's answer standing, which
would unlock a Test button that can only fail. Five tests pin those, plus one that asserts the
public surface has no getter.

**Two distinctions kept rather than collapsed.** npm refusing an install is a message worth showing
verbatim, so `refused` is a separate outcome from `failed` - collapsing them would hide whichever one
the page chose not to print. And the CLI model picker answers `null` for the custom choice instead of
returning the sentinel, because writing `__custom__` into the settings row would send that string to
the CLI verbatim.

**Both utils moved down whole with their specs.** `geo-target.util.ts` and `cli-models.util.ts` are
pure and import only `@applye/core`, which is the branch of the contract they qualify for - unlike
`cv-parse.util.ts` one migration earlier, whose six importers included two pages that are themselves
pending. Their **19 tests moved with them**, which is why `desktop` falls 1481 -> 1462 while
`application` rises 921 -> 993: 53 genuinely new tests, and the counters reconcile.

**A test fixture was wrong, and the code was right.** Four `GeoTargetStore` tests failed on the first
run asserting `geoScope: 'europe'` where the encoder produces `'["europe"]'`. The fix was to assert
against `encodeGeoScopes` rather than to write the literal out - a test that hardcodes an encoding is
a second implementation of it, and it would have passed while disagreeing with the real one.

**Rendered check, including the three failure paths**, under a temporary console-only Tauri stub
removed in the same call. A market pick persists and offers its source plan; a region pick clears the
market and drops the pending offer; a second Worldwide is refused in silence with `error` empty. The
key save trims and clears the draft and the field reads empty; remove flips the button count and
`canTest`. CLI mode probes, draws both status rows, and the custom model choice opens the free-text
field **without** writing the sentinel. Then, with the stub made to throw: a failed reset **closes the
confirmation** rather than leaving an armed "delete everything" dialog standing, a failed save
releases `saving`, and a failed geo toggle rolls the record back to exactly what it was. All three
toasted.

The `<ng-content>` projection and the `:host` gaps from amendment forty-one still measure right after
the rewiring - order `label, label, app-settings-cli-status, div, p, div`, gaps 16px throughout.

## Amendment forty-three: three dead rules, and the one a rendered screen caught

Onboarding is the last entry before `jobs`, and **three** of its files were over budget: the class
738/400, the template 514/300, the stylesheet 642/400. Same forced sequencing as Settings, for the
same reason - the size gate fails an over-budget file that grows at all - so this pull request is the
extraction and **the allowlist does not move in it**.

**The local convention won over the campaign's.** Settings' children stayed pure view with inputs and
outputs. Onboarding's existing children inject a shared app-local service instead, and
`onboarding-cli-card.component.ts` says why: the wizard provides that service and reads the same
signals back for its Continue gate. The two new step components follow the folder they are in rather
than the screen migrated the day before, and the two new services sit beside the three that already
exist so the next pull request moves all five down as one set. Convention is local until there is a
reason to make it global.

**Easier than Settings in one specific way.** `_onboarding-shell.scss` is `@use`d from `styles.scss`,
so its rules are global and cross Angular's component scoping. `.ob__eyebrow`, `.ob__h1`,
`.ob__field`, `.ob__badge` and the rest reach the new children with nothing done - measured, not
assumed. No shared partial was needed, which is the whole of what amendment forty-one had to build.

**Three dead-CSS finds, all one shape: a rule outliving the markup it was written for.**

1. `.ob__cli-icon--ok` and `--warn` sat in the wizard's scoped stylesheet while their markup moved
   into the CLI card in **#327**. There is not even a base `.ob__cli-icon` rule. The ok/warn tint on
   that status icon has therefore been **dead since that pull request**, not misplaced. Moved, and
   verified on screen: `rgb(78, 203, 140)` = `--success`, `rgb(240, 184, 92)` = `--warning`.
2. `.ob__note`, `.ob__note lucide-icon`, `.ob__note-text` and `.ob__note-text b` appear in no
   template in this folder. Deleted; they are the 4 selectors `quality:style-move` reports lost.
3. **`.ob__resume-grid` and `.ob__label-row` were stranded by this very extraction.** They stayed in
   the page's stylesheet while their markup left, so they reached nothing.

**The third one is the entry.** `quality:style-move` read **0 lost, 0 gained** for both of them
throughout - correctly, because nothing was lost: the declarations were still there, in a file that
no longer renders that markup. The gate cannot see reach, which amendments twenty-one and
twenty-two said in the abstract; this is the first time it has cost this campaign a live regression.
What caught it was a rendered screen and two measurements: the three resume tiles reported
`display: block` with tops 225/364/504 - stacked, not a row - and the roles label and its "AI
suggested" badge sat at different tops instead of sharing one. After the move: `display: grid`,
`192px 192px 192px`, one row; and the badge starting at 466 against a label ending at 458,
vertically centred.

**A measurement of mine was also wrong, and I checked before believing it.** The first same-row test
compared `top` edges, which differ by design under `align-items: center`. Comparing the boxes
directly is what actually answers the question.

**A scripted CSS split is not safe.** The block-splitter used to bucket 642 lines mis-attached any
rule preceded by a comment, which is how two rules ended up in neither file and one in the wrong one.
The recovery was to check every declared class against the markup, by hand, and then to render it.

Template **514 -> 291**, stylesheet **642 -> 391**, both under budget. The class is 573 and stays
over until the migration. **The screen's 1210 lines of existing tests all still pass** - 1462 before,
1476 after, the 14 new ones covering the two step components. That the old tests pass unchanged
against the new structure is the strongest evidence here that behaviour was preserved.

## Amendment forty-four: the wizard's state, and the two things a layer boundary decided

`onboarding` was the second-to-last entry in `COMPONENTS_STILL_USING_THE_GATEWAY`, and part one
(amendment forty-three) had already taken the template and the stylesheet under budget so the
migration would have room. This is that migration. **The allowlist is 2 -> 1; only `jobs` remains.**

Seven stores now sit in `libs/application/src/lib/onboarding/`: the five that part one had already
split out of the page, plus two the page had nowhere else to put.

**`OnboardingAiSetupStore`** owns the mode, the settings the AI step writes, and the dispatch every
other wizard store calls through. That dispatch carries the campaign's most expensive comment with
it: the step's choices only reach the settings row on `finish()`, so reading `aiMode`/`provider` back
from settings sent every in-wizard call to the pre-onboarding defaults, and a user who picked DeepSeek
or CLI mode got "Couldn't parse that resume" from a provider that had no key. It injects
`OnboardingAiKeyStore` and `OnboardingCliBridgeStore` rather than copying their signals
(amendment fourteen), and it must **never** inject `SettingsStore` - which would reintroduce exactly
that bug, and would no-op anyway, because `persist()` answers `false` until something calls `load()`
and the wizard is an overlay that never does.

**`OnboardingFinishStore`** owns the profile the wizard reads, must not destroy on a re-run, and
writes back, plus the CV document it hands to Documents. `saveCvDocument` answers
`saved | skipped | failed` instead of raising a toast: only `failed` is worth telling the user about,
and only the page has anything to say it with (amendment fifteen).

**Two decisions were made by the layer boundary, not by preference.** Neither was in the plan the
maintainer confirmed; both were forced by what `libs/application` may import, and both were absorbed
rather than escalated because the repository already had the seam for them.

1. **`libs/application` has zero `@tauri-apps` imports.** `openConsole`, `openVideo` and
   `openNodeSite` could not travel with the stores. The stores publish the address - `guide()
.consoleUrl`, `nodeDownloadUrl` - and the cards open it. This is the same shape as the stores
   publishing i18n keys rather than sentences: `providerSteps` became `{n, textKey}` and
   `selectedSetup` gained `nameKey` in place of `name`, because neither store may inject
   `TranslateService` either.
2. **`onboarding-content.util.ts` imported `buildCvContent` from `apps/desktop`.** Moving it whole was
   already confirmed; the import was not visible when it was. `buildOnboardingCvInput` now takes
   `buildContent` as an argument, which is `CvCodec` (amendment six) applied a second time in the same
   PR - `parseCvSkillResponse` was already going to be passed into `OnboardingResumeStore.parse` for
   the same reason.

**Two more things the gate decided.** The size gate caps **every** file under `libs/application` at
250, not only `*.store.ts` - so `onboarding-content.util.ts` arrived at 289 and had to split. The seam
is real rather than arithmetic: `onboarding-targeting.util.ts` holds the archetype and compensation
helpers that serve step 4, and the rest serves the resume, the profile and the CV document. And
`CLI_PROVIDERS` collided in the barrel with the one `settings/cli-bridge.ts` exports, so onboarding's
is now `ONBOARDING_CLI_PROVIDERS`. **The duplication itself was deliberately left alone**: the two
lists hold the same providers in different shapes, and reconciling them changes what the provider grid
renders, which is a behaviour change and not a rider on a migration.

**The template did not grow.** Rebinding it was a rename of identifiers, never of structure, so it
stayed at 291/300 - nine lines from failing the gate, which is why the rule was checked before
planning rather than after. `onboarding.component.ts` is **573 -> 312**.

**The counters reconcile exactly.** desktop 1476 -> 1417, application 993 -> 1068: the 59 that left
desktop arrived in application, and 16 of the new ones are genuinely new coverage for the two new
stores. Two groups of tests deliberately did **not** move down. The `buildOnboardingCvInput` block
asserts on `contentJson`, which only means anything against the real `buildCvContent` - passing a stub
from a library spec would have left every one of those assertions proving nothing, so they live in
`onboarding-cv-input.spec.ts` in `apps/desktop` instead, unchanged. And the five tests that call
`saveProfile()` assert through the wizard's harness on a `DbService` mock; they reach the store through
`fixture.debugElement.injector.get` like everything else the harness exposes, so their assertions moved
zero characters.

**The rendered check found nothing, and was still worth running.** Both AI cards translate their keys
(no raw `onboarding.ai.*` reaches the DOM), the CLI setup card renders in both its working and its
broken branch, the three resume tiles measure as one row by rectangle rather than by `top`, all four
Ready summaries read correctly, and the console is clean. The reachability scan over all four
onboarding stylesheets reports nothing stranded - no `.scss` was touched this time.

## Amendment forty-five: the jobs page, part one, and a feature with no way in

`jobs` is the last entry in `COMPONENTS_STILL_USING_THE_GATEWAY` and the one this ADR deferred three
times. All three of its files were over budget - class **1050/400**, template **686/300**, stylesheet
**493/400** - so the sequencing was forced before anything was decided: the template comes down first,
because the size gate refuses to let an over-budget file grow at all. **This amendment covers the
first extraction only. The allowlist does not move in it.**

Six components come out, one folder each, following `paste-job-modal/` and `quick-view-modal/`: the
cross-job confirm, the delete confirm, the tailor cover-letter modal, the photo prompt, the discard
confirm, and the detail action row. Each injects the service that already owns its state - the page
provides seventeen component-scoped, so a child rendered inside its template inherits the same
instance, which is what `job-document-cards` established here. **What a child cannot do, it asks for
with an output**: all five outputs either navigate, write page state, or run the document commit, and
the split is the same one `onboarding-resume-step`'s single `fileRequested` makes.

**Two rules would have been stranded, and both were caught before merge rather than on screen.**

1. **`.muted` is page-local, not global**, and the photo prompt's "no photo yet" line carries it
   alongside `.photo-prompt__text`. It travelled into the child - and **in its original source
   order**, because both are single-class selectors and the later one wins: that is what zeroes that
   line's bottom margin. Moving it above would have given the line a margin it has never had. The
   rendered check confirms `margin-bottom: 0px` and `rgb(154, 150, 140)`.
2. **The `.modal` shell** is now duplicated in the two modals that use it. That is not a new
   compromise: `.modal-backdrop` is already declared in **eight** component stylesheets across this
   app, because Angular scopes a stylesheet to its own template and every modal folder has always
   carried its own.

Every host is `display: contents`, so no new box enters the page's flow - the trap amendment sixteen
was written for, applied pre-emptively this time rather than after a rendered screen found it.

**The gate caught me, and the fix was the right one.** Six imports plus six `imports:` entries pushed
the class from 1050 to **1062**, and an already-over-budget file may not grow by a single line. The
offset was not cosmetic: eleven aliases and four handlers were genuinely orphaned by the extraction,
and deleting them took the class to **1036**. The rule this reinforces is that an extraction from an
over-budget class has to _shrink_ it, so the aliases it orphans are part of the work rather than a
tidy-up for later.

**A feature was found with no way into it.** `CoverLetterTailorService.prepare()` is the only thing
that sets `modalOpen`, and it is called only from `openTailorCoverLetterModal()` - which **nothing
calls**, in any template or class, anywhere in the app. The service is 200 lines and fully tested, the
modal exists and renders correctly when opened by hand, and no control opens it. It was extracted
as-is rather than deleted: removing a feature is a product decision, not an extraction's. Separately,
the modal's `.cvform` class is declared only in `cv-list.component.scss` and so has **never** reached
this markup, which is why those two fields carry twenty lines of inline `style=` instead. Both moved
verbatim, for the same reason.

**`quality:style-move` produced a false LOST.** It reported `.locked-hint` as having lost all four of
its declarations; the rule is byte-identical to base, still in the page's stylesheet, and still bound
at `jobs.component.html:16`. Removing the neighbouring `.alert` block is what confused it - the same
comment-attachment fragility that made the scripted CSS splitter unsafe in amendment forty-three. The
reachability scan and the rendered screen both read clean, and they are what the claim rests on.

Template **686 -> 387**, stylesheet **493 -> 289** (under budget), class **1050 -> 1036**. All 1417
existing tests pass **unchanged**, and 15 new ones cover the six components.

**Still to do before the migration:** the template is 387 against 300. Part two takes the scoring and
wizard region.

## Amendment forty-six: the jobs page, part two, and the setting neither side could own

Part one left the template at **387/300**, which is the whole reason part two exists before the state
migration: an over-budget file may not grow by a line, so every binding the migration wants to add is
blocked until the template is under 300. Two of the apply wizard's four steps were still inline
markup on the page - the updated-score step at 36 lines and the review-documents step at 146.
**The allowlist does not move in this amendment either.**

Three components come out rather than two, one folder each, following `job-tailor-step/` and
`job-export-apply-step/`. The documents step is 146 lines of four separate responsibilities - the
market and language selects, the document cards, the final-checks card, the gap dialog - and the
final-checks card is 90 of them, with its own 72 lines of stylesheet and three actions of its own. It
became `job-final-checks`, nested inside `job-documents-step`, which re-emits its three outputs. That
takes the documents step to eight outputs, the same shape `job-detail-actions` established with five
in part one.

**The wizard slot is one host element, and that is a layout fact rather than a preference.**
`.wizard-step-content` is `display: flex; flex-direction: column; gap`, and the gap lives _inside_
it. Three sibling elements each carrying `wizardDocumentsStep` would each become their own flex
column and the spacing _between_ them would come from the wizard body, which has none. So the class
stays on one host in the page template - and for the same reason neither step host may take
`display: contents`, which would delete the column outright. `job-final-checks` is a plain nested
child and does take it, so its `<section>` remains the flex item its rules were written for.

**A setting neither side could own.** `documentReviewRegion` and `documentReviewLanguage` are read by
six page methods - the two draft paths, the link path, `finalCheckInputs`, `scoreContext` and
`ngOnInit`, which seeds them from the application - and written by the two selects that were moving
out. Inputs plus outputs would have rebuilt the alias-and-handler pattern the last two sessions spent
their diffs deleting, and moving them wholesale into the child would have inverted six dependencies.
They live in `DocumentReviewTargetsService`, provided component-scoped by the page like the
seventeen before it, and the page and the step both inject it. It is 36 lines and it is the eighteenth
provider; it is also one more `shared/*` service that level two inherits.

**The service earns its keep by holding one rule that was written twice.** Changing either target
invalidates a stored final-checks result, and that rule lived in a page method for the region and
**inline in the template** for the language - `finalChecksOutdated.set(!!finalChecks())` spelled out
in an `(ngModelChange)` expression, where the next reader had to notice it twice to know it existed.
`setRegion`/`setLanguage` hold it once; the plain signals stay public because `ngOnInit` seeds the
targets on load and a freshly restored result is not stale.

**Two claims in the handoff were wrong, and looking settled both.** `.editor` was listed as documents-step
styling; it is bound at `jobs.component.html:7`, in the page header, and stays. And the estimate of
205 template lines assumed thin hosts - eight outputs and six inputs put it at 236, still comfortably
under 300.

**The reachability scan found a rule dead since part one's neighbour.** Widening its regex to match
indented selectors - the previous version anchored at column 0 - surfaced `.base-cv-picker` and
`.base-cv-picker__control` inside the page's `@media (max-width: 760px)` block. That markup moved into
`job-tailor-step` two sessions ago, so the page-scoped rule cannot reach it and the picker's mobile
grid has been inert since. It is **documented in place, not fixed**: restoring it changes the mobile
layout, which is not an extraction's call. The two rules in the same block that belonged to the
markup this amendment moved travelled with it, and both were confirmed collapsing at 700px on a
rendered screen.

**`quality:style-move` read clean this time** - 0 lost, 1 gained, the deliberate `display: contents`.
That is worth recording only because part one's LOST was a false positive: the tool is unreliable in
both directions, and the claim still rests on the per-class reachability scan and the rendered screen.

Template **387 -> 236**, stylesheet **289 -> 186**, class **1036 -> 998** - seventeen declarations
retired, every one of them an alias the template alone named. All 1432 existing tests pass unchanged;
15 new ones cover the three components and the staleness rule.

**Next:** the class is 998 against 400 and the page still injects `DbService` in eight places. That is
the state migration, and it is its own session with its own grilling round.

## Amendment forty-seven: the allowlist reaches zero

`COMPONENTS_STILL_USING_THE_GATEWAY` is `[]`. It started at **26**, only ever shrank, and `jobs` held
the last line. The rule stays and now binds every component without exception.

**What actually had to move was smaller than the page.** The rule bans `inject(DbService)` in a
`*.component.ts`; it says nothing about a 998-line class. Eight call sites across four methods -
`getProfile`+`getSettings`, `getJob`+`listApplications`+`documentLibraryList` twice,
`documentLibraryList` twice again, and one `upsertApplication` - are what stood between this page and
the empty list. Separating that from "migrate the whole screen" is what made a one-session job out of
what the previous three amendments had deferred as a two-or-three-part one.

**One store, and it stops at the data.** `JobDetailStore` (142 lines against 250) owns the job, its
description, the profile and settings, the application row and the document-library rows, with
`loadContext`, `loadJob`, `refreshLibrary` and `ensureApplication`. It does **not** own the load
sequence, and that is the boundary rather than a preference: the page's `loadJob` interleaved those
reads with the cached score, the review targets, the linked documents, the portal answers and the
tailoring restore - six `apps/desktop` services `libs/application` cannot import. So the store fetches
and answers whether the row existed; the page sequences the rest. The rejected alternative, passing
five callbacks in, would have put page orchestration behind an argument list and made the store's
tests depend on stubs for services it has no business knowing about.

**The page keeps aliases, and here they are load-bearing rather than habit.** `unsavedJobGuard` reads
`page.job()` and `page.application()` off the component instance, so those names have to resolve on
the class. They are the store's own signals, not views of them, for the same reason every other alias
on this page is.

**A bug fell out of the migration, which is the second time consolidating two writers has done that.**
`matchingCvs` had two meanings: `loadJob` narrowed it with `baseCvChoices`, and
`prepareDocumentsStep` set it to the raw `documentLibraryList('cv')`. Returning from the document
editor took the second path, so the base-CV picker and the choose-existing dropdown quietly filled
with every CV in the library, in every language. One writer now - `refreshLibrary` - and one meaning.
Confirmed on a rendered screen against a four-CV library: the picker lists the two written in the
job's language, on the load path and the refresh path alike.

**An ordering change, named rather than hidden.** The cached score used to be restored between the job
read and the application read; it now runs after all four. The two are independent, and the alternative
was the store importing the scoring service across a boundary it cannot cross.

**The store answers with an outcome, not a translated throw.** `ensureApplication` returns
`Application | null`; `libs/application` has no `TranslateService`, and debt six already records
`CoverLetterAiStore` throwing where its neighbours answer. **The null check landed in one place rather
than the four the decision anticipated**, because three of the four call sites hand the method to a
service as a `() => Promise<Application>` callback - honouring the letter would have changed three
service signatures for no gain, so the page's own wrapper is where null becomes
`jobs.not_found_label`.

**An empty allowlist is not the same as a deleted one, and getting that wrong would have inverted the
rule.** A flat-config entry with `files: []` does not mean "no files". Written inline, the emptied
list would have switched `no-restricted-syntax` **off everywhere** - a PR whose headline is "the rule
now binds every component" shipping the rule bound to none. The override is spread in conditionally,
and the rule was verified positively: `inject(DbService)` added to `job-meta-card` fails lint with the
ADR message, and the change was reverted.

**The rule is not deleted, deliberately.** `app.ts` injects the gateway and the rule cannot see it -
the glob matches `*.component.ts` and that file is not one, so the list undercounted by one throughout
its life. Deleting the rule now removes the only pressure on that file. It goes when `app.ts` is
migrated or the glob widens.

`baseCvChoices`, `documentReviewLanguageFor` and `inferDocumentRegion` moved to `libs/application`
with their specs, and `DocumentRegionTag` moved with them - it is the type `inferDocumentRegion`
returns, and leaving it behind would have made the function unmovable. Six importers updated directly
rather than through a re-export.

`jobs.component.ts` **998 -> 980**, still 2.45x its budget. That is stated rather than dressed up: the
wizard, tailoring and scoring orchestration are still on the page, and they are a separate migration
whose blocker is now the `shared/*` services rather than the gateway. `application` 1068 -> 1092,
`desktop` 1447 -> 1435 (the twelve helper tests moved with their helpers).

**Level one is closed.** Level two starts at `app.ts`.

## Amendment forty-eight: the file the rule could not see

`app.ts` held the last `inject(DbService)` in a component anywhere in the app, and the rule never
fired on it. The pattern is `**/*.component.ts`; this file is not named like one. **That is what made
the allowlist read 26 when 27 files were injecting the gateway** - for the entire campaign, the number
this ADR reported progress against was wrong by one, and nothing in the toolchain could have said so.

**Widening the glob was never a whole answer, and noticing that collapsed the decision.** The item on
this checklist read "decide whether the rule's glob widens or `app.ts` is migrated on its own", as
though they were alternatives. They are not: the moment the rule sees the file it errors, and the
allowlist only shrinks. So `app.ts` had to be migrated regardless. The glob question was only ever
whether the rule can _prove_ it stays migrated.

**The read and the write were in different layers, over the same two flags.** `FirstLaunchStore` has
owned the write of `healthCheckSeen` and `onboardingSeen` since amendment thirty-five; `app.ts` read
them at boot to decide which of three screens to open. It is `BootGateStore` now, and `load()` answers
`'first-launch' | 'onboarding' | 'app'`, taking the `shouldAutoOpenOnboarding` call with it. One
store, both directions, and the boot rule is testable without a `TestBed` for the first time.

**`load()` fails open, and that is now a test rather than a comment.** A settings read that throws
answers `'app'`. Blocking startup on a health-flag read would trap the user outside an application
whose data is otherwise fine, and the flags are the least important thing the app knows. The old
`catch {}` said so in a comment; four tests say so now, one per branch.

**The component keeps `onboarding.requestOpen()`.** The open signal is also written by the dashboard
banner and by Settings, so `OnboardingService` owns it and the root component routes into it rather
than holding a fourth copy.

**The store is provided in two places and that is deliberate**, not an oversight to be found later:
the root component and the welcome screen each provide it, so there are two instances. Its one signal
is read only by the screen that owns the write, and giving a stateless store a singleton lifetime
would assert something about it that is not true.

**The pattern is now `['**/*.component.ts', '**/app.ts']`, and the comment says what it is worth.**
It is a **convention check, not a proof**. Another component named off convention slips through the
same hole this file did, and the honest fix for that is the naming convention rather than a longer
glob. Renaming `app.ts` to `app.component.ts` was the alternative and was rejected: it renames the
bootstrap entry point for a lint reason.

**The rule's message was lying by the time it fired.** It told the reader to remove the file's entry
from `COMPONENTS_STILL_USING_THE_GATEWAY` - a list that is empty and that the ratchet forbids adding
to. It now says there is no allowlist and the read or write belongs in a store.

Verified positively, as in amendment forty-seven: `inject(DbService)` re-added to `app.ts` fails lint
with the ADR message, then reverted. Verified on a rendered screen against a stubbed IPC layer: both
flags unseen renders the welcome screen, welcome-seen-only renders onboarding, both seen renders the
shell, and a settings read that throws renders the shell. The boot path issues exactly two IPC calls.

`app.ts` 68 -> 66, `BootGateStore` 41 -> 74/250. `app.spec.ts` was a create-smoke-test; routing the
gate's answer is the component's only remaining logic, and it has four tests now.

**Level two, item one is closed. The rule can now be deleted whenever the maintainer decides it has
served its purpose** - nothing is hiding from it. Item three, the 18 services that legitimately inject
the gateway, is next and is the larger half.

## Amendment forty-nine: what level two item three actually is, and the wall in front of it

The checklist said "move the app's `shared/*` services into `libs/application`, decomposing the five
over 250 lines". Mapping it first changed three things about that sentence.

**It is not 18 services. `shared/` is 34 files and 3886 lines**, and it is not homogeneous: it holds
four **components** (`paste-job-modal`, `job-identity-prompt`, `job-identity-badge`,
`unsaved-job-prompt`) and `page-title.service`, which overrides the topbar title. None of those may
go to `libs/application` at all. The item is therefore restated as **sorting** rather than moving -
pure logic and gateway access to the library, UI to a component folder in the app. The old wording
named a destination for files that must not go there, and this ADR has now been misled by its own
checklist twice: item one framed `app.ts`'s glob and its migration as alternatives when they were
not.

**Seventeen services inject the gateway, 2929 lines, and they divide by what blocks them:**

| blocked by        | count    | note                                                                 |
| ----------------- | -------- | -------------------------------------------------------------------- |
| `cv-content.util` | 6        | pure logic sitting in `pages/documents/`                             |
| `toast.service`   | 4        | a UI concern that cannot cross; needs the outcome pattern (debt six) |
| nothing           | 22 files | largest `job-scoring` at 300                                         |

**The highest-leverage move in the whole item is not a service.** `cv-content.util.ts` (596) plus
`cv-style.util.ts` (336), `cv-parse.util.ts` (237) and `cv-entry.util.ts` (118) are **1287 lines that
import only `@applye/core`** - pure, no Angular, no I/O - and they are in `apps/desktop`. Moving them
to `libs/core` unblocks six of the seventeen services in one step.

**And they have already been paid for once.** Nine files in `libs/application` carry documented
workarounds for their absence, taking functions as arguments with comments that say _"it lives in
`apps/desktop`, which this layer may not import, so they are passed in"_: `cv-codec.ts`,
`cv-style.store.ts`, `cv-print.store.ts`, `cv-regeneration.store.ts`, `cover-letter-generate.store.ts`,
`cover-letter-ai.store.ts`, `onboarding-resume.store.ts`, `onboarding-content.util.ts` and
`tracker-report.ts`. That is the accumulated interest on one misplaced file, and it is only visible
once you count it.

**The size gate refuses the move, and that is the third thing the map found.**
`tools/check-file-size-budgets.mjs` passes `--no-renames` to every git diff and resolves a file's
baseline by its **new** path, so a moved file reads as _added_ - and line 398 makes any new file over
budget a hard violation rather than a notice. `cv-content.util.ts` is 596 against 400, so the
imports-only move would have been refused on arrival. **The gate constrains the order of the work
again**, exactly as it did for the jobs template, and the answer is the same shape: split first, move
second, one kind of change per pull request.

**This amendment covers the split only. Nothing moved and no import outside the folder changed.** Two
groups came out, and both had to, because taking only the first leaves 466:

- **`cv-selection.util.ts`** (155) - the identity of a click target in the live preview:
  `CvPreviewSelection`, `CvStyleScope`, `CvStylePanelChange`, `leafPath`, and its inverse
  `cvLeafText`. One string is both the inline-edit draft key and the `elementStyles` override key,
  which is what keeps "which leaf is this" answered in one place.
- **`cv-page.util.ts`** (116) - the two things about the page rather than the content:
  `buildContactLine` with its contact-field leaves, and `resolvePageSettings` with the margin
  normalisation behind it.

`cvLeafText` calls `buildContactLine`, so selection imports page: one directed edge, no cycle.
`cv-content.util.ts` is **596 -> 352** and keeps the barrel, so all 43 consumers are untouched.

**The spec split with the code, and the test count is what made the cut safe.** Every sibling util
already has its own spec. Splitting by `describe` block moved `function parsed()` to the wrong file
and then, fixing that, truncated `resolvePageSettings` and its five tests off the end of the page
spec. Nothing failed - the suite went green with 1434 tests instead of 1439. **Only the reconciliation
caught it**: 30 `it` blocks before, 30 after. A green suite is not evidence that a split preserved
its tests; the count is.

Verified on a rendered CV: the contact line renders in reference order with its `|` separator, all
six sections render with grouped skills, the live style panel mounts, `leafPath` returns `summary`,
`pd.fullName`, `exp.0.bullet.0` and `skills.0.values`, and selecting `exp.0.bullet.0` puts "Rebuilt
the design system" in the panel's sample - `cvLeafText` resolving across the new file boundary.

**Next:** move the six files to `libs/core`, which is now genuinely imports-only. Then retire the nine
pass-in workarounds, in their own pull request, because that changes nine store signatures and would
otherwise hide inside 43 mechanical import edits.

## Amendment fifty: the cv-content family crosses the boundary

Sub-step two, and the payoff for the split in amendment forty-nine. 1287 pure lines leave
`apps/desktop/src/app/pages/documents/` for `libs/core/src/lib/cv/`, with their specs. **Six of the
seventeen gateway-injecting services are now unblocked, and the pass-in workarounds in
`libs/application` are now removable** - in their own pull request, as decided.

**Correction, made in amendment fifty-one: this amendment said "nine" workarounds, and nine is
wrong in both directions.** The number came from grepping for the explanatory comment, which finds
eight files, and one of those eight - `tracker-report.ts` - is a false positive whose comment is
about why it lives here rather than in `libs/core`. Counting the files that actually take a
parameter gives **eleven**: the comment-grep misses `cv-import.store.ts`, `cv-generate.store.ts`,
`cv-document.store.ts` and `onboarding-finish.store.ts`, which consume the same interfaces without
repeating the explanation. A twelfth file, `cv-style.store.ts`, carries the stale sentence and no
parameter at all.

**Seven files, not six.** `cv-style-scope.util.ts` was not in the plan. It is imported by
`libs/application/src/lib/documents/cv-style.store.ts`, one of the files carrying a documented
workaround for this family being unreachable - so it was always part of the same wall, and counting
the workarounds is what found it.

**Inside `libs/core` these files cannot import `@applye/core`, and that is not a style rule.**
`cv-parse.util` imports `splitDisplayName`, a **value**; a self-referential path alias would resolve
back through `libs/core/src/index.ts` and be a real module cycle rather than an erased type import.
No existing file in `libs/core` imports the alias. Every symbol the seven use resolves to exactly two
files - `models/document.model.ts` and `profile/split-display-name.ts` - so the rewrite was two
relative paths.

**The barrel inside `cv-content.util` is gone, and removing it was the honest end state rather than
extra churn.** It re-exported four siblings because splitting a module used to cost each consumer an
import line and several consumers were over budget - the reasoning recorded in its own comment.
`@applye/core` is the single specifier now, so it is one import either way and the justification had
expired. Removing it surfaced the files leaning on it: `cv-style-scope.util` and five sibling specs
were importing symbols from `cv-content.util` that never lived there. Each now imports the module
that owns what it uses, which is what they should always have done.

**The size gate caught this "imports-only" change growing an over-budget file, which is the third time
it has constrained this campaign.** Merging the two `@applye/core` imports in
`cv-live-style-panel.component.ts` costs two lines, and that file is **704/400**. The type imports
therefore stay as two statements from the same module. A comment in the file explaining why would
itself have cost the three lines the gate refuses - so the reason is here instead, which is exactly
the kind of thing that goes dead when nobody writes it down.

Two casts needed `as unknown as Record<...>` under `libs/core`'s spec tsconfig, having been
`as Record<...>` under the app's - a strictness difference between the two projects that only a move
reveals.

**The counters reconcile exactly, and that is the check that matters for a move.** `core` 18 suites /
301 tests -> **25 / 453**; `desktop` 134 / 1439 -> **127 / 1287**. Same seven suites, same 152 tests,
opposite signs. Amendment forty-nine's near miss is why this is stated rather than assumed.

Verified on a rendered CV, because the barrel disappears in this step and a missing export would only
show on screen: the contact line renders in reference order, all six sections render, `leafPath`
returns `summary`, `exp.0.bullet.0` and `skills.0.values`, `cvLeafText` puts "Rebuilt the design
system" into the style panel's sample, and a `scope: 'element'` change routed through
`cv-style-scope.util` in `libs/core` and `cv-style.store` in `libs/application` moves that one leaf
from Calibri 400 to Georgia 700 and nothing else. No console errors.

**Next:** retire the pass-in workarounds, then the 22 unblocked files, then the four
`toast.service` couplings.

**Correction, made in amendment fifty-two: "22 unblocked files" is wrong here and everywhere it was
repeated. It is fifteen.** The figure counted direct blockers only, so every transitively blocked file
sat on the wrong side of it, and it came from a table that says "seventeen services" and then lists
6 + 4 + 22.

## Amendment fifty-one: the pass-in seam goes, and takes two fictional tests with it

Sub-step three. Eleven files in `libs/application` took a codec object or a callback whose
documented reason was that the pure function "lives in `apps/desktop`, which this layer may not
import". Amendment fifty made that false for the CV family. The parameters and the comments go
together.

**The seam was wider than its own documentation.** Grepping for the explanation finds eight files;
four more consume the same interfaces without repeating it. That is how a number written from a grep
became canon and then had to be corrected twice - see the correction in amendment fifty. The rule it
suggests: count the type's consumers, not the comment's occurrences.

**The cover-letter parse had to be written before it could be moved.** `CoverLetterCodec.parse` was
not a function anywhere - it was an inline lambda in `cover-letter-detail.component.ts`,
`JSON.parse(cleanJsonText(text))`. It became `parseCoverLetterResponse` in `libs/core` in its own PR
(#419), because a new public export in the bottom layer should not arrive buried in a mechanical
parameter sweep. Writing it surfaced a defect the cast had been hiding: an answer that parsed into a
**array** or a bare scalar satisfied `JSON.parse` and the `as Partial<CoverLetterContent>` cast, and
reached the editor as a letter with no fields - indistinguishable on screen from a model that had
nothing to say, when `CoverLetterGenerateStore` already had a `bad-json` outcome built for exactly
this and could not reach it because the parse never threw.

**CodeQL then found a second defect, and it was the new export that exposed it.**
`js/polynomial-redos`, high severity, against `cleanJsonText` - already open on `main`, but a third
exported caller made it new-in-PR, which is the correct call rather than noise. `/\s*```\s*$/i` puts
an unbounded `\s*` in front of a literal the engine still has to find, so whitespace is rescanned
from every start position: quadratic in the length of a whole model reply, which is both
attacker-influenced (a posting's text reaches the prompt) and routinely thousands of characters.
`endsWith` plus `trimEnd` does it in one pass.

**Removing a test seam is the interesting part, not removing a parameter.** The codec was also the
injection point four spec files used, and running the real functions showed that four expectations
had been describing behaviour the application never had:

- `cv-document` and `cv-print` each had a test whose entire subject was "the normalizer was called".
  Both now assert what `normalizeCvContent` actually contributes - a legacy `items[]` skills section
  migrated into a group, the repair that keeps a pre-groups CV from rendering empty and being saved
  back emptied. The count holds because they were replaced, not deleted.
- The identity stubs those specs passed were also hiding the `personal_details` section
  `normalizeCvContent` inserts at order 0. Three expectations described a load path that existed
  only inside the tests; every real load has always run the normalizer.
- `cv-regeneration`'s fake `mergeSection` **appended** a section. The real one rewrites in place.
  The test asserted the fake's behaviour and would have passed against a merge that appended
  forever.

That is the argument for the removal, and it was the maintainer's call rather than this session's:
a mock that agrees with the test by construction proves the test, not the code.

**`cv-style.store` keeps its shape and gets an honest comment.** Its `CvStyle` transforms are in
`libs/core` now, so the "may not depend on the app" clause is false - but the design it justified
still holds for a different reason: the panel and the cover-letter editor compose styles without
going through this store at all. Folding composition in rewrites two files already over budget, so
it is deliberately not this change. The comment now says the true reason and records that the old
one expired.

**Verified on a rendered screen**, which remains the only instrument that has caught anything in
this campaign: the CV editor loads through `CvDocumentStore.load(id)` with no normalizer argument, a
legacy `items[]` skills section renders as a group (so the normalizer ran), the preview renders,
selecting the name and setting Semibold moves it 700 -> 600 through `routeCvStyleChange` in
`libs/core` and `applyStyle` in `libs/application`, and `/print/cv/1` renders the same migrated
document through `CvPrintStore.load(id)`. No console errors.

**The desktop suite's flakiness was measured rather than assumed.** Three specs
(`cover-letter-print`, `profile`, `cv-detail`, plus `discover` once) time out under `nx run-many`
CPU contention and pass in isolation. It reproduces on `main` at the same base commit - 1 of 3 full
runs failed there, 3 of 3 on the branch - so it is debt twelve resurfacing, not this change. Debt
twelve is no longer "not reproducing".

**Next:** the unblocked files, then the four `toast.service` couplings.

## Amendment fifty-two: the unblocked files are fifteen, not twenty-two, and the count was never counted

Substep four was written as "move the 22 unblocked files". **That number was wrong, and the table it
came from disproves itself on its own line.** Amendment forty-nine says "seventeen services inject the
gateway", then lists them as 6 behind `cv-content.util`, 4 behind `toast.service`, and 22 behind
nothing. Six plus four plus twenty-two is thirty-two. The row was never a count of anything; it was an
estimate written beside a real one and never reconciled.

**This is the third count this substep has corrected, and the third was found the same way as the
first two.** Amendment fifty corrected "nine" workarounds to eleven; that one had been produced by
grepping for a comment rather than counting the consumers of a type. The fix here is the same fix:
every one of the 26 non-spec files in `shared/` was **read**, and classified on its actual import list
plus the transitive closure over its local imports. The transitive half is what the old table omitted
entirely - it counted direct blockers only, which is why `job-scoring` appears in its "blocked by
nothing" row while in fact it reaches `DOCUMENT` through `final-checks`.

**The measured state of `apps/desktop/src/app/shared/`: 26 non-spec files, 3649 lines, 15 movable and
11 blocked.**

| blocked by                                 | count | files                                                                                           |
| ------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------- |
| `ToastService`                             | 4     | `cover-letter-tailor` 327, `portal-answers` 251, `job-actions` 157, `document-review-status` 89 |
| transitively, via `document-review-status` | 1     | `tailoring-discard` 87                                                                          |
| `@tauri-apps/plugin-dialog`                | 1     | `document-export` 116                                                                           |
| `inject(DOCUMENT)`, storage only           | 2     | `final-checks` 185, `wizard-progress` 57                                                        |
| `inject(DOCUMENT)`, real layout            | 1     | `wizard-nav` 162 - `querySelector`, `scrollingElement`                                          |
| transitively, via `final-checks`           | 2     | `job-scoring` 319, `document-review-targets` 42                                                 |

**Two files the canon called blocked were not.** `job-identity-resolver` was recorded as blocked by a
component in `shared/job-identity-prompt/`. What it imports from that folder is the _service_ - 94
non-empty lines of signals and one promise, with no component, no DOM and no toast. It only lived
beside two components. `job-intake`, blocked transitively behind it, unblocked with it. The prompt
service moved as well, because it had to: the resolver imports it and a library cannot import the app.
Its two components stayed in `apps/desktop` and import it downward.

**The budget is 250 for the whole library, not 400, and not only for stores.**
`check-file-size-budgets.mjs` matches `/^libs\/application\/.*\.[cm]?ts$/` under its
`Application-layer store` entry, so every non-spec file in `libs/application` carries the tighter
number. Combined with `--no-renames` - which makes a moved file read as added, and any new file over
budget a hard violation - this constrained the order again, exactly as it did for `cv-content.util.ts`
in amendment forty-nine. `tailoring.service.ts` at 305 had to be split **before** it could move, into
a pure `tailoring-pass.ts` carrying the types, `parseJsonArray`, `buildPassResult`, `resultMdForPass`,
`baselineFor` and `parsePassResult`, leaving the service at 226. `job-identity-resolver` landed at 245
and is recorded here as having three lines of margin rather than being quietly accepted.

**One collision, and it is the finding worth keeping.** `coverLetterHashInput` already existed in
`libs/application`, in `cover-letter-generation.ts`, as the editor's per-block cache keyed on section,
tone, length and the availability answers. The moved one keys the single letter an application owns,
on the job and the profile. Two hashes answering different questions cannot share a name in one
barrel - and a second copy of a hash formula is precisely how a regenerate silently stops firing, which
the source comment already warned about. The moved function is now `coverLetterDraftHashInput`,
symmetrical with the `cvDraftHashInput` beside it, and says why in its own comment. The asymmetry was
always there; only the move made it visible.

Shipped as three pull requests, because the size gate forces split-before-move and the two families
have **zero import edges between them** - verified, which is what made #422 and #423 independent:
#421 split `tailoring.service`, #422 moved the ten document-generation modules to
`libs/application/src/lib/documents/`, #423 moved the seven jobs and wizard modules to
`libs/application/src/lib/jobs/`. Filenames were kept so every diff is a rename git can follow. This
introduces the layer's first `*.service.ts` files, accepted deliberately: renaming and moving at once
would have made git see a delete and an add, and the size gate read every one as new.

**Test counts were reconciled on every step, because a move that amputates the tail of a spec file
leaves the suite green** - the trap amendment forty-nine hit. Across the three PRs the desktop and
application totals never changed: 2383 before #421, then 2399 once #421 added its 16 new tests, and
2399 after both moves, with 102 tests crossing in #422 and 78 in #423.

**The rendered check found something the gates did not, again.** Generating a CV draft in the wizard's
Review Documents step writes and links the row correctly, and the card keeps rendering `Missing`.
Measured in the live component rather than inferred: `linkedDocs.cv()` holds the new document and
`cvReviewStatus()` computes `'linked'`, while the DOM badge is `badge--doc-missing`. The signal and
the computed are both right; the view never re-rendered. **It reproduces identically on `main` at
17e6bbf**, so it is not this work, and it was left alone because substep four is a pure relocation.
It is filed with its reproduction and its evidence.

**Substep 4b is new, and it exists because of a ruling this ADR already made.** `final-checks` and
`wizard-progress` reach `DOCUMENT` only for `sessionStorage`, and amendment thirty-three already
settled that browser storage is **not** one of this layer's DOM exclusions: `sidebarCollapsed` moved
into `shell.store.ts` as `globalThis.localStorage?.`, and a storage token was considered and refused
as "a new symbol in the layer's public API to abstract one boolean". The same rewrite would unblock
those two and, behind them, `document-review-targets` and `job-scoring`. It is deliberately **not**
folded into substep four: rewriting a DI seam is a behaviour-touching change rather than a move, and
it drags `job-scoring` at 319 in, which needs its own split first. `wizard-nav` stays blocked
permanently - `querySelector` and `scrollingElement` are view, and this layer does not own view.

**Next:** substep 4b, the `sessionStorage` seam and the four files behind it; then substep five, the
four `toast.service` couplings, which need the outcome pattern rather than a move.

## Amendment fifty-three: the storage seam was never a DOM dependency, and four more files follow it

Sub-step 4b, shipped as #424, #425 and #426. It closes what amendment fifty-two deliberately deferred,
and it needed no new decision - only the application of one this ADR made twenty amendments ago.

**`final-checks` and `wizard-progress` injected `DOCUMENT` for exactly one expression each:**
`document.defaultView?.sessionStorage`. That single injection is what had kept them, and the two files
behind them, in `apps/desktop`. Amendment thirty-three had already settled the question when
`sidebarCollapsed` moved into `shell.store.ts`: browser storage is **not** one of this layer's DOM
exclusions - it is screen state that happens to outlive the session - and a storage token was
considered and refused as "a new symbol in the layer's public API to abstract one boolean". Both files
now read `globalThis.sessionStorage?.`, the same form, and both say why in place so the next reader
does not re-litigate it.

**The optional chain is load-bearing in one of them.** `WizardProgressService` is a root singleton
whose signal is initialised from storage at construction, so a non-browser environment must fall
through to "no progress" rather than throw during bootstrap.

**The fake that came out was honest, and that is worth recording, because the last one was not.**
`final-checks.service.spec.ts` provided a stub `DOCUMENT` whose `sessionStorage` implemented `getItem`
and `setItem` and nothing else - exactly as much of `Storage` as the service happened to call, so it
could confirm the calls made but never that they add up to a round trip. All 19 tests pass unchanged
against jsdom's real `sessionStorage`. Unlike the mocks amendment fifty-one removed, this one was not
describing an application that never existed; it was replaced because a real `Storage` is better
evidence, not because it lied. **A fake is not automatically a defect**, and this campaign should not
start reading it as one.

**`job-scoring` needed the same split-before-move as `tailoring`**, for the same reason: 300 non-empty
lines against 250. `job-score-payload.ts` took the types, `parseScoreResponse` and three payload
builders, leaving the service at 242, and it landed at 243.

The split exposed real duplication rather than merely relocating lines. **Scoring wrote the same
fourteen fields three times** - from a fresh parse, into the in-memory post-tailor result, and back out
of it on commit - each with its own `JSON.stringify` and its own `?? []`. They are now
`scoreCacheSaveInput`, `tailoredScoringCache` and `postTailorSaveInput`, and **the asymmetry between
them is deliberate and now documented**: the two fed by a fresh parse default only `before_you_submit`,
the one field the skill may omit, while the commit path defaults every column, because by then the row
has been through an in-memory hop and a save that threw on one absent column would lose a score the
user has already been shown. `runSkill` also now parses and returns a `ScoreRunResult`, so a non-JSON
reply fails in one place and both paths carry the model that produced them - the post-tailor result
used to re-read `settings.economyModel` to recover a value the call already had.

**The rendered check was run three times and compared against `main`**, because a storage seam is
precisely the thing jsdom can agree with while a browser does not. All three runs produce byte-identical
results: `applye:wizardProgress` written as `{"jobId":1,"step":0}` and updated through step 3, and the
computed result parked under `applye:wizardFinalChecks:h599` with the same `inputHash`, statuses and
notes on the pre-move branch, the post-move branch and `main`.

**`shared/` is now seven non-spec files and four component folders**, and every one of the seven is
genuinely blocked: `cover-letter-tailor`, `document-review-status`, `job-actions` and `portal-answers`
on `ToastService`, with `tailoring-discard` transitively behind them - that is sub-step five;
`document-export` on `@tauri-apps/plugin-dialog`; and `wizard-nav` on real layout DOM. **`wizard-nav`
never moves**, and that is a conclusion rather than a deferral: `querySelector` and `scrollingElement`
are view, and this layer does not own view.

**Next:** sub-step five - the four `toast.service` couplings, which need an outcome rather than a
relocation, and which will also decide what happens to `CoverLetterTailorService`, whose feature has
been unreachable since `openTailorCoverLetterModal()` lost its last caller.

## Amendment fifty-four: the toast wall was a store in the wrong folder, and `shared/` empties

Sub-step five, shipped as #427, #428, #429, #430 and #431. It closes level two item three. Four of the
five sentences the previous amendment wrote about this step were wrong, and each was wrong in the same
way: **the blockers were named by grepping imports, and never opened.**

**`ToastService` was not a wall. It was a signal store filed next to its component.** 91 lines, and its
only dependencies are Angular signals and `TranslateService`. So the plan - services return an outcome
or a translation key, and components turn it into a sentence (the amendment forty-four shape, and debt
six) - was solving a problem that did not exist. The store moved to `libs/application/src/lib/shell/`;
`toast.component`, `toast-container.component` and `toast-error.handler` stayed in the app, because
that half is UI. **Fifty import sites, every one a one-for-one path rewrite, so no file in `apps/`
changed its line count.** The outcome pattern remains the right answer where a store must _decide_
what to say; it was never required merely to _say_ it.

**`TranslateService` was never a blocker at all.** `libs/i18n` is tagged `type:util`, which
`type:application` may depend on, and twelve files in `libs/application` already imported it before
this sub-step began. The handoff listed it as blocking five files. It blocked none, and
`document-export` was listed as blocked by it alone.

**A store may name `@tauri-apps`, and this is the ruling.** `document-export.service` calls
`await import('@tauri-apps/plugin-dialog')` for the native save dialog - a dynamic import, which is
why an import grep missed it twice. It is ratified rather than reverted: the save dialog is I/O, and
this layer has always depended on Tauri through `DbService` and `AiService`, which are themselves
`invoke` wrappers. `@nx/enforce-module-boundaries` constrains workspace libraries, not npm packages,
so nothing was bypassed. **The same answer covers `followup-draft.service`** when it moves.

**`wizard-nav` moves after all, and amendment fifty-three's "never" was too strong.** The reasoning
was right - `querySelector` and `scrollingElement` are view, and this layer does not own view - but it
concluded that the _file_ could not move, when only the _method_ could not. `scrollToTop()` also had
four call sites, not the two a first reading found: `goTo()` and `close()` scroll internally. The
store now counts scroll requests in a `scrollTick` signal and the page performs them through
`scrollOnTick()` in `apps/desktop/src/app/core/scroll-to-top.ts`. **This is the general shape for a
store that needs something done to the DOM: publish the request, let the page satisfy it** - and it
cost the store three lines. `scrollOnTick` reads the starting count outside the effect, so mounting a
page does not scroll it.

**`cover-letter-tailor` was cut where it was already divided.** 305 non-empty lines against the 250
budget, and the size gate reads a moved file as added, so carrying it whole was never possible.
`BaseLetter`, `emptyBaseLetter`, `readBaseLetter` and `buildTailoredContent` are pure and total, and
went to `libs/core`; the modal state, the AI pass and the two writes stayed together at **206/250** in
`libs/application`. The feature is still unreachable - `openTailorCoverLetterModal()` still has no
caller - and that stays a product decision, deliberately not made by a refactor.

**`jobs.component.ts` went 980 -> 979 while gaining an effect.** It imported `@applye/application`
through **seventeen separate statements**; six of the short ones merged into three, which paid for the
scroll effect and its import with a line to spare. Amendment fifty recorded the opposite case, where
merging two imports _cost_ two lines because Prettier wrapped the result - the difference is only
whether the merged line clears 100 characters, and it is worth checking rather than assuming either
way.

**Counts, reconciled in both directions against a `main` baseline taken in a separate worktree**, because
a suite can go green while losing tests (amendment fifty-one): 258 suites / 3028 tests before, 260 /
3033 after. The five new tests are `scroll-to-top`'s own; the extra suite is the tailor spec becoming
two. Every move was checked as a pair - what left `desktop` arrived in `application` or `core`, test
for test.

**One flake, reproduced and not introduced.** `cv-detail.component.spec.ts` failed once at 48.9s under
seven-project parallel load, then passed three times in isolation at 1.7s. That is debt twelve, which
had not been seen in fourteen pull requests.

**Rendered check, since no gate can see a toast that stopped appearing.** Four of the five PRs were
checked on a real screen: an unhandled error rendering a `toast--error` through the moved store; one
scroll per tick on the real `.content` element and none on mount; `DocumentReviewStatusService.fail()`
setting the status line _and_ raising a toast; **Save this job** clicked as a user, producing the
translated "Saved to your jobs."; and the tailor modal rendering off the split service.

`apps/desktop/src/app/shared/` now holds `job-identity-prompt/`, `page-title/`, `paste-job-modal/` and
`unsaved-job-prompt/` - four component folders, which are UI and stay.

**Next:** `type:data` can now leave `type:app`'s allowlist, and the two services that were kept out of
this sub-step deliberately - `cv-photo-prompt` (which injects `Router`) and `followup-draft` (settled
above) - are what stands between it and a clean run.

## Amendment fifty-five: the allowlist flip, and the twenty-five files nobody had counted

Shipped as #432 and #433. It closes the item amendment four opened: `type:data` is out of
`type:app`'s `onlyDependOnLibsWithTags`, and the architecture the ADR describes is now the
architecture lint enforces, in both halves.

**The checklist said two files were in the way. Flipping the tag and running lint said thirty-two.**
Twenty-five of them are spec files, and the previous amendment's "blocked only by `cv-photo-prompt`
and `followup-draft`" was written from an import grep of production code, which is the same mistake
this campaign has now made four times: **a blocker list assembled by reading imports is a hypothesis,
and the way to test it is to make the change and read the errors.** Flipping the constraint locally
takes a minute and answers exactly.

The seven production files divided into four kinds, and only two were the expected kind:

- **`cv-photo-prompt` and `followup-draft`** injected `DbService` - the two that were known. Both
  moved. `cv-photo-prompt` injects `Router`, which is new for this layer and deliberate: it is
  navigation **state** rather than view, because the service decides which document to open and where
  to return, so a render-only component would have to duplicate that decision to perform it.
- **`AiService` in three files.** `GATEWAY_INJECTION` names `DbService` and nothing else, so
  `profile-raw-editor`, `onboarding.harness` and `jobs.component` were never in its sight. **There
  are two gateways and the rule only ever guarded one.**
- **`JobSourceService` in `paste-job-modal`** - a third data service, same blind spot.
- **A type-only import.** `settings-cli-status` imported `type { CliStatus }`, which has no runtime
  dependency at all and which the boundary rule still counts. `CliStatus` moved to `libs/core` next
  to `AiProvider`, which it already referenced; it describes a CLI binary's state rather than a
  gateway concern.

**`jobs.component.ts` injected `AiService` and never called it**, exactly as `paste-job-modal` did in
amendment twenty-five. 979 -> 977. Two of this campaign's finds are now dead injections, which is
worth stating as a pattern: an injection outlives the code that needed it, and nothing fails.

**Tests are exempt, and only from this one constraint.** A spec provides fakes for the collaborators
of the unit under test - an app component's store reaches the gateway, so its spec has to name
`DbService` to stub it. That is wiring, not a dependency direction. The alternative, rewriting 25
specs to fake a store's own collaborator graph, tests less while changing more. `*.harness.ts` is
covered too, because `onboarding.harness.ts` imports `TestBed` and is a spec in everything but its
filename. **The hole this leaves is a production file named `*.spec.ts`**, which nothing else
prevents either; it is written into the config rather than left for a reader to notice.

**Verified in both directions, because a rule that cannot fail is worse than no rule** (amendment
four's own standard): a temporary `boundary-probe.ts` importing `DbService` errors under
`nx run desktop:lint`, and all 25 specs pass. The probe was deleted in the same command that created
it and never reached a commit.

**Two stores came out of components, and both drew the line at the same place: state and I/O move,
the shell stays.** `ProfileImportStore` took the `profile-import` parse - four signals, two AI calls,
the tolerant JSON extraction - while `fullMd` stayed on the page, because the save path and the dirty
check read it too, so it arrives as an argument. `PasteJobStore` took the Paste Job modal's ten
signals and both ways it makes a job, and `submitLink`/`submitText` **return the new job's id and
nothing else**: closing the modal and navigating stay in the component, because the modal is a single
shared instance the shell owns. `paste-job-modal.component.ts` went **245 -> 128**.

**The clipboard read stayed in the app on purpose.** `readText()` runs behind a guard that only fires
while the modal is open - a privacy control added deliberately, and moving it would have moved the
guard away from the `@HostListener` that makes it meaningful. The store is handed the text and only
judges it, which is also what made the heuristic testable: `looksLikeJobDescription` had no tests at
all before this, and has five now.

**A privacy guard failed loudly, which is the outcome to want.** `followup-no-transmit.spec.ts` scans
the follow-up sources for send/transmit APIs by **file path**, so moving the service made the path
stale - and it threw `ENOENT` rather than passing vacuously over a file that was no longer there.
Its path now points into `libs/application`.

**Counts.** 260 suites / 3033 tests before, **262 / 3043** after. The ten new tests are coverage that
did not exist: five for the clipboard heuristic, and the rest from splitting assertions that had been
bundled. Every move was reconciled as a pair.

## Amendment fifty-six: the gateway rule keeps its job by changing what the job is

Shipped as #434. It answers the question amendment forty-eight deferred - "the rule can be deleted
whenever it is judged to have served its purpose" - and the answer is **no, but not as it was**.

**It named `DbService` alone, and that is how four files hid.** Three components injected `AiService`
and one `JobSourceService`, and none of them was ever in this rule's sight; they surfaced only when
amendment fifty-five flipped the boundary tag and read the errors. The selector is now built from a
`GATEWAY_SERVICES` list, so a fourth service is one line rather than a second rule.

**Retiring it was the serious alternative and was rejected for two stated reasons.**
`@nx/enforce-module-boundaries` now covers strictly more: every app file rather than components
alone, every service in `libs/data` rather than three, and it fired alongside this rule on a probe
component. What it cannot do is talk. nx reports a list of tags and takes no custom message, while
this rule names the ADR and says put the read in a store - the difference between an error a newcomer
can act on and one they have to research. And a data service **re-exported through
`@applye/application`** would satisfy the tag check, leaving `inject()` as the only remaining
evidence. Nothing re-exports one today; this is what makes sure nothing starts.

**`COMPONENTS_STILL_USING_THE_GATEWAY` is deleted.** It ran 26 -> 0 across the campaign and only ever
shrank. An empty array, plus the conditional spread that existed because a flat-config entry with
`files: []` does not mean "no files", is fifteen lines of configuration with no effect - and a reader
finding an empty allowlist reasonably wonders what it is waiting for.

**Verified in both directions, as every change to this rule has been:** a probe component injecting
all three services errors once per injection with the new message, the existing tree lints clean
across seven projects, and the probe was deleted in the same command that created it. No test counts
move; this is configuration.

## Amendment fifty-seven: level three opens on the two files nothing can see

Shipped as #435. The first cut of the file-size level, and chosen for being the one that cannot go
wrong invisibly: `analytics.ts` and `profile-markdown.ts` are pure functions with no Angular and no
I/O, so a rendered check has nothing to add and the gates are the whole proof.

**Level three is a different kind of work from level two, and saying so is the point.** Level two
moved files whose _location_ was wrong, and the fix was always a relocation. Nothing here is in the
wrong layer. `cv-preview.component.ts` injects nothing from `libs/data`; it is 1047 lines because one
class renders, runs a selection state machine and hosts seventeen inline-editing handlers. That is
**decomposition by responsibility**, and the cut lines are a design decision rather than a lookup.

**Both files were already divided; the split only wrote it down.** `analytics.ts` went 665 -> 195 as
model, metrics, buckets and the composition that calls them. `profile-markdown.ts` went 622 -> 320 by
the entity each parser owns. Neither needed a new idea, which is exactly why they were chosen first:
the level's mechanics - the size gate, the spec split, the count reconciliation - get proven on work
where a mistake is cheap.

**`compensation-target.ts` is named against a collision that would have implied a duplicate.**
`compensation.ts` already sits in that folder reading a **job's** advertised salary; the new file is
the applicant's own expectation, which the profile document carries. Complementary, and now named so.

**Two failures worth recording, because both were silent.** A spec stopped _running_ mid-split - a
stale type import - and the runner reported `445 passed, 0 failed` where the file holds 466. Twenty-one
tests were absent and nothing was red. And a rewrite script matched an anchor Prettier had already
reformatted, so it changed nothing and said nothing; it had no assertion. **A script that edits files
asserts on its own anchors**, for the same reason a blocker list is a hypothesis (amendment
fifty-five): the tool that reports success without doing the work is the expensive one.

**Counts.** 262 suites / 3043 tests before, **265 / 3043** after - three new spec files, not one new
or lost assertion. Over budget across the repository **25 -> 23**, TypeScript source **12 -> 10**.

## Amendment fifty-eight: the worst file in the app loses its editing half

Shipped as #436. `cv-preview.component.ts` was 1047/400 - the largest file in `apps/desktop` and one
this campaign had never touched. It is now 816, and the cut was chosen by reading its **spec files
rather than its code**: `cv-preview.editing.spec.ts` and `cv-preview.bullet-editor.spec.ts` had
already drawn a line around seventeen handlers, which is a stronger signal about where a
responsibility ends than any fresh reading of the class.

**A service, not a store, and the reason is the one this ADR keeps arriving at.**
`CvPreviewEditingService` types on `HTMLTextAreaElement` and keys its draft map by DOM id, so
`libs/application` is closed to it - the same rule that sent `scrollToTop` back to the app in
amendment fifty-four. It is provided by the component, so a draft cannot outlive the preview that
holds it. **Level three will keep producing these**: a file over budget for doing three things is not
a file in the wrong layer, and the destination is usually a sibling rather than a lower layer.

**Two methods stayed behind on purpose.** `canBoldActiveEditor` and `applyBoldToActiveEditor` answer
"which editor is on screen" - they read the selection and query the DOM for the mounted textarea on
the visible page, then route into the service. That is a question about the rendered page, not about
a draft, and moving it would have put a `querySelectorAll` inside the thing that owns text.

**The component binds the emitter; the service does not reach for an output it does not own.** One
`bind()` call in the constructor wires commits to `sectionChange`. The alternative - seventeen
one-line wrapper methods on the component - would have given back most of the lines the cut saved.

**The template cost two characters.** Prefixing its 70 bindings with `editor.` pushed three past 100
columns, Prettier wrapped them, and the size gate refused the file at 903/895 - it may not grow while
over budget, and a wrap is growth. The injected name is `edit`, and the template is byte-for-byte the
same length it was. This is amendment fifty's lesson in the other direction, and the rule is the
same: **whether a rename fits inside the print width is a fact to measure, not to assume.**

**The rendered check earned its place again.** Selection, drafting and committing survive no test that
would notice if the seam were mis-wired, because the specs call the methods directly. Driven on a real
screen with real gestures: a click selects the summary body and reports `elementPath: 'summary'`, a
double-click mounts the editor, typing puts the draft **in the service**, and blur emits a new
`CvSummarySection` through the component's output.

**Counts unchanged at 265 / 3043.** `cv-preview.identity.spec.ts` moved five assertions to read the
draft where the draft now lives - that suite exists to pin the identity between the emitted
`elementPath` and the draft key, and that identity now spans two files, which is exactly what it
should be testing.

Over budget across the repository: 23, unchanged - the file is smaller but still over. Selection
comes out next, then the 895/300 template.

## Amendment fifty-nine: re-measure before the second cut, because the file is not the file you planned against

Shipped as #437. `cv-preview.component.ts` 816 -> **597**, and the interesting part is that the slice
taken was not the slice agreed.

**The plan said selection next. The plan was made against a 1047-line file.** After amendment
fifty-eight took the editing family out, the remaining blocks measured differently: selection was 120
non-empty lines, and the **styling** family - `effStyle`, `bodyCss`, `leafCss`, `entryCss`,
`bulletCss`, `titleCss`, `titleBorderCss`, `readSelectedHostStyle` - was 228. Thirteen of its eighteen
`this.` reads are the document style, so it was also the cleaner dependency. **A decomposition plan
is a hypothesis about a file that the previous cut has already changed**; re-measuring cost one
command and moved 108 more lines.

**`bind()` over injection, for the second time.** `CvPreviewStyleService` takes style, selection,
theme and host through a bound `deps` object rather than injecting them, because they are the host
component's own inputs and a second source of them would be a second truth. That is now the shape
this level produces: a sibling service that receives the component's state rather than re-deriving it.

**`readSelectedHostStyle` measures the live DOM**, which is what settles the layer question without
further debate - and the component keeps a one-line delegator for it, because `cv-detail` samples the
selected host's resolved style _through the child_, and that contract belongs to the parent.

**The harness is the seam for tests.** Rather than three specs each reaching into the injector,
`cv-preview.harness.ts` now returns the service alongside the component, which is what a shared
harness is for. Forty-four assertions moved from `component.<cssMethod>()` to `styles.<cssMethod>()`.

**A regex lookbehind hid six call sites.** The template rewrite used `(?<![\w.])name\(` to avoid
matching property access - and the spread operator ends in a dot, so `...entryCss(` and
`...leafCss(` were skipped silently. Type-check caught it, but only because these were typed calls;
in a template that is not guaranteed. **The audit that follows a regex rewrite has to look for what
was _not_ changed**, not only at what was.

**The name is `css` because 92 + 8 > 100.** The longest styling binding measured 92 columns, so any
prefix over eight characters would have wrapped it and the gate reads a wrap as growth. Measured
before the rewrite this time, rather than after (amendment fifty-eight).

**Counts unchanged at 265 / 3043.** Rendered check on a real CV: the section carries
`color: rgb(51, 68, 85)` from the stubbed `bodyColorHex` while the accent `#7c3aed` correctly does
**not** leak into body text - the no-accent-leak rule the extracted `bodyCss` exists to enforce.

Over budget: still 23. The file is 597/400, with selection and the 895/300 template left.

## Amendment sixty: the template is now the constraint, and it decides what can be cut

Shipped as #438. `cv-preview.component.ts` 597 -> **535**, and the useful finding is not the cut - it
is why the agreed cut was impossible.

**Selection was the largest block and could not move.** Re-measured after amendment fifty-nine, it was
128 non-empty lines against the atom flattening's 96 - so by size it was next. But it has **239
template call sites**, and prefixing them with a service name is how the editing and styling cuts
reached their services. Eighteen of those bindings would have wrapped past 100 columns, Prettier would
have re-flowed them, and `cv-preview.component.html` is 895/300 and may not gain a line. **The
template is now the binding constraint on the class**: any block the template calls heavily cannot
leave until the template itself is split.

**So the cut went to a block the template never calls.** `buildCvAtoms` flattens the visible sections
into the page atoms `<lib-paginated-sheet>` paginates - a `computed()` the template only consumes as
`atoms()`, so nothing needed renaming.

**A pure function, not a service, and the reason is a measurement.** The block reads thirteen signals
off the component. A `bind()` service would have carried thirteen fields; an explicit context object
carries them at the call site for about twenty lines and needs no lifecycle at all. **The rule this
level has converged on: `bind()` when the block owns state, a pure function when it owns a
calculation.** Editing owns drafts and styling owns nothing but is called 57 times from the template;
this owns neither.

**The claim "testable without a fixture" is now tested.** Seven assertions cover the photo folding
into the header rather than taking an atom of its own, empty sections being skipped, section order,
and the two glue rules - a heading never alone at the foot of a page, an entry head never separated
from its first bullet. None of them mounts the preview.

**A rendered check that first looked like a regression, and was not.** With two experience entries of
fourteen identical bullets the preview drew **one** page, and the visible tail read as if the second
entry had been dropped. It had not: 33 atoms is exactly `1 + 1 + 1 + 15 + 15`, every one measured, and
the content genuinely fits one A4 page - the identical bullet text made the tail ambiguous. Re-run with
thirty bullets per entry it pages correctly: 64 atoms across `[40, 24]`, captioned "Page 1 of 2" and
"Page 2 of 2". **The first reading of a rendered check can be wrong in the alarming direction too**,
and the fix is to compute what the number should be rather than to trust the impression.

Counts 265 -> **266 suites**, 3043 -> **3050 tests**, the seven new being the flattening's own. Over
budget: still 23.

## Amendment sixty-one: the order was backwards, and a decision from August said so first

`cv-preview.component.ts` 535 -> **413**. The cut is `CvPreviewSelectionService`. What is worth
recording is that the plan this session started with was wrong, and the repository had already
written down why.

**A recorded decision beat the fresh measurement.** The agreed next step was to split
`cv-preview.component.html` into child components, starting with `#headerTpl`. A decision from
2026-08-04 - "cv-preview.component.html must NOT be split by ng-template atoms" - had already ruled
that out: every atom shares one selection-and-editing protocol, so a child component would thread
about twenty members through its input boundary, against a campaign precedent of **eleven** (Profile
AI Tools). Reading `#headerTpl` against today's file confirmed it still bound: sixteen members, after
the editing and styling services had already absorbed eight. **The grilling round that set the plan
did not surface the decision, and that is the process failure, not the measurement.**

**But the decision had aged, in a way that inverted the order.** When it was written the protocol was
one class. Amendments fifty-eight and fifty-nine pulled `edit` and `css` out as component-provided
injectables, and a child resolves those for free through the `ng-template`'s declaration injector
without threading anything. What was left was almost entirely one family: selection. **So selection
is not the reward for splitting the template, it is the prerequisite** - the exact opposite of the
order amendment sixty left behind.

**Amendment sixty's wall was about the old template, not about the code.** That amendment stopped
selection because 239 call sites would have taken a `sel.` prefix and eighteen bindings would have
re-flowed past 100 columns. Today the count is **317**, and the conclusion is unchanged - so the
component keeps a one-line delegator per moved method and the template is not touched at all. The
delegators cost about fifty lines and are deliberately temporary: **each one dies with the atom block
that calls it**, as the blocks become children that inject the service directly. `readSelectedHostStyle`
set the precedent in amendment fifty-nine.

**Two things could not move, for the same reason in opposite directions.** The `@HostListener` stays
on the component, because a service cannot carry one - but the question it answers, whether a click
landed on empty space, is selection's, so the listener is one line delegating to
`clearOnBackgroundClick`. Edit-mode and focus (`editing`, `focusKey`, `selKey`, `finishLeafEdit`, the
focus effect) stayed put: they are a distinct concern and moving them would have made this a second
extraction wearing one commit.

**Sixteen tests that mount nothing.** They construct the service with plain signals and assert the
measure pass can never emit, that a redundant re-emit is suppressed while an `elementPath`-only change
is not, that a key bubbling out of an inline editor is ignored, and both accessible-name shapes.
**That the file can exist at all is the claim being tested** - it is the same freedom the atom child
components will need.

Counts 266 -> **267 suites**, 3050 -> **3066 tests**. Over budget: still 23, at 413/400.

## Amendment sixty-two: the worst file in the app reaches its budget, and the pilot is what forced it

`cv-preview.component.ts` 413 -> **355/400**. **Under budget**, for the first time since this campaign
opened on it at 1047. Over budget across the repository: 23 -> **22**.

**This extraction was not planned; the pilot demanded it.** The header child needs `isEditingLeaf` and
`finishLeafEdit`, and amendment sixty-one had deliberately left edit mode and focus on the component to
keep that commit single-purpose. Three ways to give a child two methods, and only one survives: passing
bound methods as inputs is a smell each of the remaining seven blocks would repeat, and
`inject(CvPreviewComponent)` re-couples exactly what four PRs have spent themselves decoupling. So
`CvPreviewEditModeService` came out first - `editing`, `selKey`, `focusKey`, `isEditingLeaf`,
`startEditing`, `finishLeafEdit`, `returnFocusTo` and the focus effect.

**Reaching the budget was a side effect, not the goal**, which is worth stating plainly: the file was
cut because a child component needed a seam, and the 400 line fell out of that. Every previous cut in
this file aimed at the number and missed it. This one aimed at a dependency and cleared it by 45 lines.

**Two mechanical findings worth keeping.** First, **a service that owns an `effect()` cannot create it
in its constructor** when its inputs arrive through `bind()`: `focusKey` reads `deps`, which does not
exist yet, so a constructor-time effect is a race against Angular's first change detection. It is
created inside `bind()` instead, with an explicit `inject(Injector)` - the injection context is gone by
then. Second, **`editing` became a getter** rather than a field, because `cv-detail` reads it through
this component and the name had to survive the move.

**One service injecting another, which is new here.** `CvPreviewEditModeService` injects
`CvPreviewSelectionService` for `isElementSelected` rather than taking it as a dep, because both are
provided on the same element injector by the same component. That is the first time this family has had
an internal dependency, and it is the shape the atom children will use too.

**The rendered check has a recipe now, and that is the durable part.** The previous watch could not run
one: `nx serve` has no Tauri context so no CV loads, and `tauri dev` produces a bare `cargo` binary with
no `.app`, which the screen-capture allowlist filters out because it matches on bundle id.
`npx tauri build --debug --bundles app` produces a real bundle that it can see. Seen on a genuine
two-page CV: selection outline, chip and panel scope; "Edit text" mounting the editor **and moving the
caret into it**, which is this amendment's effect; Enter closing it with the text intact; empty space
clearing the selection through the delegating `@HostListener`. **One thing was seen and not explained** -
Enter bubbles out of the editor to the section host's `(keydown.enter)="selectPart(...)"`, which unlike
`onSelectKey` has no editor guard, so the scope widens from the leaf to the section. Both the template
and `selectPart` moved verbatim, so neither commit can have caused it, but that reasoning is not a build
of `main` and it is recorded as unverified rather than dismissed.

Counts 267 -> **268 suites**, 3066 -> **3071 tests**.

## Amendment sixty-three: the first atom leaves, and the decision from August is discharged

`cv-preview.component.html` 895 -> **779/300**. The header is a child component. **This is the split
the 2026-08-04 decision forbade**, and it went through unchanged in shape - what changed is the file it
was attempted against.

**The thing that was supposed to be hard was free.** The paginator renders atoms through
`ngTemplateOutlet`, so the wrapper had to stay a `TemplateRef`; the open question was whether a
component declared inside that `ng-template` would resolve `CvPreviewComponent`'s `providers` at its
DECLARATION site or at the paginator's INSERTION site. Angular resolves embedded views through the
declaration tree, so all four services resolve. **The evidence is that nothing broke**: had it gone the
other way, every existing preview spec would have thrown `NullInjectorError` at once, and 966 tests
passed untouched.

**The boundary is six inputs, all data.** `section`, `photoUri`, `placement`, `renderMode`,
`includeBirthdate`, `includeMaritalStatus`. The 2026-08-04 count of ~20 was correct for the file as it
stood; #439 and #440 are what took it apart. **A recorded decision can be right about the code and
wrong about the future**, and the way to tell is to re-measure rather than to re-read it.

**Two costs paid at the boundary.** `section()` is a signal call, so the template type-checker cannot
narrow `section().title` from `string | undefined` the way it narrowed the old context variable; the
`@else` branch needs `@if (section().title; as title)` to carry the narrowing. And `selectable()` is
bound once on the class rather than at 30 call sites, because `sel.selectable(renderMode())` is 26
columns before anything else on the line - the same 100-column pressure that shaped every decision in
this family.

**Delegators die as predicted, and the first two are gone.** `isSectionSelected` and the
`buildContactLine` re-export had exactly one caller between them, and it was the header. The class goes
355 -> **350**. Seven blocks remain; `selectable` alone still has 135 template call sites, so most of
the delegators outlive this PR by design.

### The regression, which is the real finding

**The first rendered check failed, and the name told the story: `Mira Halvorsen` where the design says
`MIRA HALVORSEN`.** Angular's emulated encapsulation binds a rule to the component that DECLARES the
markup, by stamping both with the same `_ngcontent` attribute. The instant the header markup moved into
a child, every `.cvpreview__*` rule in `cv-preview.component.scss` stopped matching it. The header lost
its uppercase, its letter-spacing, its float rules for the photo, its selection ring and its chip - and
**every gate stayed green**. Type-check, lint, 3071 tests, both builds, all four quality scripts.

**`quality:style-move` did not catch it either, and that is worth naming precisely.** That gate exists
for exactly this class of mistake and it reported "0 selectors lost declarations", correctly: the
declarations had not been lost from any stylesheet. They had stopped APPLYING. **A gate that compares
stylesheet contents cannot see a selector that still exists and no longer matches** - only a rendered
screen can, and this is the fifth regression in this campaign that no automated check could reach.

**The fix separates rules by ownership, not by file.** Rules belonging to one atom go to that atom's
own stylesheet; rules every atom needs - the selection ring, the chip, the hover tint, the leaf-editor
resets - go in `_cv-preview-atom.scss`, `@use`d by the parent and by each child. Sass emits a copy into
each consumer, and each copy carries its own component's attribute. That duplication is the mechanism,
not a cost to be optimised away. `cv-preview.component.scss` 392 -> **211**; the header's stylesheet is
new. Same shape as `_editor-shell.scss` and the `_ip-shared.scss` precedent.

**One limit is now written into the partial**, because the next seven blocks will meet it:
`.cvpreview__selected:has(.cvpreview__element-selected)` needs the container and its leaves to carry
the same encapsulation attribute, so **an atom may not be split across two components**. It would fail
the same way - silently, and only on a screen.

The re-check after the fix: uppercase and letter-spacing restored, the selection ring and `FULL NAME`
chip painting from the child's copy, and **"Page 1 of 2" unchanged**, which is what proves
`display: contents` kept the measured height intact.

## Amendment sixty-four: the CV editor's remainder splits two ways, and the question as asked had the wrong shape

**Decided, not yet implemented.** `cv-detail.component.ts` has sat at **464/400** since #466, which
put one question to the maintainer and merged without an answer: should `CvStyleStore` take over the
page's screen-state signals _and_ its three spec-only orchestration methods?

**The answer is that those are two different moves, and asking them as one was the flaw in the
question.** Put to the maintainer as three options, the settled shape is:

- **`setSectionStyle`, `setSectionTitleStyle` and `resetSectionStyle` go to `CvStyleStore`.** They
  compose a `libs/core` helper with that store's own `applyStyle`, so they are its work. It is
  **161/250**, so they fit.
- **The screen state goes to a new `CvDetailPageStore`** - `collapsedSections`, `livePanelOpen`,
  `liveSelection`, `previewMode`, `justSaved`, `sampleResolvedStyle` and the `sampleStyleSync`
  after-render effect. Panel-open, preview mode and `justSaved` are not facts about the style tree,
  and this ADR already says a page whose state does not fit **decomposes by responsibility rather
  than growing one store**. Putting all of it in `CvStyleStore` would have used the 89 lines of
  headroom to build exactly the second god-object the 250 budget exists to catch.

Naming follows `DiscoverPageStore`. The tests move with the state: `cv-style.store.spec.ts` is
**197/600** and can absorb the store-level half of `cv-detail.style.spec.ts` (**526**, not the 622
carried in earlier handoffs), and the page store gets its own spec.

**The cost is named in advance rather than discovered.** `CvStyleStore` is already exported from the
barrel, so it is already in the eager chunk; the new page store adds a second export, and `cv-detail`
is a `loadComponent` route. That is the tension `docs/architecture.md` records as accepted-but-measured,
and it is measured by `nx build desktop` before the change lands - Discover's location table cost
12.87 kB and failed the build on a version where type-check, lint and the whole suite passed.

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
  - [x] **Empty `COMPONENTS_STILL_USING_THE_GATEWAY`** - done in amendment forty-seven. **26 -> 0**,
        first deleted 2026-08-07, last deleted 2026-08-11; `onboarding` came off in amendment
        forty-four and `jobs` held the final line. Two went in amendment twenty-five:
        `onboarding-banner` migrated to `OnboardingBannerStore`, and `paste-job-modal` turned out to
        be injecting the gateway without ever calling it - so the count had been overstating the work
        by one. **Deleting the rule is deliberately not part of it**, see the next item
  - [x] **`app.ts` injects the gateway and the lint rule cannot see it** - done in amendment
        forty-eight. Found while migrating `first-launch` (amendment thirty-five); the allowlist had
        been undercounting by one throughout, reading 26 where 27 files injected the gateway. The
        checklist framed the glob and the migration as alternatives; they were not - widening the
        glob errors on the file, and the allowlist only shrinks, so **both** were needed. The boot
        read moved into `BootGateStore` and the pattern is now
        `['**/*.component.ts', '**/app.ts']`, documented as a convention check rather than a proof.
        **The rule can be deleted whenever it is judged to have served its purpose; nothing is
        hiding from it any more**
  - [ ] **Sort `apps/desktop/src/app/shared/` - 34 files, 3886 lines** (restated in amendment
        forty-nine; the old wording said "move the services into `libs/application`", which named a
        destination for files that must not go there). Pure logic and gateway access to
        `libs/application`; the four components and `page-title.service` to a UI folder in the app.
        **17 services inject the gateway**, 2929 lines, three over the 250 budget -
        `cover-letter-tailor` 305, `job-scoring` 300, `tailoring` 298. They divide by blocker: 6
        behind `cv-content.util`, 4 behind `toast.service` (the outcome pattern, debt six), the rest
        free. Sub-steps:
    - [x] Split `cv-content.util.ts` under its budget in place - **596 -> 352**, plus
          `cv-selection.util.ts` 155 and `cv-page.util.ts` 116 (amendment forty-nine). Forced first
          by the size gate, which reads a moved file as added and refuses a new file over budget
    - [x] Move the `cv-content` family to `libs/core` - done in amendment fifty. **Seven files, not
          six**: `cv-style-scope.util.ts` is consumed by `cv-style.store.ts`, one of the
          workaround files, so it is part of the same wall. 53 import sites across 31 files
    - [x] Retire the pass-in workarounds in `libs/application` that exist only because that family
          was unreachable - done in amendment fifty-one, as PR #419 (`parseCoverLetterResponse` in
          `libs/core`, the one parse with no existing function) and the seam removal on top of it.
          **Eleven files took a parameter, not nine**; a twelfth carried only the stale comment
    - [x] Move the unblocked files - done in amendment fifty-two, as PRs #421, #422 and #423.
          **Fifteen, not 22**: the old figure came from a table that also said "seventeen services"
          and then listed 6 + 4 + 22, and it counted direct blockers only, so everything blocked
          transitively was on the wrong side. `job-identity-resolver` and `job-intake` were listed as
          blocked and were not. `tailoring.service` had to be split 305 -> 226 first, because the
          250 budget covers every file in `libs/application`, not only `*.store.ts`
    - [x] Rewrite the `sessionStorage` seam in `final-checks` and `wizard-progress` to
          `globalThis.sessionStorage?.` (the ruling in amendment thirty-three) and move them, with
          `document-review-targets` and `job-scoring` behind them - done in amendment fifty-three, as
          PRs #424, #425 and #426. `job-scoring` split 300 -> 242 first. `wizard-nav` stays: its
          `querySelector` and `scrollingElement` are view, and this layer does not own view
    - [x] The `toast.service` couplings - done in amendment fifty-four, as PRs #427, #428, #429,
          #430 and #431. **They needed no outcome pattern**: `ToastService` was a 91-line signal
          store filed next to its component, and moving it unblocked all four at once.
          `TranslateService` blocked nothing - `libs/i18n` is `type:util`. `wizard-nav` moved too,
          against the previous amendment's "never": only `scrollToTop()` could not, and it became a
          `scrollTick` signal the page satisfies. `cover-letter-tailor` split 305 -> 206 with its
          pure half to `libs/core`. **`shared/` now holds only its four component folders**
  - [x] Remove `type:data` from `type:app`'s allowlist - done in amendment fifty-five, as PRs #432
        and #433. **Thirty-two files were in the way, not two**: 25 specs, which are exempted
        separately because a spec fakes its unit's collaborators, plus `AiService` in three files and
        `JobSourceService` in one - a second gateway `GATEWAY_INJECTION` never guarded - and one
        type-only import of `CliStatus`, which moved to `libs/core`. `ProfileImportStore` and
        `PasteJobStore` took the last two components' state. Verified in both directions with a
        throwaway probe file
  - [x] Decide the fate of the gateway lint rule itself - done in amendment fifty-six, as PR #434.
        **Kept, and widened to `AiService` and `JobSourceService`**, which is how four files hid
        from it. Retiring it was rejected for two reasons: nx takes no custom message, and a data
        service re-exported through `@applye/application` would satisfy the tag check with
        `inject()` as the only evidence. `COMPONENTS_STILL_USING_THE_GATEWAY` deleted, 26 -> 0
  - [ ] Cut `db.service.ts` into per-domain gateways when the ratchet refuses the next method
