## What

<!-- One or two sentences: what does this PR change and why? -->

## Architecture and maintainability

<!-- State the responsibility of each new/extracted file. For touched files near or above budget, include before/after non-empty line counts. Explain any approved exception. -->

## System Design and approval

<!-- Required for features, integrations, architecture/domain/API/schema changes, significant refactors, and privacy/security-sensitive changes. For simple non-behavioral edits, explain the exemption. See docs/governance/DESIGN_FIRST.md. -->

- Design directory: `docs/designs/<task-slug>/` (or reason exempt):
- Diagram source links (Excalidraw / draw.io / Mermaid as relevant):
- SVG preview links for each Excalidraw/draw.io source:
- Approved design PR / revision SHA and explicit user approval link (implementation PRs):
- DDD boundaries, Nx dependency directions, data/privacy flows and contracts reviewed:
- Deviations from approved design (and renewed approval, if material):

### Design review checklist

- [ ] Design First applies, or a lightweight exception is justified
- [ ] Diagram tools were chosen for the task; not all three are mandatory
- [ ] Editable sources are committed under `docs/designs/<task-slug>/`; every `.excalidraw`/`.drawio` has a matching, current SVG preview
- [ ] Diagrams agree with architecture, DDD terminology, ADRs, current code and documented contracts
- [ ] Error paths, testing, security, local-first boundaries and deployment are covered where relevant
- [ ] Implementation began only after explicit approval of the linked design revision; material deviations were re-approved

## How to verify

<!-- Commands actually run / screens actually opened. Do not list unrun checks as passed. -->

## Checklist

- [ ] `npm run quality:file-size` passes and no oversized source file grew
- [ ] `npm run quality:application-boundaries` passes
- [ ] New logic has a focused test seam; bug fixes include a regression test
- [ ] `npm test`, `npm run lint`, `npm run type-check` pass locally when applicable
- [ ] `cargo test` passes if Rust code was touched
- [ ] `npm run quality:attribution` passes
- [ ] Commit messages and this PR contain no co-author, sign-off, generated-by, model, or agent attribution
- [ ] CHANGELOG.md updated when shipped behavior or developer workflow changed
- [ ] Docs updated if behavior, architecture, privacy, security, or workflow changed
- [ ] Respects the augmentation boundary (no auto-apply/auto-submit) and privacy rules (no telemetry, no accounts)
- [ ] Commit messages follow Conventional Commits
