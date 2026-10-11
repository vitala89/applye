/**
 * Open and Reveal for a file this app just wrote. The same two commands
 * `SystemGateway` uses, called from the button that owns them.
 */
async function invokeOs(command: 'open_file' | 'reveal_in_folder', path: string): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error(`tauriInvoke called outside Tauri context (command: ${command})`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(command, { path });
}

export function openExportedPath(path: string): Promise<void> {
  return invokeOs('open_file', path);
}

export function revealExportedPath(path: string): Promise<void> {
  return invokeOs('reveal_in_folder', path);
}
