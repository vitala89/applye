# Applye Duty Watch

This file is the chronological handoff log for maintainers and AI agents working on Applye.

`docs/product/CURRENT_STATE.md` remains the canonical operational state. This log records how each work session changed, verified, or failed to change that state.

Append new entries at the top under `## Watch Log`. Do not erase older entries to hide mistakes or incomplete work. Correct inaccurate entries with a later entry and repository evidence.

## Duty completion checklist

Before a watch can be marked complete:

- [ ] The final diff was reviewed.
- [ ] Relevant checks from `docs/governance/VALIDATION_MATRIX.md` were run.
- [ ] `npm run format:check` passed, or an unavailable formatter was reported honestly.
- [ ] `git diff --check` passed.
- [ ] `docs/product/CURRENT_STATE.md` was updated if focus, blockers, implementation status, or next action changed.
- [ ] `CHANGELOG.md`, roadmap, ADRs, specs, migrations, privacy, security, and design docs were updated when applicable.
- [ ] Any failed, skipped, unavailable, or manual-only checks are recorded.
- [ ] The next first action is concrete and executable.

## Entry template

```md
### YYYY-MM-DD, concise watch title

- **Status:** complete | partial | blocked | rolled back
- **Agent/tool:**
- **Branch:**
- **Commits:**
- **Pull request:**
- **Objective:**
- **Completed:**
- **Not completed:**
- **Files or packages changed:**
- **Validation:**
- **Privacy/security impact:**
- **Decisions and assumptions:**
- **Risks or compatibility impact:**
- **Open issues or blockers:**
- **Next first action:**
- **Evidence:**
```

## Watch Log

### 2026-07-26, public-release documentation and repository hygiene pass

