import { Route } from '@angular/router';
import { Landing } from './landing';
import { Docs } from './docs';
import { Blog } from './blog';
import { Methodology } from './methodology';

export const appRoutes: Route[] = [
  { path: '', component: Landing, title: 'Applye: Drafting is automated. Submitting is not.' },
  {
    path: 'methodology',
    component: Methodology,
    title: 'Methodology: how the recruiter check works',
  },
  { path: 'docs', component: Docs, title: 'Applye Docs' },
  { path: 'blog', component: Blog, title: 'Applye Blog' },
  { path: '**', redirectTo: '' },
];
