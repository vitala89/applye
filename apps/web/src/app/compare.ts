import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface CompareRow {
  label: string;
  applye: string;
  saas: string;
  cli: string;
  sheet: string;
}

/**
 * One of the three alternatives, stated as a recommendation rather than a
 * column of cells. The page leads with these because the honest answer to
 * "which of these four" is a sentence, not eleven rows - the table below still
 * carries the eleven rows for anyone who wants to check the sentence.
 */
interface Alternative {
  name: string;
  /** What it is and what it costs, in one line under the name. */
  meta: string;
  /** The case where this tool is the better choice than Applye. */
  betterIf: string;
  /** What you give up by choosing it. Never a slur, always a fact. */
  tradeOff: string;
  /** Present only where there is a single project to link to. */
  href?: string;
}

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './compare.html',
})
export class Compare {
  /** The three things a reader is actually choosing between, and why. */
  readonly alternatives: Alternative[] = [
    {
      name: 'Cloud SaaS',
      meta: 'Teal, Huntr, Jobscan. $9-40 / month',
      betterIf: 'You want polish, reminders and a phone in your pocket.',
      tradeOff: 'Your job search lives in their cloud, on a subscription.',
    },
    {
      name: 'career-ops',
      meta: 'CLI pipeline. Free, MIT',
      betterIf: 'You are a developer who already lives in an AI coding CLI.',
      tradeOff: 'Terminal only, and no per-market paperwork logic.',
      href: 'https://career-ops.org',
    },
    {
      name: 'Spreadsheet',
      meta: 'Sheets, Excel. Free',
      betterIf: 'You are tracking five roles and want zero setup.',
      tradeOff: 'Everything after "applied" is manual work.',
    },
  ];

  /** What Applye is good at, and the one thing it is not. */
  readonly strengths: readonly string[] = [
    'Data never leaves your machine',
    'Free, MIT, your own AI keys',
    'Local paperwork, first-class',
  ];

  readonly limitation = 'Desktop only, no phone app';

  readonly rows: CompareRow[] = [
    {
      label: 'Price',
      applye: 'Free, MIT',
      saas: '$9-40 / month',
      cli: 'Free, MIT',
      sheet: 'Free',
    },
    {
      label: 'Where your data lives',
      applye: 'Local SQLite on your machine',
      saas: 'Their cloud',
      cli: 'Local files',
      sheet: 'Cloud (usually)',
    },
    {
      label: 'Interface',
      applye: 'Desktop app (GUI)',
      saas: 'Web app',
      cli: 'Terminal + AI coding CLI',
      sheet: 'Grid of cells',
    },
    {
      label: 'Audience',
      applye: 'Everyone',
      saas: 'Everyone',
      cli: 'Developers',
      sheet: 'Everyone',
    },
    {
      label: 'AI cost model',
      applye: 'Your own keys or CLI subscription, opt-in per call',
      saas: 'Bundled into the subscription',
      cli: 'Your CLI subscription',
      sheet: 'None',
    },
    {
      label: 'JD legitimacy check',
      applye: 'Deterministic, 0 tokens',
      saas: 'Varies',
      cli: 'AI-based',
      sheet: 'Manual',
    },
    {
      label: 'CV tailoring',
      applye: 'Multi-pass, you review every change',
      saas: 'Yes',
      cli: 'Yes (ATS PDF)',
      sheet: 'Manual',
    },
    {
      label: 'Auto-apply',
      applye: 'Never, by principle',
      saas: 'Some do',
      cli: 'Never',
      sheet: 'No',
    },
    {
      label: 'Local paperwork (visa, DE Eigenbemühungen, per-market CV norms)',
      applye: 'First-class',
      saas: 'No',
      cli: 'No',
      sheet: 'Manual',
    },
    {
      label: 'Open source',
      applye: 'Yes',
      saas: 'No',
      cli: 'Yes',
      sheet: 'n/a',
    },
    {
      label: 'Works offline',
      applye: 'Yes, core loop is 0-token',
      saas: 'No',
      cli: 'Partly',
      sheet: 'Partly',
    },
  ];
}
