# Current Operational State

- **Current version**: `0.29.2`, **published**, and the first Applye release that ships an installer
  for every platform: macOS on both architectures, Windows `.msi` and `.exe`, Linux
  `.deb`/`.rpm`/`.AppImage`, each with its `.sig`, plus `latest.json`. All four matrix jobs passed.
  The superseded `0.29.1` draft was deleted; its tag remains, because `CHANGELOG.md` links to it.
- **The auto-update channel is live and was verified end to end after publication.**
  `releases/latest/download/latest.json` returns the manifest (version `0.29.2`, eleven platform
  entries), and the bundle URL inside it streams 16,448,597 bytes without authentication - the same
  file whose signature was checked. Every one of the seven `.sig` files verifies against the public
  key in `tauri.conf.json`: minisign `ED`, BLAKE2b-512 prehash, key id `38239e44c1408967`. That
  check matters because a key mismatch fails **after** the download, on the user's machine.
- **What the smoke test covered, and what it did not.** Mechanically verified on the packaged
  Apple Silicon build: `Info.plist` reads `0.29.2` and `dev.applye.app`, the binary is `arm64`, the
  embedded frontend carries its stylesheet link and **no** `onload=` handler - the exact shape that
  rendered `0.29.0` unstyled - and the app launched against an isolated `HOME`, survived, wrote
  nothing to stderr, and applied **all 28 migrations** on a fresh database with zero failures,
  including `0028` with its three identity columns. **The window has now been seen.** The packaged
  `0.29.2` was installed from `Applye_0.29.2_aarch64.dmg` and opened on macOS: the Dashboard renders
  styled, with the sidebar, the four counters and the recent-jobs list populated from the real
  database. That closes the check that had been open since `0.29.0` shipped unstyled.
  **Still not verified:** anything at all on Windows or Linux. The `.rpm` remains the least
  exercised artifact.
- **The macOS bundle is unsigned and Gatekeeper rejects it.** `codesign -dv` reports
  `flags=0x20002(adhoc,linker-signed)`, the bundle carries **no `_CodeSignature` directory**, and
  both `codesign --verify --strict` and `spctl -a -t exec` fail with
  `code has no resources but signature indicates they must be present`. Reproduced on the pristine
  dmg, on the `0.29.0` dmg and on a local release build, so this is the standing state of macOS
  packaging rather than a `0.29.2` regression. A user who downloads the dmg gets the quarantine
  flag, and the app then either shows "Applye quit unexpectedly" or starts with no window; it runs
  only after `xattr -dr com.apple.quarantine`. **The download the site offers does not open on a
  clean Mac.** No Developer ID signing or notarisation step exists in the release workflow.
- **applye.dev offers the download.** Both flags are now `true`/`false` respectively and the site is
  deployed from `25fb22e`: the hero's primary control is **Download**, "coming soon" appears zero
  times in the served HTML, `/changelog` heads at `[Unreleased]` above `[0.29.2]`, and the GitHub
  links are live. Verified against the live site, not the build output.
- **The two checks nobody has run** are both short and both need a human: look at the packaged macOS
  window and confirm it renders styled, and let an installed `0.29.1` offer the update so the
  download-and-install path is exercised once. Everything else about the release is verified.
  Three bugs had to be fixed to reach a
  CI-built bundle at all, all invisible for the same reason - Actions was blocked while the repository was private, so
  CI never reached a build step: `frontendDist` resolved one level short, the packaged app rendered
  unstyled because Angular's `inlineCritical` hides the stylesheet behind an inline handler the CSP
  forbids, and `beforeBuildCommand` called `nx` without `npx`.
- **`cv-preview.component.ts` 413 -> 355/400 - under budget, and the campaign's worst file is closed.**
  The repository count goes **23 -> 22**. `CvPreviewEditModeService` takes `editing`, `selKey`,
  `focusKey`, `isEditingLeaf`, `startEditing`, `finishLeafEdit`, `returnFocusTo` and the focus effect.
  **It was not planned.** The header pilot needs `isEditingLeaf` and `finishLeafEdit`, which amendment
  sixty-one had deliberately left behind; the alternatives were passing bound methods as inputs (a smell
  the remaining seven blocks would each repeat) or `inject(CvPreviewComponent)` (re-coupling what four
  PRs decoupled). **Reaching 400 was a side effect** - four earlier cuts aimed at the number and missed;
  this one aimed at a dependency and cleared it by 45 lines. Two mechanics worth remembering: a service
  whose inputs arrive through `bind()` **cannot create its `effect()` in the constructor** (`focusKey`
  reads `deps`, which does not exist yet), so it is created inside `bind()` with an explicit
  `inject(Injector)`; and `editing` became a **getter**, because `cv-detail` reads it through this
  component and the name had to survive. `CvPreviewEditModeService` injects `CvPreviewSelectionService`
  rather than taking it as a dep - both sit on the same element injector, and that is the shape the atom
  children will use. Counts 267/3066 -> **268/3071**. **Next first action:** the header pilot itself,
  now genuinely unblocked - a thin `ng-template` wrapper delegating to `cv-preview-header/`, the child
  injecting all four services and threading `section`, `photoUri`, `placement`, `renderMode`,
  `includeBirthdate`, `includeMaritalStatus`, with `:host { display: contents }`.
- **`cv-preview.component.ts` 535 -> 413, and the planned order was backwards.** The session opened on
  the previous entry's next action - split the 895/300 template, starting with `#headerTpl` - and
  stopped before editing anything, because a **decision recorded on 2026-08-04** had already forbidden
  exactly that: every atom template shares one selection-and-editing protocol, so a child component
  would thread ~20 members through its input boundary against a campaign precedent of **eleven**.
  Measured against today's file, `#headerTpl` needs **sixteen** - the decision still binds. **But it had
  aged in a way that inverts the order.** When it was written the protocol was one class; #436 and #437
  turned `edit` and `css` into component-provided injectables a child resolves for free through the
  `ng-template`'s declaration injector, leaving one family behind. **So selection is the prerequisite
  for the template split, not its reward**, and it moved into `CvPreviewSelectionService` (provided
  beside the other two, `bind()`-ed to `selection`/`interactive`/`t`/emit). **The template is untouched
  by design**: the moved methods have **317** call sites there, up from #438's count of 239, and
  amendment sixty's ruling stands - so the class keeps one one-line delegator per method, each of which
  dies with the atom block that calls it. `@HostListener` stayed (a service cannot carry one) but
  delegates to `clearOnBackgroundClick`; edit-mode and focus stayed as a separate concern. **Sixteen
  new tests mount nothing** - that the spec can exist is the claim, being the same freedom the child
  components will need. Counts 266/3050 -> **267/3066**. **Next first action:** the header pilot as
  originally scoped - a thin `ng-template` wrapper delegating to `cv-preview-header/`, the child
  injecting all three services and threading about six inputs, with `:host { display: contents }`
  against the host-element trap that has cost this campaign four regressions, verified against **both**
  the measure pass and the visible page card. 23 files remain over budget; this one is 413/400.
- **`cv-preview.component.ts` 597 -> 535, and the template is now the constraint on the class.**
  Shipped as **#438**. Selection re-measured largest (128 lines against the atom flattening's 96), but
  it has **239 template call sites**, and prefixing them - the mechanism both earlier cuts used - would
  have wrapped eighteen bindings past 100 columns in a template that is 895/300 and may not gain a
  line. **Any block the template calls heavily cannot leave until the template itself is split.** The
  cut therefore went to `buildCvAtoms`, which the template only consumes as `atoms()`. It is a **pure
  function over an explicit context, not a service**: the block reads thirteen signals and owns no
  state, so a `bind()` would have carried thirteen fields where a context object costs about twenty
  lines at the call site. The rule this level has converged on is `bind()` when a block owns state, a
  pure function when it owns a calculation. Seven new tests assert the flattening without mounting the
  preview - photo folding into the header, empty sections skipped, section order, and the two glue
  rules. **A rendered check first looked like a regression and was not**: two entries of fourteen
  identical bullets drew one page and the tail read as if an entry had been dropped, but 33 atoms is
  exactly 1+1+1+15+15 and the content fits one A4 page; with thirty bullets each it pages correctly at
  `[40, 24]`, captioned "Page 1 of 2". Counts 265/3043 -> **266/3050**. **Next first action:** the
  895/300 template - it now blocks the class as well as being the worst file by ratio. Split it into
  child components, watching the host-element trap that has cost this campaign four regressions; then
  selection becomes cuttable. 23 files remain over budget.
- **`cv-preview.component.ts` 816 -> 597, and the slice taken was not the slice planned.** Shipped as
  **#437**. The agreed order was selection next, but that plan was made against the 1047-line file;
  after the editing cut the blocks measured differently - selection 120 non-empty lines, **styling
  228**, with thirteen of its eighteen `this.` reads being the document style. Re-measuring cost one
  command and moved 108 more lines. **A decomposition plan is a hypothesis about a file the previous
  cut has already changed.** `CvPreviewStyleService` owns the effective per-section style and every
  `[ngStyle]` map the template asks for; it takes style, selection, theme and host through `bind()`
  rather than injecting them, because those are the component's own inputs and a second source would
  be a second truth. `readSelectedHostStyle` measures the live DOM, which settles the layer question,
  and the component keeps a one-line delegator because `cv-detail` samples the selected host through
  the child. `cv-preview.harness.ts` now hands the service to the specs - 44 assertions moved from
  `component.<cssMethod>()` to `styles.<cssMethod>()`. **A regex lookbehind hid six call sites**: the
  spread operator ends in a dot, so `...entryCss(` and `...leafCss(` were skipped silently; the audit
  after a regex rewrite has to look for what was _not_ changed. The injected name is `css` because
  the longest binding measured 92 columns and the gate reads a Prettier wrap as growth - measured
  before the rewrite this time. Counts unchanged at 265/3043. **Next first action:** the selection
  state machine (~120 lines, `cv-preview.selection.spec.ts` covers it), which takes the file to
  roughly 480, then the 895/300 template. 23 files remain over budget.
- **The worst file in the app is 1047 -> 816.** Shipped as **#436**. `cv-preview.component.ts` was
  one class rendering the CV, running a selection state machine and hosting seventeen inline-editing
  handlers. The editing family is now `CvPreviewEditingService` beside it - the draft map, every
  section's commit rule, the `**bold**` helpers - **a service rather than a store**, because it types
  on `HTMLTextAreaElement` and keys drafts by DOM id, which is the rule that kept `scrollToTop` in
  the app (amendment fifty-four). **The cut line came from the spec files, not from the class**:
  `cv-preview.editing.spec.ts` and `cv-preview.bullet-editor.spec.ts` had already drawn it.
  `canBoldActiveEditor` and `applyBoldToActiveEditor` stayed behind deliberately - they answer which
  editor is on screen, which is about the page rather than the draft. The component binds the emit
  callback once in its constructor, so the service never reaches for an output it does not own; the
  alternative, seventeen wrapper methods, would have returned most of the saved lines. **The template
  cost two characters**: prefixing its 70 bindings with `editor.` pushed three past 100 columns,
  Prettier wrapped them, and the gate refused the file at 903/895 - a wrap is growth. The injected
  name is `edit` and the template is unchanged at 895. Counts unchanged at 265/3043;
  `cv-preview.identity.spec.ts` reads the draft where it now lives, which is the identity that suite
  exists to pin. **Verified on a rendered screen**, because the specs call these methods directly and
  would not notice a mis-wired seam: click selects the summary body with `elementPath: 'summary'`,
  double-click mounts the editor, typing puts the draft in the service, blur emits a new section
  through the component's output. **Next first action:** the selection state machine out of the same
  file (~230 lines, `cv-preview.selection.spec.ts` covers it), then the 895/300 template.
- **Level three is open: 25 files over budget became 23.** Shipped as **#435**, and the first cut was
  chosen for being unable to fail invisibly - `analytics.ts` and `profile-markdown.ts` are pure
  functions with no Angular and no I/O, so the gates are the whole proof and no rendered check
  applies. `analytics.ts` **665 -> 195** as `analytics.model.ts` (234, view types and thresholds),
  `analytics-metrics.ts` (208, the seven per-metric computations), `analytics-buckets.ts` (158, the
  date and histogram arithmetic they share) and `computeAnalytics`, which composes them.
  `profile-markdown.ts` **622 -> 320**, split by the entity each parser owns: education (103),
  experience (154), languages (40) and the profile's own pay expectation to `compensation-target.ts`
  (63) - **named against a collision**, since `compensation.ts` beside it reads a _job's_ advertised
  salary and the two are complementary rather than duplicated. Specs followed their code, which also
  took `profile-markdown.spec.ts` off the near-budget list at 559/600. Counts 262/3043 ->
  **265/3043**: three new spec files, not one assertion gained or lost. TypeScript source over
  budget **12 -> 10**. **Two silent failures were caught by counting rather than by reading a
  summary**: a spec stopped _running_ on a stale type import and the runner said `445 passed, 0
failed` where the file holds 466; and an edit script matched an anchor Prettier had reformatted,
  so it changed nothing and reported nothing, because it carried no assertion. **Level three is not
  level two**: nothing here is in the wrong layer, so there is nothing to relocate - the work is
  decomposition by responsibility, and the cut lines are a design decision. **Next first action:**
  `cv-preview.component.ts` at **1047/400**. Its seventeen inline-editing handlers (~270 lines,
  covered by `cv-preview.editing.spec.ts` and `cv-preview.bullet-editor.spec.ts`) come out first,
  into a component-provided service in the same folder - not `libs/application`, because they type on
  `HTMLTextAreaElement` and key drafts by DOM id, which is the rule that sent `scrollToTop` back to
  the app in #428. Selection follows in its own PR, then the 895/300 template.
- **The gateway lint rule is kept and widened; `ADR-0005`'s enforcement questions are all now
  answered.** Shipped as **#434**. It named `DbService` alone, which is how three components
  injecting `AiService` and one injecting `JobSourceService` stayed invisible to it until #433. The
  selector is built from a `GATEWAY_SERVICES` list now, so a fourth service is one line.
  **Retiring it was the serious alternative and was rejected on two stated grounds**:
  `@nx/enforce-module-boundaries` covers strictly more - every app file, every service in `libs/data`
  - but reports a list of tags and takes **no custom message**, while this rule names the ADR and says
    put the read in a store; and a data service re-exported through `@applye/application` would satisfy
    the tag check with `inject()` as the only remaining evidence. `COMPONENTS_STILL_USING_THE_GATEWAY`
    and its conditional spread are deleted after running 26 -> 0. Verified in both directions: a probe
    component injecting all three errors once per injection, the tree lints clean, and the probe was
    deleted in the same command. Configuration only - 262 suites / 3043 tests unmoved. **Next first
    action:** level three, the file-size budgets. 25 files are over, the gate passes only because it
    forbids growth rather than size, and the worst is `cv-preview.component.ts` at **1047/400**, which
    this campaign has never touched. Full audit: `node tools/check-file-size-budgets.mjs --all`.
