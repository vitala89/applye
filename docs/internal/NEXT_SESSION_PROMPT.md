# Next session prompt

Copy everything below the line into a fresh session.

---

**Two engineering streams closed on 2026-08-19, and neither is to be re-opened or re-planned:** the
`ADR-0005` file-size campaign, and the `db.service.ts` gateway migration. **The work that is left is
the maintainer's, not an agent's.** Read the two sections at the top before proposing anything.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`.

## Where things stand

`main` is at `0657daae`. **No open pull requests. Working tree clean.**

**Zero files over budget, in all seven categories** - 327 TypeScript sources, 304 test files, 159
stylesheets, 145 application-layer stores, 133 templates, 63 Rust sources and their 63 inline test
blocks. Verified with `node tools/check-file-size-budgets.mjs --all` on this commit, not carried
forward from a previous watch.

**The gateway migration is finished.** `db.service.ts` went 461 lines to 0 in eight pull requests on
one day, one domain each, and **the file is deleted**:

| #   | PR   | gateway                  | `db.service.ts`  |
| --- | ---- | ------------------------ | ---------------- |
| 1   | #484 | `DraftsGateway`          | 461 → 426        |
| 2   | #485 | `DiscoverGateway`        | 426 → **381**    |
| 3   | #486 | `InterviewGateway`       | 381 → 349        |
| 4   | #487 | `TrackerGateway`         | 349 → 307        |
| 5   | #488 | `SystemGateway`          | 307 → 220        |
| 6   | #489 | `DocumentsGateway`       | 220 → 142        |
| 7   | #491 | `JobsGateway`            | 142 → 50         |
| 8   | #492 | `ProfileSettingsGateway` | 50 → **deleted** |

The file went under budget at the **second** pull request, six earlier than the ratchet would have
forced it. Before that, #479-#483 finished the file-size campaign.

**Every domain now has exactly one gateway, and there is nowhere else to reach.** New data access
goes to its domain's gateway; a new domain gets a ninth gateway and a spec, not a shared service.

## What is left, and who can do it

### 1. The manual native gate - the maintainer only

**`docs/internal/NATIVE_GATE_SCRIPT.md` is the route; `NATIVE_GATE_BACKLOG.md` is the list.** 83
checks across sixteen sections, ordered into fifteen stations, roughly ninety minutes. **No agent can
run it**: synthetic clicks do not reach the Tauri webview, and outside Tauri every `invoke` rejects.

Tick the backlog, record failures in `DUTY_WATCH.md`, and **do not tick anything in the script** - it
is a route and holds no state. **Station 0 deletes the profile, so the backup command comes first.**

The eight gateway pull requests added **no** new checks: the same commands with the same arguments
reach the same handlers, and every screen they touch already had a station.

### 2. Two product questions, open and unanswered

Raised by #488, which deleted four wrappers nothing called. **These are the maintainer's to answer.**

- **`db_export` is a database-backup command with no button and no translation key anywhere.** The
  feature exists in Rust and nowhere else. Did it lose its UI, or never get one?
- **The tailoring-journal export path** (`generated_doc_get`, `export_docx`, `export_pdf`) is
  superseded by the document-library export the app actually uses. Is it meant to be gone?

All four Rust commands are still registered; re-wrapping any of them is about ten lines.

## What the gateway series left behind, and what it is for

`CODE_QUALITY.md`'s `db.service.ts` section is kept as the **record of how a service is split**, not
as live instructions for a migration that is over. Read it before splitting anything else in any
layer; every rule in it was written after a pull request got it wrong first.

The two that generalise furthest:

1. **Order by files touched, not by method count.** They are almost uncorrelated - profile and
   settings was the fewest methods and the most files. Re-measure before each step; the numbers moved
   between every pull request in this series.
2. **A guard that names a symbol outlives the symbol.** Two of them were enforcing less with every
   pull request and neither said so: `cache-signal.guard.spec.ts` globbed `*.service.ts` while every
   wrapper moved into `*.gateway.ts`, and the ADR-0005 lint rule listed `DbService` by name, so
   deleting that class would have left it green on a component injecting `JobsGateway`. Both are
   repaired (ADR-0005, amendment sixty-five). **When a change deletes a symbol, grep the lint config
   and the guards for it before the pull request, not after.**

## Do not re-open: the desktop suite is not flaky

Two watches reported it as flaky and pointed at a zoneless promise-ordering bug. **That was wrong**,
and PR 4 corrected it with measurements. The failures were `Exceeded timeout of 5000 ms` - **no
assertion ever failed**. Jest defaults to nine workers on ten cores already ~70% consumed by other
applications; the heaviest component specs simply did not finish in time. On an idle machine the
suite runs in **11 s** and passes.

**If a desktop suite run fails, check the machine's load before the code.** Re-run it. Two real but
separate observations are recorded and unowned: `cv-detail.cards.spec.ts:90` calls `detectChanges()`
on a destroyed fixture (`NG0406`, harmless today), and jest reports a worker failing to exit
gracefully, which points at leaked timers. Neither causes what was seen.

## Pressure at the boundary

Measured on `0657daae`, not carried forward:

- **`job-scoring.service.ts` is 249/250** - one line of headroom, the tightest file in the repository.
- `job-identity-resolver.service.ts` and `tailoring.service.ts` are both 245/250,
  `portal-answers.service.ts` 233/250, `onboarding-content.util.ts` 222/250 - all in
  `libs/application`, where the budget is **250, not 400**.

When the ratchet refuses a line, **pay for it rather than squeezing**: the tailoring service's
cache-key assembly moved to `tailoring-pass.ts` because it is a function of its arguments and nothing
else, which bought eight lines honestly.

Three test files are near the 600 budget: `cv-live-style-panel.entry-rule.spec.ts` 598,
`cv-preview.styling.spec.ts` 589, `cv-preview.editing.spec.ts` 571. New tests for those areas go in a
new file.

## Gates before commit

`nx run desktop:type-check`, `nx run-many --target=lint --projects=data,application,desktop --skip-nx-cache`,
`nx test data`, `nx test application`, `nx test desktop`, `nx test core` when `libs/core` changed,
`nx build desktop`, `cargo check` in `src-tauri` when anything under it changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.

`--skip-nx-cache` on lint is mandatory: orphaned imports survived a green `desktop:type-check` five
times in the gateway series, and an earlier green lint never covers later edits.

`check-style-move.mjs` only when a stylesheet changed - skip it honestly otherwise. `nx build web`
only when something it compiles changed; **the web app imports nothing from `@applye/data`**, so a
`libs/data` change is not a reason to run it. Its initial bundle is 4.25 kB over its 500 kB budget on
`main`, pre-existing and not yours to fix.

**`npm run quality:file-size` reports "no changed source files to check" against a committed or
docs-only tree. That is not a pass.** Use `--staged` after `git add`, or
`node tools/check-file-size-budgets.mjs --base origin/main`. `--all` audits everything and never
fails, which is what the zero above was measured with.

## Workflow notes that cost time repeatedly

**The Bash working directory persists between calls.** A `cd` into a subdirectory silently changes
where every later relative path resolves.

**A repo-wide rename is a mechanical edit to code and a semantic edit to prose.** The last pull
request's blind replacement across 118 files turned twenty-six comments into untrue statements, three
of which named the wrong gateway outright. Read what the prose says after renaming, not only whether
it compiles.

**Pull requests here are squash-merged**, and `origin/main` moves under you. When it does:
`git rebase --onto origin/main <old-parent>`, then **re-verify everything** - green before a rebase
means nothing after one. Only four shared documents ever conflict: `CHANGELOG.md`,
`CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md`. `DUTY_WATCH.md` conflicts on every
concurrent merge because entries are appended at the top - keep both, newest first, then
`prettier --write` the file.

**Measure before you write the number.** Several doc updates in this series stated a line count that
turned out wrong when `grep -c '[^[:space:]]'` was run afterwards - which is the metric the budget
script uses, non-empty lines, not `wc -l`. Count first, then write.

## Standing items you cannot close

**Dependabot is at one open alert**, `glib` `GHSA-wrw7-89jp-8q8g` (RUSTSEC-2024-0429) - Linux-only,
through the gtk-rs stack Tauri pins, deliberately left open as the signal that Tauri has moved.
`npm audit --omit=dev` reads **0 vulnerabilities**. The remaining npm advisories are one chain,
`image-size` → `less` → build tooling, whose only npm-suggested remedy is a semver-major **downgrade**
of `@angular-devkit/build-angular`; the repository contains zero `.less` files and both apps set
`inlineStyleLanguage: scss`, so the parser never runs. Do not "fix" it.

No `npm run desktop:dev` process should be running - check with `pgrep -fl "tauri dev"`.

## What to do first

**Do not start a refactor because the last two sessions were refactors.** Both streams are closed and
the repository has no file over budget in any category.

1. **Ask the maintainer what the next stream is**, or act on what they hand you.
2. If they hand you nothing, the honest answer is that the remaining work is theirs: **walk
   `NATIVE_GATE_SCRIPT.md`** and **answer the two product questions above**.
3. If a task does arrive, run triage and the Plan Check from `AGENTS.md` before touching code, and
   invoke `aif-grilling` if the decision changes a `libs/` public API, a database schema, or the
   privacy or security posture.

Pick one thing at a time and finish it, including the Duty Watch handoff.
