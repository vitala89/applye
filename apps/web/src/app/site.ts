// Shared site-wide constants for the applye.dev landing + docs.
export const REPO = 'https://github.com/vitala89/applye';
export const RELEASES = `${REPO}/releases`;
export const DATA_CONTRACT = `${REPO}/blob/main/README.md#how-it-works`;
export const AUTHOR = 'https://vitaliikasap.com';
export const YEAR = 2026;

/**
 * General contact address, routed by Cloudflare Email Routing to the
 * maintainer. `security@` and `conduct@` are deliberately not shown here:
 * they belong to SECURITY.md and CODE_OF_CONDUCT.md, and pointing a marketing
 * footer at a vulnerability inbox invites everything except vulnerabilities.
 */
export const CONTACT_EMAIL = 'hello@applye.dev';

// Community / social. PLACEHOLDER values: replace when the real channels exist.
export const SPONSORS = 'https://github.com/sponsors/vitala89'; // PLACEHOLDER: enable GitHub Sponsors
export const DISCORD = ''; // PLACEHOLDER: Discord invite URL once a server exists
export const LINKEDIN = ''; // PLACEHOLDER: LinkedIn profile URL - icon appears in the footer once set
export const X_TWITTER = ''; // PLACEHOLDER: X/Twitter profile URL if one is created

/**
 * Whether the hero offers a download instead of the "coming soon" status.
 *
 * `false` since `v0.29.2`, the first release carrying an installer for every
 * platform: macOS on both architectures, Windows `.msi` and `.exe`, Linux
 * `.deb`/`.rpm`/`.AppImage`. That was the flip condition, and it is checkable
 * in one command - `gh release view --json assets` on the published latest
 * release. Set it back to `true` if a future release ever ships narrower than
 * that, because a Download button landing a Windows visitor on a page holding
 * nothing for them is worse than a status that says "not yet".
 *
 * The button points at the releases page rather than at a versioned asset, so
 * it does not go stale when the version moves.
 */
export const COMING_SOON = false;

/**
 * The source repository is public, so every "source: coming soon" pill across
 * the site is a real GitHub link. Single switch - do not hardcode repo links
 * in templates. It was `false` while the pre-release audit ran on a private
 * repository; that reason expired when the repository was made public.
 */
export const SOURCE_PUBLIC = true;

/** Google Analytics 4 measurement ID. PLACEHOLDER: replace with the real `G-XXXXXXXXXX`. */
export const GA_MEASUREMENT_ID = 'G-PLACEHOLDER';

/**
 * Whether the site is meant to appear in search results yet.
 *
 * True since launch. It was false while the documentation still showed
 * placeholder boxes where its screenshots and video would go, because an
 * indexed placeholder is far harder to remove than to prevent; all 25 assets
 * shipped, so the reason expired. While this is false, `public/_headers` must
 * send `X-Robots-Tag: noindex`, and a test fails if the two disagree - so
 * neither the flag nor the header can be changed on its own.
 */
export const SEARCH_INDEXABLE = true;

/** Canonical production origin, used for canonical URLs, hreflang, OG tags and the sitemap. */
export const SITE_ORIGIN = 'https://applye.dev';

/**
 * Absolute URL for a route path, in the one form the server actually serves.
 *
 * Cloudflare Pages redirects `/de` to `/de/` with a 308, because the build
 * writes `de/index.html`. Emitting the slashless form anywhere a crawler reads
 * it - canonical, hreflang, breadcrumbs, the sitemap - points Google at a URL
 * that redirects, and the page it lands on then names the redirecting URL as
 * its canonical. Google resolves that, but reports every affected page as
 * "Page with redirect" instead of indexing it cleanly. One helper, so the four
 * places cannot drift apart again.
 */
export function siteUrl(path: string): string {
  const clean = path.split('#')[0].split('?')[0];
  return `${SITE_ORIGIN}${clean.endsWith('/') ? clean : `${clean}/`}`;
}
