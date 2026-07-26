# Handoff prompt: produce the website's media

Copy everything below the line into a fresh Claude Code session. It is written to be pasted as-is.

The session it opens has one job: turn the 26 placeholder boxes on applye.dev into real
screenshots, GIFs and video, one asset at a time, with the maintainer capturing and the agent
specifying, verifying and wiring in.

---

I am finishing applye.dev before its public launch. The site is live at
`https://applye.pages.dev`, deliberately not indexable, and the only thing left before launch is
its media: 26 placeholder boxes in the documentation guide.

Start by reading, in this order:

1. `docs/internal/AGENT_START_HERE.md`
2. `AGENTS.md`
3. `docs/product/CURRENT_STATE.md`
4. the two most recent entries in `docs/internal/DUTY_WATCH.md`
5. `docs/product/MEDIA_SHOTLIST.md` - the full inventory, with capture rules and priorities
6. `apps/web/src/app/docs/guide-pages.ts` - where every placeholder actually lives

Then run the Plan Check from `AGENTS.md` and tell me where this sits.

## What I want from you, per asset

Work through the shot list in priority order. Take **one asset at a time** and, before I capture
anything, give me all four of these:

**1. What it is.** Screenshot, GIF or video, its exact filename and destination path, which page
and which section of that page it appears in, and what the surrounding prose already claims - the
asset has to show what the text next to it says, or the page becomes a lie. Quote the sentence it
sits under.

**2. Exactly how it should look.** Not a restatement of the shot list line. Be concrete and
specific enough that I could hand it to someone who has never seen the app:

- which screen, which tab, which mode
- what state the app must be in: how many jobs, which statuses, which tiers, empty or populated
- what must be visible in frame, and what must not be
- window size, theme, and where the frame starts and ends (full window, or a tight crop of what)
- for GIF and video: the exact sequence of actions, what the viewer should understand from each
  beat, and how long it should run
- anything that must be redacted or faked, and what to replace it with

**3. The setup work I have to do first.** Most of these need seeded data: a demo profile, six to
ten realistic jobs at different statuses, a scored job, a tailored CV. Tell me precisely what to
create before I can capture this one shot, and say when several shots can share one setup so I do
not seed the same data five times.

**4. A prompt I can hand to an agent.** Self-contained, no reference to our conversation. See the
next section for what kind of prompt.

## About those prompts: capture, do not invent

**Product screenshots must be captured from the running app.** Do not write me prompts for an
image-generation model to draw an Applye screenshot. A generated picture of a UI that does not
exactly match the shipped app is a false claim about the product, in documentation whose entire
argument is that this project is honest about what it does. It would also be obvious - generated
UI does not survive being compared against the real thing.

So the prompt you write me for each screenshot, GIF and video is a **capture prompt**: instructions
for an agent that runs the real desktop app, drives it into the required state, and records. It
should state which app to build and launch, the exact steps to reach the state, what to verify is
on screen before capturing, the capture settings from the shot list, and where to write the file.
If that agent cannot drive the app, the same prompt has to work as a checklist for me doing it by
hand.

Two exceptions where generation is legitimate, because nothing is being misrepresented:

- `manifesto-signature.png` - a handwritten-style signature image
- the press kit's layout and any purely decorative brand asset

For those, write an actual generation prompt, and say plainly that it is one.

## How we work

- One asset at a time. I capture, I tell you the file is in place, you wire it in.
- When you wire one in: replace the placeholder `<figure class="docs__media">` block with a real
  `<img>` or `<video>`, keep the `<figcaption>`, add width and height so the page does not shift
  while loading, add `loading="lazy"` below the fold, and write alt text that describes what the
  image shows rather than naming it.
- After each asset: run the checks that apply, and tell me honestly which you ran.
- Keep `docs/product/MEDIA_SHOTLIST.md` accurate as we go - move finished rows to "Already
  produced" rather than leaving the list describing work that is done.

## Things you need to know that are not obvious

- **GitHub Actions cannot run** - billing is blocked on this private repository, so every workflow
  fails in seconds without starting. The CI gate is currently decorative. Local gates are the only
  protection, so run them properly and do not assume a green tick anywhere.
- **Deployment is manual**: `npm run web:deploy`, which needs `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` in the environment. It runs format, lint and tests first and refuses to
  upload if they fail. Do not deploy without telling me.
- **The site is held out of search on purpose.** `X-Robots-Tag: noindex` in
  `apps/web/public/_headers`, cross-checked against `SEARCH_INDEXABLE` in
  `apps/web/src/app/site.ts` by a test. Do not remove either until the media is done and I say we
  are launching.
- **No real data in any capture.** No real recruiter or company contacts, no real email addresses,
  no visible API key - the settings shot must show a redacted field. Invent plausible companies.
- **Every shot must look like the same app on the same day**: dark theme, 1440x900 logical pixels
  captured at 2x, the same seeded profile throughout. The capture rules at the top of the shot
  list are binding; read them before writing any spec.
- The repository is still private and the desktop release is not out. The site ships in coming-soon
  mode (`COMING_SOON`, `SOURCE_PUBLIC` in `site.ts`). Nothing in this work should flip those.

## Start here

Give me the full inventory first: every outstanding asset grouped by priority, with a one-line
statement of what each is and roughly what setup it needs, plus your recommended order accounting
for shots that can share one setup. Then stop and wait - do not start writing specifications until
I have picked where to begin.

The single most important asset is `guide/tour-walkthrough.mp4`, the two-to-three minute narrated
walkthrough on `/docs/guide/tour`. Expect to spend real effort on its script.
