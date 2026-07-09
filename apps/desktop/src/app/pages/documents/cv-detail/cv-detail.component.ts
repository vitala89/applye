import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
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
  CvTextRun,
  DocumentLibraryItem,
  StyleNote,
} from '@applye/core';
import { CV_ATS_SAFE_FONTS, CV_STYLE_DEFAULT, parseInlineEmphasis } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { CvPhotoCropComponent } from './cv-photo-crop/cv-photo-crop.component';
import {
  blankEducationEntry,
  blankExperienceEntry,
  buildContactLine,
  cvFieldAtsNoteKeys,
  effectiveSectionStyle,
  mergeRegeneratedSection,
  normalizeCvContent,
  orderedVisibleSections,
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
    NgStyle,
    NgTemplateOutlet,
    CvPhotoCropComponent,
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
    sparkles: Sparkles,
    plus: Plus,
    close: X,
    trash: Trash2,
  };
  protected readonly regeneratableKeys = REGENERATABLE_SECTION_KEYS;
  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];
  protected readonly buildContactLine = buildContactLine;

  readonly regionOptions = computed(() =>
    this.regionTags.map((tag) => ({
      tag,
      label: `${tag.toUpperCase()} — ${this.t()(`documents.cv_region_${tag}`)}`,
    })),
  );

  runs(text: string): CvTextRun[] {
    return parseInlineEmphasis(text);
  }

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

  setPageSize(size: 'a4' | 'letter'): void {
    this.updateStyle({
      page: { ...(this.style().page ?? { size: 'a4', margin: 'normal' }), size },
    });
  }

  setPageMargin(margin: 'narrow' | 'normal' | 'wide'): void {
    this.updateStyle({
      page: { ...(this.style().page ?? { size: 'a4', margin: 'normal' }), margin },
    });
  }

  /** Preview page geometry — aspect ratio + margin padding from the resolver. */
  readonly pageStyle = computed(() => {
    const r = resolvePageSettings(this.style().page);
    return { 'aspect-ratio': `${r.widthMm} / ${r.heightMm}`, padding: `${r.marginPct}%` };
  });

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

  /** Effective font/size/weight/colour for a section — its own override
   * merged over the document-wide style (Task 1's `effectiveSectionStyle`). */
  effStyle(key: CvSectionKey) {
    return effectiveSectionStyle(this.style(), key);
  }

  /** Bindable style object for a section wrapper's font-family/size/weight,
   * so preview templates use a single `[ngStyle]` instead of three
   * `[style.*]` bindings per section. */
  sectionCss(key: CvSectionKey): Record<string, string> {
    const s = this.effStyle(key);
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
    };
  }

  toggleStylePopover(key: CvSectionKey): void {
    this.openStyleKey.set(this.openStyleKey() === key ? null : key);
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

  /** Any section carries an override. */
  readonly hasAnyCustomStyle = computed(() => {
    const s = this.style().sectionStyles ?? {};
    return Object.values(s).some((o) => o && Object.values(o).some((v) => v != null));
  });

  /** Reset every section and the document-wide style to the default. */
  resetAllStyles(): void {
    this.style.set({ ...CV_STYLE_DEFAULT });
    this.openStyleKey.set(null);
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  readonly previewMode = signal(false);

  /** Ordered, visible sections as they'd actually render — the photo
   * toggle isn't written back into `section.visible` until Save, so this
   * mirrors the live toggle state rather than trusting the stored value. */
  readonly previewSections = computed(() => {
    const live = this.sections().map((s) =>
      s.key === 'photo' ? { ...s, visible: this.includePhoto() } : s,
    );
    return orderedVisibleSections(live);
  });

  togglePreview(): void {
    this.previewMode.set(!this.previewMode());
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
      const personal = ordered.find(
        (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
      );
      this.includeBirthdate.set(!!personal?.birthDate);
      this.includeMaritalStatus.set(!!personal?.maritalStatus);

      const style: CvStyle = item.styleJson
        ? { ...CV_STYLE_DEFAULT, ...JSON.parse(item.styleJson) }
        : CV_STYLE_DEFAULT;
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

  drop(event: CdkDragDrop<CvSection[]>): void {
    const list = this.sections().slice();
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.sections.set(list.map((s, index) => ({ ...s, order: index })));
  }

  private moveSection(key: CvSectionKey, offset: -1 | 1): void {
    const list = this.sections().slice();
    const index = list.findIndex((s) => s.key === key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= list.length) return;
    moveItemInArray(list, index, target);
    this.sections.set(list.map((s, i) => ({ ...s, order: i })));
  }

  moveSectionUp(key: CvSectionKey): void {
    this.moveSection(key, -1);
  }

  moveSectionDown(key: CvSectionKey): void {
    this.moveSection(key, 1);
  }

  /** CEFR levels plus an empty option — a language may be listed with no
   * level (e.g. just "English"), which some CV conventions prefer. */
  protected readonly languageLevels = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

  addLanguage(section: Extract<CvSection, { key: 'languages' }>): void {
    section.items.push({ language: '', level: '' });
    this.sections.set([...this.sections()]);
  }

  removeLanguage(section: Extract<CvSection, { key: 'languages' }>, index: number): void {
    section.items.splice(index, 1);
    this.sections.set([...this.sections()]);
  }

  setSkillGroupLabel(
    section: Extract<CvSection, { key: 'skills' }>,
    groupIndex: number,
    label: string,
  ): void {
    const group = section.groups[groupIndex];
    if (group) group.label = label;
  }

  addSkillGroup(section: Extract<CvSection, { key: 'skills' }>): void {
    section.groups.push({ label: 'Skills', values: [] });
    this.sections.set([...this.sections()]);
  }

  removeSkillGroup(section: Extract<CvSection, { key: 'skills' }>, groupIndex: number): void {
    section.groups.splice(groupIndex, 1);
    this.sections.set([...this.sections()]);
  }

  /** Adds the trimmed input value as a skill chip on Enter, then clears the
   * input. Ignores empty values and duplicates within the group. */
  addSkill(section: Extract<CvSection, { key: 'skills' }>, groupIndex: number, event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;
    const group = section.groups[groupIndex];
    if (!group) return;
    if (!group.values.includes(value)) group.values.push(value);
    input.value = '';
    this.sections.set([...this.sections()]);
  }

  removeSkill(
    section: Extract<CvSection, { key: 'skills' }>,
    groupIndex: number,
    valueIndex: number,
  ): void {
    section.groups[groupIndex]?.values.splice(valueIndex, 1);
    this.sections.set([...this.sections()]);
  }

  addEntry(section: Extract<CvSection, { key: 'experience' | 'education' }>): void {
    if (section.key === 'experience') section.entries.push(blankExperienceEntry());
    else section.entries.push(blankEducationEntry());
    this.sections.set([...this.sections()]);
  }

  removeEntry(
    section: Extract<CvSection, { key: 'experience' | 'education' }>,
    index: number,
  ): void {
    section.entries.splice(index, 1);
    this.sections.set([...this.sections()]);
  }

  addBullet(entry: { bullets: string[] }): void {
    entry.bullets.push('');
    this.sections.set([...this.sections()]);
  }

  removeBullet(entry: { bullets: string[] }, index: number): void {
    entry.bullets.splice(index, 1);
    this.sections.set([...this.sections()]);
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
          return { ...s, visible: this.includePhoto(), dataUri: this.photoDataUri() ?? undefined };
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
