import { Component, inject, output, signal } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts); steps are placeholders
 * here and get filled in by later tasks. */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ButtonDirective],
  template: `
    <div class="onboarding">
      <header class="onboarding__head">
        <h1>{{ t()('onboarding.title') }}</h1>
        <button appButton variant="ghost" size="sm" (click)="skip()">
          {{ t()('onboarding.skip') }}
        </button>
      </header>

      <div class="onboarding__progress">
        {{ t()('onboarding.step') }} {{ step() + 1 }} / {{ totalSteps }}
      </div>

      <main class="onboarding__body">
        @switch (step()) {
          @case (0) {
            <section>
              <h2>{{ t()('onboarding.welcome_title') }}</h2>
              <p>{{ t()('onboarding.welcome_privacy') }}</p>
            </section>
          }
          @default {
            <section>
              <p>{{ t()('onboarding.step_todo') }}</p>
            </section>
          }
        }
      </main>

      <footer class="onboarding__nav">
        <button appButton variant="ghost" size="md" [disabled]="step() === 0" (click)="back()">
          {{ t()('onboarding.back') }}
        </button>
        @if (step() < totalSteps - 1) {
          <button appButton variant="primary" size="md" (click)="next()">
            {{ t()('onboarding.next') }}
          </button>
        } @else {
          <button appButton variant="primary" size="md" (click)="finish()">
            {{ t()('onboarding.done_cta') }}
          </button>
        }
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .onboarding {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem;
      }
      .onboarding__head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .onboarding__body {
        flex: 1;
      }
      .onboarding__nav {
        display: flex;
        justify-content: space-between;
      }
    `,
  ],
})
export class OnboardingComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly completed = output<void>();
  readonly step = signal(0);
  readonly totalSteps = 6; // 0 welcome, 1 ai-setup, 2 resume, 3 preview, 4 archetypes, 5 done

  next(): void {
    this.step.update((s) => Math.min(s + 1, this.totalSteps - 1));
  }

  back(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }

  async skip(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }

  async finish(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }

  private async markSeen(): Promise<void> {
    try {
      await this.db.updateSettings({ onboardingSeen: true });
    } catch {
      // fail open — never trap the user in onboarding
    }
  }
}
