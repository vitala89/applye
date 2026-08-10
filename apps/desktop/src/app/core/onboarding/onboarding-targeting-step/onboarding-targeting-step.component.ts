import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule, Plus, Sparkles } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { OnboardingTargetingStore } from '@applye/application';

/**
 * Step 4 of the wizard: which roles the user is targeting, and for how much.
 *
 * Reads and mutates `OnboardingTargetingStore` directly, like its siblings.
 *
 * The one thing it asks the wizard for is a re-suggest: the call needs the
 * resume text and the wizard's own AI dispatch, and neither is this step's to
 * know.
 */
@Component({
  selector: 'app-onboarding-targeting-step',
  standalone: true,
  imports: [FormsModule, ButtonDirective, LucideAngularModule],
  templateUrl: './onboarding-targeting-step.component.html',
  styleUrl: './onboarding-targeting-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingTargetingStepComponent {
  protected readonly targeting = inject(OnboardingTargetingStore);
  protected readonly t = inject(TranslateService).t;

  readonly suggestRequested = output<void>();

  protected readonly icons = { check: Check, plus: Plus, sparkles: Sparkles };
}
