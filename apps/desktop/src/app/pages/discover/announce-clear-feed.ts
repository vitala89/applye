import { ClearFeedResult } from '@applye/application';

/** Phrases the clear-feed result. Idle, including a second click, says nothing. */
export function announceClearFeed(
  result: ClearFeedResult,
  toast: { error: (message: string) => void; success: (message: string) => void },
  clearDone: (removed: number) => string,
): void {
  if (result.status === 'failed') toast.error(result.message);
  if (result.status === 'cleared') toast.success(clearDone(result.removed));
}
