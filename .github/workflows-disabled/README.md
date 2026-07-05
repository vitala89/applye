# Disabled workflows

GitHub only runs workflow files inside `.github/workflows/`. These live one
directory up **on purpose** so they do not execute.

## Why

While the repo is **private on the free plan**, GitHub Actions minutes are
capped (2000/month, with macOS billed 10× and Windows 2×). Every push/PR was
hitting the cap and failing with a billing error. Until the repo goes public
(Actions are free + unlimited for public repos), CI and the release build run
**locally**, not in the cloud.

- `ci.yml` — lint / test / build gate (was: push to main + every PR)

The release workflow is now enabled at `.github/workflows/release.yml`. It runs
only on version tag pushes (`vX.Y.Z`) and verifies the tag matches
`package.json`, `package-lock.json`,
`apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`
before building draft GitHub Releases.

## Meanwhile (local equivalents)

```bash
# CI gate, locally:
npx nx affected -t lint test build
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test   --manifest-path apps/desktop/src-tauri/Cargo.toml

# Release build for the current OS (needs TAURI_SIGNING_PRIVATE_KEY[_PASSWORD] in env):
cd apps/desktop && npx tauri build
# then publish manually, e.g. gh release create vX.Y.Z <bundles> --draft
```

## To re-enable CI (when the repo goes public)

1. `git mv .github/workflows-disabled/ci.yml .github/workflows/ci.yml`
2. Re-add branch protection on `main` requiring the check
   **`Lint / Test / Build (affected) + Rust`**.
3. Confirm repo secrets still exist for releases: `TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
