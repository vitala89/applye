import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Check,
  ClipboardType,
  Clock,
  FileText,
  Info,
  LucideAngularModule,
  TriangleAlert,
  Upload,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { OnboardingResumeStore, type ResumePath } from '@applye/application';

/**
 * Step 2 of the wizard: upload a resume, paste one, or skip.
 *
 * Built like `OnboardingCliCardComponent` and its siblings - it reads and
 * mutates `OnboardingResumeStore` directly rather than taking inputs, because
 * the wizard provides that service and reads the same signals back for its
 * Continue gate.
 *
 * The one thing it cannot do itself is open the file dialog: no store under
 * `libs/` may import a Tauri plugin, and this component is on the path to
 * becoming one. It asks, and the wizard picks the path.
 */
@Component({
  selector: 'app-onboarding-resume-step',
  standalone: true,
  imports: [FormsModule, ButtonDirective, LucideAngularModule],
  templateUrl: './onboarding-resume-step.component.html',
  styleUrl: './onboarding-resume-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingResumeStepComponent {
  protected readonly resume = inject(OnboardingResumeStore);
  protected readonly t = inject(TranslateService).t;

  /** Asks the wizard to open a file dialog and hand back a path. */
  readonly fileRequested = output<void>();

  protected readonly icons = {
    upload: Upload,
    clipboardType: ClipboardType,
    clock: Clock,
    fileText: FileText,
    check: Check,
    info: Info,
    triangleAlert: TriangleAlert,
  };

  /** Choosing "upload" with nothing attached yet opens the dialog immediately,
   * which is one fewer click for the common path. */
  protected choose(path: ResumePath): void {
    if (this.resume.choose(path)) this.fileRequested.emit();
  }
}