- **Status:** partial
- **Agent/tool:** Claude Code
- **Branch:** `main` (uncommitted; shares a working tree with the migration-restore watch below)
- **Commits:** not yet committed at the time of this entry
- **Objective:** Audit the repository as an outside reader would see it on the day it goes public, and fix what is stale, dangling, or internal-only. No feature work.
- **Completed:** (1) The version badge in all six READMEs read `0.25.0` against an actual `0.28.0`; bumped. (2) Four working documents that made the repository root read as a private workspace moved into `docs/internal/` - `AGENT_START_HERE.md`, `PROJECT_CONTEXT.md`, `INSTRUCTIONS.md`, `DUTY_WATCH.md` - with a new `docs/internal/README.md` stating what the directory is and that none of it is required reading to use or contribute. All 30 references across `AGENTS.md`, `CLAUDE.md`, `docs/ai/*`, `docs/product/*`, `.cursor/rules/*`, `.claude/skills/*`, `.cargo/audit.toml` and `commands/job_url.rs` were rewritten and verified to resolve. `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md` and `ROADMAP.md` stay at the root, where tooling and OSS convention expect them. (3) Twelve tracked files listed `STEP_BY_STEP_PLAN.md` as a canonical document; that file has never been in git, so every reader outside this machine saw a dead pointer. It is the pre-MVP bootstrap checklist, superseded by `ROADMAP.md` and `CURRENT_STATE.md`, so the references were removed rather than the file added. It is now gitignored, along with `AGENT_PROMPT_*.md`, so neither can be committed by accident. (4) Fifteen markdown links in `FEATURE_INDEX.md`, `IDEAS.md`, `CURRENT_STATE.md` and `feature-briefs/onboarding-wizard.md` pointed at `CAREER_OPS_ADOPTION.md`, an internal competitor analysis that is deliberately gitignored - all unlinked, the source is still named in prose so the provenance is not hidden. (5) CI re-enabled: `.github/workflows-disabled/ci.yml` moved to `.github/workflows/ci.yml` and the now-empty `workflows-disabled/` directory removed; `CONTRIBUTING.md` gained the CI reference, `npm run format:check` in the verification list, and a "Database migrations" section that states the never-edit-a-shipped-migration rule the watch below discovered the hard way.
- **Not completed:** The twelve media files the READMEs reference - `hero-banner.png`, `demo.gif`, six `screens/*.png`, two wordmark SVGs, `walkthrough-thumb.png` - still do not exist, so the public README will render twelve broken images. The maintainer chose to keep the placeholders and produce the assets separately per `docs/assets/ASSETS_BRIEF.md`. Nothing was committed; the working tree also holds the migration-restore work from the watch below.
- **Files or packages changed:** `README.{md,de,es,pl,ru,uk}.md`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/internal/*` (four moved files plus a new `README.md`), `docs/ai/{README,context-policy,project-state-policy,workflow}.md`, `docs/product/{README,FEATURE_INDEX,IDEAS,CURRENT_STATE}.md`, `docs/product/feature-briefs/onboarding-wizard.md`, `.cursor/rules/{000,250,600}`, `.claude/skills/aif-{planning-review,project-state-sync}/SKILL.md`, `.github/workflows/ci.yml` (moved), `apps/desktop/src-tauri/.cargo/audit.toml`, `apps/desktop/src-tauri/src/commands/{discover,job_url}.rs` (comment references only).
- **Validation:** Run and observed: `npx nx run-many -t lint test build` (6 projects, pass), `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml` (pass), `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` (pass), `npm run format:check` (pass), `git diff --check` (clean), and a script over every tracked markdown file confirming no relative link resolves to a missing path except the twelve known README media placeholders. **Not run:** the CI workflow itself - the repository is still private on the free plan, where Actions minutes are capped, so pushing the enabled workflow before the repository is public will fail on billing rather than on code.
- **Privacy/security impact:** Scanned every tracked file for API-key, AWS, GitHub-token and PEM patterns: none. The maintainer's personal address `vitala2089@gmail.com` is published in `CODE_OF_CONDUCT.md` and `SECURITY.md`; that is a deliberate choice but a role alias such as `security@applye.dev` would keep it out of scraper reach. `.gitignore` already covers sqlite files, `profile.md`, `.env`, and Tauri signing keys.
- **Decisions and assumptions:** Internal process docs stay in the repository rather than being untracked - the project is built with agents in the loop and the working agreement is worth publishing - but they belong under `docs/internal/`, not in the root where they crowd out the files a newcomer needs. `docs/product/CURRENT_STATE.md` and `docs/superpowers/plans/` were left where they are: 77 files reference them, and neither is visible from the repository root.
- **Risks or compatibility impact:** The document move breaks any external bookmark or agent configuration that hardcoded the old root paths. Within the repository every reference was rewritten and checked.
- **Open issues or blockers:** Three, in order of severity. (1) The migration restore in the watch below is uncommitted and is a hard release blocker - 0.28.0 does not start on an existing install. (2) The twelve missing README assets. (3) No installers have been published, so the README's Releases link stays a placeholder. Also: do not push the enabled CI workflow until the repository is actually public.
- **Next first action:** Commit the migration restore on its own (`fix(db): restore shipped migrations edited by the em dash sweep`), separately from this documentation pass, then verify `npm run desktop:dev` reaches the app window.
- **Evidence:** `git status --porcelain`, the gate output above, and the link-resolution script over `git ls-files '*.md'`.

### 2026-07-26, restore the edited migrations that brick every existing install

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main`
- **Commits:** not yet committed at the time of this entry
- **Objective:** `npm run desktop:dev` aborted at startup with `initialize database: "run migrations: migration 1 was previously applied but has been modified"`. Find the cause and fix it for every install, not only this machine.
- **Completed:** The em dash cleanup in `e06fd4b` (0.28.0) rewrote `—` to `-` inside nine already-shipped migration files: 0001, 0002, 0003, 0005, 0008, 0009, 0010, 0011 and 0020. All but three of those lines are SQL comments. sqlx stores a SHA-384 of every applied migration in `_sqlx_migrations` and refuses to run when a file it already applied no longer hashes the same, so this was not local corruption: any install that had already run 0001 - which is every install - would abort at launch on 0.28.0 with no in-app recovery path. All nine files are restored byte for byte from `e06fd4b^`. The dev database's stored checksum for version 1 now matches the restored file exactly, verified by reading `_sqlx_migrations` directly. A new `db::tests::applied_migrations_are_never_edited` pins the SHA-384 of all 26 migrations, so any future edit to a shipped migration fails a test instead of shipping. A new migration must add its line to the pinned table; a deleted one fails too.
- **Not completed:** No data migration was written for the three non-comment lines. They seed `sources.notes` for Remotive, We Work Remotely and Himalayas, and that column is never rendered - no template or component in `apps/desktop/src` reads it - so the em dashes in it never reach a user and the dash rule is not violated in output. If `notes` ever becomes visible, the fix is a new migration that updates those rows, never an edit to 0001.
- **Files or packages changed:** `apps/desktop/src-tauri/migrations/0001`, `0002`, `0003`, `0005`, `0008`, `0009`, `0010`, `0011`, `0020` (restored), `apps/desktop/src-tauri/src/db.rs` (new test module), `docs/product/CURRENT_STATE.md`, `CHANGELOG.md`, `DUTY_WATCH.md`.
- **Validation:** Run and observed: `cargo fmt --check` (pass), `cargo clippy --all-targets -- -D warnings` (pass), `cargo test` (281 passed, 1 ignored, up from 280 - the new checksum test), `npm run format:check` (pass), `git diff --check` (clean), and a direct read of `_sqlx_migrations` in `~/Library/Application Support/dev.applye.app/applye.db` confirming versions 1-3 hash to the restored files. **Not run:** the native `tauri dev` launch itself - the checksum equality is the direct proof that the abort is gone, and the dev process was left for the maintainer to restart.
- **Privacy/security impact:** None. No schema, stored value, IPC surface or network behavior changed; the migration files are back to the bytes users already ran.
- **Decisions and assumptions:** Restoring the files beats bumping past them or teaching the runner to ignore checksum drift, because the checksum guarantee is the only thing that catches a genuinely wrong edit to applied schema. The user-visible half of the dash rule is served by a future migration if ever needed, not by rewriting history.
- **Risks or compatibility impact:** Anyone who installed 0.28.0 on a clean machine ran the _modified_ files and has the new hashes stored; for them this restore inverts the failure. That is nobody in practice - 0.28.0 aborts on first launch for any pre-existing install and a clean install would have to have happened in the window since `e06fd4b`. Worth confirming before release that no such build was distributed.
- **Open issues or blockers:** Nothing blocking. The nine restored files still contain em dashes in their comments, which the repo-wide dash rule will keep flagging; the new test is what stops the next sweep from acting on it.
- **Next first action:** Restart `npm run desktop:dev` and confirm the app reaches the window, then commit the restore and the checksum test on a branch off `main`.
- **Evidence:** `git show e06fd4b -U0 -- apps/desktop/src-tauri/migrations/`; `cargo test` output; `sqlite3 ~/Library/Application\ Support/dev.applye.app/applye.db "select version, hex(checksum) from _sqlx_migrations"`.

### 2026-07-26, audit dependencies and harden the untrusted-input paths

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `chore/dependency-and-input-hardening`
- **Commits:** not committed at the time of writing; working tree carries the change
- **Pull request:** not opened yet
- **Objective:** Run the validation gates that had never been run on this project, then act on what a security pass over the code and the dependency tree turned up.
- **Completed:** Ran the gates first: `desktop:build` passes, which closes the bundle-size budget left unverified by the previous watch; `cargo clippy -- -D warnings`, `cargo fmt --check` and `cargo test --lib` all pass. `npm audit --omit=dev` is at zero - the 32 findings a bare `npm audit` reports are all build toolchain (Nx, Angular CLI, webpack-dev-server) and ship in nothing. `cargo audit` had never been run and was not even installed; it found 7 advisories. Fixed by dependency work: `cargo update` moved `docx-rs` to 0.4.22 and with it `quick-xml` 0.36.2 -> 0.41.0, clearing RUSTSEC-2026-0194/0195 on the DOCX path, and `pdf-extract` 0.7 -> 0.12 moved `lopdf` 0.34 -> 0.42, clearing RUSTSEC-2026-0187 on the PDF reader. Fixed by code: a new `commands::untrusted::catch_parser_panic` wraps all three untrusted-file parsers (PDF, DOCX, XLSX) so a panicking parser returns an error instead of killing the app; and `open_file` / `reveal_in_folder` now resolve their argument through `resolve_within`, which canonicalizes both sides and refuses anything outside `app_data_dir`, anything that is not a regular file, and anything missing. Eight new Rust tests cover both. `cargo audit` now exits 0 against a documented ignore list, and the dependency gates are recorded in the validation matrix.
- **Not completed:** Three advisories remain, each with a written justification in `.cargo/audit.toml`. `lopdf` 0.31 via `printpdf` is unreachable - printpdf only writes PDFs from our own content - and moving to printpdf 0.12 is a breaking rewrite of the export renderer that would put WYSIWYG parity at risk, so it was deliberately not attempted. `quick-xml` 0.39 via `calamine` is reachable via .xlsx import but has no fixed release to move to: calamine 0.35.0 is its latest. `rsa` is not in the desktop target's graph at all. No visual check in the running Tauri app; the toast work from the previous entry is still unverified on screen too.
- **Files or packages changed:** `apps/desktop/src-tauri/{Cargo.toml,Cargo.lock}`, `apps/desktop/src-tauri/.cargo/audit.toml` (new), `apps/desktop/src-tauri/src/commands/{untrusted.rs (new),mod.rs,documents.rs,import.rs,tailoring.rs}`, `docs/governance/VALIDATION_MATRIX.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `cargo fmt --check` pass, `cargo clippy --all-targets -- -D warnings` pass, `cargo test --lib` pass (280 passed, 1 ignored - was 272, the 8 new tests cover the panic guard and the containment rule), `cargo check` pass, `cargo audit` exit 0, `npm audit --omit=dev` 0 vulnerabilities, `npm run type-check` pass, `npm test` pass, `npm run lint` pass, `npm run format:check` pass, `git diff --check` pass. `desktop:build` was run at the start of this watch and passed; no frontend file changed afterwards.
- **Privacy/security impact:** This watch is the security change. Two reachable crash paths closed, one unvalidated launcher path contained, and the dependency tree now has a standing gate. No new data is read, stored, or sent. `open_file`'s new refusals are user-visible errors rather than silent no-ops.
- **Decisions and assumptions:** `catch_unwind` catches panics, not stack overflow - a genuine overflow aborts and cannot be caught in-process by any Rust code. That is stated in the guard's own doc comment so nobody mistakes it for complete protection; the real defence there is the `lopdf` upgrade. `open_file`'s Tauri signature gained an `AppHandle`, which Tauri injects, so the frontend still passes only `{ path }` and no TypeScript changed. `.cargo/audit.toml` sits under `.cargo/` because cargo-audit only reads that path, relative to the working directory - noted in the file and in the matrix, since running the command from the repo root would silently skip the ignore list.
- **Risks or compatibility impact:** `pdf-extract` 0.7 -> 0.12 is a five-minor jump; the call site is a single `extract_text(path)` and compiles unchanged, but extraction quality on real CVs is not covered by the test suite and should be spot-checked on a few real PDFs. The `open_file` containment assumes every path it receives is under `app_data_dir`; that holds for today's only caller (`generated_docs.file_path`), but a future feature that opens a user-chosen export location will fail loudly and need the rule widened deliberately.
- **Open issues or blockers:** None blocking. Watch for a `calamine` release on `quick-xml` >= 0.41 and a `printpdf` release on `lopdf` >= 0.42, and drop the matching `.cargo/audit.toml` entries when they land.
- **Evidence:** `cargo audit` went from "error: 7 vulnerabilities found" to exit 0. Rust tests 272 -> 280. The previous watch's claim of a 4-command gap between defined and registered Tauri commands was wrong - it came from a grep that missed the `ai::`-prefixed entries; a correct parse gives 91 defined and 91 registered, with no gap in either direction.

### 2026-07-26, close the toast-feedback gaps

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/toast-coverage`
- **Commits:** not committed at the time of writing; working tree carries the change
- **Pull request:** not opened yet
- **Objective:** Make the bottom-right toast fire on every user-initiated save, delete, duplicate, export, import and generate action, and on the failure of each, instead of only on the pages that happened to inject `ToastService`.
- **Completed:** Audited all 38 desktop page components plus the five `core/` components against their mutation and `catch` sites. The infrastructure was already sound - `ToastService`, `ToastErrorHandler` and `provideBrowserGlobalErrorListeners()` mean an _uncaught_ error toasts on its own - so every gap was a caught-and-swallowed error or a success path with only inline feedback. Fixed: `cover-letter-list` had zero toasts of any kind and now has the same set as its `cv-list` sibling (load, duplicate, export, delete, generate); `cv-list` gained success toasts for duplicate/delete/export/import/generate and error toasts for duplicate/delete; `cv-detail` and `cover-letter-detail` now toast on save, and `cv-detail`'s "save as template" gained both a success toast and a `catch` it did not have; `profile` toasts on save; `jobs` toasts on save-job, mark-applied and delete-job (all three previously wrote errors to `actionMsg`, which is invisible after the navigation those actions perform) plus the four AI-generation and two portal-drafting failure paths; `my-jobs` toasts on delete and import success and failure; `discover` toasts on save-row, add-source, remove-source and their failures, and on toggle-source, dismiss, undo and scan failures, all of which previously only reached `console.error`; `pipeline` quick view gained a `catch` on the priority change and a success toast on adding a comment. 16 new i18n keys added across all six locales.
- **Not completed:** Deliberately left silent: pure JSON-parse fallbacks (`tracker-report`, `tracker-report-print`, `jobs` cache reads), best-effort background writes the code comments mark as non-fatal, and read-only page loads that already render an honest empty state (`dashboard`, `onboarding-banner`, `first-launch`). Toasting those would fire on page entry rather than on a user action. No visual check in the running Tauri app was performed - the toast markup and container are untouched, so this is unchanged rendering of an existing component, but it is unverified on-screen.
- **Files or packages changed:** `apps/desktop/src/app/pages/{discover,documents,jobs,pipeline,profile}` (9 components), `libs/i18n/src/lib/translations/{en,de,ru,es,fr,uk}.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run type-check` pass (6 projects), `npm test` pass (759 tests, 6 projects), `npm run lint` pass (0 errors, 11 pre-existing non-null-assertion warnings), `npm run format:check` pass after reformatting `my-jobs.component.ts`, `git diff --check` pass. `npm run desktop:build` not run - no build-shape change, but that leaves the bundle-size budget unverified for this diff. Native visual check pending.
- **Privacy/security impact:** None. Error toasts render `String(e)`, the same text the affected pages already put into their inline status signals or the console; no new data source is read and nothing leaves the device.
- **Decisions and assumptions:** Error toasts stay i18n-free (`toast.error(String(e))`), matching the established pattern in `interview-prep` and `settings`; only success messages got new keys. Existing inline status text was kept rather than replaced - it is part of each page's layout, and the toast is additive. `jobs.applied_ok` already existed and is reused; a duplicate key added by mistake was caught by `type-check` and removed.
- **Risks or compatibility impact:** More toasts can read as noise where one user action triggers several writes. `TOAST_DEDUPE_MS` collapses identical repeats and `TOAST_MAX` caps the stack, so the failure mode is a briefly busier corner rather than a flood.
- **Open issues or blockers:** None blocking. `profile.component.ts:315` carries a pre-existing `broken-image` finding from the design hook, untouched by this diff and out of scope here.
- **Next first action:** Commit as `feat(ui): toast every save and failure across desktop pages`, then launch the desktop app and confirm the toast on one save and one forced failure per changed page before opening the PR.
- **Evidence:** `git diff --stat` shows 15 files, +189/-27. `this.toast.*` call sites went from 69 to 122 across `apps/desktop/src/app`.

### 2026-07-26, ship the completed locales

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/i18n-complete-locales`, then `docs/sync-state-after-i18n-merge`
- **Commits:** `eb461ef` on `main` (squash of `bcb969f`)
- **Pull request:** [#158](https://github.com/vitala89/applye/pull/158), merged
- **Objective:** Open and land the locale-completion branch, then correct the state documents, which still described it as unmerged.
- **Completed:** PR #158 opened against `main`, mergeable and clean with no required checks configured on the repository, squash-merged and the remote branch deleted. `docs/product/CURRENT_STATE.md` now records `main` as the focus with nothing in flight, and the locale work as merged rather than pending.
- **Not completed:** Nothing outstanding from this watch. The native-speaker read of `ru.ts`, `es.ts`, `fr.ts` and `uk.ts` carried over from the previous entry is still open, and is a review task rather than a code task.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run format:check` pass, `git diff --check` pass. Documentation-only change, so the matrix requires nothing further; the full gate set was run on the code in the previous entry and is unchanged by this one.
- **Privacy/security impact:** None.
- **Decisions and assumptions:** The previous entry recorded "pull request: not opened yet" and a next action of opening it, both true when written; this entry supersedes them rather than editing them, per the log's own rule.
- **Risks or compatibility impact:** None.
- **Open issues or blockers:** None.
- **Next first action:** Have a native speaker read `libs/i18n/src/lib/translations/{ru,es,fr,uk}.ts` for idiom, starting with the `onboarding` and `jobs.wizard` sections, which carry the longest sentences.
- **Evidence:** `git log --oneline -1` on `main` reads `eb461ef feat(i18n): complete the ru, es, fr and uk locales (#158)`; `gh pr view 158` reports state `MERGED`.

### 2026-07-26, complete the ru, es, fr and uk locales

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/i18n-complete-locales`
- **Commits:** see branch
- **Pull request:** not opened yet
- **Objective:** Audit which shipped languages are actually finished and finish the ones that are not.
- **Completed:**
  - **Audit.** Two i18n surfaces. The marketing site (`apps/web/src/app/i18n/`) is complete in all six locales and needed nothing - its `Messages` interface is exhaustive, so a missing key is a compile error. The desktop app was not: of 1438 keys, `de` had 1362 translated (the 76 gaps are words identical in German, brand names and empty strings), while `ru` had 36, `uk` 36, `es` 33 and `fr` 33. Those four covered `nav`, `actions`, `status`, `ai` and `common` only; `documents` (272 keys), `jobs` (242), `profile` (154), `onboarding` (145), `discover` (133), `tracker` (95), `interview` (77), `analytics` (62), `settings` (61), `dashboard` (54) and the rest rendered in English. The existing parity test could not catch this: the keys were all present, holding English values.
  - **Translation.** All four locales are now complete: 1438 of 1438 keys each. Placeholders (`{n}`, `{time}`, `{scope}`, ...) are preserved; UI strings that are shouted in English are shouted in the target language; the German `Eigenbemuehungen` report title stays German in every locale because it is the name of a German document.
  - **File split.** `translations.ts` was a single 3471-line file. It is now one file per locale plus `merge.ts` (the `stub()` deep merge), `types.ts` and a 13-line `translations.ts` that only assembles `TRANSLATIONS`. `en.ts` and `de.ts` were moved verbatim.
  - **New gate.** `libs/i18n/src/lib/translations/translations.spec.ts` asserts key parity for all five non-English locales and, separately, that no locale's value equals the English one unless the key is in `SHARED_WITH_ENGLISH` (122 entries: product names, URLs, console labels, format placeholders, empty strings, and real cognates such as the French `Documents` or the Spanish `No`). A third test fails if an allowlist entry goes stale. The de-only parity test in `apps/desktop/src/i18n-keys.spec.ts` was removed as redundant - the new spec covers all five locales - and a comment points at its replacement. `translate.service.spec.ts` had two tests that asserted the _absence_ of translations (`actions.close` reads `Close` in ru/es/fr/uk); they were rewritten to test `stub()` directly on a synthetic partial, which is what those tests were actually protecting.
  - **Bundle budget.** Completing four locales took the desktop initial bundle from 692.69 kB to 1.26 MB raw (173.86 kB to 240.53 kB transferred), breaking the `1mb` error budget in `apps/desktop/project.json`. Measured against `main` before and after to attribute it. Raised to `1300kb` warning / `1500kb` error after checking with the maintainer; `libs/i18n/README.md` records the numbers and why lazy-loading was not the fix here (`tFor()` is synchronous - the tracker renders its report in a document language that can differ from the UI language, inside a `computed`).
- **Not completed:** Lazy-loading locale chunks. Considered and deliberately deferred: it would make `tFor()` asynchronous and change bootstrap. Worth revisiting if startup parse time becomes measurable.
- **Files or packages changed:** `libs/i18n/src/lib/translations/` (split into `en.ts`, `de.ts`, `ru.ts`, `es.ts`, `fr.ts`, `uk.ts`, `merge.ts`, `types.ts`, `translations.ts`, `translations.spec.ts`), `libs/i18n/src/lib/i18n/translate.service.spec.ts`, `libs/i18n/README.md`, `apps/desktop/src/i18n-keys.spec.ts`, `apps/desktop/project.json`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`.
- **Validation:** `npm run format:check` pass. `git diff --check` pass. `npm run type-check` pass (6 projects). `npm run lint` pass (6 projects). `npm test` pass (6 projects; `i18n` 22 tests, `desktop` 696 tests). `npm run desktop:build` fail before the budget change, pass after. Browser preview: `ru` on Dashboard, `fr` on Documents, `es` on Analytics and `uk` on Pipeline all render translated, with no console error other than the expected `tauriInvoke called outside Tauri context`. Settings could not be exercised in the preview - it calls `db_get_settings` on load - so the locale was switched through the Angular debug API rather than through the language picker; the picker itself is unchanged by this work.
- **Privacy/security impact:** None. Static UI strings only; no data flow, storage, network or permission changed.
- **Decisions and assumptions:** (1) Locales stay wrapped in `stub(en, ...)` although nothing falls back today - it is the safety net for a key added to `en` later, which then reads in English instead of printing `actions.close`. (2) `SHARED_WITH_ENGLISH` is per locale, not global, so `Letter` being untranslated in French says nothing about Spanish. (3) Locale files are generated from flat key/value sources and then formatted with Prettier; the committed `.ts` files are the source of truth, the generator was scratch tooling under `tmp/` and is not committed.
- **Risks or compatibility impact:** No API or schema change. The visible risk is translation quality rather than breakage: 5752 strings were written in one pass and have not been reviewed by a native speaker of each language. The gates prove completeness and key integrity, not idiom.
- **Open issues or blockers:** None.
- **Next first action:** Open the PR for `feat/i18n-complete-locales` against `main`, then have a native speaker read `ru.ts`, `es.ts`, `fr.ts` and `uk.ts` for idiom - starting with `onboarding` and `jobs.wizard`, which carry the longest sentences.
- **Evidence:** `libs/i18n/src/lib/translations/translations.spec.ts` (parity plus the no-English check), `libs/i18n/README.md` (bundle budget reasoning and measurements), the build output quoted above.

### 2026-07-26, pre-release audit of section wiring and validation gates

- **Status:** partial
- **Agent/tool:** Claude Code
- **Branch:** `chore/release-readiness-audit`
- **Commits:** `7ad8fda` i18n fix, `71c7966` build gates, `0a9e4dd` docs
- **Pull request:** [#157](https://github.com/vitala89/applye/pull/157), open against `main`, mergeable at the time of this entry
- **Objective:** Before release prep, verify that every section is genuinely wired to every other, that the versions agree, and that the checks the repository claims to run actually run. Fix what is found.
- **Completed:**
  - **Version check.** `package.json`, `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/src-tauri/Cargo.toml` all read `0.28.0`. `CHANGELOG.md` heads at `[0.28.0] - 2026-07-26`. `apps/mobile` is a README only, as documented. No drift.
  - **Routing.** All 19 routes in `app.routes.ts` resolve, every navigation target in the app resolves to a defined route, and no route is orphaned. The three `print/*` routes are correctly unlinked (they are loaded by the hidden export window only).
  - **Tauri IPC.** 91 `#[tauri::command]` functions, all registered in `generate_handler!`, all reachable from `tauriInvoke`. One registered command, `validate_theme`, has no frontend caller; left in place deliberately (pure validator, no side effects, superseded in the UI by `check_style_safety`).
  - **Migrations.** `0001`-`0026`, gapless. `db.rs` uses `sqlx::migrate!("./migrations")`, which discovers the directory, so no hand-maintained registry can fall behind.
  - **Dash ban.** Three remaining en dashes, all parser-input test fixtures, matching what `CURRENT_STATE.md` already records as deliberate.
  - **Render pass.** All eleven top-level pages render in the browser preview with no unexpected console error. The only errors are the expected `tauriInvoke called outside Tauri context`; sections degrade to their empty states rather than crashing.
  - **Fix 1, user-visible.** `stub()` in `translations.ts` layered the four partial locales over English with a shallow spread, so any section a locale overrode lost every English key that locale omitted, and `resolve()` renders a missing key as the key itself. ru/es/fr/uk showed `actions.close` on the job-paste, CV-import, My Jobs import and pipeline quick-view dialogs and `common.back` / `common.next` in the apply wizard. `stub()` now deep-merges. Key counts before: en/de 1438, ru/es/fr/uk 1435. After: 1438 in all six.
  - **Fix 2, process gate.** `npm run type-check` ran zero tasks (`NX No tasks were run`, exit 0) because no project defined the target, while `AGENTS.md`, `CLAUDE.md` and the validation matrix all require it before commit. Added a `type-check` target to all six projects running `tsc --noEmit` on the project's app/lib tsconfig.
  - **Fix 3, process gate.** `libs/core` had `eslint.config.mjs` but no `lint` target, so `npm run lint` silently covered five of six projects. Added.
  - **Regression guard.** `translate.service.spec.ts` gained a parity test asserting every English key resolves in every locale, plus explicit cases for the three keys that were lost. Its existing "falls back to English" test asserted `tFor('en')` rather than a partial locale, so it could never have caught this; it now uses `ru`.
- **Not completed:** The native `tauri dev` gate. Nothing in this watch reaches Tauri IPC, SQLite, the keychain or native dialogs, so the CLI-bridge Settings and onboarding UI, the ATS card, the assisted installer and Interview Prep's stage CRUD remain unverified natively - exactly as the previous entry left them.
- **Files or packages changed:** `libs/i18n/src/lib/translations/translations.ts`, `libs/i18n/src/lib/i18n/translate.service.spec.ts`, `project.json` for `desktop`, `web`, `core`, `data`, `i18n`, `ui`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `DUTY_WATCH.md`. No application feature code changed.
- **Validation:** Run and observed on this branch: `npm run type-check` (6 projects, pass - meaningful for the first time), `npm run lint` (6 projects, pass; `core` contributes 11 warnings, 0 errors, all pre-existing), `npm test` (6 projects, pass; `i18n` 5 -> 14 tests), `npm run format:check` (pass), `nx build desktop` (pass), `npm run web:build` (pass, 39 static routes), `cargo fmt --check` (pass), `cargo clippy -- -D warnings` (pass), `cargo test --lib` (272 passed, 1 ignored), `git diff --check` (clean). **Not run:** `tauri dev`. `apps/web/public/sitemap.xml` was regenerated as a side effect of `web:build` and reverted, since only its `lastmod` dates moved.
- **Privacy/security impact:** None. No user data, storage, network, IPC surface, permission or AI provider behavior changed. The i18n fix is presentation-only and touches no stored value.
- **Decisions and assumptions:** `stub()` was fixed rather than the four locales being completed by hand, because a shallow merge re-breaks on the next key added to `en` while a deep merge cannot. `type-check` targets check the app/lib tsconfigs, not the spec ones: the spec configs use `module: commonjs` with `moduleResolution: node10` for `jest-preset-angular`, under which `@angular/core/testing` cannot resolve. Spec files are still type-checked, by ts-jest during `nx test`. `validate_theme` was left registered rather than removed, since removing an IPC command is a behavior change and was not asked for.
- **Risks or compatibility impact:** The deep merge changes what ru/es/fr/uk resolve for keys their bundles omitted - from the key name to English text. That is the intended fix and cannot regress a translated string, since a leaf the locale does define still wins. `type-check` and `core:lint` are new gates: they pass today, but they will now fail builds that previously slipped through, which is the point.
- **Open issues or blockers:** The native gate is the only thing between this branch and release prep. Two smaller observations, neither fixed and neither a blocker: the dashboard greeting treats every hour before noon as morning, so 1 a.m. reads "Good morning"; and `apps/web/tools/generate-sitemap.mjs` stamps today's date as `lastmod` on every URL whether or not the page changed.
- **Next first action:** Run `npm run desktop:dev` and walk the five never-natively-verified surfaces in order: CLI-bridge Settings, the onboarding AI step, the ATS card, the assisted installer, and Interview Prep stage add/edit/delete/reorder. Record each as pass or fail in the next watch entry.
- **Evidence:** Branch diff; check output quoted above; locale key counts before and after produced by extracting every leaf of `TRANSLATIONS` and diffing each locale against `en`.

### 2026-07-24, adopt Intentloom Duty Watch

- **Status:** complete
- **Agent/tool:** ChatGPT with GitHub connector
- **Branch:** `chore/adopt-intentloom-duty-watch`
- **Commits:** documentation commits on the branch
- **Pull request:** pending at the time of this entry
- **Objective:** Migrate Applye's existing AIF operating rules to the Intentloom Duty Watch workflow without duplicating the existing current-state system.
- **Completed:** Added the required agent entrypoint, Duty Watch log, project-specific validation matrix, and stronger default instructions for accepting and relieving a watch.
- **Not completed:** No runtime code, package dependency, automatic Intentloom pack installation, or security scanner integration was added.
- **Files or packages changed:** `AGENT_START_HERE.md`, `DUTY_WATCH.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/governance/VALIDATION_MATRIX.md`.
- **Validation:** Documentation-only review. Repository CI may be unavailable because Applye's normal CI workflow is currently disabled; the PR must report the actual checks observed.
- **Privacy/security impact:** No user data, secrets, Tauri permissions, AI provider behavior, or network behavior changed.
- **Decisions and assumptions:** `PROJECT_CONTEXT.md` stays the durable context source and `docs/product/CURRENT_STATE.md` stays the single operational state source. No duplicate `PROJECT_STATE.md` is introduced.
- **Risks or compatibility impact:** Agents that ignore repository instruction files cannot be forced by Git alone. Claude Code, Codex, Antigravity, and similar tools should be configured to honor repository instructions.
- **Open issues or blockers:** The portable Duty Watch pack is not yet implemented in Intentloom; this is a manual reference adoption.
- **Next first action:** Review and merge the adoption PR, then begin every new Applye session from `AGENT_START_HERE.md`.
- **Evidence:** Branch diff and pull request history.
