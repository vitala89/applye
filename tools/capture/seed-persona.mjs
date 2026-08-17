// The demo persona the documentation screenshots are all of.
//
// Split out of `seed.mjs`, which was over its size budget. It is also a
// responsibility of its own: this is who the captures are about, and it changes
// when the story does rather than when the seeding machinery does.
//
// NO REAL DATA. Mira Halvorsen is invented and contact details use example.com,
// which RFC 2606 reserves so the address can never belong to anyone.

export const PROFILE_MD = `# Mira Halvorsen
Senior Frontend Engineer

## Contact
- First name: Mira
- Last name: Halvorsen
- Location: Berlin, Germany
- Email: mira.halvorsen@example.com
- Phone: +49 30 0000 0000
- Website: example.com/mira
- LinkedIn: linkedin.com/in/example-mira

## Experience
### Senior Frontend Engineer - Halden Interactive
Berlin, Germany · 2022 - Present
- Led the rebuild of a customer console used by 12,000 accounts, moving it off a jQuery admin without a feature freeze.
- Cut the largest bundle from 1.9 MB to 640 KB by splitting the editor route and dropping three overlapping date libraries.
- Introduced accessibility review as a release gate; the console now passes WCAG 2.2 AA on every shipped screen.
- Mentored three engineers, two of whom now run their own areas.

### Frontend Engineer - Sorenson Grid
Oslo, Norway · 2019 - 2022
- Built the component library six product teams still ship on, including its dark theme and its documentation site.
- Owned the migration from a hand-rolled build to a monorepo with cached tasks, cutting CI from 22 to 7 minutes.
- Wrote the offline-tolerant form layer used by field engineers on unreliable connections.

## Skills
TypeScript, Angular, RxJS, Node.js, Nx, Playwright, Jest, CSS architecture, Web performance, Accessibility (WCAG 2.2), Design systems, SQL

## Education
BSc Computer Science, University of Bergen (2015 - 2018)

## Languages
English C1, Norwegian native, German B1

## Compensation
85000 - 105000 EUR per year

## Notes
Open to hybrid in Berlin or remote within CET +/- 2. Not looking to relocate.
`;

export const ARCHETYPES = [
  {
    name: 'Senior Frontend Engineer',
    fit: 'primary',
    sellWhen:
      'The role owns a product surface end to end and expects the frontend to set its own quality bar.',
  },
  {
    name: 'Frontend Platform Engineer',
    fit: 'secondary',
    sellWhen:
      'The team runs a design system or a monorepo and needs someone who has already paid for those mistakes once.',
  },
  {
    name: 'UI Engineer',
    fit: 'adjacent',
    sellWhen:
      'The work is closer to craft than to architecture, and the pay band still clears the target.',
  },
];
