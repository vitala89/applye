# Market-driven sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a local market decides which sources are scanned and which fetched jobs are shown, identically for all eight markets.

**Architecture:** Two independent halves. (1) The scan's geo filter learns market mode: a source tagged for the market is itself geographic evidence and passes everything, while a worldwide source must name the market or be globally open, with "names somewhere else" checked _before_ the remote marker so `Remote - US only` stops slipping through. (2) Changing the market in Settings computes an enable/disable plan over built-in sources and applies it after one confirmation that names the hosts, preserving the promise that no built-in source is contacted without explicit consent.

**Tech Stack:** Rust (sqlx, tokio, tauri commands), Angular 20 signals, Jest, `cargo test`.

Spec: `docs/superpowers/specs/2026-07-24-market-driven-sources-design.md`

## Global Constraints

- Commit messages: Conventional Commits, subject in **lower case** (commitlint rejects sentence-case). No `Co-Authored-By`, no "Generated with", no AI named anywhere in commit or PR text.
- No em dash or en dash in any output, including code comments and UI strings. Use `-`.
- Gates before every commit: `cargo test --lib`, `cargo clippy -- -D warnings` (run from `apps/desktop/src-tauri`), and for frontend tasks `npx nx run-many -t test lint build --projects=desktop,core,i18n,data`.
- Rust lives in `apps/desktop/src-tauri`. Run cargo commands from that directory.
- `loc_matches` is case-insensitive and matches tokens of 3 characters or fewer only as whole words. Any new short token inherits that rule.
- An enabled source is always scanned and always visible. Market never silently skips an enabled source; it only changes which sources are enabled (via the confirmed plan) and how results are filtered.

---

### Task 1: Market parity in the token table

Brings `country_tokens()` to equal depth for all eight markets. Must land before Task 2: the strict filter is only correct on top of complete token lists.

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`EUROPE_COUNTRIES`, `country_tokens`)
- Test: same file, `mod tests`

**Interfaces:**

- Consumes: nothing.
- Produces: `country_tokens(code: &str) -> Vec<&'static str>` with full coverage for `de`, `gb`, `us`, `ru`, `es`, `fr`, `ua`, `pl`; new consts `US_STATE_NAMES: &[&str]`, `US_STATE_CODES: &[&str]`.

- [ ] **Step 1: Write the failing parity test**

Add to `mod tests` in `discover.rs`:

```rust
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/desktop/src-tauri && cargo test --lib every_market_recognises
```

Expected: FAIL. `gb must accept London` is the first assertion to blow up, because `country_tokens("gb")` carries no city names.

- [ ] **Step 3: Add the US state tables**

Insert above `fn country_tokens` in `discover.rs`:

```rust
/// Full names of every US state. Long and unambiguous, so all of them are safe
/// to match as substrings.
const US_STATE_NAMES: &[&str] = &[
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
    "washington", "west virginia", "wisconsin", "wyoming",
    "district of columbia",
];

/// State codes safe to match as bare words. Deliberately partial: `loc_matches`
/// is case-insensitive, so it cannot tell "Berlin, DE" (Germany) from
/// "Dover, DE" (Delaware). Codes that collide with a country code or with an
/// ordinary English word are left out - `de`, `in`, `or`, `me`, `hi`, `ok`,
/// `id`, `la`, `oh` - and are reachable through their full name above instead.
const US_STATE_CODES: &[&str] = &[
    "tx", "ca", "ny", "wa", "il", "co", "fl", "ga", "ma", "nc", "va", "az",
    "nj", "mi", "mn", "ut", "nv", "tn", "mo", "wi", "sc", "ct", "md", "pa",
];
```

- [ ] **Step 4: Expand the market arms of `country_tokens`**

Replace these arms in `country_tokens`:

