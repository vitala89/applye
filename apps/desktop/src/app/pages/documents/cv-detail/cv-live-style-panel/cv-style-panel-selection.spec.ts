import type { CvPreviewSelection } from '@applye/core';

import {
  canBold,
  canEditText,
  isBulletPath,
  isEntryPath,
  isExperienceEntryPath,
  isWholeLanguages,
  scopeButtonsFor,
  selectedFieldInfo,
  showsWordBoldHint,
} from './cv-style-panel-selection';

const body = (sectionKey: CvPreviewSelection['sectionKey'], elementPath?: string) =>
  ({ part: 'body', sectionKey, elementPath }) as CvPreviewSelection;
const title = (sectionKey: CvPreviewSelection['sectionKey']) =>
  ({ part: 'title', sectionKey }) as CvPreviewSelection;

/** The panel translates through `TranslateService`; these only need the key
 * back, so the identity function makes every assertion read as the key it
 * pins. */
const echo = (key: string) => key;

describe('cv-style-panel-selection: path predicates', () => {
  it('separates an entry from a leaf under it', () => {
    expect(isEntryPath('exp.0')).toBe(true);
    expect(isEntryPath('edu.1')).toBe(true);
    expect(isEntryPath('skills.0')).toBe(true);
    expect(isEntryPath('exp.0.role')).toBe(false);
    expect(isEntryPath(undefined)).toBe(false);
  });

  it('recognises only an experience entry as the one with a rule of its own', () => {
    expect(isExperienceEntryPath('exp.2')).toBe(true);
    expect(isExperienceEntryPath('edu.2')).toBe(false);
    expect(isExperienceEntryPath('exp.2.bullet.0')).toBe(false);
  });

  it('recognises a bullet leaf and the whole languages line', () => {
    expect(isBulletPath('exp.0.bullet.1')).toBe(true);
    expect(isBulletPath('exp.0.role')).toBe(false);
    expect(isWholeLanguages('lang')).toBe(true);
    expect(isWholeLanguages('lang.0')).toBe(false);
  });
});

describe('cv-style-panel-selection: which controls a selection earns', () => {
  it('offers Edit text for a single editable leaf only', () => {
    expect(canEditText(body('experience', 'exp.0.role'))).toBe(true);
    expect(canEditText(body('summary', 'summary'))).toBe(true);
    // A title is a fixed section label, not user-authored text.
    expect(canEditText(title('experience'))).toBe(false);
    // None of these has one inline editor behind it.
    expect(canEditText(body('personal_details', 'pd.contact'))).toBe(false);
    expect(canEditText(body('languages', 'lang'))).toBe(false);
    expect(canEditText(body('experience', 'exp.0'))).toBe(false);
    expect(canEditText(body('personal_details'))).toBe(false);
    expect(canEditText(null)).toBe(false);
  });

  it('offers Bold only where the text has a **markdown** representation', () => {
    expect(canBold(body('summary', 'summary'))).toBe(true);
    expect(canBold(body('experience', 'exp.0.bullet.2'))).toBe(true);
    expect(canBold(body('experience', 'exp.0.role'))).toBe(false);
    expect(canBold(title('summary'))).toBe(false);
  });

  it('shows the click-a-word hint on the two markdown-backed sections', () => {
    expect(showsWordBoldHint(body('summary', 'summary'))).toBe(true);
    expect(showsWordBoldHint(body('experience', 'exp.0.bullet.0'))).toBe(true);
    expect(showsWordBoldHint(body('education', 'edu.0.degree'))).toBe(false);
    expect(showsWordBoldHint(null)).toBe(false);
  });
});

describe('cv-style-panel-selection: the header names what is selected', () => {
  it('names the field for a leaf', () => {
    expect(selectedFieldInfo(body('experience', 'exp.0.company'))).toEqual({
      key: 'documents.cv_field_company',
      id: 'company',
    });
    expect(selectedFieldInfo(body('personal_details', 'pd.fullName'))).toEqual({
      key: 'documents.cv_field_full_name',
      id: 'name',
    });
    expect(selectedFieldInfo(body('experience', 'exp.0.bullet.3'))).toEqual({
      key: 'documents.cv_field_bullet',
      id: 'bullet',
    });
  });

  it('names the section for an entry, the languages line, or a pathless body', () => {
    expect(selectedFieldInfo(body('education', 'edu.1'))?.id).toBe('education');
    expect(selectedFieldInfo(body('languages', 'lang'))?.id).toBe('languages');
    expect(selectedFieldInfo(body('personal_details'))?.id).toBe('personal_details');
  });

  it('falls back to the generic body label for a path it does not know', () => {
    expect(selectedFieldInfo(body('experience', 'exp.0.somethingNew'))?.key).toBe(
      'documents.cv_style_group_body',
    );
    expect(selectedFieldInfo(null)).toBeNull();
  });

  it('names the titles group for a title selection', () => {
    expect(selectedFieldInfo(title('education'))).toEqual({
      key: 'documents.cv_style_group_titles',
      id: 'education',
    });
  });
});

describe('cv-style-panel-selection: the APPLY TO buttons', () => {
  it('puts the DEFAULT scope first, because the panel linkedSignals off it', () => {
    // This ordering is behaviour, not presentation: `scope` reads [0].
    expect(scopeButtonsFor(title('experience'), echo)[0].scope).toBe('section');
    expect(scopeButtonsFor(body('experience', 'exp.0.role'), echo)[0].scope).toBe('element');
    // A pathless body selection defaults to `section`, because element scope
    // there would land on nothing and silently drop the edit.
    expect(scopeButtonsFor(body('personal_details'), echo)[0].scope).toBe('section');
  });

  it('offers one button for a single-target selection', () => {
    expect(scopeButtonsFor(body('experience', 'exp.0.role'), echo)).toHaveLength(1);
    expect(scopeButtonsFor(body('summary', 'summary'), echo)).toHaveLength(1);
    expect(scopeButtonsFor(body('languages', 'lang'), echo)).toHaveLength(1);
    expect(scopeButtonsFor(body('personal_details'), echo)).toHaveLength(1);
  });

  it('names the actual thing each scope targets, per entry kind', () => {
    expect(scopeButtonsFor(body('experience', 'exp.0'), echo).map((b) => b.label)).toEqual([
      'documents.cv_scope_this_experience',
      'documents.cv_scope_all_experiences',
    ]);
    expect(scopeButtonsFor(body('education', 'edu.0'), echo).map((b) => b.label)).toEqual([
      'documents.cv_scope_this_education',
      'documents.cv_scope_all_education',
    ]);
    expect(scopeButtonsFor(body('skills', 'skills.0'), echo).map((b) => b.label)).toEqual([
      'documents.cv_scope_this_skills',
      'documents.cv_scope_all_skills',
    ]);
  });

  it('sends a bullet to the bullets scope rather than the section', () => {
    expect(scopeButtonsFor(body('experience', 'exp.0.bullet.1'), echo).map((b) => b.scope)).toEqual(
      ['element', 'bullets'],
    );
  });

  it('offers nothing without a selection', () => {
    expect(scopeButtonsFor(null, echo)).toEqual([]);
  });
});
