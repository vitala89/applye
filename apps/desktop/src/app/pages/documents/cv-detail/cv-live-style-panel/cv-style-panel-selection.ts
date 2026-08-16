import { sectionLabelKey } from '@applye/core';
import type { CvPreviewSelection, CvStyleScope } from '@applye/core';

/**
 * What the live style panel's selection *is*: the path predicates that classify
 * a `CvPreviewSelection`, the field label shown in its "Editing" header, and the
 * contextual APPLY TO buttons.
 *
 * Pure and page-local. It stays out of `libs/core` for two reasons: the label
 * and button builders below produce user-facing text, and `CODE_QUALITY.md`
 * keeps a module about how something looks out of the domain library (the
 * `scan-console.ts` precedent); and the predicates exist only to decide what
 * those labels say, so splitting them off would divide one idea across a layer
 * boundary. `libs/core`'s `cv-selection.util.ts` owns the *type* these parse,
 * not the parsing.
 */

/** A "group" path (`exp.0`, `edu.1`, `skills.0`) targets a whole
 * experience/education entry or a skills group, not a single text leaf - it
 * behaves like a section selection (section-scope styling, section name in the
 * header) but frames just the clicked group on the paper. */
export function isEntryPath(p: string | undefined): boolean {
  return !!p && /^(?:exp|edu|skills)\.\d+$/.test(p);
}

/** A bullet leaf (`exp.0.bullet.1`) - the one body path whose inherited base is
 * the shared bullet style rather than the section override. */
export function isBulletPath(p: string | undefined): boolean {
  return !!p && p.includes('.bullet.');
}

/** An experience entry (`exp.0`) - the only entry with a rule of its own. */
export function isExperienceEntryPath(p: string | undefined): boolean {
  return !!p && /^exp\.\d+$/.test(p);
}

/** The languages line is a single whole-section element (`lang`): styling it is
 * the same as styling the section, so the section scope is redundant and
 * hidden. */
export function isWholeLanguages(p: string | undefined): boolean {
  return p === 'lang';
}

/** "Edit text" applies to editable content - any body selection. Titles are
 * fixed section labels, not user-authored text, so they get no Edit control.
 *
 * Only a single editable TEXT leaf qualifies. Excluded: a pathless whole-section
 * body, the composed contact line, the whole languages line, and group/entry
 * paths - none has one inline editor. */
export function canEditText(sel: CvPreviewSelection | null): boolean {
  const p = sel?.elementPath;
  return sel?.part === 'body' && !!p && p !== 'pd.contact' && p !== 'lang' && !isEntryPath(p);
}

/** The click-a-word-to-bold hint is shown only for the `**markdown**`-backed
 * leaves - the summary body and experience bullets. Other body leaves have no
 * inline-bold representation. */
export function showsWordBoldHint(sel: CvPreviewSelection | null): boolean {
  return (
    !!sel &&
    sel.part === 'body' &&
    (sel.sectionKey === 'summary' || sel.sectionKey === 'experience')
  );
}

/** The selected leaf is one whose text supports `**bold**` - only the summary
 * body and experience bullets. Drives the panel's Bold button (shown while
 * editing such a leaf). */
export function canBold(sel: CvPreviewSelection | null): boolean {
  const p = sel?.part === 'body' ? sel.elementPath : undefined;
  return !!p && (p === 'summary' || p.split('.').includes('bullet'));
}

/** The specific field label key + short id for a selection - shown in the
 * panel's "Editing" header so it names exactly what is selected (mirrors the
 * on-paper chip, e.g. "Name  #name"). Derived by parsing the selection's
 * `elementPath`; falls back to the generic body/title labels. */