```rust
        "fr" => vec![
            "fr", "france", "paris", "lyon", "marseille", "toulouse", "lille",
            "bordeaux", "nantes",
        ],
        "es" => vec![
            "es", "spain", "españa", "espana", "madrid", "barcelona",
            "valencia", "seville", "sevilla", "bilbao", "malaga", "málaga",
        ],
        "pl" => vec![
            "pl", "poland", "polska", "warsaw", "warszawa", "krakow", "kraków",
            "cracow", "wroclaw", "wrocław", "gdansk", "gdańsk", "poznan",
            "poznań", "lodz", "łódź",
        ],
        "uk" | "gb" => vec![
            "uk", "gb", "united kingdom", "britain", "great britain", "england",
            "scotland", "wales", "london", "manchester", "edinburgh",
            "birmingham", "glasgow", "bristol", "leeds", "cambridge", "oxford",
        ],
```

Replace the `"us"` arm with one that folds in the state tables. Because the arms return `Vec<&'static str>`, build it:

```rust
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
```

Replace the `"ca"` arm, dropping the bare code:

```rust
        // No bare "ca": in a job location it means California far more often
        // than Canada, and a US market that silently loses San Francisco is a
        // worse failure than a Canada scope that needs the country spelled out.
        "ca" => vec![
            "canada", "toronto", "vancouver", "montreal", "montréal", "ottawa",
            "calgary", "ontario", "quebec", "québec", "british columbia",
            "alberta",
        ],
```

- [ ] **Step 5: Add Ukraine to `EUROPE_COUNTRIES`**

Ukraine is missing from that list today, so region-mode "Europe" already drops Kyiv jobs. In `EUROPE_COUNTRIES`, after `"united kingdom",`:

```rust
    "ukraine",
```

- [ ] **Step 6: Run the parity test and the full suite**

```bash
cd apps/desktop/src-tauri && cargo test --lib
```

Expected: PASS, including `every_market_recognises_its_own_city_and_no_other`. If `us must not accept ...` fails for a European city, a US state code is colliding - remove it from `US_STATE_CODES` and rely on the full name.

- [ ] **Step 7: Clippy, then commit**

```bash
cd apps/desktop/src-tauri && cargo clippy --lib -- -D warnings
```

```bash
git add apps/desktop/src-tauri/src/commands/discover.rs
git commit -m "fix(discover): give every local market the same depth of location tokens"
```

---

### Task 2: Strict market-mode geo filter

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`GeoCfg`, `build_geo_cfg`, `geo_passes`, new `build_market_cfg`, `elsewhere_tokens`)
- Test: same file, `mod tests`

**Interfaces:**

- Consumes: `country_tokens`, `region_countries`, `KNOWN_GEO_SCOPES`, `KNOWN_LOCAL_MARKETS`, `loc_matches` from Task 1 and existing code.
- Produces: `build_market_cfg(markets: &[String]) -> GeoCfg`; `geo_passes(location: &str, cfg: &GeoCfg, source_serves_market: bool) -> bool` (signature gains a third parameter); `GeoCfg` gains `elsewhere: Vec<String>`.

- [ ] **Step 1: Write the failing filter tests**

Add to `mod tests`:

```rust
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
    assert!(geo_passes("", &cfg, false), "unknown location must not drop");
    assert!(!geo_passes("New York, USA", &cfg, false));
}
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/desktop/src-tauri && cargo test --lib market_mode
```

Expected: FAIL to compile - `build_market_cfg` not found, and `geo_passes` takes 2 arguments.

- [ ] **Step 3: Extend `GeoCfg` and add the market constructor**

Replace the `GeoCfg` struct:

```rust
struct GeoCfg {
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
```

Every existing `GeoCfg { .. }` literal in `build_geo_cfg` gains `elsewhere: Vec::new()`.

Add below `build_geo_cfg`:

```rust
/// Every country and region token that does NOT belong to the selected markets.
fn elsewhere_tokens(selected: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for scope in KNOWN_GEO_SCOPES {
        out.extend(region_countries(scope).iter().map(|s| s.to_string()));
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
fn build_market_cfg(markets: &[String]) -> GeoCfg {
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
```

Add the code vocabulary next to `KNOWN_LOCAL_MARKETS`:

```rust
/// Every country code `country_tokens` knows about, used to build the
/// "somewhere else" set. Kept beside that function so the two stay in step.
const KNOWN_COUNTRY_CODES: &[&str] = &[
    "de", "at", "ch", "fr", "nl", "es", "it", "pl", "pt", "se", "dk", "fi",
    "no", "ie", "be", "cz", "gb", "us", "ca", "ru", "ua",
];
```

