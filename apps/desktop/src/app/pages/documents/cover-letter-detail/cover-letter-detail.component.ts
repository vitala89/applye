import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
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
  Sparkles,
} from 'lucide-angular';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
import type {
  CoverLetterAddress,
  CoverLetterBlockKey,
  CoverLetterContent,
  CoverLetterLength,
  CoverLetterStyle,
  CoverLetterTone,
  CvSectionStyle,
  DocumentLibraryItem,
  PageMargins,
  PageSettings,
  PageSize,
  StyleNote,
} from '@applye/core';
import {
  COVER_LETTER_BLOCK_KEYS,
  COVER_LETTER_LENGTH_DEFAULT,
  COVER_LETTER_LENGTH_TARGET,
  COVER_LETTER_LENGTHS,
  COVER_LETTER_STYLE_DEFAULT,
  COVER_LETTER_TONE_DEFAULT,
  COVER_LETTER_TONES,
  CV_ATS_SAFE_FONTS,
  PAGE_SETTINGS_DEFAULT,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import {
  cleanJsonText,
  effectiveCoverLetterBlockStyle,
  effectiveCoverLetterParagraphStyle,
  resolvePageSettings,
} from '../cv-content.util';

@Component({
  selector: 'app-cover-letter-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective, NgStyle, NgTemplateOutlet],
  templateUrl: './cover-letter-detail.component.html',
  styleUrl: './cover-letter-detail.component.scss',
})
export class CoverLetterDetailComponent implements OnDestroy {
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
    draft: Sparkles,
  };
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];
  protected readonly toneOptions = COVER_LETTER_TONES;
  protected readonly lengthOptions = COVER_LETTER_LENGTHS;
  protected readonly fontOptions = CV_ATS_SAFE_FONTS;
  protected readonly blockKeys = COVER_LETTER_BLOCK_KEYS;

  /** Which block/paragraph Style popover is open, if any — only one at a
   * time. A `CoverLetterBlockKey` for a block, or `body_<i>` for a paragraph. */
  readonly openStyleKey = signal<string | null>(null);

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
    tone: COVER_LETTER_TONE_DEFAULT,
    length: COVER_LETTER_LENGTH_DEFAULT,
  });

  readonly style = signal<CoverLetterStyle>({ ...COVER_LETTER_STYLE_DEFAULT });
  readonly styleNotes = signal<StyleNote[]>([]);
  private styleCheckTimer?: ReturnType<typeof setTimeout>;

  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly regeneratingBlock = signal<string | null>(null);
  readonly drafting = signal(false);

  /** AI voice / length, read straight off the persisted content. */
  readonly tone = computed<CoverLetterTone>(() => this.content().tone ?? COVER_LETTER_TONE_DEFAULT);
  readonly length = computed<CoverLetterLength>(
    () => this.content().length ?? COVER_LETTER_LENGTH_DEFAULT,
  );

  /** Live body word count (paragraphs only — the target is a body budget). */
  readonly wordCount = computed(
    () =>
      (this.content().bodyParagraphs ?? []).join(' ').trim().split(/\s+/).filter(Boolean).length,
  );

  /** 'under' | 'ok' | 'over' vs the selected length's word budget — drives the
   * badge colour so the user sees at a glance whether the draft fits. */
  readonly wordStatus = computed<'under' | 'ok' | 'over'>(() => {
    const target = COVER_LETTER_LENGTH_TARGET[this.length()];
    const n = this.wordCount();
    if (n < target.min) return 'under';
    if (n > target.max) return 'over';
    return 'ok';
  });

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CoverLetterDetailComponent.STYLE_NOTE_KEYS[note.kind]).replace(
      '{value}',
      note.detail,
    );
  }

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
      parsed.tone ??= COVER_LETTER_TONE_DEFAULT;
      parsed.length ??= COVER_LETTER_LENGTH_DEFAULT;
      this.content.set(parsed);

      const style: CoverLetterStyle = item.styleJson
        ? { ...COVER_LETTER_STYLE_DEFAULT, ...JSON.parse(item.styleJson) }
        : { ...COVER_LETTER_STYLE_DEFAULT };
      this.style.set(style);
      void this.refreshStyleNotes();
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

  setTone(tone: CoverLetterTone): void {
    this.content.set({ ...this.content(), tone });
  }

  setLength(length: CoverLetterLength): void {
    this.content.set({ ...this.content(), length });
  }

  updateStyle(patch: Partial<CoverLetterStyle>): void {
    this.style.set({ ...this.style(), ...patch });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  readonly marginSides: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'documents.cv_style_margin_top' },
    { key: 'right', label: 'documents.cv_style_margin_right' },
    { key: 'bottom', label: 'documents.cv_style_margin_bottom' },
    { key: 'left', label: 'documents.cv_style_margin_left' },
  ];

  /** Current 4-side margins in mm, already clamped by the resolver. */
  readonly currentMargin = computed<PageMargins>(
    () => resolvePageSettings(this.style().page).margin,
  );

  private updatePage(page: PageSettings): void {
    this.updateStyle({ page });
  }

  setMarginSide(side: keyof PageMargins, value: number): void {
    const clamped = Math.min(50, Math.max(0, Math.round(Number(value) || 0)));
    const cur = this.currentMargin();
    const size = this.style().page?.size ?? PAGE_SETTINGS_DEFAULT.size;
    this.updatePage({ size, margin: { ...cur, [side]: clamped } });
  }

  setPageSize(size: PageSize): void {
    this.updatePage({ size, margin: this.currentMargin() });
  }

  /** px per mm at 96dpi — fixes the on-screen sheet to real page proportions. */
  private static readonly PX_PER_MM = 96 / 25.4;

  /** Preview page geometry as CSS custom properties — real A4/Letter proportions
   * plus margins, consumed by the `.letter-sheet` in the template/SCSS. Mirrors
   * `pageVars` on `CvDetailComponent`. */
  readonly pageVars = computed(() => {
    const r = resolvePageSettings(this.style().page);
    const px = CoverLetterDetailComponent.PX_PER_MM;
    const w = r.widthMm * px;
    const h = r.heightMm * px;
    return {
      '--page-w': `${w}px`,
      '--page-h': `${h}px`,
      '--mt': `${r.margin.top * px}px`,
      '--mr': `${r.margin.right * px}px`,
      '--mb': `${r.margin.bottom * px}px`,
      '--ml': `${r.margin.left * px}px`,
    } as Record<string, string>;
  });

  /** The rendered sheet element — measured by `observeSheet()` for page count. */
  readonly sheetEl = viewChild<ElementRef<HTMLElement>>('letterSheet');
  readonly pageCount = signal(1);
  readonly blockOverflow = signal(false);

  private ro?: ResizeObserver;

  private observeSheet(): void {
    const el = this.sheetEl()?.nativeElement;
    if (!el) return;
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.recomputePages(el));
    this.ro.observe(el);
    this.recomputePages(el);
  }

  private recomputePages(el: HTMLElement): void {
    const r = resolvePageSettings(this.style().page);
    const px = CoverLetterDetailComponent.PX_PER_MM;
    const usableH = (r.heightMm - r.margin.top - r.margin.bottom) * px;
    const contentH = el.scrollHeight - (r.margin.top + r.margin.bottom) * px;
    this.pageCount.set(Math.max(1, Math.ceil(contentH / Math.max(1, usableH))));
    // Block-too-tall: any direct child taller than one usable page.
    const tooTall = Array.from(el.children).some(
      (c) => (c as HTMLElement).offsetHeight > usableH + 1,
    );
    this.blockOverflow.set(tooTall || usableH <= 0);
  }

  private readonly observeSheetEffect = effect(() => {
    // Re-run when previewMode flips to true (sheet enters the DOM) and when
    // the sheet element or page geometry changes.
    this.previewMode();
    this.pageVars();
    this.observeSheet();
  });

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  private async refreshStyleNotes(): Promise<void> {
    const notes = await this.db.checkStyleSafety(JSON.stringify(this.style()));
    const seen = new Set<string>();
    this.styleNotes.set(
      notes.filter((n) => {
        const key = `${n.kind}|${n.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  }

  /** Effective font/size/weight/colour for a block — its override merged over
   * the document-wide style. */
  effBlockStyle(key: CoverLetterBlockKey) {
    return effectiveCoverLetterBlockStyle(this.style(), key);
  }

  /** Bindable style object for a preview block's font/size/weight. */
  blockCss(key: CoverLetterBlockKey): Record<string, string> {
    return this.cssOf(this.effBlockStyle(key));
  }

  /** Effective style / bindable CSS for a single body paragraph (its
   * `body_<i>` override → `body` block → document-wide). */
  effParaStyle(index: number) {
    return effectiveCoverLetterParagraphStyle(this.style(), index);
  }

  paraCss(index: number): Record<string, string> {
    return this.cssOf(this.effParaStyle(index));
  }

  private cssOf(s: {
    fontFamily: string;
    fontSizePt: number;
    fontWeight: number;
  }): Record<string, string> {
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
    };
  }

  /** Style-override key for a body paragraph. */
  paragraphStyleKey(index: number): string {
    return `body_${index}`;
  }

  toggleStylePopover(key: string): void {
    this.openStyleKey.set(this.openStyleKey() === key ? null : key);
  }

  sectionOverride(key: string): CvSectionStyle | undefined {
    return this.style().sectionStyles?.[key];
  }

  setSectionStyle(key: string, patch: Partial<CvSectionStyle>): void {
    const current = this.style();
    const sectionStyles = { ...(current.sectionStyles ?? {}) };
    sectionStyles[key] = { ...(sectionStyles[key] ?? {}), ...patch };
    this.style.set({ ...current, sectionStyles });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  resetSectionStyle(key: string): void {
    const current = this.style();
    const sectionStyles = { ...(current.sectionStyles ?? {}) };
    delete sectionStyles[key];
    this.style.set({ ...current, sectionStyles });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** True when a block/paragraph carries any style override — drives the
   * "Custom" badge so the user can see which parts differ from the default. */
  hasCustomStyle(key: string): boolean {
    const o = this.style().sectionStyles?.[key];
    return !!o && Object.values(o).some((v) => v !== undefined && v !== null);
  }

  /** Any block/paragraph carries an override. */
  readonly hasAnyCustomStyle = computed(() => {
    const s = this.style().sectionStyles ?? {};
    return Object.values(s).some((o) => o && Object.values(o).some((v) => v != null));
  });

  /** Reset every block/paragraph and the document-wide style to the default. */
  resetAllStyles(): void {
    this.style.set({ ...COVER_LETTER_STYLE_DEFAULT });
    this.openStyleKey.set(null);
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  updateAddress(field: keyof CoverLetterAddress, value: string): void {
    const fresh = { ...this.content() };
    fresh.address = { ...fresh.address, [field]: value };
    this.content.set(fresh);
  }

  updateField(
    field: keyof Omit<
      CoverLetterContent,
      'address' | 'bodyParagraphs' | 'hashes' | 'tone' | 'length'
    >,
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
    if (this.openStyleKey() === this.paragraphStyleKey(index)) this.openStyleKey.set(null);
    this.reindexParagraphStyles(index, paragraphs.length);
  }

  /** After removing paragraph `removedAt`, shift every `body_<i>` style
   * override down one so overrides keep pointing at the right paragraph. */
  private reindexParagraphStyles(removedAt: number, newLength: number): void {
    const current = this.style();
    if (!current.sectionStyles) return;
    const next = { ...current.sectionStyles };
    delete next[this.paragraphStyleKey(removedAt)];
    for (let i = removedAt + 1; i <= newLength; i++) {
      const from = this.paragraphStyleKey(i);
      const to = this.paragraphStyleKey(i - 1);
      if (next[from]) {
        next[to] = next[from];
        delete next[from];
      } else {
        delete next[to];
      }
    }
    this.style.set({ ...current, sectionStyles: next });
  }

  /** Full-letter AI draft — fills every block in one pass honoring the current
   * tone + length. Populates the editor only; the user still reviews and Saves
   * (AI assists, the user decides — never auto-applied). */
  async draftWithAI(): Promise<void> {
    if (this.drafting() || this.regeneratingBlock()) return;
    const doc = this.doc();
    if (!doc) return;
    this.drafting.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) {
        throw new Error(this.t()('documents.cv_generate_no_profile'));
      }
      const language = doc.language ?? settings.defaultDocLanguage ?? 'en';
      const jd = this.content().jobDescription || 'General job application';

      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profile.fullMd,
        job_description: jd,
        language,
        section: 'all',
        tone: this.tone(),
        length: this.length(),
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = JSON.parse(cleanJsonText(res.text)) as CoverLetterContent;

      const prev = this.content();
      this.content.set({
        ...prev,
        address: parsed.address ?? {},
        date: parsed.date || prev.date,
        subject: parsed.subject ?? '',
        greeting: parsed.greeting ?? '',
        bodyParagraphs: parsed.bodyParagraphs ?? [],
        closing: parsed.closing ?? '',
        signature: parsed.signature ?? '',
        // Preserve user choices; fresh draft invalidates per-block caches.
        tone: prev.tone,
        length: prev.length,
        jobDescription: prev.jobDescription,
        hashes: {},
      });
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.drafting.set(false);
    }
  }

  async regenerateBlock(blockKey: string, index?: number): Promise<void> {
    if (this.regeneratingBlock() || this.drafting()) return;
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
      const tone = this.tone();
      const length = this.length();

      // Tone + length are part of the input identity — changing either must
      // bust the per-block cache, so they're folded into the hash.
      const hashInput = [profile.fullMd, jd, language, sectionName, tone, length].join('|');
      const sourceHash = await this.db.hashText(hashInput);

      const currentHashes = this.content().hashes || {};
      const currentBlockHash =
        index !== undefined
          ? (currentHashes.bodyParagraphs || [])[index]
          : (currentHashes as Record<string, string>)[blockKey];

      if (currentBlockHash === sourceHash) {
        this.regeneratingBlock.set(null);
        return;
      }

      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profile.fullMd,
        job_description: jd,
        language,
        section: sectionName,
        tone,
        length,
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

  /**
   * WYSIWYG PDF export via the OS print dialog. Injects a `@page` rule sized
   * from the current page settings, toggles `printing-cv` on `<body>` so the
   * print stylesheet isolates `.letter-sheet`, then invokes the standard DOM
   * `window.print()`. Tauri's webview plugin already overrides
   * `window.print` on macOS to route through its native print command (gated
   * by the `core:webview:allow-print` capability); on Windows/Linux the
   * webview's built-in print is used directly — no `@tauri-apps/api` import
   * is needed or available for this in the installed SDK version. Mirrors
   * `exportPdfWysiwyg` on `CvDetailComponent`.
   */
  async exportPdfWysiwyg(): Promise<void> {
    const r = resolvePageSettings(this.style().page);
    const rule =
      `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
      ` margin: ${r.margin.top}mm ${r.margin.right}mm ${r.margin.bottom}mm ${r.margin.left}mm; }`;
    let el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'wysiwyg-page-rule';
      document.head.appendChild(el);
    }
    el.textContent = rule;
    document.body.classList.add('printing-cv');
    try {
      window.print();
    } finally {
      document.body.classList.remove('printing-cv');
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
        styleJson: JSON.stringify(this.style()),
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
