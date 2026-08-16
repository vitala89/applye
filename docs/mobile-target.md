# Mobile - Tauri 2 Mobile Target (Deferred)

Applye has no mobile target. This is the plan for one, and the conditions under
which it starts.

There is deliberately **no `apps/mobile` directory**: an entry under `apps/`
that builds nothing reads as a target that exists, in every architecture review
and every `nx graph`. `tauri ios init` recreates it in one command on the day
the conditions below are met.

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
mkdir -p apps/mobile && cd apps/mobile
tauri ios init
tauri android init
```

Configure `src-tauri/tauri.conf.json` to point `devUrl` and `frontendDist`
at the same Nx-served Angular output as the desktop app.

## Status

Not scaffolded. Do not create the directory or add tooling until:

1. ~~The desktop MVP ships~~ - **met**: `0.29.2` is published, with installers
   for macOS on both architectures, Windows and Linux
2. iOS/Android prerequisites are installed
3. Team capacity exists to maintain a mobile target

`apps/desktop/src-tauri/tauri.conf.json` already carries a `bundle.android`
block (`debugApplicationIdSuffix`). It is inert on a desktop build and is not
evidence that a mobile target was started.

See ROADMAP.md §13 (Release Phasing) for context.
