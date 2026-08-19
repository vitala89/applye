# Next session prompt

Copy everything below the line into a fresh session.

---

Continue the Applye `db.service.ts` gateway migration. **No new features.** The `ADR-0005` file-size
campaign is **finished** - do not restart or re-plan it. Two gateways remain, then the stream ends.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the recent `docs/internal/DUTY_WATCH.md` entries,
`docs/governance/CODE_QUALITY.md` and `docs/governance/VALIDATION_MATRIX.md`. **`CODE_QUALITY.md`'s
`db.service.ts` section is the canon for this work** - it holds the eight-gateway list, the ordering
rule, the spec rule and the gateway-spec rule, all of them written because a pull request got them
wrong first.

## Where things stand

`main` is at `abdabae6`. **No open pull requests.** Working tree clean.

**Zero files over budget, in all seven categories.** `quality:file-size --all` has reported that
since the second gateway landed, six pull requests earlier than the ratchet would have forced it.

The gateway migration is **6 of 8 done**, in the order churn dictated rather than method count:

| #   | PR   | gateway            | `db.service.ts`             |
| --- | ---- | ------------------ | --------------------------- |
| 1   | #484 | `DraftsGateway`    | 461 → 426                   |
| 2   | #485 | `DiscoverGateway`  | 426 → **381**, under budget |
| 3   | #486 | `InterviewGateway` | 381 → 349                   |
| 4   | #487 | `TrackerGateway`   | 349 → 307                   |
| 5   | #488 | `SystemGateway`    | 307 → 220                   |
| 6   | #489 | `DocumentsGateway` | 220 → **142/400**           |

Before that, #479-#483 finished the file-size campaign: `_editor-shell.scss` 460→26,
`cv-preview.component.html` 779→126, `document.model.ts` split six ways, the
`cv-save-template-modal` unstyled-button bug fixed, and `NATIVE_GATE_SCRIPT.md` written.

## What is left

**Two gateways. Re-measure the table before each one - every migration changes it.**

| domain              | methods | source | spec |  total |
| ------------------- | ------: | -----: | ---: | -----: |
| jobs + applications |      17 |     25 |   33 | **58** |
| profile + settings  |       7 |     26 |   42 | **68** |

**PR 7 is `JobsGateway`**: jobs, applications and the score cache. The score cache belongs here, not
to the tracker - `TrackerGateway`'s header records why, and the tracker gateway's own PR corrected
the domain list on that point. `deleteJob` is in the Jobs section now; #486 moved it back there from
the interview section.

**PR 8 is `ProfileSettingsGateway`**, the largest by churn on the fewest methods, and the last one.
When it lands, `db.service.ts` is empty and **the file is deleted**, along with its export from
`libs/data/src/index.ts`. That is the end of the stream.

## The rules this series wrote, each after getting it wrong

**Do not rediscover these. Every one cost a failed pass.**

1. **Order by files touched, not by method count.** They are almost uncorrelated: profile and
   settings is seven methods and sixty-eight files, the largest of the eight. Re-measure before each
   PR.
2. **Grep `provide: DbService` across `*.ts`, and expect four provider shapes**: a named stub, a
   multi-line inline literal, a **single-line** inline literal, and a shared `*.harness.ts` that is
   not a `.spec.ts` at all. The documents migration lost three passes discovering these one at a
   time. A method-name grep and a subject-name grep both miss real files.
3. **One stub object under both tokens**, everywhere. Never split it into two fakes, and never swap a
   token wholesale: **a spec provides for the subject's whole dependency graph, not for the subject
   alone.** That broke `geo-target.store.spec.ts` and `tracker-report.store.spec.ts` in two separate
   pull requests.
4. **Each gateway carries a spec pinning its command strings and argument shapes**, mocking
   `@tauri-apps/api/core` - see `drafts.gateway.spec.ts` for the shape. **Include the test that counts
   distinct command names**: two methods sharing a string passes every per-method assertion. Every
   gateway so far has had a trap worth a named test - `addSource` spreading its input, the
   `tracker_custom_column_*` commands carrying no `db_` prefix, `deleteInterviewStage(stageId)` versus
   `listInterviewStages(applicationId)`, the four export twins. **Find this gateway's own.**
5. **The receiver is the evidence, not the method name.** `db.exportPdf` looked alive because grep
   found `exportPdf` in a modal and six spec assertions - all of them `TrackerReportStore.exportPdf`.
   Grep `db.<method>(`, not `.<method>(`.
6. **Look for mis-filed methods before cutting.** Three gateways in a row found some: six application
   methods under the Discover banner, `deleteJob` under Interview, the tracker's seven interleaved
   through Jobs. Restore the banner or move the method, and say which in the PR.
7. **Lint catches what the type-check does not.** Orphaned imports have survived a green
   `desktop:type-check` five times in this series; twice the pre-commit hook was what caught them.
   Never treat an earlier green lint as covering later edits, which is why `--skip-nx-cache` is
   mandatory.
8. **A regex that assumes indentation is whitespace should assert it.** A hoist read everything before
   `TestBed.configureTestingModule(` as indentation, captured an `await`, and wrote it onto every
   hoisted line.

## Do not re-open: the desktop suite is not flaky

