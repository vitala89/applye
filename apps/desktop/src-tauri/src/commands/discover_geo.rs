// Geography for the Discover scan: what counts as which place.
//
// Split out of `discover.rs`, which was the largest file in the repository at
// 3245 lines against an 800 budget. This half is pure lookup - freetext names
// for a region, the tokens a country code also answers to, and the tests that
// say a location matches - with no database, no network and no state. It is
// the half worth reading on its own, and the half that changes when a market
// is added rather than when the scan does.
//
// Every item is `pub(super)`: the scan is the only caller, and widening it
// further would invite the tables to grow a second home.

// ---------------------------------------------------------------------------
// Geo filter (ROADMAP §11 "Geographic filtering")
// ---------------------------------------------------------------------------

/// Freetext markers meaning "location does not restrict this job".
pub(super) const REMOTE_MARKERS: &[&str] =
    &["remote", "anywhere", "worldwide", "global", "distributed"];

/// European country names for the europe/eu scopes. One shared list for both
/// scopes in v1 (includes non-EU Europe: UK, Switzerland, Norway).
pub(super) const EUROPE_COUNTRIES: &[&str] = &[
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
pub(super) const ASIA_COUNTRIES: &[&str] = &[
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
pub(super) const NAMERICA_COUNTRIES: &[&str] = &[
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
pub(super) const SAMERICA_COUNTRIES: &[&str] = &[
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
pub(super) const OCEANIA_COUNTRIES: &[&str] = &["oceania", "anz", "australia", "new zealand"];

/// Middle East / North Africa names for the mena scope.
pub(super) const MENA_COUNTRIES: &[&str] = &[
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
pub(super) const AFRICA_COUNTRIES: &[&str] = &[
    "africa",
    "south africa",
    "nigeria",
    "kenya",
    "morocco",
    "ghana",
];

/// Freetext names for one scope key. Empty for an unrecognized key.
pub(super) fn region_countries(scope: &str) -> &'static [&'static str] {
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

/// The LocalMarket vocabulary, kept in lockstep with libs/core's
/// `LOCAL_MARKETS` (TypeScript). Local markets are the narrow half of geo
/// targeting: when any is selected, `geo_scope` takes no part in the scan.
// A market appears here only when a built-in source serves it. gb, es and fr
// are omitted until one does, because otherwise picking them enables nothing
// and leaves the previous market's sources scanning. Their location tokens
// stay in `country_tokens` / `KNOWN_COUNTRY_CODES` below, since they are still
// needed to recognise "somewhere else" for the markets that remain.
pub(super) const KNOWN_LOCAL_MARKETS: &[&str] = &["de", "us", "ru", "ua", "pl"];

/// Every country code `country_tokens` knows about, used to build the
/// "somewhere else" set. Kept beside that function so the two stay in step.
pub(super) const KNOWN_COUNTRY_CODES: &[&str] = &[
    "de", "at", "ch", "fr", "nl", "es", "it", "pl", "pt", "se", "dk", "fi", "no", "ie", "be", "cz",
    "gb", "us", "ca", "ru", "ua",
];

/// Parses the `market` settings column: a JSON array of market codes
/// (`["de","fr"]`) going forward. An install saved between the single-market
/// picker and multi-select holds a bare scalar (`de`) - read that as a
/// one-item list. Mirrors `parseLocalMarkets` in
/// libs/core/src/lib/geo/local-market.ts. Empty means "no local market", so
/// the region scope applies instead.
pub(super) fn parse_local_markets(raw: &str) -> Vec<String> {
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
/// Full names of every US state, matched as substrings. `"georgia"` is
/// knowingly ambiguous with the country of the same name, so a US market can
/// surface an occasional posting from Georgia the country - that is the
/// deliberate direction of this file's trade, since a visible wrong result
/// can be dismissed while a dropped job cannot, and the state's own code
/// `"ga"` is unavailable because it collides with Gabon.
pub(super) const US_STATE_NAMES: &[&str] = &[
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
pub(super) const US_STATE_CODES: &[&str] = &[
    "tx", "ca", "ny", "wa", "fl", "nj", "mi", "ut", "nv", "wi", "ct",
];

pub(super) fn country_tokens(code: &str) -> Vec<&'static str> {
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
                "savannah",
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

/// Short tokens (<= 3 chars, e.g. "de", "eu", "us") only match as whole words -
/// substring matching would light up inside unrelated words ("DEsigner",
/// "dEUtschland"). Longer tokens match as substrings.
pub(super) fn loc_matches(loc: &str, token: &str) -> bool {
    if token.len() <= 3 {
        loc.split(|c: char| !c.is_alphanumeric())
            .any(|w| w == token)
    } else {
        loc.contains(token)
    }
}

/// Coarse "does this string name a place?" gate for pulling a location out of
/// messy RSS (categories, description labels). Deliberately broad and cheap; the
/// real region/country classification happens client-side. Its job is only to
/// reject noise like "(m/w/d)" or "Full-Time" while accepting anything that
/// carries a geographic signal.
pub(super) fn location_signal(s: &str) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_local_markets_reads_json_array_and_drops_unknown_codes() {
        assert_eq!(
            parse_local_markets(r#"["de","ua"]"#),
            vec!["de".to_string(), "ua".to_string()]
        );
        assert_eq!(
            parse_local_markets(r#"["de","atlantis"]"#),
            vec!["de".to_string()]
        );
        assert!(parse_local_markets("").is_empty());
        assert!(parse_local_markets("[]").is_empty());
    }

    /// fr is not a pickable market - no built-in source serves it - so it is
    /// dropped the same as any other unknown code, even though its location
    /// tokens still exist for the "somewhere else" filter.
    #[test]
    fn parse_local_markets_drops_fr_as_not_yet_a_pickable_market() {
        assert_eq!(
            parse_local_markets(r#"["de","fr"]"#),
            vec!["de".to_string()]
        );
    }

    #[test]
    fn parse_local_markets_reads_the_legacy_single_scalar() {
        // Written by the first cut of the picker, before multi-select.
        assert_eq!(parse_local_markets("de"), vec!["de".to_string()]);
        assert!(parse_local_markets("atlantis").is_empty());
    }
}
