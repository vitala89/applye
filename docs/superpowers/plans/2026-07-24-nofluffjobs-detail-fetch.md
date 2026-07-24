# No Fluff Jobs detail fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pull the full posting content for No Fluff Jobs so its Discover detail shows a real description, and its salary is detected, instead of a three-word stub.

**Architecture:** The No Fluff Jobs list endpoint carries no description - only category, technology, seniority. The existing parser stored those three words as `jd_text`, so the detail screen, the salary extractor, the skill detector and the raw score all had almost nothing to read. The full posting lives on a per-slug detail endpoint (`GET /api/posting/{slug}`, verified live: 200, ~16 KB, structured JSON with must-have and nice-to-have skills, a requirements description, daily tasks, and salary). This follows the exact pattern Arbeitsagentur already uses: the list parser sets a `detail_ref`, and the scan spends a bounded per-source budget resolving details for jobs that passed the filters. A pure `parse_nofluffjobs_detail` builds a structured `jd_text` (headings the existing block renderer already recognises), and the salary currency marker gains PLN so the Polish market's pay is detected.

**Tech Stack:** Rust (reqwest, serde_json, tokio), TypeScript (Jest), `cargo test`.

Investigation: the list endpoint per-posting keys are `id, name, location, posted, title, logo, category, seniority, url, regions, fullyRemote, salary, ...` with NO description/requirements. The detail endpoint `/api/posting/{slug}` returns `requirements.musts[].value`, `requirements.nices[].value`, `requirements.description` (HTML), `specs.dailyTasks[]` (plain text list), and `essentials.originalSalary` (`{currency, types.{b2b|permanent}.{period, range:[from,to]}}`). The `url` field on a list posting IS the slug.

## Global Constraints

- Conventional Commits, subject in lower case. commitlint rejects sentence-case.
- Never write `Co-Authored-By`, "Generated with", or name any AI tool in a commit message.
- Never use an em dash or en dash anywhere: not in code, comments, or strings. Plain hyphen only.
- External endpoints are verified live, never written from memory. The detail endpoint and its JSON shape were probed live 2026-07-24.
- Rust gates from `apps/desktop/src-tauri`: `cargo test --lib`, `cargo clippy --lib -- -D warnings`. Frontend gate from repo root: `npx nx run-many -t test lint build --projects=desktop,core,i18n,data` (0 lint errors; 11 pre-existing warnings fine).

---

### Task 1: No Fluff Jobs detail fetch

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`parse_nofluffjobs` sets `detail_ref`; new `parse_nofluffjobs_detail` + `fetch_nofluffjobs_detail`; source-aware detail dispatch in the scan loop)
- Test: same file, `mod tests`

**Interfaces:**

- Produces: `parse_nofluffjobs_detail(val: &serde_json::Value) -> String` (pure); `fetch_nofluffjobs_detail(client: &reqwest::Client, slug: &str) -> Result<String, String>`. `parse_nofluffjobs` now sets `detail_ref = Some(slug)` where the slug is non-empty.

- [ ] **Step 1: Write the failing detail-parser test**

Add to `mod tests` in `discover.rs`. This fixture mirrors the live shape probed 2026-07-24:

```rust
#[test]
fn nofluffjobs_detail_builds_structured_text() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{
          "requirements": {
            "musts": [{"value":"React"},{"value":"Next.js"},{"value":"TypeScript"}],
            "nices": [{"value":"AWS"},{"value":"Nest.js"}],
            "description": "<p>You have 5 years of commercial experience.</p>"
          },
          "specs": {
            "dailyTasks": [
              "Design and build complete product features.",
              "Monitoring and tracing."
            ]
          },
          "essentials": {
            "originalSalary": {
              "currency": "PLN",
              "types": { "b2b": { "period": "Hour", "range": [200.0, 220.0] } }
            }
          }
        }"#,
    )
    .unwrap();

    let text = parse_nofluffjobs_detail(&val);
    // Headings the block renderer recognises, each on its own line.
    assert!(text.contains("Requirements:"));
    assert!(text.contains("- React"));
    assert!(text.contains("- TypeScript"));
    assert!(text.contains("Nice to have:"));
    assert!(text.contains("- AWS"));
    assert!(text.contains("Responsibilities:"));
    assert!(text.contains("- Design and build complete product features."));
    assert!(text.contains("You have 5 years of commercial experience."));
    // Salary line carries the currency and range so the extractor can read it.
    assert!(text.contains("Salary:"));
    assert!(text.contains("PLN"));
    assert!(text.contains("200"));
    assert!(text.contains("220"));
}

#[test]
fn nofluffjobs_detail_tolerates_missing_sections() {
    // A posting with no nices, no tasks, no salary must still yield its musts,
    // and never panic on the absent keys.
    let val: serde_json::Value = serde_json::from_str(
        r#"{"requirements":{"musts":[{"value":"Java"}]}}"#,
    )
    .unwrap();
    let text = parse_nofluffjobs_detail(&val);
    assert!(text.contains("- Java"));
    assert!(!text.contains("Nice to have:"));
    assert!(!text.contains("Salary:"));
}
```

