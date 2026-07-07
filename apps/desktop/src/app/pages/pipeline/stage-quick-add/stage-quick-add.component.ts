import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DbService } from '@applye/data';
import { InterviewStage, StageType } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';

const STAGE_TYPES: StageType[] = [
  'hr_screen',
  'technical',
  'system_design',
  'behavioral',
  'final',
  'other',
];

// One write path allowed outside Interview Prep: right after an
// application's status changes TO interview (dropdown or drag-and-drop),
// this mini form offers to log the first stage (stage_order = 1). Never a
// gate — always skippable — and only ever fires once per application
// (the parent checks stage count before rendering this).
@Component({
  selector: 'app-stage-quick-add',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective],
  templateUrl: './stage-quick-add.component.html',
  styleUrl: './stage-quick-add.component.scss',
})
export class StageQuickAddComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  readonly applicationId = input.required<number>();

  @Output() added = new EventEmitter<InterviewStage>();
  @Output() skipped = new EventEmitter<void>();

  protected readonly STAGE_TYPES = STAGE_TYPES;

  protected readonly stageType = signal<StageType>('hr_screen');
  protected readonly stageLabel = signal('');
  protected readonly scheduledAt = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    const label = this.stageLabel().trim();
    if (!label || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const stage = await this.db.createInterviewStage({
        applicationId: this.applicationId(),
        stageOrder: 1,
        stageType: this.stageType(),
        stageLabel: label,
        scheduledAt: this.scheduledAt() || undefined,
      });
      this.added.emit(stage);
    } catch (e) {
      this.error.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected skip(): void {
    this.skipped.emit();
  }
}
