// Domain models and types - framework-agnostic
export * from './lib/models/ats.model';
export * from './lib/models/job.model';
export * from './lib/jobs/job-identity';
export * from './lib/models/application.model';
export * from './lib/models/profile.model';
export * from './lib/models/interview.model';
export * from './lib/models/settings.model';
export * from './lib/models/source.model';
export * from './lib/models/discover.model';
export * from './lib/models/health.model';
export * from './lib/models/document.model';
export * from './lib/models/cv-theme.model';
export * from './lib/types/common.types';

// Pure utilities
export * from './lib/profile/profile-markdown';
export * from './lib/profile/profile-education';
export * from './lib/profile/profile-experience';
export * from './lib/profile/compensation-target';
export * from './lib/profile/profile-languages';
export * from './lib/profile/split-display-name';
export * from './lib/profile/compensation';
export * from './lib/profile/archetype';
export * from './lib/profile/scoring-state';
export * from './lib/jobs/job-scoring';
export * from './lib/jobs/jd-blocks';
export * from './lib/text/inline-emphasis';
export * from './lib/text/signature';
export * from './lib/text/letter-format';
export * from './lib/analytics/analytics';
export * from './lib/analytics/analytics.model';
export * from './lib/geo/geo-scope';
export * from './lib/geo/local-market';
export * from './lib/ai/api-models';
export * from './lib/ai/cli-status';

// CV content, style and layout - pure, and here rather than in the app because
// nine files in `libs/application` were taking these functions as arguments to
// work around their being unreachable (ADR-0005, amendment fifty).
export * from './lib/cv/cv-content.util';
export * from './lib/cv/cv-entry.util';
export * from './lib/documents/cover-letter-base.util';
export * from './lib/cv/cv-page.util';
export * from './lib/cv/cv-parse.util';
export * from './lib/cv/cv-selection.util';
export * from './lib/cv/cv-style.util';
export * from './lib/cv/cv-style-scope.util';
