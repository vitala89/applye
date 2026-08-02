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

### 2026-08-02, Mark as applied joins the other job actions

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-mark-applied`, from `main` (`c1c5730`)
- **Commits:** `6afba7c`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - continue the jobs page extraction at
  `markApplied`, the last member over 30 lines.
- **Completed:**
  - **`markApplied` moved into `JobActionsService`**, beside `save` and `remove`, rather than into a
    new file. It shared their whole shape already: the busy guard, the message signal, the toast,
    the `fail` helper, and the rule that the overview row mirrors the status the database recorded
    rather than the literal that was asked for. A tenth module would have been filing, not
    decomposition. The page keeps what is genuinely the page's - the wizard state and the
    navigation.
  - **Two invariants that had no test now have one each.** Documents are committed **before** the
    status flips, because a job marked applied must already own its CV and cover letter or the user
    has applied to a job with nothing attached; and a failed status write leaves the overview row
    alone, because a row claiming applied for an application that is not would outlive the error
    message that explained it.
  - Written against a service that did not have the method yet - the spec failed with
    `svc.markApplied is not a function` before any implementation existed. 8 tests.
  - Mutations, each confirmed by an md5 change first: swapping the commit and the status write turns
    1 red; mirroring the request instead of the database turns 1 red.
- **Not completed:**
  - `jobs.component.ts` is **1104/400**. Template 1148/300 and stylesheet 933/400, untouched.
  - **No member is over 30 lines any more.** `enterJob` and `parseAndFilter` are joint largest at 30. The remaining excess is spread thin, which means the next reduction is a different kind of
    work from the last nine - the file is now mostly signal declarations and thin delegation, and
    cutting it further means moving groups of related state, not single responsibilities.
  - The page still has no component-level test.
- **Files or packages changed:** `apps/desktop/src/app/shared/job-actions.service.ts` and its spec,
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass for 6 projects, and this is the first
  watch where that gate could see templates, `npm test` all six projects green with **1127** desktop
  tests, `npm run lint` 6 projects green, `npx nx build desktop` complete,
  `npm run quality:file-size` pass with base `1119 -> 1104`, `npm run quality:attribution`,
  `npm run format:check`, `npm run verify:csp`, `git diff --check` all pass. **Not run:** the
  `cargo` gates, no Rust touched; the browser preview, because the jobs page waits on
  `db_get_settings`.
- **Privacy/security impact:** none. Behaviour preserved exactly; the code moved.
- **Decisions and assumptions:**
  - Extracted into the existing service rather than a new module. Nine of the last ten extractions
    created a file; this one would have created a tenth for behaviour that already had a home.
  - `busy` stays set on the success path, unchanged from before and matching `remove`: the caller
    navigates away, and clearing it first puts a live button back on screen for the frame before the
    route changes. It is now written down in the service rather than implied by the page.
- **Risks or compatibility impact:** Mark as applied was not exercised in a running app. It is the
  action that writes the application row, commits documents and navigates, so it is the one most
  worth a human pressing once.
- **Open issues or blockers:**
  - Unchanged: `jobs.component.ts` 1104/400, its template 1148/300, stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories with drop conditions.
  - The single false-green `type-check` from four watches ago remains unexplained and unreproducible.
    It is a separate thing from the template gap fixed in the previous watch.
- **Next first action:** decide whether to keep cutting `jobs.component.ts` by moving groups of
  related signals, or to stop at 1104 and spend the next watch on `discover.component.scss`
  (1915/400), which is the worst file in the repository and has not been touched. The nine
  extractions so far each had one responsibility to name; what is left does not, and forcing it is
  how the ratchet got refused twice in this session.
- **Evidence:** `npm run quality:file-size` printed `1104/400 ... base 1119` on `6afba7c`;
  `npm test` printed `1127` for desktop; the spec was observed failing with
  `svc.markApplied is not a function` before the method existed.

### 2026-08-02, the fast gate could not see templates, and now can

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/type-check-sees-templates`, from `main` (`6dc5158`)
- **Commits:** `aba1eac`, plus this documentation commit
- **Pull request:** opened after this entry
- **Objective:** the previous watch's next first action - decide the template-type-check question,
  which had cost four round-trips in one session.
- **Completed:**
  - **Measured instead of argued.** `npm run type-check` ran `tsc -p ... --noEmit`, and `tsc` never
    compiles Angular templates. `ngc`, the Angular compiler, takes the same `--noEmit`. Uncached on
    this repository: **tsc 4.31s and blind to templates, ngc 3.48s and not**. Cheaper _and_ stricter,
    so there was no trade-off to put to the maintainer - the Grilling gate does not fire on a
    decision with one honest reading.
  - **Proven, not assumed, before switching.** Both Angular apps and both failure modes: a template
    calling a member the component does not have, and the widened `TailorPhase.icon` that broke the
    wizard strip earlier today. `tsc` exits **0** on every one of them; `ngc` exits **1** and names
    the file, the line and the component. Each injection was confirmed by an md5 change first.
  - **A guardrail so it cannot silently revert.** `tools/check-quality-guardrails.test.mjs` asserts
    both apps run `ngc` and neither falls back to `tsc`. Putting `tsc` back turns it red, verified.
  - `apps/web` had the same gap and was switched with the same proof.
  - `VALIDATION_MATRIX.md` now says what the gate does and does not cover, and when a build is still
    required: for bundling, budgets and the produced output - no longer merely to learn whether the
    templates compile.
- **Not completed:** nothing in scope. `jobs.component.ts` untouched this watch, still 1119/400.
- **Files or packages changed:** `apps/desktop/project.json`, `apps/web/project.json`,
  `tools/check-quality-guardrails.test.mjs`, `docs/governance/VALIDATION_MATRIX.md`,
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` (now `ngc`) pass for 6 projects,
  `npm test` all six projects green with 1119 desktop tests, `npm run lint` 6 projects green,
  `npx nx build desktop` complete, `npm run web:build` complete with 39 prerendered routes,
  `node --test tools/check-quality-guardrails.test.mjs` 4 pass, `npm run quality:file-size`,
  `quality:attribution`, `format:check`, `git diff --check` all pass. **Not run:** the `cargo`
  gates, no Rust touched.
- **Privacy/security impact:** none. Build tooling only.
- **Decisions and assumptions:**
  - Switched without grilling the maintainer, because the measurement removed the trade-off: the new
    command is faster and catches strictly more. Had `ngc` been slower, this would have been a
    maintainer call about gate cost.
  - `web`'s sitemap regenerated as a side effect of `npm run web:build` and was **discarded rather
    than committed** - it is generated output with a date in it, and this branch did not change the
    site.
- **Risks or compatibility impact:** `ngc` is stricter, so it can surface pre-existing template
  problems in code nobody has touched. None appeared - all six projects pass - but a future branch
  that suddenly fails `type-check` in a file it did not edit should suspect this first.
- **Open issues or blockers:**
  - **Every watch entry before today that cites a green `type-check` was citing a check that could
    not see templates.** Those entries are not being rewritten, but the claim they make is weaker
    than it reads, and this entry is the correction.
  - Unchanged: `jobs.component.ts` 1119/400, its template 1148/300, stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories with drop conditions.
  - The single false-green `type-check` from three watches ago remains unexplained. It is a
    different thing from this gap - that one was a plain `.ts` error, which `tsc` should have caught
    - and it still does not reproduce.
- **Next first action:** continue the jobs page extraction at `markApplied` (35 lines), the last
  member over 30, which writes the application row and the store row together.
- **Evidence:** `tsc -p apps/desktop/tsconfig.app.json --noEmit` exited 0 with
  `Property 'thisMemberDoesNotExist' does not exist` present in the template; `ngc` on the same tree
  exited 1 and printed it. Timings from `/usr/bin/time -p` after `npx nx reset`.

### 2026-08-02, loadJob's defaults and the wizard's phase strip, both pinned

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-load-sequence`, from `main` (`39af9bd`)
- **Commits:** `9a1dfa8`, `15d688e`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** the previous watch's next first action - continue the jobs page extraction at
  `loadJob`, identifying its test seam before touching it.
- **Completed:**
  - **`job-document-defaults.ts`.** Opening a job picks two things that outlive the visit: which
    language the Review documents step works in, and which CV the next tailoring builds on. Both
    were inline in `loadJob`, inside a `try` whose `catch` is deliberately silent, and neither had a
    test. The base-CV rule is the one that can cost the user: it opens on **null**, the profile,
    because a CV selected by accident silently makes the next tailoring build on someone else's
    document; and it pulls this job's own tailored CV into the list even when the language filter
    would drop it, because without that a CV in another language vanishes from the dropdown and the
    choice resets to the profile without saying so. 12 tests. `1162 -> 1145`.
  - **`tailor-phases.ts`.** The wizard's three-pass strip derived its state from a nested if/else and
    rebuilt its definitions on every read. The distinction worth writing down is `ready` versus
    `pending`: only the pass after the last finished one can be started, and calling every later
    pass ready would offer three buttons for a sequence that runs in order. 13 tests.
    `1145 -> 1119`.
  - **Every mutation this watch was verified against the file's hash before the result was
    trusted**, which is the correction the previous watch recorded. Removing the linked-CV exception
    turns 1 red; dropping the application's language precedence turns 1; erasing the ready/pending
    distinction turns 5.
- **Not completed:**
  - `jobs.component.ts` is **1119/400**. Template 1148/300 and stylesheet 933/400, untouched again.
  - Largest remaining members: `markApplied` (35), `enterJob` and `parseAndFilter` (30 each).
  - The page still has no component-level test.
- **Files or packages changed:** added `apps/desktop/src/app/pages/jobs/job-document-defaults.ts`
  and `tailor-phases.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npm test` all six projects green
  with **1119** desktop tests (25 new this watch), `npx nx lint desktop` 0 errors / 8 pre-existing
  warnings, `npx nx build desktop` bundle generation complete, `npm run quality:file-size` pass with
  base `1162 -> 1145 -> 1119`, `npm run quality:attribution` pass, `npm run format:check` pass,
  `npm run verify:csp` pass, `git diff --check` clean. **Not run:** the `cargo` gates, no Rust
  touched; the browser preview, because the jobs page waits on `db_get_settings`.
- **Privacy/security impact:** none. Pure functions moved, no behaviour changed.
- **Decisions and assumptions:**
  - Both extractions preserve behaviour exactly. The `catch` in `loadJob` that swallows everything
    is left as it is - it carries a comment saying the detail still renders and the user can
    re-score, which is a deliberate choice, not the silent-failure bug fixed two watches ago.
  - `TailorPhase`'s icon type is **derived** from the phase definitions rather than declared.
    Declaring it as `unknown` compiled fine and broke the template.
- **Risks or compatibility impact:** the wizard strip and the base-CV dropdown were not exercised in
  a running app; both rest on function-level tests plus `nx build desktop`.
- **Open issues or blockers:**
  - **`nx build desktop` was the only gate to catch a type error for the fourth time this session.**
    `npm run type-check` passed a `TailorPhase.icon: unknown` that the template could not bind. This
    is now a pattern rather than an anecdote, and it is worth deciding whether the fast gate should
    include a template-aware check rather than continuing to rely on the slowest one.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, three upstream advisories recorded with drop conditions.
  - The false-green `npm run type-check` from two watches ago is still unexplained and still not
    reproducible.
- **Next first action:** decide the template-type-check question above - it has now cost four
  round-trips in one session and is cheap to answer. Then continue at `markApplied` (35 lines),
  which writes the application and the store row together and is the last member over 30 lines.
- **Evidence:** `npm run quality:file-size` printed `1119/400 ... base 1145` on `15d688e`;
  `npm test` printed `1119` for desktop; each mutation was confirmed by an md5 change before its
  result was read.

### 2026-08-02, ADR-0004 shipped, and a shared query that changed a second screen

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/unclaimed-jobs-visible`, from `main` (`c988cba`); `docs/glib-advisory-record`
  before it
- **Commits:** one on the glib branch, one here plus this documentation commit
- **Pull request:** [#262](https://github.com/vitala89/applye/pull/262) for glib; this branch's PR
  opened after the entry
- **Objective:** the maintainer confirmed ADR-0004's seven decisions and authorised the Dependabot
  work, so: implement the ADR, and settle alert 42.
- **Completed:**
  - **Correction to the entry below, made in the same watch.** The glib analysis was **already in
    `CURRENT_STATE.md`** before any of this - `cargo tree`, the `gtk` 0.18.2 pin, Linux-only, and
    `cargo audit` tolerating it at exit 0 were all recorded. It was reported to the maintainer as an
    open unknown across several turns and then re-derived from scratch, when reading would have
    answered it. The repository's own rule is that facts are the agent's to find; re-deriving a
    written-down fact and presenting it as a finding is the same failure as asking for it. What #262
    genuinely added is the `.cargo/audit.toml` entry, which did not exist, and the decision to leave
    the GitHub alert open rather than dismiss it. The duplicate bullet it also added has been folded
    back into the original.
  - **Dependabot alert 42 settled, and it is not fixable here.** `glib` 0.18.5, unsoundness in
    `VariantStrIter` (RUSTSEC-2024-0429). Not ours - it arrives through the GTK bindings Tauri uses
    - and **Linux only**: `cargo tree -i glib` is empty for the macOS and Windows targets. Nothing
      under `src-tauri/src` names glib or that type. Nowhere to move to: the fix is glib >= 0.20,
      which needs a gtk major bump Tauri 2.11 has not taken, and `cargo update glib` locks 0 packages.
      `cargo audit` classed it a warning and exited 0 either way, verified before (20 allowed
      warnings) and after (19). Recorded in `.cargo/audit.toml` with its drop condition. **The GitHub
      alert is deliberately left open rather than dismissed**, because dismissing it hides the only
      thing that will tell us Tauri moved.
  - **ADR-0004 implemented, status `accepted`.** `db_list_jobs_overview_core` returns unclaimed rows
    flagged instead of hiding them; `JobOverview` gained a derived `claimed` boolean; My Jobs gained
    one filter chip, off by default, and an **Analysed** status word that joins the status filter.
    Discover-scanned rows stay hidden until claimed. **No migration**, as the ADR predicted. Two
    locale keys in all six languages. Five Rust tests on the query and six TypeScript tests on the
    row rules.
  - **The existing Rust test that asserted the opposite was rewritten deliberately**, not deleted:
    `a_job_only_analysed_is_not_listed` became
    `a_job_only_analysed_is_returned_and_flagged_unclaimed`, with a comment saying ADR-0004 reverses
    what it used to claim.
- **Not completed:** nothing in scope. `jobs.component.ts` is untouched this watch and remains
  1162/400; the extraction continues at `loadJob` next.
- **Files or packages changed:** `apps/desktop/src-tauri/src/commands/jobs.rs`,
  `apps/desktop/src-tauri/.cargo/audit.toml`, `libs/core/src/lib/models/job.model.ts`, six files
  under `libs/i18n/src/lib/translations/`, `my-jobs.component.{ts,html,scss}`, new
  `pages/jobs/job-overview-rows.ts` and its spec, `dashboard.component.ts`, `dashboard.util.ts` and
  both specs, ADR-0004, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npm test` all six projects green
  with **1098** desktop tests, `npm run lint` 0 errors / 8 pre-existing warnings,
  `npx nx build desktop` bundle generation complete, `cargo test --lib` **339 passed**,
  `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt --check` clean,
  `npm run quality:file-size` pass with `dashboard.component.ts` **428 -> 413**,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` clean, `cargo audit` exit 0. **Not run:** the browser preview, because My Jobs
  waits on `db_get_settings` and does not render outside Tauri - the chip and the badge have not
  been seen by a human on screen, only asserted.
- **Privacy/security impact:** a small improvement, as the ADR argued. A user cannot delete job
  description text they cannot see; these rows are now reachable and removable through the trash
  control that already existed. No new data is collected, stored or sent, and the change reveals the
  user's own local rows to the user on their own machine.
- **Decisions and assumptions:**
  - All seven decisions from the grilling were confirmed by the maintainer and implemented as
    written. ADR-0004 moved `draft` -> `accepted`.
  - The glib alert is left open rather than dismissed. Recorded because it is a judgement call, not
    an obvious one: dismissing would quiet the noise and lose the signal.
- **Risks or compatibility impact:**
  - **`claimed` is now a required field on `JobOverview`.** Any consumer constructing one by hand
    must set it; `type-check` covers the repository, and the three call sites were checked.
  - The chip and the Analysed badge have never been rendered in the running app.
- **Open issues or blockers:**
  - **The lesson of this watch: relaxing a shared query changed a screen nobody asked to change.**
    `listJobsOverview` feeds My Jobs, the dashboard and `wizard-nav`. Loosening it silently put
    unclaimed rows into the dashboard's Recent jobs **labelled "Saved"** - precisely the ambiguity
    ADR-0004 exists to remove - and stopped a user whose only job is analysed from reading as new.
    Neither was in the ADR, and no test would have caught either, because none existed. The rule now
    lives in `recentClaimedJobs` with tests that go red when the guard is removed.
    `wizard-nav.describeOtherJob` was checked too and only benefits: it finds unclaimed rows without
    a database round-trip. **Widening a shared read is an API change to every caller, and the ADR
    treated it as a change to one screen.**
  - **A mutation check that fails to mutate is worthless, and this watch produced two.** The first
    two attempts to break the SQL reported the tests still green; the edit had silently not been
    written. Only after checking the file's md5 before and after did the mutation land, and the test
    went red immediately. Every mutation check from here on verifies the file actually changed
    first. This is the same trap as a test that passes with the bug present, one level up.
  - Unchanged: `jobs.component.ts` 1162/400, its template 1148/300 and stylesheet 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream advisories plus glib now recorded.
  - The false-green `npm run type-check` from the previous watch is still unexplained and still not
    reproducible.
- **Next first action:** continue the jobs page extraction at `loadJob`, the largest remaining
  member at 53 lines, identifying its test seam before touching it. If the packaged app is run for
  the two release checks still owed, look at My Jobs with the chip on while it is open - it is the
  only part of this watch a human has not seen.
- **Evidence:** `cargo test --lib` printed `339 passed`; `npm test` printed `1098` for desktop;
  `npm run quality:file-size` printed `dashboard.component.ts: 413/400 ... base 428`; the dashboard
  guard was mutation-checked with md5 verification and turned 2 tests red.

### 2026-08-02, the silent discard, and a gate that reported success on a broken tree

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/discard-tailoring-silent-failure`, from `main` (`8ed7865`)
- **Commits:** `c00f5aa`, `91a8676`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** the previous watch's next first action - decide on the silent `discardTailoring`
  failure, then continue the jobs page extraction at the drafting flows.
- **Completed:**
  - **The silent discard is fixed.** Discarding a tailoring deletes the drafts it produced; when
    that delete threw, the catch wrote the error text to the status line without setting the error
    flag and without a toast, so it rendered in the ordinary style. A discard that destroyed nothing
    was indistinguishable from one that worked. It now reports through `fail()`, and the page resets
    its own state **only** when something was discarded - a failure leaves the wizard where it was
    and the confirmation open, rather than tearing the view down around a tailoring that is still
    there.
  - **`TailoringDiscardService`**, which is what gave the fix a test seam: the method sat on a
    component with no test. Which documents a discard may destroy came out as a pure function, and
    it will never return a document the user committed to their library. 12 tests. Restoring the old
    silent write turns the regression test red. `1197 -> 1185`.
  - **`JobGapFillService`.** Both document flows assembled the same four gap-fill callbacks inline.
    The profile append behind one of them is the part worth owning centrally: `upsertProfile`
    replaces the whole row, so a payload naming only `fullMd` silently discards the scoring cache,
    the pitch and the archetypes - the #97 bug - and it had **no test at all**. It has five now, and
    reintroducing the partial write turns one red. `1185 -> 1162`.
- **Not completed:**
  - `jobs.component.ts` is **1162/400**. Template 1148/300 and stylesheet 933/400, still untouched.
  - **The drafting flows were examined and deliberately left.** `createCvDraft` and
    `createCoverLetterDraft` are already thin orchestration over their draft services; what remains
    is context assembly reading eight component signals, so moving them behind another service
    would be a wrapper over a wrapper and would grow the file - the mistake the ratchet caught in
    the previous watch. The genuinely duplicated part, the gap-fill bundle, was extracted instead.
    This is a change of plan from the previous entry's next first action, made after measuring
    rather than before.
  - ADR-0004 still `draft`, still unimplemented, still awaiting sign-off.
  - Dependabot alert 42 (`glib`, medium, runtime) still not investigated.
- **Files or packages changed:** added `apps/desktop/src/app/shared/tailoring-discard.service.ts`
  and `job-gap-fill.service.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass (see the caveat below),
  `npx nx test desktop` **1085 passed, 75 suites** (22 new this watch), `npx nx lint desktop`
  0 errors / 8 pre-existing warnings, `npx nx build desktop` bundle generation complete, including
  once with `--skipNxCache`, `npm run quality:file-size` pass with base `1197 -> 1185 -> 1162`,
  `npm run quality:attribution` pass, `npm run format:check` pass, `git diff --check` clean.
  **Not run:** the `cargo` gates, no Rust touched; the browser preview, because the jobs page waits
  on `db_get_settings` and does not render outside Tauri.
- **Privacy/security impact:** none. The discard's blast radius is unchanged - it still deletes only
  this application's own draft rows, and the pure function that decides which ones now has a test
  saying it never returns a committed document.
- **Decisions and assumptions:**
  - The bug was fixed **before** continuing the extraction, because the extraction was what would
    have given it a seam anyway, and leaving a known silent failure in place while refactoring
    around it is how it gets forgotten.
  - `discardTailoring` returning a boolean rather than throwing keeps the page's reset decision at
    the page, where the wizard state lives.
  - The plan changed after measurement: see "not completed" above. Recorded rather than quietly
    substituted.
- **Risks or compatibility impact:** the page still has no component-level test. Nobody exercised
  Discard tailoring in a running app this watch; the failure path is asserted at the service level
  only.
- **Open issues or blockers:**
  - **A gate reported success on a broken tree, and this is not understood.** `npm run type-check`
    printed success while `jobs.component.ts` contained `Property 'jobDocLabel' does not exist on
