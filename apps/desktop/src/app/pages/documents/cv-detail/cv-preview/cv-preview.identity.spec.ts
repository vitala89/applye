import { ComponentFixture } from '@angular/core/testing';
import type { CvPreviewSelection } from '../../cv-content.util';
import { CvPreviewComponent } from './cv-preview.component';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent selection identity', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createCvPreview());
  });

  describe('element-level selection identity (Phase D.2)', () => {
    it('clicking a section title never carries an elementPath', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const title = (fixture.nativeElement as HTMLElement).querySelector(
        '.page-card .cvpreview__section-title',
      ) as HTMLElement;
      title.click();
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'title' }]);
      expect(emitted[0] && 'elementPath' in emitted[0]).toBe(false);
    });

    it('the inert measurement pass never emits, even when a leaf-level span is clicked', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const measuredRole = (fixture.nativeElement as HTMLElement).querySelector(
        '.paginated-sheet__measure .cvpreview__entry-role',
      ) as HTMLElement;
      expect(measuredRole).toBeTruthy();
      measuredRole.click();
      expect(emitted).toEqual([]);
    });

    // Representative leaves (per the task's example set): the string a leaf's
    // click emits as `elementPath` must be the exact same string `leafDraft`
    // uses to key that leaf's draft - one shared identity, asserted
    // end-to-end (click → emitted path → set as selection → type into the
    // now-mounted editor → read back via `leafDraft` using that same path).

    it('summary - the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const body = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      body.click();
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body', elementPath: 'summary' }]);

      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      textarea.value = 'Edited';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('summary', 'unused-resting-fallback')).toBe('Edited');
    });

    it('exp.1.role - the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [
            { company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] },
            { company: 'Globex', role: 'Lead', startDate: '2022', bullets: [] },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const entries = root.querySelectorAll('.page-card .cvpreview__entry');
      const secondRole = entries[1].querySelector('.cvpreview__entry-role') as HTMLElement;
      secondRole.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.1.role' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      const roleInput = root.querySelector('input.cvpreview__entry-role') as HTMLInputElement;
      roleInput.value = 'Staff Engineer';
      roleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('exp.1.role', 'unused')).toBe('Staff Engineer');
    });

    it('exp.1.bullet.0 - the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [
            { company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] },
            { company: 'Globex', role: 'Lead', startDate: '2022', bullets: ['Shipped X'] },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // Entry 0 has no bullets, so exactly one bullet host exists - entry 1's.
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.1.bullet.0' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      const textarea = root.querySelector(
        'textarea.cvpreview__bullet-editor',
      ) as HTMLTextAreaElement;
      textarea.value = 'Shipped X and Y';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('exp.1.bullet.0', 'unused')).toBe('Shipped X and Y');
    });

    it('skills.0.values - the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [{ label: 'Languages', values: ['TypeScript', 'Rust'] }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const valuesSpan = root.querySelector(
        '.page-card .cvpreview__skill-values-view',
      ) as HTMLElement;
      valuesSpan.click();
      expect(emitted).toEqual([
        { sectionKey: 'skills', part: 'body', elementPath: 'skills.0.values' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      const valuesInput = root.querySelector('input.cvpreview__skill-values') as HTMLInputElement;
      valuesInput.value = 'TypeScript, Go';
      valuesInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('skills.0.values', 'unused')).toBe('TypeScript, Go');
    });

    it('lang.0.language - the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'languages',
          order: 0,
          visible: true,
          items: [
            { language: 'English', level: 'C2' },
            { language: 'German', level: 'B1' },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const values = root.querySelectorAll('.page-card .cvpreview__language-value');
      (values[0] as HTMLElement).click();
      expect(emitted).toEqual([
        { sectionKey: 'languages', part: 'body', elementPath: 'lang.0.language' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      const inputs = root.querySelectorAll(
        'input.cvpreview__language-input',
      ) as NodeListOf<HTMLInputElement>;
      inputs[0].value = 'Anglais';
      inputs[0].dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('lang.0.language', 'unused')).toBe('Anglais');
    });

    it('only the selected leaf carries the element-selected highlight; siblings stay resting', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      // Only the selected leaf's editor mounts and is highlighted; the sibling
      // company stays a resting view span with no highlight.
      const roleInput = root.querySelector('input.cvpreview__entry-role') as HTMLElement;
      const companyView = root.querySelector('span.cvpreview__entry-company') as HTMLElement;
      expect(roleInput.classList.contains('cvpreview__element-selected')).toBe(true);
      expect(companyView.classList.contains('cvpreview__element-selected')).toBe(false);
      expect(component.isElementSelected('exp.0.role')).toBe(true);
      expect(component.isElementSelected('exp.0.company')).toBe(false);
    });

    it('the element-selected highlight never leaks into the inert measurement pass (review fix)', () => {
      // Regression: the resting (@else) leaf branches' `cvpreview__element-
      // selected` bindings used to read only `isElementSelected(path)`,
      // omitting the `selectable(renderMode)` guard the sibling
      // `cvpreview__selected` binding always carries. Since resting leaf
      // spans render in BOTH the page pass and the hidden measurement
      // mirror, an active elementPath selection leaked the highlight
      // outline into the measure pass - a contract violation (the measure
      // pass must render no selection chrome at all). Scoped to `.page-card`
      // vs `.paginated-sheet__measure`, mirroring the existing measurement-
      // mirror tests above.
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      // On a page-card render `selectable(renderMode)` is true, so the
      // section+part selection mounts the inline editor (an <input>), not
      // the resting <span> - the resting branch this bug lives in only
      // renders when NOT selectable, i.e. only in the measurement mirror.
      const pageRole = root.querySelector(
        '.page-card input.cvpreview__entry-role',
      ) as HTMLInputElement;
      const measuredRole = root.querySelector(
        '.paginated-sheet__measure .cvpreview__entry-role',
      ) as HTMLElement;
      expect(pageRole).toBeTruthy();
      expect(measuredRole).toBeTruthy();
      // The page-card input reflects the pinned selection via its own
      // (already-gated-by-context) binding...
      expect(pageRole.classList.contains('cvpreview__element-selected')).toBe(true);
      // ...but the measure pass's resting span must NEVER carry it, even
      // though `isElementSelected('exp.0.role')` alone would say true.
      expect(measuredRole.classList.contains('cvpreview__element-selected')).toBe(false);
    });

    it('selecting a different leaf in the same section emits (guard is element-aware, not just section-aware)', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // Same sectionKey/part as current selection, different elementPath.
      component.selectPart('experience', 'body', 'page', undefined, 'exp.0.company');
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.company' },
      ]);
      // The parent would normally feed the emitted value back in as the new
      // `selection` input - simulate that, then confirm re-selecting the
      // exact same leaf is a no-op.
      fixture.componentRef.setInput('selection', emitted[0]);
      component.startEditing();
      fixture.detectChanges();
      component.selectPart('experience', 'body', 'page', undefined, 'exp.0.company');
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.company' },
      ]);
    });
  });
});
