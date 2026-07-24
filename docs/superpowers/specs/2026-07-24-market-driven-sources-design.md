# Market-driven source selection and result filtering

Date: 2026-07-24
Status: approved, not yet implemented
Area: Discover (`commands/discover.rs`, Settings, Sources drawer)

## Problem

Picking a local market changes what the Sources drawer _shows_ and how results are
_filtered_, but nothing about which sources are actually _scanned_.

Observed live: market set to Ukraine, Discover scanned Remotive and We Work Remotely
(which ship enabled), while DOU.ua and Djinni.co - the two Ukrainian sources - sat
disabled and were never queried. The market setting looked applied and returned nothing
Ukrainian.

The result filter is also too permissive to be useful under a market. `geo_passes`
returns true for any location containing a remote marker and for any empty location, so
a fully-remote worldwide board passes nearly every job it carries. Under a Ukraine
market that is a flood of US-remote postings.

## Model

A market answers two separate questions. Today it only answers the second, and weakly.

1. **Which sources are scanned** - currently unrelated to the market.
2. **Which of the fetched jobs are shown** - currently too permissive.

## Source selection

Changing the market in Settings opens one confirmation listing the exact hosts, then
applies everything in a single transaction:

```
Enable sources for the Ukrainian market?
  + DOU.ua          jobs.dou.ua
  + Djinni.co       djinni.co
Disable sources for other markets?
  - Habr Career     career.habr.com
  - Arbeitnow       arbeitnow.com
  - No Fluff Jobs   nofluffjobs.com
Worldwide sources are left as they are.
                              [Cancel]  [Apply]
```

**Why a confirmation rather than silent auto-enable.** Built-in sources ship disabled on
purpose: until the user turns one on, no request reaches that server and no IP is
revealed (`docs/product/CURRENT_STATE.md`, migration `0025` header). Silently enabling
sources on a Settings click would make that promise false. The dialog keeps it true,
names the hosts about to be contacted, and still costs one click.

Rules, as set operations on a built-in source's `geo_tags_json` versus the selected
markets `M`:

- **Enable**: `tags ∩ M ≠ ∅`.
- **Disable**: `tags ∩ M = ∅` **and** `worldwide ∉ tags`.
- **Left alone**: everything else - which is exactly the sources carrying `worldwide`
  but no selected market, plus every user-added source regardless of tags.

The two rules are disjoint, and a dual-tagged source falls out correctly: Jobicy is
`["us","worldwide"]`, so under a US market it is proposed for enabling, and under a
Ukraine market it is left alone rather than disabled.

- **Cancel**: the market is still saved; no source is touched.
- **Clearing all markets** (back to Worldwide): no dialog, no source changes. Turning a
  filter off should not silently start or stop network activity.

## Result filtering

The governing idea: **a source is itself geographic evidence**.

| Job comes from                                      | Rule                                     |
| --------------------------------------------------- | ---------------------------------------- |
| A source tagged for a selected market (DOU, Djinni) | Everything passes                        |
| A `worldwide` or user-added source                  | The table below                          |
| A source tagged for another market                  | Switched off by the plan, so not scanned |

A market-tagged source passes unconditionally because these feeds frequently carry no
location field at all - DOU and Djinni RSS items often have none. Filtering them on
location would drop the very sources the market just enabled.

Other-market sources stop being scanned because the plan above switches them off, not
because the scan silently skips them. The invariant is that an enabled source is always
scanned and always visible: quietly not scanning something the user can see is enabled is
the same lie as quietly hiding something that is being scanned. If the user cancels the
plan, those sources stay on and keep being scanned - their jobs simply fail the "names
somewhere else" check, which is the honest outcome.

For non-market-tagged sources, evaluated **in this order**:

| Location                          | Verdict | Why                                    |
| --------------------------------- | ------- | -------------------------------------- |
| `Kyiv`, `Ukraine`, `Львів`        | pass    | names the market                       |
| `Remote — US only`, `Berlin`      | drop    | names a _different_ place              |
| `Anywhere`, `Worldwide`, `Remote` | pass    | open to anyone, so open to this market |
| empty, unrecognised               | drop    | no evidence                            |

**The order is the fix.** Today the remote check runs before any country check, so
`Remote — US only` passes on the word "Remote". Checking "names another place" first is
what closes that.

"Names a different place" means: the location matches a token belonging to some known
country or region **other than** a selected market. The token set is the union of the
seven `region_countries()` lists and every `country_tokens(code)` list, minus the tokens
of the selected markets. Matching uses the existing `loc_matches` rule, so short codes
still only match as whole words.

