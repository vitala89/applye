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

### Resolved: the blocker that stopped every release before this one

For five tagged releases, every run failed before starting a single job, with a message about
payments having failed or a spending limit needing to be raised. **That message was misleading and
the diagnosis it invited was wrong.** There was no failed payment. The repository was private, which
means Actions minutes are metered, the account's included minutes were exhausted, and the spending
limit was $0 - so jobs were refused rather than billed.

Making the repository public fixed it immediately: Actions minutes on standard runners are free for
public repositories. `v0.29.1` is the first release CI has ever actually built, and it produced the
full matrix.

Worth keeping in mind, because it cost real time: while this was in effect **no release job ran, so
no release bug could surface**. Three separate bugs were sitting in the release path and were only
found once CI could reach a build step - `frontendDist` resolving one directory level short, the CSP
blocking Angular's deferred stylesheet, and `beforeBuildCommand` calling `nx` without `npx`. A gate
that cannot run is not a gate.

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
runs ARM64 guests natively, but CI produces **x86_64** installers for both Windows and Linux. There
is no ARM64 build of either, so every route below is about getting x86_64 code to run.

Which asset belongs to which platform:

| Platform         | Asset                                             | Arch   |
| ---------------- | ------------------------------------------------- | ------ |
| macOS, M-series  | `Applye_0.29.2_aarch64.dmg`                       | native |
| macOS, Intel     | `Applye_0.29.2_x64.dmg`                           | native |
| Windows, MSI     | `Applye_0.29.2_x64_en-US.msi`                     | x86_64 |
| Windows, NSIS    | `Applye_0.29.2_x64-setup.exe`                     | x86_64 |
| Debian / Ubuntu  | `Applye_0.29.2_amd64.deb`                         | x86_64 |
| Fedora / RHEL    | `Applye-0.29.2-1.x86_64.rpm`                      | x86_64 |
| Any Linux        | `Applye_0.29.2_amd64.AppImage`                    | x86_64 |
| Updater manifest | `latest.json` plus the `.sig` beside every bundle | -      |

Where the app keeps its data, which the uninstall check needs. The identifier is `dev.applye.app`:

| Platform | Path                                            |
| -------- | ----------------------------------------------- |
| macOS    | `~/Library/Application Support/dev.applye.app/` |
| Windows  | `%APPDATA%\dev.applye.app\`                     |
| Linux    | `~/.local/share/dev.applye.app/`                |

The database is `applye.db` inside that directory.

### Step 0. macOS, natively, about five minutes

Do this first. It is the cheapest way to find a bug that would also affect the other platforms.

1. On the draft release page, download `Applye_0.29.2_aarch64.dmg`.
2. Open it, drag **Applye** to Applications.
3. The build is unsigned and not notarized, so Gatekeeper refuses the first launch. Right-click the
   app in Applications and choose **Open**, then confirm. Once only. Or:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Applye.app
   ```

4. Run the checklist below.
5. To prove first-run behaviour again later, delete
   `~/Library/Application Support/dev.applye.app/` and relaunch.

### Step 1. Windows, in a free UTM virtual machine

Windows 11 on ARM emulates x64 applications transparently, so the x86_64 installers work. This is
the route that behaves best on Apple Silicon.

