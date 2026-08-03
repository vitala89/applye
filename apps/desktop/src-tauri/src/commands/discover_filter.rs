// Local discover filters (ROADMAP §11).
//
// The 0-token half of a scan: every job a source feed yields is judged here,
// on the machine, against the user's title keywords and geo scope before it is
// allowed anywhere near the database. Pure functions over strings - no I/O, no
// AI, no network - so the rules that decide whether a job is silently dropped
// stay directly unit-testable.

use super::discover_geo::{loc_matches, region_countries, REMOTE_MARKERS};
use super::discover_geo_countries::{country_tokens, KNOWN_COUNTRY_CODES};

pub(super) struct TitleFilter {
    pub(super) positive: Vec<String>,
    pub(super) negative: Vec<String>,
}

pub(super) struct GeoCfg {
    /// True when no scope is selected ("worldwide") - every job passes.
    unrestricted: bool,
    /// Tokens of the selected regions or markets - any match lets a job pass.
    tokens: Vec<String>,
    /// Market mode only: tokens naming somewhere that is NOT a selected market.
    /// Non-empty is what marks market mode. A location matching one of these is
    /// somewhere else, and is dropped before the remote marker can wave it
    /// through - which is exactly what "Remote - US only" used to do.
    elsewhere: Vec<String>,
}

// ---------------------------------------------------------------------------
// Title filter (0 tokens, ROADMAP §11 "Title filter")
// ---------------------------------------------------------------------------

