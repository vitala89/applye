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
