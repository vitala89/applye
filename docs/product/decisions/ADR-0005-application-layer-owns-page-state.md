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
        1019 -> 517), `tracker` **in progress** (four PRs: columns and rows + print done, 667 -> 487;
        then the row editor, then the report), `cover-letter-detail` next, `jobs` deferred
  - [ ] Empty `COMPONENTS_STILL_USING_THE_GATEWAY` (**24** entries; first deleted 2026-08-07,
        then delete the rule with it
  - [ ] Move the app's `shared/*` services into `libs/application`, decomposing the five over 250 lines
  - [ ] Remove `type:data` from `type:app`'s allowlist once those services have moved too
  - [ ] Cut `db.service.ts` into per-domain gateways when the ratchet refuses the next method
