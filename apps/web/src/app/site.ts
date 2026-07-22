// Shared site-wide constants for the applye.dev landing + docs.
export const REPO = 'https://github.com/vitala89/applye';
export const RELEASES = `${REPO}/releases`;
export const DATA_CONTRACT = `${REPO}/blob/main/README.md#how-it-works`;
export const AUTHOR = 'https://vitaliikasap.com';
export const YEAR = 2026;

// Community / social. PLACEHOLDER values: replace when the real channels exist.
export const SPONSORS = 'https://github.com/sponsors/vitala89'; // PLACEHOLDER: enable GitHub Sponsors
export const DISCORD = ''; // PLACEHOLDER: Discord invite URL once a server exists
export const LINKEDIN = ''; // PLACEHOLDER: LinkedIn profile URL - icon appears in the footer once set
export const X_TWITTER = ''; // PLACEHOLDER: X/Twitter profile URL if one is created

/** Download is not yet public; the repo ships installable builds after launch. */
export const COMING_SOON = true;

/**
 * The source repository is still private while the pre-release audit runs.
 * Flip to `true` once the repo is public and every "source: coming soon"
 * pill across the site turns back into a real GitHub link. Single switch -
 * do not hardcode repo links in templates.
 */
export const SOURCE_PUBLIC = false;

/** Google Analytics 4 measurement ID. PLACEHOLDER: replace with the real `G-XXXXXXXXXX`. */
export const GA_MEASUREMENT_ID = 'G-PLACEHOLDER';

/** Canonical production origin, used for canonical URLs, hreflang, OG tags and the sitemap. */
export const SITE_ORIGIN = 'https://applye.dev';
