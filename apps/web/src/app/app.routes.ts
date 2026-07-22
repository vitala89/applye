import { Route } from '@angular/router';
import { LOCALES } from './i18n/locales';
import { de } from './i18n/messages/de';
import { es } from './i18n/messages/es';
import { pl } from './i18n/messages/pl';
import { ru } from './i18n/messages/ru';
import { uk } from './i18n/messages/uk';
import { Landing } from './landing';
import { Blog } from './blog';
import { Methodology } from './methodology';
import { Changelog } from './changelog';
import { DocsLayout } from './docs/docs-layout';

/**
 * Every route carries a `description` in `data`, which `SeoService` writes into
 * the meta description and the Open Graph / Twitter tags on navigation. A route
 * without one falls back to the site default, so add one when adding a page.
 * `tools/generate-sitemap.mjs` reads this same file to build sitemap.xml.
 */
/**
 * Localised landing pages. Only the landing page and the shell are translated;
 * the rest of the site is English, and the translated page says so instead of
 * linking into documentation the reader cannot follow.
 */
const TRANSLATED = { de, es, pl, ru, uk };

const localeLandingRoutes: Route[] = LOCALES.filter(
  (l): l is typeof l & { code: keyof typeof TRANSLATED } => l.code !== 'en',
).map((locale) => {
  const bundle = TRANSLATED[locale.code];
  return {
    path: locale.code,
    component: Landing,
    title: bundle.meta.title,
    data: { locale: locale.code, description: bundle.meta.description },
  };
});

