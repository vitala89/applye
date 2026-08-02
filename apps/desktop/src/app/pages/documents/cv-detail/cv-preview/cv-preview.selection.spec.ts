import { ComponentFixture } from '@angular/core/testing';
import type { CvPreviewSelection } from '../../cv-content.util';
import { CvPreviewComponent } from './cv-preview.component';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent selection', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createCvPreview());
  });

  describe('focus trap fix - reselecting the same region (Change 1)', () => {
    function setupExperience() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'body' });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One'] }],
        },
      ]);
      component.startEditing();
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('clicking a bullet host inside the already-selected experience body DOES emit - it now pins a specific elementPath', () => {
      // Phase D.2 supersedes the old blanket "same section/part never
      // re-emits" rule with an element-aware one: the current selection has
      // no elementPath (whole-section state), and the bullet host carries
      // its own leaf path (`exp.0.bullet.0`) - a genuinely more specific
      // target, so this MUST emit to move the style-scope onto it. Re-
      // emitting no longer risks yanking focus away: the focus effect is
      // keyed on section+part only (see `focusKey`), so an elementPath-only
      // change never re-triggers it.
      const root = setupExperience();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.bullet.0' },
      ]);
    });

    it('clicking the same already-pinned leaf again does not re-emit (guard still holds, element-aware)', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One'] }],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([]);
    });

    it('changing the selected leaf drops edit mode back to view', () => {
      // Per-leaf edit model: editing is keyed to the exact selected element, so
      // clicking a different leaf (even within the same section+part) exits
      // edit mode and returns the resting markup - you re-arm it with Edit text.
      const root = setupExperience();
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.company',
      });
      component.startEditing();
      fixture.detectChanges();
      expect(root.querySelector('.page-card input.cvpreview__entry-company')).toBeTruthy();
      expect(component.editing()).toBe(true);

      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.detectChanges();
      expect(component.editing()).toBe(false);
      expect(root.querySelector('.page-card input.cvpreview__entry-company')).toBeNull();
    });

    it('clicking a different section/part still emits a new selection', () => {
      const root = setupExperience();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const title = root.querySelector('.page-card .cvpreview__section-title') as HTMLElement;
      title.click();
      expect(emitted).toEqual([{ sectionKey: 'experience', part: 'title' }]);
    });

    it('selectPart is a no-op (no emit) when the requested region is already selected', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      component.selectPart('summary', 'body', 'page', undefined, 'summary');
      expect(emitted).toEqual([]);
      component.selectPart('summary', 'title', 'page');
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'title' }]);
    });
  });

  describe('keyboard hardening', () => {
    function setupSummary() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      return {
        root,
        body: root.querySelector('.page-card .cvpreview__summary') as HTMLElement,
        title: root.querySelector('.page-card .cvpreview__section-title') as HTMLElement,
      };
    }

    it('Space activates a selectable host (native-button parity with Enter)', () => {
      const { body } = setupSummary();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      body.dispatchEvent(ev);
      // The summary body atom is exactly one leaf, so Space (like click)
      // carries that leaf's elementPath - see `onSelectKey(..., 'summary')`.
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body', elementPath: 'summary' }]);
      expect(ev.defaultPrevented).toBe(true); // Space must not scroll the page
    });

    it('gives every selectable host an accessible name and a data-cv-select handle', () => {
      const { body, title } = setupSummary();
      expect(body.getAttribute('aria-label')).toBe('Summary - Body text');
      expect(title.getAttribute('aria-label')).toBe('Summary - Section titles');
      expect(body.getAttribute('data-cv-select')).toBe('summary:body');
      expect(title.getAttribute('data-cv-select')).toBe('summary:title');
    });

    it('the selected outline never paints on the inert measurement pass', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const measuredTitle = root.querySelector(
        '.paginated-sheet__measure .cvpreview__section-title',
      ) as HTMLElement;
      expect(measuredTitle.classList.contains('cvpreview__selected')).toBe(false);
    });

    it('Escape discards the draft so a later model change is not shadowed by a stale draft', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Original' },
      ]);
      component.startEditing();
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      textarea.value = 'Half-typed draft';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // The model changes (e.g. a regenerate lands) while still selected. With a
      // cleared draft the editor reflects the NEW value; a stale `drafts[id]`
      // (the old behaviour) would keep shadowing it.
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Regenerated' },
      ]);
      fixture.detectChanges();
      expect(textarea.value).toBe('Regenerated');
    });

    it('selecting a region moves focus into its primary editor (autofocus restored)', async () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      component.startEditing();
      fixture.detectChanges();
      await Promise.resolve(); // flush the queued focus microtask
      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        '.page-card textarea.cvpreview__summary',
      );
      expect(document.activeElement).toBe(textarea);
    });

    it('Enter on a single-line leaf commits, exits edit mode (keeping the selection), and returns focus to the host', async () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'personal_details',
        part: 'body',
        elementPath: 'pd.fullName',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'personal_details', order: 0, visible: true, fullName: 'Ada', title: '', email: '' },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      // Enter leaves edit mode (resting markup returns) but the selection is
      // KEPT - the panel stays open on the same element.
      expect(component.editing()).toBe(false);
      fixture.detectChanges();
      await Promise.resolve();
      const host = root.querySelector(
        '.page-card [data-cv-select="personal_details:body"]',
      ) as HTMLElement;
      expect(document.activeElement).toBe(host);
    });
  });

  describe('per-leaf accessible names (Task 6 a11y hardening - T2 review minor)', () => {
    // Regression: every per-leaf selectable host used to reuse the generic
    // `selectAriaLabel(key, 'body')` name, so a screen reader announced the
    // SAME "<section> - Body text" label for every field in one entry (e.g.
    // company/industry/location/role in a single experience entry). Each leaf
    // with its own `elementPath` must now announce its specific field instead.
    function setupFullEntry() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'personal_details',
          order: 0,
          visible: true,
          fullName: 'Ada Lovelace',
          title: 'Engineer',
        },
        {
          key: 'experience',
          order: 1,
          visible: true,
          entries: [
            {
              company: 'Acme',
              role: 'Engineer',
              industry: 'SaaS',
              location: 'Berlin',
              startDate: '2020',
              bullets: ['Shipped things'],
            },
          ],
        },
        {
          key: 'skills',
          order: 2,
          visible: true,
          groups: [{ label: 'Languages', values: ['TypeScript'] }],
        },
        {
          key: 'languages',
          order: 3,
          visible: true,
          items: [{ language: 'English', level: 'C1' }],
        },
      ]);
      fixture.componentRef.setInput('themeId', 2); // Aurora - shows industry
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('gives the personal-details fullName and title leaves distinct field names', () => {
      const root = setupFullEntry();
      const fullName = root.querySelector('.page-card h2.cvpreview__name') as HTMLElement;
      const title = root.querySelector('.page-card p.cvpreview__title') as HTMLElement;
      expect(fullName.getAttribute('aria-label')).toBe('Personal Details - Full name');
      expect(title.getAttribute('aria-label')).toBe('Personal Details - Job title');
    });

    it('gives each experience-entry leaf (company/industry/location/role/bullet) its own field name - no longer all "Experience - Body text"', () => {
      const root = setupFullEntry();
      const company = root.querySelector('.page-card .cvpreview__entry-company') as HTMLElement;
      const industry = root.querySelector('.page-card .cvpreview__entry-industry') as HTMLElement;
      const location = root.querySelector('.page-card .cvpreview__entry-meta') as HTMLElement;
      const role = root.querySelector('.page-card .cvpreview__entry-role') as HTMLElement;
      const bullet = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      expect(company.getAttribute('aria-label')).toBe('Experience - Company');
      expect(industry.getAttribute('aria-label')).toBe('Experience - Industry');
      expect(location.getAttribute('aria-label')).toBe('Experience - Location');
      expect(role.getAttribute('aria-label')).toBe('Experience - Role');
      expect(bullet.getAttribute('aria-label')).toBe('Experience - Achievement / responsibility');
      // All five are genuinely distinct - the whole point of the fix.
      const labels = [company, industry, location, role, bullet].map((el) =>
        el.getAttribute('aria-label'),
      );
      expect(new Set(labels).size).toBe(labels.length);
      // The whole-entry wrapper (no elementPath) keeps the generic name -
      // there is no single leaf to disambiguate there.
      const entryWrapper = root.querySelector('.page-card .cvpreview__entry') as HTMLElement;
      expect(entryWrapper.getAttribute('aria-label')).toBe('Experience - Body text');
    });

    it('gives the skills label and values leaves distinct field names', () => {
      const root = setupFullEntry();
      const label = root.querySelector('.page-card .cvpreview__skill-label-view') as HTMLElement;
      const values = root.querySelector('.page-card .cvpreview__skill-values-view') as HTMLElement;
      expect(label.getAttribute('aria-label')).toBe('Skills - Label');
      expect(values.getAttribute('aria-label')).toBe('Skills - Values');
    });

    it('gives the language-value leaf its field name', () => {
      const root = setupFullEntry();
      const value = root.querySelector('.page-card .cvpreview__language-value') as HTMLElement;
      expect(value.getAttribute('aria-label')).toBe('Languages - Language');
    });
  });

  describe('click-empty-space deselect', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
    });

    it('clears the selection when the click is not on a selectable host or editor', () => {
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // A detached element's closest() returns null → treated as empty space.
      component.onBackgroundClick({ target: document.createElement('div') } as unknown as Event);
      expect(emitted).toEqual([null]);
    });

    it('keeps the selection when the click lands on the active editor', () => {
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const editor = document.createElement('textarea');
      editor.className = 'cvpreview__leaf-editor';
      component.onBackgroundClick({ target: editor } as unknown as Event);
      expect(emitted).toEqual([]);
    });

    it('is inert on a non-interactive render', () => {
      fixture.componentRef.setInput('interactive', false);
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      component.onBackgroundClick({ target: document.createElement('div') } as unknown as Event);
      expect(emitted).toEqual([]);
    });
  });
});
