# Market coverage and rescan-on-change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Only offer markets Applye can actually serve, and prompt the user to refresh the Discover feed when their market changes.

**Architecture:** Two independent fixes found in live testing. (1) Three of the eight local markets (gb, es, fr) have no seeded national source, so picking one enabled nothing and, because a disable-only plan is suppressed, left the previous market's sources scanning. Those three markets are removed from the pickable list until they gain a source. (2) The Discover feed is a persistent list of past scan results; it is never re-filtered when the market changes, so stale jobs from a prior market linger. A banner now tells the user their market changed and offers a one-click refresh that clears unsaved results and rescans. Saved and dismissed jobs are never touched.

**Tech Stack:** Rust (sqlx, tauri commands), Angular 20 signals, Jest, `cargo test`.

Investigation that produced this plan: three root causes confirmed against the live DB and the code. gb/es/fr have zero sources (`sources.geo_tags_json` never names them); `db_discover_feed` selects every non-dismissed `discover_scan` job with no market filter; nothing persists the market a scan ran under, so no "market changed" signal can exist.

## Global Constraints

- Conventional Commits, subject in lower case. commitlint rejects sentence-case.
- Never write `Co-Authored-By`, "Generated with", or name any AI tool in a commit message.
- Never use an em dash or en dash anywhere: not in code, comments, or UI strings. Plain hyphen only.
- Do NOT edit any file under `apps/desktop/src-tauri/migrations/` that already exists. sqlx checksums applied migrations; editing one panics the app on next launch. New migration files are fine.
- All CSS must use tokens defined in `libs/ui/tokens.css`. A `var(--x)` naming an undefined token, with no fallback, silently voids the whole declaration. Verify each token exists.
- Rust gates from `apps/desktop/src-tauri`: `cargo test --lib`, `cargo clippy --lib -- -D warnings`. Frontend gate from repo root: `npx nx run-many -t test lint build --projects=desktop,core,i18n,data` (0 lint errors; 11 pre-existing warnings are fine).

---

### Task 1: Remove the three unsourced markets

Drop gb, es, fr from the pickable local markets. Keep their location tokens: they must still count as "somewhere else" when filtering other markets (a London job is not a US job). Only the pickable list shrinks.

**Files:**

- Modify: `libs/core/src/lib/geo/local-market.ts` (`LocalMarket` type, `LOCAL_MARKETS`)
- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`KNOWN_LOCAL_MARKETS`, the parity test's `cases`)
- Test: existing Rust tests adjust; `local-market.spec.ts` may reference removed codes

**Interfaces:**

- Produces: `LocalMarket = 'de' | 'us' | 'ru' | 'ua' | 'pl'`; `LOCAL_MARKETS` with those five; `KNOWN_LOCAL_MARKETS` matching.

- [ ] **Step 1: Shrink the TypeScript type and list**

In `libs/core/src/lib/geo/local-market.ts`, change the type and the array to hold only the five sourced markets, preserving order `de, us, ru, ua, pl`:

```ts
export type LocalMarket = 'de' | 'us' | 'ru' | 'ua' | 'pl';

export const LOCAL_MARKETS: readonly LocalMarket[] = ['de', 'us', 'ru', 'ua', 'pl'];
```

Add a one-line comment above the list: a market appears here only when a built-in source serves it; gb, es and fr are omitted until one does, because otherwise picking them enables nothing and leaves the previous market's sources running.

- [ ] **Step 2: Check the core spec still holds**

`libs/core/src/lib/geo/local-market.spec.ts` may assert on removed codes. Run it:

```bash
npx nx test core
```

If a case references `'gb'`, `'es'` or `'fr'` as a valid market, change it to a remaining one (`'de'`), keeping the intent of the assertion. If it asserts that an unknown code is dropped, `'gb'` is now a fine example of an unknown code - leave or use it there deliberately, with a comment that it is intentionally not a market.

- [ ] **Step 3: Shrink the Rust vocabulary**

In `apps/desktop/src-tauri/src/commands/discover.rs`, `KNOWN_LOCAL_MARKETS`:

```rust
const KNOWN_LOCAL_MARKETS: &[&str] = &["de", "us", "ru", "ua", "pl"];
```

Leave `KNOWN_COUNTRY_CODES` and every arm of `country_tokens` unchanged: gb, es and fr tokens are still needed so those places count as elsewhere for the remaining markets.

