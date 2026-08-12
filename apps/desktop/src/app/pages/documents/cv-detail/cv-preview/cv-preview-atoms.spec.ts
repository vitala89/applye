import type { TemplateRef } from '@angular/core';
import type { CvSection } from '@applye/core';
import { buildCvAtoms, type CvAtomContext } from './cv-preview-atoms';

/** Each template ref is only an identity to assert against; the flattening
 * never looks inside one, which is the whole reason it can be tested here
 * rather than through a mounted preview. */
function tpl(name: string): TemplateRef<unknown> {
  return name as unknown as TemplateRef<unknown>;
}

function context(sections: CvSection[], over: Partial<CvAtomContext> = {}): CvAtomContext {
  return {
    sections,
    includePhoto: false,
    photoDataUri: null,
    photoPlacement: 'above_left',
    t: (key: string) => key,
    tpl: {
      headerTpl: tpl('header'),
      summaryTpl: tpl('summary'),
      sectionTitleTpl: tpl('title'),
      skillsTpl: tpl('skills'),
      expHeadTpl: tpl('expHead'),
      expBulletTpl: tpl('expBullet'),
      eduEntryTpl: tpl('eduEntry'),
      languagesTpl: tpl('languages'),
    },
    ...over,
  };
}

const PERSONAL = {
  key: 'personal_details',
  order: 0,
  visible: true,
  fullName: 'Mira',
  title: 'Engineer',
  contact: {},
} as unknown as CvSection;

describe('buildCvAtoms', () => {
  it('keeps the sections in the order they render', () => {
    const summary = { key: 'summary', order: 1, visible: true, text: 'Hi' } as unknown as CvSection;

    const ids = buildCvAtoms(context([PERSONAL, summary])).map((a) => a.id);

    expect(ids).toEqual(['header', 'summary']);
  });

  /** An empty section would otherwise reserve a page slot and print a heading
   * with nothing under it. */
  it('skips a section that would render nothing', () => {
    const summary = { key: 'summary', order: 1, visible: true, text: '' } as unknown as CvSection;
    const skills = { key: 'skills', order: 2, visible: true, groups: [] } as unknown as CvSection;

    expect(buildCvAtoms(context([PERSONAL, summary, skills])).map((a) => a.id)).toEqual(['header']);
  });

  /** `photo` has no atom of its own - it folds into the header's context. */
  it('folds the photo into the header rather than giving it an atom', () => {
    const atoms = buildCvAtoms(
      context([PERSONAL], { includePhoto: true, photoDataUri: 'data:image/png;base64,AA' }),
    );

    expect(atoms).toHaveLength(1);
    expect(atoms[0].ctx).toMatchObject({ photoUri: 'data:image/png;base64,AA' });
  });

  it('passes no photo when the toggle is off, even with one stored', () => {
    const atoms = buildCvAtoms(
      context([PERSONAL], { includePhoto: false, photoDataUri: 'data:image/png;base64,AA' }),
    );

    expect(atoms[0].ctx).toMatchObject({ photoUri: null });
  });

  describe('experience', () => {
    const experience = {
      key: 'experience',
      order: 1,
      visible: true,
      entries: [
        { company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One', 'Two'] },
        { company: 'Globex', role: 'Lead', startDate: '2018', bullets: [] },
      ],
    } as unknown as CvSection;

    /** A heading must never sit alone at the foot of a page, and an entry head
     * must never be separated from its first bullet - but the remaining
     * bullets are free to flow, so the current page fills instead of the whole
     * entry jumping. */
    it('glues the title to the first entry and each head to its first bullet', () => {
      const atoms = buildCvAtoms(context([experience]));
      const glued = atoms.filter((a) => a.glueToNext).map((a) => a.id);

      expect(atoms[0].id).toBe('sec:experience:title');
      expect(glued).toEqual(['sec:experience:title', 'sec:experience:e0:head']);
    });

    it('does not glue an entry head that has no bullets', () => {
      const atoms = buildCvAtoms(context([experience]));
      const second = atoms.find((a) => a.id === 'sec:experience:e1:head');

      expect(second?.glueToNext).toBeFalsy();
    });

    it('drops the section entirely when it has no entries', () => {
      const empty = { ...(experience as unknown as { entries: unknown[] }), entries: [] };

      expect(buildCvAtoms(context([empty as unknown as CvSection]))).toEqual([]);
    });
  });
});
