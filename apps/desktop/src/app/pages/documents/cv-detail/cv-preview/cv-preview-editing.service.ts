import { Injectable, signal } from '@angular/core';
import type {
  CvEducationEntry,
  CvEducationSection,
  CvExperienceEntry,
  CvExperienceSection,
  CvLanguagesSection,
  CvPersonalDetailsSection,
  CvSection,
  CvSkillsSection,
  CvSummarySection,
  CvContactFieldKey,
} from '@applye/core';
import {
  parseSkillValues,
  replaceEducationEntryField,
  replaceExperienceBullet,
  replaceExperienceEntryField,
  replaceLanguageValue,
  replaceSkillGroupLabel,
  replaceSkillGroupValues,
  toggleBoldWrap,
} from '@applye/core';

/**
 * Inline editing for the CV preview: the per-leaf draft map, the commit rules
 * for every editable section, and the `**bold**` helpers.
 *
 * Split out of `cv-preview.component.ts` when it passed its 400-line budget
 * (ADR-0005, level three). It is a service rather than a store in
 * `libs/application` because it types on `HTMLTextAreaElement` and keys drafts
 * by DOM id - the same DOM rule that kept `scrollToTop` in the app.
 *
 * Provided by `CvPreviewComponent`, so a draft cannot outlive the preview that
 * holds it. The component binds the emit callback once; deciding **which**
 * editor is active on screen stays with the component, because that is a
 * question about the rendered page rather than about the draft.
 */
@Injectable()
export class CvPreviewEditingService {
  private emit: (section: CvSection) => void = () => undefined;

  /** Called once by the host component, wiring commits to its `sectionChange`
   * output. Kept explicit so the service can be tested without a component. */
  bind(emit: (section: CvSection) => void): void {
    this.emit = emit;
  }

  // --- Inline leaf editing (summary + personal_details) -----------------
  //
  // A leaf becomes a native editor while it is BOTH the active `selection`
  // (Task 3) and on a selectable (page, interactive) render - the measure
  // pass is never selectable, so it can never mount an editor. Typing only
  // updates this local draft map (`drafts`); nothing is emitted until the
  // control blurs (or an explicit apply keystroke triggers blur), and only
  // if the draft actually differs from the resting model value - which also
  // makes "Escape then blur" a no-op for free: Escape resets the draft back
  // to the resting value, so the following blur sees no change and emits
  // nothing.
  private readonly drafts = signal<Record<string, string>>({});

  /** Current draft text for a leaf, or the resting model value if the leaf
   * has no in-progress edit yet (e.g. right after mounting the editor). */
  leafDraft(id: string, resting: string): string {
    return this.drafts()[id] ?? resting;
  }

  /** Drafting - updates local state only, emits nothing. */
  onLeafInput(id: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  /** Escape - discard the in-progress draft. Dropping the entry (rather than
   * writing the resting value back into it) makes `leafDraft` fall through to
   * the live resting value, so the editor reverts AND no stale draft can
   * survive an unmount or selection change that never fires a blur. A
   * subsequent blur then sees an unchanged value and skips the commit. */
  onLeafEscape(id: string): void {
    this.clearDraft(id);
  }

  private clearDraft(id: string): void {
    this.drafts.update((d) => {
      if (!(id in d)) return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  /** Commit the summary leaf on blur: emits one new immutable
   * `CvSummarySection` only if the draft actually changed the text. */
  commitSummary(section: CvSummarySection, resting: string): void {
    const id = 'summary';
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit({ ...section, text: value });
    }
  }

  /** Wrap/unwrap `**bold**` around the summary textarea's current selection -
   * modifies the draft only (still drafting; the eventual blur commits it),
   * then restores the caret. Bound to the Bold button and Cmd/Ctrl+B. */
  applySummaryBold(el: HTMLTextAreaElement, resting: string): void {
    const id = 'summary';
    const current = this.drafts()[id] ?? resting;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const r = toggleBoldWrap(current, start, end);
    this.drafts.update((d) => ({ ...d, [id]: r.text }));
    queueMicrotask(() => {
      el.value = r.text;
      el.setSelectionRange(r.selStart, r.selEnd);
      el.focus();
    });
  }

  /** Cmd/Ctrl+B handler for the summary textarea. */
  onSummaryBoldKeydown(event: KeyboardEvent, el: HTMLTextAreaElement, resting: string): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.applySummaryBold(el, resting);
    }
  }

  /** Commit a single personal-details field on blur: emits one new immutable
   * `CvPersonalDetailsSection` only if the draft actually changed the value -
   * this is what keeps a localized fallback (e.g. the "Untitled" placeholder)
   * from ever becoming persisted content: the draft starts at the real
   * (possibly empty) field value, never at the fallback label, so an
   * untouched field never diffs from `resting` and never commits. */
  commitPersonalField(
    section: CvPersonalDetailsSection,
    field: CvContactFieldKey | 'fullName' | 'title',
    resting: string,
  ): void {
    const id = `pd.${field}`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit({ ...section, [field]: value });
    }
  }