- [ ] **Step 4: Fix the parity test cases**

The parity test `every_market_recognises_its_own_city_and_no_other` has a `cases` array listing all eight markets. Remove the `("gb", ...)`, `("es", ...)`, `("fr", ...)` rows so it lists exactly the five remaining markets. The loop over `KNOWN_LOCAL_MARKETS` asserts every known market has a case; with both lists at five it stays green.

- [ ] **Step 5: Run the Rust suite**

```bash
cd apps/desktop/src-tauri && cargo test --lib
```

Expected: PASS. If `every_market_recognises...` fails with "market X has no parity case", a `cases` row is still missing or extra.

- [ ] **Step 6: Full gates**

```bash
cd apps/desktop/src-tauri && cargo clippy --lib -- -D warnings
```

```bash
npx nx run-many -t test lint build --projects=desktop,core,i18n,data
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add libs/core/src/lib/geo/local-market.ts apps/desktop/src-tauri/src/commands/discover.rs libs/core/src/lib/geo/local-market.spec.ts
git commit -m "fix(discover): offer only local markets that have a source"
```

---

### Task 2: Remember the market each scan ran under

Persist the market a scan ran under, so the frontend can tell when the current market no longer matches the feed. A new nullable settings column, written at the end of a scan, surfaced through the existing settings read.

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0026_settings_last_scan_market.sql`
- Modify: `apps/desktop/src-tauri/src/commands/settings.rs` (`Settings` struct)
- Modify: `apps/desktop/src-tauri/src/commands/discover.rs` (`discover_scan` writes the column)
- Modify: `libs/core/src/lib/models/settings.model.ts` (`Settings` interface)

**Interfaces:**

- Produces: `Settings.last_scan_market: Option<String>` (Rust), `Settings.lastScanMarket: string | null` (TS). Written by `discover_scan` with the raw `market` value in force at scan time.

- [ ] **Step 1: Write the migration**

Create `apps/desktop/src-tauri/migrations/0026_settings_last_scan_market.sql`:

```sql
-- Records the local market (raw settings.market value) that the most recent
-- Discover scan ran under, so the Discover feed can tell the user when their
-- current market no longer matches the results on screen. NULL until the first
-- scan. Additive, no backfill needed.
ALTER TABLE settings ADD COLUMN last_scan_market TEXT;
```

- [ ] **Step 2: Add the Rust struct field**

In `apps/desktop/src-tauri/src/commands/settings.rs`, in `pub struct Settings`, after the `market` field:

```rust
    /// The raw `market` value the most recent Discover scan ran under, or NULL
    /// before the first scan. Read-only from the frontend's side; only a scan
    /// writes it. Used to prompt a refresh when the market has changed since.
    pub last_scan_market: Option<String>,
```

`db_get_settings` uses `SELECT *`, so the new column is picked up automatically. Do NOT add it to `SettingsPatch` or the update statement - it is not user-editable.

- [ ] **Step 3: Add a helper that records the scanned market, and call it from the scan**

The scan command takes a Tauri `State<Db>`, which the unit-test harness cannot build, so the recording logic goes in a small pure-ish helper that both the command and the test call. That keeps the test honest: it exercises the real function, not a hand-copied UPDATE.

Add near `discover_clear_core` in `discover.rs`:

```rust
/// Records the market a scan ran under, for the Discover feed's refresh prompt.
/// Best-effort by construction: the caller ignores the result so a failed write
/// never fails the scan.
async fn record_scan_market(pool: &SqlitePool, market_raw: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE settings SET last_scan_market = ? WHERE id = 1")
        .bind(market_raw)
        .execute(pool)
        .await?;
    Ok(())
}
```

In `discover_scan`, `market_raw` already holds the raw market value at scan time (the `SELECT market FROM settings` a few lines in). Just before the final `Ok(ScanSummary { ... })`:

```rust
    // Record the market this scan ran under so the Discover feed can prompt a
    // refresh when the user later changes it. Best-effort: ignore any error.
    let _ = record_scan_market(&db.pool, market_raw.as_deref()).await;
