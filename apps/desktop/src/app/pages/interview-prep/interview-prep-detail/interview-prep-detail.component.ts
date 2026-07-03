import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowDown, ArrowLeft, ArrowUp, LucideAngularModule, Pencil, Trash2 } from 'lucide-angular';
import {
  InterviewStage,
  InterviewStageStatus,
  PipelineCard,
  StageType,
  SupportedLanguage,
  UpdateInterviewStageInput,
} from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';

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

// Interview Prep detail: the full CRUD surface for one application's
// stages. Explicitly NOT a fixed template — the user adds as many stages
// as their real process has, in any order, with any wording.
@Component({
  selector: 'app-interview-prep-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './interview-prep-detail.component.html',
  styleUrl: './interview-prep-detail.component.scss',
})
export class InterviewPrepDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    edit: Pencil,
    delete: Trash2,
    up: ArrowUp,
    down: ArrowDown,
  };
  protected readonly STAGE_TYPES = STAGE_TYPES;
  protected readonly STAGE_STATUSES = STAGE_STATUSES;
  protected readonly LANGUAGES = LANGUAGES;

  protected readonly applicationId = signal(0);
  protected readonly application = signal<PipelineCard | null>(null);
  protected readonly stages = signal<InterviewStage[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly addForm = signal<StageFormValue>(emptyForm());
  protected readonly addBusy = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly editForm = signal<StageFormValue>(emptyForm());
  protected readonly editBusy = signal(false);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('applicationId'));
    this.applicationId.set(id);
    await this.load(id);
  }

  private async load(id: number): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [cards, stages] = await Promise.all([
        this.db.listPipelineCards(),
        this.db.listInterviewStages(id),
      ]);
      this.application.set(cards.find((c) => c.id === id) ?? null);
      this.stages.set(stages);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/interview-prep']);
  }

  protected updateAddForm<K extends keyof StageFormValue>(key: K, value: StageFormValue[K]): void {
    this.addForm.set({ ...this.addForm(), [key]: value });
  }

  protected updateEditForm<K extends keyof StageFormValue>(key: K, value: StageFormValue[K]): void {
    this.editForm.set({ ...this.editForm(), [key]: value });
  }

  protected async addStage(): Promise<void> {
    const form = this.addForm();
    const label = form.stageLabel.trim();
    if (!label || this.addBusy()) return;
    this.addBusy.set(true);
    try {
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
      this.addForm.set(emptyForm());
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.addBusy.set(false);
    }
  }

  protected startEdit(stage: InterviewStage): void {
    this.editingId.set(stage.id);
    this.editForm.set({
      stageType: stage.stageType,
      stageLabel: stage.stageLabel,
      scheduledAt: stage.scheduledAt ?? '',
      stageLanguage: stage.stageLanguage ?? '',
      interviewerName: stage.interviewerName ?? '',
      interviewerRole: stage.interviewerRole ?? '',
      interviewerEmail: stage.interviewerEmail ?? '',
      notes: stage.notes ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const id = this.editingId();
    if (id == null || this.editBusy()) return;
    const form = this.editForm();
    const label = form.stageLabel.trim();
    if (!label) return;
    this.editBusy.set(true);
    try {
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
      this.editingId.set(null);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.editBusy.set(false);
    }
  }

  protected async setStatus(stage: InterviewStage, status: InterviewStageStatus): Promise<void> {
    if (status === stage.status) return;
    const updated = await this.db.updateInterviewStage({ stageId: stage.id, status });
    this.stages.set(this.stages().map((s) => (s.id === stage.id ? updated : s)));
  }

  protected async deleteStage(stage: InterviewStage): Promise<void> {
    if (!confirm(this.t()('interview.confirm_delete'))) return;
    await this.db.deleteInterviewStage(stage.id);
    this.stages.set(this.stages().filter((s) => s.id !== stage.id));
  }

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
    const [updatedA, updatedB] = await Promise.all([
      this.db.updateInterviewStage({
        stageId: stageA.id,
        stageOrder: stageB.stageOrder,
      } as UpdateInterviewStageInput),
      this.db.updateInterviewStage({
        stageId: stageB.id,
        stageOrder: stageA.stageOrder,
      } as UpdateInterviewStageInput),
    ]);
    const next = [...list];
    next[a] = updatedB;
    next[b] = updatedA;
    next.sort((x, y) => x.stageOrder - y.stageOrder);
    this.stages.set(next);
  }
}
