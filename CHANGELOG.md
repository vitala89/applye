# Changelog

All notable changes to Applye are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Applye is pre-1.0, so it follows `0.x` versioning: while on `0.x`, the minor
number covers new capability and the patch number covers fixes and release
plumbing. The version in `package.json`, `Cargo.toml`, and `tauri.conf.json`
is the single source of truth; this file tracks what changed at each tag.

## [Unreleased]

## [0.4.0] - 2026-06-30

### Added

- **applye.dev website** (`apps/web`): static landing page, three-zone
  documentation, a methodology page explaining the recruiter check, a blog
  placeholder, and this changelog, all on the shared design tokens.
- Lucide icon set across the desktop shell navigation and page components.
- **Schema sync (Phase 4.5):** additive migration
  `0006_career_ops_features.sql` reconciling the live SQLite schema with
  ROADMAP §12. New columns on `profile`, `jobs`, `scoring_cache`,
  `settings`, `sources`, and `company_research`, plus two new cache tables
  (`portal_answers`, `pattern_analysis`). Purely additive: existing
  dogfooding data is preserved. Rust, `libs/core`, and `libs/data` types
  synced; no feature logic yet.

### Changed

- Disabled GitHub Actions workflows while the repository is private.

## [0.3.1] - 2026-06-29

### Added

- Multi-OS release pipeline (tauri-action) with Tauri auto-updater wiring.
- Internationalization: English and German translations, plus empty, loading,
  and error states across the UI.
- Public README and an architecture overview in `docs/`.

### Changed

- Locked the DOCX and PDF export dependencies.

### Security

- Configured the updater signing public key in `tauri.conf.json`.

## [0.3.0] - 2026-06-28

The version moved from `0.1.0` straight to `0.3.0`; `0.2.0` was never tagged.

### Added

- AI spine: `ai_run` abstraction, skill-file loader, OS keyring for secrets,
  and the Settings screen.
- Rich profile editor with a compressed scoring profile and a default pitch.
- Paste-a-job scoring with a deterministic hard filter and a hash cache.
- Three-pass CV tailoring wizard with DOCX and PDF export.
- Pipeline kanban (Angular CDK) with automatic status history.
- Design tokens and the application shell.
- Quality gates: git hooks and CI.

### Fixed

- Pipeline loading and error state converted to signals for zoneless change
  detection.

## [0.1.0] - 2026-06-27

### Added

- Phase 1 data spine: SQLite schema, Tauri commands, and the profile vertical
  slice.

[Unreleased]: https://github.com/vitala89/applye/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/vitala89/applye/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/vitala89/applye/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/vitala89/applye/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/vitala89/applye/releases/tag/v0.1.0
