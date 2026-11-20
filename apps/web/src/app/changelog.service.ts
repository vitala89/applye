import { Injectable, signal, WritableSignal } from '@angular/core';

interface Release {
  version: string;
  date: string;
  notesPath: string;
}

interface RecentReleases {
  releases: (Release & { highlights: string[] })[];
  hasArchive: boolean;
}

type LoadState<T> = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; data: T };

@Injectable()
export class ChangelogService {
  private readonly recentState = signal<LoadState<RecentReleases>>({ status: 'idle' });
  private readonly archiveState = signal<LoadState<Release[]>>({ status: 'idle' });

  readonly recent = this.recentState.asReadonly();
  readonly archive = this.archiveState.asReadonly();

  loadRecent(): Promise<void> {
    return this.load(this.recentState, '/changelog-data/recent.json', isRecent);
  }

  loadArchive(): Promise<void> {
    return this.load(this.archiveState, '/changelog-data/archive.json', isArchive);
  }

  private async load<T>(
    state: WritableSignal<LoadState<T>>,
    path: string,
    isValid: (data: unknown) => data is T,
  ): Promise<void> {
    const { status } = state();
    if (status === 'loading' || status === 'ready') return;

    state.set({ status: 'loading' });
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!isValid(data)) throw new Error('Invalid changelog data');
      state.set({ status: 'ready', data });
    } catch {
      state.set({ status: 'error' });
    }
  }
}

function isRelease(data: unknown): data is Release {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    typeof data.version === 'string' &&
    'date' in data &&
    typeof data.date === 'string' &&
    'notesPath' in data &&
    typeof data.notesPath === 'string' &&
    data.notesPath.startsWith('/blob/main/CHANGELOG.md#')
  );
}

function isArchive(data: unknown): data is Release[] {
  return Array.isArray(data) && data.every(isRelease);
}

function isRecent(data: unknown): data is RecentReleases {
  return (
    typeof data === 'object' &&
    data !== null &&
    'hasArchive' in data &&
    typeof data.hasArchive === 'boolean' &&
    'releases' in data &&
    Array.isArray(data.releases) &&
    data.releases.every(
      (entry: unknown) =>
        isRelease(entry) &&
        'highlights' in entry &&
        Array.isArray(entry.highlights) &&
        entry.highlights.every((item: unknown) => typeof item === 'string'),
    )
  );
}
