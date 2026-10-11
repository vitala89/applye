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
      if (next.length <= TOAST_MAX) return next;
      // Cap overflow: clear the armed timers of the toasts we drop so they
      // don't linger in the timers Map until they fire dismiss() on an
      // already-removed id.
      const overflow = next.length - TOAST_MAX;
      for (let i = 0; i < overflow; i++) this.clear(next[i].id);
      return next.slice(overflow);
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