Deliberate consequences, accepted:

- `Remote — EMEA` is dropped under a Ukraine market. EMEA is a region, not a global
  opening, and the approved rule is "explicit market, or globally open". Revisit if it
  proves too strict in use.
- Empty locations from worldwide sources are dropped under market mode, where today they
  pass. Conservative inclusion still applies in region mode, unchanged.

### User-added sources

Filtered by the same non-market-tagged rules rather than passed wholesale. Under a
Ukraine market this correctly drops the German feeds a user has added (they name German
cities), which is the desired behaviour.

"User-added sources are never narrowed" continues to hold for **drawer visibility and
auto-disabling** - those are never touched. Only their results are filtered.

Known trade-off: a manually added Ukrainian feed with no location field would be dropped.
The fix is letting a custom source carry a market tag when it is added; out of scope
here, revisit if it bites.

## Every market behaves identically - and today the data does not

Nothing in the rules above is Ukraine-specific: they are set operations on the selected
markets and on token lists. Ukraine is only the running example. But the rules are only
as good as `country_tokens()`, and that table is **complete for `de`, `ru` and `ua` and
country-name-only for `gb`, `us`, `es`, `fr` and `pl`**. Under the permissive filter this
barely mattered, because remote and empty locations passed anyway. Under the strict one
it silently deletes jobs:

| Market | Job location        | Today's outcome under the new rules           |
| ------ | ------------------- | --------------------------------------------- |
| `es`   | `Madrid`            | dropped - no `es` token matches, no evidence  |
| `fr`   | `Paris`             | dropped                                       |
| `pl`   | `Warsaw`            | dropped                                       |
| `gb`   | `London`            | dropped                                       |
| `us`   | `San Francisco, CA` | dropped **as Canada** - `ca` is Canada's code |

So bringing every market to parity is part of this work, not a follow-up. Reference data
already exists in the frontend's `COUNTRY_DEFS` (`discover-location.ts`), which carries
city lists for the UK, France, Spain and Poland and the full US state list with codes;
mirror it into `country_tokens()`, in local and English spellings, the way `de` and `ru`
already are.

The `CA` collision needs a decision rather than a copy: drop the bare `"ca"` token from
Canada and keep `"canada"` plus the province names. In a job location `CA` means
California far more often than Canada, and a US market that silently loses San Francisco
is a worse failure than a Canada scope that needs the country spelled out.

Parity is testable, and the test is cheap: for every market in `LOCAL_MARKETS`, its own
capital or largest tech city must pass a scope of that market and must not pass a scope
of any other. That test is the guard against a future market being added with a
country-name-only entry.

## Adjacent bug found while designing

`EUROPE_COUNTRIES` in `commands/discover.rs` omits Ukraine entirely, so a Kyiv job is
already dropped by the region-mode "Europe" scope today, independent of this work. Fix in
step 1 by adding the country to that list.

## Steps

Ordered so the filter is correct after step 2, with or without the dialog.

1. **Market parity in the token table (Rust).** Bring `country_tokens()` to the same depth
   for all eight markets, mirroring the frontend `COUNTRY_DEFS` city lists and adding the
   US states; drop the bare `"ca"` token from Canada. Add Ukraine to `EUROPE_COUNTRIES`.
   Cover it with the every-market parity test. **This comes first**: the strict filter in
   step 2 is only correct on top of it, and shipping them the other way round would
   delete jobs in five of the eight markets.
2. **Filter rules (Rust).** Add `geo_tags_json` to the scan's source `SELECT` (it is not
   selected today). Teach the geo filter whether the job's source is market-tagged, and
   insert the "names another place" check ahead of the remote check.
3. **Plan command (Rust).** `db_market_source_plan(markets) -> { to_enable, to_disable }`,
   each entry carrying id, name and host for display. Read-only; writes nothing.
4. **Apply command (Rust).** `db_apply_market_source_plan(enable_ids, disable_ids)` in one
   transaction. Takes explicit ids rather than recomputing, so what the user confirmed is
   exactly what is written.
5. **Settings dialog (Angular).** Shown on market change when the plan is non-empty, built
   on the existing confirm dialog. Cancel leaves sources untouched.
6. **Tests.** The filter table above becomes the case list; plus the every-market parity
   test from step 1, a test that a source tagged for an unselected market never enters the
   scan, and that the plan command proposes nothing for worldwide or user-added sources.

## Out of scope

- Market tags for user-added sources.
- Streaming or cancel for long AI generations (tracked separately).
- Any change to region mode behaviour when no market is selected.
