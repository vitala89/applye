# Architecture Decision Record: unclaimed jobs stay in the database and become visible

- **Status**: `draft`
- **Date**: 2026-08-02

---

## Context

Analysing a pasted job description writes a row into `jobs` before the user has decided anything
about it. That row is not optional: the scoring cache, the tailoring cache, the generated documents
and the portal answers all key on `job_id`, so there is nothing to attach any of that work to until
the row exists.

Since PR #248, `db_list_jobs_overview_core` ends with
`WHERE EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id)`. My Jobs therefore lists only the
jobs the user claimed - Save this job, or Mark as applied. Everything else is written, kept forever,
and shown nowhere. The other list command, `db_list_jobs`, is looser: it excludes `discover_scan`
rows unless claimed, and shows the rest.

The consequence is not disk pressure. It is that a scored job the user paid tokens for becomes
unreachable the moment they navigate away, with no route back to it and no evidence it exists. This
was recorded as a deferred decision in three consecutive Duty Watch entries.

One fact shapes every option: a job is identified by `jd_hash = stable_hash(jd_text)`, and the AI
parse runs **before** the upsert. Deleting a row therefore costs a full re-parse if the same text is
ever pasted again. Deletion is not free, and no cleanup policy can make it free.

## Decision

Unclaimed rows stay. The fix is visibility, not a broom.

1. `db_list_jobs_overview_core` relaxes its `WHERE` to the rule `db_list_jobs` already uses -
   `COALESCE(imported_from, '') != 'discover_scan' OR EXISTS(applications)` - and `JobOverview`
   gains one derived boolean, `claimed`, computed as `EXISTS(applications)`.
2. My Jobs gains one filter chip, **default off**, so the table means exactly what it means today
   until the user asks otherwise.
3. An unclaimed row shows a distinct status word rather than an empty Status cell, and that word
   joins the existing status filter. One new i18n key across all six locales.
4. Discover-scanned rows are not revealed by the chip. A single scan writes many rows at once and
   would flood the table.
5. Unclaimed rows are deletable through the trash control My Jobs already has, which calls
   `db_delete_job` and its existing bottom-up cascade. There is no bulk clear.

**No schema migration.** "Claimed" is derivable, so nothing is added to `jobs`.

## Options Considered

- _Age-based cleanup_: delete unclaimed rows older than N days. Solves a storage problem the project
  does not have, and pays the re-parse cost above on every re-paste. Rejected.
- _A separate Drafts route_: a new page, component, template, tests and Tauri command. Keeps My Jobs
  meaning precisely what it means now, at the cost of more surface on the page whose files are
  already the worst over-budget in the repository. Rejected as disproportionate.
- _A dashboard section only_: cheapest UI, but the rows stay unsearchable and unsortable, which is
  most of what makes My Jobs useful. Rejected.
- _Document it and leave it_: honest, and was a real candidate while the complaint was unclear. Once
  the complaint was named as lost work rather than bloat, doing nothing stops answering it.
- _A `claimed_at` or `discarded_at` column_: needed only if unclaimed became a state the user can set
  rather than a fact derived from the data. It is not. Rejected as premature.

---

## Implications & Consequences

### Consequences

- One SQL predicate, one serialized field, one filter chip and one locale key. The blast radius is
  `db_list_jobs_overview_core`, `JobOverview`, `MyJobsComponent` and its template.
- The two list commands stop disagreeing about what a job list contains, which is the drift that
  produced the invisible rows in the first place.
- Rows still accumulate. The decision accepts that, and makes them reachable and removable by hand
  instead of pretending they are not there.
- Deleting an analysed row still re-pays the parse tokens on re-paste. Nothing here changes that, and
  the UI should not imply otherwise.

### Privacy / Security Impact

None in the sense of new exposure: this reveals the user's own local rows to the user, on their own
machine, from a database that already held them. It is a small privacy improvement, because a user
cannot delete what they cannot see, and full job description text is currently retained with no
route to remove it short of deleting the database.

### Reversibility

Trivial. Restoring the previous behaviour is reverting one `WHERE` clause and removing one chip. No
data is migrated, transformed, or destroyed by adopting or reverting it.

---

## References

- **Links**: PR #248 introduced the claimed-only rule;
  `apps/desktop/src-tauri/src/commands/jobs.rs` holds both list commands and the `jd_hash` upsert.
- **Follow-up Tasks**:
  - [ ] Relax `db_list_jobs_overview_core` and add `claimed` to `JobOverview`, with a Rust test
        asserting an analysed-but-unclaimed row is returned and a `discover_scan` row is not.
  - [ ] Add the filter chip and the status word to My Jobs, default off, with a component test.
  - [ ] Add the locale key across all six languages.
