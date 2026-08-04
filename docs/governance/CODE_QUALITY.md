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

## Angular and frontend decomposition

- Components render and coordinate UI state. They do not call Tauri directly, parse external data,
  build documents, or contain persistence workflows.
- Reusable domain logic belongs in `libs/core`.
- Tauri wrappers and desktop data access belong in `libs/data`.
- Shared visual building blocks and tokens belong in `libs/ui`.
- Long workflows belong in focused services or stores with explicit inputs and outputs.
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

### Prove a stylesheet move was lossless

Comparing which selectors exist before and after does not prove anything: a selector can survive
with its declarations gone, which is how a page shipped three unstyled inputs and a filter field
wearing an empty-state layout. Compare declarations instead:

```bash
npm run quality:style-move -- --base main <page.scss> <child.scss> <partial.scss>
```

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
