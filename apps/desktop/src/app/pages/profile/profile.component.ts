import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DbService } from '@applye/data';

/**
 * Phase 1 vertical slice — proves the data spine end-to-end.
 * Loads the profile via db_get_profile, saves full_md via db_upsert_profile,
 * and shows a load/save confirmation. The rich editor is Phase 3.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="profile">
      <header class="profile__head">
        <h2>Profile</h2>
        <p>Your master profile (Markdown). Source of truth for AI scoring &amp; tailoring.</p>
      </header>

      <textarea
        class="profile__editor"
        [(ngModel)]="fullMd"
        [disabled]="loading()"
        placeholder="# Jane Doe&#10;Senior Frontend Engineer …"
        spellcheck="false"
      ></textarea>

      <div class="profile__actions">
        <button class="btn-primary" (click)="save()" [disabled]="loading() || saving()">
          {{ saving() ? 'Saving…' : 'Save profile' }}
        </button>
        @if (status()) {
          <span class="profile__status" [class.profile__status--error]="isError()">
            {{ status() }}
          </span>
        }
      </div>
    </div>
  `,
  styles: [`
    .profile {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 880px;
    }
    .profile__head h2 {
      font-family: var(--font-mono);
      font-size: var(--text-xl);
      color: var(--text-primary);
      margin-bottom: var(--space-2);
    }
    .profile__head p { color: var(--text-secondary); font-size: var(--text-sm); }
    .profile__editor {
      width: 100%;
      min-height: 420px;
      padding: var(--space-3);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--surface-2, #1a1a1a);
      border: 1px solid var(--border, #333);
      border-radius: var(--radius-md, 6px);
      resize: vertical;
    }
    .profile__actions { display: flex; align-items: center; gap: var(--space-3); }
    .profile__status { font-size: var(--text-sm); color: var(--text-secondary); }
    .profile__status--error { color: var(--danger, #e5484d); }
  `],
})
export class ProfileComponent implements OnInit {
  readonly fullMd = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly status = signal('');
  readonly isError = signal(false);

  constructor(private db: DbService) {}

  async ngOnInit(): Promise<void> {
    try {
      const profile = await this.db.getProfile();
      this.fullMd.set(profile?.fullMd ?? '');
      this.setStatus(profile ? `Loaded (updated ${profile.updatedAt ?? 'never'}).` : 'No profile yet — start typing.');
    } catch (e) {
      this.setStatus(`Load failed: ${String(e)}`, true);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const saved = await this.db.upsertProfile({ fullMd: this.fullMd() });
      this.setStatus(`Saved ✓ (${saved.updatedAt ?? 'now'}).`);
    } catch (e) {
      this.setStatus(`Save failed: ${String(e)}`, true);
    } finally {
      this.saving.set(false);
    }
  }

  private setStatus(msg: string, error = false): void {
    this.status.set(msg);
    this.isError.set(error);
  }
}
