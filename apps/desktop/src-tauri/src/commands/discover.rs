// Discover scan engine (ROADMAP §11, STEP_BY_STEP_PLAN `feat/discover`).
//
// Deterministic Tier-2/Tier-3 collection: every enabled source's public
// JSON/RSS feed is fetched over HTTPS and parsed with the same known-shape
// readers as the paste-from-link flow (never arbitrary HTML). Jobs are then
// filtered locally - title keywords + geo scope, 0 tokens - and deduped into
// `jobs` by `jd_hash` with INSERT OR IGNORE, so a scan can never overwrite
// user data and a dismissed job stays dismissed. AI never touches collection.

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::State;

use super::job_url::{extract_host, path_segments, strip_html, titleize_slug, xml_tag};
use crate::db::{stable_hash, Db};

// ---------------------------------------------------------------------------
// Public result shapes (serialized to the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSourceResult {
    pub source_id: i64,
    pub source_name: String,
    pub fetched: i64,
    pub filtered_out: i64,
    pub duplicates: i64,
    pub new_jobs: i64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub sources: Vec<ScanSourceResult>,
    pub total_fetched: i64,
    pub total_new: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverFeedItem {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub location: Option<String>,
    pub source: Option<String>,
    pub created_at: Option<String>,
    /// NULL until the feed has been opened once with this job in it - the UI
    /// uses "was NULL when listed" as the NEW marker.
    pub discover_shown_at: Option<String>,
    /// First lines of the JD for the inline row preview.
    pub jd_preview: Option<String>,
    /// Original posting URL ("View original posting").
    pub source_url: Option<String>,
    /// True when an application row exists for this job (Save already done).
    pub saved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceListItem {
    pub id: i64,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub source_type: Option<String>,
    pub url: Option<String>,
    pub slug: Option<String>,
    pub is_builtin: bool,
    pub is_enabled: bool,
    pub geo_tags_json: Option<String>,
    pub legality_note: Option<String>,
    pub last_scan_at: Option<String>,
    pub last_scan_json: Option<String>,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/// One job as it comes out of a source feed, before filtering.
#[derive(Debug, Clone)]
struct RawJob {
    title: String,
    company: String,
    jd_text: String,
    location: String,
    url: String,
    /// Set by sources whose list endpoint carries no job description, holding
    /// the id the detail endpoint needs. Resolved after the local filters have
    /// run, so one detail request is spent per job the user could actually
    /// see - never per job in the feed.
    detail_ref: Option<String>,
}

struct SourceRow {
    id: i64,
    name: String,
    source_type: String,
    url: String,
    slug: Option<String>,
    positive_json: Option<String>,
    negative_json: Option<String>,
}

struct TitleFilter {
    positive: Vec<String>,
    negative: Vec<String>,
}

struct GeoCfg {
    /// True when no scope is selected ("worldwide") - every job passes.
    unrestricted: bool,
    tokens: Vec<String>,
}

// ---------------------------------------------------------------------------
// Title filter (0 tokens, ROADMAP §11 "Title filter")
// ---------------------------------------------------------------------------

/// Parse a keyword list: a JSON array of strings, with a plain
/// comma/newline-separated text fallback. Lowercased, trimmed, empties dropped.
fn parse_keyword_list(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let items: Vec<String> = serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_else(|_| raw.split([',', '\n']).map(str::to_string).collect());
    items
        .iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

const ARCHETYPE_STOPWORDS: &[&str] = &["and", "or", "the", "with", "for", "of", "in"];

/// Fallback positive keywords when a source has no title filter configured:
/// the significant words of the profile's Target Archetypes ("Senior Frontend
/// Engineer" -> ["senior", "frontend", "engineer"]). Empty archetypes -> no
/// filter (pass everything).
fn derive_title_keywords(archetypes: Option<&str>) -> Vec<String> {
    let mut words: Vec<String> = Vec::new();
    for phrase in parse_keyword_list(archetypes) {
        for word in phrase.split(|c: char| !c.is_alphanumeric() && c != '+' && c != '#') {
            let word = word.trim().to_lowercase();
            if word.len() >= 3
                && !ARCHETYPE_STOPWORDS.contains(&word.as_str())
                && !words.contains(&word)
            {
                words.push(word);
            }
        }
    }
    words
}

fn title_passes(title: &str, filter: &TitleFilter) -> bool {
    let t = title.to_lowercase();
    if filter.negative.iter().any(|k| t.contains(k)) {
        return false;
    }
    if filter.positive.is_empty() {
        return true;
    }
    filter.positive.iter().any(|k| t.contains(k))
}

// ---------------------------------------------------------------------------
// Geo filter (ROADMAP §11 "Geographic filtering")
// ---------------------------------------------------------------------------

/// Freetext markers meaning "location does not restrict this job".
const REMOTE_MARKERS: &[&str] = &["remote", "anywhere", "worldwide", "global", "distributed"];

/// European country names for the europe/eu scopes. One shared list for both
/// scopes in v1 (includes non-EU Europe: UK, Switzerland, Norway).
const EUROPE_COUNTRIES: &[&str] = &[
    "europe",
    "eu",
    "emea",
    "germany",
    "deutschland",
    "austria",
    "switzerland",
    "france",
    "netherlands",
    "spain",
    "italy",
    "poland",
    "portugal",
    "sweden",
    "denmark",
    "finland",
    "norway",
    "ireland",
    "belgium",
    "czech",
    "slovakia",
    "hungary",
    "romania",
    "bulgaria",
    "greece",
    "croatia",
    "slovenia",
    "estonia",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "cyprus",
    "united kingdom",
    "ukraine",
    "russia",
    "russian federation",
];

/// Asian country/region names for the asia scope. Mirrors the client-side
/// COUNTRY_DEFS asia bucket so Settings scope and the Discover filter agree.
const ASIA_COUNTRIES: &[&str] = &[
    "asia",
    "apac",
    "india",
    "singapore",
    "japan",
    "china",
    "hong kong",
    "taiwan",
    "korea",
    "vietnam",
    "philippines",
    "indonesia",
    "malaysia",
    "thailand",
    "pakistan",
    "bangladesh",
];

/// North American country names for the namerica scope.
const NAMERICA_COUNTRIES: &[&str] = &[
    "north america",
    "united states",
    "usa",
    "u.s.",
    "america",
    "canada",
    "ontario",
    "quebec",
    "alberta",
    "british columbia",
    "mexico",
];

/// South American country names for the samerica scope.
const SAMERICA_COUNTRIES: &[&str] = &[
    "south america",
    "latin america",
    "latam",
    "brazil",
    "brasil",
    "argentina",
    "chile",
    "uruguay",
    "colombia",
    "peru",
    "ecuador",
    "bolivia",
    "paraguay",
    "venezuela",
];

/// Australia/NZ and Pacific names for the oceania scope.
const OCEANIA_COUNTRIES: &[&str] = &["oceania", "anz", "australia", "new zealand"];

/// Middle East / North Africa names for the mena scope.
const MENA_COUNTRIES: &[&str] = &[
    "middle east",
    "mena",
    "gcc",
    "united arab emirates",
    "uae",
    "israel",
    "saudi arabia",
    "saudi",
    "turkey",
    "qatar",
    "egypt",
];

/// Sub-Saharan African country names for the africa scope.
const AFRICA_COUNTRIES: &[&str] = &[
    "africa",
    "south africa",
    "nigeria",
    "kenya",
    "morocco",
    "ghana",
];

/// Freetext names for one scope key. Empty for an unrecognized key.
fn region_countries(scope: &str) -> &'static [&'static str] {
    match scope {
        "europe" => EUROPE_COUNTRIES,
        "namerica" => NAMERICA_COUNTRIES,
        "samerica" => SAMERICA_COUNTRIES,
        "asia" => ASIA_COUNTRIES,
        "oceania" => OCEANIA_COUNTRIES,
        "mena" => MENA_COUNTRIES,
        "africa" => AFRICA_COUNTRIES,
        _ => &[],
    }
}

/// The GeoScopeKey vocabulary, kept in lockstep with libs/core's
/// `GEO_SCOPE_KEYS` (TypeScript) so Settings and the scan engine agree on
/// what a scope key means.
const KNOWN_GEO_SCOPES: &[&str] = &[
    "europe", "namerica", "samerica", "asia", "oceania", "mena", "africa",
];

/// Parses the `geo_scope` settings column: a JSON array of scope keys
/// (`["europe","asia"]`) going forward, written by the Settings screen. An
/// install saved before multi-select shipped holds a single legacy scalar
/// instead (`worldwide`|`europe`|`eu`|`usa`|`asia`|`custom`) - map that onto
/// the closest key so an existing choice keeps working after the upgrade.
/// Mirrors `parseGeoScopes` in libs/core/src/lib/geo/geo-scope.ts. An empty
/// result means "worldwide": no restriction.
fn parse_geo_scopes(raw: &str) -> Vec<String> {
    let text = raw.trim();
    if text.is_empty() {
        return Vec::new();
    }
    if let Ok(parsed) = serde_json::from_str::<Vec<String>>(text) {
        return parsed
            .into_iter()
            .filter(|k| KNOWN_GEO_SCOPES.contains(&k.as_str()))
            .collect();
    }
    match text {
        "europe" | "eu" => vec!["europe".to_string()],
        "usa" => vec!["namerica".to_string()],
        "asia" => vec!["asia".to_string()],
        // "worldwide" | "custom" | anything unrecognized -> no restriction.
        _ => Vec::new(),
    }
}

/// The LocalMarket vocabulary, kept in lockstep with libs/core's
/// `LOCAL_MARKETS` (TypeScript). Local markets are the narrow half of geo
/// targeting: when any is selected, `geo_scope` takes no part in the scan.
const KNOWN_LOCAL_MARKETS: &[&str] = &["de", "gb", "us", "ru", "es", "fr", "ua", "pl"];

/// Parses the `market` settings column: a JSON array of market codes
/// (`["de","fr"]`) going forward. An install saved between the single-market
/// picker and multi-select holds a bare scalar (`de`) - read that as a
/// one-item list. Mirrors `parseLocalMarkets` in
/// libs/core/src/lib/geo/local-market.ts. Empty means "no local market", so
/// the region scope applies instead.
fn parse_local_markets(raw: &str) -> Vec<String> {
    let text = raw.trim();
    if text.is_empty() {
        return Vec::new();
    }
    if let Ok(parsed) = serde_json::from_str::<Vec<String>>(text) {
        return parsed
            .into_iter()
            .filter(|k| KNOWN_LOCAL_MARKETS.contains(&k.as_str()))
            .collect();
    }
    if KNOWN_LOCAL_MARKETS.contains(&text) {
        vec![text.to_string()]
    } else {
        Vec::new()
    }
}

/// Names a 2-letter country code also answers to in freetext locations.
///
/// German boards - the federal agency's feed, and the company boards on
/// Personio - routinely give the city alone ("Berlin", "Muenchen"), with no
/// country anywhere in the string, so a Germany scope would silently drop its
/// own market. The largest German cities are therefore country tokens too, in
/// both the German and the English spelling. The trade is deliberate: a
/// same-named city elsewhere (Frankfort, KY) slips through, which the user can
/// see and dismiss, where a dropped job is invisible.
/// Full names of every US state. Long and unambiguous, so all of them are safe
/// to match as substrings.
const US_STATE_NAMES: &[&str] = &[
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "new hampshire",
    "new jersey",
    "new mexico",
    "new york",
    "north carolina",
    "north dakota",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "rhode island",
    "south carolina",
    "south dakota",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "west virginia",
    "wisconsin",
    "wyoming",
    "district of columbia",
];

/// State codes safe to match as bare words. Deliberately partial: `loc_matches`
/// is case-insensitive, so it cannot tell "Berlin, DE" (Germany) from
/// "Dover, DE" (Delaware), "Tel Aviv, IL" (Israel) from "Chicago, IL"
/// (Illinois), "Baku, AZ" (Azerbaijan) from "Phoenix, AZ" (Arizona),
/// "Ulaanbaatar, MN" (Mongolia) from "Minneapolis, MN" (Minnesota), or
/// "Tunis, TN" (Tunisia) from "Nashville, TN" (Tennessee). This list holds
/// only codes that are neither an assigned ISO 3166-1 alpha-2 country code
/// nor an ordinary English word; every other state is still reachable
/// through its full name above. `ca` is the one deliberate exception: it is
/// Canada's ISO code, but in a job location it means California far more
/// often, so the bare `ca` token is dropped from Canada's own token list
/// below in exchange for keeping it here.
const US_STATE_CODES: &[&str] = &[
    "tx", "ca", "ny", "wa", "fl", "nj", "mi", "ut", "nv", "wi", "ct",
];

fn country_tokens(code: &str) -> Vec<&'static str> {
    match code {
        "de" => vec![
            "de",
            "germany",
            "deutschland",
            "berlin",
            "hamburg",
            "muenchen",
            "münchen",
            "munich",
            "köln",
            "koeln",
            "cologne",
            "frankfurt",
            "stuttgart",
            "düsseldorf",
            "duesseldorf",
            "dusseldorf",
            "leipzig",
            "dortmund",
            "nürnberg",
            "nuernberg",
            "nuremberg",
            "hannover",
            "bremen",
            "dresden",
            "karlsruhe",
            "mannheim",
        ],
        "at" => vec!["at", "austria"],
        "ch" => vec!["ch", "switzerland"],
        "fr" => vec![
            "fr",
            "france",
            "paris",
            "lyon",
            "marseille",
            "toulouse",
            "lille",
            "bordeaux",
            "nantes",
        ],
        "nl" => vec!["nl", "netherlands"],
        "es" => vec![
            "es",
            "spain",
            "españa",
            "espana",
            "madrid",
            "barcelona",
            "valencia",
            "seville",
            "sevilla",
            "bilbao",
            "malaga",
            "málaga",
        ],
        "it" => vec!["it", "italy"],
        "pl" => vec![
            "pl", "poland", "polska", "warsaw", "warszawa", "krakow", "kraków", "cracow",
            "wroclaw", "wrocław", "gdansk", "gdańsk", "poznan", "poznań", "lodz", "łódź",
        ],
        "pt" => vec!["pt", "portugal"],
        "se" => vec!["se", "sweden"],
        "dk" => vec!["dk", "denmark"],
        "fi" => vec!["fi", "finland"],
        "no" => vec!["no", "norway"],
        "ie" => vec!["ie", "ireland"],
        "be" => vec!["be", "belgium"],
        "cz" => vec!["cz", "czech"],
        "uk" | "gb" => vec![
            "uk",
            "gb",
            "united kingdom",
            "britain",
            "great britain",
            "england",
            "scotland",
            "cardiff",
            "swansea",
            "london",
            "manchester",
            "edinburgh",
            "birmingham",
            "glasgow",
            "bristol",
            "leeds",
            "cambridge",
            "oxford",
        ],
        "us" => {
            let mut out = vec![
                "us",
                "usa",
                "u.s.",
                "united states",
                "america",
                "san francisco",
                "new york city",
                "nyc",
                "seattle",
                "austin",
                "boston",
                "chicago",
                "denver",
                "atlanta",
                "los angeles",
                "san diego",
                "portland",
            ];
            out.extend_from_slice(US_STATE_NAMES);
            out.extend_from_slice(US_STATE_CODES);
            out
        }
        // No bare "ca": in a job location it means California far more often
        // than Canada, and a US market that silently loses San Francisco is a
        // worse failure than a Canada scope that needs the country spelled out.
        "ca" => vec![
            "canada",
            "toronto",
            "vancouver",
            "montreal",
            "montréal",
            "ottawa",
            "calgary",
            "ontario",
            "quebec",
            "québec",
            "british columbia",
            "alberta",
        ],
        // Russian and Ukrainian sources write the place in Cyrillic - TrudVsem
        // returns `region.name` as "Москва", Habr Career puts the city in the
        // posting title - so both scripts are listed, same reasoning as the
        // German city list above: a dropped job is invisible, a false positive
        // is not.
        "ru" => vec![
            "ru",
            "russia",
            "russian federation",
            "россия",
            "москва",
            "moscow",
            "санкт-петербург",
            "saint petersburg",
            "st petersburg",
            "новосибирск",
            "novosibirsk",
            "екатеринбург",
            "yekaterinburg",
            "казань",
            "kazan",
            "нижний новгород",
            "челябинск",
            "самара",
            "омск",
            "ростов-на-дону",
            "уфа",
            "красноярск",
            "воронеж",
            "пермь",
            "волгоград",
        ],
        "ua" => vec![
            "ua",
            "ukraine",
            "україна",
            "украина",
            "київ",
            "киев",
            "kyiv",
            "kiev",
            "львів",
            "львов",
            "lviv",
            "харків",
            "харьков",
            "kharkiv",
            "одеса",
            "одесса",
            "odesa",
            "odessa",
            "дніпро",
            "днепр",
            "dnipro",
        ],
        _ => vec![],
    }
}

/// Builds the geo filter from the selected scope keys (union of every
/// selected region's tokens - any one matching lets a job pass) plus any
/// individually active country codes on top. An empty `scopes` list means
/// "worldwide": every job passes, unconditionally.
fn build_geo_cfg(scopes: &[String], active_codes: &[String]) -> GeoCfg {
    let mut tokens: Vec<String> = Vec::new();
    for scope in scopes {
        let scope = scope.trim().to_lowercase();
        tokens.extend(region_countries(&scope).iter().map(|s| s.to_string()));
    }
    for code in active_codes {
        let code = code.trim().to_lowercase();
        if code == "remote" {
            continue; // remote always passes via REMOTE_MARKERS
        }
        let named = country_tokens(&code);
        if named.is_empty() {
            tokens.push(code);
        } else {
            tokens.extend(named.into_iter().map(str::to_string));
        }
    }
    tokens.sort();
    tokens.dedup();
    GeoCfg {
        // Unrestricted ("worldwide") only when nothing at all narrows the
        // search - no region scope AND no individual country code active.
        unrestricted: scopes.is_empty() && active_codes.is_empty(),
        tokens,
    }
}

/// Short tokens (<= 3 chars, e.g. "de", "eu", "us") only match as whole words -
/// substring matching would light up inside unrelated words ("DEsigner",
/// "dEUtschland"). Longer tokens match as substrings.
fn loc_matches(loc: &str, token: &str) -> bool {
    if token.len() <= 3 {
        loc.split(|c: char| !c.is_alphanumeric())
            .any(|w| w == token)
    } else {
        loc.contains(token)
    }
}

/// Conservative inclusion: an empty/unknown location never drops a job -
/// only a location that names somewhere outside the scope does.
fn geo_passes(location: &str, cfg: &GeoCfg) -> bool {
    if cfg.unrestricted {
        return true;
    }
    let loc = location.trim().to_lowercase();
    if loc.is_empty() {
        return true;
    }
    if REMOTE_MARKERS.iter().any(|m| loc_matches(&loc, m)) {
        return true;
    }
    cfg.tokens.iter().any(|t| loc_matches(&loc, t))
}

// ---------------------------------------------------------------------------
// Feed parsers (pure - fetched bytes in, RawJobs out; unit-tested on fixtures)
// ---------------------------------------------------------------------------

fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

/// Greenhouse ships `content` HTML-escaped (`&lt;p&gt;`); decode the shell of
/// escaping first when there are no real tags, then strip to plain text.
fn html_to_text(raw: &str) -> String {
    if raw.contains('<') {
        strip_html(raw)
    } else {
        let decoded = raw
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&");
        strip_html(&decoded)
    }
}

/// remotive.com/api/remote-jobs: { jobs: [{ title, company_name, description,
/// candidate_required_location, url }] }
fn parse_remotive(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| RawJob {
            title: json_str(j, "title"),
            company: json_str(j, "company_name"),
            jd_text: html_to_text(&json_str(j, "description")),
            location: json_str(j, "candidate_required_location"),
            url: json_str(j, "url"),
            detail_ref: None,
        })
        .collect()
}

