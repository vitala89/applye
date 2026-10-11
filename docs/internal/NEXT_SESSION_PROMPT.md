# Next session prompt

Copy everything below the line into a fresh session.

---

**The strategic direction is accepted and merged. Local database backup and restore is in review
on `feat/database-backup-restore`. Do not start Career Evidence until that pull request is merged.
After it merges, the next product-development slice is Career Evidence domain foundation.**

Start where `CLAUDE.md` says: `docs/internal/AGENT_START_HERE.md`, then `AGENTS.md`,
`docs/product/CURRENT_STATE.md`, the newest entry in `docs/internal/DUTY_WATCH.md`, and
`docs/governance/CODE_QUALITY.md` / `docs/governance/VALIDATION_MATRIX.md`. Then read
`docs/domain-architecture.md`,
`docs/product/feature-briefs/career-company-network-interview-intelligence.md`,
`docs/product/decisions/ADR-0006-career-company-network-interview-intelligence.md`, and
`docs/product/decisions/ADR-0007-web-backend-platform.md` before writing domain code.

## Where things actually stand

- `git branch --show-current` should read `main`, clean, at or after the positioning-alignment PR.
  **Verify `git rev-parse HEAD` and `git status` before trusting any hash below.** This repository's
  working tree has repeatedly reset between sessions. `ROADMAP.md` has previously been left
  skip-worktree with a stale local copy; `git ls-files -v ROADMAP.md` should show `H`, not `S`.
- **`#567`, `#568`, and `#569` are merged.** They accept the Career Intelligence direction, the web
  product strategy, and the web-backend boundary. Do not reopen them unless current `main`
  contradicts them.
- **`#545` is merged** (`b8d16e04`). It is not an open pull request.
- **`v0.29.4` is the current published tag** (`6d1a1f9e`). That commit is not an ancestor of `main`.
  Leave the tag. Nothing in the Career Intelligence docs has been tagged or released.
- Open Dependabot pull requests are maintenance. They are not the product queue.

## Active product direction

Applye is entering phased implementation of:

1. Career Intelligence
2. Company Intelligence
3. Network Intelligence
4. Interview Intelligence
5. Community Intelligence

The current public product is **Applye Desktop**: local SQLite, no Applye account required, MIT
desktop core, BYOK / supported CLI AI, user-controlled AI calls. Desktop career data stays local
unless the user explicitly invokes an external provider or a future explicit cloud action.

**Applye Web is not shipped.** Do not describe account-backed workflows, Company Hub, Network CRM,
Interview Intelligence, or community features as available. Do not create `apps/api`, Hono, D1,
authentication, Workers resources, sync, or empty backend scaffolding. ADR-0007 says the backend
starts with the first real backend slice.

## Implementation sequence

Dependency order, not dates:

```text
0. Project-state / positioning cleanup
1. Career Evidence domain foundation
2. Career Evidence desktop persistence
3. Career Profile / Evidence UI
4. AI Career Discovery
5. Career Stories / Ownership
6. Role Discovery
7. Company foundation
8. Company Hub
9. Evidence & Freshness
10. Company Research
11. Network CRM
12+. Interview Intelligence
13+. Community Intelligence
```

**The next product-development feature is step 1, Career Evidence domain foundation:** pure domain
rules in `libs/core` for user-confirmed Career Evidence, with tests. No desktop migration, no UI,
and no web backend in that slice. Grill before changing a `libs/` public API or the application-layer
shape (`ADR-0005`).

## Maintenance backlog

These remain after a check against `main` on 2026-10-05. They are not the next feature. Ask the
maintainer before starting one.

1. **Installer smoke test, phase 2.** `.github/workflows/installer-smoke-test.yml` exists and is
   `workflow_dispatch`-only. `release.yml` still has no smoke step. Wiring it in stays gated on an
   explicit go-ahead, because that workflow only runs on a real version-tag push.
2. **German pack follow-ups** in `docs/product/IDEAS.md`: Bewerbungsmappe, the `DE-tabular`
   Lebenslauf template, an Arbeitszeugnis decoder, Eigenbemühungen quota tracking. EURES, Interamt,
   `ats_join`, and `ats_softgarden` stay blocked on the findings in
   `docs/product/local-markets-analysis.md`. Do not scrape HTML to unblock `ats_join`.
3. **Native manual gate.** `docs/internal/NATIVE_GATE_BACKLOG.md` still has 36 unchecked items. No
   agent can drive them. This includes a native check of the `service.bund.de` source.
4. **Tailoring performance.** `S1` (pass 2 output size) and `S3` (native cache-hit measurement) are
   still recorded open from the August handoff. This cleanup did not re-measure them.
5. **Developer ID signing and notarisation.** Still deferred. The blocker is the Apple Developer
   Program fee, a business decision already made. Do not re-propose it as a technical oversight.
6. **Missing tests.** `apps/desktop/src/app/pages/jobs/jobs.component.ts` is 419 lines and has no
   spec file.
7. **Dependency and security maintenance.** Open Dependabot pull requests exist. Do not treat a
   version-bump PR as the product roadmap.
8. **Feature-index reconciliation.** Historical rows in `docs/product/FEATURE_INDEX.md` are still not
   fully reconciled against everything shipped since `v0.22.0`. The Career Evidence row is the
   product-development pointer; reconciling old rows is maintenance.

## Do not re-open

- The accepted desktop/web boundary in ADR-0006 and ADR-0007, including "no empty backend
  scaffolding" and "desktop data is not uploaded because a web account exists."
- Closed decisions from the pre-October prompts: the print pipeline, the apply-wizard grilling
  (`#536`), `S3`'s narrowed cache scope, `split_frontmatter` staying LF-strict, `startup::fail`
  leaving the window on screen, and the `discover_fetch.rs` no-HTML-scraping rule.
- A screenshot or rasterized PDF export as a fix for anything print-related.

## Gates before commit

Use `docs/governance/VALIDATION_MATRIX.md`. For a Career Evidence domain slice that touches
`libs/core`, that includes `nx test core`, `nx run core:type-check` or the repo type-check, lint for
the touched project with `--skip-nx-cache`, plus `npm run quality:file-size`,
`npm run quality:attribution`, `npm run format:check`, and `git diff --check`. Add desktop or web
gates only if those apps change. Do not scaffold a backend in that slice.