- [ ] **Step 4: Rewrite `geo_passes`**

```rust
/// Conservative inclusion in region mode: an empty or unknown location never
/// drops a job, only a location naming somewhere outside the scope does.
///
/// Market mode is stricter, because a market is a claim about where the user
/// can actually work. `source_serves_market` is the escape hatch: a feed tagged
/// for the selected market is itself the evidence, and many such feeds carry no
/// location field at all.
fn geo_passes(location: &str, cfg: &GeoCfg, source_serves_market: bool) -> bool {
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
```

- [ ] **Step 5: Update every existing `geo_passes` call site in tests**

All existing calls in `mod tests` take two arguments. Add `, false` to each. Run a search to find them all:

```bash
cd apps/desktop/src-tauri && grep -n "geo_passes(" src/commands/discover.rs
```

- [ ] **Step 6: Run the suite**

```bash
cd apps/desktop/src-tauri && cargo test --lib
```

Expected: PASS, all tests including the six new ones and the Task 1 parity test.

- [ ] **Step 7: Clippy, then commit**

```bash
cd apps/desktop/src-tauri && cargo clippy --lib -- -D warnings
```

```bash
git add apps/desktop/src-tauri/src/commands/discover.rs
git commit -m "feat(discover): strict geo filter in market mode"
```

---

### Task 3: Wire the filter into the scan

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`SourceRow`, the scan's source `SELECT`, the `geo_cfg` construction, the `geo_passes` call in the scan loop)

**Interfaces:**

- Consumes: `build_market_cfg`, `geo_passes(.., .., source_serves_market)` from Task 2; `parse_local_markets` (already present).
- Produces: `SourceRow.geo_tags_json: Option<String>`; `source_serves_markets(tags: Option<&str>, markets: &[String]) -> bool`.

- [ ] **Step 1: Write the failing helper test**

```rust
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
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/desktop/src-tauri && cargo test --lib source_market_tags
```

Expected: FAIL to compile - `source_serves_markets` not found.

- [ ] **Step 3: Add the helper**

```rust
/// Whether a source's `geo_tags_json` names any of the selected markets. A
/// `worldwide` tag deliberately does not count: worldwide feeds carry jobs from
/// everywhere, so they still have to prove each job belongs to the market.
fn source_serves_markets(tags_json: Option<&str>, markets: &[String]) -> bool {
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
```

- [ ] **Step 4: Carry the tags on `SourceRow`**

Add the field to the struct:

```rust
struct SourceRow {
    id: i64,
    name: String,
    source_type: String,
    url: String,
    slug: Option<String>,
    positive_json: Option<String>,
    negative_json: Option<String>,
    geo_tags_json: Option<String>,
}
```

In `discover_scan`, add the column to the `SELECT`:

```rust
    let source_rows = sqlx::query(
        "SELECT id, name, type, url, slug,
                title_filter_positive_json, title_filter_negative_json,
                geo_tags_json
         FROM sources
         WHERE is_enabled = 1 AND type != 'manual'
         ORDER BY id",
    )
```

and to the row mapping, beside `negative_json`:

```rust
            geo_tags_json: r.get("geo_tags_json"),
```

- [ ] **Step 5: Choose the cfg by mode and pass the flag**

Replace the `geo_cfg` construction added earlier:

```rust
    let geo_cfg = if markets.is_empty() {
        let active_codes: Vec<String> =
            sqlx::query_scalar("SELECT country_code FROM geo_filters WHERE is_active = 1")
                .fetch_all(&db.pool)
                .await
                .map_err(|e| format!("discover_scan: load geo filters: {e}"))?;
        build_geo_cfg(&geo_scopes, &active_codes)
    } else {
        build_market_cfg(&markets)
    };
```

Inside the per-source loop, before the per-job loop:

```rust
                let serves_market = source_serves_markets(src.geo_tags_json.as_deref(), &markets);
```

and in the filter condition, replace the `geo_passes` call:

```rust
                        || !geo_passes(&job.location, &geo_cfg, serves_market)
```

- [ ] **Step 6: Run the suite**

```bash
cd apps/desktop/src-tauri && cargo test --lib
```

