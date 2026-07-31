## What

<!-- One or two sentences: what does this PR change and why? -->

## Architecture and maintainability

<!-- State the responsibility of each new/extracted file. For touched files near or above budget, include before/after non-empty line counts. Explain any approved exception. -->

## How to verify

<!-- Commands actually run / screens actually opened. Do not list unrun checks as passed. -->

## Checklist

- [ ] `npm run quality:file-size` passes and no oversized source file grew
- [ ] New logic has a focused test seam; bug fixes include a regression test
- [ ] `npm test`, `npm run lint`, `npm run type-check` pass locally when applicable
- [ ] `cargo test` passes if Rust code was touched
- [ ] `npm run quality:attribution` passes
- [ ] Commit messages and this PR contain no co-author, sign-off, generated-by, model, or agent attribution
- [ ] CHANGELOG.md updated when shipped behavior or developer workflow changed
- [ ] Docs updated if behavior, architecture, privacy, security, or workflow changed
- [ ] Respects the augmentation boundary (no auto-apply/auto-submit) and privacy rules (no telemetry, no accounts)
- [ ] Commit messages follow Conventional Commits
