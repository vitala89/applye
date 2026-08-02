import { ComponentFixture } from '@angular/core/testing';
import { CvPreviewComponent } from './cv-preview.component';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent inline editing', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createCvPreview());
  });

  describe('inline leaf editing - summary', () => {
    function setup(text = 'A **Key** point') {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      return { root, textarea };
    }

    it('mounts a native textarea only on the selected, interactive page render', () => {
      const { textarea } = setup();
      expect(textarea).toBeTruthy();
      // Measurement mirror never gets an editor, even though it's "selected".
      const measured = (fixture.nativeElement as HTMLElement).querySelector(
        '.paginated-sheet__measure textarea',
      );
      expect(measured).toBeNull();
    });

    it('exposes the raw ** markers while focused; resting render keeps <strong>', () => {
      const { textarea, root } = setup();
      expect(textarea.value).toBe('A **Key** point');
      // Not selected → resting <p> shows parsed <strong>, no raw markers.
      fixture.componentRef.setInput('selection', null);
      fixture.detectChanges();
      const strongs = root.querySelectorAll('.cvpreview__summary strong');
      expect(Array.from(strongs).some((s) => s.textContent?.trim() === 'Key')).toBe(true);
      expect(root.querySelector('.page-card p.cvpreview__summary')?.textContent).not.toContain(
        '**',
      );
    });

    it('drafting (typing) emits nothing', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.value = 'A **Key** point, edited';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(emitted).toEqual([]);
    });

    it('blur commits exactly one new immutable section', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0];
      textarea.value = 'Edited summary';
      textarea.dispatchEvent(new Event('input'));
      textarea.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(emitted).toEqual([
        { key: 'summary', order: 0, visible: true, text: 'Edited summary' },
      ]);
      // Immutability: the original section object passed in is untouched.
      expect(original.key === 'summary' && original.text).toBe('A **Key** point');
    });

    it('Escape restores resting text; a subsequent blur emits nothing', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.value = 'Something typed';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges(); // let Angular record the typed value as the last-bound value
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(textarea.value).toBe('A **Key** point');
      textarea.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(emitted).toEqual([]);
    });

    it('Cmd/Ctrl+B wraps the selection with ** via toggleBoldWrap, without committing', () => {
      const { textarea } = setup('Key point');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.setSelectionRange(0, 3); // "Key"
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
      fixture.detectChanges();
      expect(textarea.value).toBe('**Key** point');
      expect(emitted).toEqual([]);
    });

    it('applyBoldToActiveEditor (panel Bold) wraps the selection with ** via toggleBoldWrap, without committing', () => {
      const { textarea } = setup('Key point');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.setSelectionRange(0, 3); // "Key"
      component.applyBoldToActiveEditor();
      fixture.detectChanges();
      expect(textarea.value).toBe('**Key** point');
      expect(emitted).toEqual([]);
    });

    it('canBoldActiveEditor is true while editing the summary and false with nothing editing', () => {
      setup('Key point');
      expect(component.canBoldActiveEditor()).toBe(true);
      fixture.componentRef.setInput('selection', null);
      fixture.detectChanges();
      expect(component.canBoldActiveEditor()).toBe(false);
    });
  });

  describe('inline leaf editing - personal details', () => {
    function setup(elementPath = 'pd.fullName', section: Record<string, unknown> = {}) {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'personal_details',
        part: 'body',
        elementPath,
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'personal_details',
          order: 0,
          visible: true,
          fullName: 'Vitalii Kasap',
          title: 'Senior Engineer',
          address: 'Nuremberg',
          phone: '+49 171',
          email: 'v@icloud.com',
          ...section,
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('Edit text on the name mounts only the name editor - title stays resting text', () => {
      const card = setup('pd.fullName').querySelector('.page-card') as HTMLElement;
      expect((card.querySelector('input.cvpreview__name') as HTMLInputElement).value).toBe(
        'Vitalii Kasap',
      );
      // Only the selected leaf becomes an editor; siblings stay resting.
      expect(card.querySelector('input.cvpreview__title')).toBeNull();
      expect(card.querySelector('input.cvpreview__contact-input')).toBeNull();
      expect(card.querySelector('p.cvpreview__title')?.textContent).toContain('Senior Engineer');
    });

    it('Edit text on the title mounts only the title editor', () => {
      const card = setup('pd.title').querySelector('.page-card') as HTMLElement;
      expect((card.querySelector('input.cvpreview__title') as HTMLInputElement).value).toBe(
        'Senior Engineer',
      );
      expect(card.querySelector('input.cvpreview__name')).toBeNull();
    });

    it('localized fallback activates the underlying (empty) fullName field without persisting it', () => {
      const root = setup('pd.fullName', { fullName: '' });
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      expect(name.value).toBe(''); // real value, not the fallback label
      expect(name.placeholder.length).toBeGreaterThan(0); // localized fallback, shown only as a hint
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      name.dispatchEvent(new Event('blur')); // untouched → no commit
      expect(emitted).toEqual([]);
    });

    it('committing the name emits one new immutable section touching only that field', () => {
      const root = setup('pd.fullName');
      const emitted: Record<string, unknown>[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v as Record<string, unknown>));
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      name.value = 'Vitalii K.';
      name.dispatchEvent(new Event('input'));
      name.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      expect(emitted[0]).toMatchObject({ fullName: 'Vitalii K.', email: 'v@icloud.com' });
    });

    it('drafting the name emits nothing until blur', () => {
      const root = setup('pd.fullName');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      name.value = '+49 999';
      name.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders personal-details editors, even when selected', () => {
      const root = setup('pd.fullName');
      const measured = root.querySelectorAll('.paginated-sheet__measure input.cvpreview__name');
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing - experience', () => {
    function setup(elementPath = 'exp.0.company', themeId = 2) {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('themeId', themeId);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath,
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [
            {
              company: 'Acme',
              role: 'Engineer',
              startDate: '2020',
              endDate: '2022',
              location: 'Berlin',
              industry: 'SaaS',
              bullets: ['Shipped **X**', 'Led Y'],
            },
            {
              company: 'Globex',
              role: 'Lead',
              startDate: '2022',
              bullets: [],
            },
          ],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('Edit text on a company mounts only that leaf - role/location/dates and other entries stay resting', () => {
      const card = setup('exp.0.company', 2).querySelectorAll('.page-card')[0] as HTMLElement;
      expect((card.querySelector('input.cvpreview__entry-company') as HTMLInputElement).value).toBe(
        'Acme',
      );
      // Exactly one editor mounts - the selected leaf.
      expect(card.querySelectorAll('input.cvpreview__entry-company').length).toBe(1);
      expect(card.querySelector('input.cvpreview__entry-role')).toBeNull();
      expect(card.querySelector('input.cvpreview__entry-meta')).toBeNull();
      expect(card.querySelector('input.cvpreview__date-input')).toBeNull();
      expect(card.querySelectorAll('textarea.cvpreview__leaf-editor').length).toBe(0);
    });

    it('industry is not editable on a theme that does not render it (Classic)', () => {
      const card = setup('exp.0.industry', 1).querySelectorAll('.page-card')[0] as HTMLElement;
      expect(card.querySelector('input.cvpreview__entry-industry')).toBeNull();
    });

    it('dates are never editable inline - the resting date view still shows the Present placeholder', () => {
      const card = setup('exp.0.role', 2).querySelectorAll('.page-card')[0] as HTMLElement;
      // No date inputs even while another field on the entry is being edited.
      expect(card.querySelector('input.cvpreview__date-input')).toBeNull();
      // Entry 1 (Globex) has no endDate → its resting date view shows Present.
      const entryTwoDates = card
        .querySelectorAll('.cvpreview__entry')[1]
        ?.querySelector('.cvpreview__entry-dates');
      expect(entryTwoDates?.textContent).toContain(component['t']()('documents.cv_present'));
    });

    it('committing company emits one new immutable section touching only that entry/field', () => {
      const root = setup('exp.0.company', 2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as Record<string, unknown> & {
        entries: unknown[];
      };
      const originalEntries = original.entries;
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const company = card.querySelector('input.cvpreview__entry-company') as HTMLInputElement;
      company.value = 'Acme Corp';
      company.dispatchEvent(new Event('input'));
      company.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { company: string }[] };
      expect(updated.entries[0].company).toBe('Acme Corp');
      expect(updated.entries[1]).toBe(originalEntries[1]); // untouched entry same reference
      expect(originalEntries[0]).toMatchObject({ company: 'Acme' }); // original untouched
    });

    it('committing a bullet emits one new immutable section touching only that bullet', () => {
      const root = setup('exp.0.bullet.1', 2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { entries: { bullets: string[] }[] };
      const originalBullets = original.entries[0].bullets;
      const textarea = root.querySelector('textarea.cvpreview__leaf-editor') as HTMLTextAreaElement; // the only mounted editor: the selected bullet "Led Y"
      textarea.value = 'Led Y and Z';
      textarea.dispatchEvent(new Event('input'));
      textarea.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { bullets: string[] }[] };
      expect(updated.entries[0].bullets).toEqual(['Shipped **X**', 'Led Y and Z']);
      expect(originalBullets[1]).toBe('Led Y'); // original untouched
    });

    it('applyBoldToActiveEditor (panel Bold) wraps a bullet selection with ** via toggleBoldWrap, without committing', () => {
      const root = setup('exp.0.bullet.1', 2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const textarea = root.querySelector('textarea.cvpreview__leaf-editor') as HTMLTextAreaElement; // the only mounted editor: the selected bullet "Led Y"
      expect(component.canBoldActiveEditor()).toBe(true);
      textarea.setSelectionRange(0, 3); // "Led"
      component.applyBoldToActiveEditor();
      fixture.detectChanges();
      expect(textarea.value).toBe('**Led** Y');
      expect(emitted).toEqual([]);
    });

    it('drafting (typing) emits nothing', () => {
      const root = setup('exp.0.role', 2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const role = card.querySelector('input.cvpreview__entry-role') as HTMLInputElement;
      role.value = 'Staff Engineer';
      role.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders experience editors, even when selected', () => {
      const root = setup('exp.0.company', 2);
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__entry-company',
      );
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing - education', () => {
    function setup(elementPath = 'edu.0.degree') {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'education',
        part: 'body',
        elementPath,
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'education',
          order: 0,
          visible: true,
          entries: [
            { institution: 'MIT', degree: 'BSc', startDate: '2016', endDate: '2020' },
            { institution: 'Stanford', degree: 'MSc', startDate: '2020' },
          ],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('Edit text on a field mounts ONLY that field editor - siblings stay resting', () => {
      const card = setup('edu.0.degree').querySelector('.page-card') as HTMLElement;
      // Per-leaf editing (like experience): only the selected leaf becomes an
      // editor. The degree input shows; institution/dates stay resting text.
      const inputs = Array.from(
        card.querySelectorAll('input.cvpreview__leaf-editor'),
      ) as HTMLInputElement[];
      expect(inputs.map((i) => i.value)).toEqual(['BSc']);
      expect(card.textContent).toContain('MIT');
    });

    it('empty endDate shows the localized Present placeholder without persisting it', () => {
      const card = setup('edu.1.endDate').querySelector('.page-card') as HTMLElement;
      const stanfordEnd = card.querySelector('input.cvpreview__date-input') as HTMLInputElement;
      expect(stanfordEnd.value).toBe('');
      expect(stanfordEnd.placeholder.length).toBeGreaterThan(0);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      stanfordEnd.dispatchEvent(new Event('blur'));
      expect(emitted).toEqual([]);
    });

    it('the date leaf is independently selectable/editable (was previously unreachable)', () => {
      const card = setup('edu.0.startDate').querySelector('.page-card') as HTMLElement;
      const startInput = card.querySelector('input.cvpreview__date-input') as HTMLInputElement;
      expect(startInput.value).toBe('2016');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      startInput.value = '2015';
      startInput.dispatchEvent(new Event('input'));
      startInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      expect((emitted[0] as { entries: { startDate: string }[] }).entries[0].startDate).toBe(
        '2015',
      );
    });

    it('committing degree emits one new immutable section touching only that entry/field', () => {
      const card = setup('edu.0.degree').querySelector('.page-card') as HTMLElement;
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { entries: { degree: string }[] };
      const originalEntries = original.entries;
      const degreeInput = card.querySelector('input.cvpreview__leaf-editor') as HTMLInputElement;
      degreeInput.value = 'BA';
      degreeInput.dispatchEvent(new Event('input'));
      degreeInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { degree: string }[] };
      expect(updated.entries[0].degree).toBe('BA');
      expect(updated.entries[1]).toBe(originalEntries[1]); // untouched entry same reference
    });

    it('drafting emits nothing', () => {
      const card = setup('edu.0.degree').querySelector('.page-card') as HTMLElement;
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const degreeInput = card.querySelector('input.cvpreview__leaf-editor') as HTMLInputElement;
      degreeInput.value = 'BA';
      degreeInput.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders education editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__leaf-editor',
      );
      expect(measured.length).toBe(0);
    });

    it('the degree/institution comma and the en-dash date separator stay non-editable', () => {
      const root = setup();
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const roleSeps = card.querySelectorAll('.cvpreview__entry-role-sep');
      const dateSeps = card.querySelectorAll('.cvpreview__date-sep');
      expect(roleSeps.length).toBeGreaterThan(0);
      expect(dateSeps.length).toBeGreaterThan(0);
      roleSeps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
      dateSeps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });
  });

  describe('inline leaf editing - skills', () => {
    function setup(elementPath = 'skills.0.label') {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'skills',
        part: 'body',
        elementPath,
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [
            { label: 'Languages', values: ['TypeScript', 'Rust'] },
            { label: 'Empty', values: [] },
          ],
        },
      ]);
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('Edit text on the label mounts only the label editor; values stays resting', () => {
      const root = setup('skills.0.label');
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      expect(label.value).toBe('Languages');
      // Only the selected leaf edits; values stays resting view text.
      expect(root.querySelector('input.cvpreview__skill-values')).toBeNull();
      expect(root.querySelector('.cvpreview__skill-values-view')?.textContent).toContain(
        'TypeScript, Rust',
      );
      // Only one label input (empty group not rendered).
      expect(root.querySelectorAll('input.cvpreview__skill-label').length).toBe(1);
    });

    it('committing the label emits one new immutable section touching only that group', () => {
      const root = setup('skills.0.label');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { groups: { label: string }[] };
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      label.value = 'Tech';
      label.dispatchEvent(new Event('input'));
      label.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { groups: { label: string; values: string[] }[] };
      expect(updated.groups[0]).toMatchObject({ label: 'Tech', values: ['TypeScript', 'Rust'] });
      expect(original.groups[0].label).toBe('Languages'); // original untouched
    });

    it('committing values re-splits the comma-separated text into a fresh array', () => {
      const root = setup('skills.0.values');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const values = root.querySelector('input.cvpreview__skill-values') as HTMLInputElement;
      values.value = 'TypeScript, Angular, Go';
      values.dispatchEvent(new Event('input'));
      values.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { groups: { values: string[] }[] };
      expect(updated.groups[0].values).toEqual(['TypeScript', 'Angular', 'Go']);
    });

    it('drafting emits nothing', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      label.value = 'Tech';
      label.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders skills editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__skill-label',
      );
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing - languages', () => {
    function setup(elementPath = 'lang.0.language') {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'languages',
        part: 'body',
        elementPath,
      });
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
      component.startEditing();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('Edit text on a language mounts only that value editor; siblings stay resting, separated by non-editable separators', () => {
      const card = setup('lang.0.language').querySelector('.page-card') as HTMLElement;
      const inputs = Array.from(
        card.querySelectorAll('input.cvpreview__language-input'),
      ) as HTMLInputElement[];
      // Only the selected value edits; the other stays a resting view span.
      expect(inputs.map((i) => i.value)).toEqual(['English']);
      expect(card.querySelector('.cvpreview__language-value')?.textContent).toContain('German');
      const seps = card.querySelectorAll('.cvpreview__languages-sep');
      expect(seps.length).toBe(1);
      seps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });

    it('does not render a level editor (level stays Edit-only, not in the preview)', () => {
      const root = setup();
      expect(root.querySelector('[class*="level"]')).toBeNull();
    });

    it('committing one language value emits one new immutable section touching only that item', () => {
      const root = setup('lang.1.language'); // German
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { items: { language: string; level: string }[] };
      const germanInput = root.querySelector('input.cvpreview__language-input') as HTMLInputElement; // only the selected value edits
      germanInput.value = 'Deutsch';
      germanInput.dispatchEvent(new Event('input'));
      germanInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { items: { language: string; level: string }[] };
      expect(updated.items[1]).toEqual({ language: 'Deutsch', level: 'B1' }); // level untouched
      expect(updated.items[0]).toBe(original.items[0]); // untouched item same reference
      expect(original.items[1].language).toBe('German'); // original untouched
    });

    it('drafting emits nothing', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const inputs = Array.from(
        root.querySelectorAll('input.cvpreview__language-input'),
      ) as HTMLInputElement[];
      inputs[0].value = 'Anglais';
      inputs[0].dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders language editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__language-input',
      );
      expect(measured.length).toBe(0);
    });
  });
});