Expected: PASS.

- [ ] **Step 7: Clippy, then commit**

```bash
cd apps/desktop/src-tauri && cargo clippy --lib -- -D warnings
```

```bash
git add apps/desktop/src-tauri/src/commands/discover.rs
git commit -m "feat(discover): let a market-tagged source vouch for its own jobs"
```

---

### Task 4: Plan and apply commands

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (new structs and two commands)
- Modify: `apps/desktop/src-tauri/src/lib.rs:116` (register both commands)

**Interfaces:**

- Consumes: `extract_host` (already imported in `discover.rs`).
- Produces: Tauri commands `db_market_source_plan(markets: Vec<String>) -> MarketSourcePlan` and `db_apply_market_source_plan(enable_ids: Vec<i64>, disable_ids: Vec<i64>) -> ()`; serialized shape `{ toEnable: [{id, name, host}], toDisable: [...] }`.

- [ ] **Step 1: Write the failing plan test**

```rust
#[tokio::test]
async fn the_plan_proposes_only_real_changes() {
    let pool = test_pool().await;
    // test_pool runs the migrations, which seed eleven built-in sources - and
    // several are ua-tagged. Clear them so the fixtures below are the whole
    // world for this test.
    sqlx::query("DELETE FROM sources").execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
           (100, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
           (101, 'Djinni', 'rss', 'https://djinni.co/x', 1, 1, '[\"ua\"]'),
           (102, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
           (103, 'Remotive', 'api', 'https://remotive.com/x', 1, 1, '[\"worldwide\"]'),
           (104, 'Jobicy', 'rss', 'https://jobicy.com/x', 1, 1, '[\"us\",\"worldwide\"]'),
           (105, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let plan = market_source_plan(&pool, &["ua".to_string()]).await.unwrap();

    // Only the disabled Ukrainian source is worth enabling; Djinni is already on.
    assert_eq!(plan.to_enable.iter().map(|s| s.id).collect::<Vec<_>>(), vec![100]);
    assert_eq!(plan.to_enable[0].host, "jobs.dou.ua");
    // Habr is another market. Remotive and Jobicy carry worldwide, so they are
    // left alone; source 105 is user-added and is never touched.
    assert_eq!(plan.to_disable.iter().map(|s| s.id).collect::<Vec<_>>(), vec![102]);
}

#[tokio::test]
async fn applying_the_plan_touches_only_builtin_rows() {
    let pool = test_pool().await;
    // test_pool runs the migrations, which seed eleven built-in sources - and
    // several are ua-tagged. Clear them so the fixtures below are the whole
    // world for this test.
    sqlx::query("DELETE FROM sources").execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
           (200, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
           (201, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
           (202, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
    )
    .execute(&pool)
    .await
    .unwrap();

    apply_market_source_plan(&pool, &[200], &[201, 202]).await.unwrap();

    let enabled: Vec<(i64, i64)> =
        sqlx::query_as("SELECT id, is_enabled FROM sources ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(enabled, vec![(200, 1), (201, 0), (202, 1)]);
}
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd apps/desktop/src-tauri && cargo test --lib market_source
```

Expected: FAIL to compile - `market_source_plan` and `apply_market_source_plan` not found.