export function selectedFieldInfo(
  sel: CvPreviewSelection | null,
): { key: string; id: string } | null {
  if (!sel) return null;
  if (sel.part === 'title') return { key: 'documents.cv_style_group_titles', id: sel.sectionKey };
  const p = sel.elementPath;
  // A group/entry, the whole languages line, or a pathless body selection all
  // name the SECTION itself in the header (e.g. "Education", "Languages")
  // rather than a generic field label.
  if (isEntryPath(p) || isWholeLanguages(p) || !p) {
    return { key: sectionLabelKey(sel.sectionKey), id: sel.sectionKey };
  }
  if (p === 'summary') {
    return { key: 'documents.cv_style_group_body', id: 'summary' };
  }
  const seg = p.split('.');
  switch (seg[0]) {
    case 'pd':
      return seg[1] === 'fullName'
        ? { key: 'documents.cv_field_full_name', id: 'name' }
        : seg[1] === 'contact'
          ? { key: 'documents.cv_field_contact', id: 'contact' }
          : { key: 'documents.cv_field_title', id: 'title' };
    case 'exp': {
      if (seg.includes('bullet')) return { key: 'documents.cv_field_bullet', id: 'bullet' };
      const map: Record<string, string> = {
        company: 'documents.cv_field_company',
        industry: 'documents.cv_field_industry',
        location: 'documents.cv_field_location',
        role: 'documents.cv_field_role',
        startDate: 'documents.cv_field_start_date',
        endDate: 'documents.cv_field_end_date',
      };
      return {
        key: map[seg[2]] ?? 'documents.cv_style_group_body',
        id: seg[2] ?? sel.sectionKey,
      };
    }
    case 'skills':
      return seg[2] === 'label'
        ? { key: 'documents.cv_field_label', id: 'category' }
        : { key: 'documents.cv_field_values', id: 'values' };
    case 'lang':
      return { key: 'documents.cv_field_language', id: 'language' };
    case 'edu': {
      const map: Record<string, string> = {
        degree: 'documents.cv_field_degree',
        institution: 'documents.cv_field_institution',
        startDate: 'documents.cv_field_start_date',
        endDate: 'documents.cv_field_end_date',
      };
      return {
        key: map[seg[2]] ?? 'documents.cv_section_education',
        id: seg[2] ?? 'edu' + (seg[1] ?? ''),
      };
    }
    default:
      return { key: 'documents.cv_style_group_body', id: sel.sectionKey };
  }
}

/** The contextual "APPLY TO" buttons for a selection - each names the actual
 * thing it targets ("This experience" / "All experiences") rather than the
 * abstract element/section scope, and single-target selections (personal-details
 * block, body text, languages, a lone field) show just one button.
 *
 * **The first entry is the default scope**, which is what `scope` linkedSignals
 * off, so the order here is behaviour rather than presentation. */
export function scopeButtonsFor(
  sel: CvPreviewSelection | null,
  t: (key: string) => string,
): { scope: CvStyleScope; label: string }[] {
  if (!sel) return [];
  const D = (k: string) => t('documents.' + k);
  if (sel.part === 'title') {
    return [
      { scope: 'section', label: D('cv_style_scope_this_title') },
      { scope: 'document', label: D('cv_style_scope_all_titles') },
    ];
  }
  const p = sel.elementPath;
  // Whole-section body block (personal details) - one button, named section.
  if (!p) return [{ scope: 'section', label: t(sectionLabelKey(sel.sectionKey)) }];
  if (p === 'summary') return [{ scope: 'element', label: D('cv_scope_body_text') }];
  if (p === 'lang') return [{ scope: 'element', label: D('cv_scope_languages') }];
  const seg = p.split('.');
  if (isEntryPath(p)) {
    if (seg[0] === 'exp')
      return [
        { scope: 'element', label: D('cv_scope_this_experience') },
        { scope: 'section', label: D('cv_scope_all_experiences') },
      ];
    if (seg[0] === 'edu')
      return [
        { scope: 'element', label: D('cv_scope_this_education') },
        { scope: 'section', label: D('cv_scope_all_education') },
      ];
    return [
      { scope: 'element', label: D('cv_scope_this_skills') },
      { scope: 'section', label: D('cv_scope_all_skills') },
    ];
  }
  if (seg[0] === 'exp' && seg.includes('bullet')) {
    return [
      { scope: 'element', label: D('cv_scope_this_achievement') },
      { scope: 'bullets', label: D('cv_scope_all_achievements') },
    ];
  }
  // A single field (company, role, name, date, …): element-only.
  return [{ scope: 'element', label: D('cv_scope_this_field') }];
}
