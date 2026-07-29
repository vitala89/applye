import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideAngularModule, CircleX, CircleCheck, TriangleAlert, Info, X } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { Toast, ToastKind } from './toast.model';
import { ToastService } from './toast.service';

const KIND_ICON = {
  error: CircleX,
  success: CircleCheck,
  warning: TriangleAlert,
  info: Info,
} as const;

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      class="toast toast--{{ toast().kind }}"
      [attr.role]="isError() ? 'alert' : 'status'"
      [attr.aria-live]="isError() ? 'assertive' : 'polite'"
      (mouseenter)="svc.pause(toast().id)"
      (mouseleave)="svc.resume(toast().id)"
    >
      <span class="toast__bar" aria-hidden="true"></span>
      <lucide-icon [img]="icon()" [size]="18" class="toast__icon" aria-hidden="true" />
      @if (toast().titleKey) {
        <div class="toast__body">
          <strong class="toast__title">{{ t()(toast().titleKey!) }}</strong>
          <span class="toast__msg">{{ toast().message }}</span>
        </div>
      } @else {
        <span class="toast__msg">{{ toast().message }}</span>
      }
      <button
        type="button"
        class="toast__close"
        [attr.aria-label]="t()('toast.dismiss')"
        (click)="svc.dismiss(toast().id)"
      >
        <lucide-icon [img]="closeIcon" [size]="16" aria-hidden="true" />
      </button>
    </div>
  `,
  styles: [
    `
      .toast {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 0.625rem;
        min-width: 18rem;
        max-width: 24rem;
        padding: 0.75rem 0.875rem 0.75rem 1rem;
        border-radius: var(--radius-md, 10px);
        background: var(--surface-2, #1e1e24);
        color: var(--text-primary, #f2f2f4);
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.4));
        overflow: hidden;
        pointer-events: auto;
        animation: toast-in 160ms ease-out;
      }
      .toast__bar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
      }
      .toast--error {
        background: linear-gradient(var(--danger-tint), var(--danger-tint)), var(--surface-2);
      }
      .toast--error .toast__bar {
        background: var(--danger);
      }
      .toast--error .toast__icon {
        color: var(--danger);
      }
      .toast--success .toast__bar {
        background: var(--success);
      }
      .toast--success .toast__icon {
        color: var(--success);
      }
      .toast--warning .toast__bar {
        background: var(--warning);
      }
      .toast--warning .toast__icon {
        color: var(--warning);
      }
      .toast--info .toast__bar {
        background: var(--indigo-400, #818cf8);
      }
      .toast--info .toast__icon {
        color: var(--indigo-400, #818cf8);
      }
      .toast__body {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .toast__title {
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .toast__msg {
        font-size: 0.8125rem;
        line-height: 1.35;
        color: var(--text-secondary, #b6b6bd);
        word-break: break-word;
      }
      .toast__close {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.125rem;
        background: transparent;
        border: 0;
        border-radius: var(--radius-sm, 6px);
        color: var(--text-tertiary, #8a8a92);
        cursor: pointer;
      }
      .toast__close:hover {
        color: var(--text-primary, #f2f2f4);
        background: var(--surface-hover, #26262d);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateX(12px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  protected readonly svc = inject(ToastService);
  protected readonly t = inject(TranslateService).t;
  readonly toast = input.required<Toast>();

  protected readonly closeIcon = X;
  protected readonly isError = computed(() => this.toast().kind === 'error');
  protected readonly icon = computed(() => KIND_ICON[this.toast().kind as ToastKind]);
}
