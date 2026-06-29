import { Route } from '@angular/router';
import { Landing } from './landing';
import { Docs } from './docs';
import { Blog } from './blog';

export const appRoutes: Route[] = [
  { path: '', component: Landing, title: 'Applye: Drafting is automated. Submitting is not.' },
  { path: 'docs', component: Docs, title: 'Applye Docs' },
  { path: 'blog', component: Blog, title: 'Applye Blog' },
  { path: '**', redirectTo: '' },
];
