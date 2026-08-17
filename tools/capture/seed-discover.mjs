// The Discover inbox rows, and the user-added feed they arrive through.
//
// Split out of `seed.mjs`, which was over its size budget. These are separate
// from `JOBS` for a reason the feed enforces: it only shows rows with
// `imported_from = 'discover_scan'`. They are also the only data `--discover-only`
// touches, which is why they are their own module rather than part of the jobs.

/** A user-added feed alongside the built-in sources, so the Sources drawer has
 * a row with a last-scan line. The URL is a reserved example domain and is
 * never fetched by this script. */
export const USER_SOURCE = {
  name: 'Frontend roles (EU)',
  type: 'rss',
  url: 'https://jobs.example.com/frontend.xml',
  lastScanDaysAgo: 0,
};

/**
 * Rows for the Discover inbox. They are separate from JOBS because the feed
 * only shows `imported_from = 'discover_scan'`, and because scanning for real
 * would fill the screenshots with real companies' postings.
 *
 * Titles are chosen to hit each archetype tier, which takes care: `matchArchetype`
 * picks the HIGHEST tier whose distinctive word appears, regardless of how well
 * the rest matches. Any title containing "frontend" therefore reads primary. To
 * show a secondary badge the title must carry "platform" without "frontend", and
 * for adjacent, "ui" without either. `discoverShownAt` stays null so the rows
 * still carry their NEW pill.
 */
export const DISCOVER_JOBS = [
  {
    company: 'Halvard Systems',
    title: 'Senior Frontend Engineer',
    location: 'Berlin, Germany',
    salaryMin: 85000,
    hoursAgo: 2,
    jd: `Own the customer-facing app end to end: Angular, TypeScript, a design system shared with
two other teams. You will set the frontend architecture and review most of what ships.

Requirements: 5+ years, strong TypeScript, accessibility experience.

EUR 85,000 - 98,000 per year. Hybrid in Berlin.`,
  },
  {
    company: 'Nordhaven Labs',
    title: 'Web Platform Engineer',
    location: 'Remote, EU',
    salaryMin: 78000,
    hoursAgo: 5,
    jd: `Platform team owning the component library, the build pipeline and the release train for
five product teams. Nx monorepo, Storybook, Playwright.

EUR 78,000 - 90,000 per year. Remote within the EU.`,
  },
  {
    company: 'Brightfen Studio',
    title: 'UI Engineer',
    location: 'Hamburg, Germany',
    salaryMin: null,
    hoursAgo: 9,
    jd: `Editorial tooling for a publishing house: an article editor and a newsletter builder used
by the newsroom every day.

Requirements: solid CSS, one component framework, care for editorial workflows.`,
  },
  {
    company: 'Steinbeck Interactive',
    title: 'Senior Frontend Engineer (Design Systems)',
    location: 'Remote, CET',
    salaryMin: 82000,
    hoursAgo: 20,
    jd: `Design-system ownership across web and mobile web. Tokens, documentation, migration
support for four product teams.

EUR 82,000 - 95,000 per year.`,
  },
  {
    company: 'Wrenfield Data',
    title: 'UI Engineer, Analytics',
    location: 'Munich, Germany',
    salaryMin: 72000,
    hoursAgo: 30,
    jd: `Dashboards over a large time-series backend. Charting, virtualised tables, performance
budgets that are actually enforced.

EUR 72,000 - 84,000 per year. Hybrid in Munich.`,
  },
];