- [ ] **Step 2: Run it, watch it fail**

```bash
cd apps/desktop/src-tauri && cargo test --lib nofluffjobs_detail
```

Expected: FAIL to compile - `parse_nofluffjobs_detail` not found.

- [ ] **Step 3: Add the pure detail parser**

Insert directly after `parse_nofluffjobs` in `discover.rs`. Uses the existing `json_str` and `html_to_text` helpers:

```rust
/// Builds a structured `jd_text` from a No Fluff Jobs posting-detail document
/// (`GET /api/posting/{slug}`). The list endpoint carries no description at
/// all, so without this a posting reaches the feed as a three-word stub.
///
/// Headings end with `:` and use words the Discover block renderer recognises
/// (`looksLikeHeading` in discover.component.ts) so the detail screen shows
/// real sections. Content is left in the posting's own language on purpose;
/// the value is the structure, not a translation.
fn parse_nofluffjobs_detail(val: &serde_json::Value) -> String {
    let mut out: Vec<String> = Vec::new();

    let values = |key: &str| -> Vec<String> {
        val.get("requirements")
            .and_then(|r| r.get(key))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("value").and_then(|v| v.as_str()))
                    .map(|s| format!("- {s}"))
                    .collect()
            })
            .unwrap_or_default()
    };

    let musts = values("musts");
    if !musts.is_empty() {
        out.push("Requirements:".to_string());
        out.extend(musts);
        out.push(String::new());
    }

    let nices = values("nices");
    if !nices.is_empty() {
        out.push("Nice to have:".to_string());
        out.extend(nices);
        out.push(String::new());
    }

    let desc = val
        .get("requirements")
        .map(|r| html_to_text(&json_str(r, "description")))
        .unwrap_or_default();
    if !desc.trim().is_empty() {
        out.push(desc.trim().to_string());
        out.push(String::new());
    }

    let tasks: Vec<String> = val
        .get("specs")
        .and_then(|s| s.get("dailyTasks"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str())
                .map(|s| format!("- {s}"))
                .collect()
        })
        .unwrap_or_default();
    if !tasks.is_empty() {
        out.push("Responsibilities:".to_string());
        out.extend(tasks);
        out.push(String::new());
    }

    if let Some(line) = nofluffjobs_salary_line(val) {
        out.push(format!("Salary: {line}"));
    }

    out.join("\n").trim().to_string()
}

/// One human line from `essentials.originalSalary`, or None when the pay is
/// not disclosed. Reads the first salary type present (b2b or permanent).
fn nofluffjobs_salary_line(val: &serde_json::Value) -> Option<String> {
    let salary = val.get("essentials")?.get("originalSalary")?;
    let currency = salary.get("currency")?.as_str()?;
    let types = salary.get("types")?.as_object()?;
    let (kind, body) = types.iter().next()?;
    let range = body.get("range").and_then(|r| r.as_array())?;
    let from = range.first().and_then(|v| v.as_f64())?;
    let to = range.get(1).and_then(|v| v.as_f64()).unwrap_or(from);
    let period = body
        .get("period")
        .and_then(|p| p.as_str())
        .unwrap_or("month");
    Some(format!(
        "{} - {} {currency} / {period} ({kind})",
        from as i64, to as i64
    ))
}
```

- [ ] **Step 4: Run the detail-parser tests**

```bash
cd apps/desktop/src-tauri && cargo test --lib nofluffjobs_detail
```

Expected: PASS.

- [ ] **Step 5: Set `detail_ref` on the list parser**

