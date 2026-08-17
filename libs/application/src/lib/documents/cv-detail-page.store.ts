import { Injectable, signal } from '@angular/core';
import type { CvPreviewSelection, CvSectionKey } from '@applye/core';

/**
 * What the CV editor's screen is currently showing: which mode it is in, what
 * the user has opened or collapsed, what they have selected on the paper, and
 * whether the last save is still being acknowledged.
 *
 * **Component-scoped**, like the other four stores this page provides. None of
 * it is persisted and none of it survives leaving the editor - a second CV
 * opens expanded, in Edit mode, with nothing selected, which is the behaviour
 * the page had when it owned these signals itself.
 *
 * **It exists separately from `CvStyleStore` on purpose** (ADR-0005, amendment
 * sixty-four). The obvious move was to hand all of the page's remainder to the
 * style store, which had the headroom for it. Panel-open, preview mode and
 * `justSaved` are not facts about the style tree, though, and this ADR already
 * says a page whose state does not fit decomposes by responsibility rather than
 * growing one store - the 250-line budget exists to catch exactly the store that
 * becomes the page's second god-object. The three per-section style methods went
 * to `CvStyleStore` in the same change, because those genuinely are its work.
 *
 * **What deliberately did not move here is the swatch.** `sampleResolvedStyle`
 * and its `afterRenderEffect` stay on the page, because the effect reads a
 * `viewChild`'s computed style off the DOM after layout. That is view, and this
 * layer does not own view - the same line `wizard-nav`'s `querySelector` and
 * `scrollingElement` were held to in amendment fifty-four. A store that needed a
 * `TestBed` and a rendered component to be tested would be the signal that the
 * dependency is wrong.
 */
@Injectable()
export class CvDetailPageStore {
  /** Preview (the rendered paper) versus Edit (the section editors). The apply
   * wizard's "Review CV" opens straight into preview, which is why the page
   * sets this from a query param on load rather than the store defaulting it. */
  readonly previewMode = signal(false);

  togglePreview(): void {
    this.previewMode.set(!this.previewMode());
  }

  /** Live-style panel visibility. Collapsing it hands the reclaimed width to the
   * paper, which is the whole point of the preview. */
  readonly livePanelOpen = signal(true);

  /** The section/part the user has clicked in the live preview, driving the
   * contextual `CvLiveStylePanelComponent` beside the paper. Null until the
   * first selection; cleared is fine - the panel shows its empty state. Printing
   * clears it so no inline editor chrome reaches the snapshot, which is why the
   * page writes it from two places that are not user gestures. */
  readonly liveSelection = signal<CvPreviewSelection | null>(null);

  clearSelection(): void {
    this.liveSelection.set(null);
  }

  /** Per-section collapse state for the content-section accordion. An empty set
   * means nothing is collapsed, so every section starts expanded. */
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

  /** Collapse state for the "Style" card - open by default. Separate from the
   * section accordion above because it is one card rather than a keyed set. */
  readonly styleOpen = signal(true);

  toggleStyleOpen(): void {
    this.styleOpen.set(!this.styleOpen());
  }

  /** The transient "Saved" tick on the save button. **The store holds the flag
   * and not its timing**: the page clears it after a delay on the ordinary path
   * and deliberately does not on the apply-wizard path, where it navigates away
   * instead - that choice is about where the user goes next, not about the
   * screen's state. */
  readonly justSaved = signal(false);
}
