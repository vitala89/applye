# Analytics setup: GA4 + Cloudflare Pages

What applye.dev measures, how the property has to be configured for those
measurements to be reportable, and how the measurement ID reaches a build.

The code side of this lives in `apps/web/src/app/analytics/`. `events.ts` is the
contract: it lists every event and every parameter, and `/cookies` describes the
same list to visitors in prose. Changing one without the other two is a bug.

## Design decisions

**gtag, not Tag Manager.** GTM would let tags change without a release, which is
exactly the property we do not want on a site whose privacy page enumerates
every event. gtag keeps the measurable surface reviewable in the diff.

**Hard consent gate, not Consent Mode.** Nothing is loaded until the visitor
opts in - no cookieless pings, no modelled conversions. This is stricter than
Consent Mode v2 and needs no EEA special case, at a real cost: visitors who
decline or ignore the banner are invisible, so GA4 reports the shape of
consenting traffic, not of all traffic. Judge absolute numbers accordingly.

**Enhanced measurement off.** GA4's automatic SPA page views would double-count
against the ones the router sends, and its automatic outbound/file-download
events carry parameters we never declared. Everything is explicit instead.

## Current status

As of 2026-07-26 the property and the `applye.dev` web stream exist. Measurement
ID `G-ZY158GV42C`, stream ID `15328752672`.

**2026-08-09: the property was still receiving nothing, and the cause was in the
code, not in the configuration.** The site was deployed with the real ID and the
tag loaded correctly, so Google's own settings page reported the tag as present -
while the stream reported "data collection isn't active on your website". See
"When the tag is present and the property is still empty" below. Fixed; the first
hits are expected from the deployment that carries that fix.

**The GA4 property is fully configured.** Stream created, Enhanced measurement
off, Google signals off, all four account data-sharing options unticked, data
retention 14 months, Data Processing Terms accepted 2026-07-26, and all ten
event-scoped custom dimensions registered before any traffic - the only point at
which that can be done correctly.

Outstanding:

1. `download_click` as a key event, and the internal-traffic filter. Both are
   impossible until events start arriving, so they wait on the first hits landing
   from the 2026-08-09 fix rather than on a deployment - the site has been live
   since 2026-07-29.
2. Optionally, the DPA contact and legal-entity fields ("Изменить сведения DPA"),
   which are blank by default. The agreement is in force either way.

## Creating the property

1. **Account** - analytics.google.com, Admin, Create account. Name `Applye`.
   Untick every optional data-sharing box.
2. **Property** - name `applye.dev`, with your timezone and currency.
3. **Data stream** - Data streams, Add stream, Web. URL `https://applye.dev`,
   stream name `applye.dev`.
4. **Turn Enhanced measurement off** on that stream. See above - with it on, page
   views are counted twice.
5. Copy the measurement ID (`G-XXXXXXXXXX`).
6. **Admin, Data collection and modification**:
   - Google signals: **off**
   - Ad personalization: **off**
   - Data retention: **14 months**, "reset on new activity" off
7. **Admin, Account settings**: accept the Google Ads Data Processing Terms. This
   is the GDPR processor agreement; without it the setup is not lawful in the EU.

## Custom dimensions

Register these under Admin, Custom definitions, all **event-scoped**. GA4 does
not backfill: a parameter arriving before its dimension exists is stored and
never reportable.

| Dimension name | Event parameter  | Answers                                  |
| -------------- | ---------------- | ---------------------------------------- |
| Locale         | `locale`         | Which translations are worth maintaining |
| OS             | `os`             | Which installer to prioritise            |
| Source section | `source_section` | Which surface actually converts          |
| CTA id         | `cta_id`         | Which call to action is pulling weight   |
| Link domain    | `link_domain`    | Where people go when they leave          |
| Link URL       | `link_url`       | The specific destination                 |
| Link text      | `link_text`      | Which wording was clicked                |
| From locale    | `from_locale`    | Which language people switch away from   |
| To locale      | `to_locale`      | Which language they switch to            |
| Decision       | `decision`       | Consent opt-in rate                      |

`page_path` and `page_title` need no dimension - GA4 handles them natively.

## Key events

Once events start arriving, Admin, Events, toggle "Mark as key event" on
`download_click`. It cannot be marked before GA4 has seen it at least once.

