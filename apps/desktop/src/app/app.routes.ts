import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'discover',
    loadComponent: () =>
      import('./pages/discover/discover.component').then((m) => m.DiscoverComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'jobs',
    loadComponent: () => import('./pages/jobs/my-jobs.component').then((m) => m.MyJobsComponent),
  },
  {
    path: 'jobs/new',
    loadComponent: () => import('./pages/jobs/jobs.component').then((m) => m.JobsComponent),
  },
  {
    path: 'jobs/:id',
    loadComponent: () => import('./pages/jobs/jobs.component').then((m) => m.JobsComponent),
  },
  {
    path: 'pipeline',
    loadComponent: () =>
      import('./pages/pipeline/pipeline.component').then((m) => m.PipelineComponent),
  },
  {
    path: 'tracker',
    loadComponent: () =>
      import('./pages/tracker/tracker.component').then((m) => m.TrackerComponent),
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./pages/analytics/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'interview-prep',
    loadComponent: () =>
      import('./pages/interview-prep/interview-prep.component').then(
        (m) => m.InterviewPrepComponent,
      ),
  },
  {
    path: 'interview-prep/:applicationId',
    loadComponent: () =>
      import('./pages/interview-prep/interview-prep-detail/interview-prep-detail.component').then(
        (m) => m.InterviewPrepDetailComponent,
      ),
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./pages/documents/documents.component').then((m) => m.DocumentsComponent),
  },
  {
    path: 'documents/cv/:id',
    loadComponent: () =>
      import('./pages/documents/cv-detail/cv-detail.component').then((m) => m.CvDetailComponent),
  },
  {
    path: 'documents/cover-letter/:id',
    loadComponent: () =>
      import('./pages/documents/cover-letter-detail/cover-letter-detail.component').then(
        (m) => m.CoverLetterDetailComponent,
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
];
