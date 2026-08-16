# Applye Validation Matrix

Use the smallest sufficient validation set for the affected layers. Do not claim a command passed unless it was run and the result was observed.

## Always before commit

```bash
npm run quality:file-size
npm run quality:attribution
npm run format:check
git diff --check
```

Review the final diff and confirm that no secrets, local databases, generated outputs, personal data, unrelated files, forbidden attribution, or code-size regressions were added.

## Source-size and maintainability gate

The canonical budgets and decomposition rules live in `docs/governance/CODE_QUALITY.md`.

- New TypeScript/JavaScript source files: at most 400 non-empty lines.
- Angular templates: at most 300 non-empty lines.
- Stylesheets: at most 400 non-empty lines.
- Rust source modules: at most 500 non-empty lines.
- TypeScript tests: at most 600 non-empty lines.
- Rust inline `#[cfg(test)]` items: at most 600 non-empty lines, counted separately from the module's
  source rather than added to it.
- Existing files already above budget may not grow. Extract a cohesive responsibility first.

The pre-commit hook checks staged files. CI compares the branch with its base. When a touched file is near or above budget, record its before/after size and the extracted responsibility in the PR and Duty Watch entry.

## Documentation-only changes

```bash
npm run quality:attribution
npm run format:check
git diff --check
```

Also verify links, command names, version claims, and current-state claims against the repository.

## Angular or TypeScript changes

Run the affected project first, then widen only when the change is shared or cross-cutting:

```bash
npm run quality:file-size
npm run type-check
npm run lint
npm test
npm run desktop:build
```

For narrow work, Nx project or affected commands are preferred when they give equivalent coverage.

`npm run type-check` runs `ngc --noEmit` for both Angular apps, so it **does** see templates: a
binding to a member the component does not have, or a type the template cannot accept, fails here
rather than only under a full build. It ran `tsc` until 2026-08-02 and was blind to all of that;
`tools/check-quality-guardrails.test.mjs` now fails if either app goes back to `tsc`. A build is
still required for anything about bundling, budgets or the produced output - it is no longer
required merely to find out whether the templates compile.

Before writing version-sensitive Angular code, use the configured read-only Angular CLI MCP or current official Angular documentation for the installed version. Context7 may provide a minimal versioned documentation lookup, but it does not replace official verification for security-sensitive or release-sensitive behavior.

## Rust, SQLite, Tauri command, or migration changes

From `apps/desktop/src-tauri` when appropriate:

```bash
npm run quality:file-size
cargo fmt --check
cargo test --lib
cargo clippy -- -D warnings
cargo check
```

Also run the relevant frontend type-check/build when Rust contracts cross Tauri IPC.

Use current official Rust, Cargo, Tauri 2, sqlx, and SQLite documentation for version-sensitive APIs. Community Tauri runtime MCP bridges are not part of the default gate and require explicit maintainer approval plus a separate security review.

## Dependency changes

Whenever `package.json`, `package-lock.json`, `Cargo.toml`, or `Cargo.lock` changes:

```bash
npm audit --omit=dev
cd apps/desktop/src-tauri && cargo audit
```

`npm audit` without `--omit=dev` reports the build toolchain (Nx, the Angular
CLI, webpack-dev-server), none of which ships inside the Tauri bundle. The
`--omit=dev` run is the one that describes what users actually install, and it
is expected to stay at zero. Fix or explain anything it reports.

Transitive advisories that have a patched release inside the same major are
pinned through `overrides` in `package.json` rather than waited on, because a
transitive dependency has no other lever. The `@major` selectors matter: several
of these advisories were backported to each release line separately, and a
blanket override would drag an old consumer across a major boundary. When adding
one, pin the line the vulnerable copy is actually on - `npm ls <pkg> --all` tells
you which versions are installed, and the advisory's own `first_patched_version`
per range tells you what to pin to. Never pin across a major to silence an
advisory; that trades a reported risk for an unreported one.

One dev-only advisory is knowingly accepted, on the same standard the
`cargo audit` ignore list uses - it states why it is tolerable and what would let
us drop it:

- **`brace-expansion`, GHSA-mh99-v99m-4gvg, high.** Patched only in 5.0.8, with
  no backport to the 1.x or 2.x lines, and copies of both are pulled in by
  `minimatch` 3.1.5 under `test-exclude` and `fork-ts-checker-webpack-plugin`.
  Forcing every copy to 5.x is the only complete remedy, and **it was tried and
  reverted, because it breaks them.** `brace-expansion` 5's CJS entry exports
  `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }` rather than a bare function,
  and `minimatch` 3.1.5 does `var expand = require('brace-expansion')` and then
  calls it, so both copies throw `expand is not a function` on load.
  **The dangerous part is that nothing catches this.** With the global override in
  place `npm audit` read 0, the whole gate went green, and `nx test core
--coverage` passed as well, because Jest 30 resolves its own newer
  `minimatch`. So a pin that looks like a clean sweep leaves two live landmines
  behind. This is the concrete reason the rule above says never to pin across a
  major. The sibling advisory GHSA-3jxr-9vmj-r5cp _was_ backported per line and
  is pinned.
  **Drop when:** `minimatch` 3.1.5 leaves the tree, or upstream backports to 1.x
  and 2.x.

`cargo audit` must exit 0. It reads its ignore list from
`apps/desktop/src-tauri/.cargo/audit.toml`, so it has to be run from that
directory. Every ignored advisory in that file states why it is not reachable
and what would let us drop the entry; a new finding means either a real fix or
a new entry with the same standard of justification. `cargo-audit` is not
bundled with Rust - install it once with `cargo install cargo-audit --locked`.

Migration changes require:

- additive and backward-compatible design unless an approved migration plan says otherwise;
- verification against a migrated database or a focused migration test;
- no modification of an already-applied migration;
- explicit rollback or recovery notes when rollback is not possible.

## Shared contracts and IPC

When changing `libs/core`, `libs/data`, Tauri command inputs/outputs, or shared models:

```bash
npm run quality:file-size
npm run type-check
npm test
npm run desktop:build
cargo test --lib
cargo clippy -- -D warnings
```

Verify both sides of every changed contract.

## UI and design-system changes

In addition to Angular checks:

- read `design-system/MASTER.md` and the relevant page contract;
- use shared tokens and i18n;
- verify keyboard and focus behavior;
- verify light and dark themes;
- run the repository's design-drift check when available;
- record native-only visual checks as pending if the Tauri UI cannot be launched.

## AI provider, CLI bridge, shell, MCP, or external-tool changes

Treat these as security-sensitive. Verify:

- fixed argv and no shell interpolation;
- timeouts, cancellation, and output bounds;
- no secret leakage through argv, logs, errors, or telemetry;
- explicit provider/tool allowlists;
- least-privilege filesystem and network access;
- user approval before installation or mutation;
- failure behavior with missing, broken, or untrusted tools;
- documentation MCP queries contain no source files, secrets, personal data, CV/job content, credentials, or private prompts;
- runtime automation MCPs that can execute JavaScript, invoke IPC, inspect application state, write files, or launch processes have explicit maintainer approval and a separate threat review.

Run the relevant Rust, Angular, and integration checks. Live provider calls must be opt-in and clearly recorded.

## Privacy-sensitive changes

For profiles, CVs, cover letters, job data, contacts, notes, analytics, exports, backups, notifications, sync, or external sources, verify:

- local-first behavior remains the default;
- only the minimum required data leaves the device;
- external transmission requires explicit user intent;
- secrets use OS-backed storage rather than project files;
- logs and error messages avoid personal data;
- deletion, export, retention, and failure behavior remain understandable.

## Native manual gate

Use `npm run desktop:dev` when the behavior depends on Tauri IPC, SQLite migrations, keychain, native dialogs, printing, updater, filesystem access, or native window behavior.

If a native gate cannot be run, mark the watch `partial` or record the check explicitly as pending. Passing unit tests or a browser preview is not evidence that a native Tauri flow works.

An agent cannot run it at all: synthetic clicks do not reach the Tauri webview - hover produces a hover state, a click at the same coordinates does nothing, reproduced against three targets - and every native path needs real database rows. So a pending check has to go somewhere a later session will find it. **Add it to `docs/internal/NATIVE_GATE_BACKLOG.md`**, which is one ordered list of what is outstanding, rather than restating it as the next first action in each new watch entry. That is how five pull requests came to pass with none of their walkthroughs driven.

## CI and unavailable checks

Applye may not have active PR CI for every command. Local verification must be listed command by command. Never convert an unavailable check into a passing result.
