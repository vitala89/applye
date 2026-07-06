# Error & Notification Toast System — Design

Date: 2026-07-06
Status: Approved, pending implementation plan
Scope: `apps/desktop` (Angular) + `libs/i18n`

## Goal

Replace per-page inline `status` / error signals with a single bottom-right
toast notification system covering four kinds: `error`, `success`, `warning`,
`info`. A global Angular `ErrorHandler` routes uncaught errors to a toast so
nothing is silently swallowed.

## Decisions (locked)

- **Kinds:** full notification center — `error`, `success`, `warning`, `info`.
- **Migration:** retrofit ALL pages that currently show inline status/error
  (~10 pages), remove the dead inline state.
- **Dismiss:** auto-dismiss; `success`/`warning`/`info` ~4s, `error` ~7s.
  `×` close button always present. Hover pauses the timer.
- **Global catch:** register a custom `ErrorHandler` → any uncaught error
  becomes an `error` toast (plus `console.error`).
- **Placement:** `apps/desktop/src/app/core/toast/` — app infrastructure, not a
  `libs/ui` presentational primitive (avoids `libs/ui → libs/i18n` coupling).
  Promote later if the web app needs it (YAGNI now).

## Architecture

Position bottom-right, fixed, single container mounted once at app root.
State lives in a signal-based `ToastService` (`providedIn: 'root'`). Pages and
the global `ErrorHandler` push toasts through the service. The container renders
the current stack reactively.

```
ErrorHandler ─┐
Pages ────────┼─► ToastService.show()/error()/success()/… ─► toasts signal
              ┘                                                     │
                                          <app-toast-container> ◄───┘
                                                     └─► <app-toast> × N
```

### 1. Model — `toast.model.ts`

```ts
export type ToastKind = 'error' | 'success' | 'warning' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string; // resolved text OR raw string
  titleKey?: string; // optional i18n heading key
  createdAt: number;
}

export interface ToastOptions {
  titleKey?: string;
  durationMs?: number; // override default per-kind duration
}
```

### 2. `ToastService` (`providedIn: 'root'`)

- `readonly toasts: Signal<Toast[]>` — exposed read-only.
- `show(kind, message, opts?): number` returns the toast id.
- Sugar: `error()`, `success()`, `warning()`, `info()`.
- **Message resolution:** treat `message` as an i18n key first — call
  `translate.t()(message)`; if `resolve` returns the key unchanged (unresolved),
  use the raw string. This lets `catch (e) { toast.error(String(e)) }` pass raw
  error text through untranslated while `toast.success('settings.saved')` gets
  localized.
- **Timers:** `Map<id, ReturnType<typeof setTimeout>>`. Default durations:
  `error` 7000ms, others 4000ms; `opts.durationMs` overrides.
  `dismiss(id)` clears timer + removes from signal.
  `pause(id)` clears timer; `resume(id)` restarts remaining time
  (track per-toast remaining; simplest acceptable version restarts full
  duration on resume — chosen for v1).
- **Dedupe:** if an existing toast has the same `kind` + `message` and was
  created within ~1000ms, skip inserting a new one (prevents retry-loop spam).
- **Cap:** keep at most 5 toasts; when a 6th arrives, drop the oldest.
- Monotonic `id` counter (module-level or instance field).

### 3. `ToastContainerComponent` — `toast-container.component.ts`

- Selector `app-toast-container`, mounted once in root `app.html`.
- Wrapper: `position: fixed; bottom/right` inset via `--space-*`, high
  `z-index` (define `--z-toast` token or use a high literal consistent with
  existing overlays), `pointer-events: none`. Cards re-enable
  `pointer-events: auto`.
- Stack newest-at-bottom (`flex-direction: column-reverse` or reversed order).
- `@for (t of toast.toasts(); track t.id)` → `<app-toast [toast]="t">`.

### 4. `ToastComponent` — `toast.component.ts`

