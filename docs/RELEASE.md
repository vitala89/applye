# Releasing Applye

How installers are produced for Windows, macOS and Linux, how to build one by hand, and how to
verify a build you cannot run on your own machine.

## 1. The normal path: CI builds everything

Releases are produced by [`.github/workflows/release.yml`](../.github/workflows/release.yml). It
runs **only on a version tag push** and builds a four-way matrix:

| Runner           | Produces                                                 |
| ---------------- | -------------------------------------------------------- |
| `macos-latest`   | `.dmg` + updater archive for **aarch64** (Apple Silicon) |
| `macos-latest`   | `.dmg` + updater archive for **x86_64** (Intel)          |
| `windows-latest` | `.msi` (WiX) and `.exe` (NSIS) installers                |
| `ubuntu-22.04`   | `.deb`, `.rpm` and `.AppImage`                           |

The workflow verifies that the tag matches `package.json`, `package-lock.json`, `tauri.conf.json`
and `Cargo.toml`, signs the updater artifacts with the repository secrets, and opens a **draft**
GitHub Release. Nothing is published until the draft is reviewed.

```bash
# after the version bump is merged to main
git tag -a v0.30.0 -m "Applye 0.30.0"
git push origin v0.30.0
```

Then review the draft release, download one installer per platform, smoke-test, and publish.

**Requirements already in place:** the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are configured, and the updater public key is committed in
`tauri.conf.json`. The private key must never enter the repository.

### Known blocker

Every release run so far has failed before starting a single job, with:

> The job was not started because recent account payments have failed or your spending limit needs
> to be increased.

This is a **GitHub billing state, not a workflow bug**. Private repositories consume Actions
minutes, and macOS runners bill at 10x the Linux rate. Two ways out:

1. Fix the payment method / raise the spending limit in GitHub billing settings.
2. Make the repository public - Actions minutes on standard runners are free for public
   repositories, which removes the constraint permanently.

Since the repository is going public anyway, option 2 resolves it. But the first release then has
to happen _after_ the repository is open, so the launch order matters: open the repository, push
the tag, let CI build, publish the draft, and only then point people at the download links.

## 2. Building by hand

### macOS (on a Mac)

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/applye_updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run desktop:build:tauri
```

Artifacts land in `apps/desktop/src-tauri/target/release/bundle/`:
`dmg/Applye_<version>_aarch64.dmg` and `macos/Applye.app`.

The signing key is only for the **auto-updater**, not for Apple code signing. Without an Apple
Developer certificate and notarization the app is unsigned, so first launch shows a Gatekeeper
warning and the user has to right-click the app and choose Open, or clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/Applye.app
```

That is acceptable for an open-source project, but it has to be documented for users rather than
left as a surprise.

### Windows and Linux: do not cross-compile from macOS

It is technically possible and practically a trap. Windows needs the MSVC toolchain and WiX/NSIS;
Linux needs `webkit2gtk` and the GTK stack, which do not exist on macOS. Use CI, or build inside a
virtual machine of the target OS.

### Linux, natively or in a VM

```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
npm ci
npm run desktop:build:tauri
```

Artifacts: `bundle/deb/*.deb`, `bundle/appimage/*.AppImage`, `bundle/rpm/*.rpm`.

### Windows, natively or in a VM

Install Node 22, Rust (stable, MSVC toolchain) and the WebView2 runtime (present by default on
Windows 11), then:

```powershell
npm ci
npm run desktop:build:tauri
```

Artifacts: `bundle\msi\*.msi` and `bundle\nsis\*-setup.exe`.

## 3. Verifying Windows and Linux builds from a Mac

The awkward part on Apple Silicon is **architecture**, not virtualization: a VM on an M-series Mac
runs ARM64 guests natively, but CI produces **x86_64** installers.

### Windows: this works well

Run **Windows 11 ARM64** in [UTM](https://mac.getutm.app) (free) or Parallels Desktop. Windows on
ARM emulates x64 applications transparently, so the x86_64 `.msi` and `.exe` from CI install and
run. Good enough for a smoke test of the installer, first run, database creation and the UI.

What it does _not_ prove: native x64 performance, and anything driver-adjacent. For a job-search
desktop app that is an acceptable gap.

### Linux: the architecture problem is real

An ARM64 Ubuntu VM **cannot** run an amd64 `.deb` or `.AppImage`. Three honest options:

1. **Emulated x86_64 Ubuntu in UTM.** UTM supports full QEMU emulation, not just virtualization.
   Slow - expect a sluggish desktop - but it runs the exact artifact users will download. Best
   choice for verifying an installer before a release.
2. **A throwaway x86 cloud VM.** Any provider, a few cents an hour, Ubuntu 22.04 with a lightweight
   desktop and VNC or an X server. Fastest real x86_64 verification.
3. **Add an ARM64 Linux target to the release matrix.** Then an ARM64 Ubuntu VM tests natively at
   full speed, and ARM Linux users get a build too. This is the only option that also improves the
   product, and it is a few lines in the workflow matrix.

Recommended: option 1 for release verification now, option 3 when there is a reason to support
ARM Linux.

### Smoke test checklist, per platform

Run this against every installer before publishing a draft release:

- [ ] The installer completes without a warning that stops a normal user.
- [ ] The app launches on a machine that has never seen Applye.
- [ ] The SQLite database is created and the first-run flow appears.
- [ ] Create a job by pasting a description; it is stored and survives a restart.
- [ ] The pipeline kanban, tracker and analytics screens open without errors.
- [ ] With no AI configured, the app stays fully usable and never blocks on a missing key.
- [ ] Language switching works, including a non-Latin locale.
- [ ] Uninstalling removes the app and leaves user data where the docs say it will be.

Record the result in the release notes: which platforms were tested on real hardware, which in a
VM, and which only by CI.
