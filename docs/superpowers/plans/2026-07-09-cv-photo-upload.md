# CV Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add, crop (3:4), store, preview, and export (DOCX/PDF) a personal photo on a CV document.

**Architecture:** Photo is stored as a JPEG base64 data URI inside the existing `CvPhotoSection` (in `content_json`) — no DB migration. The frontend picks a file (Tauri dialog), a Rust command returns its bytes as a data URI, an Angular crop modal renders the visible 3:4 region to a canvas and emits a downsized JPEG data URI. The preview renders it via `<img>`. Export decodes the data URI in Rust and embeds it in DOCX (docx-rs) and PDF (printpdf); LaTeX omits it.

**Tech Stack:** Angular (standalone components, signals), Tauri 2, Rust (`docx-rs 0.4`, `printpdf 0.7`, new `base64` + `image` crates), SQLite (JSON text), Jest.

## Global Constraints

- Photo storage: base64 JPEG data URI in `CvPhotoSection.dataUri`; no DB migration; no new filesystem writes beyond user-chosen export path.
- Aspect ratio: fixed portrait **3:4**. Canvas output **360×480 px**, `image/jpeg` quality **0.85**.
- Accepted input formats: `jpg`, `jpeg`, `png`, `webp`.
- New Rust deps allowed (user-approved): `base64`, `image`. No new frontend deps.
- LaTeX (`.tex`) export omits the photo (keep existing no-op, add comment).
- All user-facing strings via `libs/i18n` (EN + DE). No hardcoded strings.
- Shared types in `libs/core`; Tauri invoke wrappers in `libs/data`.
- printpdf is **0.7** and docx-rs is **0.4** — verify image APIs against the installed versions (not newer online docs) before finalizing embed calls.
- Work on branch `feat/cv-photo-upload`. Commit atomically per task; push after each commit.

---

### Task 1: Add `dataUri` to the photo model

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (`CvPhotoSection`, ~L32-35)
- Test: `libs/core/src/lib/models/document.model.spec.ts` (create if absent)

**Interfaces:**

