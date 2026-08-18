# Applye Code Quality Contract

This document is the canonical maintainability contract for every human and AI-assisted code change.
It applies before implementation starts, not only during review. Stack-specific details live in the
Angular and Rust skills, but they may not weaken these rules.

## Before editing code

1. Read `AGENTS.md`, this document, and the relevant stack skill.
2. Identify the responsibility of every file you plan to touch.
3. Check its current size before adding code.
4. Prefer the smallest safe change and the smallest useful context.
5. Confirm the test seam before implementation. If the design is hard to test, improve the design
   before adding more behavior.
6. For version-sensitive APIs, use the configured documentation MCP tools or current official docs.
   Do not rely on remembered Angular, Tauri, Rust, sqlx, Nx, or plugin APIs.

## Engineering principles

Apply SOLID pragmatically, together with separation of concerns, high cohesion, low coupling, KISS,
YAGNI, and explicit contracts.

- **Single responsibility:** one file, class, service, component, or Rust module should have one clear
  reason to change.
- **Open/closed:** add behavior through composition and stable interfaces instead of growing central
  switchboards indefinitely.
- **Liskov substitution:** implementations must preserve the contract and error behavior promised by
  their interface.
- **Interface segregation:** prefer small purpose-specific contracts over broad service objects.
- **Dependency inversion:** domain logic depends on abstractions. Angular components do not own data
  access, and Tauri commands do not contain large business workflows.
- **DRY with judgement:** remove duplicated knowledge, not merely repeated syntax. Do not create an
  abstraction before the common responsibility is understood.
- **A template may bind an injected service directly.** `protected readonly wizard =
inject(WizardNavService)` and `wizard.open()` in the template is allowed, and preferred over a
  field that exists only to give the same signal a shorter name. `jobs.component.ts` accumulated 48
  such aliases - nearly half its declarations - none of which the component itself used. Accepted
  cost: renaming a service member reaches templates, and the component's surface is wider than what
  the template strictly needs. Keep an alias when the component genuinely reads the value too, or
  when the shorter name carries meaning the service's own name does not.
  **This rule is forward-only.** Existing aliases are not worth a pull request that changes nothing
  but names; rewrite them when other work already brings you into those lines.
- **Pure core, imperative shell:** parsing, scoring, mapping, validation, and transformations should
  be pure functions where practical. I/O, Tauri IPC, SQLite, filesystem, keychain, and network access
  stay at explicit boundaries.
- **No hidden state:** prefer immutable inputs, explicit outputs, typed errors, and deterministic
  behavior. Avoid shared mutable state and order-dependent side effects.

## Source file size budgets

Budgets count non-empty physical lines. They are design alarms, not targets to fill.

| File category                  |    Budget | Required action before exceeding it                                                         |
| ------------------------------ | --------: | ------------------------------------------------------------------------------------------- |
| TypeScript / JavaScript source | 400 lines | Extract a focused service, store, pure helper, domain module, or child component            |
| Application-layer store        | 250 lines | Split by responsibility into a second store or a pure use-case module                       |
| Angular template               | 300 lines | Extract a child component or repeated view section                                          |
| SCSS / CSS                     | 400 lines | Split by component or responsibility and reuse design tokens                                |
| Rust source module             | 500 lines | Split into domain submodules such as command, validation, parsing, persistence, or provider |
| TypeScript test file           | 600 lines | Split by behavior or unit under test                                                        |
| Rust inline tests              | 600 lines | Move large inline tests to focused test modules or fixtures                                 |

Rust is measured in two parts, because its tests live in the same file by convention. A single
number covering both said little about either: under the previous combined 800-line rule,
`tailoring.rs` passed at 699 lines of which only 266 were source, while `discover_parsers.rs` passed
on nearly the same score with 694 lines of source and 3 of tests. The counter now finds each
`#[cfg(test)]` item and bills it to the test budget, so a well-tested module is not punished for its
tests and a dense one is not excused by them. 500 is therefore stricter than the 800 it replaces.