- [ ] **Step 3: Add the shapes and the pure-ish core**

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourceItem {
    pub id: i64,
    pub name: String,
    /// Host only, so the confirmation names exactly what will be contacted.
    pub host: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourcePlan {
    pub to_enable: Vec<MarketSourceItem>,
    pub to_disable: Vec<MarketSourceItem>,
}

/// What changing the market would do to the built-in sources. Read-only, and
/// it proposes only rows that would actually change, so the confirmation never
/// lists a source that is already in the right state.
///
/// Enable when the tags intersect the markets; disable when they do not AND the
/// source is not tagged worldwide. The two are disjoint, so a dual-tagged
/// source like Jobicy (`["us","worldwide"]`) is offered for enabling under a US
/// market and left alone under any other. User-added rows are never touched.
async fn market_source_plan(
    pool: &SqlitePool,
    markets: &[String],
) -> Result<MarketSourcePlan, String> {
    let rows = sqlx::query(
        "SELECT id, name, url, is_enabled, geo_tags_json
         FROM sources WHERE is_builtin = 1 ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_market_source_plan: {e}"))?;

    let mut to_enable = Vec::new();
    let mut to_disable = Vec::new();
    for r in rows {
        let id: i64 = r.get("id");
        let name: String = r.get::<Option<String>, _>("name").unwrap_or_default();
        let url: String = r.get::<Option<String>, _>("url").unwrap_or_default();
        let enabled: bool = r.get::<i64, _>("is_enabled") != 0;
        let tags_json: Option<String> = r.get("geo_tags_json");
        let tags: Vec<String> = tags_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|t| t.to_lowercase())
            .collect();

        let item = MarketSourceItem {
            id,
            name,
            host: extract_host(&url).unwrap_or_default(),
        };
        let serves = tags.iter().any(|t| markets.contains(t));
        let worldwide = tags.iter().any(|t| t == "worldwide");
        if serves && !enabled {
            to_enable.push(item);
        } else if !serves && !worldwide && enabled {
            to_disable.push(item);
        }
    }
    Ok(MarketSourcePlan {
        to_enable,
        to_disable,
    })
}

/// Applies exactly the ids the user confirmed, in one transaction. `is_builtin`
/// is asserted in both statements so a stray id can never flip a user's own
/// source.
async fn apply_market_source_plan(
    pool: &SqlitePool,
    enable_ids: &[i64],
    disable_ids: &[i64],
) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (begin): {e}"))?;
    for (ids, value) in [(enable_ids, 1), (disable_ids, 0)] {
        for id in ids {
            sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ? AND is_builtin = 1")
                .bind(value)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("db_apply_market_source_plan: {e}"))?;
        }
    }
    tx.commit()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (commit): {e}"))
}
```

`sqlx::Acquire` must be in scope for `pool.begin()`. If the compiler asks, add `use sqlx::Acquire;` beside the existing `use sqlx::{Row, SqlitePool};`.

- [ ] **Step 4: Add the two Tauri commands**

```rust
#[tauri::command]
pub async fn db_market_source_plan(
    markets: Vec<String>,
    db: State<'_, Db>,
) -> Result<MarketSourcePlan, String> {
    let markets: Vec<String> = markets.iter().map(|m| m.trim().to_lowercase()).collect();
    market_source_plan(&db.pool, &markets).await
}

#[tauri::command]
pub async fn db_apply_market_source_plan(
    enable_ids: Vec<i64>,
    disable_ids: Vec<i64>,
    db: State<'_, Db>,
) -> Result<(), String> {
    apply_market_source_plan(&db.pool, &enable_ids, &disable_ids).await
}
```

- [ ] **Step 5: Register both commands**

In `apps/desktop/src-tauri/src/lib.rs`, after `commands::discover::db_set_source_enabled,`:

```rust
            commands::discover::db_market_source_plan,
            commands::discover::db_apply_market_source_plan,
```

- [ ] **Step 6: Run the suite**

```bash
cd apps/desktop/src-tauri && cargo test --lib
```

Expected: PASS.

- [ ] **Step 7: Clippy, then commit**

```bash
cd apps/desktop/src-tauri && cargo clippy --lib -- -D warnings
```

```bash
git add apps/desktop/src-tauri/src/commands/discover.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(discover): plan and apply market source changes"
```

---

### Task 5: Settings confirmation

**Files:**

- Modify: `libs/data/src/lib/services/db.service.ts:257` (two methods)
- Modify: `libs/core/src/lib/models/discover.model.ts` (two interfaces)
- Modify: `apps/desktop/src/app/pages/settings/settings.component.ts` (state, handler, template, styles)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (en and de)

**Interfaces:**

- Consumes: `db_market_source_plan`, `db_apply_market_source_plan` from Task 4; `toggleMarket`/`persistGeoTarget` from `geo-target.util.ts`.
- Produces: nothing downstream.

- [ ] **Step 1: Add the model types**

In `libs/core/src/lib/models/discover.model.ts`:

```ts
/** One source a market change would switch on or off. */
export interface MarketSourceItem {
  id: number;
  name: string;
  /** Host only - the confirmation names exactly what will be contacted. */
  host: string;
}