/// himalayas.app/jobs/api - shape read tolerantly (root array or { jobs: [...] },
/// several observed field spellings) so a feed-side rename degrades to an
/// empty field, not a scan error.
fn parse_himalayas(val: &serde_json::Value) -> Vec<RawJob> {
    let jobs = val
        .as_array()
        .cloned()
        .or_else(|| val.get("jobs").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();
    jobs.iter()
        .map(|j| {
            let location = j
                .get("locationRestrictions")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| json_str(j, "location"));
            let company = [
                json_str(j, "companyName"),
                json_str(j, "company_name"),
                j.get("company")
                    .map(|c| json_str(c, "name"))
                    .unwrap_or_default(),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let url = [
                json_str(j, "applicationLink"),
                json_str(j, "url"),
                json_str(j, "guid"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let body = [json_str(j, "description"), json_str(j, "excerpt")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "title"),
                company,
                jd_text: html_to_text(&body),
                location,
                url,
                detail_ref: None,
            }
        })
        .collect()
}

/// Coarse "does this string name a place?" gate for pulling a location out of
/// messy RSS (categories, description labels). Deliberately broad and cheap; the
/// real region/country classification happens client-side. Its job is only to
/// reject noise like "(m/w/d)" or "Full-Time" while accepting anything that
/// carries a geographic signal.
fn location_signal(s: &str) -> bool {
    let low = s.to_lowercase();
    if REMOTE_MARKERS.iter().any(|m| low.contains(m)) {
        return true;
    }
    let word_hit = |needle: &str| {
        low.split(|c: char| !c.is_alphanumeric())
            .any(|w| w == needle)
    };
    // Region words + every country name we already track for scope filtering.
    const REGION_WORDS: &[&str] = &[
        "europe",
        "european",
        "emea",
        "america",
        "americas",
        "latam",
        "apac",
        "asia",
        "africa",
        "oceania",
        "usa",
        "uk",
        "canada",
        "brazil",
        "brasil",
        "argentina",
        "mexico",
        "australia",
    ];
    if REGION_WORDS.iter().any(|w| low.contains(w)) {
        return true;
    }
    if EUROPE_COUNTRIES
        .iter()
        .chain(ASIA_COUNTRIES.iter())
        .any(|c| low.contains(c))
    {
        return true;
    }
    // Bare US state code ("Austin, TX") or a 2-letter country code as a segment.
    const CODES: &[&str] = &[
        "tx", "ca", "ny", "wa", "il", "co", "fl", "ga", "ma", "or", "oh", "nc", "va", "de", "nl",
        "fr", "es", "it", "pl", "se", "no", "fi", "dk", "ie", "at", "ch", "pt",
    ];
    CODES.iter().any(|c| word_hit(c))
}

/// Reads a "Location: X" / "Standort: X" / "Ort: X" label out of plain-text JD.
fn labelled_location(jd: &str) -> Option<String> {
    const LABELS: &[&str] = &["location:", "standort:", "ort:", "based in:", "office:"];
    for line in jd.lines() {
        let low = line.to_lowercase();
        for label in LABELS {
            if let Some(idx) = low.find(label) {
                let value = line[idx + label.len()..].trim();
                // Stop at the next label-like separator on the same line.
                let value = value.split(['|', '·', '•']).next().unwrap_or(value).trim();
                if !value.is_empty() && value.len() <= 60 {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// All values of a repeated XML tag (RSS feeds emit several <category> tags).
fn xml_tags(block: &str, tag: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = block;
    while let Some(v) = xml_tag(rest, tag) {
        out.push(v);
        // Advance past this tag's close so the next iteration finds the following one.
        let close = format!("</{tag}>");
        match rest.find(&close) {
            Some(i) => rest = &rest[i + close.len()..],
            None => break,
        }
    }
    out
}

/// Best-effort location for a generic RSS item. Order: explicit region/location
/// tags -> a <category> that looks like a place -> a "Location:" label in the
/// body -> "Remote" when the item is clearly remote -> empty (rolls into Other).
fn extract_rss_location(item: &str, title: &str, jd_text: &str) -> String {
    if let Some(loc) = xml_tag(item, "region").or_else(|| xml_tag(item, "location")) {
        let loc = loc.trim();
        if !loc.is_empty() {
            return loc.to_string();
        }
    }
    for cat in xml_tags(item, "category") {
        let c = cat.trim();
        if !c.is_empty() && location_signal(c) {
            return c.to_string();
        }
    }
    if let Some(l) = labelled_location(jd_text) {
        return l;
    }
    let hay = format!("{title} {jd_text}").to_lowercase();
    if REMOTE_MARKERS.iter().any(|m| hay.contains(m)) {
        return "Remote".to_string();
    }
    String::new()
}

/// Generic RSS <item> reader (We Work Remotely and user-added feeds).
/// WWR titles are "Company: Role" - `split_company_from_title` splits on the
/// first colon; other feeds keep the full title and an empty company.
fn parse_rss_items(xml: &str, split_company_from_title: bool) -> Vec<RawJob> {
    let mut out = Vec::new();
    for item in xml.split("<item>").skip(1) {
        let item = item.split("</item>").next().unwrap_or("");
        let raw_title = xml_tag(item, "title").unwrap_or_default();
        let (company, title) = if split_company_from_title {
            match raw_title.split_once(':') {
                Some((c, t)) => (c.trim().to_string(), t.trim().to_string()),
                None => (String::new(), raw_title),
            }
        } else {
            (String::new(), raw_title)
        };
        let jd_text = html_to_text(&xml_tag(item, "description").unwrap_or_default());
        let location = extract_rss_location(item, &title, &jd_text);
        out.push(RawJob {
            title,
            company,
            jd_text,
            location,
            url: xml_tag(item, "link").unwrap_or_default(),
            detail_ref: None,
        });
    }
    out
}

/// boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true:
/// { jobs: [{ title, content, absolute_url, location: { name } }] }
fn parse_greenhouse_board(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            // Greenhouse now ships company_name per job; the slug-derived
            // name is only the fallback.
            let own_company = json_str(j, "company_name");
            RawJob {
                title: json_str(j, "title"),
                company: if own_company.is_empty() {
                    company.to_string()
                } else {
                    own_company
                },
                jd_text: html_to_text(&json_str(j, "content")),
                location: j
                    .get("location")
                    .map(|l| json_str(l, "name"))
                    .unwrap_or_default(),
                url: json_str(j, "absolute_url"),
                detail_ref: None,
            }
        })
        .collect()
}

/// api.lever.co/v0/postings/{slug}?mode=json: [ { text, descriptionPlain |
/// description, categories: { location }, hostedUrl } ]
fn parse_lever_postings(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
    let Some(jobs) = val.as_array() else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let body = [json_str(j, "descriptionPlain"), json_str(j, "description")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "text"),
                company: company.to_string(),
                jd_text: html_to_text(&body),
                location: j
                    .get("categories")
                    .map(|c| json_str(c, "location"))
                    .unwrap_or_default(),
                url: json_str(j, "hostedUrl"),
                detail_ref: None,
            }
        })
        .collect()
}

/// api.ashbyhq.com/posting-api/job-board/{slug}: { name, jobs: [{ title,
/// location, descriptionPlain | descriptionHtml, jobUrl | applyUrl }] }
fn parse_ashby_board(val: &serde_json::Value) -> Vec<RawJob> {
    let company = json_str(val, "name");
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let body = [
                json_str(j, "descriptionPlain"),
                json_str(j, "descriptionHtml"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let url = [json_str(j, "jobUrl"), json_str(j, "applyUrl")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "title"),
                company: company.clone(),
                jd_text: html_to_text(&body),
                location: json_str(j, "location"),
                url,
                detail_ref: None,
            }
        })
        .collect()
}

/// {slug}.jobs.personio.de/xml: `<position>` blocks with `<name>`, `<office>`,
/// `<id>` and a `<jobDescriptions>` list of CDATA HTML sections. Personio is
/// the dominant ATS for German small and mid-size employers, and its board
/// feed is public XML built for machine reading.
///
/// Every description section is concatenated, keeping its heading ("Aufgaben",
/// "Dein Profil"), because the split between them is where a German posting
/// puts its actual requirements.
fn parse_personio_xml(xml: &str, slug: &str, company_fallback: &str) -> Vec<RawJob> {
    let mut out = Vec::new();
    for block in xml.split("<position>").skip(1) {
        let block = block.split("</position>").next().unwrap_or("");
        // <name> is used both for the position title and for each description
        // section heading, so read the title from the block before the
        // descriptions start.
        let head = block.split("<jobDescriptions>").next().unwrap_or(block);
        let Some(title) = xml_tag(head, "name") else {
            continue;
        };
        let company = xml_tag(head, "subcompany").unwrap_or_else(|| company_fallback.to_string());
        let location = xml_tag(head, "office").unwrap_or_default();
        let id = xml_tag(head, "id").unwrap_or_default();

        let sections = block.split("<jobDescription>").skip(1);
        let mut body = String::new();
        for section in sections {
            let section = section.split("</jobDescription>").next().unwrap_or("");
            if let Some(heading) = xml_tag(section, "name") {
                body.push_str(&heading);
                body.push('\n');
            }
            if let Some(value) = xml_tag(section, "value") {
                body.push_str(&html_to_text(&value));
                body.push_str("\n\n");
            }
        }

        out.push(RawJob {
            title,
            company,
            jd_text: body.trim().to_string(),
            location,
            url: if id.is_empty() {
                format!("https://{slug}.jobs.personio.de")
            } else {
                format!("https://{slug}.jobs.personio.de/job/{id}")
            },
            detail_ref: None,
        });
    }
    out
}

/// Percent-encode everything outside the unreserved set, so a reference number
/// with a slash or a space still yields one path segment.
fn percent_encode_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Human-facing posting page for a Bundesagentur reference number.
fn arbeitsagentur_job_url(refnr: &str) -> String {
    format!(
        "https://www.arbeitsagentur.de/jobsuche/jobdetail/{}",
        percent_encode_segment(refnr)
    )
}

/// rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs:
/// `{ stellenangebote: [{ titel, beruf, refnr, arbeitgeber, arbeitsort: { ort,
/// plz, region, land }, externeUrl }] }`.
///
/// The list endpoint carries no description, so `jd_text` is seeded from the
/// structured fields and `detail_ref` holds the reference number the scan uses
/// to pull the real `stellenbeschreibung` for jobs that pass the filters.
fn parse_arbeitsagentur(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("stellenangebote").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let beruf = json_str(j, "beruf");
            let title = [json_str(j, "titel"), beruf.clone()]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            let ort = j.get("arbeitsort");
            let location = [
                ort.map(|o| json_str(o, "ort")).unwrap_or_default(),
                ort.map(|o| json_str(o, "region")).unwrap_or_default(),
                ort.map(|o| json_str(o, "land")).unwrap_or_default(),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
            // A German posting with no country token would be dropped by a
            // "Germany" geo scope, and the feed omits `land` for domestic ads.
            let location = if location.is_empty() {
                "Deutschland".to_string()
            } else if location.to_lowercase().contains("deutschland") {
                location
            } else {
                format!("{location}, Deutschland")
            };
            let company = json_str(j, "arbeitgeber");
            let refnr = json_str(j, "refnr");
            let external = json_str(j, "externeUrl");
            let url = if external.is_empty() {
                if refnr.is_empty() {
                    String::new()
                } else {
                    arbeitsagentur_job_url(&refnr)
                }
            } else {
                external
            };
            // Placeholder body until the detail request runs; keeps the job
            // readable (and its hash stable) if that request fails.
            let jd_text = [
                title.clone(),
                beruf,
                company.clone(),
                location.clone(),
                json_str(j, "eintrittsdatum"),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
            RawJob {
                title,
                company,
                jd_text,
                location,
                url,
                detail_ref: if refnr.is_empty() { None } else { Some(refnr) },
            }
        })
        .collect()
}

/// opendata.trudvsem.ru/api/v1/vacancies: `{ results: { vacancies: [{ vacancy: {
/// job-name, company: { name }, region: { name }, vac_url, duty, requirement,
/// employment, schedule, salary_min, salary_max, currency } }] } }`. Official
/// Rostrud open-data portal, no key required. `region.name` comes back in
/// Russian (e.g. "Москва"), so ", Russia" is appended the same way
/// `parse_arbeitsagentur` appends "Deutschland" - a bare geoScope match needs
/// an English country token somewhere in the location string.
fn parse_trudvsem(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(vacancies) = val
        .get("results")
        .and_then(|r| r.get("vacancies"))
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    vacancies
        .iter()
        .filter_map(|entry| entry.get("vacancy"))
        .map(|j| {
            let title = json_str(j, "job-name");
            let company = j
                .get("company")
                .map(|c| json_str(c, "name"))
                .unwrap_or_default();
            let region = j
                .get("region")
                .map(|r| json_str(r, "name"))
                .unwrap_or_default();
            let location = if region.is_empty() {
                "Russia".to_string()
            } else {
                format!("{region}, Russia")
            };
            let jd_text = [
                json_str(j, "duty"),
                json_str(j, "requirement"),
                json_str(j, "employment"),
                json_str(j, "schedule"),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
            RawJob {
                title,
                company,
                jd_text,
                location,
                url: json_str(j, "vac_url"),
                detail_ref: None,
            }
        })
        .collect()
}

/// arbeitnow.com/api/job-board-api: `{ data: [{ title, company_name,
/// description, location, url, remote }] }`. German-market board - Germany
/// is appended to the location the same way `parse_arbeitsagentur` does, since
/// the feed does not reliably carry a country token of its own.
fn parse_arbeitnow(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("data").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let location = json_str(j, "location");
            let location = if location.is_empty() {
                "Germany".to_string()
            } else if location.to_lowercase().contains("germany")
                || location.to_lowercase().contains("deutschland")
            {
                location
            } else {
                format!("{location}, Germany")
            };
            RawJob {
                title: json_str(j, "title"),
                company: json_str(j, "company_name"),
                jd_text: html_to_text(&json_str(j, "description")),
                location,
                url: json_str(j, "url"),
                detail_ref: None,
            }
        })
        .collect()
}

