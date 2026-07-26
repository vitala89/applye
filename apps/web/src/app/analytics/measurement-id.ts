/**
 * GA4 measurement ID for the shipped bundle.
 *
 * GENERATED at build time by `apps/web/tools/generate-analytics-config.mjs`
 * from the `GA_MEASUREMENT_ID` environment variable. The value committed here
 * is the placeholder, so a checkout, a dev server, a test run and a preview
 * build all ship analytics switched off and never contact a real property.
 *
 * Do not hand-edit. To change it locally, export the variable and run
 * `npm run web:analytics-config`; to change it in production, set the variable
 * on the Cloudflare Pages project.
 *
 * The ID is not a secret - it is visible in the page source of every site that
 * uses GA - so it is a plain build variable, not a secret store entry.
 *
 * The `: string` annotation is load-bearing, not noise. Without it TypeScript
 * infers the literal type of whatever value sits here, and the placeholder
 * guard in `analytics.service.ts` stops compiling the moment the generator
 * writes a real ID: "types 'G-XXXXXXXXXX' and 'G-PLACEHOLDER' have no
 * overlap". That breaks production builds and only production builds, which is
 * the worst possible place to discover it.
 */
// The annotation below is not redundant: it widens the type deliberately, and this rule's
// suggested fix breaks every build in which the generator has written a real ID.
// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const GA_MEASUREMENT_ID: string = 'G-PLACEHOLDER';
