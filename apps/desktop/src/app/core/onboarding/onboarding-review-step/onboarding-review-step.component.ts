import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, TriangleAlert } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { OnboardingReviewStore } from '@applye/application';

/**
 * The wizard's Review step: the contact block parsed out of the resume, made
 * editable, plus a read-only recap of the experience and skills behind it.
 *
 * Built like the two AI panels: it reads and mutates `OnboardingReviewStore`
 * directly rather than taking inputs, because the wizard provides that service
 * and reads the same fields back for the Ready summary, the profile it saves
 * and the CV document it writes.
 */
@Component({
  selector: 'app-onboarding-review-step',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './onboarding-review-step.component.html',
  styleUrl: './onboarding-review-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingReviewStepComponent {
  protected readonly review = inject(OnboardingReviewStore);
  protected readonly t = inject(TranslateService).t;

  protected readonly icons = {
    triangleAlert: TriangleAlert,
  };
}
