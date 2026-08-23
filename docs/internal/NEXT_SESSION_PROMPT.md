# Next session prompt

Copy everything below the line into a fresh session.

---

**Seven bugs found and fixed via native testing (`#520`-`#526`) are closed and merged, `B9` is closed,
and `PR #528` is merged but still needs a native `tauri dev` pass before its four fixes count as
done.** The maintainer ran the apply wizard and My Jobs scoring end to end in `tauri dev` earlier this
week and reported what broke, one at a time; two chained mistakes are worth reading before touching
that area again - `#520`'s fix was the wrong shape and needed `#522` on top of it, and `#523`'s
scoring-persistence fix targeted the wrong method and needed `#525` on top of it. Full chain in
`docs/internal/DUTY_WATCH.md`'s 2026-08-23 entries. Read the state below, then **lead with `PR #528`'s
native check** unless the maintainer says otherwise - it is the one item with concrete, cheap steps
already written out, not a guess.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the `2026-08-23` entries in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`.

## Where things actually stand

- `git branch --show-current` should read `main`, clean, at `8f245a80` (`#528`) or later - **verify
  this before trusting anything else below**, this repository's working tree has repeatedly reset
  between sessions.
- `#511`-`#516` (print pipeline), `B5`, the export-filename split (`#518`), and `#520`-`#526`
  (tailoring/scoring bugs) are **all merged and done**. Do not re-open them.
- `#526` briefly showed as `CONFLICTING` on GitHub because it branched before `#525` merged and both
  touched the top of `CHANGELOG.md`/`CURRENT_STATE.md`. Resolved with a merge commit, already merged -
  nothing left to do about it.
- `B9` (wizard footer padding) is **closed, 2026-08-23** - the maintainer confirmed it looks correct
  at full screen. Re-open only if it recurs, and only with a screenshot or the two differing step
  names; a verbal description alone did not converge twice already.
- **`PR #528` is merged** (`8f245a80`), but its four fixes have not been exercised in the running app
  yet - they were shipped on the strength of the maintainer's P1/P2/B12 walk plus local gates, not a
  native re-test of the fixes themselves.
- A stale `tauri dev` build caused two false-alarm bug reports earlier this week (the maintainer
  testing code that predated the fix they thought they were testing). **If a fix looks like it "didn't
  work," check `git log -1 --oneline` in the terminal running `tauri dev` and confirm it matches
  `main` before re-diagnosing the code.**

## What's open

1. **`PR #528`'s four fixes - need a native `tauri dev` pass.** Not a new bug hunt: exactly what to
   click is already known.
   - Apply's button did nothing (event-name mismatch, `jobs.component.html` listened for an event the
     component never emits) - **click Apply on a job, confirm the wizard opens / the job moves off
     `saved`.**
   - The CV editor's live style panel stayed interactive after a locked document's toolbar correctly
     locked - **open a CV linked to a locked (non-`saved`) application, confirm clicking the rendered
     text does nothing.**
   - Score/Rescore's two buttons ignored the same lock Retailor already respects - **on a locked job,
     confirm both Score/Rescore buttons are disabled.**
   - The job meta card's Name it/Edit it button was deliberately built to never close off; the
     maintainer confirmed on 2026-08-23 it should now lock too - **on a locked job, confirm Name
     it/Edit it is disabled.**

   If all four hold, done - update `docs/internal/NATIVE_GATE_FINDINGS.md`'s `P1/P2/B12` entry to say
   so and move on. If any one doesn't, say which - the diagnosis for all four is already in that same
   entry, so a repro report (which button, what happened instead) is enough to fix it without
   re-diagnosing from scratch.

2. **`S1`** - tailoring run takes ~2.5 minutes, half of it the dual-critique pass. Root cause is
   already measured; the next step is one **read-only** query against `tailoring_cache`'s
   `tokens_input`/`tokens_output` to size the fix. **Ask the maintainer before running it** - standing
   rule against touching the live database without asking, even read-only.

3. **A loose end from the filename fix (`#518`)**: the maintainer's original repro (two different
   filenames for "the same CV") may have involved two different `document_library` rows rather than
   only the code-path divergence `#518` fixed. Moot if the maintainer confirms the fix resolved what
   they saw; worth one native check only if they still see a mismatch - open both Documents-list
   entries side by side and compare IDs/labels.

