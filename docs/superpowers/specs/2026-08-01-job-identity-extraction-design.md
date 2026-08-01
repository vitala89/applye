# Job identity extraction: company and title

Design for how Applye decides a pasted job's company and title, why the current
rules miss both, and what replaces them.

Status: agreed 2026-08-01. Covers part A only - deterministic rules, precedence,
and display fallbacks. The AI-assisted identification is part B and gets its own
spec.

## The report

A JD pasted with `Company name - Elbrus` in its header produced "No company name
found in the posting.", and the job's title became `The Purpose:` - a section
heading from the body. Neither value could be corrected afterwards.

## Three separate causes

**Company.** `extract_company` matches a label only when it is one of `company:`,
`employer:`, `organization:` and only when the separator is a colon.
`Company name - Elbrus` fails on both counts: the label is two words and the
separator is a hyphen. The body fallback then tries `About X` / `Join X` /
`Welcome to X` headings and the `<Company> is a ...` opening sentence. The text
opened `At PPRO, our mission is to simplify ...`, where the word after `is` is
`to` rather than `a`/`an`/`the`, so that path returned nothing too.

**Title.** With no `Position:` / `Job title:` / `Role:` / `Title:` line,
`extract_title` falls back to the first non-empty line shorter than 80
characters. In a JD that opens with a section heading, that heading becomes the
title.

**The wrong value is permanent.** `job_paste` takes optional title and company
overrides and they win unconditionally. The jobs page passes the job's own stored
values back in on every re-parse, so once `The Purpose:` is stored, re-extraction
never runs again. There is no UI and no Rust command to edit either field, so the
value cannot be corrected by any route.

## Design

### Rules (0 tokens)

Company labels widen to `company`, `company name`, `employer`, `organization`,
`org`, `hiring company`. Separators widen to colon, hyphen, en dash, em dash,
pipe, equals. The two dash characters are written in Rust as `'\u{2013}'` and
`'\u{2014}'` rather than as literal characters, because the repository forbids
those characters in authored output while real job descriptions contain them
constantly - this is matching input, not authoring text.

Title rejects a candidate line when it ends with a colon, when it matches a known
section heading (`the purpose`, `about us`, `overview`, `responsibilities`,
`requirements`, `benefits`, `who we are`, `what you will do` and similar), or
when it contains no role-like word. If nothing survives, extraction returns
nothing.

**Returning nothing is now a valid answer.** Previously the fallback had to
produce something because an empty field left a hole in the UI. The display
fallback below fills that hole, so an honest miss beats a confident wrong answer.

### Precedence

`job_paste` is called with overrides from two places that mean opposite things:

- `paste-job-modal.component.ts:153` passes metadata from `fetchJobFromUrl` -
  structured data lifted off a job board. Authoritative; more reliable than any
  text parse.
- `job-intake.service.ts:67` passes the job's own previously stored values.
  A fallback, and the reason a bad value sticks.

So the command gains an explicit mode rather than a flipped default:

- **Authoritative** - the passed value always wins. Used by the link/ATS path.
  Today's behaviour, unchanged.
- **Fallback** - fresh extraction wins; the passed value is used only when
  extraction found nothing. Used by the re-parse path on the jobs page.

The mode is a parameter of the call, not a column on the job, because it
describes where a value came from on this invocation.

Consequence for the reported bug: re-parsing rejects `The Purpose:` as a section
heading, extracts nothing, and falls back to the stored value - so the card shows
the old value until the JD gains a real title, and a real title in the text
overwrites it immediately. The header-less JD protection survives: trimming a JD
to its body no longer loses a title that was once correct.

### Display fallback

Nothing is written to the database - company and title stay NULL. The placeholder
exists only in the view, in three places: the My Jobs list row, the job card, and
the page title.

New keys `jobs.company_unknown` and `jobs.title_unknown`, added to all six
locales (en, ru, es, fr, uk, de). All six are required: `translations.spec.ts`
asserts every English key resolves in every locale and fails otherwise.

Storing a literal `Unknown` was rejected. `duplicate_jd_other_company` and
`legitimacy_check` compare companies to each other, so a shared placeholder would
collapse unrelated jobs into "the same company" and raise a false duplicate
warning.

### Structure

Extraction moves to a new `apps/desktop/src-tauri/src/commands/job_identity.rs`:
labels, separators, stopwords, section-heading rejection, `extract_title`,
`extract_company`, and their tests. `scoring.rs` keeps orchestration -
`job_paste_core` calls the module and applies precedence.

This is not incidental refactoring. `scoring.rs` is 647 non-empty lines against a
800-line budget and holds its 13 tests inline; the new rules plus their tests
would put it at the ceiling, and `CODE_QUALITY.md` requires extracting a
responsibility before adding behaviour.

## Testing

`job_identity.rs`:

- the reported JD, with `Company name - Elbrus`, as a fixture
- each separator: colon, hyphen, en dash, em dash, pipe, equals
- each label variant
- `The Purpose:` and the other section headings are rejected as titles
- a JD with no usable title yields nothing rather than a body line
- the paths that already worked - `About X`, `<Company> is a ...` - still work

`scoring.rs`:

- authoritative mode: the passed value beats a successful extraction
- fallback mode: extraction beats the passed value
- fallback mode: the passed value is used when extraction found nothing

Angular:

- the placeholder renders on NULL and does not render on a value
- `JobIntakeService` calls in fallback mode; the link modal calls in
  authoritative mode

## Out of scope

Part B: an AI `job-identify` skill behind an explicit button shown only when a
field is still empty after parsing, writing through a new command, with
`title_inferred` / `company_inferred` columns and a UI badge, so an inferred
value is never presented as a quotation from the posting. Manual editing of
company and title is also deferred; if the rules and AI both miss, the field
stays empty.
