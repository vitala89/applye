import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LucideAngularModule,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-angular';
import { InterviewStage, InterviewStageStatus, StageType, SupportedLanguage } from '@applye/core';
import { InterviewStagesStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '@applye/application';
import { InterviewStageActionsComponent } from './interview-stage-actions/interview-stage-actions.component';

const STAGE_TYPES: StageType[] = [
  'hr_screen',
  'technical',
  'system_design',
  'behavioral',
  'final',
  'other',
];

const STAGE_STATUSES: InterviewStageStatus[] = [
  'scheduled',
  'awaiting_scheduling',
  'awaiting_response',
  'passed',
  'rejected',
  'cancelled',
];

const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

// Interview Prep detail: the full CRUD surface for one application's stages,
// as a vertical timeline. Add/Edit happen in a modal (not an always-on form);
// delete is a styled confirm dialog. Stages are user-defined and unlimited.
@Component({
  selector: 'app-interview-prep-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, FormsModule, LucideAngularModule, InterviewStageActionsComponent],
  templateUrl: './interview-prep-detail.component.html',
  styleUrl: './interview-prep-detail.component.scss',
  providers: [InterviewStagesStore],
})
export class InterviewPrepDetailComponent implements OnInit {
  protected readonly store = inject(InterviewStagesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    add: Plus,
    chevron: ChevronDown,
    check: Check,
    delete: Trash2,
    user: User,
    close: X,
  };
  protected readonly STAGE_TYPES = STAGE_TYPES;
  protected readonly STAGE_STATUSES = STAGE_STATUSES;
  protected readonly LANGUAGES = LANGUAGES;

  protected readonly detailSummary = computed(() => {
    const total = this.store.stages().length;
    const upcoming = this.store.stages().filter((s) => s.status === 'scheduled').length;
    return this.t()('interview.detail_summary')
      .replace('{total}', String(total))
      .replace('{upcoming}', String(upcoming));
  });

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('applicationId'));
    if (!(await this.store.load(id))) this.toast.error(this.store.error());
  }

  protected back(): void {
    void this.router.navigate(['/interview-prep']);
  }

  /**
   * Still `en-GB` regardless of the active locale - one of five such sites,
   * filed as a defect and deliberately not fixed inside a migration. It stays
   * on the page because date formatting is locale-dependent presentation.
   */
  fmtDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  interviewerSummary(s: InterviewStage): string {
    return [s.interviewerName, s.interviewerRole].filter(Boolean).join(' · ');
  }

  /** A refusal says nothing: a blank label lights the field itself, and a save
   * already in flight has nothing to report. */
  protected async saveModal(): Promise<void> {
    const ok = await this.store.saveModal();
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('interview.saved'));
    else this.toast.error(this.store.error());
  }

  protected toggleStatusMenu(stage: InterviewStage, event: Event): void {
    event.stopPropagation();
    this.store.toggleStatusMenu(stage);
  }

  protected async setStatus(stage: InterviewStage, status: InterviewStageStatus): Promise<void> {
    if ((await this.store.setStatus(stage, status)) === false) {
      this.toast.error(this.store.error());
    }
  }

  protected async confirmDelete(): Promise<void> {
    const ok = await this.store.confirmDelete();
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('interview.stage_deleted'));
    else this.toast.error(this.store.error());
  }

  protected async moveUp(index: number): Promise<void> {
    if ((await this.store.moveUp(index)) === false) this.toast.error(this.store.error());
  }

  protected async moveDown(index: number): Promise<void> {
    if ((await this.store.moveDown(index)) === false) this.toast.error(this.store.error());
  }
}

// Interview Prep AI generation UI was removed intentionally (button hung on
// "Generating..." in native testing). Backend stays intact for a future,
// larger interview-prep section: InterviewGateway.listInterviewPrep /
// saveInterviewPrepBatch, the `interview_prep` table, and the
// interview-hr / interview-technical / star-r skills.