Two watches reported it as flaky and pointed at a zoneless promise-ordering bug. **That was wrong**,
and PR 4 corrected it with measurements. The failures are `Exceeded timeout of 5000 ms` - **no
assertion ever failed**. Jest defaults to nine workers on ten cores that were already ~70% consumed
by Chrome, Cursor and Claude; the heaviest component specs simply did not finish in time. The same
suite on an idle machine runs in **20 s** and passes; capped at two workers under load it passes;
`tracker.table.spec.ts` alone runs 19 tests in 4 s.

**If a desktop suite run fails, check the machine's load before the code.** Re-run it. Two real but
separate observations are recorded and unowned: `cv-detail.cards.spec.ts:90` calls `detectChanges()`
on a destroyed fixture (`NG0406`, harmless today), and jest reports a worker failing to exit
gracefully, which points at leaked timers. Neither causes what was seen.

## Two product questions, open and unanswered

Raised by #488, which deleted four wrappers nothing called. **These are the maintainer's to answer,
not yours to decide.**

- **`db_export` is a database-backup command with no button and no translation key anywhere.** The
  feature exists in Rust and nowhere else. Did it lose its UI, or never get one?
- **The tailoring-journal export path** (`generated_doc_get`, `export_docx`, `export_pdf`) is
  superseded by the document-library export the app actually uses. Is it meant to be gone?

All four Rust commands are still registered; re-wrapping any of them is about ten lines.

## The other open stream: the manual gate

**`docs/internal/NATIVE_GATE_SCRIPT.md` is the route; `NATIVE_GATE_BACKLOG.md` is the list.** 83
checks across sixteen sections, ordered into fifteen stations, roughly ninety minutes. **The
maintainer drives it - no agent can**: synthetic clicks do not reach the Tauri webview, and outside
Tauri every `invoke` rejects.

Tick the backlog, record failures in `DUTY_WATCH.md`, and **do not tick anything in the script** - it
is a route and holds no state. Station 0 deletes the profile, so the backup command comes first.

If a gateway PR adds a check, add it to the station that already owns that screen rather than
creating a new one, and update the coverage table at the foot of the script.

## Pressure at the boundary

`tailoring.service.ts` is 245/250 and `portal-answers.service.ts` 233/250 - both in
`libs/application`, where the budget is **250, not 400**. When the ratchet refuses a line, **pay for
it rather than squeezing**: the tailoring service's cache-key assembly moved to `tailoring-pass.ts`
because it is a function of its arguments and nothing else, which bought eight lines honestly.

Three test files are near the 600 budget: `cv-live-style-panel.entry-rule.spec.ts` 598,
`cv-preview.styling.spec.ts` 589, `cv-preview.editing.spec.ts` 571. New tests for those areas go in a
new file.

## Gates before commit

`nx run desktop:type-check`, `nx run-many --target=lint --projects=data,application,desktop --skip-nx-cache`,
`nx test data`, `nx test application`, `nx test desktop`, `nx test core` when `libs/core` changed,
`nx build desktop`, `cargo check` in `src-tauri` when anything under it changed,
`npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, `git diff --check`.

`check-style-move.mjs` only when a stylesheet changed - skip it honestly otherwise. `nx build web`
only when something it compiles changed; the web app's initial bundle is 4.25 kB over its 500 kB
budget on `main`, pre-existing and not yours to fix.

**`npm run quality:file-size` reports "no changed source files to check" against a committed or
docs-only tree. That is not a pass.** Use `--staged` after `git add`, or
`node tools/check-file-size-budgets.mjs --base origin/main`.

## Workflow notes that cost time repeatedly

**The Bash working directory persists between calls.** A `cd` into a subdirectory silently changes
where every later relative path resolves.

**Pull requests here are squash-merged**, and `origin/main` moves under you. When it does:
`git rebase --onto origin/main <old-parent>`, then **re-verify everything** - green before a rebase
means nothing after one. Only four shared documents ever conflict: `CHANGELOG.md`,
`CURRENT_STATE.md`, `DUTY_WATCH.md` and `NATIVE_GATE_BACKLOG.md`. `DUTY_WATCH.md` conflicts on every
concurrent merge because entries are appended at the top - keep both, newest first, then
`prettier --write` the file.

**Measure before you write the number.** Three doc updates in this series stated a line count that
turned out wrong when `grep -c` was run afterwards. Count first, then write.

## Standing items you cannot close

**Dependabot is at one open alert**, `glib` RUSTSEC-2024-0429 - Linux-only, through the gtk-rs stack
Tauri pins, deliberately left open as the signal that Tauri has moved. `npm audit --omit=dev` reads 0. The five remaining npm advisories are one chain, `image-size` → `less` → build tooling, whose only
npm-suggested remedy is a semver-major **downgrade** of `@angular-devkit/build-angular`; the
repository contains zero `.less` files and both apps set `inlineStyleLanguage: scss`, so the parser
never runs. Do not "fix" it.

No `npm run desktop:dev` process should be running - check with `pgrep -fl "tauri dev"`.

## What to do first

1. **PR 7, `JobsGateway`.** Re-measure the churn table, look for mis-filed methods before cutting,
   apply the four-shape spec rule from the start, and write the gateway spec with the
   distinct-command-count test plus whatever trap this domain turns out to have.
2. **PR 8, `ProfileSettingsGateway`**, and with it **delete `db.service.ts`** and its barrel export.
   That ends the migration.
3. Then the only work left is the maintainer's: **walk `NATIVE_GATE_SCRIPT.md`**, and answer the two
   product questions above.

Pick one thing at a time and finish it, including the Duty Watch handoff.
