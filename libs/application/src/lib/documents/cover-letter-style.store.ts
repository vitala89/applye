import { Injectable, computed, inject, signal } from '@angular/core';
import type { CoverLetterStyle, CvSectionStyle, StyleNote } from '@applye/core';
import { COVER_LETTER_STYLE_DEFAULT } from '@applye/core';
import { DbService } from '@applye/data';
import { reindexParagraphStyleKeys } from './cover-letter-content';
import { STYLE_CHECK_DEBOUNCE_MS, dedupeStyleNotes } from './document-style-safety';

/**
 * A cover letter's visual style: the document-wide `CoverLetterStyle`, the
 * per-block and per-paragraph overrides, and the debounced ATS safety check.
 *
 * **It is not a variant of `CvStyleStore`, and deliberately shares no code with
 * it beyond the safety helper** (ADR-0005, amendment twelve). A cover letter
 * has no themes, and its `sectionStyles` is an open `Record<string, …>` because
 * it must key `body_<i>`, where the CV's is a closed `CvSectionKey` union.
 *
 * **Page geometry stays on the page.** `currentMargin`, `setMarginSide` and
 * `setPageSize` clamp through the app-local `resolvePageSettings`, which this
 * library cannot import; the page computes the next `page` and commits it
 * through `updateStyle` (amendment five's precedent, amendment six's first
 * shape).
 *
 * **It never notifies the user** (amendment three): the note *messages* are
 * translated on the page, because they are UI text rather than part of the
 * document.
 *
 * Component-scoped.
 */
@Injectable()
export class CoverLetterStyleStore {
  private readonly db = inject(DbService);

  readonly style = signal<CoverLetterStyle>({ ...COVER_LETTER_STYLE_DEFAULT });
  readonly styleNotes = signal<StyleNote[]>([]);
  private styleCheckTimer?: ReturnType<typeof setTimeout>;

  /** Any block or paragraph carries an override - drives the "reset all"
   * affordance. */
  readonly hasAnyCustomStyle = computed(() => {
    const overrides = this.style().sectionStyles ?? {};
    return Object.values(overrides).some(
      (o) => o && Object.values(o).some((v) => v !== undefined && v !== null),
    );
  });

  /**
   * Takes the style off a freshly loaded document. An absent `styleJson` means
   * the letter has never been styled, so it starts on the default.
   *
   * **Throws on malformed JSON**, like `CvStyleStore.hydrate` and
   * `CoverLetterContentStore.hydrate`: the caller's `load` already reports a
   * document it cannot read, and showing a default-styled letter over a stored
   * one is a Save away from discarding the user's styling.
   */
  hydrate(styleJson: string | null | undefined): void {
    this.style.set(
      styleJson
        ? { ...COVER_LETTER_STYLE_DEFAULT, ...JSON.parse(styleJson) }
        : { ...COVER_LETTER_STYLE_DEFAULT },
    );
    void this.refreshStyleNotes();
  }

  /** Commits a fully-built next style and debounces the safety re-check. Every
   * write below funnels through here, so there is one place the check is
   * scheduled and one place the signal is set. */
  applyStyle(next: CoverLetterStyle): void {
    this.style.set(next);
    this.scheduleStyleCheck();
  }

  updateStyle(patch: Partial<CoverLetterStyle>): void {
    this.applyStyle({ ...this.style(), ...patch });
  }

  sectionOverride(key: string): CvSectionStyle | undefined {
    return this.style().sectionStyles?.[key];
  }

  /** True when one block or paragraph carries any override - drives its
   * "Custom" badge, so the user can see which parts differ from the default. */
  hasCustomStyle(key: string): boolean {
    const override = this.style().sectionStyles?.[key];
    return !!override && Object.values(override).some((v) => v !== undefined && v !== null);
  }

  setSectionStyle(key: string, patch: Partial<CvSectionStyle>): void {
    const sectionStyles = { ...(this.style().sectionStyles ?? {}) };
    sectionStyles[key] = { ...(sectionStyles[key] ?? {}), ...patch };
    this.applyStyle({ ...this.style(), sectionStyles });
  }

  resetSectionStyle(key: string): void {
    const sectionStyles = { ...(this.style().sectionStyles ?? {}) };
    delete sectionStyles[key];
    this.applyStyle({ ...this.style(), sectionStyles });
  }

  /**
   * Resets every block, paragraph and document-wide value to the default.
   *
   * Checks **immediately** rather than debouncing: a full reset rewrites the
   * whole style at once rather than arriving as a burst, and any pending
   * debounced check is dropped because it would re-check a style that no longer
   * exists. Same reasoning as `CvStyleStore.selectTheme`.
   */
  resetAllStyles(): void {
    this.style.set({ ...COVER_LETTER_STYLE_DEFAULT });
    this.checkStyleNotesNow();
  }

  /**
   * Shifts every `body_<i>` override above `removedAt` down one, after the
   * content store has dropped that paragraph. Called by the page, which
   * orchestrates the removal across three owners.
   *
   * Does **not** reschedule the safety check: the overrides move, but no style
   * value changes, so the same set of warnings still applies.
   */
  reindexAfterParagraphRemoved(removedAt: number, newLength: number): void {
    const sectionStyles = reindexParagraphStyleKeys(
      this.style().sectionStyles,
      removedAt,
      newLength,
    );
    if (sectionStyles) this.style.set({ ...this.style(), sectionStyles });
  }

  private scheduleStyleCheck(): void {
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), STYLE_CHECK_DEBOUNCE_MS);
  }

  private checkStyleNotesNow(): void {
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  private async refreshStyleNotes(): Promise<void> {
    const notes = await this.db.checkStyleSafety(JSON.stringify(this.style()));
    this.styleNotes.set(dedupeStyleNotes(notes));
  }
}
