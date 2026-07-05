import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ArrowLeft, Eye, LucideAngularModule, Pencil, RefreshCw, Save } from 'lucide-angular';
import type {
  CvContent,
  CvSection,
  CvSectionKey,
  CvStyle,
  CvTemplate,
  DocumentLibraryItem,
  StyleNote,
} from '@applye/core';
import { CV_ATS_SAFE_FONTS, CV_STYLE_DEFAULT } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import {
  cvFieldAtsNoteKeys,
  mergeRegeneratedSection,
  orderedVisibleSections,
  parseCvSkillResponse,
  REGENERATABLE_SECTION_KEYS,
  sectionLabelKey,
} from '../cv-content.util';

@Component({
  selector: 'app-cv-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective, CdkDropList, CdkDrag],
  templateUrl: './cv-detail.component.html',
  styleUrl: './cv-detail.component.scss',
})
export class CvDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    save: Save,
    regenerate: RefreshCw,
    preview: Eye,
    edit: Pencil,
  };
  protected readonly regeneratableKeys = REGENERATABLE_SECTION_KEYS;
  protected readonly sectionLabelKey = sectionLabelKey;

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);
  readonly sections = signal<CvSection[]>([]);
  readonly templates = signal<CvTemplate[]>([]);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);
  readonly includePhoto = signal(false);
  readonly includeBirthdate = signal(false);
  readonly includeMaritalStatus = signal(false);

  readonly saving = signal(false);
  readonly regeneratingKey = signal<CvSectionKey | null>(null);
  readonly error = signal('');

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
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CvDetailComponent.STYLE_NOTE_KEYS[note.kind]).replace('{value}', note.detail);
  }

  updateStyle(patch: Partial<CvStyle>): void {
    this.style.set({ ...this.style(), ...patch });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  private async refreshStyleNotes(): Promise<void> {
    this.styleNotes.set(await this.db.checkStyleSafety(JSON.stringify(this.style())));
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

      const content: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
      const ordered = [...content.sections].sort((a, b) => a.order - b.order);
      this.sections.set(ordered);

      const photo = ordered.find((s) => s.key === 'photo');
      this.includePhoto.set(photo?.visible ?? false);
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
    void this.router.navigate(['/documents']);
  }

  drop(event: CdkDragDrop<CvSection[]>): void {
    const list = this.sections().slice();
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.sections.set(list.map((s, index) => ({ ...s, order: index })));
  }

  /** Angular templates can't parse a multi-line arrow function body, so the
   * "Language: Level" per-line textarea parsing lives here instead of
   * inline in the template. */
  onLanguagesChange(section: Extract<CvSection, { key: 'languages' }>, value: string): void {
    section.items = value
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [language, level] = line.split(':');
        return { language: (language ?? '').trim(), level: (level ?? '').trim() };
      });
  }

  async regenerateSection(key: CvSectionKey): Promise<void> {
    if (this.regeneratingKey()) return;
    const doc = this.doc();
    if (!doc) return;
    this.regeneratingKey.set(key);
    this.error.set('');
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
      this.error.set(String(e));
    } finally {
      this.regeneratingKey.set(null);
    }
  }

  async save(): Promise<void> {
    const doc = this.doc();
    if (!doc || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const sections = this.sections().map((s) => {
        if (s.key === 'photo') return { ...s, visible: this.includePhoto() };
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
    } catch (e) {
      this.error.set(String(e));
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
