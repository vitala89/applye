import { Injectable, inject, signal } from '@angular/core';
import type { HealthCheckItem } from '@applye/core';
import { SystemGateway } from '@applye/data';

/**
 * The deterministic (0-token) health check: whether it is running and what it
 * last reported.
 *
 * Its own area rather than `onboarding/`, because the panel that renders it has
 * two homes - the first-launch screen and Settings - and only one of them is
 * onboarding (ADR-0005, amendment twenty-six). Component-scoped like every
 * other store here, so those two hosts get an instance each, which is what the
 * component already did by holding the signals itself.
 *
 * **A failed check is a result, not an error state.** `run` never rejects; it
 * reports the failure as a single `fail` item, because a health check that
 * cannot answer has told the user something true and the panel has a row shaped
 * to say it. The label for that row is the caller's, since this layer holds no
 * translations.
 */
@Injectable()
export class HealthCheckStore {
  private readonly db = inject(SystemGateway);

  readonly loading = signal(true);
  readonly items = signal<HealthCheckItem[]>([]);

  async run(errorLabel: string): Promise<void> {
    this.loading.set(true);
    try {
      const report = await this.db.healthCheck();
      this.items.set(report.items);
    } catch (e) {
      this.items.set([{ key: 'error', label: errorLabel, status: 'fail', detail: String(e) }]);
    } finally {
      this.loading.set(false);
    }
  }
}
