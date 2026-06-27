import { Injectable, signal } from '@angular/core';
import { Settings } from '@applye/core';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settings = signal<Settings | null>(null);

  readonly current = this.settings.asReadonly();

  constructor(private db: DbService) {}

  async load(): Promise<void> {
    const s = await this.db.getSettings();
    this.settings.set(s);
  }

  async update(patch: Partial<Settings>): Promise<void> {
    const updated = await this.db.updateSettings(patch);
    this.settings.set(updated);
  }
}
