# Local markets for Discover - analysis

Status: implemented 2026-07-24 (settings.market, Settings picker, Sources drawer filtering,
7 new built-in sources - DOU, Djinni, Habr Career, Jobicy, TrudVsem, Arbeitnow, No Fluff Jobs).
See `docs/product/CURRENT_STATE.md` for the current state. Originally written 2026-07-23 against
`main` at `ab2d5d4` (v0.26.0).

## The ask

Today Discover has one geographic control: `settings.geoScope`, a multi-select over seven
**continent-level** keys. The proposal is to keep that as the "broad" layer and add a second,
**country-level** layer - a local market - so a user searching in Germany or the USA sees the
built-in sources that actually serve that country, instead of a growing global list in which most
entries are useless to them.

## What already exists (do not rebuild)

Three pieces of the feature are already in `main`:

1. **Per-source geo tags.** `sources.geo_tags_json` is populated on every built-in row -
   `["worldwide"]` for Remotive / We Work Remotely / Himalayas, `["de"]` for Bundesagentur für
   Arbeit (`migrations/0001`, `migrations/0021`). The column that a market filter would read
   already carries country-level values. **No schema change is needed** to filter built-ins by
   market.
2. **A country-aware location classifier.** PR #146 added German city tokens so that a posting
   whose location is only "Berlin" counts as Germany. The same mechanism extends to other
   countries.
3. **A source-type dispatch that is cheap to extend.** `commands/discover.rs` matches on
   `source_type`: `rss`, `api` (Remotive / Himalayas shapes), `api_arbeitsagentur`, and the four
   ATS board types. **Anything that publishes RSS costs zero new parser code.**

So the work is: a country layer in `GeoScopeKey`/settings, a market picker in Settings and the
Discover Sources drawer, filtering built-ins by `geo_tags_json`, and seeding more built-in sources.

## Source rules this project holds to

