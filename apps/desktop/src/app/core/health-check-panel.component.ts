import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import {
  AlertTriangle,
  CheckCircle2,
  LucideAngularModule,
  RefreshCw,
  XCircle,
} from 'lucide-angular';
import { HealthCheckStore } from '@applye/application';
import { HealthCheckItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** Runs the deterministic (0-token) health check and renders the results.
 * Shared by the first-launch screen and Settings' "Run health check". */
@Component({
  selector: 'app-health-check-panel',
  standalone: true,
  imports: [LucideAngularModule],
  providers: [HealthCheckStore],
  template: `
    <div class="health-panel">
      @if (health.loading()) {
        <div class="state-loading" [attr.aria-label]="t()('health.checking')">
          <div class="state-loading__bar state-loading__bar--wide"></div>
          <div class="state-loading__bar state-loading__bar--mid"></div>
          <div class="state-loading__bar state-loading__bar--short"></div>
        </div>
      } @else {
        <ul class="health-list">
          @for (i of health.items(); track i.key) {
            <li class="health-item">
              <lucide-icon
                [img]="statusIcon(i.status)"
                [size]="16"
                [class]="'health-item__icon health-item__icon--' + i.status"
                aria-hidden="true"
              />
              <div class="health-item__body">
                <span class="health-item__label">{{ i.label }}</span>
                <span class="health-item__detail">{{ i.detail }}</span>
              </div>
            </li>
          }
        </ul>
        <div class="row">
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            [disabled]="health.loading()"
            (click)="run()"
          >
            <lucide-icon [img]="icons.rerun" [size]="14" aria-hidden="true" />
            {{ t()('health.rerun') }}
          </button>
          @if (showContinue()) {
            <button class="btn btn--primary" type="button" (click)="continueClicked.emit()">
              {{ t()('health.continue') }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .health-list {
        list-style: none;
        margin: 0 0 var(--space-3);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .health-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
      }
      .health-item__icon--ok {
        color: #22c55e;
      }
      .health-item__icon--warn {
        color: #f59e0b;
      }
      .health-item__icon--fail {
        color: #ef4444;
      }
      .health-item__body {
        display: flex;
        flex-direction: column;
      }
      .health-item__label {
        font-weight: 600;
        font-size: var(--text-sm);
        color: var(--text-primary);
      }
      .health-item__detail {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthCheckPanelComponent implements OnInit {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly health = inject(HealthCheckStore);

  readonly showContinue = input(false);
  readonly continueClicked = output<void>();

  protected readonly icons = {
    ok: CheckCircle2,
    warn: AlertTriangle,
    fail: XCircle,
    rerun: RefreshCw,
  };

  async ngOnInit(): Promise<void> {
    await this.run();
  }

  /** The label goes in because the store holds no translations - a failed check
   * is reported as a `fail` row and the row needs a name the user can read. */
  async run(): Promise<void> {
    await this.health.run(this.t()('health.section'));
  }

  statusIcon(status: HealthCheckItem['status']) {
    return this.icons[status];
  }
}
