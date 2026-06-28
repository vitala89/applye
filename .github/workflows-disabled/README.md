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
- `release.yml` — tag-triggered multi-OS build + auto-updater artifacts

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

## To re-enable (when the repo goes public)

1. `git mv .github/workflows-disabled/ci.yml .github/workflows/ci.yml`
2. `git mv .github/workflows-disabled/release.yml .github/workflows/release.yml`
3. Re-add branch protection on `main` requiring the check
   **`Lint / Test / Build (affected) + Rust`**.
4. Confirm repo secrets still exist: `TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