/// nofluffjobs.com/api/joboffers/main - shape read tolerantly (root array or
/// `{ postings: [...] }`, several observed field spellings for company/city)
/// so a feed-side rename degrades to an empty field, not a scan error, same
/// approach as `parse_himalayas`. Poland-market board.
///
/// The list endpoint carries no description, only structured fields
/// (technology, category, seniority) - `jd_text` is seeded from those, same
/// placeholder approach as `parse_arbeitsagentur`.
fn parse_nofluffjobs(val: &serde_json::Value) -> Vec<RawJob> {
    let postings = val
        .as_array()
        .cloned()
        .or_else(|| val.get("postings").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();
    postings
        .iter()
        .map(|j| {
            let company = [json_str(j, "name"), json_str(j, "companyName")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            let city = j
                .get("location")
                .and_then(|l| l.get("places"))
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .map(|p| json_str(p, "city"))
                .unwrap_or_default();
            let remote = j
                .get("location")
                .and_then(|l| l.get("fullyRemote"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let location = if !city.is_empty() {
                format!("{city}, Poland")
            } else if remote {
                "Remote, Poland".to_string()
            } else {
                "Poland".to_string()
            };
            let slug = [json_str(j, "url"), json_str(j, "id")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            let url = if slug.starts_with("http") {
                slug
            } else if slug.is_empty() {
                String::new()
            } else {
                format!("https://nofluffjobs.com/job/{slug}")
            };
            let seniority = j
                .get("seniority")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let jd_text = [
                json_str(j, "category"),
                json_str(j, "technology"),
                seniority,
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
            RawJob {
                title: json_str(j, "title"),
                company,
                jd_text,
                location,
                url,
                detail_ref: None,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Fetch (thin HTTPS layer over the pure parsers)
// ---------------------------------------------------------------------------

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("Applye/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("discover_scan: build http client: {e}"))
}

fn require_https(url: &str) -> Result<(), String> {
    if url.starts_with("https://") {
        Ok(())
    } else {
        Err("discover_scan: only https:// sources are fetched".to_string())
    }
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    require_https(url)?;
    client
        .get(url)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid JSON response: {e}"))
}

/// Anonymous client key for the Bundesagentur fuer Arbeit job search API,
/// published in its own public API documentation. Not a user secret: it
/// identifies the client, carries no account, and is the same for everyone.
const ARBEITSAGENTUR_API_KEY: &str = "jobboerse-jobsuche";

/// Pages fetched per scan, at 100 postings each. The feed is national and
/// unfiltered server-side, so this bounds one scan rather than trying to
/// mirror the whole index.
const ARBEITSAGENTUR_PAGES: u32 = 3;

/// Detail requests spent per source per scan. Descriptions are pulled only for
/// jobs that already passed the title and geo filters; past this cap the
/// remaining jobs keep their structured-field placeholder body.
const ARBEITSAGENTUR_DETAIL_CAP: usize = 60;

async fn get_json_keyed(client: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    require_https(url)?;
    client
        .get(url)
        .header("accept", "application/json")
        .header("X-API-Key", ARBEITSAGENTUR_API_KEY)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid JSON response: {e}"))
}

/// Full posting text for one reference number. The detail endpoint keys on the
/// base64 of the reference number.
async fn fetch_arbeitsagentur_detail(
    client: &reqwest::Client,
    refnr: &str,
) -> Result<String, String> {
    use base64::Engine as _;
    let id = base64::engine::general_purpose::STANDARD.encode(refnr);
    let url = format!(
        "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v2/jobdetails/{}",
        percent_encode_segment(&id)
    );
    let val = get_json_keyed(client, &url).await?;
    Ok(html_to_text(&json_str(&val, "stellenbeschreibung")))
}

async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    require_https(url)?;
    client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .text()
        .await
        .map_err(|e| format!("invalid response body: {e}"))
}

/// ATS sources store the company slug in `sources.slug`; fall back to reading
/// it out of the stored URL so user-added rows with only a URL still work.
fn ats_slug(src: &SourceRow, path_marker: &str) -> Result<String, String> {
    if let Some(slug) = src.slug.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(slug.to_string());
    }
    let segments = path_segments(&src.url);
    segments
        .iter()
        .position(|s| s == path_marker)
        .and_then(|i| segments.get(i + 1))
        .cloned()
        .or_else(|| segments.first().cloned())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "missing company slug".to_string())
}

async fn fetch_source_jobs(
    client: &reqwest::Client,
    src: &SourceRow,
) -> Result<Vec<RawJob>, String> {
    match src.source_type.as_str() {
        "api" => {
            let host = extract_host(&src.url).unwrap_or_default();
            let val = get_json(client, &src.url).await?;
            if host.contains("remotive") {
                Ok(parse_remotive(&val))
            } else if host.contains("himalayas") {
                Ok(parse_himalayas(&val))
            } else {
                Err(format!("unsupported API source host: {host}"))
            }
        }
        "rss" => {
            let host = extract_host(&src.url).unwrap_or_default();
            let xml = get_text(client, &src.url).await?;
            Ok(parse_rss_items(&xml, host.contains("weworkremotely")))
        }
        "api_arbeitsagentur" => {
            let base = src.url.trim_end_matches('/');
            let mut out: Vec<RawJob> = Vec::new();
            for page in 1..=ARBEITSAGENTUR_PAGES {
                let url = format!("{base}?angebotsart=1&size=100&page={page}");
                let val = get_json_keyed(client, &url).await?;
                let batch = parse_arbeitsagentur(&val);
                let done = batch.len() < 100;
                out.extend(batch);
                if done {
                    break;
                }
            }
            Ok(out)
        }
        "api_trudvsem" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_trudvsem(&val))
        }
        "api_arbeitnow" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_arbeitnow(&val))
        }
        "api_nofluffjobs" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_nofluffjobs(&val))
        }
        "ats_personio" => {
            // Personio boards key on the subdomain, not a path segment, so the
            // stored slug is the source of truth and the host is the fallback.
            let slug = src
                .slug
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    extract_host(&src.url)
                        .and_then(|h| h.split('.').next().map(str::to_string))
                        .filter(|s| !s.is_empty())
                })
                .ok_or_else(|| "missing company slug".to_string())?;
            let url = format!("https://{slug}.jobs.personio.de/xml");
            let xml = get_text(client, &url).await?;
            Ok(parse_personio_xml(&xml, &slug, &titleize_slug(&slug)))
        }
        "ats_greenhouse" => {
            let slug = ats_slug(src, "boards")?;
            let url =
                format!("https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true");
            let val = get_json(client, &url).await?;
            Ok(parse_greenhouse_board(&val, &titleize_slug(&slug)))
        }
        "ats_lever" => {
            let slug = ats_slug(src, "postings")?;
            let url = format!("https://api.lever.co/v0/postings/{slug}?mode=json");
            let val = get_json(client, &url).await?;
            Ok(parse_lever_postings(&val, &titleize_slug(&slug)))
        }
        "ats_ashby" => {
            let slug = ats_slug(src, "job-board")?;
            let url = format!("https://api.ashbyhq.com/posting-api/job-board/{slug}");
            let val = get_json(client, &url).await?;
            Ok(parse_ashby_board(&val))
        }
        other => Err(format!("unsupported source type: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Insert + dedupe
// ---------------------------------------------------------------------------

/// Insert one scanned job. INSERT OR IGNORE on the jd_hash UNIQUE index is the
/// dedupe: re-scans, cross-source duplicates, and previously dismissed jobs
/// (same hash, still in the table) are all silently skipped, never updated.
/// Returns true when the row is new.
async fn insert_scanned_job(
    pool: &SqlitePool,
    job: &RawJob,
    source_name: &str,
) -> Result<bool, String> {
    // A feed item with no description still needs a stable, distinct hash -
    // fall back to a minimal text body that includes the posting URL.
    let jd_text = if job.jd_text.trim().is_empty() {
        format!(
            "{} at {}\n{}\n(No description provided by the source feed.)",
            job.title, job.company, job.url
        )
    } else {
        job.jd_text.clone()
    };
    let jd_hash = stable_hash(&jd_text);

    let result = sqlx::query(
        "INSERT OR IGNORE INTO jobs
           (company, title, jd_text, jd_hash, source, location, source_url,
            imported_from, discover_dismissed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'discover_scan', 0, datetime('now'))",
    )
    .bind(&job.company)
    .bind(&job.title)
    .bind(&jd_text)
    .bind(&jd_hash)
    .bind(source_name)
    .bind(&job.location)
    .bind(&job.url)
    .execute(pool)
    .await
    .map_err(|e| format!("insert job: {e}"))?;

    Ok(result.rows_affected() == 1)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn discover_scan(db: State<'_, Db>) -> Result<ScanSummary, String> {
    let started = std::time::Instant::now();

    let source_rows = sqlx::query(
        "SELECT id, name, type, url, slug,
                title_filter_positive_json, title_filter_negative_json
         FROM sources
         WHERE is_enabled = 1 AND type != 'manual'
         ORDER BY id",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("discover_scan: load sources: {e}"))?;

    let sources: Vec<SourceRow> = source_rows
        .iter()
        .map(|r| SourceRow {
            id: r.get("id"),
            name: r.get::<Option<String>, _>("name").unwrap_or_default(),
            source_type: r.get::<Option<String>, _>("type").unwrap_or_default(),
            url: r.get::<Option<String>, _>("url").unwrap_or_default(),
            slug: r.get("slug"),
            positive_json: r.get("title_filter_positive_json"),
            negative_json: r.get("title_filter_negative_json"),
        })
        .collect();

    let geo_scope_raw: String = sqlx::query_scalar("SELECT geo_scope FROM settings WHERE id = 1")
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("discover_scan: load settings: {e}"))?
        .unwrap_or_default();
    let geo_scopes = parse_geo_scopes(&geo_scope_raw);
    let market_raw: Option<String> = sqlx::query_scalar("SELECT market FROM settings WHERE id = 1")
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("discover_scan: load market: {e}"))?
        .flatten();
    let markets = parse_local_markets(market_raw.as_deref().unwrap_or_default());
    // The two geo modes are mutually exclusive (see libs/core local-market.ts):
    // a local market narrows to its countries and the region scope sits out
    // entirely; with no market selected the region scope applies as before.
    let geo_cfg = if markets.is_empty() {
        let active_codes: Vec<String> =
            sqlx::query_scalar("SELECT country_code FROM geo_filters WHERE is_active = 1")
                .fetch_all(&db.pool)
                .await
                .map_err(|e| format!("discover_scan: load geo filters: {e}"))?;
        build_geo_cfg(&geo_scopes, &active_codes)
    } else {
        build_geo_cfg(&[], &markets)
    };

    let archetypes: Option<String> =
        sqlx::query_scalar("SELECT target_archetypes FROM profile WHERE id = 1")
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| format!("discover_scan: load profile: {e}"))?
            .flatten();
    let derived_keywords = derive_title_keywords(archetypes.as_deref());

    let client = http_client()?;
    let mut results: Vec<ScanSourceResult> = Vec::new();

    for src in &sources {
        let mut r = ScanSourceResult {
            source_id: src.id,
            source_name: src.name.clone(),
            fetched: 0,
            filtered_out: 0,
            duplicates: 0,
            new_jobs: 0,
            error: None,
        };

        match fetch_source_jobs(&client, src).await {
            Err(e) => r.error = Some(e),
            Ok(raw_jobs) => {
                r.fetched = raw_jobs.len() as i64;

                let positive = {
                    let own = parse_keyword_list(src.positive_json.as_deref());
                    if own.is_empty() {
                        derived_keywords.clone()
                    } else {
                        own
                    }
                };
                let filter = TitleFilter {
                    positive,
                    negative: parse_keyword_list(src.negative_json.as_deref()),
                };

                // Detail requests are spent only on jobs that survived the
                // local filters, and only up to the per-scan cap.
                let mut detail_budget = ARBEITSAGENTUR_DETAIL_CAP;

                for job in &raw_jobs {
                    if job.title.trim().is_empty()
                        || !title_passes(&job.title, &filter)
                        || !geo_passes(&job.location, &geo_cfg)
                    {
                        r.filtered_out += 1;
                        continue;
                    }

                    // A failed or skipped detail request is not a scan error:
                    // the job still lands with its placeholder body.
                    let detailed: Option<RawJob> = match job.detail_ref.as_deref() {
                        Some(refnr) if detail_budget > 0 => {
                            detail_budget -= 1;
                            match fetch_arbeitsagentur_detail(&client, refnr).await {
                                Ok(text) if !text.trim().is_empty() => {
                                    let mut j = job.clone();
                                    j.jd_text = text;
                                    Some(j)
                                }
                                _ => None,
                            }
                        }
                        _ => None,
                    };
                    let job = detailed.as_ref().unwrap_or(job);

                    match insert_scanned_job(&db.pool, job, &src.name).await {
                        Ok(true) => r.new_jobs += 1,
                        Ok(false) => r.duplicates += 1,
                        Err(e) => r.error = Some(e),
                    }
                }
            }
        }

        // Best-effort bookkeeping for the Sources UI; a failed update must not
        // fail the scan itself.
        let _ = sqlx::query(
            "UPDATE sources SET last_scan_at = datetime('now'), last_scan_json = ? WHERE id = ?",
        )
        .bind(serde_json::to_string(&r).unwrap_or_default())
        .bind(src.id)
        .execute(&db.pool)
        .await;

        results.push(r);
    }

    Ok(ScanSummary {
        total_fetched: results.iter().map(|r| r.fetched).sum(),
        total_new: results.iter().map(|r| r.new_jobs).sum(),
        duration_ms: started.elapsed().as_millis() as i64,
        sources: results,
    })
}

#[tauri::command]
pub async fn db_discover_feed(db: State<'_, Db>) -> Result<Vec<DiscoverFeedItem>, String> {
    let rows = sqlx::query(
        "SELECT j.id, j.company, j.title, j.location, j.source, j.created_at,
                j.discover_shown_at, substr(j.jd_text, 1, 400) AS jd_preview,
                j.source_url,
                EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id) AS saved
         FROM jobs j
         WHERE j.imported_from = 'discover_scan' AND j.discover_dismissed = 0
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT 300",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_discover_feed: {e}"))?;

    let items: Vec<DiscoverFeedItem> = rows
        .iter()
        .map(|r| DiscoverFeedItem {
            id: r.get("id"),
            company: r.get("company"),
            title: r.get("title"),
            location: r.get("location"),
            source: r.get("source"),
            created_at: r.get("created_at"),
            discover_shown_at: r.get("discover_shown_at"),
            jd_preview: r.get("jd_preview"),
            source_url: r.get("source_url"),
            saved: r.get::<i64, _>("saved") == 1,
        })
        .collect();

    // Everything just listed counts as surfaced; rows returned above keep
    // their pre-update value so the UI can mark them NEW exactly once.
    sqlx::query(
        "UPDATE jobs SET discover_shown_at = datetime('now')
         WHERE imported_from = 'discover_scan' AND discover_dismissed = 0
           AND discover_shown_at IS NULL",
    )
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_discover_feed: mark shown: {e}"))?;

    Ok(items)
}