In `parse_nofluffjobs`, the raw `url` field is the slug. Today `slug` is moved into `url`, then `detail_ref: None`. The detail endpoint keys on a bare slug, not an absolute url, so compute `detail_ref` from `&slug` BEFORE `url` consumes it. Replace the existing `slug` -> `url` -> `RawJob { ... }` region (the block that starts with `let slug = [json_str(j, "url"), json_str(j, "id")]` and ends at the closing `}` of the `RawJob`) with:

```rust
            let slug = [json_str(j, "url"), json_str(j, "id")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            // The list endpoint has no description; a bare slug lets the scan
            // pull the full posting from /api/posting/{slug}. An absolute url or
            // an empty slug does not key that endpoint.
            let detail_ref = if slug.is_empty() || slug.starts_with("http") {
                None
            } else {
                Some(slug.clone())
            };
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
                detail_ref,
            }
```

This keeps the stub `jd_text` exactly as before (it stays the placeholder body when the detail fetch is skipped or fails) and only adds `detail_ref`.

- [ ] **Step 6: Add the thin fetcher**

Add near `fetch_arbeitsagentur_detail`:

```rust
/// Full posting text for one No Fluff Jobs slug. The detail endpoint keys on
/// the same slug the list returns in its `url` field.
async fn fetch_nofluffjobs_detail(
    client: &reqwest::Client,
    slug: &str,
) -> Result<String, String> {
    let url = format!("https://nofluffjobs.com/api/posting/{}", percent_encode_segment(slug));
    let val = get_json(client, &url).await?;
    Ok(parse_nofluffjobs_detail(&val))
}
```

- [ ] **Step 7: Make the scan's detail resolve source-aware**

In `discover_scan`, the detail-resolve block currently calls `fetch_arbeitsagentur_detail` for any `detail_ref`. That is only correct while Arbeitsagentur is the sole source setting `detail_ref`. Dispatch on the source type. Replace the `let detailed: Option<RawJob> = match job.detail_ref.as_deref() { ... }` block with:

```rust
                    // A failed or skipped detail request is not a scan error:
                    // the job still lands with its placeholder body.
                    let detailed: Option<RawJob> = match job.detail_ref.as_deref() {
                        Some(reference) if detail_budget > 0 => {
                            detail_budget -= 1;
                            let fetched = match src.source_type.as_str() {
                                "api_arbeitsagentur" => {
                                    fetch_arbeitsagentur_detail(&client, reference).await
                                }
                                "api_nofluffjobs" => {
                                    fetch_nofluffjobs_detail(&client, reference).await
                                }
                                _ => Ok(String::new()),
                            };
                            match fetched {
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
```

- [ ] **Step 8: Update the list-parser test for the new detail_ref**

The existing `parse_nofluffjobs` tests assert the stub body. They still pass (the stub is unchanged), but one now needs to assert `detail_ref` is the slug. Find the No Fluff Jobs list-parser test (search `parse_nofluffjobs(`) and add, for a posting whose `url` is a slug:

```rust
    assert_eq!(jobs[0].detail_ref.as_deref(), Some("java-developer-acme"));
```

Match the slug your fixture actually uses. If a fixture posting uses an absolute `http` url or empty, assert `detail_ref` is `None` there.

- [ ] **Step 9: Full Rust gates**

```bash
cd apps/desktop/src-tauri && cargo test --lib && cargo clippy --lib -- -D warnings
```

Expected: PASS, clippy clean.

- [ ] **Step 10: Live smoke against the real endpoint (manual, not CI)**

There is an existing ignored live test `live_tier2_sources_fetch_and_parse`. Do NOT modify it. Instead, run this one-off to confirm the detail endpoint still answers and the parser yields real text, then delete it before committing:

Add temporarily to `mod tests`:

```rust
#[tokio::test]
#[ignore = "hits the live No Fluff Jobs detail endpoint"]
async fn live_nofluffjobs_detail_smoke() {
    let client = http_client().expect("client");
    // A slug from the live list; if it has expired, pull a fresh one from
    // https://nofluffjobs.com/api/joboffers/main?region=pl
    let list = get_json(
        &client,
        "https://nofluffjobs.com/api/joboffers/main?salaryCurrency=PLN&salaryPeriod=month&region=pl",
    )
    .await
    .expect("list");
    let slug = list["postings"][0]["url"].as_str().expect("slug").to_string();
    let text = fetch_nofluffjobs_detail(&client, &slug).await.expect("detail");
    assert!(text.len() > 100, "detail should be substantial, got {} chars", text.len());
    println!("detail chars: {}", text.len());
}
```

