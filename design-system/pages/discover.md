# Discover - page deltas

Implemented from the Claude Design handoff `Discover.dc.html` (project
`499b310a-8e21-45d8-a304-2958359dfd30`; brief `docs/design/discover-screen-prompt.md`).
Only deltas from `design-system/MASTER.md` and the mock are recorded here.

## Deltas from the mock

- The mock's sidebar, topbar, page `<h1>`, and theme toggle are the app shell's
  job - the component renders only the content area (`max-width: 940px`).
- The bottom "PREVIEW" state switcher is a demo control - not implemented.
  States are driven by real data: skeleton -> first / never / scanning / feed /
  caughtup (see `view` computed in `discover.component.ts`).
- Scan console lines do not stream per source yet (the backend `discover_scan`
  returns one summary): on scan start every enabled source gets an indigo
  "active" line, and on completion all result lines replace them at once.
  Visual language (mono log, blink cursor, quiet errors) matches the mock.
- Geo filter options are `All locations / Remote / On-site` (derived from
  location text) instead of the mock's static `Germany` demo entry; the source
  select is built from the sources actually present in the feed.
- The ATS row kebab ("More") is a concrete Remove icon-button; builtin sources
  cannot be removed (backend enforces it), only toggled.
- Matched-keyword chips are derived client-side from the profile's Target
  Archetypes (mirror of the Rust `derive_title_keywords`), since the engine
  does not persist per-job matches.
- "Save" creates an `applications` row with status `saved` (the job row itself
  already exists from the scan); saved rows dim + show `IN MY JOBS`.

## Component conventions

- BEM prefix `dv-`; tokens only, both themes verified.
- One primary button per view (Scan / Run first scan / Choose sources).
- Buttons and all meta text `--font-mono`; job titles and JD preview
  `--font-sans` (per the brief: titles read better in sans).
