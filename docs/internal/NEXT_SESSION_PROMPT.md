# Next session prompt - Applye

Paste everything below the line into a fresh Claude Code session.

---

Continue work on Applye. **The application-layer migration that drove the last two months is
finished** - do not restart it. `ADR-0005` is now a rule the linter enforces rather than a campaign
with a backlog: `COMPONENTS_STILL_USING_THE_GATEWAY` is gone, `type:data` has left `type:app`'s
allowlist, and no component in the repository injects `DbService`, `AiService` or `JobSourceService`.
What is left is the debt that migration did not reach.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`. Read
`docs/product/decisions/ADR-0005-application-layer-owns-page-state.md` before touching any page -
everything below is downstream of it.

## Where things stand

`main` is at `b987d882`, clean, **no open pull requests.** The last three merged are #444 (docs
sync), #445 (silent-failure audit leftovers) and #446 (dead scaffolds and the gateway-doc
correction).

The architecture is a **single Nx monorepo with enforced layer boundaries** - `apps/{desktop,web,
mobile}` plus six `libs/`, five `@applye/*` aliases, and `@nx/enforce-module-boundaries` deciding
every arrow rather than convention. That is the intended end state, and it was re-confirmed on
2026-08-14 against the usual "split into multiple repos / adopt microfrontends" progression:

- **Multi-repo is rejected** because its trigger is several business lines with separate teams,
  roadmaps and pipelines. Applye has one product and one maintainer.
- **Microfrontends are rejected on a technical ground, not a taste one.** `tauri.conf.json` sets
  `script-src 'self'`, so a Module Federation remote entry cannot load without weakening the CSP of
  an application holding API keys in the OS keychain and the user's database on disk. The app is
  local-first and must work offline. And there is no independent deploy target for a fragment: a
  release is a signed installer plus `latest.json`, so the role "ship part of the app without
  rebuilding the shell" is already played by the updater. The 18 `loadComponent` routes provide the
  part of the benefit that does apply here.

**Do not reopen either decision without new facts.** If a task seems to need one, that is a grilling
gate, not an implementation detail.

## Measure before planning

```bash
npm run quality:file-size:all
```

**Use `:all`, not the plain `quality:file-size`, which is diff-scoped.** A file missing from the
diff-scoped report means "not changed", **not** "under budget" - the 2026-08-14 Duty Watch entry
calls `jobs.component.ts` "the only file the size gate reports", and that was the diff-scoped gate
speaking. The full audit reads **22 files over budget and 42 near it.**

## The plan, in priority order

### 1. `jobs.component.ts`, 723/400 - one of three pull requests done

The last page still shaped like the pre-ADR-0005 era: view, state and orchestration in one class. It
was 977; the document block left in PR 1 as three stores - `JobDocumentsStore`,
`JobDocumentDraftsStore` and `JobFinalChecksStore`. **The remaining two cuts were decided through the
grilling gate and are recorded in the Duty Watch entry for `refactor/job-documents-store`:**

- **PR 2, the lifecycle block, ~135 lines.** `enterJob`, `loadJob`, `decideWizardView`,
  `resetJobScopedState` and `restoreTailoringFromCache` move into a store - they are "load everything
  for job N and restore the wizard", which is screen state. The `paramMap` subscription and
  `ngOnDestroy` stay on the page: those are routing, and ~25 lines.
- **PR 3, the actions and tailoring blocks**, which is what finally gets the page under 400.

`retailorFromFinalChecks` stays on the page until PR 3 by decision - it drives tailoring, rescoring
and documents at once.

**The store budget is 250 and `tailoring.service.ts` and `job-scoring.service.ts` sit at 250 and
249**, so a new responsibility gets a new store rather than a line added to an existing one. PR 1
learned that the hard way: written as two stores the documents half arrived at 278, and the fix was a
third file, not shorter comments.

Expect the budgets to converge as a consequence rather than as a separate exercise - that is the
whole finding behind ADR-0005.

### 2. The Rust command layer, which has the disease the frontend just cured

`AGENTS.md` says Tauri commands stay thin and Rust domains split into command, validation, parsing,
domain, persistence and provider modules. Ten modules under `apps/desktop/src-tauri/src/commands/`
run **598 to 851 non-empty lines against a budget of 500**, with the IPC handler and the domain logic
in the same file: `documents.rs` 851, `applications.rs` 809, `tailoring.rs` 738, `interview.rs` 695,
`job_paste.rs` 688, `job_identity_source.rs` 656, `discover_filter.rs` 639, `import.rs` 608,
`legitimacy.rs` 599, `job_identity.rs` 598.

Take one module, not all ten. The seam is the same each time: the `#[tauri::command]` function parses
arguments and calls a function in a sibling domain module that knows nothing about Tauri - which is
also what makes the domain logic testable without a `tauri::test` harness. Use the `applye-rust`
skill.

### 3. `libs/skills` is invisible to the build graph

`apps/desktop/src-tauri/src/ai/skills.rs` reads 23 prompt files through
`include_str!("../../../../../libs/skills/src/<name>/<name>.md")`, and `libs/skills` has **no
`project.json`**. It is therefore not an nx project: editing a prompt does not invalidate any cache,
does not appear in the graph, and is not covered by the boundary rules. It also means a renamed file
fails at Rust compile time with a path error rather than anywhere useful.

Either give it a `project.json` tagged `type:domain` / `scope:shared`, or write the coupling down
somewhere a reader will find it. This is a small change with a real decision inside it, so settle the
shape before writing code.

### 4. `apps/mobile` is a placeholder

One `README.md`, and `package.json` carries `"mobile:dev": "echo 'Mobile not scaffolded yet…'"`.
Tauri 2 supports mobile targets. Either scaffold it or delete both the directory and the script - an
`apps/` entry that builds nothing is a false signal in every architecture review that follows.

### 5. Two documentation debts left deliberately by #446

- **The CSP rationale is nowhere.** `style-src 'unsafe-inline'` is required by Angular's inline
  styles and is a real weakening of an otherwise strict policy, with no note saying so.
  `tauri.conf.json` is JSON and takes no comments, so it belongs in `docs/architecture.md`. Inventing
  a `_comment` key in a Tauri config is worse than leaving it.
- **`dragDropEnabled` is unset** in the window config. If file drag-and-drop into the window is not a
  feature, `"dragDropEnabled": false` stops the webview intercepting it. Check whether anything
  depends on it first.

### 6. Carried over from #445

- **Five `.status--error` declarations** across five stylesheets, with different values, could fold
  into the `ui-error-text` utility in `libs/ui/src/styles/_status.scss`. The reason they were not
  folded then is written into that file: `_profile-shell.scss` records that `status`,
  `status--error`, `muted` and four more are generic names defined **with different values** across
  eight files, so claiming the name globally would hand those pages a property they never set.
- **Two rendered checks were never driven**: the ATS status line and the quick-view stage panel. Both
  need real database rows, so a browser preview cannot substitute - outside Tauri every `invoke`
  rejects. And **synthetic clicks do not reach the Tauri webview**: hover produces the hover state,
  a click at the same coordinates does nothing, confirmed against three targets including the theme
  toggle. These need a human at the keyboard. Say so rather than reporting them as covered.

## What is explicitly not in the plan

- **`cv-preview.component.html`, 779/300, is blocked by decision.** It looks like nine `ng-template`
  atoms and is not: all speak one inline-editing protocol repeated per field. The real seam is the
  17 near-identical `@if (isEditingLeaf(...)) { <input> } @else { <element> }` pairs - one
  editable-leaf component or directive owning that protocol. A design change needing its own
  decision, and **not** something the application layer solves. The header block was extracted in
  #441 and the file went 895 to 779; that is the shape further work would take.
- **`db.service.ts`, 461/400, stays as it is** and is internal to `libs/data`. Roughly six lines per
  method is a mechanical mapping onto IPC, not complexity. It may not grow. It is cut into per-domain
  gateways **when the ratchet refuses the next method added to it**, and not before.
- **`libs/core/.../analytics.ts`** changing shape is a `libs/` public API decision and goes through
  the grilling gate.
- **Profile is finished at 445/400.** Settled through the grilling gate. A `ProfileFormStore` is what
  ADR-0005 sanctions and it is legitimate, but it is not urgent and not first. Two seams inside it
  stay rejected on their own merits: the compensation block (template already under budget, so a move
  only grows the class) and the section-mirror collapse (`serialize(parse(x))` is not identity for
  hand-typed raw markdown).

## Traps that have actually fired

Each of these cost a real session. They are not hypothetical.

- **The host-element trap, three times.** Markup moved into a child component leaves behind any rule
  that positions it: `flex`, `grid-column`, `align-self`, a direct-child width, or anything matching
  by descendant or `>`. The new host element sits between the container and the target, and the rule
  goes inert. Profile's paired fields fell to 173.5px in an 846px row this way. `quality:style-move`
  **does not catch it** - no declaration was deleted. Use `display: contents` on the host when the
  child must not become the flex item.
- **Directives do not move with markup either.** Discover's `routerLink` stayed in the page's
  `imports` when the markup moved into the drawer, so the attribute became literal: no `href`, no
  navigation, and type-check, lint and the whole suite passed on it.
- **A stylesheet only applies to markup its own component declares.** The CV preview header shipped
  with none of its styling for exactly this reason, and `quality:style-move` correctly reported that
  no rule had been deleted.
- **`nx build` catches template type errors that `tsc --noEmit` misses.** `[notice]="columnsError()"`
  passing `null` into a `string` input only fails in the Angular compiler. A type-check is not a
  substitute for the build.
- **The lint gate can pass on a stale cache.** Use `--skip-nx-cache` when the result matters.
- **An unknown is not a zero.** A failed read that leaves a signal `null` looks exactly like an empty
  result, and a form gated on `=== null` will then offer to write a first record over existing ones.
  Gate on `!error() && empty()`, never on `empty()` alone.
- **`npm run web:build` regenerates `apps/web/public/sitemap.xml`.** Use `nx build web`.

## Verification, and what it cannot reach

jsdom performs no layout, so widths, overlaps and computed colours cannot be asserted in a unit test -
the _shape_ can. Print CSS hides everything outside `app-tracker-report`, so anything rendered above
that subtree is invisible in the exported PDF while looking correct on screen. Six non-English
locales do not share English word order, so an i18n key must be a whole sentence, never a fragment
concatenated with a tail.

Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop
--skip-nx-cache`, `nx test desktop`, **`nx build desktop`**, `cargo check` in `src-tauri` when
anything under it or in `capabilities/` changed, `npm run quality:file-size`,
`npm run quality:attribution`, `npm run format:check`, `git diff --check`.

## When to stop and ask

`CLAUDE.md` puts a decision behind the `aif-grilling` skill when it changes a `libs/` public API, a
database schema, the privacy or security posture, or when the task has two readings leading to
different work. Items 3 and 4 above are both in that category.

**Settle facts yourself before asking.** Whether `dialog:default` already grants `allow-open` was a
lookup in the plugin's `permissions/default.toml`, not a question. Whether the three scaffold
components had consumers was a search, not a question. The gate is for decisions, not for facts.

## Open follow-ups, not part of the plan

- **A CV that finishes generating after its page was replaced does not appear until reopened.**
  `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed page's signals.
  The document is written correctly; only the view is stale.
- **A database newer than the running app aborts instead of explaining itself.** The
  `.expect("initialize database")` in `lib.rs`'s `setup` runs inside tao's `did_finish_launching`, a
  non-unwinding context, so a panic becomes an abort with a macOS crash dialog rather than a message.
  Real for a user who reinstalls an older release.
- **Projected content is created with the page's view even while hidden.** Measured on Discover's
  filter menu: zero `.dv-geomenu__item` elements in the DOM while closed, but the bodies' bindings
  evaluating anyway. Harmless there; worth knowing before projecting anything expensive.
- **Dependabot: 1 open Rust alert**, `glib` RUSTSEC-2024-0429. Not fixable here - it arrives through
  the gtk-rs 0.18 stack under `wry`/`webkit2gtk`, which Tauri pins, and it is Linux-only. It is
  **deliberately left open rather than dismissed**, because it is what will tell us Tauri moved -
  that reasoning is recorded in `DUTY_WATCH.md`, not in a suppression file, and there is no
  `.cargo/audit.toml` in this repository. GitHub also reports npm advisories on the default branch; the last
  audit found every one of them development-scope, with `npm audit --omit=dev` at 0.

## Housekeeping

No `npm run desktop:dev` process is running as of this handoff - check with `pgrep -fl "tauri dev"`.
Start one before trying to verify anything that needs Tauri IPC, SQLite, the keychain, native
dialogs, printing or the updater.