```

- [ ] **Step 4: Test the helper against a real migrated DB**

Add to `mod tests` in `discover.rs` (there is already a `test_pool()` helper that runs migrations):

```rust
#[tokio::test]
async fn record_scan_market_writes_the_raw_market_value() {
    let pool = test_pool().await;
    // Nothing scanned yet.
    let before: Option<String> =
        sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(before, None);

    record_scan_market(&pool, Some(r#"["ru"]"#)).await.unwrap();

    let after: Option<String> =
        sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(after.as_deref(), Some(r#"["ru"]"#));

    // A later scan with no market clears it back to NULL, so the banner logic
    // sees "scanned under worldwide" rather than a stale market.
    record_scan_market(&pool, None).await.unwrap();
    let cleared: Option<String> =
        sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cleared, None);
}
```

- [ ] **Step 5: Add the TS field**

In `libs/core/src/lib/models/settings.model.ts`, after the `market` field:

```ts
/**
 * The raw `market` value the most recent Discover scan ran under, or null
 * before the first scan. Set only by a scan. The Discover feed compares it
 * against `market` to know when to prompt a refresh.
 */
lastScanMarket: string | null;
```

- [ ] **Step 6: Gates**

```bash
cd apps/desktop/src-tauri && cargo test --lib && cargo clippy --lib -- -D warnings
```

```bash
npx nx run-many -t test lint build --projects=desktop,core,i18n,data
```

Expected: all green. If any existing Rust test builds a `Settings` literal by hand, it now needs `last_scan_market: None` - add it.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0026_settings_last_scan_market.sql apps/desktop/src-tauri/src/commands/settings.rs apps/desktop/src-tauri/src/commands/discover.rs libs/core/src/lib/models/settings.model.ts
git commit -m "feat(discover): record the market each scan ran under"
```

---

### Task 3: Discover banner prompting a refresh

When the current market differs from the market the feed was last scanned under, Discover shows a banner offering to refresh: clear the unsaved results and rescan. Not acting keeps everything.

**Files:**

- Modify: `apps/desktop/src/app/pages/discover/discover.component.ts` (state, banner, refresh handler, template, styles)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (en and de)

**Interfaces:**

- Consumes: `Settings.market`, `Settings.lastScanMarket`, `parseLocalMarkets`, `encodeLocalMarkets` from `@applye/core`; existing `discoverClear()`, `discoverScan()`, `discoverFeed()` and the existing `scan()` method.

- [ ] **Step 1: Add the changed-since-scan signal**

In `discover.component.ts`, the component already sets `this.markets` from settings on load. Add a signal for the last-scanned market and a derived flag. Both `markets` and `lastScanMarket` are set from `parseLocalMarkets`, which returns a stable, filtered, order-preserving array, so comparing their JSON forms is sound (no separate normalisation needed). Put this near the other geo signals:

```ts
  /** The market the feed on screen was last scanned under, from settings. */
  private readonly lastScanMarket = signal<string[]>([]);
  /** Session-only dismissal of the "market changed" banner. */
  private readonly rescanBannerDismissed = signal(false);

  /** True when the selected market no longer matches the feed on screen, so the
   * results shown are for a market the user has moved away from. */
  protected readonly marketChangedSinceScan = computed(() => {
    if (this.rescanBannerDismissed()) return false;
    return JSON.stringify(this.markets()) !== JSON.stringify(this.lastScanMarket());
  });
```

`parseLocalMarkets` is already imported for `markets`; no new import is needed.

- [ ] **Step 2: Populate lastScanMarket on load**

Where `load()` sets `this.markets.set(parseLocalMarkets(settings.market))`, add directly after it:

```ts
this.lastScanMarket.set(parseLocalMarkets(settings.lastScanMarket));
```

- [ ] **Step 3: Reset the banner after a refresh**

The existing `scan()` method runs a scan and reloads the feed. A scan updates `settings.last_scan_market` in Rust, but the component's `lastScanMarket` signal is stale until reload. After a successful scan, align them so the banner clears. In `scan()`, after the feed is refreshed on success, add:

```ts
this.lastScanMarket.set(this.markets());
this.rescanBannerDismissed.set(false);
```

- [ ] **Step 4: Add the refresh handler**

```ts
  /** From the market-changed banner: drop the stale unsaved results and rescan
   * for the current market. Saved and dismissed jobs are untouched (see
   * db_discover_clear). Then scan(), which realigns lastScanMarket. */
  protected async refreshForMarket(): Promise<void> {
    if (this.scanning()) return;
    try {
      await this.db.discoverClear();
    } catch (e) {
      console.error('discover: clear before refresh failed', e);
    }
    await this.scan();
  }

  protected dismissRescanBanner(): void {
    this.rescanBannerDismissed.set(true);
  }
```

- [ ] **Step 5: Add the banner to the template**

Place it at the top of the feed view, above the feed list. Find where the feed renders (search the template for the feed `@for` or the strip). Insert immediately before it:

```html
@if (marketChangedSinceScan()) {
<div class="dv-rescan" role="status">
  <span class="dv-rescan__text">{{ t()('discover.market_changed') }}</span>
  <div class="dv-rescan__actions">
    <button
      type="button"
      class="dv-btn dv-btn--primary dv-btn--secondary"
      [disabled]="scanning()"
      (click)="refreshForMarket()"
    >
      {{ t()('discover.market_changed_refresh') }}
    </button>
    <button
      type="button"
      class="dv-iconbtn dv-iconbtn--sm"
      [attr.aria-label]="t()('actions.dismiss')"
      (click)="dismissRescanBanner()"
    >
      <lucide-icon [img]="icons.close" [size]="14" aria-hidden="true" />
    </button>
  </div>
</div>
}
```

If `icons.close` or `actions.dismiss` do not exist in this component, use the close icon the Sources drawer already uses (search the template for the drawer close button and reuse its `icons.` member), and add an `actions.dismiss` key in Step 7 if missing.

- [ ] **Step 6: Style the banner**

Add to the component styles, reusing existing tokens (verify each in `libs/ui/tokens.css`):

```scss
.dv-rescan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-5);
  border: 1px solid var(--accent);
  border-radius: var(--radius-card);
  background: var(--accent-tint);
}
.dv-rescan__text {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.dv-rescan__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 0 0 auto;
}
```

- [ ] **Step 7: Add the i18n keys**

In `translations.ts`, `en.discover` block:

```ts
    market_changed: 'Your local market changed. Refresh to scan for jobs in it - your current results are from your previous market.',
    market_changed_refresh: 'Refresh results',
```

In `de.discover` block:

```ts
    market_changed: 'Dein lokaler Markt hat sich geaendert. Aktualisiere, um Stellen darin zu finden - die aktuellen Ergebnisse stammen aus deinem vorherigen Markt.',
    market_changed_refresh: 'Ergebnisse aktualisieren',
```

If Step 5 needed `actions.dismiss`, add it to both locales' `actions` block (`'Dismiss'` / `'Schliessen'`); if the project already has a suitable key, use that instead and skip.

- [ ] **Step 8: Gate**

```bash
npx nx run-many -t test lint build --projects=desktop,core,i18n,data
```

Expected: all green, 0 lint errors. Confirm every `var(--token)` in the new styles exists in `libs/ui/tokens.css`.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/pages/discover/discover.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(discover): prompt a refresh when the local market changes"
```

---

### Task 4: Documentation

**Files:**

- Modify: `CHANGELOG.md`, `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Changelog**

Under `[Unreleased]`, add that the local market picker now lists only markets with a source of their own (Germany, USA, Russia, Ukraine, Poland; the UK, Spain and France return once a source is added), and that Discover now shows a banner when the market has changed since the results on screen were scanned, offering a one-click refresh that clears the old unsaved results and rescans. Saved and dismissed jobs are untouched.

- [ ] **Step 2: State doc**

In `docs/product/CURRENT_STATE.md`, record: gb/es/fr removed from `LOCAL_MARKETS` because they had no seeded source (their tokens stay for elsewhere-matching); `last_scan_market` column added; the rescan banner; and that none of this is natively verified.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs: record market coverage and rescan prompt"
```

---

## Verification after the last task

Native only - Settings and Discover need Tauri IPC. Run `npm run tauri dev`, then:

1. Settings: the market picker lists exactly Germany, USA, Russia, Ukraine, Poland - no UK, Spain, France.
2. Pick Germany, confirm the source plan, Apply. Discover: banner appears. Refresh: German sources scanned, feed shows German jobs, banner gone.
3. Switch to Russia, confirm, Apply. Discover: banner appears again. Refresh: the German jobs are gone, Russian jobs present.
4. Reload Discover without changing the market: no banner.
