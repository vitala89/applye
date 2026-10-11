// Business and data IPC. Pages do not call this, and they do not call invoke().
// The one presentation exception is apps/desktop/src/app/core/native-shell, which
// reaches the guarded open/reveal commands. ADR-0005, amendment sixty-eight.

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`tauriInvoke called outside Tauri context (command: ${command})`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
