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

The property and the `applye.dev` web stream exist as of 2026-07-26; the
measurement ID is `G-ZY158GV42C`, and the stream ID is `15328752672`. It is not
set on any deployment yet, so no data is being collected. The steps below remain
the checklist for the property's configuration - several of them are still
outstanding, in particular **Enhanced measurement is still switched on** and the
custom dimensions are not registered.

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
static hosting - no Workers, no SSR adapter.

| Setting          | Value                   |
| ---------------- | ----------------------- |
| Build command    | `npm run web:build`     |
| Output directory | `dist/apps/web/browser` |
| Environment      | `GA_MEASUREMENT_ID`     |

Set the variable on the **Production** environment only. Preview deployments
then keep the placeholder and stay out of the property, which is what you want
when every branch push builds a preview.

## What GA4 cannot tell you

**Completed downloads.** `download_click` counts intent: someone clicked a link
that leaves for GitHub. Whether the transfer finished, and which asset they
took, happens where no site analytics can see it. GitHub keeps that number:

```bash
npm run web:downloads
```

Report the two together. Clicks measure the site; GitHub's counts measure the
product. They will not match, and the gap between them is itself a signal.

**Traffic that declined.** See the consent decision above. If the blind spot
becomes a problem, Cloudflare Web Analytics is cookieless, needs no consent
banner, and would count everyone - as a complement to GA4, not a replacement,
since it has no event model.

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
