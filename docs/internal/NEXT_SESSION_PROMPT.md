# Next session prompt

Copy everything below the line into a fresh session.

---

**Three streams, in this order: fix what the native gate found, then security, then structure.** The
order is deliberate and explained below. Do not start with the structural work - it is the least
urgent and the most likely to bury the rest in diff noise.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`.

**`docs/internal/NATIVE_GATE_FINDINGS.md` is the work list for stream 1.** It is the record of the
first full manual walk of the release gate, done on 2026-08-20, and every item in it was seen in the
running app rather than inferred.

## Where things stand

The eight-gateway migration and the `ADR-0005` file-size campaign are both **finished** - do not
re-open or re-plan them. Zero files are over budget in all seven categories.

The native gate has been walked once: **46 of 83 checks pass, 3 fail, 1 cannot run.** What is unrun
needs a system setting, a fresh profile, a data shape the seed does not produce, or a release that
does not exist yet. `NATIVE_GATE_BACKLOG.md` has the per-section breakdown.

## Stream 1: fix what the walk found

**Order matters here, and it is not the order of severity - it is the order of cost to the user.**

1. **`B1` - cancelling a tailoring destroys work that was paid for.** The job detail blanks, the
   score is gone, and both generated documents read `Missing` on the next run. One defect failing two
   backlog checks. **This is the only bug in the list that burns tokens every single time it fires**,
   so it goes first regardless of how small the others look.
2. **`B11` - the cover letter generates on the second attempt, never the first.** Every letter is
   paid for twice. **Capture the provider error on the failed attempt before theorising**: a timeout,
   a truncated response and a schema rejection need three different fixes, and a bug that clears
   itself on retry is exactly the kind that gets "fixed" by guessing.
3. **`B8` - the job title is a truncated sentence from the description.** It feeds the archetype
   screen, the score and the tailoring prompt, so three things reason about a fragment.
4. **`S1` - two and a half minutes to a first document**, half of it in the dual critique. Measured,
   not guessed: the table is in the findings file. Look at the critique first - whether it needs two
   passes at full document length, whether it can run against a diff, whether it can overlap the
   build.
5. Then `B2` (the WebKit disclosure bug), the print family `B4` `B5` `B6`, and `B9` `B10`.

**`B2` cannot be verified by any automated check in this repository.** It is a `grid-template-rows:
0fr → 1fr` transition that WKWebView does not honour while jsdom and Chrome both pass. Whatever
replaces it needs another native pass on station 4 - say so in the pull request rather than implying
the suite covers it.

**`P1` and `P2` are one change, and `P2` is already half-built**: an applied job already locks its
description; only the Retailor button is still offered. `P3`, `P4` and `P5` are **decisions for the
maintainer**, not defects - do not implement them from the findings file alone. `Q2` and `Q3` are
evaluation work and should be sized before being started.

## Stream 2: security

Run a real review, not a dependency glance. `docs/governance/` and the `aif-security-review` skill
define the scope; the areas that actually carry risk here are the OS keychain, the Tauri IPC surface
and its capability declarations, the CSP, the external job sources, and anything that writes files.

**Two things are deliberately open and must not be "fixed":**

- **Dependabot's single alert, `glib` `GHSA-wrw7-89jp-8q8g` (RUSTSEC-2024-0429).** Linux-only,
  reached through the gtk-rs stack Tauri pins. It is kept open on purpose, as the signal that Tauri
  has moved off it. `npm audit --omit=dev` reads **0**.
- **The npm advisory chain `image-size` → `less` → build tooling.** The only remedy npm offers is a
  semver-major **downgrade** of `@angular-devkit/build-angular`. The repository contains zero `.less`
  files and both apps set `inlineStyleLanguage: scss`, so the parser never runs.

Closing either one costs more than it buys. If a review flags them, the answer is the paragraph
above, not a change.

**`style-src 'unsafe-inline'` in the CSP is the one genuinely weak directive**, and
`docs/architecture.md` already says why: Angular emits component styles as inline `<style>` elements
at runtime, so there is no nonce or hash to name. It permits CSS injection, not script execution.
Revisit only if Angular ships a nonce-based style pipeline - and if it has, that is a finding worth
having.

## Stream 3: structure - and two questions that are already answered

The maintainer asked whether page folders should get subfolders, and whether `index.ts` barrels
should be added. **Both were checked against the repository before this was written; do not
re-litigate them from taste.**

### Subfolders: the convention exists and is half-applied

`apps/desktop/src/app/pages/jobs` holds **37 entries**, and they are already two different shapes: a
dozen components live in their own folder with their template, stylesheet and spec beside them
(`job-tailor-step/`, `job-meta-card/`, `job-final-checks/`), while the page components, the dialogs
and the pure helpers sit flat in the root. `pages/documents` is the same mixture.

So the question is not whether to introduce a convention - it is whether to **finish** one. That is a
much cheaper thing to justify, and a much worse thing to leave half-done, because a reader cannot
tell which shape is intended.

**Recommended shape**, if the maintainer agrees:

- a component gets a folder when it owns more than one file - template, stylesheet or spec;
- the page's own root component stays flat, so the folder's entry point is obvious;
- **pure helpers stay flat and keep their spec beside them** - `scoring.utils.ts`,
  `tailor-phases.ts`, `job-detail-icons.ts`, `unsaved-job.guard.ts`. Wrapping a one-file function in
  a folder adds a directory level and hides nothing.

**Do this as pure `git mv` with no content edits**, one page per pull request, and say in the
description that no behaviour changed. A rename mixed with a fix is a diff nobody can review.

### `index.ts` barrels: do not add them inside `apps`

There is currently exactly one in the whole of `apps`, and that is the right number.

Three reasons, in order of how much they cost:

1. **Barrels defeat lazy loading.** Every page here is a lazily-routed chunk. A barrel pulls
   everything it exports into whichever chunk touches it, and this repository has already paid for
   that: the Discover extraction moved ~7 kB into the eagerly-loaded shell and the initial bundle
   budget had to be raised. A barrel per page would do it systematically.
2. **Barrels create import cycles.** Component A importing sibling B through the folder's own barrel
   is a cycle, and it is the kind that builds fine until it does not.
3. **They buy nothing here.** `@nx/enforce-module-boundaries` polices **project** boundaries, not
   folder ones, and `libs/*/src/index.ts` already gives every library the single public surface the
   rule reads. A barrel inside an app has no rule to enforce.

Barrels stay where they mean something: **one per library, as its public API.**

### Angular practice

Use the read-only Angular CLI MCP for guidance rather than memory. The house rules that already exist
and should be checked against rather than reinvented: standalone components, signals over NgRx (the
reasoning is in `jobs.store.ts` and has not changed), `OnPush`/zoneless, screen state in a
`libs/application` store rather than in the page, and the file-size budgets - **250 lines for an
application-layer store, not 400**.

`job-scoring.service.ts` is at **249/250**. When the ratchet refuses a line, pay for it by extracting
something that is a function of its arguments, the way `tailoring-pass.ts` did - do not squeeze.

## Do not re-open

- **The desktop suite is not flaky.** Two watches said it was; PR #487 disproved it with
  measurements. Failures were `Exceeded timeout of 5000 ms` with **no assertion ever failing** - jest
  defaults to nine workers on a loaded machine. On an idle one the suite runs in ~11 s. **Check the
  machine's load before the code.**
- **The gateway migration and the file-size campaign are finished.**

## What an agent can and cannot do with the native gate

Recorded on 2026-08-20, because the backlog's old claim that no agent can run it is too broad.

Computer-use **can** drive the app: clicks, drags, window resizes, reading the screen. It **cannot**
do anything timed - roughly fifteen checks are animation or shimmer, and the round trip to take a
screenshot is longer than the animation lasts, so the first frame already shows the finished state.
It also may not change macOS system settings, which rules out every Reduce-motion check.

**One workflow note that costs a confusing ten minutes if unknown:** after every app restart, clicks
do not reach the Tauri webview until the window is explicitly brought to the front, and the first
click does not do it.

## Gates before commit

`nx run desktop:type-check`, `nx run-many --target=lint --projects=data,application,desktop --skip-nx-cache`,
`nx test data`, `nx test application`, `nx test desktop`, `nx test core` when `libs/core` changed,
`nx build desktop`, `cargo check` in `src-tauri` when anything under it changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.

`--skip-nx-cache` on lint is mandatory: orphaned imports survived a green type-check five times in
the gateway series.

`check-style-move.mjs` only when a stylesheet changed. `nx build web` only when something it compiles
changed - **the web app imports nothing from `@applye/data`**.

**`npm run quality:file-size` reports "no changed source files to check" against a docs-only tree.
That is not a pass.** Use `--staged` after `git add`, or `--base origin/main`.

## Workflow notes that cost time repeatedly

**The database is three files.** It runs in WAL mode, so `applye.db`, `applye.db-wal` and
`applye.db-shm` move together. Any instruction naming only the first is wrong - this cost the
2026-08-20 walk two stations and a scare, and `NATIVE_GATE_SCRIPT.md` was corrected in four places
because of it. Back up with `sqlite3 … ".backup …"`, never `cp`.

**A repo-wide rename is a mechanical edit to code and a semantic edit to prose.** The last such
change turned twenty-six comments into false statements while compiling perfectly.

**Pull requests are squash-merged** and `origin/main` moves under you. After a rebase, re-verify
everything - green before means nothing after. Only `CHANGELOG.md`, `CURRENT_STATE.md`,
`DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md` ever conflict; `DUTY_WATCH.md` conflicts on every
concurrent merge because entries are appended at the top. Keep both, newest first, then
`prettier --write`.

**Measure before you write the number.** The budget script counts **non-empty** lines, which is not
`wc -l`.

## What to do first

1. **`B1`.** Reproduce it, find where the discard path unwinds past its own transaction, fix it, and
   add the regression test at whatever seam makes the loss observable. It is the only defect that
   costs money on every occurrence.
2. Then `B11`, and **capture the provider error before theorising**.
3. Ask the maintainer about `P1`/`P2` and `P5` before implementing either - both change behaviour
   users will notice, and `P5` changes a schema.

Run triage and the Plan Check from `AGENTS.md` before touching code, and invoke `aif-grilling` when
a decision changes a `libs/` public API, a database schema, or the privacy or security posture.

Pick one thing at a time and finish it, including the Duty Watch handoff.
