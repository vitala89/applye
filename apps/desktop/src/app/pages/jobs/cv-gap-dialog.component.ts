import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@applye/i18n';

import type { CvGapAnswer, CvGapQuestion } from '@applye/core';

@Component({
  selector: 'app-cv-gap-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gap-dialog" role="dialog" aria-modal="true">
      <div class="gap-dialog__panel">
        @if (analyzing()) {
          <div class="gap-dialog__analyzing">
            <span class="ai-thinking__dots" aria-hidden="true"
              ><span></span><span></span><span></span
            ></span>
            <p>{{ t()('jobs.gap.analyzing') }}</p>
          </div>
        } @else if (atReview()) {
          <div class="gap-dialog__review">
            <h4>{{ t()('jobs.gap.review_title') }}</h4>
            <label class="gap-dialog__save">
              <input
                type="checkbox"
                [ngModel]="saveToProfile()"
                (ngModelChange)="toggleSaveToProfile($event)"
              />
              {{ t()('jobs.gap.save_to_profile') }}
            </label>
            <div class="gap-dialog__actions">
              <button class="btn btn--secondary btn--md" type="button" (click)="cancel.emit()">
                {{ t()('actions.cancel') }}
              </button>
              <button class="btn btn--primary btn--md" type="button" (click)="doSubmit()">
                {{ t()('jobs.gap.generate') }}
              </button>
            </div>
          </div>
        } @else if (current(); as q) {
          <div class="gap-dialog__question">
            <span class="eyebrow"
              >{{ t()('jobs.gap.question_of') }} {{ index() + 1 }}/{{ questions().length }}</span
            >
            <h4>{{ q.question }}</h4>
            @if (q.hint) {
              <p class="muted">{{ q.hint }}</p>
            }
            <textarea
              class="gap-dialog__input"
              rows="3"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              [placeholder]="t()('jobs.gap.answer_placeholder')"
            ></textarea>
            <div class="gap-dialog__actions">
              <button class="btn btn--ghost btn--md" type="button" (click)="skip()">
                {{ t()('jobs.gap.skip') }}
              </button>
              <button class="btn btn--primary btn--md" type="button" (click)="next()">
                {{ t()('jobs.gap.next') }}
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .gap-dialog {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--bg-app) 70%, transparent);
      }
      .gap-dialog__panel {
        width: min(520px, 92vw);
        padding: var(--space-6, 20px);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card, 8px);
        box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 25%));
      }
      .gap-dialog__analyzing {
        display: flex;
        align-items: center;
        gap: var(--space-3, 8px);
      }
      .gap-dialog__input {
        width: 100%;
        margin: var(--space-3, 8px) 0;
        padding: var(--space-3, 8px);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input, 6px);
        background: var(--surface-sunken);
        color: var(--text-primary);
        font-family: var(--font-sans, sans-serif);
      }
      .gap-dialog__save {
        display: flex;
        align-items: center;
        gap: var(--space-2, 6px);
        margin: var(--space-4, 12px) 0;
      }
      .gap-dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3, 8px);
      }
    `,
  ],
})
export class CvGapDialog {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly questions = input.required<CvGapQuestion[]>();
  readonly analyzing = input<boolean>(false);

  // eslint-disable-next-line @angular-eslint/no-output-native -- interface required by task spec
  readonly submit = output<{ answers: CvGapAnswer[]; saveToProfile: boolean }>();
  // eslint-disable-next-line @angular-eslint/no-output-native -- interface required by task spec
  readonly cancel = output<void>();

  protected readonly index = signal(0);
  protected readonly draft = signal('');
  protected readonly saveToProfile = signal(false);
  private readonly collected = signal<CvGapAnswer[]>([]);

  protected readonly atReview = computed(() => this.index() >= this.questions().length);
  protected readonly current = computed(() => this.questions()[this.index()] ?? null);

  /** Test seam: set the current draft answer. */
  setAnswer(text: string): void {
    this.draft.set(text);
  }

  next(): void {
    this.record(this.draft().trim());
  }

  skip(): void {
    this.record('');
  }

  private record(answer: string): void {
    const q = this.current();
    if (!q) return;
    this.collected.update((list) => [...list, { id: q.id, question: q.question, answer }]);
    this.draft.set('');
    this.index.update((i) => i + 1);
  }

  toggleSaveToProfile(value: boolean): void {
    this.saveToProfile.set(value);
  }

  doSubmit(): void {
    this.submit.emit({ answers: this.collected(), saveToProfile: this.saveToProfile() });
  }
}
