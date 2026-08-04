# Next session prompt - Applye file-size campaign

Paste everything below the line into a fresh Claude Code session.

---

Continue the Applye file-size budget campaign. The Rust half is finished; Angular is what remains.

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, and the recent entries in `docs/internal/DUTY_WATCH.md`. The
entries dated 2026-08-03 and 2026-08-04 are the campaign's own history. Two of them matter most and
are worth reading in full before touching anything: **"the Discover page loses its Sources drawer"**
carries a seam audit you should not repeat, and **"the CV card's Generating that never ends"** is
the shape of bug this codebase produces.

## Where things stand

`main` is at `030dd6c`, clean. **One PR is open and it is the first thing to deal with.**

Measure with `npm run quality:file-size:all` - **not** the plain `quality:file-size`, which is
diff-scoped and whose clean report means only "nothing I touched is near budget". That distinction
has already produced one false all-clear in `CURRENT_STATE.md` that had to be corrected later.

Current audit: **44 files over budget**. Rust is at zero and stays there.

### PR #320 is open and blocked on you, not on code

`refactor(desktop): extract Discover's Sources drawer and the list it edits`. CI green, mergeable,
every gate run. It is **not merged** because Angular UI changes in this repository are verified by
walking the flow in the running app - a broken template binding passes type-check, lint and unit
tests, and this campaign has now been bitten by exactly that twice.

Ask the maintainer to walk it, or ask for access to walk it yourself. Do not merge it on tests alone
without saying so explicitly.

What to walk (`npm run desktop:dev`, open Discover, open the Sources drawer): the summary line with
its scope label and failing count, the three collapsible groups and their counts, switching a source
on and off, "show all sources" against the market narrowing, adding a company board, adding an RSS
feed, removing a user source, and closing by button, by backdrop and by Escape.

**The live risk there is styling.** Six control classes were not copied into the child but hoisted
into a partial emitted globally from `styles.scss`. If a `.dv-btn` or `.dv-input` looks wrong
anywhere in the app, that partial is the first place to look.

**Until #320 merges, do not start another Discover cut.** It touches all three `discover.component.*`
files and a second branch from `main` would conflict with it wholesale.

## The method that has been working

Every split in this campaign followed the same loop. Keep it.

1. **Consumer audit before choosing a seam.** For each candidate block, list the symbols its markup
   names and count their uses in the rest of the file. The Sources drawer was picked because 23 of
   its 25 symbols appear nowhere else; the filter row was passed over because it names 35 and shares
   a helper with four other filters. This is the step that makes everything after it cheap.
2. **Measure the block before writing the child - the template _and_ the stylesheet.** The drawer's
   template was measured (268, fine) and its stylesheet was not; the first version came out 452/400
   and the size gate refused it.
3. **Extract by line range to a scratch file first, then diff after deleting.** Prove nothing was
   dropped, in both directions: the child matches the extracted block, and the parent equals its
   former self minus exactly those ranges. This has caught a real deletion once.
4. **Mutation-test the moved logic.** Break one real rule, confirm a _named_ test fails, restore
   from a backup copy and `diff` to prove the restore is byte-exact.
5. Gates before commit: `nx run desktop:type-check`, `nx run-many --target=lint --projects=desktop`,
   `nx test desktop`, **`nx build desktop`**, `npm run quality:file-size`,
   `npm run quality:attribution`, `npx nx format:check`, `git diff --check`. For Rust also
   `cargo clippy --all-targets` and `cargo test --lib`.
6. Branch from `main`, one seam per PR, update `CHANGELOG.md` and `DUTY_WATCH.md`, open against
   `main`.

## Traps that have actually fired

- **`nx build desktop` is the gate that reads templates.** Type-check, lint and the full unit suite
  all passed on a tree where a stylesheet had lost a closing brace, and again on a tree where a
  child's template named a member it did not have. Only the build caught either. On a move-only
  change the build is not redundant.
- **A mutation run from the wrong directory looks exactly like a passing one.** Print a `MUTATED`
  confirmation from the script itself and use absolute paths.
- **Never restore a mutated file with `git checkout` if it is untracked** - it silently fails. Copy
  from a backup and `diff`.
- **Angular style encapsulation stops the parent's CSS at a child's boundary.** Classes that read
  like global utilities are usually page-local. Copy them, or hoist them - but decide, and write
  down which.
- A long-running branch always conflicts in `CHANGELOG.md` and `DUTY_WATCH.md`. The conflicts are
  always pure additions on both sides: keep both, newest on top.