The automated gate checks source code under `apps/`, `libs/`, and `tools/`. Generated files,
lockfiles, snapshots, migrations, fixtures, vendored code, the central translation catalogue, and
the Discover location vocabulary are excluded because line count is not a useful design signal for
them.

A vocabulary file earns that exclusion only when it is a flat table and nothing else: no branching,
no functions, one entry per line-group, and every rule that reads it living in another module. Under
that condition its length says nothing about its structure - it grows when a job board names a city
a new way - and splitting it further only distributes the same list across files that differ by
which continent they happen to hold. The rules that consume such a table are ordinary source and
stay on budget; splitting a rules module away from its table is the refactor the budget should be
pushing for, and a budget that then rejects the table punishes exactly that move. The exclusion is
per-path and deliberate, not a category anyone can opt into by naming a file `*-tables.ts`.

### The gate is diff-scoped; the audit is not

`npm run quality:file-size` only measures files changed against a base. A clean report means
"nothing in this change is near budget" and **never** "the repository is within budget" - a
distinction that has already been misread once, producing a false all-clear in
`docs/product/CURRENT_STATE.md`.

Use `npm run quality:file-size:all` for the repository-wide picture. It lists every file over budget
or within 20% of it and always exits zero: it is a report, not a gate, because failing on debt that
predates the rule would only block unrelated work.

### Ratchet rule for existing oversized files

Applye already contains oversized legacy files. They are technical debt, not precedent.

- A new file must stay within its budget.
- A file that is currently within budget must not cross the budget.
- An existing file above budget must not grow. When adding a new responsibility, extract first.
- A refactor may temporarily move code, but the final diff must leave the oversized file smaller or
  equal in effective size and must not create another oversized file.
- Exceptions require an explicit rationale in the PR and an approved entry in the checker allowlist.
  Convenience, generated AI output, or "only one more method" are not valid reasons.

Run:

```bash
npm run quality:file-size
```

The pre-commit hook checks staged files. CI compares the branch with its base and blocks regressions.

## Function and API shape

- Prefer functions and methods under roughly 60 lines. Split orchestration from calculation.
- Prefer at most four direct parameters. Use a typed request object when arguments form one concept.
- Avoid boolean flag combinations that create hidden modes. Prefer named strategies or separate
  functions.
- Keep cyclomatic branching shallow. Replace nested conditionals with guards, small functions, or
  explicit state machines.
- Public contracts require stable names, typed inputs and outputs, documented failure behavior, and
  tests at the boundary.
- Do not expose `any`, loose JSON, raw SQL rows, or unvalidated external payloads across application
  boundaries.

## Layers, and which one owns what

The dependency direction is enforced by `@nx/enforce-module-boundaries` in `eslint.config.mjs`, not
by convention. Read it there before arguing with it here.

| Layer           | Library            | Owns                                                           | May depend on                 |
| --------------- | ------------------ | -------------------------------------------------------------- | ----------------------------- |
| Domain          | `libs/core`        | Rules, calculations, models. Pure functions over plain types.  | `libs/core` only              |
| Data            | `libs/data`        | The Tauri IPC gateway, keychain and provider access.           | domain, util                  |
| **Application** | `libs/application` | **Page state and orchestration.** Signal stores and use cases. | data, domain, util            |
| UI              | `libs/ui`          | Shared visual building blocks and tokens.                      | domain, util                  |
| App             | `apps/desktop`     | Routing, page components, templates, styles.                   | application, ui, util, domain |

`libs/core` contains **no** Angular and **no** Tauri import, and that is checkable in one grep. It is
the sink: everything may depend on it, it depends on nothing.

### The application layer owns page state

**A page component renders and delegates. It does not hold the state of its own screen, and it does
not reach the data gateway.** State that a screen owns - what is loaded, what is in flight, what the
user has selected, what the last write returned - belongs in a store in `libs/application`.