type 'JobsComponent'`. `npx nx build desktop` failed on that error moments later, and a plain
    re-run of `npm run type-check` on the same content then reported it correctly. An Nx cache hit
    is the suspicion. **The reproduction was attempted in this same watch and failed.** A member
    call to a non-existent method was introduced four times and `npm run type-check` reported the
    error every time, including once in the exact shape of the original -
    `npm run type-check >/dev/null 2>&1 && echo pass` immediately after a scripted edit. So: the
    false green was observed, it is in this session's transcript alongside the `nx build desktop`
    failure that caught what it missed, and it does not reproduce. The possibility that it was a
    misreading on the agent's part cannot be excluded either, which is exactly why it is written
    down rather than resolved. This matters because "type-check passed" appears in every watch entry
    as evidence. `nx build desktop` remains the only gate not yet observed to miss anything, and it
    caught this.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream security advisories, Dependabot 42.
- **Next first action:** continue the extraction at `loadJob`, the largest remaining member at 53
  lines, and identify its test seam before touching it - it writes most of the page's job-scoped
  signals, which is why it has been left until last.
- **Evidence:** `npm run quality:file-size` printed `1162/400 ... base 1185` on `91a8676`;
  `npx nx test desktop` printed `Tests: 1085 passed`; the type-check discrepancy is in this
  session's transcript, with the failing `nx build desktop` output immediately after the passing
  type-check.

### 2026-08-02, the status line gets an owner, and the ratchet refuses a refactor

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-document-review`, from `main` (`0746b6e`)
- **Commits:** `eb3fd6d`, `216b265`, plus this documentation commit
- **Pull request:** not yet opened
- **Objective:** continue the jobs page extraction at the seam the previous watch named - the
  document group's shared status-and-error handling - writing the test before the code.
- **Completed:**
  - **`DocumentReviewStatusService`.** Nine places repeated the same four moves around the Review
    documents status line. The service owns the line, the error flag and the two choose-existing
    dialogs; `run()` clears first, returns the body's value, and turns a throw into a message plus
    a null. It separates two failures the page had treated alike: `refuse()` for a precondition the
    user can see and fix, silent because the sentence is already on the step in front of them, and
    `fail()` for whatever the database or provider threw, which also toasts because the user may
    have navigated away. **Written test-first** - the spec was red on a missing module before the
    service existed. 11 tests. `1226 -> 1197`.
  - **`application-document-actions.ts`.** The per-document decision inside committing an
    application is what decides whether a regeneration spends AI tokens, and it had no test: four
    branches in a nested else-if chain inside a method that also did the generating and the
    committing. Now two pure decision functions plus two pure staleness-input builders that return
    null when there is nothing to ask about. The staleness check is passed as a **thunk** rather
    than a boolean so the short circuit survives; one test asserts it is never called when the
    arguments already decide, because that is the part that regresses silently. 14 tests.
  - **Both were mutation-checked.** Dropping the clear from `run()` turns 1 red; making `refuse()`
    toast turns 2 red; removing the tailoring short circuit turns 1 red.
- **Not completed:**
  - `jobs.component.ts` is **1197/400**. The second commit is **net zero lines** - it bought tests,
    not size, and the entry below says why that was still the right trade.
  - Template and stylesheet untouched again, by design. 1148/300 and 933/400.
  - The drafting flows themselves (`createCvDraft`, `createCoverLetterDraft`,
    `chooseExistingDocument`, `prepareDocumentsStep`) are still on the component. Their shared
    status handling is now out from under them, which is the precondition for moving them, but they
    still write eight component signals between them.
  - ADR-0004 still unimplemented and still `draft`, awaiting sign-off.
- **Files or packages changed:** added `apps/desktop/src/app/shared/document-review-status.service.ts`
  and `application-document-actions.ts` with their specs; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npx nx test desktop` **1063 passed,
  73 suites** (25 new this watch), `npx nx lint desktop` 0 errors / 8 pre-existing warnings,
  `npx nx build desktop` bundle generation complete, `npm run quality:file-size` pass with base
  `1226 -> 1197 -> 1197`, `npm run quality:attribution` pass, `npm run format:check` pass,
  `git diff --check` clean. **Not run:** the `cargo` gates, because no Rust file was touched; the
  browser preview, because the jobs page waits on `db_get_settings` and does not render outside
  Tauri.
- **Privacy/security impact:** none. No data, storage, network or IPC behaviour changed.
- **Decisions and assumptions:**
  - **The size ratchet refused this session's own refactor, and it was right.** Extracting the
    commit decision into named pure functions first took the file from 1197 to **1204**, because
    named intermediate values cost more lines than the else-if chain they replace. The gate blocked
    it. The lesson kept: a testability win is not automatically a decomposition win, and the budget
    is what tells them apart. Moving the two staleness guards out as well paid for it, landing at
    net zero.
  - `refuse` versus `fail` is a behaviour distinction the old code did not make explicitly, but it
    is the behaviour it already had - the two guard paths never toasted and the catch paths always
    did. The service names the difference rather than introducing it.
  - Two direct writes to the status signal were deliberately left on the component:
    `acceptPhotoPrompt` sets the line without touching the error flag, and `discardTailoring`'s
    catch sets it without marking an error and without a toast. Routing either through the service
    would change behaviour, which is not this refactor's job.
- **Risks or compatibility impact:** the page still has no component-level test, so the wiring rests
  on service-level tests plus `nx build desktop` for the template. Nobody exercised Create/Update
  application in a running app this watch.
- **Open issues or blockers:**
  - **A failed discard reports as if it succeeded.** `discardTailoring`'s catch writes the error
    text to the status line without setting the error flag and without a toast, so it renders in the
    normal, non-error style. Broken and working look the same, which is the exact trap this
    repository keeps writing down. Found while mapping the call sites; **not fixed**, because it is
    a behaviour bug and this branch is a refactor.
  - **One open Dependabot alert, number 42**: `glib`, medium, runtime scope. Surfaced by GitHub on
    push. Not investigated.
  - Unchanged: `jobs.component.html` 1148/300, `jobs.component.scss` 933/400,
    `discover.component.scss` 1915/400, the two human release checks on `0.29.2`, Windows and Linux
    unverified, the AIF skill set unpruned, the two upstream security advisories.
- **Next first action:** decide whether to fix the silent `discardTailoring` failure as its own
  small commit before continuing - it is three lines and a regression test - then move
  `createCvDraft` and `createCoverLetterDraft` behind a service now that their status handling is
  no longer theirs to own.
- **Evidence:** `npm run quality:file-size` printed `1197/400 ... base 1197` on `216b265` and refused
  `1204` on the attempt before it; `npx nx test desktop` printed `Tests: 1063 passed`.

### 2026-08-02, two responsibilities out of the jobs page, and the invisible jobs decided

- **Status:** partial
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-component-extraction`, from `main` (`e420c7d`)
- **Commits:** two code commits (`dffb638`, `a0fb36d`), plus this documentation commit
- **Pull request:** [#258](https://github.com/vitala89/applye/pull/258), merged as `4208198` with
  all five checks green
- **Objective:** start bringing `jobs.component.ts` under its 400-line budget by extraction, one
  responsibility per commit with tests; and settle the deferred decision about unclaimed job rows
  through `aif-grilling` rather than choosing for the maintainer.
- **Completed:**
  - **`CoverLetterTailorService`.** The tailor-an-existing-cover-letter modal - its five state
    signals, the base-letter read, the AI pass and the row it writes - moved to
    `apps/desktop/src/app/shared/cover-letter-tailor.service.ts`, mirroring the
    `CoverLetterDraftService` it sits beside, and component-scoped through the page providers so its
    state keeps the lifetime it had as component fields. `readBaseLetter` and `buildTailoredContent`
    came out as pure functions, so what is worth asserting is asserted without a `TestBed`.
    14 new tests.
  - **`job-detail-icons.ts`.** The 37-entry icon table and the 34 lucide imports that fed it left the
    component. The spec is the reason the move was worth a commit: it reads `jobs.component.html`,
    collects every `icons.<name>` the template references, and asserts the table defines it. A
    missing icon passes `npm run type-check` and fails only under `nx build desktop`, so this closes
    that documented gap in the fast gate. 3 new tests, one of which guards the regex itself against
    silently matching nothing.
  - **Both extractions were checked by breaking them.** Making `readBaseLetter` ignore the stored
    content turned 2 tests red; removing the modal-close on success turned 1 red; deleting one icon
    from the table turned 1 red. Nothing here is a test that passes with the bug present.
  - **One real bug was caught by the new tests during the refactor**, not after it: a mid-edit
    rename left `tokensInput` / `tokensOutput` unbound in the persist call, which threw at runtime
    and was swallowed by the flow's own catch. It surfaced only because a test asserted the error
    signal was empty on the success path.
  - **The unclaimed-jobs decision is settled**, through two rounds of `aif-grilling`. Recorded as
    `docs/product/decisions/ADR-0004-unclaimed-jobs-stay-and-become-visible.md`, status `draft`
    pending the maintainer's confirmation of the numbered list.
- **Not completed:**
  - `jobs.component.ts` is **1226/400**. Two extractions is not "under budget", and the remaining
    excess is roughly three budgets' worth.
  - **The template and the stylesheet were not touched at all**, by design - they follow the `.ts`.
    `jobs.component.html` 1148/300 and `jobs.component.scss` 933/400 are unchanged.
  - The third extraction was scoped and **deliberately not attempted**: the document-drafting group
    (`createCvDraft`, `createCoverLetterDraft`, `chooseExistingDocument`, `prepareDocumentsStep`,
    `commitApplicationDocuments`, `cvDocStale`, `coverLetterDocStale`), around 180 lines sharing one
    status-and-error shape. It writes ten component signals, the page has no component-level test,
    and this is the feature that produced six rounds of falsely green unit tests. Starting it with
    the budget left in this session would have been the fourth.
  - ADR-0004 is not implemented. No Rust or `libs/` code changed this watch.
- **Files or packages changed:** added `apps/desktop/src/app/shared/cover-letter-tailor.service.ts`
  and its spec, `apps/desktop/src/app/pages/jobs/job-detail-icons.ts` and its spec; modified
  `apps/desktop/src/app/pages/jobs/jobs.component.ts`; added `ADR-0004`; updated `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** run and observed - `npm run type-check` pass, `npx nx test desktop` **1038 passed,
  71 suites**, 20 of those tests new this watch, `npx nx lint desktop` 0
  errors / 8 pre-existing warnings, `npx nx build desktop` **bundle generation complete** (it caught
  a `CoverLetterTone` / `CoverLetterLength` widening that `type-check` did not - the documented gap,
  observed again), `npm run quality:file-size` pass with base `1467 -> 1307 -> 1226`,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` clean. **Not run:** the `cargo` gates, because no Rust file was touched; the
  browser preview, because the jobs page waits on `db_get_settings` and does not render outside
  Tauri.
- **Privacy/security impact:** none from the code. ADR-0004 is a small privacy improvement if
  implemented - a user cannot delete job description text they cannot see - and adds no new
  exposure, since it reveals the user's own local rows to the user.
- **Decisions and assumptions:**
  1. The complaint about invisible jobs is **lost work**, not database bloat, so the answer is
     visibility and no automatic deletion.
  2. Mechanism is a **filter chip in My Jobs, default off** - not a new route, page or command.
  3. **No migration.** `claimed` is derived as `EXISTS(applications)`; `db_list_jobs_overview_core`
     relaxes its `WHERE` and `JobOverview` gains one boolean. This is what closes the schema arm of
     the Grilling gate.
  4. **Discover-scanned rows stay hidden**, using the rule `db_list_jobs` already applies, so one
     scan cannot flood the table.
  5. Unclaimed rows carry **their own status word**, not a blank cell, and it joins the status
     filter. One new key across six locales.
  6. They are **deletable through the existing trash control** and `db_delete_job`'s cascade. No bulk
     clear.
  7. **Decision now, code next session.** The extraction got this session's budget.
  - Accepted cost, stated to the maintainer: deleting an analysed row still re-pays the parse tokens
    on re-paste, because the AI parse runs before the `jd_hash` upsert. Nothing in ADR-0004 changes
    that.
  - Two behaviour changes rode along with the first extraction and are deliberate: the inline
    fence-stripping regex became the shared `cleanJsonText`, which additionally trims to the outer
    braces, so strictly more AI responses parse and none fewer; and an unparseable base letter now
    falls back to a from-scratch generation rather than throwing.
- **Risks or compatibility impact:** the jobs page has no component-level test, so both extractions
  rest on service-level tests plus `nx build desktop` for the template. The tailor modal's behaviour
  was preserved by reading, not by an end-to-end run - nobody clicked Tailor cover letter in a
  running app this watch.
- **Open issues or blockers:** `jobs.component.ts` 1226/400, `jobs.component.html` 1148/300,
  `jobs.component.scss` 933/400. ADR-0004 unimplemented and awaiting sign-off. Unchanged from the
  previous watch: the two human release checks on `0.29.2` (look at the packaged macOS window; take
  an update from an installed `0.29.1`), Windows and Linux unverified, `discover.component.scss`
  1915/400, the AIF skill set unpruned against `writing-great-skills`, and the two security
  advisories waiting on upstream releases.
- **Next first action:** extract the document-drafting group into
  a service that owns `documentReviewStatus` / `documentReviewError` and the two choose-dialog
  flags, taking `application` and `profile` through an explicit context - the shape
  `CoverLetterTailorService` uses. Write its test before the extraction, because the shared
  status-and-error handling is the duplicated knowledge that justifies the move.
- **Evidence:** `git log --oneline -3` shows `a0fb36d`, `dffb638` on `e420c7d`;
  `npm run quality:file-size` printed `1226/400 ... base 1307` on the second commit;
  `npx nx test desktop` printed `Tests: 1038 passed`.

### 2026-08-02, 0.29.2 published and the download went live

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/web-download-live`, then `docs/close-0.29.2-watch`
- **Commits:** two on the web branch, one here
- **Pull request:** [#255](https://github.com/vitala89/applye/pull/255) and
  [#256](https://github.com/vitala89/applye/pull/256), both merged
- **Objective:** close the release: publish `0.29.2`, flip the website's download, and record what
  the release was and was not verified against.
- **Completed:**
  - `v0.29.2` published and marked Latest, after the mechanical half of the smoke test was run
    locally - the detail is in the entry below;
  - **the flip condition was met, so `COMING_SOON` is `false`.** It was written next to the flag
    yesterday as a checkable sentence: the published latest release lists installers for macOS,
    Windows and Linux. It does. The hero's primary control is now Download, pointing at the releases
    page rather than a versioned asset, so it cannot go stale when the version moves;
  - **verified against the live site rather than the build**: `coming soon` appears zero times in
    the served HTML, the Download link resolves to the releases page, `/changelog` heads at
    `[Unreleased]` above `[0.29.2]`, and no console errors. The deploy that served it is the run for
    `25fb22e`, confirmed by run id rather than assumed from timing - the first read hit a cached
    copy from the previous deploy and had to be repeated with a cache buster;
  - `CHANGELOG.md` gained an `[Unreleased]` entry for the site change. The stop hook caught its
    absence: `apps/web` changed and the changelog had not, which is exactly the case the hook exists
    for. A site the user visits is user-facing.
- **Not completed:** the two human checks, unchanged and still owed - nobody has looked at the
  packaged macOS window, and the download-and-install path has not run once. Windows and Linux are
  untouched.
- **Files or packages changed:** `apps/web/src/app/site.ts`, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** `nx test web` pass (76), `npm run web:build` pass (39 prerendered routes),
  `format:check`, `quality:attribution`, `quality:file-size`, `git diff --check` pass. Browser
  preview checked before merge; the live site checked after. CI green on both PRs, on their head
  commits - checked by head SHA, since the first CI read predated the changelog commit.
- **Privacy/security impact:** none. One boolean and documentation.
- **Decisions and assumptions:** the flip stayed a separate PR from the documentation, as decided
  during the grilling, even though publication had already happened by then and one PR would have
  been fewer steps. The separation's reason - never let the button land before the release does -
  had already been served, but changing a decision silently because it became convenient is the
  habit worth not having.
- **Risks or compatibility impact:** the Download button leads to a release whose Windows and Linux
  installers no human has run. That risk is on the release, not on the button, and it is recorded in
  `CURRENT_STATE.md` where it can be closed.
- **Open issues or blockers:** the two human checks. Beyond the release: `jobs.component.ts` at
  1610/400 with its template and stylesheet also over, `settings.component.{ts,html}` at 575/400 and
  580/300, `pipeline.component.scss` 456/400, `dashboard.component.ts` 428/400. Unclaimed jobs still
  accumulate as invisible rows. The AIF skill set has not been pruned against `writing-great-skills`.
- **Next first action:** open the packaged `Applye_0.29.2_aarch64.dmg` and confirm the window renders
  styled; then run an installed `0.29.1` and take the update it offers.
- **Evidence:** `gh release list` shows `v0.29.2` as Latest; the live site serves a Download link and
  zero "coming soon"; `gh run list` attributes the deploy to `25fb22e`.

### 2026-08-02, tag 0.29.2, and the updater error that was telling the truth

- **Status:** complete, publication is the maintainer's
- **Agent/tool:** Claude Code, Opus
- **Branch:** `docs/release-0.29.2-state`, from `main` (`8f59533`)
- **Commits:** one, documentation only
- **Pull request:** not yet opened
- **Objective:** merge the two open branches, cut `v0.29.2`, and diagnose the red error the
  maintainer photographed in Settings: `The update check failed. Could not fetch a valid release
JSON from the remote`.
- **Completed:**
  - **`v0.29.2` tagged and built.** All four version sources were checked to agree before tagging -
    the release workflow verifies `package.json`, `package-lock.json`, `tauri.conf.json` and
    `Cargo.toml`, and refuses a tag that disagrees. All four matrix jobs passed: macOS aarch64,
    macOS x86_64, Windows, Linux. The draft carries **17 assets**;
  - **the manifest was verified, not assumed.** `latest.json` downloaded and read: version
    `0.29.2`, eleven platform entries (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` in four
    packaging flavours, `windows-x86_64` in three), every entry carrying a signature. Asset URLs are
    the `api.github.com/repos/.../releases/assets/<id>` form the action emits for a draft; they
    resolve for a public repository once published, since the updater requests them with
    `Accept: application/octet-stream`;
  - **the updater error is correct behaviour, and no code was changed.** Verified by request rather
    than by reading: `releases/latest/download/latest.json` returns **404**, `releases/latest`
    resolves to `v0.29.0`, and `v0.29.0/latest.json` is also 404 - that release carries a single
    `.dmg` and no manifest. The updater asks an endpoint that genuinely has nothing, and the About
    block prints the reason verbatim, which is exactly the behaviour built yesterday to replace
    silence. Publishing `0.29.2` clears it;
  - **the superseded `0.29.1` draft was deleted**, once `0.29.2` was confirmed to carry all 17
    assets. Its tag remains, because `CHANGELOG.md` links to it;
  - **PRs #253 and #254 merged**, taking the drag fix, the visible updater, and the new agent skill
    set to `main`.
  - **published, after the mechanical half of the smoke test was run here.** The maintainer asked
    the agent to run and check itself, then to proceed on its own recommendation. What could be
    verified without a human at the screen was: all **seven** `.sig` files against the public key in
    `tauri.conf.json` (minisign `ED`, BLAKE2b-512 prehash, key id `38239e44c1408967` - a mismatch
    would fail after the download, on the user's machine); the packaged Apple Silicon bundle's
    `Info.plist` (`0.29.2`, `dev.applye.app`), its `arm64` binary, and its embedded frontend
    carrying a stylesheet link with **no** `onload=` handler, which is the exact shape that rendered
    `0.29.0` unstyled; and a real launch of the packaged app against an isolated `HOME`, which
    survived, printed nothing to stderr, and applied **all 28 migrations** on a fresh database with
    zero failures, including `0028` and its three identity columns - the migration the previous
    watch listed as unverified in a packaged build;
  - **the update channel was then verified live**, which a draft cannot prove: the endpoint returns
    the manifest, and the bundle URL inside it streams 16,448,597 bytes unauthenticated - the same
    file whose signature had been checked.
- **Not completed:** the human half of the smoke test. Nobody has looked at the packaged window, and
  nothing was exercised on Windows or Linux; the `.rpm` remains the least tested artifact. Those
  gaps are real and are recorded here rather than implied away by the word "published". The
  `COMING_SOON` flip on the website follows in its own change, per the decision below.
- **Files or packages changed:** `docs/product/CURRENT_STATE.md`, this file. No code.
- **Validation:** `npm run format:check` pass, `npm run quality:attribution` pass, `git diff --check`
  pass. Documentation only, so the matrix requires nothing further. The release itself was validated
  by its own workflow - four jobs, all success - and by reading the manifest. **Not run:**
  `tauri dev`; the maintainer confirmed the pipeline drag and the About block on the running app.
- **Privacy/security impact:** none. The manifest was fetched from the project's own release, and
  the three requests made to diagnose the 404 were HEAD-equivalent checks against public GitHub URLs
  carrying no data.
- **Decisions and assumptions:** the first use of the new `aif-grilling` skill, and it changed the
  outcome - the maintainer's instruction was "if there is an error, branch and fix it", and the
  grilling established there is no error to fix before any branch was cut. Three decisions, all
  taken on the recommendation: leave the updater's behaviour alone (cost: someone building from a
  fork with no releases sees a red error rather than a calm explanation); flip `COMING_SOON` only
  after publication, in its own one-line PR; delete the `0.29.1` draft but keep its tag.
- **Risks or compatibility impact:** the manifest's asset URLs are unverifiable until the release is
  published - a draft's assets are not publicly reachable, so the updater's download path is proved
  only by the publish. That is the first thing the smoke test exercises.
- **Open issues or blockers:** the visual and cross-platform halves of the smoke test are still
  owed on a shipped release, which is the wrong order and is stated as such.
  `dashboard.component.ts` 428/400, `pipeline.component.scss` 456/400, `settings.component.ts`
  575/400, `settings.component.html` 580/300 and `jobs.component.ts` 1610/400 all remain over budget.
- **Next first action:** open the `COMING_SOON = false` change so applye.dev offers the download,
  then have a human look at the packaged window on macOS and run the Windows and Linux halves of
  `docs/RELEASE.md`.
- **Evidence:** `gh run view` reports four successful matrix jobs; `gh release view v0.29.2` lists 17
  assets with `draft: true`; `curl` returns 404 for the updater endpoint and 200 for
  `releases/latest` resolving to `v0.29.0`; `gh release list` no longer shows a `0.29.1` draft while
  `git ls-remote --tags` still carries `v0.29.1`.

