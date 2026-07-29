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

### 2026-07-30, four red workflows triaged: three fixed, one is a migration rather than a CI bug

- **Status:** partial
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `fix/release-build-path`, `chore/rust-deps-major-bumps`, `chore/dev-tooling-safe`, `docs/duty-watch-ci-fixes`
- **Commits:** `0abeb1f`, `e03994f` (merged as `6c05322`); `a66d002`, `b906cbb`; `27d5a95`, `3af6243`
- **Pull request:** #197 (merged), #198, #199, and this docs branch
- **Objective:** Review the open pull requests and fix the failing GitHub Actions runs.
- **Completed:**
  - **The release matrix.** All four `v0.29.1` jobs died in seconds on `nx: not found` (exit 127) before the frontend was built, so the tag produced no installers on any platform. `tauri-action` calls `tauri build` directly and only npm puts `node_modules/.bin` on `PATH`; nothing local reproduced it because `desktop:build:tauri` wraps the command. `beforeBuildCommand`/`beforeDevCommand` are `npx`-prefixed, `release.yml` gained an explicit frontend-build plus CSP-guard step ahead of `tauri-action`, and `tools/verify-csp-compat.mjs` now resolves its paths from `import.meta.url` rather than the cwd, since Tauri runs it from `src-tauri/` while npm and CI run it from the repository root. Merged as #197; CI green on `main`.
  - **The rust dependency group (#184 -> #198).** The manifest bump alone cannot compile. `zip` 8 made `FileOptions` generic over its extra-field type, so the docx repacker now builds `SimpleFileOptions`. `sqlx` 0.9 added a `SqlSafeStr` bound that rejects any SQL string that is not `&'static str`, which caught four table-name-interpolating queries; each was audited and wrapped in `AssertSqlSafe` with the reasoning recorded at the call site. `rust-version` moved 1.77.2 -> 1.94.0, which is what `sqlx` 0.9 requires. `calamine` and `base64` needed no code changes.
  - **The dev-tooling group (#196 -> #199).** Split into the part that can ship: commitlint, swc, jest-environment-node, jest-util, ts-jest, prettier, typescript-eslint, `@typescript-eslint/utils`, plus `@types/node` 20 -> 26, `jsonc-eslint-parser` 2 -> 3 and `lint-staged` 16 -> 17. `typescript`, `eslint`, `@eslint/js`, `angular-eslint`, `@schematics/angular` and `zone.js` are held.
- **Not completed:**
  - **#185, the Angular 22 group.** Left untouched. It is a scoped migration, not a CI fix, and it is double-blocked (see Open issues). A `chore/angular-22` branch appears in the local reflog from an earlier session, so work on it may already exist elsewhere.
  - **Re-releasing `v0.29.1`.** The fix is on `main` but the tag has not been re-run, so there are still no installers for it. Deliberately left as a maintainer decision.
  - **Closing #184 and #196**, and commenting on them to point at their replacements. Left to the maintainer.
- **Files or packages changed:** `.github/workflows/release.yml`, `apps/desktop/src-tauri/tauri.conf.json`, `tools/verify-csp-compat.mjs`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/commands/{jobs,settings,tailoring}.rs`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`
- **Validation:**
  - #197: `npx nx run desktop:build` then `npm run verify:csp` passed from the repository root and again from `src-tauri/`, which is the cwd the old relative paths broke on. `npm run format:check` and `git diff --check` clean. CI green on the merge commit.
  - #198: `cargo test` 286 passed, 0 failed, 1 ignored. `cargo clippy` 0 errors. `cargo fmt --check` clean. `git diff --check` clean. CI green on the pull request, CodeQL included. `nx format:check` could not run in that worktree (no `node_modules`); the diff there is Rust plus `CHANGELOG.md`, and the changelog was checked with `prettier --check` directly.
  - #199: `npx nx run-many -t lint test build --all` passed for all 6 projects, `npx nx format:check` clean (prettier 3.9.6 reformats nothing), `npm run verify:csp` passed on the built bundle, and committing exercised husky + lint-staged 17 + commitlint 21.2.1 end to end. CI was still running when this entry was written.
  - Local `rustc` was 1.92.0 and could not resolve `sqlx` 0.9 at all, so the toolchain was updated to stable 1.97.1 before any of the Rust work. That is a change to the maintainer's machine, not to the repository.
- **Privacy/security impact:** The `sqlx` 0.9 `AssertSqlSafe` wrappers are the only security-relevant change. They bypass a new compile-time injection guard, so each was audited rather than waved through: three interpolate a string literal from an array declared in the same function (`db_delete_job` and its test), and the fourth interpolates a table name read from this app's own `sqlite_master` during factory reset. No caller-supplied value reaches any of them, every one still binds its parameters, and the audit is written at each call site so a future edit cannot quietly widen the input.
- **Decisions and assumptions:** Superseding the two Dependabot PRs with hand-authored branches was chosen over pushing to the bot's branches, which stops Dependabot from maintaining them and loses the audit trail. The dev-tooling group was split rather than held whole, because most of it is independent of the Angular version and holding all of it would keep 12 bumps hostage to a migration. `rust-version` was raised to match `sqlx`'s real requirement rather than left as a claim the code no longer satisfies.
- **Risks or compatibility impact:** `rust-version` 1.94.0 is recent; anyone building locally on an older toolchain now gets a hard cargo error rather than a confusing compile failure. Both workflows use `dtolnay/rust-toolchain@stable`, so CI and the release path are unaffected. `@types/node` 26 over Node 20 typings is the widest surface in #199 and is covered by the full lint/test/build run.
- **Open issues or blockers:** Angular 22 (#185) needs two things at once: TypeScript pinned into `>=6.0.0 <6.1.0`, and an `@ngrx/signals` that supports Angular 22 - only `22.0.0-beta.0` exists, and the current stable 21.1.1 pins `@angular/core: ^21.0.0`. `@ngrx/signals` is imported from exactly one file, so dropping it is a real alternative to waiting on the beta. Until that lands, Dependabot will keep reopening #185 and #196; ignore rules for those specific majors would stop the churn.
- **Next first action:** Merge #198 and #199 once green, close #184 and #196 as superseded, then re-run the release workflow against `v0.29.1` so the tag finally produces installers.
- **Evidence:** `gh run view 30497973236 --log-failed` for the `nx: not found` failure on all four release jobs; `gh run view 30498225477 --log-failed` for the `zip`/`sqlx` compile errors; `gh run view 30498270577 --log-failed` for `The Angular Compiler requires TypeScript >=6.0.0 and <6.1.0 but 5.9.3 was found instead`; `gh run view 30497885920 --log-failed` for `Failed to process project graph` on the dev-tooling branch; `npm view @ngrx/signals@latest peerDependencies` for the Angular 21 peer pin.

### 2026-07-29, the launch sections land in all six READMEs, and the desktop build is found to have been broken the whole time

- **Status:** partial
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `main` (uncommitted working tree at the end of this watch - the maintainer asked for the work, not for a commit)
- **Commits:** none
- **Pull request:** none
- **Objective:** Compare the repository against `santifer/career-ops` ahead of going public, add the sections and repository infrastructure that were genuinely missing, and produce installer images - macOS first, since that is what the maintainer can verify locally.
- **Completed:**
  - Six READMEs (en, de, es, pl, ru, uk) gained: an FAQ, a "Where Discover looks" table naming all eleven built-in sources and the four ATS board types, "Also open source" promoted out of the author section, a "Connect" section carrying `x.com/vitala89`, a tech-stack badge row, and links to `SUPPORT.md` and the new issue template. Tables of contents updated in every language.
  - `SUPPORT.md`, `.github/dependabot.yml` (npm, cargo, github-actions, grouped and monthly), `.github/CODEOWNERS`, and `.github/ISSUE_TEMPLATE/applye-helped.yml` - the last one modelled on career-ops's `i-got-hired.yml`, because with no telemetry in the app an issue template is genuinely the only feedback channel that exists.
  - `docs/RELEASE.md`: how the tag-triggered matrix produces installers, how to build each OS by hand, why cross-compiling from macOS is a trap, and how to verify Windows and Linux artifacts from an Apple Silicon Mac including the ARM-versus-x86_64 problem, plus a per-platform smoke-test checklist.
  - **`frontendDist` in `tauri.conf.json` was wrong and the desktop bundle could not be built.** It read `../../dist/apps/desktop/browser`, which resolves from `src-tauri/` to `apps/dist/...`; the correct path is three levels up. `tauri build` failed with "Unable to find your web assets". Fixed, and the build then produced `Applye_0.29.0_aarch64.dmg` (16 MB, UDZO), `Applye.app`, and the updater tarball.
  - **A privacy audit over the whole history, not just the working tree** - the step `CURRENT_STATE.md` has listed as required before the repository goes public. Nothing sensitive was ever committed: no `.env`, no `*.sqlite`, no `*.key` or PEM material, no `profile.md`, no API-key-shaped strings, no URLs carrying credentials. Community files already use `@applye.dev` aliases rather than a personal address. Three absolute home-directory paths were found in documentation and removed, keeping each note's meaning - including the one describing the export path burned into the tour video, which is the bug the previous watch fixed. Two things are recorded as maintainer decisions rather than fixed here: 648 commits are authored with a personal Gmail address, which becomes public and scrapable the moment the repository opens (the cheap fix is GitHub's private-email setting plus a local `user.email` change, which stops the growth without rewriting history), and the same address appears in two internal logs, which is only worth scrubbing together with that. The home path also survives inside older history blobs; rewriting history to remove a machine account name would cost every SHA in the repository and is not worth it.
  - **An architecture pass over the frontend, on the maintainer's request, before the repository goes public** - the reasoning being that the code is about to become a portfolio artifact. Findings first, since they set up what was done: the dependency graph is a clean stack (`core` and `ui` depend on nothing, `i18n` and `data` on `core`, apps on the layers below) with zero deep imports into library internals anywhere in the repository - but nothing enforced it, all six projects had `"tags": []`, and `@nx/eslint-plugin` 23 does not include `enforce-module-boundaries` in `flat/base`, which was verified by loading the config programmatically rather than assumed. `jobs.component.ts` was 4975 lines with the class starting at line 2331, because template and styles were inline. `libs/data` is desktop-only in practice. `tsconfig.base.json` carried four unused bare aliases that shadow npm package names.
  - Acted on all of it: tags and `depConstraints` added and green on all six projects; the bare aliases removed; the template and styles extracted, taking the file to 2795 lines; `OnPush` added to 53 components that were verified signal-based or static; `docs/architecture.md` extended with the layer diagram and the dependency rule, and two stale claims in it corrected (DOCX-first export, and a `SignalStore` per feature area - there is one store).
  - Two skills, `.claude/skills/applye-angular` and `.claude/skills/applye-rust`, so the conventions are readable by an agent and a human at the same time, and `.mcp.json` wiring the first-party Angular CLI MCP server read-only after probing it over stdio to confirm it starts and exposes `get_best_practices`, `search_documentation`, `find_examples` and `list_projects`.
  - Answered a question that had a non-obvious answer: `OnPush` is **not** Angular 21.2's default. The installed runtime reads `onPush: componentDefinition.changeDetection === ChangeDetectionStrategy.OnPush`, so omitting it gets you eager checking. The flip is staged rather than done - `ChangeDetectionStrategy.Default` is already deprecated in this version in favour of `Eager`, and `main` has reversed the default - which is the argument for declaring `OnPush` explicitly now.
- **Not completed:**
  - Windows and Linux installers. They cannot be produced on this machine (Windows needs MSVC and WiX/NSIS, Linux needs the GTK/webkit2gtk stack) and CI cannot produce them while billing blocks it. Options and VM verification paths are written up in `docs/RELEASE.md`.
  - Updater-artifact signing locally: the key at `~/.tauri/applye_updater.key` is password-protected and the password is the maintainer's. The `.dmg` itself built; only the signature step failed.
  - The `PLACEHOLDER: release links` block in the six READMEs. Left in place deliberately - replacing it with links to assets that do not exist yet would be worse than the placeholder.
  - LinkedIn in the Connect section - resolved later in the same watch once the maintainer supplied the URL; it is in all six READMEs.
  - **The Tier-1 architecture work**, which is scoped but not started: `JobsComponent` is still 2795 lines and still owns a wizard, a scoring view and a document flow that belong in services; `pages/` has not been reorganised into per-feature `features/<name>/{pages,components,services}`; eight large stateful desktop screens are still on eager change detection; and `discover.rs` (3488 lines), `tailoring.rs` (2699) and `documents.rs` (2070) are still single modules mixing fetching, parsing, filtering and persistence.
  - **Opening the repository**, which is where the watch stopped by request. The maintainer was asked to decide two coupled things first - whether new commits should carry the personal Gmail or a GitHub noreply address, and who flips visibility - and chose to review the architecture before answering either. Nothing about visibility or git identity was changed.
- **Files or packages changed:** `README.md`, `README.de.md`, `README.es.md`, `README.pl.md`, `README.ru.md`, `README.uk.md`, `SUPPORT.md`, `docs/RELEASE.md`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/applye-helped.yml`, `apps/desktop/src-tauri/tauri.conf.json`, `.gitignore`, `CHANGELOG.md`, this file, `docs/product/CURRENT_STATE.md`.
- **Validation:** the full gate, run after the architecture pass and all green: `nx run-many --target=lint` (6 projects, 0 errors, 21 pre-existing `no-non-null-assertion` warnings, none added), `--target=type-check` (6 projects), `--target=test` (6 projects, 848 tests: desktop 717, web 76, core 32, ui 22, i18n 1), `--target=build` (3 projects), `cargo clippy --all-targets -- -D warnings` (clean), `npm run format:check` (pass), `git diff --check` (clean). The desktop bundle also built end to end after the `frontendDist` fix, which is the strongest available evidence that change is correct, since the same command failed before it.
- **Privacy/security impact:** None. No user data paths, storage, sync, or network behaviour changed. The signing key was read from `~/.tauri/` into an environment variable for the build and is not in the repository; no password was guessed or brute-forced. `LAUNCH_PREP.local.md` is a maintainer-only working file, covered by a new `*.local.md` entry in `.gitignore`.
- **Decisions and assumptions:**
  - **No CLI for Applye.** career-ops is CLI-first because the CLI _is_ the product; Applye's product is the Tauri app over local SQLite. A CLI would mean reimplementing the domain a second time with its own tests, docs, i18n, and release surface. Recorded as a decision, not a deferral. A headless flag on the existing binary stays possible later.
  - Copied nothing from career-ops verbatim. Every section is written for Applye's own architecture and claims.
  - Deliberately did _not_ add Product Hunt, Trendshift, star-history, "Featured in", Discord, contributor-graph, or funding badges. Those work for career-ops because 62k stars stand behind them; on a repository at zero they read as theatre.
- **Risks or compatibility impact:** The `frontendDist` fix changes how every build resolves the frontend. It is verified on macOS only; the same relative path is used on all platforms, so CI should behave identically, but the first Windows and Linux runs are the actual proof. The eleven-source table is a factual claim about the app that will rot if migrations add or remove sources.
- **Open issues or blockers:** GitHub Actions billing, unchanged from the previous watch and now doubly blocking - it prevented CI from ever reaching the build, which is why a broken `frontendDist` survived undetected across five tagged releases.
- **Next first action:** Decide the billing question - either fix the payment method and re-push `v0.29.0`, or accept that the first real build happens after the repository is public. The privacy audit is done and clean; the only thing left from it is the maintainer's call on the commit-author email.
- **Evidence:** `gh run view 30457446286` showing all four jobs refused on billing; the failing and then succeeding `tauri build` output; `ls -lh` and `hdiutil imageinfo` of the produced `.dmg`; `LAUNCH_PREP.local.md` sections 5 and 7.

### 2026-07-29, the press kit is built, and CI is found to be failing on billing rather than absent

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `chore/press-kit`
- **Pull request:** opened at the end of this watch
- **Objective:** Close the two remaining items that did not depend on the maintainer's credentials: the press kit placeholder, and the branch-deletion manifest living only in a session scratchpad.
- **Completed:**
  - `apps/web/public/press/applye-press-kit.zip` (1.1 MB) and `apps/web/tools/build-press-kit.sh` that assembles it: wordmarks, the app icon and symbol in both themes, three README screenshots, the hero banner, and a `README.txt` covering mark usage and what the screenshots contain. The press page links it and describes what is inside instead of telling a journalist to ask the author.
  - The archive rebuilds byte-identically, verified by building twice and comparing SHA-256. That needed pinned timestamps as well as `zip -X` and a sorted file list, because a zip stores every entry's mtime and staging into a temp directory stamps them with the moment the script ran.
  - The branch-deletion manifest was copied out of the session scratchpad to `~/applye-branch-restore-2026-07-29.txt`, since the scratchpad dies with the session.
  - `v0.29.0` tagged on `33ffec2` and released, closing the tag work from the previous watch.
- **Not completed:** The site deploy, which needs the maintainer's Cloudflare credentials. `applye.dev` still serves the pre-0.29.0 `CHANGELOG.md`, so the live changelog page is a release behind.
- **Files or packages changed:** `apps/web/public/press/applye-press-kit.zip`, `apps/web/tools/build-press-kit.sh`, `apps/web/src/app/press.html`, `.gitattributes`, `CHANGELOG.md`, this file.
- **Validation:** `nx run web:test` (6 suites, 76 tests, pass), `nx run web:lint` (pass), `nx run web:build` (pass, with the zip confirmed in `dist/apps/web/browser/press/` and the download link present in the prerendered `press/index.html`), `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan of the added lines (0), and the archive built twice to compare hashes.
- **Privacy/security impact:** None new, and one thing checked deliberately: every file in the kit is already published in the repository or on the site, and the screenshots are the demo persona against invented companies. The `README.txt` says so, so a publication cannot mistake them for a real user's data.
- **Decisions and assumptions:** Three screenshots and the hero rather than all six, because a press kit is a selection and the three chosen are the ones a reader has already seen in the README. The zip is LFS-tracked: it is a rebuild of assets already in LFS, so storing full copies in Git would duplicate the same media a second time.
- **Risks or compatibility impact:** The kit is downstream of the brand assets and the screens. Nothing enforces the link - if a wordmark or screenshot is regenerated, the zip is stale until the script is rerun, and its contents are what a publication will print. Worth rerunning as the last step of any brand change.
- **Open issues or blockers, and this is the one that matters:** **GitHub Actions runs on this repository and fails within seconds on billing - it is not absent, and `apps/web/tools/deploy.sh` said it was.** `CURRENT_STATE.md` had it right; the deploy script's header comment did not, and is corrected here, because "unavailable" and "failing on every push" imply different things about what `main` looks like to a visitor. Every job returns "The job was not started because recent account payments have failed or your spending limit needs to be increased". Three consequences: `release.yml` has never built an installer, so all five releases carry notes and no assets; the `deploy-web` job in `ci.yml` never runs, which is why deploying is manual; and `main` now shows a red run per push, including four this watch produced by pushing tags. A public repository opening with a red CI badge and asset-less releases is a worse first impression than any of the media work in the last several watches was worth, so billing should be fixed before the repository goes public.
- **Next first action:** Fix the GitHub billing block, then re-run the release build for `v0.29.0` so the release carries installers - `release.yml` triggers only on tag push and has no `workflow_dispatch`, so that means re-pushing the tag or uploading locally built artifacts with `gh release upload`.
- **Evidence:** Branch diff; the two SHA-256 hashes of the rebuilt archive; `unzip -l` of the kit; `gh run view` output naming the billing failure.

### 2026-07-29, dead branches pruned, three untagged releases recovered, 0.29.0 cut

- **Status:** complete; the 0.29.0 tag and release wait on the PR being merged
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `chore/release-0.29.0`
- **Pull request:** opened at the end of this watch
- **Objective:** Audit branches, tags, releases and version strings for consistency before the repository goes public, and clean up what is dead.
- **Completed:**
  - **Branch cleanup.** 66 remote and 20 local branches deleted. Every one was checked first by comparing the files it touched against `main` rather than by commit SHA, because squash merges leave branch commits looking unmerged forever: `git rev-list` claimed `feat/web-analytics` was 46 commits ahead when its content had been in `main` for days. Four remote branches had no pull request at all - `docs/readme`, `feat/i18n-states`, `feat/web-landing` proved byte-identical to `main` and were removed; `backup/pre-history-rewrite` is the deliberate snapshot from before the LFS history rewrite and stays. The three local `backup/*` branches stay for the same reason. A restore manifest with every deleted branch's SHA is in the session scratchpad.
  - **Three releases recovered.** `v0.26.0`, `v0.27.0` and `v0.28.0` existed as versions in the manifests and as sections in the changelog, but the tag list stopped at `v0.25.0` and GitHub showed one release against an app reporting `0.28.0`. All three are now annotated tags on `c656c40`, `7dffc6c` and `65330a3` - in each of those commits the version bump and the changelog section land together, which is exactly what `v0.25.0`'s commit did, so the convention was read off the history rather than invented - with GitHub Releases carrying each section's text.
  - **0.29.0 cut.** Version bumped in all three manifests and the six README badges, `[Unreleased]` promoted to `## [0.29.0] - 2026-07-29`, and the changelog's link references repaired: they had `[Unreleased]` comparing against `v0.25.0` and no entries for the three recovered versions.
- **Not completed:** The `v0.29.0` tag and its release, which have to wait until this branch is merged so the tag can point at the release commit on `main`.
- **Files or packages changed:** `package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`, `CHANGELOG.md`, all six `README*.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** `npm run format:check`, `git diff --check`, an em-dash and en-dash scan of the changed lines, and the three published releases confirmed with `gh release list`. The site was checked live: `applye.dev/changelog/` renders the changelog correctly. **Not run:** the test, lint, build and Rust gates - see the risk note below, which is the reason they matter here.
- **Privacy/security impact:** None. No user data, network or permission surface.
- **Decisions and assumptions:** Tags point at the version-bump commits rather than at a synthetic release commit, because that is what the existing history does. GitHub will show all three as published on 2026-07-29 since that is when they were created; the changelog carries the real dates and `CURRENT_STATE.md` says so rather than pretending otherwise. Backup branches were kept: they are cheap and exist precisely for the case where this kind of cleanup turns out to have been wrong.
- **Risks or compatibility impact:** A version bump touches the Tauri manifest and `Cargo.toml`, so the desktop build is the gate that matters and it has not been run on this branch. Run `nx build desktop` and `cargo test --lib` before merging. Deleting 86 branches is the kind of thing that is only reversible while the manifest exists - it is in a session-scoped scratchpad, so anything worth keeping should be recreated now rather than later.
- **Open issues or blockers:** None.
- **Next first action:** Run the desktop and Rust gates on this branch, merge, then tag `v0.29.0` on the merge commit and publish its release from the new changelog section.
- **Evidence:** Branch diff; `gh release list` output; the deletion manifest; the file-level comparisons behind each branch deletion.

### 2026-07-29, the last README placeholder is filled, and the tour video is found to leak a home directory path

- **Status:** complete, including the privacy finding, which was fixed in a follow-up on the same branch
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark` (third commit)
- **Commits:** three documentation commits on the branch
- **Pull request:** #178
- **Objective:** Fill the last renderable placeholder in the READMEs, the walkthrough thumbnail.
- **Completed:** `docs/assets/walkthrough-thumb.png` (800x450) and `walkthrough-thumb.mjs`, a clickable poster wired into all six READMEs and linking to `https://applye.dev/docs/guide/tour/` - verified live, HTTP 200. Section 4 of `ASSETS_BRIEF.md`, `docs/assets/README.md` and `CHANGELOG.md` updated. The READMEs now have no unfilled image reference in any language; the release-links blockquote is the only placeholder left and it waits on builds.
- **Not completed, and this is the important part of this entry:** **`apps/web/public/guide/tour-walkthrough.mp4` renders `/Users/<name>/Documents/Applye is writable.` at roughly three seconds in - with the real account name in place of `<name>`.** It is the welcome screen's environment check printing the export path of the machine the tour was captured on, and it contains a real home directory name. The file is live on `applye.dev/docs/guide/tour/`. Nothing was changed about the video: re-encoding a shipped asset to blur or trim a segment is a deploy-affecting change, it is the maintainer's own name rather than a third party's, and the maintainer should decide whether it is worth doing. The poster deliberately uses the 44s frame so this change does not create a second, still, indexable copy.
- **Files or packages changed:** `docs/assets/walkthrough-thumb.png`, `docs/assets/walkthrough-thumb.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code, and nothing under `apps/web/public/guide/`.
- **Validation:** Run and observed: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), `git lfs status` (the poster staged as a pointer), `curl -I` against the tour URL (200 after redirect to the trailing-slash form). Two framings of the poster were rendered and compared before choosing; the 3s frame was zoomed to 1400px to confirm the leaked path rather than assume it. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched.
- **Privacy/security impact:** No new exposure, and one pre-existing exposure now documented. The poster's frame was checked for personal data before use. The leak described above is not created by this change and is not made worse by it.
- **Decisions and assumptions:** Pointing the poster at the existing silent tour beats leaving a placeholder for a narrated video nobody has scheduled: the link is true today, and swapping it later is a one-line change in six files. No copy is baked into the image, for the same reason as the hero banner - it would have to exist in six languages. The video leak was reported rather than fixed, because fixing it means re-encoding a deployed asset and the call belongs to the maintainer.
- **Risks or compatibility impact:** The poster hardcodes an external URL, so it breaks silently if the tour page ever moves. The frame is downstream of `tour-walkthrough.mp4`; if that is re-recorded, the poster is stale until the script is rerun.
- **Open issues or blockers:** The home directory path in `tour-walkthrough.mp4`. Options, cheapest first: trim the video to start after the environment check; blur that rectangle for the seconds it is visible with `ffmpeg`'s `boxblur` and re-encode; or re-record the first-run segment on a machine with a neutral account name. All three need a redeploy. Worth checking the other recordings for the same thing in the same pass - only this frame was inspected.
- **Next first action:** Superseded by the follow-up below.
- **Evidence:** Branch diff; the zoomed crop of the 3s frame; `curl` status for the tour URL; both poster renders reviewed in session.

**Follow-up in the same watch, on the same branch: the path is blurred out and the video re-encoded.** The maintainer chose the surgical option, so `apps/web/public/guide/tour-walkthrough.mp4` was rebuilt with a luma-only Gaussian blur over the export-path line, and nothing else about the take changed.

- **How the window and the rectangle were established, rather than eyeballed:** the video was sampled at 5fps for its first eight seconds, and the standard deviation of the 320x28 rectangle at (305, 714) was measured per frame. The path renders from 2.600s to 3.900s - stdev 29.5 while present, 0 before it draws, 2.8 once the screen advances - and a 30fps sweep of 3.7s to 4.2s put the last frame carrying it at exactly 3.900. The blur is enabled for `between(t,2.5,3.92)` and no longer, because the same rectangle holds unrelated interface on later screens and a wider window would smear it.
- **Why luma-only:** the first attempt used `boxblur` across all planes and left a green cast over the blurred strip, since chroma averaging over a near-neutral region amplifies whatever tint is in it. `gblur=sigma=12:steps=3:planes=1` blurs the luma and leaves chroma untouched, which reads as a neutral smudge.
- **The rest of the take was checked, not assumed.** The tour ends on the targeting step and never reaches a summary screen, so there is no second place a path could appear. The API key field visible around 5s is the input's placeholder - `sk-ant-api03-…`, dim, ellipsised - and not a typed key: the take switches to CLI bridge mode and never pastes one. Frames at 22s were compared before and after at 2x to confirm the re-encode did not soften text, and the rectangle at 5.2s was confirmed sharp, so the blur really is windowed.
- **Encoding:** libx264, CRF 26, `-preset slow`, `-an`, `+faststart`. 820 KB to 661 KB at the same 1264x788, 30fps and 45.900s duration, so the page's `width`/`height` attributes and the shot list's stated length still hold.
- **This is the second instance of this class of leak in this same file.** The 2026-07-28 watch caught absolute paths in the last half-second, after the app opened on Settings, and cut the file to end earlier; `CURRENT_STATE.md` was given a warning about Settings captures in CLI bridge mode at the time. The welcome screen's environment check prints the same kind of path at the _start_ of the take, and that survived. The warning should be widened from "Settings in CLI bridge mode" to "any screen that prints a filesystem path", which includes the first-run environment check.
- **Validation after the swap:** `nx run web:test`, `nx run web:lint`, `nx run web:build`, `npm run format:check`, `git diff --check`, and the frame comparisons above. **A redeploy is required for this to reach the live site**; until then `applye.dev/docs/guide/tour/` still serves the old file.
- **Next first action:** Redeploy the site so the corrected video replaces the one currently served, then widen the capture warning in `CURRENT_STATE.md` and `MEDIA_SHOTLIST.md` from Settings to any path-printing screen.

### 2026-07-29, the README's screens and demo GIF are cut from the guide's media

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark` (second commit; the branch now carries both the wordmark and this)
- **Commits:** two documentation commits on the branch
- **Pull request:** #178, retitled to cover both
- **Objective:** Fill the README's remaining asset placeholders without shooting anything new, reusing what `apps/web/public/guide/` already holds.
- **Completed:** Six screens under `docs/assets/screens/` and `docs/assets/demo.gif` (17.8s, 800px, 1.9 MB), plus `screens/build.mjs`, which prepares the stills from the guide's PNGs and pulls two frames out of its MP4s with `ffmpeg`. The screenshot-table and demo-GIF placeholders removed from all six READMEs, and four captions rewritten to match what the frames contain. Sections 3 and 5 of `ASSETS_BRIEF.md` replaced with the shipped recipes, and `docs/assets/README.md` updated.
- **Not completed:** `walkthrough-thumb.png`. It is blocked rather than pending: the READMEs link it to a narrated YouTube video that does not exist. The release-links placeholder is likewise waiting on builds. Neither renders as a broken image - both are comments or blockquotes.
- **Files or packages changed:** `docs/assets/screens/*.png` (6), `docs/assets/screens/build.mjs`, `docs/assets/demo.gif`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed, and nothing under `apps/web/public/guide/` was touched or moved.
- **Validation:** Run and observed: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), `git lfs status` (all six PNGs and the GIF staged as pointers). Every candidate frame was inspected as a contact sheet before selection, and the concatenated GIF was sampled at six timestamps to confirm the joins land on complete states. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched.
- **Privacy/security impact:** None beyond what already shipped. These frames are the documentation site's, which were vetted when they were captured: invented companies, the demo persona, no real employer, key or contact. Reusing them adds no new exposure, and the Discover frame is the fixture feed rather than a real scan.
- **Decisions and assumptions:** Reuse over recapture, because two capture sessions produce two personas that diverge. Captions follow the file rather than the brief: four of them described a screen that was never captured, and the honest fix is to describe the frame. Heights are not normalised to 16:10 - cropping would cut the weekly chart off analytics and the save controls off the Discover feed, and a markdown table scales cells to the column width anyway. The GIF is 10fps/128 colours on purpose; the quality difference against 12fps and a full palette is invisible at 800px and costs double the bytes. The wordmark work was left on the same branch rather than split, since both changes fill placeholders in the same six files and would have conflicted.
- **Risks or compatibility impact:** The screens are now downstream of `apps/web/public/guide/`. If a guide asset is recaptured, these go stale silently - nothing links them but `build.mjs`, which names its sources. The GIF pushes the repository's LFS footprint up by roughly 3 MB.
- **Open issues or blockers:** `walkthrough-thumb.png` needs a hosted video first. The press-kit placeholder in `apps/web/src/app/press.html` asks for a zip of the wordmarks and the app icon, which is now buildable.
- **Next first action:** Merge #178, then decide whether the walkthrough section points at YouTube or simply links to the tour already published at `applye.dev/docs/guide/tour`.
- **Evidence:** Branch diff; `build.mjs` output naming each source and output size; the contact sheets and GIF frame samples reviewed in session.

### 2026-07-29, the README wordmark is generated from the site header

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `docs/readme-wordmark`
- **Commits:** one documentation commit on the branch
- **Pull request:** opened at the end of this watch
- **Objective:** Fix the broken image at the top of all six READMEs: they referenced wordmark SVGs that had never been created.
- **Completed:** `docs/assets/brand/wordmark-light.svg` and `wordmark-dark.svg` (250x56), plus `wordmark.mjs`, the generator that produced them from the JetBrains Mono TTF. The `<!-- PLACEHOLDER: wordmark -->` comment removed from all six READMEs. Section 1 of `ASSETS_BRIEF.md` replaced with the shipped recipe, and `docs/assets/README.md` updated.
- **Not completed:** The remaining README assets - `demo.gif`, the walkthrough thumbnail and the six screens under `docs/assets/screens/`. Also untouched: the press kit placeholder in `apps/web/src/app/press.html`, which asks for a zip of these wordmarks plus the app icon. That is now buildable but was not in scope.
- **Files or packages changed:** `docs/assets/brand/wordmark-light.svg`, `docs/assets/brand/wordmark-dark.svg`, `docs/assets/brand/wordmark.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed.
- **Validation:** Run and observed on this branch: `npm run format:check` (pass), `git diff --check` (clean), an em-dash and en-dash scan across every changed file (0 hits), and both SVGs rasterised and inspected against the light and dark canvases. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` was touched. Separately confirmed on the live repository that the previous watch's claim holds: GitHub resolves the LFS pointer and renders `hero-banner.png` in the README.
- **Privacy/security impact:** None. Two vector files and a build script; no data, network or permission surface.
- **Decisions and assumptions:** The lockup is transcribed from `.brand` in the site header, not designed fresh, so the README and the site cannot drift into two different logos. Glyphs are outlines because GitHub blocks webfonts in `<img>`-served SVG. The canvas stays 250x56 because the READMEs hardcode those attributes; the type was sized up to 40px to fill it, since at 30px the lockup used 59% of the width and shipped its own margin. `opentype.js` could not shape the string - JetBrains Mono uses a ccmp substitution format it does not implement - so the script steps the advance width glyph by glyph, which is equivalent for six unshaped lowercase letters. JetBrains Mono is SIL OFL 1.1: embedding outlines is permitted, and the font itself is not redistributed.
- **Risks or compatibility impact:** None expected. The SVGs are static, have no external references and carry no fonts. If `.brand` in `styles.scss` changes, these files go stale silently - nothing enforces the link, and the script header says so.
- **Open issues or blockers:** None.
- **Next first action:** Capture the six screens under `docs/assets/screens/` at 1440x900 in the dark theme against the seeded persona in `ASSETS_BRIEF.md`, starting with `dashboard.png`.
- **Evidence:** Branch diff; rasterised previews of both SVGs reviewed in session; the generator's own output reporting `mark 42.0px + gap 12 + text 140.0px = 194.0px on 250x56`.

### 2026-07-29, the README's hero banner is built and README media joins LFS

- **Status:** complete
- **Agent/tool:** Claude Code (Opus 5), maintainer supplying the screenshot
- **Branch:** `docs/readme-hero-banner`
- **Commits:** one documentation commit on the branch
- **Pull request:** opened at the end of this watch
- **Objective:** Fill the first of the README's asset placeholders - the hero banner - and leave the rest of the set reproducible rather than one-off.
- **Completed:**
  - `docs/assets/hero-banner.png` (1600x900) and `hero-banner-plate.png`, the same backdrop without the window, for the GitHub social preview and the video thumbnail.
  - `docs/assets/hero-banner.mjs`, the compositor that produced them: crop, window framing, backdrop, shadow, grain. Not wired into the workspace and adds no dependency - it needs `sharp` installed into a throwaway directory, which its header explains. Retakes are now a command rather than a design session.
  - The `<!-- PLACEHOLDER: hero banner -->` comment removed from all six READMEs, and each locale's `alt` text corrected: it promised "recruiter-fit score", which is not on the captured screen.
  - `docs/assets/**/*.png` and `*.gif` added to `.gitattributes` as LFS, matching the guide media's treatment.
  - The seed persona in `ASSETS_BRIEF.md` rewritten to the one actually in the frame, and section 2 replaced with the shipped recipe and the reasoning behind each measurement.
- **Not completed:** The other README placeholders - wordmark SVGs, `demo.gif`, the walkthrough thumbnail and the six screens under `docs/assets/screens/`. None was in scope.
- **Files or packages changed:** `docs/assets/hero-banner.png`, `docs/assets/hero-banner-plate.png`, `docs/assets/hero-banner.mjs`, `docs/assets/ASSETS_BRIEF.md`, `docs/assets/README.md`, `.gitattributes`, all six `README*.md`, `CHANGELOG.md`, this file. No application code changed.
- **Validation:** Run and observed on this branch: `npm run format:check` (pass, after Prettier reformatted the new script), `git diff --check` (clean), `git lfs status` (both PNGs staged as LFS pointers, not raw bytes), an em-dash and en-dash scan across every changed file (0 hits). The banner was inspected visually at each of the three framing iterations. **Not run:** the test, lint, type-check, build and Rust gates - nothing outside `docs/` and `.gitattributes` was touched, and the validation matrix does not require them for documentation-only changes.
- **Privacy/security impact:** None, with one thing checked on purpose: the screenshot shows invented companies (Kestrel Analytics, Northlane Systems, Umbra Labs, Cindertree Studio, Vantaform GmbH, Pellworm Digital) and a "Local profile" with no name, contact detail, key or real employer in the frame. Same rule the guide captures follow.
- **Decisions and assumptions:** The UI is a real screenshot composited by a script, never a generated image. A hero banner is the first thing a visitor reads, and generated interface text - almost-words, almost-numbers - would cost more trust than the banner buys. The window is 1344px wide so that the canvas edge falls in the gap between two list rows: at 1280 it sliced the Vantaform line in half and read as a broken crop. The backdrop is `#131211`, darker than the app canvas `#1c1b19`, because matching the canvas made the window dissolve into the page. No text is baked into the image, since the READMEs carry the headline in six languages and baked copy would need six renders.
- **Risks or compatibility impact:** The LFS rule means anyone cloning without `git lfs` sees pointer files where the README media should be, and CI jobs touching these paths need `lfs: true` - the same trap that was found in the deploy workflow for the guide assets. The deploy workflow does not read `docs/`, so nothing there changes. GitHub resolves LFS pointers when rendering markdown, so the READMEs display normally.
- **Open issues or blockers:** None for this watch. The remaining README assets are unblocked and now have a documented persona to match.
- **Next first action:** Capture the six screens under `docs/assets/screens/` at 1440x900 in the dark theme against the same seeded persona, starting with `dashboard.png`.
- **Evidence:** Branch diff; `git lfs status` output; the three rendered iterations of the banner reviewed in session.

### 2026-07-29, applye.dev is attached and the site is opened to search

- **Status:** partial - the domain is attached and verified; the indexing flip is committed but not yet deployed
- **Agent/tool:** Claude Code (Opus 5), maintainer driving the Cloudflare side
- **Branch:** `fix/ci-lfs-checkout`, then `feat/web-launch-indexable`
- **Commits:** `2117dc1` (LFS checkout), the indexing flip on the launch branch
- **Pull request:** #172 (merged as `5192335`), plus the launch PR
- **Objective:** attach `applye.dev`, remove the pre-launch search block, and get the current build online.
- **Completed:**
  - **`applye.dev` and `www.applye.dev` are attached to the `applye` Pages project.** Two proxied CNAMEs to `applye.pages.dev` created through the Cloudflare API, certificate issued 2026-07-28 22:39 UTC, valid to 2026-10-26. Verified from outside: `HTTP/2 200`, correct `<title>`, all six security headers, `DNS:applye.dev` on the certificate. The apex is a CNAME; Cloudflare flattens it, so no ALIAS record was needed. Email Routing records (3 MX, SPF, DKIM, DMARC) were not touched.
  - **`X-Robots-Tag: noindex` removed and `SEARCH_INDEXABLE` flipped to `true`.** The coupling test was verified to fail when only the flag was changed, then the file was restored - the guard is real, not assumed.
  - **The deploy job would have shipped LFS stubs.** `actions/checkout@v4` in `deploy-web` had no `lfs: true`, so a restored-Actions run would have uploaded 132-byte pointers in place of all 25 guide assets, with every gate still green. Fixed in #172. Never shipped, because the job has never run.
  - **The current build is live.** The maintainer redeployed from `main`; `/guide/discover-scan.mp4` and `/guide/tour-walkthrough.mp4` went from 404 to 200, and `chunk-2T35UHGN.js` carries the real `G-ZY158GV42C` rather than the placeholder.
- **Not completed:** the indexing flip is not deployed - it needs a merge and another `npm run web:deploy`. Search Console, the Cloudflare Web Analytics hostname and HSTS all remain untouched. `SOURCE_PUBLIC` is still `false` and the README still ships its placeholder asset set.
- **Files or packages changed:** `.github/workflows/ci.yml`, `apps/web/public/_headers`, `apps/web/src/app/site.ts`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** `npx nx run web:test` (70 passed, 6 suites) on the flipped tree; the same suite with the flag alone reverted fails on `keeps the noindex header and SEARCH_INDEXABLE in step`, 1 failed / 69 passed, confirming the guard. `npm run format:check` and `git diff --check` pass. Against the live site: apex and `www` both 200 over IPv4 and IPv6, guide media 200, `sitemap.xml` and `robots.txt` 200, `x-robots-tag: noindex` still present because the flip is not deployed yet.
- **Privacy/security impact:** No user data involved. Two notes. The Cloudflare API token minted for the attachment is a user token scoped to Pages Edit and DNS Edit on this zone with a short TTL; it should be deleted once the launch settles. Opening the site to search is a deliberate exposure decision, taken by the maintainer, and only after every documentation placeholder had shipped.
- **Decisions and assumptions:** Attached the domain before removing `noindex`, so a wrong result could be undone before crawlers were invited. Left `applye.pages.dev` alone - it cannot be removed without deleting the project, and the canonical tags already consolidate search on the domain. Did not touch the zone's SSL mode from a script; that is a whole-zone setting that also affects mail, and belongs in the dashboard.
- **Risks or compatibility impact:** Once the flip deploys, removal from search is far slower than exclusion was. Nothing else regresses: the header block keeps all six security headers, and only the `X-Robots-Tag` line was removed.
- **Open issues or blockers:** GitHub Actions still cannot run, so deployment stays manual. `SOURCE_PUBLIC` and the README asset set still stand between the site and the repository going public.
- **Next first action:** merge the launch PR, run `npm run web:deploy`, then confirm `curl -sI https://applye.dev | grep -i x-robots-tag` returns nothing. Only after that, add `applye.dev` to Search Console and submit `https://applye.dev/sitemap.xml`.
- **Evidence:** `apps/web/public/_headers`, `apps/web/src/app/site.ts:46`, `apps/web/src/app/seo/seo.spec.ts:101`, `.github/workflows/ci.yml:103`, PR #172.

### 2026-07-28, the last placeholder on the site is gone, and the maintainer's database was put back

- **Status:** complete
- **Agent/tool:** Claude Code (Opus). The maintainer captured the recording; the agent planned the capture, cleaned and wired the asset, and restored the database.
- **Branch:** `feat/guide-discover-scan`
- **Commits:** one, carrying the asset, the page, the shot list, the changelog and this entry
- **Pull request:** #171
- **Objective:** Ship `guide/discover-scan.mp4`, the only remaining placeholder box on applye.dev, and return the maintainer's local database to its pre-capture state.
- **Completed:**
  - **The recording exists and is honest.** Captured against one user-added RSS source - the invented feed in `tools/capture/demo-jobs.xml`, temporarily hosted on a throwaway Cloudflare Pages project, deleted by the maintainer immediately afterwards - with every built-in source switched off, so nothing real was fetched and the eight companies on screen are the fixture's own. That hosting detour is not optional: `require_https` (`discover.rs:1578`) rejects anything but `https://`, and reqwest is built with `rustls-tls` on the bundled Mozilla roots (`Cargo.toml:32`), so no local server, self-signed or mkcert, can ever be scanned.
  - **Two edits to the take before shipping**: the screen recorder had left an AAC track on it, which the capture rules forbid, and 3.5 s of static screen sat before the click. Stripped and trimmed from 2.3 s, which took it from 1.1 MB to 123 KB over 6.2 s. The untrimmed original is in `~/applye-capture-states/media-inbox-2026-07-28/`.
  - **The slot's own description is not fully met, and the page no longer claims it is.** The slot asked for "the console logging each source line by line". There was one enabled source, so there is one line; and the console is drawn for about 0.15 s, because a single small feed resolves that fast, so `> scan started · 1 sources` is legible only on a freeze frame and the resolved per-source line and the `> done in Ns` line never appear at all. The `aria-label` describes what is actually on screen - the strip reading LAST SCAN · 8 NEW · 0 FILTERED · 0 TOKENS, and the feed filling with NEW pills, target-role labels and matched keywords - and promises no log. `MEDIA_SHOTLIST.md` records all three deviations.
  - **The maintainer's database was restored.** It now holds the eight source rows it had before any of this began, TrudVsem enabled and the other seven off, with no jobs and no profile, taken from `applye.db.pre-seed-2026-07-27T10-26-53-893Z`. The seeded capture state it replaced is archived at `~/applye-capture-states/70-capture-2026-07-28-post-scan/`.
- **Not completed:** Nothing from this watch. Two things it deliberately did not do: flip `SEARCH_INDEXABLE` and the `noindex` header, and attach `applye.dev`. Both are the maintainer's call and neither was given.
- **Files or packages changed:** `apps/web/public/guide/discover-scan.mp4` (new, via LFS), `apps/web/src/app/docs/guide-pages.ts`, `docs/product/MEDIA_SHOTLIST.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `nx run web:test` (5 suites, 64 tests, pass), `nx run web:lint` (pass), `nx run web:build --skip-nx-cache` (pass; `dist` carries the real 123 KB file, not an LFS pointer, and the prerendered `/docs/guide/discover` page references it), `npm run format:check` (pass), `git diff --check` (clean). A grep over the built HTML finds no `PLACEHOLDER` text anywhere on the site. The restored database was verified by query: 8 sources, 0 jobs, 0 applications, 0 profile rows. **Still not verified by eye**: no rendered guide page has been looked at, including this one - the browser preview reports `innerWidth` 0, the same failure recorded on 2026-07-27. The video was checked frame by frame with `ffprobe` and extracted stills instead, which is how the 0.15 s console window and the absent done line were established.
- **Privacy/security impact:** One real consideration, handled. Scanning with the built-in sources enabled would have put real German employers' postings on screen, which is exactly why the first take was rejected; they were switched off and the only source fetched was the invented fixture. The fixture stays outside `apps/web/public`, so no deploy can publish fake vacancies from applye.dev, and the temporary host is gone. The restore moved the maintainer's own data back; no personal data entered the repository, and the archived capture state holds only the invented demo persona.
- **Decisions and assumptions:** Trimmed and stripped the maintainer's file rather than asking for a re-shoot - both edits remove material rather than change it, and the silent-asset rule is explicit. Kept the empty-inbox opening second rather than cutting straight to the click, because the contrast with the filled feed is what the figure is for. Assumed the throwaway Pages project is deleted, as reported; nothing in the repository depends on it.
- **Risks or compatibility impact:** None to the app. For the site: the guide is complete, so the only thing between here and an indexable launch is the maintainer's word and a look at the rendered pages.
- **Open issues or blockers:** The rendered guide has still never been seen by a human or an agent. `~/applye-capture-states/99-your-real-data/` is misnamed - it was overwritten with a seeded copy on 2026-07-28 and holds no real data; the genuine pre-capture state is the `pre-seed-2026-07-27T10-26-53-893Z` file, now restored and still present in the app support directory.
- **Next first action:** Merge PR #171, then decide the launch: flipping `SEARCH_INDEXABLE` and the `X-Robots-Tag` line together, deploying, and attaching `applye.dev` are one decision and belong to the maintainer. The visual review this action used to call for was done - see the second follow-up below.
- **Evidence:** PR #171; the gate runs above; the extracted frames at 3.55-3.70 s of the original take, which is where the console appears and disappears.

**Follow-up in the same watch, on the same branch and PR: the two weak recordings were re-shot, and a personal path was caught on its way into the documentation.** The maintainer re-recorded `tour-walkthrough.mp4` - now 45.9 s covering all six onboarding steps rather than 18 s stopping mid-flow, played slightly slowed with the model-call waits cut - and `profile-regenerate.mp4`, now 5.1 s with the working state visible where 2.2 s had lost it. `pipeline-drag.mp4` was reviewed again and kept at 3 s. Four things were then found and dealt with before shipping. **First, a real account name.** The last half-second of the tour, after the app opened on Settings, showed the CLI detection block with absolute paths under the maintainer's home directory; the file is cut to end on the "You're all set" summary instead, and `CURRENT_STATE.md` now warns that any Settings capture in CLI bridge mode carries that exposure. **Second, the tour was captured with the window inset in a larger frame**, so it was cropped from 1440x900 to its actual 1264x788 content and the page's `width`/`height` now match the file. **Third, every recording in the guide carried an empty AAC track** from the screen recorder, so the "silent" claim held only because the players are muted; all seven were stripped with `-an`. **Fourth**, the four heaviest were re-encoded at CRF 23 after checking text at 1:1, which took the guide's video weight from about 14.7 MB to 4.1 MB. Two `aria-label`s were rewritten to match what the new takes actually show - the tour's, which described a recording that ended three steps earlier, and the regenerate card's, which named fields the card does not have. The tour is still not the narrated 2-3 minute sidebar tour its slot describes, and the shot list says so. Validation re-run and observed after all of it: `nx run web:test` (5 suites, 64 tests), `nx run web:lint`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`. The maintainer's originals are in `~/applye-capture-states/media-inbox-2026-07-28/`.

**Third follow-up, same branch and PR: four site changes off the back of the maintainer's review.** (1) The documentation sidebar gained one Lucide icon per section, inlined into the site's own `ui/icon.ts` set rather than by adding the package - one per group and none per page. (2) **`favicon.ico` was the Nx logo the workspace generator left behind**, and the SVG icon beside it was linked by a relative path, so on a route like `/docs/guide/tour` the browser resolved it under that folder, 404ed, and fell back to the Nx file even in engines that support SVG icons. All three links are absolute now, the `.ico` is generated from the brand mark, an `apple-touch-icon.png` exists, and `apps/web/tools/generate-icons.sh` rebuilds them with macOS built-ins. (3) The guide's figures open at full size on click, over a dimmed backdrop, with Escape, the backdrop and a close button all dismissing; the binding is delegated so a figure added later is covered, a video carrying its own controls is skipped because a click there scrubs, and an enlarge button added to each figure covers that case and the keyboard. Six tests. (4) The footer was rebuilt to the maintainer's Claude Design variant 1a - three named columns plus a brand column, the language switcher as a disclosure with all six locales still in the markup, and the raw email replaced by a translated "Contact" link that keeps the address in its tooltip; four new strings in all six languages. Gates after each: `nx run web:test` (6 suites, 70 tests, up from 5/64), `nx run web:lint`, `npm run type-check`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`. **None of it has been seen rendered by the agent**: the built-in preview still returns `innerWidth` 0 and the Claude in Chrome extension is not connected, so the lightbox is proven by jsdom tests and everything else by the prerendered HTML.

**Second follow-up, same branch and PR: the guide was finally looked at.** The maintainer walked the rendered site and reported it correct, which closes the check this watch had listed as outstanding since 2026-07-27 - the agent still cannot see it, the browser preview returns a blank frame with `innerWidth` 0, and that has not changed. One change came out of the review: the wordmark's trailing cursor bar was removed from the header and the footer, along with its `.brand__cursor` rule, because with the mark's own vertical stroke on the left it read as two bars around a five-letter name rather than as a caret. Verified in the built output rather than by eye: `brand__cursor` appears in none of the prerendered pages, and the header now renders as the mark followed by "applye". Gates re-run: `nx run web:test` (5 suites, 64 tests), `nx run web:lint`, `nx run web:build --skip-nx-cache`, `npm run format:check`, `git diff --check`.

### 2026-07-28 (later, after the LFS move), two capture-session findings fixed, one of them found to be misreported, and four described-but-absent features parked on purpose

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `fix/prelaunch-capture-findings`
- **Commits:** `a249fad`, `90068e0`, `771cc55`, `eb412e4`, `6bfe13d`, plus the docs commit carrying this entry
- **Pull request:** #170, open
- **Objective:** Close the four product findings the 2026-07-27 and 2026-07-28 capture sessions left in `CURRENT_STATE.md`, and decide - rather than only record - the ones that are decisions.
- **Completed:**
  - **The Interview Prep finding was wrong as written, and the correction is in `CURRENT_STATE.md`.** It claimed clicking a row opened the overflow menu instead of the stage timeline. The row has always bound `(click)="open(r.id)"`, `open()` navigates to `/interview-prep/:applicationId`, that route exists and the detail page renders the round timeline; the menu sits on its own button inside a wrapper that stops propagation. What was true is narrower: the menu's only entry was destructive, and the row declared `role="button"` while handling Enter only. Both fixed - the menu opens the timeline as its first entry, and Space works.
  - **A target role whose only distinctive word is two letters now matches.** `archetypeWords` dropped everything under three characters, so "UI Engineer" reduced to the generic "engineer" and `matchArchetype` could never anchor: no Discover label, no For-you grouping, no effect on scoring prompts, and nothing said so. Seven domain terms (`ui`, `ux`, `qa`, `ml`, `ai`, `bi`, `db`) now survive tokenization; `go` was deliberately excluded because whole-word matching would fire it on "go live". `hasDistinctiveWord()` was added to `libs/core` and drives a new warning in the profile editor, so the user is told at the moment of typing rather than by a feed that never reacts.
  - **The four gaps between the guide and the product were decided, not left open.** The description settles for the product for launch, and all four are filed in `docs/product/IDEAS.md` under "Features the documentation expected to find" with a priority and the reason each was not built now: Tailored badge (P2/S), live CV preview beside the section list (P2/M), section-level style overrides (P3/M), save-to-profile on the gap question (P3/S). A manual empty CV in the Documents library is filed at P2/S on the same basis - it is a new write path into the user's document store and deserves its own watch.
- **Not completed:** No code for any of the four parked items, by decision. The Discover badge screenshot was not retaken, so `discover-badges.png` still shows the pre-fix unmatched row; the guide caption does not claim otherwise. The `guide/discover-scan` placeholder is untouched - it belongs to the media watch.
- **Files or packages changed:** `libs/core/src/lib/profile/archetype.ts` + `.spec.ts`; all six `libs/i18n/src/lib/translations/*.ts`; `apps/desktop/src/app/pages/profile/profile.component.ts` + `.spec.ts`; `apps/desktop/src/app/pages/interview-prep/interview-prep.component.{html,ts}` and a new `interview-prep.component.spec.ts`; `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/product/IDEAS.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `npm run type-check` (6 projects, pass), `nx test core` (14 suites, 225 tests, pass), `nx test i18n` (3 suites, 22 tests, pass), `nx test desktop` (42 suites, 717 tests, pass; 41/709 before), `nx lint desktop` (0 errors, 11 pre-existing warnings), `nx lint core`, `nx lint i18n` (pass), `npm run desktop:build` (pass), `npm run format:check` (pass after `nx format:write` touched two files), `git diff --check` (clean). **Every new test was confirmed to fail against the pre-change code**, not merely to pass after it: the four core tests fail on the old tokenizer; the profile warning test that covers the short-token case fails when `SHORT_DOMAIN_WORDS` is emptied; three of the five interview-prep tests fail against the previous template, and the other two document the behaviour the report had described incorrectly. **Not run:** the Rust gates - nothing in this diff reaches Rust or IPC - and no web gate, since `apps/web` is untouched. **The native gate was run by the maintainer, not by the agent.** The agent's own `npx tauri dev` built and launched the debug binary but its `beforeDevCommand` reported "Port 4200 is already in use" - a dev server started outside this session held the port - so that instance was stopped rather than driven, and the agent looked at no rendered UI. The maintainer then walked both surfaces by hand on this branch and reported them correct, which is what closes this watch.
- **Privacy/security impact:** None. Target roles and archetypes are already local profile data; no new data is stored, and nothing new leaves the device. The warning renders a fixed i18n string and never echoes profile content. No AI call was made in this watch.
- **Decisions and assumptions:** Chose an allowlist over lowering the length threshold generally. `archetypeWords` also feeds `archetypeKeywordBag`, and `wordHit` is boundary-aware, so a blanket two-character threshold would start matching "at", "de" and "an" as whole words across job descriptions. The allowlist changes behaviour for no existing role except the broken ones. The warning was put in the profile editor only, not in onboarding, where names arrive as AI suggestions the user then edits. Left the Interview Prep row's navigation exactly as it was, since it was never the defect.
- **Risks or compatibility impact:** Low. The tokenizer change can only add matches, never remove them, and only for the seven listed terms; a user whose feed was previously empty because of this bug will start seeing target-role labels, which is the point. No schema, migration or IPC contract changed.
- **Open issues or blockers:** Two, both recorded in `CURRENT_STATE.md`. What actually blocked `interview-timeline.png` during the capture session is still unexplained - the reproduction was never captured, and the most likely cause is a click landing on the `⋯` button at the row's right edge. And the state file's own accuracy: it and the previous watch entry described a dirty working tree and an open `fix/onboarding-cv-parse` branch, neither of which exists - that work is on `main` as `4ff8dad`, `812e700`, `e9817dc`, and the media work is committed as `7f31d5c`, `d2b37b9`, `3d034e4`. Separately, `fix/onboarding-ai-provider-claims` still exists locally but `git cherry` shows every one of its commits already upstream in `main`, so it is safe to delete once the maintainer agrees.
- **Next first action:** Merge the pull request for `fix/prelaunch-capture-findings`, then return to the last site placeholder: re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain.
- **Evidence:** The gate runs above; `interview-prep.component.html:66` for the navigation the report denied; the five commits on the branch.

### 2026-07-28 (later), guide media moved into Git LFS, and history rewritten once to take the already-committed assets with it

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `chore/web-guide-media-lfs`, merged; then `main` directly for the rewrite
- **Commits:** `a19d617`, `ce68b60` on the branch, squashed to `d2b37b9` by PR #169; `3d034e4` after the rewrite. Every SHA in `v0.25.0..main` changed, so the ones written here are post-rewrite.
- **Pull request:** #169, merged
- **Objective:** Stop the guide's binaries from growing the repository, given that at least three of them are documented as needing a retake.
- **Completed:** `*.mp4` and `apps/web/public/guide/*.png` are tracked through LFS. History was then rewritten over `v0.25.0..main`, 74 commits, so the assets already committed became pointers too. A like-for-like clone of `main` fell from 23.70 MiB to 7.07 MiB locally, 8.93 MiB as GitHub repacks it. **No tag moved and no release changed:** every guide asset was added after `v0.25.0`, which is the last tag, so the rewritten range contains none - confirmed by comparing all 35 version tags against the pre-rewrite mirror, and by reading `v0.25.0` back from the server (`2ecd48f`) rather than trusting the local copy. `README.md` names Git LFS under prerequisites and `CURRENT_STATE.md` records the deploy hazard.
- **Not completed:** Nothing outstanding from this watch. The two stale references it creates are known and accepted: PRs #168 and #169 keep their descriptions but their commit links point at SHAs no longer on `main`.
- **Files or packages changed:** `.gitattributes` (new), `.husky/pre-push` (new), `.husky/post-merge` (new), `README.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`. `.husky/post-checkout` gained an LFS line locally; it is gitignored, being per-developer graphify tooling. The 24 guide assets changed representation only - their bytes are identical, verified by diffing the whole tree against the pre-rewrite state and finding only the three files edited on purpose.
- **Validation:** Run and observed after the rewrite: `nx run web:build --skip-nx-cache` (pass, and `dist` holds the real 1,947,426-byte video and 439,998-byte screenshot rather than pointers), `nx run web:test` (5 suites, 64 tests, pass), `nx run web:lint` (pass), `npm run format:check` (pass), `git diff --check` (clean). **Round trip verified from the server**, not locally: a fresh clone of `main` checks out all 24 assets as real files with no stubs. LFS itself was proved end to end on a throwaway branch first, because the Actions billing block made it worth confirming the account could store and serve objects at all; that branch was deleted. **Not run:** the Rust and desktop gates - nothing in this diff reaches them.
- **Privacy/security impact:** None. No content changed, only where git stores it.
- **Decisions and assumptions:** Rewrote history rather than leaving the 12 MB, because the window closes at publication: the operation was cheap only while the repository was private, unforked and checked out once, and all the media sat after the last tag. Used a bounded `git lfs migrate import --include-ref=refs/heads/main --exclude-ref=v0.25.0` after an unbounded first attempt rewrote all 442 commits and clobbered local refs including `origin/main` and every tag; that attempt was undone with `git fetch --force` and cost nothing, because the remote had not been touched. Included the screenshots as well as the videos, on the same reasoning that both get retaken.
- **Risks or compatibility impact:** One real hazard, recorded in `CURRENT_STATE.md`: deployment is manual from a working copy, so a machine without `git-lfs` installed would check out 132-byte pointers, pass every gate - the build copies whatever is in `public/` without looking at it - and upload stubs to Cloudflare in place of the assets. `.husky/pre-push` covers the opposite direction and refuses to push when git-lfs is missing. **LFS hooks belong in `.husky/`, not `.git/hooks`**: this repository sets `core.hooksPath`, so `git lfs install` writes where git never looks, which is exactly how the first push sent pointers with no objects behind them.
- **Open issues or blockers:** None from this watch. Backups of the pre-rewrite state are deliberately still in place: the remote branch `backup/pre-history-rewrite` at `67dd241` and a local mirror at `~/applye-capture-states/repo-mirror-pre-rewrite.git`. Delete them once the rewrite has been lived with for a while. Rollback is `git push --force origin backup/pre-history-rewrite:main`.
- **Next first action:** Re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain, so no real employer appears, then wire it in and re-run the four web gates. That is the last placeholder on the site.
- **Evidence:** PR #169; the gate runs above; `git rev-parse v0.25.0^{commit}` agreeing at `2ecd48f` across the working copy, the pre-rewrite mirror and the GitHub API.

### 2026-07-28, ten of the eleven remaining guide assets wired in; one rejected for showing real employers

- **Status:** partial
- **Agent/tool:** Claude Code (Opus). The maintainer captured every asset by hand this watch; the agent positioned the app, reviewed frames, wired them in and ran the gates.
- **Branch:** `main`
- **Commits:** none yet, working tree dirty
- **Pull request:** not opened
- **Objective:** Finish the eleven guide placeholders left by the 2026-07-27 watch, so the site can drop `X-Robots-Tag: noindex` and launch.
- **Completed:** Ten placeholders replaced with real captures in `guide-pages.ts`: `documents-library.png`, `cv-editor.png`, `gap-dialog.png`, `interview-timeline.png`, and six recordings - `tour-walkthrough.mp4`, `tailor-wizard.mp4`, `paste-job.mp4`, `cv-import.mp4`, `pipeline-drag.mp4`, `profile-regenerate.mp4`. **Every GIF slot shipped as a silent looping MP4** (`autoplay loop muted playsinline`), which the capture rules already allow above ~3 MB; `styles.scss` already carried a `.docs__media video` rule, so no CSS changed. `gap-dialog.png` is a 1156x698 crop cut from the full-window frame; the other three stills are 2880x1800. Recordings are 1440x900 (1x). All ten carry `width`/`height`, `loading="lazy"` on images, `preload="metadata"` on video, and alt or aria-label text describing what is shown. `tools/capture/mira-cv.html` was added so the Documents library could be filled honestly: it converts to DOCX with `textutil` and is imported through the app's own flow, because `document_library` rows can only be created by importing, generating, or finishing the apply wizard, and writing rows straight into SQLite would produce a state no user can reach.
- **Not completed:** **`guide/discover-scan.mp4` was captured and rejected, not shipped.** Its second half shows a real scan of the built-in sources, so the feed fills with genuine openings from named German employers. The capture rules forbid any real employer, recruiter or contact in any frame, so the file was left out of `apps/web/public/guide/` and its placeholder box stands. It is the only remaining guide placeholder. Also not done: filling the Documents library out to three or four rows and marking one Default - free, no AI call, simply skipped.
- **Files or packages changed:** `apps/web/src/app/docs/guide-pages.ts`, `docs/product/MEDIA_SHOTLIST.md`, `docs/internal/DUTY_WATCH.md`, `docs/product/CURRENT_STATE.md`, ten new files under `apps/web/public/guide/`, new `tools/capture/mira-cv.html`. The temporary `media-inbox/` was moved out of the repo to `~/applye-capture-states/media-inbox-2026-07-28/` rather than deleted, so the rejected take and the source PDF survive.
- **Validation:** Run and observed: `npm run format:check` (pass), `nx run web:lint` (pass), `nx run web:test` (5 suites, 64 tests, pass), `nx run web:build` (39 routes prerendered), `git diff --check` (clean). Delivery checked against the running dev server on `:4300`: all seven guide pages emit the expected `src` attributes, and all ten assets return 200 with the right content type. In the DOM every image and video reports a non-zero intrinsic size, so the files decode. **Still not verified by eye.** The browser preview reports `innerWidth` 0, the same blank-frame failure the previous watch recorded, so no rendered page has been looked at - "it looks right" remains unproven for the whole guide, not just this watch's additions.
- **Privacy/security impact:** One real finding, above: the rejected `discover-scan` take contained real employers' postings. Nothing with that content entered the repository. Every shipped frame uses the invented persona and reserved example domains. No API key is visible in any asset. `SEARCH_INDEXABLE` and the `noindex` header were not touched.
- **Decisions and assumptions:** Shipped two recordings that miss their slot's spec rather than hold the whole guide for a re-record, and wrote the shortfall into both the shotlist and the captions - `tour-walkthrough` is 18 silent seconds of first run against a slot asking for a narrated 2-3 minute tour, and `tailor-wizard` stops before Export & Apply, so its caption was changed from "to exported PDF" to "to generated documents" rather than leave a claim the video does not support. Declined a request to build HTML mockups of the app for the maintainer to screenshot: a drawn picture of a UI is a false claim about the product in documentation whose argument is honesty.
- **Risks or compatibility impact:** Low technically. The launch risk is the tour video: it is the asset the docs lean on hardest and it currently shows only onboarding.
- **Open issues or blockers:** Four found while capturing, all recorded in `CURRENT_STATE.md`. The site still cannot launch indexable while `discover-scan` is a placeholder.
- **Next first action:** Re-record `guide/discover-scan.mp4` against a user-added source on a reserved example domain, or stop the recording before results land, so no real employer appears; then wire it in and re-run the four web gates.
- **Evidence:** The dev-server checks above; `apps/web/public/guide/`; the "Already produced" section of `docs/product/MEDIA_SHOTLIST.md`, which records each deviation and its reason.

### 2026-07-28, onboarding resume import fixed: in-wizard AI calls used the pre-onboarding provider

- **Status:** complete
- **Agent/tool:** Claude Code (Opus)
- **Branch:** `fix/onboarding-cv-parse`
- **Commits:** one fix commit on the branch
- **Pull request:** not opened
- **Objective:** Find and fix why the onboarding resume step answered every import - uploaded PDF, uploaded DOCX, and pasted text alike - with "Couldn't parse that resume. Try pasting the text instead."
- **Completed:** Root cause was not parsing. `parseResume()` and `suggestArchetypes()` read `aiMode`, `provider` and `economyModel` back from the settings row, but the AI-setup step only persisted its choices in `markSeen()`, which runs at finish or skip. Every call made inside the wizard therefore used the migration defaults from `0002_settings_defaults.sql` (`api`, `claude`, `claude-haiku-4-5`): picking DeepSeek dispatched to Claude with no key in the keyring, and picking the CLI bridge dispatched to API mode with a model id no CLI accepts. Both threw, and the component's bare `catch {}` replaced the reason with the parse wording, which is why the three input paths failed identically and why the message pointed at the document. Fixed by dispatching from the wizard's own state (`aiDispatch()`, which also sends no model in CLI mode, matching the rule `markSeen()` already applied), committing mode and provider to settings when the AI step is left (`persistAiChoice()`), and keeping the raw failure in `resumeErrorDetail` so it renders under the friendly line. The import now also passes `maxTokens: 8192`, the ceiling the Documents importer has and this one lacked. Model ids are still only blanked at finish, so trying CLI mode and switching back to API within one run cannot leave the user with no model.
- **Not completed:** Not verified natively. This branch was neither run under `npm run desktop:dev` nor exercised against a real provider, so the fix is proven by unit tests only. The five surfaces the previous watch listed as never natively verified remain so.
- **Files or packages changed:** `apps/desktop/src/app/core/onboarding/onboarding.component.ts`, `.html`, `.spec.ts`, `CHANGELOG.md`, `DUTY_WATCH.md`. Untracked `media-inbox/` and `tools/capture/mira-cv.html` were left untouched on purpose - they belong to the media watch running in parallel.
- **Validation:** Run and observed on this branch: `nx test desktop` (41 suites, 709 tests, pass; onboarding suite 52 -> 57), `nx lint desktop` (0 errors, 11 pre-existing warnings), `npm run format:check` (pass), `git diff --check` (clean). The five new tests were confirmed to fail against the stashed pre-fix component and pass after, so they test the fix rather than the current behavior. **Not run:** `tauri dev`, `npm run type-check`, the Rust gates, the web build - nothing in this diff reaches Rust, IPC or the site.
- **Privacy/security impact:** None on storage or network. One surface change: the resume step now prints the raw error string from `ai_run`. That string is a provider or transport failure, not resume content, and the same string is already shown by the Documents importer through a toast.
- **Decisions and assumptions:** Fixed at both ends deliberately - persisting on step exit makes settings agree with the user, and dispatching from wizard state keeps the calls correct even when that write fails, which is a path `persistAiChoice()` swallows to avoid trapping the user in onboarding. Assumed the reported failure is this one; it explains all three input paths failing identically and it is the only shared difference between the working Documents import and the broken onboarding import, but with the error swallowed there is no captured log from the reporting session to confirm against.
- **Risks or compatibility impact:** Low. Mode and provider now land in settings one step earlier, which is what the user picked either way; a user who abandons the wizard after the AI step now keeps that choice rather than reverting to Claude.
- **Open issues or blockers:** `suggestArchetypes()` still swallows its error entirely, by design - it is an enhancement - but that means a provider misconfiguration there is invisible. Not changed in this watch.
- **Next first action:** Run `npm run desktop:dev`, walk onboarding with DeepSeek selected and an API key stored, and confirm the resume step parses; then repeat in CLI mode with Claude Code installed.
- **Evidence:** Branch diff; the test run above; `0002_settings_defaults.sql` lines 19-22 for the defaults the wizard was falling back to.

**Follow-up in the same watch, after the reporter re-ran the wizard.** The detail line added above did its job and printed the real failure: `Claude Code exited with an error: no error output`. That is a second, independent defect, in `ai/cli.rs`: on a non-zero exit the bridge read stderr only. Claude Code in `-p --output-format json` mode reports a failed _session_ - expired OAuth, rate limit, API error - as its normal JSON on **stdout**, exits 1 and writes nothing to stderr, so the reason was received and thrown away. Reproduced locally by running the exact argv the adapter builds (`claude -p --output-format json --system-prompt …`, prompt on stdin, cwd `$TMPDIR`): exit 1, empty stderr, and stdout carrying `"is_error":true` with `"result":"Failed to authenticate: OAuth session expired and could not be refreshed"`. Fixed with `failure_message()`, which keeps stderr first (a CLI that fails to _start_ writes there), then hands stdout to the adapter's own parser - which already knew how to extract that reason - and otherwise reports the exit status with a pointer to running the CLI in a terminal. Three Rust tests cover the three branches, one built from the captured payload. Validation for this part: `cargo test --lib` (284 passed, 1 ignored), `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean). The reporter's own environment is still unconfirmed: the reproduction shows the class of failure and proves the message was being discarded, but their Claude Code session was not inspected. **Confirmed on the reporter's machine.** They re-ran and the resume step now reads `Claude Code reported an error: Failed to authenticate: OAuth session expired and could not be refreshed` - the same failure the local reproduction produced, and proof that both fixes work end to end on a real install. Applye's part is finished; what remains is their Claude Code login, which no code in this repo can refresh. A third commit therefore appends the repair to the message itself (`sign_in_hint()`): an auth failure, on the Claude Code result payload or on Codex's stderr, now ends with "Run `claude` in a terminal and sign in, then try again." Non-auth failures such as a rate limit are unchanged. Rust gates re-run after it: `cargo test --lib` (ai::cli 22 passed), `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean).

**Verified end to end.** The reporter re-authenticated Claude Code from a terminal and re-ran onboarding on this branch: the resume imports. That closes the last unverified step - the import had until then only been observed failing correctly, never succeeding - and confirms the whole chain, from the wizard dispatching to the right provider, through the bridge surfacing the CLI's own words, to the message naming the repair the user then made. Native verification of this branch is therefore no longer outstanding for the onboarding import path; the other four never-natively-verified surfaces from the previous watch are untouched and remain so.

- **Next first action:** open the pull request for `fix/onboarding-cv-parse` and merge it into `main`.

### 2026-07-27 (later), fourteen guide screenshots captured; a tailoring run left mid-wizard

- **Status:** partial
- **Agent/tool:** Claude Code, driving the dev build through AppleScript, `screencapture` and a
  CoreGraphics scroll helper
- **Branch:** `main`
- **Commits:** `10ae4ce`, `c98a39a`, `bcf086e`, `3968c48`, `617d523`, `baf8cb2`, `6f87fc6`,
  `9d9cec9`, `de4f41e`, `d1f28b0`, `f48d506`
- **Pull request:** none; committed to `main` and pushed
- **Objective:** replace as many of the 25 guide media placeholders as possible from the running
  app, without staging anything the product does not actually do.
- **Completed:** Fourteen of twenty-five placeholders now show the real app: `settings-ai`,
  `onboarding`, `sidebar`, `profile-filled`, `profile-archetypes`, `score-result`, `my-jobs-table`,
  `analytics`, `tracker-report`, `dashboard-full`, `discover-sources`, `discover-badges`,
  `discover-detail`, `dashboard-empty`. `tools/capture/seed.mjs` grew a `--discover-only` mode and a
  reimplementation of the app's own `stable_hash`, because the job page prints the first twelve
  characters of `jd_hash` and the earlier placeholder value would have put the seed script's name in
  a published screenshot. A full tailoring run completed on Northlane Systems: three passes, 22
  recorded changes.
- **Not completed:** Eleven placeholders. `gap-dialog` did not occur - the tailoring run produced no
  gap questions, because the seeded profile answers everything the job asks; forcing one means
  thinning the profile and running again. `documents-library` and `cv-editor` need the wizard
  carried to steps 4 and 5, where documents are actually written; `tailoring_cache` has three rows
  but `document_library` is still empty. The five GIFs and the two videos are untouched. **The
  wizard is sitting on step 2 with its result intact**, so the next session can continue rather than
  re-run it.
- **Files or packages changed:** fourteen PNGs under `apps/web/public/guide/`,
  `apps/web/src/app/docs/guide-pages.ts`, `tools/capture/seed.mjs`, `docs/product/MEDIA_SHOTLIST.md`,
  `docs/product/CURRENT_STATE.md`, `CHANGELOG.md`.
- **Validation:** Run and observed after every asset: `npm run format:check`, `nx run web:lint`,
  `nx run web:test` (64), `nx run web:build`, `git diff --check`. All green. **Not verified:** the
  guide pages have never been seen rendered - the browser preview pane returns a blank frame with
  `innerWidth` 0, so the claim is only that each image is served with correct intrinsic size and
  attributes, checked through the DOM.
- **Privacy/security impact:** Every company in every frame is invented, on `example.com` /
  `example.org`. No API key, contact or real employer appears. **Two capture mistakes, both caught
  and contained:** one frame captured the maintainer's browser showing a personal login page with a
  filled password field, and one captured the Claude Code window; both files were deleted
  immediately, neither reached the repository, and the rule now is to verify the frontmost process
  before every single `screencapture`. Four API calls were spent with the maintainer's approval
  (one scoring profile, two scoring runs, one tailoring run).
- **Decisions and assumptions:** Discover rows are seeded rather than scanned, because a live scan
  would put real employers' postings on the website as demo data. Where the app could not produce
  what a shot-list line asked for, the shot shows what the app does and the gap is recorded in the
  shot list rather than staged - the scored view does not fit one frame, the feed row has no salary
  badge, and the adjacent archetype tier cannot appear at all.
- **Risks or compatibility impact:** None to shipped code; this watch changed no application source.
- **Open issues or blockers:** Two product findings, neither fixed: clicking a row in Interview Prep
  opens an overflow menu whose only entry deletes the application from prep, instead of opening its
  timeline; and a target role whose only distinctive word is under three letters ("UI Engineer") can
  never match anything, silently. Both are written up in `CURRENT_STATE.md`. Captures also depend on
  the 5K display being the main one - `screencapture` silently returns 1x on the 1920x1080 screen.
- **Next first action:** Continue the open wizard from step 3 to step 5 so `document_library` gets
  its rows, then capture `documents-library` and `cv-editor`. `gap-dialog` needs a separate run
  against a deliberately thinner profile.
- **Evidence:** `apps/web/public/guide/`, `tools/capture/seed.mjs`, the "Already produced" section
  of `docs/product/MEDIA_SHOTLIST.md`.

### 2026-07-27, first guide screenshot captured; two false AI-provider claims found and fixed

- **Status:** partial
- **Agent/tool:** Claude Code, driving the dev build through AppleScript and `screencapture`
- **Branch:** `main` (via `feat/web-media-assets`, `fix/onboarding-ai-provider-claims`,
  `chore/capture-fixtures`, `chore/capture-seed`, all merged)
- **Commits:** `16ffb99`, `160bd1d`, `c745274`, `219a07a`, `9cff371`, `500495b`, `683e679`
- **Pull request:** none; merged locally and pushed to `origin/main` up to `500495b`
- **Objective:** start producing the 25 media placeholders that block the launch, beginning with a
  cheap shot that proves the capture pipeline.
- **Completed:** `guide/settings-ai.png` is captured and live on `/docs/guide/settings` - full
  window, dark theme, 2880x1800, API mode with Anthropic, the whole privacy note, and the API key
  block in its stored state. Nothing was redacted, because the app never reads a stored key back to
  the interface, so the field is genuinely empty. `.docs__media` gained the image and video rules
  the remaining shots will reuse. **Capturing the onboarding shot surfaced two false claims in the
  app**, both now fixed: the AI step offered an OpenAI card in the API-key flow, which `ai/api.rs`
  cannot serve, so picking it walked the user through buying a key that every later call rejects;
  and the CLI card still read "Claude Code, Codex or Gemini CLI" in all six languages, seven weeks
  after that adapter was deleted. Settings also listed both providers as disabled "(coming soon)"
  rows for work that is not planned; removed on the maintainer's instruction. Migration
  `0027_drop_openai_api_provider.sql` moves installs already stranded on `openai`/`gemini` in API
  mode, mirroring what `0022` did for Gemini in CLI mode. Two capture tools were added under
  `tools/capture/`: an invented job feed and a database seed for the demo persona and eight jobs.
  The seed ran successfully (8 jobs, 8 applications, 3 interview stages, 1 profile, 1 user source).
- **Not completed:** `guide/onboarding.png`. It was captured once on the old code, rejected because
  it displayed both false claims, and the re-shoot is blocked. Nothing else in the shot list was
  attempted. The seeded database has not been looked at in the running app, so the seed is verified
  only by its row counts, not visually.
- **Files or packages changed:** `apps/web/public/guide/settings-ai.png` (new),
  `apps/web/src/app/docs/guide-pages.ts`, `apps/web/src/styles.scss`,
  `apps/desktop/src/app/core/onboarding/onboarding.component.ts` and its spec,
  `apps/desktop/src/app/pages/settings/settings.component.ts`,
  `apps/desktop/src-tauri/migrations/0027_drop_openai_api_provider.sql` (new),
  `apps/desktop/src-tauri/src/db.rs`, all six `libs/i18n/src/lib/translations/*.ts`,
  `tools/capture/demo-jobs.xml` (new), `tools/capture/seed.mjs` (new), `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, `docs/product/MEDIA_SHOTLIST.md`.
- **Validation:** Run and observed. Frontend: `nx run web:lint`, `nx run web:test` (64), `nx run
web:build`, `nx run desktop:lint`, `nx run desktop:test` (704, 41 suites), `nx run i18n:test`,
  `npm run type-check` (6 projects), `npm run format:check`, `git diff --check`. Rust:
  `cargo fmt --check`, `cargo test --lib` (281 passed, 1 ignored), `cargo clippy -- -D warnings`.
  All green, re-run after the merge. **Not verified:** the guide page was never seen rendered - the
  browser preview pane returned a blank frame with `innerWidth` 0, so the claim is only that the
  image is served with the right attributes and intrinsic size, checked through the DOM.
- **Privacy/security impact:** No key, contact or real company appears in the shipped screenshot,
  checked before it was committed. The maintainer's database was copied to
  `~/applye-capture-states/99-your-real-data` before anything was driven, and it turned out to be
  empty of jobs and profile anyway. The onboarding wizard was re-opened by resetting
  `settings.onboarding_seen` rather than by "Delete all data", which would also have wiped the
  maintainer's API key from the keychain. Claude was granted macOS Screen Recording and
  Accessibility for this work.
- **Decisions and assumptions:** Product screenshots are captured from the running app, never
  generated, because a drawn UI is a false claim about the product in documentation whose argument
  is honesty. The Discover shots will be seeded rather than scanned, because `parse_rss_items`
  splits a company out of the title only for weworkremotely hosts, so any other feed lands with an
  empty company and the screenshot would look broken. The demo feed is deliberately not served from
  `apps/web/public`: applye.dev should not host invented vacancies.
- **Risks or compatibility impact:** Migration 0027 changes stored settings on upgrade. It only
  touches rows in API mode naming `openai` or `gemini`, both of which were already broken, and its
  checksum is pinned like the twenty-six before it.
- **Open issues or blockers:** **Captures need the 5K display to be the main one.** It was swapped
  for a 1920x1080 screen mid-session, and `screencapture` silently returns 1x there, which produced
  a 1440x900 file that breaks the shot list's 2x rule. At the time of writing the screen is asleep
  and the app has no window, so nothing can be captured. GitHub Actions remain blocked by billing,
  so every gate above is local and the pushed commits have no CI behind them.
- **Next first action:** With the 5K display main and the app awake, re-capture
  `guide/onboarding.png` on the fixed code (wizard step 02, both mode cards, Claude and DeepSeek
  cards, the key field, the skip warning), then look at the seeded database in the app and correct
  the seed if any screen renders wrong.
- **Evidence:** `apps/web/public/guide/settings-ai.png`, `v1Providers` in
  `apps/desktop/src/app/core/onboarding/onboarding.component.ts`, `PINNED_CHECKSUMS` in
  `apps/desktop/src-tauri/src/db.rs`, `tools/capture/seed.mjs`.

### 2026-07-26, applye.dev goes live on pages.dev, held out of search; Actions found to be blocked

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main` (via `feat/web-cookieless-analytics`, merged as `d7cd346`, PR #165)
- **Commits:** `5520098` plus the branch merge
- **Pull request:** https://github.com/vitala89/applye/pull/165
- **Objective:** get the site deployed and verified end to end, without letting an unfinished site
  into search results.
- **Completed:** The site is live at `https://applye.pages.dev`. Every response sends
  `X-Robots-Tag: noindex`; `robots.txt` still allows crawling on purpose, because a crawler blocked
  from fetching never reads the noindex and Google will list a URL it was told not to fetch.
  `SEARCH_INDEXABLE` in `site.ts` and the header are cross-checked by a test, verified to fail when
  they disagree, so the likely failure - launching while still hidden - cannot happen silently.
  `npm run web:deploy` was added as a stopgap that reproduces the workflow's build and upload while
  running format, lint and tests first, and restores the committed measurement-ID placeholder
  afterwards so a real property ID cannot reach source. The maintainer completed the Cloudflare and
  GitHub setup: Pages project, API token, account ID, `GA_MEASUREMENT_ID` variable, and the
  `hello@applye.dev` routing rule.
- **Not completed:** The `applye.dev` custom domain, the Web Analytics hostname, HSTS and Search
  Console. All four deliberately wait until the documentation's media placeholders are replaced -
  attaching the domain publishes a certificate to Certificate Transparency logs, which is how
  crawlers find new sites.
- **Files or packages changed:** `apps/web/public/_headers`, `apps/web/src/app/site.ts`,
  `apps/web/src/app/seo/seo.spec.ts`, `apps/web/tools/deploy.sh` (new), `package.json`,
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/product/MEDIA_SHOTLIST.md`,
  `docs/internal/MEDIA_SESSION_PROMPT.md` (new).
- **Validation:** Local, run and observed: `npm run format:check`, `nx run web:lint
--skip-nx-cache`, `nx run web:test --skip-nx-cache` (64 tests, 5 suites), `nx run web:build` (39
  routes prerendered), `git diff --check`. The `SEARCH_INDEXABLE` guard was verified to fail when
  the flag was flipped without removing the header. **Against the live deployment:** all six
  security headers plus `x-robots-tag: noindex` present; 39 routes served with correct per-locale
  titles and canonicals pointing at `applye.dev`; JSON-LD present in the expected combinations; 404,
  sitemap and robots served. The consent gate was exercised in a browser - before consent, no
  Google script, no `gtag`, no cookies; after clicking allow,
  `googletagmanager.com/gtag/js?id=G-ZY158GV42C` loads, which also confirms the deployed bundle
  carried the real measurement ID rather than the placeholder.
- **Privacy/security impact:** The consent gate was verified in production rather than assumed,
  which is the claim `/privacy` and `/cookies` make to visitors. No cookies are set before or after
  consent at page load. Deployment credentials were entered by the maintainer directly into GitHub
  and the local environment; they were never exposed to the session.
- **Decisions and assumptions:** Manual deployment was chosen over fixing GitHub billing or making
  the repository public, both of which are the maintainer's call. `noindex` was chosen over
  Cloudflare Access because the launch plan needs traffic to accumulate before the announcement
  article, which Access would prevent.
- **Risks or compatibility impact:** **The CI gate is currently decorative.** Actions cannot run,
  so nothing stops a broken commit reaching `main`; only the local gates and `web:deploy`'s own
  checks protect the site. Treat every merge as unguarded until billing is resolved.
- **Open issues or blockers:** GitHub Actions blocked by billing - "recent account payments have
  failed or your spending limit needs to be increased". Every run since before #164 failed this
  way, including on `main`, which is why `deploy-web` has never executed. Earlier watch entries
  that reported passing gates were reporting local runs; that was accurate but easy to misread as
  CI having passed.
- **Next first action:** Produce the Priority 1 media in `docs/product/MEDIA_SHOTLIST.md`, starting
  with `guide/tour-walkthrough.mp4`. Use `docs/internal/MEDIA_SESSION_PROMPT.md` to open a session
  dedicated to it.
- **Evidence:** `apps/web/public/_headers`, `SEARCH_INDEXABLE` in `apps/web/src/app/site.ts`, the
  `search indexing switch` describe block in `apps/web/src/app/seo/seo.spec.ts`,
  `apps/web/tools/deploy.sh`.

### 2026-07-27, launch SEO pass: structured data added, a shipped og:title bug found and fixed

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-cookieless-analytics`
- **Commits:** `a510885`, `bb29b58`
- **Pull request:** not opened at time of writing
- **Objective:** the launch plan puts the site live before the repository and the release, so search
  indexing has to be right on the first crawl rather than corrected later. Audit the SEO surface
  and close what can be closed without a deployment.
- **Completed:** The audit found the infrastructure sound and left it alone: the sitemap is
  generated from `tools/site-paths.json` with a test that fails on drift, its 39 URLs match the 39
  prerendered routes exactly, every page carries a title, description, canonical and OG image,
  `<html lang>` is correct per locale, and `hreflang` emits seven head links with no duplicates.
  Two things were wrong. First, all six landing descriptions ran past the roughly 160 characters a
  search result displays, the longest at 198, cutting the closing line of the pitch; each is
  rewritten, and the English one had been duplicated in four places (bundle, `app.routes.ts`,
  `seo.service.ts`, `index.html`) so the root page kept the long copy until all four were aligned.
  Second, structured data: landing pages now emit `FAQPage` in their own language from the same
  bundle that renders the visible FAQ, and the 24 documentation pages emit `BreadcrumbList`. Blocks
  carry a `data-seo` marker and are cleared on each navigation, without which a single-page app
  accumulates the structured data of every page visited.
- **Not completed:** Search Console and Bing verification, which need a live domain. Localised OG
  images - one English image serves all six locales. A Content-Security-Policy, still deferred to
  after deployment.
- **Files or packages changed:** `apps/web/src/index.html`, `apps/web/src/app/app.routes.ts`,
  `apps/web/src/app/seo/seo.service.ts`, `apps/web/src/app/seo/seo.spec.ts`,
  `apps/web/src/app/i18n/i18n.service.ts`, `apps/web/src/app/i18n/i18n.spec.ts`, all six
  `apps/web/src/app/i18n/messages/*.ts`, `CHANGELOG.md`.
- **Validation:** Run and observed: `npm run format:check` passed; `nx run web:lint
--skip-nx-cache` passed; `nx run web:test --skip-nx-cache` passed, 62 tests in 5 suites, up from
  48; `nx run web:build` passed, 39 routes prerendered; `git diff --check` clean. Additionally, a
  script over all 39 prerendered pages confirmed zero `<title>` versus `og:title` mismatches, six
  `FAQPage` blocks with the correct `inLanguage` and six questions each, and 24 breadcrumb trails
  with correct leaf names. The new `og:title` regression test was verified to fail against the old
  implementation before being kept.
- **Privacy/security impact:** None. No data collection, storage or transmission changed.
- **Decisions and assumptions:** Breadcrumbs are emitted for the documentation only; on a top-level
  page a trail states the obvious. Structured data is built from what the page already renders,
  because describing absent content is a manual-action risk rather than a ranking bonus.
- **Risks or compatibility impact:** The breadcrumb leaf is cut from the page title at the `·`
  separator, so a docs title without one would put the full string into the crumb. A test now
  rejects that.
- **Open issues or blockers:** None from this work.
- **Next first action:** none for SEO until the site is deployed; then verify `applye.dev` in
  Search Console and submit `sitemap.xml`.
- **Evidence:** `setStructuredData`, `faqPage`, `breadcrumbs` and `pageTitle` in
  `apps/web/src/app/seo/seo.service.ts`; the `SeoService tags` describe block in `seo.spec.ts`.

#### Correction to the entry below

That entry reported a shipped defect this pass uncovered. `og:title` and `twitter:title` were read
from `Title.getTitle()` inside the same `NavigationEnd` handler that Angular's title strategy also
subscribes to, with no ordering guarantee between the two, so both carried the **previous** page's
title. Every route except the six landing pages advertised the home page headline when shared -
including `/privacy`, `/press` and all 24 documentation pages. This predates this branch and was
live in `495d413`. Both tags now read the resolved route title from the snapshot.

### 2026-07-27, launch sequence decided; Cloudflare Web Analytics adopted and disclosed

- **Status:** complete for the code and docs; the Cloudflare and GitHub dashboard steps remain
  manual and outstanding
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-cookieless-analytics`, branched from `main` at `495d413`
- **Commits:** see the branch; the preceding analytics work shipped in `495d413` (#164)
- **Pull request:** not opened
- **Objective:** agree the order of the public launch, then close the decisions it depends on. The
  maintainer's plan: finish and deploy the website first, let traffic and search indexing
  accumulate, publish a launch article personally, and only then open the repository and cut the
  desktop release.
- **Completed:** Four launch decisions taken and recorded. (1) The site ships in coming-soon mode
  with no download and no waitlist form - the flags for this already existed in `site.ts`, so the
  initially-flagged "download CTA points at a private repo" conflict turned out to be already
  handled. (2) Cloudflare Web Analytics is adopted as a cookieless complement to GA4. (3)
  `hello@applye.dev` becomes the general contact address. (4) All six locales launch on day one.
  Implemented: `CONTACT_EMAIL` added to `site.ts` and surfaced in the footer, on `/press`, and in
  the `/privacy` closing paragraph, which previously invited questions "by email" while giving no
  address. `/privacy` and `/cookies` rewritten so the always-on cookieless counter is described
  explicitly and separately from the consent-gated GA4, including the correction that the site is
  no longer free of third-party scripts before consent. The consent-bar copy was rewritten in all
  six locales for the same reason: it asked permission to "count anonymous page views" when a
  counter now does that regardless of the answer. `ANALYTICS_SETUP.md` gained a Cloudflare Web
  Analytics section with the decision, its reasoning, and the finding that no snippet is needed.
- **Not completed:** Every dashboard step. The Pages project `applye` was created by the maintainer
  as Direct Upload with no Git connection, and that is all that exists; the API token, account ID,
  `GA_MEASUREMENT_ID` variable, custom domain and Web Analytics hostname are still to be done.
- **Files or packages changed:** `apps/web/src/app/site.ts`, `app.ts`, `app.html`, `privacy.ts`,
  `privacy.html`, `press.ts`, `press.html`, `cookies.ts`, all six
  `apps/web/src/app/i18n/messages/*.ts`, `docs/internal/ANALYTICS_SETUP.md`,
  `docs/product/CURRENT_STATE.md`.
- **Validation:** Run and observed: `npm run format:check` passed; `nx run web:lint` passed;
  `nx run web:test` passed, 48 tests in 5 suites; `nx run web:build` passed, 39 static routes
  prerendered; `git diff --check` clean. Manual, in the dev server: the footer link renders as
  `hello@applye.dev` with `mailto:` and inherits its siblings' styling exactly; `/privacy` shows
  both analytics bullets and the address; `/cookies` shows the new "The always-on counter" section
  ahead of "Optional analytics"; `/ru` shows the rewritten consent bar; no console errors on any of
  them. Not verified: screenshots - the preview pane returned blank frames while the DOM read
  correctly, so verification was done through the DOM rather than visually. Nothing was verified in
  a deployed environment, because nothing is deployed.
- **Privacy/security impact:** Directly privacy-relevant, and the change is a net widening of what
  runs without consent. Cloudflare Web Analytics loads on every visit before any consent decision.
  It sets no cookie, writes nothing to the device and creates no identifier, which is why it is
  disclosed rather than gated - but the previous claim that the site loaded no third-party script
  until the visitor agreed is now false, and every page and locale that made that claim was
  corrected in the same change. No secrets were handled; the maintainer entered the Cloudflare
  credentials directly into GitHub without exposing them to the session.
- **Decisions and assumptions:** Two tools rather than one, because a hard consent gate makes GA4
  structurally unable to answer "did anyone visit" - the exact question a launch asks. The EU
  exclusion option in Cloudflare's Manage site is deliberately left off: there is no identifier for
  it to protect and it would delete most of the target traffic. No waitlist form, accepted with its
  cost stated - pre-launch traffic will not convert into an audience.
- **Risks or compatibility impact:** The privacy and cookies pages now describe behaviour that will
  only be true once the hostname is actually added under Web Analytics. Deploying the site without
  doing that leaves the pages describing a counter that is not running - honest in the wrong
  direction, but still wrong. Do both in the same session.
- **Open issues or blockers:** A Content-Security-Policy still does not exist; `_headers` explains
  why it was deferred until it can be measured on a live site. When it is written it must allow
  `static.cloudflareinsights.com` as well as the googletagmanager origin. This is Phase 4 work.
- **Next first action:** In Cloudflare, create the API token (My Profile, API Tokens, template
  "Edit Cloudflare Workers") and copy the account ID, then add both to GitHub as the secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` plus the repository variable
  `GA_MEASUREMENT_ID=G-ZY158GV42C`.
- **Evidence:** `apps/web/src/app/site.ts` (`CONTACT_EMAIL`), the "The always-on counter" section
  in `apps/web/src/app/cookies.ts`, the two analytics bullets in `apps/web/src/app/privacy.html`,
  the `consent.body` string in each of the six locale files, and the "Cloudflare Web Analytics"
  section in `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, applye.dev gets a deployment path, gated on CI

- **Status:** complete for the code; both dashboards still need manual setup before anything deploys
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** `f0ed533`
- **Pull request:** not opened
- **Objective:** the site had nowhere to go. `public/_redirects` already named Cloudflare Pages as
  the target, but nothing built or uploaded anything, so publishing was an undefined manual step.
- **Completed:**
  - `deploy-web` job added to `.github/workflows/ci.yml`. It `needs: ci` and runs only on a push to
    `main`, so a failing gate means no deploy. Uses `cloudflare/wrangler-action@v3` with
    `pages deploy dist/apps/web/browser`.
  - `apps/web/public/_headers`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
    `Cross-Origin-Opener-Policy`, a `Permissions-Policy` denying camera/microphone/geolocation/
    payment/USB, and immutable caching for the content-hashed JS and CSS. Verified it reaches
    `dist/apps/web/browser/_headers` through the existing asset glob.
  - `ANALYTICS_SETUP.md` gained the full dashboard checklist for both Cloudflare and GitHub, and its
    status section now reflects that Enhanced measurement has been switched off.
- **Not completed:** nothing is deployed. The Cloudflare Pages project, API token, account ID,
  custom domain, and the four GitHub secrets/variables are all manual and outstanding. The ten GA4
  custom dimensions are still unregistered.
- **Files or packages changed:** `.github/workflows/ci.yml`, `apps/web/public/_headers`,
  `docs/internal/ANALYTICS_SETUP.md`, `CHANGELOG.md`.
- **Validation:** `nx test web` 48 passed, `nx lint web` pass, `npm run web:build` pass with
  `_headers` present in the output, workflow YAML parsed and the job's `needs`/`if`/step list
  checked. `format:check` and `git diff --check` pass. **The deploy job itself has never run** - it
  cannot until the credentials exist, so it is unverified end to end.
- **Privacy/security impact:** security-relevant and improving. No CSP was added: Angular emits
  inline styles and analytics injects a script post-consent, so a correct policy needs measuring
  rather than guessing, and a wrong one fails silently in production only. No HSTS in `_headers`
  either - browsers remember it for its whole max-age, so it belongs on Cloudflare's TLS page where
  it can be switched off again. `GA_MEASUREMENT_ID` is passed as a repository variable rather than a
  secret, deliberately: the ID is public in any GA site's page source, and filing it as a secret
  would only obscure what a build shipped.
- **Decisions and assumptions:** deploy from Actions rather than Cloudflare's Git integration,
  because the Git integration builds on every push regardless of whether the gate passed. The Pages
  project must therefore be **Direct Upload** with no repository connected. Preview deployments
  deliberately not wired: they would publish unlaunched marketing copy on a guessable URL while the
  repository is private.
- **Risks or compatibility impact:** the first run of the deploy job is untested. If the project
  name differs from `applye`, set the `CLOUDFLARE_PAGES_PROJECT` variable or the job fails.
- **Open issues or blockers:** all remaining work is in the Cloudflare and Google consoles.
- **Next first action:** register the ten GA4 custom dimensions from `ANALYTICS_SETUP.md` - they
  must exist before the first traffic arrives or those parameters are permanently unreportable.
- **Evidence:** `.github/workflows/ci.yml`, `apps/web/public/_headers`,
  `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, analytics follow-up: the real measurement ID broke the production build

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** see branch
- **Pull request:** not opened
- **Objective:** the maintainer created the GA4 property (`G-ZY158GV42C`, stream `15328752672`).
  Verify the build actually works with a real ID rather than only with the placeholder.
- **Completed:**
  - **Found and fixed a defect the previous watch shipped.** `GA_MEASUREMENT_ID` was declared
    without a type annotation, so TypeScript inferred the literal `'G-PLACEHOLDER'`. The moment the
    generator wrote a real ID, the placeholder guard in `analytics.service.ts` failed to compile:
    `TS2367: types '"G-ZY158GV42C"' and '"G-PLACEHOLDER"' have no overlap`. Every production build
    would have failed, and only production builds - the placeholder path that all tests and local
    builds exercise compiled fine. Fixed by widening the type to `string`.
  - `@typescript-eslint/no-inferrable-types` flags that annotation and its autofix reintroduces the
    bug, so the line carries a targeted disable with the reason stated.
  - Two regression guards: a test pins the `: string` declaration shape, and the generator now exits
    non-zero if the declaration no longer matches instead of silently rewriting nothing.
  - Recorded the live property ID and the local production-build recipe in `ANALYTICS_SETUP.md`.
- **Not completed:** the property is still unconfigured - Enhanced measurement is on, custom
  dimensions are unregistered, retention and the DPA are untouched. `GA_MEASUREMENT_ID` is not set
  on any deployment, and no Cloudflare Pages project exists.
- **Files or packages changed:** `apps/web/src/app/analytics/measurement-id.ts`,
  `analytics.spec.ts`, `apps/web/tools/generate-analytics-config.mjs`,
  `docs/internal/ANALYTICS_SETUP.md`.
- **Validation:** `nx lint web --skip-nx-cache` and `tsc --noEmit -p apps/web/tsconfig.app.json`
  both pass **with the real ID written in and with the placeholder** - the previous watch had only
  checked the placeholder, which is exactly why the defect got through. `npm run web:build` with
  `GA_MEASUREMENT_ID=G-ZY158GV42C` succeeds, 39 static routes prerendered, the ID reaches exactly
  one bundle file, and `googletagmanager` appears in zero of the 41 emitted HTML files.
  `nx test web` 48 passed. `format:check` and `git diff --check` pass.
- **Privacy/security impact:** none beyond the previous watch. The consent gate is untouched, and
  the real ID is not committed - `measurement-id.ts` still holds the placeholder.
- **Decisions and assumptions:** the measurement ID stays out of the repository even though it is
  public information, so that the "unset means dormant" property holds for every checkout.
- **Risks or compatibility impact:** the previous watch's validation claim of "43 routes
  prerendered" was wrong - the build reports 39 static routes and emits 41 HTML files. Corrected
  here rather than edited there.
- **Open issues or blockers:** none in the code.
- **Next first action:** in the GA4 console, switch Enhanced measurement **off** on the `applye.dev`
  stream, then register the ten custom dimensions from `ANALYTICS_SETUP.md`.
- **Evidence:** `apps/web/src/app/analytics/measurement-id.ts`, `docs/internal/ANALYTICS_SETUP.md`.

### 2026-07-26, website analytics: traffic attribution and click tracking wired

- **Status:** complete for the code; the GA4 property itself does not exist yet, so no data flows
- **Agent/tool:** Claude Code
- **Branch:** `feat/web-analytics`
- **Commits:** see branch
- **Pull request:** not opened
- **Objective:** know where visitors come from and how many click through to a download.
- **Completed:**
  - Measurement ID moved out of hand-edited source into `analytics/measurement-id.ts`, generated at
    build time by `tools/generate-analytics-config.mjs` from `GA_MEASUREMENT_ID`, chained into
    `npm run web:build`. Malformed value fails the build; unset keeps `G-PLACEHOLDER`.
  - `analytics/events.ts` added as the single event contract: six events, twelve parameters, an
    allow-list sanitiser, and user-agent OS detection. Anything off the list is dropped in the
    browser before it reaches gtag.
  - `AnalyticsService` gained `downloadClick`, `outboundClick`, `ctaClick`, `localeSwitch`, and now
    stamps `locale` on every event.
  - `Track` directive (`appTrack`) for declarative click tracking; wired into the hero CTAs (both
    `COMING_SOON` branches), `SourceLink` (nav/footer/hero sections), the footer social and author
    links, and the language switcher.
  - `docs/internal/ANALYTICS_SETUP.md`: GA4 property creation, the ten custom dimensions to register
    before traffic arrives, internal-traffic filter, Search Console link, Cloudflare Pages settings,
    and UTM conventions.
  - `tools/release-downloads.mjs` (`npm run web:downloads`): completed download counts from the
    GitHub releases API, the number GA4 structurally cannot produce.
- **Not completed:** the GA4 property is not created and `GA_MEASUREMENT_ID` is not set anywhere, so
  the site still ships analytics switched off. Cloudflare Pages project not created. Decision on
  adding Cloudflare Web Analytics as a cookieless complement is open.
- **Files or packages changed:** `apps/web/src/app/analytics/*`, `app.html`, `app.ts`, `landing.html`,
  `landing.ts`, `cookies.ts`, `privacy.html`, `ui/source-link.ts`, `ui/language-switcher.ts`,
  `apps/web/tools/*`, `package.json`, `docs/internal/ANALYTICS_SETUP.md`.
- **Validation:** `nx test web` 47 passed (was 41), `nx lint web` pass, `tsc --noEmit -p
apps/web/tsconfig.app.json` pass, `npm run format:check` pass, `git diff --check` pass,
  `npm run web:build` pass (43 routes prerendered). Generator verified in all three modes: valid ID
  written, malformed ID exits 1, unset resets to placeholder. Prerendered output checked directly -
  `googletagmanager` appears in the JS bundle only, in zero of 43 HTML files. Browser-preview
  verification was attempted and blocked by a policy check on the tab; the static output check above
  stands in for it.
- **Privacy/security impact:** privacy-sensitive. The hard consent gate is unchanged: nothing loads
  before opt-in. Collection is now _narrower_ in guarantee than before, because `sanitiseParams`
  makes the documented list enforceable rather than aspirational. Corrected a false claim: `/cookies`
  stated download clicks were tracked when no such event existed. Both `/cookies` and `/privacy` now
  enumerate the exact six events, including that declining records nothing at all.
- **Decisions and assumptions:** gtag over GTM, so the measurable surface stays reviewable in a diff.
  Hard consent gate over Consent Mode v2 - stricter, at the cost of consenting-traffic-only reports.
  GA4 enhanced measurement must be switched OFF on the data stream or page views double-count.
  Measurement ID treated as a public build variable, not a secret.
- **Risks or compatibility impact:** none shipped - with no ID set, every code path stays dormant.
  The `download_click` wiring sits in the `COMING_SOON = false` branch and is therefore untested
  against a real download button until that flag flips.
- **Open issues or blockers:** GA4 property creation is a manual console task for the maintainer.
- **Next first action:** create the GA4 property by following `docs/internal/ANALYTICS_SETUP.md`,
  then set `GA_MEASUREMENT_ID` on the Cloudflare Pages production environment.
- **Evidence:** `docs/internal/ANALYTICS_SETUP.md`, `apps/web/src/app/analytics/events.ts`,
  `apps/web/src/app/analytics/analytics.spec.ts`.

### 2026-07-26, marketing-site design pass: 5 of 8 WEBSITE_PLAN gaps closed

- **Status:** partial - every unblocked item is done; three are blocked on assets that do not exist
- **Agent/tool:** Claude Code with the `impeccable` skill (brand register), verified in the browser preview
- **Branch:** `main`
- **Commits:** none yet - uncommitted in the working tree
- **Pull request:** none
- **Objective:** Work the 8-item gap analysis in `docs/design/WEBSITE_PLAN.md` to bring `apps/web` to launch quality.
- **Completed:**
  - **Gap 4 + 8 (hero CTA).** Both hero controls were disabled: a `disabled` "Download (coming soon)" button plus the private-repo source pill. A hero whose only two controls are dead reads as broken, not as pre-release. The primary CTA is now "Read the docs", the one thing a visitor can actually do today; the download became a status line carrying its own reason. Flipping `COMING_SOON` in `site.ts` promotes the real download and demotes the docs link to ghost.
  - **Gap 6 (engine-agnostic proof).** New `#engines` band on `/`, in two labelled groups. Deliberately wordmarks rather than vendor logos: reproducing another company's mark on a marketing page implies a partnership that does not exist.
  - **Gap 5 (OG image).** Verified already shipped and correct - `applye-og.png` is 1200x630, wired in `index.html` and `seo.service.ts`. The plan doc's "1280x640, not wired" was stale; corrected there.
  - **Gap 7 (consistency pass).** Detailed in `WEBSITE_PLAN.md` §3. Headlines: contrast (`--text-tertiary` was 2.75-3.38:1 doing body-text duty against a 4.5:1 floor; light-theme `--success`/`--warning`/`--danger` were 2.61/2.23/3.73:1 as text); three independent causes of horizontal document scroll on a 375px viewport; a `forced-colors` focus fallback for a `box-shadow`-only ring; a banned side-stripe border on the local-rules list; clipped comparison tag when stacked.
  - **Out of scope but false.** The site claimed a Gemini CLI bridge in all six locales. `apps/desktop/src-tauri/src/ai/cli.rs:222` only has adapters for Claude Code and Codex - Google withdrew Gemini CLI for personal accounts on 2026-06-18. Corrected in the feature copy and the FAQ across every locale; the new engines band lists Gemini under API keys only.
- **Not completed:** Gaps 1 (hero product shot), 2 (demo GIF or video band) and 3 (six feature screenshots). All three need captures of the running desktop app seeded with the ASSETS_BRIEF persona; none of `docs/assets/hero-banner.png`, `demo.gif` or `screens/*.png` exists. No placeholder was shipped in their place - a colored box where a product shot belongs is worse than the current CSS mock, which at least depicts the real UI.
- **Files or packages changed:** `apps/web/src/app/landing.html`, `landing.ts`, `compare.html`, `styles.scss`, `i18n/messages.ts` and all six `i18n/messages/*.ts`; `docs/design/WEBSITE_PLAN.md`.
- **Validation:** `npx nx test web` (41 passed), `npx nx lint web`, `npx tsc -p apps/web/tsconfig.app.json --noEmit`, `npm run format:check`, `npx nx build web` (39 routes prerendered), `git diff --check` - all pass and all observed. In-browser on the running dev server: a full text-node contrast sweep reports zero AA failures in both themes; zero horizontal document overflow at 375px across `/`, `/docs`, `/docs/guide/score`, `/methodology`, `/compare`, `/changelog`, `/press`, `/manifesto`, `/sustain`, `/privacy`. No new unit tests - the changes are CSS, copy and markup with no new component logic.
- **Privacy/security impact:** None. No data handling, storage, network or permission surface touched. The corrected AI-provider copy makes a public claim more accurate, which is an honesty improvement rather than a security one.
- **Decisions and assumptions:**
  - Contrast fixes are **web-scoped overrides in `apps/web/src/styles.scss`, not token edits**. `libs/ui/tokens.css` states it mirrors the design system and is not hand-edited, and it is shared with the desktop app. The measurements apply to the app too.
  - The dark canvas has no grey both dimmer than `--text-secondary` and passing 4.5:1, so the third text tier is retired web-side; the demotion is carried by size and family instead of a failing colour.
  - The `applye-eyebrow` kicker above nearly every section is the `impeccable` skill's flagged AI-scaffold pattern, but it is an established named class in the shipped design system. Identity preservation won; the new engines band simply does not add another one. Raising it is a separate call.
  - Engine lists live in `landing.ts`, not the locale bundles: they are proper nouns, and they must track `cli.rs` rather than a translator.
- **Risks or compatibility impact:** Low. The `--text-tertiary` override flattens two text tiers to one shade on the marketing site only; the desktop app is untouched. `.docs__tablescroll` is new markup on `/compare` only.
- **Open issues or blockers:**
  - **Blocking gaps 1-3:** hero banner, demo GIF, six app screenshots. Maintainer-produced per `docs/assets/ASSETS_BRIEF.md`.
  - **Needs a decision:** whether the measured contrast corrections go back into `libs/ui/tokens.css` and the design system, which would fix the desktop app too.
  - `WEBSITE_PLAN.md` §1 still says "as of v0.24.0" against an actual 0.28.0; the route inventory was spot-checked and is still accurate.
- **Next first action:** Review the diff and commit as `fix(web): close the unblocked website-plan gaps`, or split the Gemini CLI copy correction into its own `fix(web)` commit since it is a truthfulness fix independent of the design pass.
- **Evidence:** Gate output above. Contrast figures and overflow widths were computed in-page against the running dev server, not estimated. Screenshot verification was partial: the browser pane reported a zero-size viewport for scrolled content, so the hero and the engines band were confirmed visually and everything else numerically via measured DOM geometry.

### 2026-07-26, stand up the security@ and conduct@ reporting mailboxes

- **Status:** complete
- **Agent/tool:** Claude Code (guidance only; the maintainer performed all Cloudflare dashboard actions)
- **Branch:** `main`
- **Commits:** none - infrastructure change, no repository files required edits
- **Pull request:** none
- **Objective:** The public-release documentation pass (entry below, 2026-07-26) flagged that `SECURITY.md` and `CODE_OF_CONDUCT.md` publish `security@applye.dev` and `conduct@applye.dev`, but neither mailbox existed - a dead vulnerability/conduct reporting channel on a domain about to go public.
- **Completed:** Cloudflare Email Routing enabled on `applye.dev`. Destination address `vitala2089@gmail.com` added and verified. DNS records added (3 MX to `route{1,2,3}.mx.cloudflare.net`, SPF TXT, DKIM TXT) - all showed "Missing" before, no pre-existing MX conflict. Two routing rules created: `security@applye.dev` and `conduct@applye.dev`, both forwarding to the verified destination. Delivery confirmed in both directions with a real external test email. A DMARC TXT record (`_dmarc.applye.dev`, `v=DMARC1; p=reject; rua=mailto:security@applye.dev`) was added afterward against domain spoofing.
- **Not completed:** Catch-all routing was deliberately left disabled (would collect spam for every unused local part). No SMTP send-as was configured - Email Routing is receive-only, so replies go out from the maintainer's personal address, not from the alias. That is acceptable for a reporting channel where the maintainer replies personally.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md` (new bullet marking the item resolved). `SECURITY.md` and `CODE_OF_CONDUCT.md` were checked and already referenced the correct addresses - no edit needed.
- **Validation:** Manual: destination-address verification email received and confirmed; DNS records confirmed added in the Cloudflare dashboard; end-to-end delivery to both `security@` and `conduct@` confirmed by the maintainer. No automated repository gates apply - no tracked source files changed.
- **Privacy/security impact:** Direct security-relevant change. Closes the dead-channel gap the previous watch flagged: reports sent to the published addresses now reach the maintainer instead of bouncing. DMARC `p=reject` reduces the domain's exposure to spoofed mail sent as `@applye.dev`. The maintainer's personal address remains the actual delivery destination (visible to Cloudflare, not published in the repository) - unchanged risk, already accepted per the prior entry.
- **Decisions and assumptions:** Cloudflare Email Routing (free, receive-and-forward) chosen over a full mailbox provider (Google Workspace, Zoho, Migadu) since the channel only needs to receive reports, not send as the alias.
- **Risks or compatibility impact:** None to the codebase. If the domain's nameservers or MX ever move off Cloudflare, both aliases stop receiving silently unless someone checks - worth a periodic manual send-test.
- **Open issues or blockers:** None.
- **Next first action:** No code follow-up. Optional: a periodic (e.g. quarterly) manual test email to `security@` / `conduct@` to catch silent DNS drift.
- **Evidence:** Cloudflare Email Routing dashboard (DNS records all Active, destination Verified, 2 routing rules); maintainer-confirmed delivery of test emails to both addresses.

### 2026-07-26, move Discover's Sources control out of the filter row

- **Status:** complete
- **Agent/tool:** Claude Code
- **Branch:** `main`
- **Commits:** not yet committed at the time of this entry
- **Pull request:** not opened yet
- **Objective:** Reported from use: with an empty Discover list there is no way to reach the sources drawer, so a user who has cleared the list or disabled every feed cannot turn one back on.
- **Completed:** Confirmed in the template. The Sources button lived inside `.dv-filters`, which renders only under `view() === 'feed'`, so views `caughtup`, `never` and `scanning` had no entry to the drawer at all; the only other entry is the first-run CTA, and `first` requires that nothing has ever been enabled _and_ nothing has ever been scanned. Moved the button into `.dv-head__right` beside Scan, which `showHeader()` renders for every view except `first` and `skeleton`, so one move covers all four dead-end states. `first` keeps its own large "Choose sources" CTA. `.dv-filters__clear` took over the `margin-left: auto` that the moved button was carrying, so the filter row's right edge is unchanged. New `discover.component.spec.ts` pins the drawer as reachable in `caughtup`, `never` and `feed`, pins the first-run CTA as the single opener in `first`, asserts exactly one opener per view so the control cannot be quietly duplicated, and clicks the header button to confirm it opens the drawer.
- **Not completed:** No native check of the rendered screen. Discover reads everything through Tauri IPC, so it does not render meaningfully in a plain browser preview; the move is covered by the DOM assertions in the new spec instead.
- **Files or packages changed:** `apps/desktop/src/app/pages/discover/discover.component.html`, `discover.component.scss`, new `discover.component.spec.ts`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, `docs/internal/DUTY_WATCH.md`.
- **Validation:** Run and observed: `npm run type-check` (6 projects, pass), `npm run lint` (6 projects, pass), `npm test` (6 projects, pass; desktop 696 -> 701 tests), `npm run format:check` (pass), `npx nx build desktop` (pass), `git diff --check` (clean). **Not run:** `tauri dev`.
- **Privacy/security impact:** None. Presentation-only; no data, IPC surface or network behavior changed.
- **Decisions and assumptions:** The header was chosen over duplicating the button into each empty state (three copies of one action drift apart) and over rendering the filter row unconditionally (filters over an empty list are noise). Sources controls what gets scanned, so it does not belong among controls that narrow what was already scanned.
- **Risks or compatibility impact:** The header row gains a control, so it is now three items wide at its widest (last-scan text, Sources, Scan). Not checked below the app's minimum window width.
- **Open issues or blockers:** None.
- **Next first action:** Launch `npm run desktop:dev`, clear the Discover list, and confirm Sources opens the drawer from the caught-up state; check the header does not wrap at the narrowest supported window.
- **Evidence:** Branch diff; `npx nx test desktop --testPathPattern=discover.component` output; check output quoted above.

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
