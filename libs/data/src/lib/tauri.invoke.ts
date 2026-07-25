// Typed wrapper around Tauri's invoke() - frontend never calls invoke() directly.
// Validates we're running inside Tauri before dispatching (dev guard).

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
