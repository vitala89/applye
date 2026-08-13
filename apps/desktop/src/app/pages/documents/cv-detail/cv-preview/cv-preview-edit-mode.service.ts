import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  linkedSignal,
  type Signal,
} from '@angular/core';
import type { CvPreviewSelection, CvSectionKey } from '@applye/core';
import { CvPreviewSelectionService } from './cv-preview-selection.service';

/** What edit mode is computed from. `selection` and `interactive` are the host
 * component's own inputs, passed in for the same reason as `CvPreviewStyleDeps`
 * - a second source of them would be a second truth. `host` is the preview's
 * own element, which the focus effect queries; `CvPreviewStyleService` already
 * takes the DOM the same way. */
export interface CvPreviewEditModeDeps {
  selection: Signal<CvPreviewSelection | null>;
  interactive: Signal<boolean>;
  host: () => HTMLElement;
}

/**
 * Whether the selected leaf has its inline editor mounted, and where keyboard
 * focus goes when that changes.
 *
 * Split out of `cv-preview.component.ts` (ADR-0005, level three) directly
 * because the header child component needs `isEditingLeaf` and `finishLeafEdit`
 * and nothing else would let it have them: passing bound methods as inputs is a
 * smell that the remaining seven atom blocks would each repeat, and injecting
 * the parent component would re-couple what four PRs have spent their time
 * decoupling. Amendment sixty-one deferred this deliberately to keep that
 * commit single-purpose; the pilot is what made it due.
 *
 * Distinct from selection, and the distinction is the point: selection is WHICH
 * leaf the style panel is scoped to, and stays true while the user picks fonts.
 * Edit mode is whether that leaf is currently a text input, which the user opts
 * into per selection via the panel's "Edit text" button. Selecting a leaf has
 * not auto-mounted an editor since that turned every field in a section into an
 * input at once.
 *
 * Provided by `CvPreviewComponent`, which binds its inputs once. Reads the
 * current selection through `CvPreviewSelectionService`, which is provided
 * beside it on the same element injector.
 */
@Injectable()
export class CvPreviewEditModeService {
  private readonly sel = inject(CvPreviewSelectionService);
  private readonly injector = inject(Injector);
  private deps!: CvPreviewEditModeDeps;

  /** The selectable host to return keyboard focus to once a committing edit
   * clears the selection and the resting markup re-renders (see the focus
   * effect in `bind`). Keyed as `"<sectionKey>:<part>"` to match
   * `data-cv-select`. */
  private returnFocusTo: string | null = null;

  /** `"<sectionKey>:<part>"` (or `null`) - deliberately ignores `elementPath`.
   * A `computed()` memoizes on its OUTPUT value, so changing only
   * `elementPath` (Phase D.2: clicking a different leaf inside the same
   * already-selected section/part to move the style-scope target) produces
   * the same string and does not re-notify the focus effect. Without this the
   * focus-trap fix (see the effect's doc) would regress: an elementPath-only
   * change would still swap the `selection` input's object reference,
   * re-running the effect and yanking focus to the section's first leaf editor
   * mid-click - exactly the bug that fix exists to prevent, just triggered by
   * an element change instead of a redundant whole-selection re-emit. */
  private readonly focusKey = computed<string | null>(() => {
    const s = this.deps.selection();
    return s ? `${s.sectionKey}:${s.part}` : null;
  });

  /** Full selection identity including `elementPath` - the reset basis for
   * `editing` so moving to a DIFFERENT leaf (even within the same section+part)
   * drops back to view mode. */
  private readonly selKey = computed<string | null>(() => {
    const s = this.deps.selection();
    return s ? `${s.sectionKey}:${s.part}:${s.elementPath ?? ''}` : null;
  });

  /** Whether the selected LEAF is in explicit text-EDIT mode (its own inline
   * editor mounted). A `linkedSignal` off `selKey` so moving the selection to
   * any other element drops back to view mode. */
  readonly editing = linkedSignal<boolean>(() => {
    this.selKey();
    return false;
  });

  /**
   * Binds the host's inputs and starts focus management for the inline editors,
   * in one place:
   * - ENTERING edit mode (`editing()` true) moves focus INTO the mounted leaf
   *   editor, so keyboard users don't need an extra tab;
   * - leaving edit mode via Enter (`finishLeafEdit`) returns focus to the
   *   now-restored selectable host.
   *
   * Both run in a microtask so the DOM has rendered the new state first. Keyed
   * off `focusKey()` (section+part) + `editing()`, not the raw `selection()`
   * object, so an elementPath-only change never re-triggers this.
   *
   * The effect is created HERE rather than in the constructor, and takes an
   * explicit injector: `focusKey` reads `deps`, which does not exist until this
   * call. A constructor-time effect would be a race between Angular's first
   * change detection and the host's own constructor.
   */
  bind(deps: CvPreviewEditModeDeps): void {
    this.deps = deps;
    effect(
      () => {
        const key = this.focusKey();
        const editing = this.editing();
        if (!deps.interactive()) return;
        if (key && editing) {
          queueMicrotask(() =>
            deps.host().querySelector<HTMLElement>('.page-card .cvpreview__leaf-editor')?.focus(),
          );
        } else if (this.returnFocusTo) {
          const target = this.returnFocusTo;
          this.returnFocusTo = null;
          queueMicrotask(() =>
            deps
              .host()
              .querySelector<HTMLElement>(`.page-card [data-cv-select="${target}"]`)
              ?.focus(),
          );
        }
      },
      { injector: this.injector },
    );
  }

  /** True when THIS specific leaf is the one being text-edited - the per-field
   * gate that replaced the old section-level editor branch, so "Edit text"
   * mounts only the selected element's editor, not every field in its section. */
  isEditingLeaf(path: string): boolean {
    return this.editing() && this.sel.isElementSelected(path);
  }

  /** Enter text-edit mode for the current selection (live-panel "Edit text").
   * A no-op with nothing selected. */
  startEditing(): void {
    if (this.deps.selection()) this.editing.set(true);
  }

  /** Finish editing a single-line leaf via Enter: blur commits the draft (the
   * element's own `(blur)` handler), then leave edit mode - the selection is
   * KEPT (chip + outline stay, panel stays open) and focus returns to the
   * now-restored selectable host. */
  finishLeafEdit(el: HTMLElement, sectionKey: CvSectionKey, part: 'body' | 'title'): void {
    el.blur();
    this.returnFocusTo = `${sectionKey}:${part}`;
    this.editing.set(false);
  }
}