/// Delete every scanned job the user has not saved. Pure over the pool so it is
/// unit-testable; saved jobs own an `applications` row and are left untouched.
async fn discover_clear_core(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let res = sqlx::query(
        "DELETE FROM jobs
         WHERE imported_from = 'discover_scan'
           AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)",
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

/// Clear the Discover inbox: delete every scanned job the user has not saved
/// (saved jobs live on in My Jobs / Pipeline). Returns how many rows were
/// removed. A fresh scan repopulates the feed.
#[tauri::command]
pub async fn db_discover_clear(db: State<'_, Db>) -> Result<u64, String> {
    discover_clear_core(&db.pool)
        .await
        .map_err(|e| format!("db_discover_clear: {e}"))
}

/// Dismiss (or un-dismiss, for the inline Undo) a scanned job.
#[tauri::command]
pub async fn db_discover_dismiss(
    job_id: i64,
    dismissed: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    sqlx::query("UPDATE jobs SET discover_dismissed = ? WHERE id = ?")
        .bind(if dismissed { 1 } else { 0 })
        .bind(job_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_discover_dismiss: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn db_list_sources(db: State<'_, Db>) -> Result<Vec<SourceListItem>, String> {
    let rows = sqlx::query(
        "SELECT id, name, type, url, slug, is_builtin, is_enabled,
                geo_tags_json, legality_note, last_scan_at, last_scan_json
         FROM sources
         WHERE type != 'manual'
         ORDER BY is_builtin DESC, id",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_sources: {e}"))?;

    Ok(rows
        .iter()
        .map(|r| SourceListItem {
            id: r.get("id"),
            name: r.get("name"),
            source_type: r.get("type"),
            url: r.get("url"),
            slug: r.get("slug"),
            is_builtin: r.get::<Option<i64>, _>("is_builtin").unwrap_or(0) == 1,
            is_enabled: r.get::<Option<i64>, _>("is_enabled").unwrap_or(0) == 1,
            geo_tags_json: r.get("geo_tags_json"),
            legality_note: r.get("legality_note"),
            last_scan_at: r.get("last_scan_at"),
            last_scan_json: r.get("last_scan_json"),
        })
        .collect())
}

#[tauri::command]
pub async fn db_set_source_enabled(
    source_id: i64,
    enabled: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ?")
        .bind(if enabled { 1 } else { 0 })
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_set_source_enabled: {e}"))?;
    Ok(())
}

/// Add a user source: an RSS feed (url, https-only) or an ATS company board
/// (slug + ats_* type). Created enabled; never builtin.
#[tauri::command]
pub async fn db_add_source(
    name: String,
    source_type: String,
    url: Option<String>,
    slug: Option<String>,
    db: State<'_, Db>,
) -> Result<i64, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("db_add_source: name is required".to_string());
    }
    let (url, slug, note) = match source_type.as_str() {
        "rss" => {
            let url = url.unwrap_or_default().trim().to_string();
            require_https(&url)
                .map_err(|_| "db_add_source: RSS source needs an https:// feed URL".to_string())?;
            (
                url,
                None::<String>,
                "User-added RSS feed - public, machine-readable.",
            )
        }
        "ats_greenhouse" | "ats_lever" | "ats_ashby" | "ats_personio" => {
            let slug = slug.unwrap_or_default().trim().to_lowercase();
            if slug.is_empty() {
                return Err("db_add_source: ATS source needs a company slug".to_string());
            }
            (
                String::new(),
                Some(slug),
                "Tier 3 - public ATS JSON API, built for machine reading.",
            )
        }
        other => return Err(format!("db_add_source: unsupported source type: {other}")),
    };

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO sources
           (name, type, url, slug, is_builtin, is_enabled, geo_tags_json, legality_note, created_at)
         VALUES (?, ?, ?, ?, 0, 1, '[\"worldwide\"]', ?, datetime('now'))
         RETURNING id",
    )
    .bind(&name)
    .bind(&source_type)
    .bind(&url)
    .bind(&slug)
    .bind(note)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("db_add_source: {e}"))?;
    Ok(id)
}