- Input `toast: Toast`. Presentational.
- Layout: left color bar + kind icon + (optional title) + message + `×` button.
- Icons (lucide-angular, verified export names):
  `error → circle-x`, `success → circle-check`, `warning → triangle-alert`,
  `info → info`.
- A11y: `error` uses `role="alert"` + `aria-live="assertive"`; others
  `role="status"` + `aria-live="polite"`. `×` button has translated
  `aria-label` (`toast.dismiss`).
- Hover: `(mouseenter)` → `toast.pause(id)`, `(mouseleave)` → `toast.resume(id)`.
- Close: `(click)` → `toast.dismiss(id)`.
- Enter/leave animation: CSS slide-in-from-right + fade (no `@angular/animations`
  dependency). Leave handled via a short removal transition or Angular
  `animate.leave` if already used in repo; otherwise instant removal is
  acceptable for v1.

### 5. Global error handler — `toast-error.handler.ts`

- Class implements `ErrorHandler`; `handleError(err)` calls
  `toast.error(String(err?.message ?? err))` and `console.error(err)`.
- Loop guard: swallow/ignore errors thrown from within toast rendering to avoid
  recursive toasting.
- Provided in `app.config.ts`: `{ provide: ErrorHandler, useClass: ToastErrorHandler }`.

### 6. Styling

Token-only, both themes (`libs/ui/tokens.css` already defines all needed):

- Bars/icons: `--danger`, `--success`, `--warning`, and an info accent
  (`--indigo-400`/`--text-accent`).
- Card background: `--surface-2` with a subtle `--*-tint` wash per kind.
- `--radius-*`, `--shadow-*`, `--space-*`, `--text-primary/secondary`.
- New optional token `--z-toast` if a z-index scale exists; else a documented
  high literal.

## Page retrofit

Replace inline `status`/error signals with `ToastService` calls; delete the
dead signals and their template bindings.

Pattern:

```ts
// before
catch (e) { this.status.set(`Save failed: ${String(e)}`); }
// after
catch (e) { this.toast.error(String(e)); }

// success before
this.status.set('Settings saved.');
// after
this.toast.success('settings.saved');
```

Pages in scope (verify each during implementation):
`settings`, `pipeline`, `pipeline/quick-view-modal`, `pipeline/stage-quick-add`,
`tracker`, `profile`, `documents/cv-list`, `documents/cv-detail`,
`documents/cover-letter-detail`, `interview-prep`, `interview-prep/interview-prep-detail`.

`updater.service.ts` and `main.ts` (existing `console.error` sites) —
optionally route to toasts where user-facing; keep console logging.

## i18n

Add `toast.*` keys to BOTH `en` and `de` in
`libs/i18n/src/lib/translations/translations.ts`:

- `toast.dismiss` (aria-label), `toast.saved`, `toast.error_generic`, and any
  per-page success/heading strings introduced by the retrofit (e.g.
  `settings.saved`, `settings.key_stored`, `settings.key_removed`).
- Raw error strings from `catch` blocks pass through untranslated.

DE MUST mirror EN key-for-key — the repo has an `i18n-keys.spec.ts` that fails
on drift.

## Testing

- `toast.service.spec.ts`: show/dismiss; auto-timeout with fake timers
  (per-kind durations); pause/resume; dedupe window; 5-item cap; i18n key vs
  raw literal resolution.
- `toast.component.spec.ts`: renders correct icon/role per kind; message text;
  close click → `dismiss` called; hover → pause/resume; a11y roles/labels.
- `toast-error.handler.spec.ts`: uncaught error → `toast.error` + `console.error`.
- Keep `i18n-keys.spec.ts` green (EN/DE parity for new keys).

## Out of scope (v1)

- Action buttons / undo inside toasts.
- Persistence / notification history panel.
- Web app adoption.
- Per-toast remaining-time precision on resume (v1 restarts full duration).

```

```
