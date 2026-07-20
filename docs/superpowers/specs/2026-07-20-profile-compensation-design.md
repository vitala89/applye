# Profile Compensation + Job Salary Comparison - Design

Date: 2026-07-20
Status: Approved (design), pending implementation
Branch: `feat/profile-compensation`

## Goal

Give the user a structured compensation target in their Profile (min / max /
currency / period), and use it to flag how a job's advertised salary compares
to that target in Discovery and My Jobs.

Two user-facing outcomes:

1. **Profile compensation field**: the Form gains min / max / currency (EUR or
   USD) / period (year or month) inputs. Persisted in the profile markdown so
   the existing `profile-compress` AI keeps reading it.
2. **Salary comparison badge**: where a job advertises a salary that can be
   parsed, show a colored badge - Above target / In your range / Below target -
   in the Discovery detail and My Jobs views.

## Non-goals

- No currency conversion. When the profile currency and the job currency differ
  (or a currency is unknown), the comparison returns `unknown` and no badge is
  shown.
- No change to `profile-compress`, scoring, or pitch skills. The `## Compensation`
  markdown section flows into `profile_md` unchanged; the AI already surfaces it.
- No per-feed-row badge in Discovery (only the detail view + My Jobs). Feed rows
  rarely carry a salary; a sparse per-row badge is not worth the layout cost.
- Profile storage stays markdown-as-source-of-truth (`Profile.fullMd`).

## Current state (baseline)

- `ProfileForm` (`libs/core/src/lib/profile/profile-markdown.ts`) has no
  compensation field. The "Compensation target range (EUR 85K-110K)" seen in the
  scoring profile comes from free text the user typed into `fullMd`, which
  `profile-compress` extracts into an AI note - there is no structured field.
- Jobs carry `salaryRange?: string` (free text) and `salaryMin?: number`
  (`libs/core/src/lib/models/job.model.ts`). Discovery does not display salary
  today (only treats "salary" as a JD section keyword). My Jobs surfaces
  `salaryRange`.
- Discovery scoring (`discover.component.ts`) is deterministic keyword coverage;
  it does not consider salary.

## Architecture

Keep markdown as the source of truth. Add compensation fields to `ProfileForm`
plus `parseCompensation` / `serializeCompensation` helpers (same strategy as the
Education/Experience helpers). Add two pure, well-tested comparison helpers in
core (`parseSalaryRange`, `compareCompensation`) used by the Discovery and My
Jobs components to render a badge.

### Part A: Profile compensation field

New fields on `ProfileForm`:

```
compMin: string;       // free text, digits (e.g. "85000"); '' if unset
compMax: string;       // free text, digits; '' if unset
compCurrency: string;  // '' | 'EUR' | 'USD'
compPeriod: string;    // '' | 'year' | 'month'  (default 'year' when a range is set)
```

Markdown shape under `## Compensation`, a single line:

```
## Compensation
85000 - 110000 EUR per year
```

- `parseCompensation(body: string): CompensationTarget` and
  `serializeCompensation(c): string` round-trip this. Lenient: `85000 EUR` (max
  omitted), `EUR per year` (numbers omitted), `85000 - 110000` (currency omitted)
  all survive. A fully-empty compensation serializes to nothing (no section).
- `parseProfileMd` recognizes the `## Compensation` section and fills the four
  fields; `serializeProfileForm` emits `## Compensation` when any of the four is
  set. Both edits sit alongside the existing section handling.
- `CompensationTarget` interface: `{ min: string; max: string; currency: string;
period: string }` (strings mirror the form inputs; numeric parse happens in the
  comparison helper).

### Part B: Salary comparison

Two pure helpers in a new `libs/core/src/lib/profile/compensation.ts` (kept
separate from the markdown module - different responsibility):

```
interface ParsedSalary { min: number | null; max: number | null; currency: string }
parseSalaryRange(text: string | null | undefined): ParsedSalary | null

type CompensationVerdict = 'above' | 'within' | 'below' | 'unknown';
compareCompensation(
  target: { min: string; max: string; currency: string },
  jobSalary: string | null | undefined,
): CompensationVerdict
```

- `parseSalaryRange` handles: currency symbols/codes (`€`/`$`/`EUR`/`USD`),
  k-notation (`80k` -> 80000), thousands separators (`120,000` / `120.000`),
  ranges (`80k-100k`, `80000 to 100000`), and single values (`120000` -> both
  min and max = 120000). Returns `null` when no number is found.
