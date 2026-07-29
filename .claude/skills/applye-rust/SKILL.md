---
description: Rust and Tauri conventions for Applye - command shape, SQLite via sqlx, migrations, errors, privacy rules, tests, clippy and rustfmt. Use whenever writing or reviewing anything under apps/desktop/src-tauri.
---

# Applye Rust / Tauri Conventions

Rust 2021 behind Tauri 2, SQLite through `sqlx`, no server. Everything under
`apps/desktop/src-tauri/src`. Architecture context lives in
[`docs/architecture.md`](../../../docs/architecture.md).

## Module layout

```
src/
├── lib.rs          app setup, state, the invoke_handler registry
├── db/             pool, migrations, shared query helpers
├── keys/           OS keychain access
├── ai/             provider clients and the CLI bridge
└── commands/       one module per domain area
```

- A new capability is a new module in `commands/`, registered in the `invoke_handler` in `lib.rs`.
- **Size budget: ~800 lines per module.** `discover.rs` (3488), `tailoring.rs` (2699) and
  `documents.rs` (2070) are over it and are being split as they are touched - do not add to them
  without splitting first. Fetching, parsing, filtering and persistence are four responsibilities,
  not one file.
- Inline `#[cfg(test)] mod tests` is the current pattern, but once a module's tests pass roughly 300
  lines, move them to `tests/` so the implementation stays readable.

## Commands

- `#[tauri::command]`, `async fn`, returning `Result<T, String>`. The `String` is the message the
  UI will surface, so write it for a person: what failed and what they can do, never a raw
  `Debug` dump of an internal type.
- Database access comes from `State<'_, Db>`. Never open a second pool.
- Naming mirrors the frontend wrapper: `db_*` for storage, plain verbs for behaviour
  (`discover_scan`, `export_report`). The TypeScript wrapper in `libs/data` keeps the same name.
- Every command gets a typed request and response struct with `serde` derives. Do not pass loose
  `serde_json::Value` across the IPC boundary - the boundary is a contract, and `libs/core` holds
  the other half of it.
- Keep commands thin: validate, call a pure function, persist, return. Business logic belongs in a
  testable free function, not inside the command body.

## Data and migrations

- SQLite is the single source of truth. Schema changes are **numbered migration files** in
  `migrations/`, never an in-place edit of an existing one - a shipped migration has already run on
  someone's machine.
- Migrations must be idempotent where the seed matters: `INSERT OR IGNORE` with fixed ids, as the
  built-in Discover sources do.
- Use `sqlx::query_as::<_, T>` with a `FromRow` type over hand-mapped rows.
- Bind parameters. Never build SQL by string concatenation, even for a local database.
- Preserve data on update: `COALESCE(?, column)` rather than clobbering a column with `NULL`
  because the caller did not send it.

## Privacy and safety - non-negotiable

These are product guarantees, not preferences. A change that breaks one does not ship.

- **No telemetry, no analytics, no phoning home.** Nothing leaves the machine that the user did not
  explicitly trigger.
- **Network access is allow-listed by shape:** public APIs and RSS feeds meant for machine reading,
  plus company boards the user added. No HTML scraping, no login flows, no bulk harvesting.
- **HTTPS only.** No plain-HTTP fetches.
- Secrets go to the OS keychain via `keys/`. Never into SQLite, never into a log line, never into an
  error string that reaches the UI.
- An AI call sends the minimum for that one request, and only after a user action.
- New outbound requests, new file writes outside the app data directory, and new shell invocations
  each need a deliberate look at `capabilities/`.

## Errors

- `?` with a mapped message over `unwrap()` / `expect()`. A panic in a Tauri command takes the
  window with it.
- `unwrap()` is acceptable in tests and in a case that is genuinely unreachable - and then it
  carries a comment saying why.
- Log with `fern`/`log` at the level that matches; never log user content, job descriptions, CV
  text, or keys.

## Tests

- `cargo test` from `apps/desktop/src-tauri`. Database tests use an in-memory SQLite pool.
- Parsers are tested against fixtures captured from the real endpoint shape, not hand-written
  optimism.
- A bug fix ships with the regression test that would have caught it.
- Live network tests are `#[ignore]`d and run explicitly.

## Before you hand work back

```bash
cd apps/desktop/src-tauri
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test
```

- `cargo fmt` is the formatter; there is no custom `rustfmt.toml`, so defaults are the standard.
- Clippy must be clean for the module you touched.
- Note that the repository's ESLint config ignores `**/src-tauri/**` - nothing on the JavaScript
  side checks this code, so these three commands are the whole gate.

## Building the bundle

`frontendDist` in `tauri.conf.json` is resolved relative to `src-tauri/`, which is three levels
below the repository root. Getting that path wrong produces "Unable to find your web assets" after
a successful Rust compile - it has happened before and it survived five releases, because CI never
reached the build step.