  /** Text fields of an experience entry editable in the preview - dates stay
   * plain strings (no date-picker), matching the resting render. */
  private static readonly EXP_TEXT_FIELDS = [
    'company',
    'industry',
    'location',
    'role',
    'startDate',
    'endDate',
  ] as const;

  /** Commit a single experience-entry field on blur: emits one new immutable
   * `CvExperienceSection` (only the targeted entry/field replaced) - only if
   * the draft actually changed the value. */
  commitExperienceField(
    section: CvExperienceSection,
    index: number,
    field: (typeof CvPreviewEditingService.EXP_TEXT_FIELDS)[number],
    resting: string,
  ): void {
    const id = `exp.${index}.${field}`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(
        replaceExperienceEntryField(
          section,
          index,
          field,
          value as CvExperienceEntry[typeof field],
        ),
      );
    }
  }

  /** Commit a single experience bullet on blur: emits one new immutable
   * `CvExperienceSection` touching only that entry's targeted bullet. */
  commitExperienceBullet(
    section: CvExperienceSection,
    entryIndex: number,
    bulletIndex: number,
    resting: string,
  ): void {
    const id = `exp.${entryIndex}.bullet.${bulletIndex}`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(replaceExperienceBullet(section, entryIndex, bulletIndex, value));
    }
  }

  /** Wrap/unwrap `**bold**` around an experience bullet textarea's current
   * selection - mirrors `applySummaryBold` for the per-bullet draft id. */
  applyBulletBold(
    el: HTMLTextAreaElement,
    entryIndex: number,
    bulletIndex: number,
    resting: string,
  ): void {
    const id = `exp.${entryIndex}.bullet.${bulletIndex}`;
    const current = this.drafts()[id] ?? resting;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const r = toggleBoldWrap(current, start, end);
    this.drafts.update((d) => ({ ...d, [id]: r.text }));
    queueMicrotask(() => {
      el.value = r.text;
      el.setSelectionRange(r.selStart, r.selEnd);
      el.focus();
    });
  }

  /** Cmd/Ctrl+B handler for an experience bullet textarea. */
  onBulletBoldKeydown(
    event: KeyboardEvent,
    el: HTMLTextAreaElement,
    entryIndex: number,
    bulletIndex: number,
    resting: string,
  ): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.applyBulletBold(el, entryIndex, bulletIndex, resting);
    }
  }

  private static readonly EDU_TEXT_FIELDS = [
    'degree',
    'institution',
    'startDate',
    'endDate',
  ] as const;

  /** Commit a single education-entry field on blur: emits one new immutable
   * `CvEducationSection` (only the targeted entry/field replaced). */
  commitEducationField(
    section: CvEducationSection,
    index: number,
    field: (typeof CvPreviewEditingService.EDU_TEXT_FIELDS)[number],
    resting: string,
  ): void {
    const id = `edu.${index}.${field}`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(
        replaceEducationEntryField(section, index, field, value as CvEducationEntry[typeof field]),
      );
    }
  }

  /** Commit a skill group's label on blur: emits one new immutable
   * `CvSkillsSection` touching only that group's label. */
  commitSkillLabel(section: CvSkillsSection, groupIndex: number, resting: string): void {
    const id = `skills.${groupIndex}.label`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(replaceSkillGroupLabel(section, groupIndex, value));
    }
  }

  /** Commit a skill group's comma-separated values on blur: emits one new
   * immutable `CvSkillsSection` touching only that group's values array. */
  commitSkillValues(section: CvSkillsSection, groupIndex: number, resting: string): void {
    const id = `skills.${groupIndex}.values`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(replaceSkillGroupValues(section, groupIndex, parseSkillValues(value)));
    }
  }

  /** Commit a single language's visible value on blur: emits one new
   * immutable `CvLanguagesSection` touching only that item's `language` -
   * the (non-rendered) `level` field is left untouched. */
  commitLanguageValue(section: CvLanguagesSection, index: number, resting: string): void {
    const id = `lang.${index}.language`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.emit(replaceLanguageValue(section, index, value));
    }
  }
}