- Produces: `CvPhotoSection` now carries `dataUri?: string` (JPEG data URI). Consumed by the crop modal (Task 3), editor wiring (Task 4), preview (Task 5), and export (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// document.model.spec.ts
import type { CvPhotoSection } from './document.model';

describe('CvPhotoSection', () => {
  it('carries an optional dataUri', () => {
    const s: CvPhotoSection = {
      key: 'photo',
      order: 0,
      visible: true,
      dataUri: 'data:image/jpeg;base64,AAAA',
    };
    expect(s.dataUri).toContain('data:image/jpeg;base64,');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core --testFile=document.model.spec.ts`
Expected: FAIL — `dataUri` not assignable / property does not exist on `CvPhotoSection`.

- [ ] **Step 3: Add the field**

In `document.model.ts`, extend `CvPhotoSection`:

```ts
export interface CvPhotoSection extends CvSectionBase {
  key: 'photo';
  /** Cropped photo as a JPEG data URI: `data:image/jpeg;base64,...`. */
  dataUri?: string;
  /** Legacy/unused; retained for back-compat with older documents. */
  filePath?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core --testFile=document.model.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts libs/core/src/lib/models/document.model.spec.ts
git commit -m "feat(cv): add dataUri to CvPhotoSection model"
git push -u origin feat/cv-photo-upload
```

---

### Task 2: Rust command — read picked image file as a data URI

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (add command near `cv_import_read_file`, ~L170)
- Modify: `apps/desktop/src-tauri/src/lib.rs` (or wherever `tauri::generate_handler!` lists commands) — register the command
- Modify: `libs/data/src/lib/services/db.service.ts` (add wrapper near `cvImportReadFile`, ~L270)
- Modify: `apps/desktop/src-tauri/Cargo.toml` — add `base64` (needed here already)

**Interfaces:**

- Produces (Rust command): `cv_photo_read_file(path: String) -> Result<String, String>` returns `data:image/<fmt>;base64,<...>`.
- Produces (TS): `DbService.cvPhotoReadFile(path: string): Promise<string>`.
- Consumed by editor upload action (Task 4).

- [ ] **Step 1: Add the `base64` dependency**

Run: `cd apps/desktop/src-tauri && cargo add base64@0.22 && cd -`
Expected: `base64 = "0.22"` under `[dependencies]` in `apps/desktop/src-tauri/Cargo.toml`.

- [ ] **Step 2: Write the failing Rust test**

Add to `documents.rs` (bottom `#[cfg(test)] mod tests` — create if absent):

```rust
#[cfg(test)]
mod photo_tests {
    use super::*;

    #[test]
    fn detects_png_mime_and_encodes() {
        // 1x1 transparent PNG
        let png: &[u8] = &[
            0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
            0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
            0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,
            0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,
            0x42,0x60,0x82,
        ];
        let uri = bytes_to_data_uri(png);
        assert!(uri.starts_with("data:image/png;base64,"));
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/desktop/src-tauri && cargo test photo_tests`
Expected: FAIL — `bytes_to_data_uri` not found.

- [ ] **Step 4: Implement the helper + command**

In `documents.rs`:

```rust
use base64::Engine as _;

/// Sniff image MIME from magic bytes; default to octet-stream.
fn image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

fn bytes_to_data_uri(bytes: &[u8]) -> String {
    let mime = image_mime(bytes);
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{b64}")
}

#[tauri::command]
pub fn cv_photo_read_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read photo: {e}"))?;
    // Guard: reject files that are not a supported image type.
    match image_mime(&bytes) {
        "application/octet-stream" => Err("unsupported image format".into()),
        _ => Ok(bytes_to_data_uri(&bytes)),
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/desktop/src-tauri && cargo test photo_tests`
Expected: PASS.

- [ ] **Step 6: Register the command**

In the `tauri::generate_handler![...]` list (search: `cv_import_read_file`), add `commands::documents::cv_photo_read_file` alongside it. Match the existing path/module style used for `cv_import_read_file`.

- [ ] **Step 7: Add the TS wrapper**

In `db.service.ts`, near `cvImportReadFile` (~L270):

```ts
cvPhotoReadFile(path: string): Promise<string> {
  return invoke<string>('cv_photo_read_file', { path });
}
```

- [ ] **Step 8: Build to verify wiring**

Run: `cd apps/desktop/src-tauri && cargo build`
Expected: builds clean.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/commands/documents.rs apps/desktop/src-tauri/src/lib.rs libs/data/src/lib/services/db.service.ts
git commit -m "feat(cv): add cv_photo_read_file command + data wrapper"
git push
```

---

### Task 3: Crop modal component (canvas, 3:4, zoom + reposition)

**Files:**

- Create: `apps/desktop/src/app/documents/cv-detail/cv-photo-crop/cv-photo-crop.component.ts`
- Create: `apps/desktop/src/app/documents/cv-detail/cv-photo-crop/cv-photo-crop.component.html`
- Create: `apps/desktop/src/app/documents/cv-detail/cv-photo-crop/cv-photo-crop.component.scss`
- Test: `apps/desktop/src/app/documents/cv-detail/cv-photo-crop/cv-photo-crop.component.spec.ts`

(Confirm the exact `cv-detail` directory path from the existing `cv-detail.component.ts` location before creating the folder; place the new folder as a sibling.)

**Interfaces:**

- Consumes: `sourceDataUri: InputSignal<string>` (from `cv_photo_read_file`).
- Produces: `confirmed: OutputEmitterRef<string>` (360×480 JPEG data URI), `cancelled: OutputEmitterRef<void>`.
- Constants: `TARGET_W = 360`, `TARGET_H = 480`, `ASPECT = 3 / 4`.

- [ ] **Step 1: Write the failing test**

```ts
// cv-photo-crop.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { CvPhotoCropComponent } from './cv-photo-crop.component';

describe('CvPhotoCropComponent', () => {
  it('exposes 3:4 target dimensions', () => {
    const fixture = TestBed.createComponent(CvPhotoCropComponent);
    const c = fixture.componentInstance;
    expect(c.TARGET_W / c.TARGET_H).toBeCloseTo(3 / 4, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-photo-crop.component.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`cv-photo-crop.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco'; // match the i18n module used elsewhere in cv-detail

@Component({
  selector: 'app-cv-photo-crop',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './cv-photo-crop.component.html',
  styleUrl: './cv-photo-crop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPhotoCropComponent {
  readonly TARGET_W = 360;
  readonly TARGET_H = 480;

  /** Source image as a data URI (any supported format). */
  readonly sourceDataUri = input.required<string>();

  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly zoom = signal(1); // 1..3
  private readonly offsetX = signal(0);
  private readonly offsetY = signal(0);
  private readonly img = signal<HTMLImageElement | null>(null);
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor() {
    // Load the source image whenever the input changes.
    effect(() => {
      const src = this.sourceDataUri();
      const image = new Image();
      image.onload = () => {
        this.img.set(image);
        this.zoom.set(1);
        this.offsetX.set(0);
        this.offsetY.set(0);
        this.draw();
      };
      image.src = src;
    });
  }

  onZoom(value: number) {
    this.zoom.set(value);
    this.draw();
  }

  onPointerDown(ev: PointerEvent) {
    this.dragging = true;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.dragging) return;
    this.offsetX.update((x) => x + (ev.clientX - this.lastX));
    this.offsetY.update((y) => y + (ev.clientY - this.lastY));
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.draw();
  }

  onPointerUp() {
    this.dragging = false;
  }

  /** Draw the source into the fixed 3:4 canvas at current zoom/offset (cover). */
  private draw() {
    const canvas = this.canvasRef().nativeElement;
    canvas.width = this.TARGET_W;
    canvas.height = this.TARGET_H;
    const ctx = canvas.getContext('2d');
    const image = this.img();
    if (!ctx || !image) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // base scale = cover the target, then apply user zoom
    const base = Math.max(canvas.width / image.width, canvas.height / image.height);
    const scale = base * this.zoom();
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    // center + user offset
    const dx = (canvas.width - drawW) / 2 + this.offsetX();
    const dy = (canvas.height - drawH) / 2 + this.offsetY();
    ctx.drawImage(image, dx, dy, drawW, drawH);
  }

  confirm() {
    const canvas = this.canvasRef().nativeElement;
    this.confirmed.emit(canvas.toDataURL('image/jpeg', 0.85));
  }

  cancel() {
    this.cancelled.emit();
  }
}
```

`cv-photo-crop.component.html`:

```html
<div class="crop-backdrop" (click)="cancel()">
  <div class="crop-dialog" (click)="$event.stopPropagation()">
    <h3>{{ 'documents.cv_photo_crop_title' | transloco }}</h3>
    <div
      class="crop-stage"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointercancel)="onPointerUp()"
    >
      <canvas #canvas class="crop-canvas"></canvas>
    </div>
    <label class="crop-zoom">
      {{ 'documents.cv_photo_crop_zoom' | transloco }}
      <input
        type="range"
        min="1"
        max="3"
        step="0.01"
        [value]="zoom()"
        (input)="onZoom(+$any($event.target).value)"
      />
    </label>
    <div class="crop-actions">
      <button type="button" (click)="cancel()">
        {{ 'documents.cv_photo_crop_cancel' | transloco }}
      </button>
      <button type="button" class="primary" (click)="confirm()">
        {{ 'documents.cv_photo_crop_confirm' | transloco }}
      </button>
    </div>
  </div>
</div>
```

`cv-photo-crop.component.scss` (minimal; align tokens with existing cv-detail styles):

```scss
.crop-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.crop-dialog {
  background: var(--surface, #fff);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.crop-stage {
  width: 270px;
  height: 360px; /* 3:4 */
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
}
.crop-canvas {
  width: 270px;
  height: 360px;
}
.crop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=cv-photo-crop.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/documents/cv-detail/cv-photo-crop/
git commit -m "feat(cv): add photo crop modal component (3:4 canvas)"
git push
```

---

### Task 4: Wire the editor photo section (upload / replace / remove)

**Files:**

- Modify: `apps/desktop/src/app/documents/cv-detail/cv-detail.component.ts` (photo state ~L136, save ~L550, add handlers)
- Modify: `apps/desktop/src/app/documents/cv-detail/cv-detail.component.html` (editor `@case('photo')`, ~L571)
- Test: `apps/desktop/src/app/documents/cv-detail/cv-detail.component.spec.ts` (add cases)

**Interfaces:**

- Consumes: `DbService.cvPhotoReadFile` (Task 2), `CvPhotoCropComponent` (Task 3), `CvPhotoSection.dataUri` (Task 1).
- Produces: `photoDataUri()` signal readable by the preview (Task 5). Persisted into the photo section on save.

- [ ] **Step 1: Write the failing test**

```ts
// in cv-detail.component.spec.ts
it('removePhoto clears the stored dataUri', () => {
  const fixture = TestBed.createComponent(CvDetailComponent);
  const c = fixture.componentInstance;
  c.photoDataUri.set('data:image/jpeg;base64,AAAA');
  c.removePhoto();
  expect(c.photoDataUri()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: FAIL — `photoDataUri` / `removePhoto` undefined.

- [ ] **Step 3: Add state + handlers**

In `cv-detail.component.ts`, near `includePhoto` (~L136):

```ts
readonly photoDataUri = signal<string | null>(null);
readonly cropSourceUri = signal<string | null>(null); // non-null => crop modal open
```

Add the crop component to the component's `imports` array (`CvPhotoCropComponent`) and inject `DbService` if not already present.

On load, seed `photoDataUri` from the photo section (next to where `includePhoto` is seeded, ~L298):

```ts
const photo = sections.find((s) => s.key === 'photo') as CvPhotoSection | undefined;
this.photoDataUri.set(photo?.dataUri ?? null);
```

Add handlers:

```ts
async pickPhoto(): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  if (typeof selected !== 'string') return;
  const dataUri = await this.db.cvPhotoReadFile(selected);
  this.cropSourceUri.set(dataUri); // opens the crop modal
}

onCropConfirmed(dataUri: string): void {
  this.photoDataUri.set(dataUri);
  this.cropSourceUri.set(null);
}

onCropCancelled(): void {
  this.cropSourceUri.set(null);
}

removePhoto(): void {
  this.photoDataUri.set(null);
}
```

On save, write `dataUri` into the photo section (next to where `visible` is written, ~L550):

```ts
if (section.key === 'photo') {
  (section as CvPhotoSection).dataUri = this.photoDataUri() ?? undefined;
  section.visible = this.includePhoto();
}
```

- [ ] **Step 4: Replace the editor `@case('photo')` stub in the HTML (~L571)**

```html
@case ('photo') {
<div class="cv-photo-editor">
  @if (photoDataUri()) {
  <img class="cv-photo-thumb" [src]="photoDataUri()" alt="" />
  <div class="cv-photo-actions">
    <button type="button" (click)="pickPhoto()">
      {{ 'documents.cv_photo_replace' | transloco }}
    </button>
    <button type="button" (click)="removePhoto()">
      {{ 'documents.cv_photo_remove' | transloco }}
    </button>
  </div>
  } @else {
  <button type="button" (click)="pickPhoto()">{{ 'documents.cv_photo_upload' | transloco }}</button>
  <p class="hint">{{ 'documents.cv_photo_hint' | transloco }}</p>
  }
</div>
}
```

At the end of the component template (top level), mount the crop modal:

```html
@if (cropSourceUri(); as src) {
<app-cv-photo-crop
  [sourceDataUri]="src"
  (confirmed)="onCropConfirmed($event)"
  (cancelled)="onCropCancelled()"
/>
}
```

- [ ] **Step 5: Run tests + build**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS.
Run: `npm run desktop:build`
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/documents/cv-detail/cv-detail.component.spec.ts
git commit -m "feat(cv): wire photo upload/crop/remove into CV editor"
git push
```

---

### Task 5: Render the photo in the preview

**Files:**

- Modify: `apps/desktop/src/app/documents/cv-detail/cv-detail.component.html` (preview `@for`, add `@case('photo')` ~L645-666)
- Modify: `apps/desktop/src/app/documents/cv-detail/cv-detail.component.scss` (photo slot styles)

**Interfaces:**

- Consumes: `photoDataUri()` (Task 4), `includePhoto()` (existing).

- [ ] **Step 1: Add the preview case**

In the preview `@switch`/`@for` over `previewSections()`, add:

```html
@case ('photo') { @if (includePhoto() && photoDataUri()) {
<div class="cv-preview-photo">
  <img [src]="photoDataUri()" alt="" />
</div>
} }
```

- [ ] **Step 2: Add styles (scss)**

```scss
.cv-preview-photo {
  float: right;
  width: 90px; /* 3:4 slot */
  height: 120px;
  margin: 0 0 8px 12px;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }
}
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run desktop:dev` (or use the preview tooling). Upload a photo, crop, confirm; toggle "Include photo" off/on.
Expected: photo appears top-right of Personal Details when the toggle is on and hides (bytes retained) when off.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/documents/cv-detail/cv-detail.component.scss
git commit -m "feat(cv): render CV photo in preview"
git push
```

---

### Task 6: i18n keys (EN + DE)

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Produces keys used by Tasks 3–5: `documents.cv_photo_upload`, `documents.cv_photo_replace`, `documents.cv_photo_remove`, `documents.cv_photo_crop_title`, `documents.cv_photo_crop_zoom`, `documents.cv_photo_crop_confirm`, `documents.cv_photo_crop_cancel`. (`documents.cv_photo_hint` already exists.)

- [ ] **Step 1: Add EN keys**

In the English `documents` block:

```ts
cv_photo_upload: 'Upload photo',
cv_photo_replace: 'Replace photo',
cv_photo_remove: 'Remove photo',
cv_photo_crop_title: 'Crop photo',
cv_photo_crop_zoom: 'Zoom',
cv_photo_crop_confirm: 'Use photo',
cv_photo_crop_cancel: 'Cancel',
```

- [ ] **Step 2: Add DE keys**

In the German `documents` block:

```ts
cv_photo_upload: 'Foto hochladen',
cv_photo_replace: 'Foto ersetzen',
cv_photo_remove: 'Foto entfernen',
cv_photo_crop_title: 'Foto zuschneiden',
cv_photo_crop_zoom: 'Zoom',
cv_photo_crop_confirm: 'Foto verwenden',
cv_photo_crop_cancel: 'Abbrechen',
```

- [ ] **Step 3: Verify i18n integrity**

Run: `npx nx lint i18n` (and `npm run desktop:build`)
Expected: no missing-key or parity errors.

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(cv): add CV photo i18n keys (EN+DE)"
git push
```

---

### Task 7: Embed the photo in DOCX + PDF export

**Files:**

- Modify: `apps/desktop/src-tauri/Cargo.toml` — add `image`; enable printpdf image feature if required by 0.7
- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`md_to_docx_bytes` L238, `md_to_pdf_bytes` L306)
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (`cv_document_export_bytes_core` ~L771; `cv_content_to_tex` comment ~L556)

**Interfaces:**

- Consumes: `base64` (Task 2), `CvPhotoSection.dataUri` (from `content_json`).
- Produces: `md_to_docx_bytes(content_md: &str, photo: Option<&[u8]>)`, `md_to_pdf_bytes(content_md: &str, photo: Option<&[u8]>)`. All existing callers (`export_docx`, `export_pdf`) pass `None`.

- [ ] **Step 1: Add the `image` dependency**

Run: `cd apps/desktop/src-tauri && cargo add image@0.25 --no-default-features --features jpeg,png && cd -`
Then check printpdf 0.7 image support: `cargo doc -p printpdf --no-deps` (or read `~/.cargo` source) to confirm whether image embedding needs a printpdf feature flag (e.g. `features = ["embedded_images"]`) and the exact type (`Image`, `ImageXObject`, `ImageTransform`). Update `Cargo.toml` accordingly.
Expected: `image` present; printpdf image support confirmed. **Do not assume the online 0.8 API — this repo uses 0.7.**

- [ ] **Step 2: Add a helper to decode a data URI to bytes (documents.rs)**

```rust
/// Strip a `data:...;base64,` prefix and decode to raw bytes.
fn data_uri_to_bytes(uri: &str) -> Option<Vec<u8>> {
    let comma = uri.find(',')?;
    let b64 = &uri[comma + 1..];
    base64::engine::general_purpose::STANDARD.decode(b64).ok()
}
```

- [ ] **Step 3: Write the failing test for data-URI decode**

Add to the `photo_tests` module in `documents.rs`:

```rust
#[test]
fn decodes_data_uri_to_bytes() {
    let uri = "data:image/png;base64,AAAA";
    let bytes = data_uri_to_bytes(uri).unwrap();
    assert_eq!(bytes, vec![0, 0, 0]);
}
```

Run: `cd apps/desktop/src-tauri && cargo test photo_tests`
Expected: FAIL (before implementing Step 2 code) → PASS after Step 2 is in place.

- [ ] **Step 4: Change the DOCX renderer signature + embed (verify docx-rs 0.4 API)**

Update `md_to_docx_bytes` to accept `photo: Option<&[u8]>`. Insert the image as the first paragraph when present. docx-rs 0.4 wraps raw bytes in `Image(Vec<u8>)` and embeds via a `Pic`/`Drawing` on a `Run` — **confirm the exact 0.4 constructor** (`Pic::new(Image(bytes))` then `.size(w_emu, h_emu)`, added via `Run::new().add_image(pic)` or `Run::add_drawing`). Sizing: 3:4 at ~2.7 cm × 3.6 cm → `w=972000` EMU, `h=1296000` EMU (914400 EMU per inch; 1 inch ≈ 2.54 cm).

```rust
pub(crate) fn md_to_docx_bytes(content_md: &str, photo: Option<&[u8]>) -> Result<Vec<u8>, String> {
    use docx_rs::*;
    let mut doc = Docx::new();
    if let Some(bytes) = photo {
        // VERIFY against docx-rs 0.4: exact Pic/Drawing/add_image API.
        let pic = Pic::new(&Image(bytes.to_vec())).size(972_000, 1_296_000);
        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_image(pic)));
    }
    // ... existing line loop unchanged ...
    // ... existing pack/return unchanged ...
}
```

Update callers `export_docx` (L289) → `md_to_docx_bytes(&content_md, None)`.

- [ ] **Step 5: Change the PDF renderer signature + embed (verify printpdf 0.7 API)**

Update `md_to_pdf_bytes` to accept `photo: Option<&[u8]>`. Decode with the `image` crate, embed via printpdf 0.7's `Image`/`ImageXObject` + `add_to_layer` with an `ImageTransform` positioning it top-right, and start text below it. **Confirm the exact 0.7 types/method names** (`Image::try_from`, `ImageTransform { translate_x, translate_y, scale_x, scale_y, dpi, .. }`).

```rust
pub(crate) fn md_to_pdf_bytes(content_md: &str, photo: Option<&[u8]>) -> Result<Vec<u8>, String> {
    use printpdf::*;
    let (doc, page1, layer1) = PdfDocument::new("Tailored CV", Mm(210.0), Mm(297.0), "Layer 1");
    // ... existing font setup ...
    if let Some(bytes) = photo {
        let dynimg = image::load_from_memory(bytes).map_err(|e| format!("decode photo: {e}"))?;
        // VERIFY printpdf 0.7: construct Image from `dynimg` (feature-gated) and add_to_layer.
        let layer = doc.get_page(page1).get_layer(layer1);
        let img = Image::from_dynamic_image(&dynimg); // confirm exact constructor for 0.7
        img.add_to_layer(layer, ImageTransform {
            translate_x: Some(Mm(158.0)),
            translate_y: Some(Mm(250.0)),
            scale_x: Some(0.5),
            scale_y: Some(0.5),
            dpi: Some(300.0),
            ..Default::default()
        });
    }
    // ... existing line loop + save unchanged ...
}
```

Update caller `export_pdf` → `md_to_pdf_bytes(&content_md, None)`.

- [ ] **Step 6: Thread the photo through `cv_document_export_bytes_core` (documents.rs ~L771)**

After loading `content_json`, extract the photo bytes and pass to the renderers:

```rust
let photo_bytes: Option<Vec<u8>> = serde_json::from_str::<serde_json::Value>(&content_json)
    .ok()
    .and_then(|v| v.get("sections").and_then(|s| s.as_array()).map(|a| a.to_vec()))
    .and_then(|sections| {
        sections.into_iter().find(|s| s.get("key").and_then(|k| k.as_str()) == Some("photo"))
    })
    .filter(|photo| photo.get("visible").and_then(|b| b.as_bool()).unwrap_or(false))
    .and_then(|photo| photo.get("dataUri").and_then(|d| d.as_str()).map(String::from))
    .and_then(|uri| data_uri_to_bytes(&uri));

let bytes = match format {
    "docx" => md_to_docx_bytes(&cv_content_to_markdown(&content_json), photo_bytes.as_deref())?,
    "pdf"  => md_to_pdf_bytes(&cv_content_to_markdown(&content_json), photo_bytes.as_deref())?,
    "tex"  => cv_content_to_tex(&content_json).into_bytes(), // photo intentionally omitted
    other  => return Err(format!("unknown export format: {other}")),
};
```

- [ ] **Step 7: Add the LaTeX no-op comment (documents.rs ~L555)**

At the photo catch-all in `cv_content_to_tex`, add:

```rust
// "photo" is intentionally omitted from .tex export: the app never compiles
// the .tex, and there is no companion-asset mechanism for \includegraphics.
```

- [ ] **Step 8: Build + test**

Run: `cd apps/desktop/src-tauri && cargo build && cargo test photo_tests`
Expected: builds clean; tests pass. Resolve any 0.4/0.7 API mismatches flagged in Steps 4–5 against the compiler.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/commands/tailoring.rs apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "feat(cv): embed CV photo in DOCX and PDF export"
git push
```

---

### Task 8: End-to-end verification + docs sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`
- Modify: `docs/product/feature-briefs/documents-cv-cover-letter.md`
- Modify: `CHANGELOG.md` ([Unreleased])

- [ ] **Step 1: Full checks**

Run:

```bash
npm run desktop:build
npm run type-check
npx nx affected:test --base=main
npm run lint
```

Expected: all pass (or only pre-existing unrelated lint issues noted in prior sessions).

- [ ] **Step 2: Manual export smoke test**

In `npm run desktop:dev`: create/open a CV, upload + crop a photo, enable "Include photo", export **DOCX** and **PDF**, open both.
Expected: photo renders in both. Confirm the `.tex` export omits it without error.

- [ ] **Step 3: Update docs**

- `CHANGELOG.md` [Unreleased] → Added: "CV photo upload — pick, crop to 3:4, preview, and embed in DOCX/PDF export (LaTeX omits photo)."
- `docs/product/CURRENT_STATE.md` → move CV photo from "next" to "recently completed"; update Last updated.
- `documents-cv-cover-letter.md` → note the photo capability.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md docs/product/feature-briefs/documents-cv-cover-letter.md
git commit -m "docs(cv): record CV photo upload feature"
git push
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(cv): CV photo upload (crop, preview, DOCX/PDF export)" \
  --body "Implements the CV photo upload spec (docs/superpowers/specs/2026-07-09-cv-photo-upload-design.md). Photo stored as base64 JPEG data URI in CvPhotoSection; 3:4 crop; preview render; DOCX+PDF embedding; LaTeX omits. New Rust deps: base64, image (user-approved).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Then run the privacy review (`aif-privacy-review`) before merge, per the spec's privacy notes.

---

## Self-Review

- **Spec coverage:** model (T1), storage/read command (T2), crop UX 3:4 (T3), editor wiring incl. remove/replace + includePhoto reuse (T4), preview render (T5), i18n EN+DE (T6), DOCX+PDF embed + LaTeX skip + deps (T7), verification + privacy review + docs (T8). All spec sections mapped.
- **Placeholders:** the only deliberate "verify" steps are the docx-rs 0.4 / printpdf 0.7 image APIs — flagged in the spec as version-risk; each has a concrete candidate call + a compiler-verification step, not a blank TODO.
- **Type consistency:** `photoDataUri` (signal), `cvPhotoReadFile` (TS) ↔ `cv_photo_read_file` (Rust), `data_uri_to_bytes`/`bytes_to_data_uri`/`image_mime` (Rust), `md_to_docx_bytes(_, Option<&[u8]>)` / `md_to_pdf_bytes(_, Option<&[u8]>)` consistent across tasks.
