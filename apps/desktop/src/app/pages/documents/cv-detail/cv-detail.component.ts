import {
  afterRenderEffect,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ArrowLeft,
  ChevronDown,
  Eye,
  GripVertical,
  LucideAngularModule,
  Pencil,
  Save,
  Check,
  Info,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-angular';
import type {
  CvSection,
  CvSectionKey,
  CvSectionStyle,
  CvTextStyle,
  PageMargins,
  PageSettings,
  PageSize,
  PhotoPlacement,
  StyleNote,
} from '@applye/core';
import {
  PAGE_SETTINGS_DEFAULT,
  REGENERATABLE_SECTION_KEYS,
  cvFieldAtsNoteKeys,
  cvLeafText,
  patchCvSectionStyle,
  resetCvSectionStyle,
  resolvePageSettings,
  routeCvStyleChange,
  sectionLabelKey,
  type CvPreviewSelection,
  type CvStylePanelChange,
} from '@applye/core';
import {
  CvDocumentStore,
  CvNoProfileError,
  CvPhotoStore,
  CvRegenerationStore,
  CvStyleStore,
  isCvSectionLocked,
} from '@applye/application';

import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { CvSectionActionsComponent } from './cv-section-actions/cv-section-actions.component';
import { ToastService } from '../../../core/toast/toast.service';
import { CvPreviewComponent } from './cv-preview/cv-preview.component';
import { CvLiveStylePanelComponent } from './cv-live-style-panel/cv-live-style-panel.component';
import { CvSummaryEditorComponent } from './section-editors/cv-summary-editor.component';
import { CvLanguagesEditorComponent } from './section-editors/cv-languages-editor.component';
import { CvSkillsEditorComponent } from './section-editors/cv-skills-editor.component';
import { CvEducationEditorComponent } from './section-editors/cv-education-editor.component';
import { CvExperienceEditorComponent } from './section-editors/cv-experience-editor.component';
import { CvPersonalDetailsEditorComponent } from './section-editors/cv-personal-details-editor.component';

@Component({
  selector: 'app-cv-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    ButtonDirective,
    CvSectionActionsComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CvPreviewComponent,
    CvLiveStylePanelComponent,
    CvSummaryEditorComponent,
    CvLanguagesEditorComponent,
    CvSkillsEditorComponent,
    CvEducationEditorComponent,
    CvExperienceEditorComponent,
    CvPersonalDetailsEditorComponent,
  ],
  templateUrl: './cv-detail.component.html',
  styleUrl: './cv-detail.component.scss',
  providers: [CvPhotoStore, CvStyleStore, CvDocumentStore, CvRegenerationStore],
})
export class CvDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    save: Save,
    preview: Eye,
    edit: Pencil,
    check: Check,
    info: Info,
    panelClose: PanelRightClose,
    panelOpen: PanelRightOpen,
    dragHandle: GripVertical,
    chevron: ChevronDown,
  };
  protected readonly regeneratableKeys = REGENERATABLE_SECTION_KEYS;
  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];

  readonly regionOptions = computed(() =>
    this.regionTags.map((tag) => ({
      tag,
      label: `${tag.toUpperCase()} - ${this.t()(`documents.cv_region_${tag}`)}`,
    })),
  );

  /** The CV row: what was loaded, what the editor changed, and the one write
   * that persists it. Component-scoped; it injects the photo and style stores
   * because `documentLibraryUpsert` takes a whole record and the three of them
   * cannot each save their own slice. Aliased for the template. */
  private readonly document = inject(CvDocumentStore);
  readonly loading = this.document.loading;
  readonly loadError = this.document.loadError;
  readonly doc = this.document.doc;
  readonly sections = this.document.sections;
  readonly templates = this.document.templates;
  readonly label = this.document.label;
  readonly regionTag = this.document.regionTag;
  readonly isDefault = this.document.isDefault;
  readonly saving = this.document.saving;
  readonly saveTemplateOpen = this.document.saveTemplateOpen;
  readonly saveTemplateName = this.document.saveTemplateName;
  readonly savingTemplate = this.document.savingTemplate;
  readonly openSaveTemplate = this.document.openSaveTemplate.bind(this.document);
  readonly cancelSaveTemplate = this.document.cancelSaveTemplate.bind(this.document);
  readonly replaceSection = this.document.replaceSection.bind(this.document);
  /** Whether this CV shows a photo, where, and the two personal-detail fields
   * that are excluded by default. Component-scoped; the image itself is the
   * profile's. Aliased for the template, which names each of these once. */
  private readonly photo = inject(CvPhotoStore);
  readonly includePhoto = this.photo.includePhoto;
  readonly profilePhoto = this.photo.profilePhoto;
  readonly photoDataUri = this.photo.dataUri;
  readonly photoPlacement = this.photo.placement;
  readonly photoPlacementOptions = this.photo.placements;
  readonly includeBirthdate = this.photo.includeBirthdate;
  readonly includeMaritalStatus = this.photo.includeMaritalStatus;

  readonly justSaved = signal(false);

  /** Regenerating a section from the profile, and pulling fresh personal
   * details. Component-scoped; it writes through `CvDocumentStore`. */
  private readonly regeneration = inject(CvRegenerationStore);
  readonly regeneratingKey = this.regeneration.regeneratingKey;
  readonly pullingProfile = this.regeneration.pullingProfile;

  readonly atsNoteKeys = computed(() => cvFieldAtsNoteKeys(this.photo.flags(), this.regionTag()));

  /** The document's visual style, the theme it sits on, and the ATS safety
   * notes it produces. Component-scoped; the store owns the signal and the
   * debounced safety check, and this page composes the next style with the pure
   * helpers in `cv-style.util.ts` / `cv-style-scope.util.ts`, which the panel
   * and the cover-letter editor compose with too. Aliased for the template. */
  private readonly styleStore = inject(CvStyleStore);
  readonly style = this.styleStore.style;
  readonly themeId = this.styleStore.themeId;
  readonly styleNotes = this.styleStore.styleNotes;
  readonly activeTheme = this.styleStore.activeTheme;
  readonly activeThemeTitleRule = this.styleStore.activeThemeTitleRule;
  readonly activeThemeEntryRule = this.styleStore.activeThemeEntryRule;
  readonly themeBaseStyle = this.styleStore.themeBaseStyle;
  readonly hasAnyCustomStyle = this.styleStore.hasAnyCustomStyle;

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CvDetailComponent.STYLE_NOTE_KEYS[note.kind]).replace('{value}', note.detail);
  }

  readonly updateStyle = this.styleStore.updateStyle.bind(this.styleStore);
  readonly updateTitleStyle = this.styleStore.updateTitleStyle.bind(this.styleStore);
  readonly selectTheme = this.styleStore.selectTheme.bind(this.styleStore);
  readonly resetAllStyles = this.styleStore.resetAllStyles.bind(this.styleStore);

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

  /** The section/part the user has clicked in the live preview, driving the
   * contextual `CvLiveStylePanelComponent` beside the paper. Null until the
   * first selection; cleared is fine (panel shows its empty state). */
  /** Live-style panel visibility. Collapsing it hands the reclaimed width to
   * the paper, which is the whole point of the preview. */
  readonly livePanelOpen = signal(true);
  readonly liveSelection = signal<CvPreviewSelection | null>(null);

  /** Plain text of the currently-selected leaf, fed to the live-style panel's
   * "Ag" sample so it previews the real selected content. A title's text is its
   * localized section label; body leaves resolve through `cvLeafText`. */
  readonly selectedLeafText = computed<string>(() => {
    const sel = this.liveSelection();
    if (!sel) return '';
    if (sel.part === 'title') return this.t()(sectionLabelKey(sel.sectionKey));
    return cvLeafText(this.sections(), sel);
  });

  /** The live preview, so we can read the selected leaf's REAL rendered style
   * off the paper for the live-style panel's "Ag" swatch (bug: the swatch
   * showed a flat serif instead of the field's actual colour/weight/font). */
  private readonly cvPreviewCmp = viewChild(CvPreviewComponent);

  /** Rendered typography of the selected leaf, mirrored into the swatch. */
  readonly sampleResolvedStyle = signal<Record<string, string>>({});

  /** After each render, re-read the selected leaf's computed style from the
   * DOM (post-layout, so it reflects the current selection AND any just-applied
   * style edit) and push it to the swatch. Guarded by value equality so the
   * signal write doesn't loop with the render it triggers. */
  private readonly sampleStyleSync = afterRenderEffect(() => {
    // Track the inputs that change what's rendered so this re-runs on them.
    this.liveSelection();
    this.style();
    const next = this.cvPreviewCmp()?.readSelectedHostStyle() ?? {};
    if (JSON.stringify(this.sampleResolvedStyle()) !== JSON.stringify(next)) {
      this.sampleResolvedStyle.set(next);
    }
  });

  /** Per-section collapse state for the content-section accordion - session
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

  /** Collapse state for the "Style" card - open by default. */
  readonly styleOpen = signal(true);

  toggleStyleOpen(): void {
    this.styleOpen.set(!this.styleOpen());
  }

  setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void {
    this.styleStore.applyStyle(patchCvSectionStyle(this.style(), key, patch));
  }

  /** Deep-merge a patch into a section's title override (a nested object that
   * `setSectionStyle`'s shallow merge would otherwise replace wholesale). */
  setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void {
    this.setSectionStyle(key, { title: patch });
  }

  resetSectionStyle(key: CvSectionKey): void {
    this.styleStore.applyStyle(resetCvSectionStyle(this.style(), key));
  }

  /** Routes a scope-tagged panel change to the correct write target for the
   * current live selection. The mapping itself is `routeCvStyleChange`, a pure
   * transform beside the other `CvStyle` helpers; this only supplies the
   * selection and commits the result. No-ops when there is no active
   * selection. */
  onStylePanelChange(change: CvStylePanelChange): void {
    const sel = this.liveSelection();
    if (!sel) return;
    this.styleStore.applyStyle(routeCvStyleChange(this.style(), sel, change));
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
   * webview's built-in print is used directly - no `@tauri-apps/api` import
   * is needed or available for this in the installed SDK version.
   */
  async exportPdfWysiwyg(): Promise<void> {
    // Commit any in-progress inline edit and drop every editor affordance BEFORE
    // printing: blur the focused leaf so its `(blur)` handler commits the draft,
    // then clear the live selection so the page cards render committed text with
    // no native control, caret, selection outline, or side panel. Then wait for
    // Angular to render that resting state and for the sheet to finish a fresh
    // pagination pass, so the exported PDF matches the on-screen preview exactly.
    this.commitAndCloseEditors();
    await this.nextStableFrame();
    const r = resolvePageSettings(this.style().page);
    // The @page rule supplies the REAL margins; the print stylesheet then zeroes
    // each `.page-card`'s simulated padding and lets its height be content-driven
    // (see `body.printing-cv .page-card`). This yields exact physical margins (no
    // full-bleed scaling shrinking them) and stops a card that exactly filled a
    // page from rounding over into a trailing blank page. Mirrors
    // `exportPdfWysiwyg` on `CoverLetterDetailComponent`.
    const m = r.margin;
    const rule =
      `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
      ` margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
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

  /** Blur the focused inline editor - firing its `(blur)` handler, which commits
   * the draft if it changed - and clear the live selection so all inline editor
   * chrome unmounts and the page cards fall back to committed text. */
  private commitAndCloseEditors(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.liveSelection.set(null);
  }

  /** Resolve once Angular has applied pending signal changes and the paginated
   * sheet has re-measured/repaginated. `tick()` flushes CD synchronously (the
   * app is zoneless); two animation frames then bracket the sheet's
   * measure-in-a-microtask + repaginate. Falls back to a microtask where rAF is
   * unavailable (unit tests). */
  private nextStableFrame(): Promise<void> {
    this.appRef.tick();
    if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  /**
   * Direct OS/browser print (Cmd/Ctrl+P), bypassing the Export button. Drop the
   * live selection so every inline editor unmounts and the page cards render
   * their last-committed canonical text - the uncommitted draft and its native
   * control never reach the print snapshot. Unlike the Export action this does
   * NOT commit the draft (a raw Cmd+P should not silently persist a half-typed
   * edit). `tick()` performs the swap synchronously, before the browser captures
   * the page (zoneless CD is otherwise async and would miss the snapshot). */
  private readonly handleBeforePrint = (): void => {
    if (!this.previewMode() || this.liveSelection() === null) return;
    this.liveSelection.set(null);
    this.appRef.tick();
  };

  constructor() {
    window.addEventListener('beforeprint', this.handleBeforePrint);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('beforeprint', this.handleBeforePrint),
    );
    void this.load();
  }

  async load(): Promise<void> {
    // Opened from the apply wizard's "Review CV": show the rendered result
    // first, not the raw section editor. The user can toggle to Edit.
    if (this.route.snapshot.queryParamMap.get('preview') === '1') {
      this.previewMode.set(true);
    }
    await this.document.load(Number(this.route.snapshot.paramMap.get('id')));
  }

  back(): void {
    if (this.shouldReturnToApplyWizard()) {
      void this.returnToApplyWizard(false);
      return;
    }
    const jobId = this.returnJobId();
    if (jobId) {
      void this.router.navigate(['/jobs', jobId]);
      return;
    }
    void this.router.navigate(['/documents']);
  }

  /** Label for the back button: the job it returns to, or plain "Documents". */
  backLabel(): string {
    const jobLabel = this.route.snapshot.queryParamMap.get('jobLabel');
    return this.returnJobId() && jobLabel
      ? this.t()('documents.cv_back_to_job').replace('{job}', jobLabel)
      : this.t()('documents.cv_back_to_documents');
  }

  private shouldReturnToApplyWizard(): boolean {
    return this.route.snapshot.queryParamMap.get('returnTo') === 'applyWizard';
  }

  /** Job id to return to when opened from My Jobs (returnTo=myJobs), else null. */
  private returnJobId(): string | null {
    const params = this.route.snapshot.queryParamMap;
    return params.get('returnTo') === 'myJobs' ? params.get('jobId') : null;
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

  readonly isSectionLocked = isCvSectionLocked;

  drop(event: CdkDragDrop<CvSection[]>): void {
    this.document.reorder(event.previousIndex, event.currentIndex);
  }

  moveSectionUp(key: CvSectionKey): void {
    this.document.moveSection(key, -1);
  }

  moveSectionDown(key: CvSectionKey): void {
    this.document.moveSection(key, 1);
  }

  /** Regenerates one section. The store performs the call and never notifies,
   * so the wording of a missing-profile failure is chosen here. */
  async regenerateSection(key: CvSectionKey): Promise<void> {
    try {
      await this.regeneration.regenerateSection(key);
    } catch (e) {
      this.toast.error(this.regenerationMessage(e));
    }
  }

  async pullFromProfile(): Promise<void> {
    try {
      await this.regeneration.pullFromProfile();
    } catch (e) {
      this.toast.error(this.regenerationMessage(e));
    }
  }

  /** `CvNoProfileError` is the one failure with a wording of its own; anything
   * else is reported as it arrived. */
  private regenerationMessage(e: unknown): string {
    return e instanceof CvNoProfileError ? this.t()('documents.cv_generate_no_profile') : String(e);
  }

  /** Opens the profile, where the one reusable photo is uploaded and cropped. */
  goToProfilePhoto(): void {
    void this.router.navigate(['/profile']);
  }

  setPhotoPlacement(placement: PhotoPlacement): void {
    this.photo.setPlacement(placement);
  }

  /** Toggles the "Include photo" chip. The store decides what the section list
   * must become, because switching the photo on has to create one. */
  toggleIncludePhoto(): void {
    this.document.setSections(this.photo.toggleIncludePhoto(this.sections()));
  }

  /** Saves, then tells the user and decides where to go. The store performs the
   * write and never notifies (ADR-0005, amendment three), so the toast, the
   * transient "Saved" tick and the wizard hand-back all live here. */
  async save(): Promise<void> {
    try {
      if (!(await this.document.save())) return;
      this.justSaved.set(true);
      this.toast.success(this.t()('documents.cv_saved'));
      if (this.shouldReturnToApplyWizard()) {
        await this.returnToApplyWizard(true);
        return;
      }
      setTimeout(() => this.justSaved.set(false), 2500);
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  async confirmSaveTemplate(): Promise<void> {
    try {
      if (await this.document.confirmSaveTemplate()) {
        this.toast.success(this.t()('documents.cv_template_saved'));
      }
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}
