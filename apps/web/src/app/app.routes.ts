import { Route } from '@angular/router';
import { Landing } from './landing';
import { Blog } from './blog';
import { Methodology } from './methodology';
import { Changelog } from './changelog';
import { DocsLayout } from './docs/docs-layout';

export const appRoutes: Route[] = [
  { path: '', component: Landing, title: 'Applye: Drafting is automated. Submitting is not.' },
  {
    path: 'methodology',
    component: Methodology,
    title: 'Methodology: how the recruiter check works',
  },
  {
    path: 'manifesto',
    loadComponent: () => import('./manifesto').then((m) => m.Manifesto),
    title: 'The augmentation manifesto · Applye',
  },
  {
    path: 'compare',
    loadComponent: () => import('./compare').then((m) => m.Compare),
    title: 'Compare · Applye',
  },
  {
    path: 'press',
    loadComponent: () => import('./press').then((m) => m.Press),
    title: 'Press kit · Applye',
  },
  {
    path: 'sustain',
    loadComponent: () => import('./sustain').then((m) => m.Sustain),
    title: 'Sustain · Applye',
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy').then((m) => m.Privacy),
    title: 'Privacy · Applye',
  },
  {
    path: 'docs',
    component: DocsLayout,
    children: [
      {
        path: '',
        loadComponent: () => import('./docs/pages').then((m) => m.Overview),
        title: 'Applye Docs',
      },
      {
        path: 'guide/tour',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTour),
        title: 'First run & tour · Applye Docs',
      },
      {
        path: 'guide/profile',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideProfile),
        title: 'Set up your profile · Applye Docs',
      },
      {
        path: 'guide/add-job',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideAddJob),
        title: 'Add your first job · Applye Docs',
      },
      {
        path: 'guide/score',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideScore),
        title: 'Score a role · Applye Docs',
      },
      {
        path: 'guide/tailor',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTailor),
        title: 'Tailor & export PDF · Applye Docs',
      },
      {
        path: 'guide/discover',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideDiscover),
        title: 'Discover · Applye Docs',
      },
      {
        path: 'guide/track',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideTrack),
        title: 'Pipeline & Tracker · Applye Docs',
      },
      {
        path: 'guide/insights',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideInsights),
        title: 'Interviews & Analytics · Applye Docs',
      },
      {
        path: 'guide/settings',
        loadComponent: () => import('./docs/guide-pages').then((m) => m.GuideSettings),
        title: 'Settings & AI · Applye Docs',
      },
      {
        path: 'requirements',
        loadComponent: () => import('./docs/pages').then((m) => m.Requirements),
        title: 'Requirements · Applye Docs',
      },
      {
        path: 'install',
        loadComponent: () => import('./docs/pages').then((m) => m.Install),
        title: 'Install · Applye Docs',
      },
      {
        path: 'flow',
        loadComponent: () => import('./docs/pages').then((m) => m.Flow),
        title: 'The core flow · Applye Docs',
      },
      {
        path: 'judgement',
        loadComponent: () => import('./docs/pages').then((m) => m.Judgement),
        title: 'Code vs LLM judgement · Applye Docs',
      },
      {
        path: 'ai',
        loadComponent: () => import('./docs/pages').then((m) => m.BringAi),
        title: 'Bring your own AI · Applye Docs',
      },
      {
        path: 'scoring',
        loadComponent: () => import('./docs/pages').then((m) => m.Scoring),
        title: 'Reading the recruiter check · Applye Docs',
      },
      {
        path: 'german',
        loadComponent: () => import('./docs/pages').then((m) => m.German),
        title: 'German market · Applye Docs',
      },
      {
        path: 'privacy',
        loadComponent: () => import('./docs/pages').then((m) => m.Privacy),
        title: 'Privacy · Applye Docs',
      },
      {
        path: 'legality',
        loadComponent: () => import('./docs/pages').then((m) => m.Legality),
        title: 'Source legality · Applye Docs',
      },
      {
        path: 'status',
        loadComponent: () => import('./docs/pages').then((m) => m.Status),
        title: 'Status · Applye Docs',
      },
    ],
  },
  { path: 'changelog', component: Changelog, title: 'Applye Changelog' },
  { path: 'blog', component: Blog, title: 'Applye Blog' },
  { path: '**', redirectTo: '' },
];