/** What changing the local market would do to the built-in sources. */
export interface MarketSourcePlan {
  toEnable: MarketSourceItem[];
  toDisable: MarketSourceItem[];
}
```

- [ ] **Step 2: Add the DbService methods**

In `libs/data/src/lib/services/db.service.ts`, after `setSourceEnabled`:

```ts
  /** What changing the local market would do to built-in sources. Read-only. */
  async marketSourcePlan(markets: string[]): Promise<MarketSourcePlan> {
    return tauriInvoke<MarketSourcePlan>('db_market_source_plan', { markets });
  }

  /** Applies exactly the ids the user confirmed, in one transaction. */
  async applyMarketSourcePlan(enableIds: number[], disableIds: number[]): Promise<void> {
    return tauriInvoke<void>('db_apply_market_source_plan', { enableIds, disableIds });
  }
```

Add `MarketSourcePlan` to the existing `@applye/core` import in that file.

- [ ] **Step 3: Add the i18n keys**

In `translations.ts`, in the `en` `settings` block beside `local_market_hint`:

```ts
    market_sources_title: 'Update sources for this market?',
    market_sources_enable: 'Turn on',
    market_sources_disable: 'Turn off (other markets)',
    market_sources_note:
      'Nothing is contacted until you apply this. Worldwide sources and sources you added yourself are left alone.',
    market_sources_apply: 'Apply',
```

And in the `de` block beside its `local_market_hint`:

```ts
    market_sources_title: 'Quellen für diesen Markt anpassen?',
    market_sources_enable: 'Einschalten',
    market_sources_disable: 'Ausschalten (andere Märkte)',
    market_sources_note:
      'Vor dem Anwenden wird nichts kontaktiert. Weltweite und selbst hinzugefügte Quellen bleiben unberührt.',
    market_sources_apply: 'Anwenden',
```

- [ ] **Step 4: Add component state and the handler**

In `settings.component.ts`, beside the other geo members:

```ts
  /** Pending source changes for the market just picked, awaiting confirmation. */
  protected readonly marketPlan = signal<MarketSourcePlan | null>(null);
  protected readonly applyingPlan = signal(false);
```

Change `toggleMarket` to ask for the plan after persisting:

```ts
  /** Picking a market switches to market mode, dropping the region scope. */
  async toggleMarket(market: LocalMarket): Promise<void> {
    const next = toggleMarketIn(this.geoTarget(), market);
    await this.persistGeoTarget(next);
    await this.offerMarketSources(next.markets);
  }
