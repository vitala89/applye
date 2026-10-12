/**
 * Approved production edges between top-level folders in `libs/application`.
 * An edge is listed only when one feature genuinely orchestrates another.
 * A type, enum, or pure rule that two features share belongs in `libs/core`,
 * not on this list. A cycle fails even when both directions are listed.
 */
export const approvedApplicationEdges = [
  {
    from: 'jobs',
    to: 'documents',
    reason:
      'The job application workflow orchestrates document generation, review, export, linking, and gap-fill. The documents feature does not orchestrate jobs.',
  },
];

/**
 * Filenames that still live in the legacy `libs/core/src/lib/models` bucket.
 * The list is a shrinking ratchet: a file on disk that is not listed fails, and
 * a listed name that is no longer on disk fails too. Moving a legacy model
 * removes its entry in the same change. No placeholder file is required, and
 * the old filename cannot be recreated in this bucket afterwards.
 */
export const legacyCoreModelFiles = [
  'application.model.ts',
  'ats.model.ts',
  'cover-letter-content.model.ts',
  'cv-content.model.ts',
  'cv-import.model.ts',
  'cv-style.model.ts',
  'cv-theme.model.spec.ts',
  'cv-theme.model.ts',
  'discover.model.ts',
  'document-library.model.ts',
  'document-models.spec.ts',
  'health.model.ts',
  'interview.model.ts',
  'job.model.ts',
  'page-settings.model.ts',
  'profile.model.ts',
  'settings.model.ts',
  'source.model.ts',
];
