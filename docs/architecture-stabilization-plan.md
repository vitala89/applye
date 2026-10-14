# Architecture Stabilization Plan

Status: **blocking product-development gate before Career Evidence**

Applye is public and the repository is part of the product's engineering portfolio. Before adding the
Career Evidence bounded context, the existing desktop, web, shared TypeScript libraries, and Rust/Tauri
backend will be brought back into alignment with the architecture already defined in
`docs/architecture.md`, `docs/domain-architecture.md`, ADR-0005, and
`docs/governance/CODE_QUALITY.md`.

This is not a rewrite and it is not a request to introduce textbook DDD scaffolding everywhere. The
goal is to remove known boundary violations, make existing domain ownership explicit, reduce hidden
coupling, and strengthen automated enforcement so new contexts do not inherit old compromises.

## Why this blocks Career Evidence

Career Evidence is foundational. It will become an input to role discovery, CV generation, job
matching, interview preparation, company intelligence, and later web workflows. Adding it while the
existing application and Rust boundaries still leak would make those leaks part of the new platform
contract.

Career Evidence therefore starts only after the exit criteria at the end of this document are met.

## Architecture target

### TypeScript / Angular

```text
apps/desktop              apps/web
     |                       |
     v                       v
desktop application      web application
     |                       |
     v                       v
desktop gateways          web gateways
     |                       |
     v                       v
Tauri IPC                 HTTP/API

          shared domain
             libs/core
```

Rules:

- `libs/core` contains framework-independent domain contracts and pure business rules.
- `libs/application` owns desktop use-case orchestration and screen/application state.
- `libs/data` owns desktop infrastructure gateways and Tauri IPC mapping.
- desktop components own rendering, navigation, user notification, native dialogs, clipboard, and
  other presentation/platform effects.
- web must not depend on the desktop application or Tauri data layer.
- business concepts shared by more than one feature must have a neutral domain owner rather than live
  under whichever feature happened to need them first.

### Rust / Tauri

```text
Tauri command
    |
    v
feature workflow / domain rule
    |
    v
persistence / provider / filesystem adapter
```

Commands are IPC adapters. A command may validate/map arguments and translate an error into the IPC
contract, but parsing rules, workflow policy, SQL-heavy persistence, provider logic, and filesystem
recovery belong in focused feature modules when those responsibilities exist.

## Findings this plan closes

The October 2026 architecture audit found the following concrete debt:

1. `libs/application` still contains platform effects: direct Tauri plugin imports, router ownership
   in several stores/services, clipboard access, and a small localStorage responsibility.
2. `libs/application/jobs` and `libs/application/documents` have a logical two-way dependency. In
   particular, document code imports `DocumentRegionTag` from the jobs area while jobs orchestration
   imports document services.
3. Nx enforces library boundaries, but feature folders inside the single `libs/application` project
   have no automated dependency-direction check.
4. `libs/data` still contains a reactive `JobsStore`, even though reactive application state belongs
   in `libs/application`.
5. `JobsGateway` spans jobs, scoring, applications, pipeline operations, tracker writes, comments,
   priority, and analytics facts. It must not become the template for Career, Company, or Network.
6. `libs/core/src/lib/models` is a historical broad bucket. New bounded contexts must use
   domain-owned folders rather than adding more unrelated models there.
7. several Rust files under `commands/` contain domain/parsing/persistence responsibilities in
   addition to IPC wiring.
8. dormant legacy Rust endpoints remain from superseded document/tailoring paths and require a
   caller audit before removal.
9. the file-size ratchet still reports legacy oversized production files. Known examples include the
   Jobs page and the Cover Letter editor template; the complete list must come from
   `npm run quality:file-size -- --all` at the start of the size-remediation phase.
10. `libs/core/src/lib/core.ts` and its generated spec are unused Nx scaffold leftovers.
11. parts of `docs/architecture.md` lag behind the stricter dependency direction already enforced in
    code.
