# Next session prompt

Copy everything below the line into a fresh session.

---

**`0.29.4` is published and it is the first release whose Windows build is not quietly broken.** The
maintainer installed the released macOS DMG, hit macOS' "unexpectedly quit while reopening windows"
loop, and asked for the installer to be fixed. The installer turned out to be fine; the app was
aborting inside `setup`. Fixing that surfaced a second, older bug: every Windows release ever built
shipped with its AI skill frontmatter silently dropped. Both are fixed and released. Full chain in
`docs/internal/DUTY_WATCH.md`'s `2026-08-26` entries.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the newest entry in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, clean, at `c11eac2f` (`#541`) or later - **verify
  this before trusting anything else below**, this repository's working tree has repeatedly reset
  between sessions.
- **Nothing is mid-flight. No open pull requests.** `#540` and `#541` are merged, `v0.29.4` is tagged
  and its GitHub release is **published** (17 assets, `latest.json` covering all 11 platform targets).
  `/releases/latest` resolves to `v0.29.4`, so the README download links and the updater endpoint in
  `tauri.conf.json` both point at it.
- **Three stale branches remain on `origin`** and every one of them is fully superseded - verified,
  not assumed: `chore/release-0.29.4` (its content is on `main`; the only diff is a 7-line paths
  filter that landed later), `fix/paginated-sheet-print-height-margin` (landed as `#514`),
  `refactor/discover-rs-split` (landed as `#273`). Safe to delete whenever the maintainer wants.
- **`0.29.4` was published before the `docs/RELEASE.md` smoke test was run.** That check is therefore
  owed retroactively, and three items on it are specific to this release: an update from an installed
  `0.29.2` to `0.29.4` (the only thing that really exercises the manifest end to end); on Windows,
  that `job-identify` now resolves its model tier and `cv-import` its description; and on a Windows
  machine carrying a pre-`0.29.4` install, that the migration mismatch shows the named error dialog
  rather than dying silently. If any of these fail, a `0.29.5` is cheap.

## What shipped in `0.29.4`, and why it matters to the next change

- **A panic in `Builder::setup` used to abort the process with no message anywhere.** Tauri v2 runs
  `setup` from inside `RuntimeRunEvent::Ready` (`tauri-2.11.5/src/app.rs:1424`), which on macOS is
  dispatched from `applicationDidFinishLaunching`, an `extern "C"` callback. A panic there cannot
  unwind, so it becomes `abort()`; macOS then treats each following launch as a crashed window restore
  and offers to reopen, which aborts again. `apps/desktop/src-tauri/src/startup.rs` is the fix and
  carries the full reasoning. **Any new fallible work added to that setup closure must route through
  `startup::fail`, never through `?`, `unwrap`, `expect`, or `panic!`.**
- **Release builds now write logs.** `tauri-plugin-log` was registered only under
  `cfg!(debug_assertions)`, so a shipped build produced no diagnostics at all, which is exactly why
  the maintainer's original crash could never be traced to a line. It is registered in every build
  now, and a panic hook appends every panic to `startup-crash.log` beside `Applye.log` in the OS log
  directory. **If a native bug report arrives, ask for those two files first.**
- **`.gitattributes` now pins `* text=auto eol=lf`.** Two things here compile from file _bytes_:
  skills are embedded with `include_str!` and `split_frontmatter` matches a literal `---\n`, and
  `sqlx::migrate!` hashes migration bytes. A CRLF checkout therefore dropped every skill's frontmatter
  and produced different migration checksums on Windows. `git add --renormalize .` changed no file
  contents when this landed, so nothing in the tree was rewritten.
- **`.github/workflows/windows-check.yml` is new.** `ci.yml` gates on `ubuntu-latest` alone, so
  `#[cfg(target_os = "windows")]` code used to compile for the first time at tag time. The new job
  runs clippy plus the Rust tests on `windows-latest` for pull requests touching
  `apps/desktop/src-tauri/**`, `libs/skills/**`, or `.gitattributes`. It found the CRLF bug on its
  very first run. macOS is not in the matrix because it is the maintainer's own dev platform.

## What's open

Nothing is mid-flight. These are candidates, not a queue - **ask the maintainer which one before
starting**, same rule as always. The maintainer's own stated preference at the end of the
`2026-08-26` session was the German pack.

