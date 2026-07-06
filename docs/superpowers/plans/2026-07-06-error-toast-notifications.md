# Error & Notification Toast System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-right toast notification system (error/success/warning/info) for `apps/desktop`, route uncaught errors to it via a global `ErrorHandler`, and migrate per-page inline status/error feedback to it.

**Architecture:** A root-provided signal-based `ToastService` holds the toast stack. A single `<app-toast-container>` mounted at the app root renders it; each toast is an `<app-toast>` item component. A custom `ErrorHandler` forwards uncaught errors to `ToastService.error()`. Pages call the service directly. Three contextual pages (pipeline / profile / quick-view-modal) keep their inline UI AND also fire a toast.

**Tech Stack:** Angular 20 (standalone, signals), TypeScript, lucide-angular icons, `@applye/i18n` `TranslateService`, Jest + `@angular/core/testing` TestBed.

## Global Constraints

- Feature lives in `apps/desktop/src/app/core/toast/`. Do NOT touch `libs/ui` or `libs/web`.
- Angular standalone components only; signals for state; `inject()` for DI (match repo style, e.g. `theme.service.ts`).
- Icons via lucide-angular: import PascalCase symbols from `'lucide-angular'`, register in a `protected readonly icons = { … }` map, render `<lucide-icon [img]="icons.x" [size]="18" aria-hidden="true" />`, add `LucideAngularModule` to `imports`.
- Every user-facing string uses `TranslateService`. Any `t()('namespace.key')` literal in a `.ts`/`.html` file MUST exist in `TRANSLATIONS.en` or `apps/desktop/src/i18n-keys.spec.ts` fails. Add every new key to BOTH `en` and `de` in `libs/i18n/src/lib/translations/translations.ts`.
- Styling is token-only from `libs/ui/tokens.css` (`--danger`, `--success`, `--warning`, `--*-tint`, `--surface-2`, `--text-primary/secondary`, `--radius-*`, `--shadow-*`, `--space-*`, `--indigo-400`). No hard-coded colors.
- Test command (single project): `npx nx test desktop`. Single file: `npx nx test desktop --testFile=<path>` (or `-- --testPathPattern=<pattern>`). i18n lib: `npx nx test i18n`.
- Commit after every task with a Conventional Commit message. Do not push.

---

## File Structure

- Create `apps/desktop/src/app/core/toast/toast.model.ts` — types.
- Create `apps/desktop/src/app/core/toast/toast.service.ts` — state + API.
- Create `apps/desktop/src/app/core/toast/toast.service.spec.ts`.
- Create `apps/desktop/src/app/core/toast/toast.component.ts` — single item.
- Create `apps/desktop/src/app/core/toast/toast.component.spec.ts`.
- Create `apps/desktop/src/app/core/toast/toast-container.component.ts` — stack + fixed positioning.
- Create `apps/desktop/src/app/core/toast/toast-error.handler.ts` — global ErrorHandler.
- Create `apps/desktop/src/app/core/toast/toast-error.handler.spec.ts`.
- Modify `apps/desktop/src/app/app.ts` — mount container.
- Modify `apps/desktop/src/app/app.config.ts` — provide ErrorHandler.
- Modify `libs/i18n/src/lib/translations/translations.ts` — new keys (en + de).
- Modify the 11 page components listed in Tasks 6–10.

---

### Task 1: Toast model + service

**Files:**

- Create: `apps/desktop/src/app/core/toast/toast.model.ts`
- Create: `apps/desktop/src/app/core/toast/toast.service.ts`
- Test: `apps/desktop/src/app/core/toast/toast.service.spec.ts`

**Interfaces:**

- Produces: `ToastKind = 'error'|'success'|'warning'|'info'`; `Toast { id:number; kind:ToastKind; message:string; titleKey?:string; createdAt:number }`; `ToastOptions { titleKey?:string; durationMs?:number }`.
- Produces `ToastService` (`providedIn:'root'`): `readonly toasts: Signal<Toast[]>`; `show(kind:ToastKind, message:string, opts?:ToastOptions):number`; `error/success/warning/info(message:string, opts?:ToastOptions):number`; `dismiss(id:number):void`; `pause(id:number):void`; `resume(id:number):void`.
- Consumes: `TranslateService` from `@applye/i18n`.

Behavior contract:

- Default durations: `error` 7000ms, others 4000ms; `opts.durationMs` overrides.
- Message resolution: store `translate.t()(message)` — `resolve()` returns the raw string unchanged for unknown keys, so raw error strings pass through and known keys localize.
- Dedupe: if a live toast has identical `kind` + resolved `message` created within 1000ms of the new one, return that existing id and do NOT add a duplicate.
- Cap: keep at most 5; when a 6th is added, drop the oldest (front of array).
- `pause(id)` clears the toast's timer; `resume(id)` restarts a full-duration timer (v1 simplification — no remaining-time precision).
- `dismiss` clears the timer and removes the toast.

- [ ] **Step 1: Write the model file**

`apps/desktop/src/app/core/toast/toast.model.ts`:

```ts
export type ToastKind = 'error' | 'success' | 'warning' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  titleKey?: string;
  createdAt: number;
}

export interface ToastOptions {
  titleKey?: string;
  durationMs?: number;
}

export const TOAST_DURATIONS: Record<ToastKind, number> = {
  error: 7000,
  success: 4000,
  warning: 4000,
  info: 4000,
};

export const TOAST_MAX = 5;
export const TOAST_DEDUPE_MS = 1000;
```

- [ ] **Step 2: Write the failing service test**

`apps/desktop/src/app/core/toast/toast.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let svc: ToastService;

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ providers: [ToastService, TranslateService] });
    svc = TestBed.inject(ToastService);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('adds a toast and returns an id', () => {
    const id = svc.error('boom');
    expect(svc.toasts().length).toBe(1);
    expect(svc.toasts()[0]).toMatchObject({ id, kind: 'error', message: 'boom' });
  });

  it('passes an unknown key through as a raw string', () => {
    svc.error('TypeError: x is undefined');
    expect(svc.toasts()[0].message).toBe('TypeError: x is undefined');
  });

  it('resolves a known i18n key', () => {
    svc.success('nav.settings');
    expect(svc.toasts()[0].message).toBe('Settings');
  });

  it('auto-dismisses info after 4s and error after 7s', () => {
    svc.info('a');
    svc.error('b');
    jest.advanceTimersByTime(4000);
    expect(svc.toasts().map((t) => t.message)).toEqual(['b']);
    jest.advanceTimersByTime(3000);
    expect(svc.toasts().length).toBe(0);
  });

  it('pause stops the timer; resume restarts it', () => {
    const id = svc.info('a');
    jest.advanceTimersByTime(3000);
    svc.pause(id);
    jest.advanceTimersByTime(10000);
    expect(svc.toasts().length).toBe(1);
    svc.resume(id);
    jest.advanceTimersByTime(4000);
    expect(svc.toasts().length).toBe(0);
  });

  it('dedupes identical kind+message within 1s', () => {
    const a = svc.error('same');
    const b = svc.error('same');
    expect(a).toBe(b);
    expect(svc.toasts().length).toBe(1);
  });

  it('caps at 5 toasts, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) svc.info(`m${i}`);
    const msgs = svc.toasts().map((t) => t.message);
    expect(msgs.length).toBe(5);
    expect(msgs).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('dismiss removes a toast by id', () => {
    const id = svc.info('a');
    svc.dismiss(id);
    expect(svc.toasts().length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast.service.spec.ts`
Expected: FAIL — cannot find `./toast.service`.

- [ ] **Step 4: Write the service**

`apps/desktop/src/app/core/toast/toast.service.ts`:

