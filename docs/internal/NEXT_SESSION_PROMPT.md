# Next session prompt

Copy everything below the line into a fresh session.

---

**Two small, independent pieces landed since `v0.29.4`: a first German Discover source, and a
headless installer smoke test that found three real CI bugs the moment it actually ran.** Neither
changes any schema or public API. Full chain in `docs/internal/DUTY_WATCH.md`'s `2026-08-27` entries
(there are two - read both).

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the newest entries in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, clean, at `e87b43b6` (`#544`) or later - **verify
  this before trusting anything else below**, this repository's working tree has repeatedly reset
  between sessions.
- **One open pull request: [#545](https://github.com/vitala89/applye/pull/545)**, `ci(release):
correct the smoke-test's Linux GL deps and Windows exe path`, mergeable and all checks green at the
  time of this entry. Merge it before starting anything else in this area - it fixes real bugs in the
  workflow `#544` just added, found by actually running it. Nothing else is mid-flight.
- **`#543` (German pack: service.bund.de) and `#544` (installer smoke test, phase 1) are both merged.**
  `v0.29.4` remains the current published release; nothing here has been tagged or released.

## What shipped since `v0.29.4`, and why it matters to the next change

- **`service.bund.de` is now a built-in Discover source** (`migrations/0030_de_bund_source.sql`,
  disabled by default like every built-in). It lands on the existing `rss` source type - no new Rust
  parser code, same pattern as DOU.ua. `docs/product/local-markets-analysis.md`'s `2026-08-27` section
  has the live-probe findings for the four other candidates from the same `IDEAS.md` item (EURES,
  Interamt, `ats_join`, `ats_softgarden`) - **read it before touching any of them**, each is blocked on
  something concrete, not just unresearched:
  - EURES works live, but its only known endpoint is undocumented by its operator (a third-party
    reverse-engineered wrapper of the EU portal's own internal search API) - a legality-tier call.
  - Interamt: no live RSS/JSON endpoint was found after probing every plausible URL.
  - `ats_join`: the job-list endpoint needs a numeric company id with no slug-to-id lookup; resolving
    it would mean scraping HTML for a JSON blob, which `discover_fetch.rs`'s own module doc rules out.
  - `ats_softgarden`: its API requires a per-client token, unlike the other four keyless ATS types.
- **`.github/workflows/installer-smoke-test.yml` is new** - `workflow_dispatch`-only, not wired into
  `release.yml`. Downloads a chosen release's Linux AppImage and Windows MSI, launches each headlessly
  (`xvfb-run` on Linux; silent `msiexec /quiet` install then run on Windows), asserts the process
  stays up 10s with no `startup-crash.log`. **It was actually dispatched against `v0.29.4`, twice, not
  just written and left untested** - the first run failed both jobs. Three bugs, all now fixed on
  `#545`:
  1. `libfuse2t64` is a Ubuntu 24.04 package name; `ubuntu-22.04` (the runner used) needs `libfuse2`.
  2. A bare `ubuntu-22.04` runner has no desktop GL stack - the AppImage's WebKitGTK dependency
     couldn't load `libEGL.so.1`, then `libGLESv2.so.2`, even under `xvfb-run`. Needs `libegl1`,
     `libgl1-mesa-dri`, `libgles2`.
  3. The installed Windows binary is `applye-desktop.exe` (the Cargo package name), **not**
     `Applye.exe` - there is no `mainBinaryName` override in `tauri.conf.json`. Any future script that
     needs the installed binary must search for it (`Get-ChildItem -Recurse`), not assume a path.
  - **macOS is deliberately not covered.** It's the maintainer's own dev platform and is already
    smoke-tested by hand every release (`docs/RELEASE.md` Step 0).
- **A live reminder about GitHub's "Commit suggestion" button on CodeQL findings**: it pushes a commit
  with `Co-authored-by: Copilot Autofix powered by AI` straight to the PR branch, which this
  project's `quality:attribution` gate correctly rejects. The underlying fix is usually worth keeping
  - amend the commit to drop the trailer and force-push (safe on an unmerged, single-author branch),
    don't revert the fix itself. This happened once already on `#544`.

## What's open

Nothing is mid-flight beyond merging `#545`. These are candidates, not a queue - **ask the maintainer
which one before starting**, same rule as always.

1. **Installer smoke test, phase 2** - wire the same launch-and-assert logic into `release.yml` itself
   as additional steps in the existing Linux and Windows matrix legs (operating on the freshly-built
   local bundle, no download needed), as a **blocking** step - `fail-fast: false` already isolates a
   failure to that one platform's leg. This was explicitly deferred to its own round, gated on the
   maintainer's go-ahead, because `release.yml` only runs on a real version-tag push and a mistake
   there is only provable at the next actual release.
2. **The German pack, P1 in `docs/product/IDEAS.md`** - Bewerbungsmappe as one merged-PDF artifact,
   the `DE-tabular` Lebenslauf template, an Arbeitszeugnis decoder, Eigenbemuehungen quota tracking.
   P0's Discover-sources item still has EURES/Interamt/`ats_join`/`ats_softgarden` open too, each
   blocked on something specific - see above.
3. **`docs/internal/NATIVE_GATE_BACKLOG.md`** - 36 of 83 checks from the 2026-08-20 walk are still
   unticked, concentrated in sections C9 through C12, D and E. No agent can drive any of this; it
   needs the maintainer's own hands in `tauri dev`. This now also includes the never-run native gate
   for the `service.bund.de` source itself: enable it in the Sources drawer, confirm a real scan
   returns jobs with a populated location.
4. **`S1`'s actual root cause** (pass 2 emits ~2200 output tokens against a declared six-to-ten-bullet
   schema; tighten or cap it in `libs/skills/src/resume-tailoring/resume-tailoring.md`) and **`S3`'s
   native cache-hit measurement** (run a tailoring job twice in one session, check `cachedTokens` on
   passes 2 and 3). Both small, both already diagnosed.
5. **Developer ID signing and notarisation.** Deferred by the maintainer on 2026-08-27 - the blocker
   is the Apple Developer Program fee, a business decision already made. Do not re-propose it as a
   technical oversight.
6. **`jobs.component.ts`** (419 lines, shrunk from 1076+) still has no spec file, and neither do
   several of its extracted step components.
7. **One open Dependabot alert**, moderate: `glib`, unsoundness in `VariantStrIter`. Transitive
   through GTK, so Linux only.
8. **`docs/product/FEATURE_INDEX.md`** has not been reconciled against everything shipped since
   `v0.22.0`. Flagged, never done.

## Do not re-open

- **The `discover_fetch.rs` no-HTML-scraping rule** is why `ats_join` is blocked, not a gap to work
  around. Its module doc says "never to an HTML scraper" on purpose - a company-id lookup that parses
  a page's embedded JSON is still scraping. If `ats_join` becomes worth it, that principle needs its
  own decision, not a quiet exception.
- **`split_frontmatter` is strict on purpose.** It matches a literal `---\n` and is deliberately not
  CRLF-tolerant: with `eol=lf` no checkout can hand it CRLF, and a second mechanism for the same
  guarantee is a second thing to keep true.
- **`startup::fail` leaves the window on screen on purpose.** Closing it ends the app before the
  dialog can appear, and hiding it hands the app to AppKit's automatic termination, which quits
  silently with status 0.
- **The `v0.29.4` tag points at `6d1a1f9e`, which is not an ancestor of `main`.** Trees are
  byte-identical to `c11eac2f`; only `git describe` on `main` is affected. Leave it.
- **Migrations were switched to LF knowing it breaks old Windows installs.** Accepted deliberately.
- **The apply-wizard grilling decisions (`#536`)** and **`S3`'s narrowed cache scope** stay closed -
  see the previous prompt's reasoning if this needs re-litigating, and re-triage explicitly rather
  than quietly re-deciding.
- **Everything earlier prompts closed stays closed**: the print pipeline, `B5`, the export-filename
  unification, `#520`-`#526`'s tailoring/scoring bugs, `B9`, `PR #528`'s lock-gap fixes.
- **A screenshot or rasterized PDF export is not the fix for anything print-related.** ATS parsers
  need real, selectable text.

## Workflow notes worth keeping

- **Test the mechanics before wiring them into something that only runs for real once.** `release.yml`
  only triggers on a version-tag push, so anything added there directly is unprovable until the next
  actual release. The fix was a standalone `workflow_dispatch` workflow, proven against
  already-published assets first - and it immediately found three bugs that pure review and
  `actionlint` both missed. Apply the same instinct to any other change to `release.yml` or
  `windows-check.yml`.
- **`workflow_dispatch` only works from a workflow file already on the default branch.** You can
  target a different `--ref` for the _run_, but the workflow must exist on `main` first, or `gh
workflow run` 404s. This means genuinely new dispatch-triggered workflows need one merge before
  their first real test - budget for a small follow-up PR with the fixes that surfaces.
- **GitHub's CodeQL "Commit suggestion" button injects a `Co-authored-by: Copilot Autofix` trailer.**
  If a maintainer applies one on a PR this project's `quality:attribution` gate will fail it. Keep the
  underlying fix, amend the commit to drop the trailer, force-push (safe on an unmerged branch).
- **A missing runtime library on a bare CI runner is not a code bug** - `libEGL.so.1` and
  `libGLESv2.so.2` were absent because GitHub's `ubuntu-22.04` runner has no desktop GL stack, not
  because anything in the app or the AppImage was wrong. `apt-get install` the runtime dependency and
  move on; don't go looking for a bug in application code first.
- **Cut every branch from `main`**, and check `git branch --show-current` first. After a PR merges,
  `git checkout main && git pull --ff-only`, then delete the local feature branch.
- **`main` can move between messages in the same session.** `git pull --ff-only` before trusting a
  diff against `main`.
- **When several open items have different blockers, ask which one rather than guessing.**
- **Grill before committing to a redesign or a CI-pipeline change.** Read the actual code and probe
  the actual endpoint first; it has repeatedly turned a proposed large or risky change into a small,
  scoped, provably-correct one - the German-pack sourcing and the smoke-test's phase split both came
  from this.
- **Live-probe external things before committing to them**, the same rule `local-markets-analysis.md`
  already followed for job sources: a live `curl`/dispatch run finds real shape, auth, and packaging
  problems that reading documentation alone does not.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui,i18n,core --skip-nx-cache` (scope to touched
projects), `nx test data`, `nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` if
touched, `nx test i18n` if any locale file changed, `nx test core` and `nx build web` if `libs/core`
changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it changed, `nx build
desktop`, `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`,
`git diff --check`. For a GitHub Actions workflow change specifically: `actionlint`, plus a real
`workflow_dispatch` run if the workflow is dispatch-triggered - do not consider it verified from
review alone.