/// Parse a keyword list: a JSON array of strings, with a plain
/// comma/newline-separated text fallback. Lowercased, trimmed, empties dropped.
pub(super) fn parse_keyword_list(raw: Option<&str>) -> Vec<String> {
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
///
/// Not the same function as `archetypes::derive_title_keywords`, despite the
/// name. `+` and `#` count as word characters here, so `c++` and `c#` survive
/// as keywords; that one splits on them and drops anything with a digit,
/// because it is judging whether a job is on-archetype rather than building a
/// filter. Merging them would change what a scan matches on.
pub(super) fn derive_title_keywords(archetypes: Option<&str>) -> Vec<String> {
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

pub(super) fn title_passes(title: &str, filter: &TitleFilter) -> bool {
    let t = title.to_lowercase();
    if filter.negative.iter().any(|k| t.contains(k)) {
        return false;
    }
    if filter.positive.is_empty() {
        return true;
    }
    filter.positive.iter().any(|k| t.contains(k))
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
pub(super) fn parse_geo_scopes(raw: &str) -> Vec<String> {
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

/// Builds the geo filter from the selected scope keys (union of every
/// selected region's tokens - any one matching lets a job pass) plus any
/// individually active country codes on top. An empty `scopes` list means
/// "worldwide": every job passes, unconditionally.
pub(super) fn build_geo_cfg(scopes: &[String], active_codes: &[String]) -> GeoCfg {
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
        elsewhere: Vec::new(),
    }
}

/// Every country and region token that does NOT belong to the selected markets.
///
/// A region whose own country list overlaps the selected markets is skipped
/// entirely, not just the overlapping token: EMEA includes Ukraine, so an
/// EMEA-wide remote job is open to a Ukrainian user, while a Germany-specific
/// job is not. Individual countries stay covered regardless, because
/// `KNOWN_COUNTRY_CODES` contributes each country's own tokens separately -
/// so skipping `EUROPE_COUNTRIES` for a Ukraine market still leaves
/// "germany" in `elsewhere` via `country_tokens("de")`.
fn elsewhere_tokens(selected: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for scope in KNOWN_GEO_SCOPES {
        let region = region_countries(scope);
        if region.iter().any(|t| selected.contains(&t.to_string())) {
            continue;
        }
        out.extend(region.iter().map(|s| s.to_string()));
    }
    for code in KNOWN_COUNTRY_CODES {
        out.extend(country_tokens(code).into_iter().map(str::to_string));
    }
    out.retain(|t| !selected.contains(t));
    out.sort();
    out.dedup();
    out
}

/// Market mode: narrow to the selected countries and treat anywhere else as a
/// reason to drop. Mutually exclusive with the region scope by construction -
/// see libs/core/src/lib/geo/local-market.ts for the whole contract.
pub(super) fn build_market_cfg(markets: &[String]) -> GeoCfg {
    let mut tokens: Vec<String> = Vec::new();
    for market in markets {
        let market = market.trim().to_lowercase();
        let named = country_tokens(&market);
        if named.is_empty() {
            tokens.push(market);
        } else {
            tokens.extend(named.into_iter().map(str::to_string));
        }
    }
    tokens.sort();
    tokens.dedup();
    let elsewhere = elsewhere_tokens(&tokens);
    GeoCfg {
        unrestricted: markets.is_empty(),
        tokens,
        elsewhere,
    }
}

/// Whether a source's `geo_tags_json` names any of the selected markets. A
/// `worldwide` tag deliberately does not count: worldwide feeds carry jobs from
/// everywhere, so they still have to prove each job belongs to the market.
pub(super) fn source_serves_markets(tags_json: Option<&str>, markets: &[String]) -> bool {
    if markets.is_empty() {
        return false;
    }
    let Some(raw) = tags_json else {
        return false;
    };
    let Ok(tags) = serde_json::from_str::<Vec<String>>(raw) else {
        return false;
    };
    tags.iter().any(|t| markets.contains(&t.to_lowercase()))
}

/// Conservative inclusion in region mode: an empty or unknown location never
/// drops a job, only a location naming somewhere outside the scope does.
///
/// Market mode is stricter, because a market is a claim about where the user
/// can actually work. `source_serves_market` is the escape hatch: a feed tagged
/// for the selected market is itself the evidence, and many such feeds carry no
/// location field at all.
pub(super) fn geo_passes(location: &str, cfg: &GeoCfg, source_serves_market: bool) -> bool {
    if cfg.unrestricted {
        return true;
    }
    if source_serves_market {
        return true;
    }
    let loc = location.trim().to_lowercase();
    let market_mode = !cfg.elsewhere.is_empty();
    if loc.is_empty() {
        return !market_mode;
    }
    if cfg.tokens.iter().any(|t| loc_matches(&loc, t)) {
        return true;
    }
    // Order matters: somewhere else beats the remote marker, or "Remote - US
    // only" passes a Ukraine market on the word "Remote".
    if market_mode && cfg.elsewhere.iter().any(|t| loc_matches(&loc, t)) {
        return false;
    }
    REMOTE_MARKERS.iter().any(|m| loc_matches(&loc, m))
}

#[cfg(test)]
mod tests {
    use super::*;
    // Only these two tests read a parser; a module-scope import would be dead in
    // a non-test build and fail clippy -D warnings.
    use crate::commands::discover_parsers::parse_arbeitsagentur;
    // Only the tests read this one; importing it at module scope would be dead
    // in a non-test build and fail clippy -D warnings.
    use crate::commands::discover_geo::KNOWN_LOCAL_MARKETS;

    /// Every market must recognise its own largest tech city, and must not
    /// recognise another market's. This is the guard against a market being added
    /// later with a country-name-only token list, which the strict filter in the
    /// scan would turn into silently dropped jobs.
    #[test]
    fn every_market_recognises_its_own_city_and_no_other() {
        let cases: &[(&str, &str)] = &[
            ("de", "Berlin"),
            ("us", "San Francisco, CA"),
            ("ru", "Москва"),
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
            let cfg = build_market_cfg(&[market.to_string()]);
            assert!(geo_passes(city, &cfg, false), "{market} must accept {city}");

            for (other, _) in cases {
                if other == market {
                    continue;
                }
                let other_cfg = build_market_cfg(&[other.to_string()]);
                assert!(
                    !geo_passes(city, &other_cfg, false),
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
        let us = build_market_cfg(&["us".to_string()]);
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
            assert!(
                !geo_passes(elsewhere, &us, false),
                "{elsewhere} is not in the US"
            );
        }
        // The states themselves are still reachable by name.
        for state in [
            "Chicago, Illinois",
            "Boston, Massachusetts",
            "Denver, Colorado",
            "Phoenix, Arizona",
            "Nashville, Tennessee",
        ] {
            assert!(geo_passes(state, &us, false), "{state} is in the US");
        }
    }

    /// Georgia is both a US state and a country, and the state's code "ga" is
    /// unavailable because it collides with Gabon. The state therefore keeps the
    /// ambiguous full name plus its own cities, and the known cost is recorded
    /// here rather than left for someone to rediscover: a US market can surface a
    /// posting from Georgia the country. A visible wrong result can be dismissed;
    /// a dropped job cannot.
    #[test]
    fn georgia_the_state_stays_reachable_and_its_ambiguity_is_known() {
        let us = build_market_cfg(&["us".to_string()]);
        assert!(geo_passes("Atlanta, Georgia", &us, false));
        assert!(geo_passes("Savannah, Georgia", &us, false));
        // The accepted cost, asserted so a future change to it is a decision and
        // not an accident.
        assert!(geo_passes("Tbilisi, Georgia", &us, false));
    }

    /// A PL scope must not annex New South Wales. gb is no longer a pickable
    /// market (see KNOWN_LOCAL_MARKETS), so this uses pl to keep the "a
    /// market must not swallow an unrelated place" case exercised through a
    /// market that remains selectable.
    #[test]
    fn a_pl_market_does_not_swallow_new_south_wales() {
        let pl = build_market_cfg(&["pl".to_string()]);
        assert!(!geo_passes("Sydney, New South Wales", &pl, false));
        assert!(geo_passes("Krakow", &pl, false));
        assert!(geo_passes("Warsaw, Poland", &pl, false));
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
        assert!(geo_passes("Tokyo, Japan", &cfg, false));
        assert!(geo_passes("", &cfg, false));
    }

    #[test]
    fn geo_europe_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Remote - EMEA", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false)); // remote marker always passes
        assert!(geo_passes("", &cfg, false)); // unknown location never drops
        assert!(!geo_passes("New York, USA", &cfg, false));
    }

    #[test]
    fn geo_country_codes_match_names_not_substrings() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        assert!(geo_passes("Munich, Germany", &cfg, false));
        assert!(geo_passes("DE", &cfg, false));
        // "de" must not light up inside unrelated words
        assert!(!geo_passes("Designer Hub, Tokyo", &cfg, false));
    }

    #[test]
    fn geo_multi_scope_unions_every_selected_region() {
        // Europe + Asia selected together -> a job from either passes, one
        // from neither (e.g. Brazil) does not.
        let cfg = build_geo_cfg(&["europe".to_string(), "asia".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Tokyo, Japan", &cfg, false));
        assert!(!geo_passes("Sao Paulo, Brazil", &cfg, false));
    }

    #[test]
    fn geo_namerica_scope_covers_us_canada_and_mexico() {
        let cfg = build_geo_cfg(&["namerica".to_string()], &[]);
        assert!(geo_passes("Austin, USA", &cfg, false));
        assert!(geo_passes("Toronto, Canada", &cfg, false));
        assert!(geo_passes("Mexico City, Mexico", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
    }

    #[test]
    fn geo_samerica_oceania_mena_africa_scopes() {
        let samerica = build_geo_cfg(&["samerica".to_string()], &[]);
        assert!(geo_passes("Montevideo, Uruguay", &samerica, false));
        assert!(!geo_passes("Berlin, Germany", &samerica, false));

        let oceania = build_geo_cfg(&["oceania".to_string()], &[]);
        assert!(geo_passes("Sydney, Australia", &oceania, false));

        let mena = build_geo_cfg(&["mena".to_string()], &[]);
        assert!(geo_passes("Dubai, UAE", &mena, false));

        let africa = build_geo_cfg(&["africa".to_string()], &[]);
        assert!(geo_passes("Cape Town, South Africa", &africa, false));
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
    fn source_market_tags_are_read_tolerantly() {
        let markets = vec!["ua".to_string()];
        assert!(source_serves_markets(Some(r#"["ua"]"#), &markets));
        assert!(source_serves_markets(Some(r#"["ua","pl"]"#), &markets));
        assert!(!source_serves_markets(Some(r#"["worldwide"]"#), &markets));
        assert!(!source_serves_markets(Some(r#"["de"]"#), &markets));
        assert!(!source_serves_markets(None, &markets));
        assert!(!source_serves_markets(Some("not json"), &markets));
        // No market selected: nothing is market-tagged, so region rules apply.
        assert!(!source_serves_markets(Some(r#"["ua"]"#), &[]));
    }

    #[test]
    fn a_local_market_narrows_to_its_own_country() {
        let cfg = build_geo_cfg(&[], &["pl".to_string()]);
        assert!(geo_passes("Warsaw, Poland", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
        // Conservative inclusion still holds: remote and unknown never drop.
        assert!(geo_passes("Remote", &cfg, false));
        assert!(geo_passes("", &cfg, false));
    }

    #[test]
    fn several_local_markets_union_their_countries() {
        let cfg = build_geo_cfg(&[], &["de".to_string(), "ua".to_string()]);
        assert!(geo_passes("Berlin", &cfg, false));
        assert!(geo_passes("Kyiv, Ukraine", &cfg, false));
        assert!(!geo_passes("Warsaw, Poland", &cfg, false));
    }

    #[test]
    fn russian_and_ukrainian_places_pass_in_either_script() {
        let ru = build_geo_cfg(&[], &["ru".to_string()]);
        // What TrudVsem actually emits once parse_trudvsem appends the country.
        assert!(geo_passes("Москва, Russia", &ru, false));
        assert!(geo_passes("Санкт-Петербург", &ru, false));
        assert!(geo_passes("Moscow", &ru, false));
        assert!(!geo_passes("Kyiv, Ukraine", &ru, false));

        let ua = build_geo_cfg(&[], &["ua".to_string()]);
        assert!(geo_passes("Київ", &ua, false));
        assert!(geo_passes("Lviv, Ukraine", &ua, false));
        assert!(!geo_passes("Москва, Russia", &ua, false));
    }

    #[test]
    fn a_local_market_ignores_the_region_scope_entirely() {
        // The mutual-exclusion contract: Settings clears geo_scope when a
        // market is picked, and the scan runs the strict market path
        // (build_market_cfg) instead. A Europe scope must not smuggle Berlin
        // into a Poland-only search.
        let cfg = build_market_cfg(&["pl".to_string()]);
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
        assert!(!geo_passes("Munich", &cfg, false));

        // Poland is itself in Europe, so a region-wide remote posting still
        // reaches it: EMEA is not "somewhere else" for a market inside EMEA.
        assert!(geo_passes("Remote - EMEA", &cfg, false));
    }

    #[test]
    fn market_mode_drops_somewhere_else_before_the_remote_marker() {
        // The whole point: "Remote" used to wave this through untouched.
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(!geo_passes("Remote - US only", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
    }

    #[test]
    fn market_mode_keeps_the_market_and_globally_open_remote() {
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("Kyiv", &cfg, false));
        assert!(geo_passes("Ukraine", &cfg, false));
        assert!(geo_passes("Львів", &cfg, false));
        assert!(geo_passes("Anywhere", &cfg, false));
        assert!(geo_passes("Worldwide", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false));
    }

    #[test]
    fn a_region_wide_remote_job_reaches_a_market_inside_that_region() {
        let ua = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("Remote - EMEA", &ua, false));
        assert!(geo_passes("Remote, Europe", &ua, false));
        // A country inside the same region is still somewhere else.
        assert!(!geo_passes("Berlin, Germany", &ua, false));
        // A region that does not contain the market still counts as elsewhere.
        let us = build_market_cfg(&["us".to_string()]);
        assert!(!geo_passes("Remote - EMEA", &us, false));
    }

    #[test]
    fn market_mode_drops_an_empty_or_unreadable_location() {
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(!geo_passes("", &cfg, false));
        assert!(!geo_passes("(m/w/d) Full-Time", &cfg, false));
    }

    #[test]
    fn a_source_tagged_for_the_market_passes_everything() {
        // DOU and Djinni RSS items frequently carry no location at all; the source
        // itself is the geographic evidence.
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("", &cfg, true));
        assert!(geo_passes("(m/w/d) Full-Time", &cfg, true));
        assert!(geo_passes("Berlin, Germany", &cfg, true));
    }

    #[test]
    fn several_markets_accept_each_other_and_reject_the_rest() {
        let cfg = build_market_cfg(&["de".to_string(), "pl".to_string()]);
        assert!(geo_passes("Berlin", &cfg, false));
        assert!(geo_passes("Warsaw", &cfg, false));
        assert!(!geo_passes("Kyiv", &cfg, false));
    }

    #[test]
    fn region_mode_is_untouched_by_the_market_rules() {
        // No market selected: conservative inclusion still applies, unchanged.
        let cfg = build_geo_cfg(&["europe".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false));
        assert!(
            geo_passes("", &cfg, false),
            "unknown location must not drop"
        );
        assert!(!geo_passes("New York, USA", &cfg, false));
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

    // -- geo filter against a real parser's output ---------------------------

    #[test]
    fn arbeitsagentur_geo_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &["de".to_string()]);
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{"titel":"X","refnr":"r","arbeitsort":{"ort":"Muenchen"}}]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert!(geo_passes(&jobs[0].location, &cfg, false));
    }
    #[test]
    fn german_city_alone_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        for city in ["Berlin", "München", "Koeln", "Frankfurt am Main"] {
            assert!(
                geo_passes(city, &cfg, false),
                "{city} should pass a DE scope"
            );
        }
        assert!(!geo_passes("Warsaw", &cfg, false));
    }
}