```ts
import { Injectable, Signal, inject, signal } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import {
  Toast,
  ToastKind,
  ToastOptions,
  TOAST_DEDUPE_MS,
  TOAST_DURATIONS,
  TOAST_MAX,
} from './toast.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly translate = inject(TranslateService);
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts: Signal<Toast[]> = this._toasts.asReadonly();

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(kind: ToastKind, message: string, opts?: ToastOptions): number {
    const text = this.translate.t()(message);
    const now = Date.now();

    const dup = this._toasts().find(
      (t) => t.kind === kind && t.message === text && now - t.createdAt < TOAST_DEDUPE_MS,
    );
    if (dup) return dup.id;

    const id = this.nextId++;
    const toast: Toast = { id, kind, message: text, titleKey: opts?.titleKey, createdAt: now };

    this._toasts.update((list) => {
      const next = [...list, toast];
      return next.length > TOAST_MAX ? next.slice(next.length - TOAST_MAX) : next;
    });

    this.arm(id, kind, opts?.durationMs);
    return id;
  }

  error(message: string, opts?: ToastOptions): number {
    return this.show('error', message, opts);
  }
  success(message: string, opts?: ToastOptions): number {
    return this.show('success', message, opts);
  }
  warning(message: string, opts?: ToastOptions): number {
    return this.show('warning', message, opts);
  }
  info(message: string, opts?: ToastOptions): number {
    return this.show('info', message, opts);
  }

  dismiss(id: number): void {
    this.clear(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  pause(id: number): void {
    this.clear(id);
  }

  resume(id: number): void {
    const t = this._toasts().find((x) => x.id === id);
    if (t) this.arm(id, t.kind);
  }

  private arm(id: number, kind: ToastKind, durationMs?: number): void {
    this.clear(id);
    const ms = durationMs ?? TOAST_DURATIONS[kind];
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), ms),
    );
  }

  private clear(id: number): void {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast.service.spec.ts`
Expected: PASS (all cases).

Note: if `nav.settings`/`nav.settings` resolves to something other than `'Settings'` in the current translations, adjust the assertion in the "resolves a known i18n key" test to the actual EN value of any stable existing key — the point is that a KNOWN key localizes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/core/toast/toast.model.ts apps/desktop/src/app/core/toast/toast.service.ts apps/desktop/src/app/core/toast/toast.service.spec.ts
git commit -m "feat(toast): add ToastService with dedupe, cap, and pause/resume timers"
```

---

### Task 2: Toast item component

**Files:**

- Create: `apps/desktop/src/app/core/toast/toast.component.ts`
- Test: `apps/desktop/src/app/core/toast/toast.component.spec.ts`

**Interfaces:**

- Consumes: `Toast` (Task 1), `ToastService` (Task 1) for `dismiss/pause/resume`.
- Produces: `ToastComponent` — selector `app-toast`, required input `toast: Toast`.

- [ ] **Step 1: Write the failing test**

`apps/desktop/src/app/core/toast/toast.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { Toast } from './toast.model';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

function make(kind: Toast['kind']): Toast {
  return { id: 1, kind, message: 'hello', createdAt: 0 };
}

