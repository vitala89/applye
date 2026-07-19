import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO } from './site';

interface CompareRow {
  label: string;
  applye: string;
  saas: string;
  cli: string;
  sheet: string;
}

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './compare.html',
})
export class Compare {
  readonly repo = REPO;

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
      label: 'German market (Eigenbemühungen, DE documents)',
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
