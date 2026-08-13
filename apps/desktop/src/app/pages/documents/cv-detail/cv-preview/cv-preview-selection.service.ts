import { Injectable, type Signal } from '@angular/core';
import type { CvPreviewSelection, CvSectionKey } from '@applye/core';
import { sectionLabelKey } from '@applye/core';

/** Field key for a per-leaf accessible-name suffix: every per-leaf selectable
 * host - one with its own distinct `elementPath`, e.g. an experience entry's
 * company/industry/location/role or a skill group's label/values - would
 * otherwise reuse the generic `selectAriaLabel(key, 'body')` name for every
 * field in the same section, so a screen reader announced "Experience - Body
 * text" for company, industry, location AND role alike. `leafAriaLabel`
 * composes the section label with a field-specific label instead, reusing the
 * SAME i18n field labels already shown in the Edit-mode section editors
 * (`cv_field_company`, `cv_field_role`, …) rather than minting parallel
 * strings. Hosts with no single leaf singled out (the whole-entry/whole-row/
 * whole-body wrapper, which never carries an `elementPath`) keep the generic
 * `selectAriaLabel` name - there is nothing to disambiguate there. */
export type CvLeafFieldKey =
  | 'fullName'
  | 'title'
  | 'company'
  | 'industry'
  | 'location'
  | 'role'
  | 'startDate'
  | 'endDate'
  | 'contact'
  | 'degree'
  | 'institution'
  | 'bullet'
  | 'skillLabel'
  | 'skillValues'
  | 'language';

const LEAF_FIELD_LABEL_KEYS: Record<CvLeafFieldKey, string> = {
  fullName: 'documents.cv_field_full_name',
  title: 'documents.cv_field_title',
  company: 'documents.cv_field_company',
  industry: 'documents.cv_field_industry',
  location: 'documents.cv_field_location',
  role: 'documents.cv_field_role',
  startDate: 'documents.cv_field_start_date',
  endDate: 'documents.cv_field_end_date',
  contact: 'documents.cv_field_contact',
  degree: 'documents.cv_field_degree',
  institution: 'documents.cv_field_institution',
  bullet: 'documents.cv_field_bullet',
  skillLabel: 'documents.cv_field_label',
  skillValues: 'documents.cv_field_values',
  language: 'documents.cv_field_language',
};

/** What selection is computed from. Passed in rather than injected, for the
 * same reason as `CvPreviewStyleDeps`: `selection` and `interactive` are the
 * host component's own inputs, and a second source of them would be a second
 * truth. `emit` is the component's `selectionChange` output - the service
 * decides WHEN to emit, the component owns the wire. */
export interface CvPreviewSelectionDeps {
  selection: Signal<CvPreviewSelection | null>;
  interactive: Signal<boolean>;
  t: Signal<(key: string) => string>;
  emit: (next: CvPreviewSelection | null) => void;
}

/**
 * Who is selected, whether a render may offer selection at all, and the
 * accessible names and chip labels those selectable hosts carry.
 *
 * Split out of `cv-preview.component.ts` when it was still 535/400 after the
 * editing, styling and atom cuts (ADR-0005, level three). Extracted BEFORE the
 * template split rather than after it: the 2026-08-04 decision recorded that no
 * atom template can become a child component while the selection protocol
 * lives on the component class, because the child would have to thread sixteen
 * members through its input boundary against a campaign precedent of eleven. As
 * an injectable provided by the preview, a child resolves it through the
 * `ng-template`'s declaration injector and threads none of them.
 *
 * The component keeps one-line delegators for its own template. That is
 * deliberate and temporary: prefixing 317 existing call sites with `sel.` would
 * push bindings past the 100-column limit, and the reflow would GROW the
 * template this extraction exists to shrink. Each delegator dies with the atom
 * block that calls it, as the blocks become child components.
 *
 * Provided by `CvPreviewComponent`, which binds its inputs once.
 */
@Injectable()
export class CvPreviewSelectionService {
  private deps!: CvPreviewSelectionDeps;

  bind(deps: CvPreviewSelectionDeps): void {
    this.deps = deps;
  }

  /** True only for a visible page-card render while interactive - the single
   * gate every atom template uses so the hidden measurement pass (`'measure'`)
   * never gains a role, tabindex, cursor, or click handler. */
  selectable(renderMode: unknown): boolean {
    return this.deps.interactive() && renderMode === 'page';
  }

  isSelected(sectionKey: CvSectionKey, part: 'body' | 'title'): boolean {
    const s = this.deps.selection();
    return !!s && s.sectionKey === sectionKey && s.part === part;
  }

  /** True when the WHOLE section body is the selection - i.e. its body is
   * selected with no specific leaf (`elementPath`) singled out. Drives the
   * section-wrapper highlight + chip so selecting a group (e.g. the personal-
   * details block or an experience entry) reads the same as selecting a single
   * field. Kept distinct from `isSelected(key,'body')`, which stays true even
   * when a leaf inside the section is the actual target. */
  isSectionSelected(sectionKey: CvSectionKey): boolean {
    const s = this.deps.selection();
    return !!s && s.sectionKey === sectionKey && s.part === 'body' && !s.elementPath;
  }

  /** Element-scope highlight: true when `path` is the specific leaf the
   * current selection targets (`elementPath`) - distinct from `isSelected`,
   * which only tracks section+part. `path` is the same transient draft-id
   * string passed to `leafDraft` for that leaf (see `CvPreviewSelection`),
   * so callers never need a separate lookup table to know "is this the
   * element the live-style panel is scoped to". */
  isElementSelected(path: string): boolean {
    return this.deps.selection()?.elementPath === path;
  }