```

And add:

```ts
  /** Offers to switch built-in sources to match the market. Never writes by
   * itself: a built-in source reaching the network is always the user's
   * explicit choice, so this only prepares what the confirmation will show. */
  private async offerMarketSources(markets: LocalMarket[]): Promise<void> {
    if (!markets.length) {
      this.marketPlan.set(null);
      return;
    }
    try {
      const plan = await this.db.marketSourcePlan(markets);
      const empty = !plan.toEnable.length && !plan.toDisable.length;
      this.marketPlan.set(empty ? null : plan);
    } catch (e) {
      console.error('settings: market source plan failed', e);
      this.marketPlan.set(null);
    }
  }

  async applyMarketPlan(): Promise<void> {
    const plan = this.marketPlan();
    if (!plan || this.applyingPlan()) return;
    this.applyingPlan.set(true);
    try {
      await this.db.applyMarketSourcePlan(
        plan.toEnable.map((s) => s.id),
        plan.toDisable.map((s) => s.id),
      );
      this.marketPlan.set(null);
      this.toast.success(this.t()('settings.saved'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.applyingPlan.set(false);
    }
  }

  dismissMarketPlan(): void {
    this.marketPlan.set(null);
  }
```

Add `MarketSourcePlan` to the `@applye/core` import.

- [ ] **Step 5: Add the template block**

In the Job search section, directly after the `local_market_hint` paragraph:

```html
@if (marketPlan(); as plan) {
<div class="confirm" role="alertdialog" [attr.aria-label]="t()('settings.market_sources_title')">
  <p class="confirm__q">{{ t()('settings.market_sources_title') }}</p>
  @if (plan.toEnable.length) {
  <p class="market-plan__label">{{ t()('settings.market_sources_enable') }}</p>
  <ul class="market-plan__list">
    @for (s of plan.toEnable; track s.id) {
    <li>{{ s.name }} <span class="market-plan__host">{{ s.host }}</span></li>
    }
  </ul>
  } @if (plan.toDisable.length) {
  <p class="market-plan__label">{{ t()('settings.market_sources_disable') }}</p>
  <ul class="market-plan__list">
    @for (s of plan.toDisable; track s.id) {
    <li>{{ s.name }} <span class="market-plan__host">{{ s.host }}</span></li>
    }
  </ul>
  }
  <p class="hint">{{ t()('settings.market_sources_note') }}</p>
  <div class="confirm__actions">
    <button
      class="btn btn--primary btn--md"
      type="button"
      [disabled]="applyingPlan()"
      (click)="applyMarketPlan()"
    >
      {{ t()('settings.market_sources_apply') }}
    </button>
    <button
      class="btn btn--secondary btn--md"
      type="button"
      [disabled]="applyingPlan()"
      (click)="dismissMarketPlan()"
    >
      {{ t()('actions.cancel') }}
    </button>
  </div>
</div>
}
```

- [ ] **Step 6: Add the styles**

Beside `.geo-chips--muted` in the component styles:

```scss
.market-plan__label {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.market-plan__list {
  margin: 0;
  padding-left: var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.market-plan__host {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--text-tertiary);
}
```

- [ ] **Step 7: Run the frontend gates**

```bash
npx nx run-many -t test lint build --projects=desktop,core,i18n,data
```

Expected: all green, 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add libs/core/src/lib/models/discover.model.ts libs/data/src/lib/services/db.service.ts libs/i18n/src/lib/translations/translations.ts apps/desktop/src/app/pages/settings/settings.component.ts
git commit -m "feat(settings): confirm source changes when the local market changes"
```

---

### Task 6: Documentation

**Files:**

- Modify: `CHANGELOG.md` (the `[Unreleased]` local markets bullet)
- Modify: `docs/product/CURRENT_STATE.md`
- Modify: `docs/superpowers/specs/2026-07-24-market-driven-sources-design.md` (status line)

- [ ] **Step 1: Update the changelog**

In `CHANGELOG.md`, append to the existing local markets bullet under `### Added`:

```markdown
Picking a market now also offers to switch the right sources on: choose Ukraine and Applye asks once whether to turn on DOU.ua and Djinni.co and turn off the boards for other markets, listing the exact hosts it would contact, and changes nothing until you say yes. Worldwide sources stay on and are filtered instead: a job from one of them has to name your market or be open to anyone, so "Remote - US only" no longer counts as a Ukrainian job on the strength of the word "Remote". A board that is itself national vouches for its own postings, because those feeds routinely carry no location field at all.
```

- [ ] **Step 2: Update the state doc**

In `docs/product/CURRENT_STATE.md`, under the local markets entry, record: markets now drive source selection and result filtering; `country_tokens` brought to parity for all eight markets with the `CA`/California decision; Ukraine added to `EUROPE_COUNTRIES`; and that none of it is natively verified yet.

- [ ] **Step 3: Flip the spec status**

```markdown
Status: implemented 2026-07-24
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md docs/superpowers/specs/2026-07-24-market-driven-sources-design.md
git commit -m "docs: record market-driven source selection"
```

---

## Verification after the last task

Native verification is required and cannot be done from a browser preview: Settings renders only under `@else if (settings(); as s)` and `getSettings()` needs Tauri IPC.

Run `npm run tauri dev`, then:

1. Settings, pick **Ukraine**. The confirmation lists DOU.ua and Djinni.co to turn on, and any other-market source to turn off. Cancel: nothing changes. Re-pick and Apply: the drawer shows them enabled.
2. Discover, scan. DOU and Djinni jobs arrive with no location and are kept. Worldwide sources contribute only jobs naming Ukraine or marked Anywhere/Worldwide/Remote.
3. Switch to **Worldwide** (clear all markets). No confirmation appears and no source changes.
4. Repeat step 1 with **Germany** and **Poland** to confirm the flow is market-agnostic.
