import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  LucideAngularModule,
  Pencil,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-angular';
import {
  InterviewStage,
  InterviewStageStatus,
  PipelineCard,
  StageType,
  SupportedLanguage,
} from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';

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

interface StageFormValue {
  stageType: StageType;
  stageLabel: string;
  scheduledAt: string;
  stageLanguage: SupportedLanguage | '';
  interviewerName: string;
  interviewerRole: string;
  interviewerEmail: string;
  notes: string;
}

function emptyForm(): StageFormValue {
  return {
    stageType: 'hr_screen',
    stageLabel: '',
    scheduledAt: '',
    stageLanguage: '',
    interviewerName: '',
    interviewerRole: '',
    interviewerEmail: '',
    notes: '',
  };
}

// Interview Prep detail: the full CRUD surface for one application's stages,
// as a vertical timeline. Add/Edit happen in a modal (not an always-on form);
// delete is a styled confirm dialog. Stages are user-defined and unlimited.
@Component({
  selector: 'app-interview-prep-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './interview-prep-detail.component.html',
  styleUrl: './interview-prep-detail.component.scss',
})
export class InterviewPrepDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    add: Plus,
    chevron: ChevronDown,
    check: Check,
    up: ArrowUp,
    down: ArrowDown,
    edit: Pencil,
    delete: Trash2,
    user: User,
    close: X,
  };
  protected readonly STAGE_TYPES = STAGE_TYPES;
  protected readonly STAGE_STATUSES = STAGE_STATUSES;
  protected readonly LANGUAGES = LANGUAGES;

  protected readonly applicationId = signal(0);
  protected readonly application = signal<PipelineCard | null>(null);
  protected readonly stages = signal<InterviewStage[]>([]);
  protected readonly loading = signal(true);

  // modal (add / edit)
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<'add' | 'edit'>('add');
  protected readonly editingId = signal<number | null>(null);
  protected readonly form = signal<StageFormValue>(emptyForm());
  protected readonly labelError = signal(false);
  protected readonly saving = signal(false);

  // per-stage status dropdown + delete confirm
  protected readonly statusMenuId = signal<number | null>(null);
  protected readonly confirmStage = signal<InterviewStage | null>(null);

  protected readonly detailSummary = computed(() => {
    const total = this.stages().length;
    const upcoming = this.stages().filter((s) => s.status === 'scheduled').length;
    return this.t()('interview.detail_summary')
      .replace('{total}', String(total))
      .replace('{upcoming}', String(upcoming));
  });

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('applicationId'));
    this.applicationId.set(id);
    await this.load(id);
  }

  private async load(id: number): Promise<void> {
    this.loading.set(true);
    try {
      const [cards, stages] = await Promise.all([
        this.db.listPipelineCards(),
        this.db.listInterviewStages(id),
      ]);
      const application = cards.find((c) => c.id === id) ?? null;
      this.application.set(application);
      this.stages.set(stages);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/interview-prep']);
  }

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

  // ---------- modal ----------
  protected openAdd(): void {
    this.modalMode.set('add');
    this.editingId.set(null);
    this.form.set(emptyForm());
    this.labelError.set(false);
    this.modalOpen.set(true);
  }
  protected openEdit(stage: InterviewStage): void {
    this.statusMenuId.set(null);
    this.modalMode.set('edit');
    this.editingId.set(stage.id);
    this.form.set({
      stageType: stage.stageType,
      stageLabel: stage.stageLabel,
      scheduledAt: stage.scheduledAt ?? '',
      stageLanguage: stage.stageLanguage ?? '',
      interviewerName: stage.interviewerName ?? '',
      interviewerRole: stage.interviewerRole ?? '',
      interviewerEmail: stage.interviewerEmail ?? '',
      notes: stage.notes ?? '',
    });
    this.labelError.set(false);
    this.modalOpen.set(true);
  }
  protected closeModal(): void {
    this.modalOpen.set(false);
  }
  protected updateForm<K extends keyof StageFormValue>(key: K, value: StageFormValue[K]): void {
    this.form.set({ ...this.form(), [key]: value });
    if (key === 'stageLabel' && value) this.labelError.set(false);
  }

  protected async saveModal(): Promise<void> {
    if (this.saving()) return;
    const form = this.form();
    const label = form.stageLabel.trim();
    if (!label) {
      this.labelError.set(true);
      return;
    }
    this.saving.set(true);
    try {
      if (this.modalMode() === 'add') {
        const nextOrder = this.stages().reduce((max, s) => Math.max(max, s.stageOrder), 0) + 1;
        const stage = await this.db.createInterviewStage({
          applicationId: this.applicationId(),
          stageOrder: nextOrder,
          stageType: form.stageType,
          stageLabel: label,
          scheduledAt: form.scheduledAt || undefined,
          stageLanguage: form.stageLanguage || undefined,
          interviewerName: form.interviewerName || undefined,
          interviewerRole: form.interviewerRole || undefined,
          interviewerEmail: form.interviewerEmail || undefined,
          notes: form.notes || undefined,
        });
        this.stages.set([...this.stages(), stage]);
      } else {
        const id = this.editingId();
        if (id == null) return;
        const updated = await this.db.updateInterviewStage({
          stageId: id,
          stageType: form.stageType,
          stageLabel: label,
          scheduledAt: form.scheduledAt || undefined,
          stageLanguage: form.stageLanguage || undefined,
          interviewerName: form.interviewerName || undefined,
          interviewerRole: form.interviewerRole || undefined,
          interviewerEmail: form.interviewerEmail || undefined,
          notes: form.notes || undefined,
        });
        this.stages.set(this.stages().map((s) => (s.id === id ? updated : s)));
      }
      this.modalOpen.set(false);
      this.toast.success(this.t()('interview.saved'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- status menu ----------
  protected toggleStatusMenu(stage: InterviewStage, event: Event): void {
    event.stopPropagation();
    this.statusMenuId.update((m) => (m === stage.id ? null : stage.id));
  }
  protected closeMenus(): void {
    this.statusMenuId.set(null);
  }
  protected async setStatus(stage: InterviewStage, status: InterviewStageStatus): Promise<void> {
    this.statusMenuId.set(null);
    if (status === stage.status) return;
    try {
      const updated = await this.db.updateInterviewStage({ stageId: stage.id, status });
      this.stages.set(this.stages().map((s) => (s.id === stage.id ? updated : s)));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  // ---------- delete ----------
  protected askDelete(stage: InterviewStage): void {
    this.statusMenuId.set(null);
    this.confirmStage.set(stage);
  }
  protected cancelDelete(): void {
    this.confirmStage.set(null);
  }
  protected async confirmDelete(): Promise<void> {
    const stage = this.confirmStage();
    if (!stage) return;
    try {
      await this.db.deleteInterviewStage(stage.id);
      this.stages.set(this.stages().filter((s) => s.id !== stage.id));
      this.toast.success(this.t()('interview.stage_deleted'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.confirmStage.set(null);
    }
  }

  // ---------- reorder ----------
  protected async moveUp(index: number): Promise<void> {
    if (index <= 0) return;
    await this.swapOrder(index, index - 1);
  }
  protected async moveDown(index: number): Promise<void> {
    if (index >= this.stages().length - 1) return;
    await this.swapOrder(index, index + 1);
  }
  private async swapOrder(a: number, b: number): Promise<void> {
    const list = this.stages();
    const stageA = list[a];
    const stageB = list[b];
    try {
      const [updatedA, updatedB] = await Promise.all([
        this.db.updateInterviewStage({ stageId: stageA.id, stageOrder: stageB.stageOrder }),
        this.db.updateInterviewStage({ stageId: stageB.id, stageOrder: stageA.stageOrder }),
      ]);
      const next = [...list];
      next[a] = updatedB;
      next[b] = updatedA;
      next.sort((x, y) => x.stageOrder - y.stageOrder);
      this.stages.set(next);
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}

// Interview Prep AI generation UI was removed intentionally (button hung on
// "Generating..." in native testing). Backend stays intact for a future,
// larger interview-prep section: DbService.listInterviewPrep /
// saveInterviewPrepBatch, the `interview_prep` table, and the
// interview-hr / interview-technical / star-r skills.
