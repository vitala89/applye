import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  LucideAngularModule,
  Pencil,
  RefreshCw,
  Save,
  Check,
  Info,
  Sparkles,
  Plus,
  X,
  Trash2,
} from 'lucide-angular';
import type {
  CvContent,
  CvSection,
  CvSectionKey,
  CvSectionStyle,
  CvStyle,
  CvTemplate,
  CvTextStyle,
  DocumentLibraryItem,
  PageMargins,
  PageSettings,
  PageSize,
  PhotoPlacement,
  StyleNote,
} from '@applye/core';
import {
  CV_ATS_SAFE_FONTS,
  CV_STYLE_DEFAULT,
  PAGE_SETTINGS_DEFAULT,
  getBuiltinTheme,
  themeStyleSeed,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { CvPhotoCropComponent } from './cv-photo-crop/cv-photo-crop.component';
import { CvPreviewComponent } from './cv-preview/cv-preview.component';
import { CvSummaryEditorComponent } from './section-editors/cv-summary-editor.component';
import { CvLanguagesEditorComponent } from './section-editors/cv-languages-editor.component';
import { CvSkillsEditorComponent } from './section-editors/cv-skills-editor.component';
import { CvEducationEditorComponent } from './section-editors/cv-education-editor.component';
import { CvExperienceEditorComponent } from './section-editors/cv-experience-editor.component';
import { CvPersonalDetailsEditorComponent } from './section-editors/cv-personal-details-editor.component';
import {
  cvFieldAtsNoteKeys,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvSkillResponse,
  REGENERATABLE_SECTION_KEYS,
  resolvePageSettings,
  sectionLabelKey,
} from '../cv-content.util';

/** Merges an incoming profile field into the current personal-details value,
 * ignoring empty/whitespace-only incoming values so a blank field from the
 * model never overwrites an existing value. */
export function mergePersonalField<T extends string | undefined>(
  incoming: string | null | undefined,
  current: T,
): string | T {
  return incoming && incoming.trim() ? incoming : current;
}

@Component({
  selector: 'app-cv-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    ButtonDirective,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NgTemplateOutlet,
    CvPhotoCropComponent,
    CvPreviewComponent,
    CvSummaryEditorComponent,
    CvLanguagesEditorComponent,
    CvSkillsEditorComponent,
    CvEducationEditorComponent,
    CvExperienceEditorComponent,
    CvPersonalDetailsEditorComponent,
  ],
  templateUrl: './cv-detail.component.html',
  styleUrl: './cv-detail.component.scss',
})
export class CvDetailComponent {
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
    preview: Eye,
    edit: Pencil,
    check: Check,
    info: Info,
    dragHandle: GripVertical,
    moveUp: ChevronUp,
    moveDown: ChevronDown,
    chevron: ChevronDown,
    sparkles: Sparkles,
    plus: Plus,
    close: X,
    trash: Trash2,
  };
  protected readonly regeneratableKeys = REGENERATABLE_SECTION_KEYS;
  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];

  readonly regionOptions = computed(() =>
    this.regionTags.map((tag) => ({
      tag,
      label: `${tag.toUpperCase()} — ${this.t()(`documents.cv_region_${tag}`)}`,
    })),
  );

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);
  readonly sections = signal<CvSection[]>([]);
  readonly templates = signal<CvTemplate[]>([]);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);
  readonly includePhoto = signal(false);
  readonly photoDataUri = signal<string | null>(null);
  readonly photoPlacement = signal<PhotoPlacement>('above_left');
  readonly photoPlacementOptions: { value: PhotoPlacement; labelKey: string }[] = [
    { value: 'above_left', labelKey: 'documents.cv_photo_placement_left' },
    { value: 'above_center', labelKey: 'documents.cv_photo_placement_center' },
    { value: 'above_right', labelKey: 'documents.cv_photo_placement_right' },
  ];
  /** Non-null while the crop modal is open, holding the freshly picked source image. */
  readonly cropSourceUri = signal<string | null>(null);
  readonly includeBirthdate = signal(false);
  readonly includeMaritalStatus = signal(false);

  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly regeneratingKey = signal<CvSectionKey | null>(null);
  readonly pullingProfile = signal(false);

  readonly atsNoteKeys = computed(() =>
    cvFieldAtsNoteKeys(
      {
        includePhoto: this.includePhoto(),
        includeBirthdate: this.includeBirthdate(),
        includeMaritalStatus: this.includeMaritalStatus(),
      },
      this.regionTag(),
    ),
  );

  readonly saveTemplateOpen = signal(false);
  readonly saveTemplateName = signal('');
  readonly savingTemplate = signal(false);

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;
  readonly style = signal<CvStyle>(CV_STYLE_DEFAULT);
  readonly themeId = signal<number>(1);
  readonly activeTheme = computed(() => getBuiltinTheme(this.themeId()));
  /** The clean baseline for the active theme: document defaults with the
   * theme's four base tokens (font/size/weight/accent) applied. "Custom" and
   * "Reset styles" are measured against THIS, not the hard-coded Classic
   * default — so a pristine Aurora doc reads as "Aurora", not "Custom", and
   * Reset returns to the selected theme. */
  readonly themeBaseStyle = computed<CvStyle>(() => ({
    ...CV_STYLE_DEFAULT,
    ...themeStyleSeed(this.activeTheme()),
  }));
  readonly styleNotes = signal<StyleNote[]>([]);
  private styleCheckTimer?: ReturnType<typeof setTimeout>;

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CvDetailComponent.STYLE_NOTE_KEYS[note.kind]).replace('{value}', note.detail);
  }

  updateStyle(patch: Partial<CvStyle>): void {
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

  /** True when any single atom is taller than one usable page — mirrored up
   * from `<app-cv-preview>`'s `(blockOverflow)` output (which itself tracks
   * `<lib-paginated-sheet>`'s own `(blockOverflow)` output). */
  readonly blockOverflow = signal(false);

  private async refreshStyleNotes(): Promise<void> {
    const notes = await this.db.checkStyleSafety(JSON.stringify(this.style()));
    // Global + per-section safety checks can surface the same (kind, detail)
    // more than once (e.g. a Light global weight plus overridden sections);
    // collapse duplicates so each distinct warning shows once.
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

  /** Which section's "Style" popover is open, if any — only one at a time. */
  readonly openStyleKey = signal<CvSectionKey | null>(null);

  toggleStylePopover(key: CvSectionKey): void {
    this.openStyleKey.set(this.openStyleKey() === key ? null : key);
  }

  /** Per-section collapse state for the content-section accordion — session
   * only (not persisted); every section starts expanded (an empty set means
   * nothing is collapsed). */
  readonly collapsedSections = signal<Set<CvSectionKey>>(new Set());

  isSectionOpen(key: CvSectionKey): boolean {
    return !this.collapsedSections().has(key);
  }

  toggleSectionCollapse(key: CvSectionKey): void {
    const next = new Set(this.collapsedSections());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsedSections.set(next);
  }

  /** Collapse state for the "Style" card — open by default. */
  readonly styleOpen = signal(true);

  toggleStyleOpen(): void {
    this.styleOpen.set(!this.styleOpen());
  }

  /** The section's own style override, if any — used by the popover template
   * (`stylePopover`), which is parameterized by key via `ngTemplateOutlet`
   * and so can't index `sectionStyles` directly without losing type safety. */
  sectionOverride(key: CvSectionKey): CvSectionStyle | undefined {
    return this.style().sectionStyles?.[key];
  }

  setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void {
    const current = this.style();
    const sectionStyles = { ...(current.sectionStyles ?? {}) };
    sectionStyles[key] = { ...(sectionStyles[key] ?? {}), ...patch };
    this.style.set({ ...current, sectionStyles });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** Deep-merge a patch into a section's title override (a nested object that
   * `setSectionStyle`'s shallow merge would otherwise replace wholesale). */
  setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void {
    const current = this.style();
    const existing = current.sectionStyles?.[key]?.title ?? {};
    this.setSectionStyle(key, { title: { ...existing, ...patch } });
  }

  /** Deep-merge a patch into the document-wide title style (template
   * expressions can't spread, so the merge happens here). */
  updateTitleStyle(patch: Partial<CvTextStyle>): void {
    this.updateStyle({ titleStyle: { ...(this.style().titleStyle ?? {}), ...patch } });
  }

  resetSectionStyle(key: CvSectionKey): void {
    const current = this.style();
    const sectionStyles = { ...(current.sectionStyles ?? {}) };
    delete sectionStyles[key];
    this.style.set({ ...current, sectionStyles });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** True when a section carries any style override — drives the "Custom"
   * badge so the user can see which sections differ from the default. */
  hasCustomStyle(key: CvSectionKey): boolean {
    const o = this.style().sectionStyles?.[key];
    return !!o && Object.values(o).some((v) => v !== undefined && v !== null);
  }

  /** True when the style differs from the active theme's baseline in any way —
   * a document-wide field (body font/size/weight/colour, title style, title
   * line, page geometry) OR a per-section override. Drives the "Reset styles"
   * button's enabled state and the "Custom" badge, so both react to global
   * changes, not only per-section ones. A pristine doc on a theme is NOT
   * custom (badge shows the theme name instead). */
  readonly hasAnyCustomStyle = computed(() => {
    const s = this.style();
    const d = this.themeBaseStyle();
    const nonEmpty = (o: Record<string, unknown> | undefined): boolean =>
      !!o && Object.values(o).some((v) => v != null);
    const sectionCustom = Object.values(s.sectionStyles ?? {}).some(
      (o) =>
        o &&
        Object.values(o).some((v) =>
          v && typeof v === 'object' ? nonEmpty(v as Record<string, unknown>) : v != null,
        ),
    );
    return (
      s.fontFamily !== d.fontFamily ||
      s.fontSizePt !== d.fontSizePt ||
      s.fontWeight !== d.fontWeight ||
      s.accentColorHex !== d.accentColorHex ||
      !!s.titleBorder ||
      nonEmpty(s.titleStyle as Record<string, unknown> | undefined) ||
      sectionCustom
    );
  });

  /** Reset every section and the document-wide style back to the active
   * theme's baseline (not the hard-coded Classic default). */
  resetAllStyles(): void {
    this.style.set({ ...this.themeBaseStyle() });
    this.openStyleKey.set(null);
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  /** Switch theme: reseed the four base tokens to the theme's defaults but keep
   * the user's explicit per-section overrides, title style, title border, and
   * page geometry. */
  selectTheme(id: number): void {
    this.themeId.set(id);
    const seed = themeStyleSeed(getBuiltinTheme(id));
    this.style.set({ ...this.style(), ...seed });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  readonly previewMode = signal(false);

  togglePreview(): void {
    this.previewMode.set(!this.previewMode());
  }

  /**
   * WYSIWYG PDF export via the OS print dialog. Injects a `@page` rule sized
   * from the current page settings, toggles `printing-cv` on `<body>` so the
   * print stylesheet isolates `.cvpreview`, then invokes the standard DOM
   * `window.print()`. Tauri's webview plugin already overrides
   * `window.print` on macOS to route through its native print command (gated
   * by the `core:webview:allow-print` capability); on Windows/Linux the
   * webview's built-in print is used directly — no `@tauri-apps/api` import
   * is needed or available for this in the installed SDK version.
   */
  async exportPdfWysiwyg(): Promise<void> {
    const r = resolvePageSettings(this.style().page);
    // margin: 0 — each `.page-card` keeps its own per-side padding (the
    // simulated margins) and is forced to exactly one physical page in the
    // print stylesheet, so the printed page count matches the preview's
    // page-cards 1:1. A non-zero @page margin here would double the margin
    // and let the browser re-paginate, drifting from the preview.
    const rule = `@page { size: ${r.widthMm}mm ${r.heightMm}mm; margin: 0; }`;
    let el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'wysiwyg-page-rule';
      document.head.appendChild(el);
    }
    el.textContent = rule;
    // Native macOS print (Tauri) is async: window.print() returns before the
    // page is rendered for print, so removing the class synchronously would
    // strip the print styles before the snapshot and capture the whole app.
    // Keep the class on and clear it on `afterprint`. Every `body.printing-cv`
    // rule lives inside `@media print`, so a lingering class has no on-screen
    // effect if `afterprint` never fires.
    const clearPrinting = (): void => {
      document.body.classList.remove('printing-cv');
      window.removeEventListener('afterprint', clearPrinting);
    };
    window.addEventListener('afterprint', clearPrinting);
    document.body.classList.add('printing-cv');
    window.print();
  }

  constructor() {
    void this.load();
  }

  private personalDetailsSection(): Extract<CvSection, { key: 'personal_details' }> | undefined {
    return this.sections().find(
      (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
    );
  }

  async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [item, templates] = await Promise.all([
        this.db.documentLibraryGet(id),
        this.db.cvTemplatesList(),
      ]);
      if (!item) {
        this.loadError.set(true);
        return;
      }
      this.doc.set(item);
      this.templates.set(templates);
      this.label.set(item.label ?? '');
      this.regionTag.set(item.regionTag ?? 'generic');
      this.isDefault.set(item.isDefault);

      const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
      const content = normalizeCvContent(raw);
      const ordered = [...content.sections].sort((a, b) => a.order - b.order);
      this.sections.set(ordered);

      const photo = ordered.find((s) => s.key === 'photo') as
        | Extract<CvSection, { key: 'photo' }>
        | undefined;
      this.includePhoto.set(photo?.visible ?? false);
      this.photoDataUri.set(photo?.dataUri ?? null);
      this.photoPlacement.set(photo?.placement ?? 'above_left');
      const personal = ordered.find(
        (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
      );
      this.includeBirthdate.set(!!personal?.birthDate);
      this.includeMaritalStatus.set(!!personal?.maritalStatus);

      const themeId = item.themeId ?? 1;
      this.themeId.set(themeId);
      const seed = themeStyleSeed(getBuiltinTheme(themeId));
      const style: CvStyle = item.styleJson
        ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(item.styleJson) }
        : { ...CV_STYLE_DEFAULT, ...seed };
      this.style.set(style);
      await this.refreshStyleNotes();
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
    void this.router.navigate(['/documents']);
  }

  private shouldReturnToApplyWizard(): boolean {
    return this.route.snapshot.queryParamMap.get('returnTo') === 'applyWizard';
  }

  private returnToApplyWizard(documentSaved: boolean): Promise<boolean> {
    const params = this.route.snapshot.queryParamMap;
    const jobId = params.get('jobId');
    if (!jobId) return this.router.navigate(['/documents']);
    return this.router.navigate(['/jobs', jobId], {
      queryParams: {
        returnTo: 'applyWizard',
        wizardStep: 'documents',
        documentType: 'cv',
        documentId: this.doc()?.id ?? params.get('documentId'),
        reviewHash: params.get('reviewHash'),
        documentSaved: documentSaved ? '1' : '0',
      },
    });
  }

  /** Header sections whose position is fixed — they carry the document's
   *  identity (photo + personal details) and must stay pinned to the top,
   *  so reordering (drag or move buttons) is disabled for them. */
  private static readonly LOCKED_SECTION_KEYS: readonly CvSectionKey[] = [
    'photo',
    'personal_details',
  ];

  isSectionLocked(key: CvSectionKey): boolean {
    return CvDetailComponent.LOCKED_SECTION_KEYS.includes(key);
  }

  /** Pins the locked header sections to the top in their canonical order
   *  (photo, then personal_details), leaving the rest in their given order,
   *  then reassigns the `order` index. Guarantees a reorder can never move a
   *  locked section or push another section above it. */
  private pinLockedSections(list: CvSection[]): CvSection[] {
    const locked = CvDetailComponent.LOCKED_SECTION_KEYS.map((k) =>
      list.find((s) => s.key === k),
    ).filter((s): s is CvSection => !!s);
    const rest = list.filter((s) => !this.isSectionLocked(s.key));
    return [...locked, ...rest].map((s, index) => ({ ...s, order: index }));
  }

  drop(event: CdkDragDrop<CvSection[]>): void {
    const list = this.sections().slice();
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.sections.set(this.pinLockedSections(list));
  }

  private moveSection(key: CvSectionKey, offset: -1 | 1): void {
    if (this.isSectionLocked(key)) return;
    const list = this.sections().slice();
    const index = list.findIndex((s) => s.key === key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= list.length) return;
    // Never swap a movable section past a locked header section.
    if (this.isSectionLocked(list[target].key)) return;
    moveItemInArray(list, index, target);
    this.sections.set(this.pinLockedSections(list));
  }

  moveSectionUp(key: CvSectionKey): void {
    this.moveSection(key, -1);
  }

  moveSectionDown(key: CvSectionKey): void {
    this.moveSection(key, 1);
  }

  /** Swaps a single section by key with a new immutable value — the sink for
   * extracted section-editor children's `(sectionChange)` output (e.g.
   * `CvSummaryEditorComponent`, `CvLanguagesEditorComponent`). */
  replaceSection(updated: CvSection): void {
    this.sections.update((list) => list.map((s) => (s.key === updated.key ? updated : s)));
  }

  async regenerateSection(key: CvSectionKey): Promise<void> {
    if (this.regeneratingKey()) return;
    const doc = this.doc();
    if (!doc) return;
    this.regeneratingKey.set(key);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));

      const language = doc.language ?? settings.defaultDocLanguage ?? 'en';
      const regionTag = this.regionTag();
      const archetypeTag = doc.archetypeTag ?? 'generalist';

      const hashInput = [profile.fullMd, regionTag, archetypeTag, language, key].join('|');
      const sourceHash = await this.db.hashText(hashInput);
      const current = this.sections().find((s) => s.key === key);
      if (current?.sourceHash === sourceHash) {
        return;
      }

      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: profile.scoringJson ?? '{}',
        region_tag: regionTag,
        archetype_tag: archetypeTag,
        language,
        section: key,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);
      const updated = mergeRegeneratedSection(
        { sections: this.sections() },
        key,
        parsed,
        sourceHash,
      );
      this.sections.set(updated.sections);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.regeneratingKey.set(null);
    }
  }

  async pullFromProfile(): Promise<void> {
    if (this.pullingProfile()) return;
    const personal = this.personalDetailsSection();
    if (!personal) return;
    this.pullingProfile.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));
      const language = this.doc()?.language ?? settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: profile.scoringJson ?? '{}',
        region_tag: this.regionTag(),
        archetype_tag: this.doc()?.archetypeTag ?? 'generalist',
        language,
        section: 'personalDetails',
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);
      const p = parsed.personalDetails;
      personal.fullName = mergePersonalField(p.fullName, personal.fullName);
      personal.title = mergePersonalField(p.title, personal.title);
      personal.email = mergePersonalField(p.email, personal.email);
      personal.phone = mergePersonalField(p.phone, personal.phone);
      personal.address = mergePersonalField(p.address, personal.address);
      personal.website = mergePersonalField(p.website, personal.website);
      personal.linkedin = mergePersonalField(p.linkedin, personal.linkedin);
      this.sections.set([...this.sections()]);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.pullingProfile.set(false);
    }
  }

  /** Opens a native file picker for an image, reads it via the backend into a
   * data URI, then opens the crop modal on that source image. */
  async pickPhoto(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (typeof selected !== 'string') return;
    try {
      const uri = await this.db.cvPhotoReadFile(selected);
      this.cropSourceUri.set(uri);
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  onCropConfirmed(uri: string): void {
    this.photoDataUri.set(uri);
    this.cropSourceUri.set(null);
  }

  onCropCancelled(): void {
    this.cropSourceUri.set(null);
  }

  removePhoto(): void {
    this.photoDataUri.set(null);
  }

  setPhotoPlacement(placement: PhotoPlacement): void {
    this.photoPlacement.set(placement);
  }

  /**
   * Toggle the "Include photo" chip. Turning it ON guarantees a `photo`
   * section exists in the editor (most templates don't seed one), so the
   * upload card actually appears; turning it OFF just hides the photo in the
   * preview while keeping the stored bytes.
   */
  toggleIncludePhoto(): void {
    const next = !this.includePhoto();
    this.includePhoto.set(next);
    if (!next || this.sections().some((s) => s.key === 'photo')) return;
    const photo: Extract<CvSection, { key: 'photo' }> = {
      key: 'photo',
      order: 0,
      visible: true,
      dataUri: this.photoDataUri() ?? undefined,
    };
    this.sections.set([photo, ...this.sections()].map((s, i) => ({ ...s, order: i })));
  }

  async save(): Promise<void> {
    const doc = this.doc();
    if (!doc || this.saving()) return;
    this.saving.set(true);
    try {
      const sections = this.sections().map((s) => {
        if (s.key === 'photo') {
          return {
            ...s,
            visible: this.includePhoto(),
            dataUri: this.photoDataUri() ?? undefined,
            placement: this.photoPlacement(),
          };
        }
        if (s.key === 'personal_details') {
          return {
            ...s,
            birthDate: this.includeBirthdate() ? s.birthDate : undefined,
            maritalStatus: this.includeMaritalStatus() ? s.maritalStatus : undefined,
          };
        }
        return s;
      });
      this.sections.set(sections);

      if (this.isDefault()) {
        const siblings = await this.db.documentLibraryList('cv');
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
        docType: 'cv',
        source: doc.source,
        label: this.label(),
        contentJson: JSON.stringify({ sections }),
        templateId: doc.templateId,
        styleJson: JSON.stringify(this.style()),
        themeId: this.themeId(),
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

  openSaveTemplate(): void {
    this.saveTemplateName.set('');
    this.saveTemplateOpen.set(true);
  }

  cancelSaveTemplate(): void {
    this.saveTemplateOpen.set(false);
  }

  async confirmSaveTemplate(): Promise<void> {
    if (!this.saveTemplateName().trim() || this.savingTemplate()) return;
    this.savingTemplate.set(true);
    try {
      const orderedKeys = this.sections()
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => s.key);
      await this.db.cvTemplateUpsert({
        name: this.saveTemplateName().trim(),
        regionTag: this.regionTag(),
        sectionsJson: JSON.stringify(orderedKeys),
        includePhoto: this.includePhoto(),
        includeBirthdate: this.includeBirthdate(),
        includeMaritalStatus: this.includeMaritalStatus(),
      });
      this.templates.set(await this.db.cvTemplatesList());
      this.saveTemplateOpen.set(false);
    } finally {
      this.savingTemplate.set(false);
    }
  }
}
