import { ComponentFixture } from '@angular/core/testing';

import { CvPreviewComponent } from './cv-preview.component';
import { createCvPreview } from './cv-preview.harness';

import type { CvPreviewSelection } from '@applye/core';

/**
 * The education atom, asserted from the rendered page card.
 *
 * Written because a mutation survived: pointing the education entry's click and
 * Enter handlers at `selectPart(key, 'title')` instead of `selectLeaf(key,
 * 'edu.<i>')` changed nothing that any of the ten existing spec files could
 * see. Experience was covered leaf by leaf and education was not covered at
 * all, which only became visible when the atom moved into its own component.
 *
 * Every assertion here counts **per call site in both directions**: an
 * education leaf must carry its own path and its own accessible name, and must
 * not carry the experience atom's - the two now render from sibling components
 * that share the same `_cv-preview-entry.scss` and the same protocol.
 */
describe('CvPreviewComponent education atom', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createCvPreview());
  });

  function setupEducation(): HTMLElement {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      {
        key: 'education',
        order: 0,
        visible: true,
        entries: [
          {
            degree: 'BSc Computer Science',
            institution: 'Technical University',
            startDate: '2014',
            endDate: '2018',
          },
        ],
      },
    ]);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('clicking an education entry pins that entry, not the section title', () => {
    const root = setupEducation();
    const emitted: (CvPreviewSelection | null)[] = [];
    component.selectionChange.subscribe((v) => emitted.push(v));
    const entry = root.querySelector('.page-card div.cvpreview__entry') as HTMLElement;
    entry.click();
    expect(emitted).toEqual([{ sectionKey: 'education', part: 'body', elementPath: 'edu.0' }]);
  });

  it('Enter on an education entry pins the same thing a click does', () => {
    const root = setupEducation();
    const emitted: (CvPreviewSelection | null)[] = [];
    component.selectionChange.subscribe((v) => emitted.push(v));
    const entry = root.querySelector('.page-card div.cvpreview__entry') as HTMLElement;
    entry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(emitted).toEqual([{ sectionKey: 'education', part: 'body', elementPath: 'edu.0' }]);
  });

  it('each education leaf carries its own path - degree and institution are not the same target', () => {
    const root = setupEducation();
    const emitted: (CvPreviewSelection | null)[] = [];
    component.selectionChange.subscribe((v) => emitted.push(v));
    const leaves = Array.from(
      root.querySelectorAll<HTMLElement>('.page-card [data-cv-chip]'),
    ).filter((el) => el.textContent?.trim() === 'BSc Computer Science');
    expect(leaves.length).toBe(1);
    leaves[0].click();
    expect(emitted.at(-1)).toEqual({
      sectionKey: 'education',
      part: 'body',
      elementPath: 'edu.0.degree',
    });
  });

  it('education leaves get education accessible names, and no experience one', () => {
    const root = setupEducation();
    const labels = Array.from(root.querySelectorAll<HTMLElement>('.page-card [aria-label]')).map(
      (el) => el.getAttribute('aria-label'),
    );
    expect(labels).toContain('Education - Degree');
    expect(labels).toContain('Education - Institution');
    expect(labels.some((l) => l?.startsWith('Experience'))).toBe(false);
  });
});
