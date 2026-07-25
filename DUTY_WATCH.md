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
