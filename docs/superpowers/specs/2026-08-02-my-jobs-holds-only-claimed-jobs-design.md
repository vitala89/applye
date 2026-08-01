# My Jobs holds only the jobs you claimed

Design for what belongs in the My Jobs list, and for warning before an analysed
job is left behind.

Status: agreed 2026-08-02.

## The report

Paste a job, press Parse & filter, then open My Jobs: the job is already in the
list, badged **Saved** - without the user ever pressing "Save this job".

## What is actually wrong

Two separate faults behind one symptom.

**The list shows every job row.** `db_list_jobs_overview` selects all of `jobs`,
with a single exception carved out for Discover:

```sql
WHERE COALESCE(j.imported_from, '') != 'discover_scan'
   OR EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id)
```

Analysing a pasted description writes a job row, because the score cache, the
tailoring and the generated documents all key on `job_id`. That row is a working
artefact, not a decision the user made, and the list treats the two the same.

**The badge lies.** `no_status` - the label for _no application at all_ - is
translated as `'Saved'` in `en.ts` and its equivalents in the other five
locales. So a job the user never claimed is labelled as one they did.

## Design

### What My Jobs lists

One rule replaces the rule-plus-exception:

```sql
WHERE EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id)
```

The list is the jobs the user claimed - "Save this job" or "Mark as Applied".
The Discover carve-out disappears into it, because a Discover job with an
application already qualifies and one without was already hidden.

This is not a new concept. It generalizes a rule the codebase already applies to
one source, and the query gets shorter.

Checked before adopting: `import.rs` writes a job and its application together
(lines 275 and 292, both production paths), so imported tracklists stay visible.

### The abandoned row stays

A job analysed and not claimed keeps its row, invisible to the list.

Deleting it was rejected. A first paste is identified by the text's hash, so
pasting the same posting again lands on the same row and reuses the score already
paid for in tokens. Deleting would charge the user twice for changing their mind.

The cost is rows that accumulate unreachably. Accepted for now; a cleanup pass is
a separate decision, and one that can be taken later without changing anything
here.

### The badge

`no_status` is rewritten in all six locales to say that there is no application,
which is what it means. After the list change it should be rare, but a label that
lies is worth fixing wherever it can still appear.

### Leaving an analysed job

A `CanDeactivate` guard on `jobs/:id` and `jobs/new`, firing on one condition:
a job is loaded and it has no application.

That condition does the work without special cases:

- pressed "Save this job" - an application exists, no prompt;
- pressed "Mark as Applied" - an application exists, so the wizard's own
  navigation is not interrupted;
- opened an already-saved job and left - nothing to warn about.

Typed-but-never-parsed text does not prompt. Nothing has been computed yet, and
prompting on it would fire every time the user changes their mind about a paste.

The guard lives in its own file. `jobs.component.ts` is at 1531 non-empty lines
against a 400-line budget and may not grow; a route guard is also a better home
for a routing concern than a page method.

### A consequence found in the callers

`wizard-nav.service.ts:41` and `dashboard.component.ts:270` look a job up **in
the overview list** to label unfinished wizard work with its company and title.
A wizard started on an unclaimed job no longer has a row there, so the label
would come up empty.

Both fall back to reading the job directly when the list has no row for it.
Found by reading the callers rather than by shipping it.

## Testing

Rust, on the overview query:

- a job with an application is listed;
- a job without one is not;
- an imported job is listed, since import writes both;
- a Discover scan without an application stays hidden, as before.

Angular:

- the guard allows navigation when an application exists;
- the guard prompts when a job is loaded without one;
- the guard allows navigation when no job is loaded at all;
- `wizard-nav` still names a job that is not in the overview list.

## Out of scope

Cleanup of unclaimed rows. A "recent analyses" surface for reaching them again.
Intercepting application close, which needs Tauri's close handler and can block
quitting if it goes wrong.
