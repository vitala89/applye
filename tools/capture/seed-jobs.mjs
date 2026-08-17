// The eight jobs behind the documentation screenshots.
//
// Split out of `seed.mjs`, which was over its size budget.
//
// Every date here is a RELATIVE day offset, never a timestamp, which is what
// lets a re-shoot two hours later produce the same screenshots: `seed.mjs`
// resolves them against one `NOW` stamped at the start of the run.

//
// Statuses and dates are chosen so the Dashboard has something in every tile:
// one interview scheduled three days out, one follow-up already overdue, one
// offer, and a rejection so the funnel is not a straight line. Legitimacy tiers
// cover all three values the app assigns: green, yellow and red.

export const JOBS = [
  {
    company: 'Northlane Systems',
    title: 'Senior Frontend Engineer',
    location: 'Berlin, Germany',
    salaryMin: 78000,
    tier: 'green',
    notes: null,
    createdDaysAgo: 21,
    status: 'interview',
    appliedDaysAgo: 18,
    followUpDaysAgo: null,
    jd: `Own our customer console end to end. Angular 20, TypeScript, RxJS, a Node BFF.
You will lead the migration off the legacy dashboard, set the testing bar and review
most of the frontend work that ships.

Requirements: 5+ years with a component framework, strong TypeScript, accessibility
audit experience, German B1 for internal meetings.

EUR 78,000 - 92,000 per year. Hybrid, two days on site in Berlin.`,
    // Statuses are the ones create_interview_stage_core writes and the UI reads
    // (see InterviewStageStatus): a cleared round is `passed`, a booked one is
    // `scheduled` with a date, and a round that exists but has no date yet is
    // `awaiting_scheduling`.
    //
    // Only two rounds here, and the booked one is deliberately last. The
    // Dashboard's "upcoming interviews" reads the CURRENT stage, and
    // db_pipeline_cards defines that as the highest stage_order that is not
    // rejected or cancelled (see applications.rs). Adding a third, undated
    // round would make the undated one current and the counter would read zero
    // while an interview sat three days away. The three-round timeline lives on
    // Pellworm Digital instead.
    stages: [
      { order: 1, type: 'hr_screen', label: 'Screening call', daysFromNow: -9, status: 'passed' },
      {
        order: 2,
        type: 'technical',
        label: 'Technical round',
        daysFromNow: 3,
        status: 'scheduled',
      },
    ],
  },
  {
    company: 'Marlowe & Fen',
    title: 'Staff Frontend Engineer',
    location: 'Berlin, Germany',
    salaryMin: 100000,
    tier: 'green',
    notes: null,
    createdDaysAgo: 40,
    status: 'offer',
    appliedDaysAgo: 35,
    followUpDaysAgo: null,
    jd: `Staff role across three product teams. Set frontend direction, own the architecture
of the next client, mentor six engineers. Angular, TypeScript, a shared design system,
a heavy accessibility commitment.

Requirements: 8+ years, prior staff or principal scope, migrations delivered without a
freeze.

EUR 100,000 - 115,000 per year. Berlin or remote within CET +/- 2.`,
    stages: [],
  },
  {
    company: 'Kestrel Analytics',
    title: 'Frontend Platform Engineer',
    location: 'Remote, EU',
    salaryMin: 75000,
    tier: 'green',
    notes: null,
    createdDaysAgo: 14,
    status: 'applied',
    appliedDaysAgo: 12,
    followUpDaysAgo: 4,
    jd: `Platform team of four. Own the design-system package, the build pipeline and the
release train for six product teams. Angular, Nx monorepo, Storybook, Playwright.

Requirements: monorepo experience, comfort with build tooling, an eye for API design in
shared components.

EUR 75,000 - 88,000 per year. Remote within the EU.`,
    stages: [],
  },
  {
    company: 'Pellworm Digital',
    title: 'Senior Web Engineer',
    location: 'Hamburg, Germany',
    salaryMin: 80000,
    tier: 'green',
    notes: null,
    createdDaysAgo: 9,
    status: 'interview',
    appliedDaysAgo: 7,
    followUpDaysAgo: null,
    jd: `Rebuilding a booking flow that serves 40,000 sessions a day. TypeScript everywhere,
Angular on the front, a small Rust service behind it. Every release is measured against a
Core Web Vitals budget.

Requirements: senior frontend experience, measurable performance work, weekly pairing
with designers.

EUR 80,000 - 95,000 per year. Hybrid in Hamburg.`,
    // The three-round timeline guide/interview-timeline.png needs: one cleared,
    // one booked, one that exists but has no date yet. It sits here rather than
    // on Northlane because the undated round becomes the current stage and would
    // empty the Dashboard's upcoming-interview counter.
    stages: [
      { order: 1, type: 'hr_screen', label: 'Screening call', daysFromNow: -4, status: 'passed' },
      {
        order: 2,
        type: 'technical',
        label: 'Technical round',
        daysFromNow: 9,
        status: 'scheduled',
      },
      {
        order: 3,
        type: 'final',
        label: 'Final conversation',
        daysFromNow: null,
        status: 'awaiting_scheduling',
      },
    ],
  },
  {
    company: 'Vantaform GmbH',
    title: 'Fullstack Engineer (frontend-heavy)',
    location: 'Munich, Germany',
    salaryMin: null,
    tier: 'yellow',
    notes: 'No salary range stated.',
    createdDaysAgo: 6,
    status: 'saved',
    appliedDaysAgo: null,
    followUpDaysAgo: null,
    jd: `Roughly 70% frontend, 30% Node services. An internal logistics tool used by 300
staff: dense tables, offline-tolerant forms, printable reports.

Requirements: TypeScript, a component framework, some SQL, German B2 for stakeholder
interviews.

Salary: competitive. Hybrid in Munich.`,
    stages: [],
  },
  {
    company: 'Cindertree Studio',
    title: 'Frontend Developer',
    location: 'Remote, Europe',
    salaryMin: null,
    tier: 'yellow',
    notes: 'No salary range stated. Team size not given.',
    createdDaysAgo: 5,
    status: 'saved',
    appliedDaysAgo: null,
    followUpDaysAgo: null,
    jd: `Agency work: three to five client projects a year, mostly marketing sites and
configurators. Expect a new codebase every quarter and a lot of animation work.

Requirements: solid CSS, one component framework, comfort switching stacks, portfolio
required.`,
    stages: [],
  },
  {
    company: 'Umbra Labs',
    title: 'Angular Engineer',
    location: 'Berlin, Germany',
    salaryMin: 70000,
    tier: 'red',
    notes:
      'Unpaid trial task. "We are a family" with no team size. Weekend releases stated as normal.',
    createdDaysAgo: 4,
    status: 'saved',
    appliedDaysAgo: null,
    followUpDaysAgo: null,
    jd: `Small team, fast pace. We are a family and we work hard and play hard. Looking for
someone stress-resistant who can wear many hats and is not a clock-watcher. Occasional
weekend releases before a launch are normal here.

Process: unpaid trial task first, interview after.

EUR 70,000 per year.`,
    stages: [],
  },
  {
    company: 'Roosterhill Media',
    title: 'UI Engineer',
    location: 'Cologne, Germany',
    salaryMin: 62000,
    tier: 'green',
    notes: null,
    createdDaysAgo: 47,
    status: 'rejected',
    appliedDaysAgo: 44,
    followUpDaysAgo: null,
    jd: `Publishing house, editorial tooling. Maintain the article editor and the newsletter
builder the newsroom uses every day.

Requirements: 2+ years frontend, care for editorial workflows, German C1 because the
newsroom works in German.

EUR 62,000 - 70,000 per year. On site in Cologne.`,
    stages: [],
  },
];
