import { Component, inject, output } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { HealthCheckPanelComponent } from './health-check-panel.component';

/** Shown once on first launch (gated by settings.healthCheckSeen, persisted
 * in SQLite — never localStorage). Augmentation principle applies here too:
 * a failing check informs, it never blocks the user from continuing. */
@Component({
  selector: 'app-first-launch',
  standalone: true,
  imports: [HealthCheckPanelComponent],
  template: `
    <div class="first-launch">
      <div class="first-launch__card">
        <h1 class="first-launch__title">{{ t()('health.welcome_title') }}</h1>
        <p class="first-launch__subtitle">{{ t()('health.welcome_subtitle') }}</p>
        <app-health-check-panel [showContinue]="true" (continueClicked)="finish()" />
      </div>
    </div>
  `,
  styles: [
    `
      .first-launch {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--bg-app);
        padding: var(--space-6);
      }
      .first-launch__card {
        width: 100%;
        max-width: 480px;
        background: var(--surface-1);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--space-6);
      }
      .first-launch__title {
        font-family: var(--font-mono);
        font-size: var(--text-xl);
        color: var(--text-primary);
        margin: 0 0 var(--space-2);
      }
      .first-launch__subtitle {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0 0 var(--space-5);
      }
    `,
  ],
})
export class FirstLaunchComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly dismissed = output<void>();

  async finish(): Promise<void> {
    try {
      await this.db.updateSettings({ healthCheckSeen: true });
    } catch {
      // Even if persisting the flag fails, never trap the user on this screen.
    }
    this.dismissed.emit();
  }
}