/// Remove a user-added source. Builtin sources can only be disabled.
#[tauri::command]
pub async fn db_remove_source(source_id: i64, db: State<'_, Db>) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM sources WHERE id = ? AND is_builtin = 0")
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_remove_source: {e}"))?;
    if result.rows_affected() == 0 {
        return Err("db_remove_source: source not found or builtin".to_string());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests (fixtures only - no network)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    fn raw(title: &str, jd: &str, url: &str) -> RawJob {
        RawJob {
            title: title.to_string(),
            company: "Acme".to_string(),
            jd_text: jd.to_string(),
            location: "Remote".to_string(),
            url: url.to_string(),
            detail_ref: None,
        }
    }

    /// Every market must recognise its own largest tech city, and must not
    /// recognise another market's. This is the guard against a market being added
    /// later with a country-name-only token list, which the strict filter in the
    /// scan would turn into silently dropped jobs.
    #[test]
    fn every_market_recognises_its_own_city_and_no_other() {
        let cases: &[(&str, &str)] = &[
            ("de", "Berlin"),
            ("gb", "London"),
            ("us", "San Francisco, CA"),
            ("ru", "Москва"),
            ("es", "Madrid"),
            ("fr", "Paris"),
            ("ua", "Київ"),
            ("pl", "Warsaw"),
        ];

        for market in KNOWN_LOCAL_MARKETS {
            assert!(
                cases.iter().any(|(code, _)| code == market),
                "market {market} has no parity case - add one"
            );
        }

        for (market, city) in cases {
            let cfg = build_geo_cfg(&[], &[market.to_string()]);
            assert!(geo_passes(city, &cfg), "{market} must accept {city}");

            for (other, _) in cases {
                if other == market {
                    continue;
                }
                let other_cfg = build_geo_cfg(&[], &[other.to_string()]);
                assert!(
                    !geo_passes(city, &other_cfg),
                    "{other} must not accept {city}"
                );
            }
        }
    }

    /// The token table must not read another country's ISO code as a US state.
    /// `loc_matches` is case-insensitive, so a two-letter state code that is also
    /// a country code silently annexes that country into the US market.
    #[test]
    fn a_us_market_does_not_swallow_countries_sharing_a_state_code() {
        let us = build_geo_cfg(&[], &["us".to_string()]);
        for elsewhere in [
            "Tel Aviv, IL",
            "Casablanca, MA",
            "Bogota, CO",
            "Chisinau, MD",
            "Panama City, PA",
            "Baku, AZ",
            "Ulaanbaatar, MN",
            "Tunis, TN",
        ] {
            assert!(!geo_passes(elsewhere, &us), "{elsewhere} is not in the US");
        }
        // The states themselves are still reachable by name.
        for state in [
            "Chicago, Illinois",
            "Boston, Massachusetts",
            "Denver, Colorado",
            "Phoenix, Arizona",
            "Nashville, Tennessee",
        ] {
            assert!(geo_passes(state, &us), "{state} is in the US");
        }
    }

    /// A UK scope must not annex New South Wales.
    #[test]
    fn a_uk_market_does_not_swallow_new_south_wales() {
        let uk = build_geo_cfg(&[], &["gb".to_string()]);
        assert!(!geo_passes("Sydney, New South Wales", &uk));
        assert!(geo_passes("Cardiff", &uk));
        assert!(geo_passes("London, UK", &uk));
    }

    // -- Bundesagentur fuer Arbeit -------------------------------------------

    #[test]
    fn arbeitsagentur_maps_list_fields() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{
                 "titel":"Frontend Entwickler (m/w/d)",
                 "beruf":"Softwareentwickler",
                 "refnr":"10000-1198013731-S",
                 "arbeitgeber":"Muster GmbH",
                 "arbeitsort":{"ort":"Berlin","plz":"10115","region":"Berlin"}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin, Berlin, Deutschland");
        assert_eq!(
            jobs[0].url,
            "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1198013731-S"
        );
        assert_eq!(jobs[0].detail_ref.as_deref(), Some("10000-1198013731-S"));
        // Placeholder body until the detail request runs.
        assert!(jobs[0].jd_text.contains("Softwareentwickler"));
    }

    #[test]
    fn arbeitsagentur_falls_back_to_beruf_and_external_url() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{
                 "beruf":"Pflegefachkraft",
                 "refnr":"abc",
                 "externeUrl":"https://karriere.example.de/stelle/1",
                 "arbeitsort":{"land":"Deutschland"}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert_eq!(jobs[0].title, "Pflegefachkraft");
        assert_eq!(jobs[0].location, "Deutschland");
        assert_eq!(jobs[0].url, "https://karriere.example.de/stelle/1");
    }

    #[test]
    fn arbeitsagentur_geo_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &["de".to_string()]);
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{"titel":"X","refnr":"r","arbeitsort":{"ort":"Muenchen"}}]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert!(geo_passes(&jobs[0].location, &cfg));
    }

    #[test]
    fn arbeitsagentur_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_arbeitsagentur(&serde_json::json!({})).is_empty());
        assert!(parse_arbeitsagentur(&serde_json::json!({"stellenangebote":[]})).is_empty());
    }

    // -- TrudVsem (Russia) ----------------------------------------------------

    #[test]
    fn trudvsem_reads_vacancy_fields_and_appends_russia() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"results":{"vacancies":[{"vacancy":{
                 "job-name":"Backend Developer",
                 "company":{"name":"Acme LLC"},
                 "region":{"name":"Москва"},
                 "vac_url":"https://trudvsem.ru/vacancy/1",
                 "duty":"Write code",
                 "requirement":"Rust experience"
               }}]}}"#,
        )
        .unwrap();
        let jobs = parse_trudvsem(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Backend Developer");
        assert_eq!(jobs[0].company, "Acme LLC");
        assert_eq!(jobs[0].location, "Москва, Russia");
        assert_eq!(jobs[0].url, "https://trudvsem.ru/vacancy/1");
        assert!(jobs[0].jd_text.contains("Write code"));
        assert!(jobs[0].jd_text.contains("Rust experience"));
    }

    #[test]
    fn trudvsem_missing_region_falls_back_to_bare_russia() {
        let val: serde_json::Value =
            serde_json::from_str(r#"{"results":{"vacancies":[{"vacancy":{"job-name":"QA"}}]}}"#)
                .unwrap();
        assert_eq!(parse_trudvsem(&val)[0].location, "Russia");
    }

    #[test]
    fn trudvsem_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_trudvsem(&serde_json::json!({})).is_empty());
        assert!(parse_trudvsem(&serde_json::json!({"results":{"vacancies":[]}})).is_empty());
    }

    // -- Arbeitnow (Germany) ---------------------------------------------------

    #[test]
    fn arbeitnow_reads_job_fields_and_appends_germany() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"data":[{
                 "title":"Frontend Engineer",
                 "company_name":"Muster GmbH",
                 "description":"<p>Build things.</p>",
                 "location":"Berlin",
                 "url":"https://arbeitnow.com/jobs/1"
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitnow(&val);
        assert_eq!(jobs[0].title, "Frontend Engineer");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin, Germany");
        assert!(jobs[0].jd_text.contains("Build things."));
    }

    #[test]
    fn arbeitnow_missing_location_falls_back_to_bare_germany() {
        let val: serde_json::Value = serde_json::from_str(r#"{"data":[{"title":"QA"}]}"#).unwrap();
        assert_eq!(parse_arbeitnow(&val)[0].location, "Germany");
    }

    #[test]
    fn arbeitnow_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_arbeitnow(&serde_json::json!({})).is_empty());
        assert!(parse_arbeitnow(&serde_json::json!({"data":[]})).is_empty());
    }

    // -- No Fluff Jobs (Poland) -------------------------------------------------

    #[test]
    fn nofluffjobs_reads_root_array_shape() {
        let val: serde_json::Value = serde_json::from_str(
            r#"[{
                 "title":"Java Developer",
                 "name":"Acme Sp. z o.o.",
                 "url":"java-developer-acme",
                 "category":"backend",
                 "technology":"java",
                 "seniority":["Mid"],
                 "location":{"places":[{"city":"Warsaw"}],"fullyRemote":false}
               }]"#,
        )
        .unwrap();
        let jobs = parse_nofluffjobs(&val);
        assert_eq!(jobs[0].title, "Java Developer");
        assert_eq!(jobs[0].company, "Acme Sp. z o.o.");
        assert_eq!(jobs[0].location, "Warsaw, Poland");
        assert_eq!(
            jobs[0].url,
            "https://nofluffjobs.com/job/java-developer-acme"
        );
        assert!(jobs[0].jd_text.contains("backend"));
        assert!(jobs[0].jd_text.contains("java"));
        assert!(jobs[0].jd_text.contains("Mid"));
    }

    #[test]
    fn nofluffjobs_reads_postings_wrapper_shape_and_remote() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"postings":[{
                 "title":"DevOps",
                 "companyName":"Acme",
                 "url":"https://nofluffjobs.com/job/devops-acme",
                 "location":{"places":[],"fullyRemote":true}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_nofluffjobs(&val);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].location, "Remote, Poland");
        assert_eq!(jobs[0].url, "https://nofluffjobs.com/job/devops-acme");
    }

    #[test]
    fn nofluffjobs_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_nofluffjobs(&serde_json::json!({})).is_empty());
        assert!(parse_nofluffjobs(&serde_json::json!([])).is_empty());
    }

    // -- Personio company boards ---------------------------------------------

    #[test]
    fn personio_reads_title_office_and_all_description_sections() {
        let xml = r#"<workzag-jobs>
          <position>
            <id>1234</id>
            <subcompany>Muster GmbH</subcompany>
            <office>Berlin</office>
            <name>Frontend Entwickler (m/w/d)</name>
            <jobDescriptions>
              <jobDescription><name>Aufgaben</name><value><![CDATA[<p>Du baust das Web-Frontend.</p>]]></value></jobDescription>
              <jobDescription><name>Dein Profil</name><value><![CDATA[<ul><li>Angular</li></ul>]]></value></jobDescription>
            </jobDescriptions>
          </position>
        </workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "muster", "Muster");
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin");
        assert_eq!(jobs[0].url, "https://muster.jobs.personio.de/job/1234");
        // Both sections land, headings included.
        assert!(jobs[0].jd_text.contains("Aufgaben"));
        assert!(jobs[0].jd_text.contains("Du baust das Web-Frontend."));
        assert!(jobs[0].jd_text.contains("Dein Profil"));
        assert!(jobs[0].jd_text.contains("Angular"));
    }

    #[test]
    fn personio_title_is_not_taken_from_a_description_heading() {
        let xml = r#"<workzag-jobs><position>
            <name>Werkstudent Data</name>
            <jobDescriptions><jobDescription><name>Aufgaben</name><value>x</value></jobDescription></jobDescriptions>
          </position></workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "acme", "Acme");
        assert_eq!(jobs[0].title, "Werkstudent Data");
    }

    #[test]
    fn personio_falls_back_to_the_slug_company_and_board_url() {
        let xml = r#"<workzag-jobs><position><name>QA</name></position></workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "acme", "Acme");
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].url, "https://acme.jobs.personio.de");
    }

    #[test]
    fn personio_empty_or_unrelated_xml_yields_nothing() {
        assert!(parse_personio_xml("<workzag-jobs></workzag-jobs>", "a", "A").is_empty());
        assert!(parse_personio_xml("<rss><item></item></rss>", "a", "A").is_empty());
    }

    #[test]
    fn german_city_alone_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        for city in ["Berlin", "München", "Koeln", "Frankfurt am Main"] {
            assert!(geo_passes(city, &cfg), "{city} should pass a DE scope");
        }
        assert!(!geo_passes("Warsaw", &cfg));
    }

    #[test]
    fn percent_encoding_keeps_one_path_segment() {
        assert_eq!(percent_encode_segment("10000-119-S"), "10000-119-S");
        assert_eq!(percent_encode_segment("a/b c"), "a%2Fb%20c");
        assert_eq!(percent_encode_segment("x+y="), "x%2By%3D");
    }

    // -- title filter --------------------------------------------------------

    #[test]
    fn keyword_list_parses_json_and_plain_text() {
        assert_eq!(
            parse_keyword_list(Some(r#"["Angular", " Senior "]"#)),
            vec!["angular", "senior"]
        );
        assert_eq!(
            parse_keyword_list(Some("angular, senior\nfrontend")),
            vec!["angular", "senior", "frontend"]
        );
        assert!(parse_keyword_list(None).is_empty());
        assert!(parse_keyword_list(Some("")).is_empty());
    }

    #[test]
    fn title_filter_positive_negative() {
        let f = TitleFilter {
            positive: vec!["frontend".into(), "angular".into()],
            negative: vec!["intern".into()],
        };
        assert!(title_passes("Senior Frontend Engineer", &f));
        assert!(title_passes("Angular Developer", &f));
        assert!(!title_passes("Backend Engineer", &f));
        assert!(!title_passes("Frontend Intern", &f)); // negative wins
        let open = TitleFilter {
            positive: vec![],
            negative: vec![],
        };
        assert!(title_passes("Anything At All", &open));
    }

    #[test]
    fn archetype_keywords_derived_from_phrases() {
        let kw = derive_title_keywords(Some(r#"["Senior Frontend Engineer", "Tech Lead"]"#));
        assert_eq!(kw, vec!["senior", "frontend", "engineer", "tech", "lead"]);
        assert!(derive_title_keywords(None).is_empty());
    }

    // -- geo filter ----------------------------------------------------------

    #[test]
    fn geo_worldwide_passes_everything() {
        let cfg = build_geo_cfg(&[], &[]);
        assert!(geo_passes("Tokyo, Japan", &cfg));
        assert!(geo_passes("", &cfg));
    }

    #[test]
    fn geo_europe_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg));
        assert!(geo_passes("Remote - EMEA", &cfg));
        assert!(geo_passes("Remote", &cfg)); // remote marker always passes
        assert!(geo_passes("", &cfg)); // unknown location never drops
        assert!(!geo_passes("New York, USA", &cfg));
    }

    #[test]
    fn geo_country_codes_match_names_not_substrings() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        assert!(geo_passes("Munich, Germany", &cfg));
        assert!(geo_passes("DE", &cfg));
        // "de" must not light up inside unrelated words
        assert!(!geo_passes("Designer Hub, Tokyo", &cfg));
    }

    #[test]
    fn geo_multi_scope_unions_every_selected_region() {
        // Europe + Asia selected together -> a job from either passes, one
        // from neither (e.g. Brazil) does not.
        let cfg = build_geo_cfg(&["europe".to_string(), "asia".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg));
        assert!(geo_passes("Tokyo, Japan", &cfg));
        assert!(!geo_passes("Sao Paulo, Brazil", &cfg));
    }

    #[test]
    fn geo_namerica_scope_covers_us_canada_and_mexico() {
        let cfg = build_geo_cfg(&["namerica".to_string()], &[]);
        assert!(geo_passes("Austin, USA", &cfg));
        assert!(geo_passes("Toronto, Canada", &cfg));
        assert!(geo_passes("Mexico City, Mexico", &cfg));
        assert!(!geo_passes("Berlin, Germany", &cfg));
    }

    #[test]
    fn geo_samerica_oceania_mena_africa_scopes() {
        let samerica = build_geo_cfg(&["samerica".to_string()], &[]);
        assert!(geo_passes("Montevideo, Uruguay", &samerica));
        assert!(!geo_passes("Berlin, Germany", &samerica));

        let oceania = build_geo_cfg(&["oceania".to_string()], &[]);
        assert!(geo_passes("Sydney, Australia", &oceania));

        let mena = build_geo_cfg(&["mena".to_string()], &[]);
        assert!(geo_passes("Dubai, UAE", &mena));

        let africa = build_geo_cfg(&["africa".to_string()], &[]);
        assert!(geo_passes("Cape Town, South Africa", &africa));
    }

    #[test]
    fn parse_geo_scopes_reads_json_array_and_drops_unknown_keys() {
        assert_eq!(
            parse_geo_scopes(r#"["europe","asia"]"#),
            vec!["europe".to_string(), "asia".to_string()]
        );
        assert_eq!(
            parse_geo_scopes(r#"["europe","bogus"]"#),
            vec!["europe".to_string()]
        );
        assert!(parse_geo_scopes("").is_empty());
        assert!(parse_geo_scopes("[]").is_empty());
    }

    #[test]
    fn parse_local_markets_reads_json_array_and_drops_unknown_codes() {
        assert_eq!(
            parse_local_markets(r#"["de","fr"]"#),
            vec!["de".to_string(), "fr".to_string()]
        );
        assert_eq!(
            parse_local_markets(r#"["de","atlantis"]"#),
            vec!["de".to_string()]
        );
        assert!(parse_local_markets("").is_empty());
        assert!(parse_local_markets("[]").is_empty());
    }

    #[test]
    fn parse_local_markets_reads_the_legacy_single_scalar() {
        // Written by the first cut of the picker, before multi-select.
        assert_eq!(parse_local_markets("de"), vec!["de".to_string()]);
        assert!(parse_local_markets("atlantis").is_empty());
    }

    #[test]
    fn a_local_market_narrows_to_its_own_country() {
        let cfg = build_geo_cfg(&[], &["pl".to_string()]);
        assert!(geo_passes("Warsaw, Poland", &cfg));
        assert!(!geo_passes("Berlin, Germany", &cfg));
        // Conservative inclusion still holds: remote and unknown never drop.
        assert!(geo_passes("Remote", &cfg));
        assert!(geo_passes("", &cfg));
    }

    #[test]
    fn several_local_markets_union_their_countries() {
        let cfg = build_geo_cfg(&[], &["de".to_string(), "ua".to_string()]);
        assert!(geo_passes("Berlin", &cfg));
        assert!(geo_passes("Kyiv, Ukraine", &cfg));
        assert!(!geo_passes("Warsaw, Poland", &cfg));
    }

    #[test]
    fn russian_and_ukrainian_places_pass_in_either_script() {
        let ru = build_geo_cfg(&[], &["ru".to_string()]);
        // What TrudVsem actually emits once parse_trudvsem appends the country.
        assert!(geo_passes("Москва, Russia", &ru));
        assert!(geo_passes("Санкт-Петербург", &ru));
        assert!(geo_passes("Moscow", &ru));
        assert!(!geo_passes("Kyiv, Ukraine", &ru));

        let ua = build_geo_cfg(&[], &["ua".to_string()]);
        assert!(geo_passes("Київ", &ua));
        assert!(geo_passes("Lviv, Ukraine", &ua));
        assert!(!geo_passes("Москва, Russia", &ua));
    }

    #[test]
    fn a_local_market_ignores_the_region_scope_entirely() {
        // The mutual-exclusion contract: Settings clears geo_scope when a
        // market is picked, and the scan passes an empty scope list to match.
        // A Europe scope must not smuggle Berlin into a Poland-only search.
        let cfg = build_geo_cfg(&[], &["pl".to_string()]);
        assert!(!geo_passes("Berlin, Germany", &cfg));
        assert!(!geo_passes("Munich", &cfg));

        // Carve-out, unchanged from region mode and deliberate: anything
        // carrying a remote marker still passes, because a remote posting is
        // not "somewhere else" - it is nowhere in particular.
        assert!(geo_passes("Remote - EMEA", &cfg));
    }

    #[test]
    fn parse_geo_scopes_maps_legacy_scalars() {
        assert_eq!(parse_geo_scopes("europe"), vec!["europe".to_string()]);
        assert_eq!(parse_geo_scopes("eu"), vec!["europe".to_string()]);
        assert_eq!(parse_geo_scopes("usa"), vec!["namerica".to_string()]);
        assert_eq!(parse_geo_scopes("asia"), vec!["asia".to_string()]);
        assert!(parse_geo_scopes("worldwide").is_empty());
        assert!(parse_geo_scopes("custom").is_empty());
    }

    // -- parsers -------------------------------------------------------------

    #[test]
    fn remotive_fixture_parses() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"jobs":[{"title":"Frontend Dev","company_name":"Acme",
                 "description":"<p>Build &amp; ship</p>",
                 "candidate_required_location":"Europe",
                 "url":"https://remotive.com/jobs/1"}]}"#,
        )
        .unwrap();
        let jobs = parse_remotive(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Dev");
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].jd_text, "Build & ship");
        assert_eq!(jobs[0].location, "Europe");
    }

    #[test]
    fn himalayas_tolerates_root_array_and_field_spellings() {
        let val: serde_json::Value = serde_json::from_str(
            r#"[{"title":"Rust Dev","companyName":"Ferrous",
                 "description":"Systems work",
                 "locationRestrictions":["Germany","Austria"],
                 "applicationLink":"https://himalayas.app/jobs/2"}]"#,
        )
        .unwrap();
        let jobs = parse_himalayas(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].company, "Ferrous");
        assert_eq!(jobs[0].location, "Germany, Austria");
    }

    #[test]
    fn rss_wwr_splits_company_from_title() {
        let xml = r#"<rss><channel>
            <item><title>Acme: Senior Dev</title>
              <region>Anywhere in the World</region>
              <link>https://weworkremotely.com/jobs/3</link>
              <description><![CDATA[<p>Great job</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, true);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].title, "Senior Dev");
        assert_eq!(jobs[0].jd_text, "Great job");
        assert_eq!(jobs[0].location, "Anywhere in the World");

        let generic = parse_rss_items(xml, false);
        assert_eq!(generic[0].title, "Acme: Senior Dev");
        assert_eq!(generic[0].company, "");
    }

    #[test]
    fn rss_location_falls_back_to_place_like_category() {
        // No <region>/<location>; a <category> naming a place is used, while the
        // job-type category is ignored.
        let xml = r#"<rss><channel>
            <item><title>Backend Engineer</title>
              <category>Full-Time</category>
              <category>Berlin, Germany</category>
              <link>https://example.com/jobs/1</link>
              <description><![CDATA[<p>Build things</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Berlin, Germany");
    }

    #[test]
    fn rss_location_reads_body_label() {
        let xml = r#"<rss><channel>
            <item><title>Data Engineer (m/w/d)</title>
              <link>https://example.com/jobs/2</link>
              <description><![CDATA[<p>About us</p><p>Standort: Munich</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Munich");
    }

    #[test]
    fn rss_location_marks_remote_when_only_signal() {
        let xml = r#"<rss><channel>
            <item><title>Frontend Engineer</title>
              <link>https://example.com/jobs/3</link>
              <description><![CDATA[<p>Fully remote, work from anywhere.</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Remote");
    }

    #[test]
    fn rss_location_stays_empty_without_any_signal() {
        // "(m/w/d)" and a plain JD must not be mistaken for a location.
        let xml = r#"<rss><channel>
            <item><title>Software Engineer (m/w/d)</title>
              <category>Engineering</category>
              <link>https://example.com/jobs/4</link>
              <description><![CDATA[<p>Join our team building products.</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "");
    }

    #[test]
    fn greenhouse_fixture_parses_escaped_content() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"jobs":[{"title":"Platform Eng","content":"&lt;p&gt;Do platform things&lt;/p&gt;",
                 "absolute_url":"https://boards.greenhouse.io/acme/jobs/4",
                 "location":{"name":"Berlin"}}]}"#,
        )
        .unwrap();
        let jobs = parse_greenhouse_board(&val, "Acme");
        assert_eq!(jobs[0].jd_text, "Do platform things");
        assert_eq!(jobs[0].location, "Berlin");
        assert_eq!(jobs[0].company, "Acme");
    }

    #[test]
    fn lever_and_ashby_fixtures_parse() {
        let lever: serde_json::Value = serde_json::from_str(
            r#"[{"text":"Data Eng","descriptionPlain":"Pipelines",
                 "categories":{"location":"Remote - Europe"},
                 "hostedUrl":"https://jobs.lever.co/acme/5"}]"#,
        )
        .unwrap();
        let jobs = parse_lever_postings(&lever, "Acme");
        assert_eq!(jobs[0].title, "Data Eng");
        assert_eq!(jobs[0].location, "Remote - Europe");

        let ashby: serde_json::Value = serde_json::from_str(
            r#"{"name":"Acme","jobs":[{"title":"ML Eng","location":"Remote",
                 "descriptionPlain":"Models","jobUrl":"https://jobs.ashbyhq.com/acme/6"}]}"#,
        )
        .unwrap();
        let jobs = parse_ashby_board(&ashby);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].title, "ML Eng");
    }

    // -- dedupe --------------------------------------------------------------

    #[tokio::test]
    async fn scan_insert_dedupes_by_jd_hash() {
        let pool = test_pool().await;
        let job = raw("Senior Dev", "A long unique description", "https://x/1");
        assert!(insert_scanned_job(&pool, &job, "Remotive").await.unwrap());
        assert!(!insert_scanned_job(&pool, &job, "Remotive").await.unwrap());

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn dismissed_job_stays_dismissed_on_rescan() {
        let pool = test_pool().await;
        let job = raw("Senior Dev", "Another unique description", "https://x/2");
        insert_scanned_job(&pool, &job, "Remotive").await.unwrap();
        sqlx::query("UPDATE jobs SET discover_dismissed = 1")
            .execute(&pool)
            .await
            .unwrap();

        // Re-scan finds the same job again - it must stay ignored + dismissed.
        assert!(!insert_scanned_job(&pool, &job, "Remotive").await.unwrap());
        let dismissed: i64 = sqlx::query_scalar("SELECT discover_dismissed FROM jobs LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dismissed, 1);
    }

    #[tokio::test]
    async fn discover_clear_deletes_only_unsaved_scanned_jobs() {
        let pool = test_pool().await;
        // Two scanned jobs; save the first by giving it an application row.
        insert_scanned_job(
            &pool,
            &raw("Saved Role", "jd one", "https://x/1"),
            "Remotive",
        )
        .await
        .unwrap();
        insert_scanned_job(
            &pool,
            &raw("Unsaved Role", "jd two", "https://x/2"),
            "Remotive",
        )
        .await
        .unwrap();
        let saved_id: i64 = sqlx::query_scalar("SELECT id FROM jobs WHERE title = 'Saved Role'")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO applications (job_id, status, updated_at) VALUES (?, 'saved', datetime('now'))")
            .bind(saved_id)
            .execute(&pool)
            .await
            .unwrap();

        let removed = discover_clear_core(&pool).await.unwrap();
        assert_eq!(removed, 1, "only the unsaved job should be deleted");

        let remaining: Vec<String> = sqlx::query_scalar("SELECT title FROM jobs ORDER BY title")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, vec!["Saved Role".to_string()]);
    }

    // -- live network checks (run manually: cargo test -- --ignored) ---------

    fn live_source(id: i64, name: &str, source_type: &str, url: &str) -> SourceRow {
        SourceRow {
            id,
            name: name.to_string(),
            source_type: source_type.to_string(),
            url: url.to_string(),
            slug: None,
            positive_json: None,
            negative_json: None,
        }
    }

    #[tokio::test]
    #[ignore = "hits real Tier-2 endpoints; run manually"]
    async fn live_tier2_sources_fetch_and_parse() {
        let client = http_client().expect("client");
        let sources = [
            live_source(1, "Remotive", "api", "https://remotive.com/api/remote-jobs"),
            live_source(
                2,
                "WWR",
                "rss",
                "https://weworkremotely.com/remote-jobs.rss",
            ),
            live_source(3, "Himalayas", "api", "https://himalayas.app/jobs/api"),
            live_source(5, "DOU.ua", "rss", "https://jobs.dou.ua/vacancies/feeds/"),
            live_source(6, "Djinni.co", "rss", "https://djinni.co/jobs/rss/"),
            live_source(7, "Habr Career", "rss", "https://career.habr.com/vacancies/rss"),
            live_source(8, "Jobicy", "rss", "https://jobicy.com/?feed=job_feed"),
            live_source(
                9,
                "TrudVsem",
                "api_trudvsem",
                "https://opendata.trudvsem.ru/api/v1/vacancies?limit=100",
            ),
            live_source(
                10,
                "Arbeitnow",
                "api_arbeitnow",
                "https://www.arbeitnow.com/api/job-board-api",
            ),
            live_source(
                11,
                "No Fluff Jobs",
                "api_nofluffjobs",
                "https://nofluffjobs.com/api/joboffers/main?salaryCurrency=PLN&salaryPeriod=month&region=pl",
            ),
        ];
        for src in &sources {
            let jobs = fetch_source_jobs(&client, src)
                .await
                .unwrap_or_else(|e| panic!("{}: {e}", src.name));
            assert!(!jobs.is_empty(), "{}: no jobs parsed", src.name);
            let j = &jobs[0];
            assert!(!j.title.is_empty(), "{}: empty title", src.name);
            assert!(!j.jd_text.is_empty(), "{}: empty jd", src.name);
        }
    }

    #[tokio::test]
    async fn empty_description_falls_back_to_distinct_hashes() {
        let pool = test_pool().await;
        let a = raw("Dev A", "", "https://x/a");
        let b = raw("Dev B", "", "https://x/b");
        assert!(insert_scanned_job(&pool, &a, "WWR").await.unwrap());
        assert!(insert_scanned_job(&pool, &b, "WWR").await.unwrap());
    }
}
