import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ArrowLeft,
  LucideAngularModule,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Check,
  Eye,
  Pencil,
} from 'lucide-angular';
import type { CoverLetterAddress, CoverLetterContent, DocumentLibraryItem } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { cleanJsonText } from '../cv-content.util';

@Component({
  selector: 'app-cover-letter-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './cover-letter-detail.component.html',
  styleUrl: './cover-letter-detail.component.scss',
})
export class CoverLetterDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    save: Save,
    regenerate: RefreshCw,
    plus: Plus,
    trash: Trash2,
    check: Check,
    preview: Eye,
    edit: Pencil,
  };
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);
  readonly previewMode = signal(false);

  readonly content = signal<CoverLetterContent>({
    address: {},
    date: '',
    subject: '',
    greeting: '',
    bodyParagraphs: [],
    closing: '',
    signature: '',
  });

  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly regeneratingBlock = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const item = await this.db.documentLibraryGet(id);
      if (!item) {
        this.loadError.set(true);
        return;
      }
      this.doc.set(item);
      this.label.set(item.label ?? '');
      this.regionTag.set(item.regionTag ?? 'generic');
      this.isDefault.set(item.isDefault);

      const parsed: CoverLetterContent = item.contentJson
        ? JSON.parse(item.contentJson)
        : {
            address: {},
            date: '',
            subject: '',
            greeting: '',
            bodyParagraphs: [],
            closing: '',
            signature: '',
          };
      this.content.set(parsed);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  back(): void {
    if (this.shouldReturnToApplyWizard()) {
      void this.returnToApplyWizard(false);
      return;
    }
    void this.router.navigate(['/documents'], { queryParams: { tab: 'cover-letter' } });
  }

  private shouldReturnToApplyWizard(): boolean {
    return this.route.snapshot.queryParamMap.get('returnTo') === 'applyWizard';
  }

  private returnToApplyWizard(documentSaved: boolean): Promise<boolean> {
    const params = this.route.snapshot.queryParamMap;
    const jobId = params.get('jobId');
    if (!jobId) {
      return this.router.navigate(['/documents'], { queryParams: { tab: 'cover-letter' } });
    }
    return this.router.navigate(['/jobs', jobId], {
      queryParams: {
        returnTo: 'applyWizard',
        wizardStep: 'documents',
        documentType: 'cover_letter',
        documentId: this.doc()?.id ?? params.get('documentId'),
        reviewHash: params.get('reviewHash'),
        documentSaved: documentSaved ? '1' : '0',
      },
    });
  }

  updateAddress(field: keyof CoverLetterAddress, value: string): void {
    const fresh = { ...this.content() };
    fresh.address = { ...fresh.address, [field]: value };
    this.content.set(fresh);
  }

  updateField(
    field: keyof Omit<CoverLetterContent, 'address' | 'bodyParagraphs' | 'hashes'>,
    value: string,
  ): void {
    const fresh = { ...this.content(), [field]: value };
    this.content.set(fresh);
  }

  updateParagraph(index: number, value: string): void {
    const fresh = { ...this.content() };
    const paragraphs = [...(fresh.bodyParagraphs || [])];
    paragraphs[index] = value;
    fresh.bodyParagraphs = paragraphs;
    this.content.set(fresh);
  }

  addParagraph(): void {
    const fresh = { ...this.content() };
    fresh.bodyParagraphs = [...(fresh.bodyParagraphs || []), ''];
    this.content.set(fresh);
  }

  removeParagraph(index: number): void {
    const fresh = { ...this.content() };
    const paragraphs = [...(fresh.bodyParagraphs || [])];
    paragraphs.splice(index, 1);
    fresh.bodyParagraphs = paragraphs;
    this.content.set(fresh);
  }

  async regenerateBlock(blockKey: string, index?: number): Promise<void> {
    if (this.regeneratingBlock()) return;
    const doc = this.doc();
    if (!doc) return;

    const sectionName = index !== undefined ? `body_${index}` : blockKey;
    this.regeneratingBlock.set(sectionName);

    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) {
        throw new Error(this.t()('documents.cv_generate_no_profile'));
      }

      const language = doc.language ?? settings.defaultDocLanguage ?? 'en';
      const jd = this.content().jobDescription || 'General job application';

      // Compute input hash for this block
      const hashInput = [profile.fullMd, jd, language, sectionName].join('|');
      const sourceHash = await this.db.hashText(hashInput);

      // Check cache by block hash
      const currentHashes = this.content().hashes || {};
      const currentBlockHash =
        index !== undefined
          ? (currentHashes.bodyParagraphs || [])[index]
          : (currentHashes as Record<string, string>)[blockKey];

      if (currentBlockHash === sourceHash) {
        // Cached block is already identical, skip rerun
        this.regeneratingBlock.set(null);
        return;
      }

      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profile.fullMd,
        job_description: jd,
        language,
        section: sectionName,
      });

      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });

      const rawText = cleanJsonText(res.text);
      const parsed = JSON.parse(rawText);

      const freshContent = { ...this.content() };
      if (!freshContent.hashes) freshContent.hashes = {};

      if (blockKey === 'subject') {
        freshContent.subject = parsed.subject || '';
        freshContent.hashes.subject = sourceHash;
      } else if (blockKey === 'greeting') {
        freshContent.greeting = parsed.greeting || '';
        freshContent.hashes.greeting = sourceHash;
      } else if (blockKey === 'closing') {
        freshContent.closing = parsed.closing || '';
        freshContent.hashes.closing = sourceHash;
      } else if (blockKey === 'signature') {
        freshContent.signature = parsed.signature || '';
        freshContent.hashes.signature = sourceHash;
      } else if (blockKey === 'body' && index !== undefined) {
        const freshParagraphs = [...(freshContent.bodyParagraphs || [])];
        if (parsed.bodyParagraphs && parsed.bodyParagraphs[index]) {
          freshParagraphs[index] = parsed.bodyParagraphs[index];
        }
        freshContent.bodyParagraphs = freshParagraphs;
        if (!freshContent.hashes.bodyParagraphs) freshContent.hashes.bodyParagraphs = [];
        freshContent.hashes.bodyParagraphs[index] = sourceHash;
      }

      this.content.set(freshContent);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.regeneratingBlock.set(null);
    }
  }

  async save(): Promise<void> {
    const doc = this.doc();
    if (!doc || this.saving()) return;
    this.saving.set(true);
    try {
      if (this.isDefault()) {
        const siblings = await this.db.documentLibraryList('cover_letter');
        for (const sibling of siblings) {
          if (
            sibling.id !== doc.id &&
            sibling.isDefault &&
            sibling.regionTag === this.regionTag()
          ) {
            await this.db.documentLibraryUpsert({ ...sibling, id: sibling.id, isDefault: false });
          }
        }
      }

      const saved = await this.db.documentLibraryUpsert({
        id: doc.id,
        docType: 'cover_letter',
        source: doc.source,
        label: this.label(),
        contentJson: JSON.stringify(this.content()),
        styleJson: doc.styleJson,
        regionTag: this.regionTag(),
        language: doc.language,
        archetypeTag: doc.archetypeTag,
        isDefault: this.isDefault(),
        inputHash: doc.inputHash,
        modelUsed: doc.modelUsed,
        tokensInput: doc.tokensInput,
        tokensOutput: doc.tokensOutput,
      });
      this.doc.set(saved);
      this.justSaved.set(true);
      if (this.shouldReturnToApplyWizard()) {
        await this.returnToApplyWizard(true);
        return;
      }
      setTimeout(() => this.justSaved.set(false), 2500);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }
}