## Internal traffic

Data Streams, Configure tag settings, Define internal traffic - add your own IP.
Then Data Settings, Data Filters, Internal Traffic: switch it from Testing to
**Active**. A filter left in Testing does nothing.

## Search Console

Admin, Product links, Search Console. Requires `applye.dev` verified in Search
Console first. This is the only source of organic search queries - GA4 has none.

## The measurement ID in a build

The ID is not a secret; it is visible in the page source of every site using GA.
It is a plain build variable, not a secret store entry.

`apps/web/src/app/analytics/measurement-id.ts` is committed holding
`G-PLACEHOLDER`, and `AnalyticsService` refuses to load GA while it says that.
So a checkout, a dev server, a test run and a preview build all ship analytics
switched off by default - the failure mode is "no data", never "wrong data in
the real property".

`apps/web/tools/generate-analytics-config.mjs` rewrites that file from the
`GA_MEASUREMENT_ID` environment variable, and `npm run web:build` runs it first.
A malformed value fails the build rather than falling back silently.

**Do not remove the `: string` annotation on that constant**, and do not "fix"
the eslint-disable above it. Without the annotation TypeScript infers the
literal type of the committed placeholder, and the guard in
`analytics.service.ts` stops compiling the moment a real ID is generated in -
so the build breaks in production and nowhere else. A test pins the annotation,
and the generator refuses to run if the declaration no longer matches.

To reproduce a production build locally:

```bash
GA_MEASUREMENT_ID=G-ZY158GV42C npm run web:build
```

Then run `npm run web:analytics-config` with the variable unset to restore the
placeholder before committing.

## Cloudflare Pages

The site is `outputMode: "static"` with every route prerendered, so it is plain
static hosting - no Workers, no SSR adapter. `public/_redirects` and
`public/_headers` ship with the build and are read by Pages directly.

**Deployment is automatic and runs from GitHub Actions, not from Cloudflare's
Git integration.** The `deploy-web` job in `.github/workflows/ci.yml` `needs`
the CI gate and only runs on a push to `main`, so a red main cannot reach
applye.dev. Cloudflare's own Git integration would build on every push whether
or not the tests passed, which is exactly the property we do not want.

So the Pages project must be created **without** connecting a repository -
"Direct Upload" - and left alone. Wrangler pushes the built directory to it.

Preview deployments are deliberately not wired. They would publish unlaunched
marketing copy on a guessable URL while the repository is still private, and
they must never carry the measurement ID.

### What has to exist in the two dashboards

In **Cloudflare**:

1. Workers & Pages, Create, Pages, **Direct Upload**. Project name `applye`
   (if you pick another name, set the `CLOUDFLARE_PAGES_PROJECT` repository
   variable to match).
2. An API token: My Profile, API Tokens, Create Token, template **Edit
   Cloudflare Workers**, or a custom token with `Account / Cloudflare Pages /
Edit`. Copy it once - it is not shown again.
3. Your account ID, from the right-hand sidebar of the account home page.
4. After the first deploy: the project's Custom domains tab, add `applye.dev`.
   Cloudflare writes the DNS record itself because the domain is already in the
   account.
5. TLS/SSL, Edge Certificates: consider enabling **HSTS** there. It is
   deliberately not in `_headers` - browsers remember it for its whole max-age,
   so it belongs somewhere it can be switched off again.

In **GitHub**, under Settings, Secrets and variables, Actions:

| Kind     | Name                       | Value                               |
| -------- | -------------------------- | ----------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`     | the token from step 2               |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`    | the account ID from step 3          |
| Variable | `GA_MEASUREMENT_ID`        | `G-ZY158GV42C`                      |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | only if the project is not `applye` |

`GA_MEASUREMENT_ID` is a **variable**, not a secret. The ID is visible in the
page source of every site that uses GA; filing it as a secret would only make it
harder to audit what a build shipped. If it is missing the site still deploys,
with analytics dormant.

## What GA4 cannot tell you

**Completed downloads.** `download_click` counts intent: someone clicked a link
that leaves for GitHub. Whether the transfer finished, and which asset they
took, happens where no site analytics can see it. GitHub keeps that number:

```bash
npm run web:downloads
```

Report the two together. Clicks measure the site; GitHub's counts measure the
product. They will not match, and the gap between them is itself a signal.