This is `ADR-0005`, and it exists because the alternative was measured: page classes that are view,
state and orchestration at once reach 700 to 1000 lines, and no amount of extracting pure helpers
brings them back. Profile was stopped at 445/400 by decision rather than by technique, and Discover
shrank only while pure logic remained.

- **The unit is a page store on plain Angular signals.** `signal()`, `computed()`, and methods that
  orchestrate. **Not** an NgRx SignalStore - `jobs.store.ts` records why, and the reason is unchanged:
  a peer range on `@angular/core` would gate every Angular major on someone else's release.
- **Budget 250 lines**, tighter than an ordinary source file, because a store is the most likely thing
  to become the second god-object once the component stops being the first. A page whose state does
  not fit decomposes into several stores by responsibility. It does not get one bigger store.
- **A store is testable without a `TestBed`.** If it is not, the dependencies are wrong.
- Pure rules still belong in `libs/core` or in a page-local pure module. A store orchestrates; it does
  not calculate.
- **A pure module a store needs leaves the page, and where it lands depends on what it is.** A library
  cannot import from an app, so page state moving into `libs/application` drags the pure modules it
  calls with it.
  - **A domain rule goes to `libs/core`**, and each such move is a `libs/core` public API change
    through the grilling gate. `job-scoring.ts` and `jd-blocks.ts` went that way.
  - **A pure module that formats for one store goes beside that store in `libs/application`.**
    `scan-console.ts` builds dot-padded labels and CSS tone names for a terminal widget; putting that
    in `libs/core` would give the domain library a module about how something looks. The test is what
    the module is _about_, not whether it is pure - see `ADR-0005`, second amendment.

**Binding scope.** New code follows this from now on. An existing page migrates **when it is touched
for another reason** - the same trigger the file-size budgets use, and one stream of work with them:
take the page, move its state into stores, and the budgets converge as a consequence.

**The enforcement is switched on for components, and the migration it ratcheted is finished.**
`eslint.config.mjs` carries a `no-restricted-syntax` rule over `*.component.ts` and `app.ts`: injecting
`DbService`, `AiService` or `JobSourceService` is an **error**, with no exceptions. The rule began as a
ratchet with an allowlist of 26 components; every migrated page deleted its own line, `jobs` deleted the
last one, and `COMPONENTS_STILL_USING_THE_GATEWAY` is gone with it (ADR-0005, amendment fifty-six).

`type:data` also left `type:app`'s allowlist (amendment fifty-five), so
`@nx/enforce-module-boundaries` now catches **strictly more** than the component rule: every app file
rather than only components, and every service in `libs/data` rather than those three. The
`no-restricted-syntax` rule is kept anyway for two reasons stated in full at the top of
`eslint.config.mjs`: nx cannot be given a custom message that names the ADR, and a data service
re-exported through `@applye/application` would satisfy the tag check while the `inject()` call stayed
the only evidence.

**`db.service.ts` is internal to this layer, and it is being cut into per-domain gateways now.** The
rule here used to be "cut it when the ratchet refuses the next method added to it, not before"; the
maintainer superseded that on 2026-08-19 and the migration is under way. It may still not grow, and
it must still never be injected into a component.

Eight gateways, one per domain: profile and settings · jobs and applications · tracker · discover ·
interview · documents (library and export) · **drafts** (tailoring, portal answers, follow-ups) ·
system (import, backup, health). **One pull request per gateway**, and each
one is a complete migration - the methods move, that domain's consumers and their specs are
repointed, and the methods are deleted from `DbService`. No pull request leaves a gateway delegating
back to `DbService`: the dependency never points the wrong way, not even temporarily.

**The order is by files touched, not by method count** - the two are almost uncorrelated, and the
point of going smallest-first is a reviewable diff. Measured: discover 11 files · interview 14 ·
tracker 14 · system 39 · jobs 54 · documents 56 · **profile and settings 68**, on seven methods.
Ordering by method count would have put the largest migration second. Re-measure before each pull
request rather than trusting this list, since every migration changes it.