- **The app cannot reach `libs/data` any more. `type:data` is out of `type:app`'s allowlist, and the
  item amendment four opened is closed.** Shipped as **#432** and **#433**. **Thirty-two files stood
  in the way, not the two the checklist named** - the previous entry's blocker list came from an
  import grep, and the way to test such a list is to flip the constraint and read the errors, which
  takes a minute. Twenty-five were **spec files** stubbing the gateway their unit's store needs; they
  are exempt from this one constraint through a scoped config block, because a spec fakes its unit's
  collaborators and that is wiring rather than a dependency direction. `*.harness.ts` is covered too,
  since `onboarding.harness.ts` imports `TestBed` and is a spec in everything but its name. Of the
  seven production files, only two were the expected kind: `cv-photo-prompt` and `followup-draft`
  moved to `libs/application` in #432. **Three injected `AiService` and one `JobSourceService` - a
  second gateway `GATEWAY_INJECTION` never guarded**, since that rule names `DbService` alone. One
  was a type-only import of `CliStatus`, which moved to `libs/core` next to `AiProvider`. And
  `jobs.component.ts` injected `AiService` **without ever calling it** - the second dead injection
  this campaign has found (979 -> 977). #433 took the last two components' state into stores:
  `ProfileImportStore` (the `profile-import` parse; `fullMd` stays on the page and arrives as an
  argument) and `PasteJobStore` (the modal's ten signals and both ways it makes a job; a submit
  returns the new job's id and the component still closes and navigates, because the modal is the
  shell's). `paste-job-modal.component.ts` **245 -> 128**. **The clipboard read stayed in the app on
  purpose**, behind the guard that only fires while the modal is open; the store is handed the text
  and only judges it, which is what finally made `looksLikeJobDescription` testable - it had no tests
  and has five. **The rule was verified in both directions** (amendment four's own standard): a
  throwaway `boundary-probe.ts` importing `DbService` errors, and all 25 specs pass; the probe was
  deleted in the same command that created it. **A privacy guard failed loudly and correctly**:
  `followup-no-transmit.spec.ts` identifies its subject by file path, so the move threw `ENOENT`
  rather than passing over a file that was no longer there. Counts 260/3033 -> **262/3043**, the ten
  new tests all coverage that did not exist. **Next first action:** decide the fate of the
  `GATEWAY_INJECTION` component rule itself - it now guards one of the three data services, its
  allowlist has been empty since amendment forty-seven, and the boundary rule catches the same class
  repository-wide; either widen it to `AiService` and `JobSourceService` or retire it, but do not
  leave it describing a third of the problem.
- **`apps/desktop/src/app/shared/` holds no services at all. Level two, item three is closed.** All
  seven moved, in five PRs - **#427** the toast store, **#428** the wizard navigator, **#429** the
  document export, review status and discard services, **#430** the job actions and portal answers,
  **#431** the cover-letter tailor split. **Two of the three walls the plan named were not walls.**
  `ToastService` is 91 lines of signal state depending on nothing but Angular signals and
  `TranslateService`, so it moved to `libs/application/src/lib/shell/` as the store it always was,
  with `toast.component`, `toast-container.component` and `toast-error.handler` left in the app;
  that one move unblocked all four coupled services, and **no outcome pattern was needed**.
  `TranslateService` blocked nothing at any point - `libs/i18n` is tagged `type:util`, and twelve
  files in `libs/application` already imported it. `wizard-nav` moved too, against amendment
  fifty-three's "never moves": the reasoning was right and the unit was wrong - only `scrollToTop()`
  is view, and it had four call sites rather than two, because `goTo()` and `close()` scroll
  internally. The store now publishes a `scrollTick` counter and the page satisfies it through
  `scrollOnTick()` in `apps/desktop/src/app/core/scroll-to-top.ts`, which is the general shape for a
  store that needs something done to the DOM. `cover-letter-tailor` was the one real split, 305
  against the 250 budget: `BaseLetter`, `emptyBaseLetter`, `readBaseLetter` and
  `buildTailoredContent` to `libs/core`, the rest at **206/250**. `jobs.component.ts` went **980 ->
  979** while gaining an effect, by merging six of its seventeen separate `@applye/application`
  import statements. **A store may name `@tauri-apps`**: `document-export` calls
  `await import('@tauri-apps/plugin-dialog')`, which a dynamic import hid from two greps, and it was
  ratified rather than reverted - this layer has always reached Tauri through `DbService` and
  `AiService`, and the nx boundary rule constrains workspace libraries, not npm packages. Counts
  reconciled at every step against a `main` baseline taken in a separate worktree: 258/3028 ->
  **260/3033**, the five new tests being the scroll helper's own. Four of the five PRs were checked
  on a rendered screen. One flake reproduced and not introduced: `cv-detail.component.spec.ts` failed
  once at 48.9s under seven-project parallel load and passed 3/3 in isolation at 1.7s (debt twelve).
  **What is left in `shared/`:** `job-identity-prompt/`, `page-title/`, `paste-job-modal/` and
  `unsaved-job-prompt/` - four component folders, which are UI and stay. **Next first action:**
  remove `type:data` from `type:app`'s allowlist in `eslint.config.mjs`, which is now blocked only by
  `cv-photo-prompt.service` (injects `Router`) and `followup-draft.service`, both kept out of
  sub-step five deliberately; the Tauri question for the second is already answered above.
- **`shared/` is down to seven blocked files, and every remaining one is blocked for a named reason.
  Sub-step 4b is closed.** Five more modules moved to `libs/application/src/lib/jobs/`: the
  final-checks step, the wizard progress record, the document review targets, job scoring and its
  payload builders. It needed no new decision - only the application of one this ADR made twenty
  amendments ago. `final-checks` and `wizard-progress` injected `DOCUMENT` for exactly one expression
  each, `document.defaultView?.sessionStorage`, and **amendment thirty-three had already ruled that
  browser storage is not a DOM exclusion** when `sidebarCollapsed` moved as `globalThis.localStorage?.`
  and a storage token was refused. Both now read `globalThis.sessionStorage?.`; the other two were
  blocked only behind `final-checks`. Shipped as three PRs: **#424** split `job-scoring` 300 -> 242 and
  collapsed three hand-written copies of the same fourteen-field payload into
  `scoreCacheSaveInput`/`tailoredScoringCache`/`postTailorSaveInput`, whose differing defaults are
  deliberate and now documented; **#425** rewrote the storage seam; **#426** moved all five. Counts
  reconciled at every step, totals never moved: `application` 100/1276 -> **104/1333**, `desktop`
  114/1135 -> **110/1078**. **The fake that came out was honest, unlike the last one** - the stub
  `DOCUMENT` in `final-checks.service.spec.ts` implemented only `getItem` and `setItem`, and all 19
  tests pass unchanged against jsdom's real `sessionStorage`; it was replaced for better evidence, not
  because it lied. Verified in a browser three times and compared against `main`: byte-identical
  `applye:wizardProgress` and `applye:wizardFinalChecks:h599` on every run. **What is left in
  `shared/`:** four files on `ToastService` (`cover-letter-tailor`, `document-review-status`,
  `job-actions`, `portal-answers`) with `tailoring-discard` transitively behind them,
  `document-export` on `@tauri-apps/plugin-dialog`, and `wizard-nav` on real layout DOM - **which
  never moves**, since `querySelector` and `scrollingElement` are view. **Next first action:**
  sub-step five, the four `toast.service` couplings, which need an outcome rather than a relocation
  (ADR-0005, amendment fifty-three).
- **Sixteen files left `apps/desktop/src/app/shared/` for `libs/application`. Level two, item three,
  sub-step four is closed - and the "22" it was written around was never a count.** The figure came
  from a table that says "seventeen services" and then lists 6 + 4 + 22, and it counted direct
  blockers only, so everything blocked transitively sat on the wrong side of it. Every one of the 26
  non-spec files was read and classified on its real import list plus the transitive closure:
  **15 movable, 11 blocked**. Two the canon called blocked were not - `job-identity-resolver` imports
  the _service_ in `shared/job-identity-prompt/`, not a component, and `job-intake` sat behind it; the
  prompt service moved with them, so the count that shipped is sixteen files. Shipped as three PRs
  because the size gate forces split-before-move and the two families have zero import edges between
  them: **#421** split `tailoring.service` 305 -> 226 into a pure `tailoring-pass.ts`, **#422** moved
  ten document-generation modules, **#423** moved seven jobs and wizard modules. **The 250 budget
  covers every non-spec file in `libs/application`, not only `*.store.ts`** - that is what forced the
  split first, and `job-identity-resolver` landed at 245 with three lines of margin.
  `coverLetterHashInput` collided on arrival with the editor's per-block hash of the same name and
  became `coverLetterDraftHashInput`, symmetrical with `cvDraftHashInput`. Counts reconciled on every
  step, totals never moved: `application` 85/1096 -> **100/1276**, `desktop` 127/1287 -> **113/1123**,
  `core` **25/461**. **The rendered check found a defect the gates did not, and it is not ours:**
  generating a CV draft links the row correctly and its card still renders `Missing` -
  `cvReviewStatus()` computes `'linked'` while the DOM badge is `badge--doc-missing`, so the view
  never re-rendered. It reproduces identically on `main` at 17e6bbf and is filed separately.
  **Next first action:** sub-step 4b - rewrite the `sessionStorage` seam in `final-checks` and
  `wizard-progress` to `globalThis.sessionStorage?.` (the ruling already made in ADR-0005 amendment
  thirty-three), which unblocks `document-review-targets` and `job-scoring` behind them; `job-scoring`
  at 319 needs its own split first, and `wizard-nav` never moves because `querySelector` and
  `scrollingElement` are view. Then sub-step five, the four `toast.service` couplings (ADR-0005,
  amendment fifty-two).
- **The pass-in seam is gone. Level two, item three, sub-step three is closed.** Eleven files in
  `libs/application` took a codec object or a callback justified by a boundary that no longer exists;
  all eleven now import from `@applye/core` directly. `CvCodec`, `CvGenerateCodec`,
  `CvRegenerationCodec`, `CoverLetterCodec` and `CvContentNormalizer` are gone, `cv-codec.ts` is
  deleted along with its barrel export, nine store methods lost an argument, and six call sites in
  `apps/desktop` stopped building codec literals. **The count in the previous entry was wrong in both
  directions** - it came from grepping the explanatory comment, which finds eight files, one of them
  (`tracker-report.ts`) a false positive; four more files consumed the interfaces without repeating
  the comment. A twelfth, `cv-style.store.ts`, carried only the stale sentence and keeps its design
  with a corrected one. Shipped as two PRs: `parseCoverLetterResponse` into `libs/core` first (the one
  parse that existed nowhere but as an inline lambda on a page), then the removal. **Removing the seam
  removed the mocks with it, and four expectations turned out to describe behaviour the app never
  had** - an identity normalizer was hiding the `personal_details` section every real load inserts,
  and a fake `mergeSection` appended where the real one rewrites in place. Counts hold: `core`
  25/453 -> **25/461**, `application` **85/1096**, `desktop` **127/1287**.
- **The `cv-content` family is in `libs/core`. Six of the seventeen blocked services are unblocked.**
  Seven files - not six; `cv-style-scope.util.ts` turned out to be consumed by `cv-style.store.ts`,
  one of the workaround files - moved to `libs/core/src/lib/cv/` with their specs, 53 import
  sites across 31 files rewritten to `@applye/core`. The barrel inside `cv-content.util` is gone;
  `@applye/core` is the single specifier now. Counters reconciled both ways: `core` 18 suites/301
  tests -> **25/453**, `desktop` 134/1439 -> **127/1287** (ADR-0005, amendment fifty).
- **Level two item three is mapped, restated, and its first blocker is cleared.** The checklist said
  "move the app's `shared/*` services into `libs/application`". `shared/` is **34 files, 3886 lines**
  and holds four components plus `page-title.service`, none of which may go there - so the item is
  restated as **sorting**, not moving. **17 services inject the gateway** (2929 lines; three over
  budget: `cover-letter-tailor` 305, `job-scoring` 300, `tailoring` 298), and they divide by blocker:
  6 behind `cv-content.util`, 4 behind `toast.service`, the rest free. **The highest-leverage move is
  not a service:** the `cv-content` family is 1287 pure lines importing only `@applye/core`, sitting
  in `apps/desktop`, and **files in `libs/application` already carry documented workarounds for
  its absence** (eleven of them, once counted by consumer rather than by comment - see the entry
  above). The size gate refuses to receive a moved file that is over budget - it reads a
  rename as an add - so `cv-content.util.ts` was split in place first: **596 -> 352**, plus
  `cv-selection.util.ts` 155 and `cv-page.util.ts` 116, barrel unchanged, all 43 consumers untouched.
  **Next first action:** move the six-file family to `libs/core` - now genuinely imports-only - then
  retire the workarounds in a separate PR (ADR-0005, amendment forty-nine).
- **`app.ts` is migrated and the lint rule now covers it. Level two, item one is closed.** It held the
  last `inject(DbService)` in a component anywhere in the app, and the rule never fired on it - the
  pattern matched `*.component.ts` and that file is not named like one, so **the allowlist read 26
  where 27 files were injecting the gateway, for the whole campaign**. `FirstLaunchStore` is
  `BootGateStore` and owns both directions of the same two settings flags: `load()` answers
  `'first-launch' | 'onboarding' | 'app'` and fails open, `dismiss()` records it. The rule's pattern
  is `['**/*.component.ts', '**/app.ts']`, documented as a convention check rather than a proof - an
  off-convention component name still slips through, and the fix for that is the convention. Its
  error message no longer points at the empty allowlist. **The rule can now be deleted whenever it is
  judged to have served its purpose; nothing is hiding from it.** `app.ts` 66/400,
  `boot-gate.store.ts` 74/250. **Next first action:** level two, item three - move the app's 18
  `shared/*` services into `libs/application`, decomposing the ones over 250 lines. Item four, the
  `type:data` allowlist flip, unblocks only after that (ADR-0005, amendment forty-eight).
- **`COMPONENTS_STILL_USING_THE_GATEWAY` is empty. Level one of ADR-0005 is closed.** 26 -> 0, first
  entry deleted 2026-08-07, last 2026-08-11. `JobDetailStore` in
  `libs/application/src/lib/jobs/job-detail.store.ts` (142/250) owns the job page's four data paths;
  `jobs.component.ts` is **980/400** and injects no gateway. The lint rule **stays** and now binds
  every component - it is deleted only when `app.ts` is dealt with, because that file injects the
  gateway outside the rule's `*.component.ts` glob and the rule is the only pressure on it.
  **A bug was fixed on the way:** `matchingCvs` had two writers and two meanings, so returning from
  the document editor replaced the narrowed base-CV offer with the whole library, in every language.
  One writer now, verified on a rendered screen. **Next first action:** level two, item one - decide
  whether the rule's glob widens to catch `app.ts` or `app.ts` is migrated on its own
  (ADR-0005, amendment forty-seven).
- **Jobs, part two is done: the template is under budget and the state migration is unblocked.** The
  apply wizard's last two inline steps are components - `job-update-score-step`, `job-documents-step`
  and, nested inside the second, `job-final-checks`. `jobs.component.html` is **236/300**, the
  stylesheet **186/400**, and `jobs.component.ts` **998/400** - the class is the only file still over,
  and it is the next session's job. `DocumentReviewTargetsService` is new and provided
  component-scoped: the region and language are read by six page methods and written by the step's two
  selects, so neither side could own them, and its setters hold the "changing either stales the final
  checks" rule that used to be written twice - once in a page method and once inline in the template.
  The lint allowlist is untouched at **1**. **One find, pre-existing:** the base-CV picker's
  `max-width: 760px` grid rule has been dead since that markup moved into `job-tailor-step`; it is
  documented in place rather than fixed, because restoring it changes the mobile layout
  (ADR-0005, amendment forty-six). **Next first action:** migrate `jobs.component.ts` state into
  `libs/application`, starting with a grilling round - the page injects `DbService` in eight places
  and provides eighteen services component-scoped, so it is two or three parts.
- **Jobs, part one of its decomposition, is done: five dialogs and the action row are their own
  components.** `jobs.component.ts` was **1036/400**, the template **387/300** and the stylesheet
  **289/400** - the stylesheet is under budget, the other two are not, and the template is what part
  two has to finish before any state can move. Each new component injects the service that already
  owned its state and asks the page, with an output, for what only the page can do. The lint allowlist
  is untouched at **1**. **Two finds, both pre-existing:** "tailor an existing cover letter to this
  job" is unreachable - the only method that opens its modal is called from nowhere - and that modal's
  two fields are styled with a class declared in another component's stylesheet, which has never
  reached them; the inline `style=` attributes on those fields are what actually dresses them. Both
  were moved verbatim rather than fixed (ADR-0005, amendment forty-five).
- **Jobs is moving again by extracting child components, and that is what works on the aliases.**
  `jobs.component.ts` is **1080** non-empty lines against a budget of 400, down from 1467 where the
  work started, with the template at **941/300** and the stylesheet at **860/400**. The earlier stop
  at 1104 held because nothing left had a single nameable responsibility: 110 declarations, 76
  methods, and **48 of those declarations are pure aliases** onto services. The unblocking
  observation is that the page provides seventeen services component-scoped, so a child rendered
  inside its template inherits that injector and can inject them directly - which deletes the alias
  and the template block in one move. The first cut, `app-job-document-cards`, retired nine aliases
  that way. The wizard's remaining steps are the same shape.
- **The plan changed on 2026-08-06: an application layer, and the size campaign folded into it.**
  `ADR-0005` introduces `libs/application` - page state in signal stores, budget 250 - because
  the file-size campaign was treating a symptom. Page classes reach 700 to 1000 lines because a page
  is view, state and orchestration at once, and that was measured twice: Profile stopped at 445/400
  by decision rather than technique, and Discover shrank only while pure logic remained. The rule
  binds new code now; existing pages migrate **when touched for another reason**, which is the same
  trigger the budgets already use, so the two are **one stream of work**. **The boundary is enforced by
  lint as of ADR-0005 amendment four**: a `*.component.ts` injecting `DbService` is an error unless it
  is named in `COMPONENTS_STILL_USING_THE_GATEWAY` in `eslint.config.mjs`. **That list is now empty**
  - it started at 26, only ever shrank, and `jobs` deleted the last line - so the rule binds every
    component without exception. The `type:data` allowlist flip is a separate, later goal - it keys on
    the project tag, so it also bans the gateway from the app's 18 `shared/*` services.
- **Onboarding is out of the gateway, and `jobs` is the only component left in the allowlist.** Seven
  stores in `libs/application/src/lib/onboarding/` hold what the wizard's page class used to: the five
  its steps already had, plus `OnboardingAiSetupStore` (the mode, the settings the AI step writes, and
  the dispatch every other store calls through) and `OnboardingFinishStore` (the profile and the CV
  document). `onboarding.component.ts` is **312/400**, down from 573; the template is unchanged at
  291/300, because the rebind renamed identifiers and never structure. Two shapes were forced by the
  layer boundary rather than chosen: `libs/application` has no `TranslateService` and no Tauri plugin,
  so the stores publish i18n keys and URLs and the cards render and open them; and the parse and layout
  helpers that stay in `apps/desktop` are passed in, the `CvCodec` seam. desktop 1476 -> 1417 tests,
  application 993 -> 1068 - the 59 that left arrived, 16 are new (ADR-0005, amendment forty-four).
- **All of Discover's state is in the application layer: four stores, and the page class no longer
  injects `DbService`.** `DiscoverDetailStore`, `DiscoverScanStore`, `DiscoverFeedStore` and
  `DiscoverProfileContextStore`, all component-scoped, all under the 250 budget, 78 tests between
  them. `discover.component.ts` went **884 -> 618** across the whole campaign. Building them surfaced
  two amendments to `ADR-0005`: page-local pure modules a store needs move to `libs/core` when they
  are domain (`job-scoring.ts`, `jd-blocks.ts`) and beside the store when they format for it
  (`scan-console.ts`).
- **That decision is settled, and Discover is out of the gateway.** ADR-0005's third amendment:
  **nothing in `libs/application` notifies the user** - a member returns its outcome and the component
  decides whether and how to say it. `DiscoverSourcesService` became `DiscoverSourcesStore`, its four
  writes return `{ ok, error? }`, and the Sources drawer raises all seven notifications because it
  already owned all four call sites. Components injecting `DbService`: **46 -> 45 -> 44**, and nothing
  under `pages/discover/` reaches the gateway. The `type:data` allowlist flip is now blocked only by
  the remaining pages, not by an open question. The audit that settled it also corrected the scale of
  the problem: **4 of the 19** gateway-using services notify at all.
- **The migration order was wrong, and `jobs` is deferred.** Ranked by dependency shape rather than line
  count: `jobs` (1050) makes **9** gateway calls against **22** app-service injections, so its state
  cannot move until those services do - and five of them are 251-326 lines and must decompose first.
  `cv-preview` (1049) and `cv-live-style-panel` (704) reach the gateway **zero** times, so this campaign
  does not touch them; their size is view state. **`cv-detail` is done: 1019 -> 517** across four pull
  requests - `CvPhotoStore` (#365), `CvStyleStore` (#368), `CvDocumentStore` (#369) and
  `CvRegenerationStore`. It injects neither `DbService` nor `AiService` now, so it is the **first entry
  ever deleted** from `COMPONENTS_STILL_USING_THE_GATEWAY`: **26 -> 25**, verified in both directions
  (re-adding the injection fails `nx lint`). It stays at 517/400 by decision - what is left is preview
  mode, live selection, print/export and wizard routing, all view concerns this ADR does not reach.
  **The `CvStyle` cascade did not go to `libs/core`** - its only input is one widget's wire format, and
  the helpers it delegates to were already a pure module in the app, so it is `cv-style-scope.util.ts`
  beside them (ADR-0005, amendment five). **Nothing in `libs/core` changed in this whole campaign.**
  Amendments six and seven record the three shapes a store has for code it may not import, in the order
  to prefer them, and that a store raises typed errors rather than phrasing them.
- **`tracker` is done: 667 -> 304**, four pull requests, and the **first page in this campaign to
  finish under its 400 budget** rather than by decision. `TrackerColumnsStore` (667 -> 536),
  `TrackerRowsStore` + `TrackerPrintStore` (536 -> 487), `TrackerRowEditorStore` (487 -> 444) and
  `TrackerReportStore` (444 -> 304). The page injects no `DbService` at all, so both it and
  `tracker-report-print.component.ts` came off `COMPONENTS_STILL_USING_THE_GATEWAY`: **25 -> 23**,
  each verified from the other side. It had **no test file at all** before this and now has 201, with
  every mutant in four harnesses dead except two kept deliberately and documented in place. The
  template (557/300) and stylesheet (907) are **untouched and out of scope** for this phase by
  decision - ADR-0005 reaches neither.
- **Amendment eight corrected two of the campaign's own rules**, both found by reading `tracker` rather
  than by reasoning. **A store may inject `TranslateService`** - `libs/i18n` is `type:util` and the
  boundary always allowed it; what the layer may not do is _notify_ or _phrase an error_, and a document
  it renders in its own language is neither. **Column visibility is not view state**, against the plan
  this phase inherited: it merges with gateway-loaded custom columns and feeds five derived values
  ending in the CSV and PDF exports. Also recorded there: a mutation surviving a green suite caught the
  store silently clearing the user's custom columns on a failed reload, which every fixture agreed with
  because every fixture started empty.
- **Amendment nine records PR 2's two lessons.** A second Tauri window is a second caller, so the PDF
  route shipped with the rows store rather than after it: the print window loads its own rows and
  therefore carried a verbatim copy of four period and summary rules, untested on both sides. And a
  **surviving mutant has a third outcome** beyond "the fixtures are wrong" and "the code is dead": the
  code can be genuinely unable to change the result and still worth keeping. Two are, both now
  documented in their own doc comments so the investigation is not repeated.
- Next after `tracker`: `cover-letter-detail` (**714/400**, 8 gateway calls), whose method list is
  nearly `cv-detail`'s, so the four-store decomposition should transfer - but the types do not rhyme
  with the CV ones and both should be read before anything is copied.
- **`cover-letter-detail` is done as a class: 644 -> 405 across four pull requests, and off the gateway.**
  `CoverLetterContentStore` (644 -> 592) holds the letter, its paragraphs, tone and length, the
  availability answers and the word budget; `CoverLetterStyleStore` (592 -> 557) the style and the
  debounced ATS check; `CoverLetterDocumentStore` (557 -> 517) the row and the save; `CoverLetterAiStore`
  (517 -> 405) both AI paths. The page injects neither `DbService` nor `AiService`, so its allowlist
  line is deleted: **COMPONENTS_STILL_USING_THE_GATEWAY is 22**, from 26 at the start of the campaign.
  The rule was probed both ways - it errors on the injection, it is silent without it. It is **20**
  now: `onboarding-banner` migrated to `OnboardingBannerStore`, the first store in a new
  `libs/application/onboarding/` area, and `paste-job-modal` turned out to inject the gateway without
  ever calling it - so one of the 22 was never a migration (ADR-0005, amendment twenty-five). Three
  other documents recorded the list as 26 long after it was 22; all four were corrected. It is
  **18** now: `health-check-panel` and `stage-quick-add` moved to `HealthCheckStore` and
  `StageQuickAddStore`, opening `health/` and `pipeline/` areas (amendment twenty-six). The rendered
  check that migration ran found a **pre-existing** defect it did not cause: the health check's
  `ok`/`warn`/`fail` icons all render the same colour, because the `[class]` binding on
  `<lucide-icon>` lands nothing. Filed separately; the same pattern may be inert at other call sites.
  It is **16** now: both print windows moved to `CvPrintStore` and `CoverLetterPrintStore`, and
  moving their state exposed a `signalReady()` that was byte-identical in the two components -
  extracting state exposes duplication that size was hiding. It is one `awaitPrintSettle()`, kept in
  the app because every line of it touches the DOM (amendment twenty-seven). It is **15** now:
  `profile-photo` moved, and it is the first migration where a constraint rather than a preference
  decided how much moves - `uri` is a `linkedSignal` on a required input, which a store cannot
  derive, so the store took `saving`, `cropSourceUri` and the two calls and the component kept the
  value it renders (amendment twenty-eight). It is **14** now: `interview-prep`'s list page moved
  whole - cards, computeds, row menu and delete confirmation - and its store keeps an `error` signal
  because the first draft's bare `catch` would have silently downgraded the page's toast from the
  real failure to a generic one (amendment twenty-nine). It is **13** now: the Kanban board moved,
  and it is the first store here whose principal data is **not** a signal - `cards` stays a mutable
  record because CDK's drag-drop mutates the arrays it is handed, and converting that is its own
  decision with its own risk rather than a side effect of a migration (amendment thirty). It is
  **12** now: the quick-view modal followed its board, and the card stayed on the component for a
  second reason worth knowing - the board mutates those card objects **by reference**, so a copy in
  a store would be one the store could not keep in sync (amendment thirty-one). It is **11** now: the
  dashboard moved, and what stayed behind states the boundary most clearly - its action queue carries
  icons, translations and navigation closures, so the store supplies the facts and the page builds the
  cards. `monogram` was deliberately **not** folded onto `companyInitials`: they differ on the empty
  company, `?` against `-`, and a comment now says they are two rules that look alike rather than one
  rule written twice (amendment thirty-two). It is **10** now: the shell moved, and half of what its
  single gateway call loaded was dead - `aiMode` was written on every launch and read nowhere since
  the sidebar indicator it fed left the template, so it was deleted rather than migrated. The store
  reads the stored UI language and the shell applies it, because `setLocale` is an i18n side effect
  this layer does not perform; the sidebar rail preference moved with its `localStorage`
  persistence, the first browser storage in `libs/application` (amendment thirty-three). It is **9**
  now: analytics moved, and it is the first page whose domain math was already down in `libs/core`,
  so the store owns only the facts and the period while ten translated computeds stayed put. The
  migration fixed a real defect on the way: `computeAnalytics` was called with `new Date()` **inside**
  a computed, so the window boundary was re-read on every period switch - `now` is stamped at load
  now, as `DashboardStore` already did (amendment thirty-four). It is **8** now: the first-launch
  welcome moved, and its store holds no state at all - the screen has none, only a settings write,
  and the lint rule is about the gateway rather than about signals. Reading it found that **`app.ts`
  injects the gateway outside the rule's reach**, because the rule matches `*.component.ts`; the
  allowlist has been undercounting by one all along, and it is filed on the ADR checklist rather
  than fixed inside a migration (amendment thirty-five). It is **7** now: My Jobs moved as **two**
  stores, because it was two features - a table and a tracklist import wizard - and one store would
  have opened at the 250 budget with the read-only table depending on `AiService`. The rows stayed in
  `libs/data`, so this is the first store here that depends on another store rather than on the
  gateway. Moving the state also forced a real distinction into the open: "no jobs at all" is a
  different screen from "the filters hid them" (amendment thirty-six). It is **6** now: profile - the
  page this ADR stopped once at 445/400 - moved as **three** stores. Two were chosen at the grilling
  gate on an estimate that proved a hundred lines wrong; the file-size gate refused the result at
  324/250, and the decision went back to the maintainer with the real number. The extra store split
  "what is saved" from "what is being typed", and `persist` remains the single writer of the row so
  the scoring hash cannot lag it. A defect was fixed on the way: a failed `hashText` used to reject
  out of the page's click handler with nothing shown (amendment thirty-seven). It is **5** now: the
  interview stage detail screen moved - eight gateway calls, the densest entry left - and its store
  landed at 217/250 only because the pure form module belonged beside it anyway. A second
  contract gap was fixed on the way: refusal paths returned before clearing `error`, so a refusal
  after a failed load kept the earlier message (amendment thirty-eight). It is **4** now: the
  cover-letter library moved as two stores, and the newer of them deliberately answers with outcomes
  where its older neighbour in the same folder throws - a missing profile is a refusal, not a
  failure (amendment thirty-nine). It is **3** now: the CV library moved as **three** stores, the
  split chosen on a line estimate rather than on taste, and the generate store owns the job link
  because a forgotten second step produces an unlinked CV that looks identical to a linked one
  (amendment forty). It is **2** now: Settings went in two pull requests - five section
  components first, because its 580-line template would have failed the size gate the moment the
  migration touched it, then five stores (amendments forty-one and forty-two). What is left is
  `onboarding` (738 lines) and `jobs` (1050), and `jobs` is deferred to a session of its own: state
  migration alone will not bring it under its 400-line budget.
- **Two defects are filed and unfixed**, both found by reading or by a rendered check rather than by
  a gate: the health check's `ok`/`warn`/`fail` icons all render the same colour, because the
  `[class]` binding on `<lucide-icon>` lands nothing; and `en-GB` is hardcoded at five date-formatting
  call sites while the app ships six locales.
- **`cover-letter-detail.component.ts` is now 337/400 - under budget**, and the template is
  **669 -> 491/300**. The Style card and the per-block style popover became
  `cover-letter-style-card/` and `cover-letter-style-popover/`.
- **This corrected a claim made a day earlier** (ADR-0005 amendment fifteen). Amendment fourteen said
  the five lines over budget were the 21 read-only aliases and that only cutting the template could
  remove them. The arithmetic was right and the conclusion was wrong: the aliases are all still there
  and the class is 337. What was left in the page was **a second responsibility nobody had named**,
  hiding in plain sight because it was markup rather than state. The four store extractions asked what
  state the page owned; nobody asked what _panels_ it owned. **The rule: when a migrated page is still
  over budget, look for a responsibility before blaming the template.**
- **The campaign is finished: the template is 222/300 and the class 333/400, both under budget**,
  after six extractions - the style card, the style popover, the recipient block, the settings and
  availability cards, and now the body-paragraphs block. Arc for this page across eight pull requests:
  markup **669 -> 222**, code **644 -> 333**. The header bar (~85 lines) stays, by decision: the
  template is under budget without it.
- **The `.icon-btn` blocker is resolved, and the question had a false premise** (ADR-0005 amendment
  seventeen). It was recorded twice as one class duplicated across four stylesheets. Four files define
  the **name**; three define different **rules** - `cv-list` and `my-jobs` are an identical 28px pair,
  `cv-detail` adds `:disabled` and `--active`, and the cover letter's is 32px with a transition and
  different colour tokens. A global partial was therefore a three-way reconciliation that visibly
  changes two other pages, not an extraction. The block carries a locally-named `.clb__icon-btn`,
  following `interview-prep-detail`'s `.ipd__icon-btn`.
- **The fold is done, and the file-size ratchet turned it into three extractions** (ADR-0005,
  amendment eighteen). All five pages now use `appButton size="icon"`; `.btn--icon` was pinned to the
  pages' existing 28px square so the change deletes rather than restyles, which is defensible only
  because that size had exactly one consumer beforehand. Converting a class to three attributes costs
  +2 lines per button, which the ratchet refused on three already-over-budget files - so
  `_button.scss` came out of `global.scss` (**415 -> 345**), `document-row-actions/` out of both
  document lists (`cv-list.component.html` **311 -> 283**, under budget), and `cv-section-actions/`
  out of the CV editor (`cv-detail.component.html` **492 -> 466**). Every one was a seam that already
  existed; the gate is what located them. **Two deliberate visual deltas**: the topbar theme toggle
  34px -> 28px, and ghost icons one contrast step higher. ~~`interview-prep-detail`'s
  `.ipd__icon-btn` is the last page-local icon button left.~~ **Both halves of that sentence were
  wrong**, and the rendered check is what showed it - see the next entry.
- **The rendered check that fold was owed has been run, and it failed twice** (ADR-0005 amendment
  nineteen, PR #385). The icon button was **28 x 29.84** rather than square: `<lucide-icon>` wraps an
  inline `<svg>`, so it is a line box and reserves 1.84px of descender space whatever the icon
  measures. Eight of the nine call sites were saved by the 28px minimum; the ninth is the topbar
  toggle at 18px - the one button the fold was written around - and a 16px icon cleared 28 by
  **0.16px**. And `variant="danger"` colours **at rest**, where all four page rules it replaced were
  `:hover`-only, so a document row went from one tone to three. That delta was never declared. The
  tie-break is the fold's own: it bent the design system to the pages because `size="icon"` had one
  consumer; `variant="danger"` had **zero**. Both fixed, plus `.cvlist__export`, a `<label>` the
  directive cannot reach, which had been left a shade darker than its neighbours.
- **The count of remaining icon-button copies was wrong: four, not one** - the audit grepped for the
  name `icon-btn` and every copy carrying a different name was invisible to it. `.ipd__icon-btn` (4
  sites), `.ip__icon` in `_ip-shared.scss` (2 sites, **both** interview-prep pages), `.clb__icon-btn`
  (1), and `.cvlist__export` (1, deliberately kept). This is amendment seventeen's lesson from a
  fourth direction: that search was not truncated, it searched for a **name** when the thing being
  counted is a **shape**.
- **`.ipd__icon-btn` is folded** (PR #386, stacked on #385 because it needs the danger fix to be a
  deletion). Its base was an exact `variant="secondary"`; only `:disabled` differs, 0.35 against 0.5.
  The ratchet refused the +8 lines at 311/300 and located `interview-stage-actions/`: template
  **311 -> 274**, stylesheet 363 -> 346. The narrow cut of four buttons rather than the whole
  `.ipd__actions` cluster, because that cluster holds `.ip__pop` from `_ip-shared.scss` - amendment
  sixteen's trap, avoided **before** the merge for the first time. `.ip__icon` is the next fold and
  is a second visible delta on a second page.
- **The icon-button campaign is closed: all six copies are folded and no page-local icon button
  remains anywhere in the application.** After `.ipd__icon-btn` came `.ip__icon` (PR #388, whose
  `.is-open` class went to `.btn--ghost[aria-expanded='true']` because the trigger already bound the
  attribute), then `tracker`'s `.jt-icon` (PR #390) - six sites in four shapes, which first needed
  `tracker.component.html` cut **557 -> 278** in five component extractions (PR #389). The last item
  was `.clb__icon-btn`, and it was a decision rather than a mechanical fold: its local name was
  chosen precisely **because** folding it once meant a visible change, and amendment nineteen had
  removed that reason. Measurement settled it - rest state and geometry were already identical on
  every property, and the one delta was hover, where `git show` on the already-folded
  `.ipd__icon-btn--danger:hover` returned the design system's tint-and-ring verbatim. This was the
  only destructive icon in the app that disagreed with the others; it is folded, with that single
  hover change declared and checked on a rendered screen in both themes (ADR-0005, amendments twenty
  to twenty-four). Two of the folds leave **zero** local rules behind.
- **One dead class found by the same audit**, and a second claim that was **wrong and is corrected**.
  `.icon-btn--active` was bound on the Edit/Preview button, which is an `appButton`, and resolved to
  nothing - so the toggle never showed it was on; fixed by switching the button's own `variant`. The
  same entry reported a bare `.spin` as "defined nowhere": **it is defined**, in
  `_cover-letter-controls.scss`. The error came from a `grep` piped through `head` - the match was
  truncated away and absence was read from a cut-off output. `.spin` did have a real defect, but a
  different one: it wobbled, because `<lucide-icon>` is `display: inline` and its transform box comes
  from the surrounding line box. Fixed with `inline-flex`, an explicit origin and a
  `prefers-reduced-motion` guard.
- **The first rendered check found a two-day-old regression that six pull requests of green gates had
  not.** `cover-letter-block/` - date, subject, greeting, closing, signature - has rendered as native
  browser inputs since PR #380: it carried `.coverdetail__full { width: 100% }` out of the page and
  left behind the nine declarations `.coverdetail input:not(...)` supplied. It is amendment sixteen's
  trap in the one component amendment sixteen's own retrospective audit forgot to list. Fixed, with a
  test on the class the stylesheet targets. **No further extraction in this area merges without a
  rendered check** - it is the only instrument that detects this defect class.
- **The Availability card explains itself now.** Its three answers reach the letter only through the
  AI prompt, on the next generate or regenerate, and never appear in the preview as lines of their
  own - which made a filled-in card look broken. A region-independent hint says so in all six
  locales, separate from the German-market explainer above it, which answers a different question.
- **A shorthand salary reached the letter with its magnitude gone.** `85k - 110k` produced "My salary
  expectation is 85 - 110 EUR per year", which reads as 85 euros. The model was obeying the skill's
  "use the values exactly as given"; `cover-letter-generate.md` now carries a narrow exception for
  `salary_expectation` **only**, with its boundary in the same sentence so it cannot generalise to a
  date, pinned by a Rust render test asserting the rule, the example and the scope.
- **One warning no gate reported.** After the extraction the page's `NgTemplateOutlet` import went
  dead, and `NG8113` appeared only in the dev server's output - lint read 0 errors and the build's own
  verdict line said success. It surfaced because the app was run, and it is the argument for running
  it that does not depend on seeing anything.
- **Moved markup takes its stylesheet rules with it, and the check only proves half of that.** For
  named classes it works: the six the style panels use went into `_cover-letter-controls.scss`, which
  `styles.scss` emits globally, and `quality:style-move` reported lossless. **The recipient block found
  the half it cannot prove** (ADR-0005 amendment sixteen): the page styles its controls with
  `.coverdetail input:not(...)`, a descendant selector rooted at the page element, which Angular's
  encapsulation stops at a child boundary. The six address inputs would have rendered as browser
  defaults with every gate green - `quality:style-move` passes because `.coverdetail input` still
  exists and still carries all nine declarations. What changed is what the rule can _reach_.
  **The checklist gains a line: also list every descendant or element selector rooted at the page that
  matched inside the moved region.** The three components merged a day earlier were audited against
  this and are clean.
- **A visual check is owed on the whole cover-letter editor, now six extractions deep, and it is the
  largest open risk in the documents area.** A `tauri dev` build was started twice on 2026-08-08; the
  binary ran and stayed alive, but no window could be captured, so nothing was rendered. The check is
  now a written walkthrough for the maintainer rather than an agent task. The compiled bundle does at
  least confirm that the carried rules land in the child components' own encapsulated scopes -
  evidence one level below `quality:style-move`, but still not a rendered check.
- **The two document editors share almost nothing, settled by reading both.** `CoverLetterStyle` and
  `CvStyle` are different types; cover letters have no themes, which is most of `CvStyleStore`. Their
  `sectionStyles` differ structurally - a closed `CvSectionKey` union against an open
  `Record<string, …>` keyed `body_<i>`. **Only the ~15-line style-safety check and dedupe is extracted**
  (ADR-0005 amendment twelve). The four cover-letter stores are built fresh.
- **The rows are a different story: the invariant is shared, the record shape is not** (ADR-0005
  amendment thirteen). `siblingsToUndefault` - "default is per region, and a row never displaces
  itself" - moves into `document-record.ts` because it fails **silently**, leaving two defaults for one
  region. The two upsert builders stay apart, because a CV row carries `templateId` and `themeId` and a
  letter carries neither.
- **The empty-fixture trap has now hidden a real change six times, in three distinct shapes**, and one
  rule covers all of them: **the fixture must be able to tell the two branches apart.** Shape one, a
  store with a reset path and an already-empty fixture, so "reset" and "leave alone" agreed - most
  recently `hydrate` swallowing a malformed-JSON failure and opening an empty editor over a letter
  still on disk. Shape two, a **single-call** fixture: `load`'s missing-document guard protects the row
  already on screen, and every test called `load` once, where there was nothing to protect. Shape
  three, a **partial input to a merge**: the AI draft carries the user's tone, length and availability
  answers over rather than taking them from the model, and one paragraph's regeneration keeps the
  other paragraphs' cache hashes - neither was observable while the fixture omitted those fields.
  Concretely: non-empty for a reset, called twice for a guard, populated on both sides for a merge.
- **Rust is done. Angular is now the whole remaining problem.** Measure the
  repository with `npm run quality:file-size:all` - the plain gate is diff-scoped and a clean report
  from it means only "nothing I touched is near budget". A file **missing** from the diff-scoped
  report means "not changed", not "now under budget"; that misread nearly reached a changelog entry
  on 2026-08-05. The audit reports **41 files over budget**: 19 TypeScript, 11 templates,
  11 stylesheets, and **zero Rust, source or tests**.
- **Profile is finished, by decision.** Across fifteen merged PRs on 2026-08-05 (#329-#344) the page
  went from **1037 / 772 / 733** to **270 / 445 / 124**. Its **template and stylesheet are both under
  budget** - two of the three files the campaign has taken from over to under, alongside
  `cover-letter-detail.component.scss`. It has eleven child components and four util files.
  **The class stops at 445/400 and that is a settled decision, not an omission**: the remaining lines
  are one coherent lump of page state (`ngOnInit`, `save`, `persistProfile`, `refreshSavedMdHash`,
  the form and its three section mirrors) that no further pure-function extraction reaches. The
  maintainer chose this over building a `ProfileFormStore`, through the grilling gate, on
  2026-08-05. No ratchet exclusion was added: the file stays listed OVER and can never grow, which
  is the enforcement that matters. Two seams were audited and rejected with it - the compensation
  block (template already under budget, so the move would only grow the class) and the section-mirror
  collapse (a shared `syncSections()` would re-serialize all three on any one edit, and
  `serialize(parse(x))` is not identity for hand-typed raw markdown).
- **Discover is the current target.** Five PRs (#345-#347 on 2026-08-05, #349-#350 on 2026-08-06)
  took it from **808 / 890 / 1464** to **567 / 878 / 806**; its stylesheet was the largest file in
  the project. Unlike Profile it needs **no page-scoped wrapper**: 33 of its 34 top-level selectors
  already carry the `dv-` prefix. The detail screen is now a shell holding only the grid, main,
  loading and actions; its hero, sidebar and feed row are components. **The class has barely moved
  all campaign (890 -> 878)** because every Discover cut so far has been markup and styles.
  **`.dv-row` was read as the hard case and was not**: the classes the feed and the detail body
  genuinely share were hoisted in #346, and what remained split into two disjoint sets, so the feed
  row cut out with no hoist. Its separator moved to the child's `:host`, because
  `.dv-feed > :last-child { border-bottom: none }` matches the component host and a border left
  inside would have drawn a line under the last row - the PR #341 host-element shape again, and
  again invisible to every gate.
  **`.dv-geomenu` was filed as needing a service-owned boundary and did not.** It is one dropdown
  rendered three times - Sources, Type, Locations - and its 35-symbol markup surface was the sum of
  three panel bodies, not one boundary. The bodies are projected content, which compiles in the
  page's own template scope, so the shell takes a label, a count, an optional foot note and emits
  `cleared`. Seven PRs now: **808 / 890 / 1464 -> 484 / 877 / 704**.
  The class has now taken its first cut too: the Locations tri-state tree is `discover-location-selection.ts`,
  **877 -> 802**, with 19 tests over logic that previously had none. Eight PRs: **808 / 890 / 1464 -> 484 / 802 / 704**.
  The deterministic scoring followed it out (`discover-detail-scoring.ts`, **802 -> 730**, 17 tests over
  rules that had none, and two wrong comments corrected). Nine PRs: **808 / 890 / 1464 -> 484 / 730 / 704**.
  Next in it: the scan pipeline, or the detail-screen loading path. Neither audited. Three decisions came out of it and are written into
  `CODE_QUALITY.md`: a page whose class names are generic **wraps its partial in the page root**
  rather than prefixing (seven of Profile's shared names were already defined with different values
  by eight other stylesheets); a class's **modifiers move with it**, because a base and its modifier
  that both set one property stop being decided by source order once they are split across files;
  and the boundary is chosen by **ownership** - inputs and outputs when the page owns the state, a
  component-provided service when the child owns state the page reads back.
  `quality:style-move` gained `--page-scope` so a page-scoped hoist is verifiable at all.
  **The repository count moved only 43 -> 42 across those ten PRs**, because every new component is
  within budget and so never appears. Judge the campaign by the files touched, not by the total.
  Rust budgets changed on 2026-08-03: source and inline `#[cfg(test)]` items are now counted
  separately, at **500** and **600**, replacing a combined 800 that scored a well-tested module the
  same as a dense one. The Rust campaign since then: `commands/discover.rs` 3245 -> 599 across seven
  modules, `discover_parsers.rs` 697 -> 406 into ATS boards and No Fluff Jobs, `ai/cli.rs` 668 -> 420
  into run/probe/install, `ats.rs` 619 -> 289 with its vocabulary in `ats_tokens.rs`,
  `job_url.rs` 580 -> 399 with its shared web helpers in `web_text.rs` and `url_parts.rs`, and
  `discover_geo.rs` 522 -> 246 with its per-country vocabulary in `discover_geo_countries.rs`.
  Two of those splits found real coverage gaps rather than only moving code: `extract_host`, whose
  result the closed-board allowlist is matched against, had no tests at all, and `KNOWN_COUNTRY_CODES`
  could lose an entry with every test still green while silently widening what a market scan returns.
  `apps/web/src/styles.scss`, once 2167/400, is eleven section partials with the compiled CSS proven
  byte-identical. Budgets count non-empty lines;
  a raw `wc -l` overstates every file and has caused at least one wrong "correction" in this log.
  Discover is the page now: `discover.component.ts` **1069/400** (from 1242: the JD parser, the feed
  filter and the For-you split, then the scan console), `discover.component.html` 1070/300,
  `discover.component.scss` 1915/400.
  **The Discover heading-lexicon bug stays unfixed, by decision.** The stems `responsibilit` and
  `requirement` never match their own plurals, so seven real section titles read as paragraphs. No
  fix measured strictly better - the obvious one adds two false headings on unpunctuated prose, and
  anchoring the match loses "What we offer" - and a missed heading still renders readably in a
  detail pane. Pinned by a test that states exactly what it does. Out so far:
  `CoverLetterTailorService` (the tailor-an-existing-letter modal, with the base-letter read and the
  content assembly as pure functions) and `job-detail-icons.ts` (the icon table, plus a spec that
  reads the template and asserts every `icons.<name>` it references exists - a class of error
  `npm run type-check` cannot see). Both were verified by breaking the code and watching the tests go
  red. Then `DocumentReviewStatusService` (the one status line under Review documents, its error
  flag and the two choose-existing dialogs, with `refuse` and `fail` distinguished - a precondition
  the user can fix stays silent, a throw also toasts) and `application-document-actions.ts` (the
  per-document decision that determines whether committing spends AI tokens, plus the staleness
  inputs it needs, with the check passed as a thunk so the short circuit survives).
  **The template and stylesheet have not been touched**: `jobs.component.html` is 1148/300 and
  `jobs.component.scss` 933/400, and they follow the `.ts` rather than lead it.
  **What the ratchet taught, and it is worth keeping**: the decision extraction first grew the file
  to 1204 and the gate refused it, correctly - named intermediate values cost more lines than the
  else-if chain they replace. A testability win is not automatically a decomposition win, and the
  budget is the thing that tells them apart. Moving the two staleness guards out as well is what
  paid for it, and that commit is net zero lines: it bought tests, not size.
  Then `TailoringDiscardService` and `JobGapFillService`.
  **The drafting flows were examined and deliberately left where they are.** `createCvDraft` and
  `createCoverLetterDraft` are already thin orchestration over `CvDraftService` and
  `CoverLetterDraftService`; what remains in them is context assembly reading eight component
  signals, so moving them behind another service would be a wrapper over a wrapper and would grow
  the file, which is the mistake the ratchet caught earlier in the same session. What was extracted
  instead is the thing genuinely written twice: the gap-fill callback bundle. Then `loadJob`'s two
  document defaults (`job-document-defaults.ts` - which language the Review step opens in, and
  which CV the next tailoring builds on, including the documented exception that keeps a job's own
  CV selectable when the language filter would drop it) and the wizard's three-pass state strip
  (`tailor-phases.ts`), and `markApplied`, which moved to `JobActionsService` beside `save` and
  `remove` rather than into a new file - it shared their guard, their status line and their rule
  that the overview row mirrors the database. No member is over 30 lines now; `enterJob` and
  `parseAndFilter` are the joint largest at 30. **The page still has no component-level test**, so every extraction
  rests on service- and function-level tests plus `nx build desktop` for the template.
- **The fast gate is now template-aware, and was not before.** `npm run type-check` ran `tsc`, which
  never compiles Angular templates, so a binding to a missing member or a type the template cannot
  accept passed it and failed only under `nx build`. It now runs `ngc --noEmit` for both Angular
  apps: measured uncached at **3.48s against tsc's 4.31s**, so it is cheaper as well as stricter.
  Proven before switching, on both apps and both failure modes - `tsc` exits 0 on all of them, `ngc`
  exits 1 and names file, line and component. A guardrail in
  `tools/check-quality-guardrails.test.mjs` fails if either app reverts. **Every watch entry before
  2026-08-02 that cites a green `type-check` was citing a check that could not see templates.**
- **A gate reported success on a broken tree, once, and the mechanism is not established.**
  `npm run type-check` printed success while `apps/desktop/src/app/pages/jobs/jobs.component.ts`
  contained `Property 'jobDocLabel' does not exist on type 'JobsComponent'`; `npx nx build desktop`
  failed on it moments later, and a plain re-run of `npm run type-check` on the same content then
  reported the error correctly. Suspected an Nx cache hit. **Reproduction was attempted four times in
  the same session, including in the exact original shape, and the error was reported correctly
  every time** - so the false green is in the transcript beside the build failure that caught what
  it missed, it does not reproduce, and a misreading by the agent cannot be excluded either. It
  matters because "type-check passed" is load-bearing in every watch entry. Until it is understood,
  a green type-check on its own is weaker evidence than the entries have been treating it as, and
  `nx build desktop` remains the only gate that has never been observed to miss.
- **Unclaimed jobs: decided and shipped.** ADR-0004 is `accepted` and implemented.
  `db_list_jobs_overview_core` returns unclaimed rows flagged with a derived `claimed` boolean
  instead of hiding them; My Jobs has one filter chip, off by default, and shows an **Analysed**
  status word for them that joins the status filter. Discover-scanned rows stay hidden until
  claimed. **No migration.** The one thing the ADR did not foresee: `listJobsOverview` is shared, so
  relaxing it put unclaimed rows into the dashboard's Recent jobs labelled "Saved" and stopped a
  user with one analysed job reading as new - both now guarded by `recentClaimedJobs`, with tests
  that go red if the guard is removed. Two locale keys in all six languages.
- **The documents area was split into modules that match their tests.** `cv-content.util.ts` held
  four unrelated jobs at 1245/400; style editing and entry editing moved out (`cv-style.util.ts`
  336, `cv-entry.util.ts` 118), leaving 829. Its 1509-line spec followed, becoming four files under
  the 600 budget - style 473, AI parsing 445, content 426, entries 176.
  `cv-preview.component.spec.ts` split the same way earlier, 2263 into six. **No spec file in the repository is over its
  budget any more**: the last three - CV detail 940, the live style panel 913, onboarding 689 -
  became seven files, two of them behind a shared harness because their setup wires mocks rather
  than repeating boilerplate. `tsconfig.app.json` excludes `*.harness.ts`, which are test-only but
  not spec files.
- **Three of the largest Rust files came apart.** `commands/documents.rs` **1926 -> 1645**, its
  content-to-blocks conversion now a module of its own.
- **The two largest Rust files came apart.** `commands/discover.rs` **3245 -> 1679** (geography,
  feed readers, and their tests each to their own file) and `commands/tailoring.rs`
  **2538 -> 2087** (the printpdf renderer, with the shared font faces in a third file because both
  exporters need them). Both were still over the 800 budget at that point: what was left in each was
  the HTTPS/persistence layer and the DOCX exporter respectively, plus their test modules. Both are
  under budget now - see the Rust campaign entry above, which supersedes this line.
- **51 files are over budget, and the audit is the only trustworthy list.** Breakdown after this
  session's work: 21 TypeScript sources, 13 stylesheets, 12 templates, 5 Rust. The largest remaining
  are `discover.component.scss` 1915/400, `commands/tailoring.rs` 2087/800,
  `commands/documents.rs` 1926/800, `jobs.component.html` 1122/300. **Templates and stylesheets need
  child components, which is a maintainer decision; several sources and Rust files may not.** Run
  the audit before planning - three claims in this session's log that "nothing decision-free is
  left" were each wrong, and each was scoped to whatever category had just been finished. The counts
  and the 800 Rust budget in this line are historical; the campaign entry above supersedes them.
- **CodeQL is clean.** All five `js/polynomial-redos` alerts in `libs/core` report `state: fixed`,
  `fixed_at 2026-07-30T08:34:00Z`, confirmed by the API after the rescan rather than assumed from the
  merge. Zero open code-scanning alerts. The fix was measured, not guessed: on a 40 000-character
  pathological input the old patterns cost 0.6-1.5 s each, and the cost was quadratic in length.
- **Dependency alerts: 16 of the original 17 closed, and none of them ever shipped.** `npm audit
--omit=dev` reports **0 vulnerabilities** and has throughout - nothing vulnerable reaches the Tauri
  bundle. The count went 27 -> 17 (merging #207, #209, #212) -> 3 (#214, six transitive pins) -> 1
  once #217 lands, which takes `uuid` to 11.1.1 and `@hono/node-server` to 2.0.5. **Two advisories
  stay open on purpose, each with a drop condition in `docs/governance/VALIDATION_MATRIX.md`.**
  `glib` RUSTSEC-2024-0429 is the only one with runtime scope and is not fixable here: the gtk-rs 0.18
  stack reaches it through `gtk` 0.18.2, which `tauri` 2.11.5 pins, so `cargo update -p glib` moves
  nothing; Linux-only, never called directly, and `cargo audit` already tolerates it at exit 0.
  It is also **Dependabot alert 42**, which reads the GitHub advisory rather than `cargo audit` and
  so reports it as open. It now carries an entry in `.cargo/audit.toml` with its drop condition -
  Tauri shipping on gtk/glib >= 0.20 - and the GitHub alert is deliberately **left open rather than
  dismissed**, because dismissing it hides the only thing that will say Tauri moved.
  `brace-expansion` GHSA-mh99-v99m-4gvg was refused rather than merely deferred: forcing every copy to
  5.x does take `npm audit` to zero, and it breaks the `minimatch` 3.1.5 copies under `test-exclude`
  and `fork-ts-checker-webpack-plugin`, which call the module as a function while version 5 exports an
  object. **Nothing here catches that** - with the pin in place `npm audit` read 0, the full gate went
  green, and coverage passed. Do not re-attempt it expecting a different result.
- **A second wave of advisories landed on 2026-08-04 and is closed: `npm audit` reads 0 again.** Nine
  Dependabot alerts (one high, eight moderate) plus seven more that only `npm audit` saw - the audit
  found **16**, Dependabot **9**, and the audit is the longer list. Every one of them is
  **development scope**: `undici` reaches the tree only through `@angular/build` and through
  `node-gyp` under `@angular/cli`, `hono` and `brace-expansion` likewise. `npm audit --omit=dev` was
  0 before the fix and is 0 after it, so nothing vulnerable ever reached the Tauri bundle or the web
  build. All four are patch-level bumps behind `overrides`, because `@angular/build` pins `undici` to
  the exact string `7.28.0` and npm's own suggested fix was a **semver-major downgrade** of
  `@angular/build` to 20.3.32. Forced instead: `undici@^6 -> ^6.28.0`, `undici@^7 -> ^7.29.0`,
  `hono -> ^4.13.0`, and the three existing `brace-expansion` pins moved up within their own majors
  to 1.1.18 / 2.1.4 / 5.0.9. **The keyed-by-major form is what makes this safe**: the refusal recorded
  directly above is about forcing _every_ copy to 5.x, and it still stands. The 1.x copies under
  `test-exclude` and `fork-ts-checker-webpack-plugin` stayed on 1.1.18 and were checked by hand to
  still export a callable, and `minimatch` 3.1.5 was called through both - because, as that entry
  says, nothing in the gates catches it.
- **Superseded note, kept for the record**: `0.29.1` was previously the first run of the release matrix
  failed on all four platforms because `beforeBuildCommand` called `nx` without `npx`, and
  `tauri-action` does not go through the npm script that puts it on `PATH`. Fixed on
  `fix/release-build-path`; the tag has to be re-pointed at that commit for the matrix to run again.
  No draft was created, so nothing was published. The macOS artifact attached to `v0.29.0` was built
  by hand. `0.29.0` shipped a macOS bundle that rendered completely unstyled - Angular's
  `inlineCritical` optimisation defers the stylesheet behind an inline `onload` handler that the
  app's CSP forbids - and `tools/verify-csp-compat.mjs` now fails the build on that class of bug.
  GitHub Actions started working the moment the repository went public: it was never a failed
  payment, it was a private repository drawing on exhausted included minutes against a $0 budget.
- **Previous version**: `0.29.0` (package.json / tauri.conf.json / Cargo.toml, verified identical
  in all three on 2026-07-29), and the tag history is complete again. `v0.26.0`, `v0.27.0` and
  `v0.28.0` had shipped as versions in the manifests and as sections in the changelog but were never
  tagged and never released: the tag list stopped at `v0.25.0` while the app said `0.28.0`. All three
  are now annotated tags on the commits that bumped the version and wrote their changelog section -
  `c656c40`, `7dffc6c`, `65330a3`, the same convention `v0.25.0` follows - with GitHub Releases
  carrying their changelog text. Their release dates on GitHub read 2026-07-29 because that is when
  they were published; the changelog dates are the real ones.
- **Current branch / focus**: `fix/core-redos`, closing the CodeQL ReDoS alerts. The repository is
  already public and applye.dev is live, so the launch preparation this line used to describe is
  done; what remains is publishing the desktop release. `feat/web-cookieless-analytics` merged in
  `d7cd346` (#165); `feat/web-analytics` merged earlier in `495d413` (#164). Both branches are gone.
- **`main` now requires CI to pass before a merge.** Required status checks are on, with exactly one
  context: `Lint / Test / Build (affected) + Rust`. `strict` is deliberately off, so a pull request
  does not need rebasing every time `main` moves. Required approvals stay at 0 and `enforce_admins`
  stays off, so a solo maintainer cannot be locked out. `Analyze (…)` and the Cloudflare deploy are
  deliberately **not** required: CodeQL reports skipped on pull requests and the deploy job only runs
  on a push to `main`, so requiring either would deadlock every merge.
- **Onboarding could not choose a model, so it sent an empty one.** Picking DeepSeek on the AI step
  and saving a key still failed every wizard call with `The supported API model names are
deepseek-v4-pro or deepseek-v4-flash, but you passed .` The step persisted the provider but never
  the model ids, and the dispatcher read the model back out of the settings row - so it sent the
  Claude default on a fresh install, or the empty string a CLI-mode run leaves behind. Fixed in
  #226: the model catalogue, the per-provider defaults and the reconciler moved to `@applye/core`
  as `api-models`, Settings and onboarding now share them, and the wizard gained quality/economy
  selects. Existing corrupted rows are repaired on read rather than migrated. **Merged as `8d1f3fb`
  and verified natively**: the browser preview cannot render the onboarding overlay at all, so the
  only meaningful check was a `tauri dev` run, and the maintainer confirmed the wizard now completes
  with no errors. That verification is the maintainer's, not an agent's - screen-control permission
  was denied, so no agent saw the screen.
- **Discover showed job descriptions as their own HTML source, and the fix has one open consequence.**
  An ArbeitNow posting rendered `<p>`, `<li>`, `&amp;` and `&nbsp;` as visible text. `strip_html`
  stripped tags before decoding entities, so an entity-escaped feed had nothing stripped and then had
  its escaped tags _converted into_ literal text. Stripping and decoding now alternate under a bounded
  loop, which fixes every source, not just ArbeitNow. The same function also swallowed the rest of any
  line containing a bare `<` ("latency < 100 ms"), straight into the text used for scoring; a `<` now
  opens a tag only when a name, `/` or `!` follows. Open as **#233**. **Decision needed before or
  soon after merging:** the fix applies to newly scanned jobs only, and because `jobs.jd_hash` is the
  dedupe key, re-scanning an already-stored posting inserts a _second_ row. Either a data repair that
  recomputes `jd_hash` (which orphans `scoring_cache` rows keyed on the old hash) or an extra dedupe
  on `source_url`; the latter cannot land in `discover.rs` while it sits at 3245 lines against an 800
  budget.
- **A Pipeline card opened the wrong job, and the report about a duplicate CV dialog turned out to be
  something else.** Two bugs came in from the app together. The first is real and fixed in **#232**:
  "Open full details" passed the card's **application** id to `/jobs/:id`, which is keyed by **job**,
  so it loaded an unrelated posting and offered "Mark as Applied" for a job never applied to. The two
  id spaces collide whenever both tables have a row at that number, so this was the normal path, not
  an edge case. The ratchet refused the fix in place (409 -> 419 lines), so follow-up drafting came
  out into `FollowupDraftService` and the modal is now 306 lines; that extraction also exposed a
  double-click guard that never worked, since `drafting` was claimed after an `await`. The second
  report - "clicking Generate on the cover letter raises a CV dialog" - is **not** a race and #230's
  guard is holding. The maintainer confirmed the second dialog asks about **dates**, which identifies
  it as the CV flow's own block-before-generate step; it necessarily runs after the AI call because
  the questions come from what the model left undated. The actual defect is that the card reports
  "Generating" while the flow is blocked on that dialog, so nothing signals that it is waiting.
  **Now fixed in #234**: a preparing card reports `needs_input` while `CvGapDialogService.open` is
  true, for the CV only. The derivation left the page component to get there - `documentCardStatus`
  is a pure function in `apps/desktop/src/app/shared/doc-card-status.ts` with nine tests, because the
  ratchet forbids `jobs.component.ts` (1882) growing and there was no way to test a private method on
  it. `jobs.component.ts` 1882 -> 1881, `jobs.component.scss` 987 -> 985. The badge itself is a
  **manual gate**: reaching the state needs Tauri IPC, so no browser build can show it.
- **The file-size gate silently forbade every new user-facing string, and #234 fixes that too.**
  `docs/governance/CODE_QUALITY.md` excludes the translation catalogue from the budgets; the checker
  excluded only `translations/translations.ts`, a 10-line re-export. The six locale files that hold
  the strings are ~1650 lines each, so the ratchet rejected any added key with no legal remedy -
  splitting a translation catalogue by line count is not a decomposition. The exclusion now matches
  the contract. Any earlier session that avoided adding a string was working around this, not around
  a real design constraint.
- **A second gap dialog could strand the first document on "Generating" forever.** Reported from the
  app: starting a cover letter while a CV was still generating raised a second gap dialog, and one of
  the two documents then never finished. Both flows awaited a single resolver, so the second
  overwrote the first and its promise never settled. Fixed in #230 by making ownership explicit -
  first caller wins, second is answered `null` - and by extending the cover-letter guard to skip
  while a CV is _preparing_, not only when one is linked. Shipped as `CvGapDialogService` because the
  new file-size ratchet refused the in-place version, which gave the invariant its first test seam.
  **Merged (#230), and the native re-check is still pending**: this is a concurrency bug that unit
  tests cannot fully settle.
- **The Tier 1 split of `JobsComponent` is six responsibilities in, of roughly ten.** #222 portal
  answers, #223 final checks, #225 export, #229 tailoring, #230 the CV gap dialog and #231 scoring
  are all **merged**. Together they take `jobs.component.ts` from 2788 to **1882 non-empty lines**
  by moving those seams into `PortalAnswersService`, `FinalChecksService`, `DocumentExportService`,
  `TailoringService`, `CvGapDialogService` and `JobScoringService` under
  `apps/desktop/src/app/shared/`. Every one is a move, not a redesign: same guards, same cache keys,
  same thresholds, same status strings, same storage keys, and `jobs.component.html` is **untouched
  across all six**, because the component exposes the moved signals as aliases onto the services'
  _writable_ signals rather than as read-only views. All six are component-scoped via `providers`,
  not `providedIn: 'root'`, so lifetime matches what the fields had. 104 new tests - the first
  coverage any of that logic has had. Scoring was the one seam that also removed duplication rather
  than only relocating it: both scoring paths carried their own copy of the same ` ```json ` fence
  unwrap, now the exported pure `parseScoreResponse`. Four responsibilities remain, sized: document
  drafts (591 lines, and really three responsibilities in one coat), wizard navigation (129), job
  CRUD (119), plus the compensation and archetype derivations. **The export path is Tauri-only, so
  `npm run desktop:dev` remains a pending gate on #225's behaviour** - it is merged but was never
  exercised natively. That gate is **PDF only**: the wizard's final step exposes `cv-pdf` and
  `cover_letter-pdf` and no DOCX control, so DOCX export is reachable only from the Documents list
  pages and is not part of this gate.
- **Every desktop page component is on OnPush.** The seven that were still on the default strategy -
  `jobs` (2788 lines at the time), `profile`, `settings`, `pipeline`, `apply-wizard`, `scoring-view`,
  `updated-score-view` - now declare it. Safe because all seven are signal-driven and none injects
  `ChangeDetectorRef`; verified in the browser as well as by the suite.
- **The whole workspace now tests the way it runs.** All five test environments are zoneless; the
  three library suites had been on `setupZoneTestEnv` while both applications run zoneless. `zone.js`
  and the unused `@angular/animations` are removed, which also clears the one `invalid` peer in the
  dependency tree. Moving the libraries across immediately failed two `score-gauge` tests that had
  been asserting the opposite of what the gauge does - see the changelog; the spec is fixed and the
  animation now has honest coverage for the first time.
- **Open pull requests, as of 2026-08-01**: the wizard-navigation extraction. #233 (Discover HTML),
  #234 (the CV waiting state, plus the i18n gate it unblocked) and #235 (one selection ring per
  field in the CV editor, where three were being drawn) are all merged; `main` is at #235, 52 suites
  / 856 tests. The maintainer confirmed #235 visually in `desktop:dev` - that is the only way those
  rings can be checked, since the CV detail page needs a document over Tauri IPC. The duplicate-row
  consequence of #233 is **deferred by decision, not resolved** - see the entry above.
- **A pasted job description now names its company and role, or says so plainly.** A posting headed
  `Company name - Elbrus` used to report "No company name found" and take `The Purpose:` - a section
  heading - as its title, with no way to correct either. Extraction lives in
  `apps/desktop/src-tauri/src/commands/job_identity.rs` (18 tests): wider labels, six separators, and
  a title candidate rejected when it is a section heading or carries no role word. Returning nothing
  is a valid answer now, because an empty field renders as a dimmed placeholder in six locales rather
  than a hole - and nothing is written to the database, since the duplicate and legitimacy checks
  compare companies to each other. `job_paste` takes an `IdentityPrecedence`: `authoritative` for the
  "From link" fetch, `fallback` for a re-parse, where fresh extraction wins. **It took three passes to actually close.**
  The first shipped with a fixture whose label sat near the top, so it never tested the scan window
  the real posting needed; the second found that a stored value re-entered through the fallback path
  the rules leave open, and that the same hole had a copy in the SQL. The labelled scan now reads
  every line, the fallback validates what it is handed, and the regression fixture asserts its own
  length so it cannot be trimmed into uselessness. Part B, specified in
  `docs/superpowers/specs/2026-08-02-job-identity-part-b-design.md`, is now built - see below.
- **When the rules cannot name a posting, one AI call tries, and then the user is asked.** One press
  of Parse & filter carries the chain: rules at 0 tokens, then a single `job-identify` call on the
  economy model only if they missed, then a dialog. Not three buttons - the AI step runs exactly when
  a button would have been worth pressing. The posting that defined the problem states its role in
  prose and names no employer at all, because a matching platform listed it on behalf of an unnamed
  partner; **naming that platform is the canonical wrong answer**, and the prompt says so in as many
  words. Three new columns on `jobs` (`title_source`, `company_source`, `identity_prompt_skipped`,
  migration `0028`, additive) record where each half of the identity came from, which is what decides
  a re-parse: `user` is never overwritten, `inferred` yields to a real extraction and is kept when
  there is none, `extracted` behaves as part A left it. That first rule is load-bearing - without it a
  hand-typed company goes through `is_usable_company` on the next parse and is discarded for not
  looking like a company name. `job_set_identity` writes the identity columns only, so naming a job
  cannot fork it or invalidate its cached score. The phase runs off the parse, not inside it: `job_paste` returns and the button
  frees, then a root singleton names the job in the background under a 45-second bound, reports
  itself on the card and - once the user leaves - in a corner badge beside the resume-tailor one.
  Awaiting it inside the parse was the first cut and produced exactly the symptom you would expect:
  a spinner that never stopped. Resolution and storage live in
  `apps/desktop/src-tauri/src/commands/job_identity_source.rs`; the chain is
  `JobIdentityResolverService`; the dialog is mounted at the shell beside `UnsavedJobPromptComponent`;
  and `job-meta-card` came out of the jobs page to host the inferred marker and the "Name it yourself"
  button. **Verified natively:** the maintainer ran the whole chain in `tauri dev` - migration `0028`
  applies, the parse returns immediately, the AI names what it can, the dialog asks about the rest,
  the header follows the job, and the rename button works from both entry points. Six rounds of
  correction were needed to get there and five of them were found by running the application, not by
  a test: an NG0600 the dialog threw on every open, a settings source nothing in the app populates so
  the AI step never ran once, a superseded dialog recorded as a deliberate skip which then silenced
  every later parse of the same posting, a page header pushed from one call site that every other
  path forgot, and the parse itself blocking on an AI call and a human dialog.
- **A job is a row, not a hash of its text, and My Jobs holds only the ones you claimed.** Editing a
  saved job's description used to fork it: `job_paste` upserted on `jd_hash`, so an edit matched
  nothing and inserted a second job every time while the row on screen kept the old text. It now
  takes an optional job id, and with it the row is the identity; without it the hash still is, which
  is what a first paste needs. A collision is reported rather than merged. That fix exposed a latent
  one - `score_cache_get` matched on `(job_id, profile_hash)` only, safe only while an edit always
  produced a fresh job, so it now also requires the job's current `jd_hash` and an edited
  description falls through to the stale-score path. Separately, My Jobs listed every analysed job
  badged **Saved**: the list is now the jobs with an application, `no_status` no longer claims
  otherwise in any of the six locales, and a `CanDeactivate` guard asks before leaving an analysed
  but unclaimed job. The abandoned row is kept, so re-pasting the same posting reuses the score
  already paid for. The paste pipeline lives in
  `apps/desktop/src-tauri/src/commands/job_paste.rs`, split out of `scoring.rs` at its budget.
- **The jobs page is down to twelve seams extracted, and the document-drafts region is finished.** Wizard navigation - open/closed, the step
  index, the saved mid-flow progress, the cross-job confirm - is now `WizardNavService`, and
  `jobs.component.ts` is **1612** non-empty lines, from 2788 where the split started. Seams eight
  and nine cut _into_ the 591-line document-drafts region rather than moving it: CV generation is
  `CvDraftService` and the cover letter is `CoverLetterDraftService`. The gap-fill both flows ran as
  two copies of the same twenty lines is now one `foldInGapAnswers` they share. The link/commit lifecycle is
  `LinkedDocumentsService`, which finishes the region - four services out of what was one 591-line
  block. Job save/delete is `JobActionsService`, and the JD intake path - parse, status line, cache
  probe, archetype check - is `JobIntakeService`, which takes a snapshot in and returns a result out
  so the "the JD changed, so this is stale" resets stay with the page that owns them.
  `jobs.component.ts` is **1532** lines. **The compensation/archetype derivations were examined and
  deliberately left in place** - the earlier note that they "probably want to be functions in
  `libs/core`" was wrong, because they already are: `parseArchetypes`, `parseProfileMd`,
  `compareCompensation` and `extractSalaryFromJd` are pure and specced there (31 cases for
  compensation alone), and the 19 lines on the page are signal wiring over them, not logic. Moving
  wiring buys indirection and no test seam. That closes the list of named Tier 1 seams. What is
  actually left is the tailoring/photo-prompt cluster - `startTailoringCoverLetter` and
  `acceptPhotoPrompt` are the two largest bodies still on the page - and it is a different kind of
  work: orchestration across services rather than a responsibility waiting to be lifted out. The work each
  step triggers stayed on the page deliberately, which is what makes the service testable without an
  AI call or a database: 16 tests where it had none. `jobs.component.html` is still byte-identical to
  `main` across all seven seams.
- **Open pull requests, as of 2026-07-30**: #218 (the release verification runbook plus a state sync)
  and #219 (a formatting-only sweep of nineteen files), both merged since; the zoneless migration is
  the one currently open.
  Merged today: #204, #205, #207, #209, #210 (the ReDoS fix), #212 (eslint 10 and the four packages
  #208 was blocking), #214, #215, #216, #217. Closed as superseded or withdrawn: #202, #203, #206,
  #208, #213 - #213 closed itself the moment #215's ignore rule landed.
- **The smoke test is now a procedure rather than a research task.** `docs/RELEASE.md` section 3 has a
  step-by-step runbook: macOS natively first, Windows in a free UTM machine running Windows 11 on ARM
  (which emulates the published x86_64 installers transparently), and three routes for x86_64 Linux
  with their trade-offs. It also records what none of it proves. **It has not itself been executed** -
  the first pass through it is also a review of it.
- **`typescript` is blocked by two constraints, not one.** Angular 21's compiler wants `~5.9`, and
  `typescript-eslint` 8 declares `>=4.8.4 <6.1.0`. Both have to move before a TypeScript major can
  land, so the Angular 22 upgrade alone would not unblock it. A TypeScript major fails before any task
  runs, because nx cannot build the project graph - which is why it took down three separate pull
  requests and masked the four innocent packages grouped with it.
- **The `v0.29.1` tag exists but shipped no installers.** Every job in the release matrix failed on
  `nx: not found` before building anything, because `tauri-action` runs `tauri build` directly and
  only npm puts `node_modules/.bin` on `PATH`. Fixed in `6c05322` (#197), which also gave
  `release.yml` an explicit CSP guard step - `tauri-action` bypassed the npm script the guard lived
  in, so the only build a user ever downloads was the only one not checked. **The tag has not been
  re-released**: re-running the workflow against `v0.29.1` is the outstanding step.
- **Two Dependabot majors are blocked on Angular 22, which is itself blocked.** #185 (angular group)
  fails with `The Angular Compiler requires TypeScript >=6.0.0 and <6.1.0 but 5.9.3 was found`, and
  #196 (dev-tooling group) sets `typescript` to `~7.0.2`, which no Angular version here accepts - nx
  cannot even build the project graph. Angular 22 additionally needs an `@ngrx/signals` that does not
  exist as a stable release: latest is 21.1.1, peer `@angular/core: ^21.0.0`, with only a
  `22.0.0-beta.0` published. `@ngrx/signals` is imported from exactly one file. Open replacements:
  #198 supersedes #184 (rust majors plus the code they require), #199 supersedes #196 (the tooling
  bumps that do not depend on the Angular version).
- **The desktop bundle could not be built until 2026-07-29, and nobody knew.** `frontendDist` in
  `tauri.conf.json` pointed two directory levels up from `src-tauri/` instead of three, so
  `tauri build` aborted with "Unable to find your web assets" before ever producing an installer.
  It survived five tagged releases because the release workflow is blocked on GitHub billing and
  never reached the build step. Fixed; `Applye_0.29.0_aarch64.dmg` (16 MB) now builds and is
  verified on Apple Silicon. Windows and Linux remain unbuilt - they need CI or a VM of the
  target OS, and `docs/RELEASE.md` documents both paths plus a smoke-test checklist.
- **Angular 22 was investigated and deliberately not taken.** Nothing in the app needs it, 21.2 is
  supported and patched, and the upgrade existed only because Dependabot opened a PR. The
  investigation was still worth it: it found that `@nx/angular` 23.0.1 caps Angular below 22 (23.1.0
  lifts it), that Angular 22 needs TypeScript 6.0.x specifically and not 7, and that `@ngrx/signals`
  had no stable release for Angular 22 at all. That last one is now moot - NgRx is removed.
- **The architecture is enforced as of 2026-07-29, not merely intended.** All six projects carry
  `type:`/`scope:` tags and `@nx/enforce-module-boundaries` declares the dependency stack; it went
  in green, because the graph was already clean. `jobs.component.ts` dropped from 4975 to 2795 lines
  by moving its inline template and styles into files, and 53 components gained
  `ChangeDetectionStrategy.OnPush` (not Angular 21.2's default, though the framework is moving
  there). Conventions for both stacks live in `.claude/skills/applye-angular` and
  `.claude/skills/applye-rust`; `.mcp.json` wires the first-party Angular CLI MCP server read-only.
  **Still open (Tier 1):** `JobsComponent` is being decomposed into services - six seams are out
  (#222, #223, #225, #229, #230, #231 all merged), four responsibilities remain - `pages/` wants
  reorganising into per-feature folders, and `discover.rs`/`tailoring.rs`/`documents.rs` are
  oversized single modules. The eager
  change-detection item is closed: every page component is on OnPush.
- **README and repository infrastructure are launch-ready as of 2026-07-29.** All six READMEs
  carry an FAQ, a source table for Discover, a Connect section, and tech-stack badges;
  `SUPPORT.md`, `dependabot.yml`, `CODEOWNERS` and an "Applye helped" issue template exist. The
  `PLACEHOLDER: release links` block stays until real installers are published. A CLI surface was
  explicitly decided against - the desktop app is the product.
- **THE SITE IS LIVE at `https://applye.dev`.** First deployed to `applye.pages.dev` 2026-07-26;
  the custom domain was attached 2026-07-29, apex and `www` both proxied CNAMEs to
  `applye.pages.dev`, certificate issued the same evening. `applye.pages.dev` keeps working and
  cannot be removed - it is the project's built-in hostname - but every page canonicalises to
  `applye.dev`, so search consolidates on the domain. The maintainer's DNS showed NXDOMAIN for
  roughly ten minutes afterwards; that was a resolver cache, not a misconfiguration.
- **The site is indexable as of 2026-07-29.** `X-Robots-Tag: noindex` was removed from
  `public/_headers` and `SEARCH_INDEXABLE` flipped to `true` in the same change. The header had held
  the site out of search while the documentation still showed placeholder boxes where its
  screenshots and video would go; all 25 assets shipped in #171, so the reason expired. `robots.txt`
  allows crawling and always did: a crawler blocked from fetching never reads a noindex and may list
  the URL anyway. The two remain coupled by a test - verified on 2026-07-29 to fail when only the
  flag was changed - so putting the header back means flipping the flag too. **Deployed and
  confirmed on the live domain the same evening:** no `X-Robots-Tag` on any response.
- **Every URL handed to a crawler now carries a trailing slash** (#174). The build writes
  `de/index.html`, so Pages answers `/de` with a 308 to `/de/`, while the sitemap, `hreflang`,
  breadcrumbs and each page's own canonical emitted the slashless form - all 39 sitemap URLs were
  redirects, and the page a crawler landed on named the redirecting URL as its canonical. Search
  Console reports that as "Page with redirect" rather than indexing it. One helper, `siteUrl()` in
  `apps/web/src/app/site.ts`, now feeds all four; the sitemap generator is a Node script that cannot
  import it, so it mirrors the rule and a test reads the generated file back and checks it.
  **Verified live after deploy: 39 of 39 sitemap URLs return 200 with no redirect**, and canonical
  and `hreflang` on `/` and `/de/` match the sitemap exactly.
- **`BingSiteAuth.xml` is served from the site root** for Bing Webmaster Tools verification.
- **Outstanding after launch, none of it blocking:** Google Search Console (property not created,
  sitemap not submitted), Bing verification not yet clicked, the Cloudflare Web Analytics hostname,
  and HSTS - deliberately deferred about a week, since browsers remember it for its whole max-age.
  The short-lived Cloudflare API token minted for the domain attachment carries DNS edit rights and
  should be deleted.
- **Verified on the live site 2026-07-26**, not merely locally: all six security headers present;
  39 routes served; per-locale titles correct; canonicals point at `applye.dev`; JSON-LD present
  (product + FAQ on landings, product + breadcrumbs on docs); 404 works; sitemap and robots served.
  The consent gate was exercised end to end - before consent no Google script, no `gtag`, no
  cookies; after clicking allow, `googletagmanager.com/gtag/js?id=G-ZY158GV42C` loads, confirming
  both the gate and that the build carried the real measurement ID rather than the placeholder.
- **Blocked: GitHub Actions cannot run.** Jobs fail in seconds with "the job was not started
  because recent account payments have failed or your spending limit needs to be increased".
  Actions bill minutes on private repositories. Every run since before #164 failed this way,
  including on `main`, so the `deploy-web` job has still never executed and the CI gate has never
  actually gated anything - the local gates are what has been protecting the tree. Until billing is
  fixed, deployment is manual: `npm run web:deploy` (needs `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` in the environment) runs format, lint and tests first and refuses to
  upload if any fail, because the gate is the point of the job it stands in for.
  **The second consequence surfaced on 2026-07-29: `release.yml` has never built an installer.** It
  triggers on `v*` tags and uses tauri-action to build and attach the `.msi`, `.dmg` and
  `.AppImage`, so with the block in place all five published releases carry notes and no assets, and
  the READMEs' "builds will be published at public launch" placeholder cannot be closed. The
  workflow has no `workflow_dispatch`, so once billing is fixed the release build has to be
  triggered by re-pushing a tag or the artifacts uploaded by hand with `gh release upload`. **The
  third is cosmetic until it is not:** every push leaves a red run on the branch, and a repository
  that opens to the public with a failing CI badge and asset-less releases reads as abandoned
  regardless of what the code says. Fix billing before the repository goes public.
- **All guide media lives in Git LFS, and a clone without it deploys stubs.** `*.mp4` and
  `apps/web/public/guide/*.png` are tracked through LFS, because both get retaken and git keeps
  every version of a binary in full. Deployment is manual from a working copy, so a machine without
  `git-lfs` installed would check out 132-byte pointers, pass every gate - the build copies whatever
  is in `public/` without looking at it - and upload those to Cloudflare in place of the assets.
  Install Git LFS before deploying. The `.husky/pre-push` hook covers the other direction and
  refuses to push when git-lfs is missing. **LFS hooks belong in `.husky/`, not `.git/hooks`**: the
  repository sets `core.hooksPath`, so `git lfs install` writes where git never looks here, which is
  how the first attempt pushed pointers with no objects behind them.
- **History was rewritten once, on 2026-07-28, and must not be again.** The media committed before
  LFS was introduced was moved into it by rewriting `v0.25.0..main`, 74 commits. A like-for-like
  clone of `main` fell from 23.70 MiB to 7.07 MiB. **No tag moved and no release changed** - every
  guide asset was added after `v0.25.0`, the last tag, which is the whole reason the rewrite was
  cheap, along with the repository being private, unforked and checked out once. Commit SHAs in that
  range all changed, so PRs #168 and #169 reference commits that are no longer on `main`; their
  descriptions survive, the commit links do not. The pre-rewrite state is kept on the remote branch
  `backup/pre-history-rewrite` and as a local mirror at
  `~/applye-capture-states/repo-mirror-pre-rewrite.git`. Once the repository is public, this
  operation stops being available at any acceptable price.
- **Analytics: code done, one dashboard step left.** Six GA4 events behind a hard consent gate,
  ten custom dimensions registered before any traffic, Enhanced measurement and Google signals off,
  DPA accepted. The measurement ID is committed as `G-PLACEHOLDER` and injected at build time, so
  checkouts, dev servers and tests can never reach the live property. Cloudflare Web Analytics is
  adopted as the cookieless complement and needs no snippet, but **the hostname has not been added
  in the dashboard yet** - do that after `applye.dev` is attached. Structural limit worth
  remembering: `download_click` counts clicks on a link that leaves for GitHub, so completed
  downloads come from `npm run web:downloads`, never from GA4. Full setup:
  `docs/internal/ANALYTICS_SETUP.md`.
- **Corrected 2026-07-27: the advertised AI providers were wrong, twice.** The site and README
  offered Google Gemini and an OpenAI API key; the app supports neither. The dispatch tables are
  the only truth here: `run` in `apps/desktop/src-tauri/src/ai/api.rs` has arms for `claude` and
  `deepseek` and nothing else, and `adapter_for` in `ai/cli.rs` has `claude` and `openai`/`codex`.
  So OpenAI is reachable only through Codex CLI, and Gemini is reachable through nothing. An
  earlier pass had "fixed" this by claiming Gemini was API-key only, which swapped one false claim
  for another. Copy across the landing page, `/press`, both AI docs pages, the FAQ in six locales
  and the README now names exactly those four arms. **The app side is fixed too, on `main` as of
  2026-07-27** (`160bd1d`, `c745274`), found while capturing the onboarding screenshot: the
  onboarding AI step offered an OpenAI card in the API-key flow, its CLI card still read "Claude
  Code, Codex or Gemini CLI" in all six languages, and Settings listed both providers as disabled
  "(coming soon)" rows promising work that is not planned. All three are corrected, and migration
  `0027_drop_openai_api_provider.sql` moves installs already stranded on `openai`/`gemini` in API
  mode over to Claude, the same rescue `0022` performed for Gemini in CLI mode. Correcting an
  earlier note in this file: those Settings entries were `disabled`, so they could not be picked and
  rejected at call time; the selectable defect was in onboarding.
- **NEXT BLOCKER FOR LAUNCH: one media placeholder of 25 left**, `guide/discover-scan`, in
  `/docs/guide/discover`, still rendered as a dashed box. Plus a signature image on `/manifesto` and
  a press kit on `/press`, which are marketing surfaces rather than guide slots. Note the earlier
  count of "26" was off; the code holds 25 media boxes in `apps/web/src/app/docs/guide-pages.ts`.
  Fourteen were captured 2026-07-27; the remaining ten were captured by the maintainer on
  2026-07-28 and wired in: `documents-library`, `cv-editor`, `gap-dialog`, `interview-timeline`,
  and six recordings - `tour-walkthrough`, `tailor-wizard`, `paste-job`, `cv-import`,
  `pipeline-drag`, `profile-regenerate`. **Every GIF slot shipped as a silent looping MP4**, which
  the capture rules allow as the fallback above ~3 MB. The shot list, with capture rules and a
  per-asset record of how each shipped asset deviates from its slot, is
  `docs/product/MEDIA_SHOTLIST.md`.
- **`discover-scan` was captured and rejected, and needs a deliberate re-shoot.** Scanning the
  built-in sources returns real openings from real German employers, and they fill the feed on
  screen. No frame in this documentation may carry a real employer, recruiter or contact, so the
  take was left out of the repository. Capture it against a user-added source on a reserved example
  domain, or stop the recording before results land and show the console alone. The rejected file is
  kept outside the repo at `~/applye-capture-states/media-inbox-2026-07-28/`.
- **The two weakest recordings were re-shot 2026-07-28; one shipped asset still misses its slot.**
  `tour-walkthrough.mp4` is now the whole first run, 45.9 s across all six onboarding steps, slowed
  enough to read and with the model-call waits cut. It is still not the narrated 2-3 minute tour of
  every sidebar section the slot describes - there is no narration and the sidebar is covered by the
  page's own text - but it is complete for what it shows, where the 18-second version stopped
  mid-flow. `profile-regenerate.mp4` went from 2.2 s to 5.1 s and now shows the working state the
  slot asks for. `pipeline-drag.mp4` was reviewed again and kept at 3 s: under the floor, but the
  drag and the modal both read. `tailor-wizard.mp4` is unchanged - 36 s against 60-90 s, stopping
  before Export & Apply, with its caption already corrected to "to generated documents".
  `documents-library.png` shows two rows rather than three or four and carries no Default badge;
  filling it out is free, no AI call.
- **A personal path shipped in the tour video twice, and both instances are now closed.** The first
  was caught before release: the take's last half-second, after the app opened on Settings, showed
  the CLI detection block listing absolute paths under the maintainer's home directory, so the video
  was cut to end on the "You're all set" summary instead. **The second was found on 2026-07-29 and
  had been live.** The welcome screen's environment check renders the export folder as an absolute
  path from 2.600 s to 3.900 s - the opening of the same file, which the July fix never looked at.
  The line is blurred now (luma-only `gblur` over a 320x28 rectangle, enabled only for that window)
  and the file re-encoded at CRF 26, 820 KB to 661 KB, at unchanged resolution, frame rate and
  duration. **The rule is wider than Settings:** any screen that prints a filesystem path is a
  capture hazard, the first-run environment check included, and a take has to be checked at both
  ends rather than at the end that failed last time. **This needs a redeploy to reach the live
  site**; until then `applye.dev/docs/guide/tour/` serves the version with the path in it. Separately, every guide recording is now silent as a file rather than merely muted in the
  markup - the screen recorder had attached an empty AAC track to all seven - and the four heaviest
  were re-encoded at CRF 23, taking the guide's video weight from about 14.7 MB to 4.1 MB.
- **The guide was reviewed by eye on 2026-07-29 and reads correctly** - by the maintainer, not by
  any agent. The browser preview still returns a blank frame with `innerWidth` 0, so every agent-side
  "it looks right" remains "the asset is served with the right attributes", verified through the DOM,
  over HTTP against `localhost:4300`, and against the prerendered HTML in `dist`. One change came out
  of that review: the wordmark's trailing cursor bar was dropped from the header and the footer,
  because the mark already carries a vertical stroke on its left and the pair read as brackets around
  the name.
- **The last guide asset, `guide/discover-scan.mp4`, shipped 2026-07-28.** How it was captured
  matters for any re-shoot: `discover_scan` refuses anything that is not `https://`
  (`require_https`, `discover.rs:1578`) and reqwest is built with `rustls-tls` on the bundled
  Mozilla roots (`Cargo.toml:32`), so no local server - plain HTTP, self-signed, or mkcert - can
  ever be scanned. The invented feed in `tools/capture/demo-jobs.xml` was therefore hosted on a
  throwaway Cloudflare Pages project, scanned with every built-in source switched off, and the
  project deleted right after. The deviations from what the slot asked for are recorded in
  `MEDIA_SHOTLIST.md`; the short version is that the scan console is legible only on a freeze frame,
  because a single small feed resolves in about 0.15 s. **The maintainer's own database was restored
  afterwards** from `applye.db.pre-seed-2026-07-27T10-26-53-893Z`: eight source rows, TrudVsem
  enabled and the other seven off, no jobs and no profile - which is what it held before the first
  capture session. The seeded demo state it replaced is archived at
  `~/applye-capture-states/70-capture-2026-07-28-post-scan/`. Note that
  `~/applye-capture-states/99-your-real-data/` no longer contains real data despite its name: it was
  overwritten with a seeded copy on 2026-07-28.
- **Four API calls were spent with the maintainer's approval** - one scoring profile, scoring runs
  on Northlane (82) and Vantaform (72), and one tailoring run. Vantaform was scored specifically
  because Northlane matched too well to produce the missing-keyword chips the docs page promises.
  The CV import that filled the Documents library used the app's own import flow on
  `tools/capture/mira-cv.html` converted to DOCX, because `document_library` rows can only be
  created by importing, generating, or finishing the apply wizard - writing rows straight into
  SQLite would produce a state no user can reach.
- **Corrected 2026-07-28: the Interview Prep observation this entry replaces was wrong as written.**
  It said clicking a row opened the overflow menu instead of the stage timeline. The code never did that:
  `interview-prep.component.html:66` binds `(click)="open(r.id)"`, `open()` navigates to
  `/interview-prep/:applicationId`, the route exists and the detail page renders the round timeline.
  The menu hangs off its own button inside a wrapper that stops propagation, which is why pressing it
  does not navigate. What was true is smaller: the menu offered removal and nothing else, and the row
  declared `role="button"` while handling only Enter, so Space did nothing. Both are fixed on
  `fix/prelaunch-capture-findings` - the menu now opens the timeline as its first, non-destructive
  entry, and the row responds to Space. Five tests cover the row's actions, where the component had
  no spec at all before; three of them fail against the old template. **Natively verified by the
  maintainer on 2026-07-28** under `npm run desktop:dev`, which is what closes this one: both the row
  menu's new first entry and the Space key were exercised by hand. Still unexplained: what actually
  blocked `interview-timeline.png` during the capture session, because the reproduction was never
  captured. The most likely cause is that the click landed on the `⋯` button at the row's right edge.
- **Second product finding: a target role whose distinctive word is under three letters could never
  match anything. Fixed 2026-07-28.** `archetypeWords` dropped every word shorter than three
  characters and `matchArchetype` requires one distinctive (non-generic) word to anchor, so "UI
  Engineer" reduced to "engineer", which is generic, and the archetype was silently dead: no Discover
  badge, no For-you grouping, no effect on scoring prompts. A seven-entry allowlist (`ui`, `ux`, `qa`,
  `ml`, `ai`, `bi`, `db`) now survives tokenization; `go` was deliberately left out because
  boundary-aware matching would also fire it on "go live". The user is now told as well: the profile
  editor warns under any target role built only from generic words, using the shared
  `hasDistinctiveWord()` so the warning and the matcher can never disagree. Warning shipped in the
  profile editor only, not in onboarding, where names come from AI suggestions the user then edits.
  The bug was found while trying to show the adjacent tier in `discover-badges.png`, which is why
  that shot shows an unmatched row; the shot was not retaken, so it still shows the pre-fix state.
- **Third finding, from the 2026-07-28 capture session: three guide slots described a UI that does
  not exist**, which is worth deciding on rather than only documenting. In the CV editor the preview
  is a mode that replaces the editor (`cv-detail.component.html` renders `editor-col` or
  `preview-col`, never both), so it can never be shown beside the section list; and there are no
  section-level style overrides at all - style is one document-wide block. In the Documents library
  there is no "Tailored" badge anywhere: `cv-list.component.html` renders only region, language and
  Default, and a tailored document is recognisable instead by its label and its linked-application
  line. In the apply wizard the save-to-profile toggle is not on the gap question; it sits on a
  separate confirmation dialog after the last question. Each of the three is a plausible feature
  someone expected to exist, so the question is whether the product grows toward the description or
  the description settles for the product.
- **Decided 2026-07-28: the description settles for the product, for all four gaps, and they are
  parked rather than dropped.** The guide already describes what ships, so no code was written for
  any of them; the decision is deliberate rather than inaction, and the reasoning is now in
  `docs/product/IDEAS.md` under "Features the documentation expected to find" - Tailored badge
  (P2/S, cheapest and the one with real daily value), live preview beside the section list (P2/M, a
  layout question at 1440 points, not a template change), section-level style overrides (P3/M, needs
  a schema addition, a migration and an export path for a mostly cosmetic gain), and the
  save-to-profile toggle moving onto each gap question (P3/S, splits one consent point into several,
  which is why the single dialog was built). Nothing here blocks the launch.
- **Decided 2026-07-28: a manual empty CV is worth building, but after launch.** `document_library`
  fills by exactly three paths - importing a file, generating a baseline, finishing the apply wizard
  - and the first two are AI calls, so a new user cannot start a CV by hand and no documentation
    state can be prepared without spending money. A fourth path, an empty CV from the section template
    with no AI, is filed in `IDEAS.md` at P2/S. Not done in this watch: it is a new write path into
    the user's document store, which deserves its own watch rather than a pre-launch aside.
- **Open decision: the scored view does not fit one frame.** The gauge and the red flags are more
  than 900 logical points apart, so `score-result.png` shows the lower half - chips, ATS check, red
  flags, before-you-submit. Either that stands, or `/docs/guide/score` gains a second figure for the
  gauge and the recruiter verdict. Nothing is blocked on the answer.
- **Seed and capture fixtures live in `tools/capture/`.** `seed.mjs` fills a throwaway database with
  the demo persona and eight invented jobs; `demo-jobs.xml` is an invented feed kept out of
  `apps/web/public` so a deploy cannot publish fake vacancies. Two app behaviours worth knowing
  before the next session: the current interview stage is the highest `stage_order` that is not
  rejected or cancelled, so an undated later round hides a booked earlier one from the Dashboard;
  and the app does not scroll by keyboard or expose scroll bars to accessibility, so the working
  technique is Tab, which pulls the container to the focused field.
- **Capture rig, working as of 2026-07-27.** Claude has macOS Screen Recording and Accessibility
  permission, so the agent can size the dev-build window to exactly 1440x900 with `osascript`, click
  through the app with System Events, and write 2880x1800 PNGs with `screencapture -R`. The dev
  binary is not an `.app` bundle, so the computer-use grant path cannot target it; the AppleScript
  path is what works. The maintainer's live database was copied to
  `~/applye-capture-states/99-your-real-data` before anything was driven. **The rig depends on the
  5K display being the main one**: `screencapture` returns 1x on the 1920x1080 screen, which
  silently produces 1440x900 files that break the shot list's 2x rule. Check
  `system_profiler SPDisplaysDataType` before a session.
- **Shipped to the branch: launch SEO pass (`a510885`, `bb29b58`).** The sitemap, canonicals,
  `hreflang` and per-locale `<html lang>` were already correct and were left alone. Landing
  descriptions were trimmed under the roughly 160 characters search results show; landing pages now
  emit `FAQPage` in their own language and the 24 docs pages emit `BreadcrumbList`. This uncovered a
  defect live since `495d413`: `og:title` and `twitter:title` read the previous page's title, so
  every route except the six landings advertised the home page headline when shared. Fixed, with a
  regression test verified to fail against the old code. 62 tests, up from 48.
- **Launch sequence agreed 2026-07-27.** Website first, repository and desktop release later. The
  site ships in coming-soon mode (`COMING_SOON = true`, `SOURCE_PUBLIC = false` in
  `apps/web/src/app/site.ts`) with no download and deliberately no waitlist form, runs live long
  enough to accumulate traffic and search indexing, and only then does the author's launch article
  publish, followed by opening the repository and cutting the public release. All six locales ship
  on day one. General contact is `hello@applye.dev`.
- **Shipped: website design pass (`a7e4574` on `main`).** Five of the eight gaps in the plan's
  gap analysis are closed; gaps 1-3 (hero product shot, demo GIF, six feature screenshots) are
  blocked on assets that do not exist and no placeholder was shipped in their place. Closed: the
  hero's two dead controls became one live primary CTA ("Read the docs") plus a download _status_
  carrying its own reason; a new `#engines` band proves the bring-your-own-AI claim with wordmarks
  rather than vendor logos; the OG image turned out to be already shipped and correct (the plan's
  "1280x640, not wired" was stale); and a measured consistency pass fixed contrast (`--text-tertiary`
  was 2.75-3.38:1 doing body-text duty; light-theme `--success`/`--warning`/`--danger` were
  2.61/2.23/3.73:1 as text), three independent causes of horizontal scroll at 375px, a missing
  `forced-colors` focus fallback, a banned side-stripe border, and a clipped comparison tag when
  stacked. Separately, the site claimed a Gemini CLI bridge in all six locales that
  `apps/desktop/src-tauri/src/ai/cli.rs:222` does not implement - corrected. Contrast fixes are
  web-scoped overrides, **not** token edits: `libs/ui/tokens.css` mirrors the design system, is not
  hand-edited, and is shared with the desktop app, so **whether these corrections go back into the
  design system is an open decision that also affects the app.** Gates: `nx test web` (41),
  `nx lint web`, `tsc --noEmit`, `format:check`, `nx build web`, `git diff --check` all pass.
  Verified in-browser: zero AA contrast failures in both themes, zero horizontal overflow at 375px
  across ten routes.
- **In flight: Discover Sources placement (uncommitted, on `main`).** Reported from use: an empty
  Discover list had no route to the sources drawer, so clearing the list or disabling every feed
  left the screen with a Scan button and nothing to scan. The button lived in `.dv-filters`, which
  renders only for `view() === 'feed'`; `caughtup`, `never` and `scanning` had no opener at all, and
  the first-run CTA needs both never-enabled and never-scanned. Moved into `.dv-head__right` beside
  Scan, which `showHeader()` covers for every view except `first` and `skeleton`. `.dv-filters__clear`
  inherited the `margin-left: auto`. New `discover.component.spec.ts` pins one opener per view across
  `caughtup`, `never`, `feed` and `first`, and pins that the header button opens the drawer. Gates:
  `type-check`, `lint`, `npm test` (desktop 696 -> 701), `format:check`, `nx build desktop`,
  `git diff --check` all pass. Not verified natively - Discover needs Tauri IPC to render.
- **Also in flight: public-release documentation pass (uncommitted, on `main`).** Version badge in
  all six READMEs was `0.25.0` against an actual `0.28.0` and is bumped. `AGENT_START_HERE.md`,
  `PROJECT_CONTEXT.md`, `INSTRUCTIONS.md` and `DUTY_WATCH.md` moved from the repository root to
  `docs/internal/` with a README explaining the directory; all 30 references were rewritten and
  verified. Twelve tracked files pointed at `STEP_BY_STEP_PLAN.md`, which has never been in git -
  references removed, the file gitignored alongside `AGENT_PROMPT_*.md`. Fifteen links to the
  gitignored `CAREER_OPS_ADOPTION.md` unlinked. CI re-enabled at `.github/workflows/ci.yml` and
  `workflows-disabled/` removed; `CONTRIBUTING.md` gained the CI reference, `format:check`, and a
  never-edit-a-shipped-migration rule. Gates: Nx lint/test/build on 6 projects, `cargo clippy`,
  `cargo test`, `format:check`, `git diff --check` - all pass. **Open:** the README still points at
  twelve media files that do not exist (hero, demo GIF, six screenshots, two wordmarks, video
  thumbnail); the maintainer produces those separately. Do not push the enabled CI workflow until
  the repository is public - Actions minutes are capped on the free plan while it is private.
- **Resolved: `security@applye.dev` / `conduct@applye.dev` are live (2026-07-26).** The
  documentation pass above noted these addresses were published in `SECURITY.md` and
  `CODE_OF_CONDUCT.md` before the mailboxes existed - a dead reporting channel. The maintainer set
  up Cloudflare Email Routing on `applye.dev`: MX/SPF/DKIM records added, both addresses forward to
  the maintainer's personal inbox, delivery confirmed both ways, and a DMARC record
  (`v=DMARC1; p=reject`) was added against spoofing. No file changes needed - both docs already
  referenced the correct addresses.
- **In flight: migration checksum restore (uncommitted, on `main`).** 0.28.0 aborts at launch on
  every pre-existing install: `run migrations: migration 1 was previously applied but has been
modified`. The repo-wide em dash sweep in `e06fd4b` rewrote `—` to `-` inside migrations 0001,
  0002, 0003, 0005, 0008, 0009, 0010, 0011 and 0020, all but three lines of it in SQL comments.
  sqlx stores a SHA-384 of each applied migration and refuses to run when the file changes, so the
  edit bricked the app with no in-app recovery. All nine are restored byte for byte from `e06fd4b^`,
  confirmed against the checksums stored in the dev database. `db::tests::applied_migrations_are
_never_edited` now pins all 26 checksums, so the next sweep fails a test rather than a release.
  The three non-comment lines seed `sources.notes`, which nothing renders, so no data migration was
  needed. Gates: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
  (280 -> 281), `npm run format:check`, `git diff --check` all pass. **`tauri dev` relaunched and verified after the restore was
  committed (`04db799`): the desktop binary starts and stays up, so the launch abort is gone.**
- **Merged: `chore/dependency-and-input-hardening` -> PR #161.** `cargo audit` had never been run on this
  project and was not installed; it found 7 advisories. Four are now gone: `cargo update` took
  `docx-rs` to 0.4.22 and `quick-xml` to 0.41.0, and `pdf-extract` 0.7 -> 0.12 took `lopdf` to 0.42.
  Three remain, each justified in writing in `apps/desktop/src-tauri/.cargo/audit.toml` - `lopdf`
  via `printpdf` is unreachable (it only writes our own PDFs), `quick-xml` via `calamine` is
  reachable through .xlsx import but has no fixed release upstream, and `rsa` is not in the desktop
  target's graph. Two code changes came with it: `commands::untrusted::catch_parser_panic` wraps the
  PDF, DOCX and XLSX readers so a panicking parser returns an error instead of killing the app, and
  `open_file` / `reveal_in_folder` now refuse any path that canonicalizes outside `app_data_dir`,
  is not a regular file, or does not exist. `cargo audit` and `npm audit --omit=dev` are now entries
  in the validation matrix. Gates: all Rust and frontend gates pass, `cargo audit` exit 0,
  `npm audit --omit=dev` zero, Rust tests 272 -> 280. Real-PDF extraction quality after the
  `pdf-extract` jump is not covered by tests and wants a spot check.
- **Merged: `feat/toast-coverage` -> PR #160.** Every user-initiated save, delete, duplicate,
  export, import and generate action on the desktop pages now raises the bottom-right toast, and so
  does each of their failures. The toast infrastructure was already correct - an uncaught error
  toasts on its own - so the gaps were caught-and-swallowed errors and success paths with only
  inline feedback: `cover-letter-list` had no toasts at all while its `cv-list` sibling had five,
  `jobs` wrote errors into `actionMsg` which is invisible after the navigation two of its actions
  perform, and `discover` sent seven user-action failures to `console.error` only. 9 components,
  16 new i18n keys in all six locales, inline status text kept rather than replaced. Still not
  checked on screen in the running Tauri app.
- **Merged: `feat/i18n-complete-locales` -> PR #158. ru, es, fr and uk are complete.** The previous entry fixed the
  merge that dropped labels from those four locales, but only 33-36 of 1438 keys were ever
  translated in each: they covered `nav`, `actions`, `status`, `ai` and `common`, and every other
  section - `documents` (272 keys), `jobs` (242), `profile` (154), `onboarding` (145), `discover`
  (133) and the rest - rendered in English. The key-set parity test could not see it, because the
  keys were all present, holding English strings. All four are now translated in full: 1438 of 1438
  keys each, matching `de`, which was already at 95%. Two structural changes came with it.
  `translations.ts` was one 3471-line file; it is now one file per locale (`en`, `de`, `ru`, `es`,
  `fr`, `uk`) plus `merge.ts`, `types.ts` and a 13-line `translations.ts` that only assembles
  `TRANSLATIONS`. And a second test now asserts that no locale's value equals the English one
  unless the key is listed in `SHARED_WITH_ENGLISH` - 122 entries covering product names, URLs,
  placeholders, empty strings and genuine cognates - so a locale cannot quietly revert to English
  again. The locales still go through `stub(en, ...)`: nothing falls back today, but a key added to
  `en` tomorrow renders in English rather than as a raw dotted key. **One gate moved:** six complete
  locales pushed the desktop initial bundle from 692.69 kB to 1.26 MB raw (173.86 kB to 240.53 kB
  transferred) and broke the `1mb` error budget in `apps/desktop/project.json`, which was set when
  four locales were 5 kB stubs. Raised to `1300kb` warning / `1500kb` error, with the reasoning in
  `libs/i18n/README.md`: Applye loads its assets from local disk, so the cost is parse time, not
  download, and lazy-loading locales would mean making the synchronous `tFor()` async.
- **Merged: `chore/release-readiness-audit` -> PR #157. Pre-release audit of section wiring and
  validation gates.**
  Every cross-section link and every Tauri contract was checked mechanically rather than by eye.
  **Clean:** all 19 routes resolve, every route is reachable from the shell nav or another section,
  and no link points at a route that does not exist; all 91 Rust `#[tauri::command]` functions are
  registered in `generate_handler!` and every one the frontend calls exists (`validate_theme` is
  registered but has no caller - left in place, it is a pure validator); migrations `0001`-`0026`
  are gapless and `sqlx::migrate!` discovers the directory, so no registry can drift; the banned em
  and en dashes are down to the three documented parser-input fixtures; all eleven top-level pages
  render with no unexpected console error in the browser preview. **Three defects found and fixed:**
  (1) **Partial locales dropped labels.** `stub()` layered ru/es/fr/uk over English with a shallow
  spread, so a locale that translated a section replaced that whole section, and every English key
  it omitted vanished. `resolve()` renders a missing key as the key, so those four languages printed
  `actions.close` on the job-paste, CV-import and pipeline dialogs and `common.back` / `common.next`
  in the apply wizard. `stub()` now merges deeply; all six locales resolve the same 1438 keys, and a
  test asserts that parity so a key added to `en` cannot silently disappear from four languages
  again. (2) **`npm run type-check` was a no-op.** No project defined the target, so the command
  `AGENTS.md` and the validation matrix require before every commit printed
  `NX No tasks were run` and exited 0. Six `type-check` targets added, running `tsc --noEmit`
  against each project's app/lib config; all six pass. (3) **`libs/core` was never linted** - it has
  an `eslint.config.mjs` but no `lint` target, so `npm run lint` covered five projects and skipped
  it. Added; it passes (11 warnings, 0 errors, all pre-existing non-null assertions).
- **Merged: `feat/onboarding-welcome` -> PR #156, release 0.28.0.** Three strands. (1) The
  **animated welcome screen**, built from the design spec, plus the topbar buttons moved onto the
  design system, a footer scroll-spacing fix, a dashboard side-stripe fix and a profile header
  wrap fix. Its vertical rhythm was drawn in fixed pixels and came to 822px, so any window shorter
  than that scrolled; every step is now a `clamp()` on `vh` whose upper bound is the original spec
  value, verified with no overflow at 700x600, 860x640 and 1000x700. (2) The **profile name split
  into a first and a last name**. `fullName` stays canonical - still the markdown H1 and the CV
  document title - and the parts sit beside it as `## Contact` lines carried by the existing
  `CONTACT_FIELDS` machinery. `splitDisplayName` in `libs/core` is the only place that ever
  guesses, and reports confidence only for an unambiguous two-token name. When the parse cannot
  confirm the split, the onboarding review step nudges without ever blocking, and a test pins that
  Continue stays enabled. A whole-branch review caught three defects that every per-task review had
  passed, because all three lived between commits: an AI returning `firstName: ""` rather than
  `null` destroyed the name; the write path recomposed family-name-first names in Western order,
  which the prompt had just been taught to detect; and a hand-edited H1 in raw markdown drifted
  from the parts and was then silently overwritten. The last two were fixed together by making the
  display name independent and visible. (3) **Onboarding-to-profile sync fixes**: website, LinkedIn,
  education, spoken languages and salary were parsed but never reached the saved profile, role and
  company were merged into one string, and a dateless entry rendered as "Present".

  Also in the release: a repo-wide pass on the banned em and en dashes. The earlier cleanup only
  covered the translation strings, so dashes were still reaching users from exported CV and
  cover-letter date ranges, messages raised from Rust, the document editors' region labels and the
  Analytics empty placeholder. Three occurrences are deliberately kept, all parser inputs rather
  than output - real job postings contain en dashes, and those tests are the proof that parsing
  tolerates one. A boolean assertion in the CLI probe test that clippy rejected under `-D warnings`
  was also minimised; that failure predated the branch.

- **Next action**: unchanged by the audit, which could not reach any of it - a `tauri dev` pass on
  what has still never run natively. The welcome screen and
  the name-split confirm step were verified natively before merge, but the CLI-bridge Settings and
  onboarding UI, the ATS card, the assisted installer, and Interview Prep's CRUD (add/edit/delete/
  reorder stages) have not been. The browser preview cannot reach Tauri IPC, so none of that has
  been seen running. This is the only thing standing between `main` and launch prep.
- **2026-07-24 session, uncommitted on `main`:**
  - **Interview Prep AI generation UI removed** (workaround, not a fix). Native testing found the
    "Generate" button hangs on "Generating...". Interview prep is slated to become its own larger
    section later, so the generate button, the AI prep panel, and the component state behind them
    (`generatePrep`, `togglePrep`, `cardsFor`, `formatFor`, `jdText`/`prepOpenId`/`prepCards`/
    `generatingId` signals) were removed from
    `interview-prep-detail.component.{ts,html,scss}` rather than patched. `list_interview_prep` /
    `save_interview_prep_batch`, the `interview_prep` table, and the `interview-hr` /
    `interview-technical` / `star-r` skills are untouched, ready for that section.
  - **The hang was then root-caused and fixed** (`systematic-debugging`, later the same session).
    It was **not** an Interview Prep bug at all: **every API-mode AI call used
    `reqwest::Client::new()`, which carries no timeout of any kind.** A connection that was
    accepted and then went quiet (dropped wifi, sleeping laptop, stalled provider) was awaited
    indefinitely, `ai_run` never returned, the promise the UI awaited never settled, and so
    `generatePrep`'s `finally { generatingId.set(null) }` never ran - hence a spinner that stops
    for neither success nor error. Interview Prep was simply where it surfaced first: it is the
    longest generation in the app (up to `DEFAULT_MAX_TOKENS` = 8192, non-streaming), and the ATS
    card - the other thing being exercised that day - is computed locally in Rust with no API call
    at all. The same defect sat in **every** API-mode feature: CV tailoring, cover letters,
    scoring.
    - Fixed in `ai/api.rs` with a shared `http_client()`: 600s whole-request budget (matching the
      CLI bridge's existing `CLI_TIMEOUT`, which bounds the same unit of work) plus a 15s
      `connect_timeout` split out, so an unreachable provider is reported in seconds instead of
      consuming the full generation budget first.
    - **Same defect swept for and found twice more**, in `commands/job_url.rs` (`get_json` /
      `get_text`, the paste-from-link importer) - fixed there with a 30s budget matching
      `discover.rs`. No untimed `reqwest` client remains in the crate.
    - Pinned by a behavioural test, not just a compile check: a local TCP listener accepts the
      connection and then answers nothing. **Verified red before green** - with the `.timeout()`
      line removed the test FAILS after 30.01s (it only errors once the fake server drops the
      socket; had the peer held it open, it would have waited forever); with the fix it passes in
      0.31s.
    - **Honest caveat**: the mechanism is proven and fixed, but this was diagnosed from code and
      the user's stored settings (`ai_mode = api`, `provider = deepseek`), not reproduced live -
      the GUI cannot be driven from here. If the hang recurs after this, the next suspects are
      `saveInterviewPrepBatch` blocking on a busy SQLite lock, or the run genuinely taking longer
      than 600s.
    - **Two follow-ups for whoever rebuilds the section**, neither a hang and neither addressed:
      (1) `generatePrep` had an early `return` when the computed `inputHash` already existed on a
      loaded card - correct as a cache hit, but it renders as the button flashing and nothing
      happening, with no message; (2) even at 600s, ten minutes of "Generating…" with no progress
      and no cancel is poor. Streaming or a cancel button belongs in that rebuild.
  - **Local markets shipped** (`docs/product/local-markets-analysis.md`, now marked implemented).
    `settings.market: string | null` (migration `0023_local_market.sql`, Rust double-Option patch
    so it can be explicitly cleared back to null); a Local Market picker in Settings' Job search
    section, under the geoScope chips, auto-saving the same way geoScope does; the Discover Sources
    drawer now filters built-in sources to the chosen market plus worldwide ones, behind a "show
    all sources" toggle - user-added sources are never filtered. Seven new built-in sources, all
    shipped **disabled** (migration `0024_local_market_sources.sql`), every endpoint probed live
    both in the prior research session and again just now via `cargo test -- --ignored
live_tier2_sources_fetch_and_parse`, which passed for all 10 built-ins (3 existing + 7 new):
    DOU.ua, Djinni.co, Habr Career, Jobicy (plain RSS, zero parser code), TrudVsem, Arbeitnow, No
    Fluff Jobs (new JSON parsers - No Fluff Jobs needed `?salaryCurrency=PLN&salaryPeriod=month&region=pl`
    query params to avoid a 400, found live rather than assumed). `EUROPE_COUNTRIES` in
    `discover.rs` gained `"russia"`/`"russian federation"` tokens so TrudVsem's Cyrillic
    `region.name` (with ", Russia" appended, same pattern as Arbeitsagentur's ", Deutschland")
    matches a Europe geoScope. **Known gap, not fixed**: Habr Career puts the city in the RSS
    title, e.g. "Требуется DevOps (Москва)", and the shared `parse_rss_items` was deliberately left
    untouched (the zero-parser-code promise for the four RSS sources), so Habr postings get no
    location and fall into "Other" under a restrictive geoScope - only visible with geoScope set to
    worldwide or with Russia's continent included. Extracting the city would mean parsing
    parenthesised text out of titles in the _shared_ RSS parser, which risks false positives on
    every other RSS source (WWR, user-added feeds) and needs its own design pass, not a quick
    patch. Gates run clean: `cargo test --lib` (245 passed), `cargo clippy -- -D warnings` (0
    warnings), `nx run-many -t test --all` (6 projects), `nx lint desktop` (0 errors, pre-existing
    warnings only), `nx build desktop`. Not verified natively (Settings picker, Sources drawer
    toggle, an actual scan of a new source) - covered by the `tauri dev` pass above.
  - **Design polish: nonexistent CSS token sweep.** Cross-checked every `var(--...)` in
    `apps/desktop/src` against `libs/ui/tokens.css`. Found the same failure mode a prior session
    hit with `--border`/`--surface-raised`: names that read like tokens but were never defined.
    Eight fixed across six files - `--text-base`, `--text-2xl`, `--text-lg` (x3), `--text-md`
    (x2), `--border`, `--text-xl` - swapped for the real token with the closest size/semantic
    match (`--text-body`, `--text-h2`, `--text-h3`, `--border-subtle`, `--text-h1`). Some had no
    CSS fallback, so were a real (if quiet) styling bug: an invalid `var()` with no fallback makes
    the whole declaration invalid at computed-value time, so `border` disappeared entirely on
    `first-launch.component.ts`'s card instead of rendering `--border-subtle`. **Left alone, not
    fixed**: `--radius-md`, `--radius-modal`, `--motion-fast`, `--ok`, `--surface`,
    `--text-caption`, `--text-quaternary`, `--warning-strong` are the same pattern but every one
    carries a safe CSS fallback already, so nothing renders wrong today - swapping them to a real
    token risks an unverified visual size change with no native run available to check it
    against. Also confirmed as **not bugs** (false positives from the token-name check): `--cv-*`,
    `--col-accent`, `--ana-neutral-fill` are all real custom properties, just set dynamically
    per-instance (inline `[style.--x]` bindings or a component-scoped `:host` block) rather than
    declared globally in `tokens.css` - by design, not an oversight.
  - **Live bug found and fixed after the user's native `tauri dev` run: built-in sources with a
    hardcoded id can silently fail to install.** The run panicked first on a migration-checksum
    mismatch (`migration 24 was previously applied but has been modified` - migration `0024`'s
    No Fluff Jobs URL had been edited, adding the required query params, after an earlier
    background run had already applied the pre-fix version). Investigating the real dev DB
    surfaced a worse, pre-existing bug: `sources.id` is an ordinary autoincrementing column that
    user-added sources consume too, and both this session's migration `0024` (ids 5-11) and the
    already-shipped `0021` (`Bundesagentur fuer Arbeit`, id=4) hardcoded low explicit ids assuming
    they were free. On this real database - 4 custom sources already at ids 5-8 - the inserts for
    those ids silently no-op on the primary-key conflict instead of erroring, so **Bundesagentur
    fuer Arbeit was never actually installed despite `0021` shipping weeks ago**, and DOU.ua /
    Djinni.co / Habr Career / Jobicy were about to repeat the same silent failure. Fixed by
    renumbering: `0024_sources_url_unique_index.sql` (new, safe to renumber - unpushed) adds a
    partial unique index on `sources.url` (excluding the empty-url ATS-slug rows) and backfills
    Bundesagentur fuer Arbeit via `INSERT OR IGNORE` keyed on that index; `0025_local_market_sources.sql`
    (renamed from the old `0024`) now omits `id` entirely, same as a user-added source would get.
    Verified against the actual affected database (a throwaway, never-committed
    `#[ignore]`d test calling the real `Db::init` against the real app-data path, then deleted):
    all 7 local-market sources plus the backfilled Bundesagentur row now present with correct
    URLs, the 4 pre-existing custom sources and the 3 already-shipped built-ins untouched, no
    duplicates. `cargo test --lib` (245 passed) and `cargo clippy -- -D warnings` (clean) re-run
    after the fix. **Not yet re-verified with an actual `tauri dev` run** - the user's next one
    should now start cleanly; if it does not, this is the first place to look.
  - **Geo targeting reworked into two mutually exclusive modes** (after the user reviewed the first
    cut natively and found the logic wrong: a local market left the continent chips checked and
    still scanning, so "France" really meant "France plus all of Europe"). There is now one
    question, "where do you want to work?", answered in exactly one mode: **regions**
    (`geoScope` = continents, or empty = Worldwide) **or local markets** (`market` = country
    codes). Picking either side clears the other, so the pair is never both set; clearing the last
    market lands on Worldwide, exactly as clearing the last region already did. `market` changed
    from a single nullable code to a JSON array (same shape and legacy-scalar tolerance as
    `geoScope`; no migration - the column is TEXT and `parseLocalMarkets` reads the old bare `"fr"`
    as `["fr"]`). The Rust patch field dropped its double-`Option` in the process: `"[]"` is now
    the empty state, so plain COALESCE works exactly as it does for `geo_scope`. - **Markets now actually filter the scan**, which the first cut did not do - it only narrowed
    the Sources drawer, so the setting looked live but changed nothing about which jobs arrived.
    They feed `build_geo_cfg`'s second parameter, which already existed for country codes and
    was being fed from the `geo_filters` table. That table is **dead**: created in migration
    0001, never written by any frontend code, empty on this install, so `active_codes` has
    always been `[]` in practice. Markets take that slot when set; the region path still reads
    `geo_filters` so nothing is silently removed. `country_tokens()` gained `ru` and `ua` with
    both Cyrillic and Latin spellings of the major cities - TrudVsem returns `region.name` as
    "Москва" and Habr Career puts the city in the title, so a Latin-only list would have dropped
    the entire Russian market. This also partly closes the Habr city-in-title gap noted above:
    a Russian city in a title still is not extracted into `location`, but a market-mode search
    no longer depends on that, because empty locations pass anyway. - **Remote postings still pass in either mode** - unchanged, deliberate, and now pinned by a
    test that says so. A remote job is not "somewhere else". - UI: local markets are chips in the same vocabulary as the region chips (the full-width
    `<select>` is gone). The inactive row is **muted, not `disabled`** - the user asked for both
    "disabled" and "clicking a region turns the market off", and only muted-but-clickable
    satisfies both; the hint under it changes to say what is going on. Chips also gained the
    `:focus-visible` ring they never had. **Worth a second opinion on the next native pass**: if
    muted-but-clickable reads as broken rather than as inactive, hard `disabled` plus an
    explicit "switch to regions" affordance is the alternative. - **Review pass afterwards found two more defects in this same work, both fixed:**
    (1) the Sources drawer's "show all sources" checkbox was a one-way door - `hiddenBuiltinCount`
    was derived from the _visible_ list, so switching the override on drove the count to zero and
    unmounted the checkbox that switches it back. The narrowed set is now computed independently
    of the override. (2) **A source hidden by the market filter was still being scanned**: the
    scan selects `WHERE is_enabled = 1` and knows nothing about markets, so an enabled source the
    drawer had hidden kept fetching from a server the user could no longer see listed or switch
    off - unacceptable in a privacy-first app. An enabled source is now never hidden, whatever
    its tags. Both rules moved into the pure, tested `discover-sources.util.ts`, and the
    mode-switching invariant into `geo-target.util.ts` (whose spec asserts the two sides are
    never both set, across an arbitrary click sequence) - the same "make it pure and pin it"
    treatment `cli-models.util.ts` got, and for the same reason: this is exactly the class of
    bug that was just reported. - Checked and found sound, no change needed: onboarding never writes `geoScope`/`market`, so it
    cannot desync; Settings' explicit Save re-sends the same values harmlessly; Discover reloads
    settings in its constructor, so a market changed in Settings is picked up on navigation; a
    pre-upgrade row holding both a legacy scalar `market` and a stale `geo_scope` self-heals,
    because market is read first and the next toggle rewrites both. - Verified: `cargo test --lib` (251), `cargo clippy -- -D warnings`, `nx run-many -t test`
    (core 205 incl. a new `local-market.spec.ts`, desktop 657), `nx lint desktop`, `nx build
desktop`. **Not verified natively** - the browser preview cannot render Settings at all
    (it renders only under `@else if (settings(); as s)`, and `getSettings()` needs Tauri IPC),
    so the chips, the muted state and the mode switch have not been seen running.
  - **Local markets now drive source selection and result filtering, not just the Sources drawer
    narrowing** (`docs/superpowers/specs/2026-07-24-market-driven-sources-design.md`, status
    `implemented 2026-07-24`). `country_tokens()` in `commands/discover.rs` was brought to equal
    depth for all eight local markets (`de`, `gb`, `us`, `ru`, `es`, `fr`, `ua`, `pl`), which
    previously had city lists only for `de`, `ru` and `ua`. Added `US_STATE_NAMES` (all 51 full
    state names) and `US_STATE_CODES` - the code list is deliberately partial: a two-letter state
    code that is also an assigned ISO 3166-1 alpha-2 country code was left out, because the
    matcher is case-insensitive and cannot tell "Tunis, TN" from "Nashville, TN". Thirteen such
    codes were removed across three review rounds (`il`, `ma`, `co`, `md`, `pa`, `va`, `mo`, `nc`,
    `sc`, `ga`, `az`, `mn`, `tn`). `"ca"` is the one deliberate exception, kept for California,
    with Canada's bare `"ca"` token dropped in exchange - a real trade, not a free fix. `"georgia"`
    is knowingly ambiguous with the country and was kept on purpose: dropping it would silently
    lose US-state jobs, keeping it only risks an occasional visible, dismissible wrong result in
    the other direction, and visible-and-dismissible beats silent-and-lost. `"ukraine"` was added
    to `EUROPE_COUNTRIES`, which had omitted it, so region-mode Europe had been dropping Kyiv jobs
    outright.
    - **A strict market mode in the geo filter.** `build_market_cfg`, an `elsewhere` token set on
      `GeoCfg`, and `geo_passes` rewritten to check, in order: market tokens, then "names somewhere
      else", then remote markers, then drop. The order is the actual fix - previously the remote
      check ran first, so "Remote - US only" passed a Ukraine-market search on the strength of the
      word "Remote".
    - **The scan now passes a real per-source flag**: a source whose `geo_tags_json` names a
      selected market vouches for its own jobs and they all pass, because national boards
      routinely publish no location field at all. A `worldwide` tag does not earn that vouch.
    - **Two new Tauri commands**: `db_market_source_plan` (read-only) and
      `db_apply_market_source_plan` (one transaction, both statements asserting `is_builtin = 1`
      so a user-added source can never be silently toggled by a market switch).
    - **Settings gained an inline confirmation** in the Job search section that names the exact
      hosts before any source is switched on or off when a market is picked, reusing the existing
      `.confirm` pattern rather than a modal. Cancel touches nothing. Clearing the last market
      shows no confirmation at all - there is nothing to turn off.
    - **Not verified natively.** None of the above - the confirmation copy, the plan/apply
      round-trip, the strict-mode filter change, or the source auto-vouching - has been seen
      running in `tauri dev`. The plan's own verification section lists four scenarios (pick
      Ukraine and check the confirmation and Cancel/Apply; scan and confirm DOU/Djinni jobs with no
      location are kept while worldwide sources are filtered; clear to Worldwide and confirm no
      confirmation appears; repeat with Germany and Poland to confirm the flow is market-agnostic)
      and none of them have been run yet.
  - **Market coverage and rescan-on-change** (`docs/superpowers/plans/2026-07-24-market-coverage-and-rescan.md`).
    Two more gaps found in the same round of live testing as the entry above, once a market
    without a source was actually picked: switching to a market with no seeded source left the
    previous market's sources scanning (a disable-only plan is suppressed, so nothing happened),
    and the Discover feed kept showing the previous market's jobs regardless, because it is a
    persistent list that is never re-filtered when the market changes.
    - **`LOCAL_MARKETS` shrunk to the five markets that actually have a source**: `de`, `us`,
      `ru`, `ua`, `pl` (`libs/core/src/lib/geo/local-market.ts`). `gb`, `es`, `fr` are removed
      from the pickable type and array, and from Rust's `KNOWN_LOCAL_MARKETS`
      (`commands/discover.rs`) and its parity test's `cases`. Their location tokens are
      deliberately left in `country_tokens()` / `KNOWN_COUNTRY_CODES` - unchanged - so a UK, Spain
      or France job still counts as "elsewhere" when filtering the five remaining markets; only
      the pickable list shrank. Any of the three returns the moment a built-in source is added
      for it.
    - **`settings.last_scan_market: TEXT` added** (migration `0026_settings_last_scan_market.sql`,
      additive, NULL until the first scan). `discover_scan` writes the raw `market` value it ran
      under via a small helper, `record_scan_market`, factored out so a unit test can exercise the
      real write path against a migrated DB rather than a hand-copied UPDATE; the scan ignores the
      write's own result so a failed record never fails the scan. Surfaced to the frontend as
      `Settings.lastScanMarket: string | null` (`libs/core/src/lib/models/settings.model.ts`),
      picked up automatically since `db_get_settings` does `SELECT *`. Deliberately excluded from
      `SettingsPatch` and the update statement - it is not user-editable.
    - **Discover shows a banner when the current market no longer matches `lastScanMarket`**, with
      a Refresh button that clears the unsaved scan results and reruns the scan for the current
      market. Saved and dismissed jobs are untouched by both the mismatch check and the refresh -
      only the unsaved `discover_scan` feed rows are cleared. The refresh path is guarded by a
      `refreshingForMarket` signal (added in a same-task review round after a fast double-click
      was found able to fire two concurrent clear+scan calls) so it cannot overlap with itself or
      with a manual scan.
    - **Not verified natively.** All of the above - the shrunk market list actually showing five
      options in Settings, the banner appearing and disappearing at the right times, and a
      refresh actually swapping the feed's jobs while leaving saved/dismissed ones alone - has
      only been checked with `cargo test`, `nx test`/`lint`/`build`, and code review; none of it
      has been seen running in `tauri dev`. The plan's own verification section lists four
      scenarios: the market picker lists exactly the five sourced markets; picking Germany, then
      Applying, shows the banner and Refresh yields German jobs with the banner gone; switching to
      Russia and refreshing removes the German jobs and shows Russian ones; reloading Discover
      without changing the market shows no banner. None of the four have been run yet.
  - **No Fluff Jobs now fetches its real posting content instead of a three-word stub**
    (`docs/superpowers/plans/2026-07-24-nofluffjobs-detail-fetch.md`). No Fluff Jobs' list endpoint
    carries no description at all - `parse_nofluffjobs` had always stored just `category /
technology / seniority` as `jd_text`, which starved everything downstream that reads job
    description text: the Discover detail view, the salary line, skill detection and the raw
    keyword score, for every No Fluff Jobs posting since it shipped. Fixed the same way
    Arbeitsagentur already was: `parse_nofluffjobs` now also computes `detail_ref` (the raw slug,
    `None` when it is empty or already an absolute `http` URL), and a new
    `fetch_nofluffjobs_detail(client, slug)` hits `GET https://nofluffjobs.com/api/posting/{slug}`
    through the existing `get_json` + `percent_encode_segment` helpers. A new pure
    `parse_nofluffjobs_detail(&serde_json::Value) -> String` builds structured text from the
    response - `Requirements:` (musts), `Nice to have:` (nices), the HTML-stripped requirements
    description, `Responsibilities:` (dailyTasks), and a `Salary:` line via
    `nofluffjobs_salary_line`. The scan's detail-resolve block in `discover_scan` is now
    source-aware instead of Arbeitsagentur-only: it dispatches on `src.source_type` -
    `api_arbeitsagentur` keeps calling `fetch_arbeitsagentur_detail`, `api_nofluffjobs` now calls
    `fetch_nofluffjobs_detail`, anything else still resolves to an empty string - and both sources
    share the same per-scan detail budget (60 detail requests, spent only on jobs that survive the
    local title/geo filters). Separately, `CURRENCY_MARKER` in
    `libs/core/src/lib/profile/compensation.ts` gained `\bPLN\b`, so `extractSalaryFromJd` no
    longer silently drops a złoty-quoted salary line - it previously recognised only euro, pound,
    dollar, EUR, USD and GBP. **Not natively verified beyond a live smoke check**: an ignored
    `live_nofluffjobs_detail_smoke` test hit the real detail endpoint once (1444 chars returned,
    well past the 100-char sanity threshold) and was then deleted, per the plan, before committing - a real Discover scan against a live Poland-market posting, confirming the Requirements /
    Nice to have / Responsibilities / Salary sections and the PLN badge render, still needs a
    `tauri dev` pass.
  - **Fixed: a button alone in a Settings card stretched to full width.** `.section` is a
    stretch-aligned flex column, so any `.btn` dropped directly into one filled the card;
    "Send a test prompt" only looked right because it carried a one-off `.test-btn { align-self }`
    override. Replaced with `.section > .btn { align-self: flex-start }` and the one-off deleted,
    so the next button added cannot inherit the bug. Onboarding's own `<select>` was checked and
    is fine (fixed height inside a centered flex row); the report was about this Settings button.
  - Not done this session (deferred, see Task 3 in the original prompt): a second general bug pass
    beyond the token sweep above. Next session can pick this up directly.
- **Merged: `fix/cli-bridge-probe-and-models` → PR #153.** Two defects found in the first live
  CLI-bridge run, then five more found while checking the surface end to end. (1) `cli_probe` only
  checked that a file with the right name existed on the search path, so a partially installed
  CLI showed a green tick in Settings and then failed on the first scoring call - these CLIs are
  npm wrappers that spawn a platform binary, and an interrupted install leaves the wrapper
  present with the binary gone (`spawn .../codex-darwin-arm64/vendor/.../codex ENOENT`). The
  probe now runs `<binary> --version` with a 15s timeout and returns `working` / `version` /
  `error` beside `installed`; Settings renders three states (runnable with version, found-but-
  broken with the `npm install -g` repair command and the underlying error, absent) and Test
  connection gates on `working` rather than `installed`. (2) CLI mode had free-text model fields,
  which assumed the user knows their CLI's model names and let a stale API-mode value leak into a
  CLI call (`--model 5.5` reached codex). Each CLI now has a dropdown: **CLI default
  (recommended)** - the empty value, which omits `--model` entirely so the signed-in CLI picks
  what the subscription covers - plus known names, plus **Other (type a name)**. Aliases are
  preferred to full IDs since vendors rotate IDs; lists verified 2026-07-23 against the Claude
  Code CLI reference and `developers.openai.com/codex/models`. Gemini CLI publishes no list
  readable without signing in, so it offers only the default and the custom field rather than
  guessed IDs. A stored name outside the list opens the custom field automatically. Verified:
  `cargo test --lib` (235), `cargo clippy -- -D warnings`, `nx run-many -t test --all` (6
  projects), `nx lint desktop` (0 errors), `nx build desktop`; probed live here - `claude`
  2.1.218 and `gemini` 0.49.0 report working, `codex` exits 1 and is now correctly reported
  broken. **Native-only gate pending**: the three-state CLI list, the model dropdowns and the
  ATS card all need a `tauri dev` pass.

  Extended after a live run surfaced more: **onboarding now offers CLI bridge mode**, which it
  never did - the AI step only ever offered an API key and carried a "coming soon" note
  promising the very thing that had already shipped. It now opens with a mode choice, lists the
  three CLIs with their real state, and offers an **Install** button per CLI. The installer is a
  new `cli_install` command: the npm package is chosen in Rust from a fixed list keyed on the
  provider id and is never taken from the caller, so no input can make Applye install anything
  else (a test asserts refusal for `deepseek`, `left-pad`, `../evil` and `claude; rm -rf /`).
  npm missing is reported distinctly with a nodejs.org link, EACCES gets a named explanation,
  and the UI states that installing does not sign the user in.

  Three further bugs found while checking the surface end to end: (1) **onboarding never
  persisted the provider or mode** - it saved the key but only ever wrote `onboardingSeen`, so
  choosing OpenAI or DeepSeek left `provider = 'claude'` and every task failed on a missing key;
  (2) **switching CLI -> API left both model fields blank**, since CLI mode blanks them by
  design, so API mode sent `model: ""` and was rejected - the restore logic is now the pure,
  tested `cli-models.util.ts`; (3) **the health check reported ok in CLI mode without checking
  any CLI**, and the first draft of that fix used status `"error"`, which `worst()` does not
  recognise and would have rolled up to an overall ok - caught before commit and pinned by a
  test asserting `worst()` agrees.

  Also corrected: the Codex model list. `gpt-5.6` and `gpt-5.3-codex` are in OpenAI's published
  list but are **refused on a ChatGPT account** ("not supported when using Codex with a ChatGPT
  account"), which is exactly the user CLI bridge exists for. The list now holds only names
  confirmed live on a subscription (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`), and the hint says
  model availability depends on the plan, which only the CLI knows.

  **Codex is now verified end to end.** Its npm install on this machine was missing its vendored
  binary; running the installer fixed it, and `codex exec -` returned the expected reply through
  the adapter's exact invocation.

  A later live run found **Gemini broken on every task**: `FatalUntrustedWorkspaceError`, "not
  running in a trusted directory". Applye runs each CLI in an empty scratch dir rather than the
  user's files, which is precisely the case Gemini's folder-trust check blocks, and headless it
  cannot show the trust dialog. Fixed by setting `GEMINI_CLI_TRUST_WORKSPACE=true` on the child
  process - chosen over the documented `--skip-trust` flag because an older CLI ignores an
  unknown env var but dies on an unknown flag. The adapter trait grew an `env()` hook (default
  empty) that both `run` and the version probe apply. Verified live: without the var, stderr
  carries both the trust error and the account error; with it, only the account error remains.
  The remaining `IneligibleTierError` then proved fatal to the provider itself. Google's own
  announcement (gemini-cli discussion #28017, 2026-06-18) states Gemini CLI **stopped serving
  Google AI Pro, AI Ultra and free individual accounts**, with only enterprise Code Assist
  licences and API-key auth unaffected - precisely the inverse of CLI bridge's audience, a
  consumer subscription with no API key. **Gemini has therefore been removed from CLI bridge**:
  adapter deleted, dropped from the probe and install lists, and `adapter_for("gemini")` now
  returns the actual reason rather than a generic "unsupported provider", so a stale setting
  explains itself. Migration `0022` moves any `cli` + `gemini` row to `claude`, since the value
  no longer appears in the picker and would otherwise render blank with every task failing.
  Gemini stays a valid **API-mode** provider (still "coming soon" there). The successor,
  Antigravity CLI (`agy`), installs via `curl | bash` rather than npm and is a different binary,
  so it is a new adapter if ever wanted - a post-launch question, not a rename. The folder-trust
  fix above is kept: it was a genuine bug, and it is what let the account error be seen clearly.

  **Onboarding gained per-CLI setup instructions**, scoped to the selected provider so the three
  status rows stay scannable: two ordered steps (install command, sign-in command) for a CLI
  that is not working, and for one that is, a line saying that running is not the same as being
  signed in, with the command to re-auth. Built with the impeccable skill's product register.
  Three design defects were found and fixed in the process, two of them already merged: the ATS
  findings list used a coloured `border-left` accent (a banned side-stripe) whose colour token
  `--border` **does not exist**, so low-severity rows rendered a stripe in the text colour - now
  a leading severity dot matching the verdict badge's existing dot; and the new onboarding mode
  cards referenced `--surface-raised`, also not a real token, so they had no background.

- **Prior branch / focus**: `feat/deterministic-ats-check`, **merged as PR #152**. The ATS check
  was a single boolean the `job-scoring` model emitted - it read as a measurement but was an
  opinion, not reproducible across runs, and never looked at the CV that would be uploaded. New
  `commands/ats.rs` computes it: a pure function, no DB, no network, 0 tokens. Score is 0-100
  from **keyword coverage** (60 points; the posting's requirement terms, weighted double inside a
  requirements block, matched set-wise over unigrams and bigrams so `java` cannot match inside
  `javascript`, with `c++` / `.net` / `node.js` / `ci/cd` surviving tokenisation, EN + DE
  requirement headings) and **parsability** (40 points; unfindable email/phone, tables, absent or
  unrecognisable section headings, no four-digit year, a suspiciously short export, decorative
  bullets, link-only information, and a photo flagged only where a photo is a liability - a
  Bewerbungsfoto is normal in DE/AT/CH). The model's ATS remark is kept below the computed result
  as advice, and a failed local check falls back to the old boolean so nothing regresses. Three
  bugs the tests caught while building it: every markdown heading level counted as a section, so
  job titles under `###` read as unrecognised section names; all bullets were weighted up, which
  pulled "free coffee" out of the benefits block into the scored terms; and requirement-adjective
  filler scored as if it were a skill. 19 new Rust tests.
- **Prior branch / focus**: `feat/cli-bridge-mode`, **merged as PR #150**. `ai/cli.rs` had been a
  21-line stub since the AI layer shipped and Settings offered the mode disabled. Three adapters
  with flags verified against current vendor docs: `claude -p --output-format json
--system-prompt` (result + usage parsed), `codex exec -` in its read-only sandbox, `gemini
--output-format json`. No shell anywhere (fixed argv via `tokio::process`), the prompt over
  stdin rather than argv so it cannot leak into `ps`, a scratch working directory, `kill_on_drop`
  plus a 10 minute timeout, stderr truncated into errors. Binary resolution searches `PATH` then
  the standard install locations, because a Tauri app launched from Finder inherits a minimal
  `PATH`. The Claude Code path was exercised end to end against the real CLI; Codex and Gemini
  were verified only as far as argument acceptance (this machine's codex install is broken and
  its gemini account tier-ineligible).
- **Also merged**: PR #151, `docs/product/local-markets-analysis.md` - analysis for a
  country-level market layer in Discover. Key findings: `sources.geo_tags_json` is already
  country-level so no schema change is needed, anything publishing RSS costs no parser code, and
  every candidate endpoint was probed live (verified: DOU.ua RSS for Ukraine, No Fluff Jobs for
  Poland, Arbeitnow for Germany; credential-blocked: USAJOBS, job-room.ch, hh.ru). The USA has no
  free public national index, so a US preset must lead with ATS company boards. Nothing
  implemented - this is deferred past launch.
- **Earlier branch / focus**: `feat/interview-prep-ai-generation`, **merged as PR #148** and
  released as v0.26.0. Completed the AI layer of Interview Prep (ROADMAP §6): `interview-hr.md`,
  `interview-technical.md` and `star-r.md` written and registered in `ai/skills.rs`, new
  `list_interview_prep` / `save_interview_prep_batch` commands over the long-unused
  `interview_prep` table, and a **Prep** panel per stage routed by `stageType`. Also fixed the
  shared `cleanJsonText` helper, which only ever extracted `{...}` and so broke array-shaped
  skill responses. **Native-only gate still pending**: a `tauri dev` pass to generate a real
  batch and confirm the cache-hit skip.
- **Prior branch / focus**: `feat/anschreiben-de-fields`, cut from `main`, **merged as PR #147**.
  Second **Germany pack**
  item from `docs/product/IDEAS.md` (the first, `feat/discover-de-sources`, is a separate open
  branch). German postings nearly always require a _frühestmöglicher Eintrittstermin_ and a
  _Gehaltsvorstellung_, and a letter answering neither gets filtered before it is read.
  `CoverLetterContent` gains three optional free-text fields - `earliestStart`,
  `salaryExpectation`, `noticePeriod` - free text because "ab sofort" and "01.10.2026" are
  equally valid answers. The letter editor grows an **Availability and salary** card (with a
  German-market explainer shown only when the region is `de`) that writes through the existing
  `updateField`, so no new setters. `cover-letter-generate` takes the three as inputs and is
  told to state them in the final body paragraph in the user's exact words - never a bullet
  list, never the subject, no currency conversion - and to stay entirely silent on an empty
  one rather than inventing "salary negotiable". **Amended 2026-08-08:** "exact words" has one
  scoped exception, for `salary_expectation` alone. An input of `85k - 110k` came back as
  "85 - 110 EUR per year", which reads as 85 euros; the skill now expands an abbreviated
  magnitude to the full figure while leaving the currency, the range and the gross/net
  qualifier untouched. The boundary is stated in the same sentence and asserted by a Rust
  render test, because the risk of the exception is the model extending it to the date. Because a changed answer changes the output,
  the three are folded into the per-block regeneration cache hash next to tone and length, and
  they carry from a base letter into every tailored copy. Both wizard call sites in
  `jobs.component.ts` pass them explicitly: the template engine leaves unknown placeholders
  literal, so a missing key would print `{{salary_expectation}}` into the prompt. Verified:
  `nx test desktop` (624), `nx test i18n`, `nx lint desktop`, `nx build desktop`, and
  `cargo test --lib` including a new render test asserting the values reach the prompt and
  leave no placeholder behind. **Native-only gate pending**: the editor card itself needs a
  `tauri dev` pass - reaching a cover letter requires the Tauri database.
  Second commit on the branch, the DIN 5008 pass: `formatLetterDate` renders a bare ISO date as
  `TT.MM.JJJJ` for German only, and `stripSubjectLabel` removes the `Betreff:` label the standard
  abolished (while leaving "Betreffend Ihre Anzeige" alone). Both are display-only pure functions
  in `libs/core` with 10 unit tests - what the user typed is never rewritten in storage. A new
  `attachments` field renders the `Anlagen` line as a final atom, borrowing the `body` style
  rather than widening `CoverLetterStyle` and the Rust `check_style_safety` contract. The preview
  gained a `language` input, fed by both the editor and the silent-print route, so the exported
  PDF cannot drift from the editor's render. **Working-tree warning**: another session was editing
  this same checkout (interview-prep, `interview.rs`, `db.service.ts`, `cv-content.util.ts`) while
  this landed; the 5 failing `nx test desktop` specs are that in-flight work, they fail on a
  stashed clean tree too, and no file of theirs is in any commit on this branch.
- **Prior branch / focus**: `feat/discover-de-sources`, **merged as PR #146**. First slice of the
  **Germany pack** in `docs/product/IDEAS.md`: the built-in Discover set (Remotive, We Work
  Remotely, Himalayas) is remote-first and English, so a user whose geo scope is Germany scanned
  three feeds carrying almost no German posting. (1) Migration `0021` seeds a fourth built-in
  source, **Bundesagentur fuer Arbeit** - the official public REST API of the German federal
  employment agency - shipped disabled like every other built-in, so collection stays an explicit
  choice. The `api_arbeitsagentur` type reads the list endpoint in pages (3 x 100, stopping early
  on a short page) with the anonymous client key published in the agency's own API docs. That
  endpoint carries no description, so `RawJob` gained `detail_ref`: the scan resolves the real
  `stellenbeschreibung` **after** the local title and geo filters have run and only up to 60 per
  scan, so a detail request is spent per job the user could see rather than per feed item, and a
  failed one degrades to the structured-field placeholder body instead of failing the scan.
  Domestic ads omit the country, so the parser appends `Deutschland`. (2) An `ats_personio`
  company-board type - Personio being the ATS most German small and mid-size employers run their
  careers page on. Its feed is keyed on a subdomain rather than a path segment, so the stored slug
  is authoritative and the host is the fallback; the title is read from the block _before_
  `<jobDescriptions>` (Personio reuses `<name>` for both the position and every section heading)
  and all sections are concatenated with their headings, since that split is where a German
  posting states its requirements. (3) German boards give a bare city, so a Germany scope dropped
  its own market - the largest German cities are now `de` country tokens in both spellings,
  deliberately letting a same-named foreign city (Frankfort, KY) through, because a job the user
  can see and dismiss beats one silently dropped. Verified: `cargo test --lib` (198),
  `cargo clippy --all-targets -D warnings`, `nx test desktop`, `nx lint desktop` green.
  **Native-only gate pending**: migration `0021` applying and a real scan against the live API
  still need a `tauri dev` pass - the API paths are coded from documentation, not observed.
- **Earlier branch / focus**: `feat/wizard-cancel-and-collapsible-panels`, cut from `main` alongside PRs #142 and #143. Three independent UI affordances, no schema change. (1) The apply wizard gains a Cancel in its footer: it confirms, naming what is lost, then deletes the DRAFT CV and cover letter, drops the tailoring state and saved wizard progress, and returns to the job summary. Committed documents (exported, or filed when the job was marked applied) are deliberately untouched - they belong to the library, and cancelling a later re-tailor must not take them with it. This also fixed a latent bug: `document_library_delete` now clears any application reference to the row it deletes, because `db_upsert_application` COALESCEs both document ids and so can set a link but never clear one, which would have left a dangling pointer (new Rust test). (2) The sidebar collapses to a 64px icon rail via a control by the logo; labels and section headings drop, icons and the active state stay, only the width animates, and the preference lives in localStorage as a per-machine viewing choice rather than in the settings table. (3) The CV live-style panel collapses sideways to its toggle tab, handing its fixed 340px to the paper; only flex-basis animates and reduced-motion users get the same result without the transition. Verified: `nx test desktop` (624), `nx lint desktop`, `cargo test --lib` (188, including the new unlink test), `cargo clippy -- -D warnings`, `nx build desktop` all green; the sidebar rail was checked live in the browser preview (64px, icons only, active state intact, preference surviving a reload). **Native-only gate pending**: the wizard Cancel path needs a `tauri dev` pass - deleting draft documents goes through Tauri commands the browser preview cannot reach.
- **Prior branch / focus**: `feat/profile-photo-and-de-photo-prompt`, **merged as PR #143**. Makes the applicant photo a profile-level asset instead of a per-document one. (1) Migration `0020` adds `profile.photo_data_uri`, holding the headshot already cropped to the CV frame as a JPEG data URI. It is written through its own `db_set_profile_photo` command, not `db_upsert_profile` - that upsert overwrites every column it names, so an ordinary profile save would wipe the photo, while a COALESCE guard would make deliberate removal impossible; passing null is an explicit remove. The image never leaves the local SQLite file and is not sent with any AI call. (2) The profile page gained a **Photo** section reusing the CV editor's crop modal (so the crop lands in the exact frame a CV prints), saving on crop-confirm rather than on the page's Save button, since the photo is not part of the profile form. **Target roles** now collapses like Experience/Skills/Languages/Education instead of staying permanently expanded. (3) The tailor wizard raises the German photo convention when the CV's market is set to Germany - once per visit to a job, never for the other markets - and yes writes the profile photo into the linked CV via a new pure `withCvPhoto` helper (fills an existing photo section or creates one pinned ahead of the identity block, preserving any chosen placement; 4 unit tests). With no profile photo yet, it routes to the profile's Photo section instead. Verified: `nx test desktop` (623 tests), `nx lint desktop`, `cargo clippy -- -D warnings` and `nx build desktop` all green. **Native-only gate pending**: migration `0020` applying, the picker/crop/save round-trip, and the photo actually landing in an exported CV all need a `tauri dev` pass - the browser preview cannot reach the Tauri file and DB commands.
- **Earlier branch / focus**: `fix/tracker-report-i18n-and-score-ux`, **merged as PR #142**. Four desktop UX fixes found in a walkthrough, no schema change. (1) The German Eigenbemuehungen report was only half German: its fixed headings followed the chosen report format but the column headers and the period followed the app's UI language. `TranslateService` gained `tFor(locale)` - a translation function for an explicit locale - and everything printed ON the sheet (labels, period, statuses, CSV and text exports) now follows the report format, while the surrounding export dialog stays in the UI language. (2) The Job Tracker columns drawer showed a `LOCKED` tag and a pin icon on rows that are visibility toggles, where "locked" reads as "cannot be shown" instead of "read-only, from the job posting" (that meaning stays on the grid cell tooltip); both removed, and the now-unused `tracker.locked` string dropped from en/de. (3) A job's score vanished after any profile edit, because scores are cached per profile hash and the score section was gated on an exact-hash lookup - so the job read as never scored. A new read-only `score_cache_latest` command returns the newest score for the job regardless of profile version; job detail falls back to it and shows it behind an explicit "your profile changed after this score" notice with the rescore action beside it. (4) The tailor wizard's region and language pickers showed raw codes (`DE`, `GENERIC`, `EN`) and now show `cv_region_*` country names and the `LANGUAGE_NATIVE_NAMES` endonyms Settings already uses. Verified: `nx run-many -t test --all` (all 6 projects, incl. 4 new `TranslateService` tests), `nx lint desktop`, `cargo clippy -- -D warnings`, `nx build desktop` all green. **Native-only gate pending**: the report language, the stale-score notice and the two pickers all need a `tauri dev` pass - the browser preview cannot reach the Tauri commands they read.
- **Earlier branch / focus**: `feat/web-prelaunch`, rebased onto `main` after PR #140 (`f9aeec7`), which landed the lint and clippy gate repair this branch was originally cut on top of. Pre-launch pass on the marketing site and docs in `apps/web`, no desktop-app behaviour change. (1) Every GitHub reference now routes through a `SourceLink` component driven by `SOURCE_PUBLIC` in `site.ts`, which is `false` while the repo is private - links render as honest "coming soon" pills, and launch day is a one-line flip. (2) Consent-gated Google Analytics 4: nothing loads and no cookie is written before an explicit opt-in, IPs anonymised, Google Signals and ad personalisation off, and a placeholder measurement ID is treated as unconfigured so no build contacts a junk property; the new `/cookies` page documents and controls the decision. (3) Per-route SEO: every route declares a meta description, `SeoService` rewrites description/canonical/OG/Twitter on navigation, plus `robots.txt`, a generated 39-URL `sitemap.xml`, static `SoftwareApplication` JSON-LD, and a 1200x630 OG card generated from SVG with macOS built-ins. (4) Docs brought level with the shipped app: new Dashboard and Documents-library guides, rewritten Profile and Discover guides (structured editor, AI parse, archetype tiers, compensation/salary badges), new "Your data & backup" and "Troubleshooting & FAQ" reference pages, and `docs/product/MEDIA_SHOTLIST.md` listing all 27 screenshot/video slots. (5) One icon system replaces the repeated shield glyph and hand-inlined SVGs. (6) All 39 routes are prerendered to static HTML via `@angular/ssr` (build-time only, no running server), so each page ships its own tags; the Cloudflare SPA-fallback rewrite was removed and a static `404.html` added. (7) The landing page is localised into the README's six languages - English at `/` plus `/de`, `/es`, `/pl`, `/ru`, `/uk` - with a translated shell, a footer language switcher, and `hreflang` alternates emitted only between the landing pages; the docs stay English and the translated pages state that plainly. (8) The reader's chosen language now survives navigation: `pageLocale` (from the route) still drives `lang`, canonical and hreflang, while a remembered `uiLocale` drives the shell and the logo's target, so opening the English-only docs no longer silently resets someone to English. (9) Positioning moved from "built for the German market" to global - the landing section is "Local rules, handled", `/docs/german` became `/docs/local-markets` (an "everywhere" section plus "Germany, in depth"), and the comparison table, press kit and hero mock lost their German-specific wording; the DACH features stay, reframed as the deepest example. (10) Two stale claims fixed: the site said "not a job-board scraper" (written before Discover, which does fetch from public APIs and feeds) and still documented a DOCX export that was removed from the app - export is the WYSIWYG PDF only, import of DOCX still works. (11) Switching docs pages lands at the top: `scrollPositionRestoration: 'enabled'` plus removal of the global `scroll-behavior: smooth`, which was animating that jump; smooth scrolling now belongs to the TOC anchors alone, with a reduced-motion path and an instant fallback. Verified: `nx build web`, `nx test web` (41 tests: consent gate, route/sitemap drift guard, locale-bundle key parity, remembered-locale behaviour) and `nx lint web` all green; prerendered HTML spot-checked for per-page title/description/canonical, `lang`, `og:locale` and alternates; German landing and the switcher checked live in the browser preview. **Still open**: `GA_MEASUREMENT_ID` is still `G-PLACEHOLDER`; the 27 screenshot/video slots in `docs/product/MEDIA_SHOTLIST.md` are unfilled; the Cloudflare Pages deploy needs one pass to confirm the removed SPA rewrite behaves as expected on the real host.
- **Earlier branch / focus**: `chore/release-prep-hygiene`, cut from `main` after PR #139 (`c8df3fb`), **merged as PR #140** (`f9aeec7`). Pre-release gate repair, no product behaviour change: `nx run-many -t lint --all` was failing (51 errors) and `cargo clippy -- -D warnings` was failing (10 errors, long-standing - see the July 1 and July 14 notes calling them pre-existing), so neither could gate a release. Both are green now; 851 JS/TS tests, 187 Rust tests, and `nx build desktop` all pass. Rust: dead `files.rs` placeholder deleted (plus its `mod files;`), `splitn(2, ':')` -> `split_once`, a `>`-leading doc line reflowed, `#[allow]` with a written reason on the two lints that are wrong for their context (`PhotoPlacement` wire-format variant names, macOS print FFI arity). Angular: interview-stage dialog labels bound via `for`/`id`, Job Tracker column-manager toggles turned from click-only `<span>`s into `<button role="switch">` (they were keyboard-unreachable), remaining click-away/bubble-stopper/backdrop handlers annotated as deliberately keyboard-inert, and `eqeqeq` configured with `allowNullOrUndefined`. Repo hygiene: `.planning/PROJECT.md` and `.planning/config.json` were still tracked despite the ignore rule and are now untracked; `.agents/`, `.aif/`, and `docs/superpowers/NEXT-SESSION-*.md` added to `.gitignore`. **Still open**: `ci.yml` sits in `.github/workflows-disabled/`, so nothing gates pushes or PRs - only the tag-triggered `release.yml` is active. **Native-only gate pending**: the Job Tracker column-manager switches need a `tauri dev` pass to confirm the `<span>`->`<button>` swap did not shift their look.
- **Earlier branch / focus**: `feat/discover-archetype-fit`, cut from `main` after PR #132 (`2ecd48f`). Links profile target-roles (archetypes) to Discover: `matchArchetype` compares a job's title against each profile archetype's name/keywords and returns a tier - Primary, Secondary, or Adjacent - shown as a badge on every feed row and on the job-detail hero; the For-you section is ordered by tier, and tier feeds directly into the deterministic 0-token score, with `sellWhen` acting as a light tie-break signal only. Feed rows match on title alone (JD not loaded yet), so `matchArchetype` never needs the full posting; `computeRawScore` still returns `null` when the profile has no archetypes, so the honesty invariant holds - no match, no badge. Also fixes a pre-existing bug where profile archetypes were serialized as objects but read as `[object Object]`, collapsing all target-role matching to a single junk keyword; matching now parses the real archetype list. Verified via core jest (188 green, 16 in the focused archetype spec), desktop jest (619 green), i18n jest (1 green). **Native-only gate pending**: a `tauri dev` pass is still needed to eyeball the three badge colours, the For-you tier ordering, and the detail-hero badge on real jobs. Since this branch was cut, `main` has also picked up two more merges: PR #135 (structured profile editor - Experience/Skills/Languages in Form mode, plus AI "Parse text" raw-markdown import) and PR #136 (compensation target fields with a salary-fit badge).
- **Earlier branch / focus**: `fix/oss-release-hardening`, cut from `main` after PR #130. Pre-public-release audit (ROADMAP.md §15 Repo Hygiene): repo confirmed still **private** on GitHub (`vitala89/applye`) - no public exposure yet, publish stays gated on "after the job change" per ROADMAP.md §14. Fixed two real findings: (1) `apps/desktop/src-tauri/Cargo.toml` `repository` field pointed at the stale `vkasap/applye` owner instead of the actual `vitala89/applye` remote; (2) `apps/desktop/src-tauri/tauri.conf.json` had `security.csp: null` - replaced with an explicit policy (`default-src 'self'`; `style-src` allows `'unsafe-inline'` for Angular's injected component `<style>` tags; `img-src` allows `data:`/`blob:` for the CV photo data-URI and inline SVG icons; `connect-src`/`img-src` include Tauri's `ipc:`/`asset:` origins) derived from an audit of the codebase (self-hosted fonts only, no external CDNs, no inline `<script>`, external links go through the opener plugin not `window.open`). Repo structure (`apps/{desktop,mobile,web}`, `libs/{core,data,i18n,skills,ui}`, `design-system/`) verified to match README claims, no drift. No secret-named files tracked in git; `.gitignore` already covers `*.sqlite`/`*.env`/signing keys/`profile.md`. `cargo check` passes; JSON validated. **Not yet verified**: the CSP change needs a manual check in the actual `tauri dev` native window (devtools console, no CSP violations) - this session's browser-preview tooling can only drive web pages, not the native Tauri webview, so that check is still outstanding before merge. Second pass on the same branch: full repo file audit at the user's request. `AGENT_PROMPT_CAREER_OPS_ADOPTION.md` and `docs/product/CAREER_OPS_ADOPTION.md` (an internal feature-by-feature "adopt from career-ops" checklist) were untracked from git and gitignored - kept locally, no longer pushed. The public credit/comparison to career-ops in README.md and the apps/web compare/methodology pages is intentional (PR #130) and was left as is. Scope was explicitly limited to these two files this pass; broader internal docs (`ROADMAP.md`, `.planning/`, `docs/superpowers/plans|specs/*`, `INSTRUCTIONS.md`, `PROJECT_CONTEXT.md`, `PRODUCT.md`) are still tracked and still reference career-ops in places - not touched, pending a separate decision. Also found: `.planning/` is already gitignored but two files under it (`PROJECT.md`, `config.json`) were committed before that rule existed, so they're still tracked despite the ignore rule - not acted on. Note for whenever the repo actually goes public: untracking today only stops future commits; these files remain in git history from earlier commits until that history is rewritten or the public repo is published fresh without it - that is a separate, more invasive step not done in this session.
- **Prior (MERGED, PR #129 & PR #130 on `main`)**: PR #129 (Discover: location recognition rewrite, lazy feed rendering + Clear list, sticky filter bar, clear-confirm modal + toast, multi-region geo scope with auto-save, My Jobs/Documents back-navigation) and PR #130 (open-source presentation + website pages) both merged.
- **Prior (MERGED, PR #129, `feat/discover-location-recognition-role-feed`)**: cut from `main` after PR #128 (`0451e59`). Five commits finishing the Discover screen: (1) `f176901` - location recognition rewritten as a pure, unit-tested `discover-location.ts` module (`classifyLoc`, 42 tests); whole-word country/city matching, short codes (`CA`/`DE`/`IN`/`NL`...) match only as a standalone segment or uppercase token so they stop cross-classifying (`SF, CA` no longer resolves to Canada); adds South America, all US states + DC, Canadian provinces, Oceania/MENA/Africa; `discover.rs` RSS location extraction falls back to a place-like `<category>`, a `Location:`/`Standort:` body label, or `Remote` when a feed omits the tag; feed now buckets into "For you" (matches profile Target Archetypes) over "More openings". (2) `a5a9f30` - `db_discover_feed` capped at `LIMIT 300`, feed renders incrementally (30 rows/page via an `IntersectionObserver` scroll sentinel) instead of mounting everything; new `db_discover_clear` command + Clear-list button; Sources drawer redesigned with a summary bar (active/failing counts, scope chip) and collapsible Built-in/Company-boards/Your-sources groups. (3) `f2fdd65` - the filter row is now `position: sticky` (was footer-only), Clear list moved up next to Sources, the redundant footer "Adjust filters" link removed. (4) `0e74717` - Clear list is a centered confirm modal (was a broken inline confirm that wrapped onto two lines inside the sticky bar) with a success/error toast reporting how many jobs were removed; the Clear button disables when there is nothing unsaved to clear (`hasClearableJobs`). (5) `3129f30` - the Settings "Job search" geo scope was a single-select (`worldwide/europe/usa/asia`) that only patched a local field until the page's shared Save button was clicked separately, so picking Europe could still scan Worldwide; it is now a checkbox grid (Worldwide + europe/namerica/samerica/asia/oceania/mena/africa) that auto-saves each toggle immediately via `db.updateSettings` (mirrors Discover's own Sources toggles), backed by a new shared `libs/core/src/lib/geo/geo-scope.ts` (`GeoScopeKey`, `parseGeoScopes`/`encodeGeoScopes`, JSON-array storage with legacy-scalar back-compat, 11 tests); `discover.rs` `build_geo_cfg` now unions every selected region's tokens and gained NAMERICA/SAMERICA/OCEANIA/MENA/AFRICA country-name consts (`namerica` now correctly covers Canada + Mexico, not just the US). **Verified:** libs/core + desktop full suites green (606/606 desktop), discover Rust 24/24, i18n parity, eslint + clippy clean, AOT build green. **Live Tauri gate pending:** a real scan confirming locations render, the For-you/More split, infinite scroll, Clear list modal + toast, the redesigned Sources drawer, and multi-region scope filtering, all against live data. `CHANGELOG.md`/this doc were updated for the branch on the way out per the Plan Check rule; not yet reflected in `main` until #129 merges.
- **Prior (MERGED, PR #130, `4a7ddf2`)**: Working tree: **open-source presentation + website pages** - (i) README rebuilt career-ops-style (hero/wordmark + media placeholders under `docs/assets/`, 5-language switcher with full `README.{es,de,ru,pl}.md` translations, badges, features table with the 0-token contract, quick start, core loop, how-it-works, screenshots grid, project structure, tech stack table, author/career-ops credit, disclaimer); (ii) new community files `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Covenant 2.1, contact vitala2089@gmail.com), `SECURITY.md` (private advisories), `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml` + `PULL_REQUEST_TEMPLATE.md`; (iii) `apps/web` gained five routed lazy pages - `/manifesto` (6 principles + signature block), `/compare` (honest table vs SaaS/career-ops/spreadsheet), `/press` (boilerplate + fact sheet + asset placeholders), `/privacy` (app + site, plain language), `/sustain` (free-forever model; `SPONSORS`/`DISCORD`/`LINKEDIN`/`X_TWITTER` consts in `site.ts`, placeholders marked) - plus a career-ops-style footer (9 links + GitHub/LinkedIn icons; Discord/X render once URLs exist) and small `manifesto__*`/`footer__social` styles; web build + lint green, pages browser-verified in both themes; `.claude/launch.json` gained a `web` config (port 4300). Media (screenshots/GIF/video) are explicit placeholders inventoried in `docs/assets/README.md`. Second pass: (iv) a **User guide** docs section - `apps/web/src/app/docs/guide-pages.ts`, nine lazy pages under `/docs/guide/*` (tour, profile, add-job, score, tailor, discover, track, insights, settings) in a new "User guide" nav group, each with `docs__media` placeholder boxes (dashed, tagged SCREENSHOT/GIF/VIDEO, exact capture instructions; assets destined for `apps/web/public/guide/`); new `docs__h3`/`docs__media*` styles; (v) honesty fixes - all "DOCX/PDF" claims are now "PDF" (READMEs x5, landing mock row, landing.ts three-pass copy), the "portal answers" feature row removed (commands exist but no UI), Interview Prep rows corrected to the 0-token stage timeline (AI questions were deferred), provider lists corrected to Claude/OpenAI/Gemini/DeepSeek + CLI bridge (Claude Code/Codex/Gemini CLI), `LINKEDIN` in `site.ts` blanked to a placeholder. This branch: `docs/oss-presentation-site`. Previously merged (PR #128): **Discover detail screen + filters + scan-leak fix** - (a) `db_list_jobs` / `db_list_jobs_overview` now exclude `imported_from = 'discover_scan'` jobs that have no application row, so scanned openings stay out of My Jobs until explicitly saved; (b) Discover feed cards restyled per the updated `Discover.dc.html` handoff (company on its own line with a building icon, icon-labelled source/location/age chips, "MATCHED" keyword label, bordered NEW pill); (c) row click opens a **full-screen job detail** (second revision of `Discover.dc.html`): hero with monogram/source/age/NEW + MATCH% chip, deterministic block-parsed full JD (headings/paragraphs/bullet lists from the strip*html line output, lazy via `db_get_job`, 0 tokens), Apply-now + view-original actions, and a sticky sidebar - raw keyword-fit score ring (profile keywords vs posting, bands strong>=80 / good>=55 / partial, "Score with AI" saves + navigates to `/jobs/:id`, strong shows NO RE-SCORE NEEDED), apply card, About-the-job facts, SKILLS FOUND IN POSTING (static dictionary match), Local & private note; (d) filter row: three checkbox popovers (empty = all) - **Sources** (distinct source names present in the feed), **work type** (remote/hybrid/onsite, deterministic from location text), and **Locations** (a `COUNTRY_DEFS` dictionary with per-country `cities` classifies each job's location text into region+country+city via `classifyLoc`; `availableRegions` derives a 3-level region->country->city tree from the live feed so only levels actually scanned appear; tri-state checkboxes cascade - region toggles all its countries+cities, country toggles itself+its cities, a lone city narrows to that city; filter passes a row when its country key OR its `"Country City"` city key is selected. Remote-anywhere/unknown rows classify into an **Other** bucket (a normal selectable option, no longer an always-pass), fixing the bug where picking one country also matched anywhere-jobs. Dictionary filled out to all EU countries incl. Croatia + a **North America** region (USA, Canada - so "Ontario" resolves)); (g) **company/salary detection fixed** in the paste pipeline - `extract_company` (scoring.rs) now falls back from `Company:` headers to body heuristics (`About X` / `Join X` headings, `<Company> is a/an/the ...` opener, via `leading_proper_noun` + `is_plausible_company`, rejecting fragments like "We are a ..."); `parseAndFilter` passes the already-known company/title as overrides so re-parsing a Discover job keeps them; the `job_paste` upsert `ON CONFLICT` now `COALESCE`-backfills a missing company/title without clobbering; and `legitimacy.rs` gained `mentions_salary_amount` (detects `80k`, `90,000 EUR`, `120000 USD` without currency symbols) plus a wider `SALARY_KEYWORDS` list, so the "Salary is not mentioned" note stops firing on symbol-free pay. New Rust tests: `extract_tests` (5) + salary tests (2), full suite 177 passing; (e) Settings gained a **Job search** section exposing `settings.geoScope` (worldwide/europe/usa/asia; `asia` branch + `ASIA_COUNTRIES` added to `build_geo_cfg` so the scope and the client region filter agree) that `discover_scan` consumes, making the Sources drawer's "SCOPE ... Edit in Settings" footer truthful; (f) detail screen de-duplicated: single **Apply now** action (opens original in browser, never submits) with an inline note - the redundant view-original link and duplicate sidebar apply card were removed; component-style budget raised to 30/32 kB (Discover is now two screens in one component). Previously merged polish: three small polish fixes: (1) the Dashboard's overdue-follow-up "Draft follow-up" action now deep-links into Pipeline via `?openCard=<id>` and opens that job's quick-view modal (previously landed on the board with nothing else happening); (2) the Analytics application funnel's non-primary bars now use a lighter, theme-aware `--ana-neutral-fill` token instead of the raw `--graphite-500` (which had no light-theme override and looked muddy); (3) the onboarding AI-provider cards show real brand marks for Claude and DeepSeek (official logos in brand color, from simple-icons) and OpenAI (official mark, inline SVG with `currentColor` for theme visibility - simple-icons has no OpenAI icon, likely pulled per their brand policy, so it was sourced from Iconify's `logos` set instead). Prior branch `feat/discover-scan-engine` merged to `main` as PR #126 (`cd3bb0a`) - Discover shipped end-to-end: the Rust scan engine (commit `51b54d8`, details below) plus the full **Discover screen** implemented from the Claude Design handoff `Discover.dc.html` (project `499b310a`; deltas in `design-system/pages/discover.md`). **UI (`discover.component`):** six real-data states (skeleton / first-run "Choose sources" / never-scanned / scanning / feed / caught-up), the terminal-native **scan console** (mono log lines, blink cursor, quiet errors; per-source result lines fill in when `discover_scan` returns), the collapsed **summary strip** (`LAST SCAN · N NEW · N FILTERED · 0 TOKENS` from `sources.last_scan_json`), filter row (text/source/geo/NEW-ALL + Sources button), triage feed rows (title sans + company mono, source badge, ago, archetype-derived keyword chips, Save -> `applications` status `saved` + `SAVED`/`IN MY JOBS`, Dismiss -> inline `DISMISSED · Undo` strip, row click -> inline JD preview + "View original posting" via `plugin-opener`), and the right-side **Sources drawer** (built-in toggles, ATS company boards with add-form GH/Lever/Ashby by slug, user RSS add-form with legality note, per-source last-scan line, remove for non-builtin, footer `SCOPE: ...` + Edit in Settings). **Backend additions for the UI:** migration `0019` `jobs.source_url`; `db_discover_feed` now returns `jdPreview`/`sourceUrl`/`saved` (EXISTS applications); `db_discover_dismiss(job_id, dismissed)` supports Undo; new `db_add_source` (https-only RSS or ATS slug) + `db_remove_source` (non-builtin only). New i18n `discover.*`(63 keys, en+de parity verified). **Verified:** Rust 170/170 + clippy clean (module), desktop AOT build green, eslint clean on touched files, web preview screenshots of first-run + drawer in dark and light themes (graceful outside-Tauri degradation like Dashboard). **Live Tauri gate pending:** enable a builtin source, run a real scan, triage the feed, add/remove a source. Engine details: the Rust Discover scan engine (ROADMAP §11, STEP*BY_STEP_PLAN`feat/discover`prerequisite). New`commands/discover.rs`: `discover_scan`fetches every enabled non-manual source over HTTPS (Remotive API, Himalayas API, generic RSS incl. WWR "Company: Role" titles, Greenhouse`?content=true`, Lever `?mode=json`, Ashby posting API - all known-shape parsers, never arbitrary HTML), runs the 0-token local filters (title positive/negative keyword lists per source with a fallback derived from `profile.target_archetypes`; geo scope from `settings.geo_scope`+ active`geo_filters`with word-boundary matching for short tokens, remote markers always pass, empty locations never dropped), and dedupes into`jobs`via`INSERT OR IGNORE`on the existing`jd_hash` UNIQUE index (`imported_from='discover_scan'`; a dismissed job stays dismissed on re-scan). Returns a per-source `ScanSourceResult`(fetched/filteredOut/duplicates/newJobs/error) +`ScanSummary` - the data behind the design brief's scan console (`docs/design/discover-screen-prompt.md`, written this session; Discover UI itself still the coming-soon stub). Support commands: `db_discover_feed`(non-dismissed scan jobs, marks`discover_shown_at`after listing so NULL = NEW exactly once),`db_discover_dismiss`, `db_list_sources`, `db_set_source_enabled`. Migration `0018_discover_scan.sql`adds`sources.last_scan_at`+`last_scan_json`(per-source result cached for the future Sources drawer).`job_url.rs` helpers (`strip_html`, `xml_tag`, `path_segments`, `titleize_slug`, `extract_host`) promoted to `pub(crate)`and reused. TS layer:`libs/core` `discover.model.ts`(ScanSummary/ScanSourceResult/DiscoverFeedItem/DiscoverSource) +`DbService` `discoverScan/discoverFeed/discoverDismiss/listSources/setSourceEnabled`. **Verified:** Rust 166/166 tests green (11 new: parsers on fixtures matching live-curled API shapes, title/geo filters, dedupe + dismissed-stays-dismissed in in-memory SQLite) + an `#[ignore]`d live test (`cargo test --lib live_tier2 -- --ignored`) that fetched and parsed real jobs from all three Tier-2 endpoints; clippy clean for the new module; desktop AOT build green; desktop lint failures are the pre-existing interview-prep/my-jobs/tracker HTML errors, untouched. Built-in sources remain seeded DISABLED - the live Tauri gate (enable a source, run `discover_scan`, see rows in `jobs`) lands with the Discover UI. Prior focus: `feat/interview-prep-redesign`- Interview Prep redesign from the Claude Design handoff`Interview Prep.dc.html`(project`baa42fd9`; brief `docs/design/interview-prep-screen-brief.md`). Two Angular screens rebuilt with the real design system (semantic tokens, `lucide-angular`, mono anchors) + a shared `\_ip-shared.scss` partial (`@use`-d by both) for the badge/popover/modal/button styles. **List (`interview-prep.component`):** a summary strip (Tracking / Upcoming / Next interview), a CSS-grid table (Company · Role · Current stage · Status badge · Next date · row kebab), skeleton + empty states, and a per-row **Remove from Interview Prep** kebab action → styled confirm modal that deletes every stage of that application (frontend loops `listInterviewStages`→`deleteInterviewStage`; the job stays in My Jobs/Pipeline). **Detail (`interview-prep-detail.component`):** single back arrow, header + one **Add stage** button, a detail summary line, and a **timeline** of stage cards (rail with order node coloured by status + connecting line; card with grip, label, `type · formatted-date`, interviewer line, notes, and a right cluster: a **status badge-menu** dropdown, move up/down, edit, delete). The always-on bottom add-form is gone - **Add/Edit now open a modal** (`modalOpen`/`modalMode`, shared `.ip-modal`) with grouped fields + required-label validation; **stage delete** uses a styled confirm dialog (replaced the browser `confirm()`). **Deferred (stretch in the brief):** the per-stage AI prep surface (generate questions / STAR) - no AI generation backend exists yet, so it was NOT built (avoids a hollow control); flagged for a follow-up feature (the `interview_prep`table already exists). **Fix:** the double back arrow -`interview.back_to_list`carried a literal`←`on top of the lucide icon; the char was removed (en+de). New i18n`interview.*`(en+de): list*empty_sub, stat\*\*, row\*actions, remove_from_prep/remove/removed, confirm_remove\**, detail*summary, modal*\__title, label_required, notes_placeholder, interviewer, saved, stage_deleted, confirm_delete_\_. **Verified:** desktop AOT build + eslint (touched) + i18n parity (1/1) green. **Live Tauri gate pending** (list/detail need seeded stages; web preview has no backend). **Prior (MERGED, PR #115,`dbe4ad8`):** `feat/tracker-edit-columns-export`- full Job Tracker redesign, implemented from the Claude Design handoff`Job Tracker.dc.html`(project`c6f64017`, briefed in `docs/design/job-tracker-screen-brief.md`). The React `.dc.html`mock was translated into the Angular`tracker.component`using the real design system (semantic tokens,`lucide-angular`icons, mono anchors) and the app's real`ApplicationStatus`set (the mock's demo-only`screening`/`ghosted`were dropped). **Screen:** toolbar (title + Active/Archived segment with counts + period/status selects + Columns + Export report), a table with the index + company columns **pinned** (sticky) while the rest scroll sideways, zebra rows, colour-coded status pills, company-as-link to`/jobs/:id`, a summary strip, and skeleton/empty states. **Columns:** 6 essential shown by default (`essential`flag), the other 14 hidden-but-toggleable in a right-side **Columns drawer** (Essential / Optional / Custom sections, toggle switches, LOCKED tag on job-derived fields, pinned company). **Editing:** a row is read-only until its **Edit** action opens a`draft`copy; editable fields become inputs (status =`<select>`), **Save** persists via `db_update_application_tracker_fields`(now also writes`custom_fields`) + `db_set_application_status`if status changed, then reloads; Cancel discards. **Row menu:** Edit / Archive|Restore / Remove (inline two-step confirm; Remove =`db.deleteJob(jobId)`hard cascade, same as My Jobs - the tracker is a live`applications JOIN jobs`view, not a separate ledger). **Archive:** soft flag,`db_set_application_archived`, archived rows leave the active grid but stay in the report. **Custom columns:** user-defined columns persisted in a new `tracker_custom_columns`table (+ per-row values in`applications.custom_fields`JSON); add/remove from the drawer, editable per row like built-ins. **Horizontal scroll:** the table lives in a`.jt**table-wrap`(border/radius/clip) →`.jt**scroll` (`overflow-x:auto`) → `<table min-width:max-content>`; the scroll container is the sticky-column reference so the pinned index+company stay put while the rest scroll (earlier `display:block`+`overflow:hidden` on the table both clipped and broke sticky - fixed). **Pipeline link:** the tracker query now also derives the soonest still-upcoming interview stage (`next_stage_label`/`next_stage_at`= min`scheduled_at`where`status='upcoming'`), surfaced in a new default-on **Next Interview** column (`type:'stage'`, read-only), so a scheduled technical/final round shows up beyond the fixed stage-#1/#2 date columns. **Report letterhead component:** extracted to a shared presentational `TrackerReportComponent` (`app-tracker-report`) so the SAME render backs both the preview modal and the PDF. **Report columns = the user's own visible columns** (built-in + custom + Next Interview), not a fixed set - `reportColumns`maps`visibleColumns()`to`{id,label,type,width,custom}`with an estimated mm width per column. **A4 fit:** a pure`reportFit(columns, landscape)` greedily packs columns into one row (budgets: portrait 170mm, landscape 257mm, past the index col); the export modal has a **Fit to page / All columns** mode selector and a note (`fitNoteText`) listing which columns are hidden (fit) or wrap to a per-record second line (all), for the current orientation. The preview reflects orientation (`.paper--landscape`widens the sheet) and recomputes fit live, so changing portrait↔landscape visibly changes which columns show. CSV includes every visible column (no fit limit); the WYSIWYG PDF passes`columns`(JSON) +`mode`+`landscape`through the query to the print route so the PDF equals the preview. **Market + orientation:** the preview has a **Report format** selector -`de`(German Eigenbemühungen letterhead + German headers) or`intl`(English "Job Application Report") - defaulting from`uiLanguage`(GeoScope has no DE value); plus an **A4 portrait/landscape** toggle. **WYSIWYG PDF (matches preview):** Save-as-PDF now reuses the CV hidden-window print engine - a new`/print/tracker-report` route (`TrackerReportPrintComponent`) renders the same `app-tracker-report`(with`[print]="true"`→ full-white edge-to-edge), loads rows from the DB, reads`applicant/period/periodLabel/market`from query params, and signals`print_window_ready`; new Rust `tracker_report_export_pdf_wysiwyg`(in`print.rs`) spins the off-screen window with A4 geometry (portrait/landscape) and drives `macos_print_to_pdf`to`save_path`(chosen via the JS`@tauri-apps/plugin-dialog` `save`), with a printpdf text fallback on non-macOS. Global `@media print` `body.printing-report`rules (styles.scss) hide the app shell so only the sheet prints (the whole app wraps every route in`app-shell-layout`, so this class-gated reveal is required - same mechanism as `printing-cv`). **Row-menu fix + polish:** the "…" popup was clipped/overpainted because it rendered inside a sticky cell (each sticky cell is its own stacking context, so lower rows painted over it). It is now rendered once at the component ROOT (`menuRow`/`menuPos`signals),`position:fixed`at the trigger's`getBoundingClientRect()`, with a transparent click-away backdrop; styled per the row-actions design spec (200px, `--surface-2`, 10px radius, layered shadow, scale-in from top-right, reduced-motion-safe) and a clearer two-step Remove confirm (icon + `confirm_remove_title`+ muted body). **Full-width layout:**`.jt**wrap`dropped its`max-width:1180px`/`margin:auto`; it now fills the shell `.content` (which supplies the 32px gutter), matching Documents, and the table (`width:100%; min-width:max-content`) stretches to fill. **CSV** stays the deterministic text export via `export_report`. **Legacy export path:** "Export report" opens a **preview modal** (letterhead paper: title, applicant, period, table, totals) with **Save as PDF / Save as CSV**, each via the native Save dialog (`export_report`→`tauri_plugin_dialog` `blocking_save_file`, pre-filled `eigenbemuehungen-DATE.{pdf,csv}`, cancel = empty path no-op). **Backend:** migration `0017_tracker_archive_custom.sql`(adds`applications.archived`+`applications.custom_fields`, creates `tracker_custom_columns`); new Rust commands `db_set_application_archived`, `tracker_custom_columns_list/add/remove`; `TrackerRow`+`ApplicationTrackerFieldsInput`extended; registered in`lib.rs`. New i18n (en+de) under `tracker.*`(segments, archive/restore, columns sections, custom-column types, preview/save labels, empty states). **Verified:** desktop AOT build + eslint (touched files) + i18n parity (1/1) + Rust 146/146 tests + clippy all green. **Live Tauri gate pending** (migration apply, archive/custom-column persistence, edit-save, native Save dialog, and the data flow all need the running backend - not exercisable in the browser preview). **Prior (MERGED, PR #114,`2171718`):** `feat/settings-data-reset-polish`- Settings page expansion + design-system pass. **New:** a **Delete all data (factory reset)** control - new`db_reset_all_data`Rust command wipes every user table (enumerated from`sqlite_master`, `\_sqlx_migrations`kept, FKs toggled off for the wipe) and re-seeds the default`settings`row with`onboarding_seen = 0`; the frontend also clears every provider key from the OS keychain and hard-reloads so the onboarding gate re-fires. Gated behind an inline two-step "Yes, delete everything" confirm (not a modal, per product register), `--danger`-tinted section. **New Settings sections (only the ones with real behaviour):** Appearance (light/dark theme via `ThemeService`) and About (app name + version via `@tauri-apps/api/app` `getVersion`, best-effort so it hides outside Tauri). **Deliberately NOT surfaced (analysis finding):** `geoScope`, `minScoreNotify`, `autoExportFormat`, `autoExportOnApply`, and the pre-existing `exportDir`field are all **inert** - schema columns with zero consumers (Discover is a`coming_soon`stub, there is no notification system, export ships PDF-only by design with the DOCX renderer dormant, and the export flow uses a native save dialog rather than`exportDir`). An earlier draft of this branch added Export-defaults + Search & alerts sections and the `exportDir` input; they were removed after tracing showed nothing reads those fields (showing a control that does nothing is worse than its absence). Re-add when Discover / notifications / multi-format export actually land. **UX fixes:** language pickers now show endonyms (`LANGUAGE_NATIVE_NAMES`in`@applye/core`: English/Deutsch/Русский/Español/Français/Українська) instead of raw codes; `.settings`gained`padding-bottom`so the last card no longer kisses the scroll edge; the AI privacy note (from the prior sub-task) now renders for every cloud provider with a`PROVIDER_VENDORS`map, DeepSeek keeping its extra China-jurisdiction line. New sections use concise English-inline labels, consistent with the already-English AI/API-key half of the page (avoids raw-key bugs since missing i18n keys render the key string, not an en fallback). Desktop AOT build + Rust`cargo check`+ core tests + prettier/rustfmt green;`settings.component.ts`lint-clean (the 5`jobs`lint errors stay pre-existing). Visual pass done via a token-accurate static HTML mock (the live screen needs the Tauri DB context to render); live Tauri gate still pending. **Prior (MERGED, PR #113,`dedcc99`):** `fix/pipeline-card-staleness-a11y`- Pipeline board redesign (from a Claude Design`Pipeline.dc.html` handoff) plus five earlier quick-view fixes. **Redesign (frontend + a thin backend read):** the board gained a summary strip (`N active`·`M overdue`· in-strip search over company/role/location ·`Show archived N`); rejected/cancelled columns collapse to vertical side rails ("archive", pure UI state via a `showArchived`signal, no migration) and expand on click; cards were rebuilt with a company monogram, location line, colour-coded ATS badge /`No score`, and a segmented interview stage-progress track; the quick-view modal now leads with a status + ATS-fit row, renders the interview as a segmented stepper (from the full `listInterviewStages`array), and divides every section. Per product decision: the design's`New application`/ per-column`+`controls are **omitted** for now (entry stays via the Apply wizard), and the follow-up drafter stays **overdue-gated** (not always-on). Backend:`db_pipeline_cards`SELECT +`PipelineCard`(Rust + TS) gained read-only`location`(from`jobs.location`) and `currentStageTotal`(COUNT of stages) to power the location line and progress track. New i18n (en+de; ru/es/fr/uk stub from en):`pipeline.active/match/no_match/no_score/search_placeholder/show_archived/hide_archived/quickview_ats`, `followup.privacy_note`. **Earlier on this branch (the five quick-view fixes):** drag/modal status changes now refresh the card from the returned `Application` (applied\*at/follow_up_at/overdue no longer stale); a failed drop toasts and reverts; the modal closes on Escape, traps focus (`cdkTrapFocus`), and restores focus. Desktop AOT build + i18n parity + Rust `cargo check`+ eslint (touched files) green; live Tauri visual pass still pending (needs seeded applications). **Prior focus:**`design/wizard-polish`- impeccable design-skill pass on the Tailor/apply-wizard. Added root`PRODUCT.md`(register: product; platform: web/Tauri; personality: calm/precise/tool-like; anti-refs: SaaS-cream slop + playful-consumer). Audited the wizard (17/20, "fits the design system") then applied three fixes to`apply-wizard.component.scss`+ the review-step template: (1) **adapt** -`wizard-review**dims`→`repeat(auto-fit, minmax(220px,1fr))`and`wizard-review\_\_top`flex-wraps with a`min-width`verdict so score/verdict stack on narrow windows; (2) **animate** - score bars use`transform: scaleX()`(was`width`) with a `prefers-reduced-motion`fallback; (3) **polish** - 11px mono micro-labels (eyebrow/step-of/cache-chip/score-max) moved tertiary→secondary (tertiary ≈3.4:1 on the surface, under AA; secondary ≈5.3:1). Per-step eyebrows kept (informational step-labels, product-appropriate). Desktop 564 tests + build + lint green. **Prior (MERGED, PR #111,`225cb1d`):** `feat/create-update-application`- the Export & Apply step's primary button is now "Create application" (first time; was "Mark as applied") / "Update application" (already applied). Both call a new`commitApplicationDocuments(regenerateStale)`: generate a missing CV/cover letter, regenerate a stale one (input-hash compared to the current tailoring via `cvDocStale`/`coverLetterDocStale`), then `commitLinkedDocument`both into the library.`updateApplication`previously saved only the score and left docs untouched. The button disables + shows a working label while`busy()`(which already includes`anyDocPreparing()`). The Documents-list company/role label (`linkedJobLabel`, the "Linked to: Company · Role" subtitle in cv-list/cover-letter-list) works now that #110 persists the doc-id link (a brief accent-chip experiment was reverted per the user - the subtitle stays; separator switched `-`→`·`to respect the punctuation rule). **Button-workflow fix:** the job-detail secondary button was "Add to Pipeline" but`addToPipeline`created an`applied`application - identical to Mark as Applied. Renamed to`saveJob`/ "Save this job" writing`status: 'saved'`(My Jobs / Job Tracker lead), distinct from Mark as Applied's`applied`(Pipeline board); i18n`add_to_pipeline`→`save_job`, `pipeline_ok`→`saved_ok`. i18n: `mark_as_applied`→`create_application`, new `applying`. Desktop 564 + i18n parity + build + lint green. Manual Tauri gate: reach Export & Apply with no generated CV → Create application generates + files it (labelled by company/role); re-tailor an applied job → Update application refreshes the saved doc. **Prior (MERGED, PR #110, `f582096`):** `feat/defer-docs-to-export`- draft-scoped documents (the "persist only at final Apply" layer previously deferred; see the known-limitation note further down, now resolved). Generated tailored CVs / cover letters are written to`document_library`with a new`is_application_draft`flag (migration`0016`); the Rust `document_library_list` excludes drafts (`document_library_get`stays unfiltered so Review / inline-edit / export still reach them by id), and a new`document_library_commit`command clears the flag.`createCvDraft`/`createCoverLetterDraft`set`isApplicationDraft: true`; `doExport`(on success) and`markApplied`call`commitLinkedDocument`, so a draft only enters the Documents library once the user exports its PDF or marks the job applied (step 5, Export & Apply). UPDATE uses `COALESCE(?, is_application_draft)`so the document editor saving a Review edit never un-drafts a row. The wizard document cards now show a single "Generate" (relabelled from "Create") before a draft exists and "Review" + "Regenerate" after; the benign "ResizeObserver loop" error is swallowed in`ToastErrorHandler`instead of toasting. Spec at`docs/superpowers/specs/2026-07-17-defer-docs-to-export.md`. Also fixes two real bugs surfaced while testing: (1) `ApplicationInput`(Rust) +`db_upsert_application`never wrote`cv_document_id`/`cover_letter_document_id`(unwritable since migration 0011), so the wizard's link to its generated doc was dropped - "Review" reverted to "Generate" seconds after generation and on return, and ADR-0003 minted duplicates every regenerate; now persisted via`COALESCE(?, col)`in an extracted`db_upsert_application_core`with a regression test. (2) The CV preview rendered a hardcoded`", "` between degree and institution, so an empty degree showed a leading comma; now gated on both being present (`cv-print`reuses the preview, so the PDF is covered). Desktop 564 tests + Rust 146/146 (3 new: draft-hidden-until-committed, COALESCE-preserve, doc-id-persist) + build + lint green. Manual Tauri gate (needs backend): generate a CV → it does NOT appear in Documents; Review/edit/export still work; export or mark-applied → it now shows in Documents. Follow-up (not done here): generation speed - the gap-analysis → dialog → cv-import chain is inherently sequential; options are a faster model tier or streaming, tracked separately. Prior state:`main`- clean, no open PRs. The full MyJob apply-wizard review shipped across PRs #101-#107: #101 CV parse + wizard gating; #102 one-doc-per-job (ADR-0003) + resumable wizard (E/D); #103 single percentage scoring scale (§3); #104 read-only status + honest Edit + single source of truth (§2); #105 cancel tailoring + nav-lock while busy + review-in-preview; #106 base-CV default + role in doc labels + real Start-over + cross-job guard; #107 the agentic CV gap-fill agent (Batch C). Most recent:`feat/cv-gap-fill-agent`(merged as #107,`bdf1c71`) - Batch C, built via subagent-driven development against `docs/superpowers/specs/2026-07-16-cv-gap-fill-agent-design.md`+ its plan. Before generating a tailored CV,`createCvDraft`runs a new`cv-gap-analysis`AI skill (registered in`skills.rs`) that compares the tailored CV against the job and returns up to 5 targeted questions; if any, a standalone `CvGapDialog`overlay collects answers one at a time (answer/skip) plus a save-to-profile toggle;`buildAdditionalInfoBlock`folds the answers into the`cv_text`fed to`cv-import`, and `appendToProfile`(whole-row-replace safe per #97) optionally persists them. Fail-open:`parseCvGapResponse`returns`[]`on any bad output so a failed analysis never blocks generation; CV-only. Pure helpers`parseCvGapResponse`/`buildAdditionalInfoBlock`live in`cv-content.util.ts`. Desktop 541 tests + i18n parity + Rust skills 6/6 + build green; lint adds one tolerated non-null-assertion warning in the new spec (the 5 `my-jobs.component.html` errors stay pre-existing). Manual Tauri gate: on Create/Regenerate the analyzing overlay appears; a job the CV already covers skips to generation; answers show in the generated CV; save-to-profile persists. Prior branch (merged, PR #106): Batch A of the second apply-wizard review. **Base CV default:** the Tailor step now defaults the base to the profile (`null`/ "from scratch") instead of`matches[0]`; if the job already has its own tailored CV (`application.cvDocumentId`), that is the default and is forced into the picker even if the language filter would exclude it. **Doc labels:** a new `jobDocLabel(job, suffix)`names the role too - "Company - Title - Tailored CV/Cover Letter" across all three generated-doc labels. **Start over:** the Export-step "Start over" (which called`resetWizard`, clearing only off-screen signals so nothing visibly happened) now calls a new `startOver()`that discards tailoring state and returns to the Tailor step (step 1);`resetWizard`is unchanged for the in-place Retailor button. **Cross-job guard:**`openWizard`split into a guard +`doOpenWizard`; opening the wizard while an unfinished session exists for a \_different\* job now raises a confirm (naming the other job via `crossJobLabel`from the overview) instead of silently overwriting`wizardProgress`. Deferred (Batch C, big): an agentic follow-up-questions window that gathers missing info (language level, experience, tech/frameworks) before generating a CV. Two items confirmed already-correct and left as-is: step-3 "Create" only shows when no doc is linked (else Review/Regenerate), and Run Final Check is intentionally gated on a linked CV. Desktop 532 tests + build green; the 5 `my-jobs.component.html` lint errors stay pre-existing. Prior branch (merged, PR #105): wizard cancel/nav/preview - three apply-wizard refinements from the workflow review. **Cancel tailoring:** the Tailor step's spinner has a Cancel button (`tailorCancelled`signal) that stops the 3-pass loop before the next pass and discards the partial result; the in-flight AI pass finishes but its result is dropped. **Lock nav while busy:** the wizard Back button is now disabled alongside Next whenever`busy()`(tailoring/rescore/document generation) is true, so the user can no longer step off a working step onto a page whose Next is greyed out. **Review opens in preview:** "Review CV"/"Review letter" navigate with`preview=1`, and cv-detail/cover-letter-detail start in `previewMode`(rendered result first, toggle to Edit). This closes the last MyJob-audit item (C-preview); §1-8 are done. Desktop 532 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Verify gate (needs backend): cancel mid-tailor returns to pre-tailor state; Back is locked while Updated-score runs; Review opens the rendered CV. Prior branch (merged, PR #104, §2): status source-of-truth - audit item §2 from the MyJob review. **Single source of truth:**`markApplied`/`addToPipeline`mirror the overview row from the status the DB returned, not a hardcoded literal, so list and SQLite cannot drift. **Status stays read-only on the detail:** by product decision, status is set on the Pipeline board and only reflected (read-only badge) on the job detail, which stays in sync via the single-source fix (an earlier iteration added a detail dropdown, reverted). **Honest "Edit":** the misnamed "Change status" button (which only unlocked the description) is renamed to "Edit", and reopening editing on an application past Applied (interview/offer/rejected) now asks for confirmation. **Dedup:** shared`APPLICATION_STATUSES`constant in`@applye/core`replaces the status list hardcoded in the detail dropdown and the My Jobs filter (pipeline`COLS`left as-is - it carries per-column accent/label data and excludes`saved`). Two `description_locked`em dashes fixed. Desktop 532 + core 75 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Verify gate (needs backend): change status via the dropdown and confirm the list reflects it; Edit on an interview-stage application prompts first. Prior branch (merged, PR #103, §3): the scoring UI collapses its three coexisting scales (0-100 gauge, 1-5 stars, 1-10 breakdown) into one percentage. The gauge reads "82 %", the wizard review "82 % match", per-dimension breakdowns show`score * 10`% (scoring view, updated-score before/after, wizard review), and the 5-star rating is removed (it duplicated the gauge and computed `(score/100)\*4+1`, so 0 still showed 1.0). `dimensionBand`thresholds aligned to the gauge's 75/50 bands (>=7.5 high, >=5 mid) and the duplicate band logic in ScoringView de-duplicated; new`score_match_caption`string EN+DE;`starRating`+ dead star CSS removed. Desktop 532 tests + build green. Verify gate (needs backend): confirm the gauge/breakdown render as percentages on a scored job. Prior branch (merged): E + D from the apply-wizard audit - audit items E + D from the MyJob apply-wizard review (PR #101 with the first batch already merged to`main`as`bb3d006`). **E (one doc per job, ADR-0003):** `createCvDraft`/`createCoverLetterDraft`reuse the application's already-linked document id, so a first tailor and every retailor/regenerate update the same library row instead of stacking duplicate "<Company> - Tailored CV"/"- Cover Letter" entries; the auto-create on entering the Review Documents step is removed, so the CV is written only on an explicit Create/Regenerate click. **D (wizard progress persistence):** a new`WizardProgressService`records`{jobId, step}`in sessionStorage; JobsComponent writes it on open + every step change and clears it on completion/close;`restoreWizardProgress`re-opens the wizard at the left-off step on return to`/jobs/:id`(token-free - no auto-rescore); a floating "Finish tailoring" button in the shell returns the user to an unfinished session from any page and hides on that job's own page (browser-verified: shown on /documents and /jobs/999, hidden on /jobs/123). Recorded the one-doc-per-job rule as **ADR-0003\*\*. Desktop 532 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Known limitation (RESOLVED on`feat/defer-docs-to-export`, see top): true "persist only at final Apply" was not done - the wizard's own Review/Final-checks/Export steps need a saved doc, so ADR-0003 (one-per-job, update in place) was the resolution rather than a draft-until-apply layer. The draft-until-apply layer now exists via the `is_application_draft` flag: docs are still saved (so Review/Final-checks/Export keep their id) but hidden from the library until committed at Export & Apply. The Profile page was rebuilt to match its guided redesign (PR #100, visual/copy only). The scoring card reports staleness by hash rather than by "is the form dirty", and the Experience field admits it holds Markdown (PR #98). The First-Run Onboarding Wizard (§17) has been audited end to end (PRs #93, #95), the PDF text-layer ligature corruption is fixed on both export and import (PR #94), and the profile↔onboarding markdown format no longer loses the user's contact details (PR #97). Documents CV & Cover Letter Library (§16) is fully shipped and extended; the wizard hands off into it.
- **Prior (MERGED, PR #127, `9b747e3`)**: Discover detail screen + filters + scan-leak fix - (a) `db_list_jobs` / `db_list_jobs_overview` now exclude `imported_from = 'discover_scan'` jobs that have no application row, so scanned openings stay out of My Jobs until explicitly saved; (b) Discover feed cards restyled per the updated `Discover.dc.html` handoff (company on its own line with a building icon, icon-labelled source/location/age chips, "MATCHED" keyword label, bordered NEW pill); (c) row click opens a **full-screen job detail** (second revision of `Discover.dc.html`): hero with monogram/source/age/NEW + MATCH% chip, deterministic block-parsed full JD (headings/paragraphs/bullet lists from the strip*html line output, lazy via `db_get_job`, 0 tokens), Apply-now + view-original actions, and a sticky sidebar - raw keyword-fit score ring (profile keywords vs posting, bands strong>=80 / good>=55 / partial, "Score with AI" saves + navigates to `/jobs/:id`, strong shows NO RE-SCORE NEEDED), apply card, About-the-job facts, SKILLS FOUND IN POSTING (static dictionary match), Local & private note; (d) filter row: three checkbox popovers (empty = all) - **Sources** (distinct source names present in the feed), **work type** (remote/hybrid/onsite, deterministic from location text), and **Locations** (a `COUNTRY_DEFS` dictionary with per-country `cities` classifies each job's location text into region+country+city via `classifyLoc`; `availableRegions` derives a 3-level region->country->city tree from the live feed so only levels actually scanned appear; tri-state checkboxes cascade - region toggles all its countries+cities, country toggles itself+its cities, a lone city narrows to that city; filter passes a row when its country key OR its `"Country City"` city key is selected. Remote-anywhere/unknown rows classify into an **Other** bucket (a normal selectable option, no longer an always-pass), fixing the bug where picking one country also matched anywhere-jobs. Dictionary filled out to all EU countries incl. Croatia + a **North America** region (USA, Canada - so "Ontario" resolves)); (g) **company/salary detection fixed** in the paste pipeline - `extract_company` (scoring.rs) now falls back from `Company:` headers to body heuristics (`About X` / `Join X` headings, `<Company> is a/an/the ...` opener, via `leading_proper_noun` + `is_plausible_company`, rejecting fragments like "We are a ..."); `parseAndFilter` passes the already-known company/title as overrides so re-parsing a Discover job keeps them; the `job_paste` upsert `ON CONFLICT` now `COALESCE`-backfills a missing company/title without clobbering; and `legitimacy.rs` gained `mentions_salary_amount` (detects `80k`, `90,000 EUR`, `120000 USD` without currency symbols) plus a wider `SALARY_KEYWORDS` list, so the "Salary is not mentioned" note stops firing on symbol-free pay. New Rust tests: `extract_tests` (5) + salary tests (2), full suite 177 passing; (e) Settings gained a **Job search** section exposing `settings.geoScope` (worldwide/europe/usa/asia; `asia` branch + `ASIA_COUNTRIES` added to `build_geo_cfg` so the scope and the client region filter agree) that `discover_scan` consumes, making the Sources drawer's "SCOPE ... Edit in Settings" footer truthful; (f) detail screen de-duplicated: single **Apply now** action (opens original in browser, never submits) with an inline note - the redundant view-original link and duplicate sidebar apply card were removed; component-style budget raised to 30/32 kB (Discover is now two screens in one component). Previously merged polish: three small polish fixes: (1) the Dashboard's overdue-follow-up "Draft follow-up" action now deep-links into Pipeline via `?openCard=<id>` and opens that job's quick-view modal (previously landed on the board with nothing else happening); (2) the Analytics application funnel's non-primary bars now use a lighter, theme-aware `--ana-neutral-fill` token instead of the raw `--graphite-500` (which had no light-theme override and looked muddy); (3) the onboarding AI-provider cards show real brand marks for Claude and DeepSeek (official logos in brand color, from simple-icons) and OpenAI (official mark, inline SVG with `currentColor` for theme visibility - simple-icons has no OpenAI icon, likely pulled per their brand policy, so it was sourced from Iconify's `logos` set instead). Prior branch `feat/discover-scan-engine` merged to `main` as PR #126 (`cd3bb0a`) - Discover shipped end-to-end: the Rust scan engine (commit `51b54d8`, details below) plus the full **Discover screen** implemented from the Claude Design handoff `Discover.dc.html` (project `499b310a`; deltas in `design-system/pages/discover.md`). **UI (`discover.component`):** six real-data states (skeleton / first-run "Choose sources" / never-scanned / scanning / feed / caught-up), the terminal-native **scan console** (mono log lines, blink cursor, quiet errors; per-source result lines fill in when `discover_scan` returns), the collapsed **summary strip** (`LAST SCAN · N NEW · N FILTERED · 0 TOKENS` from `sources.last_scan_json`), filter row (text/source/geo/NEW-ALL + Sources button), triage feed rows (title sans + company mono, source badge, ago, archetype-derived keyword chips, Save -> `applications` status `saved` + `SAVED`/`IN MY JOBS`, Dismiss -> inline `DISMISSED · Undo` strip, row click -> inline JD preview + "View original posting" via `plugin-opener`), and the right-side **Sources drawer** (built-in toggles, ATS company boards with add-form GH/Lever/Ashby by slug, user RSS add-form with legality note, per-source last-scan line, remove for non-builtin, footer `SCOPE: ...` + Edit in Settings). **Backend additions for the UI:** migration `0019` `jobs.source_url`; `db_discover_feed` now returns `jdPreview`/`sourceUrl`/`saved` (EXISTS applications); `db_discover_dismiss(job_id, dismissed)` supports Undo; new `db_add_source` (https-only RSS or ATS slug) + `db_remove_source` (non-builtin only). New i18n `discover.*`(63 keys, en+de parity verified). **Verified:** Rust 170/170 + clippy clean (module), desktop AOT build green, eslint clean on touched files, web preview screenshots of first-run + drawer in dark and light themes (graceful outside-Tauri degradation like Dashboard). **Live Tauri gate pending:** enable a builtin source, run a real scan, triage the feed, add/remove a source. Engine details: the Rust Discover scan engine (ROADMAP §11, STEP*BY_STEP_PLAN`feat/discover`prerequisite). New`commands/discover.rs`: `discover_scan`fetches every enabled non-manual source over HTTPS (Remotive API, Himalayas API, generic RSS incl. WWR "Company: Role" titles, Greenhouse`?content=true`, Lever `?mode=json`, Ashby posting API - all known-shape parsers, never arbitrary HTML), runs the 0-token local filters (title positive/negative keyword lists per source with a fallback derived from `profile.target_archetypes`; geo scope from `settings.geo_scope`+ active`geo_filters`with word-boundary matching for short tokens, remote markers always pass, empty locations never dropped), and dedupes into`jobs`via`INSERT OR IGNORE`on the existing`jd_hash` UNIQUE index (`imported_from='discover_scan'`; a dismissed job stays dismissed on re-scan). Returns a per-source `ScanSourceResult`(fetched/filteredOut/duplicates/newJobs/error) +`ScanSummary` - the data behind the design brief's scan console (`docs/design/discover-screen-prompt.md`, written this session; Discover UI itself still the coming-soon stub). Support commands: `db_discover_feed`(non-dismissed scan jobs, marks`discover_shown_at`after listing so NULL = NEW exactly once),`db_discover_dismiss`, `db_list_sources`, `db_set_source_enabled`. Migration `0018_discover_scan.sql`adds`sources.last_scan_at`+`last_scan_json`(per-source result cached for the future Sources drawer).`job_url.rs` helpers (`strip_html`, `xml_tag`, `path_segments`, `titleize_slug`, `extract_host`) promoted to `pub(crate)`and reused. TS layer:`libs/core` `discover.model.ts`(ScanSummary/ScanSourceResult/DiscoverFeedItem/DiscoverSource) +`DbService` `discoverScan/discoverFeed/discoverDismiss/listSources/setSourceEnabled`. **Verified:** Rust 166/166 tests green (11 new: parsers on fixtures matching live-curled API shapes, title/geo filters, dedupe + dismissed-stays-dismissed in in-memory SQLite) + an `#[ignore]`d live test (`cargo test --lib live_tier2 -- --ignored`) that fetched and parsed real jobs from all three Tier-2 endpoints; clippy clean for the new module; desktop AOT build green; desktop lint failures are the pre-existing interview-prep/my-jobs/tracker HTML errors, untouched. Built-in sources remain seeded DISABLED - the live Tauri gate (enable a source, run `discover_scan`, see rows in `jobs`) lands with the Discover UI. Prior focus: `feat/interview-prep-redesign`- Interview Prep redesign from the Claude Design handoff`Interview Prep.dc.html`(project`baa42fd9`; brief `docs/design/interview-prep-screen-brief.md`). Two Angular screens rebuilt with the real design system (semantic tokens, `lucide-angular`, mono anchors) + a shared `\_ip-shared.scss` partial (`@use`-d by both) for the badge/popover/modal/button styles. **List (`interview-prep.component`):** a summary strip (Tracking / Upcoming / Next interview), a CSS-grid table (Company · Role · Current stage · Status badge · Next date · row kebab), skeleton + empty states, and a per-row **Remove from Interview Prep** kebab action → styled confirm modal that deletes every stage of that application (frontend loops `listInterviewStages`→`deleteInterviewStage`; the job stays in My Jobs/Pipeline). **Detail (`interview-prep-detail.component`):** single back arrow, header + one **Add stage** button, a detail summary line, and a **timeline** of stage cards (rail with order node coloured by status + connecting line; card with grip, label, `type · formatted-date`, interviewer line, notes, and a right cluster: a **status badge-menu** dropdown, move up/down, edit, delete). The always-on bottom add-form is gone - **Add/Edit now open a modal** (`modalOpen`/`modalMode`, shared `.ip-modal`) with grouped fields + required-label validation; **stage delete** uses a styled confirm dialog (replaced the browser `confirm()`). **Deferred (stretch in the brief):** the per-stage AI prep surface (generate questions / STAR) - no AI generation backend exists yet, so it was NOT built (avoids a hollow control); flagged for a follow-up feature (the `interview_prep`table already exists). **Fix:** the double back arrow -`interview.back_to_list`carried a literal`←`on top of the lucide icon; the char was removed (en+de). New i18n`interview.*`(en+de): list*empty_sub, stat\*\*, row\*actions, remove_from_prep/remove/removed, confirm_remove\**, detail*summary, modal*\__title, label_required, notes_placeholder, interviewer, saved, stage_deleted, confirm_delete_\_. **Verified:** desktop AOT build + eslint (touched) + i18n parity (1/1) green. **Live Tauri gate pending** (list/detail need seeded stages; web preview has no backend). **Prior (MERGED, PR #115,`dbe4ad8`):** `feat/tracker-edit-columns-export`- full Job Tracker redesign, implemented from the Claude Design handoff`Job Tracker.dc.html`(project`c6f64017`, briefed in `docs/design/job-tracker-screen-brief.md`). The React `.dc.html`mock was translated into the Angular`tracker.component`using the real design system (semantic tokens,`lucide-angular`icons, mono anchors) and the app's real`ApplicationStatus`set (the mock's demo-only`screening`/`ghosted`were dropped). **Screen:** toolbar (title + Active/Archived segment with counts + period/status selects + Columns + Export report), a table with the index + company columns **pinned** (sticky) while the rest scroll sideways, zebra rows, colour-coded status pills, company-as-link to`/jobs/:id`, a summary strip, and skeleton/empty states. **Columns:** 6 essential shown by default (`essential`flag), the other 14 hidden-but-toggleable in a right-side **Columns drawer** (Essential / Optional / Custom sections, toggle switches, LOCKED tag on job-derived fields, pinned company). **Editing:** a row is read-only until its **Edit** action opens a`draft`copy; editable fields become inputs (status =`<select>`), **Save** persists via `db_update_application_tracker_fields`(now also writes`custom_fields`) + `db_set_application_status`if status changed, then reloads; Cancel discards. **Row menu:** Edit / Archive|Restore / Remove (inline two-step confirm; Remove =`db.deleteJob(jobId)`hard cascade, same as My Jobs - the tracker is a live`applications JOIN jobs`view, not a separate ledger). **Archive:** soft flag,`db_set_application_archived`, archived rows leave the active grid but stay in the report. **Custom columns:** user-defined columns persisted in a new `tracker_custom_columns`table (+ per-row values in`applications.custom_fields`JSON); add/remove from the drawer, editable per row like built-ins. **Horizontal scroll:** the table lives in a`.jt**table-wrap`(border/radius/clip) →`.jt**scroll` (`overflow-x:auto`) → `<table min-width:max-content>`; the scroll container is the sticky-column reference so the pinned index+company stay put while the rest scroll (earlier `display:block`+`overflow:hidden` on the table both clipped and broke sticky - fixed). **Pipeline link:** the tracker query now also derives the soonest still-upcoming interview stage (`next_stage_label`/`next_stage_at`= min`scheduled_at`where`status='upcoming'`), surfaced in a new default-on **Next Interview** column (`type:'stage'`, read-only), so a scheduled technical/final round shows up beyond the fixed stage-#1/#2 date columns. **Report letterhead component:** extracted to a shared presentational `TrackerReportComponent` (`app-tracker-report`) so the SAME render backs both the preview modal and the PDF. **Report columns = the user's own visible columns** (built-in + custom + Next Interview), not a fixed set - `reportColumns`maps`visibleColumns()`to`{id,label,type,width,custom}`with an estimated mm width per column. **A4 fit:** a pure`reportFit(columns, landscape)` greedily packs columns into one row (budgets: portrait 170mm, landscape 257mm, past the index col); the export modal has a **Fit to page / All columns** mode selector and a note (`fitNoteText`) listing which columns are hidden (fit) or wrap to a per-record second line (all), for the current orientation. The preview reflects orientation (`.paper--landscape`widens the sheet) and recomputes fit live, so changing portrait↔landscape visibly changes which columns show. CSV includes every visible column (no fit limit); the WYSIWYG PDF passes`columns`(JSON) +`mode`+`landscape`through the query to the print route so the PDF equals the preview. **Market + orientation:** the preview has a **Report format** selector -`de`(German Eigenbemühungen letterhead + German headers) or`intl`(English "Job Application Report") - defaulting from`uiLanguage`(GeoScope has no DE value); plus an **A4 portrait/landscape** toggle. **WYSIWYG PDF (matches preview):** Save-as-PDF now reuses the CV hidden-window print engine - a new`/print/tracker-report` route (`TrackerReportPrintComponent`) renders the same `app-tracker-report`(with`[print]="true"`→ full-white edge-to-edge), loads rows from the DB, reads`applicant/period/periodLabel/market`from query params, and signals`print_window_ready`; new Rust `tracker_report_export_pdf_wysiwyg`(in`print.rs`) spins the off-screen window with A4 geometry (portrait/landscape) and drives `macos_print_to_pdf`to`save_path`(chosen via the JS`@tauri-apps/plugin-dialog` `save`), with a printpdf text fallback on non-macOS. Global `@media print` `body.printing-report`rules (styles.scss) hide the app shell so only the sheet prints (the whole app wraps every route in`app-shell-layout`, so this class-gated reveal is required - same mechanism as `printing-cv`). **Row-menu fix + polish:** the "…" popup was clipped/overpainted because it rendered inside a sticky cell (each sticky cell is its own stacking context, so lower rows painted over it). It is now rendered once at the component ROOT (`menuRow`/`menuPos`signals),`position:fixed`at the trigger's`getBoundingClientRect()`, with a transparent click-away backdrop; styled per the row-actions design spec (200px, `--surface-2`, 10px radius, layered shadow, scale-in from top-right, reduced-motion-safe) and a clearer two-step Remove confirm (icon + `confirm_remove_title`+ muted body). **Full-width layout:**`.jt**wrap`dropped its`max-width:1180px`/`margin:auto`; it now fills the shell `.content` (which supplies the 32px gutter), matching Documents, and the table (`width:100%; min-width:max-content`) stretches to fill. **CSV** stays the deterministic text export via `export_report`. **Legacy export path:** "Export report" opens a **preview modal** (letterhead paper: title, applicant, period, table, totals) with **Save as PDF / Save as CSV**, each via the native Save dialog (`export_report`→`tauri_plugin_dialog` `blocking_save_file`, pre-filled `eigenbemuehungen-DATE.{pdf,csv}`, cancel = empty path no-op). **Backend:** migration `0017_tracker_archive_custom.sql`(adds`applications.archived`+`applications.custom_fields`, creates `tracker_custom_columns`); new Rust commands `db_set_application_archived`, `tracker_custom_columns_list/add/remove`; `TrackerRow`+`ApplicationTrackerFieldsInput`extended; registered in`lib.rs`. New i18n (en+de) under `tracker.*`(segments, archive/restore, columns sections, custom-column types, preview/save labels, empty states). **Verified:** desktop AOT build + eslint (touched files) + i18n parity (1/1) + Rust 146/146 tests + clippy all green. **Live Tauri gate pending** (migration apply, archive/custom-column persistence, edit-save, native Save dialog, and the data flow all need the running backend - not exercisable in the browser preview). **Prior (MERGED, PR #114,`2171718`):** `feat/settings-data-reset-polish`- Settings page expansion + design-system pass. **New:** a **Delete all data (factory reset)** control - new`db_reset_all_data`Rust command wipes every user table (enumerated from`sqlite_master`, `\_sqlx_migrations`kept, FKs toggled off for the wipe) and re-seeds the default`settings`row with`onboarding_seen = 0`; the frontend also clears every provider key from the OS keychain and hard-reloads so the onboarding gate re-fires. Gated behind an inline two-step "Yes, delete everything" confirm (not a modal, per product register), `--danger`-tinted section. **New Settings sections (only the ones with real behaviour):** Appearance (light/dark theme via `ThemeService`) and About (app name + version via `@tauri-apps/api/app` `getVersion`, best-effort so it hides outside Tauri). **Deliberately NOT surfaced (analysis finding):** `geoScope`, `minScoreNotify`, `autoExportFormat`, `autoExportOnApply`, and the pre-existing `exportDir`field are all **inert** - schema columns with zero consumers (Discover is a`coming_soon`stub, there is no notification system, export ships PDF-only by design with the DOCX renderer dormant, and the export flow uses a native save dialog rather than`exportDir`). An earlier draft of this branch added Export-defaults + Search & alerts sections and the `exportDir` input; they were removed after tracing showed nothing reads those fields (showing a control that does nothing is worse than its absence). Re-add when Discover / notifications / multi-format export actually land. **UX fixes:** language pickers now show endonyms (`LANGUAGE_NATIVE_NAMES`in`@applye/core`: English/Deutsch/Русский/Español/Français/Українська) instead of raw codes; `.settings`gained`padding-bottom`so the last card no longer kisses the scroll edge; the AI privacy note (from the prior sub-task) now renders for every cloud provider with a`PROVIDER_VENDORS`map, DeepSeek keeping its extra China-jurisdiction line. New sections use concise English-inline labels, consistent with the already-English AI/API-key half of the page (avoids raw-key bugs since missing i18n keys render the key string, not an en fallback). Desktop AOT build + Rust`cargo check`+ core tests + prettier/rustfmt green;`settings.component.ts`lint-clean (the 5`jobs`lint errors stay pre-existing). Visual pass done via a token-accurate static HTML mock (the live screen needs the Tauri DB context to render); live Tauri gate still pending. **Prior (MERGED, PR #113,`dedcc99`):** `fix/pipeline-card-staleness-a11y`- Pipeline board redesign (from a Claude Design`Pipeline.dc.html` handoff) plus five earlier quick-view fixes. **Redesign (frontend + a thin backend read):** the board gained a summary strip (`N active`·`M overdue`· in-strip search over company/role/location ·`Show archived N`); rejected/cancelled columns collapse to vertical side rails ("archive", pure UI state via a `showArchived`signal, no migration) and expand on click; cards were rebuilt with a company monogram, location line, colour-coded ATS badge /`No score`, and a segmented interview stage-progress track; the quick-view modal now leads with a status + ATS-fit row, renders the interview as a segmented stepper (from the full `listInterviewStages`array), and divides every section. Per product decision: the design's`New application`/ per-column`+`controls are **omitted** for now (entry stays via the Apply wizard), and the follow-up drafter stays **overdue-gated** (not always-on). Backend:`db_pipeline_cards`SELECT +`PipelineCard`(Rust + TS) gained read-only`location`(from`jobs.location`) and `currentStageTotal`(COUNT of stages) to power the location line and progress track. New i18n (en+de; ru/es/fr/uk stub from en):`pipeline.active/match/no_match/no_score/search_placeholder/show_archived/hide_archived/quickview_ats`, `followup.privacy_note`. **Earlier on this branch (the five quick-view fixes):** drag/modal status changes now refresh the card from the returned `Application` (applied\*at/follow_up_at/overdue no longer stale); a failed drop toasts and reverts; the modal closes on Escape, traps focus (`cdkTrapFocus`), and restores focus. Desktop AOT build + i18n parity + Rust `cargo check`+ eslint (touched files) green; live Tauri visual pass still pending (needs seeded applications). **Prior focus:**`design/wizard-polish`- impeccable design-skill pass on the Tailor/apply-wizard. Added root`PRODUCT.md`(register: product; platform: web/Tauri; personality: calm/precise/tool-like; anti-refs: SaaS-cream slop + playful-consumer). Audited the wizard (17/20, "fits the design system") then applied three fixes to`apply-wizard.component.scss`+ the review-step template: (1) **adapt** -`wizard-review**dims`→`repeat(auto-fit, minmax(220px,1fr))`and`wizard-review\_\_top`flex-wraps with a`min-width`verdict so score/verdict stack on narrow windows; (2) **animate** - score bars use`transform: scaleX()`(was`width`) with a `prefers-reduced-motion`fallback; (3) **polish** - 11px mono micro-labels (eyebrow/step-of/cache-chip/score-max) moved tertiary→secondary (tertiary ≈3.4:1 on the surface, under AA; secondary ≈5.3:1). Per-step eyebrows kept (informational step-labels, product-appropriate). Desktop 564 tests + build + lint green. **Prior (MERGED, PR #111,`225cb1d`):** `feat/create-update-application`- the Export & Apply step's primary button is now "Create application" (first time; was "Mark as applied") / "Update application" (already applied). Both call a new`commitApplicationDocuments(regenerateStale)`: generate a missing CV/cover letter, regenerate a stale one (input-hash compared to the current tailoring via `cvDocStale`/`coverLetterDocStale`), then `commitLinkedDocument`both into the library.`updateApplication`previously saved only the score and left docs untouched. The button disables + shows a working label while`busy()`(which already includes`anyDocPreparing()`). The Documents-list company/role label (`linkedJobLabel`, the "Linked to: Company · Role" subtitle in cv-list/cover-letter-list) works now that #110 persists the doc-id link (a brief accent-chip experiment was reverted per the user - the subtitle stays; separator switched `-`→`·`to respect the punctuation rule). **Button-workflow fix:** the job-detail secondary button was "Add to Pipeline" but`addToPipeline`created an`applied`application - identical to Mark as Applied. Renamed to`saveJob`/ "Save this job" writing`status: 'saved'`(My Jobs / Job Tracker lead), distinct from Mark as Applied's`applied`(Pipeline board); i18n`add_to_pipeline`→`save_job`, `pipeline_ok`→`saved_ok`. i18n: `mark_as_applied`→`create_application`, new `applying`. Desktop 564 + i18n parity + build + lint green. Manual Tauri gate: reach Export & Apply with no generated CV → Create application generates + files it (labelled by company/role); re-tailor an applied job → Update application refreshes the saved doc. **Prior (MERGED, PR #110, `f582096`):** `feat/defer-docs-to-export`- draft-scoped documents (the "persist only at final Apply" layer previously deferred; see the known-limitation note further down, now resolved). Generated tailored CVs / cover letters are written to`document_library`with a new`is_application_draft`flag (migration`0016`); the Rust `document_library_list` excludes drafts (`document_library_get`stays unfiltered so Review / inline-edit / export still reach them by id), and a new`document_library_commit`command clears the flag.`createCvDraft`/`createCoverLetterDraft`set`isApplicationDraft: true`; `doExport`(on success) and`markApplied`call`commitLinkedDocument`, so a draft only enters the Documents library once the user exports its PDF or marks the job applied (step 5, Export & Apply). UPDATE uses `COALESCE(?, is_application_draft)`so the document editor saving a Review edit never un-drafts a row. The wizard document cards now show a single "Generate" (relabelled from "Create") before a draft exists and "Review" + "Regenerate" after; the benign "ResizeObserver loop" error is swallowed in`ToastErrorHandler`instead of toasting. Spec at`docs/superpowers/specs/2026-07-17-defer-docs-to-export.md`. Also fixes two real bugs surfaced while testing: (1) `ApplicationInput`(Rust) +`db_upsert_application`never wrote`cv_document_id`/`cover_letter_document_id`(unwritable since migration 0011), so the wizard's link to its generated doc was dropped - "Review" reverted to "Generate" seconds after generation and on return, and ADR-0003 minted duplicates every regenerate; now persisted via`COALESCE(?, col)`in an extracted`db_upsert_application_core`with a regression test. (2) The CV preview rendered a hardcoded`", "` between degree and institution, so an empty degree showed a leading comma; now gated on both being present (`cv-print`reuses the preview, so the PDF is covered). Desktop 564 tests + Rust 146/146 (3 new: draft-hidden-until-committed, COALESCE-preserve, doc-id-persist) + build + lint green. Manual Tauri gate (needs backend): generate a CV → it does NOT appear in Documents; Review/edit/export still work; export or mark-applied → it now shows in Documents. Follow-up (not done here): generation speed - the gap-analysis → dialog → cv-import chain is inherently sequential; options are a faster model tier or streaming, tracked separately. Prior state:`main`- clean, no open PRs. The full MyJob apply-wizard review shipped across PRs #101-#107: #101 CV parse + wizard gating; #102 one-doc-per-job (ADR-0003) + resumable wizard (E/D); #103 single percentage scoring scale (§3); #104 read-only status + honest Edit + single source of truth (§2); #105 cancel tailoring + nav-lock while busy + review-in-preview; #106 base-CV default + role in doc labels + real Start-over + cross-job guard; #107 the agentic CV gap-fill agent (Batch C). Most recent:`feat/cv-gap-fill-agent`(merged as #107,`bdf1c71`) - Batch C, built via subagent-driven development against `docs/superpowers/specs/2026-07-16-cv-gap-fill-agent-design.md`+ its plan. Before generating a tailored CV,`createCvDraft`runs a new`cv-gap-analysis`AI skill (registered in`skills.rs`) that compares the tailored CV against the job and returns up to 5 targeted questions; if any, a standalone `CvGapDialog`overlay collects answers one at a time (answer/skip) plus a save-to-profile toggle;`buildAdditionalInfoBlock`folds the answers into the`cv_text`fed to`cv-import`, and `appendToProfile`(whole-row-replace safe per #97) optionally persists them. Fail-open:`parseCvGapResponse`returns`[]`on any bad output so a failed analysis never blocks generation; CV-only. Pure helpers`parseCvGapResponse`/`buildAdditionalInfoBlock`live in`cv-content.util.ts`. Desktop 541 tests + i18n parity + Rust skills 6/6 + build green; lint adds one tolerated non-null-assertion warning in the new spec (the 5 `my-jobs.component.html` errors stay pre-existing). Manual Tauri gate: on Create/Regenerate the analyzing overlay appears; a job the CV already covers skips to generation; answers show in the generated CV; save-to-profile persists. Prior branch (merged, PR #106): Batch A of the second apply-wizard review. **Base CV default:** the Tailor step now defaults the base to the profile (`null`/ "from scratch") instead of`matches[0]`; if the job already has its own tailored CV (`application.cvDocumentId`), that is the default and is forced into the picker even if the language filter would exclude it. **Doc labels:** a new `jobDocLabel(job, suffix)`names the role too - "Company - Title - Tailored CV/Cover Letter" across all three generated-doc labels. **Start over:** the Export-step "Start over" (which called`resetWizard`, clearing only off-screen signals so nothing visibly happened) now calls a new `startOver()`that discards tailoring state and returns to the Tailor step (step 1);`resetWizard`is unchanged for the in-place Retailor button. **Cross-job guard:**`openWizard`split into a guard +`doOpenWizard`; opening the wizard while an unfinished session exists for a \_different\* job now raises a confirm (naming the other job via `crossJobLabel`from the overview) instead of silently overwriting`wizardProgress`. Deferred (Batch C, big): an agentic follow-up-questions window that gathers missing info (language level, experience, tech/frameworks) before generating a CV. Two items confirmed already-correct and left as-is: step-3 "Create" only shows when no doc is linked (else Review/Regenerate), and Run Final Check is intentionally gated on a linked CV. Desktop 532 tests + build green; the 5 `my-jobs.component.html` lint errors stay pre-existing. Prior branch (merged, PR #105): wizard cancel/nav/preview - three apply-wizard refinements from the workflow review. **Cancel tailoring:** the Tailor step's spinner has a Cancel button (`tailorCancelled`signal) that stops the 3-pass loop before the next pass and discards the partial result; the in-flight AI pass finishes but its result is dropped. **Lock nav while busy:** the wizard Back button is now disabled alongside Next whenever`busy()`(tailoring/rescore/document generation) is true, so the user can no longer step off a working step onto a page whose Next is greyed out. **Review opens in preview:** "Review CV"/"Review letter" navigate with`preview=1`, and cv-detail/cover-letter-detail start in `previewMode`(rendered result first, toggle to Edit). This closes the last MyJob-audit item (C-preview); §1-8 are done. Desktop 532 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Verify gate (needs backend): cancel mid-tailor returns to pre-tailor state; Back is locked while Updated-score runs; Review opens the rendered CV. Prior branch (merged, PR #104, §2): status source-of-truth - audit item §2 from the MyJob review. **Single source of truth:**`markApplied`/`addToPipeline`mirror the overview row from the status the DB returned, not a hardcoded literal, so list and SQLite cannot drift. **Status stays read-only on the detail:** by product decision, status is set on the Pipeline board and only reflected (read-only badge) on the job detail, which stays in sync via the single-source fix (an earlier iteration added a detail dropdown, reverted). **Honest "Edit":** the misnamed "Change status" button (which only unlocked the description) is renamed to "Edit", and reopening editing on an application past Applied (interview/offer/rejected) now asks for confirmation. **Dedup:** shared`APPLICATION_STATUSES`constant in`@applye/core`replaces the status list hardcoded in the detail dropdown and the My Jobs filter (pipeline`COLS`left as-is - it carries per-column accent/label data and excludes`saved`). Two `description_locked`em dashes fixed. Desktop 532 + core 75 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Verify gate (needs backend): change status via the dropdown and confirm the list reflects it; Edit on an interview-stage application prompts first. Prior branch (merged, PR #103, §3): the scoring UI collapses its three coexisting scales (0-100 gauge, 1-5 stars, 1-10 breakdown) into one percentage. The gauge reads "82 %", the wizard review "82 % match", per-dimension breakdowns show`score * 10`% (scoring view, updated-score before/after, wizard review), and the 5-star rating is removed (it duplicated the gauge and computed `(score/100)\*4+1`, so 0 still showed 1.0). `dimensionBand`thresholds aligned to the gauge's 75/50 bands (>=7.5 high, >=5 mid) and the duplicate band logic in ScoringView de-duplicated; new`score_match_caption`string EN+DE;`starRating`+ dead star CSS removed. Desktop 532 tests + build green. Verify gate (needs backend): confirm the gauge/breakdown render as percentages on a scored job. Prior branch (merged): E + D from the apply-wizard audit - audit items E + D from the MyJob apply-wizard review (PR #101 with the first batch already merged to`main`as`bb3d006`). **E (one doc per job, ADR-0003):** `createCvDraft`/`createCoverLetterDraft`reuse the application's already-linked document id, so a first tailor and every retailor/regenerate update the same library row instead of stacking duplicate "<Company> - Tailored CV"/"- Cover Letter" entries; the auto-create on entering the Review Documents step is removed, so the CV is written only on an explicit Create/Regenerate click. **D (wizard progress persistence):** a new`WizardProgressService`records`{jobId, step}`in sessionStorage; JobsComponent writes it on open + every step change and clears it on completion/close;`restoreWizardProgress`re-opens the wizard at the left-off step on return to`/jobs/:id`(token-free - no auto-rescore); a floating "Finish tailoring" button in the shell returns the user to an unfinished session from any page and hides on that job's own page (browser-verified: shown on /documents and /jobs/999, hidden on /jobs/123). Recorded the one-doc-per-job rule as **ADR-0003\*\*. Desktop 532 tests + build green; the 5`my-jobs.component.html`lint errors stay pre-existing. Known limitation (RESOLVED on`feat/defer-docs-to-export`, see top): true "persist only at final Apply" was not done - the wizard's own Review/Final-checks/Export steps need a saved doc, so ADR-0003 (one-per-job, update in place) was the resolution rather than a draft-until-apply layer. The draft-until-apply layer now exists via the `is_application_draft` flag: docs are still saved (so Review/Final-checks/Export keep their id) but hidden from the library until committed at Export & Apply. The Profile page was rebuilt to match its guided redesign (PR #100, visual/copy only). The scoring card reports staleness by hash rather than by "is the form dirty", and the Experience field admits it holds Markdown (PR #98). The First-Run Onboarding Wizard (§17) has been audited end to end (PRs #93, #95), the PDF text-layer ligature corruption is fixed on both export and import (PR #94), and the profile↔onboarding markdown format no longer loses the user's contact details (PR #97). Documents CV & Cover Letter Library (§16) is fully shipped and extended; the wizard hands off into it.
- **Recently completed**:
  - Profile compensation target (min / max / currency / period) in Form mode, plus a salary-fit badge (Above / In range / Below target, or "Salary not stated") on Discovery and job detail comparing a job's JD-detected advertised salary to the target (yearly and monthly pay recognized; never shows a misleading badge) - built post-0.25.0 on `feat/profile-compensation`, core + desktop suites, eslint, and AOT build green, not yet merged to `main`.
  - Profile editor structured Form mode: Experience (role, company, dates, bullets), chip-style Skills, and Language + level editors, each in a collapsible section, plus an AI "Parse text" flow in Raw Markdown mode (preview-then-apply, new `profile-import` skill) - built post-0.25.0 on `feat/profile-structured-editor`, core + desktop suites and eslint green, not yet merged to `main`.
  - Profile page rebuilt to match the guided redesign - merged PR #100, visual and copy only, zero logic change (every signal/method/data path identical, so #97/#98 tests carried unchanged). Implements the designer's updated `ProfileGuided.dc.html`: AI tools now read as cards with an accent icon tile (scoring = collapsible sparkles header → summary → footer Regenerate + the 3-state freshness chip with icon+hint; pitch = mic header with in-header Regenerate), both showing a live `applye-ai-pulse` indicator while generating instead of a silent disabled button; target-role cards are one row (target icon · name · fit · ghost remove) with the sellWhen note indented beneath, on a sunken surface; dashed add buttons; header shows inline unsaved/saved status + icon buttons; Experience label carries its Markdown hint inline; inputs + raw editor moved onto `--surface-sunken`/`--radius-input`; completeness improve-chips dashed. Deliberately NO in-page `<h1>`: the shell topbar already renders the page title via `PageTitleService`, so the mock's standalone-screen title would duplicate it (the mock's sidebar and theme toggle are app chrome, not this page). Section copy fixed: the stale "1-5 one-sentence descriptions" archetype framing (which never matched the shipped card UI) now describes archetypes (name + fit + when to pitch), EN + DE; new i18n `stale_hint`/`unsaved_scoring_hint`/`scoring_loading`/`pitch_loading` both locales; `archetype_sell_when_hint` reworded off a banned em dash. `aif-code-reviewer` caught one regression and it was fixed: on a save failure `dirty()` stays true and shadowed the error branch, so the header showed "unsaved changes" instead of the inline error `main` showed - the error branch is now ordered first. New `--dur-ai-pulse` token + local keyframe, gated behind `prefers-reduced-motion`. Browser-verified (header, hero, populated archetype card, full contact form, both AI cards render as designed; the web-only dev server's "tauriInvoke outside Tauri context" load error is expected, not a regression). Desktop 526 + i18n parity + build green; the 5 lint errors stay pre-existing in `jobs`/`cv-content.util.spec`. NOT verified: no desktop build - the populated states (scoring summary, pitch prose, live pulse during a real generation) render only with a backend; joins the manual Tauri gate.
  - Scoring staleness is a hash question, not a dirty-flag question - merged PR #98. The scoring card computed freshness as `!!scoringJson && !dirty()`, where `dirty()` only means "the form differs from what was loaded". Saving an edited profile cleared `dirty()` without regenerating anything, so the card resumed claiming `cached · 0 tokens` at exactly the moment the artefact went stale - the one state in which the user most needs to be told otherwise. The hash comparison already existed but lived inside `generateScoringProfile()`, firing only after the user had already decided whether to spend the call. Freshness is now `savedMdHash` (hash of the saved `fullMd`) vs `scoringHash` (hash the artefact was built from); `hashText` is a Tauri IPC call and cannot sit in a `computed()`, so the hash is refreshed at the three points the saved markdown moves: load, save, generate. The rule is extracted to `libs/core` as `scoringState()` beside `profileCompleteness()`/`missingFields()` - cache validity is domain logic, and pulling it out of the component made it testable without a TestBed. An unknown hash on either side resolves to `fresh`, never `stale`: an unknown must not push the user into a paid regeneration. `dirty()` split into `mdDirty()` + `archetypesDirty()`, with scoring keyed off `mdDirty()` alone, since archetypes never enter `fullMd` and so cannot stale it. Experience is now monospaced with a Markdown hint (variant B, user's call): the field is a raw blob by design (`parseProfileMd` assigns the section body verbatim, line 224) and the only writer emits `### Role - Company`, so the headings were never damage - the field was just lying about what it holds. The hint deliberately names no heading format, because nothing parses or enforces one. `aif-code-reviewer` then found the rule was right and the wiring was wrong, which is the more useful half: `savedMdHash` was maintained by hand at three call sites, and two _other_ writers of `fullMd` were missed, each reintroducing the original bug through a different door. `generatePitch()` persisted `fullMd` without refreshing the hash, so generating a pitch over an unsaved edit made the row change while the hash did not - chip back to "cached" over a stale artefact. `generateScoringProfile()` hashed before the AI round trip but upserted `this.fullMd()` read after it, persisting text nothing had analysed under a hash of text nobody has. Both are now unrepresentable rather than patched: `persistProfile()` is the single writer and owns the hash refresh, and both generators capture the markdown before their first await and persist that, so row, hash and artefact always describe the same text. Save and generate are mutually disabled while either is in flight. The reviewer's sharpest point was that the pure rule was well tested while every finding lived in untested wiring, so both bugs would have shipped green: `profile.component.wiring.spec.ts` now drives the real component against a `DbService` stub that echoes the whole-row replace, and is mutation-checked three ways (dropping the refresh, reading `fullMd()` post-await, and reverting `generatePitch` to its original shape each kill exactly one named test). Core 67 → 75, desktop 519 → 526, build green; the 5 lint errors stay pre-existing in `jobs`/`cv-content.util.spec`. NOT verified: no desktop build - see the manual gate below.
  - Profile contact block + markdown round-trip - merged PR #97. Found by inspecting the shipped Profile page against the `Profile Redesign.dc.html` mock: "Current role" showed a phone number. Not cosmetic. `cvToProfileMarkdown` (onboarding) and `parseProfileMd` (`libs/core`) were a writer and a reader of the same format that had never agreed: the writer emitted `# Name`, an italicised `_Title_`, then one middot-joined contact line (`email · phone · address · website · linkedin`); the reader took line 2 as `Title · Location` positionally and dropped every header line after it. So the phone became the job title, and email/website/linkedin - which `ProfileForm` had no fields for - were deleted from `fullMd` on the first Save in Profile, since the form rewrites the whole document from its fields on every keystroke. `fullMd` feeds all scoring and tailoring, so the loss propagated to every AI call. Fix: `ProfileForm` gains `email`/`phone`/`website`/`linkedin`; location moved off the positional title line into a labelled `## Contact` block (a label cannot slide, a position can); the parser still reads both legacy shapes and heals them on open, so no DB migration is needed - the first Save writes the canonical form. The deeper defect was structural and found by `aif-code-reviewer`, not by the first cut: parsing a legacy profile is classification, and classification without an overflow bucket deletes whatever it cannot name. Five further loss paths existed (a mixed `Title · Location · Phone` line silently ate the location; a second website; unknown `- GitHub:` lines under `## Contact`; an empty name promoted the title into the name slot; `URL_RE` matched any dot-suffixed token and swallowed `Growth Lead @ acme.io` whole). All now spill into one `notes` bucket re-emitted under `## Notes` - always under a heading, never as a bare block, which would be re-read as the last section's body. The test that matters is the invariant, not the instances: `serialize(parse(md))` drops no non-whitespace token, and reaches a fixed point after one save, over a corpus of six real legacy shapes. Mutation-checked twice (disabling legacy recovery kills 2 tests; emptying the overflow bucket kills 6). One regression caught by the existing onboarding suite mid-work: always emitting the `#` anchor made an empty parse look like content and defeated the wizard's "nothing to save" guard - `cvToProfileMarkdown` now returns `''` for an empty parse and anchors only when there is something to write. 67 core + 519 desktop tests + build green; the 5 lint errors stay pre-existing in `jobs`/`cv-content.util.spec`. NOT verified: no desktop build - the repair path (open a profile imported before this fix, confirm the phone leaves "Current role" and the website/LinkedIn appear) is a manual gate.
  - Onboarding Ready step: one way out - merged PR #95. The step offered "Analyze a job" and "Open documents" beside "Finish setup" - three ways to end one flow, and the two CTAs left via `finishTo(path)`, which saved and then navigated. User call, and correct: Finish is the only action, the wizard closes onto whatever route is behind the overlay (dashboard on a first run, the page a re-run was opened from), and the app's own navigation owns the destination. `finishTo()`, the `Router` injection, the `ScanLine` icon, `.ob__cta-row` and the `done.cta_job`/`done.cta_docs` keys all died with the CTAs and are removed. Copy fixed while here: `done.body` said "Here's what we saved locally" on a screen where nothing is saved until Finish - it now says what finishing will save. Two tests added: finish() writes profile + CV, marks `onboardingSeen`, emits `completed`; and finish() navigates nowhere. The second is behavioural (spies `navigateByUrl`) rather than asserting `finishTo` is absent - the first cut asserted the absence, which bit under mutation but is brittle to a rename. Both mutation-checked. 515 desktop tests + build green; the 5 lint errors stay pre-existing in `jobs`/`cv-content.util.spec`. Pending: the same manual Tauri gate.
  - PDF export/import ligature corruption: merged PR #94. Found while investigating a mis-parsed job title on onboarding import; the parse was faithful and the PDF was ours. Every PDF the WYSIWYG print path exports carries a broken text layer: macOS builds `/ToUnicode` one entry per glyph, and a ligature glyph (`ft`, `ti`, `fi`, `fl`) represents two characters and has no single codepoint, so macOS emits an arbitrary wrong one. "Software" → "So+ware"/"SoCware", "Analytics" → "AnalyGcs", "applications" → "applicaMons". Severity is high and not about import: an ATS, a recruiter's parser, and plain copy-paste all read the broken text out of a CV that looks perfect. Fix is one rule in the shared `paper-light` mixin (`font-variant-ligatures: none` + a restated `font-feature-settings` - the app shell sets `'cv11','ss01'` on `body` and it inherits, and per spec `font-feature-settings` overrides `font-variant-*` per feature). It lands in `_paper.scss` because that mixin is the existing screen == print contract, and it covers all four include sites (on-screen page cards + the three print blocks). Diagnosis is doubly evidenced: (1) in `vitalii_kasap.pdf` (`/Creator (Applye)`) two distinct glyph codes claim the same character, and the impostor's `/Widths` entry equals the sum of the two letters it really draws (Lato-Bold `ft`→'+'/'C' at 685 vs f+t 710; Lato-Regular `ti`→'M' at 616 vs t+i 599); pdfminer.six reproduces the corruption independently, so `pdf-extract` is not at fault; (2) a browser probe over the same bundled `Lato-Regular.ttf` shows the rule makes every pair render at exactly the sum of its separate glyph advances, with an `xx` control unchanged - and the measured ligature/sum ratios (0.965 for `ft`, 1.029 for `ti`) match the PDF's width ratios (0.965, 1.028) to three decimals. NOT verified: the actual re-export - that macOS then writes a correct per-character `/ToUnicode` is a sound inference (every non-ligature glyph in the current file maps correctly) but only the manual Tauri gate proves it. Untestable at unit level (a CSS rule); the gate is the test. Import side: third-party macOS PDFs (Pages/Word/Preview) hit the same bug, so the export fix alone leaves every resume the user did not export from Applye broken on import. Deterministic repair was rejected - a character map (`'+'`→`ft`) cannot tell an artefact from a legitimate `C++`/`ES6+`/`GfK`. Instead `cv-import.md` gained a narrow rule: repair only inside a word, only when the surrounding letters are unambiguous, with an explicit never-touch list, plus one `lowConfidenceNotes` entry whenever it fires so the Review step surfaces it. This is the skill's single exception to "extract, never invent" and the frontmatter description now says so. `skills.rs` had NO tests despite a naive frontmatter parser; it now has 6, including `every_registered_skill_renders` and a mutation-checked guard on the never-repair list. Note: a mutation adding a colon to the folded description did NOT break parsing (the parser just collects a junk key), so the frontmatter test's original rationale was wrong and its comment was corrected rather than left overclaiming. Skill `version` deliberately not bumped: nothing reads it for cache invalidation and the repo's own convention is inconsistent (`1` vs `"0.1.0"`); `cv-import` has no response cache - `cv-list.component.ts:214` is a dedup that skips re-import, not a cached parse. 143 Rust tests + 481 frontend + clippy/fmt green. Residual: the AI repair is best-effort and non-deterministic, with the Review step as the safety net.
  - Onboarding flow polish: merged PR #93. Seven flow defects in the shipped wizard, all fixed with tests: (1) `suggestArchetypes()` advanced the wizard from its own `finally`, so the Targeting step's "Suggest again" button teleported the user to Ready - advancing now lives in `goNext()`; (2) re-suggesting `set` the archetypes signal, wiping hand-typed roles and re-checking unchecked ones - the first suggestion now seeds, later ones only add roles absent from a new `rejectedRoles` set, and a hand-edited comp range is guarded by `compTouched`; (3) skipping the resume still landed on an empty Review step - it now jumps 2 → 4, and Review is unreachable via `back()` and the stepper unless a CV was parsed (`hasReview`); (4) `keyStatus` was session-only, so a re-run with a key already in the keyring reported "Not connected" on Ready; (5) the Continue button stayed live during the parse/suggest AI call, so a double-click ran two paid calls and advanced twice, skipping Review or Targeting entirely - Continue/Back now bind to a `busy()` guard and Continue renders `parsing()`, which the template had never shown; (6) choosing "skip" (or editing the pasted text) after a successful parse left `parsedCv` intact, so `saveProfile()` wrote the walked-away-from resume while Ready said "Skipped" - any change to the resume source now calls `discardParse()`; (7) a failed or mistyped key paste reset the wizard's knowledge of a key that was still in the keyring. Defects 5-7 were caught by `aif-code-reviewer` on the first commit; 5 and 6 pre-dated this branch, 7 was introduced by the first cut of the fix for 4. That review also found the first fix for 2 still re-checked unchecked roles whenever the selection was empty, and that two of the new tests encoded the bug as expected behaviour. Architecture note from the review, applied: user intent (rejected roles, chosen skip path) is now tracked explicitly rather than inferred from derived state (`archetypes().length`, `resumePath`), mirroring `compTouched`. Key status split in two: `keyStatus` is input feedback only, `keyStored` is the keyring's answer, and only `keyStored` drives `keyPresent()`/the Ready summary. Honesty pass: the key step said "Validate" / "Key valid" while only checking length + `sk` prefix - copy now says save, since nothing contacts the provider API. Dedup: `ai.intro` rendered twice on the AI step (subtitle + panel), and the coming-soon note was prefixed with the stray `onboarding.step` key ("Setup -"). Skip is hidden on the last step, where it sat beside Finish and discarded the profile. `preview.help` was written but never rendered - now shown, and reworded to match reality (contacts editable; experience/skills read-only, refined later in Documents). Eight dead i18n keys removed EN+DE (`title`, `step`, `welcome_title`, `welcome_privacy`, `ai.provider`, `ai.key_label`, `ai.saved`, `resume.parse`, `resume.parsing`), one added (`working`); `ru/es/fr/uk` are `stub(en, …)` and inherit automatically. New `onboarding.component.spec.ts` (24 tests) covers every fix and was mutation-checked - reverting the busy guard, the re-suggest branch, or the skip discard each turns it red. Deliberately NOT changed: the comp "slider" is a 6px fill bar with no thumb or pointer cursor - a range visualisation, not a broken control. Known gaps the review flagged and this branch does not close: no test renders steps 0-4, so a broken template binding in a step body would still pass CI; `parseResume()` still advances the step itself (single call site, guarded by `busy()`). Deferred: a real provider ping to validate a key (the format check plus first-AI-action failure is the honest interim). **Re-run audit (second pass, prompted by the Profile → "Re-run onboarding" entry point):** `db_upsert_profile` is a whole-row replace - a field omitted from `ProfileInput` deserialises to `None` and is written as NULL, not preserved. `profile.component.ts` always passes all five fields; the wizard passed two, so finishing a re-run silently NULLed `scoring_json`, `scoring_hash` and `pitch_md` - two paid AI artefacts destroyed. `saveProfile()` now reads the existing row and carries them forward (stale scoring is safe and intended: `scoringHash` stops matching the new `fullMd`, which is exactly how Profile at line 980 knows to offer a re-score). The wizard also opened blank on a re-run, so Finish wrote `[]` over the user's archetypes - the constructor now seeds them via `archetypeNames(parseArchetypes(...))` (the profile stores `Archetype` objects; the wizard is `string[]` by design), and `hasSuggested` became `selectionSeeded` so a resume-driven suggestion adds to seeded roles instead of replacing them. `saveProfile()`'s `if (!base) return` made a targeting-only re-run a silent no-op; it now keeps the existing `fullMd` and writes the roles, and only skips the write when there is genuinely nothing (no parse, no prior profile, no roles). Verified non-issues: `app.ts` gates the wizard behind `@else if`, so a re-run gets a fresh component and re-reads the keyring; `saveCvDocument()`'s `inputHash` guard already prevents a duplicate CV on re-import. 513 desktop tests + build green (the build is what type-checks - jest does not, and it was the tests that caught the `Archetype[]` vs `string[]` seed mismatch); the 5 lint errors are pre-existing in `jobs`/`cv-content.util.spec` and match `main`. Pending: manual desktop (Tauri) gate - the re-run path (finish a re-run over a scored profile; confirm scoring/pitch/roles survive) is now the highest-value case in it.
  - Onboarding writes a real CV, not just a profile: the wizard already parsed the resume into the exact shape Documents stores, then discarded it and left the user to import the same file a second time. `saveCvDocument()` on finish now writes the CV document too, reusing `buildCvContent` and mirroring the eight fields `cv-list`'s `confirmImport` writes. Region template follows the UI language (`de` → DE templates, else `generic`) - no region selector in the wizard, since a first-run flow pays for every extra choice in drop-off. Review-step contact edits resolve through one shared `applyContactOverrides` for both artifacts, so a field the user cleared for privacy can no longer survive in the CV while the profile drops it. Fail-open (a CV must never trap the user in onboarding) but now visible: `console.error` + toast pointing at Documents → Import. Re-running over the same file skips rather than stacking copies; the pasted path carries no hash and so is unguarded (accepted). Merged PR #89. Pending: manual desktop (Tauri) gate - upload → parse → review edit → finish lands an editable CV with the right template; DE UI picks a DE template; a re-run adds no second copy.
  - Plan Check rule: `AGENTS.md` now requires locating a task in the plan and reporting a stale `CURRENT_STATE.md` before starting, and syncing this doc + `[Unreleased]` on the way out. Merged PR #88.
  - Cover letter silent WYSIWYG PDF engine + export unification: cover letters export via the hidden-window print engine (PRs #85, #87); DOCX removed from every cover-letter UI surface (list + jobs wizard) to match cv-list's PDF-only policy. The Rust DOCX renderer survives only as the non-macOS PDF fallback. Live-style panel scopes corrected for titles, body text, and experience entry lines (PR #86).
  - CV live-preview editor (Phases A-D): the CV detail view now edits directly on the paginated preview. In Preview mode every page-card leaf (summary, personal details, experience, education, skills, languages) is a click/keyboard-selectable region; selecting a body region mounts a native input/textarea inline editor, and selecting any region opens a fixed contextual "live style" side panel (font/size/weight/colour + body-only line-height + reset). Editing is draft-local and commits on blur/Enter only when the value actually changed; commit emits one immutable `CvSection` up to the single shared `sections` signal, so Edit-mode form and Live preview stay in sync with no save/reload. Structure changes (add/remove/reorder sections, photo, toggles) stay in Edit mode. Keyboard-hardened: Enter+Space activation with native-button parity, accessible names + `:focus-visible` on every selectable host, autofocus into the editor on select, Escape discards the draft, Enter returns focus to the host. Print/export is committed-only: the Export PDF action commits the active draft, drops all editor chrome, and awaits a stable render + fresh pagination pass before printing; a direct OS/browser `Cmd/Ctrl+P` (`beforeprint`) reveals last-committed text and discards the uncommitted draft. New optional `CvSectionStyle.lineHeight` (body scope, 1.0-2.0, unset preserves the per-element baseline). LIMITATION: line-height and live-panel styling are Angular preview + WYSIWYG print→PDF only - the Rust DOCX / list-view PDF exporters ignore `lineHeight`; full export parity is Phase E. Pagination is unaffected by drafting (the hidden measure pass always renders committed text); LaTeX was fully removed in Phase A. Branch `feat/cv-editor-preview-refactor`. Pending: manual desktop (Tauri) gate (keyboard-only select/edit/style across all families; Classic+Aurora, A4+Letter multi-page repagination after commit; narrow-width panel; export/print contains no editor chrome; save/reload preserves content + overrides + line height). [Spec](../superpowers/specs/2026-07-12-cv-editor-preview-refactor-design.md)
  - CV live-preview editor - per-element styling & Edit-mode reduction (Phase D.2): every selectable preview leaf (each experience field, each skill label/values, each language value, personal-details fullName/title, summary, section titles) is now independently styleable at THREE scopes via the live-panel scope selector - **this element** → **this section** → **whole document** (titles: **this title** → **all titles**), cascading element → section → document → active theme, most-specific wins. New additive `CvStyle.elementStyles?: Record<string, CvElementStyle>` keyed by a stable positional path (`summary.body`, `experience.1.role`, `skills.0.values`, …) shared with the existing inline-edit draft ids - no content-model migration, no accent-colour leak (unset body colour still inherits the theme, never the accent). The per-leaf style renders as inline CSS in BOTH the hidden measurement pass and the visible page render, so a size/line-height change on a single element still repaginates correctly. Edit mode lost its document-wide BODY TEXT and SECTION TITLES style groups entirely (superseded by the panel); it now shows only the page group (size/margins) and the region/photo/include toggles. "Reset all styling" relocated from Edit mode into the live panel's footer (clears element + section + title + document-body overrides, leaves page/content untouched). Hardening: every per-leaf selectable host now has a field-specific accessible name (e.g. "Experience - Company" / "Experience - Role", not a shared generic "Experience - Body text"); the panel's scope `<select>` carries an explicit `aria-label` alongside its visible label. LIMITATION: `elementStyles` is Angular preview + WYSIWYG print→PDF only - Rust DOCX/list-PDF export ignore it (same Phase E deferral as `sectionStyles`/`lineHeight`). Known accepted gaps: resetting a section-title's "this title" scope leaves any explicit `titleBorder` override intact (border resets only via document/all-titles scope or reset-all); combined resting spans - the personal-details contact line, an education entry's degree/institution, and either entry's date range - are not yet individually style-selectable (only the ~11 leaf families listed above are). Branch `feat/cv-editor-preview-refactor`. Pending: manual desktop (Tauri) gate (cascade precedence across all three scopes; per-section title vs. all-titles; Classic+Aurora/A4+Letter repagination on a per-element size change; Edit mode shows only page+region; save/reload round-trips every override tier; export/print has zero interactive chrome). [Spec](../superpowers/specs/2026-07-13-cv-live-editor-per-element-styling-design.md)
  - CV inline bold: bold important words in the CV summary and experience bullets via `**word**` markdown-style markers (no schema change, back-compat - `parseInlineEmphasis`/`parse_inline_runs` yield one plain run when there's no `**`). Editor: a Bold button plus Cmd/Ctrl+B on the summary textarea and each bullet input (`toggleBoldWrap` in `libs/core`). Preview: summary now renders `**bold**` as `<strong>` (bullets already did). Export: inline bold in DOCX and LaTeX (`.tex`) via `parse_inline_runs` in `tailoring.rs`; the detail-view Export PDF picks it up automatically since it prints the HTML preview. Deferred: the legacy list-view Export as PDF (Rust `printpdf`) still shows literal `**` - the detail-view Export PDF covers the real need. Branch `feat/cv-theme-engine`. [Spec](../superpowers/specs/2026-07-12-inline-bold-design.md) · [Plan](../superpowers/plans/2026-07-12-inline-bold.md)
  - CV visual-theme engine: declarative, sandboxed `CvThemeDescriptor` layer (`libs/core`, pure data) separate from content layout (`CvTemplate`) and user style overrides (`CvStyle`). Two built-in themes: Classic (id 1, current look, byte-identical) and Aurora (id 2 - teal accent `#1B7464`, uppercase ruled section headers, two-line experience entries with optional industry, Lato). Storage: migration `0014_cv_themes` (themes table + `document_library.theme_id`, additive/back-compat, absent → Classic); Rust `validate_theme` command is the sandbox gate for future uploaded themes. Themed surfaces are the Angular preview + WYSIWYG print→PDF only; DOCX/LaTeX themed export, theme upload UI, and marketplace are deferred (seams left: disabled "Import theme…" button, `validate_theme`). Descriptor fields `header.contactLayout` and `bullets.marker` are validated + seeded but not yet consumed by the renderer - contact lines are pipe-joined and bullets render as discs for all themes today; the fields are reserved for future themes. Theme picker lives in the CV detail Style card; switching reseeds base tokens (accent/font/size/weight) without wiping per-section overrides. Branch `feat/cv-theme-engine`. Pending: manual desktop (Tauri) gate to visually confirm preview/print fidelity for both themes. [Spec](../superpowers/specs/2026-07-12-cv-theme-engine-design.md) · [Plan](../superpowers/plans/2026-07-12-cv-theme-engine.md)
  - CV photo header placement: 3 slots (Left/Center/Right, `above_left`/`above_center`/`above_right`, default `above_left` for back-compat, no migration); float-beside for left/right (photo + name/contact side-by-side), centered block for center; rendered in paginated preview (CSS float in header atom), WYSIWYG print PDF (inherits float), DOCX export (borderless 2-cell table for left/right, centered paragraph for center); CV only (list-view Rust-PDF export centers for `above_center` but approximates `above_left`/`above_right` as top-of-document - printpdf float-beside is intentionally not built; the detail-view WYSIWYG Export PDF is full-fidelity for all three slots). Branch `feat/photo-placement`. [Spec](../superpowers/specs/2026-07-10-photo-placement-design.md) · [Plan](../superpowers/plans/2026-07-10-photo-placement.md)
  - Discrete page-card preview: CV & cover-letter previews now render real separate white page cards captioned "Page i of N", content split at entry-level atoms (section titles glued to first entry, no block cut mid-page), always-white paper in both themes, print stays WYSIWYG via native `@page` flow; shared `PaginatedSheetComponent` + pure `paginate()` in `libs/ui`. Branch `feat/preview-page-cards`. [Spec](../superpowers/specs/2026-07-09-preview-page-cards-design.md) · [Plan](../superpowers/plans/2026-07-09-preview-page-cards.md)
  - WYSIWYG preview → export: CV & cover-letter previews are now real fixed-proportion A4/Letter sheets with dashed page-break guides + page-count; margins are four numeric mm inputs (0-50, clamped, legacy preset→mm on read) with an overflow warning; PDF export is WYSIWYG via the preview (system print → Save as PDF), print styles pinned to light paper colours regardless of app theme; DOCX honours 4-side mm margins; list-level PDF option removed (DOCX/tex stay). Branch `feat/wysiwyg-preview-export`. [Spec](../superpowers/specs/2026-07-09-wysiwyg-preview-export-design.md) · [Plan](../superpowers/plans/2026-07-09-wysiwyg-preview-export.md)
  - CV photo upload: pick/crop (3:4) a local photo, preview render when "Include photo" is on, base64 stored in the CV document, embedded in DOCX + PDF export (LaTeX omits). Branch `feat/cv-photo-upload` (merged, PR #62). [Spec](../superpowers/specs/2026-07-09-cv-photo-upload-design.md)
  - CV builder - per-section style constructor (Wave B): font/size/colour/weight settable per section (Personal Details, Summary, Experience, Education, Skills, Languages) via an inline "Style" popover, inheriting from a global default with "reset to common"; new global font-weight control (Light/Normal/Semibold/Bold); editor shell reconciled to the design mock (`CV Editor.dc.html`); Rust `check_style_safety` extended to check per-section overrides. Merged PR #60 → `main` (`2912bd2`). Style is now also honored in export (branch `feat/export-style-parity`): library CV & cover-letter DOCX/PDF render from a shared section-tagged block model that applies per-section/per-paragraph font/size/colour/weight and keeps the two formats in lockstep; PDF photo moved to an inline top box matching DOCX. Known follow-up: PDF approximates custom fonts via the 14 base fonts (DOCX keeps the exact name) - embed TTFs for exact PDF fonts. Includes a same-day follow-up fix: preview mode now fills the full pane and hides editor-only controls (region/toggles/style), edit mode no longer reserves dead space for a preview column. [Brief](feature-briefs/documents-cv-cover-letter.md)
  - CV builder - default template rebuild + Wave A blocker fixes: all built-in region templates now guarantee a Personal Details section (migration `0013`); add/remove Experience & Education entries and bullets; fixed AI-import truncation (configurable token cap + JSON repair, `cv-import.md` schema synced); profile↔CV field propagation (title/website/LinkedIn, "pull from profile" action). Merged PR #59 → `main` (`ace5986`). [Brief](feature-briefs/documents-cv-cover-letter.md)
  - First-run Onboarding Wizard: a skippable first-run overlay gated in `app.ts` after the health-check via a new `settings.onboardingSeen` flag (migration `0012_onboarding_seen.sql`). Steps: Welcome → AI-setup (per-provider key guide + keyring via `KeysService`) → Resume input (PDF/DOCX + paste, reuses `cv-import`) → Preview (editable profile markdown) → Archetypes+comp (new `onboarding-archetypes` skill, suggestion-only, user confirms) → Done (CTAs route to `/jobs/new` and `/documents`). Writes the existing `Profile` schema (`fullMd` + `targetArchetypes`), all local, key stored in the OS keyring. Adds a dashboard `OnboardingBannerComponent` and "Re-run onboarding" entry points in Settings and Profile. i18n EN+DE throughout. Merged, v0.22.0.
  - Step 1 / phase 1c - Documents Cover Letter module: Split editor (structured block editor on the left with block-level AI regeneration and caching, live business letter layout preview on the right), list view matching the CV library design, and Job Detail tailoring integration (body-only rewrite via new `cover-letter-tailor` skill, linking tailored letter to the application, and seamless navigation). Registered new prompt skills (`cover-letter-generate` and `cover-letter-tailor`) in the Tauri backend. Merged, v0.22.0.
  - Step 1 / phase 1b - Documents CV module: real Documents sidebar with CV | Cover Letter tabs, CV list + detail, import own CV (`cv-import` skill), generate baseline (`cv-generate-baseline` skill), CDK drag-drop section constructor with field toggles + non-blocking ATS-risk notes, per-section regenerate cached by input hash, save-as-custom-template. **1d folded into the same branch**: style section (font/size/accent colour) with always-on recommended-value hints and a deterministic `check_style_safety` check, plus DOCX/PDF/LaTeX (`.tex`, never compiled) export with the DE `Lastname_Vorname_Lebenslauf` filename convention. Merged PR #52, v0.21.0. [Brief](feature-briefs/documents-cv-cover-letter.md)
  - Step 1 / phase 1a - Documents data layer: migration `0011_documents_library.sql` (`document_library` + `cv_templates`, nullable `applications.cv_document_id` / `cover_letter_document_id`, built-in templates seeded), Rust commands + `libs/core`/`libs/data` types. Merged PR #51, v0.20.0. [Brief](feature-briefs/documents-cv-cover-letter.md)
  - Step 2 - Follow-up Message Drafting: "Draft follow-up" action on overdue Pipeline cards, cached AI draft, `mailto:` hand-off only. Merged PR #50, v0.19.0. [Brief](feature-briefs/followup-drafting.md)
  - AIF Core foundation for AI-assisted development (Cursor rules, model policies, security/privacy trust docs, context gate, keyring and token guards, CLI routing).
- **Currently working on**:
  - **Analytics screen (COMPLETE - merged #121 v1 / #122 / #123 / #124)** - the `analytics` route stub (`common.coming_soon`) is now a full screen, built from the Claude Design handoff `Analytics.dc.html` (project `0bad163c`; brief `docs/design/analytics-screen-prompt.md`). Architecture: a thin Rust command `db_analytics_facts` (`commands/analytics.rs`, registered in `lib.rs`) returns one enriched row per application (`status`, `appliedAt`, `savedAt` via `status_history`, `reachedInterview`/`reachedOffer` via history + `interview_stages` EXISTS, `archived`) plus raw `followup_drafts` timestamps - all aggregation lives in a pure, tested `libs/core` module `computeAnalytics(facts, period, now)` (mirrors the repo's `scoringState`/`reportFit` pure-fn convention). The Angular `AnalyticsComponent` (standalone, OnPush, external template/scss) loads facts once and switches period client-side with no round-trip. **Screen:** a period selector (30d/90d/all-time) filtering everything; a 4-tile KPI row (applications sent, response rate, interviews, offers) with signed vs-prev-period deltas and real per-bucket sparklines; a cumulative **application funnel** (SAVED = all entered · APPLIED = `applied_at` set · INTERVIEWING = reached interview · OFFER = reached offer) with stage-to-stage conversion %, guaranteed monotonic (an offer implies interview, enforced in both SQL and TS); a **leakage** bar (rejected + cancelled); and a terminal-native **applications-over-time** trend (thin indigo SVG line + faint area, muted follow-ups overlay, Intl-localized axis ticks, per-day/week/month bucketing by period). **States:** loaded, skeleton, empty (zero applications → calm "no data to analyse yet" + Add-a-job CTA), and **low-data** (< 5 applied in window → rates show "-" + honest notes, raw counts still flow). No charting library, no external/benchmark data (privacy-first); follow-up series = drafts generated (Applye never sends mail, honest caveat). **Eight blocks shipped:** the v1 spine (period selector, KPI row, funnel + leakage, applications-over-time) plus **match-score distribution** (5-band histogram + median + scored/unscored), **score-vs-outcome** (avg score by offer/interview/no-interview), **time-to-response** (median days applied→first interview/offer transition + day-band histogram), **pipeline aging** (active apps' days-in-current-status, stale >14d in amber), and **where-you're-applying** (top locations). Backend `db_analytics_facts` grew `score` (latest `scoring_cache`), `first_response_at` (earliest interview/offer `status_history` transition), `status_changed_at` (latest transition), and job `location`; all still aggregated in the pure `computeAnalytics`. **Salary** and **top companies** were deliberately declined: `applications.salary_range` is free text and mostly empty (unparseable → a chart would over-claim); companies carry ~one application each (no signal). Companion pure fns added: `scoreDistribution`, `scoreOutcome`, `timeToResponse`, `pipelineAging`, `topLocations`. New i18n `analytics.*` (en+de; ru/es/fr/uk fall back to en, matching tracker/interview). **Verified:** core 21/21 + Rust `analytics` 9/9 + i18n parity + desktop AOT build + eslint (touched) green across all four PRs; browser-verified every card (loaded / empty / low-data / stale / unknown-location) in both themes via temporary sample-data feeds (reverted each time). **Merged to main** across #122 (dist + outcome) / #123 (time-to-response) / #124 (aging + locations); v1 rode into main inside the parallel dashboard squash #121. Each increment was isolated onto its own branch via a git worktree so the parallel Discover/dashboard session's working tree was never disturbed. **Remaining:** the standing manual Tauri gate (real Rust→TS→UI path with seeded DB data - web preview has no backend, so the live screen falls back to the empty state).
  - `pitch_hash` - the elevator pitch now has its own cache-freshness hash, on branch `claude/dev-continuation-e534pl` (not yet merged). Closes the #98-audit follow-up: the pitch cache was keyed on `scoringHash`, so regenerating the scoring profile advanced that hash and made a pitch written from older markdown report as "cached" (unrefreshable). New migration `0015_pitch_hash.sql` (additive `pitch_hash TEXT`), `pitch_hash` threaded through `profile.rs` (Profile/ProfileInput/SELECT/INSERT/bind), `pitchState()` in `libs/core` beside `scoringState()` (shared `artefactState` rule), a freshness badge on the pitch card (EN+DE `pitch_stale_hint`/`unsaved_pitch_hint`), and `generatePitch()` now keys its cache-check on `pitch_hash` and persists it. Whole-row-replace safe (#93 class): all four `upsertProfile` callers carry `pitchHash` forward - profile `save()`/`generateScoringProfile()`/`generatePitch()`, onboarding `saveProfile()` (re-run), and jobs `appendToProfile()` (gap-fill). `aif-code-reviewer` confirmed the column wiring is balanced and the carry-forward holds across all five callers; two of its notes were actioned - the Scoring and Pitch generate buttons now mutually exclude each other (a concurrent scoring+pitch run could persist a stale snapshot and revert the other artefact - pre-existing, but `pitchHash` now rides that window), and this note records the two it did not close. Core 80 tests (+5 `pitchState`) + desktop 546 (+5 pitch wiring, +1 onboarding assertion) + i18n/data green; desktop Angular build type-checks green. Known test gaps (deferred): (1) no Rust round-trip test for `db_upsert_profile` - `profile.rs` has no `#[cfg(test)]` module and Rust does not compile in this env, so it joins the Tauri gate; (2) jobs `appendToProfile` (gap-fill) has no `pitchHash` carry-forward assertion - there is no `JobsComponent` spec harness and standing one up for one assertion is disproportionate (onboarding's equivalent path IS asserted). NOT verified: Rust does not compile here (missing GTK `gdk-3.0`), so the migration + `profile.rs` changes join the manual Tauri gate - run a desktop build, generate a pitch, regenerate scoring, confirm the pitch reads "out of date" and regenerates rather than reporting cached.
- **Next recommended action**:
  - Profile follow-ups from the #97 audit are all landed. (1) Experience raw markdown and (2) the stale scoring badge shipped in PR #98; (3)/(4) resolved the other way round: rather than the code chasing a stale mock, the designer updated the mock (`ProfileGuided.dc.html`) and PR #100 implemented the code to match it - so the design↔code drift is closed and the earlier Claude Design write-grant blocker is moot (the mock is the designer's now, not something we edit). `Archetype` stays `{name, fit: primary|secondary|adjacent, sellWhen}` and carries no comp band; comp is dual-track work that has not landed.
  - Run a real desktop (Tauri) build and clear the accumulated manual gates in one pass - they are the only thing standing between the last several merges and "verified". Onboarding → CV handoff (§17→§16), CV live-style panel across all three cascade scopes on Classic + Aurora, A4 + Letter repagination, and PDF export from both the cover-letter list and the jobs wizard.
  - Phase E - export parity. `lineHeight` and `elementStyles` are Angular preview + WYSIWYG print→PDF only; the Rust exporters ignore them. Now smaller than originally scoped: cover-letter DOCX has no UI entry point left, so only the CV list-view PDF still needs parity (or removal, mirroring the cover-letter decision).
  - Dual-track archetypes + per-track comp (P1/M in [IDEAS.md](IDEAS.md) → the internal career-ops adoption analysis §4). The only P1 left in Needs Analysis; feeds the onboarding targeting step and the Layer-1 hard filter.
  - Not blocking, but nothing gates it either: CI does not exist (`statusCheckRollup` is always empty - every quality gate is local).
- **Active feature briefs**:
  - [Documents CV & Cover Letter Library](feature-briefs/documents-cv-cover-letter.md) - Step 1, shipped (1a-1d complete, plus two follow-on efforts: default-template/Wave A and per-section style/Wave B).
- **Blocked / open questions**:
  - None at present.
- **Important constraints**:
  - Do not use CHANGELOG.md as a backlog.
  - Do not edit root-level canonical documents for small feature iterations.
- **Files agents should check first**:
  - [PROJECT_CONTEXT.md](../internal/PROJECT_CONTEXT.md)
  - [CURRENT_STATE.md](CURRENT_STATE.md)
  - [AGENTS.md](../../AGENTS.md)
- **Last updated**: 2026-07-16 (`claude/dev-continuation-e534pl`: `pitch_hash` - the elevator pitch card gained its own cache-freshness hash and stale badge, unblocking the item PR #98 deferred. The pitch was keyed on `scoringHash`, so a rescore falsely reported an older pitch as cached with no way to refresh; it now carries the hash of the markdown it was written from. Additive migration `0015`, `pitch_hash` through `profile.rs`, `pitchState()` in `libs/core`, badge EN+DE, and all four `upsertProfile` callers carry `pitchHash` forward (#93 whole-row-replace class). Core 80 + desktop 546 + Angular build green; Rust does not compile in this env (no GTK) → migration/`profile.rs` join the manual Tauri gate. NOT merged. Earlier - `feat/cv-gap-fill-agent`: agentic gap-fill (Batch C) - before generating a tailored CV, an AI gap-analysis skill surfaces up to 5 questions about what the job needs that the CV lacks, a dialog collects answers (skippable, optional save-to-profile), and the answers fold into generation. Fail-open, CV-only. Built subagent-driven; 541 desktop tests + Rust 6/6 + build green. Earlier (PR #106): Batch A of the second apply-wizard review - base CV defaults to the profile (or the job's own tailored CV), generated-doc labels name the role, "Start over" actually restarts the flow, and opening the wizard while another job's tailoring is unfinished now warns first. Deferred: the agentic follow-up-questions window (Batch C). 532 desktop tests + build green. Earlier (PR #105): wizard cancel/nav/preview - apply-wizard refinements - a Cancel button on the Tailor step (stops the pass loop, discards partial work), the wizard Back button locked alongside Next while a step is busy, and "Review CV"/"Review letter" opening in preview mode. Closes the last MyJob-audit item (C-preview). 532 desktop tests + build green. Earlier (PR #104, §2): status source-of-truth - single source of truth (overview row mirrored from the DB-returned status), a real status dropdown on the job detail writing through the same command as the kanban, "Change status" renamed to "Edit" with a confirm when reopening an application past Applied, and a shared `APPLICATION_STATUSES` constant. 532 desktop + 75 core tests + build green. Earlier (PR #103): MyJob audit §3 - scoring collapses its 0-100 / 1-5 star / 1-10 scales into one percentage ("82 % match", per-dimension `score*10`%), removes the 5-star rating, and aligns dimension colour bands to the gauge's 75/50. 532 desktop tests + build green. Earlier merged (PR #102): apply-wizard audit items E + D. E - one CV and one cover letter per application (ADR-0003): create paths reuse the linked document id so retailor updates in place instead of duplicating, and the auto-create on entering the review step is removed. D - wizard progress persists in sessionStorage and a floating "Finish tailoring" button returns the user to the step they left, browser-verified. 532 desktop tests + build green. Earlier: PR #101 merged to `main` (`bb3d006`): first batch from the MyJob apply-wizard audit - the Tailored CV now structures into real sections via the shared `cv-import` path instead of dumping into Summary; Next/Continue is blocked while a step generates; final checks gated on a linked CV; loaders on the document buttons; redundant "Open full editor" removed; dashes normalized. Larger draft-persistence (E) and wizard-state-persistence (D) items follow separately. Earlier: PR #100 merged to `main`: the Profile page was rebuilt to match the designer's updated `ProfileGuided.dc.html` - visual and copy only, zero logic change. AI tools became icon-tile cards with a live generating pulse; target roles became one-row cards; the stale archetype copy was fixed; a save-error header regression the reviewer found was corrected before merge. This closes the design↔code drift, so the earlier mock write-grant blocker is moot. Earlier: PR #98: the scoring card asked "is the form dirty" when the question was "was this analysis built from the text we have now", so it started calling the analysis cached at the exact moment saving made it stale; freshness is now a hash comparison extracted to `libs/core`. Experience admits it is Markdown. The pitch card's stale badge is blocked on a `pitch_hash` column, tracked as its own item. Earlier entry: PR #97 merged: the profile form and the onboarding writer were two ends of one markdown format that had never agreed, so a phone number showed as the user's job title and the first Save in Profile permanently deleted their email, website and LinkedIn from `fullMd` - the text every AI call reads. Legacy profiles heal on open; no migration. Entry added beside the others, not over them - see the note below about #95.)
- **Previously updated**: 2026-07-16 (PRs #93, #94 and #95 all merged; `main` clean, zero open PRs. The onboarding wizard was audited end to end - ten flow defects including a data-losing re-run - and the PDF text-layer ligature corruption is fixed on export and mitigated on import. NOTE: #95's state-doc update overwrote #94's entry instead of adding to it; the entry above was restored from `29e0623`. Nothing here has been through a desktop build: the accumulated manual Tauri gates are now the only outstanding work and the top next action. #94's gate - export a CV, extract its text, confirm it reads back - is the one that protects real applications, since every PDF exported before it was unreadable to an ATS.)