1. **The German pack, P0 in `docs/product/IDEAS.md`** - German Discover sources (the built-in set is
   Remotive/WWR/Himalayas only, none German) and the DIN 5008 Anschreiben fields every DE posting
   asks for. The only P0 in that file. P1 behind it: Bewerbungsmappe as one artifact, the
   `DE-tabular` Lebenslauf template, an Arbeitszeugnis decoder, Eigenbemuehungen quota tracking.
2. **A headless smoke test of the packaged installers.** No gate anywhere proves that an installed
   `.msi`, `.AppImage` or `.dmg` actually launches, which is the exact class of bug that started the
   `2026-08-26` session and shipped for months undetected. Shape: after `release.yml` builds, launch
   the artifact per platform (`xvfb-run` on Linux, a silent install then run on Windows), wait, and
   assert the process is alive and `startup-crash.log` is absent. Cheap, and it is the same category
   of insurance the Windows job just proved out.
3. **`docs/internal/NATIVE_GATE_BACKLOG.md`** - 36 of 83 checks from the 2026-08-20 walk are still
   unticked, concentrated in sections C9 through C12, D and E. No agent can drive any of this; it
   needs the maintainer's own hands in `tauri dev`.
4. **`S1`'s actual root cause** (pass 2 emits ~2200 output tokens against a declared six-to-ten-bullet
   schema; tighten or cap it in `libs/skills/src/resume-tailoring/resume-tailoring.md`) and **`S3`'s
   native cache-hit measurement** (run a tailoring job twice in one session, check `cachedTokens` on
   passes 2 and 3). Both small, both already diagnosed. `S1` is still recorded as only partially
   addressed in `docs/internal/NATIVE_GATE_FINDINGS.md` because the fix was never re-measured against
   the original wall-clock baseline.
5. **Developer ID signing and notarisation.** Builds are ad-hoc signed (`Signature=adhoc`,
   `no CMS blob`, `Unable to get teamId`), so a downloaded copy hits "Applye.app is damaged" and the
   maintainer currently clears it by hand with `xattr -dr com.apple.quarantine`. **Deferred by the
   maintainer on 2026-08-27**, because the blocker is the Apple Developer Program fee, not the work.
   When it is unblocked the CI side is one session: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` as repo secrets, wired into
   `tauri-action`, plus a `bundle.macOS` block in `tauri.conf.json`. Do not re-propose it as a
   technical oversight; it is a business decision that has already been made.
6. **`jobs.component.ts`** (419 lines, shrunk from 1076+) still has no spec file, and neither do
   several of its extracted step components.
7. **One open Dependabot alert**, moderate: `glib`, unsoundness in `VariantStrIter`. Transitive
   through GTK, so Linux only.
8. **`docs/product/FEATURE_INDEX.md`** has not been reconciled against everything shipped since
   `v0.22.0`. Flagged, never done.

## Do not re-open

- **`split_frontmatter` is strict on purpose.** It matches a literal `---\n` and is deliberately not
  CRLF-tolerant: with `eol=lf` no checkout can hand it CRLF, and a second mechanism for the same
  guarantee is a second thing to keep true. Do not "harden" it without saying why the first mechanism
  stopped being enough.
- **`startup::fail` leaves the window on screen on purpose.** Closing it ends the app before the
  dialog can appear, and hiding it hands the app to AppKit's automatic termination, which quits
  silently with status 0. Both were measured. Leaving it up is safe because an unmanaged `State<T>`
  returns an `InvokeError` rather than panicking (`tauri-2.11.5/src/state.rs:60`).
- **The `v0.29.4` tag points at `6d1a1f9e`, which is not an ancestor of `main`.** `#541` was squash
  merged while the tag already existed. The trees are byte-identical to `c11eac2f`, so the artifacts
  are correct; only `git describe` on `main` is affected. Retagging would mean deleting a published
  tag for zero functional gain. Leave it.
- **Migrations were switched to LF knowing it breaks old Windows installs.** Those installs recorded
  CRLF checksums in `_sqlx_migrations` and need a reinstall. The maintainer chose this over leaving
  the two platforms permanently divergent, and the choice is cheap now in a way it would not be later.