`legality_note` on every built-in row records a tier. The existing built-ins are all "Tier 2 -
public API or RSS feed built for machine reading". That rule rules out most of the obvious
consumer job boards (Indeed, LinkedIn, StepStone, Glassdoor, hh.ru's web UI): they are scraped, not
published. Every candidate below is judged on whether the operator publishes a machine-readable
feed, and whether it needs a key.

## Candidates, by market

I probed each endpoint live on 2026-07-23. Results are marked **verified** (HTTP 200 with the
expected content type and a real payload), **needs work** (reachable, but my URL or parameters were
wrong), or **blocked** (needs credentials, or unreachable from where I tested).

### Tier A - verified live, low effort, ship first

| Market     | Source                                                           | Type                    | Result                                                                                                     |
| ---------- | ---------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ukraine 🇺🇦 | **DOU.ua vacancies feed** `https://jobs.dou.ua/vacancies/feeds/` | `rss` (existing parser) | **verified**: 200, `application/rss+xml`, 313 KB                                                           |
| Poland 🇵🇱  | **No Fluff Jobs** `https://nofluffjobs.com/api/joboffers/main`   | new JSON parser         | **verified**: 200, `application/json`, 2.0 MB - requires `salaryCurrency`, `salaryPeriod`, `region` params |
| Germany 🇩🇪 | **Arbeitnow** `https://www.arbeitnow.com/api/job-board-api`      | new JSON parser         | **verified**: 200, `application/json`, 445 KB, no key                                                      |

DOU.ua is the single best value in the list: it lands on the existing `rss` branch, so it is a
migration row plus a geo tag and nothing else. Arbeitnow is worth having alongside Bundesagentur
because it is English-language and visa-sponsorship-flagged - a different user than the one
Bundesagentur serves.

### Tier B - real, but needs research before committing

| Market    | Source                                                         | Why it is not Tier A                                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sweden 🇸🇪 | **JobTech / Arbetsförmedlingen** `jobsearch.api.jobtechdev.se` | The Swedish public employment service's open API - officially open, no key, and the closest thing to a second Bundesagentur. My probe returned no response at all from the sandbox (DNS), so this is **inconclusive, not a refusal**; re-check from a normal network. |
| Poland 🇵🇱 | **Just Join IT**                                               | The `api.justjoin.it/v2/user-panel/...` path I tried 404s - the endpoint has moved. Needs current-shape research.                                                                                                                                                     |
| UK 🇬🇧     | **GOV.UK Find a job**                                          | Both RSS parameters I tried returned HTML. Either the feeds moved or were retired. Needs research; if there is no feed, the UK falls back to ATS boards + Adzuna/Reed (both key-gated).                                                                               |
| France 🇫🇷 | **France Travail (ex Pôle emploi) Offres d'emploi v2**         | Official, free, enormous - but OAuth client-credentials registration, which is real onboarding friction inside a privacy-first local app. Worth doing for France, but it is its own piece of work.                                                                    |

### Tier C - blocked or carries a non-technical decision

| Market         | Source                         | Issue                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| USA 🇺🇸         | **USAJOBS** `data.usajobs.gov` | 403 without a key. Free to obtain, but per-user key entry.                                                                                                                                                                                                                                                                         |
| Switzerland 🇨🇭 | **job-room.ch** (SECO)         | 401 - authenticated API.                                                                                                                                                                                                                                                                                                           |
| Russia 🇷🇺      | **hh.ru** `api.hh.ru`          | 403 even with a descriptive User-Agent, so the "it just works, no key" reputation no longer holds; it likely needs a registered application now. Separately, shipping a Russian state-adjacent job index in a product about to go public is a **positioning decision, not a technical one** - flagging it rather than deciding it. |

**The USA has no free public index comparable to Bundesagentur.** This is the important finding for
the market picker: for the US, the honest built-in set is the remote aggregators already shipped
(Remotive, We Work Remotely, Himalayas) plus the four ATS board types, which is where American
company career pages actually live (Greenhouse and Lever especially). A US market preset should
therefore lead with "add your target companies' boards" rather than promising a national feed.

## Recommended shape

1. **Keep `geoScope` as the broad layer** (worldwide / continents). Add `market: string | null` -
   an ISO-3166-1 alpha-2 code, `null` meaning "no local market, use the broad scope". Storing a
   country code rather than extending `GeoScopeKey` keeps the classifier's continent vocabulary
   intact.
2. **Filter built-ins by tag** in the Sources drawer: show sources whose `geo_tags_json` contains
   the selected market, plus `worldwide` ones, and put everything else behind a "show all sources"
   toggle. User-added sources are never filtered away.
3. **Ship markets in the order the sources are ready**, not alphabetically:
   `DE` (already has two), `UA`, `PL`, then `SE`/`FR`/`UK` as their research lands, with `US` as a
   preset that leans on ATS boards.
4. **Every new built-in arrives disabled**, like the existing four.

## Effort estimate

- Market layer (settings field, migration, Settings picker, Sources drawer filter): one branch.
- DOU.ua: one migration row, no parser.
- Arbeitnow, No Fluff Jobs: one parser each plus tests, in the shape of the existing
  `parse_arbeitsagentur`.
- Tier B markets: one branch each, gated on the research above.

## Germany pack follow-up - 2026-08-27

`docs/product/IDEAS.md`'s Germany pack P0 named five candidate German Discover sources beyond
Bundesagentur: EURES, Interamt, bund.de, `ats_join`, `ats_softgarden`. Each was probed live before
committing, the same rule as above.

**Shipped** (migration `0030_de_bund_source.sql`): **service.bund.de** - `GET
https://www.service.bund.de/Content/Globals/Functions/RSSFeed/RSSGenerator_Stellen.xml`, verified
200 / `text/xml`, standard RSS 2.0 with `<title>`/`<link>`/`<description>` (the description carries
"Arbeitgeber: X" / "Ort: Y" as labelled text, which the existing `labelled_location` reader already
picks up via its `"ort:"` label). Lands on the existing `rss` source type - no new parser, same as
DOU.ua.

**Verified live but not shipped - EURES**: `POST https://europa.eu/eures/api/jv-searchengine/public/jv-search/search`
returns real JSON (confirmed against `locationCodes: ["DE"]`, `numberRecords` in the hundreds of
thousands). Unlike Bundesagentur, this is **not documented by its operator** - it is the EU's own
portal's internal search backend, reverse-engineered by a third party
(`rorar/EURES-API-Documentation` on GitHub) rather than a published integration surface. Technically
buildable (new `api_eures` source type, new parser, and a new POST branch in `fetch_source_jobs`,
which today only issues GET requests) - the open question is whether an undocumented backend
clears this project's Tier-2 "published for machine reading" bar the way Bundesagentur's own
published key does, and that is a call for whoever ships it, not a technical blocker.

**Blocked - Interamt**: no live RSS or JSON endpoint found. `interamt.de/koop/app/stellensuche` and
every `?rss=1` / `/rss` / `/feed` variant tried returned a redirect or 404, and the page itself
carried no discoverable feed link. Secondary sources claim an RSS feed exists; the real URL is still
unknown. Needs its own research pass, the same status as GOV.UK / Just Join IT above.

**Blocked - `ats_join`**: the job-list endpoint
(`GET https://join.com/api/public/companies/{numericId}/jobs?page=N&pageSize<=5`) takes a **numeric**
company id, not the slug in a company's public URL (`join.com/companies/join` is id `54`, not
`"join"`). No slug-to-id lookup endpoint exists; the id is only visible embedded in the company
page's own HTML (`__NEXT_DATA__`). Resolving it would mean scraping an HTML page for a JSON blob,
which is exactly what `discover_fetch.rs`'s own module doc rules out ("never to an HTML scraper") -
an architecture conflict, not a research gap. (Per-job detail at `GET
https://join.com/api/public/jobs/{id}` works and is rich - `description`, `tasks`, `requirements`,
`company.domain` - it is only the slug-scoped list that is unreachable.)

**Blocked - `ats_softgarden`**: `dev.softgarden.de`'s own JobBoard API docs describe
`GET /jobboards/{channelID}` as "accessible with the sent token" - i.e. every read, including a job
search, needs a per-client API token. That does not fit the zero-config "type a company's slug"
flow the other four ATS types use (Greenhouse, Lever, Ashby, Personio all resolve from a public,
keyless, slug-scoped endpoint). Shipping it would mean a per-user token entry flow that does not
exist anywhere else in Discover today.