### 2026-08-02, our own grilling skill, and a written division with superpowers

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/aif-grilling-skill`, from `main` (`a2b22d3`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** the maintainer installed `grill-me` from `mattpocock/skills`, asked for both that
  pack and `obra/superpowers` to be read, and for the best of them to be adapted into the AIF set
  rather than left as third-party stubs.
- **Completed:**
  - **Inventory, from the local plugin caches rather than the network.** `mattpocock-skills` 1.2.0
    ships 41 skills across `engineering`, `productivity`, `misc`, `personal`, plus `in-progress` and
    `deprecated`, which were excluded. `superpowers` 6.1.1 ships 14. The AIF set was 19 skills and
    8 subagents;
  - **`aif-grilling`, written from scratch.** The original is two lines that delegate to a plugin
    skill and carries `disable-model-invocation: true`, so it fires only when the maintainer
    remembers it exists - which is why it sat unused in this repository for a day while the
    conductor kept choosing convention decisions on its own. Ours is model-invoked with four hard
    triggers, asks in rounds of 2 to 4 questions through the interactive question tool rather than
    one question per turn, resolves facts by reading the repository instead of asking, treats "as
    you recommend" as authorization the agent must then state, forbids edits during a grilling, and
    ends in a numbered list of settled decisions awaiting confirmation;
  - **the two-axis review**, taken from mattpocock's `code-review` and folded into `aif-code-review`:
    standards and design reported separately, because a diff can satisfy every written rule and
    still be the wrong shape. One rule of this repository's own was added beside it - a new test
    that does not fail without its fix is a finding, not coverage. Both of today's fictitiously
    green tests would have been caught by it;
  - **`docs/internal/AGENT_SKILL_MAP.md`**, the routing document. It records what each AIF skill
    owns, and - the part that was missing - that `superpowers` is already load-bearing here
    (`using-superpowers` is injected into every session and seven plans under
    `docs/superpowers/plans/` are in its format) with a per-skill division: superpowers owns the
    general technique, AIF owns the Applye rules it must respect. Five overlaps are named
    explicitly, including that the validation matrix outranks any general "verify before
    completion" phrasing;
  - **the grilling gate is in the rules, not only in a skill.** `AGENTS.md` gained a section between
    the plan check and Before coding, and `CLAUDE.md` points at it, so an agent that never invokes
    the skill still meets the rule;
  - **the originals are gone.** `.claude/skills/grill-me`, `.claude/skills/grill-with-docs`,
    `skills-lock.json` and the two copies under `.agents/skills/` are deleted, on the maintainer's
    decision. The `mattpocock-skills` plugin stays installed - other skills of it are in use.
- **Not completed:** the rest of the mined material. `writing-great-skills` is reference rather than
  process and was cited rather than copied, and the AIF set has **not** been rewritten against its
  principles - that is a separate pass the maintainer deferred, and several AIF skills are likely
  carrying no-ops and duplication it would retire. Nothing from `deprecated/` or `in-progress/` was
  taken.
- **Files or packages changed:** `.claude/skills/aif-grilling/SKILL.md` (new),
  `.claude/skills/{aif-code-review,aif-orchestrator}/SKILL.md`, `AGENTS.md`, `CLAUDE.md`,
  `docs/internal/AGENT_SKILL_MAP.md` (new), this file. Deleted:
  `.claude/skills/grill-me`, `.claude/skills/grill-with-docs`, `skills-lock.json`.
- **Validation:** `npm run format:check` pass, `npm run quality:attribution` pass,
  `git diff --check` pass. No application code changed, so the matrix requires nothing further and
  no test count moved; `CHANGELOG.md` is deliberately untouched because it records shipped product
  changes and nothing here reaches a user.
- **Privacy/security impact:** none. No source, secret, or user data was sent anywhere - both packs
  were read from the local plugin cache, not fetched. Removing the symlinks also removes two links
  that pointed out of the repository into a gitignored directory.
- **Decisions and assumptions:** four decisions were put to the maintainer and all four came back on
  the recommendation - adapt narrowly rather than rewrite the AIF set, ask in rounds rather than one
  question at a time, make the skill model-invoked rather than user-invoked, and keep the plugin
  while deleting the symlinks. Model-invocation costs context load on every turn, which is the
  price of the trigger firing without the maintainer remembering it; that trade is stated in the
  skill map.
- **Risks or compatibility impact:** two process packs still overlap, and a written division is
  weaker than one process. The visible failure mode is an agent running superpowers'
  `brainstorming` where `aif-grilling` was meant, or vice versa; the skill map names which is which,
  but nothing enforces it. `AGENTS.md` grew by 16 lines, all rules, none of them checkable by a
  script.
- **Open issues or blockers:** `v0.29.2` is still untagged - unchanged by this watch, and the next
  release action. The AIF-wide pruning pass against `writing-great-skills` is unscheduled.
- **Next first action:** tag `v0.29.2` and run the `docs/RELEASE.md` smoke test, which is also the
  first live exercise of the updater shipped in `a2b22d3`.
- **Evidence:** 41 and 14 skills enumerated from the two caches with name, line count and
  description. `.claude/skills/` now holds 20 Applye-owned skills and no third-party symlink.

### 2026-08-02, the drag fix that did nothing, and the test that let it through

- **Status:** complete, native pass pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-drag-lag-and-update-ui` (same branch, second commit)
- **Commits:** one, on top of `f581141`
- **Pull request:** [#253](https://github.com/vitala89/applye/pull/253), open
- **Objective:** the maintainer ran the app and the pipeline card still lagged behind the pointer.
  This entry corrects the previous one, which reported the drag as fixed. **It was not.**
- **Completed:**
  - **What was wrong with the fix.** `.cdk-drag-preview { transition: none }` and
    `.card { transition: ... transform 0.15s }` are both one class, so the cascade is decided by
    source order - and `@use` must be the first statement in a Sass file, which puts every rule of
    the extracted `_drag.scss` _before_ `.card` in the emitted stylesheet. The preview therefore
    kept `.card`'s transform transition and behaved exactly as before. Proved by compiling the sheet
    and reading the output, not by inspection: `.cdk-drag-preview` was rule 1, `.card` was rule 283;
  - the rule is now `.card.cdk-drag-preview`, which wins on two classes whatever the order, with
    `.card.cdk-drag-animating` declared after it so the drop animation still runs. The now-redundant
    single-class `.cdk-drag-animating` rule was removed, and the preview gained
    `will-change: transform` so moving it repaints nothing beneath it. Every transition in the
    compiled sheet was listed to confirm nothing else reaches the preview;
  - **what was wrong with the test, which matters more.** It asserted that `_drag.scss` _contains_
    `transition: none` under `.cdk-drag-preview`. That was true while the bug was fully present: a
    text search cannot see a cascade, so the guard was green for a fix that did nothing. It now
    compiles the stylesheet with `sass` and resolves which `transition` declaration actually wins
    for an element carrying `card` + `cdk-drag-preview`, by specificity then source order.
    **Verified against the broken version:** restoring the single-class rule fails it.
- **Not completed:** the native pass. A dropped frame cannot be seen from here - the browser preview
  cannot render the pipeline board, which needs the database - so the maintainer confirms the feel.
- **Files or packages changed:** `apps/desktop/src/app/pages/pipeline/{_drag.scss,drag-styles.spec.ts}`,
  `CHANGELOG.md`, this file.
- **Validation:** `npm run type-check` pass, `npm test` pass (1019), `npm run lint` pass (0 errors,
  8 pre-existing warnings), `npm run quality:file-size` pass, `npm run verify:csp` pass,
  `git diff --check` pass, `npm run format:check` pass. **Not run:** `tauri dev`.
- **Privacy/security impact:** none. Two CSS rules and a test.
- **Decisions and assumptions:** specificity was chosen over `!important` and over reordering,
  because `@use` cannot be moved and `!important` would also defeat the drop animation. The guard
  parses class-only selectors and skips anything with a combinator - correct here, since the CDK
  moves the preview out to the body, so no descendant rule can reach it.
- **Risks or compatibility impact:** the guard's parser is deliberately narrow. A future rule
  written as a descendant selector, or with `!important`, would not be weighed by it - the failure
  mode is a silent pass, which is exactly what this entry is about. Stated here rather than assumed
  away.
- **Open issues or blockers:** unchanged from the entry below. `v0.29.2` is still untagged.
- **Next first action:** merge #253, then tag `v0.29.2`.
- **Evidence:** the compiled stylesheet before the fix put `.cdk-drag-preview` at rule 1 and `.card`
  at rule 283; after it, the winner for `card cdk-drag-preview` is `transition: none`. Reverting to
  the single-class rule fails `drag-styles.spec.ts`, which the previous version of that spec passed.

### 2026-08-02, unstick the pipeline drag, and make the updater visible

- **Status:** complete, native pass pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-drag-lag-and-update-ui`, from `main` (`7e5e06f`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** two things the maintainer found while running the app after #252 - dragging a
  pipeline card lagged behind the cursor, and there was no way to learn a new version exists.
- **Completed:**
  - **The drag.** `.card` transitions `transform` for its hover lift; the CDK drag preview is a
    clone of that element which the CDK moves by writing `transform: translate3d(...)` on every
    pointer move. The transition interpolated every write, so the preview trailed 150ms behind the
    pointer - the "two cards with a shadow between them" the maintainer described. The preview now
    sets `transition: none`, and `.cdk-drag-animating` stays declared after it so the drop
    animation survives at equal specificity. Cause confirmed by the surface that does _not_ lag:
    `.docedit-section` in the CV editor has no transform transition;
  - `pipeline.component.scss` was over budget (474 non-empty, ceiling 400) and could not take even
    a comment, so the CDK block moved to `_drag.scss`, `@use`d from the component sheet. **474 -> 456.** Still over the ceiling;
  - **The updater is now visible.** Everything was already wired - plugin both sides, signing key,
    `latest.json` endpoint - but it spoke only through a native dialog at launch, and only when an
    update happened to exist, so on an ordinary start it was indistinguishable from a feature that
    was never built. The dialog is gone (maintainer's choice). `UpdaterService` was rewritten
    around `state`/`newVersion`/`error` signals with seven states, and the plugin sits behind an
    injected `UPDATE_BACKEND`, so every state is reachable in a test - the old service called the
    plugin directly and could only be tested by not calling it, the same shape that made
    `SettingsService` a trap;
  - **Two surfaces.** A dot beside Settings in the sidebar, reduced to just the dot in rail mode,
    and `AboutUpdateComponent` in Settings: running version, **Check for updates**, or **Install &
    restart** when there is something to take. A failed check prints its reason verbatim instead of
    reading as "up to date"; a failed install returns to the offer rather than stranding the user;
  - **The settings page shrank rather than grew** - it is far over budget, so About became its own
    component and `getVersion` went with it. `.ts` **584 -> 575**, `.html` **586 -> 580**;
  - 9 locale keys in all six languages, plus `settings.about_privacy`, which had been hardcoded
    English in the template. `updater.badge` is on the shared-with-English allowlist for German,
    which uses the loanword.
- **Not completed:** the native pass. The drag has to be felt, and the update path can only be
  exercised end to end once a newer release is published - the maintainer has the steps in the
  handover. `dashboard.component.ts` and `jobs.component.ts` remain over budget, untouched here.
- **Files or packages changed:** `apps/desktop/src/app/core/updater.service.ts` (rewritten) + new
  spec, `apps/desktop/src/app/app.ts`, `apps/desktop/src/app/layout/shell-layout.component.{ts,html,scss}`
  - new spec, `apps/desktop/src/app/pages/settings/{settings.component.ts,settings.component.html,
about-update.component.ts,.html,.scss}` + new spec, `apps/desktop/src/app/pages/pipeline/
{pipeline.component.scss,_drag.scss,drag-styles.spec.ts}`, `libs/i18n` (six locales + the parity
    spec's allowlist), `CHANGELOG.md`, this file.
- **Validation:** `npm run type-check` pass (6 projects), `npm test` pass (**1019**, was 998),
  `npm run lint` pass (0 errors, 8 pre-existing warnings), `cargo test --lib` pass (338 passed,
  1 ignored), `cargo clippy --all-targets -- -D warnings` pass, `cargo fmt --check` pass,
  `npm run quality:file-size` pass, `npm run quality:attribution` pass, `npm run format:check` pass,
  `npm run verify:csp` pass, `git diff --check` pass, `npx nx build desktop` pass. The drag guard
  was confirmed to fail without the fix, and the shell spec to fail without the injected service.
  **Not run:** `tauri dev`. The browser preview could not verify either surface: Settings blocks on
  `db_get_settings` outside Tauri and renders nothing, which is why the About states are proved by
  a component spec instead.
- **Privacy/security impact:** none new. The updater already reached
  `github.com/vitala89/applye/releases/latest/download/latest.json` at every launch and still does,
  at the same moment; what changed is that its result is now shown rather than swallowed. Update
  artifacts are signature-checked by the plugin against the public key in `tauri.conf.json`, which
  this diff does not touch. Nothing is installed without the user pressing Install.
- **Decisions and assumptions:** the native dialog was removed rather than kept alongside the new
  UI, on the maintainer's decision - two things announcing the same update is worse than one. The
  badge watches `available` _and_ `installing` so it does not vanish mid-install, and deliberately
  stays hidden on `error`: a failed check is worth a line in Settings, not a mark on the sidebar.
  The CSS regression guard reads the stylesheets, which is unusual here but is the only level at
  which a dropped frame is expressible - it asserts the rule, not the rendering.
- **Risks or compatibility impact:** the update path cannot be fully exercised until a release
  newer than the running build is published, so the `available` and `installing` states are proved
  by tests and not yet by a live update. `transition: none` on the preview depends on
  `.cdk-drag-animating` being declared after it; the guard pins that ordering.
- **Open issues or blockers:** `pipeline.component.scss` 456/400, `settings.component.ts` 575/400,
  `settings.component.html` 580/300, `dashboard.component.ts` 428/400 - all shrinking but all still
  over. `v0.29.2` is still untagged.
- **Next first action:** merge this branch, then tag `v0.29.2` and run the `docs/RELEASE.md` smoke
  test - which is also the first real exercise of the update path, since the published build will
  then be older than the tagged one.
- **Evidence:** `npm test` 998 -> 1019. `quality:file-size` shows pipeline stylesheet 474 -> 456,
  settings `.ts` 584 -> 575, `.html` 586 -> 580. Removing `transition: none` fails
  `drag-styles.spec.ts`; renaming the injected `updater` member fails all four shell specs, which is
  the failure `nx build desktop` caught and no other gate did.

### 2026-08-02, kill the dead settings cache, name the unclaimed job, cut 0.29.2

- **Status:** complete, except the native pass and the tag push, both the maintainer's
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/settings-service-and-dashboard-job-name`, from `main` (`6b6f716`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** the two defects part B left behind - a service that was a trap rather than a cache,
  and a dashboard card that could not name the job it reopens - then the version bump and the
  website flags the maintainer asked for in the same session.
- **Completed:**
  - **`SettingsService` deleted, by maintainer decision** (delete versus initialize was put to them
    because one removes a `libs/data` public export and the other changes how the whole app reads
    settings; they chose delete). It held `signal<Settings | null>(null)` filled only by `load()`,
    and `load()` was called nowhere, so `current()` was `null` on every run - which is how the AI
    identification step silently never executed for a whole release. Its only remaining mention in
    `apps/` was the comment in `job-identity-resolver.service.ts` explaining why it was avoided; the
    27 real call sites already went through `DbService.getSettings()` and were untouched;
  - **the guard that stops the shape coming back:** `libs/data/.../cache-signal.guard.spec.ts`
    fails any service in that directory that declares a null-initialized cache signal _and_ hands
    its population to a separate `async load()`. A pattern check, not a name check, because the
    trap is the shape. Verified non-fictitious: restoring the deleted file from `main` makes it
    fail, deleting it again makes it pass;
  - **the dashboard names the job with the unfinished tailoring session.** Resolved once at load
    (`describeProgressJob`), not inside the `queue` computed - the fallback reaches the database,
    and an await in a computed is what raised `NG0600` on this feature last week. Same two-step
    lookup as `WizardNavService.crossJobLabel`, plus a third step it does not have: a failed read
    renders `#12`, so the card can always say which job it reopens;
  - **`dashboard.component.ts` had to shrink before it could grow.** It was already over budget at
    433 non-empty lines (ceiling 400) - the script was run before the edit, per rule 63, and caught
    the growth to 462. `dashboard.util.ts` now owns the pure helpers (`monogram`, `daysOverdue`,
    `daysSince`, `whenLabel`, `scheduledMs` and their constants), which no test could reach while
    they were file-scope functions inside the component. **433 -> 428.** Still over the ceiling;
  - **version `0.29.1` -> `0.29.2`** in `package.json`, `package-lock.json`, `tauri.conf.json`,
    `Cargo.toml` (and `Cargo.lock`), the six README badges with their alt text, and the asset names
    throughout the `docs/RELEASE.md` runbook. `CHANGELOG.md`'s `[Unreleased]` became
    `[0.29.2] - 2026-08-02` with a compare link, which is what turns the heading on the website's
    changelog page into a link. The two historical sentences in `RELEASE.md` - `v0.29.1` as the
    first release CI built, `0.29.0` as the unstyled bundle - were deliberately left alone;
  - **website: `SOURCE_PUBLIC` `false` -> `true`.** The repository is public (`gh repo view`
    reports `PUBLIC`), so the reason for the flag expired and every "source: coming soon" pill is a
    real GitHub link again. **`COMING_SOON` stays `true`**, and its comment now states a checkable
    flip condition instead of a vague one: the published latest release is still `v0.29.0` and
    carries exactly **one** installer, an Apple Silicon `.dmg`, so a Download button would land
    Windows and Linux visitors on a page holding nothing for them. No new download page was built -
    the hero already switches to a Download button pointing at the releases page, not at a
    versioned asset, so it cannot go stale.
- **Not completed:** the native `tauri dev` pass on the dashboard card, and the `v0.29.2` tag push
  plus the `docs/RELEASE.md` smoke test - both the maintainer's, both in the handover message. The
  `0.29.1` draft release was left in place rather than deleted; it is superseded, and deleting a
  release is not a call to make unasked.
- **Files or packages changed:** `libs/data` (`index.ts`, `settings.service.ts` deleted,
  `cache-signal.guard.spec.ts` new), `apps/desktop/src/app/pages/dashboard` (`dashboard.component.ts`,
  `dashboard.util.ts` + spec new, `dashboard.component.spec.ts` new), `apps/web/src/app/site.ts`,
  `package.json`, `package-lock.json`, `apps/desktop/src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock}`,
  six `README*.md`, `docs/RELEASE.md`, `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
- **Validation:** all run and observed from the repository root unless noted. `npm run type-check`
  pass (6 projects), `npm test` pass (**998**, was 983: +4 dashboard component, +11 helpers and the
  data guard), `npm run lint` pass (0 errors, 8 pre-existing non-null-assertion warnings),
  `cargo test --lib` pass (338 passed, 1 ignored), `cargo clippy --all-targets -- -D warnings` pass,
  `cargo fmt --check` pass (from `apps/desktop/src-tauri`), `npm run quality:file-size` pass,
  `npm run quality:attribution` pass, `npm run format:check` pass, `npm run verify:csp` pass,
  `git diff --check` pass, `npx nx build desktop` pass, `npm run web:build` pass (39 static routes).
  **Both new behaviours were confirmed to fail without their fix**, which is the check this codebase
  has needed twice: restoring the old dashboard line fails 2 of the 4 new tests (the claimed-job
  case still passes, correctly - it never depended on the fix), and restoring `settings.service.ts`
  fails the data guard. Website verified in the browser preview: the hero renders "View source on
  GitHub" as a link to the repository, the download remains a "coming soon" status, `/changelog`
  heads at `0.29.2` dated 2026-08-02 linking to the compare view, no console errors.
  `apps/web/public/sitemap.xml` was regenerated by `web:build` and reverted - only `lastmod` moved.
  **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No data is read, stored or sent that was not before; deleting
  an unused service removes a read path rather than adding one. `SOURCE_PUBLIC` exposes no new
  information - it links to a repository that is already public.
- **Decisions and assumptions:** the dashboard fix took the "resolve into a signal beside
  `overview()`" option and rejected caching company/title in `WizardProgress`, which is cheaper but
  wrong now: part B made the job name change by hand _and_ by AI, so a cache written when the wizard
  opened would go stale the moment either happened. Naming the job at load is safe because the
  wizard lives on the jobs page - progress cannot change while the dashboard is on screen, and
  arriving back at the dashboard reconstructs the component. The extraction taken was the pure
  helpers rather than the ~120-line `queue` computed: the helpers are a real responsibility with no
  dependencies, and splitting `queue` is a design change, not a size fix.
- **Risks or compatibility impact:** `SettingsService` was exported from `libs/data`, so anything
  outside this repository importing it breaks; nothing inside does. `desktop:build` reports the
  pre-existing bundle warning (initial 1.31 MB against a 1.30 MB warning budget, error budget
  1.50 MB not reached), unchanged in kind by this diff, which removes desktop TypeScript rather than
  adding any.
- **Open issues or blockers:** `dashboard.component.ts` is 428 of 400 and cannot grow again without
  another extraction. `jobs.component.ts` remains far over at 1610 lines with its template and
  stylesheet also over - separate work. Unclaimed jobs still accumulate as invisible rows.
- **Next first action:** push the tag - `git tag -a v0.29.2 -m "Applye 0.29.2" && git push origin
v0.29.2` once this branch is on `main` - then run the smoke test in `docs/RELEASE.md` against the
  draft it produces, publish it, and flip `COMING_SOON` to `false` in the same breath.
- **Evidence:** `npm test` 983 -> 998. `quality:file-size` reported the violation at 462 and passed
  at 428 after the extraction. `gh release list` shows `v0.29.1` as `Draft` and `v0.29.0` as
  `Latest`; `gh release view v0.29.0 --json assets` returns a single asset,
  `Applye_0.29.0_aarch64.dmg`, which is the whole argument for leaving `COMING_SOON` alone.

### 2026-08-02, job identity part B: AI names it, then the user does

- **Status:** complete, verified natively
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/job-identity-part-b`, from `main` (`825fa74`)
- **Commits:** one
- **Pull request:** not yet opened
- **Objective:** implement `docs/superpowers/specs/2026-08-02-job-identity-part-b-design.md` -
  one press of Parse & filter runs the deterministic rules, then one `job-identify` call if they
  missed, then a dialog if that missed too.
- **Completed:**
  - migration `0028_job_identity_sources.sql`: `title_source`, `company_source`,
    `identity_prompt_skipped`. Additive, no backfill, checksum pinned in `db.rs`;
  - `commands/job_identity_source.rs`: `IdentitySource`, the re-parse resolution rules,
    `job_set_identity` and `job_skip_identity_prompt`. New module rather than growth in
    `job_identity.rs` (pure text rules) or `job_paste.rs` (the pipeline), because it is the only
    piece that needs both the stored row and the fresh text;
  - `job_paste.rs` now loads the stored identity, resolves both fields against it, and writes the
    sources. The `prefer_fresh` CASE in the upsert went away: the values are already resolved in
    Rust, so the SQL writes them outright;
  - `libs/skills/src/job-identify/job-identify.md`, registered in `ai/skills.rs`, economy model,
    strict JSON, with the platform-is-not-the-employer and unnamed-partner rules pinned by tests;
  - `JobIdentityResolverService` runs the chain from `JobIntakeService.parse`;
  - `JobIdentityPromptComponent` mounted at the shell beside `UnsavedJobPromptComponent`;
  - `JobMetaCardComponent` extracted from the jobs page to host the inferred marker and the
    "Name it yourself" button - both page files were over budget and could not grow;
  - 13 keys in all six locales.
- **Not completed:** the native pass. Migration `0028` applying, the live `job-identify` call, and
  the dialog on screen all need `tauri dev`, which this watch does not run. The maintainer has a
  step-by-step scenario in the handover message.
- **Files or packages changed:** `apps/desktop/src-tauri` (migration, `db.rs`, `lib.rs`,
  `commands/{mod,jobs,job_paste,job_identity_source}.rs`, `ai/skills.rs`), `libs/skills`,
  `libs/core` (`job.model.ts`), `libs/data` (`job-source.service.ts`), `libs/i18n` (six locales),
  `apps/desktop/src/app` (shell layout, jobs page, `job-meta-card`, `job-identity-prompt`,
  `job-identity-resolver.service.ts`, `job-intake.service.ts`).
- **Validation, all run and observed:** `npm run type-check`, `npm test` (958 desktop tests, 61
  suites, all six projects green), `npm run lint` (0 errors, 8 pre-existing warnings, none in new
  files), `cargo test --lib` (338 pass), `cargo clippy --all-targets -- -D warnings`,
  `cargo fmt --check`, `npm run quality:file-size` (passed), `npm run quality:attribution`,
  `npm run format:check`, `npm run verify:csp`, `git diff --check`, `npx nx build desktop`.
- **Every new rule was checked against a deliberately broken build.** Disabling the `user` rule fails
  4 tests; disabling the `inferred` arm fails 2; disabling the skip check fails 1; removing the
  provider-configured guard fails 1. Two fixtures assert the property the test depends on - that the
  posting extracts no company, and that it extracts no title - because a green test on an
  unrepresentative fixture has already shipped a bug in this exact code.
- **Privacy/security impact:** the AI step sends the pasted job description to the configured
  provider, which is the same text `job-scoring` and the tailoring passes already send, on the same
  configured provider and key. Nothing new leaves the machine. Skipped entirely when no provider key
  is stored, so a user who has not set up AI never makes the call.
- **Decisions and assumptions:**
  - the "no provider configured" check is `hasProviderKey` in API mode only. In CLI mode the bridge
    binary is the credential and probing it costs a process spawn per parse, so the call is attempted
    and its failure falls through to the dialog, which is the same user-visible outcome;
  - a field the user leaves blank in the dialog keeps whatever source it had. Leaving it empty is not
    a claim about it;
  - `askAgain` is `resolve` with the skip cleared, so the button beside the placeholder re-runs the
    AI step too rather than jumping straight to the dialog.
- **Risks or compatibility impact:** the upsert's authoritative branch was re-expressed in Rust as
  `stored.or(passed).or(extracted)`, which is what the old `COALESCE(NULLIF(jobs.company, ''), ...)`
  did. Existing `job_paste` tests cover both branches and still pass.
- **Open issues or blockers:** unchanged from the previous watch - unclaimed jobs accumulate as
  invisible rows, and `dashboard.component.ts:270` still loses the name of an unclaimed job.
- **Corrected within the same watch, by the maintainer testing it.** The first cut awaited the
  identification phase inside `JobIntakeService.parse`, so Parse & filter stayed disabled across an
  AI call bounded at ten minutes by `ai_run` and then across a dialog bounded by nothing at all.
  Reported as "нажали парсинг, и он завис". Leaving the page mid-phase orphaned the promise and the
  page came back reset. Fixed by making identification a phase that runs _after_ the parse on the
  root singleton, with its own 45-second bound, an `identifying...` line on the card, and a corner
  badge for a user who navigated away - the shape `WizardActivityService` and the resume-tailor
  badge already use. No "you will lose the parse" warning was added, because nothing is lost: the
  job row is written before the phase starts. The dialog is raised by the component rendering the
  job rather than by the service, so it cannot appear over Pipeline. Both regressions have tests
  that hang or fail without the fix.
- **Two more found by reviewing the diff before the PR, both with tests that fail without them.**
  The page adopting a named job left the published snapshot in place, so a later rebuild of the same
  card would re-emit it over a row freshly read from the database; taking it now drops it. Doing that
  through the wider `clear` would have been the trap: one identify call sets both signals - the AI
  names the title and publishes, then flags the still-missing company - so clearing the flag on
  consume would cancel the dialog it exists to raise. `consumeResolved` and `clear` are separate for
  that reason, and a test pins it. Separately, deleting a job now clears the badge, which was
  otherwise left offering a page that no longer exists.
- **Third round, from the maintainer running it natively.** Three faults on one screen.
  (1) **NG0600, "Writing to signals is not allowed in a `computed`"**, twice per open. The dialog
  seeded its two inputs from a computed, so it threw on every open, never rendered, and the job went
  unnamed with two error toasts to show for it. Every unit test around it passed - the rule is
  enforced at render time. The two drafts now live on the prompt service and are seeded in `ask`, an
  ordinary method call, and there is a component spec that builds and opens the dialog for real. It
  reproduces NG0600 when the old shape is restored.
  (2) **The AI step failing invisibly.** `catch {}` swallowed every reason, so "the posting names no
  employer" and "nothing ever read the posting" looked identical on screen. The dialog now states
  which of the three it was - answered, no provider configured, or failed - and prints the provider's
  own error verbatim underneath. Whether the AI actually ran on the reported posting is still unknown
  from here; the next run will say so on screen instead of requiring another round trip.
  (3) **"Name it yourself" was unfindable**, rendered as uppercase micro-text in the badge row where
  it read as a label. It is now a real secondary button under the two fields it is about, labelled
  "Set company and role", and shown only when a field is missing or holds a value the AI guessed.
- **Fourth round, again from the maintainer running it.** The dialog worked - a job was named by
  hand - and four things around it did not.
  (1) **The empty state flashed on every parse.** `parseAndFilter` clears the job before parsing, and
  `@if (!job())` rendered "paste a job description" in the gap. It now also waits on `parsing()`.
  (2) **"Parsing" was drawn twice**, once as the button label and once as an animated indicator
  beside it. The indicator is gone - the parse is milliseconds now, so it was reporting nothing.
  (3) **The page header did not follow the job.** `pageTitle.set` was pushed from `loadJob` alone, so
  every other path had to remember and neither the re-parse nor naming a job by hand did. It is now
  derived from the `job` signal in an effect, which no future path can forget.
  (4) **No way to correct a name once given.** The button hid itself as soon as both fields were
  filled, which is exactly when a typo needs fixing. It is always offered now; only the label changes
  between "Set company and role" and "Edit company and role".
- **The header fix needed budget, so the German photo prompt came out.** `jobs.component.ts` was
  1509/400 and may not grow. `CvPhotoPromptService` (89 lines, 7 tests where it had none) takes the
  once-per-visit flag, the dialog state and the one document write; the page keeps a 12-line adapter,
  because deciding what to do with the returned document is the page's. Two more duplications went
  with it: `portalLanguages` was a hand-kept copy of the `SupportedLanguage` union and is now
  `SUPPORTED_LANGUAGES` in core beside the type, with `normalizeSupportedLanguage`; and
  `inferDocumentRegion` moved next to the `DocumentRegionTag` it returns. `parseLegitimacyNotes` went
  to core with 4 tests, including the malformed column that used to be caught by a bare `try`.
  **`jobs.component.ts` 1509 -> 1467, template 1126 -> 1122.**
- **Fifth round, and the AI step had never run once.** The dialog reported "AI identification is not
  set up" on a machine with a provider configured, which is what the outcome line was added to
  surface. Cause: the resolver read settings from `SettingsService.current()`, and **nothing in the
  application calls `SettingsService.load()`** - a grep for its name returns exactly one consumer,
  the resolver itself. `current()` was null on every run, so `callIdentify` returned at its first
  guard and the AI step silently never happened for anyone. It now reads `db.getSettings()`, the way
  every other consumer in the app does, which also means a provider configured a minute ago is picked
  up without a reload. Nothing but the outcome line would have found this: the feature failed exactly
  as a posting with no employer succeeds.
- **Identification now follows the Paste Job modal as well.** Analyze creates a job out of raw text,
  which is the same event as Parse & filter, and only the second one ran the chain - so a user who
  pasted through the modal had to find and press a second button to be asked, which is the work
  Analyze exists to save. Both the text and the link path start it now; the link path usually no-ops,
  because a board that returned structured fields has already named the job.
- **Sixth round, and the report was diagnostic on its own:** "Set company and role" ran the AI and
  raised the keychain prompt; Parse & filter and Analyze did nothing. The only difference between
  those paths is the guards on `start`, and both were wrong.
  (1) **`start` bailed out entirely on a recorded skip.** The spec says the skip stops the dialog
  returning; it says nothing about the AI. "Stop asking me" and "stop reading the posting" are not
  the same instruction, and one cheap call that fills in a title without asking anything is not
  asking. `start` now always identifies and only suppresses the flag that raises the dialog.
  (2) **A superseded dialog was recorded as a deliberate skip.** `prompt.ask` answered a pending
  request with the skip value when a newer one arrived, the resolver wrote
  `identity_prompt_skipped` to the job, and because a first paste dedupes on the text's hash, every
  later paste of that posting landed back on the same flagged row and did nothing. The user never
  pressed Skip once. The outcome is now a three-way `JobIdentityOutcome` - what was typed, `skipped`,
  `superseded` - and only the middle one writes anything.
  Both have tests that fail when the fix is backed out, and the second needed a test against the real
  prompt service: the resolver's own fake short-circuited the supersede path and passed either way.
- **Native gate passed.** The maintainer ran the whole chain in `tauri dev` and confirmed it: the
  parse returns immediately, the AI step runs and names what it can, the dialog asks about the rest,
  the header follows the job, and the rename button works from both entry points. Six rounds of
  correction in one watch, five of them found by running the application rather than by any test -
  which is the honest summary of what unit tests bought here and what they did not.
- **Next first action:** the deferred items below, in the order listed.
- **Evidence:** command output above, in this session's transcript.

### 2026-08-02, five fixes on one screen, two of which my own tests should have caught

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** six branches, all merged: `fix/job-identity-trailing-label` (#244),
  `fix/reject-stale-identity-on-reparse` (#245), `fix/reparse-updates-job-in-place` (#246),
  `fix/paste-modal-stays-on-link-tab` (#247), `feat/my-jobs-claimed-only` (#248),
  `docs/job-identity-part-b-spec` (#249). From `main` (`055e498`) to `2536dc8`.
- **Objective:** maintainer bug reports from the running app, taken one at a time.
- **This entry also corrects the one below it.** That watch recorded the company-extraction bug as
  fixed. It was not - #243 shipped, the maintainer tested the reported posting, and it still failed.
  Recorded here rather than edited there, because what the watch believed at the time is part of
  what happened.
- **Completed, in order:**
  - **#244 - the first fix did not work, and my test is why.** `Company name - Elbrus` sits on the
    last line of that posting; the labelled scan read the first 30 lines. My #243 fixture put the
    label near the top, so it tested the label and the separator - the parts already fixed - and
    never the scan window. **A passing test on an unrepresentative fixture is how this shipped.** The
    regression test now asserts the fixture's own length first, so trimming it later cannot silently
    stop testing the thing that broke.
  - **#245 - the stricter rules had no effect on any job parsed before them.** Extraction correctly
    returned nothing for a heading-only posting, but the page hands the stored value back on every
    re-parse and the fallback filled the gap with it. `The Purpose:` survived the rule written to
    reject it, by riding in on the path that rule leaves open. The fallback now validates what it is
    handed. Third copy of the same hole found in the SQL, where `COALESCE` put the rejected string
    back into the row.
  - **#246 - editing a saved job's description forked it.** Identity was the text's hash, so an edit
    hashed differently, matched nothing, and inserted a second job every time. `job_paste` takes an
    optional job id; with it the row is the identity. A collision is reported, not merged, because
    merging discards whichever row the user was not looking at along with its application and its
    documents. **Fixing this exposed a latent bug**: `score_cache_get` matched on
    `(job_id, profile_hash)` only, which was safe while an edit always produced a fresh job with no
    cache. It now also requires the job's current `jd_hash`, so an edited description falls through
    to `score_cache_latest` and shows its old score marked stale. Shipping the reported fix alone
    would have produced a worse bug - a score silently attributed to text it was never computed
    against.
  - **#247 - the paste modal hid its own explanation.** Fetching an unfetchable URL switched to the
    "Paste text" tab, where the warning and its "Open in browser" button are not rendered. One line.
  - **#248 - My Jobs listed every job analysed, badged Saved.** The list selected every row with an
    exception for Discover; the exception became the rule, and the query got shorter. Separately
    `no_status` - the label for _no application at all_ - was translated as "Saved" in all six
    locales. A `CanDeactivate` guard now asks before leaving an analysed but unclaimed job; its whole
    condition is "a job is loaded and it has no application", which covers Save, Mark as Applied and
    the wizard's own navigation without a special case.
  - **#249 - part B specified, not built.** AI identification then an ask-the-user dialog, with
    `Jobgether` written in as the canonical wrong answer.
- **Not completed:** part B implementation. No native `tauri dev` gate; the maintainer verified each
  fix by hand in the running app and confirmed every one.
- **Three extractions the size budgets forced, each one the code wanted anyway:** the paste pipeline
  left `scoring.rs` for `job_paste.rs` (698 of 800 lines); the job intake surface left `DbService`
  for `JobSourceService` (**474 to 461**); the header composition became a pure `jobHeaderTitle` in
  `libs/core`. `jobs.component.ts` ended at **1531**, one below its base.
- **Validation:** run and observed on each branch before merge: `npm run type-check` (6 projects),
  `npm test` (6 projects, ending at **1344 tests**; desktop 945), `cargo test --lib` (**322 passed**,
  1 ignored; from 311), `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`,
  `npm run lint` (0 errors), `npx nx build desktop`, `npm run quality:file-size`,
  `npm run quality:attribution`, `npm run format:check`, `npm run verify:csp`, `git diff --check`.
  All pass. CI green on all six PRs. **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  beyond parameters on existing commands.
- **Decisions and assumptions:** an abandoned analysis keeps its row rather than being deleted - a
  first paste is identified by the text's hash, so re-pasting lands on the same row and reuses the
  score already paid for in tokens. The `dashboard.component.ts:270` job lookup was left degraded
  where `wizard-nav` was fixed: an async lookup inside its card-list computed would restructure that
  component. Stated rather than quietly skipped.
- **Risks or compatibility impact:** unclaimed job rows now accumulate unreachably. Accepted; a
  cleanup pass is a separate decision. Titles are stricter, so a posting whose real title carries no
  role word shows the placeholder - the trade part A took deliberately, and what part B answers.
- **Open issues or blockers:** none. Part B is specified and ready to build.
- **Next first action:** implement part B from
  `docs/superpowers/specs/2026-08-02-job-identity-part-b-design.md`, starting with the migration for
  `title_source` / `company_source` / `identity_prompt_skipped`.
- **Evidence:** PRs #244 through #249 and their check output; the maintainer's confirmations in
  session.

### 2026-08-01, a posting that would not name its company, and two layers of the same staleness

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `feat/job-identity-extraction`, from `main` (`055e498`)
- **Objective:** a maintainer bug report - a JD headed `Company name - Elbrus` parsed as "No company
  name found in the posting." and was titled `The Purpose:`, a section heading from the body.
- **Spec:** `docs/superpowers/specs/2026-08-01-job-identity-extraction-design.md`, agreed before any
  code. Part A only; the AI-assisted identification is deliberately deferred to part B.
- **Completed:**
  - **Three causes, not one.** The company label matched only `company:`/`employer:`/`organization:`
    and only with a colon. The title fell back to the first line under 80 characters, which in that
    posting was a heading. And the value was permanent: `job_paste` overrides always won and the page
    passed the job's own stored values back on every re-parse, so re-extraction never ran again.
  - `job_identity.rs` (new, with 18 tests): labels widened, six separators accepted, section
    headings and role-word-free lines rejected as titles. **Returning nothing became a valid
    answer** - the display placeholder fills the hole, and an honest miss beats a confident wrong
    answer that then propagates into every generated document.
  - `IdentityPrecedence` on `job_paste`: `authoritative` for the "From link" fetch, whose values are
    structured fields off a board, `fallback` for a re-parse. Flipping the default globally was
    rejected for a reason found by reading the call sites: it would have let a prose guess beat real
    board metadata, trading one bug for a quieter one.
  - **The same staleness existed one level down and was found while wiring the first fix.** The
    upsert's `ON CONFLICT` kept whatever was already stored, so re-parsing _identical_ text could
    never correct a bad title regardless of precedence. Fixed with a bound flag, and pinned by a test
    that parses the same text twice.
  - Display placeholders in the My Jobs row, the job card, the delete confirm and the page header,
    across six locales. Nothing is written to the database: `duplicate_jd_other_company` and
    `legitimacy_check` compare companies to each other, so a shared literal would collapse unrelated
    jobs into "the same company" and raise a false duplicate warning.
- **Not completed:** part B - the AI `job-identify` skill, the inferred-value flags and their
  migration. No native `tauri dev` gate was run; the maintainer is verifying by hand.
- **Files or packages changed:** added `apps/desktop/src-tauri/src/commands/job_identity.rs`,
  `libs/data/src/lib/services/job-source.service.ts`, `libs/core/src/lib/jobs/job-identity.ts` and
  its spec, plus the design spec. Changed `scoring.rs`, `commands/mod.rs`, `db.service.ts`,
  `job.model.ts`, both `index.ts` barrels, `job-intake.service.ts` and its spec,
  `paste-job-modal.component.ts`, `jobs.component.{ts,html}`, `my-jobs.component.html`,
  `styles.scss`, six locale files, `CHANGELOG.md`, `CURRENT_STATE.md`, this file.
- **Three extractions the budget gate forced, and they were the right call anyway.** The first pass
  grew three already-oversized files. `CODE_QUALITY.md` rule 63 forbids that, so: the job intake
  surface (`jobPaste`, `classifyJobUrl`, `fetchJobFromUrl`) left `DbService` for a new
  `JobSourceService` - **474 to 461 lines**, and those three are the one path where a job's identity
  is decided rather than read back, which is what makes `precedence` belong there; the placeholder
  style became one global `.identity-unknown` instead of two near-identical local rules; and the
  header composition became a pure `jobHeaderTitle` in `libs/core`. `jobs.component.ts` ends at
  **1532**, exactly its base.
- **Validation:** run and observed: `npm run type-check` (6 projects, pass), `npm test` (6 projects,
  **1332 tests**, all pass; desktop 933, core 257), `cargo test --lib` (**311 passed**, 1 ignored),
  `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean), `npm run lint`
  (0 errors; the warnings are the pre-existing non-null assertions), `npx nx build desktop` (pass),
  `npm run quality:file-size` (passed), `npm run quality:attribution` (passed),
  `npm run format:check` (pass), `npm run verify:csp` (pass), `git diff --check` (clean).
  **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  beyond one added parameter on an existing command. The extraction is pure string work on text the
  user pasted themselves.
- **Decisions and assumptions:** the en and em dash are written in Rust as `'\u{2013}'` and
  `'\u{2014}'` rather than as characters - the repository forbids them in authored output, but real
  postings contain them constantly and they have to be matched. The parse status strings stay
  hardcoded English, unchanged; translating them is a separate change and was not smuggled in here.
  The role-word list is English-only, which is a real limit: a German or Ukrainian posting with no
  labelled title will fall through to the placeholder rather than guess. That is the intended
  failure direction and is what part B is for.
- **Risks or compatibility impact:** low, with one to watch. Titles are now stricter, so a posting
  whose real title happens to carry no role word will show the placeholder where it previously showed
  something. That is the trade the spec accepted deliberately. The `fallback` path only ever replaces
  a value with one extracted from the same text, so it cannot invent.
- **Open issues or blockers:** none from this watch. Part B is the natural next piece, and the known
  deferred items are unchanged.
- **Next first action:** the maintainer runs the manual gate on the reported posting - re-parse it
  and confirm the company reads `Elbrus` and the title is no longer `The Purpose:`. Then spec part B.

### 2026-08-01, JD intake comes out, and four of its seven resets stay behind

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/job-intake-service`, from `main` (`23c8e51`)
- **Objective:** the next first action from the watch below - `parseAndFilter` out of
  `jobs.component.ts` - started in a fresh session, which is what the previous watch asked for.
- **Completed:**
  - PR #240 merged first, so this branch starts from a clean `main` with no open pull requests.
  - `JobIntakeService` (89 lines): the parse itself, its `parsing`/`status`/`error` line, the free
    score-cache probe, and the 0-token archetype overlap check. `jobs.component.ts`
    **1553 -> 1532**.
  - **The seven-signal reset was inventoried before anything moved, which is what kept it small.**
    `parseAndFilter` opened by clearing signals across four services. Only four of them
    (`parsing`, `parseStatus`, `parseError`, `archetypeMatch`) are intake's. The other three are the
    page deciding that a re-parse invalidates the job, the score and the tailoring lock, plus
    `resetWizard()`. Moving all of them would have made intake write into `JobScoringService` and the
    wizard to clear state it does not own, so the service takes a snapshot in and returns a result
    out, and the "the JD changed, so this is stale" decisions stayed with the page.
  - A cache hit is **returned, not applied**, for the same reason: `cache`, `fromCache`, `stale` and
    `status` are `JobScoringService`'s signals.
  - 9 tests where the whole path had none, including the two early exits a mechanical move would
    lose: a hard-filter failure returns before the cache probe and the archetype call, and a profile
    with no scoring hash never touches the cache.
- **Not completed:** the compensation/archetype derivations still on the page. They are small and
  pure and want to be functions in `libs/core`, not a service. No native `tauri dev` gate was run.
- **Files or packages changed:** added `apps/desktop/src/app/shared/job-intake.service.ts` and its
  spec; `apps/desktop/src/app/pages/jobs/jobs.component.ts`; `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is untouched.
- **Validation:** run and observed on this branch: `npx tsc -p apps/desktop/tsconfig.app.json
--noEmit` (clean), `npm run type-check` (pass), `npx nx test desktop` (58 suites, **932 passed**, up
  from 923), `npx nx lint desktop` (pass), `npm run quality:file-size` (passed; the ratchet moved
  1553 -> 1532), `npm run quality:attribution` (passed), `npm run format:check` (pass),
  `npm run verify:csp` (pass), `git diff --check` (clean). **Not run:** `tauri dev`.
- **Privacy/security impact:** none. No new I/O, no new stored field, no network or IPC surface
  changed; the same three `DbService` calls run in the same order.
- **Decisions and assumptions:** the job is set on the page **after** the service returns, where
  before it was set between the parse and the cache/archetype awaits. That makes the job card and
  the archetype warning appear together instead of the card appearing a few milliseconds early -
  behavioural, visible only as the absence of a flash, and judged an improvement rather than a
  regression. The parse status strings stay hardcoded English exactly as they were; translating them
  is a separate change and was not smuggled in here.
- **Risks or compatibility impact:** low. The template binds the same four signal names through
  aliases, so `jobs.component.html` is byte-identical to `main`.
- **Open issues or blockers:** none from this watch. The known deferred items are unchanged: the
  Discover duplicate-row decision, the CV card reading "Generating" while blocked on the gap dialog,
  and the native gate.
- **Next first action:** move the compensation/archetype derivations (`hasArchetypes`, the
  `compareCompensation`/`extractSalaryFromJd` computed) into `libs/core` as pure functions, or
  decide they are small enough to leave. Either way, say which and why in the next entry.
- **Resolved in the same session:** they stay. `parseArchetypes`, `parseProfileMd`,
  `compareCompensation` and `extractSalaryFromJd` are already pure functions in `libs/core` with
  their own specs - 31 cases for compensation, plus `archetype.spec.ts` and
  `profile-markdown.spec.ts`. The 19 lines on the page are `computed()` wiring that reads two page
  signals and feeds the template. There is no logic left to lift, so extracting would add a hop and
  no test seam. The earlier note that they "probably want to be functions in `libs/core`" was
  written before anyone checked that they already were. That closes the named Tier 1 seam list.

### 2026-08-01, the last named seam, and a busy flag that would have split in two

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/job-actions-service`, from `main` (`e8c73e0`)
- **Objective:** the next first action from the watch below - job CRUD out of `jobs.component.ts`.
- **Note:** third watch started against my own standing recommendation to open a fresh session. The
  maintainer asked to continue each time. Recorded, not re-litigated; the recommendation still
  stands and the reason has not changed.
- **Completed:**
  - `JobActionsService` (91 lines): saving a job as a tracked lead, deleting it, the delete-confirm
    state, and the busy/message signals both actions report through. `jobs.component.ts`
    **1577 -> 1553**.
  - `markApplied` deliberately stayed on the page: it commits documents, closes the wizard and
    navigates. That is orchestration, not an action, and the same rule the previous three
    extractions followed.
  - **The extraction found a divergence before it shipped.** `saveJob` and `markApplied` share one
    `actionBusy` flag. Moving only the first would have given them one each, so the button that
    greys out during an apply would have stopped greying out during a save - a real regression, in
    the direction nothing would have failed on. The flag moved with the action and the page aliases
    it, so both stay guarded by the same signal.
  - 9 tests where neither action had any, including the asymmetry that reads like a bug and is not:
    a failed delete clears `deleting` and closes the confirm, a successful one leaves both alone,
    because the caller navigates away and resetting first puts the dialog back on screen for the
    frame before the route changes.
- **Not completed:** this is smaller than the "119 lines" the earlier inventory suggested. That
  figure counted `parseAndFilter` (JD paste, parse, score-cache lookup), which is a different
  responsibility and wants its own seam. Said plainly rather than padded.
- **Files or packages changed:** `apps/desktop/src/app/shared/job-actions.service.ts` (new, 91),
  `job-actions.service.spec.ts` (new, 113), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1577 -> **1553**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **923 tests** (914 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** both
  actions write to SQLite over Tauri IPC and the delete navigates.
- **Privacy/security impact:** none new.
- **Decisions and assumptions:**
  - `save` and `remove` return the row / a boolean rather than navigating or setting page state, so
    the page keeps the routing decision.
  - The service owns its own failure handling (message line + toast) because both actions handled
    failure identically and the page did nothing with it beyond display.
- **Risks or compatibility impact:** `actionBusy` is now the service's signal, aliased. Any future
  code that sets it directly on the component still works, because it is the same writable signal -
  the pattern the previous nine seams used.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the free-text
  date answers filed as a background task, the oversized Rust modules and specs frozen.
- **Next first action:** extract `parseAndFilter` from `jobs.component.ts` into a
  `JobIntakeService` - pasting a JD, parsing it, and the score-cache lookup that immediately
  follows. It resets seven signals across four other services before it starts, so list those
  resets first and decide which belong to intake and which are the page's.
- **Evidence:** file-size report printed `jobs.component.ts: 1553/400 non-empty lines, base 1577`.
  Suite 914 -> 923.

### 2026-08-01, the document-drafts region is finished

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/linked-documents-service`, from `main` (`20db990`)
- **Objective:** the next first action from the watch below - the link/commit lifecycle, the last
  piece of the 591-line document-drafts region.
- **Note:** this watch was started against my own recommendation to open a fresh session. The
  maintainer asked to continue here; recorded because the recommendation still stands for the next
  task and the reason has not changed.
- **Completed:**
  - `LinkedDocumentsService` (105 lines): `load`, `link`, `commit`, `isStale`, `clear`, and the two
    document signals. `jobs.component.ts` **1608 -> 1577**. The region is now four services.
  - The decision stayed on the page by design. "Is it stale, do I regenerate, which generator do I
    call" is orchestration; the service reports and commits. That is why it injects no draft
    service and needs only a fake database to test.
  - **The staleness check was the fragile part and is now safe.** It recomputed each document's
    input hash from a formula copied out of the generator, so the two could drift and a regenerate
    would simply stop firing - silently, and in the direction that looks fine. Both generators now
    export the builder for their own hash input (`cvDraftHashInput`, `coverLetterHashInput`) and
    the check asks with it.
  - 15 tests where the cluster had none, including all five ways a best-effort commit can decline
    to do anything - already committed, nothing linked, the database throwing, the commit
    returning nothing - each of which must leave the draft exactly where it was.
- **Not completed:** nothing in scope. `jobs.component.ts` still holds job CRUD (~119 lines) and the
  compensation/archetype derivations.
- **Files or packages changed:** `apps/desktop/src/app/shared/linked-documents.service.ts`
  (new, 105), `linked-documents.service.spec.ts` (new, 131), `cv-draft.service.ts` and
  `cover-letter-draft.service.ts` (hash-input builders exported and used),
  `apps/desktop/src/app/pages/jobs/jobs.component.ts` (1608 -> **1577**, still over budget, shrank).
  `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **914 tests** (899 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** the
  commit path runs on export and on mark-applied, both Tauri-only.
- **Privacy/security impact:** none new.
- **Decisions and assumptions:**
  - `isStale` takes the already-built hash input rather than the pieces, so the service knows
    "compare a hash" and the page knows "what the inputs are". That is what let the formula move to
    the generators instead of being copied a third time.
  - `link` returns null when the library row has gone, so the caller leaves its picker open rather
    than closing it over nothing. The old code returned early with the dialog still open, which is
    the same outcome, now explicit.
- **Risks or compatibility impact:** `commit` is reached from export and from mark-applied, and it
  swallows its own failures by design. That was true before and is now covered by tests rather than
  by a comment. The export path passes it as a callback into `DocumentExportService`, unchanged.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the
  free-text date answers filed as a background task, the oversized Rust modules and specs frozen.
- **Next first action:** extract job CRUD from `jobs.component.ts` - the delete-confirm cluster and
  the archive/restore path - into a `JobActionsService`. It is the last cohesive seam; what remains
  after it is the compensation and archetype derivations, which are small and pure and probably want
  to be functions in `libs/core` rather than a service.
- **Evidence:** file-size report printed `jobs.component.ts: 1577/400 non-empty lines, base 1608`.
  Suite 899 -> 914.

### 2026-08-01, the cover letter follows, and the gap-fill stops being two copies

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cover-letter-draft-service`, from `main` (`90ab558`)
- **Objective:** the next first action from the watch below - cover-letter generation out of the
  document-drafts region.
- **Completed:**
  - `CoverLetterDraftService` (138 lines): the `cover-letter-generate` call and the draft row.
    `jobs.component.ts` **1693 -> 1612**. `createCoverLetterDraft` went from ~125 lines to 40.
  - **The extraction found real duplication rather than creating a second copy of it.** Both draft
    flows ran the same gap-fill - analyse, ask, fold the answers back into the source text,
    best-effort save to the profile - as two copies of the same twenty lines, down to the same
    `finally` and the same swallowed write. It is now one `foldInGapAnswers` in `gap-fill.ts` (54
    lines) that both services call, and `CvDraftService` shrank from 216 to 184 going through it.
  - 13 tests, 5 of them on the shared helper directly. The condition that was a bug once already is
    now pinned: the letter skips the gap pass when a CV is linked **or still preparing**, because a
    CV mid-generation has not linked itself yet.
- **Not completed:** the link/commit lifecycle, which is what remains of the 591-line region.
- **Files or packages changed:** `apps/desktop/src/app/shared/cover-letter-draft.service.ts`
  (new, 138), `cover-letter-draft.service.spec.ts` (new, 192), `gap-fill.ts` (new, 54),
  `cv-draft.service.ts` (216 -> 184), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1693 -> **1612**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **899 tests** (886 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** cover
  letter generation needs an AI provider and SQLite over Tauri IPC.
- **Privacy/security impact:** none new. Same profile text, same job description, same skill.
- **Decisions and assumptions:**
  - `skipGapFill` is computed by the page and passed in, rather than the service reading
    `linkedCv`/`preparingCv` itself. Those are the page's signals, and passing a boolean keeps the
    service free of them.
  - `foldInGapAnswers` takes the `analyzing` signal as a parameter instead of injecting
    `CvGapDialogService`, so the helper stays a function and both services keep owning their
    injection.
- **Risks or compatibility impact:** the two extracted flows now share one gap-fill implementation,
  so a change there moves both. That is the point, and it is the reason the helper has its own five
  tests rather than being covered only through the services.
- **Open issues or blockers:** unchanged - #233's duplicate rows deferred by decision, the free-text
  date answers filed as a background task, and the oversized Rust modules and specs still frozen.
- **Next first action:** extract the link/commit lifecycle from `jobs.component.ts` - the
  `chooseExistingDocument` / `commitLinkedDocument` / `commitApplicationDocuments` cluster - into a
  `LinkedDocumentsService`. That is the last of the document-drafts region, and it is the piece the
  export path calls into, so start by listing its callers before moving anything.
- **Evidence:** file-size report printed `jobs.component.ts: 1612/400 non-empty lines, base 1693`.
  Suite 886 -> 899.

### 2026-08-01, CV generation comes out of the document-drafts region

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/cv-draft-service`, from `main` (`ffc9c21`)
- **Objective:** the next first action from the watch below - start splitting the 591-line
  document-drafts region, CV generation first.
- **Completed:**
  - `CvDraftService` (216 lines): the gap-fill pass, structuring through the `cv-import` AI skill,
    the date block-before-generate, and the draft row it all lands in. `jobs.component.ts`
    **1812 -> 1693**. `createCvDraft` went from ~160 lines to 34.
  - The four hand-offs the cover-letter flow shares - `ensureApplicationDraft`, `analyzeCvGaps`,
    `awaitGapDialog`, `appendToProfile` - stay on the page and arrive through the context, so the
    dependency points one way and the pipeline can be driven in tests with fakes.
  - Two pure functions came out with it, and they are the parts worth testing alone:
    `dateGapQuestions` (asks only about undated entries, encodes list + index in the id) and
    `applyDateAnswers` (routes each answer back by that id).
  - 14 tests where this had none, including the invariant a careless extraction would have broken:
    the input hash is computed over the **tailored** markdown, not the gap-augmented text, so
    answering the dialog does not make an otherwise identical run look like a different input.
- **Not completed:** the rest of the region - cover-letter generation and the link/commit lifecycle.
  They are separate responsibilities and want their own services.
- **Files or packages changed:** `apps/desktop/src/app/shared/cv-draft.service.ts` (new, 216),
  `cv-draft.service.spec.ts` (new, 211), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1812 -> **1693**, still over budget, shrank). `jobs.component.html` untouched.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **886 tests** (872 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint: 8 warnings, all pre-existing non-null
  assertions in other specs. **Not run:** cargo - no Rust touched. **Not verified natively:** CV
  generation needs an AI provider and SQLite over Tauri IPC. The behaviour is pinned by tests
  against fakes, which is not the same as a real run.
- **Privacy/security impact:** none new. The service handles CV text and profile answers, which were
  already flowing through the same code on the page; nothing new leaves the machine, and the AI call
  is the same `cv-import` skill with the same inputs.
- **Decisions and assumptions:**
  - The service returns `null` rather than throwing when a run is already in flight, so the caller's
    double-tap guard and the error path stay distinct.
  - Preconditions (no job, no tailoring, no settings) stay on the page, because their failure is a
    localized status string rather than an exception.
  - Two behaviours were pinned as they are, not as they might ideally be. A date the parser cannot
    read is written verbatim - the alternative is guessing an employment date. A failed profile
    write is swallowed - the answers are already folded into the text being structured. Both
    predate this change.
- **Risks or compatibility impact:** this is the highest-traffic AI path in the app and it has no
  native verification. The order of operations was preserved exactly: ensure application, gap-fill,
  hash, structure, dates, persist. A first tailor and every retailor still reuse
  `app.cvDocumentId`, which is what stops duplicate "<Company> - Tailored CV" rows (ADR-0003), and
  that is now a test rather than a comment.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. A background task
  was filed for the free-text date answers described above. `discover.rs` (3245), `tailoring.rs`,
  `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and `cv-preview.component.spec.ts`
  (2263) remain over budget and frozen.
- **Next first action:** extract cover-letter generation from `jobs.component.ts` into a
  `CoverLetterDraftService`, mirroring `CvDraftService` - `createCoverLetterDraft` is the entry
  point and it shares `analyzeCvGaps`, `awaitGapDialog`, `appendToProfile` and `jobDocLabel` with
  the CV path, so pass them in the same way rather than duplicating them. Once both drafts are out,
  the link/commit lifecycle is what remains of the region.
- **Evidence:** file-size report printed `jobs.component.ts: 1693/400 non-empty lines, base 1812`.
  Suite went 872 -> 886 with the new spec.

### 2026-08-01, wizard navigation becomes the seventh seam

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/wizard-nav-service`, from `main` (`27cc863`)
- **Objective:** the next first action from the watch below - extract wizard navigation out of
  `jobs.component.ts`.
- **Completed:**
  - `WizardNavService` (133 lines) owns open/closed, the step index, the saved progress that
    survives leaving the page, the cross-job confirm and its label, and `scrollToTop`.
    `jobs.component.ts` **1881 -> 1812**.
  - What did **not** move: the work each step triggers - the auto-rescore on the Updated score
    step, the document preparation on the documents step, the score commit on continuing past it.
    Those stay the page's, which is exactly what lets the service be tested without an AI call or a
    database.
  - 16 tests, where none of this had any. They pin the behaviours that took bug reports to
    establish: the cross-job confirm leaves the other session **intact** until answered, `close`
    ends the session while `forget` drops it without closing, an editor return outranks saved
    progress, and a restore is skipped for another job's session or an already-open wizard.
  - `jobs.component.html` is byte-identical to `main` - `git diff --name-only` does not list it.
    Seventh consecutive seam where that holds, by the same writable-signal alias pattern.
- **Not completed:** nothing in scope. The three remaining seams are unchanged: document drafts
  (591 lines, three responsibilities), job CRUD (119), the compensation/archetype derivations.
- **Files or packages changed:** `apps/desktop/src/app/shared/wizard-nav.service.ts` (new, 133),
  `wizard-nav.service.spec.ts` (new, 148), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1881 -> **1812**, still over budget, shrank), `CHANGELOG.md`, this file.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **872 tests** (856 before); `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. Lint reports 8 warnings, all pre-existing
  non-null assertions in `cv-content.util.spec.ts` and `cv-gap-dialog.component.spec.ts`, none in
  the changed files. **Not run:** cargo - no Rust touched. **Not verified natively:** the wizard is
  Tauri-only, so the browser cannot exercise it; the byte-identical template is the structural
  argument that rendering is unchanged, not a substitute for the gate.
- **Privacy/security impact:** none. Navigation state; the saved progress already lived in
  `sessionStorage` via `WizardProgressService` and still does.
- **Decisions and assumptions:**
  - The service takes `jobId` as a parameter rather than injecting the page's `job` signal. It keeps
    the dependency pointing one way and is why the spec needs no component.
  - `close` and `forget` are separate methods for what used to be one call to
    `wizardProgress.clear`. They differ in whether the wizard also closes, and three call sites
    wanted only the forgetting.
  - `decideWizardView` keeps reading the route in the component and passes a boolean, so the
    service does not depend on `ActivatedRoute`.
- **Risks or compatibility impact:** the cross-job confirm and the resume-mid-flow path are the two
  behaviours here that a unit test can assert but only the app can prove. Both are covered above,
  and both are worth a look during the next native pass.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. `discover.rs`
  (3245), `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and
  `cv-preview.component.spec.ts` (2263) remain over budget and frozen.
- **Next first action:** split the 591-line document-drafts region in `jobs.component.ts`, starting
  with CV generation alone - `createCvDraft` and the gap-dialog call it wraps - into a
  `CvDraftService`. Do not move the region wholesale: cover-letter generation and the link/commit
  lifecycle are separate responsibilities sharing the same lines and need their own services.
- **Evidence:** file-size report printed `jobs.component.ts: 1812/400 non-empty lines, base 1881`.
  `git diff --stat` for the extraction commit: one file, 23 insertions, 94 deletions, and the
  template absent from `git diff --name-only`.

### 2026-08-01, both PRs merged, and the bullet editor's doubled frame

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/bullet-editor-double-frame`, from `main` (`fa698cf`)
- **Objective:** merge #233 and #234 on the maintainer's instruction, then fix the doubled edit
  frame they reported with a screenshot.
- **Completed:**
  - **#233 merged** (`1f192eb`), then **#234 rebased onto it and merged** (`fa698cf`). The rebase
    conflicted in `CHANGELOG.md` and `DUTY_WATCH.md`, as the trap note predicts; resolved by keeping
    both entries and moving `(latest)` to the newer one. No code file conflicted.
  - **Second pass on the same report, and it was bigger than the bullet.** The maintainer came back
    with a black ring and an indigo one on the bullet, and "too thick" lines on the ordinary fields.
    Three rings were being drawn: the selection `box-shadow`, the editor's own 2px `outline` at a 2px
    offset, and the app-wide `:focus-visible` box-shadow from `libs/ui/src/styles/global.scss`. On a
    selected leaf the first two stacked into one 6px frame - that is the "too thick", and it was on
    every field. The third normally loses to the selection ring on the same element, but on a bullet
    the ring is on the `<ul>`, so nothing outranked it and it showed as the indigo inner line. A
    mounted editor is by definition inside the current selection, so it now paints no ring at all:
    `outline: none`, plus `box-shadow: none` behind a `:not(.cvpreview__element-selected)` guard -
    without that guard the reset would have killed the selection ring on the editors that are
    themselves the selected element, since it is the same property on the same class list and the
    later rule wins. Every field in edit mode is now one 2px `--cv-accent` ring with its chip.
  - Editing a CV bullet drew two frames. The selection highlight is one ring per selected element,
    and a bullet is the only leaf whose editor is **not** the selected element - the chip and ring
    belong to the `<ul>`, the textarea is an `<li>` inside it - so `cvpreview__element-selected` and
    the editor's own `outline` were painted on two boxes separated by the list indent. Every other
    field escaped it because there the editor _is_ the selected element, making the two rings
    concentric. The textarea now paints neither.
- **Not completed:** the four native gates (#225, #230, #233, #234) plus this one. Agent-blocked.
- **Files or packages changed:** `cv-preview.component.html` (896 -> **895**, over budget, shrank),
  `cv-preview.component.scss` (379 -> **385**, under the 400 budget), new
  `cv-preview.bullet-editor.spec.ts` (77). The existing `cv-preview.component.spec.ts` is 2263 lines
  against a 600 budget and may not grow, so the regression test went into a focused new file, which
  is what the contract asks for anyway.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green;
  desktop suite **52 suites / 856 tests**; `npm run quality`, `npm run verify:csp`,
  `npm run format:check`, `git diff --check` all passed. **Not run:** cargo - no Rust touched.
  **Not verified:** the rendered frame. The CV detail page needs a document out of SQLite over Tauri
  IPC, so a browser build cannot reach it; the assertion is on the DOM classes, not on pixels. The
  second pass is **CSS only and therefore has no unit test** - the three tests still pin the DOM
  contract, and the cascade was checked against the emitted bundle rather than reasoned about:
  `dist/apps/desktop/browser` contains `.cvpreview__leaf-editor[_ngcontent]{...outline:none}`, the
  `:not(.cvpreview__element-selected){box-shadow:none}` guard, and the untouched
  `.cvpreview__element-selected` ring. Whether it looks right is the maintainer's gate.
- **Privacy/security impact:** none.
- **Decisions and assumptions:** the ring stays on the `<ul>` rather than moving to the textarea,
  because the chip is anchored to the list and the list is what the selection model actually points
  at. Removing the textarea's `outline` does not cost a focus indicator: the list ring is painted
  exactly while the editor is mounted, and blurring the editor commits and unmounts it.
- **Risks or compatibility impact:** the design hook reports a pre-existing `broken-image` finding at
  `cv-preview.component.html:46` - the optional CV photo, whose `src` is legitimately null when no
  photo is included. Untouched and not introduced here.
- **Open issues or blockers:** #233's duplicate rows remain deferred by decision. `discover.rs`
  (3245), `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002), its spec (689) and
  `cv-preview.component.spec.ts` (2263) remain over budget and frozen.
- **Next first action:** extract wizard navigation (129 non-empty lines) from `jobs.component.ts`
  into a `WizardNavService` on a fresh branch off `main`, aliasing writable signals so
  `jobs.component.html` stays byte-identical.
- **Evidence:** the three tests were run against the old markup first and two failed on the exact
  defect - the bullet subtree held **2** elements carrying `cvpreview__element-selected` where the
  company leaf held 1 - then passed after the fix, suite 856 / 856.

### 2026-08-01, the CV card that said "Generating" while it was waiting for you

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/cv-card-awaiting-input`, branched from `origin/main` (`f91d50c`), PR **#234**
- **Commits:** `ce09393` (fix), plus a docs commit
- **Objective:** give the CV card a distinct state while the gap dialog blocks it, and resolve the
  two decisions the previous watch left open.
- **Completed:**
  - A preparing card reports `needs_input` while `CvGapDialogService.open` is true, CV only. The
    dialog is awaited inside `createCvDraft`, which runs inside `docGen.begin(job.id, 'cv')` with
    `end()` in the `finally`, so the card really is preparing the whole time - it was reading the
    right flag for the wrong question.
  - `documentCardStatus` and `documentStatusKey` extracted to a pure
    `apps/desktop/src/app/shared/doc-card-status.ts` over an explicit five-field state. That is the
    test seam; the states could not be asserted while the derivation was a private method on a
    1882-line component. Nine tests, where the badge derivation had none.
  - **Second, unplanned fix:** the file-size checker excluded only `translations/translations.ts`
    (10 lines), not the six locale files (~1650 lines each) that hold the strings, so the ratchet
    rejected any new i18n key anywhere in the repository. `CODE_QUALITY.md` already documents the
    catalogue as excluded, so the checker was under-implementing the approved contract. Widened to
    the catalogue directory minus its spec. Without this the fix could not add its label.
- **Not completed:** the three outstanding native gates (#225 export, #230 gap dialog, #233 Discover)
  and the new #234 gate. All are maintainer-only - screen-control permission is denied to agents.
  PR #233 not merged: merging is not an agent action without an explicit request.
- **Files or packages changed:** `apps/desktop/src/app/shared/doc-card-status.ts` (new, 38),
  `doc-card-status.spec.ts` (new, 52), `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (1882 -> **1881**, over budget, shrank), `jobs.component.scss` (987 -> **985**, over budget,
  shrank), `tools/check-file-size-budgets.mjs`, six locale files, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`.
- **Validation:** run and observed - `nx run-many --target=lint,type-check,test,build --all` green
  (6 projects); desktop suite **51 suites / 853 tests**, up from 50 / 845; `npm run quality` (three
  checks) passed; `npm run verify:csp` passed; `npm run format:check` passed after
  `nx format:write --uncommitted`; `git diff --check` clean. **Not run:** `cargo test` and
  `cargo clippy` - no Rust file was touched. **Not verified:** the badge itself. Reaching
  `needs_input` requires generating a CV, which requires Tauri IPC, so a browser build cannot show
  it; no browser session was started, because it would have proved nothing about this change.
- **Privacy/security impact:** none. UI status derivation and a build-tool exclusion.
- **Decisions and assumptions:**
  - The maintainer deferred both open decisions to the agent's recommendation.
  - **#233 duplicate rows: merge and defer the dedupe.** The duplicate is a one-time migration
    artifact per already-stored posting, not a recurring leak - once the clean row exists, later
    rescans hash the same clean text and `INSERT OR IGNORE` holds. Option (b), the `source_url`
    dedupe, is the right permanent fix but is gated behind splitting `discover.rs` (3245/800).
    Option (a), the data repair, orphans `scoring_cache` rows for no user-visible gain and has no
    precedent - migrations are SQL only. Neither was built.
  - **The i18n gate: align the tool to the doc**, rather than allowlist six files by name or reuse an
    unrelated string in the badge.
  - `needs_input` is CV-only. `CvGapDialogService` belongs to the CV flow; the cover-letter card
    passes `awaitingInput: false` explicitly rather than reading a signal that cannot apply to it.
  - `finalCheckStatusKey` became a bound field rather than a delegating method, to pay for the two
    lines the fix needed. Safe because `statusKey` does not use `this`, and it is bound explicitly
    rather than passed unbound.
- **Risks or compatibility impact:** the new status string reaches all six locales; the German,
  Spanish, French, Russian and Ukrainian labels are machine-written and worth a native reading. The
  checker change widens what the gate ignores - locale files can now grow without limit, which is the
  intended trade and is what the contract says.
- **Open issues or blockers:** #233 awaits an explicit merge instruction. `discover.rs` (3245),
  `tailoring.rs`, `documents.rs`, `onboarding.component.ts` (1002) and its spec (689) remain over
  budget and frozen.
- **Next first action:** extract wizard navigation (129 non-empty lines - `wizardStep`, step guards,
  `goToStep`) from `jobs.component.ts` into a `WizardNavService`, branched fresh from `main`, using
  the writable-signal alias pattern so `jobs.component.html` stays byte-identical. Do **not** move
  the 591-line document-drafts region wholesale: it is three responsibilities (CV generation,
  cover-letter generation, link/commit lifecycle) and needs splitting, not relocating.
- **Evidence:** the two `needs_input` tests were run against the old logic first and failed
  (2 failed / 851 passed), then the fix was restored and the suite went 853 / 853. The file-size
  report printed both shrinking files with their base counts: `jobs.component.ts` base 1882 -> 1881,
  `jobs.component.scss` base 987 -> 985, and no longer lists any locale file.

### 2026-07-31, a job description that rendered as its own source

- **Status:** fixed and open as #233; one consequence deliberately left for a separate change
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/discover-escaped-html` (from `main`), PR #233

**The report.** An ArbeitNow posting opened from Discover showed `<p>`, `<li>`, `&amp;` and `&nbsp;`
as visible text instead of prose.

**Root cause, and it is an ordering bug.** `strip_html` (`job_url.rs`) removed tags first and decoded
entities afterwards. For a feed that ships its markup entity-escaped that order does the worst
available thing: the strip pass finds no real tags to remove, and the decode pass then converts every
`&lt;p&gt;` **into** a literal `<p>` - after the only code that would have stripped it has already
run. ArbeitNow escapes the entities inside its markup as well, which is what the screenshot proves:
`&amp;nbsp;` had exactly one layer peeled off and rendered as literal `&nbsp;`. Nothing was wrong
with the ArbeitNow parser itself; it already called `html_to_text`.

**Fix.** Strip and decode alternate until a round reveals no further markup, capped by
`MAX_UNESCAPE_ROUNDS` so a crafted `&amp;amp;lt;` chain cannot buy a round per layer. Within a round
the ampersand is decoded **last**, so one escaping layer comes off per round rather than several
collapsing at once and inventing markup the source never wrote. `html_to_text`'s `contains('<')`
heuristic is deleted - it chose between two half-treatments when the answer was to do both. This is
shared by every source, so Greenhouse and the RSS paths get it too.

**A second, older defect fell out of the same function.** Every `<` opened a tag, so "latency < 100 ms
in prod" had no closing `>` and the rest of the line was swallowed - silently, into the text that is
then fed to scoring and tailoring. A `<` now opens a tag only when a name, `/` or `!` follows it.
Found because an assertion I wrote about existing behaviour turned out to be false, which is the
argument for asserting the boundary rather than assuming it.

**Known consequence, stated rather than hidden.** The fix corrects **newly scanned** jobs only. Rows
already stored keep their mangled text, and `jobs.jd_hash` is the dedupe key for
`INSERT OR IGNORE`, so re-scanning a previously stored posting now computes a different hash and
inserts a **second row** for the same job. Two ways out, neither taken here:

1. a data repair that re-runs `strip_html` over stored `discover_scan` rows and recomputes `jd_hash`
   - which also orphans any `scoring_cache` row keyed on the old `jd_hash`, forcing a rescore;
2. an additional dedupe on `source_url` in `insert_scanned_job`.

Option 2 cannot land here: `discover.rs` is **3245 lines against an 800 budget**, so the ratchet
forbids it growing, and there is no data-repair precedent in this repository - migrations are SQL
only and cannot call `strip_html` or `stable_hash`. This is a maintainer decision, not an agent's.

**Checks actually run and observed:**

- `cargo test` - **293 passed**, 1 ignored, 0 failed. `cargo clippy --all-targets -D warnings` -
  clean. `cargo fmt` applied.
- The 7 new tests were **run against the old implementation first**: 4 failed, including both
  ArbeitNow cases and the bare-`<` case. They catch the bug rather than merely pass.
- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**.
- `npm run quality` - budgets **passed**: `discover.rs` 3251 -> **3245** (shrank), `job_url.rs` 637 ->
  **754**, under its 800 budget. Attribution passed.
- `npm run verify:csp`, `npm run format:check`, `git diff --check` - clean.
- No browser or native verification: Discover needs Tauri IPC and a live feed. Not claimed.

**Next first action:** decide between the data repair and the `source_url` dedupe above, since
merging #233 without one means duplicate rows on the next scan. The "needs your input" card state
from the previous watch is still open, as are the two native gates.

### 2026-07-31, two reported bugs, one real and one misattributed

- **Status:** one fixed and open as #232; the other diagnosed, not fixed, and deliberately not stacked
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/pipeline-quickview-job-id` (from `main`), PR #232
- **Note:** this watch ran alongside PR #231 (scoring extraction), which has its own entry below.
  Both appended here, and #231 merged first, so this branch was rebased onto it and the overlap in
  `CHANGELOG.md` and `DUTY_WATCH.md` resolved by keeping both entries. No code file conflicted.

**Bug A - Pipeline quick view opened the wrong job. Fixed.** "Open full details" navigated to
`/jobs/<card().id>`. A `PipelineCard` is an application row: `db_pipeline_cards` selects `a.id` and
`a.job_id` as separate columns, and `/jobs/:id` is keyed by job. The handler passed the application
id, so the route loaded whichever unrelated job shared that number - and offered "Mark as Applied"
for a job never applied to. Not an edge case: the two id spaces collide whenever both tables have a
row there. `/interview-prep/:id` really is keyed by application, so the sibling link was correct and
is left alone; a test pins both, which is what stops a future "fix" from breaking the good one.

The regression test was **verified against the old code before the fix was restored** - it failed 2
of 3 assertions, so it is known to catch the bug rather than merely to pass.

**The ratchet refused the fix in place** - `quick-view-modal.component.ts` was already over budget at
409 lines and the change took it to 419. Follow-up drafting came out into `FollowupDraftService`
(component-scoped, aliased onto writable signals, template untouched); the modal is now **306** lines
against a 167-line service. Second time the size gate has forced an extraction that was overdue, and
second time it produced the test seam that logic had never had.

**The extraction surfaced an older bug, fixed here.** `draft()` set its `drafting` flag _after_
`await getSettings()`, so its double-click guard never worked - a second click during that read
started a second billed AI call that also wrote the cache. Fixed rather than logged, because the
alternative was committing a test asserting broken behaviour.

**The privacy guard was moved with the code.** `followup-no-transmit.spec.ts` statically scans the
follow-up sources for send/transmit APIs; the `mailto:` hand-off moved into the service, so the guard
now scans the service too. A guard that keeps pointing at the old filename is worse than no guard.

**Bug B - "a second CV dialog appears when I click Generate on the cover letter". Diagnosed, not a
race, not fixed here.** The discriminating fact came from the maintainer, not from the code: the
second dialog asks about **dates**. That identifies it as the CV flow's own block-before-generate
step (`jobs.component.ts:794-813`), which necessarily runs _after_ the AI call because the questions
are built from whichever entries the model returned undated. The cover-letter button is not
implicated - `!linkedCv() && !preparingCv()` closes that path while a CV is linked or preparing, so
#230's guard is holding. Correlation in time, not causation.

The real defect is narrower and different from the report: **the card claims "Generating" while the
flow is actually blocked on user input.** `docGen.begin(job.id, 'cv')` opens `createCvDraft` and
`end` sits in its `finally`, with the date-dialog await inside - so nothing on screen indicates the
CV is waiting, which is exactly why the dialog reads as having been triggered by the unrelated click.
The fix is to give the card a distinct "needs your input" state while `gapSvc.open()` is true;
`CvGapDialogService` already exposes `open`, so only `documentCardStatus` needs to consider it.

**Not attempted in this watch on purpose.** It edits `jobs.component.ts`, which is over budget (so
the ratchet forbids growth) and is the file open PR #231 rewrites. Stacking on it would recreate the
orphaning that has already cost this project two recovery sessions.

**Checks actually run and observed** (on `fix/pipeline-quickview-job-id`):

- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**. 825
  tests, up from 812 (+13).
- `npm run quality` - file-size budgets **passed** (409 -> 306), attribution passed.
- `npm run verify:csp` - OK. `npm run format:check` - passed. `git diff --check` - clean.
- No browser verification: the quick view needs Tauri IPC for its card data, so a browser build
  cannot exercise it. Not claimed as verified.

**Next first action:** merge #232, then branch from `main` for the "needs your input" card state.
(#231 merged as `22e5bdd` while this watch was running.) The two native gates (#225 export, PDF only;
#230 gap dialog) are still outstanding and still the maintainer's.

### 2026-07-31, the stack was landed in order, and scoring became the sixth seam

- **Status:** complete, two native gates outstanding and both belong to the maintainer
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-scoring-service` (from `main`), PR #231

**What happened, in order.**

1. **#229 was already merged** when the watch opened (squash `da0766e`); nothing to do.
2. **#230 was rebased past that squash.** Its base was already retargeted to `main` but it read
   `CONFLICTING`, because the squash orphaned the branch above it - the same failure mode that put
   #224 into #223's branch a day earlier. `git rebase --onto origin/main a9bccfb` replayed the two
   commits cleanly. The evidence that the rebase preserved the tree exactly is not an eyeball: the
   full `nx run-many` gate came back **21/21 cache hit**, which only happens when the inputs hash
   identically to the pre-rebase run. `jobs.component.html` diffed to **0 lines** against `main`.
   Merged as `546a6f8` once CI went green and `mergeStateStatus` read `CLEAN`.
3. **Scoring extracted** into `JobScoringService`, the sixth Tier 1 seam. See below.

**The scoring extraction.** Baseline scoring, the post-tailor rescore, the deterministic ATS check
and the commit-time write to `scoring_cache` moved out. `jobs.component.ts`: **2099 -> 1882
non-empty lines**; `job-scoring.service.ts` is 306 lines, under the 400 budget. The file-size gate
confirmed the ratchet at commit time: `1882/400 non-empty lines, base 2099`.

Three things are worth recording because they are not pure relocation:

- **The duplicated JSON unwrap is gone.** `scoreJob` and `updateScoreAfterTailor` each carried their
  own verbatim copy of the ` ```json ` fence strip plus `JSON.parse` plus the rethrow with a
  200-character excerpt. That is now one exported pure `parseScoreResponse`, and it is the only part
  of scoring testable without an AI call. Four of the 20 new tests cover it directly.
- **One behaviour changed, deliberately and in the safe direction.** `score()` now guards on
  `job.id` rather than asserting `j.id!`. Previously an id-less job would have written a
  `scoring_cache` row keyed on `undefined`; it is now a no-op. This removed three non-null
  assertions - desktop lint warnings went 19 -> 8.
- **`AtsService` is no longer injected by the component.** The ATS check was the only thing using it.

The alias pattern held for the sixth time: the component exposes `cache`, `fromCache`, `scoreStale`,
`scoring`, `scoreStatus`, `scoreError`, `atsReport` and `postTailorSaved` as aliases onto the
service's **writable** signals, so `jobs.component.html` is byte-identical to `main` again.
`JobScoringService` is component-scoped via `providers`. It injects `FinalChecksService`, which is
also component-scoped in the same array - that resolves, and it is what keeps `finalChecks.reset()`
firing at the start of a rescore exactly as before.

**Checks actually run and observed.**

- `nx run-many --target=lint,type-check,test,build --all` - **Successfully ran for 6 projects**.
  829 tests across 48 suites, up from 809 (+20).
- `npm run quality` - file-size budgets passed (with the ratchet line above), attribution passed,
  quality:test 3/3.
- `npm run verify:csp` - OK, 1 stylesheet link, no handler-dependent styling.
- `npm run format:check` - passed after `nx format:write --uncommitted`. Note: that command does
  **not** touch untracked files, so the new service had to be `git add`-ed before it would format.
- `git diff --check` - clean.
- Browser: the `nx serve` on :4200 (held by a running `tauri dev`) hot-rebuilt with the change and
  boots with **zero console errors**. That is the honest limit of browser verification here - the
  scoring path needs Tauri IPC and an AI provider, so it cannot be exercised in a browser build.

**Two native gates remain outstanding. Neither was run.** Screen-control permission is denied to
agents, so these are the maintainer's and must be recorded as theirs:

1. **#225 export.** `npm run desktop:dev`, export a CV from the wizard's final step. **Correction to
   the previous handoff: this is a PDF-only gate.** The wizard's final step exposes `cv-pdf` and
   `cover_letter-pdf` and has no DOCX control; DOCX export exists but is reachable only from the
   Documents list pages, so it is not part of this gate. The maintainer confirmed the same.
2. **#230 gap dialog.** On step 4, start the CV and click Generate on the cover letter while it
   runs. Expect one dialog and both documents finishing.

**Next first action:** merge #231 once CI is green, then extract wizard navigation (129 lines) as
seam seven. Do **not** move document drafts (591 lines) wholesale - it is CV generation,
cover-letter generation and the link/commit lifecycle sharing one region, and it needs splitting
into more than one service rather than relocating.

### 2026-07-31, two documents raced for one dialog, and the size budget refused the easy fix

- **Status:** complete, pending the maintainer's native check
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/gap-dialog-single-owner` (stacked on `refactor/jobs-tailoring-service`)
- **Commits:** `9a5e923`, plus this entry
- **Pull request:** #230, stacked on #229
- **Objective:** a user report with a screenshot from step 4 of the wizard. Starting a cover letter
  while a CV was still generating raised a second gap dialog for the same questions, and afterwards
  the cover letter sat on "Generating" indefinitely.

- **Completed:** Two defects in one flow, both predating this session's refactoring -
  `awaitGapDialog` was untouched by all four extraction pull requests.

  **The hang.** Both document flows awaited a single `gapResolver` field. A second caller overwrote
  it, so the first caller's promise never settled: its `await` never returned, its `finally` never
  ran, and `docGen.end(...)` for the document it was generating was never called. That is precisely
  the stuck "Generating" badge in the screenshot. Ownership is now an explicit rule rather than
  whoever wrote to the field last - first caller wins, a second is answered `null` immediately.
  `null` is what a cancel already yields and every caller treats gap-fill as optional, so the losing
  flow continues without it rather than blocking.

  **The duplicate dialog.** The cover-letter flow skips gap analysis when a CV is _linked_, on the
  stated grounds that the CV flow just ran the same analysis. A CV that is still generating has not
  linked itself yet, so the guard let a cover letter started alongside one run a second analysis and
  raise a second dialog. It now also skips while a CV is preparing, which is the condition the
  comment always described.

  **The fix shipped as an extraction, because the ratchet refused the in-place version.** The first
  attempt added 15 lines to `jobs.component.ts` and `npm run quality:file-size` rejected it:
  `already over budget and grew from 2121 to 2136 lines. Extract before adding code.` That was the
  right call and worth recording as the gate earning its place - the in-place fix would have left
  this invariant with no home and no test seam. `CvGapDialogService` now owns the analysis, the
  dialog state and the single resolver, and it has 14 tests, two of which reproduce the collision
  directly. The file ends at 2099 lines, below its base.

  `dispose()` also replaces the hand-rolled resolver cleanup in `ngOnDestroy`, so the same release
  path covers leaving the page and any future caller.

- **Not completed:** The maintainer's native re-check of the reported scenario. See below.

- **Files or packages changed:** new `apps/desktop/src/app/shared/cv-gap-dialog.service.ts` (118
  lines) and its spec (154); `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2121 -> 2099
  non-empty); `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is
  unchanged.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 809 desktop tests
    (up from 795).
  - `npm run quality` - passed. The budget report reads `2099/400, base 2121`.
  - `npm run verify:csp`, `npm run format:check`, `git diff --check` - passed.
  - **Not run: the native check of the reported scenario.** This is a concurrency bug in a flow that
    needs a real job, a real profile and two AI calls in flight at once. The unit tests prove the
    resolver can no longer be stranded; they do not prove the wizard behaves correctly end to end.
    Screen-control permission is denied to this agent, so the maintainer has to run it.

- **Privacy/security impact:** None. No change to what is sent, stored or logged. One fewer AI call
  in the overlapping case, since the duplicate gap analysis no longer runs.

- **Decisions and assumptions:** Answering the second caller `null` was chosen over queueing it.
  Queueing would show the user a second dialog immediately after the first, for questions that the
  first flow's answers may already have covered - which is the behaviour the guard exists to
  prevent. Every caller already handles `null`.

- **Risks or compatibility impact:** The losing flow now silently skips gap-fill instead of hanging.
  That is the intended trade: a document generated without the optional extra questions, rather than
  one that never finishes.

- **Open issues or blockers:** `gapAnalyzing` is still a single shared signal, so two overlapping
  analyses would clear each other's spinner early. With the new guard the CV/cover-letter pair can no
  longer overlap, so it is unreachable today. Left alone rather than fixed speculatively; noted here
  so it is not rediscovered as new.

- **Next first action:** In the running `tauri dev` window, reproduce the report: on step 4, start
  the CV, and while it is generating click Generate on the cover letter. Confirm only one gap dialog
  appears, and that after answering or cancelling it **both** documents reach a finished state with
  neither stuck on "Generating".

- **Evidence:** `npm run quality:file-size` rejected the in-place fix with
  `already over budget and grew from 2121 to 2136 lines`, and passes on the extraction with
  `2099/400, base 2121`.

### 2026-07-31, the tailoring pipeline leaves the jobs page, under a file-size budget that now enforces it

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-tailoring-service`
- **Commits:** `72fc311`, plus this entry
- **Pull request:** #229
- **Objective:** continue the Tier 1 split of `jobs.component.ts` with the next seam.

- **Completed:** Seam four of roughly ten. The three most isolated ones were done in the previous
  watch; from here the choice is by cohesion, so the remaining seams were measured first rather
  than guessed at: document drafts 591 lines, scoring 279, **tailoring 243**, wizard navigation 129,
  job CRUD 119, gap dialog 56.

  Tailoring was taken over the larger document-drafts block on purpose. Document drafts is not one
  responsibility - it is CV generation, cover-letter generation and the link/commit lifecycle
  sharing a region of the file. Moving it wholesale would produce a service that is oversized on
  arrival and still needs splitting. Tailoring is genuinely one thing.

  `TailoringService` owns the results, status, error and cancelled signals, the
  `isTailored`/`allChanges`/`allGaps` derivations, the pass loop, the parsing and the cache restore.
  `PassResult` moved with it. Whether a run is in flight deliberately stayed in
  `WizardActivityService`: it is already keyed by job so that an AI call in flight survives this page
  component being destroyed, and duplicating that into the new service would have created a second
  answer to the same question.

  The component keeps what tailoring _invalidates but does not own_ - the export status line, the
  post-tailor rescore, the final checks. Those resets stay in `startTailoring`, ahead of the call.

  **Two invariants were made explicit rather than changed.** Each pass's cache key covers the results
  of the passes before it, so pass 3 cannot be served stale after pass 1 changes; and
  `restoreFromCache` recomputes that same chain, which is why it stops at the first miss instead of
  skipping ahead. Both were true in the original code, neither was stated or tested. They are now
  both.

- **Not completed:** Six responsibilities remain in the file. Document drafts is the largest and
  should be split into more than one service rather than moved.

- **Files or packages changed:** new `apps/desktop/src/app/shared/tailoring.service.ts` (298 lines)
  and its spec (272); `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2299 -> 2121 non-empty);
  `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file. `jobs.component.html` is unchanged.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 795 desktop tests
    (up from 773). The 11 lint warnings are pre-existing `no-non-null-assertion`.
  - `npm run quality` - passed, all three guards. The new file-size hook reported
    `jobs.component.ts: 2121/400, base 2299`, which is the ratchet working: still far over budget,
    but smaller than its base, which is what the rule requires of a refactor.
  - `npm run verify:csp`, `npm run format:check`, `git diff --check` - all passed.
  - Browser: the `nx serve` preview could not start, because the `tauri dev` process left running
    from the previous watch holds the `desktop:serve` lock. Its own frontend on port 4200 had
    hot-reloaded the change, so that was used instead - `/jobs/1` renders, `app-jobs` instantiates
    with all four services, no `NullInjectorError`, `NG0201`, `NG0203`, `NG0600` or `NG0950`.

- **Privacy/security impact:** None. Same AI calls with the same inputs to the same provider, same
  SQLite cache rows with the same keys. No new egress and no new persistence.

- **Decisions and assumptions:** `#228` landed on `main` mid-watch and introduced
  `docs/governance/CODE_QUALITY.md`, a 400-line TypeScript budget and a ratchet rule. The work was
  already following that shape, and the four extracted services are 231/168/109/298 lines, all
  inside budget. Worth recording honestly: **the onboarding fix in #226 grew two already-oversized
  files** - `onboarding.component.ts` 863 -> 1002 and its spec 589 -> 689. #226 merged minutes before
  #228, so it broke no rule that existed at the time, but under the ratchet both are now standing
  debt and neither may grow again.

- **Risks or compatibility impact:** None known. The template is unchanged, so the visual surface
  cannot have moved; the risk is confined to the pass loop, which is now covered by 22 tests.

- **Open issues or blockers:** None. The two accepted dependency advisories are untouched.

- **Next first action:** Merge #229. Then run the still-outstanding native gate from two watches
  ago, which no amount of frontend work substitutes for: `npm run desktop:dev`, export a CV to PDF
  and to DOCX from the apply wizard's final step, and confirm the file is written, the status line
  reads the saved path, and the document leaves draft state into the Documents library.

- **Evidence:** `npm run quality:file-size` prints
  `apps/desktop/src/app/pages/jobs/jobs.component.ts: 2121/400 non-empty lines, base 2299`.
  `git diff main --stat -- apps/desktop/src/app/pages/jobs/jobs.component.html` is empty.

### 2026-07-31, onboarding could not pick a model, so it sent an empty one

- **Status:** complete, merged and verified
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/onboarding-model-selection`
- **Commits:** `f315adc`, `93a1942`, squashed to `8d1f3fb` on `main`
- **Pull request:** #226 (merged)
- **Objective:** a user report with two screenshots - choosing DeepSeek on the onboarding AI step,
  saving the key successfully, and then getting `Couldn't parse that resume` with
  `DeepSeek API error (400): The supported API model names are deepseek-v4-pro or
deepseek-v4-flash, but you passed .` underneath it.

- **Completed:** The visible symptom was a resume that would not parse. The cause was that nothing
  in the wizard ever chose a model.

  The AI-setup step persisted `aiMode` and `provider`, and `aiDispatch` read the model back out of
  the settings row. So the wizard sent whatever was stored there - `claude-haiku-4-5` on a fresh
  install, which DeepSeek rejects, or the empty string a previous CLI-mode run deliberately leaves
  behind, which is the reported error. Note that `markSeen` blanks the model ids in CLI mode on
  purpose and migration `0002` only `COALESCE`s a NULL, so once blanked the pair stays blank.

  **This exact class of bug had already been fixed once, for the provider.** The comment on
  `aiDispatch` explains at length why reading `provider` back from settings was wrong - the wizard's
  own state is the truth for the duration of the wizard - and then the very next line read the model
  back from settings anyway.

  Settings already had everything needed to prevent it: a model catalogue, per-provider defaults,
  and `apiModelsToRestore`, which repairs a blank or foreign model id. All of it was private to that
  screen, so the second screen writing the same two fields could not use it and was free to
  disagree. The catalogue, the defaults and the reconciler moved to `@applye/core` as `api-models`,
  with a new `resolveApiModels` that always returns both fields filled; Settings now reads from
  there instead of its own copies, and onboarding gained quality and economy selects seeded from
  stored settings and reconciled on every provider or mode change. Both `persistAiChoice` and
  `markSeen` now write the pair alongside the provider.

  One further defect found while wiring the seed: the settings read is async and the AI step is
  interactive from the first frame, so a user clicking a provider before the read resolved had their
  choice silently overwritten. Guarded with a touched flag.

- **Not completed:** The `openai` and `gemini` providers still have no API-mode catalogue, which is
  correct - `ai/api.rs` cannot dispatch to them - but it means `resolveApiModels` returns null for
  them and the selects do not render. That is the existing v1 boundary, not a regression.

- **Files or packages changed:** new `libs/core/src/lib/ai/api-models.ts` + spec, exported from the
  `core` barrel; `apps/desktop/src/app/core/onboarding/onboarding.component.{ts,html,scss,spec.ts}`;
  `apps/desktop/src/app/pages/settings/settings.component.ts`; all six locale files in `libs/i18n`.

- **Validation:** Run and observed:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects, 773 desktop tests
    (up from 765) and 252 core tests. The 11 lint warnings are pre-existing `no-non-null-assertion`.
  - `npm run verify:csp` - passed.
  - `npm run format:check` - passed.
  - `git diff --check` - clean.
  - **Not verifiable in the browser preview:** the onboarding overlay is gated on a settings read,
    which fails outside a Tauri runtime, so a browser-served build never renders the step. The
    template compiles (it is type-checked by `nx build desktop`), but that is not the same as seeing
    it. The running `tauri dev` instance did hot-reload the change.
  - **Native gate: passed, run by the maintainer, not by this agent.** Screen-control permission was
    denied to the agent, so it could not drive the window. The maintainer ran the wizard end to end
    in the `tauri dev` build after the change hot-reloaded and reported onboarding completing with
    no errors. Recorded as observed-by-the-maintainer rather than as an agent-run check, because
    the agent did not see the screen.

- **Privacy/security impact:** No change to key handling. Keys stay in the OS keychain via
  `KeysService`; nothing here reads, logs or transmits one. The change only decides which model id
  accompanies a request the user already authorised. Model ids are not secrets.

- **Decisions and assumptions:** The catalogue went to `libs/core` rather than a desktop-side shared
  folder because two screens depend on it and `AiProvider` already lives there. `apiModelsToRestore`
  moved with it; `CLI_MODEL_CUSTOM` and `cliModelSelectValue` stayed in `pages/settings` because
  they are specific to that screen's free-text CLI picker.

- **Risks or compatibility impact:** Existing settings rows are not migrated. They are repaired on
  read instead - the first time the user opens either screen, a blank or foreign model id is
  reconciled to the selected provider's default. That is deliberate: a migration cannot know which
  provider the user meant, and repairing on read fixes rows this bug has already corrupted.

- **Open issues or blockers:** None. `glib` RUSTSEC-2024-0429 and `brace-expansion`
  GHSA-mh99-v99m-4gvg remain open on purpose with drop conditions in
  `docs/governance/VALIDATION_MATRIX.md`; neither was touched.

- **Next first action:** none for this fix - it is verified and merged as `8d1f3fb`. The next
  outstanding gate belongs to the previous watch and is unaffected by this one: `npm run
desktop:dev`, then export a CV to PDF and to DOCX from the apply wizard's final step, confirming
  the file is written, the status line reads the saved path, and the document leaves draft state
  into the Documents library. Onboarding passing says nothing about the export path.

- **Evidence:** The reported error string is reproduced by the stored-model path: migration
  `0002_settings_defaults.sql` seeds `economy_model = 'claude-haiku-4-5'`, and `markSeen` wrote
  `economyModel: ''` in CLI mode, while `aiDispatch` passed `settings.economyModel` straight through.

### 2026-07-30, the jobs page loses three of its ten responsibilities, and the template does not change at all

- **Status:** complete, with one gate explicitly pending
- **Agent/tool:** Claude Code, Opus
- **Branch:** `refactor/jobs-portal-answers-service`, `refactor/jobs-final-checks-service`,
  `refactor/jobs-export-service` (stacked, in that order)
- **Commits:** `f570694`, `eb8dc2e`, `85456a5`, plus this entry
- **Pull request:** #222 (merged), #223, #225 (reopened from #224)
- **Objective:** begin the Tier 1 split of `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  (2788 lines, roughly ten responsibilities) by extracting the three most isolated seams into
  services, one pull request each, with behaviour held constant.

- **Completed:** Three extractions, in the order the seams were isolable rather than the order they
  appear in the file.

  **Portal answers (#222)** was the easy one, and the reason is worth recording: it has _no template
  surface at all_. `draftPortalAnswers`, `portalAnswers`, `copyPortalAnswer` and the rest are
  referenced nowhere outside the component. Nine signals, two AI calls and one cache read moved to
  `PortalAnswersService` with nothing else to reconcile.

  **Final checks (#223)** was harder. Six of its members are bound from `jobs.component.html` and
  `finalChecksOutdated` is written from twelve component call sites plus one template binding. Rather
  than rewrite those bindings, the component now exposes `finalChecks` and `finalChecksOutdated` as
  aliases onto the service's **writable** signals - not `asReadonly()` views. That is what let the
  template stay byte-identical, including the `finalChecksOutdated.set(!!finalChecks())` binding at
  `jobs.component.html:586`. `documentText` moved with the rules and became private; the
  `DocumentRegionTag`, `FinalCheckStatus` and `FinalChecks` types moved to the service file so the
  component imports them without a cycle.

  **Export (#225)** used the same alias technique for four signals and seven bindings.

  All three services are listed in the component's `providers` rather than `providedIn: 'root'`. That
  was chosen over the repository's existing root-singleton convention on purpose: a component-scoped
  provider gives one instance per page-component instance, which is exactly the lifetime the signals
  had as fields. A root singleton would have been _probably_ equivalent, because the component resets
  this state in `loadJob`, and "probably" is not the standard for a change that is supposed to be
  invisible.

  **48 tests, where there had been none.** Not a bonus - it is the evidence that these were moves.
  They pin the things a careless extraction changes silently: which questions reach the portal-answers
  cache key after trimming and filtering, that a redraft never consults the batch cache, each
  final-check note trigger and the 900/500-character floors, that the input hash marks a result
  outdated when a document changes and leaves it fresh when it does not, and the PDF-versus-DOCX
  routing with the Tauri save dialog mocked.

- **Not completed:** Seven of the ten responsibilities remain in the file - tailoring passes, scoring
  and rescoring, CV/cover-letter draft generation, the CV gap dialog, the apply wizard's step and
  reset machinery, the job/application CRUD actions, and the compensation and archetype derivations.
  #222 is merged. #223 and #225 are open and CI-green at hand-off. **#224 no longer exists as a
  pending change** - see the risk section below for what happened to it.

- **Files or packages changed:** `apps/desktop/src/app/pages/jobs/jobs.component.ts` (2788 -> 2481);
  new `apps/desktop/src/app/shared/{portal-answers,final-checks,document-export}.service.ts` and
  their three spec files; `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`, this file.
  `jobs.component.html` is unchanged.

- **Validation:** Run and observed, per pull request:
  - `nx run-many --target=lint,type-check,test,build --all` - passed, 6 projects. Desktop test count
    733 -> 752 -> 765. The 11 lint warnings are pre-existing `no-non-null-assertion` in untouched code.
  - `npm run verify:csp` - passed.
  - `npm run format:check` - passed. (`nx format:check` initially flagged the new service file;
    `npx prettier --write` on that path fixed it. Note that `nx format:write --projects=.` does _not_
    scope to a project - it reformats the whole repository. `--uncommitted` is the safe flag.)
  - `git diff --check` - clean.
  - Browser, `nx serve desktop` on port 4201: `/jobs/1` renders and `app-jobs` instantiates after each
    of the three changes, with no `NullInjectorError`, `NG0201`, `NG0203` or `NG0600` in the console.
    The `tauriInvoke called outside Tauri context` errors are structural for a browser-served build.
  - **Pending, not run:** the native Tauri gate, `npm run desktop:dev`. This matters most for #225 -
    the export path is Tauri-only, and the unit tests mock `@tauri-apps/plugin-dialog`, so they are
    not evidence that a real save works.

- **Privacy/security impact:** No new data flow and no new egress. Portal answers still hash the same
  inputs into the same SQLite cache; final checks still park the same payload under the same
  `applye:wizardFinalChecks:<hash>` sessionStorage key. #225 touches a security-relevant surface - the
  save dialog and the open/reveal shell bridges - and invokes them with the same values in the same
  order. No new shell interpolation, no widened filesystem reach.

- **Decisions and assumptions:** Two things were found and deliberately _not_ fixed, per the
  move-not-redesign constraint.
  1. **`portalLanguages` is misnamed.** It is the generic supported-document-language list, and the
     template binds it twice for the CV and cover-letter selects. It stayed on the component under its
     wrong name, with a comment saying so. Renaming it is a separate change.
  2. **`doExport` reports a commit failure as an export failure.** `commitLinkedDocument` runs inside
     the export `try`/`catch`, so if it threw, the status line would read `export_failed` even though
     the file was written. The branch is unreachable today because that method swallows its own
     errors, which is why this is a note and not a bug report. It was preserved exactly - passed in as
     an `onExported` callback so it still runs inside the `try` - because moving it out would have
     changed the code's meaning with no test able to notice.

- **Risks or compatibility impact:** Stacked branches, and the stack did go wrong once - recorded here
  rather than tidied away, because the failure mode is easy to repeat.

  During the watch, #223 was amended and force-pushed after #224 revealed that its `reset()` was
  reachable from three component sites; #224 was rebased onto the amended commit and both were
  re-verified. That part went fine.

  What did not: **#224 was merged into #223's branch instead of into `main`.** That was its base, so
  GitHub did exactly what it was asked - it reported #224 as merged, put the export work and the docs
  commit inside #223's branch, and left #223 retargeted at `main` and conflicting. The conflict was
  not in the code. It was that `main` had #222 as a _squash_ (`864b57c`), while #223's branch still
  carried the original pre-squash `f570694`, so the two histories no longer shared a base.

  Rebuilt rather than force-merged: both tips were backed up to local `backup/pr223-branch` and
  `backup/pr224-squash` first, #223 was reset to its own commit and rebased onto `origin/main` with
  `--onto`, and the export work was rebased on top of the result and reopened as **#225**. The full
  gate was re-run on each. No content was lost; #225 is byte-identical in content to what #224 held.

  **The lesson for the next stacked series:** a squash merge of the bottom PR orphans every branch
  above it, and merging a stacked PR without first retargeting it lands the change in the wrong
  branch silently. Retarget upward one level at a time, and rebase the rest of the stack after each
  merge.

- **Open issues or blockers:** None blocking. The `glib` RUSTSEC-2024-0429 and `brace-expansion`
  GHSA-mh99-v99m-4gvg advisories remain open on purpose with drop conditions recorded in
  `docs/governance/VALIDATION_MATRIX.md`; neither was touched.

- **Next first action:** Merge #223 into `main`, then retarget #225 to `main`, confirm its check
  re-runs green, and merge it. Then run `npm run desktop:dev` and export a CV to PDF and to DOCX from the
  apply wizard's final step, confirming the file is written, the status line reads the saved path, and
  the document leaves draft state and appears in the Documents library - the one gate this watch could
  not run.

- **Evidence:** `git log --oneline -3` on `refactor/jobs-export-service` shows `85456a5`, `eb8dc2e`,
  `f570694`. `wc -l apps/desktop/src/app/pages/jobs/jobs.component.ts` reports 2481.
  `git diff main --stat -- apps/desktop/src/app/pages/jobs/jobs.component.html` is empty.

### 2026-07-30, the dependency alerts are triaged rather than counted, and TypeScript is finally named as the thing that kept breaking CI

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `chore/dev-tooling-eslint-10`, `chore/pin-transitive-advisories`,
  `chore/dependabot-ignore-typescript-major`, `docs/redos-and-deps-watch`
- **Commits:** `43885e2`, `920d1e5`, plus this entry
- **Pull request:** #212 (merged), #214, #215, and this one
- **Objective:** the failing Dependabot pull requests, then backlog item 3 - the dependency alerts.

- **Completed:** Three things, in the order they turned out to depend on each other.

  First, **the failing bot PR.** #208 grouped five dev-tooling updates and failed on `Failed to
process project graph`. One package, `typescript` at `~7.0.2`, caused it; the other four were
  fine. #212 takes the four - `eslint` 9 -> 10, `@eslint/js` 9 -> 10, `zone.js` 0.15 -> 0.16,
  `@schematics/angular` 21.2.9 -> 21.2.19 - after checking every peer that constrains them rather
  than trying and hoping. ESLint 10 then found a real dead store in
  `tracker-report-print.component.ts`, fixed in the same commit.

  Second, **the alerts, triaged rather than counted.** #212 and the two bot PRs the maintainer
  merged took the count from 27 to 17. #214 pins six transitive packages through `overrides` and
  closes twelve more: `axios`, `postcss`, `webpack-dev-server`, `body-parser`, `js-yaml` and
  `brace-expansion`, each to the patched release inside its own major.

  Third, **the cause of three failed pipelines, named in configuration.** Dependabot isolated
  `typescript` into #213 and it failed exactly as it had inside the group. #215 adds it to the npm
  semver-major ignore list, so it stops returning. #213 can be closed once #215 lands.

- **Not completed:** Item 1 of the backlog is still untouched and still first - smoke-test and
  publish `v0.29.1`. It needs a Windows VM, a Linux VM and a publish action, all the maintainer's.
  The Prettier drift found in the previous watch is still open; it is a clean mechanical job and was
  deliberately left as its own PR rather than mixed into a security change.

- **Files or packages changed:** `package.json`, `package-lock.json`,
  `apps/desktop/src/app/pages/tracker/tracker-report-print.component.ts`,
  `.github/dependabot.yml`, `docs/governance/VALIDATION_MATRIX.md`, `CHANGELOG.md`, this file.

- **Validation:** For #212 and #214: `nx run-many --target=lint,type-check,test,build --all` green
  across 6 projects, run with `--skip-nx-cache` for #214 because a cache hit proves nothing about a
  change to the build toolchain itself. `npm audit --omit=dev` at 0 before and after. `npm run
verify:csp` reported `CSP compatibility OK`. `npm run format:check` and `git diff --check` clean
  on every branch. CI green on #212 (3m39s), #214 (3m48s) and #215 (3m22s). `cargo audit` was run
  while triaging `glib` and exits 0 with 19 allowed warnings; it was not re-run per branch because
  no Cargo manifest is touched. Native gate not run and not applicable - no runtime dependency
  moved.

- **Privacy/security impact:** Security, and smaller than the numbers suggested. The honest framing
  is that **none of the seventeen alerts ever shipped**: sixteen have `scope=development` and
  `npm audit --omit=dev` is at zero. The seventeenth is the only one that could have shipped, and it
  is a Rust crate rather than an npm package - see the trap below.

- **Decisions and assumptions:** Clearing dev-only advisories was judged worth doing even though
  nothing shipped, for the reason `.cargo/audit.toml` already states for the Rust side: a list of
  known findings that nobody expects to reach zero is a list that hides the next real one. Against
  that, three advisories were deliberately **not** cleared, because the only remedy crossed a major
  boundary - `brace-expansion` GHSA-mh99-v99m-4gvg (no backport below 5.0.8, and forcing every copy
  to 5.x risks CJS interop under `minimatch` 3.x), `uuid` (three majors), `@hono/node-server` (one
  major). Each is recorded in the validation matrix with a drop condition, to the same standard the
  cargo ignore list uses. Pinning across a major to make a number go down trades a reported risk for
  an unreported one, and that trade was refused.

- **Risks or compatibility impact:** ESLint 10 is a major on the lint toolchain and `zone.js` 0.16 is
  a breaking bump by 0.x convention; both are covered by the full gate passing, and `zone.js` now
  survives only in the library test setup. The `overrides` block is the one thing here that can rot
  quietly: it silently freezes a transitive version, so `npm ls <pkg> --all` is the check that tells
  you whether an entry is still doing anything.

- **Second half of the same watch, after the maintainer merged #214, #215 and #216:** the alert count
  fell 17 -> 3, and #213 closed itself the moment #215's ignore rule landed, which is the rule working
  exactly as intended. #217 then took the last two npm advisories that had a fix - `uuid`
  8.3.2 -> 11.1.1 and `@hono/node-server` 1.19.14 -> 2.0.5, both majors, both verified against their
  actual consumer rather than assumed. Sixteen of the original seventeen are closed. **The one
  genuinely interesting result is the advisory that was refused.** A zero `npm audit` was available by
  forcing every `brace-expansion` copy to 5.x. It was tried, it reported zero, and it breaks
  `minimatch` 3.1.5 under `test-exclude` and `fork-ts-checker-webpack-plugin`: version 5's CJS entry
  exports `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }` instead of a bare function, and
  `minimatch` 3.1.5 calls the module directly, so both copies throw `expand is not a function` on
  load. **Every signal this repository has said the change was clean** - `npm audit` 0, the full gate
  green across all six projects with the cache skipped, and `nx test core --coverage` passing too,
  because Jest 30 resolves its own newer `minimatch`. It was reverted, and the exact failure is now
  recorded in `docs/governance/VALIDATION_MATRIX.md` beside the rule it justifies.

- **Third part of the same watch, unblocking the thing that has gated four watches:** the smoke test
  had no procedure, only a description of why it was awkward, so `docs/RELEASE.md` gained one (#218) -
  macOS natively, Windows in a free UTM machine on Windows 11 ARM, three routes for x86_64 Linux, the
  asset-to-platform table, the per-platform data paths the uninstall check needs, and a section on what
  none of it proves. It also corrects that file's "Known blocker", which was stale **and** misdiagnosed:
  there was never a failed payment, the repository was private with exhausted included minutes against
  a $0 limit. The Prettier drift was cleared as well (#219), at 19 files rather than the 15 previously
  recorded - the earlier count came from grepping only `libs/**` and `apps/**`, missing four plan
  documents and a spec.

  **One process mistake, worth recording because it is easy to repeat.** Running `nx format:write
--projects=.` does not scope to the current project; it formatted the whole repository and swept the
  entire drift into the docs commit - precisely the mixing the previous entry said to avoid. Caught by
  reading `git show --stat` before pushing, then split into two branches. Check what a formatter
  actually touched before committing it, rather than trusting a scoping flag.

  Also worth knowing for next time: "formatting-only" was nearly claimed and would have been wrong.
  `git diff --ignore-all-space` is **not** empty for a Prettier reflow, because collapsing a union
  removes the optional leading `|`, which is a token change. The check that settles it is comparing the
  built bundle: `nx build desktop` gives a byte-identical digest before and after.

- **Fifth part of the same watch: branch protection, and the OnPush pass.** Required status checks are
  now on for `main`, with one context - `Lint / Test / Build (affected) + Rust`. **Two checks were
  deliberately left out and the reason matters**: `Analyze (javascript-typescript)` and
  `Analyze (actions)` report _skipped_ on pull requests, and `Deploy applye.dev` only runs on a push to
  `main`, so requiring either would have deadlocked every merge. `strict` is off so a pull request does
  not need rebasing whenever `main` moves; approvals stay at 0 and `enforce_admins` stays off, which is
  the existing deliberate choice not to lock a solo maintainer out.

  The seven page components still on default change detection are now on OnPush. **The check that
  mattered was done before annotating, not after**: OnPush in a zoneless app silently breaks any
  component whose rendered state lives outside signals. All seven are signal-driven (6 to 88 signal
  declarations), none injects `ChangeDetectorRef` or calls `markForCheck`/`detectChanges`, none has a
  `protected`/`public` non-signal mutable field a template could bind, and none mutates class state in
  place with `push`/`splice`/`sort`. The only plain mutable fields are three `private` ones in
  `jobs.component.ts`, which a template cannot reach.

  Verified in the browser, because a green unit suite cannot catch a view that stops updating. A
  first measurement looked like a regression - every route rendered 75 characters short - and it was
  not: the offset was constant across all five routes, which means shell-level, and it was an error
  toast dismissed by a stray click in one run and present in the other. Re-measured from a clean
  reload, before and after are identical: 237 / 1855 / 509 / 544 / 1000 characters on `/settings`,
  `/profile`, `/pipeline`, `/jobs`, `/dashboard`. **A constant difference across unrelated pages is a
  measurement artifact, not a finding** - worth remembering before reverting something.

- **Fourth part of the same watch, the zoneless test migration.** The three library suites ran under
  `setupZoneTestEnv` while both applications run zoneless, so their test environment was not the one
  production uses. `i18n` (10 tests) and `data` (22) moved across unchanged. `ui` failed exactly two,
  and the previous watch had predicted which: `score-gauge`'s band tests.

  **The prediction was right about the symptom and worth restating precisely, because the spec was
  asserting the opposite of what the component does.** The gauge snaps on mount when `from` is null
  and tweens only on _later_ score changes, over 700 ms of `requestAnimationFrame`, with the colour
  band following the animated value. The spec set a score in `beforeEach` and then changed it inside
  each band test - the animating path - then asserted the new band on the very next frame. Under
  zone.js that passed; in a browser it never would, because the band has not moved yet. The band
  tests now set their score before the first effect run, so they test threshold logic alone. Two
  tests were added rather than removed: one pins snap-on-mount, and one drives real animation frames
  to assert the band does _not_ jump on the frame the input changes and does arrive once the tween
  settles. The animation had no honest coverage before this.

  `zone.js` and `@angular/animations` are both removed. `zone.js` is an optional peer of
  `@angular/core` and was never bundled - no project configuration has a `polyfills` entry - so its
  only remaining effect was patching rAF in three test environments. `@angular/animations` was simply
  unused, and was also the one `invalid` peer in the tree: it had resolved to 21.2.17 and pins
  `@angular/core` to exactly 21.2.17 while core is 21.2.19. Removing it resolves that instead of
  bumping a package nothing imports.

  Verified at runtime, not inferred: the dev server boots with both gone, the app renders, and
  `window.Zone` is `undefined`. The only console errors are `tauriInvoke called outside Tauri
context`, which is structural - `tauriInvoke` throws whenever `window.__TAURI_INTERNALS__` is
  absent, so serving the desktop app in a plain browser always logs it.

  Second time in one watch that `npm pkg delete <block>.zone.js` was reached for and produced a
  `"zone": {}` stub, because npm reads the dot as a path separator. Edit `package.json` with a script
  for any key containing a dot.

- **Open issues or blockers:** The Prettier drift is now cleared in #219, so the item the previous
  entry left open is closed. `score-gauge` and the zoneless test setup, open since two watches ago,
  are closed here. The `Dependabot Updates` workflow
  error from two watches ago is still cosmetic and still GitHub's own updater rather than this
  repository's CI. One npm advisory and one Rust advisory stay open on purpose, both documented with
  drop conditions: `brace-expansion` GHSA-mh99-v99m-4gvg and `glib` RUSTSEC-2024-0429.

- **Next first action:** Merge #218 and #219, then work `docs/RELEASE.md` section 3 against the
  `v0.29.1` draft and publish it. The runbook now exists, so this is a procedure rather than a research
  task - and the first pass through it doubles as a review of it, since nobody has executed it yet.
  Required status checks are now on, so that item is closed. What remains after publishing is Tier 1:
  `jobs.component.ts` at 2786 lines has the cleanest seams - portal answers, final checks and export
  move to services almost mechanically - and `discover.rs` at 3488 splits at filters / per-source
  parsers / HTTP / orchestration. `pages/` has still not been reorganised into per-feature folders.
  Note that the earlier figure of 2794 lines for `jobs.component.ts` predates the Prettier sweep; it is
  2786 now, and the "eight screens on eager change detection" in an earlier entry was seven.

- **Evidence:** **The previous watch's open question is now answered.** It recorded that CodeQL had
  not re-scanned and that the five ReDoS alerts should be read as open until GitHub said otherwise.
  GitHub has said otherwise: all five report `state: fixed`, `fixed_at 2026-07-30T08:34:00Z`, and
  there are zero open code-scanning alerts. Two claims in this entry are measured rather than
  inferred: the advisory ranges were read from the GitHub advisory API per release line, which is how
  the `@major` selectors were chosen, and the installed versions were read from `npm ls <pkg> --all`
  before and after each override. The first attempt at #214 pinned what the Dependabot alerts named
  and moved the count by two - npm's advisory data and Dependabot's disagree on the ranges, and the
  copies that actually needed pinning were `js-yaml` 3.14.2 and `brace-expansion` 5.0.6, not the
  majors the alerts pointed at. Anyone repeating this work should trust `npm ls` over either alert
  feed.

- **Traps for a fresh agent:** **`glib` will look like an unfixed high-value runtime alert. It is
  not fixable here.** RUSTSEC-2024-0429 is unsoundness in `glib::VariantStrIter`, and `glib` sits at
  0.18.5 because the whole gtk-rs 0.18 stack - `atk`, `cairo-rs`, `gdk`, `gdk-pixbuf`, `gdkx11`,
  `gio` - reaches it through `gtk` 0.18.2, which is what `tauri` 2.11.5, `wry`, `tao` and `muda`
  pin. `cargo update -p glib` locks 0 packages. It is Linux-only, Applye's Rust never calls `glib`
  directly, and `cargo audit` already tolerates it at exit 0. Drop it when Tauri's Linux backend
  moves off gtk-rs 0.18, not before. Second trap: **four of the six packages recorded as "held for
  Angular 22" were never actually blocked.** They were held because the grouped PR could not
  install. `angular-eslint` is the one that genuinely is gated - 22.1.0 requires
  `@angular/cli >= 22`.

### 2026-07-30, the five CodeQL ReDoS alerts are closed, and a repository-wide formatting drift surfaces

- **Status:** complete
- **Agent/tool:** Claude Code, Opus
- **Branch:** `fix/core-redos`
- **Commits:** `91b1791`
- **Pull request:** #210
- **Objective:** item 2 of the previous watch's backlog - the five open CodeQL `js/polynomial-redos`
  alerts in `libs/core`, all high severity.

- **Completed:** All five sites are linear now, and the fix was chosen per site rather than applied
  as a pattern. Two take bounded repetition counts where a bound is honest: the salary parser's
  percentage strip caps digit runs at twelve, and the signature sanitiser's email pattern takes the
  RFC 5321 lengths. The scoring-JSON closing fence loses a leading `\s*` that the following `.trim()`
  already covered. The two trailing-`(...)` parsers behind the education and language editors - the
  same regex written twice, `^(.*?)\s*\(([^)]*)\)\s*$`, quadratic on a run of `(` and again on a run
  of spaces - now share one string scan that cannot backtrack.

- **Not completed:** Nothing in scope. Item 1 of the backlog (smoke-test and publish `v0.29.1`) was
  not attempted: it needs a Windows VM, a Linux VM, and a publish action that is the maintainer's to
  take. Dependabot's 27 alerts were counted, not triaged.

- **Files or packages changed:** `libs/core/src/lib/profile/{compensation,profile-markdown}.ts` and
  their specs, `libs/core/src/lib/text/signature.ts` and its spec, `CHANGELOG.md`,
  `docs/product/CURRENT_STATE.md`, this file.

- **Validation:** Run and observed on the branch: `nx run-many --target=lint,type-check,test --all`
  (6 projects green, 0 errors, 10 pre-existing `no-non-null-assertion` warnings in `compensation.*`
  that this change does not touch); `nx run-many --target=build --all` green; `npm run verify:csp`
  reported `CSP compatibility OK`; `npm run format:check` clean; `git diff --check` clean. The
  `cargo` rows of the validation matrix do not apply - no Rust changed, and despite the change being
  inside `libs/core` no shared type or IPC contract changed, only the bodies of five functions. The
  native gate was not run and is not applicable: no IPC, migration, keychain or dialog is involved.

- **Privacy/security impact:** Both. The security half is the point of the watch. The privacy half is
  `signature.ts`, which exists to keep a phone number or email the model appended out of a cover
  letter. Bounding that regex was the only change here that could weaken a guarantee, so the bound
  was picked to make weakening impossible rather than merely unlikely: a bounded match still consumes
  the `@` and the domain, so a partial strip cannot leave a usable address behind. `PHONE_RE` and
  `EDGE_SEPARATORS_RE` in the same file were deliberately left alone - see the decisions below.

- **Decisions and assumptions:** Fix only what CodeQL flagged. `PHONE_RE` and `EDGE_SEPARATORS_RE`
  in `signature.ts` are the same class of pattern and CodeQL did not flag either, and bounding
  `PHONE_RE` would mean a long numeric run is stripped only in part - which for a phone-number
  sanitiser is worse than the quadratic cost, because a fragment of a real number still leaks. They
  are recorded here instead of changed. Second decision: the trailing-`(...)` behaviour on
  unbalanced input was preserved exactly rather than improved. `Title (a(b)` still yields head
  `Title` and body `a(b`, and `Title (2019 - (2020))` still yields no split at all. Neither is
  obviously right, but the old regex chose them and nothing should change silently during a security
  fix; three tests now pin both.

- **Risks or compatibility impact:** Low, and bounded to absurd input. A percentage with more than
  twelve digits or an email local part longer than the RFC allows is now stripped in part rather
  than whole. No stored data, migration, or contract is affected.

- **Open issues or blockers:** **A repository-wide Prettier drift, newly found and not fixed.**
  Fifteen files are stale against the current Prettier: six under `libs/core/src/lib/{geo,models}`,
  nine under `apps/desktop/src/app/pages` including `jobs.component.ts` and `profile.component.ts`.
  `nx format:check` only inspects files changed against the base, so the drift is invisible until
  something touches one of those files - which is exactly what happened here, and why this branch
  carries two formatting-only hunks in `profile-markdown.ts` reflowing type unions nobody edited.
  Every future PR touching one of those fifteen files inherits the same noise. It wants one
  formatting-only commit, on its own, so the diff is self-evidently mechanical.

- **Next first action:** Unchanged from the previous watch - run the `docs/RELEASE.md` smoke test
  against the `v0.29.1` draft and publish it. Everything else still waits behind having a working
  download. After that, Dependabot's 27 alerts (10 high, 13 medium, 4 low) are the next security
  item, and the Prettier drift above is a clean fifteen-minute job for whoever wants a quiet start.

- **Evidence:** The cost figures in #210 were measured on this machine at 40 000 characters, old
  pattern against new, not inferred from the alert text: 1517 ms, 989 ms, 639 ms, 633 ms and 612 ms
  before, sub-4 ms or no regex after. The regression tests use a 100 000-character input, where the
  old patterns need four to nine seconds against a two-second budget, so they fail rather than merely
  slow down. **One thing is not yet evidence:** CodeQL has not re-scanned. Default setup runs on push
  to `main`, so the five alerts close after #210 merges, not before, and until GitHub says so they
  should be read as open.

### 2026-07-30, the repository goes public, and the release pipeline produces installers for the first time

- **Status:** partial - a draft release is built and waiting on a manual smoke test
- **Agent/tool:** Claude Code (Opus 5)
- **Branch:** `main`, via PRs #192, #194, #195, #197, #200, #204
- **Objective:** Open the repository, harden it for a public audience, and get installers into users' hands.

#### Where things stand

- **The repository is public.** Secret scanning and push protection on, private vulnerability reporting on, Dependabot alerts and security updates on, CodeQL default setup configured for `javascript-typescript` and `actions` (Rust is not a CodeQL language - `cargo clippy` and Dependabot's cargo alerts cover it). `main` is protected: pull request required, no force pushes, no deletion, linear history, conversation resolution. **Zero required approvals and `enforce_admins` off, deliberately** - a solo maintainer must not be locked out of their own repository. Required status checks are still off, and turning them on is now safe because CI passes; it was left off while CI could not run.
- **`v0.29.1` is a draft release with 17 assets** covering macOS on both architectures, Windows `.msi` and `.exe`, and Linux `.deb`/`.rpm`/`.AppImage`, each with a `.sig` and a `latest.json`, so auto-update works. **It is not published.** It needs the smoke test in `docs/RELEASE.md`, and macOS/Windows both need the unsigned-binary note that is already written into the draft notes.
- **applye.dev deploys itself** on every merge to `main`. That was already configured; it only ever looked broken because the job depends on a CI run that could not start.

#### The three bugs that mattered, and the single reason none was caught

Each was invisible for the same reason: **GitHub Actions was blocked while the repository was private**, so CI never once reached a build step.

1. `frontendDist` in `tauri.conf.json` resolved one directory level short. `tauri build` compiled the Rust binary and aborted with "Unable to find your web assets". The desktop bundle had been unbuildable across five tagged releases.
2. The packaged app rendered with **no layout at all**. Angular's `inlineCritical` defers the stylesheet as `media="print"` behind an inline `onload`, and the app's CSP forbids inline handlers, so it never activated. Only the inlined critical CSS applied - correct fonts, nothing else. Fixed by disabling `inlineCritical` for the desktop build rather than loosening `script-src`.
3. `beforeBuildCommand` called `nx` without `npx`. `tauri-action` does not go through the npm script that puts `node_modules/.bin` on `PATH`, so all four release jobs died in seconds.

`tools/verify-csp-compat.mjs` exists because of the second one and runs in `ci.yml`, in `release.yml` and inside `desktop:build:tauri`. It was checked in both directions - green on the fixed output, red with a pointed message on the broken one.

#### Two corrections I owe the record

- **I claimed going public did not fix Actions. It did.** I read runs from 21:45 and concluded the account's billing state still blocked public repositories; the repository actually became public at 21:50:50. Every run after that executes fully. The real mechanism: a private repository draws on the 2,000 included minutes, those were exhausted, and a $0 Actions budget with stop-usage refuses anything past the allowance. Public repositories on standard runners are metered as gross usage and discounted in full, which is why the maintainer's other public repository never stopped. That wrong claim had reached six READMEs, the release notes and a PR body; all are corrected.
- **The bundle-size argument for removing NgRx does not hold.** Tree-shaken it was a small slice of a 2.2 MB bundle. The argument that holds is coupling: its `@angular/core: ^21.0.0` peer would have gated every future Angular major.

#### Decisions, so they are not relitigated

- **Angular 22 is declined.** Nothing in the app needs it, 21.2 is supported, and the upgrade existed because a bot opened a PR. #204 stops Dependabot re-proposing it monthly; patches and minors still flow. If someone takes it later, the order is Nx first (`@nx/angular` 23.0.1 caps Angular below 22, 23.1.0 lifts it), then TypeScript **6.0.x specifically, not 7**, then Angular via `ng update`.
- **No CLI for Applye.** The desktop app is the product; a CLI would reimplement the domain a second time.
- **NgRx removed**, replaced by a plain `@Injectable` over signals, with ten specs where the layer had one.
- **CodeRabbit not installed.** It is noisy, and on a repository whose code is visibly AI-assisted, an AI reviewer sharpens exactly the signal the maintainer is uneasy about. Revisit when external contributions arrive. Installing a third-party GitHub App with write access is the maintainer's click, not an agent's.

#### What is left, roughly in order

1. **Smoke-test and publish the `v0.29.1` draft.** Checklist in `docs/RELEASE.md`; macOS natively, Windows in a UTM ARM VM (x64 emulation works), Linux in an emulated x86_64 VM.
2. **Five open CodeQL alerts, all `js/polynomial-redos`, all high** - regexes in `libs/core` (`profile/profile-markdown.ts`, `profile/compensation.ts`, `text/signature.ts`). These run over user-pasted job descriptions and CVs, which is exactly "uncontrolled data". Real, fixable, and the most valuable security work available.
3. **16 Dependabot alerts** (7 high, 9 medium) in transitive npm dependencies.
4. **PR #202** (dev-tooling) is mergeable; **#203** (Angular) conflicts and should be closed once #204 lands, which will stop it returning.
5. **Tier 1 architecture, still open:** `jobs.component.ts` is 2794 lines holding roughly ten responsibilities - portal answers, final checks and export are the three most isolated and move to services almost mechanically. `pages/` has not been reorganised into per-feature folders. Eight large stateful desktop screens are still on eager change detection. `discover.rs` (3488), `tailoring.rs` (2699) and `documents.rs` (2070) each mix fetching, parsing, filtering and persistence; `discover.rs` has clean seams at filters / per-source parsers / HTTP / orchestration.
6. **`score-gauge.spec.ts` asserts behaviour production does not have.** The gauge tweens its band over 700ms of `requestAnimationFrame`; the tests pass only because zone.js patches rAF in the library test environment. The apps are zoneless. Migrating `libs/{data,i18n,ui}/src/test-setup.ts` to `setupZonelessTestEnv` exposes it and would let `zone.js` be dropped entirely.
7. **`Dependabot Updates` workflow fails** with `The updater encountered one or more errors` - GitHub's own updater, not this repository's CI. Cosmetic, but it keeps a red mark on the Actions tab.

#### Things a fresh agent should know before touching anything

- Read `.claude/skills/applye-angular` and `.claude/skills/applye-rust` first; they hold the conventions, the size budgets and the exact gate commands.
- The full gate is `nx run-many --target=lint|type-check|test|build`, `npm run verify:csp`, `npm run format:check`, `git diff --check`, and `cargo clippy --all-targets -- -D warnings` from `apps/desktop/src-tauri`.
- Local updater signing fails: `~/.tauri/applye_updater.key` is password-protected and only the maintainer has the password. `.dmg` builds fine without it; CI signs properly.
- README media is deliberately **not** in Git LFS. Putting it back would let a traffic spike exhaust the LFS allowance, which breaks every README image and `git clone` at once.
- The pre-LFS history is still fetchable from GitHub by SHA via PR #169 even though the branch is deleted. It contains an unblurred frame showing a home-directory name. Low severity; only a GitHub Support purge removes it.

- **Next first action:** run the `docs/RELEASE.md` smoke test against the `v0.29.1` draft and publish it. Everything else can wait behind having a working download.

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