- `compareCompensation`:
  - Returns `unknown` if the target has no numeric min/max, the job salary does
    not parse, or the currencies are both known and differ.
  - Let `tMin`/`tMax` be the target range (a single provided bound fills both),
    `jMin`/`jMax` the job range.
  - `jMax < tMin` -> `below` (job pays under the target).
  - `jMin > tMax` -> `above` (job pays over the target).
  - otherwise -> `within` (ranges overlap).

### UI

- **Profile form**: a compact compensation block (not collapsible) near the
  basic fields: two number inputs (min, max), a currency `<select>` (EUR/USD),
  and a period `<select>` (year/month). Backed directly by the four
  `ProfileForm` fields via `updateField` (no new signal needed - they are scalar
  strings, like name/email).
- **Discovery detail** (`discover.component.ts`): next to the existing raw-score
  block, when the open job has a parseable `salaryRange` AND the profile has a
  compensation target, show a badge whose label + color come from
  `compareCompensation`. Load the profile compensation once alongside the
  existing profile load.
- **My Jobs** (`my-jobs.component.ts`): the same badge beside the existing
  `salaryRange` display.

### Verdict -> label/color

| verdict | label key                                | color            |
| ------- | ---------------------------------------- | ---------------- |
| above   | `comp.badge_above` ("Above your target") | success/positive |
| within  | `comp.badge_within` ("In your range")    | success/positive |
| below   | `comp.badge_below` ("Below your target") | warning          |
| unknown | (no badge)                               | -                |

## Data flow

```
Profile form comp inputs --> ProfileForm.comp* --> serializeProfileForm --> fullMd --(Save)--> DB
Load / leave-raw --> parseProfileMd --> ProfileForm.comp* --> form inputs
Discovery/My Jobs --> load profile comp target + job.salaryRange
   --> parseSalaryRange + compareCompensation --> badge
```

## Error handling

- Non-numeric compensation input: `parseCompensation`/comparison treat a
  non-numeric bound as unset. The form does not hard-validate; comparison simply
  returns `unknown` when a bound is missing.
- Unparseable job salary or currency mismatch: `compareCompensation` returns
  `unknown`, no badge shown - never a wrong badge.
- Lossless: a `## Compensation` line the parser cannot fully structure still
  round-trips its recognizable parts; anything truly unrecognized falls to the
  existing `notes`/`other` buckets.

## Testing

- `profile-markdown.spec.ts`: `parseCompensation`/`serializeCompensation`
  round-trip, partial values, empty; `parseProfileMd`/`serializeProfileForm`
  emit and re-read the `## Compensation` section.
- New `compensation.spec.ts`: `parseSalaryRange` across formats (k-notation,
  symbols, ranges, single, thousands separators, garbage -> null);
  `compareCompensation` for each verdict incl. currency mismatch -> unknown and
  single-bound targets.
- Component: profile form renders the comp inputs and round-trips; Discovery/My
  Jobs render the badge only when both sides parse. Typecheck + eslint + AOT
  build; run core + desktop suites.

## i18n

New EN + DE keys: profile field labels (min/max/currency/period + section
title), and the three badge labels. Currency/period option labels.

## Decisions (resolved)

- Currencies limited to EUR / USD; no conversion; mismatch -> `unknown`. [confirmed]
- Comparison shown in Discovery detail + My Jobs, not per feed row. [confirmed]
- Salary comparison depth: full parse + compare (Part B), not storage-only. [confirmed]
- Storage: markdown-source-of-truth, no JSON migration; `profile-compress`
  untouched. [author decision]
- `compensation.ts` is a separate core module from `profile-markdown.ts`
  (comparison is a distinct responsibility from profile serialization). [author decision]

## Risks

- `parseSalaryRange` faces messy free text (multiple currencies, "competitive",
  hourly rates, "up to X"). Mitigation: return `null` on anything ambiguous so a
  wrong badge is never shown; cover the common shapes with tests and treat the
  rest as `unknown`. Hourly/other periods are out of scope for the first cut -
  if only a bare number with no annual-looking magnitude is found, still compare
  numerically (the badge is advisory, not authoritative).
- Period mismatch (target per month vs job per year) is not normalized in the
  first cut; comparison is numeric on the raw bounds. Documented as a known
  limitation; a follow-up can normalize to annual.