1. Install [UTM](https://mac.getutm.app) - free, and the App Store version is the same app with a
   paid convenience wrapper:

   ```bash
   brew install --cask utm
   ```

2. Download the official **Windows 11 ARM64** ISO from
   <https://www.microsoft.com/en-us/software-download/windows11arm64>. It is a multi-edition ISO.
   A product key is not needed to finish setup and use the machine; an unactivated Windows shows a
   desktop watermark and blocks personalisation, neither of which affects this test.
3. In UTM: **Create a New Virtual Machine → Virtualize → Windows**, select the ISO, give it 4 CPUs,
   8 GB RAM and a 64 GB disk. Leave the guest-tools option on, so clipboard and display resizing
   work.
4. Complete Windows setup. Setup may insist on a network connection and a Microsoft account - that is
   Windows, not Applye.
5. Inside the VM, open the draft release page and download `Applye_0.29.2_x64_en-US.msi`.
6. Run it. SmartScreen shows **"Windows protected your PC"** because the installer has no
   code-signing certificate: **More info → Run anyway**. This is the exact path a real user takes,
   so it is worth seeing rather than skipping.
7. WebView2 ships with Windows 11, so nothing else needs installing.
8. Run the checklist below.
9. Then repeat steps 5-8 with `Applye_0.29.2_x64-setup.exe`. **Do not skip this**: MSI and NSIS are
   two different installers with two different failure modes, and both are published.

Paid alternative: Parallels Desktop downloads and installs Windows 11 ARM for you in one step. If
the UTM setup fights back, the trial is a reasonable shortcut.

### Step 2. Linux, x86_64

An ARM64 Ubuntu VM **cannot** run an amd64 `.deb` or `.AppImage`, so pick one of these.

**Route A, recommended: a throwaway x86_64 cloud VM.** Fastest real verification, billed by the
hour, destroyed when done. Any provider with hourly x86 instances; Ubuntu 24.04.

```bash
# on the VM, over ssh - a light desktop reachable by RDP
sudo apt update
sudo apt install -y xfce4 xfce4-goodies xrdp
sudo adduser xrdp ssl-cert
sudo systemctl enable --now xrdp
```

Connect from the Mac with Microsoft Remote Desktop, then:

```bash
# from the Mac, push the artifacts up
scp Applye_0.29.2_amd64.deb Applye_0.29.2_amd64.AppImage <user>@<host>:~

# on the VM - the .deb
sudo apt install ./Applye_0.29.2_amd64.deb
applye

# on the VM - the AppImage, which needs FUSE 2 on 24.04
sudo apt install -y libfuse2t64
chmod +x Applye_0.29.2_amd64.AppImage
./Applye_0.29.2_amd64.AppImage
```

Run the checklist for both, then destroy the instance.

**Route B, free and local: emulated x86_64 in UTM.** UTM does full QEMU emulation as well as
virtualization: **Create a New Virtual Machine → Emulate → Linux**, architecture `x86_64`, with an
Ubuntu desktop ISO. It runs the exact artifact a user downloads, but expect a sluggish desktop.
Fine for "does it install and launch", tedious for clicking through the whole checklist.

**The `.rpm` is the least-verified artifact.** It needs a Fedora or RHEL guest, which is a third VM.
Either spin one up or state plainly in the release notes that the `.rpm` was only built, not tested.
Do not quietly imply it was.

**Route C, the fix rather than the workaround:** add an `aarch64` Linux target to the release matrix.
Then an ARM64 Ubuntu VM tests natively at full speed, and ARM Linux users get a build. A few lines in
the workflow matrix, and the only option here that also improves the product.

### What none of this proves

Be honest about the gap when recording results:

- Emulation says nothing about native x64 performance.
- A VM says nothing about driver-adjacent behaviour or real GPU compositing.
- Testing an unsigned installer verifies the SmartScreen and Gatekeeper detour a real user hits, not
  the experience they would get with certificates.
- The updater is only exercised by installing an older version and letting it update. `latest.json`
  and the `.sig` files being present is not the same as the update path working.

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

Two checks worth adding, because they map to bugs that actually shipped:

- [ ] **The window is styled.** `0.29.0` shipped a macOS bundle that rendered completely unstyled,
      because Angular's `inlineCritical` defers the stylesheet behind an inline handler the CSP
      forbids. `tools/verify-csp-compat.mjs` now fails the build on that class of bug, but the
      cheapest confirmation is still looking at the window.
- [ ] **The frontend is actually in the bundle.** `frontendDist` resolved one directory level short
      for five releases. A blank window rather than an unstyled one is this bug, not the CSP one.

Record the result in the release notes: which platforms were tested on real hardware, which in a
VM, and which only by CI. Never write that a platform was verified when only its build succeeded.
