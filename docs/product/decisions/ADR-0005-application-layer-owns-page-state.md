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

## References

- **Links**: `jobs.store.ts` (the precedent, including the recorded refusal of NgRx);
  `eslint.config.mjs` `depConstraints`; `docs/governance/CODE_QUALITY.md`;
  the 2026-08-05 Duty Watch entry stopping Profile at 445/400; the 2026-08-06 entries for
  `discover-location-selection.ts` and `discover-detail-scoring.ts`.
- **Follow-up Tasks**:
  - [x] Add `type:application` and its constraint to `eslint.config.mjs`
  - [x] Add the 250-line store budget category to `tools/check-file-size-budgets.mjs`
  - [x] Create `libs/application` together with its first real store, not empty - `DiscoverDetailStore`
  - [ ] Migrate pages as they are touched, one page per pull request
  - [ ] Remove `type:data` from `type:app`'s allowlist once no component injects `DbService`
  - [ ] Cut `db.service.ts` into per-domain gateways when the ratchet refuses the next method