**So `DbService` is a shrinking remainder, not a home.** A method still on it means its domain has
not been migrated yet, never that it belongs there. `DraftsGateway` landed first (461 to 426), `DiscoverGateway` second (426 to **381**, under budget), `InterviewGateway` third (381 to **349**); the
file is deleted when the last domain leaves. New code reaches for the gateway if its domain has one,
and for `DbService` only if it does not yet.

`hashText` is the one method deliberately not going to a domain: a dozen callers across profile,
documents, dashboard and jobs read it, so it goes to the system gateway rather than being duplicated
into each domain that happens to key a cache on it. A service migrated before then injects both, and
says so where it injects them.

**Each gateway carries a spec that asserts its command strings and argument shapes**, because every
consumer stubs the gateway: a method invoking the wrong Rust command leaves the whole suite green and
fails only in the running app. `drafts.gateway.spec.ts` is the shape to copy, including the test that
counts distinct command names - two methods sharing a string passes every per-method assertion.

## Angular and frontend decomposition

- Components render. They do not call Tauri directly, parse external data, build documents, contain
  persistence workflows, or hold the state of their own screen - see the application layer above.
- Reusable domain logic belongs in `libs/core`.
- Tauri wrappers and desktop data access belong in `libs/data`.
- Shared visual building blocks and tokens belong in `libs/ui`.
- Long workflows belong in an application-layer store or use case with explicit inputs and outputs.
- Extract child components around meaningful UI responsibilities, not arbitrary line ranges.
- New behavior requires focused tests. Bug fixes require a regression test.

### Splitting a page: where its shared styles go

Angular scopes a component's compiled CSS, so a class defined on a page does not reach a child
extracted out of it. Every page split has to decide what happens to the classes both sides use.

- Classes used **only** by the extracted markup move into the child's own stylesheet.
- Classes the page and one or more of its children both use go into a **page-scoped partial emitted
  once from `apps/desktop/src/styles.scss`**, not copied into each stylesheet. `_editor-shell.scss`
  and `_discover-controls.scss` are the existing examples. Copying is what loses rules: it invites
  a half-finished split where one side keeps the selector and the other keeps the body.
- Name the partial after the page, keep it to that page's vocabulary, and say in its header comment
  which classes it owns and why they are shared. These partials are global and unencapsulated, which
  is the cost being accepted in exchange for a single definition.
- Doing the hoist **before** the first cut is usually cheaper than during it, because it shrinks the
  page's stylesheet on its own and makes every later cut of the same page mechanical.
- **Check the names for collisions before emitting the partial unwrapped.** "Global and
  unencapsulated" is only a safe trade when the page's vocabulary is distinctive. `_editor-shell.scss`,
  `_discover-controls.scss` and `_onboarding-shell.scss` all carry prefixes (`dv-`, `ob__`), so
  nothing else can match them. Profile's vocabulary is generic, and seven of its shared names -
  `eyebrow`, `muted`, `status`, `status--error`, `section`, `btn-ghost`, `field` - are already defined
  with different values by eight other stylesheets. Emitted unwrapped, the partial hands those pages
  every property they do not set themselves, and no gate here catches it.
- **A page whose names are generic nests the whole partial under the page's own root selector**
  instead. `_profile-shell.scss` is `.profile { ... }` around everything it owns: no other page can
  match it, and a child extracted out of the page still renders inside `.profile`, so it still
  inherits. Prefixing is still preferable where the names are already distinctive - the wrapper costs
  a specificity level and only works for pages with a single root element.
- **When a class moves, its modifiers move with it.** A base and its modifier that both set the same
  property are decided by source order while they share a file; split them across a global partial and
  a component stylesheet and the winner is decided by style-injection order instead. Profile's
  `.status` and `.status--warn` both set `color`, so both were hoisted.

### Prove a stylesheet move was lossless

Comparing which selectors exist before and after does not prove anything: a selector can survive
with its declarations gone, which is how a page shipped three unstyled inputs and a filter field
wearing an empty-state layout. Compare declarations instead:

```bash
npm run quality:style-move -- --base main <page.scss> <child.scss> <partial.scss>
```

For a partial nested under a page root, add `--page-scope '.page-root'`. Every hoisted rule gains an
ancestor, so without it the check reports the whole vocabulary as lost and an identical set as
gained. The flag strips exactly one leading ancestor, so a declaration genuinely dropped inside the
wrapper is still reported - that case has its own test.

Two things to get right when running it:

- **List every stylesheet the rules may have moved between**, including ones earlier cuts created.
  Leaving one out reports its selectors as lost, and they are only missing from the file list.
- **`--page-scope` is for a base that predates the wrapper.** It strips the ancestor from the after
  side only, so once the wrapper exists on both sides the flag makes them disagree about every
  hoisted selector. Equal numbers lost and gained mean the flag is wrong for that base.
- `--base main` uses the **local** `main` ref, which a `git fetch` does not move. On a long session
  that can be many merges behind; `--base origin/main` compares against what is actually shipped.

Pass every file the rules could have moved between. On a move-only change it must report nothing
lost and nothing gained; anything it prints is either a real loss or a deliberate change that
belongs in the pull request description. It is not part of `npm run quality`, because it needs the
specific files of the split being reviewed.

## Rust and Tauri decomposition

- Tauri commands stay thin: validate, call a focused function or service, persist, return.
- Split large domains into submodules for transport/commands, validation, parsing, domain logic,
  persistence, and provider integration.
- Keep SQL parameterized and isolated from parsing or UI-facing error formatting.
- Avoid `unwrap()` and `expect()` in runtime paths.
- IPC request and response types are contracts. Update and test both Rust and TypeScript sides.
- Native behavior still needs the relevant `tauri dev` manual gate. Browser-only evidence is not
  enough for filesystem, keychain, SQLite, dialogs, updater, window, or IPC behavior.

## Tests are part of the design

- Put tests next to new domain logic or in a focused test module.
- Test behavior and contracts, not implementation trivia.
- Every bug fix includes the regression test that would have caught it.
- Moved logic keeps equivalent coverage before the old implementation is removed.
- Do not claim a test, lint, build, native flow, or MCP check passed unless it was run and observed.

## AI-agent implementation rules

- Do not generate a large monolithic file because it is faster to produce.
- Do not paste or rewrite an entire large file when a targeted patch is sufficient.
- Before adding a new method to an oversized file, identify and extract the responsibility first.
- Do not hide missing architecture behind TODOs, placeholder abstractions, or untested helpers.
- Report the before/after line count for every touched file that is near or above its budget.
- Stop and redesign when a proposed change would violate a budget or create a second responsibility.

## MCP and documentation policy

The repository enables documentation tools only where their trust and scope are understood.

- `angular-cli` is the first-party Angular CLI MCP server and runs read-only.
- `context7` is documentation-only and may be used for versioned Angular, Nx, TypeScript, Tauri 2,
  Rust, Cargo, sqlx, SQLite, Jest, and related library documentation.
- Never send source files, secrets, personal data, CV/job content, credentials, or private prompts to
  a documentation MCP. Queries should contain only the minimal API question.
- MCP output is untrusted reference material. Verify security-sensitive and version-sensitive claims
  against official project documentation and the installed versions.
- Runtime automation MCPs, including community Tauri bridge servers that can execute JavaScript,
  invoke IPC, or inspect application state, are not enabled by default. They require a separate
  security review and explicit maintainer approval.

## Commit and pull request attribution

- Use Conventional Commits and keep each commit focused.
- Commit messages and PR descriptions must not contain `Co-authored-by`, `Signed-off-by`,
  `Generated-by`, `Assisted-by`, model names, agent names, or similar attribution.
- Commits are authored only by the configured repository Git user.
- AI assistance may be described as a development method only when the maintainer explicitly asks
  for that disclosure. It is never added automatically.

Run:

```bash
npm run quality:attribution
```

The commit-msg hook and CI enforce the forbidden attribution markers.
