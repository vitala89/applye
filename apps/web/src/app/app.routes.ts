import { Route } from '@angular/router';
import { Landing } from './landing';
import { Blog } from './blog';
import { Methodology } from './methodology';
import { DocsLayout } from './docs/docs-layout';

export const appRoutes: Route[] = [
  { path: '', component: Landing, title: 'Applye: Drafting is automated. Submitting is not.' },
  {
    path: 'methodology',
    component: Methodology,
    title: 'Methodology: how the recruiter check works',
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
  { path: 'blog', component: Blog, title: 'Applye Blog' },
  { path: '**', redirectTo: '' },
];
