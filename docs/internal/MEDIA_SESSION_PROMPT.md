# Handoff prompt: finish the website's media

Copy everything below the line into a fresh Claude Code session. It is written to be pasted as-is.

Fourteen of the twenty-five guide placeholders are already real screenshots, captured from the
running desktop app on 2026-07-27. This prompt opens the session that finishes the remaining
eleven. The previous session's full account is the top entry of `docs/internal/DUTY_WATCH.md`.

---

I am finishing applye.dev before its public launch. The site is live at `https://applye.pages.dev`,
deliberately held out of search, and the only thing left before launch is its media. Fourteen of
twenty-five guide placeholders are done; eleven remain.

**Before you do anything else: read the files below, then give me the list of what is left and your
recommended order, and stop. Do not start capturing until I have picked.**

Read, in this order:

1. `docs/internal/AGENT_START_HERE.md`
2. `AGENTS.md`
3. `docs/product/CURRENT_STATE.md`
4. the two most recent entries in `docs/internal/DUTY_WATCH.md`
5. `docs/product/MEDIA_SHOTLIST.md`, especially its "Already produced" section, which records why
   three shots deviate from their original description
6. `apps/web/src/app/docs/guide-pages.ts` for the placeholders that remain

Then run the Plan Check from `AGENTS.md`.

## What is left

Eleven placeholders, in three groups.

**Continue the wizard that is already open (2 shots).** A tailoring run completed on Northlane
Systems and the apply wizard is sitting on step 2 with its result intact. Carrying it to steps 4 and
5 writes rows into `document_library`, which is what `guide/documents-library.png` and
`guide/cv-editor.png` need. Do not re-run the tailoring: it is paid work that is already done.

**Needs its own run (1 shot).** `guide/gap-dialog.png`. No gap question appeared last time, because
the seeded profile answers everything the job asks. To produce one honestly, remove a fact the job
needs (the German level is the obvious one) and tailor again.

**GIFs and video (8 shots).** `paste-job`, `pipeline-drag`, `discover-scan`, `cv-import`,
`profile-regenerate`, `tailor-wizard.mp4`, `tour-walkthrough.mp4`. Read the note on cursor movement
below before promising any of these.

## How this works

- **Product screenshots are captured from the running app. Never generated.** A drawn picture of a
  UI that does not match the shipped app is a false claim about the product, in documentation whose
  whole argument is that this project is honest. The only legitimate generation targets are
  `manifesto-signature.png` and purely decorative brand assets.
- One asset at a time. Capture, show me, wire it in, run the checks, then the next.
- When you wire one in: replace the placeholder `<figure class="docs__media">` block with a real
  `<img>` or `<video>`, keep the `<figcaption>`, set width and height so the page does not shift
  while loading, add `loading="lazy"`, and write alt text that describes what the image shows rather
  than naming the file.
- After each asset: `npm run format:check`, `nx run web:lint`, `nx run web:test`, `nx run web:build`,
  `git diff --check`. Tell me which you actually ran.
- Keep `docs/product/MEDIA_SHOTLIST.md` accurate: move finished rows into "Already produced" and
  record any deviation from the row's original description, with the reason.

## The capture rig, which already works

- **Claude has macOS Screen Recording and Accessibility permission.** The desktop dev build is not
  an `.app` bundle, so the computer-use grant path cannot target it; AppleScript is what works.
- Start the app with `npm run desktop:dev`. Its process is `applye-desktop`.
- Size the window exactly:
  ```
  osascript -e 'tell application "System Events" to tell process "applye-desktop" to set position of window 1 to {80, 80}' \
            -e 'tell application "System Events" to tell process "applye-desktop" to set size of window 1 to {1440, 900}'
  ```
- Capture with `screencapture -x -R80,80,1440,900 out.png`, then confirm 2880x1800 with `sips`.
- **Verify the frontmost process is `applye-desktop` immediately before every single capture.** Two
  frames in the previous session caught something else - once the maintainer's browser on a personal
  login page with a filled password field, once the Claude Code window. Both were deleted before
  they reached the repository. A fixed screen region captures whatever is in front of it.
- **The 5K display must be the main one.** `screencapture` silently returns 1x on the 1920x1080
  screen, which produces 1440x900 files that break the 2x rule without any error.
- **The app does not scroll by keyboard and exposes no scroll bars to accessibility.** Two things
  work: Tab, which pulls the container to the focused field, and a CoreGraphics wheel event posted
  through Python ctypes. A wheel step is roughly 70 logical points; anything above ten steps jumps a
  whole page.
- Clicking is fine, but `System Events` types in whatever keyboard layout is active and produced
  Greek characters last time. Set text through the clipboard (`pbcopy` then Cmd+V) instead.
- **Cursor movement is teleporting, not human.** That is acceptable for `paste-job` and
  `profile-regenerate`, where almost nothing moves. It is not acceptable for `pipeline-drag`, and it
  is not acceptable for either video. Say so plainly rather than shipping something that looks
  robotic; the maintainer records those.

## The demo data

`tools/capture/seed.mjs` fills a throwaway database with the persona (Mira Halvorsen), eight jobs
across every status and legitimacy tier, their interview rounds, and five Discover rows. It refuses
to run without `--i-know-this-wipes-the-db` and copies the database first. `--discover-only`
re-inserts just the Discover rows, which matters because a full re-seed drops the profile and its
scoring profile is real AI output that costs a call to regenerate.

Snapshots of useful database states live in `~/applye-capture-states/`. Take one before any
destructive experiment and restore it afterwards; that is how the quiet-Dashboard shot was produced
without faking anything.

Every company is invented and every domain is `example.com` or `example.org`, which RFC 2606
reserves. No real recruiter, employer, contact or key may appear in any frame.

## Things that are true and non-obvious

- **GitHub Actions cannot run**: billing is blocked, so every workflow fails in seconds. The local
  gates are the only protection. Do not read a green tick anywhere as meaning anything.
- **Deployment is manual**: `npm run web:deploy`, needing `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. It runs format, lint and tests first. Do not deploy without asking.
- **The site is held out of search on purpose** via `X-Robots-Tag: noindex` and `SEARCH_INDEXABLE`
  in `apps/web/src/app/site.ts`, cross-checked by a test. Do not touch either until the media is
  finished and I say we are launching.
- **AI calls spend my own credit.** Ask before each one. Four were spent last session: one scoring
  profile, two scoring runs, one tailoring run.
- **The guide pages have never been seen rendered.** The browser preview pane returns a blank frame
  with `innerWidth` 0, so every "it looks right" claim so far is really "the image is served with
  the right attributes", checked through the DOM. Verifying the pages by eye on
  `http://localhost:4300` is worth doing early.
- Two product defects were found while capturing and are recorded in `CURRENT_STATE.md`, not fixed:
  a row in Interview Prep opens a menu whose only entry deletes the application instead of opening
  its timeline, and a target role whose distinctive word is under three letters ("UI Engineer") can
  never match anything, silently.

## Start here

Give me the eleven outstanding assets grouped as above, each with one line on what it shows and what
it needs, plus your recommended order and which ones you think I should record rather than you. Then
stop and wait for me to choose.
