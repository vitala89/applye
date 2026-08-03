---
description: Rust and Tauri conventions for Applye - module boundaries, commands, SQLite, errors, privacy, tests, maintainability, and file-size budgets. Use whenever writing or reviewing anything under apps/desktop/src-tauri.
---

# Applye Rust / Tauri Conventions

Rust 2021 behind Tauri 2, SQLite through `sqlx`, no server. Everything under
`apps/desktop/src-tauri/src`. Architecture context lives in
[`docs/architecture.md`](../../../docs/architecture.md). The cross-stack quality contract is
[`docs/governance/CODE_QUALITY.md`](../../../docs/governance/CODE_QUALITY.md) and must be read before editing.

## Before editing

- Check the current line count and responsibilities of every Rust file you plan to grow.
- Identify the pure function or focused service that can be tested without Tauri before writing the
  command wrapper.
- Use current official Rust, Cargo, Tauri 2, sqlx, and SQLite documentation for version-sensitive
  APIs. Context7 may be used for a minimal documentation query, but its output is not authoritative.
- Existing files above budget may not grow. Extract first.

## Module layout

```text
src/
├── lib.rs          app setup, state, the invoke_handler registry
├── db/             pool, migrations, shared query helpers
├── keys/           OS keychain access
├── ai/             provider clients and the CLI bridge
└── commands/       one module per domain area
```

- A new capability belongs in a focused module, registered from `lib.rs`.
- **Hard budget: 500 non-empty lines of Rust source per file, counted separately from 600 for the
  file's inline `#[cfg(test)]` items.** Rust keeps its tests in the same file by convention, so one
  combined number said little about either half; see `docs/governance/CODE_QUALITY.md`. The ratchet
  is enforced by `npm run quality:file-size`, which is diff-scoped - use
  `npm run quality:file-size:all` for a repository-wide picture.
- No Rust file is currently over either budget. `discover.rs`, `tailoring.rs`, and `documents.rs`
  were the legacy oversized modules and have been split; they are still the largest domains, so
  extract a cohesive responsibility rather than growing them again.
- Split by responsibility, for example transport/command, validation, parsing, domain logic,
  persistence, provider integration, formatting, or export. Do not create arbitrary `part1.rs` files.
- Large inline `#[cfg(test)] mod tests` blocks move to focused test modules before the file reaches
  the budget.

## Commands

- Use `#[tauri::command]`, `async fn`, returning `Result<T, String>` while that is the established IPC
  contract. The string is user-facing, so explain what failed and what the user can do.
- Database access comes from `State<'_, Db>`. Never open a second pool.
- Naming mirrors the frontend wrapper: `db_*` for storage and plain verbs for behavior.
- Every command gets typed request and response structs with `serde` derives. Do not pass loose
  `serde_json::Value` across IPC.
- Keep commands thin: validate, call focused domain logic, persist, return.
- Prefer typed request objects over long parameter lists.
- Do not let one command become an orchestration engine. Extract a service/module with explicit
  inputs, outputs, and failure behavior.

## SOLID and testable design in Rust

- One module or type should have one reason to change.
- Depend on small traits only where multiple implementations or test isolation justify them. Do not
  create traits mechanically for every struct.
- Prefer composition and free functions over deep type hierarchies.
- Keep parsing, validation, scoring, mapping, and transformations pure where practical.
- Keep I/O at explicit boundaries: SQLite, filesystem, network, keychain, shell, and Tauri IPC.
- Avoid global mutable state and hidden order dependencies.
- Return typed internal errors where useful, then map once at the IPC boundary to a clear user-facing
  string.

## Data and migrations

- SQLite is the single source of truth.
- Schema changes are new numbered migration files. Never edit an already-applied migration.
- Migrations must be idempotent where seed data matters.
- Use `sqlx::query_as::<_, T>` with typed rows where appropriate.
- Bind parameters. Never build SQL by string concatenation.
- Preserve data on partial updates rather than replacing omitted fields with `NULL`.
- Keep SQL/persistence separate from parsing and UI-facing error formatting.

## Privacy and safety

These are product guarantees, not preferences.

- No telemetry, analytics, or background phoning home.
- Network access is allow-listed to public APIs/feeds intended for software and company boards the
  user explicitly configured. No HTML scraping or login automation.
- HTTPS only.
- Secrets go to the OS keychain. Never SQLite, logs, argv, or UI error strings.
- AI calls send the minimum data for one explicit user action.
- New outbound requests, file writes outside app data, shell invocations, permissions, plugins, and
  MCP integrations require a deliberate security review of `capabilities/` and failure behavior.
- Community Tauri runtime MCP bridges are not enabled by default. They can execute JavaScript,
  invoke IPC, and inspect application state, so they require explicit maintainer approval and a
  separate security review.

## Errors

- Prefer `?` with a mapped error over `unwrap()` or `expect()` in runtime code.
- `unwrap()` is acceptable in tests and genuinely unreachable cases with a comment explaining why.
- Never surface raw `Debug` dumps of internal types to the UI.
- Never log user content, job descriptions, CV text, cover letters, notes, contacts, or keys.

## Tests

- Run `cargo test` from `apps/desktop/src-tauri` or with the manifest path.
- Database tests use an in-memory SQLite pool.
- Parsers use realistic fixtures matching the external payload shape.
- A bug fix ships with the regression test that would have caught it.
- Extracted logic keeps equivalent or improved coverage before the old implementation is removed.
- Live network tests are `#[ignore]` and run explicitly.
- Native Tauri behavior still needs the relevant `npm run desktop:dev` manual gate. Browser-only
  checks are not evidence for IPC, SQLite migrations, keychain, dialogs, filesystem, updater, or
  native window behavior.

## Before handoff

```bash
npm run quality:file-size
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

- Report before/after line counts for touched Rust files near or above budget.
- `cargo fmt` is the formatter.
- Clippy must be clean for the touched module.
- ESLint ignores `src-tauri`; Rust checks are the gate for this code.
- Never claim a command passed unless it was run and observed.

## Building the bundle

`frontendDist` in `tauri.conf.json` is resolved relative to `src-tauri/`, which is three levels below
the repository root. A successful frontend or Rust compile alone does not prove the packaged bundle
contains the correct assets or works under the production CSP.