describe('ToastComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService, TranslateService],
    }).compileComponents();
  });

  it('renders the message and role=alert for errors', () => {
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('error'));
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('hello');
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('uses role=status for non-error kinds', () => {
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('success'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="status"]')).toBeTruthy();
  });

  it('dismisses on close click', () => {
    const svc = TestBed.inject(ToastService);
    const spy = jest.spyOn(svc, 'dismiss');
    const f = TestBed.createComponent(ToastComponent);
    f.componentRef.setInput('toast', make('info'));
    f.detectChanges();
    f.nativeElement.querySelector('button.toast__close').click();
    expect(spy).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast.component.spec.ts`
Expected: FAIL — cannot find `./toast.component`.

- [ ] **Step 3: Write the component**

`apps/desktop/src/app/core/toast/toast.component.ts`:

```ts
import { Component, computed, inject, input } from '@angular/core';
import { LucideAngularModule, CircleX, CircleCheck, TriangleAlert, Info, X } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { Toast, ToastKind } from './toast.model';
import { ToastService } from './toast.service';

const KIND_ICON = {
  error: CircleX,
  success: CircleCheck,
  warning: TriangleAlert,
  info: Info,
} as const;

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      class="toast toast--{{ toast().kind }}"
      [attr.role]="isError() ? 'alert' : 'status'"
      [attr.aria-live]="isError() ? 'assertive' : 'polite'"
      (mouseenter)="svc.pause(toast().id)"
      (mouseleave)="svc.resume(toast().id)"
    >
      <span class="toast__bar" aria-hidden="true"></span>
      <lucide-icon [img]="icon()" [size]="18" class="toast__icon" aria-hidden="true" />
      @if (toast().titleKey) {
        <div class="toast__body">
          <strong class="toast__title">{{ t()(toast().titleKey!) }}</strong>
          <span class="toast__msg">{{ toast().message }}</span>
        </div>
      } @else {
        <span class="toast__msg">{{ toast().message }}</span>
      }
      <button
        type="button"
        class="toast__close"
        [attr.aria-label]="t()('toast.dismiss')"
        (click)="svc.dismiss(toast().id)"
      >
        <lucide-icon [img]="closeIcon" [size]="16" aria-hidden="true" />
      </button>
    </div>
  `,
  styles: [
    `
      .toast {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 0.625rem;
        min-width: 18rem;
        max-width: 24rem;
        padding: 0.75rem 0.875rem 0.75rem 1rem;
        border-radius: var(--radius-md, 10px);
        background: var(--surface-2, #1e1e24);
        color: var(--text-primary, #f2f2f4);
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.4));
        overflow: hidden;
        pointer-events: auto;
        animation: toast-in 160ms ease-out;
      }
      .toast__bar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
      }
      .toast--error {
        background: linear-gradient(var(--danger-tint), var(--danger-tint)), var(--surface-2);
      }
      .toast--error .toast__bar {
        background: var(--danger);
      }
      .toast--error .toast__icon {
        color: var(--danger);
      }
      .toast--success .toast__bar {
        background: var(--success);
      }
      .toast--success .toast__icon {
        color: var(--success);
      }
      .toast--warning .toast__bar {
        background: var(--warning);
      }
      .toast--warning .toast__icon {
        color: var(--warning);
      }
      .toast--info .toast__bar {
        background: var(--indigo-400, #818cf8);
      }
      .toast--info .toast__icon {
        color: var(--indigo-400, #818cf8);
      }
      .toast__body {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .toast__title {
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .toast__msg {
        font-size: 0.8125rem;
        line-height: 1.35;
        color: var(--text-secondary, #b6b6bd);
        word-break: break-word;
      }
      .toast__close {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.125rem;
        background: transparent;
        border: 0;
        border-radius: var(--radius-sm, 6px);
        color: var(--text-tertiary, #8a8a92);
        cursor: pointer;
      }
      .toast__close:hover {
        color: var(--text-primary, #f2f2f4);
        background: var(--surface-hover, #26262d);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateX(12px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class ToastComponent {
  protected readonly svc = inject(ToastService);
  protected readonly t = inject(TranslateService).t;
  readonly toast = input.required<Toast>();

  protected readonly closeIcon = X;
  protected readonly isError = computed(() => this.toast().kind === 'error');
  protected readonly icon = computed(() => KIND_ICON[this.toast().kind as ToastKind]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast.component.spec.ts`
Expected: PASS. (This will fail on the missing `toast.dismiss` key until Task 5; if red only because of the key, proceed to Task 5 then re-run. Prefer doing Task 5 before running this if convenient.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/core/toast/toast.component.ts apps/desktop/src/app/core/toast/toast.component.spec.ts
git commit -m "feat(toast): add toast item component with per-kind icon, colors, and a11y roles"
```

---

### Task 3: Toast container + mount at app root

**Files:**

- Create: `apps/desktop/src/app/core/toast/toast-container.component.ts`
- Modify: `apps/desktop/src/app/app.ts`

**Interfaces:**

- Consumes: `ToastService.toasts` (Task 1), `ToastComponent` (Task 2).
- Produces: `ToastContainerComponent` — selector `app-toast-container`.

- [ ] **Step 1: Write the container**

`apps/desktop/src/app/core/toast/toast-container.component.ts`:

```ts
import { Component, inject } from '@angular/core';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [ToastComponent],
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <app-toast [toast]="t" />
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
        max-width: calc(100vw - 2rem);
      }
    `,
  ],
})
export class ToastContainerComponent {
  protected readonly toast = inject(ToastService);
}
```

Note: newest-at-bottom is the natural array order with `bottom` anchoring (new items push the stack upward). No reversal needed. `z-index: 1000` sits above app chrome; raise only if an existing overlay uses a higher value.

- [ ] **Step 2: Mount it in `app.ts`**

In `apps/desktop/src/app/app.ts`, add the import and include the component in `imports`, then render it once, outside the conditional branches so it shows on every screen.

Change the import block near the top to add:

```ts
import { ToastContainerComponent } from './core/toast/toast-container.component';
```

Change the `imports` array from:

```ts
  imports: [RouterOutlet, ShellLayoutComponent, FirstLaunchComponent, OnboardingComponent],
```

to:

```ts
  imports: [
    RouterOutlet,
    ShellLayoutComponent,
    FirstLaunchComponent,
    OnboardingComponent,
    ToastContainerComponent,
  ],
```

Change the `template` from:

```ts
  template: `
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="onFirstLaunchDismissed()" />
    } @else if (showOnboarding()) {
      <app-onboarding (completed)="onboarding.close()" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
  `,
```

to:

```ts
  template: `
    @if (showFirstLaunch()) {
      <app-first-launch (dismissed)="onFirstLaunchDismissed()" />
    } @else if (showOnboarding()) {
      <app-onboarding (completed)="onboarding.close()" />
    } @else {
      <app-shell-layout><router-outlet /></app-shell-layout>
    }
    <app-toast-container />
  `,
```

- [ ] **Step 3: Verify the app spec still compiles the root**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/app.spec.ts`
Expected: PASS (`App` still creates).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/core/toast/toast-container.component.ts apps/desktop/src/app/app.ts
git commit -m "feat(toast): mount bottom-right toast container at app root"
```

---

### Task 4: Global ErrorHandler

**Files:**

- Create: `apps/desktop/src/app/core/toast/toast-error.handler.ts`
- Create: `apps/desktop/src/app/core/toast/toast-error.handler.spec.ts`
- Modify: `apps/desktop/src/app/app.config.ts`

**Interfaces:**

- Consumes: `ToastService.error` (Task 1).
- Produces: `ToastErrorHandler implements ErrorHandler`.

- [ ] **Step 1: Write the failing test**

`apps/desktop/src/app/core/toast/toast-error.handler.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ToastErrorHandler } from './toast-error.handler';
import { ToastService } from './toast.service';

describe('ToastErrorHandler', () => {
  let handler: ToastErrorHandler;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService, TranslateService, ToastErrorHandler],
    });
    handler = TestBed.inject(ToastErrorHandler);
    toast = TestBed.inject(ToastService);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows an error toast and logs to console', () => {
    const spy = jest.spyOn(toast, 'error');
    handler.handleError(new Error('kaboom'));
    expect(spy).toHaveBeenCalledWith('kaboom');
    expect(console.error).toHaveBeenCalled();
  });

  it('handles non-Error throwables', () => {
    const spy = jest.spyOn(toast, 'error');
    handler.handleError('just a string');
    expect(spy).toHaveBeenCalledWith('just a string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast-error.handler.spec.ts`
Expected: FAIL — cannot find `./toast-error.handler`.

- [ ] **Step 3: Write the handler**

`apps/desktop/src/app/core/toast/toast-error.handler.ts`:

```ts
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class ToastErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);
  private reentrant = false;

  handleError(error: unknown): void {
    // Always keep the console trail.
    console.error(error);
    // Guard against an error thrown while rendering a toast re-triggering us.
    if (this.reentrant) return;
    this.reentrant = true;
    try {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      this.toast.error(message);
    } finally {
      this.reentrant = false;
    }
  }
}
```

- [ ] **Step 4: Provide it in `app.config.ts`**

Change `apps/desktop/src/app/app.config.ts` from:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(appRoutes)],
};
```

to:

```ts
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { ToastErrorHandler } from './core/toast/toast-error.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    { provide: ErrorHandler, useClass: ToastErrorHandler },
  ],
};
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/core/toast/toast-error.handler.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/core/toast/toast-error.handler.ts apps/desktop/src/app/core/toast/toast-error.handler.spec.ts apps/desktop/src/app/app.config.ts
git commit -m "feat(toast): route uncaught errors through a global ErrorHandler"
```

---

### Task 5: i18n keys (EN + DE)

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Produces keys used by later tasks: `toast.dismiss`, `toast.saved`, `settings.saved`, `settings.load_failed`, `settings.key_stored`, `settings.key_removed`, `tracker.export_done`.

- [ ] **Step 1: Add a `toast` block + reused keys to `en`**

In the `en` object, add a top-level `toast` block (place near other top-level namespaces):

```ts
  toast: {
    dismiss: 'Dismiss',
    saved: 'Saved',
  },
```

Add to the existing `en.settings` object these keys (do not remove existing ones):

```ts
    saved: 'Settings saved.',
    key_stored: 'API key stored in your OS keychain.',
    key_removed: 'API key removed from keychain.',
```

Add to the existing `en.tracker` object:

```ts
    export_done: 'Exported',
```

- [ ] **Step 2: Mirror all of Step 1 in the `de` object**

In `de.toast` (create the block):

```ts
  toast: {
    dismiss: 'Schließen',
    saved: 'Gespeichert',
  },
```

In `de.settings`:

```ts
    saved: 'Einstellungen gespeichert.',
    key_stored: 'API-Schlüssel im Schlüsselbund gespeichert.',
    key_removed: 'API-Schlüssel aus dem Schlüsselbund entfernt.',
```

In `de.tracker`:

```ts
    export_done: 'Exportiert',
```

- [ ] **Step 3: Run the i18n parity + key-existence specs**

Run: `npx nx test i18n` and `npx nx test desktop --testFile=apps/desktop/src/i18n-keys.spec.ts`
Expected: PASS. If `i18n-keys.spec` flags any `toast.*` key referenced in Task 2's template that is missing, add it here.

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): add toast + settings/tracker status keys (en, de)"
```

---

### Task 6: Retrofit settings page

**Files:**

- Modify: `apps/desktop/src/app/pages/settings/settings.component.ts`

**Interfaces:**

- Consumes: `ToastService` (Task 1); i18n keys `settings.saved`, `settings.key_stored`, `settings.key_removed` (Task 5).

Current: a `status = signal('')` (line ~514) rendered as `<p class="status">` (lines ~314–319) carries both success and error text.

- [ ] **Step 1: Inject the service**

Add import at top:

```ts
import { ToastService } from '../../core/toast/toast.service';
```

Add field alongside the other `inject()`s in the class:

```ts
  private readonly toast = inject(ToastService);
```

- [ ] **Step 2: Replace status writes with toast calls**

Apply these edits (each `this.status.set(...)` → toast). Keep `this.status.set('')` resets only if `status` is still used elsewhere; if all uses are removed, delete the signal and its template.

- Load catch: `this.status.set(\`Load failed: ${String(e)}\`)`→`this.toast.error(String(e))`
- Save success: `this.status.set('Settings saved.')` → `this.toast.success('settings.saved')`
- Save catch: `this.status.set(\`Save failed: ${String(e)}\`)`→`this.toast.error(String(e))`
- Key store success: `this.status.set('API key stored in your OS keychain.')` → `this.toast.success('settings.key_stored')`
- Key store catch: `this.status.set(\`Key store failed: ${String(e)}\`)`→`this.toast.error(String(e))`
- Key remove success: `this.status.set('API key removed from keychain.')` → `this.toast.success('settings.key_removed')`
- Key remove catch: `this.status.set(\`Key remove failed: ${String(e)}\`)`→`this.toast.error(String(e))`
- Test catch: `this.status.set(\`Test failed: ${String(e)}\`)`→`this.toast.error(String(e))`

- [ ] **Step 3: Remove the now-dead `status` signal + template**

Delete the `readonly status = signal('')` declaration, the two `<p class="status">{{ status() }}</p>` blocks (and the `@if (status())` wrapper), the leftover `this.status.set('')` resets, and the `.status { … }` style rule. Keep the `testTokens` display block untouched.

- [ ] **Step 4: Type-check + test**

Run: `npx nx test desktop --testFile=apps/desktop/src/app/pages/settings/settings.component.spec.ts` (if present) then `npx nx lint desktop`.
Expected: no reference to a removed `status` symbol; lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/settings/settings.component.ts
git commit -m "refactor(settings): surface save/key/test feedback via toasts"
```

---

### Task 7: Retrofit tracker + stage-quick-add

**Files:**

- Modify: `apps/desktop/src/app/pages/tracker/tracker.component.ts`
- Modify: `apps/desktop/src/app/pages/pipeline/stage-quick-add/stage-quick-add.component.ts`

**Interfaces:**

- Consumes: `ToastService` (Task 1); i18n key `tracker.export_done` (Task 5).

Tracker current: `exportMsg` signal set to `\`${t('tracker.saved_to')} ${path}\`` on success (line ~196) and on catch (line ~197 area).

- [ ] **Step 1: tracker — inject + replace**

Add `import { ToastService } from '../../core/toast/toast.service';` and `private readonly toast = inject(ToastService);`.

- Export success: `this.exportMsg.set(\`${this.t()('tracker.saved_to')} ${path}\`)` → `this.toast.success(\`${this.t()('tracker.saved_to')} ${path}\`)` (raw resolved string passes through the service unchanged).
- Export catch: replace `this.exportMsg.set(String(e))` (or equivalent at line ~197) → `this.toast.error(String(e))`.

Remove the `exportMsg` signal and its template binding if it has no remaining readers. If `exportMsg` also drives non-toast UI, leave it and additionally fire the toast.

stage-quick-add current: `error = signal('')`, set in catch (line ~71) and rendered inline.

- [ ] **Step 2: stage-quick-add — inject + dual**

This is a small inline form. Keep the inline `error` display (it sits next to the form) AND fire a toast. Add the import + `private readonly toast = inject(ToastService);`. In the catch block, after `this.error.set(String(e));` add `this.toast.error(String(e));`.

- [ ] **Step 3: Test + lint**

Run: `npx nx lint desktop`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/pages/tracker/tracker.component.ts apps/desktop/src/app/pages/pipeline/stage-quick-add/stage-quick-add.component.ts
git commit -m "refactor(tracker,pipeline): surface export + stage-add feedback via toasts"
```

---

### Task 8: Retrofit documents (cv-list, cv-detail, cover-letter-detail)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.ts`

**Interfaces:**

- Consumes: `ToastService` (Task 1).

cv-list current: `importError` + `generateError` signals set inside import/generate flows (lines ~194, 242, 253, 269, 289–302, 314, 393). These errors render inside the import/generate modal steps — contextual. **Dual-fire**: keep the inline `*Error` display AND add a toast in each catch.

cv-detail current: `error = signal('')` set in catch at lines ~286, ~349. If rendered as a page-level banner, migrate to toast (remove inline); if adjacent to a specific action, dual-fire. Default: **migrate to toast** (cv-detail `error` is a general banner).

cover-letter-detail current: same `error` pattern at lines ~258, ~307. **Migrate to toast**.

- [ ] **Step 1: cv-list — inject + dual-fire in catches**

Add import + `private readonly toast = inject(ToastService);`. In each `catch (e)` that currently calls `this.importError.set(...)` or `this.generateError.set(...)`, add `this.toast.error(String(e));` immediately after. Do NOT remove the inline `*Error` signals (they gate modal step UI).

- [ ] **Step 2: cv-detail — migrate to toast**

Add import + `private readonly toast = inject(ToastService);`. Replace each `this.error.set(String(e))` with `this.toast.error(String(e))`. Remove the `error` signal declaration (line ~82), its `this.error.set('')` resets, and its inline template banner + related style. Verify no other reader of `error` remains before deleting.

- [ ] **Step 3: cover-letter-detail — migrate to toast**

Same as Step 2 for `error` at lines ~184/257/268/306, declaration line ~71.

- [ ] **Step 4: Lint + test**

Run: `npx nx lint desktop`
Expected: clean; no dangling references to removed `error` signals.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-list/cv-list.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.ts
git commit -m "refactor(documents): surface CV + cover-letter errors via toasts"
```

---

### Task 9: Retrofit interview-prep + interview-prep-detail

**Files:**

- Modify: `apps/desktop/src/app/pages/interview-prep/interview-prep.component.ts`
- Modify: `apps/desktop/src/app/pages/interview-prep/interview-prep-detail/interview-prep-detail.component.ts`

**Interfaces:**

- Consumes: `ToastService` (Task 1).

interview-prep current: `error = signal('')` set in one catch (line ~53). interview-prep-detail: `error = signal('')` set in catches at lines ~119, ~159, ~205.

- [ ] **Step 1: interview-prep — migrate to toast**

Add import + `private readonly toast = inject(ToastService);`. Replace `this.error.set(String(e))` → `this.toast.error(String(e))`. Remove the `error` signal (line ~34), its template banner + style, if it is a page-level banner with no other reader.

- [ ] **Step 2: interview-prep-detail — migrate to toast**

Same pattern for all three catch sites (lines ~119/159/205) and the declaration (line ~94). Confirm `error` has no reader beyond the banner before removing; otherwise dual-fire.

- [ ] **Step 3: Lint**

Run: `npx nx lint desktop`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/pages/interview-prep/interview-prep.component.ts apps/desktop/src/app/pages/interview-prep/interview-prep-detail/interview-prep-detail.component.ts
git commit -m "refactor(interview-prep): surface load/action errors via toasts"
```

---

### Task 10: Dual (inline + toast) for pipeline, profile, quick-view-modal

**Files:**

- Modify: `apps/desktop/src/app/pages/pipeline/pipeline.component.ts`
- Modify: `apps/desktop/src/app/pages/profile/profile.component.ts`
- Modify: `apps/desktop/src/app/pages/pipeline/quick-view-modal/quick-view-modal.component.ts`

**Interfaces:**

- Consumes: `ToastService` (Task 1).

These keep their existing inline UI (pipeline's full-page retry state, profile's field-level ticks/errors, quick-view-modal's form-adjacent errors) and ALSO fire a toast on error.

- [ ] **Step 1: pipeline — keep retry state, add toast**

pipeline `error = signal('')` (line ~405) drives the `@else if (error())` full-page state with a Retry button (lines ~44–47). Do NOT remove it. Add `import { ToastService } from '../../core/toast/toast.service';` + `private readonly toast = inject(ToastService);`. In the load catch (line ~426–427), after `this.error.set(String(e));` add `this.toast.error(String(e));`.

- [ ] **Step 2: profile — keep inline status, add toast on errors only**

profile uses `saveStatus`/`scoreStatus`/`pitchStatus` for both success ticks and errors, with `saveError()`/`scoreError()`/`pitchError()` flags controlling the `status--error` class (template lines ~62/225/258). Keep all of this. Add import + `private readonly toast = inject(ToastService);`. In each catch that sets an error status (lines ~621/622, ~671/672, ~721/722, ~776/777), add a `this.toast.error(...)` using the same resolved text, e.g.:

```ts
    } catch (e) {
      this.saveStatus.set(this.t()('profile.save_failed').replace('{error}', String(e)));
      this.toast.error(this.t()('profile.save_failed').replace('{error}', String(e)));
    }
```

Do NOT toast the success ticks (keep those inline only) to avoid double-signalling routine saves.

- [ ] **Step 3: quick-view-modal — keep form errors, add toast**

`followupError` (lines ~142/175/216) and `commentsError` (lines ~269/343) render next to their forms — keep them. Add import + `private readonly toast = inject(ToastService);`. In the two catch blocks (line ~216 for follow-up, line ~272 for comments), after the existing `this.*Error.set(...)`, add `this.toast.error(String(e));`.

- [ ] **Step 4: Lint + full desktop test**

Run: `npx nx lint desktop && npx nx test desktop`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/pipeline/pipeline.component.ts apps/desktop/src/app/pages/profile/profile.component.ts apps/desktop/src/app/pages/pipeline/quick-view-modal/quick-view-modal.component.ts
git commit -m "feat(pipeline,profile,pipeline): mirror inline errors to toasts"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run the whole desktop + i18n suites**

Run: `npx nx test desktop && npx nx test i18n && npx nx lint desktop`
Expected: all pass; zero lint errors.

- [ ] **Step 2: Manual smoke (dev build)**

Run the desktop app, then: trigger a settings save (success toast, bottom-right, ~4s auto-dismiss), enter a bad API key / force an error (error toast, ~7s, hover pauses), and confirm the pipeline load-error retry state still renders alongside its toast. Confirm toasts appear over the shell, over modals, and during onboarding.

- [ ] **Step 3: Commit any fixups, then stop**

Do not push; hand back for branch-finish (Conventional Commit history is already in place).

---

## Self-Review Notes

- **Spec coverage:** kinds (Task 1), bottom-right container (Task 3), auto-dismiss durations + hover pause (Tasks 1–2), dedupe/cap (Task 1), global ErrorHandler (Task 4), token-only styling (Task 2), i18n EN/DE parity (Task 5), all-page retrofit split into clean-migrate (6–9) + dual inline (10), tests (each task) — all covered.
- **Deviation from spec:** spec said "retrofit ALL pages"; refined during planning (user-approved) to migrate 8 clean pages and DUAL-fire (keep inline + toast) for pipeline/profile/quick-view-modal, preserving the pipeline retry state and field-level feedback.
- **Type consistency:** `ToastService` method names (`show/error/success/warning/info/dismiss/pause/resume`), `Toast`/`ToastKind`/`ToastOptions`, `input.required<Toast>()`, and icon map keys are used consistently across Tasks 1–3 and consumers.
- **Line numbers** in retrofit tasks are approximate (from the current tree) — locate by the quoted code, not the number.