export const appRoutes: Route[] = [
  {
    path: '',
    component: Landing,
    title: 'Applye: Drafting is automated. Submitting is not.',
    data: {
      locale: 'en',
      description:
        'A free, open-source, local-first desktop app for an AI-powered job search. Blunt recruiter checks, tailored CVs, a pipeline kanban. Your data, your machine, your AI.',
    },
  },
  ...localeLandingRoutes,
  {
    path: 'methodology',
    component: Methodology,
    title: 'Methodology: how the recruiter check works',
    data: {
      description:
        'How Applye scores a role: what plain code decides at zero tokens, where the AI is allowed to judge, and why the score is an argument rather than a verdict.',
    },
  },
  {
    path: 'manifesto',
    loadComponent: () => import('./manifesto').then((m) => m.Manifesto),
    title: 'The augmentation manifesto · Applye',
    data: {
      description:
        'The augmentation principle behind Applye: AI drafts, you decide and submit. Why the app will never auto-apply on your behalf.',
    },
  },
  {
    path: 'compare',
    loadComponent: () => import('./compare').then((m) => m.Compare),
    title: 'Compare · Applye',
    data: {
      description:
        'Applye next to cloud SaaS trackers, CLI pipelines and a spreadsheet: price, privacy, local paperwork, and who each one is actually for.',
    },
  },
  {
    path: 'press',
    loadComponent: () => import('./press').then((m) => m.Press),
    title: 'Press kit · Applye',
    data: {
      description:
        'Press kit for Applye: quick facts, positioning, brand assets, and contact details for journalists and reviewers.',
    },
  },
  {
    path: 'sustain',
    loadComponent: () => import('./sustain').then((m) => m.Sustain),
    title: 'Sustain · Applye',
    data: {
      description:
        'How to keep Applye alive without a paywall: star it, tell one person, contribute, or sponsor. And what the project will never do.',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy').then((m) => m.Privacy),
    title: 'Privacy · Applye',
    data: {
      description:
        'Applye keeps your job search in one local SQLite file. No account, no cloud, no telemetry. What that means in practice, and how to verify it.',
    },
  },
  {
    path: 'cookies',
    loadComponent: () => import('./cookies').then((m) => m.Cookies),
    title: 'Cookies & analytics · Applye',
    data: {
      description:
        'What applye.dev measures: optional, consent-gated analytics with anonymised IPs and no ad signals. Change or revoke your choice at any time.',
    },
  },
  {
    path: 'docs',
    component: DocsLayout,
    children: [
      {
        path: '',
        loadComponent: () => import('./docs/pages').then((m) => m.Overview),
        title: 'Applye Docs',
        data: {
          description:
            'The honest version of how Applye works: what runs as plain code, where AI is allowed to judge, what stays on your machine, and where to start.',
        },
      },
      {
        path: 'guide/tour',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTour),
        title: 'First run & tour · Applye Docs',
        data: {
          description:
            'What happens the first time you open Applye: the local database, the dashboard, and a tour of every screen in the sidebar.',
        },
      },
      {
        path: 'guide/dashboard',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideDashboard),
        title: 'The Dashboard · Applye Docs',
        data: {
          description:
            'Read the Dashboard: four counters, a generated "needs attention" queue for follow-ups, stale scores and unfinished tailoring, and quick actions.',
        },
      },
      {
        path: 'guide/profile',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideProfile),
        title: 'Set up your profile · Applye Docs',
        data: {
          description:
            'Fill in the profile Applye scores every job against: experience, skills, languages, target roles, and a compensation target.',
        },
      },
      {
        path: 'guide/add-job',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideAddJob),
        title: 'Add your first job · Applye Docs',
        data: {
          description:
            'Add a role by pasting the description or a URL, and see how code parses, hard-filters, and legitimacy-tiers it before any AI runs.',
        },
      },
      {
        path: 'guide/score',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideScore),
        title: 'Score a role · Applye Docs',
        data: {
          description:
            'Run the blunt recruiter check: a fit score, missing keywords, the red flags a screener would catch, and a plain ATS pass or fail.',
        },
      },
      {
        path: 'guide/tailor',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTailor),
        title: 'Tailor & export PDF · Applye Docs',
        data: {
          description:
            'Draft a tailored CV and cover letter in three passes, review every line, and export an ATS-safe PDF that you send yourself.',
        },
      },
      {
        path: 'guide/discover',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideDiscover),
        title: 'Discover · Applye Docs',
        data: {
          description:
            'Read the Discover feed: archetype-fit tier badges, the zero-token score behind the For-you order, and the filters that shape it.',
        },
      },
      {
        path: 'guide/documents',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideDocuments),
        title: 'Documents library · Applye Docs',
        data: {
          description:
            'Import, generate, edit and export CVs and cover letters: section-level styling, templates, photo and font ATS warnings, DOCX and PDF output.',
        },
      },
      {
        path: 'guide/track',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTrack),
        title: 'Pipeline & Tracker · Applye Docs',
        data: {
          description:
            'Move roles from saved to applied to interview to offer on the kanban, and keep follow-ups from quietly going cold in the tracker.',
        },
      },
      {
        path: 'guide/insights',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideInsights),
        title: 'Interviews & Analytics · Applye Docs',
        data: {
          description:
            'Prepare for an interview from the role you already saved, and read the analytics that show where your applications actually stall.',
        },
      },
      {
        path: 'guide/settings',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideSettings),
        title: 'Settings & AI · Applye Docs',
        data: {
          description:
            'Connect an AI source: a direct API key, or the CLI subscription you already pay for. Plus language, theme, and data controls.',
        },
      },
      {
        path: 'requirements',
        loadComponent: () => import('./docs/pages').then((m) => m.Requirements),
        title: 'Requirements · Applye Docs',
        data: {
          description:
            'What you need to run Applye: a desktop OS and, optionally, one AI source. No account, no terminal, no cloud service to sign up for.',
        },
      },
      {
        path: 'install',
        loadComponent: () => import('./docs/pages').then((m) => m.Install),
        title: 'Install · Applye Docs',
        data: {
          description:
            'Install Applye on macOS, Windows, or Linux and get through first-run setup in about three minutes.',
        },
      },
      {
        path: 'flow',
        loadComponent: () => import('./docs/pages').then((m) => m.Flow),
        title: 'The core flow · Applye Docs',
        data: {
          description:
            'The daily loop from paste to submit, and exactly which step is plain code and which step calls a model.',
        },
      },
      {
        path: 'judgement',
        loadComponent: () => import('./docs/pages').then((m) => m.Judgement),
        title: 'Code vs LLM judgement · Applye Docs',
        data: {
          description:
            'Where Applye draws the line between deterministic code and model judgement, and why that split keeps a real search costing cents.',
        },
      },
      {
        path: 'ai',
        loadComponent: () => import('./docs/pages').then((m) => m.BringAi),
        title: 'Bring your own AI · Applye Docs',
        data: {
          description:
            'Use your own API key, or bridge a CLI subscription you already pay for: Claude Code, Codex, or Gemini. AI is opt-in and never runs unasked.',
        },
      },
      {
        path: 'scoring',
        loadComponent: () => import('./docs/pages').then((m) => m.Scoring),
        title: 'Reading the recruiter check · Applye Docs',
        data: {
          description:
            'How to read a score honestly: what the number means, what the deductions mean, and when you should argue with it.',
        },
      },
      {
        path: 'local-markets',
        loadComponent: () => import('./docs/pages').then((m) => m.LocalMarkets),
        title: 'Local markets · Applye Docs',
        data: {
          description:
            'Applye works in any country. What differs by market - documents in six languages, CV conventions, visa awareness, and the German Eigenbemühungen report.',
        },
      },
      {
        path: 'privacy',
        loadComponent: () => import('./docs/pages').then((m) => m.Privacy),
        title: 'Privacy · Applye Docs',
        data: {
          description:
            'The technical privacy notes: where the database lives, what leaves the machine when you call an AI provider, and how to delete everything.',
        },
      },
      {
        path: 'data',
        loadComponent: () => import('./docs/pages').then((m) => m.DataAndBackup),
        title: 'Your data & backup · Applye Docs',
        data: {
          description:
            'Where Applye stores your database and keys on macOS, Windows and Linux, how to back it up or move machines, and how to delete everything.',
        },
      },
      {
        path: 'troubleshooting',
        loadComponent: () => import('./docs/pages').then((m) => m.Troubleshooting),
        title: 'Troubleshooting & FAQ · Applye Docs',
        data: {
          description:
            'Fixes for the common problems: AI keys and CLI bridging, empty Discover scans, missing fit badges, cached or stale scores, and document export.',
        },
      },
      {
        path: 'legality',
        loadComponent: () => import('./docs/pages').then((m) => m.Legality),
        title: 'Source legality · Applye Docs',
        data: {
          description:
            'Applye does not scrape closed job boards or bypass logins. Where automated sources exist, they use public JSON APIs.',
        },
      },
      {
        path: 'status',
        loadComponent: () => import('./docs/pages').then((m) => m.Status),
        title: 'Status · Applye Docs',
        data: {
          description:
            'What is shipped today versus what is planned. Applye is pre-launch, so this page tracks shipped behaviour only.',
        },
      },
    ],
  },
  {
    path: 'changelog',
    component: Changelog,
    title: 'Applye Changelog',
    data: {
      description:
        'Every tagged Applye release, reconstructed from the changelog: what changed, what broke, and when.',
    },
  },
  {
    path: 'blog',
    component: Blog,
    title: 'Applye Blog',
    data: {
      description:
        'Notes on building a local-first, AI-assisted job-search tool, and on the job search that prompted it.',
    },
  },
  { path: '**', redirectTo: '' },
];