12. `docs/product/CURRENT_STATE.md` still described database backup/restore as in review after PR
    #573 and the architecture-canon PR #574 had already merged.

## Delivery strategy

Do not implement this as one giant refactor PR. Each implementation PR must preserve runtime behavior,
have a narrow architectural purpose, keep migrations/API changes explicit, and pass the validation
matrix for the layers it touches.

### PR 0 - Stabilization control plane and safe dead-code cleanup

Scope:

- add this plan;
- update the operational state to make Architecture Stabilization the blocking step before Career
  Evidence;
- remove the unused generated `libs/core/src/lib/core.ts` scaffold and its meaningless spec;
- make no runtime, schema, persistence, privacy, or user-facing behavior change.

Done when:

- the branch is based on current `main`;
- the scaffold has no public export or caller;
- docs describe #573 and #574 as merged;
- CI/doc gates are green.

### PR 1 - Remove platform leakage from the application layer

**Status:** merged as [#576](https://github.com/vitala89/applye/pull/576) (`915e8072`). A review of that pull request
required four further cuts, and they are on the same branch: `ToastService` left the library,
editor destinations are semantic facts rather than routes, a rejected save dialog records
`failDialog` without leaving the spinner up, and Open/Reveal run from the desktop button.
Production scan on `main`: Tauri 2 files, Router 3, clipboard 2, localStorage 1, sessionStorage 3,
plus `ToastService` in the library and ten production callers. After this branch those counts are
0 in production application code, including toast ownership, route strings, and file open/reveal
UI actions. The audit also found `sessionStorage` in `wizard-progress.service.ts`,
`tailoring-pass-drafts.service.ts`, and `final-checks.service.ts`, in addition to the sidebar
`localStorage` key. Those four storage sites moved with the Tauri, router, and clipboard leaks.
`window` / `document` matches in this library were comments. PR 2 is the next section.

Audit every production file under `libs/application` for:

- `@tauri-apps/*`;
- `Router` / navigation;
- `navigator` / clipboard;
- `window`, `document`, or localStorage;
- app-local presentation services.

Known starting points:

- `documents/document-export.service.ts`;
- `pipeline/followup-draft.service.ts`;
- `jobs/portal-answers.service.ts`;
- `jobs/cv-photo-prompt.service.ts`;
- `jobs/job-documents.store.ts`;
- `jobs/job-document-drafts.store.ts`;
- `shell/shell.store.ts`.

Preferred shape:

- page/component performs native dialog, navigation, clipboard, mail-client, reload, or other
  presentation/platform side effect;
- application service/store owns the use case, state, guards, and result;
- reusable native operations that are true infrastructure capabilities may go through an existing
  focused gateway, but do not create a generic "everything platform" abstraction merely to hide an
  import.

Add tests for returned outcomes/navigation intentions where behavior moves.

### PR 2 - Remove hidden cross-feature cycles and define application feature direction

**Status:** merged as [#577](https://github.com/vitala89/applye/pull/577) at `f5e5a181`. The
production feature graph is acyclic. `jobs` orchestrates `documents`; `documents` does not import
`jobs`. `DocumentRegionTag` and `inferDocumentRegion` live in `libs/core` under `documents/`.
`npm run quality:application-boundaries` enforces that graph, rejects a production self-import of
`@applye/application`, and rejects a new file in the legacy `libs/core/src/lib/models` bucket.
The next step after that merge is **PR 3: Correct state and gateway ownership.**

First remove the known `documents -> jobs` dependency by moving shared document vocabulary such as
`DocumentRegionTag` to a neutral domain owner under `libs/core/src/lib/documents/`.

Then audit imports between application feature folders. Establish explicit one-way rules for current
features and add an automated check (ESLint or a small repository quality script) for the boundaries
that Nx cannot see inside a single library.

Rules for new code:

- no feature folder may import another feature merely to reuse a type that actually belongs to shared
  domain vocabulary;
- cross-feature orchestration lives in an explicit application workflow/integration seam;
- no circular feature dependency is accepted;
- no new business model goes into the generic `libs/core/src/lib/models` bucket.

Existing model moves are opportunistic unless a move is necessary to break a boundary. Avoid a
repository-wide rename-only churn.

### PR 3 - Correct state and gateway ownership

**Status:** merged as [#584](https://github.com/vitala89/applye/pull/584) at `6a6fdcb5`.
`JobsStore` lives in `libs/application`. `libs/data` keeps stateless IPC gateways. `JobsGateway` is
jobs and scoring. `ApplicationsGateway` is application tracking, including analytics facts.
`TrackerGateway` owns the tracker-only field write. `ProfileGateway` and `SettingsGateway` replace
`ProfileSettingsGateway`. `resetAllData` stays on `SettingsGateway` because the Settings Danger Zone
is the use case. No `CareerGateway`. The next step is **PR 4: Thin Rust command boundary, part A.**

Move the reactive `JobsStore` out of `libs/data` into `libs/application` without changing SQLite
as source of truth.

Split the broad `JobsGateway` by current ubiquitous language and actual callers:

- Jobs/scoring stay with the job boundary.
- Application lifecycle, pipeline status, priority, and comments move to an application-owned gateway.
- Tracker-specific writes/projections belong to the existing tracker boundary where appropriate.
- Analytics facts get the smallest coherent owner justified by their callers; do not create a gateway
  containing one method only unless the boundary is real.

Do a caller-driven audit of `ProfileSettingsGateway`. A split is required only if it removes a real
mixed ownership problem; otherwise record the deliberate exception. Career Evidence must receive its
own future gateway and must never be appended to this legacy gateway.

No component may gain a gateway dependency while this migration runs.

### PR 4 - Thin Rust command boundary, part A: high-value domains

**Status:** merged as [#585](https://github.com/vitala89/applye/pull/585) at `2bb329c1`.
Applications, Documents, Interview, and Tracklist Import command modules are IPC adapters.
Workflow, the pure rules that exist, and SQL live in `applications`, `documents`, `interview`,
and `tracklist_import`. Interview rejection reuses `applications::set_status`. Document block
conversion, style rules, and the untrusted-parser guard live outside `commands/`. Tailoring
renderers moved in PR 5.

Refactor the command modules where IPC, domain rules, and persistence are visibly mixed. Start with:

- applications;
- documents;
- interview;
- import.

Use vertical feature modules rather than a new global "domain/application/infrastructure" directory
tree. Example shape:

```text
commands/interview.rs       # thin IPC
interview/
  mod.rs                    # workflow API
  domain.rs                 # only when real domain rules exist
  persistence.rs            # SQL/data mapping
```

Do not create empty files or placeholder layers. A module exists only when it owns real behavior.

Preserve command names and serialized contracts unless a separate migration decision explicitly
changes them.

### PR 5 - Thin Rust command boundary, part B: parsing and workflow-heavy modules

**Status:** open as [#586](https://github.com/vitala89/applye/pull/586) on
`refactor/thin-rust-command-boundaries-b`. Jobs, Discover, and Tailoring
implementation live outside `commands/`. Command names and serialized fields are unchanged.
`generated_doc_get`, `export_docx`, and `export_pdf` stay registered for the PR 6 dormant-surface
audit. After this pull request merges, the next step is **PR 6: Remove dormant runtime surface.**
Do not start PR 6 here.

Audit and extract responsibilities from:

- job identity;
- discover filtering/parsing;
- tailoring;
- job paste/scoring areas;
- any other command module where a command function is not a thin adapter.

Pure deterministic rules should be testable without Tauri state or a live database. SQL remains in
focused persistence seams. Provider/filesystem effects remain explicit.

### PR 6 - Remove dormant runtime surface

Repo-wide audit every candidate before deletion. Known candidates include superseded generated-document
and legacy export endpoints from the older tailoring/document path.

For each candidate:

1. prove there is no TypeScript/Rust runtime caller;
2. check command registration and tests;
3. check migrations or stored data do not require the command to remain;
4. remove the command, wrapper/export, registration, and obsolete test together;
5. update docs that still describe it as callable.

The old database-export stub is not a candidate: PR #573 replaced it with the supported
backup/restore workflow, so audit the post-#573 tree rather than reasoning from the old name.

### PR 7 - Bring production source back under file-size budgets

Run:

```text
npm run quality:file-size -- --all
```

Treat the output as the authoritative inventory. Translation catalogues and the explicitly documented
Discover location data table remain data exceptions; do not split data merely to satisfy a line count.

For every production source/template/style file reported OVER:

- name its responsibilities;
- extract by cohesion, not by arbitrary line ranges;
- preserve behavior and tests;
- add missing test seams where the extraction exposes untested orchestration.

Known required work includes:

- Jobs page decomposition below the TypeScript source budget and adding coverage for critical parent
  wiring/orchestration;
- Cover Letter editor template decomposition below the Angular-template budget.

Continue until the repo-wide audit reports no production OVER entries except explicit canonical data
exclusions.

### PR 8 - Architecture enforcement and documentation reconciliation

After the code is clean:

- update `docs/architecture.md` so diagrams and prose match the actual enforced direction;
- document the new application feature-boundary check;
- ensure `docs/domain-architecture.md` contains every business term introduced by the refactor and no
  duplicate synonyms;
- ensure agent instructions point to the final rules rather than refactor-specific exceptions;
- remove temporary architecture notes that are no longer true;
- run a final dead-export/caller audit.

Do not create duplicate architecture documents. The existing canonical files remain canonical.

## Validation contract

Each implementation PR runs the smallest applicable rows in
`docs/governance/VALIDATION_MATRIX.md`, plus the mandatory repository gates from
`CODE_QUALITY.md`.

At minimum for TypeScript boundary changes:

```text
nx lint <affected projects> --skip-nx-cache
nx test <affected projects> --skip-nx-cache
nx run <affected project>:type-check --skip-nx-cache
npm run quality:file-size
npm run quality:attribution
npm run quality:application-boundaries
npm run format:check
git diff --check
```

For Rust changes add:

```text
cargo fmt --all -- --check
cargo clippy --lib --offline -- -D warnings
cargo test --lib --offline
cargo check --offline
```

Use the repository's exact current commands from the validation matrix when they differ from these
examples.

## Exit criteria before Career Evidence

Architecture Stabilization is complete only when all of the following are true:

- no production file in `libs/application` directly imports Tauri plugins;
- application code no longer owns page navigation, user notification, clipboard/native dialog, or
  other presentation effects except an explicitly documented narrow exception;
- no logical circular dependency remains between application feature folders;
- shared business vocabulary used across features has a neutral domain owner;
- no reactive application store remains in `libs/data`;
- broad gateways have coherent responsibilities and there is an explicit rule that new bounded
  contexts receive their own gateways;
- new bounded-context models are no longer added to the generic core `models/` bucket;
- targeted Rust commands are thin and extracted feature logic is independently testable;
- dormant superseded command surfaces are removed or explicitly proven necessary;
- the repo-wide file-size audit has no production OVER entries beyond canonical data exclusions;
- `docs/architecture.md`, `docs/domain-architecture.md`, ADR-0005, Nx/ESLint/quality checks, and the
  code agree;
- affected lint, tests, type checks, Rust checks, file-size, attribution, formatting, and diff checks
  pass;
- no product behavior, privacy posture, or local-first guarantees changed accidentally.

Only then does the implementation pointer move to **Career Evidence domain foundation**.

## Non-goals

- no Career Evidence implementation in this stabilization program;
- no web backend or `apps/api` scaffold;
- no database redesign merely for architectural symmetry;
- no dependency/framework replacement;
- no textbook Aggregate/Repository/Domain Event scaffolding without domain behavior that needs it;
- no mass renaming for aesthetics;
- no change to desktop privacy/local-first behavior;
- no new product features hidden inside refactor PRs.