Run it:

```bash
cd apps/desktop/src-tauri && cargo test --lib live_nofluffjobs_detail_smoke -- --ignored --nocapture
```

Expected: prints a chars count well over 100. Then DELETE this test (it is a throwaway smoke check, not a committed test) and re-run `cargo test --lib` to confirm the suite is green without it.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/discover.rs
git commit -m "fix(discover): fetch full no fluff jobs postings, not just the stub"
```

---

### Task 2: Detect PLN salaries

The salary extractor only recognises the euro, pound, dollar, EUR, USD and GBP. A No Fluff Jobs salary is in PLN, so even with the detail fetch the salary badge stays blank. Add PLN.

**Files:**

- Modify: `libs/core/src/lib/profile/compensation.ts` (`CURRENCY_MARKER`)
- Test: `libs/core/src/lib/profile/compensation.spec.ts` if it exists, else add one

**Interfaces:**

- Consumes: nothing. Produces: `extractSalaryFromJd` now returns a line for a PLN salary.

- [ ] **Step 1: Write the failing test**

Find the compensation spec (`libs/core/src/lib/profile/compensation.spec.ts`); if none exists, create it. Add:

```ts
import { extractSalaryFromJd } from './compensation';

describe('extractSalaryFromJd - PLN', () => {
  it('reads a złoty salary line', () => {
    const jd = 'Requirements:\n- React\n\nSalary: 200 - 220 PLN / Hour (b2b)';
    expect(extractSalaryFromJd(jd)).toContain('PLN');
  });
});
```

(If the file exists already, add just this `describe` block, keeping its existing imports.)

- [ ] **Step 2: Run it, watch it fail**

```bash
npx nx test core
```

Expected: FAIL - PLN is not a recognised currency marker.

- [ ] **Step 3: Add PLN to the marker**

In `libs/core/src/lib/profile/compensation.ts`, extend `CURRENCY_MARKER`:

```ts
const CURRENCY_MARKER = /€|£|\$|\bEUR\b|\bUSD\b|\bGBP\b|\bPLN\b/i;
```

- [ ] **Step 4: Run the suite**

```bash
npx nx test core
```

Expected: PASS.

- [ ] **Step 5: Full frontend gate**

```bash
npx nx run-many -t test lint build --projects=desktop,core,i18n,data
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/profile/compensation.ts libs/core/src/lib/profile/compensation.spec.ts
git commit -m "feat(discover): detect pln salaries from job descriptions"
```

---

### Task 3: Documentation

**Files:**

- Modify: `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Changelog**

Under `[Unreleased]`, add that No Fluff Jobs postings now show their full content in Discover - required and nice-to-have skills, the requirements description, the day-to-day responsibilities and the salary - instead of a three-word summary, because the app now fetches each posting's detail page the same way it already does for the German federal agency; and that złoty (PLN) salaries are now detected. Say plainly that other sources already carried their descriptions, so this was a No Fluff Jobs gap.

- [ ] **Step 2: State doc**

In `docs/product/CURRENT_STATE.md`, record: No Fluff Jobs now sets `detail_ref` and the scan resolves it via `/api/posting/{slug}` under the shared per-source detail budget, with a pure `parse_nofluffjobs_detail`; the detail-resolve loop is now source-aware (Arbeitsagentur and No Fluff Jobs); PLN added to the salary currency marker; and that the description, salary, skill detection and raw score for No Fluff Jobs were all starved by the old stub and are fixed by this. Note it is not natively verified beyond the live detail-endpoint smoke check.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs: record the no fluff jobs detail fetch"
```

---

## Verification after the last task

Native, in `npm run tauri dev`:

1. With the Poland market active, scan. Open a No Fluff Jobs posting. The detail now shows Requirements, Nice to have, Responsibilities and a Salary line (in the posting's own language for the prose), not three words.
2. The raw score is now computed over real content, not just the title.
3. The salary badge shows the PLN figure.
4. Spot-check a Remotive and a DOU.ua posting still render as before (unchanged path).