  /** True only when `next` differs from the current selection in
   * `sectionKey`, `part`, or `elementPath` - the shared guard behind both
   * `selectPart` and `selectLeaf` (see their docs for why re-emitting an
   * identical selection must be avoided). */
  private isNewSelection(next: CvPreviewSelection): boolean {
    const s = this.deps.selection();
    return (
      !s ||
      s.sectionKey !== next.sectionKey ||
      s.part !== next.part ||
      s.elementPath !== next.elementPath
    );
  }

  /** Emit a semantic selection for a clicked target - a no-op unless this is a
   * selectable page render, so the inert measurement pass can never emit.
   * Also a no-op (after stopping propagation) when the requested region is
   * already the current selection: re-emitting an identical-but-new
   * selection object would still change the `selection` signal's reference,
   * re-running the focus effect and yanking focus back to the section's
   * first leaf editor - stealing it from whatever leaf inside the same
   * section the user actually clicked (e.g. a bullet nested under an
   * already-selected experience entry).
   *
   * `elementPath` is optional and additive (Phase D.2): passing it targets a
   * single body leaf as the style-scope while still gating content editors
   * at the section+part level (`isSelected` ignores it). Only ever pass it
   * alongside `part: 'body'` - a title selection has no element scope. */
  selectPart(
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    event?: Event,
    elementPath?: string,
  ): void {
    if (!this.selectable(renderMode)) return;
    event?.stopPropagation();
    const next: CvPreviewSelection =
      elementPath !== undefined ? { sectionKey, part, elementPath } : { sectionKey, part };
    if (!this.isNewSelection(next)) return;
    this.deps.emit(next);
  }

  /** Selects one specific body leaf - a thin wrapper over `selectPart` that
   * always targets `part: 'body'` and stops the click from also being
   * handled by the section-wrapper host's own `selectPart` binding (leaf
   * hosts are nested inside the section body host in the template). `path`
   * must be the exact same string passed to `leafDraft` for this leaf - see
   * `CvPreviewSelection.elementPath`. */
  selectLeaf(sectionKey: CvSectionKey, path: string, renderMode: unknown, event?: Event): void {
    this.selectPart(sectionKey, 'body', renderMode, event, path);
  }

  /** Keyboard activation of a selectable host. Space would otherwise scroll the
   * page, so we always `preventDefault` before selecting - this gives Space the
   * same activation semantics as Enter and a native `<button>`. */
  onSelectKey(
    event: Event,
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    elementPath?: string,
  ): void {
    if (!this.selectable(renderMode)) return;
    // A key event bubbling up from an inline editor must NOT be treated as a
    // host activation: otherwise typing Space into an input gets
    // `preventDefault`'d (no space char) and re-selects the host, yanking
    // focus out of the edit. Let the editor handle its own keys.
    const target = event.target as HTMLElement | null;
    if (target?.closest('.cvpreview__leaf-editor')) return;
    event.preventDefault();
    this.selectPart(sectionKey, part, renderMode, event, elementPath);
  }

  /** Clear the selection when the user clicks empty space in the preview -
   * anywhere that is NOT a selectable host, an inline editor, or an editor's
   * Bold button (selectable hosts already `stopPropagation`; this guard also
   * covers the editor textareas/inputs, which don't). Keeps a focused edit
   * alive: clicking the active editor never deselects. A no-op off the
   * interactive page render or when nothing is selected. Any in-progress edit
   * commits independently via the editor's own native `(blur)`. The component
   * binds this to a host listener rather than a template `(click)` so the
   * deselect catcher needs no focusable/keyboard affordance - selectable hosts
   * already stop propagation, so only genuine empty-space clicks reach it. */
  clearOnBackgroundClick(event: Event): void {
    if (!this.deps.interactive() || !this.deps.selection()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-cv-select], .cvpreview__leaf-editor')) return;
    this.deps.emit(null);
  }

  /** Accessible name for a selectable body/title host - "<section> - <scope>"
   * (e.g. "Summary - Body text"), built from existing localized strings so the
   * `role="button"` regions are never announced as unnamed buttons. */
  selectAriaLabel(sectionKey: CvSectionKey, part: 'body' | 'title'): string {
    return `${this.sectionLabel(sectionKey)} - ${this.partChipLabel(part)}`;
  }

  /** Field-specific accessible name for a per-leaf selectable host - "<section>
   * - <field>" (e.g. "Experience - Company"), so a screen reader can tell
   * apart sibling leaves in the same section/part that `selectAriaLabel`
   * alone would announce identically. See `CvLeafFieldKey`'s doc. */
  leafAriaLabel(sectionKey: CvSectionKey, field: CvLeafFieldKey): string {
    return `${this.sectionLabel(sectionKey)} - ${this.leafChipLabel(field)}`;
  }

  /** Short chip label shown above a selected single leaf on the paper - the
   * field name (e.g. "Company", "Skill values"), reusing the same i18n field
   * labels as the a11y names and the Edit-mode section editors. */
  leafChipLabel(field: CvLeafFieldKey): string {
    return this.deps.t()(LEAF_FIELD_LABEL_KEYS[field]);
  }

  /** Chip label for a selected section-level part (a title, or a whole-section
   * body with no single leaf singled out). */
  partChipLabel(part: 'body' | 'title'): string {
    return this.deps.t()(
      part === 'title' ? 'documents.cv_style_group_titles' : 'documents.cv_style_group_body',
    );
  }

  private sectionLabel(sectionKey: CvSectionKey): string {
    return this.deps.t()(sectionLabelKey(sectionKey));
  }
}
