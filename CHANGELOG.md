# Changelog

All notable changes to Applye are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Applye is pre-1.0, so it follows `0.x` versioning: while on `0.x`, the minor
number covers new capability and the patch number covers fixes and release
plumbing. The version in `package.json`, `Cargo.toml`, and `tauri.conf.json`
is the single source of truth; this file tracks what changed at each tag.

## [Unreleased]

### Added

- **Local market.** `geoScope` stayed the "which continents" layer, but a growing list of built-in Discover sources meant most of them were useless to any one user - a Germany-based search saw the same list as a US-based one. Settings' Job search section now has a **Local Market** picker (Germany, United Kingdom, USA, Russia, Spain, France, Ukraine, Poland, or none) directly under the geoScope chips. It narrows, never replaces: geoScope still decides which jobs pass a scan. Picking a market narrows the Discover Sources drawer's built-in list to sources tagged for that market plus worldwide ones; everything else sits behind a "show all sources" toggle. Sources you add yourself are never narrowed.
- **Seven new built-in Discover sources**, all shipped disabled like every other built-in - no request reaches any of them until you turn one on. Four cost zero new parser code, being standard RSS: **DOU.ua** and **Djinni.co** (Ukraine), **Habr Career** (Russia), **Jobicy** (a remote-first board weighted toward the US). Three needed a new JSON parser each, all probed live before being added: **TrudVsem** (opendata.trudvsem.ru, the Russian federal labor service's open-data API, 540k+ postings), **Arbeitnow** (a German-market board), and **No Fluff Jobs** (a Polish IT board). Every endpoint above is public and needs no key.

### Removed

- **Interview Prep AI generation is no longer offered in the UI.** The "Generate" button and the prep panel it opened hung on "Generating..." in native testing. Interview prep is going to become its own larger section later, so rather than patch this surface twice the generation button, panel, and the component state behind it are removed for now. Nothing server-side changed: the `list_interview_prep` / `save_interview_prep_batch` commands, the `interview_prep` table, and the `interview-hr` / `interview-technical` / `star-r` skills stay in place for that future section.
- **Gemini CLI is no longer offered for CLI bridge mode.** Google shut it down for personal accounts on 18 June 2026 - Google AI Pro, AI Ultra and free accounts all stopped being served, leaving only enterprise Code Assist licences and API keys. That is exactly the opposite of who this mode is for, so keeping it would only have offered a provider that cannot work. Claude Code and Codex CLI are unaffected. If your settings still pointed at Gemini they move to Claude Code automatically, and Gemini remains listed for API mode where it is unaffected.

### Added

- **Onboarding can now set up CLI bridge mode.** The AI step only ever offered "paste an API key", with a note promising subscription sign-in was "coming soon" - which had been shipping for a while by then. It now starts with a choice: **paste an API key**, or **use a CLI you already pay for**. Picking the CLI route lists Claude Code, Codex CLI and Gemini CLI with what is actually on your machine, and offers an **Install** button for any that are missing or broken so you never have to open a terminal to get started. The button runs npm for you and tells you plainly when it cannot - if Node.js is missing entirely it says so and links to nodejs.org rather than failing with a wall of output. Installing a CLI does not sign you in, and the wizard says so rather than letting you find out at your first real task.
- **The same Install and Repair buttons are in Settings**, so a CLI that breaks later can be fixed without going back through onboarding.
- **Onboarding now shows exactly how to set up the CLI you chose** - the two commands, in order: one to install it, one to sign in. A CLI that already runs gets a line instead, because running is not the same as being signed in: if a task later fails with an authentication or plan error, the command to fix it is right there.

### Fixed

- **Onboarding now remembers which AI provider you picked.** It saved your API key but never the choice itself, so picking OpenAI or DeepSeek and pasting that key still left the app set to Claude - and every task failed with "no key stored for claude". The provider and the mode are now saved when you finish the wizard.
- **Switching AI mode no longer leaves you with an unusable model setting.** Going to CLI mode clears the model boxes on purpose (so the CLI picks its own), but switching back to API mode left them empty and every request was rejected. Coming back now restores your provider's models.
- **The health check tells the truth in CLI bridge mode.** It reported "no stored key needed - OK" without ever checking whether the CLI it would call actually works, so a missing or broken CLI still showed a clean bill of health. It now runs the CLI and reports the version, or fails with the reason.
- **Settings no longer claims a broken CLI is ready to use.** The CLI bridge checked only that a command with the right name existed, so a half-finished install showed a green tick and then failed on the first real task. These CLIs are small wrappers around a platform binary, and an interrupted install leaves the wrapper behind with the binary missing. Applye now actually runs the CLI to check it, and shows one of three things: working (with its version), **found but broken** (with the exact reinstall command and the error it printed), or not installed. "Send a test prompt" is only enabled for a CLI that genuinely runs.
- **You can now pick a CLI model from a list instead of typing its name.** CLI mode used free-text model fields, which assumed you knew what your CLI calls its models - and a leftover name from API mode could be sent to a CLI that does not recognise it. Each CLI now offers a dropdown: **CLI default**, which is the recommended choice and simply lets the signed-in CLI pick whatever your subscription covers; the model names that CLI accepts; and **Other**, which reveals a text field for anything not listed. Claude Code offers `sonnet` / `opus` / `haiku` and Codex its `gpt-5.x` names; Gemini CLI publishes no list that can be read without signing in, so it offers the default and a text field rather than names that might be wrong.

### Added

- **CLI bridge mode works.** Settings has offered a "CLI bridge (coming soon)" mode since the first AI release, but choosing it returned "not implemented yet". It is now real: if you already pay for **Claude Code**, **Codex CLI** or **Gemini CLI**, Applye runs that CLI for its AI work and stores no API key at all. Settings shows which of the three it can find on your machine, with the path it resolved, and a Re-check button - a GUI app does not inherit your shell's `PATH`, so Applye also looks in the standard install locations itself. Each run is a one-shot subprocess with a fixed argument list (never a shell), the prompt goes in over stdin rather than the command line, the working directory is a scratch folder rather than your own files, Codex additionally runs in its read-only sandbox, and a CLI that hangs is stopped after 10 minutes. Model names in CLI mode are free text passed straight through; leave them empty and the CLI picks its own default.

### Changed

- **The ATS check is now a measurement, not an opinion.** It used to be a single true/false the scoring model emitted alongside a one-line note - so it read as a number while actually being a guess, it never looked at the CV that would be uploaded, and it could disagree with itself on identical input. It is now computed locally in Rust at zero token cost, and gives the same answer every time. The result is a **0-100 score** built from two halves: **keyword coverage** (60 points) matches the posting's own requirement terms against your tailored CV, weighting terms inside a requirements block double because that is where a recruiter's filter comes from, and matching whole words so "Java" no longer counts as covered by "JavaScript"; and **parsability** (40 points), which flags the things that actually lose information in a parser - no findable email or phone, table layouts, missing section headings or creative ones a parser will not recognise, no years to compute tenure from, an export that came out suspiciously short, and a photo **only in markets where a photo is a liability** (a Bewerbungsfoto is normal in DE/AT/CH and is not flagged there). Every finding is shown with the reason attached, and the missing keywords are listed so you can decide rather than trust a number. Requirement headings are recognised in English and German. The model's own ATS remark is still shown, now clearly below the computed result as advice.

## [0.26.0] - 2026-07-23

### Added

- **Interview Prep can now generate study cards.** The stage timeline shipped in v0.16.0 could only log dates and notes by hand - the skills behind it were unwritten stubs, so nothing behind the page actually used AI. Each stage now has a **Prep** panel: HR/final rounds get behavioral Q&A (STAR+R format) plus comp-negotiation talking points and smart questions to ask the interviewer; technical/system-design rounds get Q&A with working code examples where relevant; behavioral rounds get full STAR+R stories. "Generate 5" becomes "5 more" once cards exist, and re-generating with nothing new since the last batch is a 0-token cache hit.

### Fixed

- **AI responses shaped as a JSON array no longer lose their outer brackets.** The shared JSON-cleanup helper used by every AI-generation flow only ever looked for `{...}`, so a response like `[{"question":"..."}]` had its list brackets stripped down to a bare object and broke on `.map()`. It now detects whichever bracket type opens first. Affects the new Interview Prep skills; cover letter and CV generation were already object-shaped and are unaffected.

- **Discover can now scan the German job market.** The three built-in sources are remote-first and English-speaking, so setting the geo scope to Germany scanned feeds that carry almost no German posting. Discover ships a fourth built-in source, the **Bundesagentur für Arbeit** job search - the federal employment agency's own public job index, by far the largest in Germany. Like every built-in source it arrives switched off; enable it in the Sources drawer. Full posting texts are fetched only for the jobs that pass your title and location filters, so a scan does not pull hundreds of descriptions you will never see.
- **Company boards on Personio can be added as Discover sources.** Personio is the ATS most German small and mid-size employers run their careers page on, and its board feed is public XML. "Add company board" now offers Personio alongside Greenhouse, Lever and Ashby - enter the company's slug (the `muster` in `muster.jobs.personio.de`) and its openings join the scan, with the full German posting text including the "Aufgaben" and "Dein Profil" sections.
- **A German city on its own no longer hides a job from a Germany filter.** German boards routinely give the location as just "Berlin" or "München", with no country anywhere in the text, so a Germany geo scope silently dropped the very jobs it was set up to find. The largest German cities now count as Germany, in both German and English spelling.
- **German letters now date and close the way DIN 5008 expects.** A generated letter carried an ISO date (`2026-07-23`), which reads as foreign on a German letter, and models kept prefixing the subject with the "Betreff:" label the standard dropped decades ago. In a German letter the date now renders as `23.07.2026` and the label is stripped - both display-only, so a date or subject you typed yourself is left exactly as written. The letter also takes an **Enclosures** line ("Anlagen: Lebenslauf, Zeugnisse"), printed under the signature when you fill it in and absent when you do not, because a German application travels as a Bewerbungsmappe rather than a single letter.
- **The cover letter can now state your start date and salary expectation.** A German posting nearly always asks for a _frühestmöglicher Eintrittstermin_ and a _Gehaltsvorstellung_, and a letter that answers neither is routinely filtered out before anyone reads it. The letter editor has an **Availability and salary** card - earliest start date, salary expectation, notice period, all free text, so "ab sofort" and "01.10.2026" are equally valid answers. What you write is worked into the closing paragraph in your own words, never converted or reworded. Leave a field empty and the letter says nothing about it: no "salary negotiable", no invented availability. The answers travel with the letter, so tailoring it for the next job keeps them.
- **One reusable applicant photo lives on the profile.** A CV written for the German market conventionally carries a photo, but that photo lived inside a single document, so every new application meant uploading and re-cropping the same headshot. The profile now has a **Photo** section that reuses the CV editor's crop tool, storing the image already cropped to the CV frame; it saves the moment the crop is confirmed. The image stays in the local database, is never uploaded, and is not sent with any AI call.
- **The tailor wizard raises the German photo convention at the moment it matters.** Setting a CV's market to Germany now shows a short explainer with a yes/no choice - a photo is expected there and unusual (sometimes discouraged) elsewhere. "Yes" writes the profile photo into the linked CV; with no photo saved yet, it leads to the profile's Photo section instead. Asked only for Germany, and only once per visit to a job.
- **Target roles collapses like every other profile section.** It stayed permanently expanded - five role cards, each with a free-text box - pushing the rest of the page off screen.
- **The apply wizard can be cancelled.** The only way out was Back, which stepped to the job summary and left the tailored passes and the generated draft CV and cover letter behind - a user who decided partway through that a job was not worth applying to had no way to say so. The footer now has a Cancel that confirms first, names what is lost, and then deletes the draft documents and the saved wizard progress. Documents already exported or filed keep their place in the library, and the job stays in My Jobs.
- **The sidebar collapses to an icon rail.** 240px is a lot to hold permanently for navigation you already know, especially on the Job Tracker and the CV preview where horizontal room is what the content is short of. A control by the logo drops the labels and keeps the icons, and the choice is remembered per machine.
- **The CV live-style panel collapses sideways.** Its fixed 340px is exactly the width the preview wants when you are reading the CV rather than restyling it; it now folds to a tab and hands that width to the paper.

### Fixed

- **The German tracker report is now German throughout.** The Eigenbemühungen sheet is a German-office document, but only its fixed headings followed the chosen report format - the column headers ("Company", "Role", "Status") and the period ("Last 3 months") followed the app's UI language, so a German report handed to the Agentur für Arbeit arrived half in English. Every string printed on the sheet, including the CSV and plain-text exports, now follows the report format; the export dialog around it stays in the UI language.
- **My Jobs: a job's score no longer disappears after you edit your profile.** Scores are cached per profile version, so adding a target role or rewriting the profile Markdown changed the hash and the cached score became unreachable - the whole scoring section vanished and the job looked as though it had never been scored. The most recent score is now kept on screen behind an explicit "your profile changed after this score" notice, with the rescore action next to it.
- **The tailor wizard names the market and the language instead of showing codes.** The two pickers read "DE / US / UK / GENERIC" and "EN / DE / RU", which hid the very distinction they draw: the first picks the market a CV is written for, the second the language it is written in. They now show "Germany"/"United States" and the same language endonyms Settings uses.
- **The Job Tracker column drawer dropped its misleading LOCKED tag.** On a visibility toggle, "LOCKED" read as "this column cannot be shown", when it meant "this value is read-only, it comes from the job posting" - a fact that still belongs on the grid cell, where the tooltip already states it. The redundant pin icon went with it (the pinned column's toggle is already disabled).

- **Release hygiene: the workspace lints clean again.** `nx run-many -t lint` failed with 51 errors and `cargo clippy -- -D warnings` failed with 10, so neither gate could be trusted before a release. Both are green now. On the Rust side: the dead `files.rs` placeholder (an empty `Files` struct with only Phase-1 TODO comments, never constructed) was deleted, two manual `splitn(2, ':')` parses became `split_once`, a doc comment that started a line with `>` was reflowed, and the two lints that are wrong for their context - `PhotoPlacement`'s variant prefix (the names are the serialized wire format) and the macOS print FFI's argument count - carry an `#[allow]` with the reason. On the Angular side: the five form labels in the interview-stage dialog are now bound to their inputs with `for`/`id`, the two column-manager toggles in the Job Tracker became real `<button role="switch">` controls (previously click-only `<span>`s inside a `<label>` that wrapped no control, so they were unreachable by keyboard), and the remaining click handlers - page-shell click-away, bubble stoppers, and modal backdrops - are annotated as deliberately keyboard-inert. `x != null` stays allowed in templates via an explicit `eqeqeq` option instead of being flagged at each site.

- **Discover: target-role matching no longer fires on a generic word like "engineer".** An archetype such as "Senior Angular Engineer" was matched to a job when _any_ of its name words appeared, so every engineering opening ("Value Engineer", "Staff System Engineer", "Software Engineer - SAP ABAP") was flagged as a Primary-role match on the shared word "engineer". A match now has to be anchored by a distinctive word (angular, frontend, react, ...); seniority and bare role-family words (senior, engineer, developer, ...) still add coverage but can no longer trigger a match on their own.
- **Discover: the archetype-fit badge no longer disappears on row hover or stretch across the job-detail header.** The badge filled with `--surface-sunken`, which in the light theme is the exact same colour as the row's hover background, so it dissolved into the row; badges now sit on `--surface-1` with a 1px border (Primary tier keeps the accent tint), holding their shape on any background in both themes. In the job-detail hero the same badge was stretched to the full row width by the column layout; it now hugs its text.
- **Discover: the filter toolbar reads as one finished bar and pins flush when scrolled.** The query input, the source/type/location filters, the New/All toggle, and the Sources/Clear actions were three different heights and border weights, giving the sticky bar a ragged, unfinished edge; every control now shares the input's baseline (30px, subtle border, one radius). The bar also pinned 32px below the viewport top (the scroll container's padding), leaving a strip where feed rows scrolled through above it; it now sticks flush against the top with no gap.
- **My Jobs: an applied job can no longer be reopened for editing.** Once a job leaves Saved the pasted job description is frozen (the application is already out the door), so the job detail now shows only Delete - the Edit affordance and its "reopen an in-progress application" confirm dialog were removed. Saved jobs are unaffected (their description stays editable inline).
- Discover: profile archetypes were serialized as objects but read as `[object Object]`, collapsing all target-role matching to a single junk keyword. Matching now parses the real archetype list.
- **CV experience dates no longer render as a bare "Present" with a leading dash.** When a role had no start date the preview showed " - Present"; the date separator is now hidden in read/print modes when the start date is empty (it stays in the editor so the empty field is still clickable to fill).
- **Cover-letter signatures no longer append the phone number to the name.** The `cover-letter-generate` skill states the signature is the sender's name only, but the model did not obey reliably and kept leaking a phone number into the sign-off. Every generated/regenerated signature is now run through a deterministic sanitiser that strips any phone, email, or URL the model appended, leaving just the name - the prompt rule is best-effort, this is the guarantee.
- **Document Generate / Regenerate buttons now show a visible loading indicator.** The bouncing three-dot spinner was styled only when nested inside an `.ai-thinking` badge, so inside the buttons its dots collapsed to zero size and only the disabled state showed. The indicator is now self-contained and inherits the button's text colour, so a regenerate in progress is clearly animated.
- **Review CV / Review letter buttons are disabled while a draft regenerates.** They stayed clickable during regeneration and could open a document mid-rebuild; they are now disabled until generation finishes.
- **No more page "blink" when the apply wizard opens on a route change.** Opening a job from the floating resume button or returning from the document editor briefly flashed the job-detail view before the wizard/tailor view replaced it, because the wizard-open decision ran after an async job load. That decision is now made synchronously before any await, so the correct view paints first.
- **CV import recovers more mangled ligatures.** The `ft` ligature that some PDFs export as a bare `+` glued to a word (e.g. "AmcomSo+" -> "AmcomSoft", "Microso+" -> "Microsoft") is now repaired, with the existing `C++`/`ES6+` never-repair guards kept. Date-capture guidance was also tightened so dates present in the source are not dropped.
- **My Jobs "Updated score" sections now have consistent padding.** The Dimensions and "Before you submit" blocks were unpadded while the surrounding cards were boxed; every section is now a uniformly padded card.

### Added

- Discover: target-role (archetype) fit badges. Each job in the feed and detail now shows the strongest matching archetype tier (Primary / Secondary / Adjacent); the For-you section is ordered by tier, and tier feeds the deterministic 0-token score. sellWhen acts as a light tie-break signal.
- **Missing-date prompt before generating a tailored CV.** When the AI cannot date an experience **or education** entry, a blocking dialog asks the user to fill it in (per entry, skippable) instead of shipping a CV with an open-ended "Present". Answers can optionally be saved back to the profile.
- **Structured, multi-entry education in the profile.** The profile's single education text field is now a repeatable list: add any number of degrees, courses, or certificates, each with its own institution and start/end year (end left blank = ongoing). Stored back into the profile markdown, backward compatible with existing free-text education.
- **Gap-fill before generating a cover letter.** Cover-letter generation now runs the same JD-vs-profile gap analysis the CV flow uses, asking the user for anything the posting wants that the profile lacks before the letter is written. Skipped when a CV was already generated for the job (that step just asked), so the user is never prompted twice.
- Profile editor: structured Experience (role, company, dates, bullets), chip-style Skills, and Language + level editors in Form mode, each in a collapsible section.
- Profile editor: AI "Parse text" in Raw Markdown mode - turns free text into structured fields via a preview-then-apply flow (new `profile-import` skill).
- Profile editor: compensation target (min / max / currency / period) in Form mode.
- Discovery and job detail: a salary-fit badge (Above / In range / Below target, or "Salary not stated") comparing a job's advertised salary - detected from the job description - to your compensation target. Recognizes yearly and monthly pay; never shows a misleading badge.

#### Website (applye.dev)

- **Source links honour a single "not public yet" switch.** The repository is private while the pre-release audit runs, so every GitHub link on the site would 404. `SOURCE_PUBLIC` in `site.ts` now drives a `SourceLink` component that renders a real link when the repo is public and an honest "coming soon" pill when it is not; nav, footer, landing, blog, press, privacy, sustain, manifesto, methodology, changelog, and docs all go through it. Changelog release headings stop linking to compare views while the repo is private.
- **Consent-gated Google Analytics.** GA4 is injected only after an explicit opt-in, with `anonymize_ip` on and Google Signals and ad personalisation off. Nothing is loaded, and no cookie is written, before consent - the decision itself lives in localStorage. A placeholder measurement ID counts as unconfigured, so no build ever contacts a junk GA property. A consent bar asks once; the new `/cookies` page documents exactly what is collected and lets the visitor change or reset the choice. The privacy page now states the app-versus-website distinction plainly.
- **Per-route SEO.** Every route declares its own meta description, and a `SeoService` rewrites description, canonical, Open Graph, and Twitter tags on navigation. Adds `robots.txt`, a generated `sitemap.xml` (34 URLs, `npm run web:sitemap`), static `SoftwareApplication` JSON-LD, and a 1200x630 Open Graph card generated from an SVG source with macOS built-ins (`npm run web:og`). Tests fail if a route lacks a description or drifts from the sitemap manifest.
- **Documentation brought level with the shipped app.** New guides for the Dashboard and the Documents library (CV import and generation, the section editor with per-section style overrides and templates, photo and font ATS warnings, structured cover letters, DOCX vs PDF). The profile guide now covers the structured form editor, AI "Parse text" import, target-role archetypes and their fit tiers, and the compensation target; the Discover guide explains the archetype-fit and salary badges and the For-you ordering. New reference pages: "Your data & backup" (per-OS paths, moving machines, deleting everything) and "Troubleshooting & FAQ". `docs/product/MEDIA_SHOTLIST.md` lists all 27 screenshot and video slots with capture rules and file names.
- **One icon system.** The landing page rendered the same shield glyph for all five principles; icons are now a single stroke set (24x24, 1.7 stroke, currentColor) shared by the principles strip, the theme toggle, and the docs chevron.
- **Every page prerendered to static HTML.** The site was client-rendered, so crawlers that do not run JavaScript saw only the default title and description - a shared link to a deep docs page previewed identically to the home page. All 39 routes are now prerendered with their own tags; the Cloudflare SPA-fallback rewrite is gone (it would have hidden those files) and a static 404 page answers unknown paths with a real 404.
- **Switching docs pages now lands at the top of the new page.** The site is one document scroll and the router kept the old offset, so clicking the next section while halfway down a page dropped the reader into the middle of the next one, with nothing on screen indicating anything had changed. New navigations go to the top; back and forward still restore where you were. The global `scroll-behavior: smooth` was part of the same problem - it animated that jump, so the page appeared to slide away by itself - so smooth scrolling now belongs only to the table-of-contents anchors, honouring `prefers-reduced-motion` and falling back to an instant jump on engines that accept `smooth` and animate nothing.
- **Two claims on the site were out of date.** "Not a job-board scraper - you paste roles you found" predated Discover, which does fetch openings; it now says what is actually true and is the more interesting claim anyway: not a scraper of closed boards, because Discover reads public APIs and feeds that are published for exactly this purpose, and nobody is told what you searched for. And the docs still offered a DOCX export that has been removed from the app - export is the WYSIWYG PDF only, while importing a DOCX CV still works. Both corrected across all six locales.
- **Repositioned from "built for the German market" to a global product.** The old framing filtered out most of the audience in the first five seconds, while the DACH capabilities are a genuine differentiator worth keeping. The landing section is now "Local rules, handled" - a job search is local even when the job is remote - covering documents in six languages, per-market CV conventions, visa and Blue Card awareness, and GDPR by architecture, with Germany named as the deepest example rather than the frame. The FAQ answers "Does it work outside Germany?" instead of "Why the German market?", `/docs/german` became `/docs/local-markets` with an "everywhere" section plus a "Germany, in depth" one, and the comparison table, press kit and hero mock lost their German-specific wording. All six locales updated.
- **The chosen language survives navigation.** Picking Russian and then opening the docs used to drop the reader back into an English shell, and the logo always pointed at the English landing page. The choice is now remembered: the shell (nav, footer, consent bar) stays in the reader's language on English-only pages, and the logo returns them to their own landing page. The page's own `lang`, canonical and hreflang tags still follow the route, so an English docs page is never advertised as German.
- **The landing page in six languages.** English at `/`, plus `/de`, `/es`, `/pl`, `/ru`, `/uk`, matching the languages the README ships in. The shell (nav, footer, consent bar) follows the page's locale, a footer switcher links the versions as real crawlable URLs, and `hreflang` alternates are emitted between the landing pages only - never claimed for pages that exist in English alone. The documentation stays English, and the translated pages say so rather than pretending otherwise. Tests assert every bundle has exactly the English key set, no empty strings, and a real translation of the headline.

## [0.25.0] - 2026-07-19

### Fixed

- **The competitor feature-adoption analysis no longer ships in the repo.** `AGENT_PROMPT_CAREER_OPS_ADOPTION.md` and `docs/product/CAREER_OPS_ADOPTION.md` mapped career-ops features to Applye as an internal adoption checklist - fine as a working doc, wrong to publish. They're untracked and gitignored; the public credit and comparison to career-ops in the README and website stays as is.
- **The desktop webview now runs with a real Content Security Policy.** `tauri.conf.json` shipped with `security.csp: null` (no restriction at all); it now sets an explicit policy scoped to what the app actually loads (self-hosted fonts, data/blob URIs for the CV photo, Tauri's own IPC/asset origins), so the packaged app can't load arbitrary scripts or connect to arbitrary origins.
- **Cargo package metadata pointed at the wrong GitHub owner.** `apps/desktop/src-tauri/Cargo.toml`'s `repository` field said `vkasap/applye`; it now matches the real remote, `vitala89/applye`.
- **Discover now recognizes locations properly.** Job locations are classified with a rewritten, unit-tested engine: US cities and states (`Austin, TX`, `Denver, CO`) land in North America instead of Other, South American countries (Brazil, Argentina, Uruguay, Chile, Colombia, Peru…) get their own region instead of falling into Other, and European/Asian/Oceania/Middle-East/Africa places are recognized too. Ambiguous two-letter codes no longer cross-classify (`SF, CA` is California, not Canada), and ordinary words never trigger a false country. Feed cards that previously showed no location now derive one from the feed's category or a "Location:" line, and clearly-remote jobs are labelled Remote - so the location actually shows and the Locations filter works.

### Changed

- **Discover groups the feed by your target roles.** The inbox now shows a **"For you"** section - openings whose title matches one of your profile's target roles - above a **"More openings"** section with everything else the scan found. Nothing is hidden; it is a soft ranking, so you still see the rest. With no target roles set, the feed stays a single plain list.
- **The sidebar was redesigned.** Navigation is now grouped under section labels (Workspace, System) with the primary items (Dashboard, Discover) above them; the wordmark is the lowercase `applye` lockup. The footer replaces the old AI-mode indicator with a profile card that opens your profile. Item names and destinations are unchanged.
- **The Pipeline search moved to the left.** The board's search field now sits at the start of the summary strip instead of the far-right edge, so it stays reachable when the window is wide.
- **The Job Tracker no longer repeats its title.** The page kept both the top-bar title and a second "Job Tracker" heading; the duplicate heading is gone, leaving just the top bar and the one-line description.
- **The app icon is now the Applye logo mark.** The launcher/dock icon (and the full bundled icon set used when publishing - macOS `.icns`, Windows `.ico`, and every PNG size) is a dark rounded tile carrying the brand mark (the angled slash + indigo cursor bar), replacing the old placeholder. No wordmark, just the mark.
- **The dark theme was recolored to warm graphite.** The dark palette moved from cool blue-grey neutrals to a warmer graphite set: the app canvas, cards, surfaces and borders are all a touch warmer, primary text is now an off-white (`#f4f2ed`) instead of cool white, and the left navigation rail has its own dedicated recessed shade so it reads as a distinct plane from the canvas. The indigo accent, focus rings and status colors (success/warning/danger) are unchanged. Light theme is unaffected. (Mirrors the updated Applye design system.)
- **The AI privacy note now shows for every cloud provider, not just DeepSeek.** In Settings, choosing any provider (Anthropic, DeepSeek, OpenAI, Google) now displays a note explaining that in API mode your job description and profile text are sent to that vendor's servers, that your API key stays in the OS keychain and never touches the local database or logs, and that AI is always opt-in. DeepSeek additionally keeps its China-jurisdiction warning on top of the shared note.
- **Language pickers now read in each language's own name.** The UI-language and document-language selectors in Settings show "English, Deutsch, Русский, Español, Français, Українська" instead of raw codes (en, de, ru...), so you can always find your own language even if the app is currently in another.
- **The Job Tracker has a new design.** It opens focused on six essential columns (company, role, status, date applied, next action and its date) instead of a wall of 19; the rest live in a Columns side panel. Company is a link back to the job, status shows as a colour-coded pill, and the index + company columns stay pinned while you scroll sideways. A row is read-only until you open its Edit action, which turns the row's own fields into inputs with Save / Cancel; job-derived fields (company, tech stack, blue-card) are always read-only and marked as such. A summary strip carries the totals, and there are proper loading and empty states.
- **Exporting the tracker report now shows a preview and asks where to save it.** "Export report" opens a preview of the report document (letterhead, applicant, period, table and totals) so you can review it first, then Save as PDF or Save as CSV via a native Save dialog where you choose the folder and name - instead of the file landing silently in Documents/Applye/reports. You choose the **report format** - Germany (the official Eigenbemühungen document, in German) or International (English) - and the page **orientation** (A4 portrait or landscape). The report now shows **your own visible columns** (including custom ones and Next Interview), not a fixed set. It works out how many columns fit an A4 page for the chosen orientation and tells you: **Fit to page** keeps only what fits, **All columns** keeps everything by wrapping the extras onto a second line under each row - and a note lists exactly which columns are affected. The saved PDF is the exact same render as the preview (it prints the preview's own page), instead of a plain monospace text layout. CSV always includes every visible column (a spreadsheet has no width limit).
- **The website drops "forever" from the "free" claims.** The hero, FAQ, `/compare`, `/press`, the `/sustain` page, and the site meta tags now describe Applye as free and MIT-licensed rather than "free forever".

### Added

- **The repository is dressed for open source.** The README was rebuilt in a launch-ready shape - centered wordmark and hero placeholders, a six-language switcher (English, Español, Deutsch, Русский, Українська, Polski) with full translations at `README.<lang>.md`, badges, a features table with the 0-token contract, quick start, the core loop, project structure, tech stack, screenshots section, author note, and disclaimer. New community files: `CONTRIBUTING.md` (setup, conventions, what will not be merged), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private reporting policy), plus GitHub issue forms and a PR template. A `LEGAL_DISCLAIMER.md` (acceptable-use terms) is linked from the README, media placeholders are inventoried in `docs/assets/README.md` with production prompts in `docs/assets/ASSETS_BRIEF.md`, and `docs/design/WEBSITE_PLAN.md` briefs the site design work. The GitHub repository metadata (description, homepage, topics) is filled in.
- **The docs grew a step-by-step User guide.** Nine new pages under `/docs/guide/*` (first run & tour, profile, add a job, score, tailor & export PDF, Discover, Pipeline & Tracker, Interviews & Analytics, Settings & AI) walk through the app screen by screen, honest to what ships today - PDF-only export, no AI interview questions, real provider list (Claude, OpenAI, Gemini, DeepSeek + CLI bridge). Every screenshot/GIF/video slot is a styled placeholder box stating exactly what to capture; the same claims were corrected on the landing page and in all five READMEs.
- **The website grew five pages: Manifesto, Compare, Press, Privacy, Sustain.** `/manifesto` states the six principles (augmentation not automation, fewer better applications, your data is yours, honesty over inflation, pay for judgement, open source forever) with a signature block; `/compare` is an honest table against cloud SaaS trackers, career-ops, and a spreadsheet; `/press` is a self-serve press kit (boilerplate, fact sheet, asset placeholders); `/privacy` is the plain-language privacy page for the app and the site; `/sustain` explains the free-forever model and how to support it. The footer now carries the full page list (Docs, Manifesto, Methodology, Compare, Blog, Changelog, Press, Privacy, Sustain) plus social icons - GitHub and LinkedIn live, Discord and X appear once those channels exist.

- **Discover is now a real screen: jobs come to you.** The "coming soon" placeholder is replaced by a working discovery inbox. Applye scans legal, machine-readable job sources - the built-in Tier-2 feeds (Remotive, We Work Remotely, Himalayas), public ATS company boards (Greenhouse / Lever / Ashby, added by company slug), and any RSS feed you add - entirely with deterministic code: no AI reads the sources, nothing leaves your device except plain HTTPS requests to public feeds, and the scan costs **0 tokens**. Fetched openings are filtered locally before they ever reach you: a per-source title keyword filter (auto-derived from your profile's Target Archetypes until you customize it), your geographic scope from Settings, and dedupe against every job already in your database. Hitting **Scan** shows a terminal-style **scan console** that logs each source's result line by line (`remotive ... 128 fetched · 117 filtered out · 11 new`), then collapses into a summary strip (`LAST SCAN 12:04 · 14 NEW · 183 FILTERED · 0 TOKENS`). The feed itself is a fast triage list: each row shows the role, company, source, location, age, and which of your keywords matched; **Save** puts the job into My Jobs as a saved application, **Dismiss** hides it forever (with an inline Undo), and clicking a row expands a description preview with a link to the original posting. A **Sources** panel manages where openings come from - toggle the built-ins, add a company's ATS board or your own RSS feed (https only, with a note on what Applye will and won't read), remove your own sources, and see each source's last scan result. Closed boards (LinkedIn, Indeed, StepStone, Glassdoor) are deliberately not scanned - that is a product stance, not a gap.
- **Analytics is now a real screen.** The "coming soon" placeholder is replaced by a working analytics view that answers "how is my job search actually going?" using only data already on your device. A period selector (30 days / 90 days / all time) filters everything. Four counters lead - applications sent, response rate, interviews, and offers - each with a change vs the previous period and a small trend spark. Below them, an **application funnel** (Saved to Applied to Interviewing to Offer) shows the count and stage-to-stage conversion at each step, with rejected/withdrawn tracked separately as leakage, and an **applications-over-time** chart plots your volume per day/week/month with your follow-up activity overlaid. When you have very few applications it shows raw counts instead of misleading rates, and a brand-new user sees a calm "no data to analyse yet" state. The visuals are terminal-native (flat bars, a single thin accent line) to match the design system; no charting library, no external or benchmark data. It also shows a **match-score distribution** - a histogram of the ATS-fit scores of the jobs you applied to, with the median and a scored/unscored count, so you can see whether you are applying to well-matched roles or spraying (it appears once some of your jobs have been scored). A companion **score vs outcome** view compares your average match score across offers, interviews, and no-interview, so you can see whether higher-fit applications actually get further. A **time to response** card shows the median days from applying to the first employer response, with fastest/slowest and a day-band histogram. A **pipeline aging** card shows how long your active applications have sat in their current status (flagging any stalled past 14 days), and a **where you're applying** card ranks your top locations. (Follow-up counts reflect follow-ups _drafted_ in the app; Applye never sends mail.)
- **The Dashboard is now a real home screen.** Landing on Applye now opens a working command center instead of a "coming soon" placeholder. A greeting leads into four at-a-glance counters (active applications, upcoming interviews, overdue follow-ups, offers - the overdue tile turns amber when anything is due). Below them, a **Needs attention** queue surfaces the next action to take right now - an overdue follow-up to draft, a half-finished tailoring session to resume, an interview in the next 48 hours to prep for, an out-of-date scoring profile or pitch to regenerate, or a profile to finish - each with a single button that jumps straight to it. When nothing is pending it shows a calm "all caught up" state, and a brand-new user sees "Complete your profile" and "Add your first job" instead. Two panels list your upcoming interviews and most recent jobs, and a quick-actions bar offers Paste job, New tailoring and Import CV. Everything is derived from data already on your device - no new storage. The queue also flags **per-job stale scores**: when you regenerate your scoring profile, any job scored against the old one shows a "Score is stale for X" prompt (highest-fit jobs first, capped so it can't flood the list) that jumps to the job to re-score.
- **Interview Prep has a new design.** The list now leads with a summary strip (interviews tracked, upcoming, and the next date) and a proper empty / loading state, and each row has a **Remove from Interview Prep** action (with a styled confirm) that clears that application's stages while leaving the job itself in My Jobs and Pipeline. The detail screen is now a **timeline** of stages: each stage is a card with its status shown as a colour-coded menu you click to change, a formatted date, the interviewer, notes, and reorder / edit / delete controls. **Adding or editing a stage now happens in a modal** (opened by a single "Add stage" button) instead of a large form permanently pinned to the bottom of the page, and deleting a stage uses a styled confirm dialog instead of the browser's. (Per-stage AI interview prep - generated questions and answers - is briefed for a follow-up.)
- **Delete all data (factory reset).** A new Data section in Settings wipes everything Applye stores on this device - every job, application, document, note and cache - clears your saved API keys from the OS keychain, and returns you to onboarding with a clean slate. It is gated behind an explicit "Yes, delete everything" confirmation and cannot be undone.
- **Settings gained an Appearance section and an About section.** Appearance carries the light/dark theme toggle (previously only in the top bar); About shows the app version. (Controls for geographic scope, score-notify thresholds, and export format were intentionally left out: those data-model fields have no behaviour behind them yet, and export currently ships PDF only, so surfacing them would have shown settings that do nothing.)
- **You can archive, restore or remove a Job Tracker row.** Each row's actions menu offers Archive (moves it out of the active grid but keeps it in your exported report - toggle the Active / Archived segment to see them), Restore, and Remove (a two-step confirm that hard-deletes the job and its application, same as My Jobs).
- **You can add your own columns to the Job Tracker.** The Columns panel has an "Add custom column" form (name + type: text, date, number, yes/no or single-select). Custom columns are editable per row like the built-in fields and are saved to the database; remove one from the same panel.
- **The Job Tracker shows your next scheduled interview.** A "Next Interview" column surfaces the soonest still-upcoming interview stage you logged on the Pipeline board (its label and date) - so a scheduled technical or final round shows up in the tracker, not just the first two stages.

- **The Pipeline board has a new design.** A summary strip shows how many applications are active, how many are overdue, and lets you search across company, role and location. Rejected and cancelled columns collapse into slim side rails (an "archive") that you reveal with one click, so the board stays focused on live applications. Cards now carry a company monogram, the location, a colour-coded ATS score, and - for interviews - a segmented stage-progress track. The quick-view now leads with status and ATS fit, shows the interview as a step-by-step tracker, and groups every section clearly.
- **Leaving a half-finished application no longer loses your place.** If you start tailoring a CV for a job and then click away - to Documents, to another job, anywhere - a "Finish tailoring" button now follows you and brings you back to the exact step you left, instead of dropping you at the job list to start over.

- **Your profile now holds your email, phone, website and LinkedIn.** They were already being read off your resume, but the profile had nowhere to put them, so they were never yours to edit — and were thrown away the first time you saved. Four fields now sit under Location in the profile form.
- **The scoring profile tells you when it is out of date.** The card now reads "out of date · regenerate" once you have saved a change to your profile text, and "unsaved changes" while you are still editing. Previously it only ever said "cached · 0 tokens".
- **The elevator pitch now tracks its own freshness, and can always be refreshed.** The pitch card gained the same "out of date · regenerate" / "unsaved changes" badge as the scoring card. It also fixes a real trap: the pitch used to share the scoring profile's cache key, so regenerating your scoring profile made the pitch report as "cached" even though it was written from an older version of your profile — and you could not refresh it. The pitch now remembers the exact profile text it was written from (a new `pitch_hash`), so it goes stale and regenerates independently of scoring.

### Fixed

- **"Parse & filter" now finds the company name in the posting body, not only in a "Company:" header.** A job like "Newfire Global Partners is a leading technology firm..." was flagged "No company name found" because the extractor only read explicit `Company:` / `Employer:` labels. It now also recognizes the company from the posting text - an "About X" / "Join X" heading, or the classic "<Company> is a/an/the ..." opening sentence - while still rejecting sentence fragments like "We are a ...". Re-parsing a job also keeps a company/title it already had (e.g. from Discover) instead of dropping it, and a re-parse backfills a missing company/title without overwriting an existing one.
- **The salary check no longer says "not mentioned" when the pay is stated without a currency symbol.** Postings that write pay as `80k-120k`, `90,000 EUR`, or `120000 USD` (no €/$/£) were treated as having no salary; the detector now recognizes the `k` shorthand and EUR/USD/GBP amounts, and the keyword list was widened (base pay, wage, OTE, per annum, salary range, ...). Truly salary-free postings are still flagged.
- **The Interview Prep back button no longer shows two arrows.** The "← ← Interview Prep" control was rendering an arrow icon plus a literal arrow character in its label; it now shows a single arrow.
- **The Job Tracker row-actions menu no longer gets cut off.** The Edit / Archive / Remove menu (the "…" button) used to be clipped by the scrolling table; it now floats above the table (a proper popover with a click-away backdrop and a clearer two-step Remove confirmation) so it is always fully visible. The table also scrolls sideways properly when many columns are shown, with the index and company columns pinned in place.
- **The Job Tracker now fills the window width.** The table used to sit in a narrow centred column with large empty margins; it now stretches to the full content width (with the standard page gutter), like the Documents screen.
- **Pipeline cards stay accurate right after you move them.** Dragging a card into Applied or Interview (or changing its status from the quick-view) now refreshes the card's dates and its "overdue" badge from what the database actually recorded, instead of showing stale values until the next reload. The follow-up drafter in the modal appears or hides based on the correct, up-to-date state.
- **A failed status change on the board now tells you.** If moving a card to another column fails, the card snaps back and an error toast explains why, instead of silently reverting.
- **The pipeline quick-view modal is keyboard-friendly.** It now closes on Escape, traps focus inside the dialog while open, and returns focus to the card you opened it from.
- **Returning to a job mid-generation shows it still working, not "Create" again.** When a CV or cover letter was generating and you left the page, coming back used to offer "Create" again as if nothing was happening (and a second click started a duplicate run). The button now stays a disabled spinner while the draft is still being generated in the background, and swaps to "Review" the moment it lands.
- **CV and cover letter can generate at the same time.** Starting one no longer silently ignores a click on the other - they run as two independent streams, each button reflecting only its own progress.
- **The floating "Finish tailoring" button now actually takes you there from another job.** Tapping it while viewing a different job used to just make the button vanish and leave you where you were; it now loads the in-progress job.
- **The "start here instead?" cross-job warning is a proper dialog.** It used to appear as an inline banner that could be scrolled off-screen; it is now a centered modal with clear "Start here anyway" / "Cancel" choices.
- **Leaving the app mid-step no longer wipes your progress.** Whenever a long apply-wizard step was running - tailoring your CV, updating the score, or preparing your documents - switching to Pipeline or the job tracker used to abandon it and show the step as skipped or reset when you came back. Each step now keeps running in the background while you are away, the "Finish tailoring" button turns into a live spinner naming what is in flight ("Tailoring your CV…", "Scoring your tailored CV…", "Preparing your documents…"), and the finished result is waiting for you when you return. (Also fixes a hang where leaving while the CV gap-fill questions were open would leave the generation stuck forever.)
- **The Dashboard's "Draft follow-up" action now actually opens the follow-up drafter.** Clicking it on an overdue application used to just land you on the Pipeline board with nothing else happening; it now opens that job's quick-view modal straight away, scrolled to the follow-up section.
- **The Analytics application funnel reads better in light theme.** Its non-primary bars (Saved, Interviewing, Offer, and the other funnel-style charts) used a flat, warm dark-gray fill that didn't adapt to light theme and looked muddy against the near-white background; they now use a lighter, cooler gray on light theme. Dark theme is unchanged.
- **The onboarding AI-provider cards show real brand marks.** Claude and DeepSeek now show their official logos (in their brand colors) instead of a generic glyph; OpenAI shows its official mark too, rendered to stay visible in both themes.
- **Discover feed cards separate the role from its metadata more clearly.** The company name moved out of the title line onto its own line with a building icon; the source, location and age sit below it as icon-labelled chips; matched keywords carry a small "MATCHED" label; and the "NEW" marker is now a bordered colored pill instead of plain accent-colored text, so it reads as a status badge rather than part of the title.
- **Scanned jobs no longer leak into My Jobs.** Running a Discover scan used to make every collected opening appear in My Jobs (and its pickers) immediately; discovered jobs now stay in the Discover inbox until you explicitly press Save - only then does the job join My Jobs. Openings scanned before this fix that you never saved disappear from My Jobs automatically.
- **Clicking a Discover row now opens a full job screen, not a truncated inline teaser.** The old expansion showed 400 characters that cut off mid-sentence. A row click now opens a dedicated detail screen: a hero with the company monogram, source, age and location; the complete stored description rendered with structure - section headings, paragraphs and bullet lists recovered deterministically from the feed text (0 tokens, no AI); an **Apply now** button (opens the original posting; Applye never submits anything for you) and the original-posting link; an "About the job" facts card; and a **Skills found in posting** chip list detected by a fixed tech dictionary. A sidebar shows a **raw match score** - a deterministic keyword-fit ring (your profile keywords vs the posting, no AI, no tokens) with an honest "RAW KEYWORD FIT · NOT YET TAILORED" note, a verdict band, and an Applye tip: a strong raw match says "no re-score needed", anything lower offers **Score with AI**, which saves the job and jumps straight into its scoring flow. Because the full text was already stored at scan time, a saved job arrives in My Jobs with its complete description ready for scoring and tailoring.
- **Discover's filters are now checkbox menus driven by what's actually in your feed, and Settings knows about your search scope.** The old three-option location select conflated geography with work mode. Filtering is now three checkbox popovers where an empty selection means "all": **Sources** (the real sources present in the current feed), **work type** (Remote / Hybrid / On-site, detected deterministically from each posting's location text), and **Locations**. The Locations menu is a three-level tree built only from what your feed actually contains - **region -> country -> city** (Europe -> Germany -> Berlin), where each level appears only when scanned jobs match it (Singapore shows under Asia only when a Singapore job was found, Berlin under Germany only when a Berlin job was found). Ticking a region ticks all its countries and cities; ticking a country covers all its cities; ticking a single city narrows to just that city. Remote-anywhere and unrecognized locations are their own **Other** bucket - a normal, selectable option, not an always-match, so picking Taiwan no longer also drags in "Anywhere in the world". The country dictionary was filled out (all EU countries incl. Croatia, plus a **North America** region with the USA and Canada, so an "Ontario" posting classifies correctly). All detection is deterministic and local (0 tokens, no AI), reading each job's stored location text. Separately, the Sources panel's "SCOPE: ..." footer used to point at a setting that didn't exist anywhere; Settings now has a **Job search** section where you pick the scan scope (Worldwide / Europe / USA / Asia) that the scan engine honors when filtering openings - the Asia scope was added to the engine's region list so the setting and the Discover region filter agree.
- **The Discover job detail no longer shows two buttons that do the same thing.** "Apply now" and "View original posting" both opened the same page, and the sidebar repeated both again. The detail now has a single **Apply now** action (with a short line stating it opens the original posting in your browser and never submits anything for you); the redundant view-original link and the duplicate sidebar apply card were removed.

### Changed

- **The Tailor step starts from your profile by default.** The base to tailor from was the first CV in your library; it now defaults to your profile ("from scratch"), unless the job already has its own tailored CV, in which case that one is the default so you build on it.
- **Generated CVs and cover letters are labelled with the role, not just the company.** A file is now named like "Acme - Senior Frontend Engineer - Tailored CV", so the Documents list tells you which job each one belongs to.
- **"Start over" on the last step now actually starts over.** It used to clear some hidden state and leave you on the same screen, so nothing appeared to happen; it now discards the tailoring and takes you back to the Tailor step.
- **"Change status" is now "Edit", because that is what it did.** The button never changed your status; it unlocked the job description for editing and retailoring. It is renamed, and if the application has already reached Interview or beyond, it asks for confirmation first - the resume is already sent, so reopening it should be deliberate. (Status itself is set on the Pipeline board and shown, read-only, on the job page - which now stays in sync with the board.)
- **Fit scores now read as a single percentage everywhere.** The score panel used to show three different scales side by side - a number out of 100, a star rating out of 5, and per-category scores out of 10 - which invited exactly the "so which one is it?" confusion. It is now one scale: an overall "82% match", each category shown as a percentage on the same bar, and one word verdict (Strong fit / Consider / Reject). The star rating is gone (it duplicated the overall score and, oddly, never dropped below one star). Colours now mean the same number on every bar.
- **"Save this job" and "Mark as applied" are now two different things.** On a job you pasted, the secondary button was "Add to Pipeline" - but it created an _applied_ application, the exact same outcome as "Mark as applied", so the two buttons did the same thing. "Add to Pipeline" is now **"Save this job"** and saves the job as a tracked lead (status Saved, in My Jobs / Job Tracker) without claiming you applied. "Mark as applied" still records a real application (status Applied, on the Pipeline board). One saves, one applies - no more duplicate.
- **"Create application" / "Update application" now builds and files your documents.** The last wizard step's button is "Create application" the first time (was "Mark as applied") and "Update application" afterwards. It now makes sure the tailored CV and cover letter actually exist - generating either one if it is missing, and regenerating a stale one after you re-tailored - then files them in your Documents, labelled with the company and role, before marking the job. Previously "Update application" only saved the score and left the documents untouched. The button shows a working state and is disabled while it generates.
- **Tailored CVs and cover letters no longer land in your Documents library until you apply.** Generating a draft in the apply wizard used to immediately add it to Documents, cluttering the list with half-finished attempts. The draft is now held privately to the application - you can still Review, edit and export it - and only becomes a Documents entry once you export its PDF or mark the job applied (step 5, Export & Apply). The buttons read "Generate" / "Regenerate" instead of "Create", matching that nothing is filed until you commit.

### Added

- **The CV generator asks about what the job needs and your CV is missing.** Before it writes a tailored CV, it now checks the job against your CV and, if there are gaps (a technology, concrete experience, a language level), asks you a few quick questions. Answer the ones you can, skip the rest, and optionally save the answers to your profile so it does not ask again. If your CV already covers the role, it generates straight away.
- **Starting to tailor one job warns you if another is unfinished.** If you leave a tailoring session and start one for a different job, the app now tells you the first one will be cancelled - and names it - so you can go back and finish it (via "Finish tailoring") instead of losing it silently.
- **You can cancel a tailoring run.** The Tailor step now has a Cancel button while it works. It stops before the next pass and drops the partial result, so you can back out and adjust the source instead of waiting out a run you no longer want. (The pass already in flight finishes, then its result is discarded.)

### Fixed

- **A generated CV or cover letter now stays generated.** After it finished, the "Review" button used to flip back to "Generate" a few seconds later, and returning to the job showed "Generate" again as if nothing had been made - so a second click ran (and paid for) a duplicate. Root cause: the link from the application to its document was never actually saved (the two id columns were missing from the write path since the library shipped), so the moment the app re-read itself the link was gone. The link now persists; Review stays Review, on the page and on return. (This also silently fixed one-doc-per-job: regenerating updated the same document instead of piling up duplicates.)
- **An Education entry with no degree no longer shows a stray comma.** A university with the degree left blank rendered as ", Odessa National University" in the preview and the exported PDF; the separator now appears only when both the degree and the institution are present.
- **Apply-wizard review step: sharper, calmer, more legible.** A design-system pass on the Tailor wizard's score-review step: the score/verdict row and the two-column dimension grid now stack cleanly when the window is narrow (instead of crowding), the per-dimension score bars reveal with a GPU-friendly transform and honour "reduce motion", and the small mono labels (kicker, step counter, cache chip, score-max) moved off the faint tertiary grey - which fell below the contrast floor at 11px - onto a legible secondary tone.
- **The document step shows one clear action per card.** Before a draft exists you now get a single "Generate" button, instead of "Create" and a greyed-out "Regenerate" side by side; once it lands you get "Review" plus "Regenerate". No more guessing which of two buttons to press.
- **A harmless browser hiccup no longer pops a scary error toast.** The "ResizeObserver loop completed with undelivered notifications" message - which the document preview can emit as its layout settles, and which fixes itself - used to surface as an error toast. It is now recognised as benign and swallowed.
- **The wizard no longer looks stuck while a step is working.** Updated score (and document generation) run when you enter their step, and Next is disabled until they finish - correctly. But Back was still live, so stepping back landed you on a page whose Next was greyed out, looking broken. Back is now disabled alongside Next while a step is working, so you simply wait it out on the step that is doing the work.
- **"Review CV" and "Review letter" open on the finished document, not the raw editor.** Reviewing means looking at the result first; the editor now opens in preview mode, and you can switch to Edit when you want to change something.
- **A tailored CV now fills in every section, not just the summary.** Generating a CV in the apply wizard put the whole document into the Summary box and left Experience, Education, Skills, Languages and your contact fields empty. The tailored resume is now read into its real sections the same way an imported or onboarding CV is, so the editor opens with everything in its place.
- **One job now keeps one CV and one cover letter, not a pile of duplicates.** Tailoring, then retailoring, kept creating fresh "<Company> - Tailored CV" documents, so a single application left several near-identical copies in your library. Retailoring now updates the document already attached to the job, and the CV is only written when you actually click Create or Regenerate - never silently on opening the review step.
- **You can no longer skip ahead of the apply wizard while it is still working.** Next and Continue are disabled while the wizard is tailoring, rescoring or generating a document, so you cannot land on a step whose content has not been produced yet.
- **"Run final checks" waits until you have a CV.** The button is disabled, with a short note, until a CV is linked to the application, instead of running the checks against nothing.
- **The Create and Regenerate buttons show they are working.** Generating a CV or cover letter now shows a loading animation on the button rather than only greying it out.

- **The scoring profile no longer claims to be cached after you change your profile.** The card decided it was up to date by asking whether the form had unsaved edits, which is not the same question. Saving cleared the edits, so the moment your scoring analysis actually went out of date was the moment the card started calling it cached again. It now compares your saved profile text against the text the analysis was built from, so a stale analysis says so and you know to regenerate it before your next application.
- **Your phone number is no longer your job title, and your contact details survive a save.** A resume imported through onboarding wrote your details as one run-on line, which the profile form read by position: the phone number landed in "Current role", and your email, website and LinkedIn had no field at all — so the first time you pressed Save in Profile, they were deleted from the profile text for good. That text is what every AI scoring and tailoring call reads, so they were gone from those too. Contacts are now stored under a labelled heading where nothing depends on position, and an existing profile is repaired the moment you open it: the phone goes back to Phone, the address to Location, the website and LinkedIn to their own fields. Open Profile and press Save to write the repair down.
- **Anything the profile cannot file away is kept instead of dropped.** A tagline under your name, a second personal site, a `- GitHub: …` line you added by hand — none of it fits a field, and all of it used to vanish on save. It is now preserved verbatim under a "Notes" heading in the profile text.
- **Exported PDFs are readable by machines again.** Every CV and cover letter exported since WYSIWYG PDF shipped looked correct on the page but carried broken text: "Software Engineer" extracted as "So+ware Engineer" or "SoCware Engineer", "Analytics" as "AnalyGcs", "applications" as "applicaMons". Anything that reads the text rather than looking at it — an applicant tracking system, a recruiter's parser, a copy-paste, Applye's own resume import — got those words. macOS writes the PDF's character map one entry per glyph, and a ligature (the single joined glyph a font draws for pairs like `ft`, `ti`, `fi`, `fl`) stands for two characters and so has no single character to map to; macOS wrote an arbitrary wrong one. Documents now render those pairs as separate glyphs, so the exported text says what the page says. The visual difference is a fraction of a millimetre per pair.
  **If you have already sent out a CV exported from Applye, re-export it** — files produced before this fix keep the broken text layer.
- **Importing a resume with a damaged text layer no longer carries the damage into your CV.** The same macOS flaw affects PDFs from Pages, Word and Preview, so a resume you never exported from Applye can arrive as "Senior Frontend SoCware Engineer". Import now restores those words when the surrounding letters leave no doubt, and says so in the review step's notes so you check rather than trust. It only puts back characters the extraction destroyed — it will not touch a token that is legitimate as written, such as `C++` or `ES6+`, and leaves anything ambiguous exactly as it found it.
- **Re-running onboarding no longer destroys your profile scoring and pitch.** Finishing the wizard a second time wrote the profile row with only the two fields the wizard authors, blanking the scoring analysis and elevator pitch you had generated — both paid AI calls. They now carry through. Changing your resume still marks the scoring stale, which is what prompts Profile to offer a re-score.
- **Re-running onboarding no longer drops your target roles.** The wizard opened blank, so the final screen reported "0 roles selected" and Finish wrote an empty list over the roles you had. Your existing roles are now loaded in, and a fresh suggestion adds to them instead of replacing them.
- **A re-run that only changes targeting is saved.** With no new resume the wizard saved nothing at all, so re-running purely to adjust your roles was a silent no-op. It now keeps your existing profile text and saves the new roles.
- **"Suggest again" no longer throws you off the targeting step.** Asking for fresh role suggestions jumped straight to the final screen, because the suggestion always advanced the wizard regardless of who called it.
- **Re-suggesting keeps the roles you chose.** Roles you typed in by hand were dropped and ones you had unchecked came back. The first suggestion seeds your selection; every later one only adds roles you have not already rejected, and a compensation range you edited is left alone.
- **Skipping the resume no longer shows an empty review screen.** With nothing parsed, the wizard now goes from the resume step straight to targeting, and the review step stays out of reach from both the Back button and the stepper.
- **A key from an earlier run is recognised.** Re-running onboarding with a key already in your OS keychain reported "Not connected" on the final screen; the wizard now reads the keychain per provider on open. A key already in the keychain also survives a later paste that fails or is mistyped, which previously reset the wizard's view of it.
- **A second click on Continue no longer skips a step.** The button stayed live while the resume parse or role suggestion ran, so an impatient double-click started a second (paid) AI call and advanced twice — past Review, or past Targeting to the final screen. Continue and Back now disable while a call is in flight, and Continue says so instead of sitting silently on "Continue".
- **Skipping the resume after it was already parsed actually skips it.** The profile was still written from the parsed resume while the summary said "Skipped"; changing or dropping the resume source now discards what was parsed from it.
- **Skip is hidden on the final step**, where it sat next to Finish and would have discarded the profile you had just built.

### Changed

- **The Profile page was rebuilt to match its redesign.** The AI tools now lead with an icon and read as cards you act on: the scoring profile collapses open to show its summary with a Regenerate control and a freshness chip, and the default pitch carries its own header and Regenerate. Generating either shows a live "working" indicator instead of a silent wait. Each target role is one row - name, how well it fits, and a remove control - with its "when it fits" note tucked underneath, and the section now describes what a target role actually is instead of the old free-text framing. The completeness and freshness cues carry an icon, and the whole page sits on the shared design tokens for light and dark. Nothing about what the page does changed; only how it looks and reads.
- **The Experience field admits it is Markdown.** It holds Markdown, and always has: a resume imported through onboarding fills it with `###` headings, which the field then displayed as if they were a typo. The field is now set in a monospaced typeface and says what it expects, so the headings read as formatting rather than as damage. What you type is unchanged and nothing is reformatted for you.
- **The last onboarding step has one way out.** "Analyze a job" and "Open documents" sat next to "Finish setup", offering three ways to end the same flow and jumping you into the app from a screen that had not saved anything yet. Finish setup is now the only action; it saves, then returns you to the app, where those destinations are a click away in the normal navigation. The summary no longer claims your setup is already saved when it is not.
- **The API key step says what it does.** The button was "Validate" and the result "Key valid", but nothing ever contacts the provider — it is a copy-paste format check plus a save to your OS keychain, and the wording now says so. An invalid or revoked key still surfaces at your first AI action.
- **The review step explains itself**: contact details are editable there, while experience and skills are shown as parsed and refined later in Documents.
- **Removed a duplicated paragraph** on the AI setup step, which printed the same explanation twice, and a mislabelled "Setup —" prefix on the coming-soon note.

### Fixed

- **Discover's location recognition was rewritten - US cities, South American countries and more no longer land in Other.** The classifier now lives in one pure, unit-tested module (42 tests). Whole-word country/city names match anywhere; short codes (`CA`, `DE`, `IN`, `NL`...) match only as a standalone segment or an uppercase token, so `SF, CA` resolves to California, not Canada, and "priorities" no longer matches the city "Rio". Adds South America (Brazil, Argentina, Uruguay, Chile, Colombia, Peru...), every US state plus DC, the Canadian provinces, and Oceania / Middle East / Africa regions with many more cities.
- **Discover cards from RSS feeds that omit a location tag no longer show a blank location.** The scan now falls back to a place-like category tag, a "Location:"/"Standort:" label in the posting body, or "Remote" when the posting is clearly remote-only.
- **Choosing a job-search scope in Settings now actually takes effect.** The scope picker only updated a local field until the page's shared Save button was pressed separately - easy to miss, so a scan could run against Worldwide right after picking Europe. Toggling a region now saves immediately, the same way Discover's own Sources toggles already do.

### Added

- **The Discover feed now leads with roles that match your target roles.** Openings whose title matches one of your profile's Target Archetypes are grouped under "For you", with everything else below under "More openings" - a soft ranking, never a hard filter, so nothing is hidden.
- **You can clear the Discover inbox.** A "Clear list" action (with a confirm dialog and a toast reporting how many were removed) deletes every scanned-but-unsaved job so you can start a clean scan; jobs you already saved stay untouched in My Jobs.
- **The job-search scope can now be several regions at once, including South America, Oceania and the Middle East.** The old single-choice picker (Worldwide / Europe / USA / Asia) is a checkbox grid: pick Europe and Asia together, or any combination of Europe, North America, South America, Asia, Oceania, Middle East and Africa. North America now correctly covers Canada and Mexico too, not only the US.

### Changed

- **The Discover feed no longer loads every scanned job into memory and the DOM at once.** The feed is capped server-side and renders incrementally - about 30 rows at a time, growing as you scroll - instead of mounting the entire list up front.
- **Discover's filter bar and Clear list now stay reachable while you scroll a long feed.** The filter row is pinned to the top of the list instead of living only in the footer, where it required scrolling to the very bottom to reach.
- **The Sources drawer scales better with many sources.** It now opens with a summary bar (how many sources are active, how many are failing, and the current geo scope), and the Built-in / Company boards / Your sources groups are collapsible.

## [0.24.0] - 2026-07-15

The CV and cover-letter editors become WYSIWYG: you edit on the rendered page,
style any element from a contextual panel, and export a PDF that matches what
you saw. Onboarding now hands you a finished CV instead of an empty library.

### Added

- **Onboarding leaves you with a real CV.** The wizard already parsed your resume; it now writes it into Documents as an editable CV instead of only saving a profile, so you no longer import the same file a second time. The starting region template follows your UI language (German → German templates, otherwise generic) and can be changed in Documents. Contact fields you clear in the review step stay cleared in both the profile and the CV.
- **Edit the CV directly on the page preview.** Every region of the rendered page — summary, personal details, each experience field, skills, languages — is selectable by click or keyboard and edits in place. Changes commit on blur or Enter; Escape discards. Structure changes (add / remove / reorder sections, photo, toggles) stay in Edit mode.
- **Contextual live-style panel with three scopes.** Selecting any region opens a style panel (font, size, weight, colour, line-height) that applies to **this element**, **this section**, or the **whole document** — most specific wins, cascading down to the active theme. Section titles get their own **this title** / **all titles** scopes. "Reset all styling" lives in the panel footer.
- **CV visual themes.** Two built-in themes: Classic (the existing look) and Aurora (teal accent, uppercase ruled section headers, two-line experience entries, Lato). Switching reseeds the base font and accent without wiping per-section overrides. Themes are declarative and sandboxed, separate from layout templates and your own style overrides; an "Import theme…" seam is present but disabled.
- **Per-element underlines.** Any element or section can carry a line in solid, dotted, or dashed style with its own colour and thickness, inheriting element → section → theme.
- **Inline bold.** Mark important words in the CV summary and experience bullets with `**word**`, via a Bold button or Cmd/Ctrl+B. Carries through to preview, DOCX, and PDF.
- **Discrete page cards.** The CV and cover-letter previews render as real separate page cards captioned "Page i of N", split at entry level so a section title never separates from its first entry, and the paper stays white in both app themes.
- **Photo header placement.** Three slots — left, centre, right — with the photo sitting beside the name and contact block for left and right. Honoured in the preview, the WYSIWYG PDF, and DOCX.
- **CV photo upload.** Pick a local image (jpg/jpeg/png/webp via native file dialog), crop to a fixed 3:4 frame (German Bewerbungsfoto proportions) with zoom and reposition, preview it on the CV when "Include photo" is on, and embed it in DOCX and PDF exports (LaTeX export intentionally omits the photo). Photo stored locally in the CV document as a base64 data URI. Rust `cv_photo_read_file` command; printpdf `embedded_images` feature. i18n EN+DE.
- **CV default template, rebuilt.** All built-in region templates (DE-ATS-modern, DE-traditional, US, UK, generic) now guarantee a Personal Details section, matching a reference ATS layout: bold-emphasis parsing, grouped skills, contact-line formatting, and title/website/LinkedIn fields (with a "pull from profile" action). Experience and Education entries and bullets can now be added/removed directly in the editor. Fixed AI-import truncation handling (configurable token cap + JSON repair) so long resumes import cleanly.
- **CV editor per-section style constructor.** Font, size, colour, and weight can now be set per section (Personal Details, Summary, Experience, Education, Skills, Languages) via an inline "Style" popover, inheriting from the global default with a one-click "reset to common". The global style row gained a font-weight control (Light/Normal/Semibold/Bold) and was restyled to match the design system.
- **CV editor visual redesign, matched to the Claude Design source-of-truth spec.** Region, toggles, and global font/size/accent controls now live in one flat panel with dividers instead of separate cards; the region select shows the full name ("DE — Germany"), and "Default for this region" is a custom checkbox matching the design's checkbox styling. Section headers gained a drag handle, Style trigger, AI-regenerate, and move-up/move-down controls. Skills moved from a raw text area to interactive chip editing per group (add/remove skills and groups inline). Languages moved from a text area to per-row language + CEFR-level (A1–C2, Native, or no level) inputs with add/remove. Experience and Education entries are now bordered cards with icon-driven add/remove actions instead of plain dividers and "×" buttons.

- **Paginated page preview with numeric margins, and WYSIWYG PDF export.** The CV and cover-letter previews are now real fixed-proportion A4 / Letter sheets with dashed page-break guides and a page-count indicator, so page size is visible and multi-page documents show where they break. Margins became four independent numeric millimetre inputs (top / right / bottom / left, 0–50 mm, clamped) replacing the Narrow / Normal / Wide presets; an overflow warning appears when a single block is taller than the usable page. **PDF export is now WYSIWYG**: "Export PDF" in the preview prints the on-screen sheet through the system dialog ("Save as PDF"), so the PDF matches the preview exactly (print styles pin the sheet to light "paper" colours regardless of app theme). DOCX honours the four-side millimetre margins. Stored in `style_json`; legacy documents with the old margin preset are mapped to millimetres on read (narrow→12.7, normal→20, wide→30) and default to A4 / 20 mm. i18n EN+DE.

### Changed

- **Cover letters export as a PDF, silently.** Export no longer opens the system print dialog: a hidden window renders the letter and writes the PDF straight to disk, so what you see in the preview is what lands in the file. DOCX was removed from every cover-letter surface (the library list and the jobs wizard), matching the CV library's PDF-only policy. The Rust DOCX renderer remains only as the non-macOS fallback.
- **Real fonts embedded in PDF export.** PDFs previously approximated a custom font (Calibri, Lato) with the nearest of the 14 base PDF families. Metric-clone TTFs are now embedded, so the PDF matches the editor and the DOCX.
- **Edit mode is smaller.** The document-wide "body text" and "section titles" style groups are gone, superseded by the live-style panel. Edit mode now shows only the page group (size, margins) and the region and photo toggles.
- **Cover-letter editor redesigned** to match the CV editor: AI draft with tone and length controls, per-block styling, and block-level regeneration with caching.
- **PDF export for CV and cover letter moved from the library list to the document preview.** Because WYSIWYG PDF prints the rendered preview, the "PDF" option was removed from the list export menu (DOCX, and LaTeX for CVs, remain there); a note points users to the preview's Export PDF. The Rust `printpdf` renderer is retired from the CV / cover-letter library path (the AI-tailored job-application export still uses it, unchanged).
- **CV & cover-letter export now honors editor styles, and DOCX/PDF match.** Library exports render from one shared, section-tagged block model, so DOCX and PDF are structurally identical, and both now apply the font, size, colour, and weight chosen in the editor — including per-section and per-paragraph overrides — instead of dropping them at export. The PDF photo moved from a top-right overlay (which could overlap long headings) to the same inline top box as DOCX. Note: PDF uses the 14 built-in PDF fonts, so a custom font (Calibri, Lato) is mapped to the nearest base family in PDF while DOCX keeps the exact font name; embedding fonts for exact PDF rendering is a follow-up. The AI-tailored job-application CV export path is unchanged (still document-wide default style, no photo).

### Fixed

- **Live-style controls now show what is actually on the page.** A style control could report "None" while a visible line was rendered, because it read only its own layer instead of tracing the element → section → theme cascade. Titles, body text, and experience entry lines all report the rendered value.
- **"All experiences" now reaches an entry you had styled individually.** A colour change at section scope silently skipped entries carrying their own override; a wider scope now clears the narrower ones it covers.
- Changing the line size or colour for a single experience entry no longer restyles every experience entry.
- Section line toggle, square rule corners, and entry/photo line defects.
- CV editor preview mode now fills the whole detail pane and shows only the rendered CV — the region selector, include-photo/birthdate/marital-status toggles, and style controls no longer leak into the preview. Edit mode no longer reserves empty space for a preview column that isn't shown (the two modes never actually render side by side). Added missing spacing between the "Pull from profile" action and the Personal Details fields below it.

### Known limitations

- Line-height and the per-element styling from the live panel apply to the preview and the WYSIWYG PDF only. The CV library list's PDF export ignores them; use the preview's Export PDF for a full-fidelity file.
- Onboarding cannot detect a duplicate when the resume was pasted rather than uploaded, so deliberately re-running the wizard and pasting the same resume writes a second CV. Delete the extra in Documents.

## [0.23.0] - 2026-07-07

### Added

- **Profile page, humanized (completeness-first "1A" layout).** The Profile screen is now a structured single-column form (target roles, strengths, notes) instead of a raw-markdown-only editor. It leads with a completeness hero, then strengths and notes, uses Lucide icons throughout, and flattens the form fields into a single card. A raw-markdown toggle stays for power users, and an AI summary view surfaces strengths and notes. Target-role archetypes render as rich, name-based cards instead of plain rows. The "Markdown profile" section is now labelled "Profile". EN + DE.

### Fixed

- Inline errors across the Pipeline, Profile, and Interview Prep screens are now mirrored to toast notifications instead of failing silently. Toast dismissal timers are cleared when a toast is dropped on cap overflow (no stale auto-dismiss), and a dead i18n key was removed.
- The custom titlebar can drag the window again — the window start-dragging capability was missing.

## [0.22.0] - 2026-07-06

### Added

- **First-run onboarding wizard.** A skippable first-run overlay configures an AI provider key (with a per-provider beginner guide) and builds the user's profile from an uploaded or pasted resume, with AI-suggested target archetypes and compensation ranges the user reviews and confirms before anything is saved. Everything runs locally; the provider key is stored in the OS keyring, never in the database or logs. Skipping shows a "finish setup" banner on the dashboard, and onboarding can be re-run any time from Settings or Profile.
- **Documents — Cover Letter module (ROADMAP §16, step 1c of 1a–1d).** Fill the Cover Letter tab with a list + detail view. Renders cover letters of `docType === 'cover_letter'` from the document library. Split editor layout: left = structured block editor (address block, date, subject, greeting, body paragraphs list, closing, signature), each with cache-matched AI regeneration; right = live business letter style preview. Adds a Cover Letter Tailoring action directly to the Job Detail page, allowing body-paragraph rewriting (using the `cover-letter-tailor` skill) to match the selected job, creating/linking the document, and opening the editor. Registered new prompt skills `cover-letter-generate` and `cover-letter-tailor` in the Rust backend. Added back-navigation tab preservation (carrying the active tab parameter) and direct export capabilities (DOCX & PDF formats) from the cover letter list rows. Added a transient "Saved" checkmark visual feedback UX indicator on the main save button in both CV and Cover Letter detail views. Replaced metadata region text inputs with dropdown selectors matching the design system in both CV and Cover Letter detail interfaces. Added target job selection dropdown to the CV baseline generation modal; when a job is chosen, it automatically incorporates target job description context into the generation prompt and links the created CV to the corresponding application row.
- AIF Core foundation for AI-assisted development: shared agent context, Claude Code skills and read-only specialist subagents, Cursor rules, token/context/model policies, and security/privacy trust docs.

## [0.21.0] - 2026-07-06

### Added

- **Documents — CV module (ROADMAP §16, step 1b of 1a–1d).** The Documents sidebar item is real: a CV | Cover Letter tab switch (Cover Letter stays a placeholder until 1c). CV list shows label, region/language tags, and a default badge, with open/duplicate/export/delete row actions. CV detail page adds a section constructor — Angular CDK drag-and-drop reorder, photo/birth-date/marital-status field toggles with a non-blocking, market-aware ATS-risk note, per-section AI regenerate (cached by input hash), and saving an arrangement as a named custom `cv_templates` row. Import your own CV (DOCX/PDF via native file dialog → new `cv-import` skill, one cached AI call) with a preview step to fix mis-parsed bits before saving as an editable library doc. Generate a market/archetype baseline from your profile and template choice via a new `cv-generate-baseline` skill (distinct from the existing job-specific `resume-tailoring` skill). CV export reuses the existing DOCX/PDF byte generators; `applications.cv_path` stays the frozen apply-time snapshot and is never rewritten by a library edit.
- **Documents — CV style/ATS safety + LaTeX export (ROADMAP §16.5–16.6, step 1d, folded into 1b's branch).** CV detail page adds a font/size/accent-colour style section with always-visible recommended-value hints and a deterministic, 0-token `check_style_safety` check: two honestly distinct note types — ATS text-parsing risk (font choice, size) vs print/readability risk (colour, e.g. Agentur für Arbeit greyscale printing) — that only appear once a value leaves the safe default (Calibri 11pt, dark grey). Export gains a LaTeX source (`.tex`) format alongside DOCX/PDF, generated by clean string templating and never compiled (no TeX toolchain bundled); a non-blocking note clarifies it's tuned for print quality, not ATS parsing. DE CV exports use the `Lastname_Vorname_Lebenslauf.ext` filename convention when a full name is available.
- Fixed the CV constructor's photo/birth-date/marital-status toggles rendering as oversized, overlapping boxes (a blanket input style rule was catching the checkboxes too) — restyled as chip toggles, and added a Preview mode that renders the CV read-only in its real section order before exporting.

## [0.20.0] - 2026-07-05

### Added

- **Documents library — data layer.** Additive migration `0011_documents_library.sql` adds `document_library` and `cv_templates` (per ROADMAP §12) plus nullable `applications.cv_document_id` / `cover_letter_document_id`, with built-in CV templates seeded (DE-traditional, DE-ATS-modern, US, UK, generic). Rust and `libs/core`/`libs/data` types synced. No feature UI yet — schema foundation for the CV & Cover Letter library (ROADMAP §16, step 1a of 1a–1d).

## [0.19.0] - 2026-07-05

### Added

- **Follow-up drafting.** Overdue Pipeline cards now offer a "Draft follow-up" action in the quick-view modal that drafts a polite follow-up email from the company, role, and days-overdue via the `followup.md` skill (one AI call, cached per application + language + model). The draft is editable and opens the user's own mail client pre-filled via `mailto:` — Applye never sends it. EN + DE.

## [0.18.1] - 2026-07-05

### Added

- Pipeline board now has a **Cancelled** column. The status already existed
  in filters and the quick-view modal, but there was no kanban column to
  drag a card into or see it land — that gap is closed.

## [0.18.0] - 2026-07-05

### Changed

- **Tailor & apply wizard redesigned to 3 symmetric steps** (was 4, with a
  near-empty portal-answers step): Review score → Tailor CV → Export &
  apply. Stepper and the footer's "Step X of 3" counter now always agree.
- Step 1 (Review score) is a compact recap — score + verdict pill, recruiter
  verdict text, and an equal-height 2-column dimension breakdown — instead
  of re-rendering the full Job Detail scoring page inside the wizard.
- Step 2 (Tailor CV) now surfaces a collapsible **Changes** panel (expanded
  by default, explicit Hide/Show toggle, icon-coded rows) and an
  **always-visible, non-collapsible Gaps** panel — what the tailoring pass
  intentionally left as a flagged gap rather than fabricated.
- Step 3 merges Export and Apply into one screen; applying without an
  export is allowed (with an honest warning), never blocked.
- Single exit control (Close, on the progress rail) — the footer Back
  button now purely navigates steps, and returns to the job summary from
  step 1 instead of duplicating Close.
- Removed the portal-answers step from this wizard entirely (that flow
  belongs to interview prep) and all its copy.
- "Mark as applied" now calls the same status-transition command the
  pipeline board's drag-and-drop uses, instead of duplicating the
  applied-date / follow-up-date computation on the frontend — one source
  of truth for `status_history` and `follow_up_at`.

## [0.17.0] - 2026-07-05

### Added

- Job Detail screen redesigned: card-based scoring view (gauge, dimension cards, missing-keyword chips, red-flags, ATS check) replaces the long scroll.
- 5-step apply/tailor wizard (Review score → Portal answers → Tailor CV → Export → Apply) with Back/Next navigation, one step visible at a time.
- Apply step adds Mark Applied action within the new wizard flow.

## [0.16.3] - 2026-07-03

### Changed

- **Profile screen rework for clarity and design consistency**:
  - Fixed raw hardcoded English strings that bypassed i18n (`Last saved …`,
    `Save failed …`, `Profile is empty …`, `Generated — N in / N out`, etc.)
    — all now go through `libs/i18n`, EN+DE, with `{placeholder}` interpolation.
  - "+ Add target role" is now a visible `appButton` secondary control
    instead of a plain link-styled button.
  - Added plain-language info-icon tooltips (hover/focus) for Profile
    (master Markdown CV, source of truth), Target roles (archetypes), and
    Scoring profile — explaining it's a compact JSON generated once from the
    Markdown and reused for every scoring/tailoring call to save tokens,
    auto-refreshed on save, never hand-edited.
  - Markdown editor: larger padding, clearer "Markdown profile" header, the
    `# Name · Title …` scaffold hint is now a visually distinct dashed
    "Example structure (not saved)" box separated from the editable
    textarea, and the editor column is capped at a readable `72ch`.
  - Scoring profile is now a collapsible card titled "Scoring profile
    (auto-generated)", pretty-printed/padded JSON output, a proper
    secondary Regenerate button, and a "cached · 0 tokens" chip when the
    profile is unchanged since the last save.
  - Default pitch card restyled to match, with a visible secondary
    Regenerate button.
  - Replaced undefined CSS custom properties (`--radius-md`, `--border`,
    `--surface-3/4`) with real design tokens (`--radius-card`,
    `--border-default`, `--surface-sunken`) throughout the page.

## [0.16.2] - 2026-07-03

### Fixed

- **Sidebar AI/API status indicator** — removed the pulsing `applye-ai-pulse`
  keyframe animation (and its now-unused `--dur-ai-pulse` token) from the
  status dot next to Profile; it read as a distracting blinking light rather
  than a status glance. The dot is now static, the mode label reflects the
  actual `Settings.aiMode` ("API" or "CLI") instead of always showing "API",
  and a tooltip ("AI mode: Direct API" / "AI mode: Local CLI") was added,
  translated across all 6 locales.

## [0.16.1] - 2026-07-03

### Changed

- **Settings polish** — buttons now use the shared design-system variants
  (`btn--primary`/`secondary`/`ghost`/`danger`) instead of page-local CSS:
  Save settings and Send a test prompt are primary, Replace/Save key is
  secondary, Remove is a new `btn--danger` variant, and the health panel's
  Re-run check moved off a stray `btn-ghost` class onto the shared one.
  Added the `danger` variant to `ButtonDirective` and `.btn--danger` to
  `libs/ui/src/styles/global.scss`, token-driven via `--danger`/`--danger-tint`.
- Replaced remaining hardcoded Settings copy with i18n keys (EN+DE): model
  labels, API key actions, the Test connection section/button, and the
  "Test tier" toggle, renamed to "Test connection uses" with a one-line
  helper explaining what it controls.
- Restyled `<select>`/`<input>` controls in Settings with hover/focus states
  and a token-only CSS chevron (no image asset) for visual consistency with
  the rest of the app.

## [0.16.0] - 2026-07-03

### Added

- **Interview Prep is real** — fills the sidebar stub. `interview_stages`
  already existed in the schema (migration `0001`) with no `CHECK`
  constraint on `status`, so the full lifecycle (`scheduled` /
  `awaiting_scheduling` / `awaiting_response` / `passed` / `rejected` /
  `cancelled`) needed no new migration, just an app-level enum. `stage_type`
  gains an explicit `other` fallback.
  - List (`/interview-prep`): every application with ≥1 stage, current
    stage + status badge + next date, soonest-upcoming first — reads the
    same `db_pipeline_cards` join the Pipeline board uses, no new command.
  - Detail (`/interview-prep/:applicationId`): full CRUD — add (type +
    required free-text label + date/language/interviewer/notes), inline
    status change, edit, delete, move up/down via adjacent `stage_order`
    swaps. Not a fixed template: any number of stages, any order, any
    wording.
  - New commands: `create_interview_stage`, `update_interview_stage`
    (partial patch), `delete_interview_stage`, `list_interview_stages`.
  - **Rejection sync, not a new status path**: `update_interview_stage`
    reuses the same `db_set_application_status_core` drag-and-drop and the
    quick-view modal already call — whenever a stage's status becomes
    `rejected` (at ANY stage position, not just the last one), the parent
    application moves to `rejected` and `status_history` gets a new row.
    `cancelled` never triggers this.
  - Pipeline card footer on INTERVIEW-column cards now shows "Stage N ·
    &lt;label&gt;" with a small subordinate status dot — deliberately not a
    third color badge next to the legitimacy tier and priority flag.
  - Quick-view modal: read-only "Interview stage" row + "View all stages"
    link, **except** right after a transition into `interview` with 0
    existing stages, when a skippable quick-add mini form appears instead
    (fires at most once per application). The same modal is reused for the
    drag-and-drop trigger — dragging a card into INTERVIEW opens it
    pre-focused on the mini form instead of building a second popover.

## [0.15.0] - 2026-07-02

### Added

- **Pipeline quick-view modal.** Clicking a Pipeline card (drag still works
  unchanged — CDK's own drag-threshold keeps the two separate) opens a fast
  triage modal: status dropdown, priority flag (none/low/medium/high), an
  oldest→newest comment thread, and an "Open full details" link to
  `/jobs/:id`. The modal is deliberately shallow — no score, JD, tailoring,
  or portal-answers content, that stays on the full Job Detail screen.
  - Status changes go through the _same_ `db_set_application_status`
    command the kanban drag-and-drop already used — no second status-update
    path, so `status_history` is written identically either way.
  - New additive migration `0009_pipeline_priority_comments.sql` adds
    `applications.priority` and a new `application_comments` table. Any
    existing non-empty `applications.notes` is copied in as that
    application's first comment during migration; the `notes` column is
    left in place as legacy, never dropped.
  - New commands `set_application_priority`, `add_application_comment`,
    `list_application_comments`.
  - The priority flag renders as an outlined flag icon (blue/amber/red for
    low/medium/high) — deliberately distinct from the existing green/
    yellow/red legitimacy-tier badge so the two are never confused on the
    same card. It also shows in the card's top-right corner on the board
    itself, not just inside the modal.

## [0.14.0] - 2026-07-02

### Added

- **Job Tracker now matches the user's real xlsx tracker 1:1 (19 fields).**
  New additive migration `0008_tracker_fields.sql` adds `jobs.tech_stack` and
  `applications.source_url` / `contact_name` / `contact_role` /
  `contact_channel` / `next_action` / `next_action_at` / `salary_range` —
  purely `ALTER TABLE ADD COLUMN`, dogfooding data preserved.
  - Tracker screen shows all 19 fields (company, role, tech stack,
    location, source link, contact name/role/email-or-LinkedIn, outreach
    type, sent-on, interview #1, follow-up #2, status, next action + date,
    salary range, contract type, Blue Card threshold, EOR provider, notes)
    with per-column show/hide and horizontal scroll.
  - Inline-edit for contact, next action, salary range, and notes — a
    dedicated `db_update_application_tracker_fields` patch command touches
    only those 7 columns so it never clobbers `cv_path` /
    `cover_letter_path` / `application_method` on save.
  - The Agentur für Arbeit PDF/Excel export now states the applicant name
    and generated date and adds a contact column to the official layout
    (period, applicant, date, table of date/company/position/method/
    status/contact) — 0 tokens, unchanged.
  - The `import-tracklist` skill and Rust import pipeline now detect and
    round-trip all 8 new columns from an imported xlsx/csv into the right
    place.

## [0.13.1] - 2026-07-02

### Changed

- **My Jobs controls now use the shared design system.** Added a token-driven
  `[libButton]` directive in `libs/ui` (`primary`/`secondary`/`ghost`
  variants, `sm`/`md` sizes). The top-bar "+ Paste Job" button is now
  primary and "Import file" is secondary, both with matched icon size and
  spacing. The status/legitimacy/score filter controls were normalized to
  share height, border, radius, focus ring, and placeholder color with the
  search input — verified in both light and dark themes.

## [0.13.0] - 2026-07-02

### Added

- **"+ Paste Job" is now functional**, wired to both the topbar and My Jobs
  buttons via a single shared modal with two tabs:
  - **Paste text** — pastes straight into the existing pipeline (Rust parse
    - hard filter + legitimacy check + cache check; AI recruiter score/ATS
      run from the job detail page as before). No duplicated logic.
  - **From link** — a URL is classified server-side by `classify_job_url`
    against a legal-first allowlist (open/ATS/RSS sources only:
    `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`,
    `*.jobs.personio.de`, `remotive.com`, `weworkremotely.com`). Allowed
    URLs are fetched via `fetch_job_from_url` (public JSON/RSS APIs only)
    and flow into the same pipeline. Closed boards (LinkedIn, Indeed,
    StepStone, Glassdoor) and any unrecognized domain are never fetched —
    the app only ever opens them in the browser via `tauri-plugin-opener`,
    shows a warning naming the board, and switches to the Paste text tab.
  - A clipboard helper (`tauri-plugin-clipboard-manager`, read-only) offers
    to fill the textarea when the clipboard holds a long, job-shaped text
    block after the user copies it themselves — 0 tokens, never reads a
    browser tab, never auto-submits.
  - All new copy ships in English and German.

## [0.12.5] - 2026-07-02

### Fixed

- Removed the per-page title heading duplicating the topbar's active-route
  title on all 9 remaining pages (Dashboard, Discover, Interview Prep, Job
  Tracker, Documents, Analytics, Settings, Profile, My Jobs) — kept each
  page's description/actions, cleaned up the CSS that only styled the
  removed headings.
- Sidebar logo on macOS previously sat beside the traffic lights on the
  same row, misaligned with the nav icons below. Now sits on its own row
  below the traffic-light cluster, left-aligned flush with the nav.
- `data-tauri-drag-region` wasn't set on the sidebar logo-mark SVG (the
  attribute isn't inherited by children), leaving a small non-draggable
  gap in the header. Added it so the full header row is draggable.

## [0.12.4] - 2026-07-02

### Fixed

- Topbar title showed static "Applye" on every page. `ShellLayoutComponent`
  now maps the active route's top-level segment to its `nav.*` i18n key
  (Dashboard / Discover / My Jobs / Pipeline / Interview Prep / Job Tracker /
  Analytics / Settings / Documents / Profile) via router `NavigationEnd`.
- Native window title bar duplicated the app name above the sidebar's own
  "Applye" wordmark. Cleared the Tauri window title.
- Native title bar was a fixed OS color that didn't follow the app's
  dark/light theme, breaking the sidebar's background at the top edge of
  the window. macOS now runs with `titleBarStyle: "Overlay"` +
  `hiddenTitle` (no-op on Windows/Linux, which keep the native frame), so
  the sidebar background shows through behind the traffic lights. Added
  `data-tauri-drag-region` to the sidebar header and topbar so the window
  stays draggable, and reserved left padding for the traffic-light cluster
  on macOS only.

## [0.12.3] - 2026-07-02

### Fixed

- Sidebar header and main topbar had mismatched height/padding, so their bottom
  border lines didn't align at the seam. Introduced a shared `--app-header-h`
  token in `libs/ui/tokens.css` and applied identical height + zero vertical
  padding to both `.sidebar__logo` and `.topbar` in `shell-layout.component.scss`
  — the two divider lines now meet exactly.

### Changed

- Replaced the plain-text "Applye" sidebar wordmark with the same SVG mark used
  on the applye.dev site (indigo accent, `currentColor` + token-driven fill).
  Canonical SVG now lives in `libs/ui/assets/applye-mark.svg`, wired into the
  desktop build via a new `assets` glob in `apps/desktop/project.json`.

## [0.12.2] - 2026-07-02

### Fixed

- **PR #22 (v0.12.1) fixed the wrong file.** `TranslateService` reads from
  `libs/i18n/src/lib/translations/translations.ts` (a hand-maintained
  nested TS object) — the `en.json`/`de.json`/etc. files in that same
  folder are dead, unimported by anything at runtime. All i18n work across
  Phases 6.5–6.7 and the previous "fix" edited only the dead JSON files,
  so none of it ever reached the running app. This release makes the same
  50 additions (portal answers, follow-up cadence, health check, archetype
  hints, import-tracklist strings, nav labels, etc.) directly in
  `translations.ts` for both `en` and `de` (`ru`/`es`/`fr`/`uk` inherit
  automatically via the existing `stub(en, …)` pattern), and **deletes the
  6 dead JSON files** so this mistake can't recur.
- `apps/desktop/src/i18n-keys.spec.ts` now imports `TRANSLATIONS` from
  `@applye/i18n` (newly exported from the package barrel) instead of
  reading `en.json`, so it actually gates the real runtime source. Added a
  second guard asserting `TRANSLATIONS.de` has the same key set as `en` —
  no silent drift between the two fully-maintained locales.

## [0.12.1] - 2026-07-01

### Fixed

- **21 missing i18n keys** (EN + DE) that rendered as raw dotted strings
  (e.g. `jobs.mark_applied`) instead of real text: 18 pre-existing gaps in
  Job Detail (Mark as Applied, Add to Pipeline, Export DOCX/PDF, Score/
  Re-score, Start over, etc.) and My Jobs (table columns, search/filter
  labels, paste-job modal), plus 3 nav sidebar labels (Discover, Tracker,
  Analytics). None of these were introduced by Phases 6.5–6.7 — a full
  scan turned up debt going back further.
- Fixed `apps/desktop/src/app/app.spec.ts`, which imported a nonexistent
  `./nx-welcome` module and could never run — this silently meant `nx test
desktop` (the CI test target for this project) always failed regardless
  of what else was true, so no test suite in this project could ever gate
  a merge. Replaced with a minimal smoke test.

### Added

- `apps/desktop/src/i18n-keys.spec.ts` — a fast, deterministic guard test
  that scans every `.ts`/`.html` file under `apps/desktop/src/app` for
  `t()('namespace.key')`-shaped references (including the dynamic/ternary
  call sites) and fails if any resolved namespace key is absent from
  `en.json`. Runs as part of `nx test desktop`, so a missing key now fails
  the build instead of silently rendering as a raw string.

## [0.12.0] - 2026-07-01

### Added

- **First-launch health check (Phase 6.7).** A deterministic, 0-token
  diagnostics report — OS keychain key presence (never a network call),
  SQLite read/write, the sqlx migration ledger, bundled Tauri capabilities,
  and export-folder writability — shown once on first launch and re-runnable
  any time from Settings. Gated by `settings.health_check_seen`, persisted in
  SQLite (not localStorage), so it survives across windows/profiles.
- A failing or warning check never blocks the user — "Continue" is always
  available, in line with the augmentation principle. Whether a stored API
  key actually _works_ stays a separate, explicitly user-triggered action
  (Settings' existing "Test connection") — the health report only ever says
  "stored" or "not stored yet", never "valid".

## [0.11.0] - 2026-07-01

### Added

- **Follow-up dates + overdue badges (Phase 6.6).** Moving an application
  into `applied` or `interview` (via kanban drag or "Mark as Applied") now
  (re)computes `follow_up_at` deterministically in SQL from the settings
  cadence (`followup_days_after_apply` / `followup_days_after_interview`,
  default 7/5 days) — 0 AI tokens, computed in the same transaction as the
  `status_history` write. Terminal statuses (`offer`/`rejected`) leave
  `follow_up_at` untouched. A manually-edited follow-up date is never
  silently recomputed — only a fresh status transition touches it.
- Pipeline kanban cards show an amber "Overdue" badge once `follow_up_at`
  has passed, computed in the same SQL query as the rest of the card (no
  extra round trip).
- Settings now exposes both cadence values ("Days after applying" / "Days
  after interview") under a new "Follow-up reminders" section.

## [0.10.0] - 2026-07-01

### Added

- **Portal answer drafting (Phase 6.5).** A collapsible "Draft portal
  answers" section in Job Detail drafts answers to a job portal's
  open-ended questions ("Why this role?", "Why this company?", ...) from
  the user's compact scoring profile and the job description. One AI call
  (`portal-answers.md`, quality model) per question set; result is cached
  in `portal_answers` by `(job_id, profile_hash, input_hash)` where
  `input_hash` covers the question set + language + model, so re-opening
  the job with the same questions is a 0-token read.
- Editable question templates (add/remove), an answer-language selector
  defaulting to the application's `doc_language`, and per-answer editable
  boxes with a copy-to-clipboard button. "Another version" re-drafts a
  single answer with a fresh AI call, cached under its own key.
- Augmentation guarantee: Applye only ever drafts and caches text here —
  there is no code path that transmits or submits an answer anywhere. The
  user copies it and pastes it into the portal themselves.

## [0.9.0] - 2026-07-01

### Added

- **Import tracklist (Phase 6.4).** "Import file" in My Jobs picks a CSV,
  XLSX, JSON, or plain-text export from another job tracker via the native
  file dialog. One AI call (`import-tracklist.md`, economy model) detects
  the column structure and extracts rows — status normalization, dedupe,
  and the insert are all deterministic Rust + SQL, 0 tokens. XLSX is read
  with `calamine` (converted to CSV-like text for the AI call); CSV/JSON/
  text are forwarded as raw text.
- Preview shows a per-row checkbox table before anything is written:
  status strings ("Submitted", "Screening", "Declined", ...) normalized to
  saved/applied/interview/offer/rejected; rows matching an existing job by
  lower(company)+lower(role) are flagged as already-existing; rows the
  skill couldn't use (e.g. missing company) are listed with a reason.
  Nothing is inserted until the user confirms.
- Confirm inserts a `jobs` row (plus an `applications` row carrying the
  normalized status) per selected row, tagging `imported_from` as
  `import_csv` / `import_xlsx` / `import_json` / `import_text`. Duplicates
  are re-checked at insert time — re-importing the same file adds nothing
  twice.

## [0.8.0] - 2026-07-01

### Added

- **Before-you-submit notes (Phase 6.3).** The `job-scoring.md` skill now
  also returns `before_you_submit`: 2-4 short, concrete reminders grounded in
  the job's JD and Phase 6.2 legitimacy notes (e.g. "Salary not listed —
  research market rate before applying"). Produced in the same `ai_run` call
  as the score — no second request, 0 extra tokens. Stored in
  `scoring_cache.before_you_submit_json`, part of the existing cache key
  (job, profile, JD hash, language, model), so reopening a scored job shows
  the notes at 0 tokens. Job Detail renders them as a collapsible checklist
  directly under the score section; hidden when empty.

## [0.7.0] - 2026-07-01

### Added

- **Legitimacy check (Phase 6.2).** Deterministic, 0-token Rust pattern
  matching runs in the paste pipeline after the hard filter, before any AI
  scoring: green/yellow/red tier plus human-readable notes, stored on the
  job row. Yellow triggers: no salary mentioned, "wear many hats" with no
  team size, posting over 90 days old, vague "other duties as
  assigned/required" scope. Red triggers: no company name (or conflicting
  company mentions), application directed to a personal email domain
  (gmail/hotmail/yahoo/outlook.com), an implausibly wide salary range, or
  the same JD template already saved under a different company.
  Augmentation, not a gate — a red job can still be scored and tailored if
  the user chooses; My Jobs shows a badge (none/amber/red) and Job Detail
  shows the triggered notes plus a non-blocking warning banner for red.

## [0.6.0] - 2026-06-30

### Added

- **Navigation restructure (Phase 5).** The sidebar is reorganised into
  Dashboard, Discover (stub), My Jobs, Pipeline, Interview Prep (stub),
  Job Tracker, Analytics (stub), and Settings.
- **My Jobs** (`/jobs`): the full job database as a sortable, filterable,
  searchable table (Company, Role, Score, Status, Legitimacy, Date Added,
  Source) over a new read-only query, with a paste-job modal.
- **Job Detail** (`/jobs/:id`): the existing scoring and 3-pass tailoring
  wizard, now opened per job (cached score shown, 0 tokens on open), with
  Add to Pipeline and Mark as Applied actions.
- **Job Tracker** (`/tracker`): the Agentur fuer Arbeit "Eigenbemuehungen"
  report. A table over applications + jobs + status history with date-range
  and status filters, a summary footer (total, response rate, avg days to
  response), and PDF / Excel(CSV) export.

### Changed

- **Pipeline** now shows only active applications (applied, interview, offer,
  rejected); saved jobs live in My Jobs. A job enters the board via Add to
  Pipeline / Mark Applied.

## [0.5.0] - 2026-06-30

### Added

- **DeepSeek provider** (API mode). A new OpenAI-compatible request path in
  `ai/api.rs` routes the `deepseek` provider to `api.deepseek.com`, with the
  Anthropic path untouched. Models `deepseek-v4-pro` (quality) and
  `deepseek-v4-flash` (economy), selectable in Settings; the API key is stored
  per provider in the OS keychain, never in the database or logs.

### Security

- **Privacy disclosure for DeepSeek.** Settings shows a clear note that DeepSeek
  is a China-based cloud provider and that, in API mode, the job description and
  profile text are sent to its servers. AI remains opt-in; on-device users can
  pick another provider.

## [0.4.0] - 2026-06-30

### Added

- **applye.dev website** (`apps/web`): static landing page, three-zone
  documentation, a methodology page explaining the recruiter check, a blog
  placeholder, and this changelog, all on the shared design tokens.
- Lucide icon set across the desktop shell navigation and page components.
- **Schema sync (Phase 4.5):** additive migration
  `0006_career_ops_features.sql` reconciling the live SQLite schema with
  ROADMAP §12. New columns on `profile`, `jobs`, `scoring_cache`,
  `settings`, `sources`, and `company_research`, plus two new cache tables
  (`portal_answers`, `pattern_analysis`). Purely additive: existing
  dogfooding data is preserved. Rust, `libs/core`, and `libs/data` types
  synced; no feature logic yet.

### Changed

- Disabled GitHub Actions workflows while the repository is private.

## [0.3.1] - 2026-06-29

> Note: this release was tagged (`v0.3.1` → `6bc1f73`) but the version in
> `package.json` / `Cargo.toml` / `tauri.conf.json` was never bumped — it stayed
> at `0.3.0` until the `0.4.0` bump. So `v0.3.1` is the one tag whose manifest
> does not match its name. The tag is correct about what shipped; the manifest
> is simply missing a bump that cannot be added retroactively without inventing
> a commit. Left as-is deliberately.

### Added

- Multi-OS release pipeline (tauri-action) with Tauri auto-updater wiring.
- Internationalization: English and German translations, plus empty, loading,
  and error states across the UI.
- Public README and an architecture overview in `docs/`.

### Changed

- Locked the DOCX and PDF export dependencies.

### Security

- Configured the updater signing public key in `tauri.conf.json`.

## [0.3.0] - 2026-06-28

The version moved from `0.1.0` straight to `0.3.0`; `0.2.0` was never tagged.

### Added

- AI spine: `ai_run` abstraction, skill-file loader, OS keyring for secrets,
  and the Settings screen.
- Rich profile editor with a compressed scoring profile and a default pitch.
- Paste-a-job scoring with a deterministic hard filter and a hash cache.
- Three-pass CV tailoring wizard with DOCX and PDF export.
- Pipeline kanban (Angular CDK) with automatic status history.
- Design tokens and the application shell.
- Quality gates: git hooks and CI.

### Fixed

- Pipeline loading and error state converted to signals for zoneless change
  detection.

## [0.1.0] - 2026-06-27

### Added

- Phase 1 data spine: SQLite schema, Tauri commands, and the profile vertical
  slice.

[Unreleased]: https://github.com/vitala89/applye/compare/v0.25.0...HEAD
[0.25.0]: https://github.com/vitala89/applye/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/vitala89/applye/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/vitala89/applye/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/vitala89/applye/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/vitala89/applye/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/vitala89/applye/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/vitala89/applye/compare/v0.18.1...v0.19.0
[0.18.1]: https://github.com/vitala89/applye/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/vitala89/applye/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/vitala89/applye/compare/v0.16.3...v0.17.0
[0.16.3]: https://github.com/vitala89/applye/compare/v0.16.2...v0.16.3
[0.16.2]: https://github.com/vitala89/applye/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/vitala89/applye/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/vitala89/applye/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/vitala89/applye/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/vitala89/applye/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/vitala89/applye/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/vitala89/applye/compare/v0.12.5...v0.13.0
[0.12.5]: https://github.com/vitala89/applye/compare/v0.12.4...v0.12.5
[0.12.4]: https://github.com/vitala89/applye/compare/v0.12.3...v0.12.4
[0.12.3]: https://github.com/vitala89/applye/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/vitala89/applye/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/vitala89/applye/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/vitala89/applye/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/vitala89/applye/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/vitala89/applye/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/vitala89/applye/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/vitala89/applye/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/vitala89/applye/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/vitala89/applye/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/vitala89/applye/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vitala89/applye/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/vitala89/applye/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/vitala89/applye/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/vitala89/applye/releases/tag/v0.1.0
