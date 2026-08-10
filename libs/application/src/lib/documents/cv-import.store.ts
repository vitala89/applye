import { Injectable, inject, signal } from '@angular/core';
import type {
  CvParsedContent,
  CvTemplate,
  DocumentLibraryItem,
  SupportedLanguage,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import type { CvCodec } from './cv-codec';

/**
 * What reading the picked file produced. Each is a different thing on screen,
 * and none of them is a sentence here.
 *
 * - `busy` - a parse is already running; a refusal.
 * - `existing` - this exact file was imported before. `existingId` says which
 *   document, for the page to open. A refusal to do the work again, not an
 *   error, and deliberately cheap: it is decided from the hash, before the AI
 *   call that would otherwise be paid for a second time.
 * - `parsed` - the preview step is populated and ready to confirm.
 * - `failed` - `error` carries what went wrong.
 */
export type CvImportOutcome = 'busy' | 'existing' | 'parsed' | 'failed';

/** What saving the previewed CV did. */
export type CvImportSaveOutcome = 'busy' | 'saved' | 'failed';

/** What the page must name, because naming needs translations. */
export interface CvImportLabels {
  /** Used when the uploaded CV carries no full name to take a label from. */
  untitled: string;
}

const DEFAULT_REGION_TAG = 'de';

/**
 * The "import my own CV" modal: upload a file, let the `cv-import` skill read
 * it, check the preview, save it to the library.
 *
 * **The file dialog is the page's.** No file under `libs/` imports a Tauri
 * plugin, so the page picks a path and `parseFile` takes it from there.
 *
 * **It never throws**, in line with the convention this campaign settled: a
 * store answers with an outcome, and the page turns each outcome into its own
 * sentence (ADR-0005, amendment thirty-nine).
 */
@Injectable()
export class CvImportStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly open = signal(false);
  readonly step = signal<'pick' | 'preview' | 'done'>('pick');
  readonly busy = signal(false);
  readonly error = signal('');

  readonly parsed = signal<CvParsedContent | null>(null);
  readonly inputHash = signal('');
  readonly label = signal('');
  readonly regionTag = signal(DEFAULT_REGION_TAG);
  readonly language = signal<SupportedLanguage>('en');
  readonly templateId = signal<number | null>(null);

  /** Set by an `existing` outcome, for the page to navigate to. */
  readonly existingId = signal<number | null>(null);

  /** Opens on a clean slate. Whatever a previous attempt failed at is gone. */
  start(): void {
    this.step.set('pick');
    this.error.set('');
    this.parsed.set(null);
    this.existingId.set(null);
    this.open.set(true);
  }

  cancel(): void {
    this.open.set(false);
  }

  /**
   * Reads the file the page chose, and either recognises it as one already in
   * the library or has the `cv-import` skill parse it into the preview step.
   *
   * `cvs` and `templates` arrive from `CvListStore`, which loaded them once for
   * the whole screen.
   */
  async parseFile(
    path: string,
    cvs: readonly DocumentLibraryItem[],
    templates: readonly CvTemplate[],
    labels: CvImportLabels,
    codec: CvCodec,
  ): Promise<CvImportOutcome> {
    this.error.set('');
    if (this.busy()) return 'busy';
    this.busy.set(true);
    try {
      const file = await this.db.cvImportReadFile(path);

      const existing = cvs.find((c) => c.source === 'uploaded' && c.inputHash === file.inputHash);
      if (existing) {
        this.existingId.set(existing.id);
        this.open.set(false);
        return 'existing';
      }

      const settings = await this.db.getSettings();
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', {
        cv_text: file.text,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });

      const parsed = codec.parse(res.text);
      this.parsed.set(parsed);
      this.inputHash.set(file.inputHash);
      this.label.set(parsed.personalDetails.fullName ?? labels.untitled);
      this.language.set(settings.defaultDocLanguage ?? 'en');
      this.templateId.set(this.defaultTemplate(templates)?.id ?? null);
      this.step.set('preview');
      return 'parsed';
    } catch (e) {
      this.error.set(String(e));
      return 'failed';
    } finally {
      this.busy.set(false);
    }
  }

  /** Writes the previewed CV to the library. `busy` also covers "nothing was
   * parsed", because there is no preview to confirm without one. */
  async save(templates: readonly CvTemplate[], codec: CvCodec): Promise<CvImportSaveOutcome> {
    this.error.set('');
    const parsed = this.parsed();
    if (!parsed || this.busy()) return 'busy';
    this.busy.set(true);
    try {
      const template = templates.find((tpl) => tpl.id === this.templateId()) ?? null;
      const content = codec.buildContent(parsed, template);
      await this.db.documentLibraryUpsert({
        docType: 'cv',
        source: 'uploaded',
        label: this.label(),
        contentJson: JSON.stringify(content),
        templateId: template?.id,
        regionTag: this.regionTag(),
        language: this.language(),
        inputHash: this.inputHash(),
      });
      this.step.set('done');
      return 'saved';
    } catch (e) {
      this.error.set(String(e));
      return 'failed';
    } finally {
      this.busy.set(false);
    }
  }

  /** The template matching the chosen region, or the first one there is. */
  private defaultTemplate(templates: readonly CvTemplate[]): CvTemplate | null {
    return templates.find((tpl) => tpl.regionTag === this.regionTag()) ?? templates[0] ?? null;
  }
}