**Traffic that declined.** See the consent decision above. This is the blind
spot Cloudflare Web Analytics covers, and it is why the site runs both.

## Cloudflare Web Analytics

Decided 2026-07-27, before launch: GA4 behind a hard consent gate reports the
shape of consenting traffic only, which is the wrong instrument for the one
question the launch actually asks - did anyone come. CWA answers that and
nothing else. The two are not redundant: CWA has no event model and cannot say
what a visitor did, GA4 cannot say how many visitors there were.

**No snippet is added to the site.** `applye.dev` is proxied through Cloudflare
via the Pages custom domain, so it is an "automatic setup" site: Analytics, Web
Analytics, Add a site, pick the hostname from the drop-down, Done. Cloudflare
injects the beacon at the edge. Nothing in `index.html`, nothing in the bundle,
nothing to keep in step with a release.

Manage site offers "Enable, excluding visitor data in the EU". Leave it off:
CWA sets no cookie and creates no identifier, so there is nothing an EU carve
out would protect, and excluding the EU would silently delete most of the
traffic this site is built for.

Because the beacon loads before any consent decision, `/privacy` and `/cookies`
describe it explicitly as the always-on, cookieless counter, and the consent
bar copy in all six locales says the same. Those three and this file have to
move together, exactly as they do for the GA4 event list.

Consequence for Phase 4: a Content-Security-Policy, when one is finally
measured rather than guessed, has to allow `static.cloudflareinsights.com`
alongside the googletagmanager origin.

## When the tag is present and the property is still empty

This happened on 2026-08-09 and cost every hit between launch and that date. It
is worth reading before touching `analytics.service.ts`, because the failure is
invisible from every instrument this repository has.

**The rule:** gtag.js reads a queued command only when the pushed value is an
`arguments` object. `dataLayer.push(['config', id])` - a plain array - is not a
command, and is ignored without a warning. That is why Google's snippet uses
`function gtag(){dataLayer.push(arguments)}` rather than a modern rest-parameter
arrow function, and why `installGtag()` in `analytics.service.ts` disables
`prefer-rest-params` on that line instead of obeying it.

**What the broken state looks like**, all of it reassuring and all of it wrong:

- the `googletagmanager.com/gtag/js?id=G-...` script is in the DOM and returns 200;
- `window.gtag` is a function and `window.dataLayer` grows with every event;
- `window.google_tag_manager['G-...']` exists - it is created from the script's
  own URL, not from a `config` command, so its presence proves nothing;
- no console error, no CSP violation, no failed request;
- GA4 says "data collection isn't active on your website", which reads like a
  missing tag rather than a present and mute one.

**How to check in thirty seconds**, from the site with analytics consent granted:

```js
performance
  .getEntriesByType('resource')
  .map((e) => e.name)
  .filter((n) => /collect/.test(n));
```

An empty array means nothing is being sent, whatever else the page shows. A
working page lists a `region1.google-analytics.com/g/collect?...` entry within a
second or two of any event. To prove the property itself is fine, push one
command the canonical way and watch the same list:

```js
function g() {
  dataLayer.push(arguments);
}
g('js', new Date());
g('config', 'G-ZY158GV42C', { send_page_view: false });
g('event', 'debug_probe');
```

A hit appearing there while the site's own events produce none puts the fault in
the shim, not in GA4, the network, consent, or an ad blocker.

**Note the blast radius before assuming a filter.** Two configuration causes
produce a similar "no data" reading and are worth ruling out second: an internal
traffic filter switched to Active while your own IP is defined as internal, and
the consent gate itself, which makes every visitor who declines or ignores the
banner invisible by design.

## Campaign tagging

GA4 reads source/medium from the referrer automatically. For anything you post
yourself, tag the link, or it lands in "direct" and tells you nothing:

```
https://applye.dev/?utm_source=linkedin&utm_medium=social&utm_campaign=launch
```

- `utm_source` - the specific place (`linkedin`, `hn`, `reddit`, `newsletter`)
- `utm_medium` - the kind (`social`, `email`, `referral`, `cpc`)
- `utm_campaign` - the push (`launch`, `v0-29`, `show-hn`)

Keep them lowercase. GA4 treats `LinkedIn` and `linkedin` as two sources.
