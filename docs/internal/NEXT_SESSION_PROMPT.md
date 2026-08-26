# Next session prompt

Copy everything below the line into a fresh session.

---

**The apply-wizard step-gating audit opened this week is closed.** The maintainer walked the apply
wizard (Review score → Tailor CV → Updated score → Review documents → Export & apply) in `tauri dev`
and reported it broken at several points, with screenshots. Eight findings (F1-F8) were named; six
are fixed and merged, one was natively verified clear, one was declined. `S1` (tailoring latency) and
`S3` (repeated uncached profile/JD text) got partial fixes the same week. Full chain in
`docs/internal/DUTY_WATCH.md`'s 2026-08-25 and 2026-08-26 entries.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-26` entry in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, clean, at `cf185442` (`#536`) or later - **verify
  this before trusting anything else below**, this repository's working tree has repeatedly reset
  between sessions.
- **[`PR #537`](https://github.com/vitala89/applye/pull/537) may still be open** - a docs-only entry
  recording the apply-wizard audit's close-out and the native F8 confirmation. Merge it first if so;
  nothing in it touches code.
- `#529`-`#536` are **all merged and done**: `S1` (pass 2 moved to the economy model tier, `#531`),
  `S3` (a shared prompt-cache breakpoint for `resume-tailoring`'s three passes, `#533`), and the
  apply-wizard fixes (`#534`, `#535`, `#536`). Do not re-open any of them - see "Do not re-open" below
  for the specific decisions each one settled.
- **`S1` is not closed, only mitigated.** The root cause - pass 2 emits ~2200 output tokens against a
  declared six-to-ten-bullet schema - is still open and was deliberately left for its own
  prompt-tightening task (`libs/skills/src/resume-tailoring/resume-tailoring.md`). `S3`'s cache
  breakpoint has not been natively measured either: the next `tauri dev` pass should re-run a
  tailoring job twice in one session and check `cachedTokens` on passes 2 and 3.

## What's open

Nothing is mid-flight. These are candidates, not a queue - **ask the maintainer which one before
starting**, same rule as always.

1. **`docs/internal/NATIVE_GATE_BACKLOG.md`** - 36 of 83 checks from the 2026-08-20 walk are still
   unticked, spread across Discover, the CV live-style panel, the CV editor's sections, print, the
   tracker, Analytics, the welcome screen, the Pipeline quick view, the dashboard, and one release
   item (whether an installed `0.29.1` actually offers the `0.29.2` update). No agent can drive any of
   this - it needs the maintainer's own hands in `tauri dev`.
2. **The German pack, P0 in `docs/product/IDEAS.md`** - German Discover sources (the built-in set is
   Remotive/WWR/Himalayas only, none German) and the DIN 5008 Anschreiben fields every DE posting
   asks for. Named the most-requested-by-users items in that file, not yet scoped.
3. **`S1`'s actual root cause** (tighten or cap pass 2's output) and **`S3`'s native cache-hit
   measurement** - both described above, both small and already diagnosed.
4. **`docs/product/FEATURE_INDEX.md`** has not been reconciled against everything shipped since
   `v0.22.0` - only the one demonstrably wrong row (Interview Prep, fixed 2026-08-26) was corrected
   this pass. A full pass would need one read through `CHANGELOG.md`'s shipped history against the
   table, which was not done here - flagged, not fixed.

## Do not re-open

- **The apply-wizard grilling decisions (`#536`)**: the Create-application CV gate is UI-only, no
  `JobActionsStore` change; it shows an inline reason plus a jump back to Review documents, not a bare
  disabled button; `Update application` is deliberately **not** gated the same way, since a job can
  reach `applied` with zero documents through the separate Apply self-report (`P1`); the fix for
  skipped tailoring is the scoped one shipped (a "use existing" action plus an auto-opening CV
  chooser), not a persisted route-state machine. **F2** (gate cover-letter generation on a linked CV)
  was proposed and declined - a cover letter is built from the profile and job description, not the
  CV. **F8** (Choose existing + tailor possibly overwriting a library CV) was walked natively and
  found clear - do not re-flag it as an open risk.
- **`S3`'s cache scope was deliberately narrowed** to `resume-tailoring`'s own three passes, not
  standardised across every skill that repeats profile/job-description text - that broader change
  needs every skill's `[USER]` template to match byte-for-byte and was left for its own `aif-grilling`
  round.
- **Everything the previous prompt closed stays closed**: the print pipeline, `B5`, the
  export-filename unification, `#520`-`#526`'s tailoring/scoring bugs, `B9` (wizard footer padding),
  and `PR #528`'s four lock-gap fixes (all four confirmed natively 2026-08-23). If new information
  changes any of these premises, say so explicitly and re-triage rather than quietly re-deciding.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text. **Third-party PDF libraries** were raised out of frustration
  once and should not be adopted reflexively.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context, so every gateway call fails and the app renders empty states only.
  Useful for pure DOM/CSS/template-compile checks reachable without data; useless for anything needing
  a real job, CV, or application - those need a native `tauri dev` pass, which only the maintainer can
  drive.
- **When the maintainer reports a fix "isn't working," check for a stale build before re-diagnosing
  the code**, and check the fix's _target_ second - a real, well-tested fix can still address the
  wrong instance of a pattern (a sibling method, a different code path). Both have happened before;
  take a reproduced _exact_ symptom seriously rather than assuming a stale build.
- **Cut every branch from `main`**, and check `git branch --show-current` first. After a PR merges,
  `git checkout main && git pull --ff-only`, then delete the local feature branch - do not leave
  `main` sitting ahead of `origin/main` with an uncommitted or committed-but-unpushed fix on it.
- **When several open items have different blockers, ask which one rather than guessing.**
- **Grill before committing to a redesign.** The apply-wizard fix looked, from the report alone, like
  it needed a persisted route-state machine; reading the actual code first (the Updated-score step
  already degrades gracefully when tailoring is skipped, the CV picker already existed) turned it into
  a much smaller, scoped fix. Resolve facts by reading before asking the maintainer to decide anything
  the repository can already answer.
- **`jobs.component.ts` (419 lines, shrunk from 1076+ across the ADR-0005 extraction series) has no
  spec file at all**, and neither do several of its extracted step components (`apply-wizard.component.ts`
  among them). Bugs in any of these surfaces still have to be verified natively or by adding a spec
  alongside the fix - flag the coverage gap rather than silently building a large test harness mid-fix,
  unless asked.
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
