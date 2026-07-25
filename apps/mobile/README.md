# Mobile - Tauri 2 Mobile Target (Placeholder)

This directory is a placeholder for future iOS/Android builds.

## Plan

Applye's mobile target will reuse:

- All `libs/` (core models, data services, ui components, i18n)
- The same Angular frontend from `apps/desktop/src/`
- A Tauri 2 mobile shell (`src-tauri/` configured for iOS/Android)

## Prerequisites (when scaffolding begins)

- **iOS**: Xcode 15+ and iOS 17+ simulator or device
- **Android**: Android Studio with NDK, SDK platform 34+
- **Rust targets**: `aarch64-apple-ios`, `aarch64-linux-android`, `armv7-linux-androideabi`
- **Tauri CLI 2.x** with mobile support: `cargo install tauri-cli`

## Tauri 2 Mobile Init (when ready)

```bash
# From the monorepo root
cd apps/mobile
tauri ios init
tauri android init
```

Configure `src-tauri/tauri.conf.json` to point `devUrl` and `frontendDist`
at the same Nx-served Angular output as the desktop app.

## Status

Not scaffolded. Do not add tooling here until:

1. The desktop MVP ships
2. iOS/Android prerequisites are installed
3. Team capacity exists to maintain a mobile target

See ROADMAP.md §13 (Release Phasing) for context.
