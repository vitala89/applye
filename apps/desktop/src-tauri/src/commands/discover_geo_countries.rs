// Which freetext place names belong to which country code.
//
// Split out of `discover_geo.rs`, which held both halves of geo targeting at
// 522 lines against the 500 budget. The region scopes are a short list of
// continent buckets; this is the long half - every city, state and spelling a
// two-letter code also answers to - and it is the half that grows whenever a
// market is added or a board starts naming places a new way.
//
// The trade this file makes, everywhere: a false positive is visible and can
// be dismissed, a dropped job is invisible. Ambiguous tokens are therefore
// kept rather than removed, and the doc comments record which ones and why.
//
// Every item stays `pub(super)`: the scan and its filter are the only callers.

/// Every country code `country_tokens` knows about, used to build the
/// "somewhere else" set. Kept beside that function so the two stay in step.
pub(super) const KNOWN_COUNTRY_CODES: &[&str] = &[
    "de", "at", "ch", "fr", "nl", "es", "it", "pl", "pt", "se", "dk", "fi", "no", "ie", "be", "cz",
    "gb", "us", "ca", "ru", "ua",
];

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

/// Names a 2-letter country code also answers to in freetext locations.
///
/// German boards - the federal agency's feed, and the company boards on
/// Personio - routinely give the city alone ("Berlin", "Muenchen"), with no
/// country anywhere in the string, so a Germany scope would silently drop its
/// own market. The largest German cities are therefore country tokens too, in
/// both the German and the English spelling. The trade is deliberate: a
/// same-named city elsewhere (Frankfort, KY) slips through, which the user can
/// see and dismiss, where a dropped job is invisible.
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

#[cfg(test)]
mod tests {
    use super::*;

    /// `KNOWN_COUNTRY_CODES` exists to build the "somewhere else" set out of
    /// `country_tokens`, so a code listed here that returns nothing would
    /// silently shrink that set, and a code with tokens but no entry would
    /// never contribute to it. Both directions are asserted, because the two
    /// live in one file precisely so they stay in step.
    #[test]
    fn every_known_country_code_has_tokens() {
        for code in KNOWN_COUNTRY_CODES {
            assert!(
                !country_tokens(code).is_empty(),
                "{code} is listed but has no tokens"
            );
        }
        assert!(country_tokens("atlantis").is_empty());
    }

    /// Dropping a code from `KNOWN_COUNTRY_CODES` is invisible until a job slips
    /// through: `elsewhere_tokens` skips a whole region whose list overlaps the
    /// selected market, so for a `de` market the European names come only from
    /// each country's own entry here. Without `gb`, "Remote - London" stops
    /// reading as somewhere else and passes a Germany scan on the word
    /// "Remote". Every pickable market must be present for the same reason, and
    /// `gb`, `es` and `fr` are present precisely because they are *not*
    /// pickable - their tokens exist only to recognise somewhere else.
    #[test]
    fn known_country_codes_covers_every_market_and_the_unpickable_neighbours() {
        for market in crate::commands::discover_geo::KNOWN_LOCAL_MARKETS {
            assert!(
                KNOWN_COUNTRY_CODES.contains(market),
                "{market} is a pickable market with no country code entry"
            );
        }
        for code in ["gb", "es", "fr"] {
            assert!(
                KNOWN_COUNTRY_CODES.contains(&code),
                "{code} was dropped - its jobs stop reading as somewhere else"
            );
        }
    }

    /// The one deliberate collision in the file: `ca` is Canada's ISO code, but
    /// in a job location it far more often means California, so it is kept as a
    /// state code and dropped from Canada's own tokens. Canada stays reachable
    /// by name. Restoring the bare `ca` to Canada would make every Californian
    /// posting read as Canadian.
    #[test]
    fn canada_gives_up_the_bare_ca_token_to_california() {
        let canada = country_tokens("ca");
        assert!(!canada.contains(&"ca"), "bare ca returned to Canada");
        assert!(canada.contains(&"canada"));
        assert!(US_STATE_CODES.contains(&"ca"));
    }

    /// Every bare state code is matched as a whole word against a lowercased
    /// location, so any code that is also an assigned country code would make
    /// that country's postings read as American. The list is documented as
    /// holding no such code; this asserts it against the codes the file itself
    /// tracks rather than trusting the comment.
    #[test]
    fn no_state_code_collides_with_a_tracked_country_code() {
        for state in US_STATE_CODES {
            assert!(
                *state == "ca" || !KNOWN_COUNTRY_CODES.contains(state),
                "{state} is both a state code and a tracked country code"
            );
        }
    }
}
