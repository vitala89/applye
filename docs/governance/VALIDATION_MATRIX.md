# Applye Validation Matrix

Use the smallest sufficient validation set for the affected layers. Do not claim a command passed unless it was run and the result was observed.

## Always before commit

```bash
npm run format:check
git diff --check
```

Review the final diff and confirm that no secrets, local databases, generated outputs, personal data, or unrelated files were added.

## Documentation-only changes

```bash
npm run format:check
git diff --check
```

Also verify links, command names, version claims, and current-state claims against the repository.

## Angular or TypeScript changes

Run the affected project first, then widen only when the change is shared or cross-cutting:

```bash
npm run type-check
npm run lint
npm test
npm run desktop:build
```

For narrow work, Nx project or affected commands are preferred when they give equivalent coverage.

## Rust, SQLite, Tauri command, or migration changes

From `apps/desktop/src-tauri` when appropriate:

```bash
cargo fmt --check
cargo test --lib
cargo clippy -- -D warnings
cargo check
```

Also run the relevant frontend type-check/build when Rust contracts cross Tauri IPC.

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
- failure behavior with missing, broken, or untrusted tools.

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

## CI and unavailable checks

Applye may not have active PR CI for every command. Local verification must be listed command by command. Never convert an unavailable check into a passing result.