- **The apply-wizard grilling decisions (`#536`)**: the Create-application CV gate is UI-only, with an
  inline reason plus a jump back to Review documents; `Update application` is deliberately not gated
  the same way, since a job can reach `applied` with zero documents through the Apply self-report;
  the skipped-tailoring fix is the scoped one shipped, not a persisted route-state machine. **F2**
  (gate cover-letter generation on a linked CV) was proposed and declined: a cover letter is built
  from the profile and job description, not the CV. **F8** was walked natively and found clear.
- **`S3`'s cache scope was deliberately narrowed** to `resume-tailoring`'s three passes, not
  standardised across every skill that repeats profile/job-description text. That broader change needs
  every skill's `[USER]` template to match byte for byte and was left for its own `aif-grilling` round.
- **Everything earlier prompts closed stays closed**: the print pipeline, `B5`, the export-filename
  unification, `#520`-`#526`'s tailoring/scoring bugs, `B9`, and `PR #528`'s four lock-gap fixes. If
  new information changes any of these premises, say so explicitly and re-triage rather than quietly
  re-deciding.
- **A screenshot or rasterized PDF export is not the fix for anything print-related.** ATS parsers
  need real, selectable text. **Third-party PDF libraries** were raised out of frustration once and
  should not be adopted reflexively.

## Release notes worth keeping

- **A failed matrix job leaves a draft that looks complete.** On `2026-08-26` the Intel macOS job died
  mid-upload, after `x64.dmg` had already landed. Every installer was present, the asset count looked
  plausible, and the only missing pieces were the updater archive and its signature - which meant
  `latest.json` had no `darwin-x86_64` entry at all and Intel users would have silently never been
  offered the update. **Before publishing any draft, read `latest.json` and count its platforms.**
  Re-running just the failed job repairs this: `tauri-action` merges platform entries into the
  existing manifest rather than overwriting it, which is why a matrix produces one combined file.
- **`gh release delete` is blocked for the agent** by the harness permission classifier. Hand the
  command to the maintainer rather than looking for a way around it.
- Release builds take roughly 15 minutes across the four-platform matrix. `fail-fast: false` means a
  single platform failing still produces a draft from the others.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context, so every gateway call fails and the app renders empty states only.
  Useful for pure DOM/CSS/template-compile checks; useless for anything needing a real job, CV, or
  application, which needs a native `tauri dev` pass only the maintainer can drive.
- **Crash reports beat guessing.** The `2026-08-26` root cause came out of
  `~/Library/Logs/DiagnosticReports/*.ips` plus `log show --start ... --end ...`, not from reading
  code and speculating. Thread names in a crash report are evidence too: the absence of any
  `sqlx-sqlite-worker-*` thread is what proved no database connection had been opened yet.
- **When the maintainer reports a fix "isn't working," check for a stale build before re-diagnosing
  the code**, and check the fix's _target_ second. Both have happened before.
- **Check whether the problem is even yours.** A whole afternoon on `2026-08-26` went to a GitHub
  Actions major outage: `startup_failure` runs, a PR head that would not sync, and a run stuck queued
  for three and a half hours that the API simultaneously called completed. `curl -s
https://www.githubstatus.com/api/v2/summary.json` answers this in one call. Runs that die of an
  outage cannot be re-run; close and reopen the pull request instead, which retriggers without a junk
  empty commit.
- **Cut every branch from `main`**, and check `git branch --show-current` first. After a PR merges,
  `git checkout main && git pull --ff-only`, then delete the local feature branch. **A squash merge
  makes the branch commits non-ancestors of `main`**: pushing to that branch afterwards does not
  update the pull request, which on `2026-08-26` cost a confused half hour and a second PR.
- **When several open items have different blockers, ask which one rather than guessing.**
- **Grill before committing to a redesign.** Read the actual code first; it has repeatedly turned a
  proposed large change into a small scoped one.
- **Voice input on this channel drops or garbles words.** If a described UI element does not match
  anything in the code, say so and ask for the exact label rather than guessing.
- **`main` can move between messages in the same session.** `git pull --ff-only` before trusting a
  diff against `main`.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui,i18n,core --skip-nx-cache` (scope to touched
projects), `nx test data`, `nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` if
touched, `nx test i18n` if any locale file changed, `nx test core` and `nx build web` if `libs/core`
changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it changed, `nx build
desktop`, `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`,
`git diff --check`.
