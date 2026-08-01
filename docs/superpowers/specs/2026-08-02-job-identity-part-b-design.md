# Job identity, part B: AI identification, then ask the user

Design for naming a job's company and role when the deterministic rules cannot.
Follows part A (`2026-08-01-job-identity-extraction-design.md`), which is shipped.

Status: agreed 2026-08-02. Implemented 2026-08-02, native gate pending.

## The posting that defines the problem

A real posting, reported from the running app:

> This position is listed on behalf of a partner company, who manages all
> applications and next steps. Our partner is looking for an **AI-Native
> Software Developer** based in Germany.

It draws the line exactly:

- **The role is in the text**, in prose rather than a heading. Part A's rules
  cannot take it - a mid-sentence phrase is inference, not extraction - and an
  AI reading the posting gets it immediately.
- **The company is genuinely absent.** The employer is "a partner company",
  unnamed. `Jobgether` appears throughout, but it is the platform running the
  matching, not the employer.

So the same posting needs both halves of this design: AI names the role, admits
it cannot name the company, and the user is asked.

**`Jobgether` is the canonical wrong answer.** An AI that names it produces a
cover letter opening "I am excited to apply to Jobgether" - confidently, and
wrongly, in the user's name. Not naming a company is a correct answer.

## Flow

One press of Parse & filter carries the whole chain:

1. Deterministic rules (part A, 0 tokens).
2. Anything still missing, and an AI provider configured: one `job-identify`
   call.
3. Anything still missing: a dialog asking the user, with a Skip.

The AI step is not behind its own button. It runs only when the rules actually
missed, which is the condition that made a button worth considering in the first
place - and three presses on every badly-formatted posting is worse than one.

Skip is remembered for that job: the dialog does not return on re-parse. A
"Name it yourself" button stays beside the placeholder, so skipping closes the
interruption without closing the road back.

## Where a value came from

Two new columns on `jobs`, replacing the pair of booleans part A's outline
assumed:

```
title_source   TEXT  -- 'extracted' | 'inferred' | 'user', NULL when unknown
company_source TEXT
```

A source says more than an "is this a guess" flag, and it settles a question the
booleans could not: what a re-parse is allowed to overwrite.

| Stored source | On re-parse                                                      |
| ------------- | ---------------------------------------------------------------- |
| `user`        | Never overwritten. The user is the authority; the parser is not. |
| `inferred`    | A real extracted value wins; otherwise kept.                     |
| `extracted`   | Part A's `fallback` rule, unchanged.                             |

The `user` row matters more than it looks: without it, a company typed by hand
is run through `is_usable_company` on the next re-parse and can be **discarded
for not looking like a company name**. Part A built that validator to reject
stale garbage, and it cannot tell the difference between garbage and a real
employer with an unusual name.

`identity_prompt_skipped INTEGER` records the skip. In the database rather than
local storage, because it is a fact about the job, not about the browser.

## The AI step

A bundled skill, `libs/skills/src/job-identify/job-identify.md`, in the shape the
others use: frontmatter, `[SYSTEM]`, `[USER]`.

Returns strict JSON:

```json
{ "company": "Acme GmbH" | null, "title": "Backend Engineer" | null }
```

The prompt's load-bearing instructions:

- Name the **employer**, not the job board, the agency, the recruiter, or the
  platform running the application process.
- If the posting says it is published on behalf of an unnamed partner, the
  company is `null`. Not naming is a correct answer.
- The title may be drawn from prose. Return the role as a person would write it
  on a CV, not the sentence it appeared in.
- No prose, no explanation, JSON only.

Both returned values are stored with source `inferred`, so nothing the AI
produced is presented as a quotation from the posting.

Model: the cheap tier, as `ping` uses. The input is one posting and the output is
two short strings.

Skipped entirely when no provider is configured - the dialog follows directly,
which is also the whole flow for a user who has not set up AI at all.

## The dialog

Raised after step 2 when either field is still missing, unless this job's skip is
already recorded.

- Says which fields it could not determine, and does not pretend the other one is
  in question.
- Two inputs, prefilled with anything already known.
- **Save** writes what was typed with source `user`. **Skip** records the skip
  and leaves the placeholders.
- Escape and the backdrop mean Skip, because they mean "not now".

Mounted at the shell beside `UnsavedJobPromptComponent` and driven by a service,
the pattern the Paste Job modal and the unsaved-job prompt both already use. The
jobs page is at its size budget and cannot host it.

## Showing an inferred value

An inferred company or title renders with a marker distinguishing it from one the
posting stated - the same restraint as the part A placeholder, which is dimmed and
italic so it cannot read as the posting's own words. A tooltip or short label
saying it was inferred, not quoted.

A value with source `user` renders as plain fact. The user is not guessing.

## Writing it back

One new command, `job_set_identity(job_id, title, company, title_source,
company_source)`, used by both the AI step and the dialog. It updates the job row
only - the JD text and its hash are untouched, so it cannot fork a job or
invalidate a score, which is what the identity of a job row is for after part A's
in-place update.

## Testing

Rust:

- `job_set_identity` writes values and sources, and touches nothing else;
- re-parse never overwrites a `user` value, including one the validator would
  otherwise reject;
- re-parse replaces an `inferred` value when extraction finds a real one;
- re-parse keeps an `inferred` value when extraction finds nothing;
- the skip flag survives a re-parse.

Skill contract, in the shape the other skill tests use: the reported posting
yields a title and a **null company**; a posting naming its employer yields it;
platform and agency names are not returned as the employer.

Angular:

- the dialog is raised when a field is missing and no skip is recorded;
- it is not raised when the skip is recorded;
- Save writes both fields with source `user`;
- Skip records the skip and writes nothing;
- the AI step is not attempted with no provider configured, and the dialog still
  follows.

## Out of scope

Re-running identification on demand for a job that already has both fields.
Learning from corrections across jobs. Naming the company from the apply email's
domain, which is a separate 0-token idea worth its own look.