**If `PR #528`'s native pass is already done by the time this session starts**, ask the maintainer
which of `S1` / the filename loose end / something else to take - do not pick one and start without
asking, same rule as always.

## A pattern worth watching for

Every bug found this week except `B9` and the Apply-button wiring was the **same lock gap in a new
place**: something that correctly disabled at the top level (a toolbar, a page) but left a
sub-component underneath still fully interactive. If the native pass on `PR #528` turns up a fifth
instance somewhere else in the locked-application surface, that is the pattern to check for first,
not a fresh diagnosis.

## Do not re-open

- **The print pipeline, `B5`, the export-filename unification, and `#520`-`#526` are done.** Do not
  re-litigate any settled decision, including: the DE filename convention spreads to every CV entry
  point (`#518`); `isTailored` reads a `source: 'tailored'` tag on the linked CV rather than replaying
  a cache-hash chain, and does **not** attempt a full phase-card/Changes/Gaps restore on reopen - that
  was explicitly scoped out in `#522`'s grilling round and stays a separate, larger ask if the
  maintainer wants it later; real mid-request AI cancellation needs new Rust plumbing and was
  explicitly deferred in `#523`'s grilling round in favor of honest button copy - do not build the
  Rust cancellation registry without a fresh grilling round confirming the maintainer still wants it
  now. If new information changes any of these premises, say so explicitly and re-triage rather than
  quietly re-deciding.
- **`B9` is closed** unless it recurs with a screenshot or named steps.
- **A screenshot/rasterized PDF export is not the fix for anything print-related.** Rejected earlier;
  ATS parsers need real, selectable text.
- **Third-party PDF libraries** were raised out of frustration in an earlier session and should not be
  adopted reflexively - see the reasoning already on file if this comes up again.

## Workflow notes worth keeping

- **`desktop-web` (`nx serve desktop --port=4201`) has no real Tauri IPC** - `tauriInvoke()` throws
  outside a real Tauri context, so every gateway call fails and the app renders empty states only.
  Useful for pure DOM/CSS bugs reachable without data; useless for anything needing a real job, CV, or
  application - those need a native `tauri dev` pass, which only the maintainer can drive.
- **When the maintainer reports a fix "isn't working," check for a stale build before re-diagnosing
  the code.** `git log -1 --oneline` in the `tauri dev` terminal, compared against the commit that
  actually shipped the fix, settles it in one step - two separate reports this week turned out to be
  this, not a code problem.
- **But a stale build is not the only explanation - check the fix's target second.** `#520`→`#522` and
  `#523`→`#525` were both cases where the first fix was real and well-tested but addressed the wrong
  instance of the underlying pattern (a sibling method, a different code path). The giveaway both
  times was the maintainer reproducing the _exact_ reported symptom again after the fix merged. Take
  that seriously rather than assuming a stale build first.
- **Cut every branch from `main`, and check `git branch --show-current` before assuming otherwise.**
- **When several open items have different blockers, ask which one rather than guessing** - true every
  time it came up this week.
- **Voice input on this channel drops or garbles words** - "Set Company enroll" turned out to be "Set
  Company and Role"/Name it button, and it cost a full round trip to catch. If a described UI element
  does not match anything in the code, say so and ask for the exact label rather than guessing.
- **`jobs.component.ts` (1076 lines) has no spec file at all**, and neither did `job-meta-card` before
  2026-08-23. Bugs in either surface still have to be verified natively - flag the coverage gap rather
  than silently building a large test harness mid-fix, unless asked.
- **`main` can move between messages in the same session** - `PR #528` merged mid-session while this
  handoff was being written, and a stale local `main` produced a stash-pop merge conflict in these two
  files. `git pull --ff-only` before trusting a diff against `main`.

## Gates before commit

`nx run desktop:type-check`, `nx run ui:type-check` if `libs/ui` changes, `nx run-many
--target=lint --projects=data,application,desktop,ui,i18n,core --skip-nx-cache` (scope to touched
projects), `nx test data`, `nx test application`, `nx test desktop --maxWorkers=2`, `nx test ui` if
touched, `nx test i18n` if any locale file changed, `nx test core` and `nx build web` if `libs/core`
changed, `cargo check`/`cargo test --lib` in `src-tauri` if anything under it changed, `nx build
desktop`, `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`,
`git diff --check`.