- `npm run web:build` regenerates `apps/web/public/sitemap.xml` with a new date. Discard it.
- The correct format command is `npx nx format:write`, not `npm run format:write`.
- Open PRs against `main` only. Stacked PRs break CI with `fatal: ambiguous argument 'main'`.
- **A new migration that lives only on a branch bricks the dev app when you switch away from it.**
  sqlx refuses to start with `migration N was previously applied but is missing in the resolved
migrations`, and it surfaces as a macOS crash dialog. Merge a migration early, or stay on its
  branch.

## Two audits are already done. Do not repeat them.

### Discover - one cut landed, next cut identified

`discover.component` was the worst set in the repository. After #320: scss **1466**/400, html
**808**/300, ts **890**/400 (from 1915 / 1070 / 1069).

The template is divided by comment banners. What is left, measured:

| block             | template lines | symbols it names |
| ----------------- | -------------- | ---------------- |
| Job detail screen | 254            | 22               |
| Filter row        | 226            | 35               |
| Feed list         | 146            | -                |

**Take the job-detail screen next.** It is an entirely separate screen gated on `detailRow()`, it
names the fewest symbols, and it fits the 300 template budget. Its helpers (`ago`, `initials`,
`srcLabel`, `ringDash`, `tipText`, `archBadgeLabel`) are shared with the feed list, so they want to
become pure exports - four of the six already are pure, and `ago` needs its `now` injected to be
testable at all.

The filter row is the harder cut and should come after: 35 symbols, and it shares the `toggled` set
helper with four other filters (that one is already a pure export in `discover-sources.util.ts`).

### Profile - audited, and it has a blocker to decide before cutting

`profile.component.html` is 1037/300, the largest template outside Discover. Sections:

| section      | template lines |
| ------------ | -------------- |
| Editor       | 643            |
| AI Tools     | 162            |
| Target roles | 113            |
| Photo        | 65             |
| Header       | 54             |

The editor is five collapsible sub-sections (experience 133, languages 126, education 93, skills 59,
parse preview 53), so it is five candidate children rather than one.

**Target roles looks like a perfect seam and is not.** Its five symbols (`addArchetype`,
`removeArchetype`, `updateArchetype`, `isMatchable`, `archetypes`) are used nowhere else, and the
mutations are pure local signal updates that never touch the database. It was extracted; the
component compiled and the app built. **Then the styles stopped it: 23 of the block's 29 classes are
still used by the page.** `collapse-card`, `section`, `info`, `status`, `chevron`, `btn-dashed` and
`btn-ghost` are the shared vocabulary of all five sections, and the skills section reuses
`archetype-card`, `archetype-input` and `archetype-list` for its own rows. That branch was discarded
rather than left half-done.

So **profile's blocker is its shared style vocabulary, not its markup.** The preparatory PR is to
hoist that vocabulary into a partial emitted globally from `styles.scss` - the same move
`_editor-shell.scss` records for the document editors and #320 made for Discover's controls. It
shrinks `profile.component.scss` (733/400) on its own and makes **all five** later section cuts
cheap instead of one.

**Put this to the maintainer before doing it.** It would be the second global partial in two
sessions, which turns a one-off into a pattern, and that is a decision about how this codebase
organises its CSS - not one to make while cutting a file down.

## Other targets, untouched and unaudited

`onboarding.component` (html 878/300, scss 1045/400, ts 1002/400) is the largest remaining set after
Discover and Profile, and all three of its files are over. `cv-preview.component` (html 895/300, ts
1049/400) and `cover-letter-detail.component.html` (911/300) are next. None has had a seam audit.

## Open follow-ups, not part of the campaign

Both were found while fixing user-reported bugs and were deliberately left out of those PRs:

- **A CV that finishes generating after its page was replaced does not appear until the page is
  reopened.** `LinkedDocumentsService` is component-scoped, so the result lands on the destroyed
  page's signals. The document is written to the database correctly and the badge clears; only the
  view is stale.
- **A database newer than the running app aborts instead of explaining itself.** The unwrap in
  `lib.rs:36` runs inside tao's `did_finish_launching`, a non-unwinding context, so it becomes an
  abort with a full backtrace and a macOS crash dialog. Real for a user who reinstalls an older
  release, not only for developers.

## Housekeeping

A `npm run desktop:dev` process may still be running. Check with `pgrep -fl "tauri dev"` and stop it
if it is not wanted.
