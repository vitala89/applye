/**
 * Open and Reveal for a file this app just wrote.
 *
 * This is the desktop's presentation-only shell adapter. It may call the
 * guarded Rust commands `open_file` and `reveal_in_folder`. Those commands
 * still check `ExportedPaths`, the export extension, and the canonical path.
 * Pages call these functions. They do not name the commands. Business IPC
 * stays in `libs/data`. See ADR-0005, amendment sixty-eight.
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
