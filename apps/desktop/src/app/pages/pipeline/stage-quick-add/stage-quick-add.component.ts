import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { STAGE_TYPES, StageQuickAddStore } from '@applye/application';
import { InterviewStage } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';

// One write path allowed outside Interview Prep: right after an
// application's status changes TO interview (dropdown or drag-and-drop),
// this mini form offers to log the first stage (stage_order = 1). Never a
// gate - always skippable - and only ever fires once per application
// (the parent checks stage count before rendering this).
//
// The form's state and its write are `StageQuickAddStore`'s; what stays here
// is the toast, because telling the user is the app's job and not the
// application layer's (ADR-0005, amendments three and twenty-six).
@Component({
  selector: 'app-stage-quick-add',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective],
  providers: [StageQuickAddStore],
  templateUrl: './stage-quick-add.component.html',
  styleUrl: './stage-quick-add.component.scss',
})
export class StageQuickAddComponent {
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly form = inject(StageQuickAddStore);

  readonly applicationId = input.required<number>();

  @Output() added = new EventEmitter<InterviewStage>();
  @Output() skipped = new EventEmitter<void>();

  protected readonly STAGE_TYPES = STAGE_TYPES;

  protected async submit(): Promise<void> {
    const stage = await this.form.submit(this.applicationId());
    if (stage) {
      this.added.emit(stage);
      return;
    }
    // `error` is empty when `submit` refused rather than failed - an empty
    // label, or a save already in flight. Nothing to say in that case.
    const message = this.form.error();
    if (message) this.toast.error(message);
  }

  protected skip(): void {
    this.skipped.emit();
  }
}
